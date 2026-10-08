CREATE TABLE public.accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code varchar(20) NOT NULL,
  name_ar text NOT NULL,
  account_type public.account_type NOT NULL,
  parent_id uuid,
  is_system boolean DEFAULT false NOT NULL,
  is_postable boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  requires_reconciliation boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ad_hoc_service_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_item_id uuid,
  description text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  discount numeric(14,2) DEFAULT 0 NOT NULL,
  tax numeric(14,2) DEFAULT 0 NOT NULL,
  total numeric(14,2) NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.backup_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id text DEFAULT 'default'::text NOT NULL,
  actor_id uuid,
  actor_name text DEFAULT 'المالك (Owner)'::text NOT NULL,
  action_type text NOT NULL,
  storage_type text NOT NULL,
  status text NOT NULL,
  file_name text NOT NULL,
  file_size_bytes bigint DEFAULT 0 NOT NULL,
  metadata jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.brands (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  name_ar text
);

CREATE TABLE public.categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  parent_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.company_costing_settings (
  id smallint DEFAULT 1 NOT NULL,
  costing_method public.costing_method DEFAULT 'MOVING_AVERAGE'::costing_method NOT NULL,
  standard_cost_source text DEFAULT 'CATALOGUE'::text NOT NULL,
  effective_from date DEFAULT CURRENT_DATE NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  notes text
);

CREATE TABLE public.company_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  company_id integer DEFAULT 1 NOT NULL,
  item_id uuid NOT NULL,
  inventory_policy public.inventory_policy,
  costing_method public.costing_method,
  default_cost numeric(14,2),
  default_sale_price numeric(14,2),
  tax_rate numeric(6,3),
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.company_settings (
  id integer DEFAULT 1 NOT NULL,
  name text DEFAULT 'My Company'::text NOT NULL,
  legal_name text,
  tax_number text,
  currency text DEFAULT 'YER'::text NOT NULL,
  currency_symbol text DEFAULT 'ر.ي'::text NOT NULL,
  tax_rate numeric(6,3) DEFAULT 0 NOT NULL,
  logo_url text,
  address text,
  phone text,
  email text,
  invoice_prefix text DEFAULT 'INV-'::text NOT NULL,
  barcode_enabled boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  enforce_customer_credit_limit boolean DEFAULT false NOT NULL,
  catalog_modules jsonb DEFAULT '{"profile": "spare_parts", "enableUnits": true, "enableBrands": true, "enableOrigins": true, "enableQualityGrades": true, "enableMakesAndModels": true}'::jsonb NOT NULL,
  purchase_invoice_prefix text DEFAULT 'PO-'::text NOT NULL,
  invoice_number_period text DEFAULT 'year_month'::text NOT NULL,
  invoice_number_digits smallint DEFAULT 4 NOT NULL,
  name_ar text,
  name_en text,
  contact_numbers text,
  footer_contact text,
  footer_text text
);

CREATE TABLE public.costing_policy_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  costing_method public.costing_method NOT NULL,
  previous_method public.costing_method,
  reason text,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.countries_of_origin (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code char(2) NOT NULL,
  name text NOT NULL,
  name_ar text NOT NULL
);

CREATE TABLE public.customer_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  entry_type text NOT NULL,
  debit numeric(14,2) DEFAULT 0 NOT NULL,
  credit numeric(14,2) DEFAULT 0 NOT NULL,
  reference_id uuid,
  reference_type text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  note text,
  source_key text
);

CREATE TABLE public.customer_payment_splits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  invoice_id uuid,
  payment_id uuid,
  method public.payment_method NOT NULL,
  amount numeric(14,2) NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  invoice_id uuid,
  amount numeric(14,2) NOT NULL,
  payment_method public.payment_method DEFAULT 'cash'::payment_method NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  credit_limit numeric(14,2) DEFAULT 0 NOT NULL,
  balance numeric(14,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  loyalty_points numeric DEFAULT 0 NOT NULL
);

CREATE TABLE public.device_registrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  device_id text NOT NULL,
  device_name text NOT NULL,
  platform text DEFAULT 'browser'::text NOT NULL,
  assigned_warehouse_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expense_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  sequence integer NOT NULL,
  action text NOT NULL,
  from_status public.expense_status,
  to_status public.expense_status NOT NULL,
  actor_id uuid,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expense_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  line_id uuid,
  bucket_id text DEFAULT 'expense-attachments'::text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  file_size bigint,
  checksum text,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expense_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 100 NOT NULL,
  notes text,
  created_by uuid
);

