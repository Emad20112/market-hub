/** الوصول للبيانات لدورة حياة المصاريف — المرحلة 10b (SQL داخل infrastructure فقط). */
import type { PoolClient } from "pg";
import { expenseRound } from "./expenses.repository";

export async function nextExpenseReference(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT public.fn_next_document_number('expense') AS n",
  );
  return rows[0].n;
}

/** expense_require_override_reason حرفيًا: سبب ≥ 10 أحرف لتجاوز ترحيل المسودة. */
export function expenseRequireOverrideReason(reason: string | null): string {
  const v = reason?.trim() || null;
  if (v === null) {
    throw new Error("A written reason is required to post a draft expense without prior approval");
  }
  if (v.length < 10) {
    throw new Error("The override reason is too short to be auditable (minimum 10 characters)");
  }
  return v;
}

export interface ExpenseEntryRow {
  id: string;
  reference: string;
  entryType: string;
  status: string;
  sourceKind: string;
  payeeType: string;
  payeeName: string | null;
  supplierId: string | null;
  employeeId: string | null;
  warehouseId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  expenseDate: string;
  dueDate: string | null;
  description: string | null;
  note: string | null;
  taxMode: string;
  taxRecoverable: boolean;
  currency: string;
  currencySymbol: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  lineCount: number;
  version: number;
  createdBy: string | null;
  allowDraftPost: boolean;
  draftPostReason: string | null;
  approvalRequiredRank: number;
  submittedById: string | null;
}

type RawEntry = Record<string, unknown>;

export async function lockExpenseEntry(
  tx: PoolClient,
  entryId: string,
): Promise<ExpenseEntryRow | null> {
  const { rows } = await tx.query<RawEntry>(
    `SELECT * FROM public.expense_entries WHERE id = $1::uuid FOR UPDATE`,
    [entryId],
  );
  return mapEntry(rows[0]);
}

