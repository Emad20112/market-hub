/**
 * Use Cases: الخزينة — المرحلة 7.
 * record_customer_payment، record_customer_payment_splits،
 * record_customer_advance_payment، record_supplier_payment (9-معاملات كاملة)،
 * recalculate_customer_balance (نقل كامل) — مطابقة لدوال 007/011 الأصلية حرفيًا.
 *
 * اعتماديات انتقالية موثقة في DECISIONS-LOG:
 *  - create_journal_entry (المحاسبة) — حتى المرحلة 9.
 *  - resolve_writable_payment_method / resolve_document_settlement_account /
 *    payment_method_ledger_account تبقى في القاعدة (كتالوج طرق الدفع) — المرحلة 7b.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";
import {
  applyAdvanceAllocation,
  businessNow,
  businessTimestamp,
  businessToday,
  createJournalEntry,
  creditInvoicePayment,
  customerActive,
  customerBalanceLock,
  customerLedgerBalance,
  customerOutstandingOnInvoices,
  bankAccountCode,
  cashboxAccountCode,
  accountCodeExists,
  debitSupplierBalance,
  derivePaymentStatus,
  hasRole,
  insertAudit,
  insertChequeRegister,
  insertCustomerLedgerPayment,
  insertCustomerPayment,
  insertSupplierLedgerPayment,
  insertSupplierPayment,
  lockInvoiceById,
  nextSupplierVoucherNumber,
  openInvoicesForCustomer,
  paymentMethodLedgerAccount,
  recalculateCustomerBalance,
  resolveDocumentSettlementAccount,
  resolveWritablePaymentMethod,
  setSupplierPaymentJournal,
  supplierName,
  type InvoiceLockRow,
} from "../infrastructure/treasury.repository";

async function assertPaymentRole(tx: PoolClient, session: ServerSession): Promise<void> {
  for (const r of ["owner", "manager", "accountant", "cashier"]) {
    if (await hasRole(tx, session.userId, r)) return;
  }
  throw new AuthorizationError("You are not permitted to record customer payments");
}

/** لحظة الحدوث — كما في الأصل: اليوم بلحظته، وسابق بمنتصف ليله بتوقيت المنشأة. */
async function occurredAt(tx: PoolClient, docDate: string): Promise<Date> {
  const today = await businessToday(tx);
  return docDate === today ? businessNow(tx) : businessTimestamp(tx, docDate, "00:00");
}

// ── record_customer_payment ─────────────────────────────────────────────────

export interface RecordCustomerPaymentInput {
  customerId: string;
  invoiceId?: string | null;
  amount: number;
  method: string;
  paymentDate?: string | null;
  note?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  paymentMethodId?: string | null;
  chequeNumber?: string | null;
  chequeBank?: string | null;
  chequeDueDate?: string | null;
  chequeDrawer?: string | null;
}

