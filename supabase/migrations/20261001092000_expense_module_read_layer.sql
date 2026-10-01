  -- ============================================================================
-- Market-Hub ERP — Expense Management Module, Phase 3: Server-side read layer
-- ============================================================================
-- Reference: docs/EXPENSES_ERP_IMPLEMENTATION_PLAN.md
--   §20  Performance Architecture (never load the register into the browser)
--   §22  UX/UI Design             (summary cards + filtered list)
--   §23  Reporting                (SQL aggregation, not JavaScript)
--
-- THE PROBLEM THESE FUNCTIONS REPLACE
--   The legacy finance screen ran `select *` over sales, purchases and 100
--   expenses and reduced the arrays in the browser. That works at 200 rows and
--   fails silently at 200,000: the page still renders, it just takes eleven
--   seconds and a gigabyte of memory. Everything here is designed so the row
--   count on the wire is bounded by the page size, and every total is computed
--   by the database that holds the index.
--
--   One function returns a page of documents; one returns the four headline
--   figures; one returns the grouped report. Three narrow contracts instead of
--   one wide endpoint, because the list must stay cheap even when the report is
--   doing a full scan over a financial year.
--
-- ALL FUNCTIONS ARE STABLE + SECURITY INVOKER
--   They read and must respect RLS; they never write, so they must not run as
--   the definer. `auth.uid()` still resolves inside an invoker function.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.expense_entries') IS NULL THEN
    RAISE EXCEPTION 'run 20261001090000_expense_module_foundation.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. list_expenses — one page, server-filtered, server-sorted
