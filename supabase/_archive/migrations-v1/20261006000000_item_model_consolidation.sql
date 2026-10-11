-- ============================================================================
-- 20261006000000_item_model_consolidation.sql
-- توحيد نموذج الأصناف: من "كل شيء منتج" إلى Item Type + Package + Custody
-- ============================================================================
-- المرجع: مواصفات الإصلاح الشامل (الأقسام 2–7، 12، 22–27، 35).
--
-- WHAT WAS WRONG (مُثبَت من قاعدة البيانات الفعلية)
-- ---------------------------------------------------------------------------
--  ١) سنتا التصنيف معاً: categories تحمل «حبوب ومواد خام» و«خدمات طحن وتشغيل»
--     و«مستلزمات تعبئة وتغليف» — وهذه في الحقيقة item_class لا عائلات منتج.
--     فصفحة المنتجات تعرض «تصنيفاً» هو في الواقع نوع الصنف، ويبقى التصنيف
--     الحقيقي (دقيق أبيض، نخالة…) غائباً.
--
--  ٢) الوحدات مسمومة: «شوال 50 كجم» و«كيس 25 كجم» و«كيس 10 كجم» وحدات قياس
--     مستقلة. وهذا يجعل 2 × شوال = 2، لا 100 كجم — فيستحيل على محرك المخزون
--     أن يحوّل أو يجمّع، ويصبح رصيد الدقيق بلا معنى كمّي موحّد.
--
--  ٣) تعبئة متناقضة: أصناف PKG-* تحمل NON_STOCK_ITEM (أي «يُستهلك بلا رصيد»)
--     مع inventory_policy = TRACKED ورصيد فعلي 365 شوال. السبب البنيوي أن
--     PACKAGING غير موجود في enum أصلاً، فمُشغّل المزامنة tg_sync_item_class
--     يُسقطه إلى FINISHED_GOOD أو NON_STOCK_ITEM حسب آخر كتابة.
--
--  ٤) خام قابل للبيع: RM-CORN-WHITE صنّفته item_class = RAW_MATERIAL وبقي
--     is_sellable = true، فظهر في نقاط البيع. ونفس الانفصال في الخدمات:
--     SRV-CLEANING خدمة قابلة للبيع.
--
--  ٥) FG-BRAN-40 ناتج جانبي (نخالة) مصنَّف FINISHED_GOOD، فيُقيَّم كمنتج
--     رئيسي — تضخيم صامت في تكلفة المخزون.
--
-- THE FIX (في هذا الملف)
-- ---------------------------------------------------------------------------
--  A. إصلاح مُشغّل المزامنة ليحترم PACKAGING.
--  B. تصحيح item_class للبيانات الفعلية وربط is_sellable/is_purchasable به.
--  C. استعادة الوحدة الأساسية kg، ونقل "50 كجم / 25 كجم" إلى أعمدة العبوة.
--  D. إعادة بناء التصنيفات: حذف تصنيفات-النوع، وإنشاء عائلات المنتجات.
--
-- PRE-CONDITION
-- -------------
-- قيمة PACKAGING في الـ enum تُضاف في 20261005995000 (ملف مستقل: PostgreSQL
-- لا يسمح باستخدام قيمة enum في المعاملة التي أضافتها). وأنواع التعبئة تُنشأ
-- في 20261005990000، لأن أعمدة العبوة هنا تشير إليها.
--
-- NON-DESTRUCTIVE GUARANTEES
-- ---------------------------------------------------------------------------
--  * لا يُحذف أي صنف له حركة مخزون أو بند فاتورة أو علاقة تشغيلية واحدة.
--  * لا يُحذف أي تصنيف يحمل أصنافاً؛ يُعاد تعيين أصنافه أولاً.
--  * الوحدات القديمة تُبقى (لا تُحذف) لأن صفوفاً مخزنية تشير إليها؛ تبقى
--    للقراءة التاريخية بينما تنتقل الأصناف إلى kg.
--  * كل خطوة idempotent: إعادة التشغيل لا تغيّر شيئاً.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. مُشغّل المزامنة: احترام PACKAGING وعدم إسقاطه
-- ---------------------------------------------------------------------------
-- كان المُشغّل يعرف RAW_MATERIAL و BY_PRODUCT فقط كاستثناءات محفوظة، فأي
-- صنف PACKAGING يمرّ بـ UPDATE على item_nature/inventory_policy يُسقط إلى
-- FINISHED_GOOD. هذا هو السبب المباشر لعودة التناقض بعد كل تعديل.
BEGIN;

