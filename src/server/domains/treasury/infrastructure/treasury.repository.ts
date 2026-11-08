/**
 * مستودع الخزينة — المرحلة 7 (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج الوصول للبيانات كما في دوال 007/011 الأصلية (record_customer_payment،
 * record_customer_payment_splits، record_customer_advance_payment،
 * record_supplier_payment، recalculate_customer_balance، customer_balance_lock)
 * مع الحفاظ على الترتيب والأقفال حرفيًا.
 *
 * اعتماديات انتقالية (موثقة في DECISIONS-LOG):
 *  - create_journal_entry (المحاسبة) — حتى المرحلة 9.
 *  - resolve_writable_payment_method / resolve_document_settlement_account /
 *    payment_method_ledger_account تبقى في القاعدة (كتالوج طرق الدفع ومشغلاته).
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

/** اليوم/اللحظة/التوقيت التشغيلي — تبقى في القاعدة (مصدر واحد للضبط). */
export async function businessToday(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ d: string }>("SELECT public.business_today()::text AS d");
  return rows[0].d;
}

export async function businessNow(tx: PoolClient): Promise<Date> {
  const { rows } = await tx.query<{ t: string }>("SELECT public.business_now()::text AS t");
  return new Date(rows[0].t);
}

export async function businessTimestamp(
  tx: PoolClient,
  date: string,
  time = "00:00",
): Promise<Date> {
  const { rows } = await tx.query<{ t: string }>(
    "SELECT public.business_timestamp($1::date, $2::time)::text AS t",
    [date, time],
  );
  return new Date(rows[0].t);
}

export async function resolveWritablePaymentMethod(
  tx: PoolClient,
  value: string,
  context: string,
  strictContext: boolean,
): Promise<string> {
  const { rows } = await tx.query<{ m: string }>(
    "SELECT public.resolve_writable_payment_method($1::text, $2::text, $3::boolean)::text AS m",
    [value, context, strictContext],
  );
  return rows[0].m;
}

export async function paymentMethodLedgerAccount(
  tx: PoolClient,
  stored: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ a: string | null }>(
    "SELECT public.payment_method_ledger_account($1::text)::text AS a",
    [stored],
  );
  return rows[0]?.a ?? null;
}

export async function resolveDocumentSettlementAccount(
  tx: PoolClient,
  storedMethod: string,
  cashboxId: string | null,
  bankAccountId: string | null,
  methodId: string | null,
): Promise<string | null> {
  const { rows } = await tx.query<{ a: string | null }>(
    "SELECT public.resolve_document_settlement_account($1::text, $2::uuid, $3::uuid, $4::text)::text AS a",
    [storedMethod, cashboxId, bankAccountId, methodId],
  );
  return rows[0]?.a ?? null;
}

/** قفل صف العميل — يبقى في القاعدة (نفس دلالات الأصل: FOR UPDATE) ويُستدعى انتقاليًا. */
export async function customerBalanceLock(
  tx: PoolClient,
  customerId: string | null,
): Promise<number | null> {
  if (customerId === null) return null;
  const { rows } = await tx.query<{ balance: string | null }>(
    "SELECT public.customer_balance_lock($1::uuid)::text AS balance",
    [customerId],
  );
  return rows[0]?.balance !== undefined && rows[0]?.balance !== null
    ? Number(rows[0].balance)
    : null;
}

export async function customerLedgerBalance(tx: PoolClient, customerId: string): Promise<number> {
  const { rows } = await tx.query<{ b: string }>(
    `SELECT round(coalesce(sum(l.debit - l.credit), 0), 2)::text AS b
       FROM public.customer_ledger l WHERE l.customer_id = $1::uuid`,
    [customerId],
  );
  return Number(rows[0]?.b ?? 0);
}

export async function customerActive(tx: PoolClient, customerId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.customers WHERE id = $1::uuid AND is_active = true) AS ok",
    [customerId],
  );
  return rows[0]?.ok === true;
}