function mapEntry(r: RawEntry | undefined): ExpenseEntryRow | null {
  if (!r) return null;
  return {
    id: String(r.id),
    reference: String(r.reference),
    entryType: String(r.entry_type),
    status: String(r.status),
    sourceKind: String(r.source_kind),
    payeeType: String(r.payee_type),
    payeeName: (r.payee_name as string | null) ?? null,
    supplierId: (r.supplier_id as string | null) ?? null,
    employeeId: (r.employee_id as string | null) ?? null,
    warehouseId: (r.warehouse_id as string | null) ?? null,
    costCenterId: (r.cost_center_id as string | null) ?? null,
    projectId: (r.project_id as string | null) ?? null,
    expenseDate: String(r.expense_date).slice(0, 10),
    dueDate: r.due_date ? String(r.due_date).slice(0, 10) : null,
    description: (r.description as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    taxMode: String(r.tax_mode),
    taxRecoverable: r.tax_recoverable === true,
    currency: String(r.currency),
    currencySymbol: String(r.currency_symbol),
    totalAmount: Number(r.total_amount ?? 0),
    paidAmount: Number(r.paid_amount ?? 0),
    remainingAmount: Number(r.remaining_amount ?? 0),
    lineCount: Number(r.line_count ?? 0),
    version: Number(r.version ?? 0),
    createdBy: (r.created_by as string | null) ?? null,
    allowDraftPost: r.allow_draft_post === true,
    draftPostReason: (r.draft_post_reason as string | null) ?? null,
    approvalRequiredRank: Number(r.approval_required_rank ?? 0),
    submittedById: (r.submitted_by as string | null) ?? null,
  };
}

/** إدراج مستند مصروف (create_expense_v2) — أعمدة كاملة كما الأصل. */
export async function insertExpenseEntry(
  tx: PoolClient,
  a: {
    reference: string;
    entryType: string;
    status: string;
    payeeType: string;
    payeeName: string | null;
    supplierId: string | null;
    employeeId: string | null;
    warehouseId: string | null;
    costCenterId: string | null;
    projectId: string | null;
    expenseDate: string;
    dueDate: string | null;
    description: string | null;
    note: string | null;
    taxMode: string;
    taxRecoverable: boolean;
    supplierInvoiceNumber: string | null;
    idempotencyKey: string | null;
    currency: string;
    currencySymbol: string;
    createdBy: string;
    submit: boolean;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.expense_entries (
       reference, entry_type, status, source_kind, payee_type, payee_name,
       supplier_id, employee_id, warehouse_id, cost_center_id, project_id,
       expense_date, due_date, description, note, tax_mode, tax_recoverable,
       supplier_invoice_number, create_idempotency_key, currency, currency_symbol,
       created_by, submitted_by, submitted_at
     ) VALUES (
       $1, $2::public.expense_entry_type, $3::public.expense_status, 'MANUAL',
       $4::public.expense_payee_type, $5,
       CASE WHEN $4 = 'SUPPLIER' THEN $6::uuid END,
       CASE WHEN $4 = 'EMPLOYEE' THEN $7::uuid END,
       $8::uuid, $9::uuid, $10::uuid,
       $11::date, $12::date, $13, $14, $15::public.expense_tax_mode, $16,
       $17, $18, $19, $20, $21::uuid,
       CASE WHEN $22 THEN $21::uuid END,
       CASE WHEN $22 THEN now() END
     )
     RETURNING id::text AS id`,
    [
      a.reference,
      a.entryType,
      a.status,
      a.payeeType,
      a.payeeName,
      a.supplierId,
      a.employeeId,
      a.warehouseId,
      a.costCenterId,
      a.projectId,
      a.expenseDate,
      a.dueDate,
      a.description,
      a.note,
      a.taxMode,
      a.taxRecoverable,
      a.supplierInvoiceNumber,
      a.idempotencyKey,
      a.currency,
      a.currencySymbol,
      a.createdBy,
      a.submit,
    ],
  );
  return rows[0].id;
}

export async function supplierInvoiceNumberExists(
  tx: PoolClient,
  args: { supplierId: string | null; invoiceNumber: string; excludeEntryId?: string | null },
): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.expense_entries e
        WHERE e.supplier_id = $1::uuid
          AND lower(btrim(e.supplier_invoice_number)) = lower($2)
          AND e.status <> 'CANCELLED'
          AND ($3::uuid IS NULL OR e.id <> $3::uuid)
     ) AS ok`,
    [args.supplierId, args.invoiceNumber, args.excludeEntryId ?? null],
  );
  return rows[0]?.ok === true;
}

export async function companyCurrency(
  tx: PoolClient,
): Promise<{ currency: string; symbol: string }> {
  const { rows } = await tx.query<{ currency: string | null; currency_symbol: string | null }>(
    `SELECT currency, currency_symbol FROM public.company_settings ORDER BY id LIMIT 1`,
  );
  return {
    currency: rows[0]?.currency?.trim() || "YER",
    symbol: rows[0]?.currency_symbol?.trim() || "﷼",
  };
}

export async function findIdempotentEntry(
  tx: PoolClient,
  args: { createdBy: string; idempotencyKey: string },
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id::text FROM public.expense_entries
      WHERE created_by = $1::uuid AND create_idempotency_key = $2`,
    [args.createdBy, args.idempotencyKey],
  );
  return rows[0]?.id ?? null;
}

/** expense_write_lines حرفيًا: حذف السطور وإعادة حسابها (INCLUSIVE/EXCLUSIVE/NONE). */
export async function writeExpenseLines(
  tx: PoolClient,
  args: { entryId: string; lines: unknown; taxMode: string },
): Promise<{ total: number; count: number }> {
  const raw = args.lines;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("At least one expense line is required");
  }
  await tx.query("DELETE FROM public.expense_lines WHERE entry_id = $1::uuid", [args.entryId]);

  let total = 0;
  let count = 0;
  let index = 0;
  for (const l of raw as Array<Record<string, unknown>>) {
    index += 1;
    const qty = Number(l.quantity ?? 1);
    const price = Number(l.unit_price ?? 0);
    const rate = Number(l.tax_rate ?? 0);
    if (qty <= 0 || price < 0 || rate < 0 || rate > 100) {
      throw new Error(`Line ${index} has an invalid quantity, amount, or tax rate`);
    }
    if (rate > 0 && args.taxMode === "NONE") {
      throw new Error("Choose inclusive or exclusive tax treatment for a taxed line");
    }

    const inputAmount = expenseRound(qty * price);
    let net: number;
    let tax: number;
    let gross: number;
    if (args.taxMode === "EXCLUSIVE" && rate > 0) {
      net = inputAmount;
      tax = expenseRound((net * rate) / 100);
      gross = net + tax;
    } else if (args.taxMode === "INCLUSIVE" && rate > 0) {
      gross = inputAmount;
      net = expenseRound(gross / (1 + rate / 100));
      tax = gross - net;
    } else {
      net = inputAmount;
      tax = 0;
      gross = inputAmount;
    }

    await tx.query(
      `INSERT INTO public.expense_lines (
         entry_id, line_no, description, category_id, quantity, unit_price,
         net_amount, tax_rate, tax_amount, gross_amount,
         cost_center_id, project_id, note
       ) VALUES (
         $1::uuid, $2, $3, $4::uuid, $5::numeric, $6::numeric,
         $7::numeric, $8::numeric, $9::numeric, $10::numeric,
         $11::uuid, $12::uuid, $13
       )`,
      [
        args.entryId,
        index,
        (l.description as string | null)?.trim() || null,
        (l.category_id as string | null) || null,
        qty,
        price,
        net,
        rate,
        tax,
        gross,
        (l.cost_center_id as string | null) || null,
        (l.project_id as string | null) || null,
        (l.note as string | null)?.trim() || null,
      ],
    );
    total += gross;
    count += 1;
  }

  total = expenseRound(total);
  if (total <= 0) throw new Error("Expense total must be greater than zero");
  return { total, count };
}

export async function updateExpenseEntryTotals(
  tx: PoolClient,
  args: { entryId: string; total: number; lineCount: number },
): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries SET total_amount = $2::numeric, line_count = $3
      WHERE id = $1::uuid`,
    [args.entryId, args.total, args.lineCount],
  );
}

