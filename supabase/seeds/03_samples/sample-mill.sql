-- ============================================================================
-- sample-mill.sql — مثال: مطحنة دقيق
-- ============================================================================
--
-- ⚠️  بيانات عرض — لا تُشغَّل تلقائيًا ولا تُشغَّل على قاعدة عميل.
--     التشغيل:  psql "$DATABASE_URL" -f supabase/seeds/03_samples/sample-mill.sql
--
-- ── ما هذا الملف؟ ───────────────────────────────────────────────────────────
--   مثال متكامل لمطحنة دقيق: الوحدات الخاصة بها، تصنيفاتها، منتجاتها،
--   درجات الحبوب، مورد واحد، وعميلان. الغرض منه أن يرى من يجرّب النظام
--   بيانات واقعية بدل قاعدة فارغة.
--
-- ── لماذا نشاط واحد في ملف واحد؟ ────────────────────────────────────────────
--   كانت البيانات موزّعة على ستة ملفات (تصنيفات، منتجات، درجات، موردون،
--   عملاء، مستودعات)، فيحتاج المالك أن يفتح ستة ملفات ليعدّل سعر منتج أو
--   يضيف عميلًا — ويعرف ترتيب تشغيلها ولا ينسى أحدها.
--
--   اليوم كل ما يخص المطحنة في ملف واحد، مقسّم إلى أقسام مرقّمة يعمل كل
--   قسم منها بعد الذي قبله. لتعديل سعر: ابحث عن «القسم 4». لإضافة عميل:
--   اذهب إلى «القسم 6». لا شيء خارج هذا الملف.
--
-- ── كيف يعمل بدون معرّفات ثابتة؟ ────────────────────────────────────────────
--   النسخة السابقة كانت تحتوي معرّفات UUID مأخوذة من قاعدة بيانات المطوّر
--   (مثل 'ac4a1521-8e10-...'). هذه المعرّفات لا وجود لها في قاعدة جديدة،
--   فيفشل الملف برسالة «violates foreign key constraint».
--
--   هنا كل ارتباط يُحلّ **بالاسم أو الرمز**: التصنيف بالاسم، الوحدة بالرمز،
--   المنتج بالـ SKU. فيعمل الملف على أي قاعدة، في أي وقت، مهما أُعيد تشغيله.
--
-- ── الأقسام ─────────────────────────────────────────────────────────────────
--   1. الوحدات الخاصة بالمطحنة (العبوات بوزنها)   ← تعتمد على: لا شيء
--   2. المستودع                                    ← تعتمد على: لا شيء
--   3. التصنيفات                                   ← تعتمد على: لا شيء
--   4. المنتجات                                    ← تعتمد على: 1، 3
--   5. درجات الحبوب                                ← تعتمد على: 4
--   6. المورّد والعميلان                            ← تعتمد على: لا شيء
--
-- ثابت (Idempotent): يمكن تشغيله أكثر من مرة بأمان.
-- المرجع: supabase/MIGRATIONS_RULES.md — القاعدتان R-08 و R-19.
-- ============================================================================

BEGIN;

-- ============================================================================
-- القسم 1 — الوحدات الخاصة بالمطحنة
-- ============================================================================
-- هذه ليست وحدات قياس فيزيائية — الكيلوجرام كيلوجرام لأي منشأة (وهو في
-- seeds/01_system). هذه **عبوات** بوزن محدّد يشتريها المطحن ويبيعها.
--
-- وجودها هنا لا في ملف الوحدات مقصود: متجر القرطاسية لا يشتري شوالات 50 كجم،
-- فلا معنى لأن يجدها في قائمة وحداته.
--
-- ملاحظة: كلمة «وحدة» في النظام تعني مقدارًا يُقاس به. وضع هذه هنا مؤقت حتى
-- تُدخل المنشأة عبواتها كمنتجات في القسم 4، وهو أدقّ تصنيفًا.

INSERT INTO public.units (name, short_name, name_ar) VALUES
  ('Bag 25kg',   'bag25', 'كيس 25 كجم'),
  ('Bag 40kg',   'bag40', 'كيس 40 كجم'),
  ('Bag 50kg',   'bag50', 'كيس 50 كجم'),
  ('Sack 50kg',  'sack50','شوال 50 كجم')
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- القسم 2 — المستودع
-- ============================================================================
-- المستودع موقع فيزيائي يخصّ منشأة واحدة، فلا يصلح أن يُوضع في ملف النظام.
-- لو وُضع هناك لوجد كل عميل جديد مستودعًا باسم «المحل الرئيسي» لا يخصّه.