export async function recordCustomerPaymentInner(
  tx: PoolClient,
  session: ServerSession,
  input: RecordCustomerPaymentInput,
): Promise<string> {
  const userId = session.userId;
  await assertPaymentRole(tx, session);
  const amount = roundN(input.amount ?? 0, 2);
  if (!input.customerId || amount <= 0) {
    throw new BusinessRuleError("A customer and a positive amount are required");
  }
  if (amount !== roundN(input.amount ?? 0, 2) || (input.amount ?? 0) !== amount) {
    throw new BusinessRuleError("Payment amount must not have more than two decimal places");
  }

  const docDate = input.paymentDate ?? (await businessToday(tx));
  if (docDate > (await businessToday(tx))) {
    throw new BusinessRuleError(`A collection cannot be dated in the future (${docDate})`);
  }
  const occurred = await occurredAt(tx, docDate);

  const methodId = input.paymentMethodId ?? input.method;
  const storedMethod = await resolveWritablePaymentMethod(
    tx,
    methodId,
    "customer_collection",
    true,
  );
  if (storedMethod === "credit") {
    throw new BusinessRuleError(
      "A collection cannot record آجل — that is a deferred sale, not a receipt",
    );
  }

  const customerBalance = await customerBalanceLock(tx, input.customerId);
  if (customerBalance === null) throw new BusinessRuleError("Customer is unavailable");

  const ledgerBalance = await customerLedgerBalance(tx, input.customerId);

  const account = await resolveDocumentSettlementAccount(
    tx,
    storedMethod,
    input.cashboxId ?? null,
    input.bankAccountId ?? null,
    methodId,
  );
  if (!account) {
    throw new BusinessRuleError(
      `No ledger account could be resolved for collection tender ${methodId}`,
    );
  }

  if (input.invoiceId) {
    const inv = await lockInvoiceById(tx, input.invoiceId);
    if (!inv) throw new BusinessRuleError("Invoice not found");
    if (inv.customerId !== input.customerId) {
      throw new BusinessRuleError("Invoice does not belong to this customer");
    }
    if (inv.total - inv.paid <= 0) {
      throw new BusinessRuleError("Invoice has no outstanding balance");
    }
    if (amount > inv.total - inv.paid + 0.001) {
      throw new BusinessRuleError("Payment exceeds the invoice outstanding balance");
    }
  } else if (amount > Math.max(ledgerBalance, 0) + 0.001) {
    throw new BusinessRuleError(
      `Payment exceeds the customer outstanding balance (ledger ${ledgerBalance.toFixed(2)})`,
    );
  }

  const paymentId = await insertCustomerPayment(tx, {
    customerId: input.customerId,
    invoiceId: input.invoiceId ?? null,
    amount,
    paymentMethod: storedMethod,
    paymentDate: docDate,
    note: input.note?.trim() || null,
    createdBy: userId,
    cashboxId: input.cashboxId ?? null,
    bankAccountId: input.bankAccountId ?? null,
    paymentMethodId: methodId,
    paymentReference: input.chequeNumber ?? null,
  });

  await insertCustomerLedgerPayment(tx, {
    customerId: input.customerId,
    credit: amount,
    referenceId: paymentId,
    occurredAt: occurred,
    createdBy: userId,
    sourceKey: `payment:${paymentId}`,
    note: input.note?.trim() || "دفعة عميل",
  });

  if ((storedMethod === "cheque" || methodId === "cheque") && input.chequeNumber) {
    await insertChequeRegister(tx, {
      chequeNumber: input.chequeNumber,
      bankName: input.chequeBank ?? null,
      drawerName: input.chequeDrawer ?? null,
      dueDate: input.chequeDueDate ?? docDate,
      amount,
      customerId: input.customerId,
      invoiceId: input.invoiceId ?? null,
      paymentId,
      notes: input.note ?? null,
      createdBy: userId,
    });
  }

  if (input.invoiceId) {
    await creditInvoicePayment(tx, input.invoiceId, amount);
  } else {
    const invoices = await openInvoicesForCustomer(tx, input.customerId);
    await applyAdvanceAllocation(tx, invoices, amount);
  }

  const lines: Array<Record<string, unknown>> = [
    {
      account_code: account,
      debit: amount,
      memo: account === "1221" ? "أوراق قبض (شيك برسم التحصيل)" : "تحصيل من عميل",
    },
    {
      account_code: "1211",
      credit: amount,
      memo: "تحصيل ذمة عميل",
      partner_type: "customer",
      partner_id: input.customerId,
    },
  ];
  await createJournalEntry(tx, {
    memo: `تحصيل من عميل — ${input.note?.trim() || ""}`,
    entryDate: docDate,
    sourceType: "customer_payment",
    sourceId: paymentId,
    actorId: userId,
    lines,
  });

  await recalculateCustomerBalance(
    tx,
    input.customerId,
    `تحصيل نقدي — ${paymentId}`,
    "document_repost",
  );

  return paymentId;
}

export function recordCustomerPayment(
  session: ServerSession,
  input: RecordCustomerPaymentInput,
): Promise<{ paymentId: string }> {
  return withTransaction((tx) =>
    recordCustomerPaymentInner(tx, session, input).then((paymentId) => ({ paymentId })),
  );
}

// ── record_customer_payment_splits ──────────────────────────────────────────