export interface InvoiceLockRow {
  id: string;
  customerId: string | null;
  total: number;
  paid: number;
}

export async function lockInvoiceById(
  tx: PoolClient,
  invoiceId: string,
): Promise<InvoiceLockRow | null> {
  const { rows } = await tx.query<{
    id: string;
    customer_id: string | null;
    total: string | null;
    paid: string | null;
  }>(
    `SELECT id::text, customer_id::text, total::text, paid::text
       FROM public.sales_invoices WHERE id = $1::uuid FOR UPDATE`,
    [invoiceId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    customerId: r.customer_id,
    total: Number(r.total ?? 0),
    paid: Number(r.paid ?? 0),
  };
}

/** الفواتير المفتوحة للعميل بتوزيع تلقائي — نفس ترتيب الأصل (created_at, id). */
export async function openInvoicesForCustomer(
  tx: PoolClient,
  customerId: string,
): Promise<Array<{ id: string; total: number; paid: number }>> {
  const { rows } = await tx.query<{ id: string; total: string; paid: string }>(
    `SELECT id::text, total::text, paid::text
       FROM public.sales_invoices
      WHERE customer_id = $1::uuid AND total > paid
        AND status NOT IN ('cancelled'::public.invoice_status, 'returned'::public.invoice_status)
      ORDER BY created_at ASC, id ASC
      FOR UPDATE`,
    [customerId],
  );
  return rows.map((r) => ({ id: r.id, total: Number(r.total), paid: Number(r.paid) }));
}

export async function customerOutstandingOnInvoices(
  tx: PoolClient,
  customerId: string,
): Promise<number> {
  const { rows } = await tx.query<{ o: string }>(
    `SELECT round(coalesce(sum(total - paid), 0), 2)::text AS o
       FROM public.sales_invoices
      WHERE customer_id = $1::uuid AND total > paid
        AND status NOT IN ('cancelled'::public.invoice_status, 'returned'::public.invoice_status)`,
    [customerId],
  );
  return Number(rows[0]?.o ?? 0);
}

export function derivePaymentStatus(paid: number, total: number): string {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

export interface InsertCustomerPaymentArgs {
  customerId: string;
  invoiceId: string | null;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  note: string | null;
  createdBy: string;
  cashboxId: string | null;
  bankAccountId: string | null;
  paymentMethodId: string | null;
  paymentReference: string | null;
}

export async function insertCustomerPayment(
  tx: PoolClient,
  a: InsertCustomerPaymentArgs,
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.customer_payments (
       customer_id, invoice_id, amount, payment_method, payment_date, note, created_by,
       cashbox_id, bank_account_id, payment_method_id, payment_reference
     )
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::public.payment_method, $5::date, $6,
             $7::uuid, $8::uuid, $9::uuid, $10, $11)
     RETURNING id::text AS id`,
    [
      a.customerId,
      a.invoiceId,
      a.amount,
      a.paymentMethod,
      a.paymentDate,
      a.note,
      a.createdBy,
      a.cashboxId,
      a.bankAccountId,
      a.paymentMethodId,
      a.paymentReference,
    ],
  );
  return rows[0].id;
}

export async function insertCustomerLedgerPayment(
  tx: PoolClient,
  args: {
    customerId: string;
    credit: number;
    referenceId: string;
    occurredAt: Date;
    createdBy: string;
    sourceKey: string;
    note: string;
    entryType?: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.customer_ledger(
       customer_id, entry_type, credit, reference_id, reference_type,
       occurred_at, created_by, source_key, note
     )
     VALUES ($1::uuid, $2::text, $3::numeric, $4::uuid, 'customer_payment', $5, $6::uuid, $7::text, $8::text)
     ON CONFLICT (source_key) DO NOTHING`,
    [
      args.customerId,
      args.entryType ?? "payment",
      args.credit,
      args.referenceId,
      args.occurredAt,
      args.createdBy,
      args.sourceKey,
      args.note,
    ],
  );
}

