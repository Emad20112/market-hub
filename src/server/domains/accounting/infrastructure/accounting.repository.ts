/**
 * مستودع المحاسبة — المرحلة 9 (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج الوصول للبيانات كما في دوال 009 الأصلية (create_journal_entry،
 * reverse_journal_entry، assert_period_open، set_period_status) حرفيًا.
 */
import type { PoolClient } from "pg";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";

export interface JournalLineInput {
  account_code: string;
  debit?: number;
  credit?: number;
  partner_type?: string | null;
  partner_id?: string | null;
  memo?: string | null;
}

export async function hasRole(tx: PoolClient, userId: string, role: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT public.has_role($1::uuid, $2::public.app_role) AS ok",
    [userId, role],
  );
  return rows[0]?.ok === true;
}

/** T-19: لا قيد بتاريخ فترة مقفلة (تاريخ خارج الفترات مسموح). */
export async function assertPeriodOpen(tx: PoolClient, date: string | null): Promise<void> {
  if (!date) return;
  const { rows } = await tx.query<{ status: string | null }>(
    `SELECT status::text FROM public.fiscal_periods
      WHERE $1::date BETWEEN start_date AND end_date LIMIT 1`,
    [date],
  );
  const status = rows[0]?.status ?? null;
  if (status === "CLOSED") {
    throw new Error(`الفترة المالية المحتوية على ${date} مقفلة. لا يمكن الترحيل بتاريخ مقفول.`);
  }
}

export async function nextJournalNumber(tx: PoolClient, date: string): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    `SELECT 'JE-' || to_char($1::date, 'YYYYMMDD') || '-' ||
            lpad(nextval('public.journal_entry_seq')::text, 4, '0') AS n`,
    [date],
  );
  return rows[0].n;
}

export async function insertJournalEntry(
  tx: PoolClient,
  args: {
    entryNumber: string;
    entryDate: string;
    memo: string;
    sourceType: string | null;
    sourceId: string | null;
    isSystem: boolean;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.journal_entries
       (entry_number, entry_date, memo, source_type, source_id, is_system, created_by)
     VALUES ($1, $2::date, $3, $4, $5::uuid, $6, $7::uuid)
     RETURNING id::text AS id`,
    [
      args.entryNumber,
      args.entryDate,
      args.memo,
      args.sourceType,
      args.sourceId,
      args.isSystem,
      args.createdBy,
    ],
  );
  return rows[0].id;
}

export async function insertJournalLines(
  tx: PoolClient,
  entryId: string,
  lines: JournalLineInput[],
): Promise<number> {
  const { rowCount } = await tx.query(
    `INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, memo, partner_type, partner_id)
     SELECT $1::uuid, a.id,
            coalesce(l.debit, 0)::numeric,
            coalesce(l.credit, 0)::numeric,
            nullif(btrim(coalesce(l.memo, '')), ''),
            nullif(btrim(coalesce(l.partner_type, '')), ''),
            l.partner_id::uuid
       FROM jsonb_to_recordset($2::jsonb) AS l(account_code text, debit numeric, credit numeric, memo text, partner_type text, partner_id uuid)
       JOIN public.accounts a ON a.code = l.account_code
      WHERE l.debit IS DISTINCT FROM 0 OR l.credit IS DISTINCT FROM 0`,
    [entryId, JSON.stringify(lines)],
  );
  return rowCount ?? 0;
}

export async function finalizeEntry(
  tx: PoolClient,
  args: {
    entryId: string;
    totalDebit: number;
    totalCredit: number;
    postedBy: string;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.journal_entries
        SET total_debit = $2::numeric, total_credit = $3::numeric, status = 'POSTED',
            posted_by = $4::uuid, posted_at = now()
      WHERE id = $1::uuid`,
    [args.entryId, args.totalDebit, args.totalCredit, args.postedBy],
  );
}

export async function insertAudit(
  tx: PoolClient,
  args: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string | null;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
    [args.actorId, args.action, args.entityType, args.entityId, JSON.stringify(args.payload)],
  );
}

export interface OldEntryRow {
  id: string;
  entryNumber: string;
  status: string;
  isSystem: boolean;
}

export async function lockEntry(tx: PoolClient, entryId: string): Promise<OldEntryRow | null> {
  const { rows } = await tx.query<{
    id: string;
    entry_number: string;
    status: string;
    is_system: boolean;
  }>(
    `SELECT id::text, entry_number, status::text, is_system
       FROM public.journal_entries WHERE id = $1::uuid FOR UPDATE`,
    [entryId],
  );
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, entryNumber: r.entry_number, status: r.status, isSystem: r.is_system };
}

export interface OldLineRow {
  accountCode: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export async function entryLines(tx: PoolClient, entryId: string): Promise<OldLineRow[]> {
  const { rows } = await tx.query<{
    code: string;
    debit: string;
    credit: string;
    memo: string | null;
  }>(
    `SELECT a.code, jl.debit::text, jl.credit::text, jl.memo
       FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
      WHERE jl.entry_id = $1::uuid ORDER BY jl.id`,
    [entryId],
  );
  return rows.map((r) => ({
    accountCode: r.code,
    debit: Number(r.debit),
    credit: Number(r.credit),
    memo: r.memo,
  }));
}

export async function markReversed(tx: PoolClient, entryId: string): Promise<void> {
  await tx.query("UPDATE public.journal_entries SET status = 'REVERSED' WHERE id = $1::uuid", [
    entryId,
  ]);
}

// ── set_period_status ───────────────────────────────────────────────────────

export async function lockFiscalPeriod(
  tx: PoolClient,
  periodId: string,
): Promise<{ code: string; status: string } | null> {
  const { rows } = await tx.query<{ code: string; status: string }>(
    "SELECT code, status::text FROM public.fiscal_periods WHERE id = $1::uuid FOR UPDATE",
    [periodId],
  );
  return rows[0] ?? null;
}

export async function updateFiscalPeriodStatus(
  tx: PoolClient,
  args: { periodId: string; status: string; userId: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.fiscal_periods
        SET status = $2,
            closed_at = CASE WHEN $2 = 'CLOSED' THEN now() ELSE NULL END,
            closed_by = CASE WHEN $2 = 'CLOSED' THEN $3::uuid ELSE NULL END
      WHERE id = $1::uuid`,
    [args.periodId, args.status, args.userId],
  );
}

export { roundN };
