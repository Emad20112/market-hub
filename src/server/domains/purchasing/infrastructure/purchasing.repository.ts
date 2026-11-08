/**
 * مستودع المشتريات — المرحلة 8 (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج الوصول للبيانات كما في دوال 008/011/012 الأصلية (create_purchase،
 * post_purchase_invoice، create_purchase_return) مع الحفاظ على الترتيب والأقفال حرفيًا.
 *
 * اعتماديات انتقالية (موثقة في DECISIONS-LOG):
 *  - create_journal_entry / balance_and_post_return (المحاسبة) — حتى المرحلة 9.
 *  - resolve_writable_payment_method / resolve_document_settlement_account تبقى
 *    في القاعدة (كتالوج طرق الدفع ومشغلاته).
 */
import type { PoolClient } from "pg";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";
import {
  resolveDocumentSettlementAccount,
  resolveWritablePaymentMethod,
  createJournalEntry,
  insertAudit,
} from "@/server/domains/treasury/infrastructure/treasury.repository";

export {
  resolveDocumentSettlementAccount,
  resolveWritablePaymentMethod,
  createJournalEntry,
  insertAudit,
};

/** خصائص سطر شراء كما تُشتق من resolve_purchase_line (008). */
export async function resolvePurchaseLine(
  tx: PoolClient,
  line: { productId?: string | null; quantity: unknown; isService?: boolean },
): Promise<{ productId: string | null; quantity: number; lineType: string; stockEffect: string }> {
  const productId =
    typeof line.productId === "string" && line.productId.trim() !== ""
      ? line.productId.trim()
      : null;
  const quantity = Number(line.quantity);

  if (productId === null) {
    return { productId: null, quantity, lineType: "AD_HOC_SERVICE", stockEffect: "NONE" };
  }
  const { rows } = await tx.query<{ nature: string | null }>(
    "SELECT item_nature::text AS nature FROM public.products WHERE id = $1::uuid",
    [productId],
  );
  if (rows[0]?.nature === null || rows[0] === undefined) {
    if (line.isService === true) {
      return { productId: null, quantity, lineType: "AD_HOC_SERVICE", stockEffect: "NONE" };
    }
    throw new Error(`Item ${productId} does not exist`);
  }
  return {
    productId,
    quantity,
    lineType: await itemLineType(tx, productId),
    stockEffect: await itemStockEffect(tx, productId, "in"),
  };
}

async function itemLineType(tx: PoolClient, productId: string): Promise<string> {
  const { rows } = await tx.query<{ lt: string }>(
    "SELECT public.item_line_type($1::uuid, false)::text AS lt",
    [productId],
  );
  return rows[0].lt;
}

async function itemStockEffect(
  tx: PoolClient,
  productId: string,
  direction: "out" | "in",
): Promise<string> {
  const { rows } = await tx.query<{ eff: string }>(
    "SELECT public.item_stock_effect($1::uuid, $2::text)::text AS eff",
    [productId, direction],
  );
  return rows[0].eff;
}

export async function isStaff(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>("SELECT public.is_staff($1::uuid) AS ok", [
    userId,
  ]);
  return rows[0]?.ok === true;
}

export async function productPurchasable(tx: PoolClient, productId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean | null }>(
    "SELECT p.is_purchasable AS ok FROM public.products p WHERE p.id = $1::uuid",
    [productId],
  );
  return rows[0]?.ok === true;
}

export async function productUomFactor(
  tx: PoolClient,
  productId: string,
  unitId: string | null,
  direction: "SALE" | "PURCHASE",
): Promise<number> {
  const { rows } = await tx.query<{ f: string }>(
    "SELECT public.product_uom_factor($1::uuid, $2::uuid, $3::text)::text AS f",
    [productId, unitId, direction],
  );
  return Number(rows[0].f);
}

export async function productQuantityInBase(
  tx: PoolClient,
  productId: string,
  quantity: number,
  unitId: string | null,
  direction: "SALE" | "PURCHASE",
): Promise<number> {
  const { rows } = await tx.query<{ q: string }>(
    "SELECT public.product_quantity_in_base($1::uuid, $2::numeric, $3::uuid, $4::text)::text AS q",
    [productId, quantity, unitId, direction],
  );
  return Number(rows[0].q);
}