export async function insertChequeRegister(
  tx: PoolClient,
  args: {
    chequeNumber: string;
    bankName: string | null;
    drawerName: string | null;
    dueDate: string | null;
    amount: number;
    customerId: string;
    invoiceId: string | null;
    paymentId: string | null;
    notes: string | null;
    createdBy: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.cheques_register (
       cheque_number, bank_name, drawer_name, due_date, amount, status,
       customer_id, invoice_id, payment_id, notes, created_by
     )
     VALUES ($1, $2, $3, $4::date, $5::numeric, 'UNDER_COLLECTION',
             $6::uuid, $7::uuid, $8::uuid, $9, $10::uuid)`,
    [
      args.chequeNumber,
      args.bankName ?? "شيك مصرفي",
      args.drawerName,
      args.dueDate,
      args.amount,
      args.customerId,
      args.invoiceId,
      args.paymentId,
      args.notes,
      args.createdBy,
    ],
  );
}

export async function creditInvoicePayment(
  tx: PoolClient,
  invoiceId: string,
  amount: number,
): Promise<void> {
  await tx.query(
    `UPDATE public.sales_invoices
        SET paid = paid + $2::numeric,
            status = 'confirmed'::public.invoice_status,
            payment_status = public.derive_payment_status(paid + $2::numeric, total),
            updated_at = now()
      WHERE id = $1::uuid`,
    [invoiceId, amount],
  );
}

/** توزيع تلقائي على الفواتير المفتوحة — يقرأ الحالة بعد التحديث (كما الأصل). */
export async function applyAdvanceAllocation(
  tx: PoolClient,
  invoices: Array<{ id: string; total: number; paid: number }>,
  remaining: number,
): Promise<void> {
  let rem = remaining;
  for (const inv of invoices) {
    if (rem <= 0) break;
    const allocation = Math.min(rem, inv.total - inv.paid);
    if (allocation <= 0) continue;
    const newPaid = roundN(inv.paid + allocation, 2);
    await tx.query(
      `UPDATE public.sales_invoices
          SET paid = round(paid + $2::numeric, 2),
              status = 'confirmed'::public.invoice_status,
              payment_status = public.derive_payment_status(round(paid + $2::numeric, 2), total),
              updated_at = now()
        WHERE id = $1::uuid`,
      [inv.id, newPaid - inv.paid],
    );
    rem = roundN(rem - allocation, 2);
  }
}

export async function createJournalEntry(
  tx: PoolClient,
  args: {
    memo: string;
    entryDate: string;
    sourceType: string;
    sourceId: string;
    lines: Array<Record<string, unknown>>;
    actorId: string;
  },
): Promise<string | null> {
  // المرحلة 9: القيد عبر النطاق الجديد بدل دالة القاعدة (باستثناء المرتدعات).
  const { createJournalEntryInner } =
    await import("@/server/domains/accounting/application/accounting.usecases");
  return createJournalEntryInner(
    tx,
    { userId: args.actorId, claims: { sub: args.actorId, role: "authenticated" } },
    {
      memo: args.memo,
      entryDate: args.entryDate,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      isSystem: true,
      lines: args.lines as never,
    },
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

/** إعادة احتساب الرصيد — تبقى دالة القاعدة مصدر الحقيقة: مُشغّل حي
 *  (tg_customer_ledger_sync_balance) يستدعيها، والإسقاط مؤجل حتى مرحلة المحاسبة (قرار موثق). */
export async function recalculateCustomerBalance(
  tx: PoolClient,
  customerId: string,
  reason: string | null,
  type: string,
): Promise<unknown> {
  const { rows } = await tx.query<{ r: unknown }>(
    "SELECT public.recalculate_customer_balance($1::uuid, $2::text, $3::text) AS r",
    [customerId, reason, type],
  );
  return rows[0]?.r;
}

// ── الموردون ────────────────────────────────────────────────────────────────

export async function nextSupplierVoucherNumber(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT public.next_supplier_voucher_number() AS n",
  );
  return rows[0].n;
}

export async function supplierName(tx: PoolClient, supplierId: string): Promise<string | null> {
  const { rows } = await tx.query<{ name: string | null }>(
    "SELECT name FROM public.suppliers WHERE id = $1::uuid",
    [supplierId],
  );
  return rows[0]?.name ?? null;
}

export async function accountCodeExists(tx: PoolClient, code: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.accounts WHERE code = $1) AS ok",
    [code],
  );
  return rows[0]?.ok === true;
}

export async function cashboxAccountCode(
  tx: PoolClient,
  cashboxId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ c: string | null }>(
    `SELECT a.code FROM public.cashboxes c
       JOIN public.accounts a ON a.id = c.account_id
      WHERE c.id = $1::uuid`,
    [cashboxId],
  );
  return rows[0]?.c ?? null;
}

export async function bankAccountCode(
  tx: PoolClient,
  bankAccountId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ c: string | null }>(
    `SELECT a.code FROM public.company_bank_accounts b
       JOIN public.accounts a ON a.id = b.account_id
      WHERE b.id = $1::uuid`,
    [bankAccountId],
  );
  return rows[0]?.c ?? null;
}

export interface InsertSupplierPaymentArgs {
  voucherNumber: string;
  supplierId: string;
  amount: number;
  paymentMethod: string;
  accountCode: string;
  paymentDate: string;
  notes: string | null;
  createdBy: string;
  cashboxId: string | null;
  bankAccountId: string | null;
}

export async function insertSupplierPayment(
  tx: PoolClient,
  a: InsertSupplierPaymentArgs,
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.supplier_payments (
       voucher_number, supplier_id, amount, payment_method, account_code,
       payment_date, notes, created_by, cashbox_id, bank_account_id
     )
     VALUES ($1, $2::uuid, $3::numeric, $4, $5, $6::date, $7, $8::uuid, $9::uuid, $10::uuid)
     RETURNING id::text AS id`,
    [
      a.voucherNumber,
      a.supplierId,
      roundN(a.amount, 2).toFixed(2),
      a.paymentMethod,
      a.accountCode,
      a.paymentDate,
      a.notes,
      a.createdBy,
      a.cashboxId,
      a.bankAccountId,
    ],
  );
  return rows[0].id;
}

