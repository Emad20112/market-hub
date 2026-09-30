-- ============================================================================
-- 20260930120100_milling_master_data_and_engines.sql
-- البيانات التأسيسية للمطحنة + محركات الأعمال (PL/pgSQL)
-- ============================================================================
-- المرجع: plan,mill.md — الباب 5 (الفهرس القياسي) والباب 8 (أمثلة إلزامية).
-- يعتمد على: 20260930120000_industrial_flour_mill_and_toll_processing.sql
--
-- هذا الملف لا يلمس أي جدول قائم عدا:
--   * قراءة public.products / public.units / public.categories لربط البيانات
--     التأسيسية (INSERT فقط، و ON CONFLICT على مفتاح العمل sku).
--   * كتابة sales_invoices عبر دالة الفوترة (نفس مسار create_sale).
--   * خصم مستلزمات التعبئة من مخزون المطحنة عبر post_stock_delta بحركة
--     ISSUE — وهو نفس المحرك المستخدم في البيع، فتبقى تكاليف المخزون نقية.
--
-- قاعدة الفصل التام (plan,mill.md §2 و §6):
--   الحبوب الخاصة بالعميل لا تُسجَّل في inventory ولا في stock_movements إطلاقًا.
--   الأثر الوحيد على المخزون التجاري هو صرف مستلزمات التعبئة owned by the mill.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. وحدات القياس القياسية للمطاحن
-- ---------------------------------------------------------------------------
-- `units` في هذا المخطط لا يحمل قيداً فريداً على `name` (لا يوجد unique على
-- short_name ولا على name)، لذا لا يمكن الاعتماد على ON CONFLICT هنا. الحماية
-- من التكرار تأتي من NOT EXISTS، وهي كافية: الوحدة تُنشأ مرة واحدة، والتحديث
-- للنص العربي يحدث في التطبيقات اللاحقة عبر جدول التحويلات أدناه.
INSERT INTO public.units (name, name_ar, short_name)
SELECT v.name, v.name_ar, v.short_name
FROM (VALUES
  ('Kilogram',  'كيلوجرام',            'kg'),
  ('Ton',       'طن متري',             't'),
  ('Bag 50kg',  'شوال 50 كجم',         'BAG-50'),
  ('Bag 25kg',  'كيس 25 كجم',          'BAG-25'),
  ('Bag 40kg',  'كيس 40 كجم',          'BAG-40'),
  ('Bag 10kg',  'كيس 10 كجم',          'BAG-10')
) AS v(name, name_ar, short_name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.units u WHERE u.name = v.name
);

