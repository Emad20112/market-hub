-- المرحلة 8: إسقاط دوال المشتريات المنقولة إلى Backend
-- (create_purchase بكل overloads، create_purchase_return، post_purchase_invoice)
-- إثبات التكافؤ: 3/3 سيناريوهات (src/server/__tests__/phase8-equivalence.test.ts)
-- ملاحظة مهمة: create_purchase_return القديمة كانت معطوبة إنتاجيًا (عيب
-- coalesce(r.item_class,'GOOD') على enum — ينهار لأي مرتجع مخزون) — النسخة
-- الجديدة تُصلح العيب؛ العيب موثق بالاختبار (DECISIONS-LOG).
-- ملاحظات انتقالية: create_journal_entry / balance_and_post_return تبقى (9)،
-- كتالوج طرق الدفع يبقى (7b).

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'create_purchase',
    'create_purchase_return',
    'post_purchase_invoice'
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
