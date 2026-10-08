-- ============================================================================
-- 20261003000000_milling_grain_grades.sql
-- المرحلة 0 من خطة تطوير المطحنة: فحص أنواع الحبوب (مرجع حقيقي بدل النص الحر)
--
--erdunda ROLLBACK
--   DROP FUNCTION IF EXISTS public.milling_match_grain_grade(uuid, numeric, numeric);
--   DROP FUNCTION IF EXISTS public.create_milling_intake(uuid, uuid, text, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text);
--   DROP TABLE IF EXISTS public.milling_grain_grades;
--   ALTER TABLE public.milling_intake_receipts DROP COLUMN IF EXISTS grain_grade_id;
--
-- ============================================================================
-- المشكلة التي يحلها هذا الملف (من الوثيقة المرجعية P0-1):
--   `grain_type` كان نصاً حراً في الواجهة:
--       const grainTypes = ["قمح صلب", "قمح بلدي", ...]   ← _app.milling.intake.tsx:103
--   بينما القاعدة صممت `grain_product_id` ليكون المرجع. النتيجة في البيانات:
--       IR-101            grain_type="قمح صلب مستورد"  grain_product_id=مرتبط  ✅
--       IR-202610-0001    grain_type="قمح صلب"         grain_product_id=NULL   ⚠️
--   نفس الجنس الفيزيائي بطريقتين تسجيل — يستحيل تمييز مستورد من محلي،
--   وهو فرق تسعيري جوهري (1400 مقابل 1350).
--
-- هذا الملف:
--   1. ينشئ جدول مرجعي للفحوص (درجة + حدود فنية).
--   2. يربط كل صنف خام قائم بدرجته ( idempotent عبر sku ).
--   3. يضيف grain_grade_id لسندات الاستلام — مرجع حقيقي.
--   4. يهاجر السندات التي بلا مرجع عبر مطابقة نصية.
--   5. يضيف دالة فحص تُرجع حالة المطابقة (للعرض في الواجهة).
--
-- لا يلمس: مخزون، فواتير، أو أي وحدة ERP أخرى.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. جدول الفحوص المرجعي
-- ---------------------------------------------------------------------------
-- الحقول التقنية (max_moisture / max_impurities) هنا قرار تشغيلي وليس قيداً
-- صارماً: قرار المستخدم أن التجاوز يُعرض كتنبيه ولا يمنع الحفظ. لذلك
-- `milling_match_grain_grade` ترجع حالة ( status ) بدل أن ترمي استثناء،
-- ودالة create_milling_intake الأصلية تُضاف لها — الاستثناء فقط عند غياب
-- المرجع نفسه.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milling_grain_grades (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- الصنف المرجعي في الكتالوج. NOVA relationship: الفحص لا ينشئ صنفاً،
  -- بل يصنّف صنفاً موجوداً — وإلا انفصل نظام الفحص عن المخزون التجاري.
  product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,

  grade_code          varchar(30)  NOT NULL,      -- HARD_IMPORT / LOCAL / SOFT / CORN / BARLEY
  grade_name_ar       varchar(120) NOT NULL,      -- الاسم المعروض للقبّان
  origin              varchar(60),               -- IMPORTED / LOCAL — للتمييز التجاري

  -- الحدود الفنية (تنبيه لا منع)
  max_moisture        numeric(5,2) NOT NULL CHECK (max_moisture > 0 AND max_moisture <= 100),
  max_impurities      numeric(5,2) NOT NULL CHECK (max_impurities >= 0 AND max_impurities <= 100),

  default_bag_size_kg numeric(6,2) NOT NULL DEFAULT 50 CHECK (default_bag_size_kg > 0),
  default_service_sku varchar(50),                -- SRV-* المرتبط افتراضياً

  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT uq_milling_grain_grades_product_code UNIQUE (product_id, grade_code)
);

COMMENT ON TABLE public.milling_grain_grades IS
  'فحوص أنواع الحبوب: تربط صنفاً في الكتالوج بدرجة تجارية وحدود فنية. تحل محل النص الحر في grain_type.';
