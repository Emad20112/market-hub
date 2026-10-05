-- ============================================================================
-- فهرس المنتجات: تنظيف البيانات قبل التسليم
--
-- ما يحسمه هذا الملف:
--   1) عمود name الإنجليزي كان يحمل النص العربي نفسه في 18 صنفاً، فيظهر
--      الاسم العربي مرتين في الواجهة (والإنجليزي ليس اسماً إنجليزياً أصلاً).
--   2) صنفان بلا SKU: مخزون بلا مفتاح فهرسة.
--   3) أكياس التعبئة كانت مسماة "تعبئة دقيق" وهي تُستخدم لكل منتج، لا للدقيق.
--   4) "Bag 50kg" و"شوال 50 كجم" اسمان لشيء واحد، و"كيس 40 كجم" بلا استخدام.
--   5) خدمة قابلة للشراء:发动机 يرفضها عند الشراء لأنها لا تملك مخزوناً.
--   6) تصنيف بلا منتجات.
--
-- كل تعديل هنا تصحيح بيانات، لا تغيير سلوك: المحرك والقواعد كما هي.
-- ============================================================================

BEGIN;

-- ── 1) الاسم الإنجليزي يحمل عربية ──────────────────────────────────────────
-- products.name NOT NULL، لذا لا يمكن تصفيره بـ NULL؛ يُفرَّغ النص.
-- الاسم الحقيقي هو name_ar، والواجهة تعرض العمود الثاني فقط إذا كان
-- مختلفاً عن الاسم المعروض — فراغه يمنع تكرار الاسم العربي مرتين.
UPDATE public.products
   SET name = ''
 WHERE name ~ '[ء-ي]';

-- ── 2) أصناف بلا SKU ────────────────────────────────────────────────────────
UPDATE public.products SET sku = 'RM-WHEAT-HARD-IMP'
 WHERE sku IS NULL AND name_ar = 'قمح صلب مستورد (درجة أولى)';

UPDATE public.products SET sku = 'SRV-MILL-TON'
 WHERE sku IS NULL AND name_ar = 'أجرة طحن بالطن الواحد';

-- ── 3) تسمية مستلزمات التعبئة ──────────────────────────────────────────────
-- الاسم الصحيح يصف الوحدة، لا المنتج الذي يوضع فيه.
UPDATE public.products SET name_ar = 'كيس تعبئة 10 كجم'  WHERE sku = 'PKG-BAG-10';
UPDATE public.products SET name_ar = 'كيس تعبئة 25 كجم'  WHERE sku = 'PKG-BAG-25';
UPDATE public.products SET name_ar = 'شوال تعبئة 50 كجم'  WHERE sku = 'PKG-BAG-50';

-- ── 4) الوحدات ──────────────────────────────────────────────────────────────
-- الشوال كيس 50 كجم؛ الاسمان لشيء واحد فلا يصح أن يكون أحدهما "Bag".
UPDATE public.units SET name = 'Sack 50kg', name_ar = 'شوال 50 كجم'
 WHERE short_name = 'BAG-50';

-- وحدة بلا أي صنف ولا سطر مرجعي: إزالتها بدل تركها في قائمة القياس.
DELETE FROM public.units u
 WHERE u.short_name = 'BAG-40'
   AND NOT EXISTS (SELECT 1 FROM public.products p
                    WHERE p.unit_id = u.id OR p.sales_uom_id = u.id OR p.purchase_uom_id = u.id);

-- ── 5) خدمة قابلة للشراء ───────────────────────────────────────────────────
-- A service has no stock to receive, so the purchase engine refuses it; leaving
-- the flag on only ever produces a failed purchase.
UPDATE public.products SET is_purchasable = false
 WHERE item_class = 'SERVICE' AND is_purchasable;

-- ── 6) تصنيف بلا منتجات ────────────────────────────────────────────────────
DELETE FROM public.categories c
 WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = c.id)
   AND c.name_ar = 'مصروفات تشغيلية';

COMMIT;