export interface CollectionSplitInput {
  methodId?: string | null;
  method?: string | null;
  amount: number;
  reference?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  paymentMethodId?: string | null;
}

export interface RecordCustomerPaymentSplitsInput {
  customerId: string;
  invoiceId?: string | null;
  amount?: number | null;
  paymentDate?: string | null;
  note?: string | null;
  splits: CollectionSplitInput[];
}

export async function recordCustomerPaymentSplitsInner(
  tx: PoolClient,
  session: ServerSession,
  input: RecordCustomerPaymentSplitsInput,
): Promise<string> {
  const userId = session.userId;
  await assertPaymentRole(tx, session);
  if (!input.customerId) throw new BusinessRuleError("A customer is required");
  const amountRaw = input.amount ?? 0;
  if (amountRaw === null || amountRaw <= 0 || roundN(amountRaw, 2) !== amountRaw) {
    throw new BusinessRuleError(
      "A positive collection total with at most two decimals is required",
    );
  }
  if (!Array.isArray(input.splits) || input.splits.length < 2) {
    throw new BusinessRuleError("A split collection requires at least two tenders");
  }
  const docDate = input.paymentDate ?? (await businessToday(tx));
  if (docDate > (await businessToday(tx))) {
    throw new BusinessRuleError(`A collection cannot be dated in the future (${docDate})`);
  }
  const occurred = await occurredAt(tx, docDate);

  const customerBalance = await customerBalanceLock(tx, input.customerId);
  if (customerBalance === null) throw new BusinessRuleError("Customer is unavailable");

  const ledgerBalance = await customerLedgerBalance(tx, input.customerId);

  // التحقق من الأقساط (مرور أول)
  let splitTotal = 0;
  for (const s of input.splits) {
    if ((s.amount ?? 0) <= 0) {
      throw new BusinessRuleError("Every collection tender requires a positive amount");
    }
    const methodId = s.methodId ?? s.method ?? "";
    const stored = await resolveWritablePaymentMethod(tx, methodId, "customer_collection", true);
    if (stored === "credit") {
      throw new BusinessRuleError(
        "A collection cannot record آجل — that is a deferred sale, not a receipt",
      );
    }
    splitTotal += s.amount;
  }
  if (splitTotal !== roundN(splitTotal, 2)) {
    throw new BusinessRuleError("Each payment tender must not have more than two decimal places");
  }
  const total = roundN(splitTotal, 2);
  if (total <= 0 || splitTotal !== total || roundN(amountRaw, 2) !== total) {
    throw new BusinessRuleError(
      `Collection total (${roundN(amountRaw, 2).toFixed(2)}) does not match the sum of its tenders (${total.toFixed(2)})`,
    );
  }

  let invoice: InvoiceLockRow | null = null;
  if (input.invoiceId) {
    invoice = await lockInvoiceById(tx, input.invoiceId);
    if (!invoice || invoice.customerId !== input.customerId) {
      throw new BusinessRuleError("Invoice not found for this customer");
    }
    if (
      invoice.total - invoice.paid <= 0 ||
      total > invoice.total - invoice.paid + 0.001 ||
      total > Math.max(ledgerBalance, 0) + 0.001
    ) {
      throw new BusinessRuleError("Payment exceeds the invoice outstanding balance");
    }
  } else {
    const outstanding = await customerOutstandingOnInvoices(tx, input.customerId);
    if (
      total > Math.max(ledgerBalance, 0) + 0.001 ||
      (outstanding > 0 && total > outstanding + 0.001)
    ) {
      throw new BusinessRuleError(
        `Payment exceeds the customer outstanding balance (ledger ${ledgerBalance.toFixed(2)})`,
      );
    }
  }

  let remaining = total;
  let lastId: string | null = null;
  for (const s of input.splits) {
    const methodId = s.methodId ?? s.method ?? "";
    const stored = await resolveWritablePaymentMethod(tx, methodId, "customer_collection", true);
    const account = await resolveDocumentSettlementAccount(
      tx,
      stored,
      s.cashboxId ?? null,
      s.bankAccountId ?? null,
      methodId,
    );
    if (!account) {
      throw new BusinessRuleError(
        `No ledger account could be resolved for collection tender ${methodId}`,
      );
    }
    const splitAmount = roundN(s.amount, 2);

    const paymentId = await insertCustomerPayment(tx, {
      customerId: input.customerId,
      invoiceId: input.invoiceId ?? null,
      amount: splitAmount,
      paymentMethod: stored,
      paymentDate: docDate,
      note: [input.note?.trim(), s.reference?.trim()].filter(Boolean).join(" — ") || null,
      createdBy: userId,
      cashboxId: s.cashboxId ?? null,
      bankAccountId: s.bankAccountId ?? null,
      paymentMethodId: methodId,
      paymentReference: s.reference ?? null,
    });
    lastId = paymentId;

    await insertCustomerLedgerPayment(tx, {
      customerId: input.customerId,
      credit: splitAmount,
      referenceId: paymentId,
      occurredAt: occurred,
      createdBy: userId,
      sourceKey: `payment:${paymentId}`,
      note: input.note?.trim() || "دفعة عميل (دفع مجزأ)",
    });

    if ((stored === "cheque" || methodId === "cheque") && s.reference) {
      await insertChequeRegister(tx, {
        chequeNumber: s.reference,
        bankName: "شيك مصرفي",
        drawerName: null,
        dueDate: docDate,
        amount: splitAmount,
        customerId: input.customerId,
        invoiceId: input.invoiceId ?? null,
        paymentId,
        notes: input.note ?? null,
        createdBy: userId,
      });
    }

    const lines: Array<Record<string, unknown>> = [
      {
        account_code: account,
        debit: splitAmount,
        memo: `تحصيل من عميل (دفع مجزأ) — ${stored}`,
      },
      {
        account_code: "1211",
        credit: splitAmount,
        memo: "تحصيل ذمة عميل",
        partner_type: "customer",
        partner_id: input.customerId,
      },
    ];
    await createJournalEntry(tx, {
      memo: `تحصيل من عميل — ${input.note?.trim() || ""}`,
      entryDate: docDate,
      sourceType: "customer_payment",
      sourceId: paymentId,
      actorId: userId,
      lines,
    });
  }

  if (input.invoiceId && invoice) {
    await creditInvoicePayment(tx, input.invoiceId, total);
  } else {
    const invoices = await openInvoicesForCustomer(tx, input.customerId);
    await applyAdvanceAllocation(tx, invoices, remaining);
    remaining = 0;
  }

  await recalculateCustomerBalance(
    tx,
    input.customerId,
    `تحصيل مجزأ — ${lastId ?? ""}`,
    "document_repost",
  );

  return lastId!;
}