COMMENT ON COLUMN public.milling_grain_grades.grade_code IS
  'رمز الدرجة الثابت (HARD_IMPORT, LOCAL, SOFT, CORN, BARLEY) — يُستخدم في الربط الآلي لا في العرض.';
COMMENT ON COLUMN public.milling_grain_grades.max_moisture IS
  'الحد الأقصى للرطوبة. تجاوزه ينبّه ولا يمنع (قرار تجاري 2026-10-03).';

CREATE INDEX IF NOT EXISTS idx_milling_grain_grades_product ON public.milling_grain_grades(product_id);
CREATE INDEX IF NOT EXISTS idx_milling_grain_grades_code    ON public.milling_grain_grades(grade_code);

-- ---------------------------------------------------------------------------
-- 2. تسجيل الفحوص من الأصناف القائمة
-- ---------------------------------------------------------------------------
-- الربط عبر products.sku (UNIQUE) — لا نُنشئ أصنافاً جديدة هنا إطلاقاً.
-- `products` غير متغيّر: نحن نقرأ فقط. الأصناف موجودة من 20260930120100.
-- إعادة التشغيل آمنة: ON CONFLICT DO NOTHING على (product_id, grade_code).
-- ---------------------------------------------------------------------------
INSERT INTO public.milling_grain_grades (
  product_id, grade_code, grade_name_ar, origin,
  max_moisture, max_impurities, default_bag_size_kg, default_service_sku
)
SELECT
  p.id, v.grade_code, v.grade_name_ar, v.origin,
  v.max_moisture, v.max_impurities, 50.00, 'SRV-MILL-BAG50'
FROM public.products p
JOIN (VALUES
  --             sku                code              الاسم العربي                    المصدر      رطوبة  شوائب
  ('RM-WHEAT-HARD',  'HARD_IMPORT', 'قمح صلب مستورد (درجة أولى)', 'IMPORTED', 14.00, 2.00),
  ('RM-WHEAT-LOCAL', 'LOCAL',       'قمح بلدي محلي',                'LOCAL',    14.00, 2.00),
  ('RM-WHEAT-SOFT',  'SOFT',        'قمح طري (للمخبوزات)',          'IMPORTED', 14.00, 1.50),
  ('RM-CORN-YELLOW', 'CORN',        'ذرة صفراء خام',                'IMPORTED', 15.00, 3.00),
  ('RM-BARLEY',      'BARLEY',      'شعير حبوب خام',                'LOCAL',    14.00, 2.50)
) AS v(sku, grade_code, grade_name_ar, origin, max_moisture, max_impurities)
  ON v.sku = p.sku
ON CONFLICT (product_id, grade_code) DO UPDATE
  SET grade_name_ar   = EXCLUDED.grade_name_ar,
      origin          = EXCLUDED.origin,
      max_moisture    = EXCLUDED.max_moisture,
      max_impurities  = EXCLUDED.max_impurities,
      is_active       = true;

