-- ============================================================================
-- Mill reference — grain grades
--
-- Each row names a product the mill actually buys (a wheat grade, a corn grade),
-- which is why the table carries a product_id foreign key. It therefore belongs
-- to the mill's own dataset, not to the reference data every customer receives.
--
-- ⚠️  DEMO DATA — NEVER AUTO-RUN, NEVER RUN AGAINST A CUSTOMER DATABASE.
-- Run manually:  psql "$DATABASE_URL" -f <this file>
-- See supabase/seeds/README.md.
-- ============================================================================

BEGIN;

INSERT INTO public."milling_grain_grades" (product_id, grade_code, grade_name_ar, origin, max_moisture, max_impurities, default_bag_size_kg, default_service_sku, is_active, default_bag_type) VALUES
  ('ee1f675f-9840-4d86-a751-3bff709caf1d', 'HARD_IMPORT', 'قمح صلب مستورد (درجة أولى)', 'IMPORTED', '14.00', '2.00', '50.00', 'SRV-MILL-BAG50', true, 'شوال خيش طبيعي 50 كجم'),
  ('7b253c8e-9073-4f2c-a61b-fff02fc95369', 'BARLEY', 'شعير حبوب خام', 'LOCAL', '14.00', '2.50', '50.00', 'SRV-MILL-BAG50', true, 'شوال خيش طبيعي 50 كجم'),
  ('5380b174-29ae-4a47-b27b-3ec885b81e53', 'SOFT', 'قمح طري (للمخبوزات)', 'IMPORTED', '14.00', '1.50', '50.00', 'SRV-MILL-BAG50', true, 'شوال خيش طبيعي 50 كجم'),
  ('aeb60af9-f41e-468a-add9-a7c3b8138aa7', 'LOCAL', 'قمح بلدي محلي', 'LOCAL', '14.00', '2.00', '50.00', 'SRV-MILL-BAG50', true, 'شوال خيش طبيعي 50 كجم'),
  ('73ee286b-9726-4b2f-ba36-459a440a344a', 'CORN', 'ذرة صفراء خام', 'IMPORTED', '15.00', '3.00', '50.00', 'SRV-MILL-BAG50', true, 'شوال خيش طبيعي 50 كجم')
ON CONFLICT DO NOTHING;

COMMIT;
