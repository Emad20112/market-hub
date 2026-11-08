/**
 * Use Cases: المبيعات — المرحلة 5.
 * create_sale (بإعادة تصميم: Use Case + معاملة واحدة)، create_sales_return،
 * adjust_loyalty — مطابقة لدوال 007/012 الأصلية حرفيًا (التحقق، الأقفال،
 * ترتيب الكتابة، رسائل الرفض).
 *
 * اعتماديات انتقالية موثقة في DECISIONS-LOG:
 *  - recalculate_customer_balance / customer_balance_lock تبقى في القاعدة
 *    (3 مستدعي SQL باقون: الخزينة، ومُشغّل دفتر العميل) حتى المرحلة 7.
 *  - post_sales_invoice / balance_and_post_return / create_journal_entry
 *    (المحاسبة) — حتى المرحلة 9.
 *  - resolve_writable_payment_method / payment_method_ledger_account تبقى في
 *    القاعدة (كتالوج طرق الدفع ومشغلاته) حتى المرحلة 7.
 *  - حركات المخزون عبر محرك المرحلة 4 (postStockDelta) — لا اعتماد خلفي.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { postStockDelta } from "@/server/domains/stock/application/engine";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";
import {
  applyLoyaltyPoints,
  applyReturnCreditToInvoice,
  balanceAndPostReturn,
  customerCreditLimitAllows,
  customerBalanceLock,
  insertAdHocServiceLine,
  insertAudit,
  insertCustomerLedgerEntry,
  insertCustomerPaymentSplit,
  insertLoyaltyTransaction,
  insertSalesInvoice,
  insertSalesInvoiceItem,
  insertSalesReturn,
  insertSalesReturnItem,
  invoiceItemFacts,
  invoiceOutstanding,
  isStaff,
  itemLineType,
  itemStockEffect,
  lockInvoice,
  markInvoiceReturnedIfSettled,
  hasRole,
  nextInvoiceNumber,
  nextSalesReturnNumber,
  paymentMethodLedgerAccount,
  postSalesInvoiceRpc,
  productBaseUomId,
  productSaleFacts,
  productTaxRate,
  productUomFactor,
  productUomPrice,
  productUomQuantityIncrement,
  productQuantityInBase,
  recalculateCustomerBalance,
  resolveSaleLine,
  resolveWritablePaymentMethod,
  returnedQuantityOnInvoice,
  saleStockAvailability,
  syncStockMovementDates,
  type InvoiceItemFacts,
  type JournalLine,
  type ResolvedSaleLine,
} from "../infrastructure/sales.repository";

// ── create_sale ─────────────────────────────────────────────────────────────

export interface SaleLineInput {
  productId?: string | null;
  quantity: number;
  unitPrice: number;
  taxRate?: number | null;
  isService?: boolean;
  name?: string | null;
  batchId?: string | null;
  batchNumber?: string | null;
  uomId?: string | null;
}

export interface PaymentSplitInput {
  method: string;
  amount: number;
  paymentMethodId?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  reference?: string | null;
}

export interface CreateSaleInput {
  warehouseId: string;
  customerId?: string | null;
  paymentMethod: string;
  paid?: number | null;
  discount?: number | null;
  note?: string | null;
  saleDate?: string | null;
  paymentSplits?: PaymentSplitInput[] | null;
  items: SaleLineInput[];
}

interface PaymentFacts {
  hasSplits: boolean;
  splitTotal: number;
  recordedMethod: string;
  splits: Array<{
    method: string;
    amount: number;
    cashboxId: string | null;
    bankAccountId: string | null;
    paymentMethodId: string | null;
    reference: string | null;
  }>;
}

/** التحقق من الدفع المجزأ — كما في الأصل (012). */
async function validatePayment(tx: PoolClient, input: CreateSaleInput): Promise<PaymentFacts> {
  const splits = (input.paymentSplits ?? []).filter((s) => s != null);
  const hasSplits = Array.isArray(splits) && splits.length > 0;

  if (hasSplits) {
    let splitTotal = 0;
    const resolved: PaymentFacts["splits"] = [];
    for (const s of splits) {
      if (
        s.method === null ||
        !["cash", "card", "bank_transfer", "mobile_money", "cheque"].includes(s.method)
      ) {
        throw new BusinessRuleError(`Unsupported split payment method: ${s.method}`);
      }
      const writable = await resolveWritablePaymentMethod(
        tx,
        s.paymentMethodId ?? s.method,
        "pos",
        true,
      );
      if (writable !== s.method) {
        throw new BusinessRuleError(`Payment method id does not match split tender ${s.method}`);
      }
      if (s.amount <= 0) {
        throw new BusinessRuleError("Every payment tender component requires a positive amount");
      }
      splitTotal += s.amount;
      resolved.push({
        method: s.method,
        amount: s.amount,
        cashboxId: s.cashboxId ?? null,
        bankAccountId: s.bankAccountId ?? null,
        paymentMethodId: s.paymentMethodId ?? null,
        reference: s.reference?.trim() || null,
      });
    }
    const distinct = new Set(splits.map((s) => s.method));
    if (distinct.size !== splits.length) {
      throw new BusinessRuleError("A payment method may only be included once in a split");
    }
    return {
      hasSplits: true,
      splitTotal,
      recordedMethod: distinct.size > 1 ? "split" : input.paymentMethod,
      splits: resolved,
    };
  }

  if (
    !["cash", "card", "bank_transfer", "credit", "mobile_money", "cheque"].includes(
      input.paymentMethod,
    )
  ) {
    throw new BusinessRuleError(`Unsupported payment method: ${input.paymentMethod}`);
  }
  return { hasSplits: false, splitTotal: 0, recordedMethod: input.paymentMethod, splits: [] };
}

