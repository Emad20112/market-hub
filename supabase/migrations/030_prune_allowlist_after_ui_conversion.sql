-- المرحلة 13.2 (جزء 2-أ): تقليم القائمة بعد تحويل الدفعة الأولى من الواجهة
--
-- ما يفعله هذا الترحيل:
--  1. إعادة بناء rpc_allowlist() دون الأسماء التي تحولت إلى الباك اند:
--     create_purchase (×4 واجهة)، recalculate_customer_balance (شارة الكشف)،
--     save_expense_dimension (×2 إعدادات)، post_opening_balance،
--     reverse_opening_balance، clear_cheque، bounce_cheque (9b شيكات)،
--     create_stock_transfer، وpost_stock_delta (خرجت من الواجهة؛ يبقى جسرًا
--     داخليًا تحت service_role فقط).
--  2. سحب EXECUTE من authenticated لكل ما خرج من القائمة.
--  3. إسقاط الدوال التي لا مستدعي SQL داخليين لها (تحقق pg_get_functiondef
--     قبل الترحيل: صفر مستدعين للسبع) — post_stock_delta يبقى (مستدعون من
--     دوال الطحن/العهدة والإقفال الباقية في القاعدة).
--  4. service_role يُعاد منحه صراحة على كل دوال public الباقية (idempotent).
--
-- الحدود (DECISIONS-LOG): السحب الكامل المتبقي من authenticated ينتظر نقل
-- الطحن/العهدة (012) و9b الأصول/الضرائب/الإقفال وإعدادات المصاريف/طرق الدفع/
-- السياسات التي ما زالت حية في القائمة أدناه.

CREATE OR REPLACE FUNCTION public.rpc_allowlist() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT ARRAY[
    -- ── حيّة تستدعيها الواجهة مباشرة ──
    'approve_item_policy_change', 'save_product_uom_settings',
    'search_products', 'item_line_type', 'item_stock_effect',
    'item_effective_policy', 'item_has_stock_history', 'resolve_unit_cost',
    -- ── الطحن والعهدة (لم تُنقل بعد — 13.2 جزء 2-ب) ──
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
    'save_expense_category', 'delete_expense_category',
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
  v_dropped int := 0;
  v_revoked int := 0;
BEGIN
  SELECT public.rpc_allowlist() INTO v_allowed;

  -- (2) غير المدرجة: سحب EXECUTE من authenticated أيضا (وإسقاط من PUBLIC/anon
  --     صُنع في 029 لهذه نفسها؛ يُعاد وقائيًا).
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND NOT (p.proname = ANY (v_allowed))
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_fn.sig || ' FROM PUBLIC, anon, authenticated';
    v_revoked := v_revoked + 1;
  END LOOP;

  -- (3) إسقاط الدوال المحوّلة التي بلا مستدعي SQL داخليين.
  FOR v_name IN
    SELECT unnest(ARRAY[
      'create_purchase', 'post_opening_balance', 'reverse_opening_balance',
      'clear_cheque', 'bounce_cheque', 'create_stock_transfer',
      'recalculate_customer_balance', 'save_expense_dimension'
    ])
  LOOP
    FOR v_fn IN
      SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_name
         AND p.prokind = 'f'
    LOOP
      EXECUTE 'DROP FUNCTION ' || v_fn.sig;
      v_dropped := v_dropped + 1;
    END LOOP;
  END LOOP;

  -- (4) service_role: EXECUTE صريح على كل دوال public الباقية.
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_fn.sig || ' TO service_role';
  END LOOP;

  RAISE NOTICE 'Phase 13.2a: % revokes from authenticated, % functions dropped.', v_revoked, v_dropped;
END $$;

-- تحديث سجل الترحيلات (psql المحلي) — آمن للتكرار.
