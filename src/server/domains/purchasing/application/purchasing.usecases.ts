/**
 * Use Cases: المشتريات — المرحلة 8.
 * create_purchase (بإعادة تصميم: Use Case + معاملة واحدة، الصيغة 11-معاملات
 * الكاملة مع حل الصندوق الافتراضي)، post_purchase_invoice (نقل كامل)،
 * create_purchase_return — مطابقة لدوال 008/011/012 الأصلية حرفيًا.
 *
 * اعتماديات انتقالية موثقة في DECISIONS-LOG:
 *  - create_journal_entry / balance_and_post_return (المحاسبة) — حتى المرحلة 9.
 *  - resolve_writable_payment_method / resolve_document_settlement_account تبقى
 *    في القاعدة (كتالوج طرق الدفع ومشغلاته).
 *  - حركات المخزون عبر محرك المرحلة 4 (postStockDelta) — لا اعتماد خلفي.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { postStockDelta } from "@/server/domains/stock";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";
import { productUomQuantityIncrement } from "@/server/domains/sales/infrastructure/sales.repository";
import {
  addSupplierBalance,
  balanceAndPostPurchaseReturn,
  createJournalEntry,
  defaultCashboxId,
  existingPurchaseJournalEntry,
  hasPurchaseSplits,
  insertAudit,
  insertPaymentSplit,
  insertPurchaseInvoice,
  insertPurchaseInvoiceItem,
  insertPurchaseReturn,
  insertPurchaseReturnItem,
  isStaff,
  lockPurchaseInvoice,
  lockPurchaseInvoiceForReturn,
  lockSupplier,
  nextPurchaseNumber,
  nextPurchaseReturnNumber,
  paymentMethodLedgerAccount,
  productBaseUomId,
  productItemClass,
  productPurchasable,
  productQuantityInBase,
  productUomFactor,
  purchaseItemOrigin,
  purchaseLineGroups,
  purchaseSplits,
  resolveDocumentSettlementAccount,
  resolvePurchaseLine,
  resolveWritablePaymentMethod,
  returnExpenseByClass,
  returnStockBookValue,
  subtractSupplierBalance,
  updatePurchaseInvoiceTreasury,
} from "../infrastructure/purchasing.repository";
import type { JournalLine } from "@/server/domains/sales/infrastructure/sales.repository";

// ── create_purchase ─────────────────────────────────────────────────────────

export interface PurchaseLineInput {
  productId?: string | null;
  quantity: number;
  unitCost: number;
  taxRate?: number | null;
  isService?: boolean;
  batchNumber?: string | null;
  expiryDate?: string | null;
  uomId?: string | null;
}

export interface PurchaseSplitInput {
  method: string;
  amount: number;
  paymentMethodId?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  reference?: string | null;
}

export interface CreatePurchaseInput {
  warehouseId: string;
  supplierId: string;
  paymentMethod: string;
  paid?: number | null;
  discount?: number | null;
  note?: string | null;
  cashboxId?: string | null;
  bankAccountId?: string | null;
  paymentReference?: string | null;
  paymentMethodId?: string | null;
  paymentSplits?: PurchaseSplitInput[] | null;
  items: PurchaseLineInput[];
}

interface ComputedPurchaseLine {
  productId: string | null;
  enteredQty: number;
  enteredCost: number;
  baseQty: number;
  baseCost: number;
  factor: number;
  increment: number | null;
  uomId: string | null;
  taxRate: number;
  lineTotal: number;
  lineTax: number;
  lineType: string;
  stockEffect: string;
  batchNumber: string | null;
  expiryDate: string | null;
}

async function computePurchaseLines(
  tx: PoolClient,
  items: PurchaseLineInput[],
): Promise<{ lines: ComputedPurchaseLine[]; subtotal: number; taxTotal: number }> {
  const lines: ComputedPurchaseLine[] = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    const qtyRaw = item.quantity;
    const costRaw = item.unitCost;
    const taxRate = item.taxRate ?? 0;

    if (qtyRaw === null || qtyRaw === undefined || qtyRaw <= 0) {
      throw new BusinessRuleError("Invalid quantity");
    }
    if (costRaw === null || costRaw === undefined || costRaw < 0) {
      throw new BusinessRuleError("Invalid unit cost");
    }
    if (taxRate < 0 || taxRate > 100) {
      throw new BusinessRuleError("Invalid tax rate");
    }

    const resolved = await resolvePurchaseLine(tx, item);
    const enteredQty = qtyRaw;
    const enteredCost = costRaw;
    let baseQty = qtyRaw;
    let baseCost = costRaw;
    let factor = 1;
    const increment: number | null = null;
    let uomId: string | null = null;

    if (resolved.productId !== null) {
      if (!(await productPurchasable(tx, resolved.productId))) {
        throw new BusinessRuleError(`Item ${resolved.productId} is not marked as purchasable`);
      }
      uomId = item.uomId ?? null;
      factor = await productUomFactor(tx, resolved.productId, uomId, "PURCHASE");
      baseQty = await productQuantityInBase(tx, resolved.productId, enteredQty, uomId, "PURCHASE");
      baseCost = roundN(enteredCost / factor, 6);
    }

    const lineTotal = roundN(enteredQty * enteredCost, 2);
    const lineTax = roundN((lineTotal * taxRate) / 100, 2);
    subtotal += lineTotal;
    taxTotal += lineTax;

    lines.push({
      productId: resolved.productId,
      enteredQty,
      enteredCost,
      baseQty,
      baseCost,
      factor,
      increment,
      uomId,
      taxRate,
      lineTotal,
      lineTax,
      lineType: resolved.lineType,
      stockEffect: resolved.stockEffect,
      batchNumber: item.batchNumber?.trim() || null,
      expiryDate: item.expiryDate?.trim() || null,
    });
  }

  return { lines, subtotal, taxTotal };
}

/** التنفيذ الداخلي داخل معاملة ممرّرة — الصيغة 11-معاملات كاملة (012). */
export async function createPurchaseInner(
  tx: PoolClient,
  session: ServerSession,
  input: CreatePurchaseInput,
): Promise<string> {
  const userId = session.userId;
  if (!(await isStaff(tx, userId))) throw new AuthorizationError("Forbidden");
  if (!input.warehouseId) throw new BusinessRuleError("Warehouse required");
  if (!input.supplierId) throw new BusinessRuleError("Supplier required");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BusinessRuleError("No items");
  }

  // نفس سلوك الصيغة 11: الصندوق الافتراضي للدفع النقدي عند غيابه.
  let resolvedCashbox = input.cashboxId ?? null;
  if (input.paymentMethod === "cash" && resolvedCashbox === null) {
    resolvedCashbox = await defaultCashboxId(tx);
  }

  // بناء الأقساط داخليًا كما تفعل الصيغة 11 قبل التفويض للصيغة الأساسية.
  let paymentSplits: PurchaseSplitInput[] = [];
  if ((input.paid ?? 0) > 0 && input.paymentMethod !== "credit") {
    const methodId = input.paymentMethodId ?? input.paymentMethod;
    const splitMethod = await resolveWritablePaymentMethod(tx, methodId, "purchases", true);
    if (splitMethod !== input.paymentMethod) {
      throw new BusinessRuleError(
        `Payment method id does not match purchase method ${input.paymentMethod}`,
      );
    }
    paymentSplits = [
      {
        method: splitMethod,
        amount: roundN(input.paid ?? 0, 2),
        paymentMethodId: methodId,
        cashboxId: resolvedCashbox,
        bankAccountId: input.bankAccountId ?? null,
        reference: input.paymentReference ?? null,
      },
    ];
  }

  // ── جسم الصيغة الأساسية (create_purchase 8-معاملات) ──
  const { lines, subtotal, taxTotal } = await computePurchaseLines(tx, input.items);
  const discount = input.discount ?? 0;
  const total = subtotal + taxTotal - discount;

  // التحقق من تجزئة الدفع قبل أي إدراج
  let splitTotal = 0;
  let splitCount = 0;
  let recordedMethod = input.paymentMethod || "cash";
  if (Array.isArray(paymentSplits) && paymentSplits.length > 0) {
    for (const s of paymentSplits) {
      if (
        s.method === null ||
        !["cash", "card", "bank_transfer", "mobile_money", "cheque"].includes(s.method)
      ) {
        throw new BusinessRuleError(`Unsupported purchase split method: ${s.method}`);
      }
      const writable = await resolveWritablePaymentMethod(
        tx,
        s.paymentMethodId ?? s.method,
        "purchases",
        true,
      );
      if (writable !== s.method) {
        throw new BusinessRuleError(`Payment method id does not match purchase tender ${s.method}`);
      }
      if (s.amount <= 0) {
        throw new BusinessRuleError("Every purchase payment tender requires a positive amount");
      }
      splitTotal += s.amount;
      splitCount += 1;
    }
    if (roundN(splitTotal, 2) > roundN(total, 2)) {
      throw new BusinessRuleError(
        `Purchase payment split total (${roundN(splitTotal, 2).toFixed(2)}) exceeds the invoice total (${roundN(total, 2).toFixed(2)})`,
      );
    }
    if (splitCount > 1) recordedMethod = "split";
  }

  const supplier = await lockSupplier(tx, input.supplierId);
  if (!supplier) throw new BusinessRuleError("Selected supplier is unavailable");

  // مع التجزئة، المدفوع هو مجموع الأجزاء نفسها، لا رقم يخمّنه العميل.
  const paid = splitCount > 0 ? roundN(splitTotal, 2) : Math.min(input.paid ?? 0, total);

  if (paid < 0 || paid > total) {
    throw new BusinessRuleError(
      `Paid amount (${paid.toFixed(2)}) must be between zero and the invoice total (${total.toFixed(2)})`,
    );
  }
  if (paid < total && supplier.isSystem) {
    throw new BusinessRuleError(
      "The system cash supplier cannot carry a payable balance — record a paid purchase or choose a real supplier",
    );
  }

  const invoiceNumber = await nextPurchaseNumber(tx);
  const invoiceId = await insertPurchaseInvoice(tx, {
    invoiceNumber,
    supplierId: input.supplierId,
    warehouseId: input.warehouseId,
    subtotal,
    discount,
    tax: taxTotal,
    total,
    paid,
    paymentMethod: recordedMethod,
    note: input.note?.trim() || null,
    createdBy: userId,
  });

  // إدراج السطور وحركات المخزون
  for (const line of lines) {
    let increment: number | null = null;
    let uomId = line.uomId;
    if (line.productId !== null) {
      increment = await productUomQuantityIncrement(tx, line.productId, line.uomId);
      uomId = line.uomId ?? (await productBaseUomId(tx, line.productId));
    }

    await insertPurchaseInvoiceItem(tx, {
      invoiceId,
      productId: line.productId,
      quantity: line.baseQty,
      unitCost: line.baseCost,
      tax: line.lineTax,
      total: line.lineTotal + line.lineTax,
      lineType: line.lineType,
      stockEffect: line.stockEffect,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      uomId,
      baseUnitCost: line.productId === null ? null : line.baseCost,
      enteredQuantity: line.productId === null ? null : line.enteredQty,
      baseQuantity: line.productId === null ? null : line.baseQty,
      uomConversionFactor: line.productId === null ? null : line.factor,
      enteredUnitCost: line.productId === null ? null : line.enteredCost,
      uomQuantityIncrement: line.productId === null ? null : increment,
    });

    if (line.stockEffect === "STOCK_RECEIPT" && line.productId !== null) {
      await postStockDelta(tx, {
        productId: line.productId,
        warehouseId: input.warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: line.baseQty,
        unitCost: line.baseCost,
        movementKind: "RECEIPT",
        sourceType: "purchase_invoice",
        sourceId: invoiceId,
        note: "Purchase receipt",
        actorId: userId,
        movementTypeLegacy: "purchase",
      });
    }
  }

  // سجلات التجزئة — الحارس المؤجل يتحقق من مطابقة المدفوع عند الالتزام.
  if (splitCount > 0) {
    for (const s of paymentSplits) {
      await insertPaymentSplit(tx, {
        documentType: "purchase_invoice",
        documentId: invoiceId,
        method: s.method,
        amount: s.amount,
        reference: s.reference?.trim() || null,
        createdBy: userId,
        cashboxId: s.cashboxId ?? null,
        bankAccountId: s.bankAccountId ?? null,
        paymentMethodId: s.paymentMethodId ?? null,
      });
    }
  }

  if (paid < total) {
    await addSupplierBalance(tx, input.supplierId, total - paid);
  }

  await insertAudit(tx, {
    actorId: userId,
    action: "purchase.posted",
    entityType: "purchase_invoice",
    entityId: invoiceId,
    payload: {
      invoice_number: invoiceNumber,
      supplier_id: input.supplierId,
      warehouse_id: input.warehouseId,
      total,
      paid,
      line_count: input.items.length,
      has_splits: splitCount > 0,
      split_count: splitCount,
    },
  });

  // الترحيل المحاسبي المتوازن التلقائي (post_purchase_invoice — نقل كامل أدناه)
  await tx.query("SELECT set_config('app.payment_split_internal_post', 'on', true)");
  try {
    await postPurchaseInvoiceInner(tx, session, invoiceId);
  } finally {
    await tx.query("SELECT set_config('app.payment_split_internal_post', 'off', true)");
  }

  // توجيه الخزينة كما تفعل الصيغة 11 بعد التفويض
  await updatePurchaseInvoiceTreasury(tx, {
    invoiceId,
    cashboxId: resolvedCashbox,
    bankAccountId: input.bankAccountId ?? null,
    paymentReference: input.paymentReference?.trim() || null,
    paymentMethodId: input.paymentMethodId ?? null,
  });

  return invoiceId;
}