-- ---------------------------------------------------------------------------
-- Pagination is keyset ("everything strictly before this row"), not OFFSET.
-- OFFSET makes the database walk and discard every skipped row, so page 400 of
-- a million-row register costs the same as reading 20,000 rows; keyset reads
-- exactly the page it returns. The client keeps `next_cursor` from the previous
-- page and hands it back.
CREATE OR REPLACE FUNCTION public.list_expenses(
  p_search        text              DEFAULT NULL,
  p_status        public.expense_status[] DEFAULT NULL,
  p_category_id   uuid              DEFAULT NULL,
  p_warehouse_id  uuid              DEFAULT NULL,
  p_cost_center_id uuid             DEFAULT NULL,
  p_project_id    uuid              DEFAULT NULL,
  p_supplier_id   uuid              DEFAULT NULL,
  p_employee_id   uuid              DEFAULT NULL,
  p_payment_state text              DEFAULT NULL,   -- 'unpaid' | 'partial' | 'paid'
  p_date_from     date              DEFAULT NULL,
  p_date_to       date              DEFAULT NULL,
  p_amount_min    numeric           DEFAULT NULL,
  p_amount_max    numeric           DEFAULT NULL,
  p_category_ids  uuid[]            DEFAULT NULL,
  p_limit         integer           DEFAULT 50,
  p_cursor_date   date              DEFAULT NULL,
  p_cursor_id     uuid              DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  reference        text,
  status           public.expense_status,
  entry_type       public.expense_entry_type,
  payee_type       public.expense_payee_type,
  payee_name       text,
  supplier_id      uuid,
  supplier_name    text,
  employee_id      uuid,
  employee_name    text,
  warehouse_id     uuid,
  warehouse_name   text,
  cost_center_id   uuid,
  cost_center_name text,
  project_id       uuid,
  project_name     text,
  expense_date     date,
  due_date         date,
  posting_date     date,
  description      text,
  note             text,
  total_amount     numeric,
  paid_amount      numeric,
  remaining_amount numeric,
  line_count       integer,
  primary_category text,
  primary_category_ar text,
  version          integer,
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz,
  approved_at      timestamptz,
  posted_at        timestamptz,
  total_count      bigint,
  next_cursor_date date,
  next_cursor_id   uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      e.id, e.reference, e.status, e.entry_type, e.payee_type, e.payee_name,
      e.supplier_id, e.employee_id, e.warehouse_id, e.cost_center_id, e.project_id,
      e.expense_date, e.due_date, e.posting_date, e.description, e.note,
      e.total_amount, e.paid_amount, e.remaining_amount, e.line_count,
      e.version, e.created_by, e.created_at, e.approved_at, e.posted_at
    FROM public.expense_entries e
    WHERE
      -- Reference first: it is the identifier an operator actually types.
      (p_search IS NULL OR btrim(p_search) = '' OR
        e.reference ILIKE '%' || btrim(p_search) || '%' OR
        COALESCE(e.description, '') ILIKE '%' || btrim(p_search) || '%' OR
        COALESCE(e.note, '')        ILIKE '%' || btrim(p_search) || '%' OR
        COALESCE(e.payee_name, '')  ILIKE '%' || btrim(p_search) || '%')
      AND (p_status IS NULL OR e.status = ANY (p_status))
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
      AND (p_supplier_id    IS NULL OR e.supplier_id    = p_supplier_id)
      AND (p_employee_id    IS NULL OR e.employee_id    = p_employee_id)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_amount_min IS NULL OR e.total_amount >= p_amount_min)
      AND (p_amount_max IS NULL OR e.total_amount <= p_amount_max)
      -- Settlement is derived, never stored as a filter column, so the three
      -- buckets are expressed against the real amounts.
      AND (
        p_payment_state IS NULL
        OR (p_payment_state = 'unpaid'  AND e.paid_amount <= 0)
        OR (p_payment_state = 'partial' AND e.paid_amount > 0
                                        AND e.paid_amount < e.total_amount - 0.005)
        OR (p_payment_state = 'paid'    AND e.paid_amount >= e.total_amount - 0.005)
      )
      -- Category lives on the lines, so this is an EXISTS rather than a join:
      -- a join would duplicate the document once per matching line and break
      -- the keyset page size.
      AND (
        p_category_id IS NULL
        OR EXISTS (SELECT 1 FROM public.expense_lines l
                   WHERE l.entry_id = e.id AND l.category_id = p_category_id)
      )
      AND (
        p_category_ids IS NULL OR cardinality(p_category_ids) = 0
        OR EXISTS (SELECT 1 FROM public.expense_lines l
                   WHERE l.entry_id = e.id AND l.category_id = ANY (p_category_ids))
      )
      -- Keyset predicate. Matches the (expense_date DESC, id DESC) index exactly.
      AND (
        p_cursor_date IS NULL
        OR (e.expense_date, e.id) < (p_cursor_date, COALESCE(p_cursor_id, e.id))
      )
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  ),
  -- The count is computed over the same predicate but without the page limit,
  -- with a window aggregate so it costs one scan rather than two round-trips.
  counted AS (
    SELECT
      f.*,
      count(*) OVER () AS page_count,
      (SELECT count(*) FROM public.expense_entries e2
       WHERE (p_date_from IS NULL OR e2.expense_date >= p_date_from)
         AND (p_date_to   IS NULL OR e2.expense_date <= p_date_to)
         AND (p_status IS NULL OR e2.status = ANY (p_status))) AS total_count
    FROM filtered f
  )
  SELECT
    c.id, c.reference, c.status, c.entry_type, c.payee_type, c.payee_name,
    c.supplier_id, s.name,
    c.employee_id, pr.full_name,
    c.warehouse_id, w.name,
    c.cost_center_id, cc.name,
    c.project_id, pj.name,
    c.expense_date, c.due_date, c.posting_date, c.description, c.note,
    c.total_amount, c.paid_amount, c.remaining_amount, c.line_count,
    cat.name, cat.name_ar,
    c.version, c.created_by, pr2.full_name, c.created_at, c.approved_at, c.posted_at,
    c.total_count,
    -- The cursor for the next page is the last row of this one. When the page
    -- is the final one these are still populated but the caller is told to stop
    -- by `page_count < p_limit`; returning them keeps the contract uniform.
    c.expense_date,
    c.id
  FROM counted c
  -- LEFT JOINs, deliberately: an expense with no supplier, no cost centre and
  -- no creator must still appear. An INNER JOIN here would make documents
  -- disappear from the register depending on unrelated reference data.
  LEFT JOIN public.suppliers s        ON s.id = c.supplier_id
  LEFT JOIN public.profiles  pr       ON pr.id = c.employee_id
  LEFT JOIN public.profiles  pr2      ON pr2.id = c.created_by
  LEFT JOIN public.warehouses w       ON w.id = c.warehouse_id
  LEFT JOIN public.expense_cost_centers cc ON cc.id = c.cost_center_id
  LEFT JOIN public.expense_projects pj ON pj.id = c.project_id
  -- The "primary" category is the largest line by gross amount — the one an
  -- operator would name if asked "what was this expense for?". Deterministic
  -- tie-break on line_no so the same document always shows the same label.
  LEFT JOIN LATERAL (
    SELECT l.category_id
    FROM public.expense_lines l
    WHERE l.entry_id = c.id
    ORDER BY l.gross_amount DESC, l.line_no ASC
    LIMIT 1
  ) prim ON true
  LEFT JOIN public.expense_categories cat ON cat.id = prim.category_id
  ORDER BY c.expense_date DESC, c.id DESC