CREATE TABLE public.expense_cost_centers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text,
  name text NOT NULL,
  name_ar text,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expense_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reference text NOT NULL,
  entry_type public.expense_entry_type DEFAULT 'DIRECT'::expense_entry_type NOT NULL,
  status public.expense_status DEFAULT 'DRAFT'::expense_status NOT NULL,
  source_kind public.expense_source_kind DEFAULT 'MANUAL'::expense_source_kind NOT NULL,
  payee_type public.expense_payee_type DEFAULT 'NONE'::expense_payee_type NOT NULL,
  payee_name text,
  supplier_id uuid,
  employee_id uuid,
  warehouse_id uuid,
  cost_center_id uuid,
  project_id uuid,
  expense_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  posting_date date,
  description text,
  note text,
  total_amount numeric(18,2) DEFAULT 0 NOT NULL,
  paid_amount numeric(18,2) DEFAULT 0 NOT NULL,
  remaining_amount numeric(18,2) GENERATED ALWAYS AS ((total_amount - paid_amount)) STORED,
  tax_mode public.expense_tax_mode DEFAULT 'NONE'::expense_tax_mode NOT NULL,
  currency text DEFAULT 'YER'::text NOT NULL,
  currency_symbol text DEFAULT '﷼'::text NOT NULL,
  line_count integer DEFAULT 0 NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  created_by uuid,
  submitted_by uuid,
  submitted_at timestamp with time zone,
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_by uuid,
  rejected_at timestamp with time zone,
  rejection_reason text,
  posted_by uuid,
  posted_at timestamp with time zone,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  cancel_reason text,
  reversal_of uuid,
  reversed_by_id uuid,
  legacy_expense_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expense_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  line_no integer NOT NULL,
  description text,
  category_id uuid,
  quantity numeric(18,3) DEFAULT 1 NOT NULL,
  unit_price numeric(18,2) DEFAULT 0 NOT NULL,
  net_amount numeric(18,2) DEFAULT 0 NOT NULL,
  tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
  tax_amount numeric(18,2) DEFAULT 0 NOT NULL,
  gross_amount numeric(18,2) DEFAULT 0 NOT NULL,
  cost_center_id uuid,
  project_id uuid,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expense_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  amount numeric(18,2) NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  payment_method public.payment_method DEFAULT 'cash'::payment_method NOT NULL,
  account_label text,
  reference_no text,
  note text,
  idempotency_key text,
  reversed_by uuid,
  reversal_of uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  account_id uuid
);

CREATE TABLE public.expense_projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text,
  name text NOT NULL,
  name_ar text,
  is_active boolean DEFAULT true NOT NULL,
  started_on date,
  closed_on date,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid,
  amount numeric NOT NULL,
  payment_method public.payment_method DEFAULT 'cash'::payment_method NOT NULL,
  expense_date date DEFAULT CURRENT_DATE NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.inventory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  quantity numeric(14,3) DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  owner_type public.owner_type DEFAULT 'COMPANY'::owner_type NOT NULL,
  owner_id uuid
);

CREATE TABLE public.item_cost_layers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  owner_type public.owner_type DEFAULT 'COMPANY'::owner_type NOT NULL,
  owner_id uuid,
  quantity numeric(18,3) DEFAULT 0 NOT NULL,
  total_value numeric(18,2) DEFAULT 0 NOT NULL,
  valuation_method public.costing_method DEFAULT 'MOVING_AVERAGE'::costing_method NOT NULL,
  last_unit_cost numeric(18,4) DEFAULT 0 NOT NULL,
  last_movement_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.item_cost_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  owner_type public.owner_type DEFAULT 'COMPANY'::owner_type NOT NULL,
  owner_id uuid,
  direction text NOT NULL,
  quantity numeric(18,3) NOT NULL,
  unit_cost numeric(18,4) NOT NULL,
  value numeric(18,2) NOT NULL,
  method public.costing_method NOT NULL,
  quantity_before numeric(18,3) NOT NULL,
  value_before numeric(18,2) NOT NULL,
  quantity_after numeric(18,3) NOT NULL,
  value_after numeric(18,2) NOT NULL,
  source_type text,
  source_id uuid,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.item_policy_review_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  reason text NOT NULL,
  detail jsonb DEFAULT '{}'::jsonb NOT NULL,
  resolved_at timestamp with time zone,
  resolved_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.journal_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_number text NOT NULL,
  entry_date date DEFAULT CURRENT_DATE NOT NULL,
  memo text NOT NULL,
  status text DEFAULT 'DRAFT'::text NOT NULL,
  source_type text,
  source_id uuid,
  is_system boolean DEFAULT false NOT NULL,
  reverses_id uuid,
  total_debit numeric(18,2) DEFAULT 0 NOT NULL,
  total_credit numeric(18,2) DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  posted_by uuid,
  posted_at timestamp with time zone
);

