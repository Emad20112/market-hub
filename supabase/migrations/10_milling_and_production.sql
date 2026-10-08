-- ============================================================================
-- 11_milling_and_production.sql
--
-- الطحن والإنتاج: الاستلام، أوامر الطحن، النواتج، التسليم، أوامر الإنتاج.
--
-- مُستخرج من الحالة النهائية الحقيقية لقاعدة البيانات، لا من تاريخ الملفات.
-- لا يحتوي أي بيانات أعمال أو تجارية. راجع supabase/MIGRATIONS_RULES.md
-- ============================================================================

-- ── TABLES ────────────────────────────────────────────────────────────────
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

CREATE TABLE public.milling_unit_conversions (
  unit_id uuid NOT NULL,
  kg_per_unit numeric(12,4) NOT NULL,
  is_bag_unit boolean DEFAULT false NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
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

CREATE TABLE public.milling_delivery_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  delivery_id uuid NOT NULL,
  job_output_id uuid NOT NULL,
  delivered_bags integer NOT NULL,
  delivered_weight_kg numeric(12,3) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
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

-- ── CONSTRAINTS ───────────────────────────────────────────────────────────
ALTER TABLE public.milling_grain_grades ADD CONSTRAINT "milling_grain_grades_default_bag_size_kg_check" CHECK ((default_bag_size_kg > (0)::numeric));
ALTER TABLE public.milling_grain_grades ADD CONSTRAINT "milling_grain_grades_max_impurities_check" CHECK (((max_impurities >= (0)::numeric) AND (max_impurities <= (100)::numeric)));
ALTER TABLE public.milling_grain_grades ADD CONSTRAINT "milling_grain_grades_max_moisture_check" CHECK (((max_moisture > (0)::numeric) AND (max_moisture <= (100)::numeric)));
ALTER TABLE public.milling_grain_grades ADD CONSTRAINT "milling_grain_grades_pkey" PRIMARY KEY (id);
ALTER TABLE public.milling_unit_conversions ADD CONSTRAINT "milling_unit_conversions_kg_per_unit_check" CHECK ((kg_per_unit > (0)::numeric));
ALTER TABLE public.milling_unit_conversions ADD CONSTRAINT "milling_unit_conversions_pkey" PRIMARY KEY (unit_id);
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_bag_size_kg_check" CHECK ((bag_size_kg > (0)::numeric));
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_gross_weight_kg_check" CHECK ((gross_weight_kg >= (0)::numeric));
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_impurities_percentage_check" CHECK (((impurities_percentage >= (0)::numeric) AND (impurities_percentage <= (100)::numeric)));
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_intake_bag_count_check" CHECK ((intake_bag_count >= 0));
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_moisture_percentage_check" CHECK (((moisture_percentage >= (0)::numeric) AND (moisture_percentage <= (100)::numeric)));
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_net_weight_kg_check" CHECK ((net_weight_kg >= (0)::numeric));
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_tare_weight_kg_check" CHECK ((tare_weight_kg >= (0)::numeric));
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "milling_intake_receipts_pkey" PRIMARY KEY (id);
ALTER TABLE public.milling_intake_receipts ADD CONSTRAINT "uq_milling_intake_store_receipt" UNIQUE (store_id, receipt_number);
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_agreed_price_check" CHECK ((agreed_price > (0)::numeric));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_allowed_loss_percentage_check" CHECK (((allowed_loss_percentage >= (0)::numeric) AND (allowed_loss_percentage <= (100)::numeric)));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_bags_source_check" CHECK (((bags_source)::text = ANY ((ARRAY['CUSTOMER'::character varying, 'MILL'::character varying])::text[])));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_delivery_mode_check" CHECK (((delivery_mode)::text = ANY ((ARRAY['FULL'::character varying, 'PARTIAL'::character varying])::text[])));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_expected_extraction_rate_check" CHECK (((expected_extraction_rate > (0)::numeric) AND (expected_extraction_rate <= (100)::numeric)));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_output_bag_size_kg_check" CHECK ((output_bag_size_kg > (0)::numeric));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_price_basis_check" CHECK (((price_basis)::text = ANY ((ARRAY['BAG'::character varying, 'TON'::character varying])::text[])));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_status_check" CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'AGREED'::character varying, 'CONSUMED'::character varying, 'CANCELLED'::character varying])::text[])));
ALTER TABLE public.milling_service_agreements ADD CONSTRAINT "milling_service_agreements_pkey" PRIMARY KEY (id);
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_allowed_loss_percentage_check" CHECK (((allowed_loss_percentage >= (0)::numeric) AND (allowed_loss_percentage <= (100)::numeric)));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_expected_extraction_rate_check" CHECK (((expected_extraction_rate > (0)::numeric) AND (expected_extraction_rate <= (100)::numeric)));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_input_bag_count_check" CHECK ((input_bag_count >= 0));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_input_bag_size_kg_check" CHECK ((input_bag_size_kg > (0)::numeric));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_input_weight_kg_check" CHECK ((input_weight_kg > (0)::numeric));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_milling_fee_per_bag_check" CHECK ((milling_fee_per_bag >= (0)::numeric));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_milling_fee_per_ton_check" CHECK ((milling_fee_per_ton >= (0)::numeric));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_single_fee_basis" CHECK ((num_nonnulls(NULLIF(milling_fee_per_bag, (0)::numeric), NULLIF(milling_fee_per_ton, (0)::numeric)) <= 1));
ALTER TABLE public.milling_jobs ADD CONSTRAINT "milling_jobs_pkey" PRIMARY KEY (id);
ALTER TABLE public.milling_jobs ADD CONSTRAINT "uq_milling_job_store_number" UNIQUE (store_id, job_number);
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "ck_milling_output_delivery_bags" CHECK ((delivered_bag_count <= produced_bag_count));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "ck_milling_output_delivery_weight" CHECK ((delivered_weight_kg <= (produced_weight_kg + 0.001)));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_bag_size_kg_check" CHECK ((bag_size_kg > (0)::numeric));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_bags_source_check" CHECK (((bags_source)::text = ANY ((ARRAY['CUSTOMER'::character varying, 'MILL'::character varying])::text[])));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_delivered_bag_count_check" CHECK ((delivered_bag_count >= 0));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_delivered_weight_kg_check" CHECK ((delivered_weight_kg >= (0)::numeric));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_mill_bags_used_check" CHECK ((mill_bags_used >= 0));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_produced_bag_count_check" CHECK ((produced_bag_count >= 0));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_produced_weight_kg_check" CHECK ((produced_weight_kg >= (0)::numeric));
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_pkey" PRIMARY KEY (id);
ALTER TABLE public.milling_job_outputs ADD CONSTRAINT "milling_job_outputs_job_type_key" UNIQUE (job_id, output_type);
ALTER TABLE public.milling_delivery_notes ADD CONSTRAINT "milling_delivery_notes_total_bags_check" CHECK ((total_bags >= 0));
ALTER TABLE public.milling_delivery_notes ADD CONSTRAINT "milling_delivery_notes_total_weight_kg_check" CHECK ((total_weight_kg >= (0)::numeric));
ALTER TABLE public.milling_delivery_notes ADD CONSTRAINT "milling_delivery_notes_pkey" PRIMARY KEY (id);
ALTER TABLE public.milling_delivery_notes ADD CONSTRAINT "uq_milling_delivery_store_number" UNIQUE (store_id, delivery_number);
ALTER TABLE public.milling_delivery_items ADD CONSTRAINT "milling_delivery_items_delivered_bags_check" CHECK ((delivered_bags > 0));
ALTER TABLE public.milling_delivery_items ADD CONSTRAINT "milling_delivery_items_delivered_weight_kg_check" CHECK ((delivered_weight_kg > (0)::numeric));
ALTER TABLE public.milling_delivery_items ADD CONSTRAINT "milling_delivery_items_pkey" PRIMARY KEY (id);
ALTER TABLE public.production_boms ADD CONSTRAINT "production_boms_output_qty_check" CHECK ((output_qty > (0)::numeric));
ALTER TABLE public.production_boms ADD CONSTRAINT "production_boms_pkey" PRIMARY KEY (id);
ALTER TABLE public.production_boms ADD CONSTRAINT "production_boms_product_id_name_ar_key" UNIQUE (product_id, name_ar);
ALTER TABLE public.production_bom_lines ADD CONSTRAINT "production_bom_lines_line_role_check" CHECK ((line_role = ANY (ARRAY['INPUT'::text, 'OUTPUT'::text, 'BY_PRODUCT'::text, 'LOSS'::text])));
ALTER TABLE public.production_bom_lines ADD CONSTRAINT "production_bom_lines_qty_check" CHECK ((qty > (0)::numeric));
ALTER TABLE public.production_bom_lines ADD CONSTRAINT "production_bom_lines_pkey" PRIMARY KEY (id);
ALTER TABLE public.production_bom_lines ADD CONSTRAINT "production_bom_lines_bom_id_product_id_line_role_key" UNIQUE (bom_id, product_id, line_role);
ALTER TABLE public.production_orders ADD CONSTRAINT "production_orders_allocation_basis_check" CHECK ((allocation_basis = ANY (ARRAY['REMAINDER_TO_PRIMARY'::text, 'NET_REALISABLE_VALUE'::text, 'RELATIVE_SALES_VALUE'::text])));
ALTER TABLE public.production_orders ADD CONSTRAINT "production_orders_completed_has_cost" CHECK (((status <> 'COMPLETED'::text) OR (total_cost > (0)::numeric)));
ALTER TABLE public.production_orders ADD CONSTRAINT "production_orders_status_check" CHECK ((status = ANY (ARRAY['PLANNED'::text, 'ISSUED'::text, 'COMPLETED'::text, 'CANCELLED'::text])));
ALTER TABLE public.production_orders ADD CONSTRAINT "production_orders_pkey" PRIMARY KEY (id);
ALTER TABLE public.production_orders ADD CONSTRAINT "production_orders_order_number_key" UNIQUE (order_number);
ALTER TABLE public.production_order_materials ADD CONSTRAINT "production_order_materials_pkey" PRIMARY KEY (id);
ALTER TABLE public.production_order_materials ADD CONSTRAINT "production_order_materials_order_id_product_id_key" UNIQUE (order_id, product_id);
ALTER TABLE public.production_order_outputs ADD CONSTRAINT "production_order_outputs_output_role_check" CHECK ((output_role = ANY (ARRAY['PRIMARY'::text, 'BY_PRODUCT'::text])));
ALTER TABLE public.production_order_outputs ADD CONSTRAINT "production_order_outputs_pkey" PRIMARY KEY (id);
ALTER TABLE public.production_order_outputs ADD CONSTRAINT "production_order_outputs_order_id_product_id_output_role_key" UNIQUE (order_id, product_id, output_role);
ALTER TABLE public.production_order_losses ADD CONSTRAINT "production_order_losses_qty_check" CHECK ((qty > (0)::numeric));
ALTER TABLE public.production_order_losses ADD CONSTRAINT "production_order_losses_pkey" PRIMARY KEY (id);

