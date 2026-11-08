/**
 * مستودع المبيعات — المرحلة 5 (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج الوصول للبيانات كما في دوال 007/012 الأصلية (create_sale،
 * create_sales_return، adjust_loyalty) مع الحفاظ على الترتيب والأقفال حرفيًا.
 *
 * اعتماديات انتقالية (موثقة في DECISIONS-LOG):
 *  - create_journal_entry / balance_and_post_return (المحاسبة) — حتى المرحلة 9.
 *  - post_sales_invoice (المحاسبة التلقائية عند الترحيل) — انتقالي حتى نقل نطاق
 *    treasury/ledger.
 *  - recalculate_customer_balance / customer_balance_lock تبقى في القاعدة
 *    (مستدعون SQL آخرون + مشغلات الدفتر) وتُستدعى من هنا.
 *  - resolve_writable_payment_method / payment_method_ledger_account تبقى في
 *    القاعدة (فهرس طرق الدفع يحكمها مُشغّلات) وتُستدعى من هنا.
 */
import type { PoolClient } from "pg";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";

/** فحص المخزون للبنود — نفس استعلام الأصل حرفيًا (يشمل تنسيق numeric للرسالة).
 *  المفاتيح تُطبَّع إلى snake_case قبل إرسالها لـ resolve_sale_line. */
export async function saleStockAvailability(
  tx: PoolClient,
  warehouseId: string,
  itemsJson: unknown,
): Promise<Array<{ productId: string; qtyText: string; availText: string }>> {
  const { rows } = await tx.query<{ product_id: string; qty_text: string }>(
    `SELECT r.o_product_id::text AS product_id,
            sum(public.product_quantity_in_base(
              r.o_product_id,
              r.o_quantity,
              nullif(btrim(coalesce(line ->> 'uom_id', '')), '')::uuid,
              'SALE'
            ))::text AS qty_text
       FROM jsonb_array_elements($1::jsonb) AS line
       CROSS JOIN LATERAL public.resolve_sale_line(line) AS r
      WHERE r.o_stock_effect = 'STOCK_ISSUE'
      GROUP BY r.o_product_id
      ORDER BY r.o_product_id`,
    [JSON.stringify(itemsJson)],
  );
  const out: Array<{ productId: string; qtyText: string; availText: string }> = [];
  for (const r of rows) {
    const { rows: inv } = await tx.query<{ q: string }>(
      `SELECT coalesce(i.quantity, 0)::text AS q
         FROM public.inventory i
        WHERE i.product_id = $1::uuid AND i.warehouse_id = $2::uuid
          AND i.owner_type = 'COMPANY' AND i.owner_id IS NULL
        FOR UPDATE`,
      [r.product_id, warehouseId],
    );
    out.push({ productId: r.product_id, qtyText: r.qty_text, availText: inv[0]?.q ?? "0" });
  }
  return out;
}

export async function hasRole(tx: PoolClient, userId: string, role: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT public.has_role($1::uuid, $2::public.app_role) AS ok",
    [userId, role],
  );
  return rows[0]?.ok === true;
}

export async function isStaff(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>("SELECT public.is_staff($1::uuid) AS ok", [
    userId,
  ]);
  return rows[0]?.ok === true;
}

/** خصائص سطر بيع كما تُشتق من resolve_sale_line + دوال الوحدات. */
export interface ResolvedSaleLine {
  productId: string | null;
  quantity: number;
  lineType: string;
  stockEffect: string;
  serviceName: string | null;
}

/** ترجمة resolve_sale_line — نفس القواعد: بلا منتج = خدمة لحظية،
 *  معرّف غير موجود مع is_service يعامل كخدمة لحظية (توافق POS القديم). */