export async function updateExpenseHeader(
  tx: PoolClient,
  a: {
    entryId: string;
    expenseDate: string | null;
    dueDate: string | null;
    entryType: string | null;
    payeeType: string;
    payeeName: string | null;
    supplierId: string | null;
    employeeId: string | null;
    warehouseId: string | null;
    costCenterId: string | null;
    projectId: string | null;
    description: string | null;
    note: string | null;
    taxMode: string;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries
        SET expense_date   = COALESCE($2::date, expense_date),
            due_date       = $3::date,
            entry_type     = COALESCE($4::public.expense_entry_type, entry_type),
            payee_type     = $5::public.expense_payee_type,
            payee_name     = nullif(btrim(coalesce($6, '')), ''),
            supplier_id    = CASE WHEN $5 = 'SUPPLIER' THEN $7::uuid END,
            employee_id    = CASE WHEN $5 = 'EMPLOYEE' THEN $8::uuid END,
            warehouse_id   = $9::uuid,
            cost_center_id = $10::uuid,
            project_id     = $11::uuid,
            description    = nullif(btrim(coalesce($12, '')), ''),
            note           = nullif(btrim(coalesce($13, '')), ''),
            tax_mode       = $14::public.expense_tax_mode,
            status         = 'DRAFT'::public.expense_status,
            rejection_reason = NULL,
            version        = version + 1
      WHERE id = $1::uuid`,
    [
      a.entryId,
      a.expenseDate,
      a.dueDate,
      a.entryType,
      a.payeeType,
      a.payeeName,
      a.supplierId,
      a.employeeId,
      a.warehouseId,
      a.costCenterId,
      a.projectId,
      a.description,
      a.note,
      a.taxMode,
    ],
  );
}

export async function updateTaxFields(
  tx: PoolClient,
  args: { entryId: string; taxRecoverable: boolean; invoiceNumber: string | null },
): Promise<boolean> {
  const { rowCount } = await tx.query(
    `UPDATE public.expense_entries
        SET tax_recoverable = $2, supplier_invoice_number = $3
      WHERE id = $1::uuid AND status IN ('DRAFT', 'REJECTED')`,
    [args.entryId, args.taxRecoverable, args.invoiceNumber],
  );
  return (rowCount ?? 0) > 0;
}

/** إرجاع الصف كاملًا كـ jsonb (كما يُرجع الأصل *). */
export async function getEntryJson(tx: PoolClient, entryId: string): Promise<unknown> {
  const { rows } = await tx.query<{ j: unknown }>(
    "SELECT to_jsonb(e) AS j FROM public.expense_entries e WHERE id = $1::uuid",
    [entryId],
  );
  return rows[0]?.j ?? null;
}

// ── transitions ─────────────────────────────────────────────────────────────

export async function markSubmittedWithActor(
  tx: PoolClient,
  args: { entryId: string; actorId: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries
        SET status = 'SUBMITTED', submitted_by = $2::uuid, submitted_at = now(),
            rejection_reason = NULL, version = version + 1
      WHERE id = $1::uuid`,
    [args.entryId, args.actorId],
  );
}

