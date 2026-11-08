/**
 * Use Cases: التقارير والنسخ الاحتياطي — المرحلة 12.
 * كل دالة تحفظ دلالات الأمان الأصلية:
 *  - الدوال invoker الأصلية (RLS مطبق): المعاملة تعمل بـ authenticated + claims.
 *  - الدوال SECURITY DEFINER: فحص صريح في Use Case ثم تنفيذ بمعرفة المستخدم.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  backupExportAll,
  backupRestoreAll,
  backupSchemaFingerprint,
  canReadFinanceAuthed,
  chartOfAccountsTree,
  expenseDetail,
  expenseLookups,
  expenseReport,
  expenseSummary,
  listExpenses,
  millingServiceCostReport,
  supplierStatement,
} from "../infrastructure/reports.repository";

/** فتح معاملة invoker — نفس دلالات نداء RPC من التطبيق (RLS مطبق على auth.uid()). */
async function withInvokerTx<T>(
  session: ServerSession,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  void session.userId;
  return withTransaction({ rollback: false }, async (tx) => {
    await tx.query("SELECT set_config('role', 'authenticated', true)");
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: session.userId, role: "authenticated" }),
    ]);
    return fn(tx);
  });
}

// ── المصاريف (القراءة) ─────────────────────────────────────────────────────

export async function listExpensesReport(
  session: ServerSession,
  filters: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const strOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== ""
      ? v.trim()
      : typeof v === "string"
        ? null
        : v == null
          ? null
          : null;
  return withInvokerTx(session, (tx) =>
    listExpenses(tx, {
      search: strOrNull(filters.search),
      status: (filters.status as string[] | null) ?? null,
      categoryId: strOrNull(filters.categoryId),
      warehouseId: strOrNull(filters.warehouseId),
      costCenterId: strOrNull(filters.costCenterId),
      projectId: strOrNull(filters.projectId),
      supplierId: strOrNull(filters.supplierId),
      employeeId: strOrNull(filters.employeeId),
      paymentState: strOrNull(filters.paymentState),
      dateFrom: strOrNull(filters.dateFrom),
      dateTo: strOrNull(filters.dateTo),
      amountMin: numOrNull(filters.amountMin),
      amountMax: numOrNull(filters.amountMax),
      categoryIds: (filters.categoryIds as string[] | null) ?? null,
      limit: numOrNull(filters.limit) ?? 50,
      cursorDate: strOrNull(filters.cursorDate),
      cursorId: strOrNull(filters.cursorId),
    }),
  );
}

export async function expenseDetailReport(
  session: ServerSession,
  entryId: string,
): Promise<unknown> {
  return withInvokerTx(session, (tx) => expenseDetail(tx, entryId));
}

export async function expenseSummaryReport(
  session: ServerSession,
  args: { dateFrom: string | null; dateTo: string | null; warehouseId: string | null },
): Promise<unknown> {
  return withInvokerTx(session, (tx) => expenseSummary(tx, args));
}

export async function expenseReportGrouped(
  session: ServerSession,
  args: {
    groupBy: string;
    dateFrom: string | null;
    dateTo: string | null;
    warehouseId?: string | null;
    costCenterId?: string | null;
    projectId?: string | null;
    limit?: number;
  },
): Promise<Record<string, unknown>[]> {
  if (
    !["category", "month", "warehouse", "cost_center", "project", "payee", "status"].includes(
      args.groupBy,
    )
  ) {
    throw new BusinessRuleError(`Unknown group_by: ${args.groupBy}`);
  }
  return withInvokerTx(session, (tx) =>
    expenseReport(tx, {
      groupBy: args.groupBy,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      warehouseId: args.warehouseId ?? null,
      costCenterId: args.costCenterId ?? null,
      projectId: args.projectId ?? null,
      limit: args.limit ?? 200,
    }),
  );
}

export async function expenseLookupsReport(
  session: ServerSession,
  includeArchived: boolean,
): Promise<unknown> {
  return withInvokerTx(session, (tx) => expenseLookups(tx, includeArchived === true));
}

export async function millingServiceCost(
  session: ServerSession,
  args: { dateFrom: string | null; dateTo: string | null; costCenterId: string | null },
): Promise<Record<string, unknown> | null> {
  return withInvokerTx(session, (tx) => millingServiceCostReport(tx, args));
}

// ── المحاسبة: شجرة الدليل ──────────────────────────────────────────────────

export async function chartOfAccounts(session: ServerSession): Promise<Record<string, unknown>[]> {
  return withInvokerTx(session, (tx) => chartOfAccountsTree(tx));
}

// ── الشركاء: كشف المورد ────────────────────────────────────────────────────

export async function supplierLedgerStatement(
  session: ServerSession,
  args: { supplierId: string; startDate: string | null; endDate: string | null },
): Promise<Record<string, unknown>[]> {
  return withTransaction(async (tx) => {
    // الأصل SECURITY DEFINER بفحص can_read_finance على auth.uid().
    if (!(await canReadFinanceAuthed(tx))) {
      throw new AuthorizationError("Only finance roles may read supplier statements");
    }
    return supplierStatement(tx, args);
  });
}

// ── النسخ الاحتياطي ────────────────────────────────────────────────────────

async function assertBackupExportRole(tx: PoolClient, userId: string): Promise<void> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT (public.has_role($1::uuid, 'owner') OR public.has_role($1::uuid, 'manager')
             OR public.is_platform_superadmin($1::uuid)) AS ok`,
    [userId],
  );
  if (rows[0]?.ok !== true) {
    throw new AuthorizationError(
      "BACKUP_AUTH: backup export requires owner, manager or platform superadmin",
    );
  }
}

export async function backupExport(session: ServerSession, maxLogRows: number): Promise<unknown> {
  return withTransaction(async (tx) => {
    await assertBackupExportRole(tx, session.userId);
    return backupExportAll(tx, Math.max(1, Math.floor(maxLogRows ?? 5000)));
  });
}

export async function backupRestore(
  session: ServerSession,
  payload: {
    kind?: string;
    tables?: Record<string, unknown[]>;
    schema_fingerprint?: string | null;
  },
): Promise<unknown> {
  return withTransaction(async (tx) => {
    // الاستعادة owner فقط — كما الأصل (SECURITY DEFINER).
    const { rows } = await tx.query<{ ok: boolean }>(
      "SELECT public.has_role($1::uuid, 'owner') AS ok",
      [session.userId],
    );
    if (rows[0]?.ok !== true) {
      throw new AuthorizationError("BACKUP_AUTH: backup restore requires owner role");
    }
    // الاستعادة تعطل المفاتيح وتكتب عبر service_role فعليًا (session_replication_role)
    // — تكمل على دور المعاملة الحالي كما كانت الدالة الأصلية SECURITY DEFINER.
    await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: session.userId, role: "authenticated" }),
    ]);
    return backupRestoreAll(tx, payload);
  });
}

export async function backupFingerprint(session: ServerSession): Promise<string> {
  return withTransaction({ rollback: true }, async (tx) => backupSchemaFingerprint(tx));
}