/** التحقق من رصيد المخزون لكل البنود — كما في الأصل (FOR UPDATE، بلا سماح سالب:
 *  السماح يعالجه مُشغّل الدفعات لا هذه الدالة). النصوص تُنسق من القاعدة نفسها
 *  لضمان تطابق رسالة الرفض حرفيًا مع طبع numeric في PostgreSQL. */
async function assertStockAvailable(tx: PoolClient, input: CreateSaleInput): Promise<void> {
  const normalized = input.items.map((l) => ({
    product_id: l.productId ?? null,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    tax_rate: l.taxRate ?? 0,
    is_service: l.isService === true,
    name: l.name ?? null,
    batch_id: l.batchId ?? null,
    batch_number: l.batchNumber ?? null,
    uom_id: l.uomId ?? null,
  }));
  const rows = await saleStockAvailability(tx, input.warehouseId, normalized);
  for (const r of rows) {
    if (Number(r.availText) < Number(r.qtyText)) {
      throw new BusinessRuleError(
        `Insufficient stock for item ${r.productId}: available ${r.availText}, requested ${r.qtyText}`,
      );
    }
  }
}

/** حساب المجاميع والأسعار — كما في الأصل (مرور أول قبل الإدراج). */
interface ComputedLine {
  resolved: ResolvedSaleLine;
  inputPrice: number;
  inputTax: number;
  uomId: string | null;
  batchId: string | null;
  batchNumber: string | null;
  price: number;
  enteredPrice: number;
  taxRate: number;
  lineTotal: number;
  lineTax: number;
  baseQuantity: number | null;
  enteredQuantity: number | null;
  conversionFactor: number | null;
  quantityIncrement: number | null;
}

async function computeLines(tx: PoolClient, input: CreateSaleInput): Promise<ComputedLine[]> {
  const lines: ComputedLine[] = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (const line of input.items) {
    const resolved = await resolveSaleLine(tx, line);
    const inputPrice = line.unitPrice ?? 0;
    const inputTax = line.taxRate ?? 0;
    const uomId = line.uomId ?? null;

    if (resolved.quantity === null || resolved.quantity <= 0) {
      throw new BusinessRuleError("Every sale line requires a positive quantity");
    }

    let price: number;
    let enteredPrice: number;
    let taxRate: number;
    let baseQuantity: number | null = null;

    if (resolved.productId === null) {
      if ((resolved.serviceName ?? "") === "") {
        throw new BusinessRuleError("Every service line requires a description");
      }
      if (inputPrice < 0 || inputTax < 0 || inputTax > 100) {
        throw new BusinessRuleError(
          `Service line "${resolved.serviceName}" has an invalid price or tax rate`,
        );
      }
      price = inputPrice;
      taxRate = inputTax;
      enteredPrice = inputPrice;
    } else {
      const facts = await productSaleFacts(tx, resolved.productId);
      if (facts === null) {
        throw new BusinessRuleError(`Item ${resolved.productId} is not available for sale`);
      }
      if (facts.sellable !== true) {
        throw new BusinessRuleError(`Item ${resolved.productId} is not marked as sellable`);
      }
      const conversionFactor = await productUomFactor(tx, resolved.productId, uomId, "SALE");
      enteredPrice = await productUomPrice(tx, resolved.productId, uomId, "SALE");
      baseQuantity = await productQuantityInBase(
        tx,
        resolved.productId,
        line.quantity,
        uomId,
        "SALE",
      );
      price = roundN(enteredPrice / conversionFactor, 6);
      taxRate = facts.taxRate;
      if (enteredPrice < 0 || taxRate < 0 || taxRate > 100) {
        throw new BusinessRuleError(
          `Item ${resolved.productId} has invalid pricing or tax configuration`,
        );
      }
    }

    const lineTotal = roundN(
      resolved.quantity * (resolved.productId === null ? price : enteredPrice),
      2,
    );
    const lineTax = roundN((lineTotal * taxRate) / 100, 2);
    subtotal += lineTotal;
    taxTotal += lineTax;

    lines.push({
      resolved,
      inputPrice,
      inputTax,
      uomId,
      batchId: line.batchId ?? null,
      batchNumber: line.batchNumber ?? null,
      price,
      enteredPrice,
      taxRate,
      lineTotal,
      lineTax,
      baseQuantity,
      enteredQuantity: line.quantity,
      conversionFactor: resolved.productId === null ? null : null,
      quantityIncrement: null,
    });
  }

  return lines;
}

