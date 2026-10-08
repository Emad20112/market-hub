-- ============================================================================
-- Suppliers
--
-- Supplier records belong to one business and must never ship in the schema.
--
-- ⚠️  DEMO DATA — NEVER AUTO-RUN, NEVER RUN AGAINST A CUSTOMER DATABASE.
-- Run manually:  psql "$DATABASE_URL" -f <this file>
-- See supabase/seeds/README.md.
-- ============================================================================

BEGIN;

INSERT INTO public."suppliers" (name, phone, email, address, balance, is_active) VALUES
  ('موسى', NULL, NULL, NULL, '0.00', true)
ON CONFLICT DO NOTHING;

COMMIT;
