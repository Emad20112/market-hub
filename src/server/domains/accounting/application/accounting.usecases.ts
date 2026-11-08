/**
 * Use Cases: المحاسبة — المرحلة 9 (النواة).
 * create_journal_entry، reverse_journal_entry، assert_period_open،
 * set_period_status — مطابقة لدوال 009 الأصلية حرفيًا.
 *
 * الوضع الانتقالي (DECISIONS-LOG): الدوال المتبقية في القاعدة التي تستدعي
 * create_journal_entry (post_sales_invoice، balance_and_post_return، الطحن،
 * الإنتاج، الإقفال) تبقى تعمل عبر دالة القاعدة — جسر انتقالي؛ Use Cases
 * المنقولة (الخزينة، المشتريات) تستهلك هذه النسخة الجديدة مباشرة.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";
import {
  assertPeriodOpen,
  entryLines,
  finalizeEntry,
  hasRole,
  insertAudit,
  insertJournalEntry,
  insertJournalLines,
  lockEntry,
  lockFiscalPeriod,
  markReversed,
  nextJournalNumber,
  updateFiscalPeriodStatus,
  type JournalLineInput,
} from "../infrastructure/accounting.repository";

export interface CreateJournalEntryInput {
  memo: string;
  entryDate?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  isSystem?: boolean;
  isReversal?: boolean;
  lines: Array<{
    account_code: string;
    debit?: number;
    credit?: number;
    partner_type?: string | null;
    partner_id?: string | null;
    memo?: string | null;
  }>;
}

/** التنفيذ الداخلي داخل معاملة ممرّرة — كما الأصل حرفيًا (T-03/T-19). */
export async function createJournalEntryInner(
  tx: PoolClient,
  session: ServerSession,
  input: CreateJournalEntryInput,
): Promise<string> {
  const userId = session.userId;
  const isSystem = input.isSystem === true;

  // T-03: القيد اليدوي للمحاسبة فقط؛ النظامي مسموح لأي موظف مصادق.
  if (!isSystem) {
    let ok = false;
    for (const r of ["owner", "manager", "accountant"]) {
      if (await hasRole(tx, userId, r)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      throw new AuthorizationError(
        "Only an owner, manager or accountant may create manual journal entries",
      );
    }
  }

  if (!input.memo || input.memo.trim() === "") {
    throw new BusinessRuleError("A journal entry needs a description");
  }
  if (!Array.isArray(input.lines) || input.lines.length < 2) {
    throw new BusinessRuleError(
      "A journal entry needs at least two lines - one to debit and one to credit",
    );
  }

  // سطر بلا طرف — يُرفض قبل كتابة الرأس.
  const sideless = input.lines
    .filter((l) => (l.debit ?? 0) === 0 && (l.credit ?? 0) === 0)
    .map((l) => l.account_code ?? "?");
  if (sideless.length > 0) {
    throw new BusinessRuleError(
      `Line(s) ${sideless.join("، ")} carry neither a debit nor a credit. Every line must have exactly one side.`,
    );
  }

  // T-03: اليدوي لا يلمس حسابات النظام.
  if (!isSystem) {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM jsonb_to_recordset($2::jsonb) AS l(account_code text)
         JOIN public.accounts a ON a.code = l.account_code
        WHERE a.is_system`,
      [userId, JSON.stringify(input.lines)],
    );
    if (Number(rows[0].n) > 0) {
      throw new BusinessRuleError(
        `${rows[0].n} line(s) target a system account. Manual entries cannot post to system accounts.`,
      );
    }
  }

  // T-19: لا قيد جديد بتاريخ فترة مقفلة (العكسي مستثنى).
  if (input.isReversal !== true) {
    await assertPeriodOpen(tx, input.entryDate ?? null);
  }

  const entryDate = input.entryDate ?? new Date().toISOString().slice(0, 10);
  const entryNumber = await nextJournalNumber(tx, entryDate);

  const entryId = await insertJournalEntry(tx, {
    entryNumber,
    entryDate,
    memo: input.memo.trim(),
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    isSystem,
    createdBy: userId,
  });

  const totalDebit = input.lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit ?? 0), 0);

  if (roundN(totalDebit, 2) !== roundN(totalCredit, 2)) {
    throw new BusinessRuleError(
      `Entry does not balance: debits ${roundN(totalDebit, 2).toFixed(2)} vs credits ${roundN(totalCredit, 2).toFixed(2)} (difference ${roundN(totalDebit - totalCredit, 2).toFixed(2)}). An entry that cannot balance is not an entry.`,
    );
  }
  if (totalDebit <= 0) {
    throw new BusinessRuleError("Entry total must be greater than zero");
  }

  const { rows: check } = await tx.query<{ missing: string; blocked: string }>(
    `SELECT count(*) FILTER (WHERE a.id IS NULL)::text AS missing,
            count(*) FILTER (WHERE a.id IS NOT NULL AND NOT a.is_postable)::text AS blocked
       FROM jsonb_to_recordset($1::jsonb) AS l(account_code text)
       LEFT JOIN public.accounts a ON a.code = l.account_code`,
    [JSON.stringify(input.lines)],
  );
  if (Number(check[0].missing) > 0) {
    throw new BusinessRuleError(
      "One or more account codes do not exist. Check the code before posting.",
    );
  }
  if (Number(check[0].blocked) > 0) {
    throw new BusinessRuleError(
      "One or more accounts is not postable directly (a contra or clearing account). Post through the account that moves it.",
    );
  }

  const written = await insertJournalLines(tx, entryId, input.lines);
  if (written !== input.lines.length) {
    throw new BusinessRuleError("One or more lines could not be written");
  }

  await finalizeEntry(tx, {
    entryId,
    totalDebit: totalDebit,
    totalCredit: totalCredit,
    postedBy: userId,
  });

  await insertAudit(tx, {
    actorId: userId,
    action: "journal_entry.posted",
    entityType: "journal_entry",
    entityId: entryId,
    payload: {
      entry_number: entryNumber,
      entry_date: entryDate,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      total: totalDebit,
      is_reversal: input.isReversal === true,
    },
  });

  return entryId;
}

export function createJournalEntry(
  session: ServerSession,
  input: CreateJournalEntryInput,
): Promise<{ entryId: string }> {
  return withTransaction((tx) =>
    createJournalEntryInner(tx, session, input).then((entryId) => ({ entryId })),
  );
}

// ── reverse_journal_entry ───────────────────────────────────────────────────

export async function reverseJournalEntryInner(
  tx: PoolClient,
  session: ServerSession,
  input: { entryId: string; reason: string },
): Promise<string> {
  const userId = session.userId;
  let ok = false;
  for (const r of ["owner", "manager", "accountant"]) {
    if (await hasRole(tx, userId, r)) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    throw new AuthorizationError(
      "Only an owner, manager or accountant may reverse journal entries",
    );
  }
  if (!input.reason || input.reason.trim() === "") {
    throw new BusinessRuleError("Reversing an entry requires a reason");
  }
  const old = await lockEntry(tx, input.entryId);
  if (!old || old.status !== "POSTED") {
    throw new BusinessRuleError("Only a posted entry can be reversed");
  }

  const lines = (await entryLines(tx, input.entryId)).map((l) => ({
    account_code: l.accountCode,
    debit: l.debit > 0 ? 0 : l.credit,
    credit: l.debit > 0 ? l.debit : 0,
    memo: l.memo ?? undefined,
  }));

  const reversalId = await createJournalEntryInner(tx, session, {
    memo: `عكس القيد ${old.entryNumber}: ${input.reason.trim()}`,
    entryDate: new Date().toISOString().slice(0, 10),
    sourceType: "journal_reversal",
    sourceId: input.entryId,
    isSystem: old.isSystem,
    isReversal: true,
    lines,
  });

  await markReversed(tx, input.entryId);
  return reversalId;
}

export function reverseJournalEntry(
  session: ServerSession,
  input: { entryId: string; reason: string },
): Promise<{ reversalId: string }> {
  return withTransaction((tx) =>
    reverseJournalEntryInner(tx, session, input).then((r) => ({ reversalId: r })),
  );
}

// ── set_period_status ───────────────────────────────────────────────────────

export async function setPeriodStatusInner(
  tx: PoolClient,
  session: ServerSession,
  input: { periodId: string; status: string },
): Promise<boolean> {
  const userId = session.userId;
  let ok = false;
  for (const r of ["owner", "manager", "accountant"]) {
    if (await hasRole(tx, userId, r)) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    throw new AuthorizationError(
      "Only an owner, manager or accountant may change fiscal period status",
    );
  }
  if (!["OPEN", "CLOSED"].includes(input.status)) {
    throw new BusinessRuleError("Status must be OPEN or CLOSED");
  }
  const period = await lockFiscalPeriod(tx, input.periodId);
  if (!period) throw new BusinessRuleError("Fiscal period not found");

  await updateFiscalPeriodStatus(tx, {
    periodId: input.periodId,
    status: input.status,
    userId,
  });

  await insertAudit(tx, {
    actorId: userId,
    action: "fiscal_period.status_changed",
    entityType: "fiscal_period",
    entityId: input.periodId,
    payload: { code: period.code, old_status: period.status, new_status: input.status },
  });
  return true;
}

export function setPeriodStatus(
  session: ServerSession,
  input: { periodId: string; status: string },
): Promise<{ changed: boolean }> {
  return withTransaction((tx) =>
    setPeriodStatusInner(tx, session, input).then((r) => ({ changed: r })),
  );
}