/** التنفيذ الداخلي داخل معاملة ممرّرة — كما الأصل حرفيًا. */
export async function createSaleInner(
  tx: PoolClient,
  session: ServerSession,
  input: CreateSaleInput,
): Promise<string> {
  const userId = session.userId;
  if (
    !(await hasRole(tx, userId, "owner")) &&
    !(await hasRole(tx, userId, "manager")) &&
    !(await hasRole(tx, userId, "cashier"))
  ) {
    throw new BusinessRuleError("You are not permitted to post sales");
  }

  if (!input.warehouseId) throw new BusinessRuleError("Warehouse is required");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BusinessRuleError("Cart is empty");
  }
  const discount = input.discount ?? 0;
  if (discount < 0) throw new BusinessRuleError("Discount cannot be negative");
  if ((input.paid ?? 0) < 0) throw new BusinessRuleError("Paid amount cannot be negative");

  const payment = await validatePayment(tx, input);
  await assertStockAvailable(tx, input);

  // حساب المجاميع (مرور واحد — يُعاد استخدام النتيجة عند الإدراج)
  const computed = await computeLines(tx, input);
  let subtotal = 0;
  let taxTotal = 0;
  for (const c of computed) {
    subtotal += c.lineTotal;
    taxTotal += c.lineTax;
  }
  const total = roundN(subtotal + taxTotal - discount, 2);
  if (discount > subtotal + taxTotal || total < 0) {
    throw new BusinessRuleError("Discount cannot exceed the invoice amount");
  }

  // العميل وحد الائتمان
  let systemCustomer = false;
  if (input.customerId) {
    const { rows } = await tx.query<{ is_system: boolean | null }>(
      `SELECT is_system FROM public.customers WHERE id = $1::uuid AND is_active = true FOR UPDATE`,
      [input.customerId],
    );
    if (!rows[0]) throw new BusinessRuleError("Selected customer is unavailable");
    systemCustomer = rows[0].is_system === true;
  }

  const paid = Math.min(input.paid ?? 0, total);
  const outstanding = roundN(total - paid, 2);

  if (payment.hasSplits && roundN(payment.splitTotal, 2) !== roundN(paid, 2)) {
    throw new BusinessRuleError(
      `Split breakdown total (${roundN(payment.splitTotal, 2)}) does not match paid amount (${roundN(paid, 2)})`,
    );
  }

  if (outstanding > 0 && !input.customerId) {
    throw new BusinessRuleError("A customer is required when the sale has an unpaid amount");
  }
  if (outstanding > 0 && systemCustomer) {
    throw new BusinessRuleError(
      "The system cash customer cannot carry credit — select a real customer for a deferred sale",
    );
  }
  if (outstanding > 0 && input.customerId) {
    const allowed = await customerCreditLimitAllows(tx, input.customerId, outstanding);
    if (!allowed) {
      throw new BusinessRuleError(
        `Credit limit exceeded: current balance 0, requested debt ${outstanding}, limit 0`,
      );
    }
  }

  const invoiceNumber = await nextInvoiceNumber(tx);
  const saleDate = input.saleDate ?? null;
  const postedAt = new Date(
    `${saleDate ?? new Date().toISOString().slice(0, 10)}T${new Date().toISOString().slice(11, 19)}Z`,
  );

  const invoiceId = await insertSalesInvoice(tx, {
    invoiceNumber,
    customerId: input.customerId ?? null,
    warehouseId: input.warehouseId,
    subtotal,
    discount,
    tax: taxTotal,
    total,
    paid,
    paymentMethod: payment.recordedMethod,
    note: input.note?.trim() || null,
    createdBy: userId,
    createdAt: postedAt,
  });

  // سطور الفاتورة وحركات المخزون
  for (const c of computed) {
    if (c.resolved.productId === null) {
      await insertLine(tx, {
        invoiceId,
        line: c,
        lineType: "AD_HOC_SERVICE",
        effect: "NONE",
        warehouseId: input.warehouseId,
        createdBy: userId,
      });
      continue;
    }
    const taxRate = await productTaxRate(tx, c.resolved.productId);
    const conversionFactor = await productUomFactor(tx, c.resolved.productId, c.uomId, "SALE");
    const quantityIncrement = await productUomQuantityIncrement(tx, c.resolved.productId, c.uomId);
    const enteredPrice = await productUomPrice(tx, c.resolved.productId, c.uomId, "SALE");
    const price = roundN(enteredPrice / conversionFactor, 6);
    const baseQty = await productQuantityInBase(
      tx,
      c.resolved.productId,
      c.resolved.quantity,
      c.uomId,
      "SALE",
    );
    const lineType = await itemLineType(tx, c.resolved.productId, false);
    const effect = await itemStockEffect(tx, c.resolved.productId, "out");

    if (effect === "STOCK_ISSUE") {
      await postStockDelta(tx, {
        productId: c.resolved.productId,
        warehouseId: input.warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: -baseQty,
        unitCost: null,
        movementKind: "ISSUE",
        sourceType: "sales_invoice",
        sourceId: invoiceId,
        note: "POS sale",
        actorId: userId,
        movementTypeLegacy: "sale",
      });
    }

    await insertLine(tx, {
      invoiceId,
      line: c,
      lineType,
      effect,
      warehouseId: input.warehouseId,
      createdBy: userId,
      productId: c.resolved.productId,
      quantity: baseQty,
      enteredQuantity: c.resolved.quantity,
      conversionFactor,
      quantityIncrement,
      enteredPrice,
      price,
      taxRate,
    });
  }

  // مزامنة تواريخ حركات المخزون مع تاريخ البيع
  await syncStockMovementDates(tx, invoiceId, postedAt);

  // ذمة العميل
  if (outstanding > 0 && input.customerId) {
    await tx.query(
      `UPDATE public.customers
          SET balance = round(coalesce(balance, 0) + $2::numeric, 2), updated_at = now()
        WHERE id = $1::uuid`,
      [input.customerId, outstanding],
    );
    await tx.query(
      `INSERT INTO public.customer_ledger (
         customer_id, entry_type, debit, reference_id, reference_type,
         occurred_at, created_by, source_key, note
       )
       VALUES ($1::uuid, 'sale', $2::numeric, $3::uuid, 'sales_invoice', $4, $5::uuid,
               $6, 'قيد بيع آجل')
       ON CONFLICT (source_key) DO NOTHING`,
      [input.customerId, outstanding, invoiceId, postedAt, userId, `sale:${invoiceId}`],
    );
  }

  // سجلات الدفع المجزأ
  if (payment.hasSplits) {
    for (const s of payment.splits) {
      if (s.amount > 0 && input.customerId) {
        await insertCustomerPaymentSplit(tx, {
          customerId: input.customerId,
          invoiceId,
          method: s.method,
          amount: s.amount,
          occurredAt: postedAt,
          createdBy: userId,
          cashboxId: s.cashboxId,
          bankAccountId: s.bankAccountId,
          paymentMethodId: s.paymentMethodId,
          reference: s.reference,
        });
      }
    }
  }

  await insertAudit(tx, {
    actorId: userId,
    action: "sale.posted",
    entityType: "sales_invoice",
    entityId: invoiceId,
    payload: {
      invoice_number: invoiceNumber,
      warehouse_id: input.warehouseId,
      customer_id: input.customerId ?? null,
      payment_method: payment.recordedMethod,
      total,
      paid,
      outstanding,
      has_splits: payment.hasSplits,
      split_count: payment.hasSplits ? (input.paymentSplits ?? []).length : 0,
      line_count: input.items.length,
    },
  });

  await postSalesInvoiceRpc(tx, invoiceId, userId);

  return invoiceId;
}