INSERT INTO public.warehouses (name, name_ar, code, is_default, is_active) VALUES
  ('Main Store', 'المحل الرئيسي', 'MAIN', true, true)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- القسم 3 — تصنيفات المنتجات
-- ============================================================================
-- عائلات المنتجات التي تتعامل بها المطحنة: حبوب خام، ومنتجات مطحونة،
-- ومستلزمات تعبئة.

INSERT INTO public.categories (name, name_ar, parent_id) VALUES
  ('Wheat',              'القمح',            NULL),
  ('Corn',               'الذرة',            NULL),
  ('Barley',             'الشعير',           NULL),
  ('Ground Wheat',       'القمح المطحون',    NULL),
  ('White Flour',        'الدقيق الأبيض',    NULL),
  ('Brown Flour',        'دقيق البر',        NULL),
  ('Semolina',           'السميد',           NULL),
  ('Mixed Flour',        'الدقيق المخلوط',   NULL),
  ('Corn Flour',         'دقيق الذرة',       NULL),
  ('Barley Flour',       'دقيق الشعير',      NULL),
  ('Bran',               'النخالة',          NULL),
  ('Packaging Supplies', 'مستلزمات تعبئة',   NULL)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- القسم 4 — المنتجات
-- ============================================================================
-- عشرون منتجًا: مواد خام (قمح، ذرة، شعير)، ومنتجات تامة (دقيق بدرجاته،
-- سميد، نخالة)، ومستلزمات تعبئة، وخدمات (أجور طحن وتعبئة).
--
-- ── كيف تُربط المنتجات بمحتوياتها ───────────────────────────────────────────
--   التصنيف  يُحلّ بالاسم   : (SELECT id FROM categories WHERE name = '...')
--   الوحدة   تُحلّ برمزها   : (SELECT id FROM units WHERE name = '...')
--   العبوة   تُحلّ برمزها   : (SELECT id FROM packaging_types WHERE code = '...')
--
--   فلا يوجد أي معرّف ثابت في هذا الملف.

INSERT INTO public.products (
  sku, name, name_ar, description,
  category_id, unit_id, base_uom_id, sales_uom_id, purchase_uom_id,
  cost_price, sale_price, tax_rate, min_stock,
  is_service, is_active, status,
  item_nature, inventory_policy, tracking, costing_method,
  is_sellable, is_purchasable,
  item_class, package_type_id, package_weight_kg
)
SELECT
  v.sku, v.name, v.name_ar, v.description,
  (SELECT id FROM public.categories WHERE name = v.category),
  u.id, u.id, u.id, u.id,
  v.cost, v.price, 0, 0,
  v.is_service, true, 'ACTIVE',
  v.nature, v.policy, v.tracking, v.costing,
  v.sellable, v.purchasable,
  v.item_class,
  (SELECT id FROM public.packaging_types WHERE code = v.pkg),
  v.weight