export function createPurchase(
  session: ServerSession,
  input: CreatePurchaseInput,
): Promise<{ invoiceId: string }> {
  return withTransaction((tx) =>
    createPurchaseInner(tx, session, input).then((invoiceId) => ({ invoiceId })),
  );
}

// ── post_purchase_invoice (نقل كامل — 011) ─────────────────────────────────

export async function postPurchaseInvoiceInner(
  tx: PoolClient,
  session: ServerSession,
  invoiceId: string,
): Promise<string | null> {
  const userId = session.userId;
  // الأدوار: owner/manager/accountant دائمًا؛ cashier فقط عند الاستدعاء الداخلي المجزأ.
  const isInternalSplitPost =
    (
      await tx.query<{ v: string }>(
        "SELECT current_setting('app.payment_split_internal_post', true) AS v",
      )
    ).rows[0]?.v === "on";
  let ok = false;
  for (const r of ["owner", "manager", "accountant"]) {
    if (await hasRoleAny(tx, userId, r)) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    // cashier فقط عند الاستدعاء الداخلي المجزأ (كما الأصل).
    const cashierOk = isInternalSplitPost && (await isStaff(tx, userId));
    if (!cashierOk) {
      throw new AuthorizationError(
        "Only an owner, manager or accountant may post a purchase invoice",
      );
    }
  }

  const inv = await lockPurchaseInvoice(tx, invoiceId);
  if (!inv) throw new BusinessRuleError("Purchase invoice not found");
  if (inv.status === "draft" || inv.status === "cancelled") {
    throw new BusinessRuleError(
      `Purchase ${inv.invoiceNumber} is ${inv.status} - only confirmed, paid or partial invoices post`,
    );
  }
  if (inv.paid < 0) {
    throw new BusinessRuleError(
      `Purchase ${inv.invoiceNumber} carries a negative payment (${inv.paid.toFixed(2)}). A supplier return is a return document, not a negative payment.`,
    );
  }
  if (inv.paid > inv.total) {
    throw new BusinessRuleError(
      `Purchase ${inv.invoiceNumber} was paid ${inv.paid.toFixed(2)} against a total of ${inv.total.toFixed(2)}. Fix the invoice before posting - a payment cannot exceed the invoice.`,
    );
  }
  if (await existingPurchaseJournalEntry(tx, invoiceId)) {
    throw new BusinessRuleError(
      `Purchase ${inv.invoiceNumber} has already been posted to the ledger`,
    );
  }

  const cashAcct = await resolveDocumentSettlementAccount(
    tx,
    inv.paymentMethod,
    inv.cashboxId,
    inv.bankAccountId,
    inv.paymentMethodId,
  );
  const owed = Math.max(inv.total - inv.paid, 0);

  const lines: JournalLine[] = [];
  for (const g of purchaseLineGroupsOrdered(await purchaseLineGroups(tx, invoiceId))) {
    if (g.amount !== 0) {
      lines.push({
        account_code:
          g.effect !== "STOCK_RECEIPT"
            ? "5911"
            : g.itemClass === "RAW_MATERIAL"
              ? "1311"
              : g.itemClass === "BY_PRODUCT"
                ? "1314"
                : g.itemClass === "FINISHED_GOOD"
                  ? "1313"
                  : "1315",
        debit: roundN(g.amount, 2),
        memo: g.effect !== "STOCK_RECEIPT" ? `مصروف مشتريات ${g.itemClass}` : `شراء ${g.itemClass}`,
      });
    }
    if (g.lineTax !== 0) {
      lines.push({
        account_code: "1316",
        debit: roundN(g.lineTax, 2),
        memo: "ضريبة مدخلات قابلة للاسترداد",
      });
    }
  }

  if (inv.tax !== 0) {
    const hasLineTax = (await purchaseLineGroups(tx, invoiceId)).some((g) => g.lineTax !== 0);
    if (!hasLineTax) {
      lines.push({
        account_code: "1316",
        debit: roundN(inv.tax, 2),
        memo: "ضريبة مدخلات قابلة للاسترداد",
      });
    }
  }

  if (lines.length === 0) {
    throw new BusinessRuleError(
      `Purchase ${inv.invoiceNumber} has nothing to post - its lines are empty or zero`,
    );
  }

  if (owed > 0) {
    lines.push({
      account_code: "2111",
      credit: roundN(owed, 2),
      memo: "مستحق للمورد",
      partner_type: "supplier",
      partner_id: inv.supplierId,
    });
  }

  // السداد: إمّا حساب واحد (السلوك السابق) أو حساب لكل طريقة
  const hasSplits = await hasPurchaseSplits(tx, invoiceId);
  if (inv.paid > 0 && hasSplits) {
    for (const s of await purchaseSplits(tx, invoiceId)) {
      const splitAcct = await resolveDocumentSettlementAccount(
        tx,
        s.method,
        s.cashboxId,
        s.bankAccountId,
        s.paymentMethodId ?? s.method,
      );
      if (!splitAcct) {
        throw new BusinessRuleError(
          `No ledger account could be resolved for split tender ${s.method}`,
        );
      }
      if (s.amount > 0) {
        lines.push({
          account_code: splitAcct,
          credit: s.amount,
          memo: `سداد للمورد (دفع مجزأ) — ${s.method}` + (s.reference ? ` — ${s.reference}` : ""),
        });
      }
    }
  } else if (inv.paid > 0 && cashAcct !== null) {
    lines.push({ account_code: cashAcct, credit: roundN(inv.paid, 2), memo: "سداد للمورد" });
  }

  return createJournalEntry(tx, {
    memo: `فاتورة مشتريات ${inv.invoiceNumber}`,
    entryDate: inv.createdAt.slice(0, 10),
    sourceType: "purchase_invoice",
    sourceId: invoiceId,
    actorId: userId,
    lines: lines as unknown as Array<Record<string, unknown>>,
  });
}