/** إدراج سطر فاتورة — يجمع منطق سطر الخدمة اللحظية وسطر المنتج. */
async function insertLine(
  tx: PoolClient,
  args: {
    invoiceId: string;
    line: ComputedLine;
    lineType: string;
    effect: string;
    warehouseId: string;
    createdBy: string;
    productId?: string;
    quantity?: number;
    enteredQuantity?: number;
    conversionFactor?: number;
    quantityIncrement?: number;
    enteredPrice?: number;
    price?: number;
    taxRate?: number;
  },
): Promise<void> {
  const c = args.line;
  const isAdHoc = c.resolved.productId === null;
  const enteredPrice = isAdHoc ? c.inputPrice : (args.enteredPrice ?? c.enteredPrice);
  const price = isAdHoc ? c.inputPrice : (args.price ?? c.price);
  const taxRate = isAdHoc ? c.inputTax : (args.taxRate ?? c.taxRate);
  const quantity = isAdHoc ? c.resolved.quantity : (args.quantity ?? c.resolved.quantity);
  const enteredQuantity = isAdHoc
    ? c.resolved.quantity
    : (args.enteredQuantity ?? c.resolved.quantity);

  const lineTotal = roundN((enteredQuantity ?? quantity) * enteredPrice, 2);
  const lineTax = roundN((lineTotal * taxRate) / 100, 2);

  const uomId = isAdHoc ? null : (c.uomId ?? (await productBaseUomId(tx, c.resolved.productId!)));
  const itemId = await insertSalesInvoiceItem(tx, {
    invoiceId: args.invoiceId,
    productId: c.resolved.productId,
    description: isAdHoc ? c.resolved.serviceName : null,
    quantity,
    unitPrice: price,
    tax: lineTax,
    total: lineTotal + lineTax,
    lineType: args.lineType,
    stockEffect: args.effect,
    uomId,
    batchId: c.batchId,
    batchNumber: c.batchNumber,
    baseUnitPrice: isAdHoc ? null : price,
    enteredQuantity: isAdHoc ? null : enteredQuantity,
    baseQuantity: isAdHoc ? null : quantity,
    uomConversionFactor: isAdHoc ? null : (args.conversionFactor ?? null),
    enteredUnitPrice: isAdHoc ? null : enteredPrice,
    uomQuantityIncrement: args.quantityIncrement ?? null,
  });

  if (args.lineType === "AD_HOC_SERVICE") {
    await insertAdHocServiceLine(tx, {
      invoiceId: args.invoiceId,
      invoiceItemId: itemId,
      description: c.resolved.serviceName,
      quantity,
      unitPrice: price,
      tax: lineTax,
      total: lineTotal + lineTax,
      createdBy: args.createdBy,
    });
  }
}