-- ── INDEXES ───────────────────────────────────────────────────────────────
CREATE INDEX idx_milling_grain_grades_code ON public.milling_grain_grades USING btree (grade_code);
CREATE INDEX idx_milling_grain_grades_name ON public.milling_grain_grades USING btree (grade_name_ar);
CREATE INDEX idx_milling_grain_grades_product ON public.milling_grain_grades USING btree (product_id);
CREATE UNIQUE INDEX uq_milling_grain_grades_free_code ON public.milling_grain_grades USING btree (grade_code) WHERE (product_id IS NULL);
CREATE UNIQUE INDEX uq_milling_grain_grades_product_code ON public.milling_grain_grades USING btree (product_id, grade_code) WHERE (product_id IS NOT NULL);
CREATE INDEX idx_milling_intake_customer ON public.milling_intake_receipts USING btree (customer_id, created_at DESC);
CREATE INDEX idx_milling_intake_grade ON public.milling_intake_receipts USING btree (grain_grade_id);
CREATE INDEX idx_milling_intake_grain ON public.milling_intake_receipts USING btree (grain_product_id) WHERE (grain_product_id IS NOT NULL);
CREATE INDEX idx_milling_intake_store ON public.milling_intake_receipts USING btree (store_id);
CREATE INDEX idx_milling_agreements_customer ON public.milling_service_agreements USING btree (customer_id);
CREATE INDEX idx_milling_agreements_intake ON public.milling_service_agreements USING btree (intake_receipt_id);
CREATE INDEX idx_milling_agreements_status ON public.milling_service_agreements USING btree (status);
CREATE UNIQUE INDEX uq_milling_agreement_open_per_intake ON public.milling_service_agreements USING btree (intake_receipt_id) WHERE ((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'AGREED'::character varying])::text[]));
CREATE INDEX idx_milling_jobs_agreement ON public.milling_jobs USING btree (agreement_id);
CREATE INDEX idx_milling_jobs_customer ON public.milling_jobs USING btree (customer_id, created_at DESC);
CREATE INDEX idx_milling_jobs_intake ON public.milling_jobs USING btree (intake_receipt_id);
CREATE INDEX idx_milling_jobs_status ON public.milling_jobs USING btree (status);
CREATE INDEX idx_milling_jobs_store ON public.milling_jobs USING btree (store_id);
CREATE INDEX idx_milling_outputs_job ON public.milling_job_outputs USING btree (job_id);
CREATE INDEX idx_milling_outputs_type ON public.milling_job_outputs USING btree (job_id, output_type);
CREATE INDEX idx_milling_delivery_customer ON public.milling_delivery_notes USING btree (customer_id, created_at DESC);
CREATE INDEX idx_milling_delivery_job ON public.milling_delivery_notes USING btree (job_id);
CREATE INDEX idx_milling_delivery_store ON public.milling_delivery_notes USING btree (store_id);
CREATE INDEX idx_milling_delivery_items_dl ON public.milling_delivery_items USING btree (delivery_id);
CREATE INDEX idx_milling_delivery_items_ot ON public.milling_delivery_items USING btree (job_output_id);
CREATE INDEX ix_production_orders_date ON public.production_orders USING btree (warehouse_id, production_date DESC);
CREATE INDEX ix_production_orders_status ON public.production_orders USING btree (status);
CREATE INDEX ix_prod_outputs_product ON public.production_order_outputs USING btree (product_id);

-- ── SEQUENCES ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.opening_balance_seq START 1;