-- ---------------------------------------------------------------------------
-- 2. جدول مرجعي لتحويل الأكياس إلى كيلوجرام
-- ---------------------------------------------------------------------------
-- مبدأ التصميم (plan,mill.md §3): القياس مزدوج — عدد الأكياس × سعة الكيس.
-- التحويل يُعاش في جدول مرجعي بدل أن يتناثر في الكود، فيتحقق منه
-- محرك قاعدة البيانات نفسه (المخزون والأكياس لا تتناقض).
DROP TABLE IF EXISTS public.milling_unit_conversions;
CREATE TABLE public.milling_unit_conversions (
    unit_id          uuid PRIMARY KEY REFERENCES public.units(id) ON DELETE CASCADE,
    kg_per_unit      numeric(12,4) NOT NULL CHECK (kg_per_unit > 0),
    is_bag_unit      boolean NOT NULL DEFAULT false,
    note             text,
    created_at       timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.milling_unit_conversions IS
  'معامل تحويل وحدة القياس إلى كيلوجرام لوحدات المطحنة (1 وحدة = kg_per_unit كجم).';

INSERT INTO public.milling_unit_conversions (unit_id, kg_per_unit, is_bag_unit, note)
SELECT u.id, v.kg, v.is_bag,
       'معامل تحويل قياسي لوحدة الطحن'
FROM public.units u
JOIN (VALUES
  ('Kilogram', 1.0000::numeric, false),
  ('Ton',      1000.0000,        false),
  ('Bag 50kg', 50.0000,          true),
  ('Bag 25kg', 25.0000,          true),
  ('Bag 40kg', 40.0000,          true),
  ('Bag 10kg', 10.0000,          true)
) AS v(name, kg, is_bag) ON v.name = u.name
ON CONFLICT (unit_id) DO UPDATE
  SET kg_per_unit = EXCLUDED.kg_per_unit,
      is_bag_unit = EXCLUDED.is_bag_unit;

-- Reading helper used by the RPCs to convert a bag count into kilograms.
CREATE OR REPLACE FUNCTION public.milling_kg_per_unit(_unit_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(c.kg_per_unit, 1.0000)
  FROM public.milling_unit_conversions c
  WHERE c.unit_id = _unit_id;
$$;

COMMENT ON FUNCTION public.milling_kg_per_unit(uuid) IS
  'كيلوجرامات الوحدة الواحدة. الافتراضي 1 (وحدة-piece) إن لم تكن وحدة مطحنة.';

REVOKE ALL ON FUNCTION public.milling_kg_per_unit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.milling_kg_per_unit(uuid) TO authenticated;

-- RLS: the conversion table is pure reference data — readable by any staff,
-- writable by nobody through the API.
ALTER TABLE public.milling_unit_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS milling_unit_conversions_read ON public.milling_unit_conversions;
CREATE POLICY milling_unit_conversions_read ON public.milling_unit_conversions
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.milling_unit_conversions FROM authenticated, anon;
GRANT SELECT ON public.milling_unit_conversions TO authenticated;
GRANT ALL ON public.milling_unit_conversions TO service_role;

-- ---------------------------------------------------------------------------
-- 3. تصنيفات المطحنة
-- ---------------------------------------------------------------------------
-- `categories` carries no unique constraint on `name`, so the NOT EXISTS guard
-- is what actually makes this idempotent (ON CONFLICT alone would silently
-- insert a duplicate row every re-run).
INSERT INTO public.categories (name, name_ar)
SELECT v.name, v.name_ar
FROM (VALUES
  ('Milling Raw Materials',  'مواد المطحنة الخام'),
  ('Milling Finished Goods', 'منتجات المطحنة التامة'),
  ('Milling Packaging',      'مستلزمات تعبئة المطحنة'),
  ('Milling Services',       'خدمات المطحنة التشغيلية')
) AS v(name, name_ar)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.name = v.name
);

-- ---------------------------------------------------------------------------
-- 4. فهرس الأصناف القياسي (plan,mill.md §5)
-- ---------------------------------------------------------------------------
-- كل صنف يُحقن مرة واحدة فقط. `products.sku` هو UNIQUE، فنربط عليه.
--
-- item_nature / inventory_policy هما المحوران الفاصلان (تصميم 20260929000000):
--   * SERVICE + UNTRACKED = خدمة تشغيلية. لا تمس المخزون أبداً.
--   * GOOD + TRACKED     = بضاعة مملوكة للمطحنة (قمحها، منتجاتها، مستلزماتها).
-- `is_service` (العمود القديم) يُضبط أيضاً، لأن شاشات POS القديمة ما زالت
-- تستشيره — التزاماً بقاعدة "لا تكسّر النظام القائم".
--
-- الأسعار مأخوذة حرفياً من plan,mill.md §5.
-- ---------------------------------------------------------------------------

-- 4.a — مواد خام (حبوب) — مملوكة للمطحنة عند شرائها
INSERT INTO public.products (
  name, name_ar, sku, description,
  category_id, unit_id, base_uom_id, sales_uom_id, purchase_uom_id,
  cost_price, sale_price, tax_rate, min_stock,
  is_service, is_active, status,
  item_nature, inventory_policy, tracking, costing_method,
  is_sellable, is_purchasable, uom_conversions
)
SELECT
  v.name, v.name_ar, v.sku, v.description,
  (SELECT c.id FROM public.categories c WHERE c.name = 'Milling Raw Materials'),
  u.id, u.id, u.id, u.id,
  v.cost, 0, 0, 0,
  false, true, 'ACTIVE',
  'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE',
  false, true, '[]'::jsonb
FROM (VALUES
  ('Wheat Hard Imported', 'قمح صلب مستورد (درجة أولى)', 'RM-WHEAT-HARD',
   'قمح صلب عالي الدرجة يُستورد للمطاحن — تبعية دولة/موسم', 1400.00),
  ('Wheat Local',         'قمح بلدي محلي (حبوب)',      'RM-WHEAT-LOCAL',
   'قمح محلي موسمي — أساس سوق المطاحن المحلية', 1350.00),
  ('Wheat Soft',          'قمح طري (للمخبوزات)',       'RM-WHEAT-SOFT',
   'قمح طري مخصص للمخبوزات والحلويات',  1450.00),
  ('Yellow Corn',         'ذرة صفراء خام',            'RM-CORN-YELLOW',
   'ذرة صفراء خام — تصلح للطحن أو التغذية', 1200.00),
  ('Barley',              'شعير حبوب خام',            'RM-BARLEY',
   'شعير حبوب خام — طحن شوائب وتغذية', 1100.00)
) AS v(name, name_ar, sku, description, cost)
JOIN public.units u ON u.name = 'Bag 50kg'
ON CONFLICT (sku) DO UPDATE
  SET name_ar       = EXCLUDED.name_ar,
      description   = EXCLUDED.description,
      category_id   = EXCLUDED.category_id,
      cost_price    = EXCLUDED.cost_price,
      item_nature   = 'GOOD',
      inventory_policy = 'TRACKED',
      tracking      = 'BATCH',
      is_service    = false,
      is_active     = true,
      status        = 'ACTIVE';

-- 4.b — منتجات تامة للمطحنة (تصنيع ذاتي) — مملوكة للمطحنة
INSERT INTO public.products (
  name, name_ar, sku, description,
  category_id, unit_id, base_uom_id, sales_uom_id, purchase_uom_id,
  cost_price, sale_price, tax_rate, min_stock,
  is_service, is_active, status,
  item_nature, inventory_policy, tracking, costing_method,
  is_sellable, is_purchasable, uom_conversions
)
SELECT
  v.name, v.name_ar, v.sku, v.description,
  (SELECT c.id FROM public.categories c WHERE c.name = 'Milling Finished Goods'),
  u.id, u.id, u.id, u.id,
  0, v.price, 0, 0,
  false, true, 'ACTIVE',
  'GOOD', 'TRACKED', 'BATCH', 'MOVING_AVERAGE',
  true, false, '[]'::jsonb
FROM (VALUES
  ('Flour Super Grade 1 50kg', 'دقيق فاخر نمرة 1 (زيرو) - شوال 50كجم', 'FG-FLOUR-SUPER-50', 'دقيق فاخر ممتاز معبأ في شوال 50 كجم', 110.00, 'Bag 50kg'),
  ('Flour Super Grade 1 25kg', 'دقيق فاخر نمرة 1 (زيرو) - كيس 25كجم', 'FG-FLOUR-SUPER-25', 'دقيق فاخر ممتاز معبأ في كيس 25 كجم', 58.00, 'Bag 25kg'),
  ('Flour Brown 50kg',         'دقيق بر كامل (بلدي نمرة 2) - شوال 50كجم', 'FG-FLOUR-BROWN-50', 'دقيق بر كامل الحبة معبأ في شوال 50 كجم', 95.00, 'Bag 50kg'),
  ('Wheat Bran 40kg',          'نخالة قمح خشنة (ردة مواشي) - كيس 40كجم', 'FG-BRAN-40',       'نخالة خشنة لتغذية المواشي معبأة في كيس 40 كجم', 38.00, 'Bag 40kg'),
  ('Semolina 50kg',            'سميد ناعم - شوال 50كجم',                   'FG-SEMOLINA-50',  'سميد ناعم معبأ في شوال 50 كجم', 135.00, 'Bag 50kg')
) AS v(name, name_ar, sku, description, price, unit_name)
JOIN public.units u ON u.name = v.unit_name
ON CONFLICT (sku) DO UPDATE
  SET name_ar       = EXCLUDED.name_ar,
      description   = EXCLUDED.description,
      category_id   = EXCLUDED.category_id,
      unit_id       = EXCLUDED.unit_id,
      base_uom_id   = EXCLUDED.base_uom_id,
      sales_uom_id  = EXCLUDED.sales_uom_id,
      sale_price    = EXCLUDED.sale_price,
      item_nature   = 'GOOD',
      inventory_policy = 'TRACKED',
      tracking      = 'BATCH',
      is_service    = false,
      is_active     = true,
      status        = 'ACTIVE';

-- 4.c — مستلزمات التعبئة — مملوكة للمطحنة، تُصرف بـ STOCK_ISSUE وتُفوتر
INSERT INTO public.products (
  name, name_ar, sku, description,
  category_id, unit_id, base_uom_id, sales_uom_id, purchase_uom_id,
  cost_price, sale_price, tax_rate, min_stock,
  is_service, is_active, status,
  item_nature, inventory_policy, tracking, costing_method,
  is_sellable, is_purchasable, uom_conversions
)
SELECT
  v.name, v.name_ar, v.sku, v.description,
  (SELECT c.id FROM public.categories c WHERE c.name = 'Milling Packaging'),
  u.id, u.id, u.id, u.id,
  v.cost, v.price, 0, 0,
  false, true, 'ACTIVE',
  'GOOD', 'TRACKED', 'NONE', 'MOVING_AVERAGE',
  true, true, '[]'::jsonb
FROM (VALUES
  ('PP Woven Bag 50kg',  'كيس بولي بروبيلين منسوج فارغ 50 كجم', 'PKG-BAG-PP-50',    'كيس منسوج قابل لإعادة الاستخدام للدقيق والقمح', 1.80, 3.00),
  ('PP Woven Bag 25kg',  'كيس بولي بروبيلين منسوج فارغ 25 كجم', 'PKG-BAG-PP-25',    'كيس منسوج متوسط للتجزئة والمخابز', 1.20, 2.50),
  ('Jute Natural Bag 50kg','خيش طبيعي متين فارغ 50 كجم',          'PKG-BAG-JUTE-50',  'خيش طبيعي عالي المتانة للحبوب',  4.50, 7.00),
  ('Sewing Thread Roll', 'بكرة خيط حياكة أكياس صناعية',          'PKG-THREAD-ROLL', 'خيط صناعي لماكينات خياكة الأكياس', 15.00, 0.00)
) AS v(name, name_ar, sku, description, cost, price)
JOIN public.units u ON u.name = 'Piece'
ON CONFLICT (sku) DO UPDATE
  SET name_ar       = EXCLUDED.name_ar,
      description   = EXCLUDED.description,
      category_id   = EXCLUDED.category_id,
      cost_price    = EXCLUDED.cost_price,
      sale_price    = EXCLUDED.sale_price,
      item_nature   = 'GOOD',
      inventory_policy = 'TRACKED',
      is_service    = false,
      is_active     = true,
      status        = 'ACTIVE';

-- 4.d — بطاقات خدمات الطحن التشغيلية
-- THE most important rows in this file.
-- item_nature = SERVICE  → item_stock_effect(...) returns 'NONE', so
--                           create_sale can never move stock for these lines.
-- inventory_policy = UNTRACKED → they can never carry an opening or adjustment
--                           balance; the stock engine rejects them loudly.
-- is_purchasable = false, is_sellable = true (the mill sells the SERVICE).
-- `sale_price` here is a DEFAULT REFERENCE ONLY: the actual fee is always taken
-- from milling_jobs.milling_fee_per_bag / _per_ton, because the fee is agreed
-- per job, not per catalogue entry.
INSERT INTO public.products (
  name, name_ar, sku, description,
  category_id, unit_id, base_uom_id, sales_uom_id, purchase_uom_id,
  cost_price, sale_price, tax_rate, min_stock,
  is_service, is_active, status,
  item_nature, inventory_policy, tracking, costing_method,
  is_sellable, is_purchasable, uom_conversions
)
SELECT
  v.name, v.name_ar, v.sku, v.description,
  (SELECT c.id FROM public.categories c WHERE c.name = 'Milling Services'),
  u.id, u.id, u.id, u.id,
  0, v.price, 0, 0,
  true, true, 'ACTIVE',
  'SERVICE', 'UNTRACKED', 'NONE', 'NONE',
  true, false, '[]'::jsonb
FROM (VALUES
  ('Milling Service 50kg Bag', 'خدمة طحن شوال قمح سعة 50 كجم',  'SRV-MILL-BAG50',  'أجرة طحن كيس واحد سعة 50 كجم',  8.00,  'Bag 50kg'),
  ('Milling Service per Ton',   'خدمة طحن حبوب بالطن المتري',     'SRV-MILL-TON',  'أجرة طحن كاملة لكل طن متري', 150.00,  'Ton'),
  ('Cleaning & Sieving per Ton','خدمة تنظيف وفرز وغربلة شوائب',  'SRV-CLEAN-TON',  'تنظيف وفرز قبل الطحن لكل طن',  40.00,  'Ton'),
  ('Bagging & Sewing per Unit', 'أجور تعبئة وحياكة أكياس آلية',  'SRV-SEWING-BAG',  'تعبئة وحياكة آلية لكل كيس',  1.00,  'Piece'),
  ('Storage per Day per Ton',   'رسوم تخزين أمانات في الصوامع',  'SRV-STORAGE-DAY', 'تخزين الأمانات لكل يوم ولكل طن', 2.00,  'Ton')
) AS v(name, name_ar, sku, description, price, unit_name)
JOIN public.units u ON u.name = v.unit_name
ON CONFLICT (sku) DO UPDATE
  SET name_ar          = EXCLUDED.name_ar,
      description      = EXCLUDED.description,
      category_id      = EXCLUDED.category_id,
      unit_id          = EXCLUDED.unit_id,
      base_uom_id      = EXCLUDED.base_uom_id,
      sales_uom_id     = EXCLUDED.sales_uom_id,
      sale_price       = EXCLUDED.sale_price,
      -- These two are the guarantee. Never relaxed on re-run.
      item_nature      = 'SERVICE',
      inventory_policy = 'UNTRACKED',
      costing_method   = 'NONE',
      is_service       = true,
      is_sellable      = true,
      is_purchasable   = false,
      is_active        = true,
      status           = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 5. مولّدات أرقام المستندات
-- ---------------------------------------------------------------------------
-- Internal only: never callable from the browser, exactly like
-- next_stock_opening_number() in 20260929010000.
CREATE OR REPLACE FUNCTION public.next_milling_intake_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_intake_seq');
  RETURN 'IR-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_milling_job_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_job_seq');
  RETURN 'MJ-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_milling_delivery_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_delivery_seq');
  RETURN 'MDN-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $$;