/** الغلاف العام: معاملة واحدة ذرّية. */
export function createSale(
  session: ServerSession,
  input: CreateSaleInput,
): Promise<{ invoiceId: string }> {
  return withTransaction((tx) =>
    createSaleInner(tx, session, input).then((invoiceId) => ({ invoiceId })),
  );
}

// ── create_sales_return ─────────────────────────────────────────────────────

export interface ReturnLineInput {
  invoiceItemId: string;
  productId: string;
  quantity: number;
  uomId?: string | null;
}

export interface CreateSalesReturnInput {
  invoiceId: string;
  warehouseId?: string | null;
  customerId?: string | null;
  refundMethod: string;
  note?: string | null;
  items: ReturnLineInput[];
}

async function groupReturnLines(
  tx: PoolClient,
  input: CreateSalesReturnInput,
): Promise<Map<string, InvoiceItemFacts & { returnedQty: number }>> {
  const grouped = new Map<string, InvoiceItemFacts & { returnedQty: number }>();
  for (const src of input.items) {
    const facts = await invoiceItemFacts(
      tx,
      input.invoiceId,
      src.invoiceItemId,
      src.productId,
      src.uomId ?? null,
    );
    if (facts === null) {
      throw new BusinessRuleError(
        "Every sales return line must match an original invoice line and its unit",
      );
    }
    const prev = grouped.get(facts.id);
    const add = src.quantity;
    grouped.set(facts.id, {
      ...facts,
      returnedQty: (prev?.returnedQty ?? 0) + add,
    });
  }
  return grouped;
}

