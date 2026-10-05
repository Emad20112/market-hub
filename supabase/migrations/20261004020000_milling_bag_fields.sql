-- ============================================================================
-- 20261004020000_milling_bag_fields.sql
-- إضافة حقول تفصيلية لنظام الأكياس في سندات الاستلام وفهرس درجات الحبوب
-- ============================================================================

ALTER TABLE public.milling_intake_receipts
  ADD COLUMN IF NOT EXISTS bag_type text DEFAULT 'شوال خيش طبيعي 50 كجم',
  ADD COLUMN IF NOT EXISTS bag_source text DEFAULT 'CUSTOMER',
  ADD COLUMN IF NOT EXISTS bag_condition text DEFAULT 'سليم ومحكم';

ALTER TABLE public.milling_grain_grades
  ADD COLUMN IF NOT EXISTS default_bag_type text DEFAULT 'شوال خيش طبيعي 50 كجم';

-- تحديث الـ View لإظهار الحقل الجديد في النهاية
CREATE OR REPLACE VIEW public.milling_grain_grades_view AS
SELECT
  g.id,
  g.product_id,
  p.sku,
  p.name_ar AS product_name_ar,
  p.name AS product_name,
  p.cost_price,
  g.grade_code,
  g.grade_name_ar,
  g.origin,
  g.max_moisture,
  g.max_impurities,
  g.default_bag_size_kg,
  g.default_service_sku,
  g.is_active,
  g.default_bag_type
FROM public.milling_grain_grades g
JOIN public.products p ON p.id = g.product_id;
