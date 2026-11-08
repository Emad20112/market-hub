/**
 * مستودع التقارير — المرحلة 12 (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج دوال القراءة الأصلية حرفيًا: list_expenses/expense_detail/
 * expense_summary/expense_report/expense_lookups (010)، get_supplier_statement
 * (004)، get_chart_of_accounts_tree (009)، milling_service_cost_report (012)،
 * backup_export_all/backup_restore_all/backup_schema_fingerprint (002).
 *
 * دلالات التنفيذ: الدوال الأصلية كانت invoker (RLS مطبق) أو SECURITY DEFINER.
 * المكافئ هنا: المعاملة تُضبط بـ SET LOCAL role = authenticated + claims
 * للمسارات invoker، وservice_role للـ SECURITY DEFINER مع فحص صلاحيات صريح —
 * نفس دلالات الأمان القديمة (DECISIONS-LOG).
 */
import type { PoolClient } from "pg";

/** quote_ident آمن: أسماء الجداول تأتي من information_schema فقط. */
function qi(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid table identifier: ${name}`);
  }
  return `"${name}"`;
}

// ── الصلاحيات ──────────────────────────────────────────────────────────────

export async function canReadFinanceAuthed(tx: PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT (public.is_staff(auth.uid()) AND public.expense_role_rank(auth.uid()) >= 30) AS ok`,
  );
  return rows[0]?.ok === true;
}

/** expense_can(auth.uid(), capability) — تبقى في القاعدة حتى المرحلة 13. */
export async function expenseCanAuthed(tx: PoolClient, capability: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT coalesce(public.expense_can(auth.uid(), $1), false) AS ok",
    [capability],
  );
  return rows[0]?.ok === true;
}

// ── المصاريف: القائمة (010 list_expenses حرفيًا) ───────────────────────────

export interface ExpenseListArgs {
  search: string | null;
  status: string[] | null;
  categoryId: string | null;
  warehouseId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  supplierId: string | null;
  employeeId: string | null;
  paymentState: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  amountMin: number | null;
  amountMax: number | null;
  categoryIds: string[] | null;
  limit: number;
  cursorDate: string | null;
  cursorId: string | null;
}

