-- المرحلة 11: إسقاط دوال الإنتاج المنقولة إلى Backend
-- (create_and_post_production_order، create_production_order، complete_production_order،
--  smart_manufacture ×4 overloads، reverse_production_order، production_order_history،
--  production_cost_sources، production_order_cost_check، production_order_cost_detail،
--  convert_stock، production_expense_line_available)
-- إثبات التكافؤ: src/server/__tests__/phase11-equivalence.test.ts
-- تبقى في القاعدة (تستهلكها مشغلات/RLS/دوال باقية — إسقاطها في المرحلة 13):
--   production_quantity_in_base، production_mass_in_kg،
--   production_inventory_account_code، production_output_has_downstream_use،
--   guard_reverse_production_with_shared_expenses، production_lock_material_scope،
--   production_guard_cost_allocation_write، guard_company_production_material_scope،
--   guard_production_company_stock_scope، guard_allocated_expense_reversal،
--   production_guard_posted_void_output، production_link_movement_to_order،
--   set_production_expense_category_eligibility (010).
-- الواجهة تستهلك الآن src/server/api/production/* — لا استدعاء RPC حي متبقٍ
-- (تحقق grep على src كاملًا).

DO $$
DECLARE
  v_fn record;
  v_names text[] := ARRAY[
    'create_and_post_production_order',
    'create_production_order',
    'complete_production_order',
    'smart_manufacture',
    'reverse_production_order',
    'production_order_history',
    'production_cost_sources',
    'production_order_cost_check',
    'production_order_cost_detail',
    'convert_stock',
    'production_expense_line_available'
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
  RAISE NOTICE 'Phase 11: dropped % production overloads.', v_dropped;
END $$;