export async function resolveSaleLine(
  tx: PoolClient,
  line: { productId?: string | null; quantity: unknown; isService?: boolean; name?: string | null },
): Promise<ResolvedSaleLine> {
  const productId =
    typeof line.productId === "string" && line.productId.trim() !== ""
      ? line.productId.trim()
      : null;
  const quantity = Number(line.quantity);
  const isServiceFlag = line.isService === true;
  const serviceName =
    typeof line.name === "string" && line.name.trim() !== "" ? line.name.trim() : null;

  if (productId === null) {
    return {
      productId: null,
      quantity,
      lineType: "AD_HOC_SERVICE",
      stockEffect: "NONE",
      serviceName,
    };
  }

  const { rows } = await tx.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM public.products WHERE id = $1::uuid) AS exists",
    [productId],
  );
  if (rows[0].exists !== true) {
    if (isServiceFlag) {
      return {
        productId: null,
        quantity,
        lineType: "AD_HOC_SERVICE",
        stockEffect: "NONE",
        serviceName,
      };
    }
    throw new Error(`Item ${productId} does not exist`);
  }
  return {
    productId,
    quantity,
    lineType: await itemLineType(tx, productId, false),
    stockEffect: await itemStockEffect(tx, productId, "out"),
    serviceName,
  };
}

export async function itemLineType(
  tx: PoolClient,
  productId: string,
  isAdHoc: boolean,
): Promise<string> {
  const { rows } = await tx.query<{ lt: string }>(
    "SELECT public.item_line_type($1::uuid, $2::boolean)::text AS lt",
    [productId, isAdHoc],
  );
  return rows[0].lt;
}

export async function itemStockEffect(
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

export async function productUomPrice(
  tx: PoolClient,
  productId: string,
  unitId: string | null,
  direction: "SALE" | "PURCHASE",
): Promise<number> {
  const { rows } = await tx.query<{ p: string }>(
    "SELECT public.product_uom_price($1::uuid, $2::uuid, $3::text)::text AS p",
    [productId, unitId, direction],
  );
  return Number(rows[0].p);
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

/** معلومات المنتج المطلوبة لسطر البيع (قفل الصف FOR UPDATE كما في الأصل). */
export async function productSaleFacts(
  tx: PoolClient,
  productId: string,
): Promise<{ taxRate: number; sellable: boolean } | null> {
  const { rows } = await tx.query<{ tax_rate: string | null; is_sellable: boolean | null }>(
    `SELECT p.tax_rate::text AS tax_rate, p.is_sellable
       FROM public.products p
      WHERE p.id = $1::uuid AND p.is_active = true
      FOR UPDATE`,
    [productId],
  );
  if (!rows[0]) return null;
  return { taxRate: Number(rows[0].tax_rate ?? 0), sellable: rows[0].is_sellable === true };
}

export async function productTaxRate(tx: PoolClient, productId: string): Promise<number> {
  const { rows } = await tx.query<{ tax_rate: string | null }>(
    "SELECT p.tax_rate::text AS tax_rate FROM public.products p WHERE p.id = $1::uuid",
    [productId],
  );
  return Number(rows[0]?.tax_rate ?? 0);
}

export async function productBaseUomId(tx: PoolClient, productId: string): Promise<string | null> {
  const { rows } = await tx.query<{ uom: string | null }>(
    "SELECT coalesce(p.base_uom_id, p.unit_id)::text AS uom FROM public.products p WHERE p.id = $1::uuid",
    [productId],
  );
  return rows[0]?.uom ?? null;
}

export async function productUomQuantityIncrement(
  tx: PoolClient,
  productId: string,
  unitId: string | null,
): Promise<number> {
  const { rows } = await tx.query<{ inc: string | null }>(
    `SELECT pu.quantity_increment::text AS inc
       FROM public.product_uoms pu
      WHERE pu.product_id = $1::uuid
        AND pu.unit_id = coalesce($2::uuid, (SELECT coalesce(p.base_uom_id, p.unit_id)
          FROM public.products p WHERE p.id = $1::uuid))
        AND pu.is_active`,
    [productId, unitId],
  );
  return rows[0]?.inc !== undefined && rows[0]?.inc !== null ? Number(rows[0].inc) : 0.001;
}

export async function companyAllowsNegativeSales(tx: PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ allow_negative_sales: boolean | null }>(
    "SELECT allow_negative_sales FROM public.company_settings WHERE id = 1 FOR SHARE",
  );
  return rows[0]?.allow_negative_sales ?? false;
}

export async function inventoryLockedQty(
  tx: PoolClient,
  productId: string,
  warehouseId: string,
): Promise<number> {
  const { rows } = await tx.query<{ quantity: string | null }>(
    `SELECT quantity::text AS quantity FROM public.inventory
      WHERE product_id = $1::uuid AND warehouse_id = $2::uuid
        AND owner_type = 'COMPANY' AND owner_id IS NULL
      FOR UPDATE`,
    [productId, warehouseId],
  );
  return rows[0] ? Number(rows[0].quantity) : 0;
}

export async function nextInvoiceNumber(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT public.fn_next_document_number('sales_invoice') AS n",
  );
  return rows[0].n;
}