export async function createSalesReturnInner(
  tx: PoolClient,
  session: ServerSession,
  input: CreateSalesReturnInput,
): Promise<{ returnId: string }> {
  const userId = session.userId;
  if (!(await isStaff(tx, userId))) throw new AuthorizationError("Forbidden");
  if (!input.invoiceId) {
    throw new BusinessRuleError("A sales return must be linked to its original invoice");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BusinessRuleError("No items");
  }
  if (
    !["cash", "card", "bank_transfer", "mobile_money", "split", "credit"].includes(
      input.refundMethod,
    )
  ) {
    throw new BusinessRuleError(
      "A return refund method must be one of: cash, card, bank_transfer, mobile_money, split, credit",
    );
  }

  const inv = await lockInvoice(tx, input.invoiceId);
  if (!inv) {
    throw new BusinessRuleError(`Original invoice ${input.invoiceId} does not exist`);
  }
  if (inv.status === "draft" || inv.status === "cancelled") {
    throw new BusinessRuleError(
      `Invoice ${inv.invoiceNumber} is ${inv.status} - a return needs a confirmed sale`,
    );
  }
  if (input.customerId && inv.customerId !== input.customerId) {
    throw new BusinessRuleError("The return customer does not match the invoice customer");
  }
  if (input.warehouseId && inv.warehouseId !== input.warehouseId) {
    throw new BusinessRuleError(
      `A return must go back to the invoice warehouse (${inv.warehouseId})`,
    );
  }
  const discountFactor =
    inv.subtotal > 0 && inv.discount > 0 ? 1 - Math.min(1, inv.discount / inv.subtotal) : 1;

  // كل سطر مرتجع يجب أن يطابق سطر فاتورة أصلي ووحدته (mod on increment)
  for (const src of input.items) {
    if (!src.invoiceItemId || src.quantity <= 0) {
      throw new BusinessRuleError(
        "Every sales return line must match an original invoice line and its unit",
      );
    }
    const facts = await invoiceItemFacts(
      tx,
      input.invoiceId,
      src.invoiceItemId,
      src.productId,
      src.uomId ?? null,
    );
    if (facts === null) {
      throw new BusinessRuleError(
        "Every sales return line must match an original invoice line and its unit",
      );
    }
    if (
      facts.quantityIncrement > 0 &&
      Math.abs(
        src.quantity / facts.quantityIncrement - Math.round(src.quantity / facts.quantityIncrement),
      ) > 1e-9
    ) {
      throw new BusinessRuleError(
        "Every sales return line must match an original invoice line and its unit",
      );
    }
  }
  // تجميع كل سطر أصلي في سطر مرتجع واحد
  const seen = new Set<string>();
  for (const src of input.items) {
    if (seen.has(src.invoiceItemId)) {
      throw new BusinessRuleError("Combine each original invoice line into one return line");
    }
    seen.add(src.invoiceItemId);
  }

  const grouped = await groupReturnLines(tx, input);
  let sub = 0;
  let tax = 0;
  for (const r of grouped.values()) {
    const baseQty = roundN(r.returnedQty * r.conversionFactor, 6);
    if (baseQty !== roundN(baseQty, 3)) {
      throw new BusinessRuleError(
        `Returned base quantity exceeds the inventory precision for line ${r.id}`,
      );
    }
    const alreadyReturned = await returnedQuantityOnInvoice(
      tx,
      input.invoiceId,
      r.productId!,
      r.id,
    );
    if (alreadyReturned + baseQty > r.soldQuantity) {
      throw new BusinessRuleError(`Return exceeds the remaining quantity on invoice line ${r.id}`);
    }
    sub += roundN((r.unitPrice ?? 0) * baseQty * discountFactor, 2);
    tax += roundN(r.unitTax * baseQty, 2);
  }

  const tot = roundN(sub + tax, 2);
  if (tot <= 0) throw new BusinessRuleError("The return value must be greater than zero");

  const returnNumber = await nextSalesReturnNumber(tx);
  const returnId = await insertSalesReturn(tx, {
    returnNumber,
    invoiceId: input.invoiceId,
    customerId: input.customerId ?? inv.customerId,
    warehouseId: inv.warehouseId,
    subtotal: sub,
    tax,
    total: tot,
    refundMethod: input.refundMethod,
    note: input.note?.trim() || null,
    createdBy: userId,
  });

  for (const r of grouped.values()) {
    const baseQty = roundN(r.returnedQty * r.conversionFactor, 6);
    const lt = roundN(baseQty * roundN(r.unitPrice ?? 0, 6) * discountFactor, 2);
    const ltax = roundN(r.unitTax * baseQty, 2);
    const lineType = await itemLineType(tx, r.productId!, false);
    const effect = await itemStockEffect(tx, r.productId!, "in");

    await insertSalesReturnItem(tx, {
      returnId,
      productId: r.productId!,
      quantity: baseQty,
      unitPrice: roundN(r.unitPrice ?? 0, 6),
      tax: ltax,
      total: lt + ltax,
      lineType,
      invoiceItemId: r.id,
      uomId: r.uomId,
      enteredQuantity: r.returnedQty,
      baseQuantity: baseQty,
      uomConversionFactor: r.conversionFactor,
      enteredUnitPrice: roundN(r.enteredUnitPrice ?? 0, 4),
      uomQuantityIncrement: r.quantityIncrement,
    });

    if (effect === "STOCK_RECEIPT") {
      await postStockDelta(tx, {
        productId: r.productId!,
        warehouseId: inv.warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: baseQty,
        unitCost: null,
        movementKind: "RECEIPT",
        sourceType: "sales_return",
        sourceId: returnId,
        note: `Sales return ${returnNumber}`,
        actorId: userId,
        movementTypeLegacy: "sale_return",
      });
    }
  }

  // الأثر على العميل: توزيع بين الذمة والاسترداد النقدي
  const invoiceOutstandingVal = await invoiceOutstanding(tx, input.invoiceId);
  if (inv.customerId) {
    await customerBalanceLock(tx, inv.customerId);

    const creditApplied = roundN(Math.min(tot, invoiceOutstandingVal), 2);
    const cashRefund = roundN(tot - creditApplied, 2);

    if (creditApplied > 0) {
      await applyReturnCreditToInvoice(tx, { invoiceId: input.invoiceId, creditApplied });
      await insertCustomerLedgerEntry(tx, {
        customerId: inv.customerId,
        entryType: "return",
        credit: creditApplied,
        referenceId: returnId,
        referenceType: "sales_return",
        sourceKey: `return:${returnId}`,
        note: "مرتجع مبيعات — خصم من الذمة",
        createdBy: userId,
      });
    } else {
      await markInvoiceReturnedIfSettled(tx, input.invoiceId);
    }

    if (input.refundMethod === "credit" && cashRefund > 0) {
      await insertCustomerLedgerEntry(tx, {
        customerId: inv.customerId,
        entryType: "return",
        credit: cashRefund,
        referenceId: returnId,
        referenceType: "sales_return_credit",
        sourceKey: `return-credit:${returnId}`,
        note: "مرتجع مبيعات — رصيد دائن للعميل",
        createdBy: userId,
      });
    }
    // استرداد نقدي: لا سطر دفتر — الأثر النقدي كامل في القيد المحاسبي.

    await recalculateCustomerBalance(
      tx,
      inv.customerId,
      `مرتجع مبيعات ${returnNumber}`,
      "document_repost",
    );
  }

  // القيد المحاسبي: يعكس الإيراد والضريبة وCOGS
  const lines: JournalLine[] = [];
  const byBucket = new Map<string, number>();
  for (const r of grouped.values()) {
    const bucket = (await productItemClass(tx, r.productId!)) ?? "UNCLASSIFIED";
    const net = roundN(
      (r.unitPrice ?? 0) * roundN(r.returnedQty * r.conversionFactor, 6) * discountFactor,
      2,
    );
    byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + net);
  }
  for (const [bucket, net] of [...byBucket.entries()].sort()) {
    if (net === 0) continue;
    lines.push({
      account_code: bucket === "BY_PRODUCT" ? "4211" : bucket === "SERVICE" ? "4311" : "4111",
      debit: roundN(net, 2),
      memo: `مرتجع إيراد ${bucket}`,
    });
  }
  if (tax !== 0) {
    lines.push({ account_code: "2311", debit: roundN(tax, 2), memo: "عكس ضريبة القيمة المضافة" });
  }

  // الطرف الدائن
  const invoiceOutstandingFinal = invoiceOutstandingVal;
  const creditAppliedFinal = roundN(Math.min(tot, invoiceOutstandingFinal), 2);
  const cashRefundFinal = roundN(tot - creditAppliedFinal, 2);
  if (input.refundMethod === "credit") {
    lines.push({
      account_code: "1211",
      credit: tot,
      partner_type: "customer",
      partner_id: inv.customerId,
      memo: "عكس ذمم مبيعات — مرتجع آجل",
    });
  } else {
    if (creditAppliedFinal > 0 && inv.customerId) {
      lines.push({
        account_code: "1211",
        credit: creditAppliedFinal,
        partner_type: "customer",
        partner_id: inv.customerId,
        memo: "عكس ذم العميل",
      });
    }
    if (cashRefundFinal > 0) {
      const cashAcct = await paymentMethodLedgerAccount(tx, input.refundMethod);
      if (!cashAcct) {
        throw new BusinessRuleError(
          `No ledger account could be resolved for refund tender ${input.refundMethod} — record the refund through the treasury`,
        );
      }
      lines.push({
        account_code: cashAcct,
        credit: cashRefundFinal,
        memo: "استرداد نقدي للعميل",
      });
    }
  }

  // عكس COGS من حركات المرتجع
  const { rows: cogsRows } = await tx.query<{
    item_class: string | null;
    cost: string | null;
  }>(
    `SELECT p.item_class, sum(coalesce(sm.total_cost, 0))::text AS cost
         FROM public.stock_movements sm
         JOIN public.products p ON p.id = sm.product_id
        WHERE sm.source_type = 'sales_return'
          AND sm.source_id = $1::uuid
          AND sm.warehouse_id = $2::uuid
          AND sm.movement_kind = 'RECEIPT'::public.stock_movement_kind
        GROUP BY p.item_class`,
    [returnId, inv.warehouseId],
  );
  for (const r of cogsRows) {
    const cost = Number(r.cost ?? 0);
    if (cost === 0) continue;
    const code =
      r.item_class === "RAW_MATERIAL" ? "1311" : r.item_class === "BY_PRODUCT" ? "1314" : "1313";
    lines.push({
      account_code: code,
      debit: roundN(cost, 2),
      memo: `مرتجع مخزون ${r.item_class}`,
    });
    lines.push({
      account_code: "5111",
      credit: roundN(cost, 2),
      memo: "عكس تكلفة البضاعة المباعة",
    });
  }

  let entryId: string | null = null;
  const debits = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credits = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  if (debits > 0 || credits > 0) {
    entryId = await balanceAndPostReturn(tx, {
      memo: `مرتجع مبيعات ${returnNumber}`,
      sourceType: "sales_return",
      sourceId: returnId,
      lines,
    });
  }

  await insertAudit(tx, {
    actorId: userId,
    action: "sales_return.posted",
    entityType: "sales_return",
    entityId: returnId,
    payload: {
      return_number: returnNumber,
      invoice_id: input.invoiceId,
      customer_id: inv.customerId,
      total: tot,
      customer_credit: creditAppliedFinal,
      cash_refund: cashRefundFinal,
      journal_entry_id: entryId,
    },
  });

  return { returnId };
}

