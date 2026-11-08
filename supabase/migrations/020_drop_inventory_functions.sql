-- المرحلة 3: إسقاط دوال المخزون الثابت المنقولة إلى Backend
-- (product_reference_counts، product_delete_guard، save_product_batch،
--  delete_product_batch، get_batch_kpis، reconcile_batches_with_inventory،
--  receive_customer_owned_stock، release_customer_owned_stock، save_item_policy)
-- إثبات التكافؤ: 4/4 سيناريوهات على 43 منتجًا حقيقيًا
-- (src/server/__tests__/phase3-equivalence.test.ts).
-- ملاحظة انتقالية: post_stock_delta يبقى في القاعدة حتى المرحلة 4، ويُستدعى
-- من Use Cases عبر SQL داخل المعاملة (DECISIONS-LOG).

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'product_reference_counts',
    'product_delete_guard',
    'save_product_batch',
    'delete_product_batch',
    'get_batch_kpis',
    'reconcile_batches_with_inventory',
    'receive_customer_owned_stock',
    'release_customer_owned_stock',
    'save_item_policy'
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