export function recordCustomerPaymentSplits(
  session: ServerSession,
  input: RecordCustomerPaymentSplitsInput,
): Promise<{ paymentId: string }> {
  return withTransaction((tx) =>
    recordCustomerPaymentSplitsInner(tx, session, input).then((r) => ({ paymentId: r })),
  );
}

// ── record_customer_advance_payment ─────────────────────────────────────────

export interface RecordCustomerAdvancePaymentInput {
  customerId: string;
  amount: number;
  method: string;
  paymentDate?: string | null;
  note?: string | null;
}

export async function recordCustomerAdvancePaymentInner(
  tx: PoolClient,
  session: ServerSession,
  input: RecordCustomerAdvancePaymentInput,
): Promise<string> {
  const userId = session.userId;
  await assertPaymentRole(tx, session);
  if (!input.customerId || (input.amount ?? 0) <= 0) {
    throw new BusinessRuleError("A customer and a positive advance amount are required");
  }

  const storedMethod = await resolveWritablePaymentMethod(
    tx,
    input.method,
    "customer_collection",
    true,
  );
  if (!(await customerActive(tx, input.customerId))) {
    throw new BusinessRuleError("Customer is unavailable");
  }
  // قفل صف العميل كما في الأصل (PERFORM ... FOR UPDATE)
  await customerBalanceLock(tx, input.customerId);

  const amount = roundN(input.amount, 2);
  const docDate = input.paymentDate ?? (await businessToday(tx));

  // Treat a customer advance as a receipt against the oldest open invoices
  // first. Any portion left after this allocation remains a customer credit.
  const openInvoices = await openInvoicesForCustomer(tx, input.customerId);
  await applyAdvanceAllocation(tx, openInvoices, amount);

  const paymentId = await insertCustomerPayment(tx, {
    customerId: input.customerId,
    invoiceId: null,
    amount,
    paymentMethod: storedMethod,
    paymentDate: docDate,
    note: input.note?.trim() || "دفعة مقدمة",
    createdBy: userId,
    cashboxId: null,
    bankAccountId: null,
    paymentMethodId: input.method,
    paymentReference: null,
  });

  await tx.query(
    `UPDATE public.customers
        SET balance = round(coalesce(balance, 0) - $2::numeric, 2), updated_at = now()
      WHERE id = $1::uuid`,
    [input.customerId, amount.toFixed(2)],
  );

  await insertCustomerLedgerPayment(tx, {
    customerId: input.customerId,
    credit: amount,
    referenceId: paymentId,
    occurredAt: new Date(`${docDate}T00:00:00Z`),
    createdBy: userId,
    sourceKey: `advance-payment:${paymentId}`,
    note: input.note?.trim() || "دفعة مقدمة",
    entryType: "credit",
  });

  // T-10: قيد الدفعة المقدمة — نقد مدين مقابل ذمة عكسية للعميل
  const cashAcct = await paymentMethodLedgerAccount(tx, storedMethod);
  let journalId: string | null = null;
  if (cashAcct) {
    const lines: Array<Record<string, unknown>> = [
      { account_code: cashAcct, debit: amount, memo: "دفعة مقدمة من عميل" },
      {
        account_code: "1211",
        credit: amount,
        memo: "رصيد دائن للعميل — دفعة مقدمة",
      },
    ];
    journalId = await createJournalEntry(tx, {
      memo: "دفعة مقدمة من عميل",
      entryDate: docDate,
      sourceType: "customer_advance_payment",
      sourceId: paymentId,
      actorId: userId,
      lines,
    });
  }

  await insertAudit(tx, {
    actorId: userId,
    action: "customer_advance_payment.recorded",
    entityType: "customer",
    entityId: input.customerId,
    payload: {
      amount,
      method: storedMethod,
      payment_date: docDate,
      journal_entry_id: journalId,
    },
  });

  return paymentId;
}

