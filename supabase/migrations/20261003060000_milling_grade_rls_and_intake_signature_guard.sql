-- ============================================================================
-- 20261003060000_milling_grade_rls_and_intake_signature_guard.sql
--
-- WHAT THIS FIXES (verified against the live database, not inferred)
-- ----------------------------------------------------------------------
-- 1) `milling_grain_grades` shipped with RLS DISABLED and with the Supabase
--    default grants still in place, so the `anon` role could read it and, worse,
--    UPDATE every row. Probe result before this migration:
--       set local role anon;
--       update milling_grain_grades set max_moisture = 1 where id = (...);
--       => ALLOWED (1 row)
--    Anonymous callers could therefore rewrite the technical moisture and
--    impurity ceilings that `create_milling_intake` validates against, i.e.
--    weaken the acceptance rules of the mill from outside the application.
--    This table is reference/master data: read by mill staff, written only by
--    migrations or an explicit owner action.
--
-- 2) Two overloads of `create_milling_intake` were alive at the same time:
--       create_milling_intake(...,_grain_product_id uuid,      _bag_size_kg …)  -- 14 args, no grade
--       create_milling_intake(...,_grain_product_id uuid,_grain_grade_id uuid,_bag_size_kg …) -- 15 args
--    `CREATE OR REPLACE` cannot change a signature, so migration
--    20261003040000 created the graded version alongside the old one instead of
--    replacing it. The 14-argument overload has no grain-grade check at all, so
--    any caller that omits `_grain_grade_id` still receives a receipt with a
--    free-text `grain_type` and no technical inspection — exactly the defect
--    G1/Q4 of MILLING_SYSTEM_IMPROVEMENT_PLAN.md. The application always sends
--    the grade (src/lib/milling/index.ts:261), so the stale overload has no
--    legitimate caller and is dropped here.
--
-- NON-DESTRUCTIVE: privilege metadata and one unused function signature.
-- No receipt, job, invoice, movement or balance is read, written or deleted.
-- ============================================================================

-- ── 1. grain grades: enable RLS and stop anonymous writes ────────────────────

REVOKE INSERT, UPDATE, DELETE ON TABLE public.milling_grain_grades FROM anon;
GRANT  SELECT ON TABLE public.milling_grain_grades TO authenticated, service_role;

ALTER TABLE public.milling_grain_grades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS milling_grain_grades_read ON public.milling_grain_grades;
CREATE POLICY milling_grain_grades_read
  ON public.milling_grain_grades
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- No INSERT/UPDATE/DELETE policy is created on purpose: with RLS enabled and no
-- policy for those commands, every write from anon/authenticated is rejected.
-- Management data stays a deliberate, migration-or-owner-only action.

-- ── 2. drop the ungraded intake overload ────────────────────────────────────
-- Exact argument types are spelled out because DROP FUNCTION resolves by
-- identity, not by name.

DROP FUNCTION IF EXISTS public.create_milling_intake(
  uuid,          -- _store_id
  uuid,          -- _customer_id
  text,          -- _grain_type
  uuid,          -- _grain_product_id
  numeric,       -- _bag_size_kg
  integer,       -- _bag_count
  numeric,       -- _gross_weight_kg
  numeric,       -- _tare_weight_kg
  numeric,       -- _moisture
  numeric,       -- _impurities
  text,          -- _truck_plate
  text,          -- _driver_name
  text,          -- _silo
  text           -- _notes
);

-- Belt and braces: the surviving graded overload keeps its SECURITY DEFINER
-- body but must never be reachable before sign-in.
-- 15 arguments: the five leading identity/text fields, the grade id, then
-- bag size, bag count, gross, tare, moisture, impurities, and the four texts.
REVOKE ALL ON FUNCTION public.create_milling_intake(
  uuid, uuid, text, uuid, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text
) FROM anon;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS milling_grain_grades_read ON public.milling_grain_grades;
-- ALTER TABLE public.milling_grain_grades DISABLE ROW LEVEL SECURITY;
-- GRANT INSERT, UPDATE, DELETE ON TABLE public.milling_grain_grades TO anon;
-- (the 14-argument overload is intentionally NOT restored: recreating it would
--  reopen the unchecked-intake path this migration closes.)