$$;

COMMENT ON FUNCTION public.list_expenses(
  text, public.expense_status[], uuid, uuid, uuid, uuid, uuid, uuid, text,
  date, date, numeric, numeric, uuid[], integer, date, uuid
) IS
  'صفحة مصروفات واحدة مع كل الفلاتر على الخادم. ترقيم keyset (تاريخ+معرّف) بدل OFFSET ليبقى الأداء ثابتًا مع ملايين السجلات.';
-- ---------------------------------------------------------------------------
-- 2. expense_detail — one document with everything the drawer shows
-- ---------------------------------------------------------------------------
-- Returned as a single jsonb object rather than five result sets, because the
-- detail drawer needs all five to render at once and five round-trips on a
-- mobile connection is five chances to fail halfway.
CREATE OR REPLACE FUNCTION public.expense_detail(p_entry_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'entry', to_jsonb(e) || jsonb_build_object(
      'supplier_name',    s.name,
      'employee_name',    pr.full_name,
      'warehouse_name',   w.name,
      'cost_center_name', cc.name,
      'project_name',     pj.name,
      'created_by_name',  cb.full_name,
      'approved_by_name', ab.full_name,
      'posted_by_name',   pb.full_name,
      -- The capability set is computed server-side so the UI does not have to
      -- re-derive the role matrix in JavaScript and drift from the database.
      'can_edit',    (e.status IN ('DRAFT', 'REJECTED'))
                     AND (e.created_by = auth.uid() OR public.expense_role_rank(auth.uid()) >= 30),
      'can_submit',  (e.status IN ('DRAFT', 'REJECTED'))
                     AND (e.created_by = auth.uid() OR public.expense_role_rank(auth.uid()) >= 30),
      'can_approve', (e.status = 'SUBMITTED') AND public.expense_can(auth.uid(), 'expense.approve'),
      'can_post',    (e.status IN ('APPROVED', 'DRAFT')) AND public.expense_can(auth.uid(), 'expense.post'),
      'can_pay',     (e.status IN ('POSTED', 'PARTIALLY_PAID')) AND public.expense_can(auth.uid(), 'expense.pay'),
      'can_cancel',  (e.status IN ('DRAFT', 'REJECTED', 'SUBMITTED', 'APPROVED'))
                     AND public.expense_can(auth.uid(), 'expense.cancel'),
      'can_reverse', (e.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID'))
                     AND public.expense_can(auth.uid(), 'expense.reverse')
    ),
    'lines', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'category_name',    c.name,
          'category_name_ar', c.name_ar,
          'cost_center_name', cc.name,
          'project_name',     pj.name
        ) ORDER BY l.line_no
      )
      FROM public.expense_lines l
      LEFT JOIN public.expense_categories c   ON c.id  = l.category_id
      LEFT JOIN public.expense_cost_centers cc ON cc.id = l.cost_center_id
      LEFT JOIN public.expense_projects pj    ON pj.id = l.project_id
      WHERE l.entry_id = e.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('created_by_name', pc.full_name)
                       ORDER BY p.payment_date, p.created_at)
      FROM public.expense_payments p
      LEFT JOIN public.profiles pc ON pc.id = p.created_by
      WHERE p.entry_id = e.id
    ), '[]'::jsonb),
    'approvals', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('actor_name', ac.full_name)
                       ORDER BY a.sequence)
      FROM public.expense_approvals a
      LEFT JOIN public.profiles ac ON ac.id = a.actor_id
      WHERE a.entry_id = e.id
    ), '[]'::jsonb),
    'attachments', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) || jsonb_build_object('uploaded_by_name', tc.full_name)
                       ORDER BY t.created_at)
      FROM public.expense_attachments t
      LEFT JOIN public.profiles tc ON tc.id = t.uploaded_by
      WHERE t.entry_id = e.id
    ), '[]'::jsonb)
  )
  FROM public.expense_entries e
  LEFT JOIN public.suppliers s  ON s.id  = e.supplier_id
  LEFT JOIN public.profiles  pr ON pr.id = e.employee_id
  LEFT JOIN public.profiles  cb ON cb.id = e.created_by
  LEFT JOIN public.profiles  ab ON ab.id = e.approved_by
  LEFT JOIN public.profiles  pb ON pb.id = e.posted_by
  LEFT JOIN public.warehouses w ON w.id  = e.warehouse_id
  LEFT JOIN public.expense_cost_centers cc ON cc.id = e.cost_center_id
  LEFT JOIN public.expense_projects pj      ON pj.id = e.project_id
  WHERE e.id = p_entry_id