export async function markCancelled(
  tx: PoolClient,
  args: { entryId: string; actorId: string; reason: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries
        SET status = 'CANCELLED', cancelled_by = $2::uuid, cancelled_at = now(),
            cancel_reason = nullif(btrim($3), ''), version = version + 1
      WHERE id = $1::uuid`,
    [args.entryId, args.actorId, args.reason],
  );
}

export async function markPosted(
  tx: PoolClient,
  args: { entryId: string; actorId: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries
        SET status = 'POSTED', posting_date = coalesce(posting_date, CURRENT_DATE),
            posted_by = $2::uuid, posted_at = now(), version = version + 1
      WHERE id = $1::uuid`,
    [args.entryId, args.actorId],
  );
}

export async function markClosed(tx: PoolClient, entryId: string): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries SET status = 'CLOSED', version = version + 1 WHERE id = $1::uuid`,
    [entryId],
  );
}

export async function markReversed(
  tx: PoolClient,
  args: { entryId: string; reversalId: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries SET status = 'REVERSED', reversed_by_id = $2::uuid, version = version + 1
      WHERE id = $1::uuid`,
    [args.entryId, args.reversalId],
  );
}

export interface DecideFields {
  approve: boolean;
  actorId: string;
  reason: string | null;
  fromStatus: string;
}

export async function applyDecision(
  tx: PoolClient,
  a: DecideFields & { entryId: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.expense_entries
        SET status = CASE WHEN $2 THEN 'APPROVED'::public.expense_status ELSE 'REJECTED'::public.expense_status END,
            version = version + 1,
            allow_draft_post = CASE WHEN $2 AND $6 = 'DRAFT' THEN true ELSE allow_draft_post END,
            draft_post_reason = CASE WHEN $2 AND $6 = 'DRAFT' THEN $3 ELSE draft_post_reason END,
            approved_by = CASE WHEN $2 THEN $4::uuid END,
            approved_at = CASE WHEN $2 THEN now() END,
            submitted_by = CASE WHEN $2 AND $6 = 'DRAFT' THEN $4::uuid ELSE submitted_by END,
            submitted_at = CASE WHEN $2 AND $6 = 'DRAFT' THEN now() ELSE submitted_at END,
            rejected_by = CASE WHEN NOT $2 THEN $4::uuid END,
            rejected_at = CASE WHEN NOT $2 THEN now() END,
            rejection_reason = CASE WHEN NOT $2 THEN $3 END,
            cancelled_by = NULL,
            cancelled_at = NULL,
            cancel_reason = NULL
      WHERE id = $1::uuid`,
    [a.entryId, a.approve, a.reason, a.actorId, null, a.fromStatus],
  );
}

// ── posting lines (post_expense) ────────────────────────────────────────────

export interface PostingGroup {
  accountCode: string;
  label: string;
  debitAmount: number;
  taxAmount: number;
}

export async function postingGroups(
  tx: PoolClient,
  entryId: string,
  taxRecoverable: boolean,
): Promise<PostingGroup[]> {
  const { rows } = await tx.query<{
    account_code: string;
    label: string;
    debit_amount: string;
    tax_amount: string;
  }>(
    `SELECT a.code::text AS account_code,
            coalesce(c.name_ar, c.name, 'مصروف') AS label,
            round(sum(l.net_amount + CASE WHEN $2 THEN 0 ELSE l.tax_amount END), 2)::text AS debit_amount,
            round(sum(l.tax_amount), 2)::text AS tax_amount
       FROM public.expense_lines l
       JOIN public.expense_categories c ON c.id = l.category_id
       JOIN public.accounts a ON a.id = c.account_id
      WHERE l.entry_id = $1::uuid
      GROUP BY a.code, coalesce(c.name_ar, c.name, 'مصروف')`,
    [entryId, taxRecoverable],
  );
  return rows.map((r) => ({
    accountCode: r.account_code,
    label: r.label,
    debitAmount: Number(r.debit_amount),
    taxAmount: Number(r.tax_amount),
  }));
}

export async function linesWithMissingAccounts(tx: PoolClient, entryId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM public.expense_lines l
         LEFT JOIN public.expense_categories c ON c.id = l.category_id
         LEFT JOIN public.accounts a ON a.id = c.account_id
        WHERE l.entry_id = $1::uuid
          AND (c.id IS NULL OR c.account_id IS NULL OR a.id IS NULL
               OR a.account_type::text <> 'EXPENSE' OR NOT a.is_active OR NOT a.is_postable)
     ) AS ok`,
    [entryId],
  );
  return rows[0]?.ok === true;
}

