-- ============================================================================
-- 20261201000300_reject_side_less_lines_with_a_clear_message.sql
--
-- THE DEFECT
-- ----------
-- create_journal_entry filters its INSERT with
--
--     WHERE (ln->>'debit')::numeric IS DISTINCT FROM 0
--        OR (ln->>'credit')::numeric IS DISTINCT FROM 0
--
-- For a line that supplies NEITHER key, `(ln->>'debit')::numeric` is NULL,
-- and `NULL IS DISTINCT FROM 0` is TRUE - so the row is inserted with debit 0
-- and credit 0, and the table's own CHECK constraint rejects it:
--
--     new row violates check constraint "journal_lines_one_side"
--
-- The entry is refused, which is correct, but the operator is told about a
-- table constraint rather than about their entry. Every other failure in this
-- function explains itself; this one did not.
--
-- It is also reachable by accident: a caller building the JSON in code can
-- omit a key on a zero line without noticing.
--
-- THE FIX
-- -------
-- Lines are validated before anything is written, and the message names the
-- offending account code. The CHECK constraint stays as the last line of
-- defence - two independent guards for one rule is not redundancy in a
-- ledger, it is the norm.
--
-- NON-DESTRUCTIVE: one function body. No entry or line is touched.
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
  v_missing integer;
  v_blocked integer;
  v_sideless text;
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

  -- A line must carry exactly one side. Checked up front, before the entry
  -- header is written, so a rejected line never leaves a DRAFT entry behind
  -- in the table for someone to find later and wonder about.
  SELECT string_agg(coalesce(ln->>'account_code', '?'), '، ') INTO v_sideless
    FROM jsonb_array_elements(p_lines) AS ln
   WHERE coalesce((ln->>'debit')::numeric, 0) = 0
     AND coalesce((ln->>'credit')::numeric, 0) = 0;
  IF v_sideless IS NOT NULL THEN
    RAISE EXCEPTION
      'Line(s) % carry neither a debit nor a credit. Every line must have exactly one side.',
      v_sideless;
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

  IF v_d <> v_c THEN
    RAISE EXCEPTION
      'Entry does not balance: debits % vs credits % (difference %). An entry that cannot balance is not an entry.',
      round(v_d, 2)::text, round(v_c, 2)::text, round(v_d - v_c, 2)::text;
  END IF;
  IF v_d <= 0 THEN
    RAISE EXCEPTION 'Entry total must be greater than zero';
  END IF;

  -- The two failure modes are reported separately: "code does not exist" sends
  -- the operator hunting for a typo when the code was real and simply not
  -- postable, and that misdirection costs more than the extra check.
  SELECT count(*) FILTER (WHERE a.id IS NULL),
         count(*) FILTER (WHERE a.id IS NOT NULL AND NOT a.is_postable)
    INTO v_missing, v_blocked
    FROM jsonb_array_elements(p_lines) AS ln
    LEFT JOIN public.accounts a ON a.code = ln->>'account_code';

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'One or more account codes do not exist. Check the code before posting.';
  END IF;
  IF v_blocked > 0 THEN
    RAISE EXCEPTION
      'One or more accounts is not postable directly (a contra or clearing account). Post through the account that moves it.';
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

  IF (SELECT count(*) FROM public.journal_lines WHERE entry_id = v_id)
     <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'One or more lines could not be written';
  END IF;

  UPDATE public.journal_entries
     SET total_debit = v_d, total_credit = v_c, status = 'POSTED',
         posted_by = v_user, posted_at = now()
   WHERE id = v_id;

  RETURN v_id;
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.create_journal_entry(text, date, text, uuid, boolean, jsonb);