export async function listExpenses(
  tx: PoolClient,
  a: ExpenseListArgs,
): Promise<Record<string, unknown>[]> {
  const { rows } = await tx.query(
    `WITH all_matching AS (
      SELECT
        e.id, e.reference, e.status, e.entry_type, e.payee_type, e.payee_name,
        e.supplier_id, e.employee_id, e.warehouse_id, e.cost_center_id, e.project_id,
        e.expense_date, e.due_date, e.posting_date, e.description, e.note,
        e.total_amount, e.paid_amount, e.remaining_amount, e.line_count,
        e.version, e.created_by, e.created_at, e.approved_at, e.posted_at,
        count(*) OVER () AS full_count
      FROM public.expense_entries e
      WHERE
        ($1::text IS NULL OR btrim($1::text) = '' OR
          e.reference ILIKE '%' || btrim($1::text) || '%' OR
          COALESCE(e.description, '') ILIKE '%' || btrim($1::text) || '%' OR
          COALESCE(e.note, '')        ILIKE '%' || btrim($1::text) || '%' OR
          COALESCE(e.payee_name, '')  ILIKE '%' || btrim($1::text) || '%')
        AND ($2::public.expense_status[] IS NULL OR e.status = ANY ($2::public.expense_status[]))
        AND ($4::uuid IS NULL OR e.warehouse_id   = $4::uuid)
        AND ($5::uuid IS NULL OR e.cost_center_id = $5::uuid)
        AND ($6::uuid IS NULL OR e.project_id     = $6::uuid)
        AND ($7::uuid IS NULL OR e.supplier_id    = $7::uuid)
        AND ($8::uuid IS NULL OR e.employee_id    = $8::uuid)
        AND ($10::date IS NULL OR e.expense_date >= $10::date)
        AND ($11::date IS NULL OR e.expense_date <= $11::date)
        AND ($12::numeric IS NULL OR e.total_amount >= $12::numeric)
        AND ($13::numeric IS NULL OR e.total_amount <= $13::numeric)
        AND (
          $9::text IS NULL
          OR ($9::text = 'unpaid'  AND e.paid_amount <= 0)
          OR ($9::text = 'partial' AND e.paid_amount > 0
                                   AND e.paid_amount < e.total_amount - 0.005)
          OR ($9::text = 'paid'    AND e.paid_amount >= e.total_amount - 0.005)
        )
        AND (
          $3::uuid IS NULL
          OR EXISTS (SELECT 1 FROM public.expense_lines l
                     WHERE l.entry_id = e.id AND l.category_id = $3::uuid)
        )
        AND (
          $14::uuid[] IS NULL OR cardinality($14::uuid[]) = 0
          OR EXISTS (SELECT 1 FROM public.expense_lines l
                     WHERE l.entry_id = e.id AND l.category_id = ANY ($14::uuid[]))
        )
    ),
    paged AS (
      SELECT *
      FROM all_matching m
      WHERE (
        $16::date IS NULL
        OR (m.expense_date, m.id) < ($16::date, COALESCE($17::uuid, m.id))
      )
      ORDER BY m.expense_date DESC, m.id DESC
      LIMIT LEAST(GREATEST(COALESCE($15::int, 50), 1), 200)
    )
    SELECT
      c.id::text AS id, c.reference, c.status::text AS status, c.entry_type::text AS entry_type,
      c.payee_type::text AS payee_type, c.payee_name,
      c.supplier_id::text AS supplier_id, s.name AS supplier_name,
      c.employee_id::text AS employee_id, pr.full_name AS employee_name,
      c.warehouse_id::text AS warehouse_id, w.name AS warehouse_name,
      c.cost_center_id::text AS cost_center_id, cc.name AS cost_center_name,
      c.project_id::text AS project_id, pj.name AS project_name,
      c.expense_date::text AS expense_date, c.due_date::text AS due_date,
      c.posting_date::text AS posting_date, c.description, c.note,
      c.total_amount::text AS total_amount, c.paid_amount::text AS paid_amount,
      c.remaining_amount::text AS remaining_amount, c.line_count,
      cat.name AS primary_category, cat.name_ar AS primary_category_ar,
      c.version, c.created_by::text AS created_by, pr2.full_name AS created_by_name,
      c.created_at, c.approved_at, c.posted_at,
      COALESCE(c.full_count, 0)::text AS total_count,
      c.expense_date::text AS next_cursor_date,
      c.id::text AS next_cursor_id
    FROM paged c
    LEFT JOIN public.suppliers s        ON s.id = c.supplier_id
    LEFT JOIN public.profiles  pr       ON pr.id = c.employee_id
    LEFT JOIN public.profiles  pr2      ON pr2.id = c.created_by
    LEFT JOIN public.warehouses w       ON w.id = c.warehouse_id
    LEFT JOIN public.expense_cost_centers cc ON cc.id = c.cost_center_id
    LEFT JOIN public.expense_projects pj ON pj.id = c.project_id
    LEFT JOIN LATERAL (
      SELECT l.category_id
      FROM public.expense_lines l
      WHERE l.entry_id = c.id
      ORDER BY l.gross_amount DESC, l.line_no ASC
      LIMIT 1
    ) prim ON true
    LEFT JOIN public.expense_categories cat ON cat.id = prim.category_id
    ORDER BY c.expense_date DESC, c.id DESC`,
    [
      a.search,
      a.status,
      a.categoryId,
      a.warehouseId,
      a.costCenterId,
      a.projectId,
      a.supplierId,
      a.employeeId,
      a.paymentState,
      a.dateFrom,
      a.dateTo,
      a.amountMin,
      a.amountMax,
      a.categoryIds,
      a.limit,
      a.cursorDate,
      a.cursorId,
    ],
  );
  return rows as Record<string, unknown>[];
}

// ── تفاصيل المصروف (010 expense_detail حرفيًا — jsonb واحد) ────────────────

export async function expenseDetail(tx: PoolClient, entryId: string): Promise<unknown> {
  const { rows } = await tx.query<{ d: unknown }>(
    `SELECT public_json AS d FROM (
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
           'can_edit',    (e.status IN ('DRAFT','REJECTED'))
                          AND (e.created_by = auth.uid() OR public.expense_role_rank(auth.uid()) >= 30),
           'can_submit',  (e.status IN ('DRAFT','REJECTED'))
                          AND (e.created_by = auth.uid() OR public.expense_role_rank(auth.uid()) >= 30),
           'can_approve', (e.status = 'SUBMITTED') AND public.expense_can(auth.uid(), 'expense.approve'),
           'can_post',    (e.status IN ('APPROVED','DRAFT')) AND public.expense_can(auth.uid(), 'expense.post'),
           'can_pay',     (e.status IN ('POSTED','PARTIALLY_PAID')) AND public.expense_can(auth.uid(), 'expense.pay'),
           'can_cancel',  (e.status IN ('DRAFT','REJECTED','SUBMITTED','APPROVED'))
                          AND public.expense_can(auth.uid(), 'expense.cancel'),
           'can_reverse', (e.status IN ('POSTED','PARTIALLY_PAID','PAID'))
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
       ) AS public_json
       FROM public.expense_entries e
       LEFT JOIN public.suppliers s  ON s.id  = e.supplier_id
       LEFT JOIN public.profiles  pr ON pr.id = e.employee_id
       LEFT JOIN public.profiles  cb ON cb.id = e.created_by
       LEFT JOIN public.profiles  ab ON ab.id = e.approved_by
       LEFT JOIN public.profiles  pb ON pb.id = e.posted_by
       LEFT JOIN public.warehouses w ON w.id  = e.warehouse_id
       LEFT JOIN public.expense_cost_centers cc ON cc.id = e.cost_center_id
       LEFT JOIN public.expense_projects pj      ON pj.id = e.project_id
       WHERE e.id = $1::uuid
     ) t`,
    [entryId],
  );
  return rows[0]?.d ?? null;
}