export async function nextSalesReturnNumber(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT public.fn_next_document_number('sales_return') AS n",
  );
  return rows[0].n;
}

/** derive_payment_status — نفس الحدود حرفيًا (011). */
export function derivePaymentStatus(paid: number, total: number): string {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

export async function customerCreditLimitAllows(
  tx: PoolClient,
  customerId: string,
  newDue: number,
): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.customers c
       LEFT JOIN public.company_settings s ON s.id = 1
       WHERE c.id = $1::uuid
         AND (coalesce(s.enforce_customer_credit_limit, false) IS NOT TRUE
           OR coalesce(c.credit_limit, 0) = 0
           OR coalesce(c.balance, 0) + greatest(coalesce($2::numeric, 0), 0) <= c.credit_limit)
     ) AS ok`,
    [customerId, newDue],
  );
  return rows[0]?.ok === true;
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

/** قفل صف العميل — كما customer_balance_lock (يبقى استدعاءً انتقاليًا). */
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

/** إعادة احتساب الرصيد من الدفتر — تبقى دالة القاعدة مصدر الحقيقة (مستدعون آخرون). */
export async function recalculateCustomerBalance(
  tx: PoolClient,
  customerId: string,
  reason: string,
  type: string,
): Promise<void> {
  await tx.query("SELECT public.recalculate_customer_balance($1::uuid, $2::text, $3::text)", [
    customerId,
    reason,
    type,
  ]);
}

export interface InsertInvoiceArgs {
  invoiceNumber: string;
  customerId: string | null;
  warehouseId: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  paymentMethod: string;
  note: string | null;
  createdBy: string;
  createdAt: Date;
}

export async function insertSalesInvoice(tx: PoolClient, a: InsertInvoiceArgs): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.sales_invoices (
       invoice_number, customer_id, warehouse_id, status, payment_status,
       subtotal, discount, tax, total, paid, payment_method, note, created_by,
       created_at, updated_at
     )
     VALUES (
       $1, $2::uuid, $3::uuid, 'confirmed'::public.invoice_status,
       public.derive_payment_status($8::numeric, $7::numeric)::public.payment_status,
       $4::numeric, $5::numeric, $6::numeric, $7::numeric, $8::numeric,
       $9::public.payment_method, $10, $11::uuid, $12, now()
     )
     RETURNING id::text AS id`,
    [
      a.invoiceNumber,
      a.customerId,
      a.warehouseId,
      a.subtotal,
      a.discount,
      a.tax,
      a.total,
      a.paid,
      a.paymentMethod,
      a.note,
      a.createdBy,
      a.createdAt,
    ],
  );
  return rows[0].id;
}

