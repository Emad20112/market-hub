-- ═══════════════════════════════════════════════════════════════════
-- الاسم الإنجليزي يصبح اختيارياً
--
-- كان products.name إلزامياً (NOT NULL) والاسم العربي اختيارياً.
-- والنتيجة العملية أن أي صنف يُدخل بالعربية يُكرَّر نصّه في العمودين،
-- فتظهر البطاقة اسمه مرتين، ويصبح من المستحيل وصف صنف عربي بلا اسم
-- إنجليزي — وهو حال معظم أصناف المطحنة.
--
-- القاعدة تنقلب إلى ما يعكس الواقع: الاسم العربي هو الاسم، والإنجليزي
-- ترجمة اختيارية يملؤها من يحتاجها.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- 1) الأعمدة: العربي إلزامي، الإنجليزي اختياري.
UPDATE public.products SET name_ar = name WHERE name_ar IS NULL OR btrim(name_ar) = '';

ALTER TABLE public.products ALTER COLUMN name_ar SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN name DROP NOT NULL;

-- 2) النصوص التي كُرّرت في العمودين: الإنجليزي يصبح فارغاً، فالاسم واحد.
UPDATE public.products
   SET name = NULL
 WHERE name IS NOT NULL
   AND (btrim(name) = btrim(name_ar) OR name ~ '[\u0600-\u06FF]');

-- 3) الاسم الإنجليزي لم يبقَ مرجعاً لأي شيء؛ لا فرض عليه.
COMMENT ON COLUMN public.products.name IS
  'الاسم الإنجليزي (اختياري). الاسم المعروض هو name_ar.';
COMMENT ON COLUMN public.products.name_ar IS
  'الاسم العربي، وهو اسم الصنف المعروض في كل الشاشات.';

COMMIT;