-- المرحلة 1: إسقاط الدوال الميتة (Architecture v2 — Backend هو مركز المنطق)
-- القاعدة: لا مستدعين في الكود (src + tests + seeds + functions) ولا داخل القاعدة.
-- المنهجية والأدلة: docs/architecture/adr/DECISIONS-LOG.md
-- يستخدم حلقة pg_proc لإسقاط كل overloads بالاسم مهما اختلف التواقيع بين البيئات.
-- استثناءات مؤجلة (موثقة): grain_types_output_map_ratio_is_valid (قيد CHECK)،
-- customer_balance_reconciliation_report (اختبار قبول)، platform_admin_audit_self (اختبار قبول).
-- المراجع النصية داخل rpc_allowlist (مصفوفة أسماء تاريخية) لا تُعد استدعاءً.

DO $$
DECLARE
  r record;
  targets text[] := ARRAY[
    'customer_balance_stamp_after_sale',
    'customer_ledger_balance',
    'customer_ledger_time_mismatches',
    'expense_can_write_document',
    'expense_ledger_summary',
    'expense_line_tax',
    'has_any_role',
    'migrate_legacy_expenses',
    'payment_methods_seed_is_identity_owned',
    'post_stock_settlement',
    'production_allocate_joint_cost',
    'production_lock_material_scope',
    'production_order_cost_check',
    'recalculate_all_customer_balances',
    'sale_line_unit_cost',
    'sales_invoice_tender_breakdown',
    'set_company_item_policy',
    'set_standard_costs',
    'warehouse_reference_counts',
    'resolve_product_barcode',
    'search_products',
    'get_batch_settings',
    'is_system_supplier',
    'consume_internal_supplies',
    'create_expense'
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