export interface InsertInvoiceItemArgs {
  invoiceId: string;
  productId: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  tax: number;
  total: number;
  lineType: string;
  stockEffect: string;
  uomId: string | null;
  batchId: string | null;
  batchNumber: string | null;
  baseUnitPrice: number | null;
  enteredQuantity: number | null;
  baseQuantity: number | null;
  uomConversionFactor: number | null;
  enteredUnitPrice: number | null;
  uomQuantityIncrement: number | null;
}

export async function insertSalesInvoiceItem(
  tx: PoolClient,
  a: InsertInvoiceItemArgs,
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.sales_invoice_items (
       invoice_id, product_id, description, quantity, unit_price, discount, tax, total,
       line_type, stock_effect, uom_id, batch_id, batch_number, base_unit_price,
       entered_quantity, base_quantity, uom_conversion_factor, entered_unit_price,
       uom_quantity_increment
     )
     VALUES (
       $1::uuid, $2::uuid, $3, $4::numeric, $5::numeric, 0, $6::numeric, $7::numeric,
       $8, $9, $10::uuid, $11::uuid, $12,
       $13::numeric, $14::numeric, $15::numeric, $16::numeric, $17::numeric, $18::numeric
     )
     RETURNING id::text AS id`,
    [
      a.invoiceId,
      a.productId,
      a.description,
      a.quantity,
      a.unitPrice,
      a.tax,
      a.total,
      a.lineType,
      a.stockEffect,
      a.uomId,
      a.batchId,
      a.batchNumber,
      a.baseUnitPrice,
      a.enteredQuantity,
      a.baseQuantity,
      a.uomConversionFactor,
      a.enteredUnitPrice,
      a.uomQuantityIncrement,
    ],
  );
  return rows[0].id;
}

export async function insertAdHocServiceLine(
  tx: PoolClient,
  args: {
    invoiceId: string;
    invoiceItemId: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    tax: number;
    total: number;
    createdBy: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.ad_hoc_service_lines (
       invoice_id, invoice_item_id, description, quantity, unit_price,
       discount, tax, total, created_by
     )
     VALUES ($1::uuid, $2::uuid, $3, $4::numeric, $5::numeric, 0, $6::numeric, $7::numeric, $8::uuid)`,
    [
      args.invoiceId,
      args.invoiceItemId,
      args.description,
      args.quantity,
      args.unitPrice,
      args.tax,
      args.total,
      args.createdBy,
    ],
  );
}

/** مزامنة تواريخ حركات المخزون مع تاريخ البيع (كما الأصل — داخل GUC المحرك). */
export async function syncStockMovementDates(
  tx: PoolClient,
  invoiceId: string,
  postedAt: Date,
): Promise<void> {
  await tx.query("SELECT set_config('app.stock_engine', 'on', true)");
  try {
    await tx.query(
      `UPDATE public.stock_movements SET created_at = $2
        WHERE source_type = 'sales_invoice' AND source_id = $1::uuid`,
      [invoiceId, postedAt],
    );
  } finally {
    try {
      await tx.query("SELECT set_config('app.stock_engine', 'off', true)");
    } catch {
      // لا تُطغِ على الخطأ الأصلي إذا كانت المعاملة فاشلة أصلًا (ستُرجَع ROLLBACK).
    }
  }
}

export interface InsertSplitArgs {
  customerId: string;
  invoiceId: string;
  method: string;
  amount: number;
  occurredAt: Date;
  createdBy: string;
  cashboxId: string | null;
  bankAccountId: string | null;
  paymentMethodId: string | null;
  reference: string | null;
}