CREATE TABLE public.journal_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  account_id uuid NOT NULL,
  debit numeric(18,2) DEFAULT 0 NOT NULL,
  credit numeric(18,2) DEFAULT 0 NOT NULL,
  memo text,
  partner_type text,
  partner_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.loyalty_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  points numeric NOT NULL,
  kind text NOT NULL,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.milling_delivery_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  delivery_id uuid NOT NULL,
  job_output_id uuid NOT NULL,
  delivered_bags integer NOT NULL,
  delivered_weight_kg numeric(12,3) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.milling_delivery_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_id uuid NOT NULL,
  delivery_number varchar(50) NOT NULL,
  customer_id uuid NOT NULL,
  job_id uuid NOT NULL,
  truck_plate_number varchar(30),
  driver_name varchar(100),
  total_bags integer DEFAULT 0 NOT NULL,
  total_weight_kg numeric(12,3) DEFAULT 0 NOT NULL,
  notes text,
  delivered_by uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.milling_grain_grades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid,
  grade_code varchar(30) NOT NULL,
  grade_name_ar varchar(120) NOT NULL,
  origin varchar(60),
  max_moisture numeric(5,2) NOT NULL,
  max_impurities numeric(5,2) NOT NULL,
  default_bag_size_kg numeric(6,2) DEFAULT 50 NOT NULL,
  default_service_sku varchar(50),
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  default_bag_type text DEFAULT 'شوال خيش طبيعي 50 كجم'::text
);

CREATE TABLE public.milling_intake_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_id uuid NOT NULL,
  receipt_number varchar(50) NOT NULL,
  customer_id uuid NOT NULL,
  truck_plate_number varchar(30),
  driver_name varchar(100),
  grain_type varchar(50) NOT NULL,
  grain_product_id uuid,
  bag_size_kg numeric(6,2) DEFAULT 50.00 NOT NULL,
  intake_bag_count integer DEFAULT 0 NOT NULL,
  nominal_weight_kg numeric(12,3) DEFAULT 0 NOT NULL,
  gross_weight_kg numeric(12,3) NOT NULL,
  tare_weight_kg numeric(12,3) DEFAULT 0 NOT NULL,
  net_weight_kg numeric(12,3) NOT NULL,
  moisture_percentage numeric(5,2) DEFAULT 0 NOT NULL,
  impurities_percentage numeric(5,2) DEFAULT 0 NOT NULL,
  silo_or_location varchar(50),
  status public.milling_status DEFAULT 'RECEIVED'::milling_status NOT NULL,
  notes text,
  received_by uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  grain_grade_id uuid,
  bag_type text DEFAULT 'شوال خيش طبيعي 50 كجم'::text,
  bag_source text DEFAULT 'CUSTOMER'::text,
  bag_condition text DEFAULT 'سليم ومحكم'::text,
  grain_grade_ref uuid
);

CREATE TABLE public.milling_job_outputs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  output_type public.milling_output_type NOT NULL,
  bag_size_kg numeric(6,2) DEFAULT 50.00 NOT NULL,
  produced_bag_count integer DEFAULT 0 NOT NULL,
  produced_weight_kg numeric(12,3) NOT NULL,
  bags_source varchar(20) DEFAULT 'CUSTOMER'::character varying NOT NULL,
  mill_bag_product_id uuid,
  mill_bags_used integer DEFAULT 0 NOT NULL,
  delivered_bag_count integer DEFAULT 0 NOT NULL,
  delivered_weight_kg numeric(12,3) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.milling_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_id uuid NOT NULL,
  job_number varchar(50) NOT NULL,
  intake_receipt_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  input_bag_count integer DEFAULT 0 NOT NULL,
  input_bag_size_kg numeric(6,2) DEFAULT 50.00 NOT NULL,
  input_weight_kg numeric(12,3) NOT NULL,
  milling_fee_per_bag numeric(12,2) DEFAULT 0 NOT NULL,
  milling_fee_per_ton numeric(12,2) DEFAULT 0 NOT NULL,
  service_product_id uuid,
  expected_extraction_rate numeric(5,2) DEFAULT 80.00 NOT NULL,
  allowed_loss_percentage numeric(5,2) DEFAULT 2.00 NOT NULL,
  actual_loss_kg numeric(12,3) DEFAULT 0 NOT NULL,
  loss_excess_kg numeric(12,3) DEFAULT 0 NOT NULL,
  status public.milling_status DEFAULT 'PROCESSING'::milling_status NOT NULL,
  started_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
  finished_at timestamp with time zone,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  agreement_id uuid
);