FROM (VALUES
  -- ── مواد خام ──────────────────────────────────────────────────────────────
  ('RM-WHEAT-HARD',  'Wheat Hard Imported', 'قمح صلب مستورد (درجة أولى)',
   'قمح صلب مستورد من الدرجة الأولى.', 'Wheat', 'bag50',
   11400, 0, false, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', false, true, 'RAW_MATERIAL', NULL, NULL),

  ('RM-WHEAT-LOCAL', 'Wheat Local', 'قمح بلدي محلي',
   'قمح بلدي موسمي — التكلفة الفعلية تتحدد عند الشراء.', 'Wheat', 'bag50',
   11000, 0, false, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', false, true, 'RAW_MATERIAL', NULL, NULL),

  ('RM-WHEAT-SOFT',  'Wheat Soft', 'قمح طري للمخبوزات',
   'قمح طري مخصص للمخبوزات والحلويات.', 'Wheat', 'bag50',
   10800, 0, false, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', false, true, 'RAW_MATERIAL', NULL, NULL),

  ('RM-CORN-YELLOW', 'Yellow Corn', 'ذرة صفراء خام',
   'ذرة صفراء خام تصلح للطحن أو التغذية.', 'Corn', 'bag50',
   12500, 0, false, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', false, true, 'RAW_MATERIAL', NULL, NULL),

  ('RM-BARLEY',      'Barley', 'شعير حبوب خام',
   'شعير خام للطحن أو التغذية.', 'Barley', 'bag50',
   9000, 0, false, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', false, true, 'RAW_MATERIAL', NULL, NULL),

  -- ── منتجات تامة (مطحونة) ───────────────────────────────────────────────────
  ('FG-FLOUR-SUPER-50',  'Flour Super Grade 1 50kg', 'دقيق فاخر نمرة 1 — شوال 50 كجم',
   'دقيق فاخر درجة أولى معبأ في شوال 50 كجم.', 'White Flour', 'bag50',
   0, 13500, true, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', true, false, 'FINISHED_GOOD', 'SACK', 50),

  ('FG-FLOUR-SUPER-25',  'Flour Super Grade 1 25kg', 'دقيق فاخر نمرة 1 — كيس 25 كجم',
   'دقيق فاخر درجة أولى معبأ في كيس 25 كجم.', 'White Flour', 'bag25',
   0, 6800, true, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', true, false, 'FINISHED_GOOD', 'BAG', 25),

  ('FG-FLOUR-BROWN-50',  'Flour Brown 50kg', 'دقيق بر كامل — شوال 50 كجم',
   'دقيق بر كامل (بلدي نمرة 2) معبأ في شوال 50 كجم.', 'Brown Flour', 'bag50',
   0, 13000, true, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', true, false, 'FINISHED_GOOD', 'SACK', 50),

  ('FG-SEMOLINA-50',     'Semolina 50kg', 'سميد ناعم — شوال 50 كجم',
   'سميد ناعم معبأ في شوال 50 كجم.', 'Semolina', 'bag50',
   0, 18000, true, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', true, false, 'FINISHED_GOOD', 'SACK', 50),

  ('FG-BRAN-40',         'Wheat Bran 40kg', 'نخالة قمح خشنة — كيس 40 كجم',
   'نخالة خشنة لتغذية المواشي، معبأة في كيس 40 كجم.', 'Bran', 'bag40',
   0, 7500, true, 'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE', true, false, 'BY_PRODUCT', 'BAG', 40),

  -- ── مستلزمات تعبئة ─────────────────────────────────────────────────────────
  ('PKG-BAG-PP-50',   'PP Woven Bag 50kg', 'كيس بولي بروبيلين فارغ 50 كجم',
   'كيس منسوج قابل لإعادة الاستخدام.', 'Packaging Supplies', 'piece',
   350, 500, false, 'GOOD', 'TRACKED', 'NONE', 'MOVING_AVERAGE', false, true, 'PACKAGING', 'BAG', 50),

  ('PKG-BAG-PP-25',   'PP Woven Bag 25kg', 'كيس بولي بروبيلين فارغ 25 كجم',
   'كيس منسوج متوسط للتجزئة والمخابز.', 'Packaging Supplies', 'piece',
   250, 400, false, 'GOOD', 'TRACKED', 'NONE', 'MOVING_AVERAGE', false, true, 'PACKAGING', 'BAG', 25),

  ('PKG-BAG-JUTE-50', 'Jute Natural Bag 50kg', 'خيش طبيعي فارغ 50 كجم',
   'خيش طبيعي عالي المتانة للحبوب.', 'Packaging Supplies', 'piece',
   900, 1300, false, 'GOOD', 'TRACKED', 'NONE', 'MOVING_AVERAGE', false, true, 'PACKAGING', 'SACK', 50),

  ('PKG-THREAD-ROLL', 'Sewing Thread Roll', 'بكرة خيط حياكة أكياس',
   'خيط صناعي لماكينات خياطة الأكياس.', 'Packaging Supplies', 'piece',
   6000, 0, false, 'GOOD', 'TRACKED', 'NONE', 'MOVING_AVERAGE', false, true, 'PACKAGING', NULL, NULL),

  -- ── خدمات (أجور طحن وتعبئة) ────────────────────────────────────────────────
  ('SRV-MILL-BAG50',  'Milling Service 50kg Bag', 'أجرة طحن شوال 50 كجم',
   'أجرة طحن الشوال — تُحدَّد في أمر الطحن.', 'Wheat', 'piece',
   0, 1000, false, 'SERVICE', 'UNTRACKED', 'NONE', 'NONE', true, false, 'SERVICE', NULL, NULL),

  ('SRV-MILL-TON',    'Milling Service per Ton', 'أجرة طحن بالطن',
   'أجرة طحن بالطن المتري — تُحدَّد في أمر الطحن.', 'Wheat', 'piece',
   0, 0, false, 'SERVICE', 'UNTRACKED', 'NONE', 'NONE', true, false, 'SERVICE', NULL, NULL),

  ('SRV-CLEAN-TON',   'Cleaning & Sieving per Ton', 'أجرة تنظيف وفرز بالطن',
   'أجرة تنظيف وغربلة الشوائب بالطن.', 'Wheat', 'piece',
   0, 0, false, 'SERVICE', 'UNTRACKED', 'NONE', 'NONE', true, false, 'SERVICE', NULL, NULL),

  ('SRV-SEWING-BAG',  'Bagging & Sewing per Unit', 'أجرة تعبئة وحياكة للكيس',
   'أجرة تعبئة وحياكة كيس واحد.', 'Packaging Supplies', 'piece',
   0, 0, false, 'SERVICE', 'UNTRACKED', 'NONE', 'NONE', true, false, 'SERVICE', NULL, NULL),

  ('SRV-STORAGE-DAY', 'Storage per Day per Ton', 'رسوم تخزين أمانات',
   'رسوم تخزين الأمانات لليوم والطن.', 'Wheat', 'piece',
   0, 0, false, 'SERVICE', 'UNTRACKED', 'NONE', 'NONE', true, false, 'SERVICE', NULL, NULL)

) AS v(sku, name, name_ar, description, category, unit, cost, price, is_service,
       nature, policy, tracking, costing, sellable, purchasable, item_class, pkg, weight)
ON CONFLICT (sku) DO NOTHING;


-- ============================================================================
-- القسم 5 — درجات الحبوب
-- ============================================================================
-- درجة الحبوب تصف الحبوب التي يستقبلها المطحن كأمانات: نسبة الرطوبة القصوى،
-- ونسبة الشوائب، ووزن العبوة الافتراضي.
--
-- لماذا هي هنا لا في ملف النظام؟ لأن الجدول يحمل `product_id` — أي أن كل
-- درجة تشير إلى منتج حقيقي. فهي وصف لمنتجات منشأة بعينها، لا قاعدة عامة.

INSERT INTO public.milling_grain_grades (
  product_id, grade_code, grade_name_ar, origin,
  max_moisture, max_impurities, default_bag_size_kg, default_service_sku,
  is_active, default_bag_type
)
SELECT
  (SELECT id FROM public.products WHERE sku = v.sku),
  v.code, v.name_ar, v.origin,
  v.moisture, v.impurities, 50, 'SRV-MILL-BAG50',
  true, 'شوال خيش طبيعي 50 كجم'
FROM (VALUES
  ('RM-WHEAT-HARD',  'HARD_IMPORT', 'قمح صلب مستورد (درجة أولى)', 'IMPORTED', 14.00, 2.00),
  ('RM-WHEAT-LOCAL', 'LOCAL',       'قمح بلدي محلي',              'LOCAL',    14.00, 2.00),
  ('RM-WHEAT-SOFT',  'SOFT',        'قمح طري للمخبوزات',          'IMPORTED', 14.00, 1.50),
  ('RM-BARLEY',      'BARLEY',      'شعير حبوب خام',              'LOCAL',    14.00, 2.50),
  ('RM-CORN-YELLOW', 'CORN',        'ذرة صفراء خام',              'IMPORTED', 15.00, 3.00)
) AS v(sku, code, name_ar, origin, moisture, impurities)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- القسم 6 — المورّد والعملاء
-- ============================================================================
-- ── ملاحظة على البيانات ─────────────────────────────────────────────────────
--   النسخة السابقة كانت تحتوي:
--       عميل اسمه ضغط لوحة مفاتيح   ← بيانات اختبار تسرّبت إلى ملف عرض
--       عميل برصيد 14,500 بلا أي فاتورة تقابله  ← رصيد مُختلق
--       مورّد باسم شخص لا شركة        ← لا يصلح كمثال تجاري
--
--   الاستبدال: أسماء تجارية واقعية، وأرصدة **صفر**.
--   الرصيد غير الصفري يجب أن ينشأ من فاتورة حقيقية، لا يُكتب يدويًا في مثال.
--   من يحتاج أرصدة افتتاحية يستخدم دورة الأرصدة الافتتاحية في النظام.

INSERT INTO public.suppliers (name, phone, address, balance, is_active) VALUES
  ('مؤسسة الحبوب للتوريدات', '01-234567', 'سوق الحبوب', 0, true)
ON CONFLICT DO NOTHING;

INSERT INTO public.customers (name, phone, address, credit_limit, balance, is_active) VALUES
  ('مخابز الأمانة',        '777111222', 'الشارع العام', 500000, 0, true),
  ('تجارة النور للحبوب',   '777333444', 'سوق الجملة',   250000, 0, true)
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================================
-- التحقق بعد التشغيل
-- ============================================================================
-- شغّل هذه الاستعلامات للتأكد من أن البيانات نزلت صحيحة:
--
--   SELECT count(*) FROM public.products;            -- المتوقع: 19
--   SELECT count(*) FROM public.categories;          -- المتوقع: 12
--   SELECT count(*) FROM public.milling_grain_grades;-- المتوقع: 5
--   SELECT count(*) FROM public.customers;           -- المتوقع: 2
--   SELECT count(*) FROM public.warehouses;          -- المتوقع: 1
-- ============================================================================