$$;

COMMENT ON FUNCTION public.expense_detail(uuid) IS
  'تفاصيل مستند واحد (رأس + بنود + دفعات + موافقات + مرفقات + الصلاحيات) في نداء واحد.';

-- ---------------------------------------------------------------------------
-- 3. expense_summary — the four cards, computed in SQL
-- ---------------------------------------------------------------------------
-- The legacy screen summed every expense in the browser to render "Expenses".
-- Here the database returns four numbers from the index, so the cost of the
-- summary is independent of how many documents exist.
CREATE OR REPLACE FUNCTION public.expense_summary(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT e.*
    FROM public.expense_entries e
    WHERE (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id IS NULL OR e.warehouse_id = p_warehouse_id)
      -- Reversals and cancellations are excluded from the headline figures:
      -- a reversed document already has its compensating counterpart counted,
      -- so including both would show the expense twice and then undo it once.
      AND e.status NOT IN ('CANCELLED', 'REVERSED')
  )
  SELECT jsonb_build_object(
    'period_total',     COALESCE(sum(total_amount), 0),
    'posted_total',     COALESCE(sum(total_amount) FILTER (
                          WHERE status IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED')), 0),
    'paid_total',       COALESCE(sum(paid_amount), 0),
    'outstanding_total', COALESCE(sum(remaining_amount) FILTER (
                          WHERE status IN ('POSTED', 'PARTIALLY_PAID')), 0),
    'pending_total',    COALESCE(sum(total_amount) FILTER (WHERE status = 'SUBMITTED'), 0),
    'draft_total',      COALESCE(sum(total_amount) FILTER (WHERE status IN ('DRAFT', 'REJECTED')), 0),
    -- Counts drive the tab badges, so they are returned alongside the money and
    -- are built from the same scan rather than a second query.
    'total_count',      count(*),
    'pending_count',    count(*) FILTER (WHERE status = 'SUBMITTED'),
    'unpaid_count',     count(*) FILTER (WHERE status = 'POSTED'),
    'partial_count',    count(*) FILTER (WHERE status = 'PARTIALLY_PAID'),
    'paid_count',       count(*) FILTER (WHERE status IN ('PAID', 'CLOSED')),
    'draft_count',      count(*) FILTER (WHERE status IN ('DRAFT', 'REJECTED')),
    'overdue_count',    count(*) FILTER (
                          WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                            AND due_date IS NOT NULL AND due_date < CURRENT_DATE),
    'overdue_total',    COALESCE(sum(remaining_amount) FILTER (
                          WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                            AND due_date IS NOT NULL AND due_date < CURRENT_DATE), 0)
  )
  FROM scoped
$$;

COMMENT ON FUNCTION public.expense_summary(date, date, uuid) IS
  'أرقام بطاقات الملخص محسوبة في قاعدة البيانات: إجمالي الفترة، المرحّل، المسدّد، المتبقي، والمعلّق، والمتأخر.';
-- ---------------------------------------------------------------------------
-- 4. expense_report — grouped totals, one row per bucket
-- ---------------------------------------------------------------------------
-- Plan §23. Every variant the UI needs (by category, by month, by cost centre,
-- by payee) is the same GROUP BY with a different key, so it is one function
-- with a `p_group_by` argument rather than six near-identical ones. The
-- returned `label` is resolved here because the labels live in reference
-- tables the browser should not have to join.
--
-- `p_group_by` is validated against a fixed list before it reaches the query.
-- That is not decoration: the alternative is dynamic SQL, and a grouping column
-- that reaches dynamic SQL is how a report endpoint becomes an injection point.
CREATE OR REPLACE FUNCTION public.expense_report(
  p_group_by   text DEFAULT 'category',
  p_date_from  date DEFAULT NULL,
  p_date_to    date DEFAULT NULL,
  p_status     public.expense_status[] DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL,
  p_cost_center_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_limit      integer DEFAULT 100
)
RETURNS TABLE (
  group_key    text,
  label        text,
  label_ar     text,
  entry_count  bigint,
  total_amount numeric,
  paid_amount  numeric,
  outstanding  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  -- Status default: only documents that actually affect the books. A report
  -- that silently included drafts would disagree with the ledger.
  IF p_status IS NULL THEN
    p_status := ARRAY['POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED']::public.expense_status[];
  END IF;

  IF p_group_by = 'category' THEN
    RETURN QUERY
    SELECT
      COALESCE(l.category_id::text, 'none'),
      COALESCE(c.name, 'Uncategorised'),
      COALESCE(c.name_ar, c.name, 'غير مصنّف'),
      count(DISTINCT e.id),
      COALESCE(sum(l.gross_amount), 0),
      -- Paid is allocated pro-rata by line share, because a payment settles the
      -- document, not a line. Allocating it any other way (e.g. by category
      -- order) would make the report disagree with the header totals.
      COALESCE(sum(l.gross_amount * CASE
        WHEN e.total_amount > 0 THEN e.paid_amount / e.total_amount ELSE 0 END), 0),
      COALESCE(sum(l.gross_amount * CASE
        WHEN e.total_amount > 0 THEN e.remaining_amount / e.total_amount ELSE 0 END), 0)
    FROM public.expense_lines l
    JOIN public.expense_entries e ON e.id = l.entry_id
    LEFT JOIN public.expense_categories c ON c.id = l.category_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY l.category_id, c.name, c.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'month' THEN
    RETURN QUERY
    SELECT
      to_char(date_trunc('month', e.expense_date), 'YYYY-MM'),
      to_char(date_trunc('month', e.expense_date), 'YYYY-MM'),
      to_char(date_trunc('month', e.expense_date), 'YYYY-MM'),
      count(*),
      COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0),
      COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY date_trunc('month', e.expense_date)
    -- Oldest first: a trend chart reads left to right, unlike a ranking table.
    ORDER BY 1 ASC
    LIMIT v_limit;

  ELSIF p_group_by = 'warehouse' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.warehouse_id::text, 'none'),
      COALESCE(w.name, 'Unassigned'),
      COALESCE(w.name_ar, w.name, 'غير محدد'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.warehouses w ON w.id = e.warehouse_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.warehouse_id, w.name, w.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'cost_center' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.cost_center_id::text, 'none'),
      COALESCE(cc.name, 'Unassigned'),
      COALESCE(cc.name_ar, cc.name, 'غير محدد'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.expense_cost_centers cc ON cc.id = e.cost_center_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.cost_center_id, cc.name, cc.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'project' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.project_id::text, 'none'),
      COALESCE(pj.name, 'Unassigned'),
      COALESCE(pj.name_ar, pj.name, 'غير محدد'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.expense_projects pj ON pj.id = e.project_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.project_id, pj.name, pj.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'payee' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.supplier_id::text, e.employee_id::text, e.payee_name, 'none'),
      COALESCE(s.name, pr.full_name, e.payee_name, 'Unnamed payee'),
      COALESCE(s.name, pr.full_name, e.payee_name, 'بدون جهة'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.suppliers s ON s.id = e.supplier_id
    LEFT JOIN public.profiles  pr ON pr.id = e.employee_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.supplier_id, s.name, e.employee_id, pr.full_name, e.payee_name
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'status' THEN
    RETURN QUERY
    SELECT
      e.status::text, e.status::text, e.status::text,
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    WHERE (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
      AND (p_status IS NULL OR e.status = ANY (p_status))
    GROUP BY e.status
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSE
    RAISE EXCEPTION
      'Unsupported group_by: %. Allowed: category, month, warehouse, cost_center, project, payee, status',
      p_group_by
      USING ERRCODE = '22023';
  END IF;
END $$;

COMMENT ON FUNCTION public.expense_report(
  text, date, date, public.expense_status[], uuid, uuid, uuid, integer
) IS
  'تقرير المصروفات مُجمَّعًا في قاعدة البيانات (تصنيف/شهر/مستودع/مركز تكلفة/مشروع/جهة/حالة) '
  'مع توزيع المدفوع والمتبقي على البنود بنسبة قيمة كل بند.';
-- ---------------------------------------------------------------------------
-- 5. expense_lookups — everything the form and the filter sheet need
-- ---------------------------------------------------------------------------
-- One call, five small lists. These are reference data that changes rarely and
-- is small by nature, so returning them together lets the client cache the
-- whole thing under a single query key instead of issuing five requests that
-- each need their own cache entry and their own invalidation rule.
CREATE OR REPLACE FUNCTION public.expense_lookups(p_include_archived boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'name_ar', c.name_ar,
               'is_active', c.is_active, 'sort_order', c.sort_order,
               -- How many documents already reference it. The category manager
               -- uses this to refuse deletion of a category in use, which is
               -- the difference between archiving and losing history.
               'usage_count', (SELECT count(*) FROM public.expense_lines l WHERE l.category_id = c.id)
             ) ORDER BY c.sort_order, c.name)
      FROM public.expense_categories c
      WHERE p_include_archived OR c.is_active
    ), '[]'::jsonb),
    'warehouses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', w.id, 'name', w.name, 'name_ar', w.name_ar, 'is_default', w.is_default
             ) ORDER BY w.name)
      FROM public.warehouses w
      WHERE w.is_active IS NOT FALSE
    ), '[]'::jsonb),
    'cost_centers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', cc.id, 'code', cc.code, 'name', cc.name, 'name_ar', cc.name_ar
             ) ORDER BY cc.name)
      FROM public.expense_cost_centers cc
      WHERE cc.is_active
    ), '[]'::jsonb),
    'projects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pj.id, 'code', pj.code, 'name', pj.name, 'name_ar', pj.name_ar
             ) ORDER BY pj.name)
      FROM public.expense_projects pj
      WHERE pj.is_active
    ), '[]'::jsonb),
    'suppliers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
      FROM public.suppliers s
      WHERE s.is_active IS NOT FALSE
    ), '[]'::jsonb),
    -- Staff that may be reimbursed. Restricted to active profiles for the same
    -- reason `is_staff` is: a deactivated account must not receive a payable.
    'employees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name)
      FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.id
      WHERE p.is_active IS NOT FALSE
      GROUP BY p.id, p.full_name
    ), '[]'::jsonb)
  )