CREATE TABLE public.milling_service_agreements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  store_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  intake_receipt_id uuid NOT NULL,
  grain_grade_id uuid,
  requested_output_type public.milling_output_type,
  requested_output_note varchar(120),
  output_bag_size_kg numeric(6,2) DEFAULT 50 NOT NULL,
  bags_source varchar(20) DEFAULT 'CUSTOMER'::character varying NOT NULL,
  delivery_mode varchar(20) DEFAULT 'FULL'::character varying NOT NULL,
  service_product_id uuid,
  price_basis varchar(10) DEFAULT 'BAG'::character varying NOT NULL,
  agreed_price numeric(12,2) NOT NULL,
  expected_extraction_rate numeric(5,2) DEFAULT 80.00 NOT NULL,
  allowed_loss_percentage numeric(5,2) DEFAULT 2.00 NOT NULL,
  status varchar(20) DEFAULT 'AGREED'::character varying NOT NULL,
  agreed_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  agreed_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.milling_unit_conversions (
  unit_id uuid NOT NULL,
  kg_per_unit numeric(12,4) NOT NULL,
  is_bag_unit boolean DEFAULT false NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.opening_balance_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_number text NOT NULL,
  effective_date date NOT NULL,
  status text DEFAULT 'DRAFT'::text NOT NULL,
  fiscal_year integer NOT NULL,
  total_assets numeric(18,2) DEFAULT 0 NOT NULL,
  total_liabilities numeric(18,2) DEFAULT 0 NOT NULL,
  capital_required numeric(18,2),
  reverses_document_id uuid,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  posted_by uuid,
  posted_at timestamp with time zone
);