// ── ملخص المصاريف (010 expense_summary حرفيًا) ─────────────────────────────

export async function expenseSummary(
  tx: PoolClient,
  args: { dateFrom: string | null; dateTo: string | null; warehouseId: string | null },
): Promise<unknown> {
  const { rows } = await tx.query<{ d: unknown }>(
    `WITH scoped AS (
       SELECT e.*
       FROM public.expense_entries e
       WHERE ($1::date IS NULL OR e.expense_date >= $1::date)
         AND ($2::date IS NULL OR e.expense_date <= $2::date)
         AND ($3::uuid IS NULL OR e.warehouse_id = $3::uuid)
         AND e.status NOT IN ('CANCELLED', 'REVERSED')
     )
     SELECT jsonb_build_object(
       'period_total',      COALESCE(sum(total_amount), 0),
       'posted_total',      COALESCE(sum(total_amount) FILTER (
                              WHERE status IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED')), 0),
       'paid_total',        COALESCE(sum(paid_amount), 0),
       'outstanding_total', COALESCE(sum(remaining_amount) FILTER (
                              WHERE status IN ('POSTED', 'PARTIALLY_PAID') AND remaining_amount > 0.005), 0),
       'pending_total',     COALESCE(sum(total_amount) FILTER (WHERE status = 'SUBMITTED'), 0),
       'draft_total',       COALESCE(sum(total_amount) FILTER (WHERE status IN ('DRAFT', 'REJECTED')), 0),
       'total_count',       count(*),
       'pending_count',     count(*) FILTER (WHERE status = 'SUBMITTED'),
       'unpaid_count',      count(*) FILTER (WHERE status = 'POSTED'),
       'partial_count',     count(*) FILTER (WHERE status = 'PARTIALLY_PAID'),
       'paid_count',        count(*) FILTER (WHERE status IN ('PAID', 'CLOSED')),
       'draft_count',       count(*) FILTER (WHERE status IN ('DRAFT', 'REJECTED')),
       'overdue_count',     count(*) FILTER (
                              WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                                AND due_date IS NOT NULL
                                AND due_date < CURRENT_DATE
                                AND remaining_amount > 0.005),
       'overdue_total',     COALESCE(sum(remaining_amount) FILTER (
                              WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                                AND due_date IS NOT NULL
                                AND due_date < CURRENT_DATE
                                AND remaining_amount > 0.005), 0)
     ) AS d
     FROM scoped`,
    [args.dateFrom, args.dateTo, args.warehouseId],
  );
  return rows[0]?.d ?? null;
}

// ── تقرير المصاريف (010 expense_report حرفيًا — 7 مجموعات) ─────────────────

const REPORT_FILTER = `($4::date IS NULL OR e.expense_date >= $4::date)
       AND ($5::date IS NULL OR e.expense_date <= $5::date)
       AND ($6::uuid IS NULL OR e.warehouse_id   = $6::uuid)
       AND ($7::uuid IS NULL OR e.cost_center_id = $7::uuid)
       AND ($8::uuid IS NULL OR e.project_id     = $8::uuid)`;

