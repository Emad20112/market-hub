-- ============================================================================
-- Warehouses
--
-- A warehouse is a physical location belonging to one business. 'Main Store' is
-- a placeholder that must be created per customer, not shipped in the schema.
--
-- ⚠️  DEMO DATA — NEVER AUTO-RUN, NEVER RUN AGAINST A CUSTOMER DATABASE.
-- Run manually:  psql "$DATABASE_URL" -f <this file>
-- See supabase/seeds/README.md.
-- ============================================================================

BEGIN;

INSERT INTO public."warehouses" (name, code, address, is_default, is_active, name_ar) VALUES
  ('Main Store', 'MAIN', NULL, true, true, 'المحل الرئيسي')
ON CONFLICT DO NOTHING;

COMMIT;