-- ── FUNCTIONS ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_milling_output(_job_id uuid, _output_type text, _bag_size_kg numeric, _produced_bag_count integer, _produced_weight_kg numeric, _bags_source text, _mill_bag_product_id uuid, _mill_bags_used integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_id     uuid;
  v_status public.milling_status;
  v_src    varchar(20);
  v_bags   integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to record milling outputs';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF _output_type IS NULL OR btrim(_output_type) = '' THEN
    RAISE EXCEPTION 'Output type is required';
  END IF;

  SELECT status INTO v_status
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status IN ('COMPLETED', 'DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Job % is % and can no longer be edited', _job_id, v_status;
  END IF;

  IF coalesce(_produced_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Produced bag count cannot be negative';
  END IF;
  IF coalesce(_produced_weight_kg, 0) < 0 THEN
    RAISE EXCEPTION 'Produced weight cannot be negative';
  END IF;
  IF coalesce(_produced_bag_count, 0) = 0 AND coalesce(_produced_weight_kg, 0) = 0 THEN
    RAISE EXCEPTION 'An output line needs at least one bag or a positive weight';
  END IF;
  IF coalesce(_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Output bag size must be greater than zero';
  END IF;

  v_src := upper(btrim(COALESCE(_bags_source, 'CUSTOMER')));
  IF v_src NOT IN ('CUSTOMER', 'MILL') THEN
    RAISE EXCEPTION 'bags_source must be CUSTOMER or MILL';
  END IF;

  v_bags := coalesce(_mill_bags_used, 0);
  IF v_src = 'MILL' THEN
    -- If the operator did not say how many bags were consumed, the produced bag
    -- count is the only sensible answer.
    IF v_bags = 0 THEN
      v_bags := coalesce(_produced_bag_count, 0);
    END IF;
    IF _mill_bag_product_id IS NULL THEN
      RAISE EXCEPTION 'MILL-supplied packaging requires the packaging item (PKG-*)';
    END IF;
    IF v_bags <= 0 THEN
      RAISE EXCEPTION 'MILL-supplied packaging requires a positive bag count';
    END IF;
  ELSE
    v_bags := 0;
  END IF;

  -- Upsert on (job_id, output_type): correct in place.
  INSERT INTO public.milling_job_outputs (
    job_id, output_type, bag_size_kg,
    produced_bag_count, produced_weight_kg,
    bags_source, mill_bag_product_id, mill_bags_used
  )
  VALUES (
    _job_id, _output_type::public.milling_output_type, coalesce(_bag_size_kg, 0),
    coalesce(_produced_bag_count, 0), coalesce(_produced_weight_kg, 0),
    v_src, _mill_bag_product_id, v_bags
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_id
  FROM public.milling_job_outputs
  WHERE job_id = _job_id
    AND output_type = _output_type::public.milling_output_type
  FOR UPDATE;

  -- Never let a correction reduce the delivered quantity — that would hand back
  -- custody the customer already physically took away.
  IF coalesce(
       (SELECT delivered_bag_count FROM public.milling_job_outputs WHERE id = v_id), 0
     ) > coalesce(_produced_bag_count, 0) THEN
    RAISE EXCEPTION
      'Cannot reduce produced bags below the % already delivered for this output',
      (SELECT delivered_bag_count FROM public.milling_job_outputs WHERE id = v_id);
  END IF;

  UPDATE public.milling_job_outputs
  SET bag_size_kg        = coalesce(_bag_size_kg, 0),
      produced_bag_count = coalesce(_produced_bag_count, 0),
      produced_weight_kg = coalesce(_produced_weight_kg, 0),
      bags_source        = v_src,
      mill_bag_product_id = _mill_bag_product_id,
      mill_bags_used     = v_bags
  WHERE id = v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.output.recorded', 'milling_output', v_id,
    jsonb_build_object(
      'job_id', _job_id,
      'output_type', _output_type,
      'produced_bag_count', coalesce(_produced_bag_count, 0),
      'produced_weight_kg', coalesce(_produced_weight_kg, 0),
      'bags_source', v_src,
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.add_production_output(_order_id uuid, _product_id uuid, _qty numeric, _output_role text DEFAULT 'PRIMARY'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord    record;
  v_cls    public.item_class;
  v_policy public.inventory_policy;
  v_mid    uuid;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to receive production output';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is % and cannot receive output', v_ord.order_number, v_ord.status;
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Output quantity must be greater than zero';
  END IF;
  IF _output_role NOT IN ('PRIMARY','BY_PRODUCT') THEN
    RAISE EXCEPTION 'Output role must be PRIMARY or BY_PRODUCT';
  END IF;

  SELECT p.item_class, p.inventory_policy INTO v_cls, v_policy
    FROM public.products p WHERE p.id = _product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Output item not found';
  END IF;

  -- A produced output must be something the mill can actually hold. A service
  -- or an untracked item cannot be received into stock.
  IF v_cls IN ('SERVICE','NON_STOCK_ITEM') OR v_policy = 'UNTRACKED' THEN
    RAISE EXCEPTION 'Item % cannot be produced into stock (class %, policy %)',
      _product_id, v_cls, v_policy;
  END IF;

  -- Unit cost is deliberately zero here: the joint cost is only known at
  -- completion. Valuing the output now would mean inventing a cost per kilo.
  PERFORM public.post_stock_delta(
    p_product_id => _product_id, p_warehouse_id => v_ord.warehouse_id,
    p_signed_qty => _qty, p_unit_cost => 0,
    p_movement_kind => 'RECEIPT', p_source_type => 'production_receipt',
    p_source_id => _order_id, p_note => 'ناتج إنتاج ' || v_ord.order_number,
    p_owner_type => 'COMPANY', p_owner_id => NULL);

  v_mid := public.production_last_movement(_product_id, v_ord.warehouse_id, _order_id);

  INSERT INTO public.production_order_outputs
    (order_id, product_id, output_role, planned_qty, actual_qty, movement_id)
  VALUES (_order_id, _product_id, _output_role, 0, _qty, v_mid)
  ON CONFLICT (order_id, product_id, output_role) DO UPDATE
    SET actual_qty  = public.production_order_outputs.actual_qty + EXCLUDED.actual_qty,
        movement_id = EXCLUDED.movement_id;

  UPDATE public.production_orders o
     SET actual_output_qty = coalesce((SELECT sum(actual_qty) FROM public.production_order_outputs WHERE order_id = _order_id), 0),
         status            = CASE WHEN o.status = 'PLANNED' THEN 'ISSUED' ELSE o.status END
   WHERE o.id = _order_id;
  RETURN v_mid;
END $function$;

CREATE OR REPLACE FUNCTION public.cancel_milling_intake(_receipt_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_receipt public.milling_intake_receipts%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to cancel intake receipts';
  END IF;
  IF nullif(btrim(coalesce(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  SELECT * INTO v_receipt
  FROM public.milling_intake_receipts
  WHERE id = _receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake receipt % does not exist', _receipt_id;
  END IF;
  IF v_receipt.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Intake receipt % is already cancelled', v_receipt.receipt_number;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.milling_jobs
    WHERE intake_receipt_id = _receipt_id AND status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel an intake receipt after a milling job has started';
  END IF;

  UPDATE public.milling_intake_receipts
  SET status = 'CANCELLED',
      notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'سبب الإلغاء: ' || btrim(_reason))
  WHERE id = _receipt_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.intake.cancelled', 'milling_intake_receipt', _receipt_id,
    jsonb_build_object(
      'receipt_number', v_receipt.receipt_number,
      'reason', btrim(_reason),
      'stock_impact', 'NONE — customer custody document cancelled before use'
    ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_milling_job(_job_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_job public.milling_jobs%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to cancel milling jobs';
  END IF;
  IF nullif(btrim(coalesce(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  SELECT * INTO v_job
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_job.status NOT IN ('RECEIVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'Only an uncompleted milling job can be cancelled (current status: %)', v_job.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.milling_job_outputs WHERE job_id = _job_id) THEN
    RAISE EXCEPTION 'Cannot cancel a job after outputs were recorded; post a documented correction instead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_invoices WHERE milling_job_id = _job_id)
     OR EXISTS (SELECT 1 FROM public.milling_delivery_notes WHERE job_id = _job_id) THEN
    RAISE EXCEPTION 'Cannot cancel a job with an invoice or delivery';
  END IF;

  UPDATE public.milling_jobs
  SET status = 'CANCELLED',
      notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'سبب الإلغاء: ' || btrim(_reason))
  WHERE id = _job_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.cancelled', 'milling_job', _job_id,
    jsonb_build_object(
      'job_number', v_job.job_number,
      'reason', btrim(_reason),
      'custody_effect', 'The input becomes available again on its intake receipt',
      'stock_impact', 'NONE'
    ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_milling_job(_job_id uuid, _notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_status     public.milling_status;
  v_input      numeric;
  v_outputs    numeric;
  v_allowed_pct numeric;
  v_actual     numeric;
  v_allowed    numeric;
  v_excess     numeric;
  v_expected   numeric;
  v_rate       numeric;
  v_outputs_bags integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to complete milling jobs';
  END IF;
  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;

  SELECT status, input_weight_kg, allowed_loss_percentage, expected_extraction_rate
    INTO v_status, v_input, v_allowed_pct, v_expected
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status = 'COMPLETED' OR v_status = 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % is already closed', _job_id;
  END IF;
  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Job % is cancelled', _job_id;
  END IF;

  SELECT coalesce(sum(produced_weight_kg), 0), coalesce(sum(produced_bag_count), 0)
    INTO v_outputs, v_outputs_bags
  FROM public.milling_job_outputs
  WHERE job_id = _job_id;

  IF v_outputs <= 0 THEN
    RAISE EXCEPTION 'Record at least one output before closing job %', _job_id;
  END IF;

  -- More output than input is impossible: refuse rather than post a negative loss.
  IF v_outputs > v_input + 0.001 THEN
    RAISE EXCEPTION
      'Output weight % kg exceeds the input weight % kg — check the recorded quantities',
      v_outputs, v_input
      USING ERRCODE = 'check_violation';
  END IF;

  v_actual  := round(v_input - v_outputs, 3);
  v_allowed := round(v_input * v_allowed_pct / 100, 3);
  v_excess  := round(greatest(v_actual - v_allowed, 0), 3);
  v_rate    := CASE WHEN v_input > 0 THEN round(v_outputs * 100 / v_input, 2) ELSE 0 END;

  UPDATE public.milling_jobs
  SET status        = 'COMPLETED',
      actual_loss_kg = v_actual,
      loss_excess_kg = v_excess,
      finished_at   = timezone('utc'::text, now()),
      notes          = coalesce(nullif(btrim(COALESCE(_notes, '')), ''), notes)
  WHERE id = _job_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.completed', 'milling_job', _job_id,
    jsonb_build_object(
      'input_weight_kg', v_input,
      'total_output_weight_kg', v_outputs,
      'total_output_bags', v_outputs_bags,
      'actual_loss_kg', v_actual,
      'allowed_loss_kg', v_allowed,
      'allowed_loss_percentage', v_allowed_pct,
      'loss_excess_kg', v_excess,
      'actual_extraction_rate', v_rate,
      'expected_extraction_rate', v_expected,
      'loss_exceeds_allowance', v_excess > 0,
      'stock_impact', 'NONE — customer custody'
    ));

  -- Returned so the UI can show the operator the numbers that were just
  -- committed, instead of re-deriving them and risking a mismatch.
  RETURN jsonb_build_object(
    'job_id', _job_id,
    'input_weight_kg', v_input,
    'total_output_weight_kg', v_outputs,
    'total_output_bags', v_outputs_bags,
    'actual_loss_kg', v_actual,
    'allowed_loss_kg', v_allowed,
    'loss_excess_kg', v_excess,
    'actual_extraction_rate', v_rate,
    'expected_extraction_rate', v_expected,
    'loss_exceeds_allowance', v_excess > 0
  );
END $function$;

CREATE OR REPLACE FUNCTION public.complete_production_order(_order_id uuid, _overhead_cost numeric DEFAULT 0, _direct_labour numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_ord  record;
  v_in   numeric; v_out numeric; v_loss numeric; v_gap numeric;
  v_mat  numeric; v_total numeric; v_basis text;
  v_byprod_value numeric := 0;
  v_primary_share numeric;
  v_primary_qty numeric;
  v_byprod_qty numeric := 0;
  v_allocated numeric := 0;
  r record;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to complete production orders';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is already %', v_ord.order_number, v_ord.status;
  END IF;

  v_in   := coalesce((SELECT sum(actual_qty) FROM public.production_order_materials WHERE order_id = _order_id), 0);
  v_out  := coalesce((SELECT sum(actual_qty) FROM public.production_order_outputs   WHERE order_id = _order_id), 0);
  v_loss := coalesce((SELECT sum(qty)           FROM public.production_order_losses   WHERE order_id = _order_id), 0);
  v_mat  := coalesce((SELECT sum(total_cost)   FROM public.production_order_materials WHERE order_id = _order_id), 0);

  IF v_in <= 0 THEN
    RAISE EXCEPTION 'Nothing was issued on this order, so there is nothing to complete';
  END IF;

  v_gap := v_in - v_out - v_loss;
  IF v_gap < -0.001 THEN
    RAISE EXCEPTION
      'Output and loss exceed input by %. Unbalanced: in %, out %, loss %',
      abs(v_gap), v_in, v_out, v_loss;
  END IF;

  v_total := round(v_mat + coalesce(_direct_labour,0) + coalesce(_overhead_cost,0), 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Production cost is zero, so no output can be valued';
  END IF;

  v_basis := v_ord.allocation_basis;

  -- ── how much the by-products may claim ──
  IF v_basis IN ('NET_REALISABLE_VALUE','RELATIVE_SALES_VALUE') THEN
    SELECT round(coalesce(sum(o.actual_qty * coalesce(p.sale_price, 0)), 0), 2) INTO v_byprod_value
      FROM public.production_order_outputs o
      JOIN public.products p ON p.id = o.product_id
     WHERE o.order_id = _order_id AND o.output_role = 'BY_PRODUCT';

    -- A by-product cannot be worth more than the production it came from. That
    -- means the sale prices are wrong, or the outputs overlap.
    IF v_byprod_value > v_total THEN
      IF v_basis = 'NET_REALISABLE_VALUE' THEN
        RAISE EXCEPTION
          'By-product realisable value (%.2f) exceeds total production cost (%.2f). '
          'Either the sale prices are wrong or the outputs overlap.', v_byprod_value, v_total;
      END IF;
      v_byprod_value := v_total;
    END IF;
  END IF;

  -- The by-product's realisable value IS its full sale value - 200 kg of bran
  -- at 10 is 2000, not 41.7% of it. The credit is therefore divided among the
  -- by-products themselves by weight, and the primary takes what is left.
  --
  -- Pro-rating against the TOTAL output quantity was wrong: it gave each
  -- by-product only its fraction of the total quantity and then handed the
  -- primary the entire remainder, so the two together came to less than the
  -- production cost by the by-products' share of the primary's weight.
  SELECT coalesce(sum(actual_qty), 0) INTO v_byprod_qty
    FROM public.production_order_outputs
   WHERE order_id = _order_id AND output_role = 'BY_PRODUCT';

  FOR r IN
    SELECT id, actual_qty FROM public.production_order_outputs
     WHERE order_id = _order_id AND output_role = 'BY_PRODUCT'
  LOOP
    UPDATE public.production_order_outputs
       SET total_cost = round(v_byprod_value * r.actual_qty / nullif(v_byprod_qty, 0), 2),
           unit_cost  = CASE WHEN r.actual_qty > 0
                             THEN round(v_byprod_value * r.actual_qty / nullif(v_byprod_qty, 0) / r.actual_qty, 4)
                             ELSE 0 END
     WHERE id = r.id;
  END LOOP;

  -- What is left for the primary - the REMAINDER, not the total. Giving the
  -- primary v_total while the by-products also carry a credit allocated the
  -- same cost twice, and the sum of the outputs then exceeded the production
  -- cost it was supposed to come from.
  v_primary_share := v_total - v_byprod_value;

  SELECT coalesce(sum(actual_qty), 0) INTO v_primary_qty
    FROM public.production_order_outputs WHERE order_id = _order_id AND output_role = 'PRIMARY';

  IF v_primary_qty <= 0 THEN
    RAISE EXCEPTION 'No primary output was received, so the production cost has nowhere to go';
  END IF;

  FOR r IN
    SELECT id, actual_qty FROM public.production_order_outputs
     WHERE order_id = _order_id AND output_role = 'PRIMARY'
  LOOP
    UPDATE public.production_order_outputs
       SET total_cost = round(v_primary_share * r.actual_qty / v_primary_qty, 2),
           unit_cost  = CASE WHEN r.actual_qty > 0
                             THEN round(v_primary_share / v_primary_qty, 4)
                             ELSE 0 END
     WHERE id = r.id;
  END LOOP;

  -- ── the arithmetic must close ──
  -- A rounding remainder of a riyal is normal; anything larger means the
  -- allocation itself is wrong, and failing here is far better than discovering
  -- it in a financial report months later.
  SELECT coalesce(sum(total_cost), 0) INTO v_allocated
    FROM public.production_order_outputs WHERE order_id = _order_id;
  IF abs(v_allocated - v_total) > 0.05 THEN
    RAISE EXCEPTION
      'Allocated output cost (%.2f) does not match total production cost (%.2f) under basis %. '
      'The allocation is inconsistent.', v_allocated, v_total, v_basis;
  END IF;

  -- Write the allocated cost into the cost layer for the stock already received
  FOR r IN
    SELECT o.product_id, o.actual_qty, o.total_cost
      FROM public.production_order_outputs o WHERE o.order_id = _order_id
  LOOP
    INSERT INTO public.item_cost_layers
      (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
       valuation_method, last_unit_cost, last_movement_at, updated_at)
    VALUES
      (r.product_id, v_ord.warehouse_id, 'COMPANY', NULL, r.actual_qty, r.total_cost,
       v_ord.costing_method,
       CASE WHEN r.actual_qty > 0 THEN round(r.total_cost / r.actual_qty, 4) ELSE 0 END,
       now(), now())
    ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
    DO UPDATE SET total_value      = round(public.item_cost_layers.total_value + EXCLUDED.total_value, 2),
                  last_unit_cost   = CASE WHEN public.item_cost_layers.quantity > 0
                                          THEN round((public.item_cost_layers.total_value + EXCLUDED.total_value)
                                                     / public.item_cost_layers.quantity, 4)
                                          ELSE EXCLUDED.last_unit_cost END,
                  valuation_method = EXCLUDED.valuation_method,
                  updated_at       = now();
  END LOOP;

  -- The unreconciled remainder is recorded, not absorbed.
  IF v_gap > 0.001 THEN
    INSERT INTO public.production_order_losses (order_id, reason, qty, value, notes, created_by)
    VALUES (_order_id, 'فرق غير مفسّر (لم يُسجَّل سببه)', v_gap,
            round(v_gap * CASE WHEN v_in > 0 THEN v_mat / v_in ELSE 0 END, 2),
            'الفرق بين الداخل والناتج المسجَّل: لم يُخصم له سبب، ويحتاج مراجعة.', v_user);
  END IF;

  UPDATE public.production_orders
     SET material_cost    = v_mat,
         direct_labour    = round(coalesce(_direct_labour,0), 2),
         overhead_cost    = round(coalesce(_overhead_cost,0), 2),
         total_cost       = v_total,
         costing_method   = public.company_costing_method(),
         status           = 'COMPLETED',
         completed_by     = v_user,
         completed_at     = now(),
         actual_yield_pct = CASE WHEN v_in > 0 THEN round(v_out * 100 / v_in, 3) END
   WHERE id = _order_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'production.order_completed', 'production_order', _order_id,
    jsonb_build_object(
      'order_number',     v_ord.order_number,
      'input_qty',        v_in, 'output_qty', v_out, 'loss_qty', v_loss,
      'unreconciled',     round(v_gap, 3),
      'material_cost',    v_mat, 'total_cost', v_total,
      'allocation_basis', v_basis,
      'by_product_credit', v_byprod_value,
      'primary_share',    v_primary_share));

  RETURN _order_id;
END $function$;

CREATE OR REPLACE FUNCTION public.create_milling_agreement(_intake_receipt_id uuid, _grain_grade_id uuid, _requested_output_type text, _requested_output_note text, _output_bag_size_kg numeric, _bags_source text, _delivery_mode text, _service_product_id uuid, _price_basis text, _agreed_price numeric, _expected_extraction_rate numeric, _allowed_loss_percentage numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid := auth.uid();
  v_id        uuid;
  v_store     uuid;
  v_customer  uuid;
  v_basis     text;
  v_src       text;
  v_mode      text;
  v_receipt_status public.milling_status;
  v_grade     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling agreements';
  END IF;

  IF _intake_receipt_id IS NULL THEN
    RAISE EXCEPTION 'An intake receipt is required — a job must come from a customer''s grain';
  END IF;

  -- قفل السند: يمنع عقدين متزامنين على نفس الرصيد.
  SELECT store_id, customer_id, grain_grade_id, status
    INTO v_store, v_customer, v_grade, v_receipt_status
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake receipt % does not exist', _intake_receipt_id;
  END IF;
  IF v_receipt_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'This intake receipt is cancelled';
  END IF;

  IF _grain_grade_id IS NULL THEN
    RAISE EXCEPTION 'Grain grade is required';
  END IF;

  -- العقد لا يقرر صنفاً غير الصنف المسجَّل في سند الاستلام.
  IF v_grade IS NOT NULL AND v_grade <> _grain_grade_id THEN
    RAISE EXCEPTION
      'The agreement grade does not match the grade recorded on the intake receipt';
  END IF;

  -- الدرجة مطلوبة: هذا الشرط يعالج المشكلة الأصلية (أمر بلا طلب محدد).
  IF _requested_output_type IS NULL OR btrim(_requested_output_type) = '' THEN
    RAISE EXCEPTION
      'The requested output grade is required — record what the customer asked for before quoting a price';
  END IF;

  IF coalesce(_output_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Output bag size must be greater than zero';
  END IF;

  v_src := upper(btrim(COALESCE(_bags_source, 'CUSTOMER')));
  IF v_src NOT IN ('CUSTOMER', 'MILL') THEN
    RAISE EXCEPTION 'bags_source must be CUSTOMER or MILL';
  END IF;

  v_mode := upper(btrim(COALESCE(_delivery_mode, 'FULL')));
  IF v_mode NOT IN ('FULL', 'PARTIAL') THEN
    RAISE EXCEPTION 'delivery_mode must be FULL or PARTIAL';
  END IF;

  -- التسعير: أساس واحد إلزامي بسعر موجب.
  IF _price_basis IS NULL OR upper(btrim(_price_basis)) NOT IN ('BAG', 'TON') THEN
    RAISE EXCEPTION 'price_basis must be BAG or TON — pick exactly one basis';
  END IF;
  v_basis := upper(btrim(_price_basis));

  IF coalesce(_agreed_price, 0) <= 0 THEN
    RAISE EXCEPTION 'An agreed price is required and must be greater than zero';
  END IF;

  IF _service_product_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = _service_product_id AND p.item_nature = 'SERVICE'
    ) THEN
      RAISE EXCEPTION
        'The milling service must be a SERVICE item (item_nature = SERVICE), not a stocked product';
    END IF;
  END IF;

  IF coalesce(_expected_extraction_rate, 80) <= 0
     OR coalesce(_expected_extraction_rate, 80) > 100 THEN
    RAISE EXCEPTION 'Expected extraction rate must be between 0 and 100';
  END IF;
  IF coalesce(_allowed_loss_percentage, 2) < 0
     OR coalesce(_allowed_loss_percentage, 2) > 100 THEN
    RAISE EXCEPTION 'Allowed loss percentage must be between 0 and 100';
  END IF;

  INSERT INTO public.milling_service_agreements (
    store_id, customer_id, intake_receipt_id, grain_grade_id,
    requested_output_type, requested_output_note, output_bag_size_kg,
    bags_source, delivery_mode,
    service_product_id, price_basis, agreed_price,
    expected_extraction_rate, allowed_loss_percentage,
    status, agreed_by, notes
  )
  VALUES (
    v_store, v_customer, _intake_receipt_id, _grain_grade_id,
    _requested_output_type::public.milling_output_type,
    nullif(btrim(COALESCE(_requested_output_note, '')), ''),
    coalesce(_output_bag_size_kg, 50),
    v_src, v_mode,
    _service_product_id, v_basis, coalesce(_agreed_price, 0),
    coalesce(_expected_extraction_rate, 80), coalesce(_allowed_loss_percentage, 2),
    'AGREED', v_user, nullif(btrim(COALESCE(_notes, '')), '')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.agreement.created', 'milling_agreement', v_id,
    jsonb_build_object(
      'intake_receipt_id', _intake_receipt_id,
      'customer_id',      v_customer,
      'grain_grade_id',   _grain_grade_id,
      'requested_output_type', _requested_output_type,
      'bags_source',      v_src,
      'delivery_mode',    v_mode,
      'price_basis',      v_basis,
      'agreed_price',     coalesce(_agreed_price, 0),
      'stock_impact',     'NONE — agreement is a commercial document, not a movement'
    ));

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.create_milling_intake(_store_id uuid, _customer_id uuid, _grain_type text, _grain_product_id uuid, _grain_grade_id uuid, _bag_size_kg numeric, _bag_count integer, _gross_weight_kg numeric, _tare_weight_kg numeric, _moisture numeric, _impurities numeric, _truck_plate text, _driver_name text, _silo text, _notes text, _bag_type text DEFAULT 'شوال خيش طبيعي 50 كجم'::text, _bag_source text DEFAULT 'CUSTOMER'::text, _bag_condition text DEFAULT 'سليم ومحكم'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_number  text;
  v_net     numeric;
  v_nominal numeric;
  v_grain   text;
  v_grade   record;
  v_check   jsonb;
  v_source  text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to receive customer custody grain';
  END IF;

  -- ── validation, before anything is written ──────────────────────────────
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required - this receipt is a custody document';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id AND c.is_active) THEN
    RAISE EXCEPTION 'Selected customer is unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _store_id AND w.is_active) THEN
    RAISE EXCEPTION 'Selected warehouse is unavailable';
  END IF;

  v_grain := btrim(COALESCE(_grain_type, ''));
  IF v_grain = '' THEN
    RAISE EXCEPTION 'Grain type is required';
  END IF;

  -- ── the reference inspection ─────────────────────────────────────────────
  IF _grain_grade_id IS NULL THEN
    RAISE EXCEPTION
      'Grain grade is required - the grade determines the milling price later';
  END IF;

  SELECT g.id, g.grade_name_ar, g.max_moisture, g.max_impurities, g.default_bag_size_kg,
         g.default_bag_type
    INTO v_grade
    FROM public.milling_grain_grades g
   WHERE g.id = _grain_grade_id AND g.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected grain grade is unavailable';
  END IF;

  -- grain_type is DERIVED from the grade, never taken from the browser. That
  -- is what stopped the same physical grain being recorded two ways.
  v_grain := v_grade.grade_name_ar;

  IF _bag_count IS NULL OR _bag_count <= 0 THEN
    RAISE EXCEPTION 'Bag count must be greater than zero';
  END IF;
  IF _bag_size_kg IS NULL OR _bag_size_kg <= 0 THEN
    RAISE EXCEPTION 'Bag size must be greater than zero';
  END IF;
  IF _gross_weight_kg IS NULL OR _tare_weight_kg IS NULL THEN
    RAISE EXCEPTION 'Gross and tare weights are required from the scale';
  END IF;

  -- Net weight is derived on the server, never accepted from the browser.
  v_net := _gross_weight_kg - COALESCE(_tare_weight_kg, 0);
  IF v_net <= 0 THEN
    RAISE EXCEPTION 'Net weight must be greater than zero (gross %, tare %)',
      _gross_weight_kg, _tare_weight_kg;
  END IF;

  v_nominal := _bag_count * _bag_size_kg;

  -- ── the technical check, recorded either way ─────────────────────────────
  v_check := jsonb_build_object(
    'grade_id',        v_grade.id,
    'grade_name',      v_grade.grade_name_ar,
    'moisture',        _moisture,
    'max_moisture',    v_grade.max_moisture,
    'moisture_ok',     (_moisture IS NULL OR _moisture <= v_grade.max_moisture),
    'impurities',      _impurities,
    'max_impurities',  v_grade.max_impurities,
    'impurities_ok',   (_impurities IS NULL OR _impurities <= v_grade.max_impurities),
    'nominal_weight',  v_nominal,
    'net_weight',      v_net,
    'bag_weight_gap',  round(v_net - v_nominal, 3)
  );

  -- Moisture is a WARNING, not a refusal: the operator decides whether wet
  -- grain is accepted, and the check is recorded so the decision is visible.
  v_source := CASE WHEN (_moisture IS NOT NULL AND _moisture > v_grade.max_moisture)
                   THEN 'MILLING_INTAKE_MOISTURE_WARNING'
                   ELSE 'MILLING_INTAKE' END;

  v_number := public.next_milling_intake_number();

  INSERT INTO public.milling_intake_receipts (
    receipt_number, store_id, customer_id, grain_type, grain_product_id, grain_grade_id,
    bag_size_kg, intake_bag_count, gross_weight_kg, tare_weight_kg, net_weight_kg,
    moisture_percentage, impurities_percentage, truck_plate_number, driver_name,
    silo_or_location, notes, status, received_by,
    bag_type, bag_source, bag_condition
  ) VALUES (
    v_number, _store_id, _customer_id, v_grain, _grain_product_id, _grain_grade_id,
    _bag_size_kg, _bag_count, _gross_weight_kg, COALESCE(_tare_weight_kg,0), v_net,
    _moisture, _impurities, _truck_plate, _driver_name,
    _silo, _notes, 'RECEIVED', v_user,
    -- The bag fields now actually reach the table. Before this migration they
    -- were accepted by the form, sent over the wire, and dropped here.
    nullif(btrim(coalesce(_bag_type, '')), ''),
    coalesce(nullif(btrim(coalesce(_bag_source, '')), ''), 'CUSTOMER'),
    nullif(btrim(coalesce(_bag_condition, '')), '')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, v_source, 'milling_intake_receipt', v_id,
    jsonb_build_object(
      'receipt_number', v_number,
      'customer_id',    _customer_id,
      'grain_type',     v_grain,
      'net_weight_kg',  v_net,
      'nominal_weight', v_nominal,
      'bag_type',       _bag_type,
      'bag_source',     _bag_source,
      'bag_condition',  _bag_condition,
      'technical_check', v_check,
      'stock_impact',   'NONE - customer custody'
    ));

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.create_milling_job(_intake_receipt_id uuid, _input_bag_count integer, _input_bag_size_kg numeric, _input_weight_kg numeric, _fee_per_bag numeric, _fee_per_ton numeric, _service_product_id uuid, _expected_extraction_rate numeric, _allowed_loss_percentage numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_id         uuid;
  v_number     text;
  v_store      uuid;
  v_customer   uuid;
  v_available  numeric;
  v_already    numeric;
  v_bag_size   numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling jobs';
  END IF;

  IF _intake_receipt_id IS NULL THEN
    RAISE EXCEPTION 'An intake receipt is required';
  END IF;

  -- Lock the receipt so two operators cannot both draw from the same custody
  -- balance concurrently.
  SELECT store_id, customer_id
    INTO v_store, v_customer
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake receipt % does not exist', _intake_receipt_id;
  END IF;

  IF (SELECT status FROM public.milling_intake_receipts WHERE id = _intake_receipt_id) = 'CANCELLED' THEN
    RAISE EXCEPTION 'This intake receipt is cancelled';
  END IF;

  v_bag_size := coalesce(_input_bag_size_kg, 0);
  IF v_bag_size <= 0 THEN
    v_bag_size := 50.00;
  END IF;

  IF coalesce(_input_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Input bag count cannot be negative';
  END IF;

  IF _input_weight_kg IS NULL OR _input_weight_kg <= 0 THEN
    RAISE EXCEPTION 'Input weight must be positive';
  END IF;

  IF coalesce(_fee_per_bag, 0) < 0 OR coalesce(_fee_per_ton, 0) < 0 THEN
    RAISE EXCEPTION 'Milling fees cannot be negative';
  END IF;
  IF coalesce(_fee_per_bag, 0) = 0 AND coalesce(_fee_per_ton, 0) = 0 THEN
    RAISE EXCEPTION 'Set at least one milling fee (per bag or per ton)';
  END IF;

  IF coalesce(_expected_extraction_rate, 80) <= 0 OR coalesce(_expected_extraction_rate, 80) > 100 THEN
    RAISE EXCEPTION 'Expected extraction rate must be between 0 and 100';
  END IF;
  IF coalesce(_allowed_loss_percentage, 2) < 0 OR coalesce(_allowed_loss_percentage, 2) > 100 THEN
    RAISE EXCEPTION 'Allowed loss percentage must be between 0 and 100';
  END IF;

  -- How much custody is still un-milled on this receipt?
  SELECT net_weight_kg INTO v_available
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id;

  SELECT coalesce(sum(input_weight_kg), 0) INTO v_already
  FROM public.milling_jobs
  WHERE intake_receipt_id = _intake_receipt_id
    AND status <> 'CANCELLED';

  IF _input_weight_kg > (v_available - v_already) + 0.001 THEN
    RAISE EXCEPTION
      'Cannot draw more than the custody balance: receipt has % kg, already drawn % kg, requested % kg',
      v_available, v_already, _input_weight_kg
      USING ERRCODE = 'check_violation';
  END IF;

  v_number := public.next_milling_job_number();

  INSERT INTO public.milling_jobs (
    store_id, job_number, intake_receipt_id, customer_id,
    input_bag_count, input_bag_size_kg, input_weight_kg,
    milling_fee_per_bag, milling_fee_per_ton, service_product_id,
    expected_extraction_rate, allowed_loss_percentage,
    status, started_at, notes, created_by
  )
  VALUES (
    v_store, v_number, _intake_receipt_id, v_customer,
    coalesce(_input_bag_count, 0), v_bag_size, _input_weight_kg,
    coalesce(_fee_per_bag, 0), coalesce(_fee_per_ton, 0), _service_product_id,
    coalesce(_expected_extraction_rate, 80), coalesce(_allowed_loss_percentage, 2),
    'PROCESSING', timezone('utc'::text, now()),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.started', 'milling_job', v_id,
    jsonb_build_object(
      'job_number', v_number,
      'intake_receipt_id', _intake_receipt_id,
      'customer_id', v_customer,
      'input_weight_kg', _input_weight_kg,
      'fee_per_bag', coalesce(_fee_per_bag, 0),
      'fee_per_ton', coalesce(_fee_per_ton, 0),
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.create_milling_job_v2(_agreement_id uuid, _intake_receipt_id uuid, _input_bag_count integer, _input_bag_size_kg numeric, _input_weight_kg numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_id         uuid;
  v_number     text;
  v_store      uuid;
  v_customer   uuid;
  v_available  numeric;
  v_already    numeric;
  v_agree      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling jobs';
  END IF;

  IF _agreement_id IS NULL THEN
    RAISE EXCEPTION 'An agreement is required — create the milling agreement first';
  END IF;

  SELECT * INTO v_agree
  FROM public.milling_service_agreements
  WHERE id = _agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement % does not exist', _agreement_id;
  END IF;
  IF v_agree.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Agreement % is cancelled', _agreement_id;
  END IF;
  IF v_agree.status = 'CONSUMED' THEN
    RAISE EXCEPTION
      'Agreement % already has a job — create a new agreement for another run', _agreement_id;
  END IF;

  -- السند يجب أن يطابق العقد. يمنع ربط عقد بسند غير سنده.
  IF _intake_receipt_id IS NOT NULL AND _intake_receipt_id <> v_agree.intake_receipt_id THEN
    RAISE EXCEPTION 'The intake receipt does not match this agreement';
  END IF;

  v_store    := v_agree.store_id;
  v_customer := v_agree.customer_id;

  IF coalesce(_input_weight_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Input weight must be positive';
  END IF;

  IF (SELECT status FROM public.milling_intake_receipts
       WHERE id = v_agree.intake_receipt_id) = 'CANCELLED' THEN
    RAISE EXCEPTION 'This intake receipt is cancelled';
  END IF;

  -- ── سحب من رصيد الأمانات (نفس منطق v1) ──────────────────────────────────
  SELECT net_weight_kg INTO v_available
  FROM public.milling_intake_receipts
  WHERE id = v_agree.intake_receipt_id;

  SELECT coalesce(sum(input_weight_kg), 0) INTO v_already
  FROM public.milling_jobs
  WHERE intake_receipt_id = v_agree.intake_receipt_id
    AND status <> 'CANCELLED';

  IF _input_weight_kg > (v_available - v_already) + 0.001 THEN
    RAISE EXCEPTION
      'Cannot draw more than the custody balance: receipt has % kg, already drawn % kg, requested % kg',
      v_available, v_already, _input_weight_kg
      USING ERRCODE = 'check_violation';
  END IF;

  v_number := public.next_milling_job_number();

  -- التسعير من العقد: BAG → fee_per_bag، TON → fee_per_ton، والآخر صفر.
  INSERT INTO public.milling_jobs (
    store_id, job_number, intake_receipt_id, customer_id, agreement_id,
    input_bag_count, input_bag_size_kg, input_weight_kg,
    milling_fee_per_bag, milling_fee_per_ton, service_product_id,
    expected_extraction_rate, allowed_loss_percentage,
    status, started_at, notes, created_by
  )
  VALUES (
    v_store, v_number, v_agree.intake_receipt_id, v_customer, _agreement_id,
    coalesce(_input_bag_count, 0), coalesce(_input_bag_size_kg, v_agree.output_bag_size_kg), _input_weight_kg,
    CASE WHEN v_agree.price_basis = 'BAG'  THEN v_agree.agreed_price ELSE 0 END,
    CASE WHEN v_agree.price_basis = 'TON'  THEN v_agree.agreed_price ELSE 0 END,
    v_agree.service_product_id,
    v_agree.expected_extraction_rate, v_agree.allowed_loss_percentage,
    'PROCESSING', timezone('utc'::text, now()),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  UPDATE public.milling_service_agreements
     SET status = 'CONSUMED'
   WHERE id = _agreement_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.started', 'milling_job', v_id,
    jsonb_build_object(
      'job_number',    v_number,
      'agreement_id',  _agreement_id,
      'intake_receipt_id', v_agree.intake_receipt_id,
      'customer_id',   v_customer,
      'input_weight_kg', _input_weight_kg,
      'price_basis',   v_agree.price_basis,
      'agreed_price',  v_agree.agreed_price,
      'requested_output_type', v_agree.requested_output_type,
      'stock_impact',  'NONE — customer custody'
    ));

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.create_production_order(_warehouse_id uuid, _bom_id uuid DEFAULT NULL::uuid, _production_date date DEFAULT CURRENT_DATE, _allocation_basis text DEFAULT 'REMAINDER_TO_PRIMARY'::text, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_id    uuid;
  v_num   text;
  v_basis text := coalesce(_allocation_basis, 'REMAINDER_TO_PRIMARY');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to run mill production';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _warehouse_id AND w.is_active) THEN
    RAISE EXCEPTION 'Selected warehouse is unavailable';
  END IF;
  IF v_basis NOT IN ('REMAINDER_TO_PRIMARY','NET_REALISABLE_VALUE','RELATIVE_SALES_VALUE') THEN
    RAISE EXCEPTION 'Unknown allocation basis: %', v_basis;
  END IF;

  v_num := 'PO-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
           lpad(nextval('public.production_order_seq')::text, 4, '0');

  INSERT INTO public.production_orders
    (order_number, warehouse_id, bom_id, production_date, status,
     allocation_basis, costing_method, created_by, notes)
  VALUES
    (v_num, _warehouse_id, _bom_id, coalesce(_production_date, CURRENT_DATE), 'PLANNED',
     v_basis, public.company_costing_method(), v_user, nullif(btrim(coalesce(_notes,'')), ''))
  RETURNING id INTO v_id;

  -- A BOM copies into PLANNED lines only. The plan never becomes the actual.
  IF _bom_id IS NOT NULL THEN
    INSERT INTO public.production_order_materials (order_id, product_id, planned_qty)
    SELECT v_id, l.product_id, l.qty
      FROM public.production_bom_lines l
     WHERE l.bom_id = _bom_id AND l.line_role = 'INPUT' AND l.product_id IS NOT NULL;

    INSERT INTO public.production_order_outputs
      (order_id, product_id, output_role, planned_qty)
    SELECT v_id, l.product_id,
           CASE WHEN l.line_role = 'BY_PRODUCT' THEN 'BY_PRODUCT' ELSE 'PRIMARY' END, l.qty
      FROM public.production_bom_lines l
     WHERE l.bom_id = _bom_id AND l.line_role IN ('OUTPUT','BY_PRODUCT') AND l.product_id IS NOT NULL;

    INSERT INTO public.production_order_losses (order_id, reason, qty, value, notes)
    SELECT v_id, coalesce(l.loss_reason, 'فاقد متوقع حسب الوصفة'), l.qty, 0, l.notes
      FROM public.production_bom_lines l
     WHERE l.bom_id = _bom_id AND l.line_role = 'LOSS' AND l.product_id IS NULL;

    UPDATE public.production_orders o
       SET planned_input_qty = coalesce((SELECT sum(planned_qty) FROM public.production_order_materials WHERE order_id = v_id), 0),
           planned_output_qty = coalesce((SELECT sum(planned_qty) FROM public.production_order_outputs WHERE order_id = v_id), 0),
           planned_yield_pct = CASE
             WHEN coalesce((SELECT sum(planned_qty) FROM public.production_order_materials WHERE order_id = v_id), 0) > 0
             THEN round(coalesce((SELECT sum(planned_qty) FROM public.production_order_outputs WHERE order_id = v_id), 0) * 100
                        / (SELECT sum(planned_qty) FROM public.production_order_materials WHERE order_id = v_id), 3)
           END
     WHERE o.id = v_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'production.order_created', 'production_order', v_id,
          jsonb_build_object('order_number', v_num, 'bom_id', _bom_id, 'allocation_basis', v_basis));
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.issue_milling_service_invoice(_job_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _include_packaging boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        uuid := auth.uid();
  v_invoice_id  uuid;
  v_store       uuid;
  v_customer    uuid;
  v_status      public.milling_status;
  v_bags        integer;
  v_bag_size    numeric;
  v_input_kg    numeric;
  v_fee_per_bag numeric;
  v_fee_per_ton numeric;
  v_tons        numeric;
  v_service_id  uuid;
  v_ton_service_id uuid;
  v_lines       jsonb := '[]'::jsonb;
  v_pack        record;
  v_pack_bags   integer := 0;
  v_pack_value  numeric := 0;
  v_line_item   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to invoice milling services';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(_payment_method, '') = '' THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;

  SELECT store_id, customer_id, status, input_bag_count, input_bag_size_kg,
         input_weight_kg, milling_fee_per_bag, milling_fee_per_ton, service_product_id
    INTO v_store, v_customer, v_status, v_bags, v_bag_size,
         v_input_kg, v_fee_per_bag, v_fee_per_ton, v_service_id
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;

  -- Only a finished run is billable. Billing an open job would invoice a fee
  -- for grain that is still in the mill.
  IF v_status <> 'COMPLETED' AND v_status <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % must be completed before invoicing (current status: %)', _job_id, v_status;
  END IF;

  -- Idempotency: one service invoice per job. Re-issuing would double-bill.
  SELECT id INTO v_invoice_id
  FROM public.sales_invoices
  WHERE milling_job_id = _job_id;

  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job % has already been invoiced (invoice %) — delete it first to re-issue', _job_id, v_invoice_id;
  END IF;

  -- Fall back to the standard 50 kg per-bag service card.
  IF v_service_id IS NULL THEN
    SELECT id INTO v_service_id FROM public.products WHERE sku = 'SRV-MILL-BAG50';
  END IF;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'No milling service item found (SRV-MILL-BAG50) — run the milling master-data seed';
  END IF;

  -- Per-ton fee gets its OWN card, otherwise create_sale prices it with the
  -- per-bag card's catalogue price (the bug this migration fixes).
  SELECT id INTO v_ton_service_id FROM public.products WHERE sku = 'SRV-MILL-TON-JOB';
  IF v_ton_service_id IS NULL THEN
    SELECT id INTO v_ton_service_id FROM public.products WHERE sku = 'SRV-MILL-TON';
  END IF;

  -- ── line 1: the milling fee ─────────────────────────────────────────────
  -- Per-bag and per-ton fees are independent terms. When a contract sets both
  -- ("the greater of"), BOTH are charged and the operator sees two lines, rather
  -- than the function silently picking one and hiding the commercial decision.
  IF v_fee_per_bag > 0 THEN
    IF coalesce(v_bags, 0) <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per bag but records no bag count', _job_id;
    END IF;

    -- create_sale takes the catalogue price whenever a product_id is present, so
    -- the agreed job fee is pinned onto its own card first. This is what makes
    -- the billing follow milling_jobs.milling_fee_per_bag, as the seed comment
    -- promises, instead of the generic reference price.
    UPDATE public.products
       SET sale_price = v_fee_per_bag, updated_at = now()
     WHERE id = v_service_id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_service_id,
      'quantity', v_bags,
      'unit_price', v_fee_per_bag
    ));
  END IF;

  IF v_fee_per_ton > 0 THEN
    v_tons := round(v_input_kg / 1000, 3);

    IF v_ton_service_id IS NULL THEN
      RAISE EXCEPTION 'No per-ton milling service card (SRV-MILL-TON-JOB) — run migration 20261001120000';
    END IF;

    UPDATE public.products
       SET sale_price = v_fee_per_ton, updated_at = now()
     WHERE id = v_ton_service_id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_ton_service_id,
      'quantity', v_tons,
      'unit_price', v_fee_per_ton
    ));
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Job % has no milling fee configured', _job_id;
  END IF;

  -- ── lines 2..n: packaging supplied by the mill ───────────────────────────
  -- The bag stock is decremented HERE and only here, so every issue is tied to a
  -- real financial document and the packaging stock can never drift from the
  -- invoices. Customer-supplied bags (bags_source = 'CUSTOMER') are skipped:
  -- they have no financial effect at all.
  IF coalesce(_include_packaging, true) THEN
    FOR v_pack IN
      SELECT o.mill_bag_product_id,
             sum(o.mill_bags_used)  AS bags,
             max(p.sale_price)      AS unit_price,
             max(p.cost_price)      AS unit_cost,
             max(p.tax_rate)        AS tax_rate
      FROM public.milling_job_outputs o
      JOIN public.products p ON p.id = o.mill_bag_product_id
      WHERE o.job_id = _job_id
        AND o.bags_source = 'MILL'
        AND o.mill_bags_used > 0
      GROUP BY o.mill_bag_product_id
    LOOP
      v_pack_bags   := v_pack_bags + coalesce(v_pack.bags, 0);
      v_pack_value  := v_pack_value + round(coalesce(v_pack.bags, 0) * coalesce(v_pack.unit_price, 0), 2);

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pack.mill_bag_product_id,
        'quantity', coalesce(v_pack.bags, 0),
        'unit_price', coalesce(v_pack.unit_price, 0)
      ));
    END LOOP;
  END IF;

  -- ── post through the ordinary sales engine ───────────────────────────────
  -- create_sale() reads each line's item policy and posts STOCK_ISSUE only for
  -- TRACKED goods. The milling fee lines are SERVICE → no movement. The packaging
  -- line is GOOD + TRACKED → a real issue against the mill's own stock, tied to
  -- this invoice. That is the entire, and only, stock effect of the module.
  v_invoice_id := public.create_sale(
    v_store,
    v_customer,
    _payment_method,
    coalesce(_paid, 0),
    coalesce(_discount, 0),
    btrim(COALESCE(_note, '') || ' — أجرة طحن ' || (SELECT job_number FROM public.milling_jobs WHERE id = _job_id)),
    v_lines
  );

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'The sales engine returned no invoice';
  END IF;

  -- Tag the invoice so the customer statement can separate toll-service billing
  -- from ordinary goods sales, and so double-billing is detectable above.
  UPDATE public.sales_invoices
  SET milling_job_id = _job_id
  WHERE id = v_invoice_id;

  -- The stock effect of the packaging lines is recorded on the milling audit
  -- trail, so a stock-take discrepancy in packaging can be traced to the exact
  -- service invoice that caused it.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.invoice.issued', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'milling_job_id', _job_id,
      'customer_id', v_customer,
      'warehouse_id', v_store,
      'fee_per_bag', v_fee_per_bag,
      'fee_per_ton', v_fee_per_ton,
      'packaging_bags', v_pack_bags,
      'packaging_value', v_pack_value,
      'stock_impact', 'STOCK_ISSUE on mill packaging only — grain and flour untouched'
    ));

  RETURN v_invoice_id;
END $function$;

CREATE OR REPLACE FUNCTION public.issue_milling_service_invoice_v2(_job_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _include_packaging boolean DEFAULT true, _include_sewing boolean DEFAULT false, _sewing_price numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_invoice_id uuid;
  v_store      uuid;
  v_customer   uuid;
  v_status     public.milling_status;
  v_bags       integer;
  v_input_kg   numeric;
  v_fee_bag    numeric;
  v_fee_ton    numeric;
  v_tons       numeric;
  v_service_id uuid;
  v_agreement  uuid;
  v_lines      jsonb := '[]'::jsonb;
  v_pack       record;
  v_sewing_id  uuid;
  v_sewing_qty integer;
  v_bags_src   varchar(20);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to invoice milling services';
  END IF;
  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(_payment_method, '') = '' THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;

  SELECT store_id, customer_id, status, input_bag_count, input_weight_kg,
         milling_fee_per_bag, milling_fee_per_ton, service_product_id, agreement_id
    INTO v_store, v_customer, v_status, v_bags, v_input_kg,
         v_fee_bag, v_fee_ton, v_service_id, v_agreement
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status <> 'COMPLETED' AND v_status <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % must be completed before invoicing (current status: %)', _job_id, v_status;
  END IF;

  -- ══ الإصلاح الجذري: أساس واحد ═══════════════════════════════════════════
  IF v_fee_bag > 0 AND v_fee_ton > 0 THEN
    RAISE EXCEPTION
      'Job % carries two fee bases (bag=%, ton=%) — repair_milling_dual_fee_jobs() must resolve this first',
      _job_id, v_fee_bag, v_fee_ton;
  END IF;

  -- Idempotency: فاتورة واحدة لكل أمر.
  SELECT id INTO v_invoice_id
  FROM public.sales_invoices
  WHERE milling_job_id = _job_id;
  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job % has already been invoiced (invoice %) — delete it first to re-issue',
      _job_id, v_invoice_id;
  END IF;

  IF v_service_id IS NULL THEN
    SELECT id INTO v_service_id FROM public.products WHERE sku = 'SRV-MILL-BAG50';
  END IF;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'No milling service item found (SRV-MILL-BAG50) — run the milling master-data seed';
  END IF;

  -- ══ سطر واحد: الطحن ════════════════════════════════════════════════════
  -- السعر يأتي من الأمر (من العقد) — لا من products.sale_price.
  IF v_fee_bag > 0 THEN
    IF coalesce(v_bags, 0) <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per bag but records no bag count', _job_id;
    END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',  v_service_id,
      'quantity',    v_bags,
      'unit_price',  v_fee_bag
    ));
  ELSIF v_fee_ton > 0 THEN
    v_tons := round(v_input_kg / 1000, 3);
    IF v_tons <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per ton but has no measurable weight', _job_id;
    END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',  v_service_id,
      'quantity',    v_tons,
      'unit_price',  v_fee_ton
    ));
  ELSE
    RAISE EXCEPTION 'Job % has no milling fee configured', _job_id;
  END IF;

  -- ══ بند التعبئة (قرار Q3: الخياران معاً) ════════════════════════════════
  -- بند خدمة مستقل. يُحتسب فقط إذا طلبه المستخدم، ولا يخصم مخزوناً.
  IF coalesce(_include_sewing, false) THEN
    SELECT id INTO v_sewing_id FROM public.products WHERE sku = 'SRV-SEWING-BAG';

    IF v_sewing_id IS NOT NULL THEN
      SELECT sum(o.mill_bags_used) INTO v_sewing_qty
      FROM public.milling_job_outputs o
      WHERE o.job_id = _job_id
        AND o.bags_source = 'MILL'
        AND o.mill_bags_used > 0;

      v_sewing_qty := coalesce(v_sewing_qty, 0);

      IF v_sewing_qty > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'product_id', v_sewing_id,
          'quantity',   v_sewing_qty,
          'unit_price', coalesce(_sewing_price, 0)
        ));
      END IF;
    END IF;
  END IF;

  -- ══ بند الأكياس الموردة (PKG-*, بضاعة) ═════════════════════════════════
  -- يمر عبر create_sale كـ GOOD/TRACKED → يُستنزف المخزون مرة واحدة.
  IF coalesce(_include_packaging, true) THEN
    FOR v_pack IN
      SELECT o.mill_bag_product_id,
             sum(o.mill_bags_used)  AS bags,
             max(p.sale_price)      AS unit_price,
             max(p.cost_price)      AS unit_cost,
             max(p.tax_rate)        AS tax_rate
      FROM public.milling_job_outputs o
      JOIN public.products p ON p.id = o.mill_bag_product_id
      WHERE o.job_id = _job_id
        AND o.bags_source = 'MILL'
        AND o.mill_bags_used > 0
      GROUP BY o.mill_bag_product_id
    LOOP
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pack.mill_bag_product_id,
        'quantity',   coalesce(v_pack.bags, 0),
        'unit_price', coalesce(v_pack.unit_price, 0)
      ));
    END LOOP;
  END IF;

  -- ══ الترحيل عبر محرك المبيعات العادي ════════════════════════════════════
  -- SERVICE line → لا حركة مخزون. PKG line → STOCK_ISSUE على مخزون المطحنة.
  v_invoice_id := public.create_sale(
    v_store,
    v_customer,
    _payment_method,
    coalesce(_paid, 0),
    coalesce(_discount, 0),
    btrim(COALESCE(_note, '') || ' — أجرة طحن '
      || (SELECT job_number FROM public.milling_jobs WHERE id = _job_id)),
    v_lines
  );

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'The sales engine returned no invoice';
  END IF;

  UPDATE public.sales_invoices
     SET milling_job_id = _job_id
   WHERE id = v_invoice_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.invoice.issued', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'milling_job_id', _job_id,
      'agreement_id',   v_agreement,
      'customer_id',   v_customer,
      'warehouse_id',  v_store,
      'fee_basis',     CASE WHEN v_fee_bag > 0 THEN 'BAG' ELSE 'TON' END,
      'unit_price',    CASE WHEN v_fee_bag > 0 THEN v_fee_bag ELSE v_fee_ton END,
      'sewing_included', coalesce(_include_sewing, false),
      'stock_impact',  'STOCK_ISSUE on mill packaging only — grain and flour untouched'
    ));

  RETURN v_invoice_id;
END $function$;

CREATE OR REPLACE FUNCTION public.issue_production_materials(_order_id uuid, _product_id uuid, _qty numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord   record;
  v_avail numeric;
  v_cost  numeric;
  v_mid   uuid;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to issue production materials';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is % and cannot be issued to', v_ord.order_number, v_ord.status;
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity to issue must be greater than zero';
  END IF;

  SELECT coalesce(i.quantity, 0) INTO v_avail
    FROM public.products p
    LEFT JOIN public.inventory i
           ON i.product_id = p.id AND i.warehouse_id = v_ord.warehouse_id
          AND i.owner_type = 'COMPANY'::public.owner_type AND i.owner_id IS NULL
   WHERE p.id = _product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item is not a known stock item';
  END IF;
  IF v_avail < _qty THEN
    RAISE EXCEPTION 'Only % available of this item, tried to issue %', v_avail, _qty;
  END IF;

  v_cost := public.resolve_unit_cost(_product_id, v_ord.warehouse_id);

  PERFORM public.post_stock_delta(
    p_product_id => _product_id, p_warehouse_id => v_ord.warehouse_id,
    p_signed_qty => -_qty, p_unit_cost => v_cost,
    p_movement_kind => 'ISSUE', p_source_type => 'production_issue',
    p_source_id => _order_id, p_note => 'صرف مواد إنتاج ' || v_ord.order_number,
    p_owner_type => 'COMPANY', p_owner_id => NULL);

  PERFORM public.apply_cost_movement(
    p_product_id => _product_id, p_warehouse_id => v_ord.warehouse_id,
    p_signed_qty => -_qty, p_incoming_cost => NULL,
    p_source_type => 'production_issue', p_source_id => _order_id,
    p_note => 'صرف مواد إنتاج ' || v_ord.order_number);

  v_mid := public.production_last_movement(_product_id, v_ord.warehouse_id, _order_id);

  INSERT INTO public.production_order_materials
    (order_id, product_id, planned_qty, actual_qty, unit_cost, total_cost, movement_id)
  VALUES (_order_id, _product_id, 0, _qty, v_cost, round(_qty * v_cost, 2), v_mid)
  ON CONFLICT (order_id, product_id) DO UPDATE
    SET actual_qty = public.production_order_materials.actual_qty + EXCLUDED.actual_qty,
        total_cost = round(public.production_order_materials.total_cost + EXCLUDED.total_cost, 2),
        unit_cost  = EXCLUDED.unit_cost,
        movement_id = EXCLUDED.movement_id;

  UPDATE public.production_orders o
     SET actual_input_qty = coalesce((SELECT sum(actual_qty) FROM public.production_order_materials WHERE order_id = _order_id), 0),
         material_cost     = coalesce((SELECT sum(total_cost) FROM public.production_order_materials WHERE order_id = _order_id), 0),
         status            = 'ISSUED'
   WHERE o.id = _order_id;
  RETURN v_mid;
END $function$;

CREATE OR REPLACE FUNCTION public.milling_kg_per_unit(_unit_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(c.kg_per_unit, 1.0000)
  FROM public.milling_unit_conversions c
  WHERE c.unit_id = _unit_id;
$function$;

CREATE OR REPLACE FUNCTION public.milling_match_grain_grade(_grade_id uuid, _moisture numeric DEFAULT NULL::numeric, _impurities numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grade record;
  v_moisture_ok boolean;
  v_impurities_ok boolean;
BEGIN
  IF _grade_id IS NULL THEN
    RETURN jsonb_build_object(
      'grade_id',      NULL,
      'grade_name_ar', NULL,
      'status',        'MISSING',
      'message_ar',    'لم يُحدَّد نوع الحبوب — سجّل فحصاً لربط السند بالصنف الصحيح.',
      'severity',      'danger'
    );
  END IF;

  SELECT id, product_id, grade_code, grade_name_ar, origin,
         max_moisture, max_impurities, default_bag_size_kg, default_service_sku
    INTO v_grade
  FROM public.milling_grain_grades
  WHERE id = _grade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'grade_id', NULL, 'status', 'MISSING',
      'message_ar', 'نوع الحبوب المحدد غير موجود.',
      'severity',   'danger'
    );
  END IF;

  v_moisture_ok   := _moisture   IS NULL OR _moisture   <= v_grade.max_moisture;
  v_impurities_ok := _impurities IS NULL OR _impurities <= v_grade.max_impurities;

  RETURN jsonb_build_object(
    'grade_id',         v_grade.id,
    'product_id',       v_grade.product_id,
    'grade_code',       v_grade.grade_code,
    'grade_name_ar',    v_grade.grade_name_ar,
    'origin',           v_grade.origin,
    'max_moisture',     v_grade.max_moisture,
    'max_impurities',   v_grade.max_impurities,
    'default_bag_size_kg', v_grade.default_bag_size_kg,
    'default_service_sku', v_grade.default_service_sku,

    -- 'OK'سليم · 'WARN'تجاوز فني (يُسجَّل) · 'MISSING'لا يوجد فحص
    'status', CASE
      WHEN v_moisture_ok AND v_impurities_ok THEN 'OK'
      ELSE 'WARN'
    END,
    'severity', CASE
      WHEN v_moisture_ok AND v_impurities_ok THEN 'success'
      ELSE 'warning'
    END,

    'moisture_ok',   v_moisture_ok,
    'impurities_ok', v_impurities_ok,
    'message_ar',
      CASE
        WHEN NOT v_moisture_ok AND NOT v_impurities_ok THEN
          'تجاوز الفحص الفني: الرطوبة والشوائب أعلى من الحد المسموح لـ' || v_grade.grade_name_ar
        WHEN NOT v_moisture_ok THEN
          'تجاوز حد الرطوبة (' || v_grade.max_moisture || '%) — قدؤثّر على الاستخلاص. سيُسجَّل التحذير.'
        WHEN NOT v_impurities_ok THEN
          'تجاوز حد الشوائب (' || v_grade.max_impurities || '%) — سيُسجَّل التحذير.'
        ELSE
          'الفحص الفني مطابق لحدود ' || v_grade.grade_name_ar
      END
  );
END $function$;

CREATE OR REPLACE FUNCTION public.next_milling_delivery_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_delivery_seq');
  RETURN 'MDN-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$;

CREATE OR REPLACE FUNCTION public.next_milling_intake_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_intake_seq');
  RETURN 'IR-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$;

CREATE OR REPLACE FUNCTION public.next_milling_job_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_job_seq');
  RETURN 'MJ-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$;

CREATE OR REPLACE FUNCTION public.post_production_order(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_ord     record;
  v_existing uuid;
  v_entry_a uuid;
  v_entry_b uuid;
  v_lines_a jsonb := '[]'::jsonb;
  v_lines_b jsonb := '[]'::jsonb;
  v_material numeric := 0;
  v_output  numeric := 0;
  v_loss    numeric;
  r         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may post a production order';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Order % is % - only a completed order has a cost to post',
      v_ord.order_number, v_ord.status;
  END IF;

  SELECT id INTO v_existing
    FROM public.journal_entries
   WHERE source_type = 'production_order' AND source_id = p_order_id
     AND status <> 'REVERSED';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Order % has already been posted to the ledger', v_ord.order_number;
  END IF;

  v_material := coalesce((SELECT sum(total_cost) FROM public.production_order_materials
                           WHERE order_id = p_order_id), 0);
  v_output   := coalesce((SELECT sum(total_cost) FROM public.production_order_outputs
                           WHERE order_id = p_order_id), 0);

  -- The loss is what the order cost beyond what it produced. It is derived
  -- here and named on its own line below, never spread into an output.
  v_loss := round(v_ord.total_cost - v_output, 2);

  IF v_loss < -0.01 THEN
    RAISE EXCEPTION
      'Order % reports more output cost (%.2f) than total cost (%.2f). The costing is inconsistent.',
      v_ord.order_number, v_output, v_ord.total_cost;
  END IF;

  -- ── Entry A: material into work in progress ──
  FOR r IN
    SELECT p.item_class, sum(m.total_cost) AS amount
      FROM public.production_order_materials m
      JOIN public.products p ON p.id = m.product_id
     WHERE m.order_id = p_order_id
     GROUP BY p.item_class
    HAVING sum(m.total_cost) <> 0
  LOOP
    v_lines_a := v_lines_a || jsonb_build_object(
      'account_code', '1312', 'debit', round(r.amount, 2),
      'memo', 'إنتاج تحت التنفيذ — ' || r.item_class);
    v_lines_a := v_lines_a || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'RAW_MATERIAL' THEN '1311'
                        WHEN 'BY_PRODUCT'   THEN '1314'
                        WHEN 'FINISHED_GOOD' THEN '1313'
                        ELSE '1315' END,
      'credit', round(r.amount, 2),
      'memo', 'صرف مواد إنتاج');
  END LOOP;

  -- ── Entry B: outputs out, loss expensed, conversion costs recognised ──
  FOR r IN
    SELECT p.item_class, sum(o.total_cost) AS amount
      FROM public.production_order_outputs o
      JOIN public.products p ON p.id = o.product_id
     WHERE o.order_id = p_order_id
     GROUP BY p.item_class
    HAVING sum(o.total_cost) <> 0
  LOOP
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'BY_PRODUCT' THEN '1314'
                        ELSE '1313' END,
      'debit', round(r.amount, 2),
      'memo', 'ناتج إنتاج — ' || r.item_class);
  END LOOP;

  IF v_loss > 0.01 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5911', 'debit', v_loss,
      'memo', 'فاقد إنتاج ' || v_ord.order_number);
  END IF;

  IF v_material <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '1312', 'credit', round(v_material, 2),
      'memo', 'إقفال إنتاج تحت التنفيذ');
  END IF;

  IF v_ord.direct_labour <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5211', 'credit', round(v_ord.direct_labour, 2),
      'memo', 'أجور عمالة مباشرة');
  END IF;

  IF v_ord.overhead_cost <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5311', 'credit', round(v_ord.overhead_cost, 2),
      'memo', 'مصروفات تشغيل غير مباشرة');
  END IF;

  IF jsonb_array_length(v_lines_b) = 0 THEN
    RAISE EXCEPTION 'Order % has nothing to post - no cost was allocated to any output',
      v_ord.order_number;
  END IF;

  IF jsonb_array_length(v_lines_a) > 0 THEN
    v_entry_a := public.create_journal_entry(
      'أمر إنتاج ' || v_ord.order_number || ' — صرف مواد',
      v_ord.production_date, 'production_order_materials', p_order_id, true, v_lines_a);
  END IF;

  v_entry_b := public.create_journal_entry(
    'أمر إنتاج ' || v_ord.order_number || ' — إقفال وتكلفة',
    v_ord.production_date, 'production_order', p_order_id, true, v_lines_b);

  RETURN v_entry_b;
END $function$;

CREATE OR REPLACE FUNCTION public.process_milling_delivery(_job_id uuid, _truck_plate text, _driver_name text, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid := auth.uid();
  v_id        uuid;
  v_number    text;
  v_store     uuid;
  v_customer  uuid;
  v_item      record;
  v_output_id uuid;
  v_produced  integer;
  v_delivered integer;
  v_bags      integer;
  v_weight    numeric;
  v_total_bags integer := 0;
  v_total_kg  numeric := 0;
  v_bag_size  numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to issue delivery notes';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one output to deliver';
  END IF;

  SELECT store_id, customer_id
    INTO v_store, v_customer
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;

  -- Nothing may leave before the run is closed: the produced quantity must be
  -- final, otherwise a later correction could retroactively invalidate a truck
  -- that already left the gate.
  IF (SELECT status FROM public.milling_jobs WHERE id = _job_id) <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Close the milling job before delivering its outputs';
  END IF;

  -- Validate every line BEFORE writing the header, so a bad line cannot leave an
  -- empty note behind.
  FOR v_item IN
    SELECT (item ->> 'job_output_id')::uuid      AS output_id,
           coalesce((item ->> 'delivered_bags')::integer, 0) AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    IF v_item.output_id IS NULL THEN
      RAISE EXCEPTION 'Every delivery line requires an output';
    END IF;
    IF v_item.bags <= 0 THEN
      RAISE EXCEPTION 'Every delivery line requires at least one bag';
    END IF;
    IF v_item.weight <= 0 THEN
      RAISE EXCEPTION 'Every delivery line requires a positive weight';
    END IF;

    -- Lock the output row: this is what serialises concurrent deliveries.
    SELECT produced_bag_count, delivered_bag_count, bag_size_kg
      INTO v_produced, v_delivered, v_bag_size
    FROM public.milling_job_outputs
    WHERE id = v_item.output_id
      AND job_id = _job_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Output % does not belong to job %', v_item.output_id, _job_id;
    END IF;

    -- >>> THE INVARIANT <<<
    IF v_delivered + v_item.bags > v_produced THEN
      RAISE EXCEPTION
        'Cannot deliver % bags of this output: only % produced and % already delivered (% remaining)',
        v_item.bags, v_produced, v_delivered, v_produced - v_delivered
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_delivered + v_item.weight > (SELECT produced_weight_kg FROM public.milling_job_outputs WHERE id = v_item.output_id) + 0.001 THEN
      RAISE EXCEPTION
        'Cannot deliver % kg of this output: it exceeds what remains to be delivered',
        v_item.weight
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- ── document header ──────────────────────────────────────────────────────
  FOR v_item IN
    SELECT coalesce((item ->> 'delivered_bags')::integer, 0)      AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    v_total_bags := v_total_bags + v_item.bags;
    v_total_kg   := v_total_kg + v_item.weight;
  END LOOP;

  v_number := public.next_milling_delivery_number();

  INSERT INTO public.milling_delivery_notes (
    store_id, delivery_number, customer_id, job_id,
    truck_plate_number, driver_name,
    total_bags, total_weight_kg, notes, delivered_by
  )
  VALUES (
    v_store, v_number, v_customer, _job_id,
    nullif(btrim(COALESCE(_truck_plate, '')), ''),
    nullif(btrim(COALESCE(_driver_name, '')), ''),
    v_total_bags, round(v_total_kg, 3),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  -- ── lines + custody decrement, under the locks taken above ───────────────
  FOR v_item IN
    SELECT (item ->> 'job_output_id')::uuid      AS output_id,
           coalesce((item ->> 'delivered_bags')::integer, 0)      AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    v_output_id := v_item.output_id;

    INSERT INTO public.milling_delivery_items (
      delivery_id, job_output_id, delivered_bags, delivered_weight_kg
    )
    VALUES (v_id, v_output_id, v_item.bags, v_item.weight);

    UPDATE public.milling_job_outputs
    SET delivered_bag_count = delivered_bag_count + v_item.bags,
        delivered_weight_kg = delivered_weight_kg + v_item.weight
    WHERE id = v_output_id;
  END LOOP;

  -- Mark the job DELIVERED only when nothing at all remains in custody.
  IF NOT EXISTS (
    SELECT 1
    FROM public.milling_job_outputs o
    WHERE o.job_id = _job_id
      AND (o.produced_bag_count - o.delivered_bag_count) > 0
  ) THEN
    UPDATE public.milling_jobs
    SET status = 'DELIVERED'
    WHERE id = _job_id AND status = 'COMPLETED';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.delivery.issued', 'milling_delivery', v_id,
    jsonb_build_object(
      'delivery_number', v_number,
      'job_id', _job_id,
      'customer_id', v_customer,
      'total_bags', v_total_bags,
      'total_weight_kg', round(v_total_kg, 3),
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.production_last_movement(p_product_id uuid, p_warehouse_id uuid, p_source_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id FROM public.stock_movements m
   WHERE m.product_id = p_product_id AND m.warehouse_id = p_warehouse_id
     AND m.source_id = p_source_id
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.record_production_loss(_order_id uuid, _reason text, _qty numeric, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord record;
  v_id  uuid;
  v_in  numeric;
  v_val numeric;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to record production loss';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is % and cannot be adjusted', v_ord.order_number, v_ord.status;
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A loss must have a reason';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Loss quantity must be greater than zero';
  END IF;

  -- Losing material is spending it, so it carries the input's own average cost.
  SELECT coalesce(sum(total_cost) / nullif(sum(actual_qty), 0), 0) INTO v_in
    FROM public.production_order_materials WHERE order_id = _order_id;
  v_val := round(_qty * coalesce(v_in, 0), 2);

  INSERT INTO public.production_order_losses (order_id, reason, qty, value, notes, created_by)
  VALUES (_order_id, btrim(_reason), _qty, v_val, nullif(btrim(coalesce(_notes,'')), ''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (auth.uid(), 'production.loss_recorded', 'production_order', _order_id,
          jsonb_build_object('loss_id', v_id, 'reason', _reason, 'qty', _qty, 'value', v_val));
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.repair_milling_dual_fee_jobs(_apply boolean DEFAULT false)
 RETURNS TABLE(job_number text, fee_per_bag numeric, fee_per_ton numeric, invoice_total numeric, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_action text;
BEGIN
  FOR r IN
    SELECT
      j.id, j.job_number,
      j.milling_fee_per_bag, j.milling_fee_per_ton,
      coalesce((SELECT si.total FROM public.sales_invoices si
                 WHERE si.milling_job_id = j.id), 0) AS inv_total
    FROM public.milling_jobs j
    WHERE j.milling_fee_per_bag > 0
      AND j.milling_fee_per_ton > 0
    ORDER BY j.job_number
  LOOP
    -- نُبقي الأساس الذي فُوتر به فعلياً: بند الكمية الكبيرة.
    IF r.milling_fee_per_bag > 0 THEN
      v_action := format('KEEP_BAG: fee_per_ton %s -> 0 (BAG basis was invoiced)',
                         r.milling_fee_per_ton);
      IF _apply THEN
        UPDATE public.milling_jobs
           SET milling_fee_per_ton = 0
         WHERE id = r.id;
      END IF;
    ELSE
      v_action := format('KEEP_TON: fee_per_bag %s -> 0 (TON basis was invoiced)',
                         r.milling_fee_per_bag);
      IF _apply THEN
        UPDATE public.milling_jobs
           SET milling_fee_per_bag = 0
         WHERE id = r.id;
      END IF;
    END IF;

    job_number    := r.job_number;
    fee_per_bag   := r.milling_fee_per_bag;
    fee_per_ton   := r.milling_fee_per_ton;
    invoice_total := r.inv_total;
    action        := v_action;
    RETURN NEXT;
  END LOOP;
END $function$;