export async function expenseReport(
  tx: PoolClient,
  a: {
    groupBy: string;
    dateFrom: string | null;
    dateTo: string | null;
    warehouseId: string | null;
    costCenterId: string | null;
    projectId: string | null;
    limit: number;
  },
): Promise<Record<string, unknown>[]> {
  const limit = Math.min(Math.max(a.limit ?? 100, 1), 500);
  const statuses = ["POSTED", "PARTIALLY_PAID", "PAID", "CLOSED"];
  const params = [
    statuses,
    a.dateFrom,
    a.dateTo,
    a.warehouseId,
    a.costCenterId,
    a.projectId,
    limit,
  ];
  // $1 status[], $2 from, $3 to, $4..6 dims, $7 limit (انظر كل فرع).
  const p = ["$2", "$3", "$4", "$5", "$6", "$7"];
  const f = `($2::date IS NULL OR e.expense_date >= $2::date)
       AND ($3::date IS NULL OR e.expense_date <= $3::date)
       AND ($4::uuid IS NULL OR e.warehouse_id   = $4::uuid)
       AND ($5::uuid IS NULL OR e.cost_center_id = $5::uuid)
       AND ($6::uuid IS NULL OR e.project_id     = $6::uuid)`;
  void params;
  void REPORT_FILTER;
  void p;

  let sql: string;
  switch (a.groupBy) {
    case "category":
      sql = `SELECT
        COALESCE(l.category_id::text, 'none') AS group_key,
        COALESCE(c.name, 'Uncategorised') AS label,
        COALESCE(c.name_ar, c.name, 'غير مصنّف') AS label_ar,
        count(DISTINCT e.id)::text AS entry_count,
        COALESCE(sum(l.gross_amount), 0)::text AS total_amount,
        COALESCE(sum(l.gross_amount * CASE
          WHEN e.total_amount > 0 THEN e.paid_amount / e.total_amount ELSE 0 END), 0)::text AS paid_amount,
        COALESCE(sum(l.gross_amount * CASE
          WHEN e.total_amount > 0 THEN e.remaining_amount / e.total_amount ELSE 0 END), 0)::text AS outstanding
      FROM public.expense_lines l
      JOIN public.expense_entries e ON e.id = l.entry_id
      LEFT JOIN public.expense_categories c ON c.id = l.category_id
      WHERE e.status::text = ANY ($1::text[])
        AND ${f}
      GROUP BY l.category_id, c.name, c.name_ar
      ORDER BY 5 DESC
      LIMIT $7::int`;
      break;
    case "month":
      sql = `SELECT
        to_char(date_trunc('month', e.expense_date), 'YYYY-MM') AS group_key,
        to_char(date_trunc('month', e.expense_date), 'YYYY-MM') AS label,
        to_char(date_trunc('month', e.expense_date), 'YYYY-MM') AS label_ar,
        count(*)::text AS entry_count,
        COALESCE(sum(e.total_amount), 0)::text AS total_amount,
        COALESCE(sum(e.paid_amount), 0)::text AS paid_amount,
        COALESCE(sum(e.remaining_amount), 0)::text AS outstanding
      FROM public.expense_entries e
      WHERE e.status::text = ANY ($1::text[])
        AND ${f}
      GROUP BY date_trunc('month', e.expense_date)
      ORDER BY 1 ASC
      LIMIT $7::int`;
      break;
    case "warehouse":
      sql = `SELECT
        COALESCE(e.warehouse_id::text, 'none') AS group_key,
        COALESCE(w.name, 'Unassigned') AS label,
        COALESCE(w.name_ar, w.name, 'غير محدد') AS label_ar,
        count(*)::text AS entry_count,
        COALESCE(sum(e.total_amount), 0)::text AS total_amount,
        COALESCE(sum(e.paid_amount), 0)::text AS paid_amount,
        COALESCE(sum(e.remaining_amount), 0)::text AS outstanding
      FROM public.expense_entries e
      LEFT JOIN public.warehouses w ON w.id = e.warehouse_id
      WHERE e.status::text = ANY ($1::text[])
        AND ${f}
      GROUP BY e.warehouse_id, w.name, w.name_ar
      ORDER BY 5 DESC
      LIMIT $7::int`;
      break;
    case "cost_center":
      sql = `SELECT
        COALESCE(e.cost_center_id::text, 'none') AS group_key,
        COALESCE(cc.name, 'Unassigned') AS label,
        COALESCE(cc.name_ar, cc.name, 'غير محدد') AS label_ar,
        count(*)::text AS entry_count,
        COALESCE(sum(e.total_amount), 0)::text AS total_amount,
        COALESCE(sum(e.paid_amount), 0)::text AS paid_amount,
        COALESCE(sum(e.remaining_amount), 0)::text AS outstanding
      FROM public.expense_entries e
      LEFT JOIN public.expense_cost_centers cc ON cc.id = e.cost_center_id
      WHERE e.status::text = ANY ($1::text[])
        AND ${f}
      GROUP BY e.cost_center_id, cc.name, cc.name_ar
      ORDER BY 5 DESC
      LIMIT $7::int`;
      break;
    case "project":
      sql = `SELECT
        COALESCE(e.project_id::text, 'none') AS group_key,
        COALESCE(pj.name, 'Unassigned') AS label,
        COALESCE(pj.name_ar, pj.name, 'غير محدد') AS label_ar,
        count(*)::text AS entry_count,
        COALESCE(sum(e.total_amount), 0)::text AS total_amount,
        COALESCE(sum(e.paid_amount), 0)::text AS paid_amount,
        COALESCE(sum(e.remaining_amount), 0)::text AS outstanding
      FROM public.expense_entries e
      LEFT JOIN public.expense_projects pj ON pj.id = e.project_id
      WHERE e.status::text = ANY ($1::text[])
        AND ${f}
      GROUP BY e.project_id, pj.name, pj.name_ar
      ORDER BY 5 DESC
      LIMIT $7::int`;
      break;
    case "payee":
      sql = `SELECT
        COALESCE(e.supplier_id::text, e.employee_id::text, e.payee_name, 'none') AS group_key,
        COALESCE(s.name, pr.full_name, e.payee_name, 'Unnamed payee') AS label,
        COALESCE(s.name, pr.full_name, e.payee_name, 'بدون جهة') AS label_ar,
        count(*)::text AS entry_count,
        COALESCE(sum(e.total_amount), 0)::text AS total_amount,
        COALESCE(sum(e.paid_amount), 0)::text AS paid_amount,
        COALESCE(sum(e.remaining_amount), 0)::text AS outstanding
      FROM public.expense_entries e
      LEFT JOIN public.suppliers s ON s.id = e.supplier_id
      LEFT JOIN public.profiles  pr ON pr.id = e.employee_id
      WHERE e.status::text = ANY ($1::text[])
        AND ${f}
      GROUP BY e.supplier_id, s.name, e.employee_id, pr.full_name, e.payee_name
      ORDER BY 5 DESC
      LIMIT $7::int`;
      break;
    case "status":
      sql = `SELECT
        e.status::text AS group_key, e.status::text AS label, e.status::text AS label_ar,
        count(*)::text AS entry_count,
        COALESCE(sum(e.total_amount), 0)::text AS total_amount,
        COALESCE(sum(e.paid_amount), 0)::text AS paid_amount,
        COALESCE(sum(e.remaining_amount), 0)::text AS outstanding
      FROM public.expense_entries e
      WHERE ${f}
        AND ($1::text[] IS NULL OR e.status::text = ANY ($1::text[]))
      GROUP BY e.status
      ORDER BY 5 DESC
      LIMIT $7::int`;
      break;
    default:
      throw new Error(`Unknown group_by: ${a.groupBy}`);
  }
  const { rows } = await tx.query(sql, params);
  return rows as Record<string, unknown>[];
}

