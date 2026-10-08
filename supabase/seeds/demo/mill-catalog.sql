-- ============================================================================
-- Mill catalogue — categories and packaging
--
-- The product families a flour mill works with: wheat, corn, barley, packaging
-- supplies, and the milled outputs (flour, bran). This is ONE business's
-- catalogue. A stationery shop or a spare-parts dealer must not receive it.
--
-- ⚠️  DEMO DATA — NEVER AUTO-RUN, NEVER RUN AGAINST A CUSTOMER DATABASE.
-- Run manually:  psql "$DATABASE_URL" -f <this file>
-- See supabase/seeds/README.md.
-- ============================================================================

BEGIN;

INSERT INTO public."categories" (name, name_ar, parent_id) VALUES
  ('Brown Flour', 'دقيق البر', NULL),
  ('Barley', 'الشعير', NULL),
  ('Corn', 'الذرة', NULL),
  ('Wheat', 'القمح', NULL),
  ('Packaging Supplies', 'مستلزمات تعبئة', NULL),
  ('Ground Wheat', 'القمح المطحون', NULL),
  ('Semolina', 'السميد', NULL),
  ('Bran', 'النخالة', NULL),
  ('White Flour', 'الدقيق الأبيض', NULL),
  ('Mixed Flour', 'الدقيق المخلوط', NULL),
  ('Corn Flour', 'دقيق الذرة', NULL),
  ('Barley Flour', 'دقيق الشعير', NULL)
ON CONFLICT DO NOTHING;

COMMIT;
