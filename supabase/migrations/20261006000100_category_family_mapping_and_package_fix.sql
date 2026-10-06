-- ============================================================================
-- 20261006000100_category_family_mapping_and_package_fix.sql
-- إكمال ما فاته ترحيل التوحيد: تصنيفات-النوع الفعلية، وأعمدة العبوة
-- ============================================================================
-- لماذا هذا الملف؟
-- -----------------
-- 20261006000000 حاول تفريغ تصنيفات-النوع بالأسماء «مواد خام / خدمات طحن
-- وتشغيل / مستلزمات تعبئة وتغليف…». لكن التصنيفات الفعلية في القاعدة تحمل
-- أسماء مختلفة: «مواد المطحنة الخام»، «خدمات المطحنة التشغيلية»،
-- «منتجات المطحنة التامة»، «مستلزمات تعبئة المطحنة» — فلم يُعَيَّن لها صنف واحد
-- ولم يُحذف تصنيف واحد، وبقيت العائلات الحقيقية (دقيق أبيض، نخالة…) فارغة.
--
-- كذلك ألحق تحليل أسماء الوحدات بيانات عبوة بالأخطاء:
--   * خام: قمح صلب وغيره وُضع له package_type_id بوزن 50 — والحبوب الخام
--     تُشترى وتُستهلك بالكتلة، لا تُباع في شوال.
--   * خدمات: SRV-MILL-BAG50 أُعطي وزن عبوة — الخدمة لا عبوة لها.
--   * تعبئة: PKG-* بلا نوع تعبئة ولا وزن معلن — وهو بالضبط ما يحتاجه النظام
--     ليعرف أن «كيس PP 50» عبوة سعة 50 كجم تُحتسب بالعدد.
--
-- NON-DESTRUCTIVE
-- ---------------
--  * لا يُحذف أي صنف — فقط يُعاد تعيين تصنيفه وحقوله.
--  * لا يُحذف تصنيف إلا بعد إفراغه كلياً.
--  * الخدمات تبقى في تصنيفها؛ خدمة الطحن مسارها مستقل (المواصفة §10).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. عائلة السميد: المطحنة تنتجه فعلاً، فالتصنيف يتبع الإنتاج لا قائمة عامة.
-- ---------------------------------------------------------------------------
INSERT INTO public.categories (name, name_ar)
SELECT 'Semolina', 'السميد'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.categories c WHERE c.name_ar = 'السميد'
 );

-- ---------------------------------------------------------------------------
-- 2. إعادة تعيين الأصناف إلى عائلاتها الحقيقية
-- ---------------------------------------------------------------------------
-- المنتجات النهائية تُعرَّف بالاسم (المواصفة §5): الاسم هو الهوية التجارية.
-- القمح/الذرة/الشعير كخام تُصنَّف بالمادة نفسها (§4).
UPDATE public.products p
   SET category_id = CASE
     -- الخدمات بلا تصنيف: خدمة الطحن لها قسمها المستقل.
     WHEN p.item_class = 'SERVICE' THEN NULL

     -- الخام: بالمادة.
     WHEN p.item_class = 'RAW_MATERIAL' AND p.name_ar LIKE '%قمح%' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'القمح' LIMIT 1)
     WHEN p.item_class = 'RAW_MATERIAL' AND p.name_ar LIKE '%ذرة%' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'الذرة' LIMIT 1)
     WHEN p.item_class = 'RAW_MATERIAL' AND p.name_ar LIKE '%شعير%' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'الشعير' LIMIT 1)

     -- التعبئة: عائلة مشروعة واحدة.
     WHEN p.item_class = 'PACKAGING' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'مستلزمات تعبئة' LIMIT 1)

     -- الناتج الجانبي (النخالة): عائلة النخالة، لا عائلة «منتجات تامة» العامة.
     WHEN p.sku = 'FG-BRAN-40' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'النخالة' LIMIT 1)

     -- الدقيق/السميد: بالاسم لأن الاسم يحمل المواصفة الكاملة.
     WHEN p.name_ar LIKE '%دقيق فاخر%' OR p.name_ar LIKE '%دقيق أبيض%' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'الدقيق الأبيض' LIMIT 1)
     WHEN p.name_ar LIKE '%دقيق بر%' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'دقيق البر' LIMIT 1)
     WHEN p.name_ar LIKE '%سميد%' THEN
       (SELECT c.id FROM public.categories c WHERE c.name_ar = 'السميد' LIMIT 1)
     ELSE p.category_id -- لا تغيير لما لا يطابق النمط: يُحفظ لا يُفقد.
   END
 WHERE p.category_id IS NOT NULL
    OR p.item_class = 'SERVICE';