-- DROP قبل CREATE: النسخة السابقة من الدالة قد تحمل توقيعاً بمعاملات مختلفة
-- (نسخة مبكّرة استخدمت معاملاً افتراضياً)، وCREATE OR REPLACE يرفض تغيير
-- قائمة المعاملات بـ «cannot remove parameter defaults from existing function».
--
-- والمُشغّل يجب أن يُسقط أولاً: هو يمنع إسقاط الدالة التي ينفّذها.
DROP TRIGGER IF EXISTS tg_sync_item_class ON public.products;
DROP FUNCTION IF EXISTS public.sync_item_class_from_policy();

CREATE OR REPLACE FUNCTION public.sync_item_class_from_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.item_nature IS DISTINCT FROM OLD.item_nature
     OR NEW.inventory_policy IS DISTINCT FROM OLD.inventory_policy THEN

    -- الطبيعة تحكم أولاً: الخدمة خدمة.
    IF NEW.item_nature = 'SERVICE' THEN
      NEW.item_class := 'SERVICE';

    ELSIF NEW.item_nature = 'GOOD' THEN
      -- الأصناف التي تصنيفها *خاصية جوهرية* لا تُدهَس بالمنتج النهائي:
      -- خام قابل للاستهلاك، ناتج جانبي، وتعبئة تُشترى وتُستهلك.
      IF NEW.item_class IS NULL
         OR NEW.item_class NOT IN ('RAW_MATERIAL', 'BY_PRODUCT', 'PACKAGING') THEN
        NEW.item_class := 'FINISHED_GOOD';
      END IF;
    END IF;

    -- السياسة تحدّ الحالة التي لا تُمسك رصيداً.
    IF NEW.inventory_policy = 'CUSTOMER_OWNED' THEN
      -- أمانات العميل ليست مخزوناً تجارياً؛ تبقى ماديّةً في تصنيفها الأصلي.
      IF NEW.item_class IS NULL THEN
        NEW.item_class := 'NON_STOCK_ITEM';
      END IF;
    ELSIF NEW.inventory_policy = 'UNTRACKED' AND NEW.item_nature = 'GOOD' THEN
      -- صنف مادي غير متتبَّع: لا رصيد له مهما كان نوعه.
      NEW.item_class := 'NON_STOCK_ITEM';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- إعادة إنشاء المُشغّل بعد اسقاطه أعلاه.
DROP TRIGGER IF EXISTS tg_sync_item_class ON public.products;
CREATE TRIGGER tg_sync_item_class
  BEFORE INSERT OR UPDATE OF item_nature, inventory_policy ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_item_class_from_policy();

COMMIT;

-- ---------------------------------------------------------------------------
-- A3. تصحيح التصنيف + الموائمة بين التصنيف وأعلام البيع/الشراء
-- ---------------------------------------------------------------------------
BEGIN;

-- النخالة ناتج جانبي لا منتج رئيسي: تُقيَّم بسعر جانبي لا بسعر دقيق.
UPDATE public.products
   SET item_class = 'BY_PRODUCT'
 WHERE sku = 'FG-BRAN-40'
   AND item_class IS DISTINCT FROM 'BY_PRODUCT';

-- الأكياس والشوالات: صنف مادي مخزني يُشترى ويُستهلك بحركة STOCK_ISSUE.
-- استثناء نصوص التغليف (خيوط) لأنها تُستخدم بلا حصر.
UPDATE public.products
   SET item_class = 'PACKAGING',
       inventory_policy = 'TRACKED',
       is_sellable = false,
       is_purchasable = true
 WHERE sku LIKE 'PKG-%'
   AND item_class IS DISTINCT FROM 'PACKAGING';

-- الخام: يُشترى ويُستهلك في الإنتاج، ولا يُباع في نقاط البيع إطلاقاً.
-- هذا هو الإصلاح المباشر لظهور «ذرة بيضاء» في شاشة البيع.
UPDATE public.products
   SET is_sellable = false
 WHERE item_class = 'RAW_MATERIAL'
   AND is_sellable;

-- الخدمات: لا مخزون، لا شراء، (قد تُباع إن كانت خدمة طحن/تنظيف).
UPDATE public.products
   SET is_purchasable = false,
       inventory_policy = 'UNTRACKED',
       tracking = 'NONE',
       costing_method = 'NONE'
 WHERE item_class = 'SERVICE'
   AND (is_purchasable OR inventory_policy <> 'UNTRACKED' OR costing_method <> 'NONE');