export async function hasTaxableLines(tx: PoolClient, entryId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.expense_lines WHERE entry_id = $1::uuid AND tax_amount > 0) AS ok",
    [entryId],
  );
  return rows[0]?.ok === true;
}

export async function existingExpenseJournal(
  tx: PoolClient,
  entryId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string | null }>(
    `SELECT id::text FROM public.journal_entries
      WHERE source_type = 'expense' AND source_id = $1::uuid`,
    [entryId],
  );
  return rows[0]?.id ?? null;
}

// ── payments ────────────────────────────────────────────────────────────────

export async function findIdempotentPayment(
  tx: PoolClient,
  idempotencyKey: string,
): Promise<{ entryId: string; amount: number } | null> {
  const { rows } = await tx.query<{ entry_id: string; amount: string }>(
    "SELECT entry_id::text, amount::text FROM public.expense_payments WHERE idempotency_key = $1",
    [idempotencyKey],
  );
  return rows[0] ? { entryId: rows[0].entry_id, amount: Number(rows[0].amount) } : null;
}

export async function insertExpensePayment(
  tx: PoolClient,
  a: {
    entryId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    accountLabel: string | null;
    referenceNo: string | null;
    note: string | null;
    idempotencyKey: string | null;
    createdBy: string;
    accountId: string | null;
    cashboxId: string | null;
    bankAccountId: string | null;
    paymentMethodId: string | null;
    reversalOf?: string | null;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.expense_payments (
       entry_id, amount, payment_date, payment_method, account_label, reference_no,
       note, idempotency_key, created_by, account_id, cashbox_id, bank_account_id, payment_method_id,
       reversal_of
     ) VALUES (
       $1::uuid, $2::numeric, $3::date, $4::public.payment_method, $5, $6, $7,
       $8, $9::uuid, $10::uuid, $11::uuid, $12::uuid, $13, $14::uuid
     )
     RETURNING id::text AS id`,
    [
      a.entryId,
      a.amount,
      a.paymentDate,
      a.paymentMethod,
      a.accountLabel,
      a.referenceNo,
      a.note,
      a.idempotencyKey,
      a.createdBy,
      a.accountId,
      a.cashboxId,
      a.bankAccountId,
      a.paymentMethodId,
      a.reversalOf ?? null,
    ],
  );
  return rows[0].id;
}

export async function markPaymentReversed(
  tx: PoolClient,
  args: { paymentId: string; reversalId: string },
): Promise<void> {
  await tx.query("UPDATE public.expense_payments SET reversed_by = $2::uuid WHERE id = $1::uuid", [
    args.paymentId,
    args.reversalId,
  ]);
}

export interface PaymentRow {
  id: string;
  entryId: string;
  amount: number;
  paymentMethod: string;
  accountLabel: string | null;
  referenceNo: string | null;
  reversedById: string | null;
  reversalOfId: string | null;
  accountId: string | null;
  cashboxId: string | null;
  bankAccountId: string | null;
  paymentMethodId: string | null;
}

export async function lockPayment(tx: PoolClient, paymentId: string): Promise<PaymentRow | null> {
  const { rows } = await tx.query<RawEntry>(
    `SELECT * FROM public.expense_payments WHERE id = $1::uuid FOR UPDATE`,
    [paymentId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    entryId: String(r.entry_id),
    amount: Number(r.amount),
    paymentMethod: String(r.payment_method),
    accountLabel: (r.account_label as string | null) ?? null,
    referenceNo: (r.reference_no as string | null) ?? null,
    reversedById: (r.reversed_by as string | null) ?? null,
    reversalOfId: (r.reversal_of as string | null) ?? null,
    accountId: (r.account_id as string | null) ?? null,
    cashboxId: (r.cashbox_id as string | null) ?? null,
    bankAccountId: (r.bank_account_id as string | null) ?? null,
    paymentMethodId: (r.payment_method_id as string | null) ?? null,
  };
}

// ── reversal copy (reverse_expense) ─────────────────────────────────────────

export async function insertExpenseReversalEntry(
  tx: PoolClient,
  args: {
    original: ExpenseEntryRow;
    actorId: string;
    reason: string | null;
  },
): Promise<string> {
  const o = args.original;
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.expense_entries (
       reference, entry_type, status, source_kind,
       payee_type, payee_name, supplier_id, employee_id,
       warehouse_id, cost_center_id, project_id,
       expense_date, posting_date, description, note,
       tax_mode, tax_recoverable, currency, currency_symbol,
       reversal_of, created_by, posted_by, posted_at
     )
     VALUES (
       $1 || '-R', $2::public.expense_entry_type, 'POSTED'::public.expense_status, $3,
       $4::public.expense_payee_type, $5, $6::uuid, $7::uuid,
       $8::uuid, $9::uuid, $10::uuid,
       CURRENT_DATE, CURRENT_DATE, 'Reversal of ' || $1, nullif(btrim(coalesce($11, '')), ''),
       $12::public.expense_tax_mode, $13, $14, $15,
       $16::uuid, $17::uuid, $17::uuid, now()
     )
     RETURNING id::text AS id`,
    [
      o.reference,
      o.entryType,
      o.sourceKind,
      o.payeeType,
      o.payeeName,
      o.supplierId,
      o.employeeId,
      o.warehouseId,
      o.costCenterId,
      o.projectId,
      args.reason,
      o.taxMode,
      o.taxRecoverable,
      o.currency,
      o.currencySymbol,
      o.id,
      args.actorId,
    ],
  );
  return rows[0].id;
}