export function recordCustomerAdvancePayment(
  session: ServerSession,
  input: RecordCustomerAdvancePaymentInput,
): Promise<{ paymentId: string }> {
  return withTransaction((tx) =>
    recordCustomerAdvancePaymentInner(tx, session, input).then((r) => ({ paymentId: r })),
  );
}

// ── record_supplier_payment (الصيغة الكاملة 9-معاملات) ─────────────────────

export interface RecordSupplierPaymentInput {
  supplierId: string;
  amount: number;
  paymentMethod?: string | null;
  accountCode?: string | null;
  paymentDate?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
}

export async function recordSupplierPaymentInner(
  tx: PoolClient,
  session: ServerSession,
  input: RecordSupplierPaymentInput,
): Promise<{
  paymentId: string;
  voucherNumber: string;
  journalEntryId: string | null;
  newBalance: number;
}> {
  const userId = session.userId;
  if (!input.supplierId) throw new BusinessRuleError("Supplier ID is required");
  if (input.amount === null || input.amount <= 0) {
    throw new BusinessRuleError(`Payment amount must be greater than zero, got ${input.amount}`);
  }
  const supplier = await supplierName(tx, input.supplierId);
  if (supplier === null) {
    throw new BusinessRuleError(`Supplier with ID ${input.supplierId} not found`);
  }

  // تحديد الحساب المالي (من الصندوق أو البنك أو الحساب المدخل)
  let account: string | null = null;
  if (input.accountCode && input.accountCode.trim() !== "") {
    account = input.accountCode.trim();
    if (!(await accountCodeExists(tx, account))) {
      throw new BusinessRuleError(`Account code ${account} does not exist in chart of accounts`);
    }
  } else if (input.cashboxId) {
    account = await cashboxAccountCode(tx, input.cashboxId);
  } else if (input.bankAccountId) {
    account = await bankAccountCode(tx, input.bankAccountId);
  }

  if (!account) {
    const method = (input.paymentMethod ?? "CASH").toUpperCase();
    if (["BANK", "TRANSFER", "CHEQUE", "CARD"].includes(method)) account = "1111";
    else if (method === "WALLET") account = "1131";
    else account = "1101";
  }

  const voucherNumber = await nextSupplierVoucherNumber(tx);
  const paymentDate = input.paymentDate ?? new Date().toISOString().slice(0, 10);
  const amount = roundN(input.amount, 2);

  const paymentId = await insertSupplierPayment(tx, {
    voucherNumber,
    supplierId: input.supplierId,
    amount,
    paymentMethod: (input.paymentMethod ?? "CASH").toUpperCase(),
    accountCode: account,
    paymentDate,
    notes: input.notes ?? null,
    createdBy: userId,
    cashboxId: input.cashboxId ?? null,
    bankAccountId: input.bankAccountId ?? null,
  });

  const lines: Array<Record<string, unknown>> = [
    {
      account_code: "2111",
      debit: amount,
      credit: 0,
      memo: `سداد ذمة للمورد ${supplier}`,
      partner_type: "supplier",
      partner_id: input.supplierId,
    },
    {
      account_code: account,
      debit: 0,
      credit: amount,
      memo: `سند صرف رقم ${voucherNumber} للمورد ${supplier}`,
    },
  ];

  const journalId = await createJournalEntry(tx, {
    memo: `سند صرف للمورد ${supplier} (${voucherNumber})`,
    entryDate: paymentDate,
    sourceType: "supplier_payment",
    sourceId: paymentId,
    actorId: userId,
    lines,
  });

  await setSupplierPaymentJournal(tx, paymentId, journalId);

  const newBalance = await debitSupplierBalance(tx, input.supplierId, amount);

  // ملاحظة تكافؤ: الصيغة 9-معاملات لا تكتب في supplier_ledger (سلوك الصيغة القديمة
  // 7-معاملات فقط) — اكتشفه اختبار التكافؤ؛ نطابق الأصل الحي حرفيًا.

  await insertAudit(tx, {
    actorId: userId,
    action: "supplier_payment.recorded",
    entityType: "supplier_payment",
    entityId: paymentId,
    payload: {
      voucher_number: voucherNumber,
      supplier_id: input.supplierId,
      amount,
      account_code: account,
      payment_method: input.paymentMethod,
      cashbox_id: input.cashboxId ?? null,
      bank_account_id: input.bankAccountId ?? null,
      new_balance: newBalance,
    },
  });

  return { paymentId, voucherNumber, journalEntryId: journalId, newBalance };
}