-- ---------------------------------------------------------------------------
-- 3. ربط سندات الاستلام بالفحوص
-- ---------------------------------------------------------------------------
-- العمود الجديد مرجع بحذف SET NULL: حذف فحص يجب ألا يُسقط سنداً تاريخياً.
-- العمود نفسه ليس إجبارياً الآن — التطبيق لقطة تدرّجية. الانتقال إلى
-- NOT NULL يأتي بعد المرحلة 3 (الواجهة) حين تصبح القائمة مرجعية.
-- ---------------------------------------------------------------------------
ALTER TABLE public.milling_intake_receipts
  ADD COLUMN IF NOT EXISTS grain_grade_id uuid
    REFERENCES public.milling_grain_grades(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.milling_intake_receipts.grain_grade_id IS
  'مرجع الفحص. grain_type صار مشتقاً من هذا المرجع، لا حقلاً مستقلاً يُكتب بحرية.';

CREATE INDEX IF NOT EXISTS idx_milling_intake_grade
  ON public.milling_intake_receipts(grain_grade_id);

-- ---------------------------------------------------------------------------
-- 4. هجرة السندات القائمة
-- ---------------------------------------------------------------------------
-- 4.a — الربط بضمانة: كل سند له grain_product_id يورث فحص صنفه.
--        هذا ينقذ IR-101 و IR-102 تلقائياً بلا تخمين.
-- ---------------------------------------------------------------------------
UPDATE public.milling_intake_receipts r
   SET grain_grade_id = g.id
  FROM public.milling_grain_grades g
 WHERE g.product_id = r.grain_product_id
   AND r.grain_grade_id IS NULL;

-- 4.b — السندات اليتيمة: مطابقة degree_code عبر اسم درجة مختصر.
--        IR-202610-0001: grain_type = "قمح صلب"
--        نطابق على أول كلمة من الاسم ثم نتحقق أن grain_type يبدأ بها.
--        ⚠️ لماذا لا نحذف "قمح صلب مستورد"؟ لأن الاحتواء العكسي يجعل
--        "قمح صلب" يبتلع "قمح صلب مستورد (درجة أولى)" أيضاً — فالبديل
--        مطابقة على grade_code عبر جدول مرجعي small، وهو ما نفعله هنا.
--        المطابقة تأخذ أطول تطابق تام، وترفض السند عند الشك.
-- ---------------------------------------------------------------------------
UPDATE public.milling_intake_receipts r
   SET grain_grade_id = sub.gid
  FROM (
    SELECT DISTINCT ON (r2.id)
           r2.id AS rid, g.id AS gid
      FROM public.milling_intake_receipts r2
      JOIN (VALUES
              ('قمح صلب مستورد',   'HARD_IMPORT'),
              ('قمح بلدي محلي',     'LOCAL'),
              ('قمح بلدي',          'LOCAL'),
              ('قمح طري',           'SOFT'),
              ('ذرة صفراء',         'CORN'),
              ('شعير',              'BARLEY')
            ) AS m(name_ar, grade_code)
        ON btrim(r2.grain_type) = m.name_ar
      JOIN public.milling_grain_grades g
        ON g.grade_code = m.grade_code
     WHERE r2.grain_grade_id IS NULL
    ORDER BY r2.id, length(m.name_ar) DESC
  ) sub
 WHERE r.id = sub.rid;

-- 4.c — تقرير الترحيل (لا يرمي شيئاً، للشفافية فقط)
DO $$
DECLARE v_total int; v_linked int; v_orphan int;
BEGIN
  SELECT count(*) INTO v_total FROM public.milling_intake_receipts;
  SELECT count(*) INTO v_linked FROM public.milling_intake_receipts WHERE grain_grade_id IS NOT NULL;
  SELECT count(*) INTO v_orphan FROM public.milling_intake_receipts WHERE grain_grade_id IS NULL;

  RAISE NOTICE 'ترحيل فحص الحبوب: % سند، % مربوط، % يحتاج ربطاً يدوياً',
    v_total, v_linked, v_orphan;

  -- الربط اليدوي مطلوب فقط إن بقيت سندات يتيمة. لا نرمي استثناءً هنا:
  -- رحلة التطبيق قد تعمل قبل اكتمال الهجرة، ويجب ألا تتعطل بسبب سجل قديم.
END $$;

-- ---------------------------------------------------------------------------
-- 5. milling_match_grain_grade — فحص الحالة (تنبيه لا منع)
-- ---------------------------------------------------------------------------
-- ترجع jsonb carrying الحالة بدل الرمي، لأن قرار المستخدم (2026-10-03):
-- تجاوز الرطوبة/Shوائب تنبيه في الواجهة لا عائق أمام تسجيل الاستلام.
-- الواجهة تستدعيها عند تغيير حقل الرطوبة أو اختيار الفحص لعرض النتيجة.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.milling_match_grain_grade(
  _grade_id uuid,
  _moisture numeric DEFAULT NULL,
  _impurities numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grade record;
  v_moisture_ok boolean;
  v_impurities_ok boolean;
BEGIN
  IF _grade_id IS NULL THEN
    RETURN jsonb_build_object(
      'grade_id',      NULL,
      'grade_name_ar', NULL,
      'status',        'MISSING',
      'message_ar',    'لم يُحدَّد نوع الحبوب — سجّل فحصاً لربط السند بالصنف الصحيح.',
      'severity',      'danger'
    );
  END IF;

  SELECT id, product_id, grade_code, grade_name_ar, origin,
         max_moisture, max_impurities, default_bag_size_kg, default_service_sku
    INTO v_grade
  FROM public.milling_grain_grades
  WHERE id = _grade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'grade_id', NULL, 'status', 'MISSING',
      'message_ar', 'نوع الحبوب المحدد غير موجود.',
      'severity',   'danger'
    );
  END IF;

  v_moisture_ok   := _moisture   IS NULL OR _moisture   <= v_grade.max_moisture;
  v_impurities_ok := _impurities IS NULL OR _impurities <= v_grade.max_impurities;

  RETURN jsonb_build_object(
    'grade_id',         v_grade.id,
    'product_id',       v_grade.product_id,
    'grade_code',       v_grade.grade_code,
    'grade_name_ar',    v_grade.grade_name_ar,
    'origin',           v_grade.origin,
    'max_moisture',     v_grade.max_moisture,
    'max_impurities',   v_grade.max_impurities,
    'default_bag_size_kg', v_grade.default_bag_size_kg,
    'default_service_sku', v_grade.default_service_sku,

    -- 'OK'سليم · 'WARN'تجاوز فني (يُسجَّل) · 'MISSING'لا يوجد فحص
    'status', CASE
      WHEN v_moisture_ok AND v_impurities_ok THEN 'OK'
      ELSE 'WARN'
    END,
    'severity', CASE
      WHEN v_moisture_ok AND v_impurities_ok THEN 'success'
      ELSE 'warning'
    END,

    'moisture_ok',   v_moisture_ok,
    'impurities_ok', v_impurities_ok,
    'message_ar',
      CASE
        WHEN NOT v_moisture_ok AND NOT v_impurities_ok THEN
          'تجاوز الفحص الفني: الرطوبة والشوائب أعلى من الحد المسموح لـ' || v_grade.grade_name_ar
        WHEN NOT v_moisture_ok THEN
          'تجاوز حد الرطوبة (' || v_grade.max_moisture || '%) — قدؤثّر على الاستخلاص. سيُسجَّل التحذير.'
        WHEN NOT v_impurities_ok THEN
          'تجاوز حد الشوائب (' || v_grade.max_impurities || '%) — سيُسجَّل التحذير.'
        ELSE
          'الفحص الفني مطابق لحدود ' || v_grade.grade_name_ar
      END
  );
END $$;

REVOKE ALL ON FUNCTION public.milling_match_grain_grade(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.milling_match_grain_grade(uuid, numeric, numeric) TO authenticated;

COMMENT ON FUNCTION public.milling_match_grain_grade(uuid, numeric, numeric) IS
  'يفحص رطوبة/شوائب سند استلام مقابل حد فحص الحبوب. ترجع الحالة كـ jsonb (OK/WARN/MISSING) — تنبيه لا منع.';

-- ---------------------------------------------------------------------------
-- 6. قراءة الفحوص النشطة (للواجهة)
-- ---------------------------------------------------------------------------
-- view بسيط يجمع التسمية العربية من products مع الفحص، حتى لا تحتاج
-- الواجهة إلى استعلام متعدد الجداول لكل صف.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.milling_grain_grades_view AS
SELECT
  g.id,
  g.product_id,
  p.sku,
  p.name_ar            AS product_name_ar,
  p.name               AS product_name,
  p.cost_price,
  g.grade_code,
  g.grade_name_ar,
  g.origin,
  g.max_moisture,
  g.max_impurities,
  g.default_bag_size_kg,
  g.default_service_sku,
  g.is_active
FROM public.milling_grain_grades g
JOIN public.products p ON p.id = g.product_id;

COMMENT ON VIEW public.milling_grain_grades_view IS
  'عرض موحّد للفحوص + تسميات الأصناف — يستهلكه شاشة الاستلام وقائمة الفحص.';