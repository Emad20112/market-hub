-- المرحلة 5: إسقاط دوال المبيعات المنقولة إلى Backend
-- (create_sale بكل overloads، create_sales_return، adjust_loyalty)
-- إثبات التكافؤ: src/server/__tests__/phase5-equivalence.test.ts
-- ملاحظات انتقالية (DECISIONS-LOG):
--  - recalculate_customer_balance / customer_balance_lock تبقى في القاعدة
--    (مستدعون SQL باقون في الخزينة ومشغلات دفتر العميل) — تُستدعى من Use Cases.
--  - post_stock_delta يبقى جسرًا انتقاليًا حتى المرحلة 13 (قرار المرحلة 4)؛
--    Use Cases المبيعات تستدعي المحرك الجديد مباشرة (TS) — لا اعتماد خلفي.
--  - resolve_writable_payment_method / payment_method_ledger_account تبقى
--    (كتالوج طرق الدفع ومشغلاته) حتى المرحلة 7.
--  - post_sales_invoice / balance_and_post_return تبقى (المحاسبة) حتى المرحلة 9.

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'create_sale',
    'create_sales_return',
    'adjust_loyalty'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY targets LOOP
    FOR r IN
      SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = t
    LOOP
      EXECUTE format('DROP FUNCTION %s', r.oid::regprocedure);
    END LOOP;
  END LOOP;
END $$;