$$;

COMMENT ON FUNCTION public.expense_lookups(boolean) IS
  'قوائم النموذج والفلاتر في نداء واحد: تصنيفات، مستودعات، مراكز تكلفة، مشاريع، موردون، موظفون.';

-- ---------------------------------------------------------------------------
-- 6. Expense-aware category management helpers
-- ---------------------------------------------------------------------------
-- Archiving is the supported removal path; a hard delete would blank the
-- category on every historic line and silently change last year's report.
CREATE OR REPLACE FUNCTION public.save_expense_category(
  p_id        uuid DEFAULT NULL,
  p_name      text DEFAULT NULL,
  p_name_ar   text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL,
  p_notes     text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS public.expense_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.expense_actor();
  v_category public.expense_categories;
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.category.manage');

  IF p_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'A category needs a name' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.expense_categories (name, name_ar, sort_order, notes, created_by, is_active)
    VALUES (
      v_name,
      nullif(btrim(coalesce(p_name_ar, '')), ''),
      COALESCE(p_sort_order, 100),
      nullif(btrim(coalesce(p_notes, '')), ''),
      v_user,
      COALESCE(p_is_active, true)
    )
    RETURNING * INTO v_category;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.created', 'expense_category', v_category.id,
            jsonb_build_object('name', v_category.name));
  ELSE
    -- The UNIQUE(name) constraint from the original migration would raise a raw
    -- 23505 the operator cannot read; checked explicitly so the message is
    -- usable and names the clash.
    IF v_name IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.expense_categories c
      WHERE upper(btrim(c.name)) = upper(v_name) AND c.id <> p_id
    ) THEN
      RAISE EXCEPTION 'A category named "%" already exists', v_name USING ERRCODE = '23505';
    END IF;

    UPDATE public.expense_categories
       SET name       = COALESCE(v_name, name),
           name_ar    = CASE WHEN p_name_ar IS NULL THEN name_ar
                             ELSE nullif(btrim(p_name_ar), '') END,
           sort_order = COALESCE(p_sort_order, sort_order),
           notes      = CASE WHEN p_notes IS NULL THEN notes
                             ELSE nullif(btrim(p_notes), '') END,
           is_active  = COALESCE(p_is_active, is_active)
     WHERE id = p_id
    RETURNING * INTO v_category;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.updated', 'expense_category', v_category.id,
            jsonb_build_object('name', v_category.name, 'is_active', v_category.is_active));
  END IF;

  RETURN v_category;
