-- ============================================================================
-- platform_modules — the module registry
--
-- The application reads these rows to decide which features exist and which are
-- enabled per tenant. Without them the module guard disables every screen.
-- This is operational data, not demo data: it is identical for every customer.
--
-- AUTO-RUN on `supabase db reset`. Idempotent: ON CONFLICT on a real business
-- key, never on a random UUID. See supabase/MIGRATIONS_RULES.md.
-- ============================================================================

BEGIN;

INSERT INTO public.platform_modules (id, name, description, category, dependencies, nav_items, routes, is_active) VALUES
  ('advanced_accounting', '{"ar":"المحاسبة والتقارير الختامية","en":"Advanced Accounting"}'::jsonb, '{"ar":"دفتر اليومية، ميزان المراجعة، قائمة الدخل، والميزانية العمومية","en":"Daily Journal, Trial Balance, Income Statement, and Balance Sheet"}'::jsonb, 'enterprise', '{"core","expenses"}'::text[], '{"/daily-journal","/trial-balance","/income-statement","/balance-sheet"}'::text[], '{"/_app/daily-journal","/_app/trial-balance","/_app/income-statement","/_app/balance-sheet"}'::text[], true),
  ('analytics', '{"ar":"التحليلات المتقدمة والتقارير","en":"Advanced Analytics"}'::jsonb, '{"ar":"لوحات بيانية موسعة، تحليلات الأداء والربحية وتقارير المبيعات","en":"In-depth visual charts, profitability insights and detailed reports"}'::jsonb, 'enterprise', '{"core"}'::text[], '{"/analytics","/reports"}'::text[], '{"/_app/analytics","/_app/reports"}'::text[], true),
  ('audit', '{"ar":"سجل تدقيق العمليات","en":"Audit Logs Viewer"}'::jsonb, '{"ar":"تتبع كل الحركات الإدارية والمالية مع تفاصيل المستخدم والوقت","en":"View system audit trail and operational action logs"}'::jsonb, 'enterprise', '{"core"}'::text[], '{"/audit"}'::text[], '{"/_app/audit"}'::text[], true),
  ('barcode', '{"ar":"الباركود وطباعة الملصقات","en":"Barcode & Label Printing"}'::jsonb, '{"ar":"توليد ملصقات الباركود، قراءة الكاميرا والماسح الضوئي","en":"Generate barcodes, scan via camera/hardware scanner"}'::jsonb, 'addon', '{"core"}'::text[], '{"/barcodes"}'::text[], '{"/_app/barcodes"}'::text[], true),
  ('batches', '{"ar":"تتبع الدفعات وتواريخ الانتهاء","en":"Batch & Expiry Tracking"}'::jsonb, '{"ar":"تتبع أرقام التشغيلات وتواريخ الصلاحية للأدوية والأغذية","en":"Track lot numbers and expiration dates"}'::jsonb, 'addon', '{"core"}'::text[], '{"/batches"}'::text[], '{"/_app/batches"}'::text[], true),
  ('core', '{"ar":"النظام الأساسي","en":"Core ERP"}'::jsonb, '{"ar":"المنتجات، المبيعات، العملاء، المخزون الأساسي، الإعدادات","en":"Products, Basic Sales, Customers, Settings"}'::jsonb, 'core', '{}'::text[], '{"/dashboard","/products","/catalog","/inventory","/sales","/customers","/settings","/notifications"}'::text[], '{"/_app/dashboard","/_app/products","/_app/catalog","/_app/inventory","/_app/sales","/_app/customers","/_app/settings","/_app/notifications"}'::text[], true),
  ('expenses', '{"ar":"المصروفات التشغيلية","en":"Expenses"}'::jsonb, '{"ar":"تتبع بنود الصرف والمصروفات الإدارية والتشغيلية","en":"Track operational and administrative expenses"}'::jsonb, 'module', '{"core"}'::text[], '{"/finance"}'::text[], '{"/_app/finance"}'::text[], true),
  ('loyalty', '{"ar":"برنامج ولاء ونقاط العملاء","en":"Loyalty Program"}'::jsonb, '{"ar":"احتساب نقاط المكافآت واستبدالها بحركات مشتريات","en":"Reward points and loyalty tracking for customers"}'::jsonb, 'addon', '{"core"}'::text[], '{"/loyalty"}'::text[], '{"/_app/loyalty"}'::text[], true),
  ('milling_operations', '{"ar":"إدارة المطاحن والأمانات","en":"Flour Mill & Toll Processing"}'::jsonb, '{"ar":"استلام حبوب العملاء كأمانات، أوامر الطحن، توزيع النواتج على الأكياس، فواتير أجور الطحن، و إذون تسليم النواتج — بفصل تام عن المخزون التجاري.","en":"Customer grain custody, milling jobs, bag-based output distribution, toll service invoices and delivery notes — fully separated from commercial stock."}'::jsonb, 'enterprise', '{"core"}'::text[], '{"/milling","/milling/intake","/milling/jobs","/milling/delivery","/milling/customer-statement"}'::text[], '{"/_app/milling","/_app/milling/intake","/_app/milling/jobs","/_app/milling/delivery","/_app/milling/customer-statement"}'::text[], true),
  ('multi_warehouse', '{"ar":"تعدد المستودعات والتحويلات","en":"Multi-Warehouse & Transfers"}'::jsonb, '{"ar":"إدارة فروع ومستودعات متعددة، ومناقلات المخزون بين الفروع","en":"Multiple branches/warehouses and inter-warehouse stock transfers"}'::jsonb, 'addon', '{"core"}'::text[], '{"/warehouses","/transfers"}'::text[], '{"/_app/warehouses","/_app/transfers"}'::text[], true),
  ('payments', '{"ar":"التحصيلات والديون وكشوف الحساب","en":"Receivables & Payments"}'::jsonb, '{"ar":"تسجيل سندات القبض، كشوف حسابات العملاء، إدارة سقف الديون","en":"Payment receipts, customer statements and credit tracking"}'::jsonb, 'module', '{"core"}'::text[], '{"/payments","/debts","/account-statement"}'::text[], '{"/_app/payments","/_app/debts","/_app/account-statement"}'::text[], true),
  ('pos', '{"ar":"نقطة البيع السريعة (POS)","en":"Point of Sale"}'::jsonb, '{"ar":"واجهة الكاشير السريعة والباركود والطباعة الفورية","en":"Fast cashier interface with direct scanning and printing"}'::jsonb, 'module', '{"core"}'::text[], '{"/pos"}'::text[], '{"/_app/pos"}'::text[], true),
  ('purchases', '{"ar":"المشتريات والموردين","en":"Purchases & Suppliers"}'::jsonb, '{"ar":"إدارة فواتير الشراء، حسابات الموردين، وإدخال المخزون","en":"Purchase invoices, vendor management and receiving"}'::jsonb, 'module', '{"core"}'::text[], '{"/purchases","/suppliers"}'::text[], '{"/_app/purchases","/_app/suppliers"}'::text[], true),
  ('returns', '{"ar":"إدارة المرتجعات","en":"Returns Management"}'::jsonb, '{"ar":"مرتجعات المبيعات والمشتريات وتسوية المخزون والذمم","en":"Sales returns and purchase returns with inventory adjustments"}'::jsonb, 'module', '{"core"}'::text[], '{"/sales-returns","/purchase-returns"}'::text[], '{"/_app/sales-returns","/_app/purchase-returns"}'::text[], true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