// ── مراجع نموذج المصروف (010 expense_lookups حرفيًا) ───────────────────────

export async function expenseLookups(tx: PoolClient, includeArchived: boolean): Promise<unknown> {
  const { rows } = await tx.query<{ d: unknown }>(
    `SELECT jsonb_build_object(
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', c.id, 'name', c.name, 'name_ar', c.name_ar,
                 'is_active', c.is_active, 'sort_order', c.sort_order,
                 'usage_count', (SELECT count(*) FROM public.expense_lines l WHERE l.category_id = c.id),
                 'account_id', c.account_id, 'account_code', a.code, 'account_name_ar', a.name_ar
               ) ORDER BY c.sort_order, c.name)
        FROM public.expense_categories c
        LEFT JOIN public.accounts a ON a.id = c.account_id
        WHERE $1 OR c.is_active
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
      'employees', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name)
        FROM public.profiles p
        WHERE p.is_active IS NOT FALSE
          AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
          AND NOT EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = p.id)
          AND p.full_name NOT ILIKE '%سوبر%'
          AND p.full_name NOT ILIKE '%superadmin%'
      ), '[]'::jsonb),
      'financial_accounts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'code', a.code, 'name_ar', a.name_ar,
                 'account_type', a.account_type, 'requires_reconciliation', a.requires_reconciliation
               ) ORDER BY a.code)
        FROM public.accounts a
        WHERE a.is_active IS NOT FALSE
          AND (a.requires_reconciliation IS TRUE OR a.code LIKE '11%')
      ), '[]'::jsonb)
    ) AS d`,
    [includeArchived],
  );
  return rows[0]?.d ?? null;
}

// ── تقرير تكلفة خدمة الطحن (012 milling_service_cost_report حرفيًا) ─────────

