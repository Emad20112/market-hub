-- ============================================================================
-- supabase/seeds/demo/wholesale-retail.sql
--
-- ⚠️ DEMO BUSINESS DATA — NOT AUTO-RUN. NEVER EXECUTE ON A CUSTOMER DATABASE.
--
-- Optional demo dataset for a Yemeni wholesale + retail grocery trader.
-- Renamed from supabase/seeds/wholesale-retail-demo.sql so that every demo
-- dataset lives in one folder; see supabase/seeds/README.md.
--
-- RUN: paste the whole file into Supabase Dashboard > SQL Editor and press Run.
-- It is NOT referenced by config.toml and does NOT run on `supabase db reset`.
-- No auth.users rows are created; created_by is deliberately NULL everywhere.
-- Create users from Supabase Auth first if you want invoices tied to real staff.
--
-- SCOPE: groceries, beverages and consumer goods only. No mill, production or
-- spare-parts tables or data. Prices are in Yemeni Rial and sale_price is the
-- retail price; wholesale and bulk tiers are kept in the description because the
-- product schema currently carries a single sale price.
--
-- SAFE TO RE-RUN
--   Every statement is idempotent. Rows that collide with the reference seed are
--   keyed on their natural business key and skip instead of raising:
--
--     units             ON CONFLICT (name) DO NOTHING   -- shared with reference
--     expense_categories ON CONFLICT (name) DO NOTHING  -- shared with reference
--     company_settings  ON CONFLICT (id) DO NOTHING     -- never overwritten
--
--   That last one matters: this file used to DO UPDATE company_settings, so
--   re-running it silently replaced whatever identity the project had. Demo data
--   may create a demo identity, but must never overwrite an existing one.
-- ============================================================================

BEGIN;

-- هوية المتجر وإعدادات الفواتير
INSERT INTO public.company_settings
  (id, name, legal_name, tax_number, currency, currency_symbol, tax_rate,
   logo_url, address, phone, email, invoice_prefix, barcode_enabled, updated_at)
VALUES
  (1, 'مركز سبأ للجملة والتجزئة', 'مؤسسة مركز سبأ للمواد الغذائية', 'YER-DEMO-2026',
   'YER', 'ر.ي', 15, NULL, 'صنعاء، شارع الزبيري', '777555111',
   'demo@saba-food.example', 'SAB-', TRUE, '2026-10-03T09:00:00+00:00')
ON CONFLICT (id) DO NOTHING;

-- التصنيفات
INSERT INTO public.categories (id, name, name_ar, parent_id) VALUES
  ('10000000-0000-4000-8000-000001', 'Food and beverages', 'المواد الغذائية والمشروبات', NULL),
  ('10000000-0000-4000-8000-000002', 'Rice and grains', 'الأرز والحبوب', '10000000-0000-4000-8000-000001'),
  ('10000000-0000-4000-8000-000003', 'Canned foods', 'المعلبات', '10000000-0000-4000-8000-000001'),
  ('10000000-0000-4000-8000-000004', 'Beverages', 'المشروبات', '10000000-0000-4000-8000-000001'),
  ('10000000-0000-4000-8000-000005', 'Oil sugar and flour', 'الزيوت والسكر والدقيق', '10000000-0000-4000-8000-000001')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, name_ar = EXCLUDED.name_ar, parent_id = EXCLUDED.parent_id;