export async function insertCustomerPaymentSplit(
  tx: PoolClient,
  a: InsertSplitArgs,
): Promise<void> {
  await tx.query(
    `INSERT INTO public.customer_payment_splits (
       customer_id, invoice_id, method, amount, occurred_at, created_by,
       cashbox_id, bank_account_id, payment_method_id, reference_no
     )
     VALUES ($1::uuid, $2::uuid, $3::public.payment_method, $4::numeric, $5, $6::uuid,
             $7::uuid, $8::uuid, $9, $10)`,
    [
      a.customerId,
      a.invoiceId,
      a.method,
      roundN(a.amount, 2),
      a.occurredAt,
      a.createdBy,
      a.cashboxId,
      a.bankAccountId,
      a.paymentMethodId ?? a.method,
      a.reference,
    ],
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

export async function postSalesInvoiceRpc(
  tx: PoolClient,
  invoiceId: string,
  actorId: string,
): Promise<void> {
  await tx.query("SELECT set_config('app.payment_split_internal_post', 'on', true)");
  // post_sales_invoice دالة SECURITY DEFINER تقرأ auth.uid() — claims تُمرَّر
  // انتقاليًا حتى المرحلة 9 لتحاكي نداءها من داخل معاملة المستخدم (كما الأصل).
  await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: actorId, role: "authenticated" }),
  ]);
  try {
    await tx.query("SELECT public.post_sales_invoice($1::uuid)", [invoiceId]);
  } finally {
    try {
      await tx.query("SELECT set_config('app.payment_split_internal_post', 'off', true)");
    } catch {
      // لا تُطغِ على الخطأ الأصلي إذا كانت المعاملة فاشلة أصلًا.
    }
  }
}

// ── المرتجعات ───────────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  warehouseId: string;
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
}