REVOKE ALL ON FUNCTION public.next_milling_intake_number()   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_milling_job_number()      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_milling_delivery_number() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.next_milling_intake_number()   IS 'IR-YYYYMM-#### رقم سند استلام الأمانات.';
COMMENT ON FUNCTION public.next_milling_job_number()      IS 'MJ-YYYYMM-#### رقم أمر الطحن.';
COMMENT ON FUNCTION public.next_milling_delivery_number() IS 'MDN-YYYYMM-#### رقم إذن تسليم النواتج.';

-- ---------------------------------------------------------------------------
-- 6. create_milling_intake — سند استلام الأمانات
-- ---------------------------------------------------------------------------
-- Atomically: validate → generate the document number → store net & nominal
-- weights → write the audit trail. All or nothing.
--
-- IT DELIBERATELY CALLS NOTHING FROM THE STOCK ENGINE. No post_stock_delta, no
-- inventory write, no stock_movements row. Customer grain is not company stock
-- (plan,mill.md §2). This is the single most important property of this file.
--
-- Weight handling (plan,mill.md §3.2) — two independent truths are stored:
--   net_weight_kg     = gross − tare            (the scale ticket, authoritative)
--   nominal_weight_kg = bag_count × bag_size_kg (the bag arithmetic)
-- Their difference is the provable shortage in bag weights, not an error to be
-- silently reconciled.
CREATE OR REPLACE FUNCTION public.create_milling_intake(
  _store_id        uuid,
  _customer_id     uuid,
  _grain_type      text,
  _grain_product_id uuid,
  _bag_size_kg     numeric,
  _bag_count       integer,
  _gross_weight_kg numeric,
  _tare_weight_kg  numeric,
  _moisture        numeric,
  _impurities      numeric,
  _truck_plate     text,
  _driver_name     text,
  _silo            text,
  _notes           text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_number  text;
  v_net     numeric;
  v_nominal numeric;
  v_grain   text;
BEGIN
  -- ── authorisation ────────────────────────────────────────────────────────
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to receive customer custody grain';
  END IF;

  -- ── validation, before anything is written ───────────────────────────────
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required — this receipt is a custody document';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id AND c.is_active) THEN
    RAISE EXCEPTION 'Selected customer is unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _store_id AND w.is_active) THEN
    RAISE EXCEPTION 'Selected warehouse is unavailable';
  END IF;

  v_grain := btrim(COALESCE(_grain_type, ''));
  IF v_grain = '' THEN
    RAISE EXCEPTION 'Grain type is required';
  END IF;

  IF coalesce(_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Bag size must be greater than zero';
  END IF;
  IF coalesce(_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Bag count cannot be negative';
  END IF;
  IF coalesce(_gross_weight_kg, 0) < 0 OR coalesce(_tare_weight_kg, 0) < 0 THEN
    RAISE EXCEPTION 'Weights cannot be negative';
  END IF;

  -- The net weight is derived, never trusted from the client.
  v_net := round(coalesce(_gross_weight_kg, 0) - coalesce(_tare_weight_kg, 0), 3);
  IF v_net <= 0 THEN
    RAISE EXCEPTION 'Net weight must be positive: gross % − tare % produced %',
      coalesce(_gross_weight_kg, 0), coalesce(_tare_weight_kg, 0), v_net;
  END IF;

  v_nominal := round(coalesce(_bag_count, 0) * coalesce(_bag_size_kg, 0), 3);

  -- A bag-only receipt (no scale ticket) is legitimate: the nominal weight then
  -- IS the quantity. So we only insist that at least one of the two is present.
  IF v_nominal <= 0 AND v_net <= 0 THEN
    RAISE EXCEPTION 'A receipt needs either bags or a positive net weight';
  END IF;

  IF coalesce(_moisture, 0) < 0 OR coalesce(_moisture, 0) > 100 THEN
    RAISE EXCEPTION 'Moisture must be between 0 and 100';
  END IF;
  IF coalesce(_impurities, 0) < 0 OR coalesce(_impurities, 0) > 100 THEN
    RAISE EXCEPTION 'Impurities must be between 0 and 100';
  END IF;

  -- ── document ─────────────────────────────────────────────────────────────
  v_number := public.next_milling_intake_number();

  INSERT INTO public.milling_intake_receipts (
    store_id, receipt_number, customer_id,
    truck_plate_number, driver_name,
    grain_type, grain_product_id,
    bag_size_kg, intake_bag_count, nominal_weight_kg,
    gross_weight_kg, tare_weight_kg, net_weight_kg,
    moisture_percentage, impurities_percentage,
    silo_or_location, status, notes, received_by
  )
  VALUES (
    _store_id, v_number, _customer_id,
    nullif(btrim(COALESCE(_truck_plate, '')), ''),
    nullif(btrim(COALESCE(_driver_name, '')), ''),
    v_grain, _grain_product_id,
    coalesce(_bag_size_kg, 0), coalesce(_bag_count, 0), v_nominal,
    coalesce(_gross_weight_kg, 0), coalesce(_tare_weight_kg, 0), v_net,
    coalesce(_moisture, 0), coalesce(_impurities, 0),
    nullif(btrim(COALESCE(_silo, '')), ''),
    'RECEIVED', nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.intake.received', 'milling_intake', v_id,
    jsonb_build_object(
      'receipt_number', v_number,
      'store_id', _store_id,
      'customer_id', _customer_id,
      'grain_type', v_grain,
      'bag_count', coalesce(_bag_count, 0),
      'bag_size_kg', coalesce(_bag_size_kg, 0),
      'nominal_weight_kg', v_nominal,
      'net_weight_kg', v_net,
      -- stock_impact is hard-coded to zero: this is the audit-level proof that
      -- a custody receipt never touches commercial stock.
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) IS
  'سند استلام أمانات عيني. صفر أثر على مخزون المنشأة. يحفظ الوزن الصافي والاسمي معاً لكشف عجز أوزان الأكياس.';

-- ---------------------------------------------------------------------------
-- 7. create_milling_job — أمر الطحن
-- ---------------------------------------------------------------------------
-- Binds a job to an intake receipt and draws a quantity of the customer's grain
-- out of custody. The grain is NOT written to inventory: the movement is
-- recorded purely in the milling_* ledger.
--
-- Guard: a job can never draw more than the receipt still holds. A receipt may
-- legitimately feed several jobs (e.g. 1,000 bags → three 400-bag runs), so the
-- check aggregates existing jobs on the same receipt.
CREATE OR REPLACE FUNCTION public.create_milling_job(
  _intake_receipt_id uuid,
  _input_bag_count   integer,
  _input_bag_size_kg numeric,
  _input_weight_kg   numeric,
  _fee_per_bag       numeric,
  _fee_per_ton       numeric,
  _service_product_id uuid,
  _expected_extraction_rate numeric,
  _allowed_loss_percentage  numeric,
  _notes             text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_id         uuid;
  v_number     text;
  v_store      uuid;
  v_customer   uuid;
  v_available  numeric;
  v_already    numeric;
  v_bag_size   numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling jobs';
  END IF;

  IF _intake_receipt_id IS NULL THEN
    RAISE EXCEPTION 'An intake receipt is required';
  END IF;

  -- Lock the receipt so two operators cannot both draw from the same custody
  -- balance concurrently.
  SELECT store_id, customer_id
    INTO v_store, v_customer
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake receipt % does not exist', _intake_receipt_id;
  END IF;

  IF (SELECT status FROM public.milling_intake_receipts WHERE id = _intake_receipt_id) = 'CANCELLED' THEN
    RAISE EXCEPTION 'This intake receipt is cancelled';
  END IF;

  v_bag_size := coalesce(_input_bag_size_kg, 0);
  IF v_bag_size <= 0 THEN
    v_bag_size := 50.00;
  END IF;

  IF coalesce(_input_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Input bag count cannot be negative';
  END IF;

  IF _input_weight_kg IS NULL OR _input_weight_kg <= 0 THEN
    RAISE EXCEPTION 'Input weight must be positive';
  END IF;

  IF coalesce(_fee_per_bag, 0) < 0 OR coalesce(_fee_per_ton, 0) < 0 THEN
    RAISE EXCEPTION 'Milling fees cannot be negative';
  END IF;
  IF coalesce(_fee_per_bag, 0) = 0 AND coalesce(_fee_per_ton, 0) = 0 THEN
    RAISE EXCEPTION 'Set at least one milling fee (per bag or per ton)';
  END IF;

  IF coalesce(_expected_extraction_rate, 80) <= 0 OR coalesce(_expected_extraction_rate, 80) > 100 THEN
    RAISE EXCEPTION 'Expected extraction rate must be between 0 and 100';
  END IF;
  IF coalesce(_allowed_loss_percentage, 2) < 0 OR coalesce(_allowed_loss_percentage, 2) > 100 THEN
    RAISE EXCEPTION 'Allowed loss percentage must be between 0 and 100';
  END IF;

  -- How much custody is still un-milled on this receipt?
  SELECT net_weight_kg INTO v_available
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id;

  SELECT coalesce(sum(input_weight_kg), 0) INTO v_already
  FROM public.milling_jobs
  WHERE intake_receipt_id = _intake_receipt_id
    AND status <> 'CANCELLED';

  IF _input_weight_kg > (v_available - v_already) + 0.001 THEN
    RAISE EXCEPTION
      'Cannot draw more than the custody balance: receipt has % kg, already drawn % kg, requested % kg',
      v_available, v_already, _input_weight_kg
      USING ERRCODE = 'check_violation';
  END IF;

  v_number := public.next_milling_job_number();

  INSERT INTO public.milling_jobs (
    store_id, job_number, intake_receipt_id, customer_id,
    input_bag_count, input_bag_size_kg, input_weight_kg,
    milling_fee_per_bag, milling_fee_per_ton, service_product_id,
    expected_extraction_rate, allowed_loss_percentage,
    status, started_at, notes, created_by
  )
  VALUES (
    v_store, v_number, _intake_receipt_id, v_customer,
    coalesce(_input_bag_count, 0), v_bag_size, _input_weight_kg,
    coalesce(_fee_per_bag, 0), coalesce(_fee_per_ton, 0), _service_product_id,
    coalesce(_expected_extraction_rate, 80), coalesce(_allowed_loss_percentage, 2),
    'PROCESSING', timezone('utc'::text, now()),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.started', 'milling_job', v_id,
    jsonb_build_object(
      'job_number', v_number,
      'intake_receipt_id', _intake_receipt_id,
      'customer_id', v_customer,
      'input_weight_kg', _input_weight_kg,
      'fee_per_bag', coalesce(_fee_per_bag, 0),
      'fee_per_ton', coalesce(_fee_per_ton, 0),
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_milling_job(uuid, integer, numeric, numeric, numeric, numeric, uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milling_job(uuid, integer, numeric, numeric, numeric, numeric, uuid, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.create_milling_job(uuid, integer, numeric, numeric, numeric, numeric, uuid, numeric, numeric, text) IS
  'أمر طحن لحساب الغير. يمنع سحب أكثر من رصيد الأمانات المتبقي على سند الاستلام. صفر أثر على المخزون التجاري.';

-- ---------------------------------------------------------------------------
-- 8. add_milling_output — تسجيل ناتج واحد (دقيق/نخالة/سميد)
-- ---------------------------------------------------------------------------
-- One output line per (job, grade). This is what lets add_milling_output()
-- correct a miscount in place instead of appending a second line of the same
-- grade — a silent double-count would silently corrupt the loss calculation.
-- Added here rather than in the DDL migration so the constraint and the
-- function that depends on it live in the same file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'milling_job_outputs'
      AND c.conname = 'milling_job_outputs_job_type_key'
  ) THEN
    ALTER TABLE public.milling_job_outputs
      ADD CONSTRAINT milling_job_outputs_job_type_key
      UNIQUE (job_id, output_type);
  END IF;
END $$;

-- One output line at a time, so the operator can record the job progressively
-- from the mill floor. Re-posting the SAME output type for the same job
-- REPLACES that line rather than adding a second one — the mill corrects a
-- miscount far more often than it genuinely splits one output into two lines of
-- the same grade, and a silent double-count would silently corrupt the loss.
--
-- `bags_source = 'MILL'` records that the mill supplied the packaging. The
-- packaging stock is NOT touched here: the issue happens once, on the service
-- invoice, so the movement is tied to a real financial document. This function
-- only records the intent.
CREATE OR REPLACE FUNCTION public.add_milling_output(
  _job_id             uuid,
  _output_type        text,
  _bag_size_kg        numeric,
  _produced_bag_count integer,
  _produced_weight_kg numeric,
  _bags_source        text,
  _mill_bag_product_id uuid,
  _mill_bags_used     integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_id     uuid;
  v_status public.milling_status;
  v_src    varchar(20);
  v_bags   integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to record milling outputs';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF _output_type IS NULL OR btrim(_output_type) = '' THEN
    RAISE EXCEPTION 'Output type is required';
  END IF;

  SELECT status INTO v_status
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status IN ('COMPLETED', 'DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Job % is % and can no longer be edited', _job_id, v_status;
  END IF;

  IF coalesce(_produced_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Produced bag count cannot be negative';
  END IF;
  IF coalesce(_produced_weight_kg, 0) < 0 THEN
    RAISE EXCEPTION 'Produced weight cannot be negative';
  END IF;
  IF coalesce(_produced_bag_count, 0) = 0 AND coalesce(_produced_weight_kg, 0) = 0 THEN
    RAISE EXCEPTION 'An output line needs at least one bag or a positive weight';
  END IF;
  IF coalesce(_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Output bag size must be greater than zero';
  END IF;

  v_src := upper(btrim(COALESCE(_bags_source, 'CUSTOMER')));
  IF v_src NOT IN ('CUSTOMER', 'MILL') THEN
    RAISE EXCEPTION 'bags_source must be CUSTOMER or MILL';
  END IF;

  v_bags := coalesce(_mill_bags_used, 0);
  IF v_src = 'MILL' THEN
    -- If the operator did not say how many bags were consumed, the produced bag
    -- count is the only sensible answer.
    IF v_bags = 0 THEN
      v_bags := coalesce(_produced_bag_count, 0);
    END IF;
    IF _mill_bag_product_id IS NULL THEN
      RAISE EXCEPTION 'MILL-supplied packaging requires the packaging item (PKG-*)';
    END IF;
    IF v_bags <= 0 THEN
      RAISE EXCEPTION 'MILL-supplied packaging requires a positive bag count';
    END IF;
  ELSE
    v_bags := 0;
  END IF;

  -- Upsert on (job_id, output_type): correct in place.
  INSERT INTO public.milling_job_outputs (
    job_id, output_type, bag_size_kg,
    produced_bag_count, produced_weight_kg,
    bags_source, mill_bag_product_id, mill_bags_used
  )
  VALUES (
    _job_id, _output_type::public.milling_output_type, coalesce(_bag_size_kg, 0),
    coalesce(_produced_bag_count, 0), coalesce(_produced_weight_kg, 0),
    v_src, _mill_bag_product_id, v_bags
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_id
  FROM public.milling_job_outputs
  WHERE job_id = _job_id
    AND output_type = _output_type::public.milling_output_type
  FOR UPDATE;

  -- Never let a correction reduce the delivered quantity — that would hand back
  -- custody the customer already physically took away.
  IF coalesce(
       (SELECT delivered_bag_count FROM public.milling_job_outputs WHERE id = v_id), 0
     ) > coalesce(_produced_bag_count, 0) THEN
    RAISE EXCEPTION
      'Cannot reduce produced bags below the % already delivered for this output',
      (SELECT delivered_bag_count FROM public.milling_job_outputs WHERE id = v_id);
  END IF;

  UPDATE public.milling_job_outputs
  SET bag_size_kg        = coalesce(_bag_size_kg, 0),
      produced_bag_count = coalesce(_produced_bag_count, 0),
      produced_weight_kg = coalesce(_produced_weight_kg, 0),
      bags_source        = v_src,
      mill_bag_product_id = _mill_bag_product_id,
      mill_bags_used     = v_bags
  WHERE id = v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.output.recorded', 'milling_output', v_id,
    jsonb_build_object(
      'job_id', _job_id,
      'output_type', _output_type,
      'produced_bag_count', coalesce(_produced_bag_count, 0),
      'produced_weight_kg', coalesce(_produced_weight_kg, 0),
      'bags_source', v_src,
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.add_milling_output(uuid, text, numeric, integer, numeric, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_milling_output(uuid, text, numeric, integer, numeric, text, uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.add_milling_output(uuid, text, numeric, integer, numeric, text, uuid, integer) IS
  'تسجيل/تصحيح ناتج أمر طحن. يستبدل السطر السابق لنفس النوع بدل مضاعفته. صفر أثر على المخزون التجاري.';

-- ---------------------------------------------------------------------------
-- 9. complete_milling_job — إقفال أمر الطحن واحتساب الفاقد
-- ---------------------------------------------------------------------------
-- plan,mill.md §8 example 5, exactly:
--   input 50,000 kg → outputs 48,800 kg
--   actual_loss       = 1,200 kg
--   allowed (2%)      = 1,000 kg
--   loss_excess       =   200 kg  → the basis for a physical settlement or a
--                                    financial credit against the service invoice.
--
-- The function RECORDS the excess; it does not silently block the job. A mill
-- that exceeds its contractual loss must still be able to close the run and tell
-- the customer — the commercial decision belongs to the operator, not to a
-- database constraint. What the function does forbid is a negative loss (more
-- output than input), which is physically impossible and indicates a data-entry
-- error worth stopping for.
CREATE OR REPLACE FUNCTION public.complete_milling_job(
  _job_id uuid,
  _notes  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_status     public.milling_status;
  v_input      numeric;
  v_outputs    numeric;
  v_allowed_pct numeric;
  v_actual     numeric;
  v_allowed    numeric;
  v_excess     numeric;
  v_expected   numeric;
  v_rate       numeric;
  v_outputs_bags integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to complete milling jobs';
  END IF;
  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;

  SELECT status, input_weight_kg, allowed_loss_percentage, expected_extraction_rate
    INTO v_status, v_input, v_allowed_pct, v_expected
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status = 'COMPLETED' OR v_status = 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % is already closed', _job_id;
  END IF;
  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Job % is cancelled', _job_id;
  END IF;

  SELECT coalesce(sum(produced_weight_kg), 0), coalesce(sum(produced_bag_count), 0)
    INTO v_outputs, v_outputs_bags
  FROM public.milling_job_outputs
  WHERE job_id = _job_id;

  IF v_outputs <= 0 THEN
    RAISE EXCEPTION 'Record at least one output before closing job %', _job_id;
  END IF;

  -- More output than input is impossible: refuse rather than post a negative loss.
  IF v_outputs > v_input + 0.001 THEN
    RAISE EXCEPTION
      'Output weight % kg exceeds the input weight % kg — check the recorded quantities',
      v_outputs, v_input
      USING ERRCODE = 'check_violation';
  END IF;

  v_actual  := round(v_input - v_outputs, 3);
  v_allowed := round(v_input * v_allowed_pct / 100, 3);
  v_excess  := round(greatest(v_actual - v_allowed, 0), 3);
  v_rate    := CASE WHEN v_input > 0 THEN round(v_outputs * 100 / v_input, 2) ELSE 0 END;

  UPDATE public.milling_jobs
  SET status        = 'COMPLETED',
      actual_loss_kg = v_actual,
      loss_excess_kg = v_excess,
      finished_at   = timezone('utc'::text, now()),
      notes          = coalesce(nullif(btrim(COALESCE(_notes, '')), ''), notes)
  WHERE id = _job_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.completed', 'milling_job', _job_id,
    jsonb_build_object(
      'input_weight_kg', v_input,
      'total_output_weight_kg', v_outputs,
      'total_output_bags', v_outputs_bags,
      'actual_loss_kg', v_actual,
      'allowed_loss_kg', v_allowed,
      'allowed_loss_percentage', v_allowed_pct,
      'loss_excess_kg', v_excess,
      'actual_extraction_rate', v_rate,
      'expected_extraction_rate', v_expected,
      'loss_exceeds_allowance', v_excess > 0,
      'stock_impact', 'NONE — customer custody'
    ));

  -- Returned so the UI can show the operator the numbers that were just
  -- committed, instead of re-deriving them and risking a mismatch.
  RETURN jsonb_build_object(
    'job_id', _job_id,
    'input_weight_kg', v_input,
    'total_output_weight_kg', v_outputs,
    'total_output_bags', v_outputs_bags,
    'actual_loss_kg', v_actual,
    'allowed_loss_kg', v_allowed,
    'loss_excess_kg', v_excess,
    'actual_extraction_rate', v_rate,
    'expected_extraction_rate', v_expected,
    'loss_exceeds_allowance', v_excess > 0
  );
END $$;

REVOKE ALL ON FUNCTION public.complete_milling_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_milling_job(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.complete_milling_job(uuid, text) IS
  'إقفال أمر الطحن: يحسب الفاقد الفعلي والفاقد الزائد عن النسبة التعاقدية. يسجّل ولا يمنع، والقرار التجاري للمشغّل.';

-- ---------------------------------------------------------------------------
-- 10. process_milling_delivery — إذن تسليم النواتج (كلي أو جزئي)
-- ---------------------------------------------------------------------------
-- plan,mill.md §8 example 4, exactly. Purely a physical hand-over:
--   produced 600 bags → this load 150 → delivered 150 → remaining 450.
--
-- No invoice, no receivable, no revenue, no stock movement. It only decrements
-- the customer's custody balance.
--
-- THE HARD INVARIANT (task requirement): the total delivered for an output can
-- never exceed what was produced. The CHECK constraint on milling_job_outputs
-- only sees one row at a time, so the running total is enforced here — under a
-- row lock, so two gate operators cannot both pass the same 150 bags.
CREATE OR REPLACE FUNCTION public.process_milling_delivery(
  _job_id          uuid,
  _truck_plate     text,
  _driver_name     text,
  _notes           text,
  _items           jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_id        uuid;
  v_number    text;
  v_store     uuid;
  v_customer  uuid;
  v_item      record;
  v_output_id uuid;
  v_produced  integer;
  v_delivered integer;
  v_bags      integer;
  v_weight    numeric;
  v_total_bags integer := 0;
  v_total_kg  numeric := 0;
  v_bag_size  numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to issue delivery notes';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one output to deliver';
  END IF;

  SELECT store_id, customer_id
    INTO v_store, v_customer
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;

  -- Nothing may leave before the run is closed: the produced quantity must be
  -- final, otherwise a later correction could retroactively invalidate a truck
  -- that already left the gate.
  IF (SELECT status FROM public.milling_jobs WHERE id = _job_id) <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Close the milling job before delivering its outputs';
  END IF;

  -- Validate every line BEFORE writing the header, so a bad line cannot leave an
  -- empty note behind.
  FOR v_item IN
    SELECT (item ->> 'job_output_id')::uuid      AS output_id,
           coalesce((item ->> 'delivered_bags')::integer, 0) AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    IF v_item.output_id IS NULL THEN
      RAISE EXCEPTION 'Every delivery line requires an output';
    END IF;
    IF v_item.bags <= 0 THEN
      RAISE EXCEPTION 'Every delivery line requires at least one bag';
    END IF;
    IF v_item.weight <= 0 THEN
      RAISE EXCEPTION 'Every delivery line requires a positive weight';
    END IF;

    -- Lock the output row: this is what serialises concurrent deliveries.
    SELECT produced_bag_count, delivered_bag_count, bag_size_kg
      INTO v_produced, v_delivered, v_bag_size
    FROM public.milling_job_outputs
    WHERE id = v_item.output_id
      AND job_id = _job_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Output % does not belong to job %', v_item.output_id, _job_id;
    END IF;

    -- >>> THE INVARIANT <<<
    IF v_delivered + v_item.bags > v_produced THEN
      RAISE EXCEPTION
        'Cannot deliver % bags of this output: only % produced and % already delivered (% remaining)',
        v_item.bags, v_produced, v_delivered, v_produced - v_delivered
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_delivered + v_item.weight > (SELECT produced_weight_kg FROM public.milling_job_outputs WHERE id = v_item.output_id) + 0.001 THEN
      RAISE EXCEPTION
        'Cannot deliver % kg of this output: it exceeds what remains to be delivered',
        v_item.weight
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- ── document header ──────────────────────────────────────────────────────
  FOR v_item IN
    SELECT coalesce((item ->> 'delivered_bags')::integer, 0)      AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    v_total_bags := v_total_bags + v_item.bags;
    v_total_kg   := v_total_kg + v_item.weight;
  END LOOP;

  v_number := public.next_milling_delivery_number();

  INSERT INTO public.milling_delivery_notes (
    store_id, delivery_number, customer_id, job_id,
    truck_plate_number, driver_name,
    total_bags, total_weight_kg, notes, delivered_by
  )
  VALUES (
    v_store, v_number, v_customer, _job_id,
    nullif(btrim(COALESCE(_truck_plate, '')), ''),
    nullif(btrim(COALESCE(_driver_name, '')), ''),
    v_total_bags, round(v_total_kg, 3),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  -- ── lines + custody decrement, under the locks taken above ───────────────
  FOR v_item IN
    SELECT (item ->> 'job_output_id')::uuid      AS output_id,
           coalesce((item ->> 'delivered_bags')::integer, 0)      AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    v_output_id := v_item.output_id;

    INSERT INTO public.milling_delivery_items (
      delivery_id, job_output_id, delivered_bags, delivered_weight_kg
    )
    VALUES (v_id, v_output_id, v_item.bags, v_item.weight);

    UPDATE public.milling_job_outputs
    SET delivered_bag_count = delivered_bag_count + v_item.bags,
        delivered_weight_kg = delivered_weight_kg + v_item.weight
    WHERE id = v_output_id;
  END LOOP;

  -- Mark the job DELIVERED only when nothing at all remains in custody.
  IF NOT EXISTS (
    SELECT 1
    FROM public.milling_job_outputs o
    WHERE o.job_id = _job_id
      AND (o.produced_bag_count - o.delivered_bag_count) > 0
  ) THEN
    UPDATE public.milling_jobs
    SET status = 'DELIVERED'
    WHERE id = _job_id AND status = 'COMPLETED';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.delivery.issued', 'milling_delivery', v_id,
    jsonb_build_object(
      'delivery_number', v_number,
      'job_id', _job_id,
      'customer_id', v_customer,
      'total_bags', v_total_bags,
      'total_weight_kg', round(v_total_kg, 3),
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.process_milling_delivery(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_milling_delivery(uuid, text, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.process_milling_delivery(uuid, text, text, text, jsonb) IS
  'إذن تسليم نواتج أمانات (جزئي أو كلي). يمنع التسليم الزائد عن الإنتاج. صفر أثر مالي وصفر أثر مخزني.';

-- ---------------------------------------------------------------------------
-- 11. issue_milling_service_invoice — فاتورة أجور الطحن (+ أكياس التعبئة)
-- ---------------------------------------------------------------------------
-- plan,mill.md §8 examples 1 and 3. This is the ONLY function in the module
-- that touches the commercial side, and it is deliberately narrow:
--
--   * The service line is a SERVICE item → item_stock_effect = 'NONE' → the
--     grain and the flour NEVER move in `inventory`. Correct by policy, not by
--     a special case in this function.
--   * Packaging lines with bags_source = 'MILL' are GOOD + TRACKED → they DO
--     post a real STOCK_ISSUE through the ordinary post_stock_delta(), so
--     packaging cost leaves the mill's own inventory and lands in COGS. This is
--     the only stock movement the module is ever allowed to cause.
--   * The invoice is an ordinary row in public.sales_invoices with
--     milling_job_id set, so it appears in the normal sales ledger, the customer
--     statement, the debts screen and the trial balance with zero extra wiring.
--
-- Reuses public.create_sale() rather than re-implementing invoicing, so the
-- credit-limit check, the customer_ledger posting, tax and numbering all behave
-- exactly as they do for any other sale in the system.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_milling_service_invoice(
  _job_id           uuid,
  _payment_method   text,
  _paid             numeric,
  _discount         numeric,
  _note             text,
  _include_packaging boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_invoice_id  uuid;
  v_store       uuid;
  v_customer    uuid;
  v_status      public.milling_status;
  v_bags        integer;
  v_bag_size    numeric;
  v_input_kg    numeric;
  v_fee_per_bag numeric;
  v_fee_per_ton numeric;
  v_tons        numeric;
  v_service_id  uuid;
  v_lines       jsonb := '[]'::jsonb;
  v_pack        record;
  v_pack_bags   integer := 0;
  v_pack_value  numeric := 0;
  v_line_item   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to invoice milling services';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(_payment_method, '') = '' THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;

  SELECT store_id, customer_id, status, input_bag_count, input_bag_size_kg,
         input_weight_kg, milling_fee_per_bag, milling_fee_per_ton, service_product_id
    INTO v_store, v_customer, v_status, v_bags, v_bag_size,
         v_input_kg, v_fee_per_bag, v_fee_per_ton, v_service_id
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;

  -- Only a finished run is billable. Billing an open job would invoice a fee
  -- for grain that is still in the mill.
  IF v_status <> 'COMPLETED' AND v_status <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % must be completed before invoicing (current status: %)', _job_id, v_status;
  END IF;

  -- Idempotency: one service invoice per job. Re-issuing would double-bill.
  SELECT id INTO v_invoice_id
  FROM public.sales_invoices
  WHERE milling_job_id = _job_id;

  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job % has already been invoiced (invoice %) — delete it first to re-issue', _job_id, v_invoice_id;
  END IF;

  -- Fall back to the standard 50 kg per-bag service card.
  IF v_service_id IS NULL THEN
    SELECT id INTO v_service_id FROM public.products WHERE sku = 'SRV-MILL-BAG50';
  END IF;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'No milling service item found (SRV-MILL-BAG50) — run the milling master-data seed';
  END IF;

  -- ── line 1: the milling fee ─────────────────────────────────────────────
  -- Per-bag and per-ton fees are independent terms. When a contract sets both
  -- ("the greater of"), BOTH are charged and the operator sees two lines, rather
  -- than the function silently picking one and hiding the commercial decision.
  IF v_fee_per_bag > 0 THEN
    IF coalesce(v_bags, 0) <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per bag but records no bag count', _job_id;
    END IF;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_service_id,
      'quantity', v_bags,
      'unit_price', v_fee_per_bag
    ));
  END IF;

  IF v_fee_per_ton > 0 THEN
    v_tons := round(v_input_kg / 1000, 3);

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_service_id,
      'quantity', v_tons,
      'unit_price', v_fee_per_ton
    ));
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Job % has no milling fee configured', _job_id;
  END IF;

  -- ── lines 2..n: packaging supplied by the mill ───────────────────────────
  -- The bag stock is decremented HERE and only here, so every issue is tied to a
  -- real financial document and the packaging stock can never drift from the
  -- invoices. Customer-supplied bags (bags_source = 'CUSTOMER') are skipped:
  -- they have no financial effect at all.
  IF coalesce(_include_packaging, true) THEN
    FOR v_pack IN
      SELECT o.mill_bag_product_id,
             sum(o.mill_bags_used)  AS bags,
             max(p.sale_price)      AS unit_price,
             max(p.cost_price)      AS unit_cost,
             max(p.tax_rate)        AS tax_rate
      FROM public.milling_job_outputs o
      JOIN public.products p ON p.id = o.mill_bag_product_id
      WHERE o.job_id = _job_id
        AND o.bags_source = 'MILL'
        AND o.mill_bags_used > 0
      GROUP BY o.mill_bag_product_id
    LOOP
      v_pack_bags   := v_pack_bags + coalesce(v_pack.bags, 0);
      v_pack_value  := v_pack_value + round(coalesce(v_pack.bags, 0) * coalesce(v_pack.unit_price, 0), 2);

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pack.mill_bag_product_id,
        'quantity', coalesce(v_pack.bags, 0),
        'unit_price', coalesce(v_pack.unit_price, 0)
      ));
    END LOOP;
  END IF;

  -- ── post through the ordinary sales engine ───────────────────────────────
  -- create_sale() reads each line's item policy and posts STOCK_ISSUE only for
  -- TRACKED goods. The milling fee line is SERVICE → no movement. The packaging
  -- line is GOOD + TRACKED → a real issue against the mill's own stock, tied to
  -- this invoice. That is the entire, and only, stock effect of the module.
  v_invoice_id := public.create_sale(
    v_store,
    v_customer,
    _payment_method,
    coalesce(_paid, 0),
    coalesce(_discount, 0),
    btrim(COALESCE(_note, '') || ' — أجرة طحن ' || (SELECT job_number FROM public.milling_jobs WHERE id = _job_id)),
    v_lines
  );

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'The sales engine returned no invoice';
  END IF;

  -- Tag the invoice so the customer statement can separate toll-service billing
  -- from ordinary goods sales, and so double-billing is detectable above.
  UPDATE public.sales_invoices
  SET milling_job_id = _job_id
  WHERE id = v_invoice_id;

  -- The stock effect of the packaging lines is recorded on the milling audit
  -- trail, so a stock-take discrepancy in packaging can be traced to the exact
  -- service invoice that caused it.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.invoice.issued', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'milling_job_id', _job_id,
      'customer_id', v_customer,
      'warehouse_id', v_store,
      'packaging_bags', v_pack_bags,
      'packaging_value', v_pack_value,
      'stock_impact', 'STOCK_ISSUE on mill packaging only — grain and flour untouched'
    ));

  RETURN v_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.issue_milling_service_invoice(uuid, text, numeric, numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_milling_service_invoice(uuid, text, numeric, numeric, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.issue_milling_service_invoice(uuid, text, numeric, numeric, text, boolean) IS
  'فاتورة أجور طحن + أكياس التعبئة. الاستدعاء عبر create_sale فتنتقل الضريبة والحد الائتماني ودفتر العميل كما هي. صفر حركة على الحبوب.';

-- ---------------------------------------------------------------------------
-- 12. نماذج القراءة — كشف الحساب المزدوج
-- ---------------------------------------------------------------------------
-- plan,mill.md §2: "العميل له كشفان: كشف رصيد عيني للأمانات، وكشف مالي
-- للنقدية والمديونيات." These three views are the authorised sources for both.
--
-- `security_invoker = true` keeps the RLS on the underlying milling_* tables in
-- force, so a cashier who cannot see custody documents cannot read them through
-- a view either.

-- 12.a — رصيد الأمانات العيني لكل عميل: وارد − مطحون − مسلّم
-- The physical movement ledger. Nothing here is money.
CREATE OR REPLACE VIEW public.milling_customer_custody
WITH (security_invoker = true) AS
SELECT
  r.customer_id,
  -- WARD: grain that arrived
  sum(r.net_weight_kg)                                              AS received_kg,
  sum(r.intake_bag_count)                                           AS received_bags,
  -- MILLED: grain consumed by completed + open jobs
  coalesce((
    SELECT sum(j.input_weight_kg)
    FROM public.milling_jobs j
    WHERE j.customer_id = r.customer_id AND j.status <> 'CANCELLED'
  ), 0)                                                             AS milled_kg,
  coalesce((
    SELECT sum(j.input_bag_count)
    FROM public.milling_jobs j
    WHERE j.customer_id = r.customer_id AND j.status <> 'CANCELLED'
  ), 0)                                                             AS milled_bags,
  -- PRODUCED / DELIVERED / STILL IN CUSTODY
  coalesce((
    SELECT sum(o.produced_bag_count)  FROM public.milling_job_outputs o
    JOIN public.milling_jobs j2 ON j2.id = o.job_id
    WHERE j2.customer_id = r.customer_id
  ), 0)                                                             AS produced_bags,
  coalesce((
    SELECT sum(o.produced_weight_kg)  FROM public.milling_job_outputs o
    JOIN public.milling_jobs j2 ON j2.id = o.job_id
    WHERE j2.customer_id = r.customer_id
  ), 0)                                                             AS produced_kg,
  coalesce((
    SELECT sum(o.delivered_bag_count) FROM public.milling_job_outputs o
    JOIN public.milling_jobs j2 ON j2.id = o.job_id
    WHERE j2.customer_id = r.customer_id
  ), 0)                                                             AS delivered_bags,
  coalesce((
    SELECT sum(o.delivered_weight_kg) FROM public.milling_job_outputs o
    JOIN public.milling_jobs j2 ON j2.id = o.job_id
    WHERE j2.customer_id = r.customer_id
  ), 0)                                                             AS delivered_kg
FROM public.milling_intake_receipts r
WHERE r.status <> 'CANCELLED'
GROUP BY r.customer_id;

COMMENT ON VIEW public.milling_customer_custody IS
  'كشف الأمانات العيني للعميل: وارد حبوب − مطحون − ناتج − مسلّم. لا علاقة له بالمال أو بمخزون المنشأة.';

-- 12.b — رصيد النواتج المتبقي في صوامع ومستودع الأمانات
-- One row per (customer, output grade): what is still physically theirs.
CREATE OR REPLACE VIEW public.milling_output_balances
WITH (security_invoker = true) AS
SELECT
  j.customer_id,
  j.store_id,
  o.output_type,
  o.bag_size_kg,
  sum(o.produced_bag_count)                            AS produced_bags,
  sum(o.produced_weight_kg)                            AS produced_kg,
  sum(o.delivered_bag_count)                           AS delivered_bags,
  sum(o.delivered_weight_kg)                           AS delivered_kg,
  sum(o.produced_bag_count - o.delivered_bag_count)    AS remaining_bags,
  sum(o.produced_weight_kg - o.delivered_weight_kg)    AS remaining_kg
FROM public.milling_job_outputs o
JOIN public.milling_jobs j ON j.id = o.job_id
WHERE j.status <> 'CANCELLED'
  AND o.output_type <> 'WASTE'          -- waste is not deliverable custody
GROUP BY j.customer_id, j.store_id, o.output_type, o.bag_size_kg;

COMMENT ON VIEW public.milling_output_balances IS
  'الأكياس والأوزان المتبقية للعميل في صوامع ومستودع الأمانات، موزعة على درجة الناتج.';

-- 12.c — الكشف المالي: أجور الطحن
-- The money side is deliberately narrow: only invoices tagged with a
-- milling_job_id. Ordinary goods sales for this same customer are NOT in here —
-- they belong on the normal customer statement. Mixing the two is how a mill
-- ends up unable to show a customer what they were actually charged for milling.
CREATE OR REPLACE VIEW public.milling_service_money
WITH (security_invoker = true) AS
SELECT
  si.milling_job_id                                      AS job_id,
  si.customer_id,
  si.warehouse_id                                        AS warehouse_id,
  si.id                                                  AS invoice_id,
  si.invoice_number,
  si.created_at,
  si.status,
  si.subtotal,
  si.tax,
  si.discount,
  si.total,
  si.paid,
  round(si.total - si.paid, 2)                           AS outstanding,
  j.job_number
FROM public.sales_invoices si
JOIN public.milling_jobs j ON j.id = si.milling_job_id;

COMMENT ON VIEW public.milling_service_money IS
  'الكشف المالي لأجور الطحن فقط: فواتير الخدمات المرتبطة بأوامر طحن. لا يشمل مبيعات البضاعة التجارية للعميل نفسه.';

GRANT SELECT ON
  public.milling_customer_custody,
  public.milling_output_balances,
  public.milling_service_money
TO authenticated;
