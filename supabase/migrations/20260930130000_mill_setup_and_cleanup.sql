-- ============================================================================
-- 20260930130000_mill_setup_and_cleanup.sql
-- تهيئة النظام للمطحنة: تنظيف بيانات قطع الغيار + إصلاح صلاحيات PostgREST
-- ============================================================================
--
-- 1. تحديث إعدادات المنشأة لتصبح مطحنة بدل محل قطع غيار
-- 2. حذف بيانات قطع الغيار القديمة (تصنيفات، ماركات، بلدان، طرازات)
-- 3. إصلاح مشكلة عدم ظهور جداول المطحنة في PostgREST
-- 4. إضافة وحدات القياس المفقودة
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. تحديث إعدادات المنشأة
-- ---------------------------------------------------------------------------
UPDATE public.company_settings
SET name = 'المطحنة',
    currency = 'SAR',
    currency_symbol = 'ر.س',
    catalog_modules = '{"profile": "mill", "enableUnits": true, "enableBrands": false, "enableOrigins": false, "enableQualityGrades": false, "enableMakesAndModels": false}'::jsonb,
    updated_at = now()
WHERE id = 1;

-- ---------------------------------------------------------------------------
-- 2. حذف بيانات قطع الغيار والدراجات القديمة
-- ---------------------------------------------------------------------------
-- حذف توافقات المنتجات مع الطرازات أولاً (مفتاح أجنبي)
DELETE FROM public.product_compatibilities;

-- حذف طرازات السيارات/الدراجات
DELETE FROM public.vehicle_models;

-- حذف الشركات المصنّعة
DELETE FROM public.vehicle_makes;

-- حذف درجات الجودة (خاصة بقطع الغيار)
DELETE FROM public.quality_grades;

-- حذف بلدان المنشأ (خاصة بقطع الغيار)
DELETE FROM public.countries_of_origin;

-- حذف الماركات القديمة (NGK, DID, IRC, Motul, Castrol, KMC, Koso, Osram)
DELETE FROM public.brands
WHERE name IN ('NGK', 'DID', 'IRC', 'Motul', 'Castrol', 'KMC', 'Koso', 'Osram');

-- حذف تصنيفات قطع الغيار والدراجات
DELETE FROM public.categories
WHERE name IN (
  'Meters', 'Meter spare parts', 'Electrical accessories',
  'Decoration and lighting', 'Cables and connectors',
  'Engine & transmission', 'Electrical & meters',
  'Wheels & tyres', 'Lubricants & fluids',
  'Body & accessories', 'Service'
);

-- حذف وحدات القياس القديمة الخاصة بقطع الغيار (إن لم تكن مستخدمة)
DELETE FROM public.units
WHERE name IN ('Meter', 'Roll', 'Set')
AND NOT EXISTS (
  SELECT 1 FROM public.products p WHERE p.unit_id = units.id
);

-- ---------------------------------------------------------------------------
-- 3. إصلاح مشكلة PostgREST — إعادة منح الصلاحيات
-- ---------------------------------------------------------------------------
-- PostgREST يتصل كـ authenticator ثم يتحول إلى anon أو authenticated.
-- الجداول تحتاج GRANT صريح + تلميح DDL ليلتقطها schema cache.

-- منح SELECT على جداول المطحنة
GRANT SELECT ON public.milling_intake_receipts TO anon, authenticated;
GRANT SELECT ON public.milling_jobs TO anon, authenticated;
GRANT SELECT ON public.milling_job_outputs TO anon, authenticated;
GRANT SELECT ON public.milling_delivery_notes TO anon, authenticated;
GRANT SELECT ON public.milling_delivery_items TO anon, authenticated;
GRANT SELECT ON public.milling_unit_conversions TO anon, authenticated;

-- منح SELECT على العروض (views)
GRANT SELECT ON public.milling_customer_custody TO anon, authenticated;
GRANT SELECT ON public.milling_output_balances TO anon, authenticated;
GRANT SELECT ON public.milling_service_money TO anon, authenticated;

-- منح EXECUTE على دوال المطحنة لـ authenticated
GRANT EXECUTE ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_milling_job(uuid, integer, numeric, numeric, numeric, numeric, uuid, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_milling_output(uuid, text, numeric, integer, numeric, text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_milling_job(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_milling_delivery(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_milling_service_invoice(uuid, text, numeric, numeric, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.milling_kg_per_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_milling() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_milling() TO authenticated;

-- التلميح الأهم: عمل ALTER TABLE تافهة لتشغيل pgrst_ddl_watch event trigger
-- حتى يعيد PostgREST تحميل schema cache
COMMENT ON TABLE public.milling_intake_receipts IS 'سندات استلام حبوب العملاء كأمانات — لا تدخل المخزون التجاري.';
COMMENT ON TABLE public.milling_jobs IS 'أوامر الطحن والتشغيل لحساب الغير.';
COMMENT ON TABLE public.milling_job_outputs IS 'مخرجات أمر الطحن: دقيق ونخالة وفاقد.';
COMMENT ON TABLE public.milling_delivery_notes IS 'سندات تسليم نواتج أمانات الطحن.';
COMMENT ON TABLE public.milling_delivery_items IS 'بنود سند تسليم النواتج.';

-- ---------------------------------------------------------------------------
-- 4. التأكد من تفعيل وحدة المطحنة في الاشتراك
-- ---------------------------------------------------------------------------
-- تحديث الاشتراك الحالي لضمان أن خطة enterprise تحتوي milling_operations
UPDATE public.platform_plans
SET modules = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM unnest(modules || ARRAY['milling_operations']) AS m
)
WHERE id = 'enterprise'
  AND NOT ('milling_operations' = ANY(modules));

-- ============================================================================
-- END
-- ============================================================================
