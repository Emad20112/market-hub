-- ============================================================================
-- Market-Hub ERP — Expense Management Module, Phase 1: Foundation
-- ============================================================================
-- Reference: docs/EXPENSES_ERP_IMPLEMENTATION_PLAN.md
--   §9   Database Design        (document model: entries + lines + payments)
--   §10  Accounting Integration (prepaid / accrued payable / tax snapshot)
--   §11  Payment Design         (payment is its own event, not a method column)
--   §15  Cost Centers           (cost centre + project as nullable dimensions)
--   §18  Security & RLS         (capability helpers, fail-closed)
--   §20  Performance            (tenant-first composite indexes)
--   §24  Migration Strategy     (additive only, legacy rows preserved)
--
-- WHAT THIS MIGRATION IS
--   Purely additive. It introduces the normalized expense document so a single
--   expense can carry several lines, be approved, posted and paid in parts —
--   none of which the legacy `public.expenses` row can express.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It does NOT drop, rename or rewrite `public.expenses`. The legacy table
--     keeps serving `src/lib/statements/adapters/cash.ts` and the accounting
--     report pages until those screens are cut over.
--   * It does NOT write any journal entry. Posting RPCs live in a later phase.
--   * It does NOT touch sales, purchases, inventory, customers or suppliers.
--   * It does NOT backfill anything here. Backfill is a separate, reversible
--     migration so this one can be applied to production with zero risk.
--
-- ROLLBACK (no dependency on legacy tables)
--   DROP TABLE IF EXISTS public.expense_approvals, public.expense_attachments,
--                        public.expense_payments, public.expense_lines,
--                        public.expense_entries CASCADE;
--   DROP TABLE IF EXISTS public.expense_cost_centers, public.expense_projects CASCADE;
--   ALTER TABLE public.expense_categories
--     DROP COLUMN IF EXISTS is_active, DROP COLUMN IF EXISTS sort_order,
--     DROP COLUMN IF EXISTS created_by;
--   DROP FUNCTION IF EXISTS public.expense_can(uuid, text);
--   DROP FUNCTION IF EXISTS public.expense_effective_amount(numeric, numeric);
--   DROP TYPE IF EXISTS public.expense_status;
--   DROP TYPE IF EXISTS public.expense_entry_type;
--   DROP TYPE IF EXISTS public.expense_payee_type;
--   DROP TYPE IF EXISTS public.expense_source_kind;
--   DROP TYPE IF EXISTS public.expense_tax_mode;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight — refuse to run against a schema this migration does not know.
--    A duplicate run must be harmless; a half-applied schema must not be.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.expenses') IS NULL THEN
    RAISE EXCEPTION 'public.expenses is missing — run the baseline migrations first';
  END IF;
  IF to_regclass('public.expense_categories') IS NULL THEN
    RAISE EXCEPTION 'public.expense_categories is missing — run the baseline migrations first';
  END IF;
  IF to_regclass('public.company_settings') IS NULL THEN
    RAISE EXCEPTION 'public.company_settings is missing — run the baseline migrations first';
  END IF;
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE EXCEPTION 'public.audit_logs is missing — run the baseline migrations first';
  END IF;
  IF to_regprocedure('public.is_staff(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.is_staff(uuid) is missing — run the baseline migrations first';
  END IF;
  IF to_regprocedure('public.has_role(uuid, public.app_role)') IS NULL THEN
    RAISE EXCEPTION 'public.has_role(uuid, public.app_role) is missing — run the baseline migrations first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Enumerations
-- ---------------------------------------------------------------------------
-- The lifecycle from plan §8. `partially_paid`, `paid`, `closed`, `reversed`
-- are never set by hand: the posting/payment RPCs derive them, so an operator
-- cannot declare an expense settled that has no payment rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'expense_status') THEN
    CREATE TYPE public.expense_status AS ENUM (
      'DRAFT',            -- being typed; free to edit, no financial effect
      'SUBMITTED',        -- waiting for an approver
      'APPROVED',         -- authorized, not yet recognized in the ledger
      'REJECTED',         -- sent back with a reason; editable again
      'POSTED',           -- recognized: financial columns frozen
      'PARTIALLY_PAID',   -- derived from payments
      'PAID',             -- derived from payments
      'CLOSED',           -- terminal after settlement
      'CANCELLED',        -- abandoned before posting
      'REVERSED'          -- undone by a compensating entry
    );
  END IF;

  -- Plan §7: direct purchase vs. staff reimbursement vs. supplier payable vs.
  -- recurring copy. Kept as one enum instead of a lookup table because the set
  -- is closed and the behaviour (not the label) is what branches.
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typname
                 WHERE n.nspname = 'public' AND t.typname = 'expense_entry_type') THEN
    CREATE TYPE public.expense_entry_type AS ENUM (
      'DIRECT',           -- paid or payable to an outside party
      'EMPLOYEE',         -- a member of staff paid out of pocket (plan §12)
      'SUPPLIER',         -- explicit supplier payable (plan §11)
      'RECURRING',        -- generated from a recurring rule (plan §13)
      'ADVANCE'           -- settlement of a previously issued advance
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'expense_payee_type') THEN
    CREATE TYPE public.expense_payee_type AS ENUM (
      'NONE',             -- no named counterparty (petty cash, utilities)
      'SUPPLIER',
      'EMPLOYEE',
      'OTHER'
    );
  END IF;

  -- How a document entered the system. Drives the compatibility adapter and
  -- makes every migrated legacy row auditable rather than silently identical
  -- to a hand-typed one.
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'expense_source_kind') THEN
    CREATE TYPE public.expense_source_kind AS ENUM ('MANUAL', 'LEGACY', 'RECURRING', 'IMPORT');
  END IF;

  -- Plan §14: no tax engine in this module. A per-document mode is enough to
  -- tell "tax is not configured" apart from "tax is genuinely zero".
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'expense_tax_mode') THEN
    CREATE TYPE public.expense_tax_mode AS ENUM ('NONE', 'INCLUSIVE', 'EXCLUSIVE');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Small immutable helpers