export async function copyExpenseLines(
  tx: PoolClient,
  args: { fromEntryId: string; toEntryId: string },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.expense_lines (
       entry_id, line_no, description, category_id, quantity, unit_price,
       net_amount, tax_rate, tax_amount, gross_amount,
       cost_center_id, project_id, note
     )
     SELECT $2::uuid, line_no, description, category_id, quantity, unit_price,
            net_amount, tax_rate, tax_amount, gross_amount,
            cost_center_id, project_id, note
       FROM public.expense_lines
      WHERE entry_id = $1::uuid
      ORDER BY line_no`,
    [args.fromEntryId, args.toEntryId],
  );
}

export async function findPostedExpenseJournal(
  tx: PoolClient,
  entryId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string | null }>(
    `SELECT je.id::text FROM public.journal_entries je
      WHERE je.source_type = 'expense' AND je.source_id = $1::uuid AND je.status <> 'REVERSED'`,
    [entryId],
  );
  return rows[0]?.id ?? null;
}

export async function findPostedPaymentJournal(
  tx: PoolClient,
  paymentId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string | null }>(
    `SELECT id::text FROM public.journal_entries
      WHERE source_type='expense_payment' AND source_id=$1::uuid AND status='POSTED' FOR UPDATE`,
    [paymentId],
  );
  return rows[0]?.id ?? null;
}
