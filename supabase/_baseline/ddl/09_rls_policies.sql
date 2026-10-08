ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_hoc_service_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_costing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costing_policy_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries_of_origin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_cost_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_policy_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_grain_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_intake_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_job_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_service_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milling_unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_balance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_balance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_compatibilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_opening_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_makes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_read" ON public.accounts
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "ad_hoc_service_lines_read" ON public.ad_hoc_service_lines
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Owners/managers read audit" ON public.audit_logs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "Staff insert audit" ON public.audit_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "Users can insert backup logs for their tenant" ON public.backup_logs
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));

CREATE POLICY "Users can view backup logs for their tenant" ON public.backup_logs
  AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() IS NOT NULL));

CREATE POLICY "brand_manage" ON public.brands
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "brand_view" ON public.brands
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "cat_manage" ON public.categories
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "cat_view" ON public.categories
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "costing_settings_read" ON public.company_costing_settings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "company_items_manage" ON public.company_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "company_items_staff_read" ON public.company_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "company insert" ON public.company_settings
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "company_update" ON public.company_settings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "company_view" ON public.company_settings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "costing_history_read" ON public.costing_policy_history
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "origin_staff" ON public.countries_of_origin
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "customer_ledger_view" ON public.customer_ledger
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "customer_payment_splits staff read" ON public.customer_payment_splits
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "customer_payment_splits staff write" ON public.customer_payment_splits
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "staff_view_customer_payments" ON public.customer_payments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "cust_manage" ON public.customers
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'cashier'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'cashier'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));

CREATE POLICY "cust_view" ON public.customers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Authenticated users can read device registrations" ON public.device_registrations
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "expense_approvals_read" ON public.expense_approvals
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_read_expense_entry(entry_id, auth.uid()));

CREATE POLICY "expense_attachments_delete" ON public.expense_attachments
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((expense_role_rank(auth.uid()) >= 30) AND (EXISTS ( SELECT 1
   FROM expense_entries e
  WHERE ((e.id = expense_attachments.entry_id) AND (e.status = ANY (ARRAY['DRAFT'::expense_status, 'REJECTED'::expense_status])))))));

CREATE POLICY "expense_attachments_insert" ON public.expense_attachments
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_staff(auth.uid()) AND (uploaded_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM expense_entries e
  WHERE ((e.id = expense_attachments.entry_id) AND (e.status = ANY (ARRAY['DRAFT'::expense_status, 'REJECTED'::expense_status])))))));

CREATE POLICY "expense_attachments_read" ON public.expense_attachments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_read_expense_entry(entry_id, auth.uid()));

CREATE POLICY "staff read expense cats" ON public.expense_categories
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff write expense cats" ON public.expense_categories
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "expense_cost_centers_manage" ON public.expense_cost_centers
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "expense_cost_centers_read" ON public.expense_cost_centers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "expense_entries_read" ON public.expense_entries
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((can_read_finance(auth.uid()) OR (is_staff(auth.uid()) AND (created_by = auth.uid()))));

CREATE POLICY "expense_lines_read" ON public.expense_lines
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_read_expense_entry(entry_id, auth.uid()));

CREATE POLICY "expense_payments_read" ON public.expense_payments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_read_expense_entry(entry_id, auth.uid()));

CREATE POLICY "expense_projects_manage" ON public.expense_projects
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "expense_projects_read" ON public.expense_projects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "finance read expenses" ON public.expenses
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_read_finance(auth.uid()));

CREATE POLICY "finance write expenses" ON public.expenses
  AS PERMISSIVE FOR ALL TO authenticated
  USING (can_read_finance(auth.uid()))
  WITH CHECK (can_read_finance(auth.uid()));

CREATE POLICY "inv_read_only_staff" ON public.inventory
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "inv_view" ON public.inventory
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "cost_layers_read" ON public.item_cost_layers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_staff(auth.uid()) AND ((owner_type = 'COMPANY'::owner_type) OR (owner_id = auth.uid()))));

CREATE POLICY "cost_tx_read" ON public.item_cost_transactions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_staff(auth.uid()) AND ((owner_type = 'COMPANY'::owner_type) OR (owner_id = auth.uid()))));

CREATE POLICY "item_policy_review_manage" ON public.item_policy_review_queue
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "item_policy_review_staff_read" ON public.item_policy_review_queue
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "journal_read" ON public.journal_entries
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "journal_lines_read" ON public.journal_lines
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff read loyalty" ON public.loyalty_transactions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff write loyalty" ON public.loyalty_transactions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "milling_delivery_items_read" ON public.milling_delivery_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM milling_delivery_notes d
  WHERE (d.id = milling_delivery_items.delivery_id))));

