-- ============================================================================
-- accounts — the chart of accounts
--
-- The posting engine resolves account CODES ('1101', '4111', '5111'...) in its
-- SQL. A missing account makes every posting that touches it fail. The chart is
-- structural reference data, identical for every customer; a business extends it
-- with its own sub-accounts.
-- 
-- is_system marks the accounts the engine writes; is_postable=false marks a
-- contra account (1491 accumulated depreciation) that must not be posted to
-- directly.
--
-- AUTO-RUN on `supabase db reset`. Idempotent: ON CONFLICT on a real business
-- key, never on a random UUID. See supabase/MIGRATIONS_RULES.md.
-- ============================================================================

BEGIN;

INSERT INTO public.accounts
  (code, name_ar, account_type, is_system, is_postable, requires_reconciliation, notes)
VALUES
  ('1101', 'النقدية بالصندوق', 'ASSET', true, true, true, NULL),
  ('1111', 'البنك الأهلي اليمني', 'ASSET', true, true, true, NULL),
  ('1112', 'بنك مناحي كمر', 'ASSET', true, true, true, NULL),
  ('1121', 'بنك اليمن الدولي', 'ASSET', true, true, true, NULL),
  ('1211', 'ذمم العملاء', 'ASSET', true, true, false, NULL),
  ('1311', 'مخزون مواد خام', 'ASSET', true, true, false, NULL),
  ('1312', 'مخزون إنتاج تحت التنفيذ', 'ASSET', true, true, false, NULL),
  ('1313', 'مخزون دقيق — منتج نهائي', 'ASSET', true, true, false, NULL),
  ('1314', 'مخزون نواتج جانبية (نخالة)', 'ASSET', true, true, false, NULL),
  ('1315', 'مخزون مواد تعبئة', 'ASSET', true, true, false, NULL),
  ('1316', 'ضريبة القيمة المضافة على المشتريات', 'ASSET', true, true, false, 'ضريبة مدخلات قابلة للاسترداد — أصل لا يُرسَّم في تكلفة البضاعة.'),
  ('1411', 'أجهزة ومعدات المطحنة', 'ASSET', true, true, false, NULL),
  ('1421', 'مركبات ونقل', 'ASSET', true, true, false, NULL),
  ('1431', 'أثاث ومعدات مكتبية', 'ASSET', true, true, false, NULL),
  ('1491', 'مجمع إهلاك الأصول الثابتة', 'ASSET', true, false, false, NULL),
  ('2111', 'ذمم الموردين', 'LIABILITY', true, true, false, NULL),
  ('2211', 'قروض بنكية قصيرة الأجل', 'LIABILITY', true, true, false, NULL),
  ('2311', 'ضريبة القيمة المضافة المستحقة', 'LIABILITY', true, true, false, NULL),
  ('3111', 'رأس المال', 'EQUITY', true, true, false, NULL),
  ('3211', 'مسحوبات المالك', 'EQUITY', true, true, false, NULL),
  ('3911', 'أرباح محتجزة', 'EQUITY', true, true, false, NULL),
  ('4111', 'إيراد بيع الدقيق', 'REVENUE', true, true, false, NULL),
  ('4211', 'إيراد بيع النخالة', 'REVENUE', true, true, false, NULL),
  ('4311', 'إيراد أجور الطحن (خدمات)', 'REVENUE', true, true, false, NULL),
  ('4911', 'إيرادات أخرى', 'REVENUE', false, true, false, NULL),
  ('5111', 'تكلفة البضاعة المباعة', 'EXPENSE', true, true, false, NULL),
  ('5211', 'أجور العمالة', 'EXPENSE', true, true, false, NULL),
  ('5311', 'كهرباء ووقود', 'EXPENSE', true, true, false, NULL),
  ('5411', 'إيجارات', 'EXPENSE', true, true, false, NULL),
  ('5511', 'مصروفات إدارية وعمومية', 'EXPENSE', true, true, false, NULL),
  ('5611', 'إهلاك الأصول الثابتة', 'EXPENSE', true, true, false, NULL),
  ('5911', 'مصروفات أخرى', 'EXPENSE', false, true, false, 'مصروفات متنوعة تُرحَّل مباشرة')
ON CONFLICT (code) DO NOTHING;

COMMIT;