export async function setSupplierPaymentJournal(
  tx: PoolClient,
  paymentId: string,
  journalId: string | null,
): Promise<void> {
  await tx.query(
    "UPDATE public.supplier_payments SET journal_entry_id = $2::uuid WHERE id = $1::uuid",
    [paymentId, journalId],
  );
}

export async function debitSupplierBalance(
  tx: PoolClient,
  supplierId: string,
  amount: number,
): Promise<number> {
  const { rows } = await tx.query<{ balance: string }>(
    `UPDATE public.suppliers
        SET balance = round(coalesce(balance, 0) - $2::numeric, 2), updated_at = now()
      WHERE id = $1::uuid
      RETURNING balance::text AS balance`,
    [supplierId, roundN(amount, 2).toFixed(2)],
  );
  return Number(rows[0].balance);
}

export async function insertSupplierLedgerPayment(
  tx: PoolClient,
  args: {
    supplierId: string;
    debit: number;
    balanceAfter: number;
    referenceId: string;
    dueDate: string | null;
    occurredAt: Date;
    createdBy: string;
    sourceKey: string;
    note: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.supplier_ledger (
       supplier_id, entry_type, debit, credit, balance_after,
       reference_type, reference_id, due_date, occurred_at, created_by, source_key, note
     )
     VALUES ($1::uuid, 'PAYMENT', $2::numeric, 0, $3::numeric, 'supplier_payment',
             $4::uuid, $5::date, $6, $7::uuid, $8::text, $9::text)`,
    [
      args.supplierId,
      roundN(args.debit, 2).toFixed(2),
      args.balanceAfter.toFixed(2),
      args.referenceId,
      args.dueDate,
      args.occurredAt,
      args.createdBy,
      args.sourceKey,
      args.note,
    ],
  );
}