CREATE TABLE public.opening_balance_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  section text NOT NULL,
  side text NOT NULL,
  ref_type text,
  ref_id uuid,
  product_id uuid,
  warehouse_id uuid,
  customer_id uuid,
  supplier_id uuid,
  description text NOT NULL,
  quantity numeric(18,3),
  unit_cost numeric(18,4),
  amount numeric(18,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.packaging_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code varchar(20) NOT NULL,
  name_ar varchar(60) NOT NULL,
  name_en varchar(60),
  is_active boolean DEFAULT true NOT NULL,
  sort_order smallint DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.platform_admins (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  mfa_required boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_login timestamp with time zone
);

CREATE TABLE public.platform_audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  admin_id uuid,
  user_id uuid,
  action text NOT NULL,
  target_tenant_id text,
  payload jsonb,
  ip_address text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.platform_modules (
  id text NOT NULL,
  name jsonb NOT NULL,
  description jsonb,
  category text NOT NULL,
  dependencies text[] DEFAULT '{}'::text[] NOT NULL,
  nav_items text[] DEFAULT '{}'::text[] NOT NULL,
  routes text[] DEFAULT '{}'::text[] NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.platform_plans (
  id text NOT NULL,
  name jsonb NOT NULL,
  description jsonb,
  modules text[] DEFAULT '{}'::text[] NOT NULL,
  max_users integer DEFAULT 1 NOT NULL,
  max_warehouses integer DEFAULT 1 NOT NULL,
  max_products integer,
  price_monthly numeric(10,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  batch_number text NOT NULL,
  expiry_date date,
  quantity numeric DEFAULT 0 NOT NULL,
  unit_cost numeric DEFAULT 0 NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.product_compatibilities (
  product_id uuid NOT NULL,
  vehicle_model_id uuid NOT NULL
);

CREATE TABLE public.production_bom_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bom_id uuid NOT NULL,
  product_id uuid,
  line_role text DEFAULT 'INPUT'::text NOT NULL,
  qty numeric(18,3) NOT NULL,
  unit text DEFAULT 'KG'::text NOT NULL,
  loss_reason text,
  notes text
);

CREATE TABLE public.production_boms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  name_ar text NOT NULL,
  output_qty numeric(18,3) NOT NULL,
  output_unit text DEFAULT 'KG'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.production_order_losses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  reason text NOT NULL,
  qty numeric(18,3) NOT NULL,
  unit text DEFAULT 'KG'::text NOT NULL,
  value numeric(18,2) DEFAULT 0 NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.production_order_materials (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  planned_qty numeric(18,3) DEFAULT 0 NOT NULL,
  actual_qty numeric(18,3) DEFAULT 0 NOT NULL,
  unit_cost numeric(18,4) DEFAULT 0 NOT NULL,
  total_cost numeric(18,2) DEFAULT 0 NOT NULL,
  movement_id uuid
);

CREATE TABLE public.production_order_outputs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  output_role text DEFAULT 'PRIMARY'::text NOT NULL,
  planned_qty numeric(18,3) DEFAULT 0 NOT NULL,
  actual_qty numeric(18,3) DEFAULT 0 NOT NULL,
  unit_cost numeric(18,4) DEFAULT 0 NOT NULL,
  total_cost numeric(18,2) DEFAULT 0 NOT NULL,
  movement_id uuid
);

CREATE TABLE public.production_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_number text NOT NULL,
  warehouse_id uuid NOT NULL,
  bom_id uuid,
  production_date date DEFAULT CURRENT_DATE NOT NULL,
  status text DEFAULT 'PLANNED'::text NOT NULL,
  planned_input_qty numeric(18,3) DEFAULT 0 NOT NULL,
  planned_output_qty numeric(18,3) DEFAULT 0 NOT NULL,
  planned_yield_pct numeric(7,3),
  actual_input_qty numeric(18,3) DEFAULT 0 NOT NULL,
  actual_output_qty numeric(18,3) DEFAULT 0 NOT NULL,
  actual_yield_pct numeric(7,3),
  material_cost numeric(18,2) DEFAULT 0 NOT NULL,
  direct_labour numeric(18,2) DEFAULT 0 NOT NULL,
  overhead_cost numeric(18,2) DEFAULT 0 NOT NULL,
  total_cost numeric(18,2) DEFAULT 0 NOT NULL,
  costing_method public.costing_method DEFAULT 'MOVING_AVERAGE'::costing_method NOT NULL,
  allocation_basis text DEFAULT 'REMAINDER_TO_PRIMARY'::text NOT NULL,
  created_by uuid,
  completed_by uuid,
  completed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sku text,
  barcode text,
  name text,
  name_ar text NOT NULL,
  description text,
  image_url text,
  category_id uuid,
  brand_id uuid,
  unit_id uuid,
  cost_price numeric(14,2) DEFAULT 0 NOT NULL,
  sale_price numeric(14,2) DEFAULT 0 NOT NULL,
  tax_rate numeric(6,3) DEFAULT 0 NOT NULL,
  min_stock numeric(14,3) DEFAULT 0 NOT NULL,
  track_expiry boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  shelf_location text,
  is_service boolean DEFAULT false NOT NULL,
  origin_id uuid,
  quality_grade_id uuid,
  item_nature public.item_nature DEFAULT 'GOOD'::item_nature NOT NULL,
  inventory_policy public.inventory_policy DEFAULT 'TRACKED'::inventory_policy NOT NULL,
  tracking public.item_tracking DEFAULT 'NONE'::item_tracking NOT NULL,
  costing_method public.costing_method DEFAULT 'MOVING_AVERAGE'::costing_method NOT NULL,
  is_sellable boolean DEFAULT true NOT NULL,
  is_purchasable boolean DEFAULT true NOT NULL,
  status public.item_status DEFAULT 'ACTIVE'::item_status NOT NULL,
  base_uom_id uuid,
  sales_uom_id uuid,
  purchase_uom_id uuid,
  uom_conversions jsonb DEFAULT '[]'::jsonb NOT NULL,
  item_class public.item_class,
  standard_cost numeric(18,4),
  package_type_id uuid,
  package_weight_kg numeric(10,3)
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  avatar_url text,
  phone text,
  language text DEFAULT 'en'::text NOT NULL,
  theme text DEFAULT 'dark'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_active boolean DEFAULT true NOT NULL
);

CREATE TABLE public.purchase_invoice_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) NOT NULL,
  discount numeric(14,2) DEFAULT 0 NOT NULL,
  tax numeric(14,2) DEFAULT 0 NOT NULL,
  total numeric(14,2) NOT NULL,
  line_type text,
  stock_effect text
);

