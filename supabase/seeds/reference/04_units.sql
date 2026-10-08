-- ============================================================================
-- units — measurement units
--
-- Every product carries a unit. The defaults cover a piece, a pack, a box, a
-- kilogram and a litre, which is what a shop, a mill and a workshop need to
-- start. A business extends this freely.
--
-- AUTO-RUN on `supabase db reset`. Idempotent: ON CONFLICT on a real business
-- key, never on a random UUID. See supabase/MIGRATIONS_RULES.md.
-- ============================================================================

BEGIN;

INSERT INTO public.units (name, short_name, name_ar)
VALUES
  ('Bag 10kg', 'BAG-10', 'كيس 10 كجم'),
  ('Bag 25kg', 'BAG-25', 'كيس 25 كجم'),
  ('Bag 40kg', 'BAG-40', 'كيس 40 كجم'),
  ('Box', 'bx', 'علبة'),
  ('Kilogram', 'kg', 'كيلوجرام'),
  ('Litre', 'L', 'لتر'),
  ('Metre', 'm', 'متر'),
  ('Pack', 'pk', 'حزمة'),
  ('Piece', 'قطعة', 'قطعة'),
  ('Ream', 'rm', 'رزمة'),
  ('Sack 50 kg', 'ش', 'شوال 50 كجم'),
  ('Sack 50kg', 'BAG-50', 'شوال 50 كجم'),
  ('Set', 'st', 'طقم'),
  ('Ton', 't', 'طن متري')
ON CONFLICT (name) DO NOTHING;

COMMIT;