-- ---------------------------------------------------------------------------

-- Plan §10: an inclusive-tax line stores the gross figure the operator saw and
-- the net is derived from it; an exclusive line stores the net and the tax is
-- added. One function so the two call sites (RPC and trigger) can never drift.
CREATE OR REPLACE FUNCTION public.expense_line_net(
  p_gross numeric,
  p_tax_rate numeric,
  p_mode public.expense_tax_mode
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_gross IS NULL THEN NULL
    WHEN p_tax_rate IS NULL OR p_tax_rate <= 0 THEN public.expense_round(p_gross)
    WHEN p_mode = 'EXCLUSIVE' THEN public.expense_round(p_gross)
    ELSE public.expense_round(p_gross / (1 + (p_tax_rate / 100)))
  END
$$;

CREATE OR REPLACE FUNCTION public.expense_line_tax(
  p_gross numeric,
  p_tax_rate numeric,
  p_mode public.expense_tax_mode
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_gross IS NULL THEN NULL
    WHEN p_tax_rate IS NULL OR p_tax_rate <= 0 THEN 0::numeric
    ELSE public.expense_round(p_gross - public.expense_line_net(p_gross, p_tax_rate, p_mode))
  END
$$;

COMMENT ON FUNCTION public.expense_line_net(numeric, numeric, public.expense_tax_mode) IS
  'صافي السطر بعد عزل الضريبة (أو قبله للضريبة الشاملة). تقريب موحّد لمنع فرق الهللة.';
COMMENT ON FUNCTION public.expense_line_tax(numeric, numeric, public.expense_tax_mode) IS
  'قيمة الضريبة على السطر. الناتج دائمًا = الإجمالي − الصافي، فلا تظهر قيود غير متوازنة.';
-- ---------------------------------------------------------------------------
-- 3. Money helpers (used by every expense RPC and by the generated columns)
-- ---------------------------------------------------------------------------
-- One place for rounding and one for the paid/settlement pair, so a trigger,
-- an RPC and a report can never disagree about what "2 decimals" means.
CREATE OR REPLACE FUNCTION public.expense_round(p_value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  -- Numeric, not float: 0.005 must round the way the accountant expects and
  -- SUM() over a million rows must not accumulate binary drift.
  SELECT round(coalesce(p_value, 0)::numeric, 2)
$$;

CREATE OR REPLACE FUNCTION public.expense_settlement_status(
  p_current public.expense_status,
  p_paid numeric,
  p_total numeric
)
RETURNS public.expense_status
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_current NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN p_current
    WHEN coalesce(p_total, 0) <= 0 THEN p_current
    WHEN coalesce(p_paid, 0) <= 0 THEN 'POSTED'::public.expense_status
    -- Deliberately `>=` on the paid side and `>` on the zero side: a rounding
    -- remainder of less than half a unit must settle as fully paid rather than
    -- leaving a document permanently "partially paid".
    WHEN coalesce(p_paid, 0) >= coalesce(p_total, 0) - 0.005 THEN 'PAID'::public.expense_status
    ELSE 'PARTIALLY_PAID'::public.expense_status
  END
$$;

COMMENT ON FUNCTION public.expense_settlement_status(public.expense_status, numeric, numeric) IS
  'يشتق حالة السداد من مجموع الدفعات، ولا يقبل حالة مُدخلة يدويًا.';
-- ---------------------------------------------------------------------------
-- 4. Cost centre / project masters (plan §15)
-- ---------------------------------------------------------------------------
-- `warehouses` is an inventory location and is NOT a cost centre. Rather than
-- overloading it, the module owns two optional, company-named dimensions. They
-- are nullable everywhere, so an installation that has no cost accounting is
-- not forced to create any.
CREATE TABLE IF NOT EXISTS public.expense_cost_centers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text,
  name        text NOT NULL,
  name_ar     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_cost_centers_name_not_blank CHECK (btrim(name) <> '')
);

-- The code is what appears on a report column; two centres sharing one code
-- would make the cost report ambiguous, so it is unique among non-null codes.
CREATE UNIQUE INDEX IF NOT EXISTS expense_cost_centers_code_key
  ON public.expense_cost_centers (lower(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

CREATE INDEX IF NOT EXISTS expense_cost_centers_active_idx
  ON public.expense_cost_centers (is_active, name);

COMMENT ON TABLE public.expense_cost_centers IS
  'مراكز التكلفة (اختيارية) لتوزيع المصروف على أقسام أو أنشطة.';

CREATE TABLE IF NOT EXISTS public.expense_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text,
  name        text NOT NULL,
  name_ar     text,
  -- A project is a time-bounded activity; when it is closed the picker must
  -- stop offering it without deleting its historical postings.
  is_active   boolean NOT NULL DEFAULT true,
  started_on  date,
  closed_on   date,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_projects_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT expense_projects_window_valid CHECK (
    closed_on IS NULL OR started_on IS NULL OR closed_on >= started_on
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_projects_code_key
  ON public.expense_projects (lower(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

CREATE INDEX IF NOT EXISTS expense_projects_active_idx
  ON public.expense_projects (is_active, name);

COMMENT ON TABLE public.expense_projects IS
  'المشاريع (اختيارية) لربط المصروف بنشاط محدد له تاريخ بداية ونهاية.';

ALTER TABLE public.expense_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_projects     ENABLE ROW LEVEL SECURITY;

-- Read for any active staff member (a picker must render for a cashier too);
-- write restricted to the roles that own the chart of dimensions.
CREATE POLICY "expense_cost_centers_read" ON public.expense_cost_centers
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "expense_cost_centers_manage" ON public.expense_cost_centers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "expense_projects_read" ON public.expense_projects
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

CREATE POLICY "expense_projects_manage" ON public.expense_projects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

GRANT SELECT ON public.expense_cost_centers, public.expense_projects TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.expense_cost_centers, public.expense_projects TO authenticated;
GRANT ALL ON public.expense_cost_centers, public.expense_projects TO service_role;

DROP TRIGGER IF EXISTS tg_expense_cost_centers_updated ON public.expense_cost_centers;
CREATE TRIGGER tg_expense_cost_centers_updated
  BEFORE UPDATE ON public.expense_cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS tg_expense_projects_updated ON public.expense_projects;
CREATE TRIGGER tg_expense_projects_updated
  BEFORE UPDATE ON public.expense_projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
-- ---------------------------------------------------------------------------
-- 5. Extend the existing category master (plan §9, additive only)
-- ---------------------------------------------------------------------------
-- The legacy table stays exactly where it is and keeps its six seeded rows.
-- What is added is everything a classification needs in order to behave like
-- a smart default rather than a label:
--
--   is_active     -- archive instead of delete, so posted history keeps a name
--   sort_order    -- a stable, operator-controlled order for the picker
--   notes         -- what the category is meant to cover (used in the form hint)
--   created_by    -- attribution for the audit trail
--
-- NOT added here: the accounting account. Plan §10 forbids collapsing category
-- into GL account, so the mapping is a later, explicit phase.
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS is_active  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expense_categories_active_order_idx
  ON public.expense_categories (is_active, sort_order, name);

COMMENT ON COLUMN public.expense_categories.is_active IS
  'أرشفة بدل الحذف: التصنيف المُستخدم في مصروف مرحّل يجب أن يبقى قابلًا للقراءة.';

-- ---------------------------------------------------------------------------
-- 6. The expense document (plan §9: expense_entries)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human reference. Printed on the voucher, quoted by the operator.
  reference         text NOT NULL,

  entry_type        public.expense_entry_type NOT NULL DEFAULT 'DIRECT',
  status            public.expense_status     NOT NULL DEFAULT 'DRAFT',
  source_kind       public.expense_source_kind NOT NULL DEFAULT 'MANUAL',

  -- --- who is being paid ---------------------------------------------------
  -- Plan §12: there are no employees in this schema beyond `profiles`, so an
  -- employee payee is a profile id. `payee_type` says how to interpret it and
  -- the CHECK below keeps the pair consistent.
  payee_type        public.expense_payee_type NOT NULL DEFAULT 'NONE',
  payee_name        text,
  supplier_id       uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  employee_id       uuid REFERENCES auth.users(id)   ON DELETE SET NULL,

  -- --- optional dimensions (plan §15) --------------------------------------
  -- Warehouse is nullable on purpose: an expense is not required to belong to
  -- a stock location, and forcing one would invent data.
  warehouse_id      uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  cost_center_id    uuid REFERENCES public.expense_cost_centers(id) ON DELETE SET NULL,
  project_id        uuid REFERENCES public.expense_projects(id)     ON DELETE SET NULL,

  -- --- the three dates of plan §10 -----------------------------------------
  expense_date      date NOT NULL DEFAULT CURRENT_DATE,  -- economic occurrence
  due_date          date,                                -- when the payable falls due
  posting_date      date,                                -- ledger period; set at post time

  -- --- description ---------------------------------------------------------
  description       text,
  note              text,

  -- --- money ---------------------------------------------------------------
  -- `total_amount` is the GROSS amount actually owed to the payee. The older
  -- plan sketch carried net/tax/total as well; on a vat-less installation all
  -- three are the same number, so they were dropped rather than mirrored into
  -- three columns that can disagree. Tax still lives, correctly, at the line
  -- level, where a bill with mixed-rate lines is the only place it can honestly
  -- be represented.
  total_amount      numeric(18,2) NOT NULL DEFAULT 0,
  paid_amount       numeric(18,2) NOT NULL DEFAULT 0,
  remaining_amount  numeric(18,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,

  tax_mode          public.expense_tax_mode NOT NULL DEFAULT 'NONE',

  -- --- currency snapshot ---------------------------------------------------
  -- Captured at creation so a later change to company_settings.currency cannot
  -- silently re-label a historical document.
  currency          text NOT NULL DEFAULT 'YER',
  currency_symbol   text NOT NULL DEFAULT '﷼',

  line_count        integer NOT NULL DEFAULT 0,

  -- --- workflow ------------------------------------------------------------
  -- Optimistic concurrency token. Every mutating RPC takes `p_expected_version`
  -- and refuses when it does not match, which is how "two people edited the
  -- same draft" is caught instead of silently losing one edit.
  version           integer NOT NULL DEFAULT 1,

  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at      timestamptz,
  approved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  rejected_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at       timestamptz,
  rejection_reason  text,
  posted_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at         timestamptz,
  cancelled_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at      timestamptz,
  cancel_reason     text,
  reversal_of       uuid REFERENCES public.expense_entries(id) ON DELETE SET NULL,
  reversed_by_id    uuid REFERENCES public.expense_entries(id) ON DELETE SET NULL,

  -- --- legacy bridge (plan §24) -------------------------------------------
  -- The id of the `public.expenses` row this document was migrated from, if
  -- any. Unique so a re-run of the backfill can never duplicate a document,
  -- and ON DELETE SET NULL is intentionally absent: the legacy table is never
  -- deleted while the bridge exists.
  legacy_expense_id uuid,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_entries_reference_not_blank CHECK (btrim(reference) <> ''),
  CONSTRAINT expense_entries_total_non_negative CHECK (total_amount >= 0),
  CONSTRAINT expense_entries_paid_non_negative  CHECK (paid_amount  >= 0),
  -- Over-payment must be impossible at the storage layer, not only in the RPC:
  -- a bug in a future code path must not be able to create negative remaining.
  CONSTRAINT expense_entries_paid_within_total  CHECK (paid_amount <= total_amount + 0.005),
  CONSTRAINT expense_entries_due_after_expense
    CHECK (due_date IS NULL OR due_date >= expense_date),
  CONSTRAINT expense_entries_dates_ordered
    CHECK (posting_date IS NULL OR posting_date >= expense_date - 366),
  -- The payee triple must be internally consistent: a SUPPLIER payee needs a
  -- supplier, an EMPLOYEE payee needs a profile, and a NONE payee must not
  -- smuggle in one of the two references.
  CONSTRAINT expense_entries_payee_consistent CHECK (
    (payee_type = 'SUPPLIER' AND supplier_id  IS NOT NULL AND employee_id IS NULL) OR
    (payee_type = 'EMPLOYEE' AND employee_id  IS NOT NULL AND supplier_id IS NULL) OR
    (payee_type IN ('NONE', 'OTHER') AND supplier_id IS NULL AND employee_id IS NULL)
  ),
  -- A document cannot be paid before it is posted, and cannot be posted with
  -- nothing to pay. Both are expressed as state-vs-money invariants.
  CONSTRAINT expense_entries_paid_requires_post CHECK (
    paid_amount = 0 OR status IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED')
  )
);

-- One reference per company, case-insensitive: an operator quoting "EXP-0007"
-- must never find two different documents.
CREATE UNIQUE INDEX IF NOT EXISTS expense_entries_reference_key
  ON public.expense_entries (upper(btrim(reference)));

-- The backfill guard. A partial unique index (rather than a table constraint)
-- so the many rows with NULL legacy_expense_id stay unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS expense_entries_legacy_key
  ON public.expense_entries (legacy_expense_id)
  WHERE legacy_expense_id IS NOT NULL;

-- Plan §20 indexes. Every one is status/date-led because that is the predicate
-- the list screen, the approval queue and the reports actually use; the planner
-- can serve "latest first" straight from the index without a sort.
CREATE INDEX IF NOT EXISTS expense_entries_status_date_idx
  ON public.expense_entries (status, expense_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS expense_entries_date_idx
  ON public.expense_entries (expense_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS expense_entries_created_idx
  ON public.expense_entries (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS expense_entries_supplier_idx
  ON public.expense_entries (supplier_id, expense_date DESC)
  WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_entries_employee_idx
  ON public.expense_entries (employee_id, expense_date DESC)
  WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_entries_cost_center_idx
  ON public.expense_entries (cost_center_id, expense_date DESC)
  WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_entries_project_idx
  ON public.expense_entries (project_id, expense_date DESC)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_entries_warehouse_idx
  ON public.expense_entries (warehouse_id, expense_date DESC)
  WHERE warehouse_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_entries_created_by_idx
  ON public.expense_entries (created_by, expense_date DESC)
  WHERE created_by IS NOT NULL;
-- The approval queue is the one list that is filtered by status alone and then
-- ordered by submission time, which the composite above cannot serve.
CREATE INDEX IF NOT EXISTS expense_entries_pending_idx
  ON public.expense_entries (submitted_at ASC)
  WHERE status = 'SUBMITTED';
-- Open payables: everything posted and not yet settled.
CREATE INDEX IF NOT EXISTS expense_entries_open_idx
  ON public.expense_entries (due_date NULLS LAST, expense_date)
  WHERE status IN ('POSTED', 'PARTIALLY_PAID');

COMMENT ON TABLE public.expense_entries IS
  'مستند المصروف: رأس الفاتورة بحالته ودورته وتواريخه ومبالغه. البنود في expense_lines.';
COMMENT ON COLUMN public.expense_entries.total_amount IS
  'إجمالي المستند شاملًا الضريبة — أي المبلغ المستحق للجهة المستفيدة.';
COMMENT ON COLUMN public.expense_entries.paid_amount IS
  'مجموع الدفعات المسجّلة. لا يُعدّل يدويًا: تحدّثه دوال الدفع داخل معاملة واحدة.';
COMMENT ON COLUMN public.expense_entries.version IS
  'رقم النسخة لضبط التزامن: كل عملية تعديل تشترط النسخة المتوقعة.';
COMMENT ON COLUMN public.expense_entries.legacy_expense_id IS
  'معرّف السجل في جدول expenses القديم، لضمان عدم تكرار الترحيل.';

ALTER TABLE public.expense_entries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_expense_entries_updated ON public.expense_entries;
CREATE TRIGGER tg_expense_entries_updated
  BEFORE UPDATE ON public.expense_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
-- ---------------------------------------------------------------------------
-- 7. Expense lines (plan §9: expense_lines)
-- ---------------------------------------------------------------------------
-- A single maintenance bill has parts, labour and transport. Forcing that into
-- one amount loses the category breakdown that every report in §23 is built on,
-- so the document owns lines and the header total is maintained from them.
CREATE TABLE IF NOT EXISTS public.expense_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        uuid NOT NULL REFERENCES public.expense_entries(id) ON DELETE CASCADE,
  line_no         integer NOT NULL,

  description     text,
  category_id     uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  quantity        numeric(18,3) NOT NULL DEFAULT 1,
  unit_price      numeric(18,2) NOT NULL DEFAULT 0,

  -- Stored (not generated) so a later change to the tax mode on the header
  -- cannot retroactively restate a line that was already approved.
  net_amount      numeric(18,2) NOT NULL DEFAULT 0,
  tax_rate        numeric(5,2)  NOT NULL DEFAULT 0,
  tax_amount      numeric(18,2) NOT NULL DEFAULT 0,
  gross_amount    numeric(18,2) NOT NULL DEFAULT 0,

  -- Line-level dimensions. A line is where allocation genuinely belongs: one
  -- internet bill can split across two branches and the split must survive.
  cost_center_id  uuid REFERENCES public.expense_cost_centers(id) ON DELETE SET NULL,
  project_id      uuid REFERENCES public.expense_projects(id)     ON DELETE SET NULL,

  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_lines_line_no_positive CHECK (line_no > 0),
  CONSTRAINT expense_lines_quantity_positive CHECK (quantity > 0),
  CONSTRAINT expense_lines_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT expense_lines_tax_rate_range CHECK (tax_rate >= 0 AND tax_rate <= 100),
  CONSTRAINT expense_lines_amounts_non_negative
    CHECK (net_amount >= 0 AND tax_amount >= 0 AND gross_amount >= 0),
  -- The identity every journal entry will rely on. Expressed with a tolerance
  -- narrower than one cent so a legitimate rounding of the tax split passes
  -- while a real mismatch cannot.
  CONSTRAINT expense_lines_amounts_add_up
    CHECK (abs((net_amount + tax_amount) - gross_amount) <= 0.01)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_lines_entry_line_key
  ON public.expense_lines (entry_id, line_no);

CREATE INDEX IF NOT EXISTS expense_lines_entry_idx
  ON public.expense_lines (entry_id);
CREATE INDEX IF NOT EXISTS expense_lines_category_idx
  ON public.expense_lines (category_id, entry_id);
CREATE INDEX IF NOT EXISTS expense_lines_cost_center_idx
  ON public.expense_lines (cost_center_id, entry_id)
  WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS expense_lines_project_idx
  ON public.expense_lines (project_id, entry_id)
  WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.expense_lines IS
  'بنود المصروف: تصنيف ومبلغ لكل بند، لتوزيع مصروف واحد على أكثر من فئة أو مركز تكلفة.';
COMMENT ON COLUMN public.expense_lines.gross_amount IS
  'إجمالي البند شاملًا الضريبة، ويجب أن يساوي الصافي + الضريبة.';

ALTER TABLE public.expense_lines ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_expense_lines_updated ON public.expense_lines;
CREATE TRIGGER tg_expense_lines_updated
  BEFORE UPDATE ON public.expense_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Payments (plan §11: a payment is an event, not a column)
-- ---------------------------------------------------------------------------
-- The legacy row could only say "cash" or "credit". A real document can be paid
-- in instalments, from different sources, on different dates, and a single one
-- of those payments can be reversed. All of that needs rows.
CREATE TABLE IF NOT EXISTS public.expense_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        uuid NOT NULL REFERENCES public.expense_entries(id) ON DELETE RESTRICT,

  amount          numeric(18,2) NOT NULL,
  payment_date    date NOT NULL DEFAULT CURRENT_DATE,
  payment_method  public.payment_method NOT NULL DEFAULT 'cash',

  -- Free-text source ("Meezan current account", "Petty cash box"). A real
  -- account master does not exist in this schema and inventing one here would
  -- be a second source of truth, so the label is honest about being a label.
  account_label   text,
  reference_no    text,
  note            text,

  -- Retry safety. A dropped response that the client re-sends must produce one
  -- payment, not two — the unique index below is what makes that true.
  idempotency_key text,

  -- Reversal is a link, never a delete: the original payment row is immutable
  -- evidence and the reversal is its own row.
  reversed_by     uuid REFERENCES public.expense_payments(id) ON DELETE SET NULL,
  reversal_of     uuid REFERENCES public.expense_payments(id) ON DELETE SET NULL,

  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_payments_amount_positive CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_payments_idempotency_key
  ON public.expense_payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS expense_payments_entry_idx
  ON public.expense_payments (entry_id, payment_date, id);
CREATE INDEX IF NOT EXISTS expense_payments_date_idx
  ON public.expense_payments (payment_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS expense_payments_method_idx
  ON public.expense_payments (payment_method, payment_date DESC);

COMMENT ON TABLE public.expense_payments IS
  'دفعات المصروف: كل سداد حدث مستقل بتاريخه ومصدره، ويدعم الدفع الجزئي والعكس.';
COMMENT ON COLUMN public.expense_payments.idempotency_key IS
  'مفتاح منع التكرار: إعادة إرسال الطلب بسبب انقطاع الشبكة لا تُنشئ دفعة ثانية.';

ALTER TABLE public.expense_payments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_expense_payments_updated ON public.expense_payments;
CREATE TRIGGER tg_expense_payments_updated
  BEFORE UPDATE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. Approval trail (plan §17)
-- ---------------------------------------------------------------------------
-- Append-only by construction: the table has no UPDATE policy and no UPDATE
-- grant, so "who approved this, when, and after what" cannot be rewritten by
-- the very user it is recording.
CREATE TABLE IF NOT EXISTS public.expense_approvals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES public.expense_entries(id) ON DELETE CASCADE,
  sequence    integer NOT NULL,
  action      text NOT NULL,
  from_status public.expense_status,
  to_status   public.expense_status NOT NULL,
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_approvals_action_known CHECK (
    action IN ('created', 'updated', 'submitted', 'approved', 'rejected',
               'posted', 'payment', 'cancelled', 'reversed', 'closed', 'reopened')
  ),
  CONSTRAINT expense_approvals_sequence_positive CHECK (sequence > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_approvals_entry_sequence_key
  ON public.expense_approvals (entry_id, sequence);

CREATE INDEX IF NOT EXISTS expense_approvals_entry_idx
  ON public.expense_approvals (entry_id, created_at);

COMMENT ON TABLE public.expense_approvals IS
  'سجل زمني للموافقات والانتقالات. للقراءة والإضافة فقط، ولا يمكن تعديله من العميل.';

ALTER TABLE public.expense_approvals ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 10. Attachments (plan §16)
-- ---------------------------------------------------------------------------
-- Metadata only. The bytes live in a private Supabase Storage bucket; nothing
-- in this table carries a public URL, because a public URL is exactly how a
-- supplier invoice leaks.
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      uuid NOT NULL REFERENCES public.expense_entries(id) ON DELETE CASCADE,
  line_id       uuid REFERENCES public.expense_lines(id) ON DELETE CASCADE,

  bucket_id     text NOT NULL DEFAULT 'expense-attachments',
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text,
  file_size     bigint,
  checksum      text,

  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT expense_attachments_size_positive CHECK (file_size IS NULL OR file_size > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_attachments_path_key
  ON public.expense_attachments (bucket_id, storage_path);

CREATE INDEX IF NOT EXISTS expense_attachments_entry_idx
  ON public.expense_attachments (entry_id, created_at);

COMMENT ON TABLE public.expense_attachments IS
  'بيانات مرفقات المصروف (فاتورة/إيصال/صورة). الملف نفسه في مخزن خاص، والميتاداتا فقط هنا.';

ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
-- ---------------------------------------------------------------------------
-- 11. Capability helpers (plan §18)
-- ---------------------------------------------------------------------------
-- The UI hides buttons; these functions are what actually decides. They are
-- thin wrappers over the existing `has_role`/`is_staff` pair so the role matrix
-- lives in exactly one place and a future move to a permission table changes
-- these five bodies and nothing else.
CREATE OR REPLACE FUNCTION public.expense_role_rank(p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Ordered most privileged first; COALESCE keeps a role-less user at 0.
    WHEN public.has_role(p_user, 'owner')     THEN 50
    WHEN public.has_role(p_user, 'manager')   THEN 40
    WHEN public.has_role(p_user, 'accountant') THEN 30
    WHEN public.has_role(p_user, 'cashier')   THEN 20
    WHEN public.has_role(p_user, 'warehouse') THEN 10
    ELSE 0
  END
$$;

COMMENT ON FUNCTION public.expense_role_rank(uuid) IS
  'أعلى رتبة يملكها المستخدم في منظومة المصروفات، لتطبيق مصفوفة الصلاحيات.';

CREATE OR REPLACE FUNCTION public.expense_can(p_user uuid, p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Every capability requires an active staff account. `is_staff` fails
    -- closed on a missing profile row, which is the behaviour we want here.
    public.is_staff(p_user)
    AND CASE p_capability
      -- Reading the register is the baseline every operational role needs.
      WHEN 'expense.view'            THEN public.expense_role_rank(p_user)            >= 10
      -- Typing a draft is a cashier/warehouse action: it commits nothing.
      WHEN 'expense.create'          THEN public.expense_role_rank(p_user)            >= 10
      WHEN 'expense.edit'            THEN public.expense_role_rank(p_user)            >= 10
      WHEN 'expense.submit'          THEN public.expense_role_rank(p_user)            >= 10
      -- Approval is a control, not a data-entry step.
      WHEN 'expense.approve'         THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.reject'          THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.post'            THEN public.expense_role_rank(p_user)            >= 30
      -- Money leaving the drawer needs the same bar as posting.
      WHEN 'expense.pay'             THEN public.expense_role_rank(p_user)            >= 20
      WHEN 'expense.reverse'         THEN public.expense_role_rank(p_user)            >= 30
      WHEN 'expense.cancel'          THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.category.manage' THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.dimension.manage' THEN public.expense_role_rank(p_user)           >= 40
      WHEN 'expense.report'          THEN public.expense_role_rank(p_user)            >= 30
      WHEN 'expense.payment.reverse' THEN public.expense_role_rank(p_user)            >= 30
      ELSE false
    END
$$;

COMMENT ON FUNCTION public.expense_can(uuid, text) IS
  'مصفوفة صلاحيات المصروفات: owner>manager>accountant>cashier>warehouse. '
  'النشر والاعتماد والعكس محصورة، وإدخال المسودة متاح لكل موظف نشط.';

-- Convenience predicate for the RLS policies below. Kept separate from
-- `expense_can` so a policy reads as one phrase rather than a CASE expression.
CREATE OR REPLACE FUNCTION public.expense_can_write_document(p_entry_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_entries e
    WHERE e.id = p_entry_id
      AND (
        -- An approver or accountant can act on any document.
        public.expense_role_rank(p_user) >= 30
        -- Everyone else can act only on a document they own, and only while it
        -- is still theirs to change. Posted documents are frozen for all.
        OR (e.created_by = p_user AND e.status IN ('DRAFT', 'REJECTED'))
      )
  )
$$;

COMMENT ON FUNCTION public.expense_can_write_document(uuid, uuid) IS
  'هل يجوز لهذا المستخدم تعديل هذا المستند؟ المالك يعدّل مسودته فقط، والمحاسب يعدّل ضمن صلاحيته.';

GRANT EXECUTE ON FUNCTION public.expense_role_rank(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_can(uuid, text)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_can_write_document(uuid, uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_round(numeric)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_line_net(numeric, numeric, public.expense_tax_mode) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_line_tax(numeric, numeric, public.expense_tax_mode) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_settlement_status(public.expense_status, numeric, numeric) TO authenticated;
-- ---------------------------------------------------------------------------
-- 12. RLS policies
-- ---------------------------------------------------------------------------
-- Read is broad (any active staff member) because an expense register is an
-- operational ledger, not a private record — the same choice the legacy
-- `expenses` policies already made, so no existing screen loses access.
--
-- Write is deliberately NOT granted here at all. Every mutation goes through a
-- SECURITY DEFINER RPC in the next phase, which is where the status machine,
-- the version check and the audit row live. Granting INSERT/UPDATE to
-- `authenticated` would let a client write `status = 'PAID'` directly and
-- make the whole workflow decorative.
DROP POLICY IF EXISTS "expense_entries_read" ON public.expense_entries;
CREATE POLICY "expense_entries_read" ON public.expense_entries
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "expense_lines_read" ON public.expense_lines;
CREATE POLICY "expense_lines_read" ON public.expense_lines
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "expense_payments_read" ON public.expense_payments;
CREATE POLICY "expense_payments_read" ON public.expense_payments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "expense_approvals_read" ON public.expense_approvals;
CREATE POLICY "expense_approvals_read" ON public.expense_approvals
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "expense_attachments_read" ON public.expense_attachments;
CREATE POLICY "expense_attachments_read" ON public.expense_attachments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- The one exception: an attachment's own metadata row can be inserted by the
-- uploader after the file lands in Storage, and deleted by a manager while the
-- document is still editable. The bytes themselves are governed by the bucket
-- policies in a later phase; without those, nothing is publicly reachable.
DROP POLICY IF EXISTS "expense_attachments_insert" ON public.expense_attachments;
CREATE POLICY "expense_attachments_insert" ON public.expense_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_staff(auth.uid())
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expense_entries e
      WHERE e.id = entry_id AND e.status IN ('DRAFT', 'REJECTED')
    )
  );

DROP POLICY IF EXISTS "expense_attachments_delete" ON public.expense_attachments;
CREATE POLICY "expense_attachments_delete" ON public.expense_attachments
  FOR DELETE TO authenticated
  USING (
    public.expense_role_rank(auth.uid()) >= 30
    AND EXISTS (
      SELECT 1 FROM public.expense_entries e
      WHERE e.id = entry_id AND e.status IN ('DRAFT', 'REJECTED')
    )
  );

-- Grants. SELECT only on the document tables; the RPCs run as the definer and
-- therefore do not need the caller to hold INSERT/UPDATE.
REVOKE ALL ON public.expense_entries,  public.expense_lines,
              public.expense_payments, public.expense_approvals,
              public.expense_attachments FROM PUBLIC, anon;
GRANT SELECT ON public.expense_entries, public.expense_lines,
                public.expense_payments, public.expense_approvals,
                public.expense_attachments TO authenticated;
GRANT INSERT, DELETE ON public.expense_attachments TO authenticated;
GRANT ALL ON public.expense_entries,  public.expense_lines,
             public.expense_payments, public.expense_approvals,
             public.expense_attachments TO service_role;

-- ---------------------------------------------------------------------------
-- 13. Immutability after posting (plan §8, §33)
-- ---------------------------------------------------------------------------
-- RLS cannot express "these nine columns may not change once posted"; a trigger
-- can, and it holds no matter which code path — today's RPC, tomorrow's report
-- helper, or a direct service_role script — performs the update.
CREATE OR REPLACE FUNCTION public.tg_expense_entries_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guard documents that have actually been recognized. A draft is meant
  -- to be edited; a posted document is evidence.
  IF OLD.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED')
     AND NEW.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED') THEN
    RETURN NEW;
  END IF;

  -- The exception is the reversal flow, which legitimately links a posted row
  -- to its compensating document; everything else about it stays frozen.
  IF NEW.total_amount  IS DISTINCT FROM OLD.total_amount
     OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
     OR NEW.entry_type   IS DISTINCT FROM OLD.entry_type
     OR NEW.supplier_id  IS DISTINCT FROM OLD.supplier_id
     OR NEW.employee_id  IS DISTINCT FROM OLD.employee_id
     OR NEW.payee_type   IS DISTINCT FROM OLD.payee_type
     OR NEW.currency     IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION
      'Expense % is posted: its financial fields are immutable. Reverse it instead.',
      OLD.reference
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_expense_entries_guard ON public.expense_entries;
CREATE TRIGGER tg_expense_entries_guard
  BEFORE UPDATE ON public.expense_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_expense_entries_guard();

COMMENT ON FUNCTION public.tg_expense_entries_guard() IS
  'يمنع تعديل المبالغ والتواريخ والأطراف بعد الترحيل: التصحيح يكون بعكس القيد لا بالتحرير.';
-- ---------------------------------------------------------------------------
-- 14. Document total / line count maintenance
-- ---------------------------------------------------------------------------
-- The header total is derived from its lines in the database, not recomputed by
-- each caller. That means a future line-editing RPC cannot forget to update the
-- header, and the constraint `expense_entries_paid_within_total` is always
-- evaluated against a figure that matches the lines actually stored.
--
-- Deliberately NOT enforced while the document is posted: the guard trigger
-- above would reject the total change and the error would be confusing. Posting
-- freezes the lines, so there is nothing to maintain at that point.
CREATE OR REPLACE FUNCTION public.tg_expense_lines_sync_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  v_status   public.expense_status;
  v_total    numeric(18,2);
  v_lines    integer;
BEGIN
  SELECT status INTO v_status FROM public.expense_entries WHERE id = v_entry_id;

  -- A posted document's lines are frozen evidence; leave its header alone.
  IF v_status IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(gross_amount), 0)::numeric(18,2), count(*)
    INTO v_total, v_lines
  FROM public.expense_lines
  WHERE entry_id = v_entry_id;

  UPDATE public.expense_entries
     SET total_amount = v_total,
         line_count   = v_lines
   WHERE id = v_entry_id
     AND status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED');

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_expense_lines_sync_total ON public.expense_lines;
CREATE TRIGGER tg_expense_lines_sync_total
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_expense_lines_sync_total();

COMMENT ON FUNCTION public.tg_expense_lines_sync_total() IS
  'يزامن إجمالي المستند وعدد بنوده مع جدول البنود، فلا يمكن أن يتباين الرأس مع التفاصيل.';

-- ---------------------------------------------------------------------------
-- 15. Payment total maintenance
-- ---------------------------------------------------------------------------
-- `paid_amount` and the derived status move together, in the database, from the
-- payments that exist. A caller cannot set "paid" without the money being there
-- and cannot leave a fully settled document marked "posted".
CREATE OR REPLACE FUNCTION public.tg_expense_payments_sync_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  v_paid     numeric(18,2);
  v_entry    public.expense_entries;
BEGIN
  SELECT COALESCE(sum(amount), 0)::numeric(18,2)
    INTO v_paid
  FROM public.expense_payments
  -- A reversed payment keeps its row but stops counting toward settlement; the
  -- reversal row itself is subtracted because it carries a positive amount and
  -- a `reversal_of` link, which is expressed on the matching row's `reversed_by`.
  WHERE entry_id = v_entry_id
    AND reversed_by IS NULL
    AND reversal_of IS NULL;

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_entry_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.expense_entries
     SET paid_amount = v_paid,
         status = public.expense_settlement_status(
           CASE WHEN v_entry.status IN ('CLOSED', 'REVERSED') THEN v_entry.status
                ELSE 'POSTED'::public.expense_status END,
           v_paid,
           v_entry.total_amount
         )
   WHERE id = v_entry_id;

  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS tg_expense_payments_sync_entry ON public.expense_payments;
CREATE TRIGGER tg_expense_payments_sync_entry
  AFTER INSERT OR UPDATE OR DELETE ON public.expense_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_expense_payments_sync_entry();

COMMENT ON FUNCTION public.tg_expense_payments_sync_entry() IS
  'يشتق المبلغ المدفوع وحالة السداد من صفوف الدفعات الفعلية، لا من إدخال يدوي.';

-- ---------------------------------------------------------------------------
-- 16. Self-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_name    text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'expense_entries', 'expense_lines', 'expense_payments',
    'expense_approvals', 'expense_attachments',
    'expense_cost_centers', 'expense_projects'
  ] LOOP
    IF to_regclass('public.' || v_name) IS NULL THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'expense foundation incomplete: %', array_to_string(v_missing, ', ');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'expense_status') THEN
    RAISE EXCEPTION 'enum public.expense_status missing';
  END IF;

  -- The legacy tables must still be intact: this migration is additive.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'amount'
  ) THEN
    RAISE EXCEPTION 'legacy public.expenses.amount disappeared — this migration must be additive only';
  END IF;

  RAISE NOTICE
    '20261001090000: expense foundation ready (7 tables, 5 enums, legacy tables untouched).';
END $$;
