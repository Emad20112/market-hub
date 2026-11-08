-- المرحلة 10a: نواة المصاريف منقولة إلى Backend
-- (expense_can، expense_assert_capability، expense_round، expense_settlement_status،
--  expense_line_net، expense_line_production_base_amount، expense_required_approval_rank،
--  expense_log_action، expense_posting_account_code، expense_write_supplier_ledger،
--  expense_reverse_supplier_ledger)
-- إثبات التكافؤ: 4/4 (src/server/__tests__/phase10-equivalence.test.ts) —
-- أهمها اكتشاف انحراف float في التقريب: 1.005 يجب أن تدور 1.01 (numeric نصف-أعلى).
-- الإسقاط مؤجل للمرحلة 13: الدوال تُستهلك داخل دوال دورة حياة المصاريف الباقية
-- (submit/decide/post/update_v2 — المرحلة 10b) ومشغلات القاعدة.

DO $$
BEGIN
  RAISE NOTICE 'Phase 10a: expense core helpers moved to Backend. Drops deferred (SQL callers remain).';
END $$;