function purchaseLineGroupsOrdered(
  groups: Array<{ itemClass: string; effect: string; amount: number; lineTax: number }>,
) {
  return [...groups].sort((a, b) =>
    a.itemClass === b.itemClass
      ? a.effect.localeCompare(b.effect)
      : a.itemClass.localeCompare(b.itemClass),
  );
}

async function hasRoleAny(tx: PoolClient, userId: string, role: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT public.has_role($1::uuid, $2::public.app_role) AS ok",
    [userId, role],
  );
  return rows[0]?.ok === true;
}

// ── create_purchase_return ──────────────────────────────────────────────────

export interface PurchaseReturnLineInput {
  invoiceItemId: string;
  productId: string;
  quantity: number;
  uomId?: string | null;
}

export interface CreatePurchaseReturnInput {
  invoiceId: string;
  warehouseId: string;
  supplierId: string;
  refundMethod: string;
  note?: string | null;
  items: PurchaseReturnLineInput[];
}

export async function createPurchaseReturnInner(
  tx: PoolClient,
  session: ServerSession,
  input: CreatePurchaseReturnInput,
): Promise<string> {
  const userId = session.userId;
  if (!(await isStaff(tx, userId))) throw new AuthorizationError("Forbidden");
  if (!input.invoiceId) {
    throw new BusinessRuleError("A purchase return must be linked to its original invoice");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BusinessRuleError("No items");
  }

  const invoice = await lockPurchaseInvoiceForReturn(tx, input.invoiceId);
  if (!invoice) {
    throw new BusinessRuleError(`Original purchase invoice ${input.invoiceId} does not exist`);
  }
  if (invoice.status === "draft" || invoice.status === "cancelled") {
    throw new BusinessRuleError("A return requires a confirmed purchase invoice");
  }
  if (input.supplierId !== invoice.supplierId || input.warehouseId !== invoice.warehouseId) {
    throw new BusinessRuleError(
      "Purchase return supplier and warehouse must match the original invoice",
    );
  }
  const discountFactor =
    invoice.subtotal > 0 && invoice.discount > 0
      ? 1 - Math.min(1, invoice.discount / invoice.subtotal)
      : 1;

  // تجميع كل سطر أصلي في سطر مرتجع واحد
  const seen = new Set<string>();
  for (const src of input.items) {
    if (seen.has(src.invoiceItemId)) {
      throw new BusinessRuleError("Combine each original invoice line into one return line");
    }
    seen.add(src.invoiceItemId);
  }

  // المرحلة 1: التحقق الكامل وحساب المجاميع (كما الأصل)
  interface PreparedLine {
    origin: NonNullable<Awaited<ReturnType<typeof purchaseItemOrigin>>>;
    srcQty: number;
    baseQty: number;
    cost: number;
    enteredCost: number;
    lt: number;
    ltax: number;
  }
  const prepared: PreparedLine[] = [];
  let sub = 0;
  let tax = 0;

  for (const src of input.items) {
    if (!src.invoiceItemId || !src.productId || src.quantity === null || src.quantity <= 0) {
      throw new BusinessRuleError(
        "Every purchase return line must reference an invoice item and positive quantity",
      );
    }
    const origin = await purchaseItemOrigin(tx, input.invoiceId, src.invoiceItemId, src.productId);
    if (!origin) {
      throw new BusinessRuleError(
        `Purchase return item ${src.invoiceItemId} does not belong to the selected invoice`,
      );
    }
    if ((src.uomId ?? null) !== origin.uomId) {
      throw new BusinessRuleError("Purchase returns must use the original invoice line unit");
    }
    const increment = origin.quantityIncrement;
    const qtyDiv = src.quantity / increment;
    if (Math.abs(qtyDiv - Math.round(qtyDiv)) > 1e-9) {
      throw new BusinessRuleError(
        `Returned quantity must follow the original invoice unit increment ${increment}`,
      );
    }
    const baseQty = src.quantity * origin.conversionFactor;
    if (baseQty !== roundN(baseQty, 3)) {
      throw new BusinessRuleError(
        `Returned base quantity exceeds inventory precision on invoice line ${src.invoiceItemId}`,
      );
    }
    const cost = origin.baseUnitCost ?? origin.unitCost;
    const enteredCost = origin.enteredUnitCost ?? cost * origin.conversionFactor;

    const returned = await returnedQuantitySafe(
      tx,
      input.invoiceId,
      src.productId,
      src.invoiceItemId,
    );
    if (returned + baseQty > origin.quantity) {
      throw new BusinessRuleError(
        `Purchase return exceeds the received quantity on invoice line ${src.invoiceItemId}`,
      );
    }

    const stockEffect = await itemStockEffectOut(tx, src.productId);
    if (stockEffect === "STOCK_ISSUE") {
      const { inventoryLockedQty } =
        await import("@/server/domains/sales/infrastructure/sales.repository");
      const avail = await inventoryLockedQty(tx, src.productId, input.warehouseId);
      if (avail < baseQty) {
        throw new BusinessRuleError(`Insufficient stock for item ${src.productId}`);
      }
    }

    const lt = roundN(baseQty * cost * discountFactor, 2);
    const ltax = roundN(baseQty * (origin.tax / (origin.quantity || 1)), 2);
    sub += lt;
    tax += ltax;
    prepared.push({ origin, srcQty: src.quantity, baseQty, cost, enteredCost, lt, ltax });
  }
  const tot = sub + tax;
  const returnNumber = await nextPurchaseReturnNumber(tx);

  const returnId = await insertPurchaseReturn(tx, {
    returnNumber,
    invoiceId: input.invoiceId,
    supplierId: input.supplierId,
    warehouseId: input.warehouseId,
    subtotal: sub,
    tax,
    total: tot,
    refundMethod: input.refundMethod,
    note: input.note?.trim() || null,
    createdBy: userId,
  });

  // المرحلة 2: الإدراج والحركات
  for (const p of prepared) {
    const lineType = await itemLineType2(tx, p.origin.productId);
    const stockEffect = await itemStockEffectOut(tx, p.origin.productId);

    await insertPurchaseReturnItem(tx, {
      returnId,
      productId: p.origin.productId,
      quantity: p.baseQty,
      unitCost: p.cost,
      tax: p.ltax,
      total: p.lt + p.ltax,
      lineType,
      invoiceItemId: p.origin.id,
      uomId: p.origin.uomId ?? (await productBaseUomId(tx, p.origin.productId)),
      enteredQuantity: p.srcQty,
      baseQuantity: p.baseQty,
      uomConversionFactor: p.origin.conversionFactor,
      enteredUnitCost: p.enteredCost,
      uomQuantityIncrement: p.origin.quantityIncrement,
    });

    if (stockEffect === "STOCK_ISSUE") {
      await postStockDelta(tx, {
        productId: p.origin.productId,
        warehouseId: input.warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: -p.baseQty,
        unitCost: p.cost,
        movementKind: "ISSUE",
        sourceType: "purchase_return",
        sourceId: returnId,
        note: "Purchase return",
        actorId: userId,
        movementTypeLegacy: "purchase_return",
      });
    }
  }

  // T-12: رصيد المورد يتغير فعليًا ويمكن أن يصير سالبًا.
  await subtractSupplierBalance(tx, input.supplierId, tot);

  // ── T-08(ب): قيد المرتجع — أطراف قيد المشتريات المقلوبة ──
  const lines: JournalLine[] = [];
  if (tot !== 0) {
    for (const g of [...(await returnStockBookValue(tx, returnId))].sort((a, b) =>
      a.itemClass.localeCompare(b.itemClass),
    )) {
      if (g.bookValue === 0) continue;
      const code =
        g.itemClass === "RAW_MATERIAL"
          ? "1311"
          : g.itemClass === "BY_PRODUCT"
            ? "1314"
            : g.itemClass === "FINISHED_GOOD"
              ? "1313"
              : "1315";
      lines.push({
        account_code: code,
        credit: roundN(g.bookValue, 2),
        memo: `مرتجع مشتريات ${g.itemClass === "UNCLASSIFIED" ? "GOOD" : g.itemClass}`,
      });
    }

    for (const g of [...(await returnExpenseByClass(tx, returnId))].sort((a, b) =>
      a.itemClass.localeCompare(b.itemClass),
    )) {
      if (g.expense === 0) continue;
      lines.push({
        account_code: "5911",
        credit: roundN(g.expense, 2),
        memo: `عكس مصروف شراء ${g.itemClass === "UNCLASSIFIED" ? "GOOD" : g.itemClass}`,
      });
    }

    if (tax !== 0) {
      lines.push({ account_code: "1316", credit: roundN(tax, 2), memo: "عكس ضريبة المدخلات" });
    }

    const cashAcct = await paymentMethodLedgerAccount(tx, input.refundMethod);
    if (cashAcct !== null) {
      lines.push({
        account_code: cashAcct,
        debit: roundN(tot, 2),
        memo: "استرداد من المورد",
      });
    } else {
      lines.push({ account_code: "2111", debit: roundN(tot, 2), memo: "عكس ذمة المورد" });
    }
  }

  const entryId =
    tot !== 0
      ? await balanceAndPostPurchaseReturn(tx, {
          memo: `مرتجع مشتريات ${returnNumber}`,
          returnId,
          lines: lines as unknown as Array<Record<string, unknown>>,
        })
      : null;

  await insertAudit(tx, {
    actorId: userId,
    action: "purchase_return.posted",
    entityType: "purchase_return",
    entityId: returnId,
    payload: {
      return_number: returnNumber,
      invoice_id: input.invoiceId,
      supplier_id: input.supplierId,
      total: tot,
      journal_entry_id: entryId,
    },
  });

  return returnId;
}

async function returnedQuantitySafe(
  tx: PoolClient,
  invoiceId: string,
  productId: string,
  invoiceItemId: string,
): Promise<number> {
  const { returnedQuantityOnPurchase } =
    await import("@/server/domains/purchasing/infrastructure/purchasing.repository");
  return returnedQuantityOnPurchase(tx, invoiceId, productId, invoiceItemId);
}

async function itemStockEffectOut(tx: PoolClient, productId: string): Promise<string> {
  const { rows } = await tx.query<{ eff: string }>(
    "SELECT public.item_stock_effect($1::uuid, 'out')::text AS eff",
    [productId],
  );
  return rows[0].eff;
}

async function itemLineType2(tx: PoolClient, productId: string): Promise<string> {
  const { rows } = await tx.query<{ lt: string }>(
    "SELECT public.item_line_type($1::uuid, false)::text AS lt",
    [productId],
  );
  return rows[0].lt;
}

export function createPurchaseReturn(
  session: ServerSession,
  input: CreatePurchaseReturnInput,
): Promise<{ returnId: string }> {
  return withTransaction((tx) =>
    createPurchaseReturnInner(tx, session, input).then((r) => ({ returnId: r })),
  );
}