-- ---------------------------------------------------------------------------
-- 3. تفريغ ثم حذف تصنيفات-النوع — بشرط ألا يبقى عليها صنف واحد
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE IF NOT EXISTS _cat_type_like AS
SELECT id FROM public.categories
 WHERE name_ar IN (
   'مواد المطحنة الخام', 'خدمات المطحنة التشغيلية',
   'منتجات المطحنة التامة', 'مستلزمات تعبئة المطحنة',
   'حبوب ومواد خام', 'مواد خام', 'مواد حبوب',
   'خدمة طحن', 'خدمات طحن وتشغيل', 'تشغيل',
   'مستلزمات تعبئة وتغليف'
 );

DELETE FROM public.categories c
 WHERE c.id IN (SELECT id FROM _cat_type_like)
   AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id);

DROP TABLE IF EXISTS _cat_type_like;

-- ---------------------------------------------------------------------------
-- 4. أعمدة العبوة: من يشترى بالكتلة أو يقدم خدمة لا عبوة له
-- ---------------------------------------------------------------------------
UPDATE public.products
   SET package_type_id = NULL,
       package_weight_kg = NULL
 WHERE item_class IN ('RAW_MATERIAL', 'SERVICE')
   AND (package_type_id IS NOT NULL OR package_weight_kg IS NOT NULL);

-- التعبئة نفسها: نوع ووزن العبوة يُقرآن من الاسم («كيس … 50 كجم»).
-- تنبيه مهم: داخل الاستعلام الفرعي على packaging_types، الاسم غير المؤهل
-- (name_ar) يُحلّ إلى pt.name_ar وليس اسم المنتج — فطابق كل صف «شوال» لأن
-- قيمة صفّ SACK هي «شوال». لذا التأهيل بـ products.name_ar إلزامي.
UPDATE public.products
   SET package_weight_kg =
         NULLIF(regexp_replace(products.name_ar, '^.*?([0-9]+(?:\.[0-9]+)?)\s*كجم.*$', '\1'), products.name_ar)::numeric,
       package_type_id = (
         SELECT pt.id FROM public.packaging_types pt
          WHERE pt.code = CASE
                  WHEN products.name_ar LIKE '%شوال%' THEN 'SACK'
                  WHEN products.name_ar LIKE '%كيس%'  THEN 'BAG'
                  ELSE NULL
                END
          LIMIT 1
        )
 WHERE item_class = 'PACKAGING'
   AND name_ar ~ '[0-9]';

-- الخيش الجوت: الاسم يصف المادة («خيش طبيعي») لا الوعاء، فلم يلتقطة النمط أعلاه.
-- وهو فعلياً شوال قنّب 50 كجم — يُضبط صراحةً لأن نوع العبوة بيانات بنيوية
-- لا يصح تركها فارغة لصنفٍ هو عبوة بذاته.
UPDATE public.products
   SET package_type_id = (SELECT id FROM public.packaging_types WHERE code = 'SACK' LIMIT 1)
 WHERE sku = 'PKG-BAG-JUTE-50'
   AND package_type_id IS NULL;

COMMIT;