export async function lockInvoice(tx: PoolClient, invoiceId: string): Promise<InvoiceRow | null> {
  const { rows } = await tx.query<{
    id: string;
    invoice_number: string;
    customer_id: string | null;
    warehouse_id: string;
    status: string;
    subtotal: string | null;
    discount: string | null;
    total: string | null;
    paid: string | null;
  }>(
    `SELECT id::text, invoice_number, customer_id::text, warehouse_id::text, status::text,
            subtotal::text, discount::text, total::text, paid::text
       FROM public.sales_invoices WHERE id = $1::uuid FOR UPDATE`,
    [invoiceId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    customerId: r.customer_id,
    warehouseId: r.warehouse_id,
    status: r.status,
    subtotal: Number(r.subtotal ?? 0),
    discount: Number(r.discount ?? 0),
    total: Number(r.total ?? 0),
    paid: Number(r.paid ?? 0),
  };
}

export interface InvoiceItemFacts {
  id: string;
  productId: string | null;
  uomId: string | null;
  quantityIncrement: number;
  conversionFactor: number;
  unitPrice: number;
  enteredUnitPrice: number;
  unitTax: number;
  soldQuantity: number;
}

export async function invoiceItemFacts(
  tx: PoolClient,
  invoiceId: string,
  invoiceItemId: string,
  productId: string,
  uomId: string | null,
): Promise<InvoiceItemFacts | null> {
  const { rows } = await tx.query<{
    id: string;
    product_id: string | null;
    uom_id: string | null;
    inc: string | null;
    factor: string | null;
    unit_price: string | null;
    entered_unit_price: string | null;
    tax: string | null;
    quantity: string | null;
  }>(
    `SELECT id::text, product_id::text, uom_id::text,
            uom_quantity_increment::text AS inc, uom_conversion_factor::text AS factor,
            base_unit_price::text AS unit_price, entered_unit_price::text, tax::text, quantity::text
       FROM public.sales_invoice_items
      WHERE id = $1::uuid AND invoice_id = $2::uuid AND product_id = $3::uuid
        AND uom_id IS NOT DISTINCT FROM $4::uuid`,
    [invoiceItemId, invoiceId, productId, uomId],
  );
  const r = rows[0];
  if (!r) return null;
  const factor = r.factor !== null ? Number(r.factor) : 1;
  const basePrice = Number(r.unit_price ?? 0);
  return {
    id: r.id,
    productId: r.product_id,
    uomId: r.uom_id,
    quantityIncrement: r.inc !== null ? Number(r.inc) : 0.001,
    conversionFactor: factor,
    unitPrice: basePrice,
    enteredUnitPrice:
      r.entered_unit_price !== null ? Number(r.entered_unit_price) : roundN(basePrice * factor, 4),
    unitTax: Number(r.tax ?? 0) / (Number(r.quantity) || 1),
    soldQuantity: Number(r.quantity ?? 0),
  };
}

export async function returnedQuantityOnInvoice(
  tx: PoolClient,
  invoiceId: string,
  productId: string,
  invoiceItemId: string,
): Promise<number> {
  const { rows } = await tx.query<{ q: string | null }>(
    `SELECT coalesce(sum(ri.quantity), 0)::text AS q
       FROM public.sales_return_items ri
       JOIN public.sales_returns sr ON sr.id = ri.return_id
      WHERE sr.invoice_id = $1::uuid AND ri.product_id = $2::uuid
        AND (ri.invoice_item_id = $3::uuid OR ri.invoice_item_id IS NULL)`,
    [invoiceId, productId, invoiceItemId],
  );
  return Number(rows[0]?.q ?? 0);
}

export interface InsertReturnArgs {
  returnNumber: string;
  invoiceId: string;
  customerId: string | null;
  warehouseId: string;
  subtotal: number;
  tax: number;
  total: number;
  refundMethod: string;
  note: string | null;
  createdBy: string;
}

export async function insertSalesReturn(tx: PoolClient, a: InsertReturnArgs): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.sales_returns (
       return_number, invoice_id, customer_id, warehouse_id,
       subtotal, tax, total, refund_method, note, created_by
     )
     VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::numeric, $7::numeric,
             $8::public.payment_method, $9, $10::uuid)
     RETURNING id::text AS id`,
    [
      a.returnNumber,
      a.invoiceId,
      a.customerId,
      a.warehouseId,
      roundN(a.subtotal, 2).toFixed(2),
      roundN(a.tax, 2).toFixed(2),
      roundN(a.total, 2).toFixed(2),
      a.refundMethod,
      a.note,
      a.createdBy,
    ],
  );
  return rows[0].id;
}

export interface InsertReturnItemArgs {
  returnId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  tax: number;
  total: number;
  lineType: string;
  invoiceItemId: string;
  uomId: string | null;
  enteredQuantity: number;
  baseQuantity: number;
  uomConversionFactor: number;
  enteredUnitPrice: number;
  uomQuantityIncrement: number;
}

export async function insertSalesReturnItem(
  tx: PoolClient,
  a: InsertReturnItemArgs,
): Promise<void> {
  await tx.query(
    `INSERT INTO public.sales_return_items (
       return_id, product_id, quantity, unit_price, tax, total, line_type, invoice_item_id,
       uom_id, entered_quantity, base_quantity, uom_conversion_factor, entered_unit_price,
       uom_quantity_increment
     )
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::numeric, $6::numeric,
           $7, $8::uuid, $9::uuid, $10::numeric, $11::numeric,
           $12::numeric, $13::numeric, $14::numeric)`,
    [
      a.returnId,
      a.productId,
      roundN(a.quantity, 12).toFixed(12),
      roundN(a.unitPrice, 6).toFixed(6),
      roundN(a.tax, 2).toFixed(2),
      roundN(a.total, 2).toFixed(2),
      a.lineType,
      a.invoiceItemId,
      a.uomId,
      a.enteredQuantity,
      a.baseQuantity,
      a.uomConversionFactor,
      a.enteredUnitPrice,
      a.uomQuantityIncrement,
    ],
  );
}

export async function invoiceOutstanding(tx: PoolClient, invoiceId: string): Promise<number> {
  const { rows } = await tx.query<{ o: string | null }>(
    `SELECT round(greatest(coalesce(total, 0) - coalesce(paid, 0), 0), 2)::text AS o
       FROM public.sales_invoices WHERE id = $1::uuid FOR UPDATE`,
    [invoiceId],
  );
  return Number(rows[0]?.o ?? 0);
}

export async function applyReturnCreditToInvoice(
  tx: PoolClient,
  args: { invoiceId: string; creditApplied: number },
): Promise<void> {
  await tx.query(
    `UPDATE public.sales_invoices
        SET paid = round(coalesce(paid, 0) + $2::numeric, 2),
            status = CASE
              WHEN round(coalesce(total, 0) - (round(coalesce(paid, 0) + $2::numeric, 2)), 2) <= 0.005
                THEN 'returned'::public.invoice_status
              ELSE 'confirmed'::public.invoice_status END,
            payment_status = public.derive_payment_status(
              round(coalesce(paid, 0) + $2::numeric, 2), total),
            updated_at = now()
      WHERE id = $1::uuid`,
    [args.invoiceId, args.creditApplied],
  );
}

export async function markInvoiceReturnedIfSettled(
  tx: PoolClient,
  invoiceId: string,
): Promise<void> {
  await tx.query(
    `UPDATE public.sales_invoices
        SET status = CASE
              WHEN round(coalesce(total, 0) - coalesce(paid, 0), 2) <= 0.005
                THEN 'returned'::public.invoice_status
              ELSE status END,
            payment_status = public.derive_payment_status(paid, total),
            updated_at = now()
      WHERE id = $1::uuid`,
    [invoiceId],
  );
}

export async function insertCustomerLedgerEntry(
  tx: PoolClient,
  args: {
    customerId: string;
    entryType: string;
    credit: number;
    referenceId: string;
    referenceType: string;
    sourceKey: string;
    note: string;
    createdBy: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.customer_ledger (
       customer_id, entry_type, credit, reference_id, reference_type,
       occurred_at, created_by, source_key, note
     )
     VALUES ($1::uuid, $2::text, $3::numeric, $4::uuid, $5::text, now(), $6::uuid, $7::text, $8::text)`,
    [
      args.customerId,
      args.entryType,
      args.credit,
      args.referenceId,
      args.referenceType,
      args.createdBy,
      args.sourceKey,
      args.note,
    ],
  );
}