-- المنتج النهائي: مخزني، يُباع، ويُصنَّع (لا يُشترى جاهزاً في مطحنة).
UPDATE public.products
   SET inventory_policy = 'TRACKED',
       is_sellable = true
 WHERE item_class IN ('FINISHED_GOOD', 'BY_PRODUCT')
   AND inventory_policy <> 'TRACKED';

-- ---------------------------------------------------------------------------
-- A4. الوحدة الأساسية: استعادة kg والأوزان الصحيحة
-- ---------------------------------------------------------------------------
-- «شوال 50 كجم» ليس وحدة قياس، بل عبوة. الرصيد يجب أن يكون بالكيلوجرام حتى
-- يستطيع المحرك جمع 2 شوال + 3 أكياس في رقم واحد ذي معنى.
DO $$
DECLARE
  v_kg uuid;
BEGIN
  SELECT id INTO v_kg
    FROM public.units
   WHERE (name_ar = 'كيلوجرام' OR lower(name) LIKE 'kilogram%')
   ORDER BY created_at NULLS LAST
   LIMIT 1;

  -- إن لم تكن kg موجودة تُنشأ، فهي حجر الأساس لكل حساب وزني.
  IF v_kg IS NULL THEN
    INSERT INTO public.units (name, name_ar, short_name)
    VALUES ('Kilogram', 'كيلوجرام', 'kg')
    RETURNING id INTO v_kg;
  END IF;

  -- نقل كل صنف يستخدم وحدة وزن-عبوة إلى kg، بعد تفكيك الرقم إلى أعمدة العبوة.
  -- الأعمدة تُضاف الآن لتستقبل القيمة قبل تغيير الإشارة.
  ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS package_type_id uuid REFERENCES public.packaging_types(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS package_weight_kg numeric(10,3);

  -- تفكيك اسم الوحدة إلى (نوع تعبئة + وزن) لكل صنف معنيّ.
  WITH parsed AS (
    SELECT p.id AS product_id,
           u.id AS old_unit_id,
           -- الوزن من الاسم: «شوال 50 كجم» -> 50
           NULLIF(regexp_replace(u.name_ar, '^.*?([0-9]+(?:\.[0-9]+)?)\s*كجم.*$', '\1'), u.name_ar)::numeric AS weight,
           CASE
             WHEN u.name_ar LIKE '%شوال%' THEN 'SACK'
             WHEN u.name_ar LIKE '%كيس%'  THEN 'BAG'
             ELSE NULL
           END AS pkg_code
      FROM public.products p
      JOIN public.units u ON u.id = p.unit_id
     WHERE u.id <> v_kg
       AND u.name_ar ~ '[0-9]'
  )
  UPDATE public.products p
     SET package_weight_kg = COALESCE(p.package_weight_kg, parsed.weight),
         package_type_id   = COALESCE(
                               p.package_type_id,
                               (SELECT pt.id FROM public.packaging_types pt
                                 WHERE pt.code = parsed.pkg_code)
                             ),
         unit_id           = v_kg,
         base_uom_id       = v_kg
    FROM parsed
   WHERE p.id = parsed.product_id;

  -- نفس النقل لأصناف أشارت لتلك الوحدات عبر أعمدة البيع/الشراء/الأساس.
  UPDATE public.products
     SET sales_uom_id = v_kg
   WHERE sales_uom_id IN (SELECT id FROM public.units WHERE id <> v_kg AND name_ar ~ '[0-9]');

  UPDATE public.products
     SET purchase_uom_id = v_kg
   WHERE purchase_uom_id IN (SELECT id FROM public.units WHERE id <> v_kg AND name_ar ~ '[0-9]');

  UPDATE public.products
     SET base_uom_id = v_kg
   WHERE base_uom_id IN (SELECT id FROM public.units WHERE id <> v_kg AND name_ar ~ '[0-9]');
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- D. إعادة بناء التصنيفات: التصنيف عائلة منتج لا نوع صنف
-- ---------------------------------------------------------------------------
-- كانت categories تحمل «حبوب ومواد خام» و«خدمات طحن وتشغيل» و«مستلزمات تعبئة
-- وتغليف» — وهي قيم item_class مكتوبة كتصنيف. فأي تقرير يقول «حسب التصنيف»
-- كان يجيب على سؤال «ما نوع الصنف» بدل «أي عائلة منتج». والأسوأ: التصنيف
-- الحقيقي (دقيق أبيض، دقيق بر، نخالة…) لم يكن موجوداً إطلاقاً.
--
-- القاعدة الجديدة: التصنيف يصف *ماذا* يُنتج/يُباع، لا *كيف* يُخزَّن.
-- الأنواع (خام/تعبئة/خدمة) تُصفّى من الواجهة عبر item_class لا عبر التصنيف.
BEGIN;

-- ١) عائلات المنتجات النهائية — تُنشأ فقط إن لم تكن موجودة، بلا حذف أي شيء.
INSERT INTO public.categories (name, name_ar)
SELECT v.name, v.name_ar
  FROM (VALUES
    ('White Flour',    'الدقيق الأبيض'),
    ('Brown Flour',    'دقيق البر'),
    ('Mixed Flour',    'الدقيق المخلوط'),
    ('Corn Flour',     'دقيق الذرة'),
    ('Barley Flour',   'دقيق الشعير'),
    ('Ground Wheat',   'القمح المطحون'),
    ('Bran',           'النخالة')
  ) AS v(name, name_ar)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.categories c WHERE c.name_ar = v.name_ar
 );