CREATE POLICY "milling_delivery_read" ON public.milling_delivery_notes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_milling());

CREATE POLICY "milling_grain_grades_read" ON public.milling_grain_grades
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "milling_intake_read" ON public.milling_intake_receipts
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_milling());

CREATE POLICY "milling_job_outputs_read" ON public.milling_job_outputs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM milling_jobs j
  WHERE (j.id = milling_job_outputs.job_id))));

CREATE POLICY "milling_jobs_read" ON public.milling_jobs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (can_view_milling());

CREATE POLICY "milling_agreements_read" ON public.milling_service_agreements
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "milling_unit_conversions_read" ON public.milling_unit_conversions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "opening_bal_read" ON public.opening_balance_documents
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "opening_bal_lines_read" ON public.opening_balance_lines
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "packaging_types_read" ON public.packaging_types
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "packaging_types_write" ON public.packaging_types
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "platform_admins_manage" ON public.platform_admins
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_platform_superadmin(auth.uid()))
  WITH CHECK (is_platform_superadmin(auth.uid()));

CREATE POLICY "platform_admins_select" ON public.platform_admins
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "platform_admins_self_read" ON public.platform_admins
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "platform_audit_logs_insert" ON public.platform_audit_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((is_platform_admin(auth.uid()) OR (auth.uid() IS NOT NULL)));

CREATE POLICY "platform_audit_logs_select" ON public.platform_audit_logs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_platform_admin(auth.uid()));

CREATE POLICY "platform_modules_read" ON public.platform_modules
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "platform_plans_read" ON public.platform_plans
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff read batches" ON public.product_batches
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Staff write batches" ON public.product_batches
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "fitment_staff" ON public.product_compatibilities
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "production_bom_lines_read" ON public.production_bom_lines
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "production_boms_read" ON public.production_boms
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "production_order_losses_read" ON public.production_order_losses
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "production_order_materials_read" ON public.production_order_materials
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "production_order_outputs_read" ON public.production_order_outputs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "production_orders_read" ON public.production_orders
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "prod_manage" ON public.products
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));

CREATE POLICY "prod_view" ON public.products
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "profiles read" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "profiles_admin_toggle_active" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR is_platform_superadmin(auth.uid())))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR is_platform_superadmin(auth.uid())));

CREATE POLICY "profiles_self_insert" ON public.profiles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "profiles_self_update" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid()));

CREATE POLICY "pur_item_manage" ON public.purchase_invoice_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));

CREATE POLICY "pur_item_view" ON public.purchase_invoice_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "pur_manage" ON public.purchase_invoices
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role) OR has_role(auth.uid(), 'warehouse'::app_role)));

CREATE POLICY "pur_view" ON public.purchase_invoices
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff read pret_i" ON public.purchase_return_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff write pret_i" ON public.purchase_return_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "staff read pret" ON public.purchase_returns
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff write pret" ON public.purchase_returns
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "quality_staff" ON public.quality_grades
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "sale_item_view" ON public.sales_invoice_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "sale_view" ON public.sales_invoices
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff read sret_i" ON public.sales_return_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff write sret_i" ON public.sales_return_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "staff read sret" ON public.sales_returns
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff write sret" ON public.sales_returns
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "stock_adjustment_items_read" ON public.stock_adjustment_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "stock_adjustments_read" ON public.stock_adjustments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "mv_view" ON public.stock_movements
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "stock_opening_items_read" ON public.stock_opening_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "stock_openings_read" ON public.stock_openings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff read xfer_i" ON public.stock_transfer_items
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff write xfer_i" ON public.stock_transfer_items
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "staff read xfer" ON public.stock_transfers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "staff write xfer" ON public.stock_transfers
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "supp_manage" ON public.suppliers
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'accountant'::app_role)));

CREATE POLICY "supp_view" ON public.suppliers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "Authenticated users can check and insert idempotency keys" ON public.sync_idempotency_keys
  AS PERMISSIVE FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_subscriptions_insert" ON public.tenant_subscriptions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "tenant_subscriptions_read" ON public.tenant_subscriptions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tenant_subscriptions_select" ON public.tenant_subscriptions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "tenant_subscriptions_update" ON public.tenant_subscriptions
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "unit_manage" ON public.units
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "unit_view" ON public.units
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));

CREATE POLICY "owner manage roles del" ON public.user_roles
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "owner manage roles ins" ON public.user_roles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "owner manage roles upd" ON public.user_roles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "roles_self_view" ON public.user_roles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "make_staff" ON public.vehicle_makes
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "model_staff" ON public.vehicle_models
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_staff(auth.uid()))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "wh_manage" ON public.warehouses
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE POLICY "wh_view" ON public.warehouses
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_staff(auth.uid()));