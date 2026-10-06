-- ============================================================================
-- 20261006000050_item_master_data.sql
-- فصل البيانات الأساسية: أنواع التعبئة، وفكّ قاموس الحبوب عن الأصناف
-- ============================================================================
-- المرجع: مواصفات الإصلاح — الأقسام 7، 13، 25، 31.
--
-- WHY
-- ---
-- (١) «شوال» و«كيس» لم يكن لهما وجود مستقل: كل توليفة نوع+وزن صُنعت وحدة قياس
--     جديدة («شوال 50 كجم»). فيستحيل جمع رصيد الشوال مع الكيس، ويستحيل أي
--     تحويل وزني. الحل: packaging_types مستقلة، والوحدة تبقى كجم.
--
-- (٢) قاموس الحبوب **موجود أصلاً** باسم milling_grain_grades، ويحمل البيانات
--     الصحيحة (قمح بلدي، قمح مستورد، ذرة بيضاء، شعير…). لكنه مربوط بـ
--     product_id NOT NULL، أي «لا نوع حبوب إلا إذا كان صنفاً في الكتالوج».
--     وهذا هو الخلط نفسه الذي نُصلحه: العميل قد يسلّم نوعاً لا تملكه المطحنة
--     ولا تشتريه، فيجب ألا يُشترط وجود صنف له.
--
--     فلم نُنشئ قاموساً منافساً؛ فكَكنا الربط القائم بدل استبداله:
--       product_id  ->  يقبل NULL (مرجع الصنف يصبح اختيارياً للمطابقة المخزنية)
--     وأُضيف hujrah حرة نصّية: milling_jobs.grain_type_free.
--
-- NON-DESTRUCTIVE
-- ---------------
--  * لا يُحذف صف واحد من milling_grain_grades؛ فقط يُرخّى قيد NOT NULL.
--  * كل الأصناف المرجعية الحالية تبقى مربوطة كما هي.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. أنواع التعبئة — Master Data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packaging_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        varchar(20) NOT NULL UNIQUE,
  name_ar     varchar(60) NOT NULL,
  name_en     varchar(60),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.packaging_types IS
  'أنواع التعبئة (شوال، كيس…). بيانات أساسية مستقلة عن الوحدات: الوحدة كجم، والنوع يصف الوعاء.';
COMMENT ON COLUMN public.packaging_types.code IS
  'مفتاح ثابت يستخدمه الكود (SACK, BAG). لا يُترجم ولا يتغير مع اللغة.';

INSERT INTO public.packaging_types (code, name_ar, name_en, sort_order) VALUES
  ('SACK', 'شوال', 'Sack', 1),
  ('BAG',  'كيس',  'Bag',  2)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS packaging_types_read ON public.packaging_types;
CREATE POLICY packaging_types_read ON public.packaging_types
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS packaging_types_write ON public.packaging_types;
CREATE POLICY packaging_types_write ON public.packaging_types
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

-- ---------------------------------------------------------------------------
-- 2. فكّ قاموس الحبوب عن الكتالوج
-- ---------------------------------------------------------------------------
-- الربط يصبح اختيارياً: النوع موجود بذاته، وصنف الكتالوج (إن وُجد) يُستخدم
-- للمطابقة مع مخزون المطحنة عند طحن خامٍ تملكه، لا كشرط لوجود النوع.
ALTER TABLE public.milling_grain_grades
  ALTER COLUMN product_id DROP NOT NULL;

COMMENT ON COLUMN public.milling_grain_grades.product_id IS
  'صنف الكتالوج المقابل، اختياري. غيابه يعني نوعاً لا تملكه المطحنة (حبوب العميل) — وهذا صالح تماماً. التوصيف الكامل للحبوب بذاته.';
COMMENT ON TABLE public.milling_grain_grades IS
  'قاموس + فحوص أنواع الحبوب: تعريف النوع وحدوده الفنية. مستقل عن مخزون المطحنة، ويقبل نوعاً حُرّاً غير مُعرَّف.';

-- قيد التفرد القديم (product_id, grade_code) لم يعد كافياً حين يكون product_id
-- فارغاً: صفّان بنوعين حرّين مختلفين وبلا صنف كانا يتصادمان على NULL، لأن
-- NULL لا يساوي NULL في قيد UNIQUE العادي. البديل فهرسان جزئيان.
--
-- ترتيب الحذف مهم: القيد يملك الفهرس تلقائياً، فإسقاط الفهرس أولاً يفشل بـ
-- «cannot drop index because constraint requires it». إسقاط القيد وحده يكفي
-- ويسقط الفهرس التابع معه.
ALTER TABLE public.milling_grain_grades
  DROP CONSTRAINT IF EXISTS uq_milling_grain_grades_product_code;

CREATE UNIQUE INDEX IF NOT EXISTS uq_milling_grain_grades_product_code
  ON public.milling_grain_grades (product_id, grade_code)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_milling_grain_grades_free_code
  ON public.milling_grain_grades (grade_code)
  WHERE product_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_milling_grain_grades_name
  ON public.milling_grain_grades (grade_name_ar);

-- ---------------------------------------------------------------------------
-- 3. النوع الحر في أمر الطحن
-- ---------------------------------------------------------------------------
-- المواصفة (القسم 13): «لا تمنع عملية الطحن لأن النوع غير موجود في Master Data».
-- فالحقل النصي يبقى موجوداً ومستقلاً عن أي قاموس.
-- ملاحظة: عمود grain_type موجود على سند الاستلام، ودرجة الحبوب على أمر الطحن
-- (عبر الاتفاقية) — لذا لا نُنشئ عموداً ثالثاً، بل نوثّق القاعدة.
COMMENT ON COLUMN public.milling_intake_receipts.grain_type IS
  'نوع الحبوب كما وصفه المستلم — نصّ حر مقصود. لا يُشترط وجوده في القاموس، ولا يُنشئ صنفاً.';

-- ---------------------------------------------------------------------------
-- 4. ربط سندات الاستلام القائمة بالقاموس حيث تتطابق التسمية
-- ---------------------------------------------------------------------------
-- اختياري بحت: لا يُنشئ أنواعاً، ولا يعدّل نصّاً.
ALTER TABLE public.milling_intake_receipts
  ADD COLUMN IF NOT EXISTS grain_grade_ref uuid
    REFERENCES public.milling_grain_grades(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.milling_intake_receipts.grain_grade_ref IS
  'مرجع اختياري لنوع الحبوب في القاموس. غيابه = نوع حر كتبه المستخدم، والنص في grain_type يظل المرجع المعروض.';

UPDATE public.milling_intake_receipts r
   SET grain_grade_ref = g.id
  FROM public.milling_grain_grades g
 WHERE r.grain_grade_ref IS NULL
   AND g.product_id IS NULL
   AND btrim(r.grain_type) = btrim(g.grade_name_ar);

COMMIT;