export interface JournalLine {
  account_code: string;
  debit?: number;
  credit?: number;
  partner_type?: string;
  partner_id?: string | null;
  memo: string;
}

export async function balanceAndPostReturn(
  tx: PoolClient,
  args: { memo: string; sourceType: string; sourceId: string; lines: JournalLine[] },
): Promise<string | null> {
  const { rows } = await tx.query<{ e: string | null }>(
    `SELECT public.balance_and_post_return(
       $1::text, CURRENT_DATE, $2::text, $3::uuid, $4::jsonb)::text AS e`,
    [args.memo, args.sourceType, args.sourceId, JSON.stringify(args.lines)],
  );
  return rows[0]?.e ?? null;
}

// ── الولاء ──────────────────────────────────────────────────────────────────

export async function insertLoyaltyTransaction(
  tx: PoolClient,
  args: {
    customerId: string;
    points: number;
    kind: string;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.loyalty_transactions (customer_id, points, kind, note, created_by)
     VALUES ($1::uuid, $2::numeric, $3::text, $4, $5::uuid)
     RETURNING id::text AS id`,
    [args.customerId, args.points, args.kind, args.note, args.createdBy],
  );
  return rows[0].id;
}

export async function applyLoyaltyPoints(
  tx: PoolClient,
  args: { customerId: string; kind: string; points: number },
): Promise<void> {
  await tx.query(
    `UPDATE public.customers
        SET loyalty_points = GREATEST(
              loyalty_points + (CASE WHEN $2::text = 'redeem' THEN -ABS($3::numeric) ELSE ABS($3::numeric) END), 0),
            updated_at = now()
      WHERE id = $1::uuid`,
    [args.customerId, args.kind, args.points],
  );
}
