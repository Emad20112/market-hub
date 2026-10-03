-- ============================================================================
-- 20261201000200_enforce_postable_and_fix_trial_balance.sql
--
-- THREE DEFECTS FOUND BY THE ACCEPTANCE SUITE
-- ----------------------------------------------
--
-- (1) is_postable was never enforced.
--     The chart marks 1491 "مجمع إهلاك الأصول الثابتة" and 5911 as
--     non-postable - a contra and a clearing account that must only ever be
--     reached through depreciation and reallocation. create_journal_entry
--     joined on the account existing, and nothing checked the flag, so the
--     restriction I had written into the data was simply documentation.
--     Fixed by requiring is_postable in the lookup itself, so a non-postable
--     account is not found and the line-count guard reports it.
--
-- (2) The trial balance counted lines from entries that are not posted.
--     The view joined journal_lines directly and summed them, using the
--     entry's status only inside a CASE in the HAVING clause:
--
--       LEFT JOIN journal_lines jl ON jl.account_id = a.id
--       LEFT JOIN journal_entries je ON je.id = jl.entry_id AND je.status = 'POSTED'
--
--     The LEFT JOIN means jl.debit was summed for DRAFT and REVERSED entries
--     too - the je.status filter changed whether je was null, not whether jl
--     contributed. The acceptance run caught it immediately:
--
--       trial balance after reversing a 12,000 entry  ->  24,200
--
--     A trial balance that ignores whether an entry was posted is not a trial
--     balance. It now aggregates posted lines only, through a CTE, so the
--     filter is structural rather than a condition someone can forget.
--
-- (3) The line-count guard was correct but its message was misleading: a
--     non-postable account produced "account code does not exist", which sends
--     the operator hunting for a typo when the code was perfectly real.
--     The two cases are now reported separately.
--
-- NON-DESTRUCTIVE: one function body and one view. No entry, line or account
-- is created, altered or deleted.
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

  IF v_d <> v_c THEN
    RAISE EXCEPTION
      'Entry does not balance: debits % vs credits % (difference %). An entry that cannot balance is not an entry.',
      round(v_d, 2)::text, round(v_c, 2)::text, round(v_d - v_c, 2)::text;
  END IF;
  IF v_d <= 0 THEN
    RAISE EXCEPTION 'Entry total must be greater than zero';
  END IF;

  -- Report the two failure modes separately. "Account code does not exist"
  -- sends the operator hunting for a typo when the code was real and simply
  -- not postable, and that misdirection costs more than the extra check.
  SELECT count(*) FILTER (WHERE a.id IS NULL),
         count(*) FILTER (WHERE a.id IS NOT NULL AND NOT a.is_postable)
    INTO v_missing, v_blocked
    FROM jsonb_array_elements(p_lines) AS ln
    LEFT JOIN public.accounts a ON a.code = ln->>'account_code';

  IF v_missing > 0 THEN
    RAISE EXCEPTION
      'One or more account codes do not exist. Check the code before posting.';
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

  -- Belt and braces: a line that supplied neither a debit nor a credit would
  -- not match the WHERE above, so its absence here is a dropped line.
  IF (SELECT count(*) FROM public.journal_lines WHERE entry_id = v_id)
     <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'One or more lines carried neither a debit nor a credit';
  END IF;

  UPDATE public.journal_entries
     SET total_debit = v_d, total_credit = v_c, status = 'POSTED',
         posted_by = v_user, posted_at = now()
   WHERE id = v_id;

  RETURN v_id;
END $$;

-- ── the trial balance, rebuilt so posted-only is structural ─────────────────
DROP VIEW IF EXISTS public.trial_balance;
CREATE VIEW public.trial_balance
  WITH (security_invoker = true) AS
-- Only POSTED entries contribute. Filtering inside a CTE makes that structural:
-- there is no join shape in which a draft or reversed line can be summed by
-- accident, which is exactly how the previous version picked them up.
WITH posted AS (
  SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.entry_id
   WHERE je.status = 'POSTED'
)
SELECT a.code,
       a.name_ar,
       a.account_type,
       round(coalesce(sum(p.debit), 0), 2)  AS total_debit,
       round(coalesce(sum(p.credit), 0), 2) AS total_credit,
       round(coalesce(sum(p.debit - p.credit), 0), 2) AS balance,
       -- In the account's natural direction. A credit balance on an asset is
       -- an error, and presenting it as a positive number would hide it.
       round(coalesce(sum(p.debit - p.credit), 0) *
             CASE WHEN a.account_type IN ('ASSET','EXPENSE') THEN 1 ELSE -1 END, 2) AS natural_balance
  FROM public.accounts a
  LEFT JOIN posted p ON p.account_id = a.id
 WHERE a.is_active
 GROUP BY a.id, a.code, a.name_ar, a.account_type
HAVING coalesce(sum(p.debit), 0) > 0 OR coalesce(sum(p.credit), 0) > 0;

COMMENT ON VIEW public.trial_balance IS
  'ميزان المراجعة من القيود المرحَّلة فقط. القيود المسودة والمعكوسة مستثناة بنيوياً لا بشرط قد ينساه أحد.';

REVOKE ALL ON public.trial_balance FROM anon;
GRANT SELECT ON public.trial_balance TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.trial_balance;
-- DROP FUNCTION IF EXISTS public.create_journal_entry(text, date, text, uuid, boolean, jsonb);