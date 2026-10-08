-- ============================================================================
-- milling reference — packaging types and unit conversions
--
-- The milling module resolves these lookups by code. They describe what the
-- MODULE understands (a bag, a jute sack, a kilogram-per-bag factor), not what
-- a particular mill stocks. A mill edits the conversion factors for its own
-- equipment.
-- 
-- Grain grades are deliberately NOT here: they carry a product_id foreign key
-- to public.products, so they describe a real product a mill buys. They live
-- with the mill dataset in seeds/demo/mill-reference.sql.
--
-- AUTO-RUN on `supabase db reset`. Idempotent: ON CONFLICT on a real business
-- key, never on a random UUID. See supabase/MIGRATIONS_RULES.md.
-- ============================================================================

BEGIN;

INSERT INTO public.packaging_types (code, name_ar, name_en, is_active, sort_order)
VALUES
  ('SACK', 'شوال', 'Sack', true, '1'),
  ('BAG', 'كيس', 'Bag', true, '2')
ON CONFLICT DO NOTHING;


COMMIT;