export async function millingServiceCostReport(
  tx: PoolClient,
  a: { dateFrom: string | null; dateTo: string | null; costCenterId: string | null },
): Promise<Record<string, unknown> | null> {
  // الحارس الأصلي: expense_assert_capability('expense.report').
  const ok = await expenseCanAuthed(tx, "expense.report");
  if (!ok) throw new Error("This expense capability is not granted to your role");
  if (a.dateFrom && a.dateTo && a.dateFrom > a.dateTo) {
    throw new Error("The report start date must not be after its end date");
  }
  const { rows } = await tx.query(
    `WITH center AS (
       SELECT cc.id::text AS id, coalesce(cc.name_ar, cc.name) AS label
         FROM public.expense_cost_centers cc
        WHERE cc.id = $3::uuid AND cc.is_active
     ), expense_totals AS (
       SELECT coalesce(sum(l.net_amount + CASE WHEN e.tax_recoverable THEN 0 ELSE l.tax_amount END), 0)::text AS amount,
              count(DISTINCT e.id)::text AS document_count
         FROM public.expense_lines l
         JOIN public.expense_entries e ON e.id = l.entry_id
        WHERE coalesce(l.cost_center_id, e.cost_center_id) = $3::uuid
          AND e.status = ANY (ARRAY['POSTED','PARTIALLY_PAID','PAID','CLOSED']::public.expense_status[])
          AND ($1::date IS NULL OR e.expense_date >= $1::date)
          AND ($2::date IS NULL OR e.expense_date <= $2::date)
     ), milling AS (
       SELECT coalesce(sum(cl.bags_out), 0)::text AS bags,
              coalesce(sum(cl.kg_out), 0)::text AS kg
         FROM public.custody_ledger cl
        WHERE cl.entry_type = 'MILLING'
          AND (cl.bags_out > 0 OR cl.kg_out > 0)
          AND ($1::date IS NULL OR cl.created_at::date >= $1::date)
          AND ($2::date IS NULL OR cl.created_at::date <= $2::date)
     ), estimates AS (
       SELECT coalesce(sum(d.estimated_cost_amount), 0)::text AS amount,
              coalesce(sum(CASE WHEN d.estimated_cost_basis = 'BAG'
                                THEN d.estimated_cost_amount ELSE 0 END), 0)::text AS bag_amount,
              coalesce(sum(CASE WHEN d.estimated_cost_basis = 'KG'
                                THEN d.estimated_cost_amount ELSE 0 END), 0)::text AS kg_amount,
              coalesce(sum(CASE WHEN d.estimated_cost_basis = 'BAG'
                                THEN d.estimated_cost_quantity ELSE 0 END), 0)::text AS bags,
              coalesce(sum(CASE WHEN d.estimated_cost_basis = 'KG'
                                THEN d.estimated_cost_quantity ELSE 0 END), 0)::text AS kg
         FROM public.milling_service_documents d
        WHERE d.estimated_cost_amount IS NOT NULL
          AND ($1::date IS NULL OR d.received_at::date >= $1::date)
          AND ($2::date IS NULL OR d.received_at::date <= $2::date)
     ), completed AS (
       SELECT coalesce(sum(si.total), 0)::text AS revenue,
              count(*)::text AS document_count
         FROM public.milling_service_documents d
         JOIN public.sales_invoices si ON si.id = d.sales_invoice_id
        WHERE d.status = 'DELIVERED'
          AND d.delivered_at IS NOT NULL
          AND ($1::date IS NULL OR d.delivered_at::date >= $1::date)
          AND ($2::date IS NULL OR d.delivered_at::date <= $2::date)
     )
     SELECT center.id, center.label,
            expense_totals.amount, expense_totals.document_count,
            milling.bags, milling.kg,
            estimates.amount, estimates.bags, estimates.kg,
            completed.revenue, completed.document_count,
            CASE WHEN milling.bags::numeric > 0
                 THEN round(expense_totals.amount::numeric / milling.bags::numeric, 4)::text END AS actual_cost_per_bag,
            CASE WHEN milling.kg::numeric > 0
                 THEN round(expense_totals.amount::numeric / milling.kg::numeric, 4)::text END AS actual_cost_per_kg,
            CASE WHEN estimates.bags::numeric > 0
                 THEN round(estimates.bag_amount::numeric / estimates.bags::numeric, 4)::text END AS estimated_cost_per_bag,
            CASE WHEN estimates.kg::numeric > 0
                 THEN round(estimates.kg_amount::numeric / estimates.kg::numeric, 4)::text END AS estimated_cost_per_kg,
            (completed.revenue::numeric - expense_totals.amount::numeric)::text AS service_contribution_after_allocated_cost
       FROM center CROSS JOIN expense_totals CROSS JOIN milling CROSS JOIN estimates CROSS JOIN completed`,
    [a.dateFrom, a.dateTo, a.costCenterId],
  );
  return (rows[0] as Record<string, unknown>) ?? null;
}

