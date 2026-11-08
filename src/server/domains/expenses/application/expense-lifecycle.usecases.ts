/**
 * Use Cases: دورة حياة المصاريف — المرحلة 10b.
 * create/update_expense_v2، submit، decide، post، record/reverse_expense_payment،
 * close/cancel/reverse_expense — مطابقة لدوال 010/011 الأصلية حرفيًا.
 *
 * القيود عبر محرك المرحلة 9 (createJournalEntryInner) — لا اعتماد خلفي على
 * دالة create_journal_entry لهذه الدورة.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  expenseAssertCapability,
  expenseRoleRank,
  expenseSettlementStatus,
  expenseWriteSupplierLedger,
  expenseReverseSupplierLedger,
  expensePostingAccountCode,
} from "../infrastructure/expenses.repository";
import {
  applyDecision,
  companyCurrency,
  copyExpenseLines,
  existingExpenseJournal,
  findIdempotentEntry,
  findIdempotentPayment,
  findPostedExpenseJournal,
  findPostedPaymentJournal,
  getEntryJson,
  hasTaxableLines,
  insertExpenseEntry,
  insertExpensePayment,
  insertExpenseReversalEntry,
  linesWithMissingAccounts,
  lockExpenseEntry,
  lockPayment,
  markCancelled,
  markClosed,
  markPosted,
  markPaymentReversed,
  markReversed,
  markSubmittedWithActor,
  nextExpenseReference,
  postingGroups,
  supplierInvoiceNumberExists,
  updateExpenseHeader,
  updateExpenseEntryTotals,
  updateTaxFields,
  writeExpenseLines,
  type ExpenseEntryRow,
} from "../infrastructure/expense-lifecycle.repository";
import { createJournalEntryInner, reverseJournalEntryInner } from "@/server/domains/accounting";

type EntryJson = unknown;

async function assertCapability(
  tx: PoolClient,
  session: ServerSession,
  capability: string,
): Promise<void> {
  await expenseAssertCapability(tx, session.userId, capability);
}

async function checkVersion(expected: number | null | undefined, actual: number): Promise<void> {
  if (expected !== null && expected !== undefined && expected !== actual) {
    throw new BusinessRuleError(
      "This expense was changed by someone else. Reload it and try again.",
    );
  }
}

async function payableRole(entry: ExpenseEntryRow): Promise<string> {
  if (entry.payeeType === "SUPPLIER" && entry.supplierId) return "SUPPLIER_PAYABLE";
  if (entry.payeeType === "EMPLOYEE" && entry.employeeId) return "EMPLOYEE_PAYABLE";
  return "OTHER_PAYABLE";
}

// ── create_expense_v2 ───────────────────────────────────────────────────────

export interface ExpenseLineInput {
  description?: string | null;
  category_id?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  tax_rate?: number | null;
  cost_center_id?: string | null;
  project_id?: string | null;
  note?: string | null;
}

export interface CreateExpenseInput {
  lines: ExpenseLineInput[];
  expenseDate?: string | null;
  dueDate?: string | null;
  entryType?: string | null;
  payeeType?: string | null;
  payeeName?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  warehouseId?: string | null;
  costCenterId?: string | null;
  projectId?: string | null;
  description?: string | null;
  note?: string | null;
  taxMode?: string | null;
  reference?: string | null;
  submit?: boolean;
  supplierInvoiceNumber?: string | null;
  taxRecoverable?: boolean;
  idempotencyKey?: string | null;
}

export async function createExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  input: CreateExpenseInput,
): Promise<EntryJson> {
  const userId = session.userId;
  await assertCapability(tx, session, "expense.create");
  const expenseDate = input.expenseDate ?? null;
  if (!expenseDate) throw new BusinessRuleError("Expense date is required");
  if (input.dueDate && input.dueDate < expenseDate) {
    throw new BusinessRuleError("Due date cannot precede the expense date");
  }
  const payeeType = input.payeeType ?? "NONE";
  if (payeeType === "SUPPLIER" && !input.supplierId) {
    throw new BusinessRuleError("A supplier payee requires a supplier");
  }
  if (payeeType === "EMPLOYEE" && !input.employeeId) {
    throw new BusinessRuleError("An employee payee requires a staff member");
  }
  const invoiceNumber = input.supplierInvoiceNumber?.trim() || null;
  if (invoiceNumber && (payeeType !== "SUPPLIER" || !input.supplierId)) {
    throw new BusinessRuleError("A supplier invoice number requires a selected supplier");
  }
  if ((invoiceNumber?.length ?? 0) > 120 || (input.idempotencyKey?.length ?? 0) > 128) {
    throw new BusinessRuleError("Invoice number or request key is too long");
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2, 0))", [
      userId,
      idempotencyKey,
    ]);
    const existing = await findIdempotentEntry(tx, { createdBy: userId, idempotencyKey });
    if (existing) return getEntryJson(tx, existing);
  }

  if (
    invoiceNumber &&
    (await supplierInvoiceNumberExists(tx, { supplierId: input.supplierId ?? null, invoiceNumber }))
  ) {
    throw new BusinessRuleError(
      "This supplier invoice number is already recorded for this supplier",
    );
  }

  const { currency, symbol } = await companyCurrency(tx);
  const status = input.submit === true ? "SUBMITTED" : "DRAFT";
  const reference = input.reference?.trim() || (await nextExpenseReference(tx));

  let entryId: string;
  try {
    entryId = await insertExpenseEntry(tx, {
      reference,
      entryType: input.entryType ?? "DIRECT",
      status,
      payeeType,
      payeeName: input.payeeName?.trim() || null,
      supplierId: input.supplierId ?? null,
      employeeId: input.employeeId ?? null,
      warehouseId: input.warehouseId ?? null,
      costCenterId: input.costCenterId ?? null,
      projectId: input.projectId ?? null,
      expenseDate,
      dueDate: input.dueDate ?? null,
      description: input.description?.trim() || null,
      note: input.note?.trim() || null,
      taxMode: input.taxMode ?? "NONE",
      taxRecoverable: input.taxRecoverable === true,
      supplierInvoiceNumber: invoiceNumber,
      idempotencyKey,
      currency,
      currencySymbol: symbol,
      createdBy: userId,
      submit: input.submit === true,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      if (idempotencyKey) {
        const existing = await findIdempotentEntry(tx, { createdBy: userId, idempotencyKey });
        if (existing) return getEntryJson(tx, existing);
      }
      throw new BusinessRuleError(
        "This supplier invoice number is already recorded for this supplier",
      );
    }
    throw e;
  }

  const { total, count } = await writeExpenseLines(tx, {
    entryId,
    lines: input.lines,
    taxMode: input.taxMode ?? "NONE",
  });
  await updateExpenseEntryTotals(tx, { entryId, total, lineCount: count });
  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId,
    action: "created",
    from: "DRAFT",
    to: status,
    reason: input.submit ? "Created and submitted" : "Created as draft",
    actor: userId,
  });
  return getEntryJson(tx, entryId);
}

export function createExpense(
  session: ServerSession,
  input: CreateExpenseInput,
): Promise<EntryJson> {
  return withTransaction((tx) => createExpenseInner(tx, session, input));
}

// ── update_expense_v2 ───────────────────────────────────────────────────────

export interface UpdateExpenseInput extends CreateExpenseInput {
  entryId: string;
  expectedVersion?: number | null;
}

export async function updateExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  input: UpdateExpenseInput,
): Promise<EntryJson> {
  const userId = session.userId;
  await assertCapability(tx, session, "expense.edit");
  const entry = await lockExpenseEntry(tx, input.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  if (!["DRAFT", "REJECTED"].includes(entry.status)) {
    throw new BusinessRuleError(
      `Only a draft or a returned expense can be edited (current: ${entry.status})`,
    );
  }
  if (!(entry.createdBy === userId || (await expenseRoleRank(tx, userId)) >= 30)) {
    throw new AuthorizationError("Forbidden: you can only edit your own drafts");
  }
  await checkVersion(input.expectedVersion, entry.version);

  const taxMode = input.taxMode ?? entry.taxMode;
  const payeeType = input.payeeType ?? entry.payeeType;
  if (payeeType === "SUPPLIER" && (input.supplierId ?? entry.supplierId) === null) {
    throw new BusinessRuleError("A supplier payee requires a supplier");
  }
  if (payeeType === "EMPLOYEE" && (input.employeeId ?? entry.employeeId) === null) {
    throw new BusinessRuleError("An employee payee requires a staff member");
  }

  await updateExpenseHeader(tx, {
    entryId: input.entryId,
    expenseDate: input.expenseDate ?? null,
    dueDate: input.dueDate ?? null,
    entryType: input.entryType ?? null,
    payeeType,
    payeeName: input.payeeName ?? null,
    supplierId: input.supplierId ?? null,
    employeeId: input.employeeId ?? null,
    warehouseId: input.warehouseId ?? null,
    costCenterId: input.costCenterId ?? null,
    projectId: input.projectId ?? null,
    description: input.description ?? null,
    note: input.note ?? null,
    taxMode,
  });

  const { total, count } = await writeExpenseLines(tx, {
    entryId: input.entryId,
    lines: input.lines,
    taxMode,
  });
  await updateExpenseEntryTotals(tx, { entryId: input.entryId, total, lineCount: count });

  // v2: معالجة الضريبة ورقم فاتورة المورد
  const invoiceNumber = input.supplierInvoiceNumber?.trim() || null;
  if (
    invoiceNumber &&
    (payeeType !== "SUPPLIER" || (input.supplierId ?? entry.supplierId) === null)
  ) {
    throw new BusinessRuleError("A supplier invoice number requires a selected supplier");
  }
  if (
    invoiceNumber &&
    (await supplierInvoiceNumberExists(tx, {
      supplierId: payeeType === "SUPPLIER" ? (input.supplierId ?? entry.supplierId) : null,
      invoiceNumber,
      excludeEntryId: input.entryId,
    }))
  ) {
    throw new BusinessRuleError(
      "This supplier invoice number is already recorded for this supplier",
    );
  }
  if (
    !(await updateTaxFields(tx, {
      entryId: input.entryId,
      taxRecoverable: input.taxRecoverable === true,
      invoiceNumber,
    }))
  ) {
    throw new BusinessRuleError("Only a draft or returned expense can change its tax treatment");
  }

  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: input.entryId,
    action: "updated",
    from: entry.status,
    to: "DRAFT",
    reason: "Draft edited",
    actor: userId,
  });
  return getEntryJson(tx, input.entryId);
}

export function updateExpense(
  session: ServerSession,
  input: UpdateExpenseInput,
): Promise<EntryJson> {
  return withTransaction((tx) => updateExpenseInner(tx, session, input));
}

// ── submit_expense ──────────────────────────────────────────────────────────

export async function submitExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  input: { entryId: string; expectedVersion?: number | null },
): Promise<EntryJson> {
  const userId = session.userId;
  const entry = await lockExpenseEntry(tx, input.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  if (!["DRAFT", "REJECTED"].includes(entry.status)) {
    throw new BusinessRuleError(
      `Only a draft or a returned expense can be submitted (current: ${entry.status})`,
    );
  }
  if (!(entry.createdBy === userId || (await expenseRoleRank(tx, userId)) >= 30)) {
    throw new AuthorizationError("Forbidden: you can only submit your own drafts");
  }
  await assertCapability(tx, session, "expense.submit");
  await checkVersion(input.expectedVersion, entry.version);

  if (entry.totalAmount <= 0 || entry.lineCount === 0) {
    throw new BusinessRuleError("Add at least one line with an amount before submitting");
  }
  if (entry.payeeType === "SUPPLIER" && entry.supplierId === null) {
    throw new BusinessRuleError("Choose the supplier before submitting");
  }
  if (entry.payeeType === "EMPLOYEE" && entry.employeeId === null) {
    throw new BusinessRuleError("Choose the staff member before submitting");
  }

  await markSubmittedWithActor(tx, { entryId: input.entryId, actorId: userId });
  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: input.entryId,
    action: "submitted",
    from: entry.status,
    to: "SUBMITTED",
    reason: null,
    actor: userId,
  });
  return getEntryJson(tx, input.entryId);
}

export function submitExpense(
  session: ServerSession,
  input: { entryId: string; expectedVersion?: number | null },
): Promise<EntryJson> {
  return withTransaction((tx) => submitExpenseInner(tx, session, input));
}

// ── decide_expense ──────────────────────────────────────────────────────────

export async function decideExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  input: {
    entryId: string;
    approve: boolean | null;
    reason?: string | null;
    expectedVersion?: number | null;
  },
): Promise<EntryJson> {
  const userId = session.userId;
  if (input.approve === null) {
    throw new BusinessRuleError("Choose whether to approve or reject this expense");
  }
  const entry = await lockExpenseEntry(tx, input.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  if (!["SUBMITTED", "DRAFT"].includes(entry.status)) {
    throw new BusinessRuleError(`This expense is not awaiting approval (current: ${entry.status})`);
  }
  await assertCapability(tx, session, `expense.${input.approve ? "approve" : "reject"}`);
  await checkVersion(input.expectedVersion, entry.version);

  const userRank = await expenseRoleRank(tx, userId);
  if (userRank < entry.approvalRequiredRank) {
    throw new AuthorizationError(
      "This expense requires approval from a higher role based on its amount",
    );
  }
  if (
    entry.createdBy === userId &&
    !((await hasOwnerRole(tx, userId)) && entry.status === "DRAFT")
  ) {
    throw new AuthorizationError("You cannot approve an expense you created yourself");
  }

  let reason: string | null = null;
  if (input.approve) {
    reason = input.reason?.trim() || null;
    if (reason === null && entry.status === "DRAFT") {
      throw new BusinessRuleError(
        "A written reason is required to approve a draft expense directly",
      );
    }
    if (entry.createdBy === userId && (await hasOwnerRole(tx, userId))) {
      reason = reason ?? "Self-approved by owner (no other approver available)";
    }
  } else {
    reason = input.reason?.trim() || null;
    if (reason === null) {
      throw new BusinessRuleError("A reason is required when rejecting an expense");
    }
  }

  await applyDecision(tx, {
    entryId: input.entryId,
    approve: input.approve,
    actorId: userId,
    reason,
    fromStatus: entry.status,
  });
  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: input.entryId,
    // قيد expense_approvals_action_known يسمح بـ approved/rejected — الدالة القديمة
    // كانت تسجل approve/reject فتنهار دائمًا (عيب قديم موثق بالاختبار).
    action: input.approve ? "approved" : "rejected",
    from: entry.status,
    to: input.approve ? "APPROVED" : "REJECTED",
    reason,
    actor: userId,
  });
  return getEntryJson(tx, input.entryId);
}

async function hasOwnerRole(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT public.has_role($1::uuid, 'owner'::public.app_role) AS ok",
    [userId],
  );
  return rows[0]?.ok === true;
}

export function decideExpense(
  session: ServerSession,
  input: {
    entryId: string;
    approve: boolean | null;
    reason?: string | null;
    expectedVersion?: number | null;
  },
): Promise<EntryJson> {
  return withTransaction((tx) => decideExpenseInner(tx, session, input));
}

// ── post_expense ────────────────────────────────────────────────────────────

export interface PostExpenseInput {
  entryId: string;
  expectedVersion?: number | null;
  payNow?: boolean;
  paymentMethod?: string | null;
  accountLabel?: string | null;
  paymentDate?: string | null;
  idempotencyKey?: string | null;
  accountId?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  paymentMethodId?: string | null;
}

export async function postExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  input: PostExpenseInput,
): Promise<EntryJson> {
  const userId = session.userId;
  const entry = await lockExpenseEntry(tx, input.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  if (["POSTED", "PARTIALLY_PAID", "PAID", "CLOSED"].includes(entry.status)) {
    return getEntryJson(tx, input.entryId);
  }
  if (!["APPROVED", "DRAFT"].includes(entry.status)) {
    throw new BusinessRuleError(`This expense cannot be posted from status ${entry.status}`);
  }
  await assertCapability(tx, session, "expense.post");
  await checkVersion(input.expectedVersion, entry.version);
  if (entry.entryType === "ADVANCE") {
    throw new BusinessRuleError(
      "Employee advances need a separate issue and settlement document; this expense entry cannot post them",
    );
  }
  if (entry.totalAmount <= 0 || entry.lineCount === 0) {
    throw new BusinessRuleError("Cannot post an expense with no lines");
  }

  // ⛔ قاعدة المرحلة 1: مسودة يلزمها اعتماد مسجل + مالك.
  let overrideReason: string | null = null;
  if (entry.status === "DRAFT") {
    const ownerOk = await hasOwnerRole(tx, userId);
    if (!(ownerOk && entry.allowDraftPost)) {
      throw new BusinessRuleError("Submit this expense for approval before posting it");
    }
    const { expenseRequireOverrideReason } =
      await import("../infrastructure/expense-lifecycle.repository");
    overrideReason = expenseRequireOverrideReason(entry.draftPostReason);
  }

  if (await linesWithMissingAccounts(tx, input.entryId)) {
    throw new BusinessRuleError(
      "Every expense line needs an active, postable expense account mapping",
    );
  }

  const role = await payableRole(entry);
  // Resolve before changing status so a missing role never leaves a document
  // apparently posted without its journal.
  await expensePostingAccountCode(tx, role);
  const taxAccount =
    entry.taxRecoverable && (await hasTaxableLines(tx, input.entryId))
      ? await expensePostingAccountCode(tx, "INPUT_TAX")
      : null;

  if (await existingExpenseJournal(tx, input.entryId)) {
    throw new BusinessRuleError(
      "This expense already has a journal entry; reload it instead of posting again",
    );
  }

  await markPosted(tx, { entryId: input.entryId, actorId: userId });
  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: input.entryId,
    action: "posted",
    from: entry.status,
    to: "POSTED",
    reason:
      overrideReason !== null ? `Posted from draft by owner override: ${overrideReason}` : null,
    actor: userId,
  });

  const lines: Array<Record<string, unknown>> = [];
  let tax = 0;
  for (const g of await postingGroups(tx, input.entryId, entry.taxRecoverable)) {
    if (g.debitAmount > 0) {
      lines.push({
        account_code: g.accountCode,
        debit: g.debitAmount,
        memo: `مصروف ${entry.reference} — ${g.label}`,
      });
    }
    tax += g.taxAmount;
  }
  if (tax > 0 && entry.taxRecoverable && taxAccount) {
    lines.push({
      account_code: taxAccount,
      debit: tax,
      memo: `ضريبة قابلة للاسترداد على مصروف ${entry.reference}`,
    });
  }
  lines.push({
    account_code: await expensePostingAccountCode(tx, role),
    credit: entry.totalAmount,
    memo: `التزام مصروف ${entry.reference}`,
  });

  await createJournalEntryInner(tx, session, {
    memo: `إثبات استحقاق مصروف ${entry.reference}`,
    entryDate: entry.expenseDate,
    sourceType: "expense",
    sourceId: input.entryId,
    isSystem: true,
    lines: lines as never,
  });

  if (entry.payeeType === "SUPPLIER" && entry.supplierId) {
    await expenseWriteSupplierLedger(tx, {
      supplierId: entry.supplierId,
      entryType: "EXPENSE_ACCRUAL",
      side: "CREDIT",
      amount: entry.totalAmount,
      referenceType: "expense",
      referenceId: input.entryId,
      sourceKey: `EXP-${input.entryId}`,
      dueDate: entry.dueDate,
      occurredAt: new Date(`${entry.expenseDate}T00:00:00Z`),
      note: `مصروف ${entry.reference}`,
      actor: userId,
    });
  }

  if (input.payNow === true) {
    await recordExpensePaymentInner(tx, session, {
      entryId: input.entryId,
      amount: entry.totalAmount,
      paymentDate: input.paymentDate ?? new Date().toISOString().slice(0, 10),
      paymentMethod: input.paymentMethod ?? "cash",
      accountLabel: input.accountLabel ?? null,
      referenceNo: null,
      note: "Settled at posting",
      idempotencyKey: input.idempotencyKey?.trim() || `post:${input.entryId}`,
      accountId: input.accountId ?? null,
      cashboxId: input.cashboxId ?? null,
      bankAccountId: input.bankAccountId ?? null,
      paymentMethodId: input.paymentMethodId ?? null,
    });
  }
  return getEntryJson(tx, input.entryId);
}

export function postExpense(session: ServerSession, input: PostExpenseInput): Promise<EntryJson> {
  return withTransaction((tx) => postExpenseInner(tx, session, input));
}

// ── record_expense_payment ──────────────────────────────────────────────────

export interface RecordExpensePaymentInput {
  entryId: string;
  amount: number;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  accountLabel?: string | null;
  referenceNo?: string | null;
  note?: string | null;
  idempotencyKey?: string | null;
  accountId?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  paymentMethodId?: string | null;
}

export async function recordExpensePaymentInner(
  tx: PoolClient,
  session: ServerSession,
  input: RecordExpensePaymentInput,
): Promise<EntryJson> {
  const userId = session.userId;
  const entry = await lockExpenseEntry(tx, input.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  await assertCapability(tx, session, "expense.pay");
  const amount = Math.round((input.amount ?? 0) * 100) / 100;
  if (amount <= 0) {
    throw new BusinessRuleError("Payment amount is invalid or exceeds remaining amount");
  }
  const key = input.idempotencyKey?.trim() || null;
  if (key) {
    const existing = await findIdempotentPayment(tx, key);
    if (existing) {
      if (existing.entryId !== input.entryId || existing.amount !== amount) {
        throw new BusinessRuleError("Payment request key was already used for a different payment");
      }
      return getEntryJson(tx, input.entryId);
    }
  }
  if (!["POSTED", "PARTIALLY_PAID"].includes(entry.status)) {
    throw new BusinessRuleError(
      `Payments can only be recorded against posted expenses (current: ${entry.status})`,
    );
  }
  if (amount > entry.remainingAmount + 0.005) {
    throw new BusinessRuleError("Payment amount is invalid or exceeds remaining amount");
  }

  let label = input.accountLabel?.trim() || null;
  let cashAcct: string | null = null;
  if (input.cashboxId) {
    const { rows } = await tx.query<{ label: string | null; code: string }>(
      `SELECT c.name_ar AS label, a.code
         FROM public.cashboxes c JOIN public.accounts a ON a.id = c.account_id
        WHERE c.id = $1::uuid AND c.is_active AND a.account_type::text = 'ASSET'
          AND a.is_active AND a.is_postable`,
      [input.cashboxId],
    );
    if (!rows[0]) throw new BusinessRuleError("Cashbox is unavailable");
    label = rows[0].label;
    cashAcct = rows[0].code;
  } else if (input.bankAccountId) {
    const { rows } = await tx.query<{ label: string | null; code: string }>(
      `SELECT b.name_ar AS label, a.code
         FROM public.company_bank_accounts b JOIN public.accounts a ON a.id = b.account_id
        WHERE b.id = $1::uuid AND b.is_active AND a.account_type::text = 'ASSET'
          AND a.is_active AND a.is_postable`,
      [input.bankAccountId],
    );
    if (!rows[0]) throw new BusinessRuleError("Bank account is unavailable");
    label = rows[0].label;
    cashAcct = rows[0].code;
  } else if (input.accountId) {
    const { rows } = await tx.query<{ label: string | null; code: string }>(
      `SELECT a.name_ar AS label, a.code FROM public.accounts a
        WHERE a.id = $1::uuid AND a.account_type::text = 'ASSET' AND a.is_active AND a.is_postable`,
      [input.accountId],
    );
    if (!rows[0]) {
      throw new BusinessRuleError("The selected settlement account is unavailable");
    }
    label = rows[0].label;
    cashAcct = rows[0].code;
  }
  if (cashAcct === null) {
    const { paymentMethodLedgerAccount } =
      await import("@/server/domains/purchasing/infrastructure/purchasing.repository");
    cashAcct = await paymentMethodLedgerAccount(tx, input.paymentMethod ?? "cash");
  }
  if (cashAcct === null) {
    throw new BusinessRuleError("No active ledger account is configured for this payment method");
  }
  {
    const { rows } = await tx.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM public.accounts a
          WHERE a.code = $1 AND a.account_type::text = 'ASSET'
            AND a.is_active AND a.is_postable
       ) AS ok`,
      [cashAcct],
    );
    if (!rows[0].ok) {
      throw new BusinessRuleError(
        "The payment method is not linked to an active, postable cash or bank account",
      );
    }
  }
  const creditAcct = await expensePostingAccountCode(tx, await payableRole(entry));

  const paymentId = await insertExpensePayment(tx, {
    entryId: input.entryId,
    amount,
    paymentDate: input.paymentDate ?? new Date().toISOString().slice(0, 10),
    paymentMethod: input.paymentMethod ?? "cash",
    accountLabel: label,
    referenceNo: input.referenceNo?.trim() || null,
    note: input.note?.trim() || null,
    idempotencyKey: key,
    createdBy: userId,
    accountId: input.accountId ?? null,
    cashboxId: input.cashboxId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    paymentMethodId: input.paymentMethodId ?? null,
  });

  await createJournalEntryInner(tx, session, {
    memo: `سداد مصروف ${entry.reference}`,
    entryDate: input.paymentDate ?? new Date().toISOString().slice(0, 10),
    sourceType: "expense_payment",
    sourceId: paymentId,
    isSystem: true,
    lines: [
      {
        account_code: creditAcct,
        debit: amount,
        memo: `تسوية التزام مصروف ${entry.reference}`,
      },
      {
        account_code: cashAcct,
        credit: amount,
        memo: `صرف دفعة مصروف ${entry.reference}`,
      },
    ] as never,
  });

  if (entry.payeeType === "SUPPLIER" && entry.supplierId) {
    await expenseWriteSupplierLedger(tx, {
      supplierId: entry.supplierId,
      entryType: "EXPENSE_PAYMENT",
      side: "DEBIT",
      amount,
      referenceType: "expense_payment",
      referenceId: paymentId,
      sourceKey: `EXPPAY-${paymentId}`,
      dueDate: entry.dueDate,
      occurredAt: new Date(
        `${input.paymentDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
      ),
      note: input.note?.trim() || `سداد مصروف ${entry.reference}`,
      actor: userId,
    });
  }

  const after = await lockExpenseEntry(tx, input.entryId);
  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: input.entryId,
    action: "payment",
    from: after?.status ?? entry.status,
    to: after?.status ?? entry.status,
    reason: `Payment of ${amount} ${entry.currencySymbol} recorded`,
    actor: userId,
  });
  return getEntryJson(tx, input.entryId);
}

export function recordExpensePayment(
  session: ServerSession,
  input: RecordExpensePaymentInput,
): Promise<EntryJson> {
  return withTransaction((tx) => recordExpensePaymentInner(tx, session, input));
}

// ── reverse_expense_payment ─────────────────────────────────────────────────

export async function reverseExpensePaymentInner(
  tx: PoolClient,
  session: ServerSession,
  input: { paymentId: string; reason?: string | null },
): Promise<EntryJson> {
  const userId = session.userId;
  const payment = await lockPayment(tx, input.paymentId);
  if (!payment) throw new BusinessRuleError("Payment not found");
  await assertCapability(tx, session, "expense.payment.reverse");
  if (payment.reversedById !== null) {
    return getEntryJson(tx, payment.entryId);
  }
  if (payment.reversalOfId !== null) {
    throw new BusinessRuleError("A reversal row cannot itself be reversed");
  }
  const entry = await lockExpenseEntry(tx, payment.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");

  const journalId = await findPostedPaymentJournal(tx, payment.id);
  if (journalId) {
    await reverseJournalEntryInner(tx, session, {
      entryId: journalId,
      reason: input.reason?.trim() || "عكس دفعة المصروف",
    });
  }

  const reversalId = await insertExpensePayment(tx, {
    entryId: payment.entryId,
    amount: payment.amount,
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: payment.paymentMethod,
    accountLabel: payment.accountLabel,
    referenceNo: payment.referenceNo,
    note: input.reason?.trim() || "Reversal of payment",
    idempotencyKey: null,
    createdBy: userId,
    accountId: payment.accountId,
    cashboxId: payment.cashboxId,
    bankAccountId: payment.bankAccountId,
    paymentMethodId: payment.paymentMethodId,
    reversalOf: payment.id,
  });
  await markPaymentReversed(tx, { paymentId: payment.id, reversalId });

  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: payment.entryId,
    action: "payment",
    from: entry.status,
    to: entry.status,
    reason: "Payment reversed",
    actor: userId,
  });
  return getEntryJson(tx, payment.entryId);
}

export function reverseExpensePayment(
  session: ServerSession,
  input: { paymentId: string; reason?: string | null },
): Promise<EntryJson> {
  return withTransaction((tx) => reverseExpensePaymentInner(tx, session, input));
}

// ── close_expense ───────────────────────────────────────────────────────────

export async function closeExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  entryId: string,
): Promise<EntryJson> {
  const userId = session.userId;
  const entry = await lockExpenseEntry(tx, entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  await assertCapability(tx, session, "expense.post");
  if (entry.status === "CLOSED") return getEntryJson(tx, entryId);
  if (!["POSTED", "PARTIALLY_PAID", "PAID"].includes(entry.status)) {
    throw new BusinessRuleError(`Only a posted expense can be closed (current: ${entry.status})`);
  }
  if (entry.remainingAmount > 0.005) {
    throw new BusinessRuleError(`This expense still has ${entry.remainingAmount} outstanding`);
  }
  await markClosed(tx, entryId);
  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId,
    action: "closed",
    from: "PAID",
    to: "CLOSED",
    reason: null,
    actor: userId,
  });
  return getEntryJson(tx, entryId);
}

export function closeExpense(session: ServerSession, entryId: string): Promise<EntryJson> {
  return withTransaction((tx) => closeExpenseInner(tx, session, entryId));
}

// ── cancel_expense ──────────────────────────────────────────────────────────

export async function cancelExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  input: { entryId: string; reason: string; expectedVersion?: number | null },
): Promise<EntryJson> {
  const userId = session.userId;
  const entry = await lockExpenseEntry(tx, input.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  if (input.reason.trim() === "") {
    throw new BusinessRuleError("A reason is required when cancelling an expense");
  }
  if (["POSTED", "PARTIALLY_PAID", "PAID", "CLOSED", "REVERSED"].includes(entry.status)) {
    throw new BusinessRuleError("A posted expense cannot be cancelled — reverse it instead");
  }
  if (entry.status === "CANCELLED") return getEntryJson(tx, input.entryId);
  if (!["DRAFT", "REJECTED", "SUBMITTED", "APPROVED"].includes(entry.status)) {
    throw new BusinessRuleError(`This expense cannot be cancelled from status ${entry.status}`);
  }
  if (entry.createdBy === userId && ["DRAFT", "REJECTED"].includes(entry.status)) {
    await assertCapability(tx, session, "expense.edit");
  } else {
    await assertCapability(tx, session, "expense.cancel");
  }
  await checkVersion(input.expectedVersion, entry.version);

  await markCancelled(tx, { entryId: input.entryId, actorId: userId, reason: input.reason });
  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: input.entryId,
    action: "cancelled",
    from: entry.status,
    to: "CANCELLED",
    reason: input.reason,
    actor: userId,
  });
  return getEntryJson(tx, input.entryId);
}

export function cancelExpense(
  session: ServerSession,
  input: { entryId: string; reason: string; expectedVersion?: number | null },
): Promise<EntryJson> {
  return withTransaction((tx) => cancelExpenseInner(tx, session, input));
}

// ── reverse_expense ─────────────────────────────────────────────────────────

export async function reverseExpenseInner(
  tx: PoolClient,
  session: ServerSession,
  input: { entryId: string; reason?: string | null },
): Promise<EntryJson> {
  const userId = session.userId;
  const entry = await lockExpenseEntry(tx, input.entryId);
  if (!entry) throw new BusinessRuleError("Expense not found");
  await assertCapability(tx, session, "expense.reverse");
  if (entry.status === "REVERSED") return getEntryJson(tx, input.entryId);
  if (!["POSTED", "PARTIALLY_PAID", "PAID"].includes(entry.status)) {
    throw new BusinessRuleError(`Only a posted expense can be reversed (current: ${entry.status})`);
  }
  if (entry.paidAmount > 0) {
    throw new BusinessRuleError(`Reverse the recorded payments first (paid: ${entry.paidAmount})`);
  }

  const original = await findPostedExpenseJournal(tx, input.entryId);
  if (original) {
    await reverseJournalEntryInner(tx, session, {
      entryId: original,
      reason: input.reason?.trim() || "عكس المصروف",
    });
  }

  const reversalId = await insertExpenseReversalEntry(tx, {
    original: entry,
    actorId: userId,
    reason: input.reason ?? null,
  });
  await copyExpenseLines(tx, { fromEntryId: input.entryId, toEntryId: reversalId });
  await updateExpenseEntryTotals(tx, {
    entryId: reversalId,
    total: entry.totalAmount,
    lineCount: entry.lineCount,
  });
  await markReversed(tx, { entryId: input.entryId, reversalId });

  if (entry.payeeType === "SUPPLIER" && entry.supplierId) {
    await expenseReverseSupplierLedger(tx, {
      supplierId: entry.supplierId,
      sourceKey: `EXP-${input.entryId}`,
      referenceType: "expense",
      referenceId: input.entryId,
      reversalKey: `EXP-REV-${input.entryId}`,
      note: `عكس مصروف ${entry.reference}`,
      actor: userId,
    });
  }

  const { expenseLogAction } = await import("../infrastructure/expenses.repository");
  await expenseLogAction(tx, {
    entryId: input.entryId,
    action: "reversed",
    from: "POSTED",
    to: "REVERSED",
    reason: input.reason?.trim() || "Reversed",
    actor: userId,
  });
  return getEntryJson(tx, input.entryId);
}

export function reverseExpense(
  session: ServerSession,
  input: { entryId: string; reason?: string | null },
): Promise<EntryJson> {
  return withTransaction((tx) => reverseExpenseInner(tx, session, input));
}

export { expenseSettlementStatus };
