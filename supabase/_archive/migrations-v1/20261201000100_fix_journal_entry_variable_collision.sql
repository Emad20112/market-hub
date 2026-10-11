-- ============================================================================
-- 20261201000100_fix_journal_entry_variable_collision.sql
--
-- THE DEFECT
-- ----------
-- create_journal_entry declared a PL/pgSQL loop variable `l jsonb` and then
-- used the same letter as a FROM alias in the INSERT that follows:
--
--     FROM jsonb_array_elements(p_lines) l
--
-- PostgreSQL resolved `l` ambiguously and refused to run the statement:
--
--     error: column reference "l" is ambiguous
--
-- The migration applied cleanly - a function body is only parsed at creation,
-- and this statement is only compiled the first time it executes. So the table
-- exists, the chart is seeded, and the function was unusable until the first
-- call, which is exactly the case the acceptance suite exists to catch.
--
-- THE FIX
-- -------
-- The alias is renamed to `ln` and the loop variable to `src`. Both spellings
-- are distinct from every other identifier in the function, so nothing can
-- shadow anything else.
--
-- The validation that counts inserted lines against the supplied JSON is kept
-- as-is: it is what stops a mistyped account code from silently dropping one
-- side of an entry and leaving the books unbalanced without anyone noticing.
--
-- NON-DESTRUCTIVE: one function body. No entry, line or account is touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_memo         text,
  p_entry_date   date DEFAULT CURRENT_DATE,
  p_source_type  text DEFAULT NULL,
  p_source_id    uuid DEFAULT NULL,
  p_is_system    boolean DEFAULT false,
  p_lines        jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_num  text;
  v_d    numeric := 0;
  v_c    numeric := 0;
  src    jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_memo IS NULL OR btrim(p_memo) = '' THEN
    RAISE EXCEPTION 'A journal entry needs a description';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A journal entry needs at least two lines - one to debit and one to credit';
  END IF;

  v_num := public.next_journal_number(coalesce(p_entry_date, CURRENT_DATE));

  INSERT INTO public.journal_entries
    (entry_number, entry_date, memo, source_type, source_id, is_system, created_by)
  VALUES (v_num, coalesce(p_entry_date, CURRENT_DATE), btrim(p_memo),
          p_source_type, p_source_id, p_is_system, v_user)
  RETURNING id INTO v_id;

  FOR src IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_d := v_d + coalesce((src->>'debit')::numeric, 0);
    v_c := v_c + coalesce((src->>'credit')::numeric, 0);
  END LOOP;

  -- Refused HERE, at creation, rather than at posting. A draft entry that
  -- cannot balance is never worth having: it is either a mistake or an
  -- unfinished thought, and neither belongs in the books.
  IF v_d <> v_c THEN
    RAISE EXCEPTION
      'Entry does not balance: debits % vs credits % (difference %). An entry that cannot balance is not an entry.',
      round(v_d, 2)::text, round(v_c, 2)::text, round(v_d - v_c, 2)::text;
  END IF;
  IF v_d <= 0 THEN
    RAISE EXCEPTION 'Entry total must be greater than zero';
  END IF;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, memo, partner_type, partner_id)
  SELECT v_id, a.id,
         coalesce((ln->>'debit')::numeric, 0),
         coalesce((ln->>'credit')::numeric, 0),
         nullif(btrim(coalesce(ln->>'memo','')), ''),
         nullif(btrim(coalesce(ln->>'partner_type','')), ''),
         (ln->>'partner_id')::uuid
    FROM jsonb_array_elements(p_lines) AS ln
    JOIN public.accounts a ON a.code = ln->>'account_code'
   WHERE (ln->>'debit')::numeric IS DISTINCT FROM 0
      OR (ln->>'credit')::numeric IS DISTINCT FROM 0;

  -- Every line must have resolved to a real, postable account.
  IF (SELECT count(*) FROM public.journal_lines WHERE entry_id = v_id)
     <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'One or more account codes do not exist, or are not postable';
  END IF;

  UPDATE public.journal_entries
     SET total_debit = v_d, total_credit = v_c, status = 'POSTED',
         posted_by = v_user, posted_at = now()
   WHERE id = v_id;

  RETURN v_id;
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- (restore the previous body from 20261201000000)