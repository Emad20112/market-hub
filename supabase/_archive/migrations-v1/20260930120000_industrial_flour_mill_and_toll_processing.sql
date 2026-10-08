-- ============================================================================
-- 20260930120000_industrial_flour_mill_and_toll_processing.sql
-- وحدة المطحنة وإدارة الأمانات والتصنيع (Toll Milling & Manufacture)
-- ============================================================================
-- المرجع: plan,mill.md — الباب 7 (DDL Schema) والباب 5 (Master Data).
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- The system has no concept of material that physically sits inside the company
-- but is NOT its property. Everything in `inventory` was assumed to be company
-- stock and therefore part of company valuation and COGS. Mixing a customer's
-- wheat into that pool corrupts both the tax position and the cost of the flour
-- the mill actually sells. `plan,mill.md` section 2 forbids it outright.
--
-- So this module introduces a SECOND, fully separate custody ledger under the
-- `milling_*` prefix. Customer grain never touches `inventory`,
-- `stock_movements`, `stock_ledger_entries` or `inventory_movements`.
--
-- NON-DESTRUCTIVE GUARANTEES (hard rules, per the task brief)
-- ----------------------------------------------------------
--   * No existing table, column, constraint, policy or row is dropped, renamed
--     or rewritten.
--   * The ONLY change to an existing table is one NULLABLE column added to
--     public.sales_invoices (milling_job_id), so a toll-service invoice can be
--     traced back to the job that caused it. Every existing row keeps NULL,
--     which is exactly "not a milling invoice".
--   * The module is registered in `platform_modules` as `milling_operations`,
--     so a grocery or a phone shop never sees it and never pays for it.
--   * Creating the professional plan's module list is a DELIBERATE opt-in: the
--     existing plans are re-listed so the module is available on the higher
--     tiers, while the legacy `default` tenant subscription is left untouched.
--
-- EFFECTS LEDGER (what touches what)
-- ----------------------------------
--   سند استلام أمانات       -> milling_intake_receipts only        (صفر على المخزون التجاري)
--   أمر طحن                 -> milling_jobs / milling_job_outputs only
--   فاتورة خدمة طحن        -> sales_invoices + sales_invoice_items + customer_ledger
--                              + STOCK_ISSUE on the MILL's own packaging stock only
--   إذن تسليم ناتج أمانات  -> milling_delivery_notes + milling_delivery_items only
--
-- ROLLBACK (safe — nothing else references these objects)
--   DROP VIEW IF EXISTS public.milling_silo_balances, public.milling_job_balances,
--     public.milling_customer_money;
--   DROP TABLE IF EXISTS public.milling_delivery_items, public.milling_delivery_notes,
--     public.milling_job_outputs, public.milling_jobs, public.milling_intake_receipts;
--   ALTER TABLE public.sales_invoices DROP COLUMN IF EXISTS milling_job_id;
--   DROP TYPE IF EXISTS public.milling_output_type, public.milling_status;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enumerations
-- ---------------------------------------------------------------------------
-- Same defensive DO-block pattern the rest of this repository uses for enums,
-- so re-running the file on a database that already has them is a no-op.
DO $$ BEGIN
    CREATE TYPE public.milling_status AS ENUM (
      'DRAFT', 'RECEIVED', 'PROCESSING', 'COMPLETED', 'DELIVERED', 'CANCELLED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.milling_output_type AS ENUM (
      'FLOUR_GRADE_1', 'FLOUR_GRADE_2', 'BRAN', 'SEMOLINA', 'WASTE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE public.milling_status IS
  'دورة حياة مستندات المطحنة: مسودة → مستلم → قيد التشغيل → منتهي → مسلّم/ملغى.';
COMMENT ON TYPE public.milling_output_type IS
  'أصناف نواتج الطحن: دقيق نمرة 1، دقيق نمرة 2/بر، نخالة، سميد، وفاقد.';

-- ---------------------------------------------------------------------------
-- 2. Document number sequences
-- ---------------------------------------------------------------------------
-- Sequences are not tenant-scoped on purpose: the number is a document label,
-- while uniqueness is enforced per store by a real constraint below.
CREATE SEQUENCE IF NOT EXISTS public.milling_intake_seq      START 1;
CREATE SEQUENCE IF NOT EXISTS public.milling_job_seq         START 1;
CREATE SEQUENCE IF NOT EXISTS public.milling_delivery_seq    START 1;

-- ---------------------------------------------------------------------------
-- 3. milling_intake_receipts — سند استلام الحبوب (أمانات العميل)
-- ---------------------------------------------------------------------------
-- Custody only. `net_weight` is the authoritative quantity and is stored (not
-- computed on read), because a scale ticket is a physical measurement that must
-- not silently change if someone later edits the gross weight.
-- `nominal_weight_kg` keeps the bag arithmetic (count × bag size) next to the
-- measured weight so a shortage in bag weights stays visible and provable —
-- plan,mill.md section 3.2.
CREATE TABLE IF NOT EXISTS public.milling_intake_receipts (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id               uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    receipt_number         varchar(50) NOT NULL,
    customer_id            uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    truck_plate_number     varchar(30),
    driver_name            varchar(100),
    grain_type             varchar(50) NOT NULL,
    grain_product_id       uuid REFERENCES public.products(id) ON DELETE SET NULL,

    -- نظام الأكياس
    bag_size_kg            numeric(6,2)  NOT NULL DEFAULT 50.00 CHECK (bag_size_kg > 0),
    intake_bag_count       integer       NOT NULL DEFAULT 0 CHECK (intake_bag_count >= 0),
    nominal_weight_kg      numeric(12,3) NOT NULL DEFAULT 0,

    -- الأوزان (قبان / ميزان)
    gross_weight_kg        numeric(12,3) NOT NULL CHECK (gross_weight_kg >= 0),
    tare_weight_kg         numeric(12,3) NOT NULL DEFAULT 0 CHECK (tare_weight_kg >= 0),
    net_weight_kg          numeric(12,3) NOT NULL CHECK (net_weight_kg >= 0),

    moisture_percentage    numeric(5,2)  NOT NULL DEFAULT 0 CHECK (moisture_percentage >= 0 AND moisture_percentage <= 100),
    impurities_percentage  numeric(5,2)  NOT NULL DEFAULT 0 CHECK (impurities_percentage >= 0 AND impurities_percentage <= 100),
    silo_or_location       varchar(50),
    status                 public.milling_status NOT NULL DEFAULT 'RECEIVED',
    notes                  text,
    received_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_milling_intake_store_receipt UNIQUE (store_id, receipt_number)
);

COMMENT ON TABLE public.milling_intake_receipts IS
  'سند استلام أمانات عيني: حبوب العميل التي دخلت المطحنة. لا أثر له على مخزون المنشأة التجاري إطلاقًا.';
COMMENT ON COLUMN public.milling_intake_receipts.net_weight_kg IS
  'الوزن الصافي المعتمد (القائم − الفارغ). هو المرجع في كل حركات الأمانات.';
COMMENT ON COLUMN public.milling_intake_receipts.nominal_weight_kg IS
  'الوزن الاسمي = عدد الأكياس × سعة الكيس، يُحفظ بجانب الوزن الفعلي لكشف العجز في أوزان الأكياس.';

-- ---------------------------------------------------------------------------
-- 4. milling_jobs — أمر الطحن والتشغيل لحساب الغير
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milling_jobs (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id                 uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    job_number               varchar(50) NOT NULL,
    intake_receipt_id        uuid NOT NULL REFERENCES public.milling_intake_receipts(id) ON DELETE RESTRICT,
    customer_id              uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,

    -- الكمية المسحوبة للطحن
    input_bag_count          integer       NOT NULL DEFAULT 0 CHECK (input_bag_count >= 0),
    input_bag_size_kg        numeric(6,2)  NOT NULL DEFAULT 50.00 CHECK (input_bag_size_kg > 0),
    input_weight_kg          numeric(12,3) NOT NULL CHECK (input_weight_kg > 0),

    -- التسعير التشغيلي
    milling_fee_per_bag      numeric(12,2) NOT NULL DEFAULT 0 CHECK (milling_fee_per_bag >= 0),
    milling_fee_per_ton      numeric(12,2) NOT NULL DEFAULT 0 CHECK (milling_fee_per_ton >= 0),
    service_product_id       uuid REFERENCES public.products(id) ON DELETE SET NULL,

    -- المؤشرات والفاقد
    expected_extraction_rate numeric(5,2)  NOT NULL DEFAULT 80.00 CHECK (expected_extraction_rate > 0 AND expected_extraction_rate <= 100),
    allowed_loss_percentage  numeric(5,2)  NOT NULL DEFAULT 2.00 CHECK (allowed_loss_percentage >= 0 AND allowed_loss_percentage <= 100),
    actual_loss_kg           numeric(12,3) NOT NULL DEFAULT 0,
    loss_excess_kg           numeric(12,3) NOT NULL DEFAULT 0,

    status                   public.milling_status NOT NULL DEFAULT 'PROCESSING',
    started_at               timestamptz DEFAULT timezone('utc'::text, now()),
    finished_at              timestamptz,
    notes                    text,
    created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at               timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_milling_job_store_number UNIQUE (store_id, job_number)
);

COMMENT ON TABLE public.milling_jobs IS
  'أمر طحن لحساب الغير. مستند تشغيلي: يستهلك أمانات العميل فقط، ولا يُنشئ بيعًا ولا قيدًا ماليًا.';
COMMENT ON COLUMN public.milling_jobs.actual_loss_kg IS
  'الفاقد الفعلي = الوزن الداخل − مجموع أوزان النواتج. يُحتسب آليًا عند إتمام الأمر.';
COMMENT ON COLUMN public.milling_jobs.loss_excess_kg IS
  'الفاقد الزائد عن النسبة التعاقدية المسموح بها. أساس التسوية العينية أو الخصم المالي.';

-- ---------------------------------------------------------------------------
-- 5. milling_job_outputs — نواتج الطحن (دقيق/نخالة/سميد) بالأكياس والأوزان
-- ---------------------------------------------------------------------------
-- `bags_source` distinguishes the two packaging cases from plan,mill.md
-- section 3.3: the customer brought their own bags (no financial effect), or the
-- mill supplied them from its own commercial stock (issued through STOCK_ISSUE
-- and invoiced on the service invoice).
CREATE TABLE IF NOT EXISTS public.milling_job_outputs (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id                uuid NOT NULL REFERENCES public.milling_jobs(id) ON DELETE CASCADE,
    output_type           public.milling_output_type NOT NULL,

    bag_size_kg           numeric(6,2)  NOT NULL DEFAULT 50.00 CHECK (bag_size_kg > 0),
    produced_bag_count    integer       NOT NULL DEFAULT 0 CHECK (produced_bag_count >= 0),
    produced_weight_kg    numeric(12,3) NOT NULL CHECK (produced_weight_kg >= 0),

    bags_source           varchar(20)   NOT NULL DEFAULT 'CUSTOMER'
                          CHECK (bags_source IN ('CUSTOMER', 'MILL')),
    mill_bag_product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
    mill_bags_used        integer       NOT NULL DEFAULT 0 CHECK (mill_bags_used >= 0),

    -- تتبع التسليم العيني
    delivered_bag_count   integer       NOT NULL DEFAULT 0 CHECK (delivered_bag_count >= 0),
    delivered_weight_kg   numeric(12,3) NOT NULL DEFAULT 0 CHECK (delivered_weight_kg >= 0),

    created_at            timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT ck_milling_output_delivery_bags CHECK (delivered_bag_count <= produced_bag_count),
    CONSTRAINT ck_milling_output_delivery_weight CHECK (delivered_weight_kg <= produced_weight_kg + 0.001)
);

COMMENT ON TABLE public.milling_job_outputs IS
  'نواتج أمر الطحن: دقيق ونخالة وسميد، بعدد الأكياس ووزنها. رصيد العميل العيني يُقرأ من هنا.';
COMMENT ON COLUMN public.milling_job_outputs.bags_source IS
  'CUSTOMER: العميل أحضر أكياسه (لا أثر مالي). MILL: المطحنة صرفت أكياسها وتُفوتر على العميل.';

-- ---------------------------------------------------------------------------
-- 6. milling_delivery_notes — إذن تسليم ناتج الأمانات (كلي أو جزئي)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milling_delivery_notes (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id           uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
    delivery_number    varchar(50) NOT NULL,
    customer_id        uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    job_id             uuid NOT NULL REFERENCES public.milling_jobs(id) ON DELETE RESTRICT,
    truck_plate_number varchar(30),
    driver_name        varchar(100),
    total_bags         integer       NOT NULL DEFAULT 0 CHECK (total_bags >= 0),
    total_weight_kg    numeric(12,3) NOT NULL DEFAULT 0 CHECK (total_weight_kg >= 0),
    notes              text,
    delivered_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_milling_delivery_store_number UNIQUE (store_id, delivery_number)
);

COMMENT ON TABLE public.milling_delivery_notes IS
  'إذن خروج وتسليم ناتج أمانات. مستند عيني بحت: لا مديونية نقدية ولا أثر على مخزون المطحنة.';

-- ---------------------------------------------------------------------------
-- 7. milling_delivery_items — بنود إذن التسليم
-- ---------------------------------------------------------------------------
-- PostgreSQL cannot express "SUM(delivered_bags) over the group ≤ produced"
-- as a CHECK constraint, so the invariant is enforced by the atomic RPC
-- `process_milling_delivery()` together with the per-row CHECK on
-- milling_job_outputs. Direct INSERTs are revoked from the browser.
CREATE TABLE IF NOT EXISTS public.milling_delivery_items (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id         uuid NOT NULL REFERENCES public.milling_delivery_notes(id) ON DELETE CASCADE,
    job_output_id       uuid NOT NULL REFERENCES public.milling_job_outputs(id) ON DELETE RESTRICT,
    delivered_bags      integer       NOT NULL CHECK (delivered_bags > 0),
    delivered_weight_kg numeric(12,3) NOT NULL CHECK (delivered_weight_kg > 0),
    created_at          timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.milling_delivery_items IS
  'بنود إذن التسليم: كل سطر يخص ناتجًا واحدًا (دقيق/نخالة) بعدد أكياس ووزن محدد.';

-- ---------------------------------------------------------------------------
-- 8. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_milling_intake_store      ON public.milling_intake_receipts(store_id);
CREATE INDEX IF NOT EXISTS idx_milling_intake_customer   ON public.milling_intake_receipts(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_milling_intake_grain      ON public.milling_intake_receipts(grain_product_id) WHERE grain_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_milling_jobs_store        ON public.milling_jobs(store_id);
CREATE INDEX IF NOT EXISTS idx_milling_jobs_customer     ON public.milling_jobs(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_milling_jobs_intake       ON public.milling_jobs(intake_receipt_id);
CREATE INDEX IF NOT EXISTS idx_milling_jobs_status       ON public.milling_jobs(status);

CREATE INDEX IF NOT EXISTS idx_milling_outputs_job       ON public.milling_job_outputs(job_id);
CREATE INDEX IF NOT EXISTS idx_milling_outputs_type      ON public.milling_job_outputs(job_id, output_type);

CREATE INDEX IF NOT EXISTS idx_milling_delivery_store    ON public.milling_delivery_notes(store_id);
CREATE INDEX IF NOT EXISTS idx_milling_delivery_customer ON public.milling_delivery_notes(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_milling_delivery_job      ON public.milling_delivery_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_milling_delivery_items_dl ON public.milling_delivery_items(delivery_id);
CREATE INDEX IF NOT EXISTS idx_milling_delivery_items_ot ON public.milling_delivery_items(job_output_id);

-- ---------------------------------------------------------------------------
-- 9. Row Level Security — tenant/warehouse scoped
-- ---------------------------------------------------------------------------
-- The `milling_*` tables carry `store_id` = the warehouse the document belongs
-- to, which is what the module's own reports filter on. Reads are granted to
-- owner and manager only; writes are granted to NOBODY through the API — they
-- happen exclusively inside SECURITY DEFINER RPCs, which is why the browser
-- cannot fabricate an intake, a job output or a delivery.
DO $$ DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'milling_intake_receipts',
    'milling_jobs',
    'milling_job_outputs',
    'milling_delivery_notes',
    'milling_delivery_items'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- The read gate, in one place. `user_roles` in this schema carries no branch
-- column, so isolation is by ROLE rather than by store: a cashier is deliberately
-- excluded (the gate desk, the scale house and the accounts are the only places
-- that legitimately see a customer's grain), and a grocery's tenant never gets
-- the module switched on in the first place.
CREATE OR REPLACE FUNCTION public.can_view_milling()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff(auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role IN ('owner', 'manager', 'accountant', 'warehouse')
     );
$$;

COMMENT ON FUNCTION public.can_view_milling() IS
  'بوابة قراءة مستندات المطحنة: المالك والمدير والمحاسب ومأمور المخزون. مُستثنى الكاشير. تُستخدم في سياسات RLS لجداول milling_*.';

-- The write gate, kept separate from the read gate on purpose: viewing a
-- customer's custody balance is not the same authority as posting a delivery.
CREATE OR REPLACE FUNCTION public.can_operate_milling()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_staff(auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role IN ('owner', 'manager', 'warehouse')
     );
$$;

COMMENT ON FUNCTION public.can_operate_milling() IS
  'صلاحية تشغيل المطحنة: إنشاء سند استلام، أمر طحن، نواتج، إذن تسليم، أو فاتورة خدمة.';

REVOKE ALL ON FUNCTION public.can_operate_milling() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_operate_milling() TO authenticated;

REVOKE ALL ON FUNCTION public.can_view_milling() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_milling() TO authenticated;

-- --- milling_intake_receipts -------------------------------------------------
DROP POLICY IF EXISTS milling_intake_read ON public.milling_intake_receipts;
CREATE POLICY milling_intake_read ON public.milling_intake_receipts
  FOR SELECT TO authenticated
  USING (public.can_view_milling());

-- --- milling_jobs ------------------------------------------------------------
DROP POLICY IF EXISTS milling_jobs_read ON public.milling_jobs;
CREATE POLICY milling_jobs_read ON public.milling_jobs
  FOR SELECT TO authenticated
  USING (public.can_view_milling());

-- --- milling_job_outputs -----------------------------------------------------
DROP POLICY IF EXISTS milling_job_outputs_read ON public.milling_job_outputs;
CREATE POLICY milling_job_outputs_read ON public.milling_job_outputs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.milling_jobs j
      WHERE j.id = public.milling_job_outputs.job_id
    )
  );

-- --- milling_delivery_notes --------------------------------------------------
DROP POLICY IF EXISTS milling_delivery_read ON public.milling_delivery_notes;
CREATE POLICY milling_delivery_read ON public.milling_delivery_notes
  FOR SELECT TO authenticated
  USING (public.can_view_milling());

-- --- milling_delivery_items --------------------------------------------------
DROP POLICY IF EXISTS milling_delivery_items_read ON public.milling_delivery_items;
CREATE POLICY milling_delivery_items_read ON public.milling_delivery_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.milling_delivery_notes d
      WHERE d.id = public.milling_delivery_items.delivery_id
    )
  );

-- Access posture: read-only for the browser, everything else through the RPCs.
REVOKE INSERT, UPDATE, DELETE ON
  public.milling_intake_receipts,
  public.milling_jobs,
  public.milling_job_outputs,
  public.milling_delivery_notes,
  public.milling_delivery_items
FROM authenticated, anon;

GRANT SELECT ON
  public.milling_intake_receipts,
  public.milling_jobs,
  public.milling_job_outputs,
  public.milling_delivery_notes,
  public.milling_delivery_items
TO authenticated;

GRANT ALL ON
  public.milling_intake_receipts,
  public.milling_jobs,
  public.milling_job_outputs,
  public.milling_delivery_notes,
  public.milling_delivery_items
TO service_role;

-- ---------------------------------------------------------------------------
-- 10. The ONE additive change to an existing table
-- ---------------------------------------------------------------------------
-- A toll-milling service invoice is a perfectly ordinary sales invoice, so it
-- lives in public.sales_invoices rather than in a parallel "milling invoice"
-- table. One nullable column records which job it belongs to. NULL — the value
-- on every existing row — means "this is not a milling invoice".
ALTER TABLE public.sales_invoices
  ADD COLUMN IF NOT EXISTS milling_job_id uuid REFERENCES public.milling_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_invoices_milling_job
  ON public.sales_invoices(milling_job_id)
  WHERE milling_job_id IS NOT NULL;

COMMENT ON COLUMN public.sales_invoices.milling_job_id IS
  'أمر الطحن المرتبط بالفاتورة عند كونها فاتورة خدمة طحن لأمانات عميل. NULL لكل الفواتير الأخرى.';

-- ---------------------------------------------------------------------------
-- 11. Module registration — milling_operations
-- ---------------------------------------------------------------------------
-- Registered exactly like every other module so the subscription machinery,
-- the sidebar filter and the route guard pick it up with no special casing.
INSERT INTO public.platform_modules (id, name, description, category, dependencies, nav_items, routes, is_active)
VALUES (
  'milling_operations',
  '{"ar": "إدارة المطاحن والأمانات", "en": "Flour Mill & Toll Processing"}'::jsonb,
  '{"ar": "استلام حبوب العملاء كأمانات، أوامر الطحن، توزيع النواتج على الأكياس، فواتير أجور الطحن، و إذون تسليم النواتج — بفصل تام عن المخزون التجاري.", "en": "Customer grain custody, milling jobs, bag-based output distribution, toll service invoices and delivery notes — fully separated from commercial stock."}'::jsonb,
  'enterprise',
  ARRAY['core'],
  ARRAY['/milling', '/milling/intake', '/milling/jobs', '/milling/delivery', '/milling/customer-statement'],
  ARRAY['/_app/milling', '/_app/milling/intake', '/_app/milling/jobs', '/_app/milling/delivery', '/_app/milling/customer-statement'],
  true
)
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  category     = EXCLUDED.category,
  dependencies = EXCLUDED.dependencies,
  nav_items    = EXCLUDED.nav_items,
  routes       = EXCLUDED.routes,
  is_active    = EXCLUDED.is_active;

-- Make the module reachable on the two higher tiers without disturbing the
-- tenant that is already running: `enterprise` gains it, `professional` may
-- buy it as an extra, and the pre-existing `default` subscription row is left
-- exactly as it is (so a shop never silently acquires a flour mill).
UPDATE public.platform_plans
SET modules = (
  SELECT array_agg(DISTINCT m ORDER BY m)
  FROM unnest(modules || ARRAY['milling_operations']) AS m
)
WHERE id = 'enterprise'
  AND NOT ('milling_operations' = ANY (modules));

GRANT ALL ON public.milling_intake_seq, public.milling_job_seq, public.milling_delivery_seq
  TO service_role;

-- ============================================================================
-- END OF MIGRATION 1/2 — see 20260930120100_milling_master_data_and_engines.sql
-- ============================================================================
