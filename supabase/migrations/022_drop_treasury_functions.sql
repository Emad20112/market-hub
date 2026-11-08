-- المرحلة 7: إسقاط دوال الخزينة المنقولة إلى Backend
-- (record_customer_payment بكل overloads، record_customer_payment_splits،
--  record_customer_advance_payment، record_supplier_payment بكل overloads)
-- إثبات التكافؤ: 4/4 سيناريوهات على بيانات حقيقية
-- (src/server/__tests__/phase7-equivalence.test.ts).
-- ملاحظات انتقالية (DECISIONS-LOG):
--  - recalculate_customer_balance / customer_balance_lock تبقيان في القاعدة:
--    مُشغّل حي (tg_customer_ledger_sync_balance) يستدعي recalculate_customer_balance،
--    والإسقاط مؤجل حتى مرحلة المحاسبة (9) عندما تُعالَج المشغلات.
--  - create_journal_entry يبقى (المحاسبة، المرحلة 9) ويُستدعى انتقاليًا.
--  - resolve_writable_payment_method / resolve_document_settlement_account /
--    payment_method_ledger_account تبقى (كتالوج طرق الدفع ومشغلاته) — 7b.
--  - next_supplier_voucher_number يبقى (تسلسل الترقيم مشترك مع دوال أخرى محتملة).

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'record_customer_payment',
    'record_customer_payment_splits',
    'record_customer_advance_payment',
    'record_supplier_payment'
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