// ── كشف حساب المورد (004 get_supplier_statement حرفيًا) ────────────────────

export async function supplierStatement(
  tx: PoolClient,
  a: { supplierId: string; startDate: string | null; endDate: string | null },
): Promise<Record<string, unknown>[]> {
  const { rows } = await tx.query(
    `WITH ordered_entries AS (
       SELECT sl.id::text AS id, sl.occurred_at, sl.entry_type::text AS entry_type,
         sl.debit::text AS debit, sl.credit::text AS credit,
         SUM(sl.credit - sl.debit) OVER (ORDER BY sl.occurred_at ASC, sl.id ASC)::text AS running_balance,
         sl.reference_type, sl.reference_id::text AS reference_id,
         sl.due_date::text AS due_date, sl.note
       FROM public.supplier_ledger sl
       WHERE sl.supplier_id = $1::uuid
     )
     SELECT oe.* FROM ordered_entries oe
     WHERE ($2::timestamptz IS NULL OR oe.occurred_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR oe.occurred_at <= $3::timestamptz)
     ORDER BY oe.occurred_at DESC, oe.id DESC`,
    [a.supplierId, a.startDate, a.endDate],
  );
  return rows as Record<string, unknown>[];
}

// ── شجرة دليل الحسابات (009 get_chart_of_accounts_tree حرفيًا) ─────────────

export async function chartOfAccountsTree(tx: PoolClient): Promise<Record<string, unknown>[]> {
  const { rows } = await tx.query(
    `WITH RECURSIVE coa_tree AS (
      SELECT
        a.id::text AS id, a.code, a.name_ar, a.account_type::text AS account_type,
        a.parent_id::text AS parent_id,
        CAST(NULL AS varchar(20)) AS parent_code,
        1 AS level, a.is_postable, a.is_system, a.is_active, a.notes,
        ARRAY[a.code::text] AS path
      FROM public.accounts a
      WHERE a.parent_id IS NULL
      UNION ALL
      SELECT
        c.id::text, c.code, c.name_ar, c.account_type::text, c.parent_id::text,
        p.code AS parent_code, p.level + 1, c.is_postable, c.is_system, c.is_active,
        c.notes, p.path || c.code::text
      FROM public.accounts c
      JOIN coa_tree p ON c.parent_id = p.id
    ),
    account_balances AS (
      SELECT jl.account_id,
             round(coalesce(sum(jl.debit), 0), 2) AS debit,
             round(coalesce(sum(jl.credit), 0), 2) AS credit
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.entry_id AND je.status = 'POSTED'
      GROUP BY jl.account_id
    ),
    children_counts AS (
      SELECT parent_id, count(*) AS cnt
      FROM public.accounts
      WHERE parent_id IS NOT NULL
      GROUP BY parent_id
    )
    SELECT
      t.id, t.code, t.name_ar, t.account_type, t.parent_id, t.parent_code, t.level,
      t.is_postable, t.is_system, t.is_active, t.notes,
      coalesce(ab.debit, 0)::text AS total_debit,
      coalesce(ab.credit, 0)::text AS total_credit,
      CASE
        WHEN t.account_type::text IN ('ASSET', 'EXPENSE') THEN
          round(coalesce(ab.debit, 0) - coalesce(ab.credit, 0), 2)::text
        ELSE
          round(coalesce(ab.credit, 0) - coalesce(ab.debit, 0), 2)::text
      END AS current_balance,
      coalesce(cc.cnt, 0)::text AS children_count
    FROM coa_tree t
    LEFT JOIN account_balances ab ON ab.account_id = t.id::uuid
    LEFT JOIN children_counts cc ON cc.parent_id = t.id::uuid
    ORDER BY t.code ASC`,
  );
  return rows as Record<string, unknown>[];
}

// ── النسخ الاحتياطي (002 حرفيًا) ───────────────────────────────────────────

export async function backupSchemaFingerprint(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ fp: string }>(
    `SELECT encode(sha256(
       convert_to(
         coalesce(string_agg(
         t.table_name || '(' ||
         (
           SELECT string_agg(c.column_name || ':' || c.data_type, ',' ORDER BY c.ordinal_position)
           FROM information_schema.columns c
           WHERE c.table_schema = 'public' AND c.table_name = t.table_name
         ) || ')'
       , '|' ORDER BY t.table_name), ''), 'UTF8')
     ), 'hex') AS fp
     FROM information_schema.tables t
     WHERE t.table_schema = 'public'
       AND t.table_type = 'BASE TABLE'`,
  );
  return rows[0]?.fp ?? "";
}

