-- ============================================================================
-- 20261203000100_make_other_expenses_postable.sql
--
-- MY OWN GUARD CAUGHT MY OWN CHART
-- ----------------------------------
-- 20261201000000 seeded the chart and then ran:
--
--     UPDATE accounts SET is_postable = false WHERE code IN ('1491','5911');
--
-- 1491 is مجمع إهلاك الأصول الثابتة - accumulated depreciation, a contra
-- account that should only ever be reached through depreciation. Marking it
-- not-postable is right.
--
-- 5911 is مصروفات أخرى - other expenses. It is an ordinary expense account
-- that people post to by hand every day. Marking it not-postable was simply
-- a mistake, and the GL wiring surfaced it at once: posting a non-stock
-- purchase (a delivery charge, a maintenance service) routes to 5911, and
-- create_journal_entry refused with:
--
--     One or more accounts is not postable directly
--
-- The guard did exactly what it was built for. Had the is_postable check not
-- been enforced - which it also was not, at first - this would have shipped as
-- a chart that silently refused a routine expense.
--
-- A chart entry with is_postable = false and no way to say WHY it is false is
-- the kind of thing that gets "fixed" by deleting the guard next time.
--
-- NON-DESTRUCTIVE: two boolean columns on two account rows.
-- ============================================================================

UPDATE public.accounts
   SET is_postable = true,
       notes = 'مصروفات متنوعة تُرحَّل مباشرة'
 WHERE code = '5911';

-- Guard the rule the other account was meant to follow, so the next chart
-- seed does not repeat the mistake by lumping a contra account in with a
-- real one.
COMMENT ON COLUMN public.accounts.is_postable IS
  'الحسابات غير القابلة للترحيل المباشر هي الحسابات المقابل (contra) والحسابات التحقيرية فقط — '
  'مثل 1491 مجمع الإهلاك. حساب مصروف عادي مثل 5911 قابل للترحيل مباشرة.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- UPDATE public.accounts SET is_postable = false WHERE code = '5911';