export async function nextPurchaseNumber(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT public.fn_next_document_number('purchase_invoice') AS n",
  );
  return rows[0].n;
}

export async function nextPurchaseReturnNumber(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT public.fn_next_document_number('purchase_return') AS n",
  );
  return rows[0].n;
}

export async function defaultCashboxId(tx: PoolClient): Promise<string | null> {
  const { rows } = await tx.query<{ id: string | null }>(
    `SELECT id::text FROM public.cashboxes WHERE is_active = true AND is_default = true LIMIT 1`,
  );
  if (rows[0]?.id) return rows[0].id;
  const { rows: fallback } = await tx.query<{ id: string | null }>(
    "SELECT id::text FROM public.cashboxes WHERE is_active = true ORDER BY created_at ASC LIMIT 1",
  );
  return fallback[0]?.id ?? null;
}

export async function lockSupplier(
  tx: PoolClient,
  supplierId: string,
): Promise<{ balance: number; isSystem: boolean } | null> {
  const { rows } = await tx.query<{ balance: string | null; is_system: boolean | null }>(
    `SELECT balance::text, is_system FROM public.suppliers WHERE id = $1::uuid FOR UPDATE`,
    [supplierId],
  );
  if (!rows[0]) return null;
  return { balance: Number(rows[0].balance ?? 0), isSystem: rows[0].is_system === true };
}

export interface InsertPurchaseInvoiceArgs {
  invoiceNumber: string;
  supplierId: string;
  warehouseId: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  paymentMethod: string;
  note: string | null;
  createdBy: string;
}