export function recordSupplierPayment(
  session: ServerSession,
  input: RecordSupplierPaymentInput,
): Promise<{
  paymentId: string;
  voucherNumber: string;
  journalEntryId: string | null;
  newBalance: number;
}> {
  return withTransaction((tx) => recordSupplierPaymentInner(tx, session, input));
}

// ── recalculate_customer_balance (نقل كامل — 007) ───────────────────────────

export function recalcCustomerBalance(
  session: ServerSession,
  input: { customerId: string; reason?: string | null; type?: string | null },
): Promise<unknown> {
  return withTransaction(async (tx) => {
    // نفس صلاحية recalculate_all_customer_balances: مالك/مدير/محاسب
    let ok = false;
    for (const r of ["owner", "manager", "accountant"]) {
      if (await hasRole(tx, session.userId, r)) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      throw new AuthorizationError(
        "Only an owner, manager or accountant may recalculate customer balances",
      );
    }
    if (!input.reason || input.reason.trim() === "") {
      throw new BusinessRuleError(
        "A reason is required before recalculating every customer balance",
      );
    }
    return recalculateCustomerBalance(
      tx,
      input.customerId,
      input.reason,
      input.type ?? "recalculation",
    );
  });
}

/** الغلاف العام الذرّي. */
export function withTreasuryTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(fn);
}

export { derivePaymentStatus };
