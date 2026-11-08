-- المرحلة 13 (الجزء 1): تشديد الحظر — السطح العمومي لدوال RPC يصير خطأً
--
-- ما يفعله هذا الترحيل:
--  1. إعادة بناء rpc_allowlist() بقائمة مقلّمة: أسماء الدوال المنقولة إلى
--     Backend (018-028) والميتة خرجت، وأسماء الطحن/الأصول/الضرائب/الإعدادات
--     الحية بقيت، مع إضافة الأسماء الحية التي كانت غائبة عن القائمة القديمة
--     (custody_intake_multi، custody_milling_multi، custody_adjustment،
--     custody_delivery، custody_grain_items، custody_output_items،
--     milling_document_process، create_milling_service_document_multi_priced،
--     save_expense_dimension، expense_role_rank).
--  2. الحظر الصارم: كل دالة في public غير مدرجة في القائمة تُسحب صلاحية
--     EXECUTE منها من PUBLIC وanon — نداءها عبر PostgREST يصير permission
--     denied (error) بدل التوثيق الصامت في القائمة القديمة.
--  3. service_role يُمنح EXECUTE صراحة على كل دوال public (الجسور الداخلية
--     للباك اند تُستدعى عبر SQL بمعاملة service — لا تتأثر).
--  4. الدوال المدرجة تُمنح EXECUTE صراحة لـ authenticated (إسقاط GRANT الافتراضي
--     عبر PUBLIC يُفقد الموروث).
--
-- الحدود (DECISIONS-LOG): السحب من authenticated الكامل مؤجل للجزء 2 بعد نقل
-- الطحن/العهدة و9b — تبقى أسماء حية يستدعيها الواجهة مباشرة: create_purchase،
-- post_stock_delta، recalculate_customer_balance، approve_item_policy_change،
-- save_product_uom_settings، وكل ماسمي أعلاه من الطحن والإعدادات.

CREATE OR REPLACE FUNCTION public.rpc_allowlist() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT ARRAY[
    -- ── حيّة تستدعيها الواجهة مباشرة ──
    'create_purchase', 'create_stock_transfer',
    'post_stock_delta', 'post_opening_balance', 'reverse_opening_balance',
    'recalculate_customer_balance',
    'approve_item_policy_change', 'save_product_uom_settings',
    'search_products', 'item_line_type', 'item_stock_effect',
    'item_effective_policy', 'item_has_stock_history', 'resolve_unit_cost',
    'clear_cheque', 'bounce_cheque',
    -- ── الطحن والعهدة (لم تُنقل بعد — المرحلة 10/13 جزء 2) ──
    'custody_intake', 'custody_intake_multi',
    'custody_milling', 'custody_milling_multi',
    'custody_deliver', 'custody_adjust', 'custody_adjustment',
    'custody_delivery', 'custody_balances', 'custody_link_invoice',
    'custody_grain_items', 'custody_output_items',
    'create_milling_service_document', 'create_milling_service_document_multi',
    'create_milling_service_document_multi_priced',
    'milling_document_process', 'milling_document_delivery',
    'consume_internal_supplies',
    'milling_custody_intake', 'milling_custody_issue_milling',
    'milling_custody_deliver', 'milling_custody_adjust',
    -- ── الأصول والضرائب والإقفال السنوي (9b — لم تُنقل بعد) ──
    'activate_fixed_asset', 'dispose_fixed_asset',
    'run_depreciation', 'run_batch_depreciation',
    'run_contract_amortization', 'run_batch_amortization',
    'close_fiscal_year', 'open_fiscal_year',
    'generate_tax_declaration', 'settle_tax_period', 'pay_tax_settlement',
    -- ── إعدادات المصاريف وطرق الدفع ──
    'save_expense_category', 'delete_expense_category', 'save_expense_dimension',
    'create_tenant_payment_method', 'update_payment_method_identity',
    'remove_tenant_payment_method', 'payment_method_account_linkage',
    'set_payment_method_default_account',
    -- ── الترقيم ──
    'fn_format_document_number', 'fn_resolve_document_numbering',
    'fn_document_numbering_sequence_name',
    -- ── النظام والمساعدات (تُستدعى تحت authenticated من الباك اند أيضًا) ──
    'has_role', 'is_staff', 'is_platform_admin', 'is_platform_superadmin',
    'can_read_finance', 'can_read_expense_entry', 'can_author_payment_methods',
    'can_operate_milling', 'can_view_milling', 'expense_role_rank',
    'expense_can', 'platform_admin_audit_self', 'sync_apply_operation',
    'is_system_customer', 'is_system_supplier',
    'customer_balance_reconciliation_report'
  ];
$$;

DO $$
DECLARE
  v_fn record;
  v_allowed text[];
  v_name text;
  v_granted int := 0;
  v_revoked int := 0;
BEGIN
  SELECT public.rpc_allowlist() INTO v_allowed;

  -- (3) service_role: EXECUTE صريح على كل دوال public.
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_fn.sig || ' TO service_role';
    v_granted := v_granted + 1;
  END LOOP;

  -- (4) المدرجة: EXECUTE صريح لـ authenticated.
  FOR v_name IN SELECT unnest(v_allowed)
  LOOP
    FOR v_fn IN
      SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
         AND p.prokind = 'f'
    LOOP
      EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_fn.sig || ' TO authenticated';
      v_granted := v_granted + 1;
    END LOOP;
  END LOOP;

  -- (2) غير المدرجة: سحب EXECUTE من PUBLIC وanon (الحظر يصير error).
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig, p.proname AS name
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND NOT (p.proname = ANY (v_allowed))
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_fn.sig || ' FROM PUBLIC, anon';
    v_revoked := v_revoked + 1;
  END LOOP;

  RAISE NOTICE 'Phase 13.1: allowlist enforced — % grants, % revokes from PUBLIC/anon.', v_granted, v_revoked;
END $$;
