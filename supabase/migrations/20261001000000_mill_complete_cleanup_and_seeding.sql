-- ============================================================================
-- 20261001000000_mill_complete_cleanup_and_seeding.sql
-- تنظيف البيانات السابقة بالكامل (مع الحفاظ على العملاء والموردين)
-- وإدخال البيانات التشغيلية والمخزنية المعتمدة للمطحنة الصناعية
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. تنظيف الحركات والفواتير والمعاملات القديمة
-- ---------------------------------------------------------------------------

-- 1.1 بنود وفواتير المبيعات والخدمات السابقة
DELETE FROM public.ad_hoc_service_lines;
DELETE FROM public.sales_return_items;
DELETE FROM public.sales_returns;
DELETE FROM public.sales_invoice_items;
DELETE FROM public.sales_invoices;

-- 1.2 بنود وفواتير المشتريات السابقة
DELETE FROM public.purchase_return_items;
DELETE FROM public.purchase_returns;
DELETE FROM public.purchase_invoice_items;
DELETE FROM public.purchase_invoices;

-- 1.3 حركات وتعديلات ومخزون قطع الغيار القديمة
DELETE FROM public.stock_adjustment_items;
DELETE FROM public.stock_adjustments;
DELETE FROM public.stock_transfer_items;
DELETE FROM public.stock_transfers;
DELETE FROM public.stock_opening_items;
DELETE FROM public.stock_openings;
DELETE FROM public.item_policy_review_queue;
DELETE FROM public.stock_movements;
DELETE FROM public.product_batches;
DELETE FROM public.inventory;

-- 1.4 تنظيف سجلات الحسابات والمدفوعات والمصروفات السابقة
DELETE FROM public.customer_payment_splits;
DELETE FROM public.customer_payments;
DELETE FROM public.customer_ledger;
DELETE FROM public.loyalty_transactions;
DELETE FROM public.expenses;

-- 1.5 تصفير مستندات المطحنة للبدء بحالة نقية
DELETE FROM public.milling_delivery_items;
DELETE FROM public.milling_delivery_notes;
DELETE FROM public.milling_job_outputs;
DELETE FROM public.milling_jobs;
DELETE FROM public.milling_intake_receipts;

-- 1.6 تصفير أرصدة ومديونيات العملاء والموردين الحالية (مع الإبقاء التام على أسمائهم وبياناتهم)
UPDATE public.customers
SET balance = 0,
    loyalty_points = 0,
    updated_at = now();

UPDATE public.suppliers
SET balance = 0,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- 2. تنظيف بيانات فهرس قطع الغيار والدراجات القديمة
-- ---------------------------------------------------------------------------

-- 2.1 حذف توافقات وموديلات ومصنعي المركبات
DELETE FROM public.product_compatibilities;
DELETE FROM public.vehicle_models;
DELETE FROM public.vehicle_makes;
DELETE FROM public.quality_grades;
DELETE FROM public.countries_of_origin;

-- 2.2 حذف أصناف قطع الغيار السابقة مع الإبقاء الحصري على أصناف المطحنة
DELETE FROM public.products
WHERE sku IS NULL
   OR (
     sku NOT LIKE 'RM-%'
     AND sku NOT LIKE 'FG-%'
     AND sku NOT LIKE 'SRV-%'
     AND sku NOT LIKE 'PKG-%'
   );

-- 2.3 حذف الماركات القديمة
DELETE FROM public.brands;

-- 2.4 حذف التصنيفات القديمة غير المرتبطة بنشاط المطحنة
DELETE FROM public.categories
WHERE name NOT IN (
  'Milling Raw Materials',
  'Milling Finished Goods',
  'Milling Packaging',
  'Milling Services',
  'Grains & Seeds',
  'Flour & Milled Products',
  'Animal Feed & Bran',
  'Pulses & Legumes',
  'Spices & Seasonings'
);

-- 2.5 حذف وحدات القياس القديمة
DELETE FROM public.units
WHERE name IN ('متر', 'طقم', 'علبه لتر', 'Meter', 'Roll', 'Set');

-- ---------------------------------------------------------------------------
-- 3. توحيد وحدات القياس القياسية للمطحنة
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.units WHERE name = 'Piece') THEN
    IF EXISTS (SELECT 1 FROM public.units WHERE name = 'حبه') THEN
      UPDATE public.units
      SET name = 'Piece', name_ar = 'قطعة / حبة', short_name = 'pcs'
      WHERE name = 'حبه';
    ELSE
      INSERT INTO public.units (name, name_ar, short_name)
      VALUES ('Piece', 'قطعة / حبة', 'pcs');
    END IF;
  END IF;
END $$;