export async function insertPurchaseInvoice(
  tx: PoolClient,
  a: InsertPurchaseInvoiceArgs,
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.purchase_invoices (
       invoice_number, supplier_id, warehouse_id, status, payment_status,
       subtotal, discount, tax, total, paid, payment_method, note, created_by
     )
     VALUES ($1, $2::uuid, $3::uuid, 'confirmed'::public.invoice_status,
             public.derive_payment_status($8::numeric, $7::numeric)::public.payment_status,
             $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8::numeric,
             $9::public.payment_method, $10, $11::uuid)
     RETURNING id::text AS id`,
    [
      a.invoiceNumber,
      a.supplierId,
      a.warehouseId,
      a.subtotal,
      a.discount,
      a.tax,
      a.total,
      a.paid,
      a.paymentMethod,
      a.note,
      a.createdBy,
    ],
  );
  return rows[0].id;
}

export interface InsertPurchaseItemArgs {
  invoiceId: string;
  productId: string | null;
  quantity: number;
  unitCost: number;
  tax: number;
  total: number;
  lineType: string;
  stockEffect: string;
  batchNumber: string | null;
  expiryDate: string | null;
  uomId: string | null;
  baseUnitCost: number | null;
  enteredQuantity: number | null;
  baseQuantity: number | null;
  uomConversionFactor: number | null;
  enteredUnitCost: number | null;
  uomQuantityIncrement: number | null;
}

export async function insertPurchaseInvoiceItem(
  tx: PoolClient,
  a: InsertPurchaseItemArgs,
): Promise<void> {
  await tx.query(
    `INSERT INTO public.purchase_invoice_items (
       invoice_id, product_id, quantity, unit_cost, discount, tax, total,
       line_type, stock_effect, batch_number, expiry_date, uom_id, base_unit_cost,
       entered_quantity, base_quantity, uom_conversion_factor, entered_unit_cost,
       uom_quantity_increment
     )
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, 0, $5::numeric, $6::numeric,
             $7, $8, $9, $10::date, $11::uuid, $12::numeric, $13::numeric, $14::numeric,
             $15::numeric, $16::numeric, $17::numeric)`,
    [
      a.invoiceId,
      a.productId,
      a.quantity,
      a.unitCost,
      a.tax,
      a.total,
      a.lineType,
      a.stockEffect,
      a.batchNumber,
      a.expiryDate,
      a.uomId,
      a.baseUnitCost,
      a.enteredQuantity,
      a.baseQuantity,
      a.uomConversionFactor,
      a.enteredUnitCost,
      a.uomQuantityIncrement,
    ],
  );
}

export interface InsertPaymentSplitArgs {
  documentType: string;
  documentId: string;
  method: string;
  amount: number;
  reference: string | null;
  createdBy: string;
  cashboxId: string | null;
  bankAccountId: string | null;
  paymentMethodId: string | null;
}

export async function insertPaymentSplit(tx: PoolClient, a: InsertPaymentSplitArgs): Promise<void> {
  await tx.query(
    `INSERT INTO public.payment_splits (
       document_type, document_id, method, amount, reference, created_by,
       cashbox_id, bank_account_id, payment_method_id
     )
     VALUES ($1, $2::uuid, $3::public.payment_method, $4::numeric, $5, $6::uuid,
             $7::uuid, $8::uuid, $9)`,
    [
      a.documentType,
      a.documentId,
      a.method,
      roundN(a.amount, 2),
      a.reference,
      a.createdBy,
      a.cashboxId,
      a.bankAccountId,
      a.paymentMethodId ?? a.method,
    ],
  );
}

export async function addSupplierBalance(
  tx: PoolClient,
  supplierId: string,
  amount: number,
): Promise<void> {
  await tx.query(
    `UPDATE public.suppliers
        SET balance = balance + $2::numeric, updated_at = now()
      WHERE id = $1::uuid`,
    [supplierId, amount],
  );
}

export async function subtractSupplierBalance(
  tx: PoolClient,
  supplierId: string,
  amount: number,
): Promise<void> {
  await tx.query(
    `UPDATE public.suppliers
        SET balance = round(coalesce(balance, 0) - $2::numeric, 2), updated_at = now()
      WHERE id = $1::uuid`,
    [supplierId, amount],
  );
}

export async function updatePurchaseInvoiceTreasury(
  tx: PoolClient,
  args: {
    invoiceId: string;
    cashboxId: string | null;
    bankAccountId: string | null;
    paymentReference: string | null;
    paymentMethodId: string | null;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.purchase_invoices
        SET cashbox_id = $2::uuid, bank_account_id = $3::uuid,
            payment_reference = $4, payment_method_id = $5
      WHERE id = $1::uuid`,
    [
      args.invoiceId,
      args.cashboxId,
      args.bankAccountId,
      args.paymentReference,
      args.paymentMethodId,
    ],
  );
}

// ── post_purchase_invoice (نقل كامل — 011) ──────────────────────────────────

export interface PurchaseInvoiceLock {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  status: string;
  paymentMethod: string;
  cashboxId: string | null;
  bankAccountId: string | null;
  paymentMethodId: string | null;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  createdAt: string;
}

export async function lockPurchaseInvoice(
  tx: PoolClient,
  invoiceId: string,
): Promise<PurchaseInvoiceLock | null> {
  const { rows } = await tx.query<{
    id: string;
    invoice_number: string;
    supplier_id: string;
    status: string;
    payment_method: string;
    cashbox_id: string | null;
    bank_account_id: string | null;
    payment_method_id: string | null;
    subtotal: string | null;
    tax: string | null;
    total: string | null;
    paid: string | null;
    created_at: string;
  }>(
    `SELECT id::text, invoice_number, supplier_id::text, status::text, payment_method::text,
            cashbox_id::text, bank_account_id::text, payment_method_id, subtotal::text,
            tax::text, total::text, paid::text, created_at::text
       FROM public.purchase_invoices WHERE id = $1::uuid FOR UPDATE`,
    [invoiceId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    supplierId: r.supplier_id,
    status: r.status,
    paymentMethod: r.payment_method,
    cashboxId: r.cashbox_id,
    bankAccountId: r.bank_account_id,
    paymentMethodId: r.payment_method_id,
    subtotal: Number(r.subtotal ?? 0),
    tax: Number(r.tax ?? 0),
    total: Number(r.total ?? 0),
    paid: Number(r.paid ?? 0),
    createdAt: r.created_at,
  };
}

export async function existingPurchaseJournalEntry(
  tx: PoolClient,
  invoiceId: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ id: string | null }>(
    `SELECT id::text FROM public.journal_entries
      WHERE source_type = 'purchase_invoice' AND source_id = $1::uuid AND status <> 'REVERSED'`,
    [invoiceId],
  );
  return rows[0]?.id ?? null;
}