/** الغلاف العام: معاملة واحدة ذرّية. */
export function createSalesReturn(
  session: ServerSession,
  input: CreateSalesReturnInput,
): Promise<{ returnId: string }> {
  return withTransaction((tx) =>
    createSalesReturnInner(tx, session, input).then((r) => ({ returnId: r.returnId })),
  );
}

async function productItemClass(tx: PoolClient, productId: string): Promise<string | null> {
  const { rows } = await tx.query<{ item_class: string | null }>(
    "SELECT item_class::text FROM public.products WHERE id = $1::uuid",
    [productId],
  );
  return rows[0]?.item_class ?? null;
}

// ── adjust_loyalty ──────────────────────────────────────────────────────────

export interface AdjustLoyaltyInput {
  customerId: string;
  points: number;
  kind: "earn" | "redeem" | "adjust";
  note?: string | null;
}

export async function adjustLoyalty(
  session: ServerSession,
  input: AdjustLoyaltyInput,
): Promise<{ transactionId: string }> {
  return withTransaction(async (tx) => {
    if (!(await isStaff(tx, session.userId))) throw new AuthorizationError("Forbidden");
    if (!["earn", "redeem", "adjust"].includes(input.kind)) {
      throw new BusinessRuleError("Invalid kind");
    }
    const transactionId = await insertLoyaltyTransaction(tx, {
      customerId: input.customerId,
      points: input.points,
      kind: input.kind,
      note: input.note ?? null,
      createdBy: session.userId,
    });
    await applyLoyaltyPoints(tx, {
      customerId: input.customerId,
      kind: input.kind,
      points: input.points,
    });
    return { transactionId };
  });
}