-- تحديث جدول تحويلات المطحنة لوحدة Piece
INSERT INTO public.milling_unit_conversions (unit_id, kg_per_unit, is_bag_unit, note)
SELECT u.id, 1.0000, false, 'قطعة / حبة مستلزمات تعبئة'
FROM public.units u WHERE u.name = 'Piece'
ON CONFLICT (unit_id) DO UPDATE SET kg_per_unit = 1.0000, is_bag_unit = false;

-- ---------------------------------------------------------------------------
-- 4. إدخال أصناف مستلزمات التعبئة والخدمات التشغيلية المعتمدة للمطحنة
-- ---------------------------------------------------------------------------

-- 4.1 مستلزمات التعبئة (Packaging Materials)
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
  v.cost, v.price, 0, 10,
  false, true, 'ACTIVE',
  'GOOD', 'TRACKED', 'NONE', 'MOVING_AVERAGE',
  true, true, '[]'::jsonb
FROM (VALUES
  ('PP Woven Bag 50kg',    'كيس بولي بروبيلين منسوج فارغ 50 كجم', 'PKG-BAG-PP-50',   'كيس منسوج قابل لإعادة الاستخدام للدقيق والقمح', 1.80, 3.00),
  ('PP Woven Bag 25kg',    'كيس بولي بروبيلين منسوج فارغ 25 كجم', 'PKG-BAG-PP-25',   'كيس منسوج متوسط للتجزئة والمخابز', 1.20, 2.50),
  ('Jute Natural Bag 50kg','خيش طبيعي متين فارغ 50 كجم',          'PKG-BAG-JUTE-50', 'خيش طبيعي عالي المتانة للحبوب', 4.50, 7.00),
  ('Sewing Thread Roll',   'بكرة خيط حياكة أكياس صناعية',         'PKG-THREAD-ROLL', 'خيط صناعي لماكينات خياطة الأكياس', 15.00, 0.00)
) AS v(name, name_ar, sku, description, cost, price)
JOIN public.units u ON u.name = 'Piece'
ON CONFLICT (sku) DO UPDATE
  SET name_ar          = EXCLUDED.name_ar,
      description      = EXCLUDED.description,
      category_id      = EXCLUDED.category_id,
      unit_id          = EXCLUDED.unit_id,
      base_uom_id      = EXCLUDED.base_uom_id,
      sales_uom_id     = EXCLUDED.sales_uom_id,
      purchase_uom_id  = EXCLUDED.purchase_uom_id,
      cost_price       = EXCLUDED.cost_price,
      sale_price       = EXCLUDED.sale_price,
      item_nature      = 'GOOD',
      inventory_policy = 'TRACKED',
      is_service       = false,
      is_active        = true,
      status           = 'ACTIVE';

-- 4.2 خدمة التعبئة والحياكة
INSERT INTO public.products (
  name, name_ar, sku, description,
  category_id, unit_id, base_uom_id, sales_uom_id, purchase_uom_id,
  cost_price, sale_price, tax_rate, min_stock,
  is_service, is_active, status,
  item_nature, inventory_policy, tracking, costing_method,
  is_sellable, is_purchasable, uom_conversions
)
SELECT
  'Bagging & Sewing per Unit', 'أجور تعبئة وحياكة أكياس آلية', 'SRV-SEWING-BAG',
  'تعبئة وحياكة آلية لكل كيس ناتج',
  (SELECT c.id FROM public.categories c WHERE c.name = 'Milling Services'),
  u.id, u.id, u.id, u.id,
  0, 1.00, 0, 0,
  true, true, 'ACTIVE',
  'SERVICE', 'UNTRACKED', 'NONE', 'NONE',
  true, false, '[]'::jsonb
FROM public.units u
WHERE u.name = 'Piece'
ON CONFLICT (sku) DO UPDATE
  SET name_ar          = EXCLUDED.name_ar,
      description      = EXCLUDED.description,
      category_id      = EXCLUDED.category_id,
      unit_id          = EXCLUDED.unit_id,
      sale_price       = EXCLUDED.sale_price,
      item_nature      = 'SERVICE',
      inventory_policy = 'UNTRACKED',
      costing_method   = 'NONE',
      is_service       = true,
      is_active        = true,
      status           = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 5. إدخال رصيد المخزون الافتتاحي للمطحنة (المستودع الرئيسي)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_warehouse_id uuid;
  v_prod_rec record;
