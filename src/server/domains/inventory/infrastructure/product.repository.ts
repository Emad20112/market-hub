/**
 * مستودع عدّادات مراجع المنتج + الحذف المحروس — المرحلة 3.
 * يعيد تنفيذ product_reference_counts و product_delete_guard (012) حرفيًا:
 *  - العدادات الصريحة + دفتر أمانات المطحنة + مسح عام لمفاتيح أجنبية من الكتالوج.
 *  - لا يحسب custody_ledger في other_refs؟ — يعده في custody_entries كما الأصل
 *    (الواجهة تضيف احتساب الحُصَن اليدوي فوق هذا الناتج في safety.ts — محفوظ).
 */
import type { PoolClient } from "pg";

export interface ProductReferenceCounts {
  product_id: string;
  sales_items: number;
  purchase_items: number;
  sales_returns: number;
  purchase_returns: number;
  transfers: number;
  stock_movements: number;
  inventory_rows: number;
  compatibilities: number;
  custody_entries: number;
  other_refs: number;
  blocking_total: number;
  can_delete: boolean;
  has_history: boolean;
}

/** عدّاد جدول اختياري (تثبيتات أقدم قد لا تملك الجدول). */
async function countOrNull(
  tx: PoolClient,
  table: string,
  column: string,
  productId: string,
): Promise<number> {
  try {
    const { rows } = await tx.query<{ c: string }>(
      `SELECT count(*)::text AS c FROM ${table} WHERE ${column} = $1::uuid`,
      [productId],
    );
    return Number(rows[0]?.c ?? 0);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42P01" || code === "42703") return 0; // undefined_table/column — كالأصل
    throw err;
  }
}

const KNOWN_TABLES = [
  "public.sales_invoice_items",
  "public.purchase_invoice_items",
  "public.sales_return_items",
  "public.purchase_return_items",
  "public.stock_transfer_items",
  "public.stock_movements",
  "public.inventory",
  "public.product_compatibilities",
];

export async function productReferenceCounts(
  tx: PoolClient,
  productId: string,
): Promise<ProductReferenceCounts> {
  const salesItems = await countOrNull(tx, "public.sales_invoice_items", "product_id", productId);
  const purchaseItems = await countOrNull(
    tx,
    "public.purchase_invoice_items",
    "product_id",
    productId,
  );
  const salesReturns = await countOrNull(tx, "public.sales_return_items", "product_id", productId);
  const purchaseReturns = await countOrNull(
    tx,
    "public.purchase_return_items",
    "product_id",
    productId,
  );
  const transfers = await countOrNull(tx, "public.stock_transfer_items", "product_id", productId);
  const stockMovements = await countOrNull(tx, "public.stock_movements", "product_id", productId);
  const inventoryRows = await countOrNull(tx, "public.inventory", "product_id", productId);
  const compatibilities = await countOrNull(
    tx,
    "public.product_compatibilities",
    "product_id",
    productId,
  );
  const custodyEntries = await countOrNull(tx, "public.custody_ledger", "item_id", productId);

  // 3) المسح العام: كل FK يشير إلى products(id) ولم يُعد صراحة أعلاه
  const { rows: fkRows } = await tx.query<{ t: string; c: string }>(
    `SELECT DISTINCT c.conrelid::regclass::text AS t, a.attname AS c
       FROM pg_constraint c
       JOIN pg_attribute a
         ON a.attrelid = c.conrelid
        AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.confrelid = 'public.products'::regclass
        AND c.conrelid::regclass::text <> ALL ($1)`,
    [KNOWN_TABLES],
  );

  let otherRefs = 0;
  for (const { t, c } of fkRows) {
    // نفس حماية الأصل: مُعرِّفات معروفة فقط
    if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/.test(t)) continue;
    if (!/^[a-z_][a-z0-9_]*$/.test(c)) continue;
    otherRefs += await countOrNull(tx, t, c, productId);
  }

  const blocking =
    salesItems +
    purchaseItems +
    salesReturns +
    purchaseReturns +
    transfers +
    stockMovements +
    custodyEntries +
    otherRefs;

  return {
    product_id: productId,
    sales_items: salesItems,
    purchase_items: purchaseItems,
    sales_returns: salesReturns,
    purchase_returns: purchaseReturns,
    transfers,
    stock_movements: stockMovements,
    inventory_rows: inventoryRows,
    compatibilities,
    custody_entries: custodyEntries,
    other_refs: otherRefs,
    blocking_total: blocking,
    can_delete: blocking === 0,
    has_history: stockMovements > 0 || inventoryRows > 0 || custodyEntries > 0,
  };
}

export type DeleteGuardReason = "forbidden" | "referenced" | "not_found" | "deleted";

export interface DeleteGuardResult {
  deleted: boolean;
  reason: DeleteGuardReason;
  counts?: ProductReferenceCounts;
}

export async function productDeleteGuard(
  tx: PoolClient,
  productId: string,
): Promise<DeleteGuardResult> {
  const counts = await productReferenceCounts(tx, productId);

  if (!counts.can_delete) {
    return { deleted: false, reason: "referenced", counts };
  }

  // لا مراجع: امسح ملحقات الكتالوج التي لا تحمل معنى ماليًا، ثم الصنف (كما الأصل).
  try {
    await tx.query("DELETE FROM public.product_compatibilities WHERE product_id = $1::uuid", [
      productId,
    ]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "42P01") throw err;
  }
  await tx.query("DELETE FROM public.inventory WHERE product_id = $1::uuid", [productId]);

  const { rowCount } = await tx.query("DELETE FROM public.products WHERE id = $1::uuid", [
    productId,
  ]);
  if (rowCount === 0) {
    return { deleted: false, reason: "not_found", counts };
  }
  return { deleted: true, reason: "deleted", counts };
}
