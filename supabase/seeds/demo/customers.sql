-- ============================================================================
-- Customers
--
-- Customer records carry a real business's counterparties and their balances.
--
-- ⚠️  DEMO DATA — NEVER AUTO-RUN, NEVER RUN AGAINST A CUSTOMER DATABASE.
-- Run manually:  psql "$DATABASE_URL" -f <this file>
-- See supabase/seeds/README.md.
-- ============================================================================

BEGIN;

INSERT INTO public."customers" (name, phone, email, address, credit_limit, balance, is_active, loyalty_points) VALUES
  ('يونس', '772317950', NULL, NULL, '20000.00', '14500.00', true, '0'),
  ('ghfgdfsd', NULL, NULL, NULL, '0.00', '0.00', true, '0')
ON CONFLICT DO NOTHING;

COMMIT;