export async function purchaseLineGroups(
  tx: PoolClient,
  invoiceId: string,
): Promise<Array<{ itemClass: string; effect: string; amount: number; lineTax: number }>> {
  const { rows } = await tx.query<{
    item_class: string;
    effect: string;
    amount: string | null;
    line_tax: string | null;
  }>(
    `SELECT coalesce(p.item_class::text, 'UNCLASSIFIED') AS item_class,
            coalesce(it.stock_effect, 'NONE') AS effect,
            sum(it.total)::text AS amount, sum(it.tax)::text AS line_tax
       FROM public.purchase_invoice_items it
       LEFT JOIN public.products p ON p.id = it.product_id
      WHERE it.invoice_id = $1::uuid
      GROUP BY coalesce(p.item_class::text, 'UNCLASSIFIED'), coalesce(it.stock_effect, 'NONE')`,
    [invoiceId],
  );
  return rows.map((r) => ({
    itemClass: r.item_class,
    effect: r.effect,
    amount: Number(r.amount ?? 0),
    lineTax: Number(r.line_tax ?? 0),
  }));
}

export async function hasPurchaseSplits(tx: PoolClient, invoiceId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.payment_splits
        WHERE document_type = 'purchase_invoice' AND document_id = $1::uuid
     ) AS ok`,
    [invoiceId],
  );
  return rows[0]?.ok === true;
}

export interface PurchaseSplitRow {
  method: string;
  amount: number;
  reference: string | null;
  cashboxId: string | null;
  bankAccountId: string | null;
  paymentMethodId: string | null;
}

export async function purchaseSplits(
  tx: PoolClient,
  invoiceId: string,
): Promise<PurchaseSplitRow[]> {
  const { rows } = await tx.query<{
    method: string;
    amount: string;
    reference: string | null;
    cashbox_id: string | null;
    bank_account_id: string | null;
    payment_method_id: string | null;
  }>(
    `SELECT method::text, amount::text, reference, cashbox_id::text,
            bank_account_id::text, payment_method_id
       FROM public.payment_splits
      WHERE document_type = 'purchase_invoice' AND document_id = $1::uuid`,
    [invoiceId],
  );
  return rows.map((r) => ({
    method: r.method,
    amount: Number(r.amount),
    reference: r.reference,
    cashboxId: r.cashbox_id,
    bankAccountId: r.bank_account_id,
    paymentMethodId: r.payment_method_id,
  }));
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

export async function balanceAndPostReturn(
  tx: PoolClient,
  args: {
    memo: string;
    sourceType: string;
    sourceId: string;
    lines: Array<Record<string, unknown>>;
  },
): Promise<string | null> {
  const { rows } = await tx.query<{ e: string | null }>(
    `SELECT public.balance_and_post_return(
       $1::text, CURRENT_DATE, $2::text, $3::uuid, $4::jsonb)::text AS e`,
    [args.memo, args.sourceType, args.sourceId, JSON.stringify(args.lines)],
  );
  return rows[0]?.e ?? null;
}

// ── المرتجعات ───────────────────────────────────────────────────────────────

export async function lockPurchaseInvoiceForReturn(
  tx: PoolClient,
  invoiceId: string,
): Promise<{
  id: string;
  supplierId: string;
  warehouseId: string;
  status: string;
  subtotal: number;
  discount: number;
} | null> {
  const { rows } = await tx.query<{
    id: string;
    supplier_id: string;
    warehouse_id: string;
    status: string;
    subtotal: string | null;
    discount: string | null;
  }>(
    `SELECT id::text, supplier_id::text, warehouse_id::text, status::text,
            subtotal::text, discount::text
       FROM public.purchase_invoices WHERE id = $1::uuid FOR UPDATE`,
    [invoiceId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    supplierId: r.supplier_id,
    warehouseId: r.warehouse_id,
    status: r.status,
    subtotal: Number(r.subtotal ?? 0),
    discount: Number(r.discount ?? 0),
  };
}

export interface PurchaseItemOrigin {
  id: string;
  productId: string;
  uomId: string | null;
  quantityIncrement: number;
  conversionFactor: number;
  quantity: number;
  unitCost: number;
  baseUnitCost: number | null;
  enteredUnitCost: number | null;
  tax: number;
}

export async function purchaseItemOrigin(
  tx: PoolClient,
  invoiceId: string,
  invoiceItemId: string,
  productId: string,
): Promise<PurchaseItemOrigin | null> {
  const { rows } = await tx.query<{
    id: string;
    product_id: string;
    uom_id: string | null;
    inc: string | null;
    factor: string | null;
    quantity: string | null;
    unit_cost: string | null;
    base_unit_cost: string | null;
    entered_unit_cost: string | null;
    tax: string | null;
  }>(
    `SELECT id::text, product_id::text, uom_id::text, uom_quantity_increment::text AS inc,
            uom_conversion_factor::text AS factor, quantity::text, unit_cost::text,
            base_unit_cost::text, entered_unit_cost::text, tax::text
       FROM public.purchase_invoice_items
      WHERE id = $1::uuid AND invoice_id = $2::uuid AND product_id = $3::uuid
      FOR UPDATE`,
    [invoiceItemId, invoiceId, productId],
  );
  const r = rows[0];
  if (!r) return null;
  const unitCost = Number(r.unit_cost ?? 0);
  return {
    id: r.id,
    productId: r.product_id,
    uomId: r.uom_id,
    quantityIncrement: r.inc !== null ? Number(r.inc) : 0.001,
    conversionFactor: r.factor !== null ? Number(r.factor) : 1,
    quantity: Number(r.quantity ?? 0),
    unitCost,
    baseUnitCost: r.base_unit_cost !== null ? Number(r.base_unit_cost) : null,
    enteredUnitCost: r.entered_unit_cost !== null ? Number(r.entered_unit_cost) : null,
    tax: Number(r.tax ?? 0),
  };
}

export async function returnedQuantityOnPurchase(
  tx: PoolClient,
  invoiceId: string,
  productId: string,
  invoiceItemId: string,
): Promise<number> {
  const { rows } = await tx.query<{ q: string | null }>(
    `SELECT coalesce(sum(pri.quantity), 0)::text AS q
       FROM public.purchase_return_items pri
       JOIN public.purchase_returns pr ON pr.id = pri.return_id
      WHERE pr.invoice_id = $1::uuid AND pri.product_id = $2::uuid
        AND (pri.invoice_item_id = $3::uuid OR pri.invoice_item_id IS NULL)`,
    [invoiceId, productId, invoiceItemId],
  );
  return Number(rows[0]?.q ?? 0);
}

export async function insertPurchaseReturn(
  tx: PoolClient,
  a: {
    returnNumber: string;
    invoiceId: string;
    supplierId: string;
    warehouseId: string;
    subtotal: number;
    tax: number;
    total: number;
    refundMethod: string;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.purchase_returns (
       return_number, invoice_id, supplier_id, warehouse_id,
       subtotal, tax, total, refund_method, note, created_by
     )
     VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::numeric, $7::numeric,
             $8::public.payment_method, $9, $10::uuid)
     RETURNING id::text AS id`,
    [
      a.returnNumber,
      a.invoiceId,
      a.supplierId,
      a.warehouseId,
      a.subtotal,
      a.tax,
      a.total,
      a.refundMethod,
      a.note,
      a.createdBy,
    ],
  );
  return rows[0].id;
}

