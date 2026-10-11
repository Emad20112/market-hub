-- ============================================================================
-- 20261201000400_reversed_entries_remain_in_the_ledger.sql
--
-- THE DEFECT
-- ----------
-- The trial balance counted entries with status = 'POSTED' only, so a
-- REVERSED entry dropped out of the ledger entirely while its reversal entry
-- stayed in. The acceptance run caught it:
--
--   post  Dr 12000 Inventory / Cr 12000 Payable
--   reverse it
--   trial balance  ->  12,000      (expected 0)
--
-- The reversal is Dr 12000 Payable / Cr 12000 Inventory, so excluding the
-- original leaves a credit balance on Payable for a liability that was never
-- incurred. Every account nets to zero only if BOTH sides are present.
--
-- ACCOUNTING, NOT A CODING PREFERENCE
-- -----------------------------------
-- A reversed entry is not deleted; it is countered. Both documents stay in the
-- books, which is what makes the audit trail worth having - you can see what
-- was posted, see what undid it, and see why. Dropping the original would
-- erase the mistake along with its correction and leave the reversal looking
-- like an unexplained payment.
--
-- DRAFT entries are the ones that were never in the books, and those are
-- correctly excluded.
--
-- The fix is to filter on "was posted" rather than "is currently posted".
--
-- NON-DESTRUCTIVE: one view. No entry or line is touched.
-- ============================================================================

DROP VIEW IF EXISTS public.trial_balance;
CREATE VIEW public.trial_balance
  WITH (security_invoker = true) AS
-- DRAFT is the only status that was never in the books.
--
-- REVERSED entries ARE included, deliberately: a reversal is a second entry
-- that offsets the first, so excluding the first while keeping the second
-- leaves the second looking like a transaction that happened on its own.
-- Both documents together net to zero, and both remain visible to an auditor.
WITH posted AS (
  SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.entry_id
   WHERE je.status IN ('POSTED','REVERSED')
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
  'ميزان المراجعة من القيود المرحَّلة. القيود المسودة مستثناة، أما المعكوسة فتبقى لأنها '
  'يُقابلها قيد عكسي يُصفّرها معاً — استبعاد الأصل يجعل القيد العكسي يبدو دفعة مستقلة.';

REVOKE ALL ON public.trial_balance FROM anon;
GRANT SELECT ON public.trial_balance TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.trial_balance;