-- العلامات التجارية الغذائية المتداولة في السوق اليمني
INSERT INTO public.brands (id, name, name_ar, created_at) VALUES
  ('20000000-0000-4000-8000-000001', 'الكبوس', 'الكبوس', '2026-10-03T09:01:00+00:00'),
  ('20000000-0000-4000-8000-000002', 'شمسان', 'شمسان', '2026-10-03T09:02:00+00:00'),
  ('20000000-0000-4000-8000-000003', 'الحديدة', 'الحديدة', '2026-10-03T09:03:00+00:00'),
  ('20000000-0000-4000-8000-000004', 'مستورد عام', 'مستورد عام', '2026-10-03T09:04:00+00:00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- وحدات بيع الغذائيات. مفتاح التعارض هو name لأن supabase/seeds/reference.sql
-- تُدرج الوحدات نفسها بنفس المفاتيح؛ ON CONFLICT (id) كان يُنشئ صفوفاً مكررة.
INSERT INTO public.units (id, name, short_name, name_ar, created_at) VALUES
  ('30000000-0000-4000-8000-000001', 'Piece', 'pc', 'حبة', '2026-10-03T09:05:00+00:00'),
  ('30000000-0000-4000-8000-000002', 'Pack', 'pk', 'كيس', '2026-10-03T09:05:00+00:00'),
  ('30000000-0000-4000-8000-000003', 'Box', 'bx', 'علبة', '2026-10-03T09:05:00+00:00'),
  ('30000000-0000-4000-8000-000004', 'Carton', 'ctn', 'كرتون', '2026-10-03T09:05:00+00:00'),
  ('30000000-0000-4000-8000-000005', 'Kilogram', 'kg', 'كيلوجرام', '2026-10-03T09:05:00+00:00')
ON CONFLICT (name) DO NOTHING;

-- مستودع مركزي وفرع بيع
INSERT INTO public.warehouses
  (id, name, code, address, is_default, is_active, created_at, updated_at)
VALUES
  ('40000000-0000-4000-8000-000001', 'المستودع الرئيسي - صنعاء', 'SAB-SAN', 'صنعاء، المنطقة الصناعية', TRUE, TRUE, '2026-10-03T09:10:00+00:00', '2026-10-03T09:10:00+00:00'),
  ('40000000-0000-4000-8000-000002', 'معرض التجزئة - تعز', 'SAB-TAZ', 'تعز، شارع', FALSE, TRUE, '2026-10-03T09:11:00+00:00', '2026-10-03T09:11:00+00:00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, address = EXCLUDED.address, is_default = EXCLUDED.is_default, is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at;

-- الموردون الغذائيون
INSERT INTO public.suppliers
  (id, name, phone, email, address, balance, is_active, created_at, updated_at)
VALUES
  ('50000000-0000-4000-8000-000001', 'شركة الكبوس للتجارة والتوريد', '777210001', 'supplier1@example.com', 'صنعاء، شارع تعز', 0, TRUE, '2026-10-03T09:15:00+00:00', '2026-10-03T09:15:00+00:00'),
  ('50000000-0000-4000-8000-000002', 'مؤسسة شمسان للمواد الغذائية', '777210002', 'supplier2@example.com', 'عدن، المنصورة', 0, TRUE, '2026-10-03T09:16:00+00:00', '2026-10-03T09:16:00+00:00'),
  ('50000000-0000-4000-8000-000003', 'مستودعات اليمن للسلع الاستهلاكية', '777210003', 'supplier3@example.com', 'الحديدة، شارع صنعاء', 0, TRUE, '2026-10-03T09:17:00+00:00', '2026-10-03T09:17:00+00:00')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, address = EXCLUDED.address, is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at;

-- العملاء: بقالات ومحلات سوبرماركت ومطاعم، لتجربة التجزئة والبيع الآجل
INSERT INTO public.customers
  (id, name, phone, email, address, credit_limit, balance, is_active, created_at, updated_at, loyalty_points)
VALUES
  ('60000000-0000-4000-8000-000001', 'بقالة بلقيس - صنعاء', '777310001', 'customer1@example.com', 'صنعاء، التحرير', 150000, 0, TRUE, '2026-10-03T09:20:00+00:00', '2026-10-03T09:20:00+00:00', 0),
  ('60000000-0000-4000-8000-000002', 'سوبرماركت حضرموت - تعز', '777310002', 'customer2@example.com', 'تعز، الحوبان', 200000, 0, TRUE, '2026-10-03T09:21:00+00:00', '2026-10-03T09:21:00+00:00', 0),
  ('60000000-0000-4000-8000-000003', 'مطاعم النهضة - إب', '777310003', 'customer3@example.com', 'إب، شارع العدين', 300000, 0, TRUE, '2026-10-03T09:22:00+00:00', '2026-10-03T09:22:00+00:00', 0),
  ('60000000-0000-4000-8000-000004', 'عميل نقدي - البقالة', NULL, NULL, 'تعز، معرض التجزئة', 0, 0, TRUE, '2026-10-03T09:23:00+00:00', '2026-10-03T09:23:00+00:00', 0)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, address = EXCLUDED.address, credit_limit = EXCLUDED.credit_limit, is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at;

-- منتجات غذائية بأسماء علامات متداولة في اليمن، مع سعر تجزئة وسعرَي جملة واضحين
INSERT INTO public.products
  (id, sku, barcode, name, name_ar, description, image_url, category_id, brand_id, unit_id,
   cost_price, sale_price, tax_rate, min_stock, track_expiry, is_active, created_at, updated_at)
VALUES
  ('70000000-0000-4000-8000-000001', 'SAB-FOD-001', '629900000001', 'أرز الكبوس 5 كجم', 'أرز الكبوس 5 كجم', 'تجزئة 6500 ر.ي | جملة 5700 ر.ي | جملة كبيرة 5200 ر.ي', NULL, '10000000-0000-4000-8000-000002', '20000000-0000-4000-8000-000001', '30000000-0000-4000-8000-000002', 5200, 6500, 15, 40, FALSE, TRUE, '2026-10-03T10:00:00+00:00', '2026-10-03T10:00:00+00:00'),
  ('70000000-0000-4000-8000-000002', 'SAB-FOD-002', '629900000002', 'شاي الكبوس 450 جم', 'شاي الكبوس 450 جم', 'تجزئة 3200 ر.ي | جملة 2850 ر.ي | جملة كبيرة 2600 ر.ي', NULL, '10000000-0000-4000-8000-000002', '20000000-0000-4000-8000-000002', '30000000-0000-4000-8000-000003', 2300, 3200, 15, 20, FALSE, TRUE, '2026-10-03T10:01:00+00:00', '2026-10-03T10:01:00+00:00'),
  ('70000000-0000-4000-8000-000003', 'SAB-FOD-003', '629900000003', 'فاصوليا معلبة شمسان 400 جم', 'فاصوليا معلبة شمسان 400 جم', 'تجزئة 1200 ر.ي | جملة 1050 ر.ي | جملة كبيرة 950 ر.ي', NULL, '10000000-0000-4000-8000-000003', '20000000-0000-4000-8000-000003', '30000000-0000-4000-8000-000003', 850, 1200, 15, 15, FALSE, TRUE, '2026-10-03T10:02:00+00:00', '2026-10-03T10:02:00+00:00'),
  ('70000000-0000-4000-8000-000004', 'SAB-FOD-004', '6299000004', 'زيت طبخ الحديدة 1 لتر', 'زيت طبخ الحديدة 1 لتر', 'تجزئة 2800 ر.ي | جملة 2500 ر.ي | جملة كبيرة 2300 ر.ي', NULL, '10000000-0000-4000-8000-000005', '20000000-0000-4000-8000-000003', '30000000-0000-4000-8000-000001', 2300, 2800, 15, 200, FALSE, TRUE, '2026-10-03T10:03:00+00:00', '2026-10-03T10:03:00+00:00'),
  ('70000000-0000-4000-8000-000005', 'SAB-FOD-005', '6299000005', 'سكر أبيض يمني 1 كجم', 'سكر أبيض يمني 1 كجم', 'تجزئة 900 ر.ي | جملة 800 ر.ي | جملة كبيرة 740 ر.ي', NULL, '10000000-0000-4000-8000-000005', '20000000-0000-4000-8000-000004', '30000000-0000-4000-8000-000005', 740, 900, 15, 250, FALSE, TRUE, '2026-10-03T10:04:00+00:00', '2026-10-03T10:04:00+00:00'),
  ('70000000-0000-4000-8000-000006', 'SAB-FOD-006', '6299000006', 'دقيق السنابل 5 كجم', 'دقيق السنابل 5 كجم', 'تجزئة 3500 ر.ي | جملة 3150 ر.ي | جملة كبيرة 2900 ر.ي', NULL, '10000000-0000-4000-8000-000003', '20000000-0000-4000-8000-000002', '30000000-0000-4000-8000-000001', 90, 150, 15, 200, FALSE, TRUE, '2026-10-03T10:05:00+00:00', '2026-10-03T10:05:00+00:00'),
  ('70000000-0000-4000-8000-000007', 'SAB-FOD-007', '6299000007', 'مياه شملان كرتون 1.5 لتر', 'مياه شملان كرتون 1.5 لتر', 'تجزئة 4800 ر.ي | جملة 4300 ر.ي | جملة كبيرة 3900 ر.ي', NULL, '10000000-0000-4000-8000-000004', '20000000-0000-4000-8000-000001', '30000000-0000-4000-8000-000005', 780, 1200, 15, 30, FALSE, TRUE, '2026-10-03T10:06:00+00:00', '2026-10-03T10:06:00+00:00'),
  ('70000000-0000-4000-8000-000008', 'SAB-FOD-008', '6299000008', 'عصير بلقيس كرتون', 'عصير بلقيس كرتون', 'تجزئة 7200 ر.ي | جملة 6500 ر.ي | جملة كبيرة 5900 ر.ي', NULL, '10000000-0000-4000-8000-000004', '20000000-0000-4000-8000-000002', '30000000-0000-4000-8000-000002', 1450, 2200, 15, 25, FALSE, TRUE, '2026-10-03T10:07:00+00:00', '2026-10-03T10:07:00+00:00'),
  ('70000000-0000-4000-8000-000009', 'SAB-FOD-009', '6299000009', 'تونة شمسان 185 جم كرتون', 'تونة شمسان 185 جم كرتون', 'تجزئة 11000 ر.ي | جملة 9900 ر.ي | جملة كبيرة 9000 ر.ي', NULL, '10000000-0000-4000-8000-000005', '20000000-0000-4000-8000-000003', '30000000-0000-4000-8000-000004', 5200, 7500, 15, 20, FALSE, TRUE, '2026-10-03T10:08:00+00:00', '2026-10-03T10:08:00+00:00'),
  ('70000000-0000-4000-8000-000010', 'SAB-FOD-010', '6299000000010', 'مكرونة صنعاء 400 جم كرتون', 'مكرونة صنعاء 400 جم كرتون', 'تجزئة 8500 ر.ي | جملة 7600 ر.ي | جملة كبيرة 6900 ر.ي', NULL, '10000000-0000-4000-8000-000005', '20000000-0000-4000-8000-000004', '30000000-0000-4000-8000-000002', 1000, 1500, 15, 50, FALSE, TRUE, '2026-10-03T10:09:00+00:00', '2026-10-03T10:09:00+00:00'),
  ('70000000-0000-4000-8000-000011', 'SAB-FOD-011', '6299000000011', 'بسكويت بلقيس علبة', 'بسكويت بلقيس علبة', 'تجزئة 1800 ر.ي | جملة 1600 ر.ي | جملة كبيرة 1450 ر.ي', NULL, '10000000-0000-4000-8000-000005', '20000000-0000-4000-8000-000004', '30000000-0000-4000-8000-000001', 180, 300, 15, 150, FALSE, TRUE, '2026-10-03T10:10:00+00:00', '2026-10-03T10:10:00+00:00'),
  ('70000000-0000-4000-8000-000012', 'SAB-FOD-012', '6299000000012', 'ملح يمني 1 كجم', 'ملح يمني 1 كجم', 'تجزئة 500 ر.ي | جملة 430 ر.ي | جملة كبيرة 380 ر.ي', NULL, '10000000-0000-4000-8000-000005', '20000000-0000-4000-8000-000004', '30000000-0000-4000-8000-000001', 150, 250, 15, 120, FALSE, TRUE, '2026-10-03T10:11:00+00:00', '2026-10-03T10:11:00+00:00')
ON CONFLICT (id) DO UPDATE SET
  sku = EXCLUDED.sku, barcode = EXCLUDED.barcode, name = EXCLUDED.name,
  name_ar = EXCLUDED.name_ar, description = EXCLUDED.description,
  category_id = EXCLUDED.category_id, brand_id = EXCLUDED.brand_id, unit_id = EXCLUDED.unit_id,
  cost_price = EXCLUDED.cost_price, sale_price = EXCLUDED.sale_price,
  tax_rate = EXCLUDED.tax_rate, min_stock = EXCLUDED.min_stock,
  track_expiry = EXCLUDED.track_expiry, is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

-- تحديث أسعار الشراء والتجزئة لتطابق أصناف المواد الغذائية أعلاه
UPDATE public.products
SET cost_price = CASE sku
  WHEN 'SAB-FOD-001' THEN 5200 WHEN 'SAB-FOD-002' THEN 2300
  WHEN 'SAB-FOD-003' THEN 850 WHEN 'SAB-FOD-004' THEN 2300
  WHEN 'SAB-FOD-005' THEN 740 WHEN 'SAB-FOD-006' THEN 2100
  WHEN 'SAB-FOD-007' THEN 3500 WHEN 'SAB-FOD-008' THEN 5200
  WHEN 'SAB-FOD-009' THEN 9000 WHEN 'SAB-FOD-010' THEN 6900
  WHEN 'SAB-FOD-011' THEN 1450 WHEN 'SAB-FOD-012' THEN 380
END,
sale_price = CASE sku
  WHEN 'SAB-FOD-001' THEN 6500 WHEN 'SAB-FOD-002' THEN 3200
  WHEN 'SAB-FOD-003' THEN 1200 WHEN 'SAB-FOD-004' THEN 2800
  WHEN 'SAB-FOD-005' THEN 900 WHEN 'SAB-FOD-006' THEN 3500
  WHEN 'SAB-FOD-007' THEN 4800 WHEN 'SAB-FOD-008' THEN 7200
  WHEN 'SAB-FOD-009' THEN 11000 WHEN 'SAB-FOD-010' THEN 8500
  WHEN 'SAB-FOD-011' THEN 1800 WHEN 'SAB-FOD-012' THEN 500
END
WHERE sku LIKE 'SAB-FOD-%';

-- مخزون افتتاحي موزع بين الجملة والتجزئة
INSERT INTO public.inventory (id, product_id, warehouse_id, quantity, updated_at) VALUES
  ('80000000-0000-4000-8000-000001', '70000000-0000-4000-8000-000001', '40000000-0000-4000-8000-000001', 480, '2026-10-03T11:00:00+00:00'),
  ('80000000-0000-4000-8000-000002', '70000000-0000-4000-8000-000001', '40000000-0000-4000-8000-000002', 80, '2026-10-03T11:00:00+00:00'),
  ('80000000-0000-4000-8000-000003', '70000000-0000-4000-8000-000002', '40000000-0000-4000-8000-000001', 180, '2026-10-03T11:01:00+00:00'),
  ('80000000-0000-4000-8000-000004', '70000000-0000-4000-8000-000002', '40000000-0000-4000-8000-000002', 30, '2026-10-03T11:01:00+00:00'),
  ('80000000-0000-4000-8000-000005', '70000000-0000-4000-8000-000003', '40000000-0000-4000-8000-000001', 120, '2026-10-03T11:02:00+00:00'),
  ('80000000-0000-4000-8000-000006', '70000000-0000-4000-8000-000004', '40000000-0000-4000-8000-000001', 1200, '2026-10-03T11:03:00+00:00'),
  ('80000000-0000-4000-8000-000007', '70000000-0000-4000-8000-000005', '40000000-0000-4000-8000-000001', 1500, '2026-10-03T11:04:00+00:00'),
  ('80000000-0000-4000-8000-000008', '70000000-0000-4000-8000-000006', '40000000-0000-4000-8000-000002', 700, '2026-10-03T11:05:00+00:00'),
  ('80000000-0000-4000-8000-000009', '70000000-0000-4000-8000-000007', '40000000-0000-4000-8000-000001', 180, '2026-10-03T11:06:00+00:00'),
  ('80000000-0000-4000-8000-000010', '70000000-0000-4000-8000-000008', '40000000-0000-4000-8000-000001', 90, '2026-10-03T11:07:00+00:00'),
  ('80000000-0000-4000-8000-000011', '70000000-0000-4000-8000-000009', '40000000-0000-4000-8000-000001', 65, '2026-10-03T11:08:00+00:00'),
  ('80000000-0000-4000-8000-000012', '70000000-0000-4000-8000-000010', '40000000-0000-4000-8000-000001', 220, '2026-10-03T11:09:00+00:00'),
  ('80000000-0000-4000-8000-000013', '70000000-0000-4000-8000-000011', '40000000-0000-4000-8000-000002', 300, '2026-10-03T11:10:00+00:00'),
  ('80000000-0000-4000-8000-000014', '70000000-0000-4000-8000-000012', '40000000-0000-4000-8000-000002', 260, '2026-10-03T11:11:00+00:00')
ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = EXCLUDED.updated_at;

-- مشتريات تجريبية: فاتورة مستلمة نقداً وفاتورة جزئية بتحويل بنكي
INSERT INTO public.purchase_invoices
  (id, invoice_number, supplier_id, warehouse_id, status, subtotal, discount, tax, total, paid, payment_method, note, created_by, created_at, updated_at)
VALUES
  ('90000000-0000-4000-8000-000001', 'SAB-P-0001', '50000000-0000-4000-8000-000001', '40000000-0000-4000-8000-000001', 'received', 420000, 0, 63000, 483000, 483000, 'cash', 'شراء افتتاحي للمواد الغذائية', NULL, '2026-10-03T12:00:00+00:00', '2026-10-03T12:00:00+00:00'),
  ('90000000-0000-4000-8000-000002', 'SAB-P-0002', '50000000-0000-4000-8000-000002', '40000000-0000-4000-8000-000001', 'received', 300000, 0, 45000, 345000, 172500, 'bank_transfer', 'شراء مواد غذائية بالجملة - دفعة أولى', NULL, '2026-10-03T12:10:00+00:00', '2026-10-03T12:10:00+00:00')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, subtotal = EXCLUDED.subtotal, tax = EXCLUDED.tax, total = EXCLUDED.total, paid = EXCLUDED.paid, payment_method = EXCLUDED.payment_method, updated_at = EXCLUDED.updated_at;

INSERT INTO public.purchase_invoice_items
  (id, invoice_id, product_id, quantity, unit_cost, discount, tax, total)
VALUES
  ('91000000-0000-4000-8000-000001', '90000000-0000-4000-8000-000001', '70000000-0000-4000-8000-000001', 300, 430, 0, 19350, 148350),
  ('91000000-0000-4000-8000-000002', '90000000-0000-4000-8000-000001', '70000000-0000-4000-8000-000004', 800, 90, 0, 10800, 82800),
  ('91000000-0000-4000-8000-000003', '90000000-0000-4000-8000-000001', '70000000-0000-4000-8000-000009', 30, 5200, 0, 23400, 179400),
  ('91000000-0000-4000-8000-000004', '90000000-0000-4000-8000-000002', '70000000-0000-4000-8000-000002', 100, 1200, 0, 18000, 138000),
  ('91000000-0000-4000-8000-000005', '90000000-0000-4000-8000-000002', '70000000-0000-4000-8000-000007', 200, 780, 0, 23400, 179400)
ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, unit_cost = EXCLUDED.unit_cost, tax = EXCLUDED.tax, total = EXCLUDED.total;

-- مبيعات: تجزئة نقدية، بيع جملة بتحويل، وبيع آجل لمطعم وبقالة صغيرة في اليمن.
INSERT INTO public.sales_invoices
  (id, invoice_number, customer_id, warehouse_id, status, subtotal, discount, tax, total, paid, payment_method, note, created_by, created_at, updated_at)
VALUES
  ('90000000-0000-4000-8000-000011', 'SAB-S-0001', '60000000-0000-4000-8000-000004', '40000000-0000-4000-8000-000002', 'completed', 10100, 0, 1515, 11615, 11615, 'cash', 'بيع تجزئة من المعرض', NULL, '2026-10-03T13:00:00+00:00', '2026-10-03T13:00:00+00:00'),
  ('90000000-0000-4000-8000-000012', 'SAB-S-0002', '60000000-0000-4000-8000-000001', '40000000-0000-4000-8000-000001', 'completed', 19600, 0, 2940, 22540, 22540, 'bank_transfer', 'توريد جملة لبقالة بلقيس', NULL, '2026-10-03T13:10:00+00:00', '2026-10-03T13:10:00+00:00'),
  ('90000000-0000-4000-8000-000013', 'SAB-S-0003', '60000000-0000-4000-8000-000003', '40000000-0000-4000-8000-000001', 'completed', 30000, 0, 4500, 34500, 0, 'credit', 'توريد غذائي آجل لمطاعم النهضة', NULL, '2026-10-03T13:20:00+00:00', '2026-10-03T13:20:00+00:00')
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, subtotal = EXCLUDED.subtotal, tax = EXCLUDED.tax, total = EXCLUDED.total, paid = EXCLUDED.paid, payment_method = EXCLUDED.payment_method, updated_at = EXCLUDED.updated_at;

INSERT INTO public.sales_invoice_items
  (id, invoice_id, product_id, quantity, unit_price, discount, tax, total)
VALUES
  ('a1000000-0000-4000-8000-000001', '90000000-0000-4000-8000-000011', '70000000-0000-4000-8000-000001', 4, 650, 0, 390, 2990),
  ('a1000000-0000-4000-8000-000002', '90000000-0000-4000-8000-000011', '70000000-0000-4000-8000-000004', 20, 150, 0, 450, 3450),
  ('a1000000-0000-4000-8000-000003', '90000000-0000-4000-8000-000011', '70000000-0000-4000-8000-000008', 4, 2200, 0, 1320, 10120),
  ('a1000000-0000-4000-8000-000004', '90000000-0000-4000-8000-000012', '70000000-0000-4000-8000-000001', 20, 560, 0, 1680, 12880),
  ('a1000000-0000-4000-8000-000005', '90000000-0000-4000-8000-000012', '70000000-0000-4000-8000-000004', 50, 125, 0, 937.5, 7187.5),
  ('a1000000-0000-4000-8000-000006', '90000000-0000-4000-8000-000012', '70000000-0000-4000-8000-000005', 40, 85, 0, 510, 3910),
  ('a1000000-0000-4000-8000-000007', '90000000-0000-4000-8000-000013', '70000000-0000-4000-8000-000003', 10, 2050, 0, 3075, 23575),
  ('a1000000-0000-4000-8000-000008', '90000000-0000-4000-8000-000013', '70000000-0000-4000-8000-000007', 5, 1020, 0, 765, 5865),
  ('a1000000-0000-4000-8000-000009', '90000000-0000-4000-8000-000013', '70000000-0000-4000-8000-000008', 1, 1870, 0, 280.5, 2150.5)
ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price, tax = EXCLUDED.tax, total = EXCLUDED.total;

-- مصروفات تشغيلية للتقارير المالية
INSERT INTO public.expense_categories (id, name, name_ar, created_at) VALUES
  ('99000000-0000-4000-8000-000011', 'Demo rent', 'إيجار المعرض', '2026-10-03T14:00:00+00:00'),
  ('99000000-0000-4000-8000-000012', 'Demo transport', 'نقل وتوصيل', '2026-10-03T14:01:00+00:00')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.expenses
  (id, category_id, amount, payment_method, expense_date, note, created_by, created_at, updated_at)
VALUES
  ('99000000-0000-4000-8000-000013', '99000000-0000-4000-8000-000011', 180000, 'cash', '2026-10-01', 'إيجار معرض التجزئة - بيانات تجريبية', NULL, '2026-10-03T14:10:00+00:00', '2026-10-03T14:10:00+00:00'),
  ('99000000-0000-4000-8000-000014', '99000000-0000-4000-8000-000012', 45000, 'cash', '2026-10-02', 'توصيل طلبية إلى بقالة بلقيس', NULL, '2026-10-03T14:11:00+00:00', '2026-10-03T14:11:00+00:00')
ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, payment_method = EXCLUDED.payment_method, expense_date = EXCLUDED.expense_date, note = EXCLUDED.note, updated_at = EXCLUDED.updated_at;

COMMIT;

-- تحقق سريع بعد التنفيذ (اختياري في SQL Editor):
-- SELECT count(*) AS products FROM public.products WHERE sku LIKE 'SAB-FOD-%';
-- SELECT count(*) AS sales FROM public.sales_invoices WHERE invoice_number LIKE 'SAB-S-%';
-- SELECT count(*) AS stock_rows FROM public.inventory WHERE id::text LIKE '80000000-%';