export async function insertPurchaseReturnItem(
  tx: PoolClient,
  a: {
    returnId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    tax: number;
    total: number;
    lineType: string;
    invoiceItemId: string;
    uomId: string | null;
    enteredQuantity: number;
    baseQuantity: number;
    uomConversionFactor: number;
    enteredUnitCost: number;
    uomQuantityIncrement: number;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.purchase_return_items (
       return_id, product_id, quantity, unit_cost, tax, total, line_type, invoice_item_id,
       uom_id, entered_quantity, base_quantity, uom_conversion_factor, entered_unit_cost,
       uom_quantity_increment
     )
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::numeric, $6::numeric,
             $7, $8::uuid, $9::uuid, $10::numeric, $11::numeric, $12::numeric,
             $13::numeric, $14::numeric)`,
    [
      a.returnId,
      a.productId,
      a.quantity,
      a.unitCost,
      a.tax,
      a.total,
      a.lineType,
      a.invoiceItemId,
      a.uomId,
      a.enteredQuantity,
      a.baseQuantity,
      a.uomConversionFactor,
      a.enteredUnitCost,
      a.uomQuantityIncrement,
    ],
  );
}

export async function productBaseUomId(tx: PoolClient, productId: string): Promise<string | null> {
  const { rows } = await tx.query<{ uom: string | null }>(
    "SELECT coalesce(p.base_uom_id, p.unit_id)::text AS uom FROM public.products p WHERE p.id = $1::uuid",
    [productId],
  );
  return rows[0]?.uom ?? null;
}

export async function productItemClass(tx: PoolClient, productId: string): Promise<string | null> {
  const { rows } = await tx.query<{ item_class: string | null }>(
    "SELECT item_class::text FROM public.products WHERE id = $1::uuid",
    [productId],
  );
  return rows[0]?.item_class ?? null;
}

/** حركات صرف المرتجع مجمعة حسب صنف المنتج — قيمة المخزون الدفترية الفعلية. */
export async function returnStockBookValue(
  tx: PoolClient,
  returnId: string,
): Promise<Array<{ itemClass: string; bookValue: number }>> {
  const { rows } = await tx.query<{ item_class: string | null; book_value: string | null }>(
    `SELECT p.item_class, sum(coalesce(sm.total_cost, 0))::text AS book_value
       FROM public.stock_movements sm
       JOIN public.products p ON p.id = sm.product_id
      WHERE sm.source_type = 'purchase_return'
        AND sm.source_id = $1::uuid
        AND sm.movement_kind = 'ISSUE'::public.stock_movement_kind
      GROUP BY p.item_class`,
    [returnId],
  );
  return rows.map((r) => ({
    itemClass: r.item_class ?? "UNCLASSIFIED",
    bookValue: Number(r.book_value ?? 0),
  }));
}

export async function returnExpenseByClass(
  tx: PoolClient,
  returnId: string,
): Promise<Array<{ itemClass: string; expense: number }>> {
  const { rows } = await tx.query<{ item_class: string | null; expense_amount: string | null }>(
    `SELECT p.item_class, sum(ri.total - coalesce(ri.tax, 0))::text AS expense_amount
       FROM public.purchase_return_items ri
       LEFT JOIN public.products p ON p.id = ri.product_id
      WHERE ri.return_id = $1::uuid
        AND public.item_stock_effect(ri.product_id, 'out') <> 'STOCK_ISSUE'
      GROUP BY p.item_class`,
    [returnId],
  );
  return rows.map((r) => ({
    itemClass: r.item_class ?? "UNCLASSIFIED",
    expense: Number(r.expense_amount ?? 0),
  }));
}

export async function balanceAndPostPurchaseReturn(
  tx: PoolClient,
  args: { memo: string; returnId: string; lines: Array<Record<string, unknown>> },
): Promise<string | null> {
  const { rows } = await tx.query<{ e: string | null }>(
    `SELECT public.balance_and_post_return(
       $1::text, CURRENT_DATE, 'purchase_return', $2::uuid, $3::jsonb)::text AS e`,
    [args.memo, args.returnId, JSON.stringify(args.lines)],
  );
  return rows[0]?.e ?? null;
}