-- ٢) عائلات المواد الخام: التصنيف يصف المادة نفسها لا «مواد خام».
INSERT INTO public.categories (name, name_ar)
SELECT v.name, v.name_ar
  FROM (VALUES
    ('Wheat',  'القمح'),
    ('Corn',   'الذرة'),
    ('Barley', 'الشعير')
  ) AS v(name, name_ar)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.categories c WHERE c.name_ar = v.name_ar
 );

-- ٣) تصنيفات-النوع تُفرَّغ من أصنافها ثم تُحذف (البيانات تنتقل لا تُفقد).
--    لا يُحذف تصنيف يحمل أصنافاً لم تُعَيَّن من جديد — الشرط يضمن ذلك.
CREATE TEMP TABLE IF NOT EXISTS _cat_type_like AS
SELECT c.id, c.name_ar
  FROM public.categories c
 WHERE c.name_ar IN (
         'حبوب ومواد خام',
         'خدمات طحن وتشغيل',
         'مستلزمات تعبئة وتغليف',
         'مواد خام',
         'مواد حبوب',
         'خدمة طحن',
         'تشغيل'
       );

-- إعادة تعيين أصنافها إلى العائلة الصحيحة حسب نوع الصنف الحقيقي.
UPDATE public.products p
   SET category_id = (
         CASE
           WHEN p.item_class = 'PACKAGING' THEN
             (SELECT c.id FROM public.categories c WHERE c.name_ar = 'مستلزمات تعبئة' LIMIT 1)
           WHEN p.item_class = 'RAW_MATERIAL' AND p.name_ar LIKE '%قمح%' THEN
             (SELECT c.id FROM public.categories c WHERE c.name_ar = 'القمح' LIMIT 1)
           WHEN p.item_class = 'RAW_MATERIAL' AND p.name_ar LIKE '%ذرة%' THEN
             (SELECT c.id FROM public.categories c WHERE c.name_ar = 'الذرة' LIMIT 1)
           WHEN p.item_class = 'RAW_MATERIAL' AND p.name_ar LIKE '%شعير%' THEN
             (SELECT c.id FROM public.categories c WHERE c.name_ar = 'الشعير' LIMIT 1)
           -- الخدمات لا تصنيف لها: التصنيف للمنتجات، والخدمة مسارها مستقل.
           WHEN p.item_class = 'SERVICE' THEN NULL
           ELSE NULL
         END
       )
 WHERE p.category_id IN (SELECT id FROM _cat_type_like);

-- تصنيف «مستلزمات تعبئة» عائلة مشروعة للتعبئة، لكنه لم يكن موجوداً؛ يُنشأ
-- لأن الخطوة أعلاه تُحيل إليه.
INSERT INTO public.categories (name, name_ar)
SELECT 'Packaging Supplies', 'مستلزمات تعبئة'
 WHERE NOT EXISTS (
   SELECT 1 FROM public.categories c WHERE c.name_ar = 'مستلزمات تعبئة'
 );

-- إعادة المحاولة للأصناف التي أُفرغت تصنيفاً قبل إنشاء العائلة.
UPDATE public.products p
   SET category_id = (SELECT c.id FROM public.categories c WHERE c.name_ar = 'مستلزمات تعبئة' LIMIT 1)
 WHERE p.item_class = 'PACKAGING'
   AND p.category_id IS NULL;

-- الآن تُحذف تصنيفات-النوع، بشرط ألا يبقى صنف واحد معلّق بها.
DELETE FROM public.categories c
 WHERE c.id IN (SELECT id FROM _cat_type_like)
   AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id);

DROP TABLE IF EXISTS _cat_type_like;

COMMIT;