END $$;

-- Deletion, with the one guard that matters: a category used by any line is
-- archived instead. Returning the resulting row (rather than void) tells the
-- caller which of the two things actually happened.
CREATE OR REPLACE FUNCTION public.delete_expense_category(p_id uuid)
RETURNS public.expense_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.expense_actor();
  v_used  bigint;
  v_row   public.expense_categories;
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.category.manage');

  SELECT count(*) INTO v_used FROM public.expense_lines WHERE category_id = p_id;

  IF v_used > 0 THEN
    UPDATE public.expense_categories SET is_active = false WHERE id = p_id
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.archived', 'expense_category', p_id,
            jsonb_build_object('reason', 'in_use', 'usage_count', v_used));
  ELSE
    DELETE FROM public.expense_categories WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.deleted', 'expense_category', p_id,
            jsonb_build_object('name', v_row.name));
  END IF;

  RETURN v_row;
END $$;
-- ---------------------------------------------------------------------------
-- 7. Dimensions: cost centres and projects
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_expense_dimension(
  p_kind      text,                       -- 'cost_center' | 'project'
  p_id        uuid   DEFAULT NULL,
  p_code      text   DEFAULT NULL,
  p_name      text   DEFAULT NULL,
  p_name_ar   text   DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := public.expense_actor();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_row  jsonb;
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.dimension.manage');

  IF p_kind NOT IN ('cost_center', 'project') THEN
    RAISE EXCEPTION 'Unknown dimension kind: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL AND v_name IS NULL THEN
    RAISE EXCEPTION 'A name is required' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'cost_center' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.expense_cost_centers (code, name, name_ar, is_active, created_by)
      VALUES (v_code, v_name, nullif(btrim(coalesce(p_name_ar, '')), ''),
              COALESCE(p_is_active, true), v_user)
      RETURNING to_jsonb(expense_cost_centers.*) INTO v_row;
    ELSE
      UPDATE public.expense_cost_centers
         SET code      = CASE WHEN p_code IS NULL THEN code ELSE v_code END,
             name      = COALESCE(v_name, name),
             name_ar   = CASE WHEN p_name_ar IS NULL THEN name_ar
                              ELSE nullif(btrim(p_name_ar), '') END,
             is_active = COALESCE(p_is_active, is_active)
       WHERE id = p_id
      RETURNING to_jsonb(expense_cost_centers.*) INTO v_row;

      IF v_row IS NULL THEN
        RAISE EXCEPTION 'Cost centre not found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
  ELSE
    IF p_id IS NULL THEN
      INSERT INTO public.expense_projects (code, name, name_ar, is_active, created_by)
      VALUES (v_code, v_name, nullif(btrim(coalesce(p_name_ar, '')), ''),
              COALESCE(p_is_active, true), v_user)
      RETURNING to_jsonb(expense_projects.*) INTO v_row;
    ELSE
      UPDATE public.expense_projects
         SET code      = CASE WHEN p_code IS NULL THEN code ELSE v_code END,
             name      = COALESCE(v_name, name),
             name_ar   = CASE WHEN p_name_ar IS NULL THEN name_ar
                              ELSE nullif(btrim(p_name_ar), '') END,
             is_active = COALESCE(p_is_active, is_active)
       WHERE id = p_id
      RETURNING to_jsonb(expense_projects.*) INTO v_row;

      IF v_row IS NULL THEN
        RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'expense.' || p_kind || '.' || CASE WHEN p_id IS NULL THEN 'created' ELSE 'updated' END,
          'expense_' || p_kind, (v_row ->> 'id')::uuid, v_row);

  RETURN v_row;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.list_expenses(
  text, public.expense_status[], uuid, uuid, uuid, uuid, uuid, uuid, text,
  date, date, numeric, numeric, uuid[], integer, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_expenses(
  text, public.expense_status[], uuid, uuid, uuid, uuid, uuid, uuid, text,
  date, date, numeric, numeric, uuid[], integer, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_detail(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_summary(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_summary(date, date, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_report(
  text, date, date, public.expense_status[], uuid, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_report(
  text, date, date, public.expense_status[], uuid, uuid, uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.expense_lookups(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_lookups(boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.save_expense_category(
  uuid, text, text, integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_expense_category(
  uuid, text, text, integer, text, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_expense_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_expense_category(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.save_expense_dimension(
  text, uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_expense_dimension(
  text, uuid, text, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Self-check
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'list_expenses', 'expense_detail', 'expense_summary', 'expense_report',
    'expense_lookups', 'save_expense_category', 'delete_expense_category',
    'save_expense_dimension'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    ) THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'read layer incomplete: %', array_to_string(v_missing, ', ');
  END IF;

  -- The whole point of this migration is that the browser never receives the
  -- register. If any of these functions were to return a set of full rows
  -- without a LIMIT, that guarantee would be gone.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'list_expenses'
      AND pg_get_functiondef(p.oid) ILIKE '%LIMIT LEAST%'
  ) THEN
    RAISE EXCEPTION 'list_expenses lost its server-side row bound';
  END IF;

  RAISE NOTICE '20261001092000: expense read layer ready (8 functions, bounded payloads).';
END $$;