const CAPPED_LOG_TABLES = new Set(["audit_logs", "backup_logs", "idempotency_keys"]);

/** backup_export_all حرفيًا: كل جداول public الأساسية ديناميكيًا. */
export async function backupExportAll(tx: PoolClient, maxLogRows: number): Promise<unknown> {
  const { rows: tables } = await tx.query<{ table_name: string }>(
    `SELECT t.table_name FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name`,
  );

  const payload: Record<string, unknown[]> = {};
  let totalRows = 0;
  let capped = 0;

  for (const t of tables) {
    const isCapped = CAPPED_LOG_TABLES.has(t.table_name);
    if (isCapped) capped += 1;
    const capClause = isCapped
      ? `ORDER BY created_at DESC LIMIT ${Math.max(1, Math.floor(maxLogRows))}`
      : "";
    const { rows } = await tx.query<{ cnt: string; rows: unknown[] }>(
      `SELECT count(*)::text AS cnt, coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) AS rows
         FROM (SELECT * FROM public.${qi(t.table_name)} ${capClause}) s`,
    );
    payload[t.table_name] = rows[0]?.rows ?? [];
    totalRows += Number(rows[0]?.cnt ?? 0);
  }

  return {
    kind: "server_dynamic_export",
    exported_at: new Date().toISOString(),
    schema_fingerprint: await backupSchemaFingerprint(tx),
    table_count: tables.length,
    total_rows: totalRows,
    capped_log_tables: capped,
    tables: payload,
  };
}

/** backup_restore_all حرفيًا: TRUNCATE + إدراج بالأسماء + setval للتسلسلات. */
export async function backupRestoreAll(
  tx: PoolClient,
  payload: {
    kind?: string;
    tables?: Record<string, unknown[]>;
    schema_fingerprint?: string | null;
  },
): Promise<unknown> {
  if (
    payload.kind !== "server_dynamic_export" ||
    typeof payload.tables !== "object" ||
    payload.tables === null
  ) {
    throw new Error("BACKUP_FORMAT: payload is not a server_dynamic_export backup");
  }

  const currentFingerprint = await backupSchemaFingerprint(tx);
  let fingerprintMismatch = false;
  if (
    payload.schema_fingerprint &&
    currentFingerprint &&
    payload.schema_fingerprint !== currentFingerprint
  ) {
    fingerprintMismatch = true; // تحذير لا إيقاف — كما الأصل.
  }

  // (ج) تعطيل مفاتيح التحقق مؤقتًا داخل الجلسة.
  await tx.query("SET LOCAL session_replication_role = replica");

  // (د-1) تفريغ كل جداول public الأساسية.
  const { rows: allTables } = await tx.query<{ table_name: string }>(
    `SELECT t.table_name FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'`,
  );
  const allNames = allTables.map((t) => qi(t.table_name)).join(", ");
  await tx.query(`TRUNCATE TABLE ${allNames} RESTART IDENTITY CASCADE`);

  // (د-2) إدراج الصفوف بالاسم.
  let total = 0;
  const skipped: string[] = [];
  for (const [tableName, rows] of Object.entries(payload.tables)) {
    if (
      !allTables.some((t) => t.table_name === tableName) ||
      !/^[a-z_][a-z0-9_]*$/.test(tableName)
    ) {
      skipped.push(tableName);
      continue;
    }
    if (Array.isArray(rows) && rows.length > 0) {
      const res = await tx.query(
        `INSERT INTO public.${qi(tableName)} SELECT * FROM jsonb_populate_recordset(NULL::public.${qi(tableName)}, $1)`,
        [JSON.stringify(rows)],
      );
      total += res.rowCount ?? 0;
    }
  }

  // (ج) إعادة المفاتيح.
  await tx.query("SET LOCAL session_replication_role = DEFAULT");

  // (هـ) إعادة ضبط التسلسلات.
  const { rows: seqs } = await tx.query<{ table_name: string; column_name: string }>(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.sequences s
         ON s.sequence_schema = 'public'
      WHERE c.table_schema = 'public'
        AND c.column_default LIKE 'nextval(%'`,
  );
  for (const s of seqs) {
    await tx.query(
      `SELECT setval(pg_get_serial_sequence($1::text, $2::text),
                     coalesce((SELECT max(${qi(s.column_name)}) FROM public.${qi(s.table_name)}), 1))`,
      [`public.${s.table_name}`, s.column_name],
    );
  }

  return {
    restored_at: new Date().toISOString(),
    inserted_rows: total,
    skipped_tables: skipped,
    schema_fingerprint_mismatch: fingerprintMismatch,
    current_fingerprint: currentFingerprint,
  };
}
