
## 003_catalog_reference.sql
- -> 002_identity_settings_platform_audit.sql (2): has_role, is_staff

## 004_partners_and_ledgers.sql
- -> 002_identity_settings_platform_audit.sql (5): can_read_finance, has_role, tg_set_updated_at, tg_customers_system_guard, is_staff

## 005_products_and_inventory.sql
- -> 002_identity_settings_platform_audit.sql (4): is_staff, has_role, tg_set_updated_at, sync_item_class_from_policy

## 006_stock_movements_and_costing.sql
- -> 002_identity_settings_platform_audit.sql (4): company_costing_method, has_role, is_staff, can_read_finance
- -> 005_products_and_inventory.sql (4): item_effective_policy, audit_item_policy_snapshot, approve_item_policy_change, guard_production_company_stock_scope

## 007_sales_and_collections.sql
- -> 002_identity_settings_platform_audit.sql (5): is_staff, can_read_finance, business_timezone, has_role, tg_set_updated_at
- -> 005_products_and_inventory.sql (2): item_line_type, enforce_invoice_product_flags
- -> 006_stock_movements_and_costing.sql (2): item_stock_effect, resolve_unit_cost
- -> 004_partners_and_ledgers.sql (1): is_system_customer

## 008_purchasing_and_returns.sql
- -> 002_identity_settings_platform_audit.sql (3): has_role, is_staff, tg_set_updated_at
- -> 005_products_and_inventory.sql (2): item_line_type, enforce_invoice_product_flags
- -> 006_stock_movements_and_costing.sql (2): item_stock_effect, item_has_stock_history

## 009_accounting_ledger.sql
- -> 002_identity_settings_platform_audit.sql (3): has_role, can_read_finance, is_staff
- -> 006_stock_movements_and_costing.sql (3): post_stock_delta, apply_cost_movement, next_stock_adjustment_number
- -> 005_products_and_inventory.sql (1): item_effective_policy
- -> 011_treasury_and_payment_methods.sql (1): payment_method_ledger_account

## 010_expenses.sql
- -> 002_identity_settings_platform_audit.sql (5): is_staff, expense_role_rank, can_read_finance, has_role, tg_set_updated_at
- -> 009_accounting_ledger.sql (1): reverse_journal_entry

## 011_treasury_and_payment_methods.sql
- -> 002_identity_settings_platform_audit.sql (7): has_role, is_platform_superadmin, business_today, business_now, business_timestamp, tg_set_updated_at, is_staff
- -> 010_expenses.sql (7): expense_actor, expense_assert_capability, expense_require_override_reason, expense_posting_account_code, expense_log_action, expense_write_supplier_ledger, expense_round
- -> 009_accounting_ledger.sql (3): create_journal_entry, post_journal_entry, post_sales_invoice_cogs
- -> 007_sales_and_collections.sql (2): customer_balance_lock, recalculate_customer_balance
- -> 004_partners_and_ledgers.sql (1): next_supplier_voucher_number

## 012_milling_and_custody.sql
- -> 011_treasury_and_payment_methods.sql (5): derive_payment_status, post_sales_invoice, resolve_writable_payment_method, post_purchase_invoice, payment_method_ledger_account
- -> 005_products_and_inventory.sql (5): product_uom_factor, product_quantity_in_base, item_line_type, product_uom_price, item_effective_policy
- -> 002_identity_settings_platform_audit.sql (4): is_staff, is_platform_superadmin, has_role, is_platform_admin
- -> 010_expenses.sql (4): expense_actor, expense_assert_capability, expense_write_lines, expense_log_action
- -> 007_sales_and_collections.sql (3): resolve_sale_line, customer_balance_lock, recalculate_customer_balance
- -> 006_stock_movements_and_costing.sql (2): post_stock_delta, item_stock_effect
- -> 009_accounting_ledger.sql (2): create_journal_entry, balance_and_post_return
- -> 003_catalog_reference.sql (2): fn_resolve_document_numbering, fn_format_document_number
- -> 004_partners_and_ledgers.sql (1): customer_credit_limit_allows
- -> 016_post_sales_invoice_revenue_guard.sql (1): post_sales_invoice
- -> 008_purchasing_and_returns.sql (1): resolve_purchase_line

## 013_production.sql
- -> 005_products_and_inventory.sql (6): item_effective_policy, production_quantity_in_base, production_mass_in_kg, production_product_is_company_stock, production_guard_cost_allocation_write, guard_company_production_material_scope
- -> 002_identity_settings_platform_audit.sql (4): is_staff, has_role, can_read_finance, company_costing_method
- -> 009_accounting_ledger.sql (4): create_journal_entry, production_inventory_account_code, post_journal_entry, reverse_journal_entry
- -> 010_expenses.sql (2): expense_line_production_base_amount, expense_round
- -> 012_milling_and_custody.sql (1): can_operate_milling
- -> 006_stock_movements_and_costing.sql (1): post_stock_delta

## 016_post_sales_invoice_revenue_guard.sql
- -> 009_accounting_ledger.sql (2): post_sales_invoice_cogs, post_journal_entry
- -> 002_identity_settings_platform_audit.sql (1): has_role
- -> 011_treasury_and_payment_methods.sql (1): resolve_document_settlement_account