BEGIN
  -- الحصول على معرف المستودع الرئيسي
  SELECT id INTO v_warehouse_id FROM public.warehouses ORDER BY created_at LIMIT 1;

  IF v_warehouse_id IS NOT NULL THEN
    -- رصيد مستلزمات التعبئة المملوكة للمطحنة
    FOR v_prod_rec IN
      SELECT p.id, v.qty
      FROM (VALUES
        ('PKG-BAG-PP-50',   500::numeric),
        ('PKG-BAG-PP-25',   300::numeric),
        ('PKG-BAG-JUTE-50', 150::numeric),
        ('PKG-THREAD-ROLL', 30::numeric),
        ('RM-WHEAT-HARD',   200::numeric),
        ('RM-WHEAT-LOCAL',  120::numeric),
        ('FG-FLOUR-SUPER-50', 100::numeric),
        ('FG-FLOUR-SUPER-25',  80::numeric),
        ('FG-FLOUR-BROWN-50',  60::numeric),
        ('FG-BRAN-40',         75::numeric)
      ) AS v(sku, qty)
      JOIN public.products p ON p.sku = v.sku
    LOOP
      INSERT INTO public.inventory (product_id, warehouse_id, quantity, owner_type, owner_id, updated_at)
      VALUES (v_prod_rec.id, v_warehouse_id, v_prod_rec.qty, 'COMPANY', NULL, now())
      ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
      DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. زرع بيانات تشغيلية حقيقية للمطحنة (دورة أمانات كاملة جاهزة للتسليم والعرض)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_warehouse_id uuid;
  v_cust_mohammed uuid;
  v_cust_najm uuid;
  v_receipt_id uuid;
  v_job_id uuid;
  v_output_flour_id uuid;
  v_output_bran_id uuid;
  v_output_waste_id uuid;
  v_delivery_id uuid;
  v_wheat_hard_id uuid;
  v_wheat_local_id uuid;
