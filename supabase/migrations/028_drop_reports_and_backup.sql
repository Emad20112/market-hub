-- المرحلة 12: إسقاط دوال التقارير والنسخ الاحتياطي المنقولة إلى Backend
-- (list_expenses، expense_detail، expense_summary، expense_report، expense_lookups،
--  milling_service_cost_report، get_supplier_statement، get_chart_of_accounts_tree،
--  backup_export_all، backup_restore_all، backup_schema_fingerprint)
-- إثبات التكافؤ: src/server/__tests__/phase12-equivalence.test.ts (قائمة/ملخص/شجرة/كشف).
-- تبقى في القاعدة:
--  - sync_apply_operation: بلا مستدعي واجهة (تدقيق حي معلّق — DECISIONS-LOG).
-- الواجهة تستهلك الآن src/server/api/reports/* — لا استدعاء RPC حي متبقٍ.

DO $$
DECLARE
  v_fn record;
  v_names text[] := ARRAY[
    'list_expenses',
    'expense_detail',
    'expense_summary',
    'expense_report',
    'expense_lookups',
    'milling_service_cost_report',
    'get_supplier_statement',
    'get_chart_of_accounts_tree',
    'backup_export_all',
    'backup_restore_all',
    'backup_schema_fingerprint'
  ];
  v_dropped int := 0;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (v_names)
  LOOP
    EXECUTE 'DROP FUNCTION ' || v_fn.sig;
    v_dropped := v_dropped + 1;
  END LOOP;
  RAISE NOTICE 'Phase 12: dropped % report/backup overloads.', v_dropped;
END $$;