CREATE TABLE public.purchase_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_number text NOT NULL,
  supplier_id uuid,
  warehouse_id uuid,
  status public.invoice_status DEFAULT 'draft'::invoice_status NOT NULL,
  subtotal numeric(14,2) DEFAULT 0 NOT NULL,
  discount numeric(14,2) DEFAULT 0 NOT NULL,
  tax numeric(14,2) DEFAULT 0 NOT NULL,
  total numeric(14,2) DEFAULT 0 NOT NULL,
  paid numeric(14,2) DEFAULT 0 NOT NULL,
  payment_method public.payment_method,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.purchase_return_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric NOT NULL,
  unit_cost numeric NOT NULL,
  tax numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  line_type text
);

CREATE TABLE public.purchase_returns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_number text NOT NULL,
  invoice_id uuid,
  supplier_id uuid,
  warehouse_id uuid NOT NULL,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  refund_method public.payment_method,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.quality_grades (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  name_ar text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.sales_invoice_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  product_id uuid,
  quantity numeric(14,3) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  discount numeric(14,2) DEFAULT 0 NOT NULL,
  tax numeric(14,2) DEFAULT 0 NOT NULL,
  total numeric(14,2) NOT NULL,
  description text,
  line_type text,
  stock_effect text,
  uom_id uuid
);

CREATE TABLE public.sales_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_number text NOT NULL,
  customer_id uuid,
  warehouse_id uuid,
  status public.invoice_status DEFAULT 'draft'::invoice_status NOT NULL,
  subtotal numeric(14,2) DEFAULT 0 NOT NULL,
  discount numeric(14,2) DEFAULT 0 NOT NULL,
  tax numeric(14,2) DEFAULT 0 NOT NULL,
  total numeric(14,2) DEFAULT 0 NOT NULL,
  paid numeric(14,2) DEFAULT 0 NOT NULL,
  payment_method public.payment_method,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  milling_job_id uuid
);

CREATE TABLE public.sales_return_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  tax numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  line_type text
);

CREATE TABLE public.sales_returns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_number text NOT NULL,
  invoice_id uuid,
  customer_id uuid,
  warehouse_id uuid NOT NULL,
  subtotal numeric DEFAULT 0 NOT NULL,
  tax numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  refund_method public.payment_method,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.stock_adjustment_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  adjustment_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) DEFAULT 0 NOT NULL,
  total_cost numeric(14,2) DEFAULT 0 NOT NULL,
  note text
);

CREATE TABLE public.stock_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_number text NOT NULL,
  warehouse_id uuid NOT NULL,
  effective_date date DEFAULT CURRENT_DATE NOT NULL,
  reason text NOT NULL,
  note text,
  total_value numeric(14,2) DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.stock_movements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  product_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  movement_type public.movement_type NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2),
  reference text,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  reference_type text,
  reference_id uuid,
  adjustment_reason text,
  movement_kind public.stock_movement_kind,
  source_type text,
  source_id uuid,
  total_cost numeric(14,2),
  owner_type public.owner_type DEFAULT 'COMPANY'::owner_type NOT NULL,
  owner_id uuid
);

CREATE TABLE public.stock_opening_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  opening_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(14,3) NOT NULL,
  unit_cost numeric(14,2) DEFAULT 0 NOT NULL,
  total_cost numeric(14,2) DEFAULT 0 NOT NULL,
  note text
);

CREATE TABLE public.stock_openings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_number text NOT NULL,
  warehouse_id uuid NOT NULL,
  effective_date date DEFAULT CURRENT_DATE NOT NULL,
  note text,
  total_value numeric(14,2) DEFAULT 0 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.stock_transfer_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transfer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric NOT NULL
);

CREATE TABLE public.stock_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transfer_number text NOT NULL,
  from_warehouse_id uuid NOT NULL,
  to_warehouse_id uuid NOT NULL,
  status text DEFAULT 'completed'::text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  balance numeric(14,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sync_idempotency_keys (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  idempotency_key text NOT NULL,
  entity_name text NOT NULL,
  operation_type text NOT NULL,
  origin_device_id text NOT NULL,
  status text DEFAULT 'processing'::text NOT NULL,
  response_payload jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tenant_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id text DEFAULT 'default'::text NOT NULL,
  plan_id text NOT NULL,
  extra_modules text[] DEFAULT '{}'::text[] NOT NULL,
  disabled_modules text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.units (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  short_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  name_ar text
);

CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vehicle_makes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text NOT NULL
);

CREATE TABLE public.vehicle_models (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  make_id uuid NOT NULL,
  name text NOT NULL,
  name_ar text
);

CREATE TABLE public.warehouses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  code text,
  address text,
  is_default boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  name_ar text
);