BEGIN
  -- جلب المعرفات الأساسية
  SELECT id INTO v_warehouse_id FROM public.warehouses ORDER BY created_at LIMIT 1;
  SELECT id INTO v_cust_mohammed FROM public.customers WHERE name LIKE '%محمد%' LIMIT 1;
  SELECT id INTO v_cust_najm FROM public.customers WHERE name LIKE '%نجم%' OR name LIKE '%يونس%' OR name LIKE '%موسئ%' LIMIT 1;
  SELECT id INTO v_wheat_hard_id FROM public.products WHERE sku = 'RM-WHEAT-HARD';
  SELECT id INTO v_wheat_local_id FROM public.products WHERE sku = 'RM-WHEAT-LOCAL';

  IF v_warehouse_id IS NOT NULL AND v_cust_mohammed IS NOT NULL THEN

    -- =========================================================================
    -- الحالة 1: دورة طحن كاملة وتسليم جزئي للعميل "محمد"
    -- =========================================================================
    
    -- 1. سند استلام أمانات حبوب 400 كيس قمح (20,000 كجم)
    INSERT INTO public.milling_intake_receipts (
      id, store_id, receipt_number, customer_id, truck_plate_number, driver_name,
      grain_type, grain_product_id, bag_size_kg, intake_bag_count, nominal_weight_kg,
      gross_weight_kg, tare_weight_kg, net_weight_kg, moisture_percentage,
      impurities_percentage, silo_or_location, status, notes, created_at
    )
    VALUES (
      gen_random_uuid(), v_warehouse_id, 'IR-101', v_cust_mohammed, '7412-أ-ب-ج', 'أحمد صالح',
      'قمح صلب مستورد', v_wheat_hard_id, 50.00, 400, 20000.00,
      20000.00, 0.00, 20000.00, 12.50,
      1.00, 'صومعة رقم 1 - أمانات', 'COMPLETED'::public.milling_status,
      'تم استلام الحبوب بحالة ممتازة وجاهزة للطحن', now() - interval '2 days'
    )
    RETURNING id INTO v_receipt_id;

    -- 2. أمر طحن وتشغيل كامل الشحنة
    INSERT INTO public.milling_jobs (
      id, store_id, job_number, intake_receipt_id, customer_id,
      input_bag_count, input_weight_kg, milling_fee_per_bag, milling_fee_per_ton,
      expected_extraction_rate, allowed_loss_percentage, actual_loss_kg,
      status, started_at, finished_at, notes, created_at
    )
    VALUES (
      gen_random_uuid(), v_warehouse_id, 'MJ-501', v_receipt_id, v_cust_mohammed,
      400, 20000.00, 8.00, 160.00,
      78.00, 2.00, 400.00,
      'COMPLETED'::public.milling_status, now() - interval '2 days', now() - interval '1 day',
      'تم تشغيل خط الطحن رقم 1 واكتمال الدفعة بنجاح', now() - interval '2 days'
    )
    RETURNING id INTO v_job_id;

    -- 3. مخرجات أمر الطحن (دقيق نمرة 1 + نخالة + فاقد تبخر)
    -- الناتج 1: دقيق فاخر 312 كيس (15,600 كجم)
    INSERT INTO public.milling_job_outputs (
      id, job_id, output_type, bag_size_kg, produced_bag_count, produced_weight_kg,
      bags_source, mill_bag_product_id, delivered_bag_count, delivered_weight_kg, created_at
    )
    VALUES (
      gen_random_uuid(), v_job_id, 'FLOUR_GRADE_1'::public.milling_output_type, 50.00, 312, 15600.00,
      'CUSTOMER', NULL, 150, 7500.00, now() - interval '1 day'
    )
    RETURNING id INTO v_output_flour_id;

    -- الناتج 2: نخالة مواشي 100 كيس (4,000 كجم)
    INSERT INTO public.milling_job_outputs (
      id, job_id, output_type, bag_size_kg, produced_bag_count, produced_weight_kg,
      bags_source, mill_bag_product_id, delivered_bag_count, delivered_weight_kg, created_at
    )
    VALUES (
      gen_random_uuid(), v_job_id, 'BRAN'::public.milling_output_type, 40.00, 100, 4000.00,
      'CUSTOMER', NULL, 0, 0.00, now() - interval '1 day'
    )
    RETURNING id INTO v_output_bran_id;

    -- الناتج 3: فاقد وهدر طبيعي (400 كجم)
    INSERT INTO public.milling_job_outputs (
      id, job_id, output_type, bag_size_kg, produced_bag_count, produced_weight_kg,
      bags_source, mill_bag_product_id, delivered_bag_count, delivered_weight_kg, created_at
    )
    VALUES (
      gen_random_uuid(), v_job_id, 'WASTE'::public.milling_output_type, 1.00, 0, 400.00,
      'CUSTOMER', NULL, 0, 0.00, now() - interval '1 day'
    )
    RETURNING id INTO v_output_waste_id;

    -- 4. إذن تسليم نواتج جزئي (150 كيس دقيق من أصل 312 كيس)
    INSERT INTO public.milling_delivery_notes (
      id, store_id, delivery_number, customer_id, job_id,
      truck_plate_number, driver_name, total_bags, total_weight_kg,
      notes, created_at
    )
    VALUES (
      gen_random_uuid(), v_warehouse_id, 'MDN-01', v_cust_mohammed, v_job_id,
      '7412-أ-ب-ج', 'أحمد صالح', 150, 7500.00,
      'تسليم الدفعة الأولى - شاحنة العميل', now() - interval '12 hours'
    )
    RETURNING id INTO v_delivery_id;

    -- بند إذن التسليم
    INSERT INTO public.milling_delivery_items (
      id, delivery_id, job_output_id, delivered_bags, delivered_weight_kg
    )
    VALUES (
      gen_random_uuid(), v_delivery_id, v_output_flour_id, 150, 7500.00
    );

    -- =========================================================================
    -- الحالة 2: شحنة مستلمة جديدة قيد الانتظار للعميل "نجم"
    -- =========================================================================
    IF v_cust_najm IS NOT NULL THEN
      INSERT INTO public.milling_intake_receipts (
        id, store_id, receipt_number, customer_id, truck_plate_number, driver_name,
        grain_type, grain_product_id, bag_size_kg, intake_bag_count, nominal_weight_kg,
        gross_weight_kg, tare_weight_kg, net_weight_kg, moisture_percentage,
        impurities_percentage, silo_or_location, status, notes, created_at
      )
      VALUES (
        gen_random_uuid(), v_warehouse_id, 'IR-102', v_cust_najm, '3829-د-و-ر', 'سعيد العماري',
        'قمح بلدي محلي (حبوب)', v_wheat_local_id, 50.00, 200, 10000.00,
        10000.00, 0.00, 10000.00, 11.80,
        0.50, 'عنبر الأمانات ب', 'RECEIVED'::public.milling_status,
        'شحنة قمح بلدي جاهزة للجدولة على خط الإنتاج', now() - interval '4 hours'
      );
    END IF;

  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. تحديث إشعارات PostgREST لإعادة تحميل الكاش
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.milling_intake_receipts IS 'سندات استلام حبوب وأمانات العملاء بالمطحنة';
COMMENT ON TABLE public.milling_jobs IS 'أوامر الطحن والتشغيل لحساب الغير';
COMMENT ON TABLE public.milling_job_outputs IS 'مخرجات أوامر الطحن (دقيق، نخالة، فاقد)';
COMMENT ON TABLE public.milling_delivery_notes IS 'أذون تسليم نواتج أمانات الطحن';
COMMENT ON TABLE public.products IS 'فهرس أصناف المطحنة المعتمد';
