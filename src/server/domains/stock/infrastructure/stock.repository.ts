/**
 * مستودع المخزون والتكلفة — المرحلة 4 (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج الوصول للبيانات كما في دوال 006 (post_stock_delta، apply_cost_movement،
 * الأرصدة الافتتاحية، التسويات) مع الحفاظ على الترتيب والأقفال حرفيًا.
 *
 * اعتماديات انتقالية (موثقة في DECISIONS-LOG):
 *  - item_effective_policy / is_staff / item_has_stock_history تبقى في القاعدة
 *    (تستخدمها سياسات RLS ومشغلات) وتُستدعى من هنا.
 *  - create_journal_entry يبقى حتى المرحلة 9 (المحاسبة).
 */
import type { PoolClient } from "pg";

/** تقريب مطابق لدلالات round(numeric, d) في PostgreSQL (نصف للأعلى بعيدًا عن الصفر). */
export function roundN(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  const r = Math.round(Math.abs(value) * f) / f;
  return value < 0 ? -r : r;
}

export async function isStaff(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>("SELECT public.is_staff($1::uuid) AS ok", [
    userId,
  ]);
  return rows[0]?.ok === true;
}

export async function companyAllowsNegativeSales(tx: PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ allow_negative_sales: boolean | null }>(
    "SELECT allow_negative_sales FROM public.company_settings WHERE id = 1 FOR SHARE",
  );
  return rows[0]?.allow_negative_sales ?? false;
}

export interface ItemPolicyFacts {
  nature: string | null;
  policy: string | null;
}

export async function itemNatureAndPolicy(
  tx: PoolClient,
  productId: string,
): Promise<ItemPolicyFacts> {
  const { rows } = await tx.query<{ nature: string | null; policy: string | null }>(
    `SELECT p.item_nature::text AS nature, public.item_effective_policy(p.id)::text AS policy
       FROM public.products p WHERE p.id = $1::uuid`,
    [productId],
  );
  return rows[0] ?? { nature: null, policy: null };
}

export interface StockKeys {
  productId: string;
  warehouseId: string;
  ownerType: string;
  ownerId: string | null;
}

export async function lockInventoryQty(tx: PoolClient, k: StockKeys): Promise<number> {
  const { rows } = await tx.query<{ quantity: string | null }>(
    `SELECT quantity FROM public.inventory
      WHERE product_id = $1::uuid AND warehouse_id = $2::uuid
        AND owner_type = $3::public.owner_type
        AND owner_id IS NOT DISTINCT FROM $4::uuid
      FOR UPDATE`,
    [k.productId, k.warehouseId, k.ownerType, k.ownerId],
  );
  return rows[0] ? Number(rows[0].quantity) : 0;
}

export async function upsertInventory(
  tx: PoolClient,
  k: StockKeys,
  quantity: number,
): Promise<void> {
  await tx.query(
    `INSERT INTO public.inventory (product_id, warehouse_id, owner_type, owner_id, quantity)
     VALUES ($1::uuid, $2::uuid, $3::public.owner_type, $4::uuid, $5::numeric)
     ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
     DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now()`,
    [k.productId, k.warehouseId, k.ownerType, k.ownerId, String(quantity)],
  );
}

export async function costLayerValue(tx: PoolClient, k: StockKeys): Promise<number> {
  const { rows } = await tx.query<{ total_value: string | null }>(
    `SELECT total_value FROM public.item_cost_layers
      WHERE product_id = $1::uuid AND warehouse_id = $2::uuid
        AND owner_type = $3::public.owner_type
        AND owner_id IS NOT DISTINCT FROM $4::uuid`,
    [k.productId, k.warehouseId, k.ownerType, k.ownerId],
  );
  return rows[0] ? Number(rows[0].total_value) : 0;
}

export async function setStockEngine(tx: PoolClient, on: boolean): Promise<void> {
  await tx.query("SELECT set_config('app.stock_engine', $1, true)", [on ? "on" : "off"]);
}

export interface InsertMovementArgs {
  productId: string;
  warehouseId: string;
  movementType: string;
  signedQty: number;
  unitCost: number | null;
  reference: string;
  note: string | null;
  createdBy: string | null;
  movementKind: string;
  sourceType: string | null;
  sourceId: string | null;
  ownerType: string;
  ownerId: string | null;
  adjustmentReason: string | null;
}

export async function insertStockMovement(tx: PoolClient, a: InsertMovementArgs): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.stock_movements
       (product_id, warehouse_id, movement_type, quantity, unit_cost, reference, note, created_by,
        movement_kind, source_type, source_id, owner_type, owner_id, adjustment_reason)
     VALUES ($1::uuid, $2::uuid, $3::public.movement_type, $4::numeric, $5::numeric, $6, $7, $8::uuid,
             $9::public.stock_movement_kind, $10, $11::uuid, $12::public.owner_type, $13::uuid, $14)
     RETURNING id`,
    [
      a.productId,
      a.warehouseId,
      a.movementType,
      String(a.signedQty),
      a.unitCost,
      a.reference,
      a.note,
      a.createdBy,
      a.movementKind,
      a.sourceType,
      a.sourceId,
      a.ownerType,
      a.ownerId,
      a.adjustmentReason,
    ],
  );
  return rows[0].id;
}

export async function updateMovementCosts(
  tx: PoolClient,
  movementId: string,
  totalCost: number,
  signedQty: number,
): Promise<void> {
  await tx.query(
    `UPDATE public.stock_movements
        SET total_cost = $2::numeric,
            unit_cost = CASE WHEN $3::numeric <> 0
                        THEN round($2::numeric / abs($3::numeric), 4)
                        ELSE unit_cost END
      WHERE id = $1::uuid`,
    [movementId, String(totalCost), String(signedQty)],
  );
}

export interface CostLayerSnapshot {
  qty: number;
  value: number;
}

export async function lockCostLayer(tx: PoolClient, k: StockKeys): Promise<CostLayerSnapshot> {
  const { rows } = await tx.query<{ quantity: string | null; total_value: string | null }>(
    `SELECT quantity, total_value FROM public.item_cost_layers
      WHERE product_id = $1::uuid AND warehouse_id = $2::uuid
        AND owner_type = $3::public.owner_type
        AND owner_id IS NOT DISTINCT FROM $4::uuid
      FOR UPDATE`,
    [k.productId, k.warehouseId, k.ownerType, k.ownerId],
  );
  return {
    qty: rows[0] ? Number(rows[0].quantity) : 0,
    value: rows[0] ? Number(rows[0].total_value) : 0,
  };
}

export async function companyCostingMethod(tx: PoolClient): Promise<string | null> {
  const { rows } = await tx.query<{ costing_method: string | null }>(
    "SELECT costing_method::text FROM public.company_costing_settings WHERE id = 1",
  );
  return rows[0]?.costing_method ?? null;
}

export async function productCostPrice(tx: PoolClient, productId: string): Promise<number | null> {
  const { rows } = await tx.query<{ cost_price: string | null }>(
    "SELECT cost_price FROM public.products WHERE id = $1::uuid",
    [productId],
  );
  return rows[0]?.cost_price !== undefined && rows[0]?.cost_price !== null
    ? Number(rows[0].cost_price)
    : null;
}

export async function upsertCostLayer(
  tx: PoolClient,
  k: StockKeys,
  a: { qty1: number; val1: number; method: string; lastUnitCost: number },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.item_cost_layers
       (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
        valuation_method, last_unit_cost, last_movement_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::public.owner_type, $4::uuid, $5::numeric, $6::numeric,
             $7::public.costing_method, $8::numeric, now(), now())
     ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
     DO UPDATE SET quantity = EXCLUDED.quantity, total_value = EXCLUDED.total_value,
                   valuation_method = EXCLUDED.valuation_method,
                   last_unit_cost = EXCLUDED.last_unit_cost, last_movement_at = now(), updated_at = now()`,
    [
      k.productId,
      k.warehouseId,
      k.ownerType,
      k.ownerId,
      String(a.qty1),
      String(a.val1),
      a.method,
      String(a.lastUnitCost),
    ],
  );
}

export interface CostTransactionArgs {
  productId: string;
  warehouseId: string;
  ownerType: string;
  ownerId: string | null;
  direction: "IN" | "OUT";
  absQty: number;
  txCost: number;
  value: number;
  method: string;
  qty0: number;
  val0: number;
  qty1: number;
  val1: number;
  sourceType: string | null;
  sourceId: string | null;
  note: string | null;
}

export async function insertCostTransaction(tx: PoolClient, a: CostTransactionArgs): Promise<void> {
  await tx.query(
    `INSERT INTO public.item_cost_transactions
       (product_id, warehouse_id, owner_type, owner_id, direction, quantity, unit_cost, value,
        method, quantity_before, value_before, quantity_after, value_after, source_type, source_id, note)
     VALUES ($1::uuid, $2::uuid, $3::public.owner_type, $4::uuid, $5, $6::numeric, $7::numeric, $8::numeric,
             $9::public.costing_method, $10::numeric, $11::numeric, $12::numeric, $13::numeric, $14, $15::uuid, $16)`,
    [
      a.productId,
      a.warehouseId,
      a.ownerType,
      a.ownerId,
      a.direction,
      String(a.absQty),
      String(a.txCost),
      String(a.value),
      a.method,
      String(a.qty0),
      String(a.val0),
      String(a.qty1),
      String(a.val1),
      a.sourceType,
      a.sourceId,
      a.note,
    ],
  );
}

export async function insertCostAudit(
  tx: PoolClient,
  a: {
    actorId: string | null;
    productId: string;
    warehouseId: string;
    method: string;
    direction: "IN" | "OUT";
    absQty: number;
    incomingCost: number | null;
    valuationCost: number | null;
    qty1: number;
    val1: number;
    sourceType: string | null;
    sourceId: string | null;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
     VALUES ($1::uuid, 'cost.movement_applied', 'product', $2::uuid, $3::jsonb)`,
    [
      a.actorId,
      a.productId,
      JSON.stringify({
        warehouse_id: a.warehouseId,
        method: a.method,
        direction: a.direction,
        quantity: a.absQty,
        actual_purchase_cost: a.direction === "IN" ? a.incomingCost : null,
        valuation_unit_cost: a.valuationCost,
        quantity_after: a.qty1,
        value_after: a.val1,
        source_type: a.sourceType,
        source_id: a.sourceId,
      }),
    ],
  );
}

// ── الأرصدة الافتتاحية والتسويات ───────────────────────────────────────────

export async function nextStockOpeningNumber(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT 'OP-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.stock_opening_seq')::text, 4, '0') AS n",
  );
  return rows[0].n;
}

export async function nextStockAdjustmentNumber(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT 'ADJ-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.stock_adjustment_seq')::text, 4, '0') AS n",
  );
  return rows[0].n;
}

export async function nextTransferNumber(tx: PoolClient): Promise<string> {
  // كما في الأصل (012): يمر عبر fn_next_document_number للترقيم المركزي.
  const { rows } = await tx.query<{ n: string }>(
    "SELECT public.fn_next_document_number('stock_transfer') AS n",
  );
  return rows[0].n;
}

export async function insertStockTransfer(
  tx: PoolClient,
  a: {
    transferNumber: string;
    fromWarehouseId: string;
    toWarehouseId: string;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.stock_transfers (transfer_number, from_warehouse_id, to_warehouse_id, note, created_by)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5::uuid) RETURNING id`,
    [a.transferNumber, a.fromWarehouseId, a.toWarehouseId, a.note, a.createdBy],
  );
  return rows[0].id;
}

export async function insertStockTransferItem(
  tx: PoolClient,
  a: { transferId: string; productId: string; quantity: number },
): Promise<void> {
  await tx.query(
    "INSERT INTO public.stock_transfer_items (transfer_id, product_id, quantity) VALUES ($1::uuid, $2::uuid, $3::numeric)",
    [a.transferId, a.productId, a.quantity],
  );
}

export async function insertStockOpening(
  tx: PoolClient,
  a: {
    number: string;
    warehouseId: string;
    effectiveDate: string | null;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.stock_openings (document_number, warehouse_id, effective_date, note, created_by)
     VALUES ($1, $2::uuid, COALESCE($3::date, CURRENT_DATE), NULLIF(BTRIM($4), ''), $5::uuid)
     RETURNING id`,
    [a.number, a.warehouseId, a.effectiveDate, a.note, a.createdBy],
  );
  return rows[0].id;
}

export async function insertStockOpeningItem(
  tx: PoolClient,
  a: {
    openingId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    note: string | null;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.stock_opening_items (opening_id, product_id, quantity, unit_cost, total_cost, note)
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::numeric, $6)`,
    [a.openingId, a.productId, String(a.quantity), String(a.unitCost), String(a.totalCost), a.note],
  );
}

export async function updateStockOpeningTotal(
  tx: PoolClient,
  openingId: string,
  total: number,
): Promise<void> {
  await tx.query("UPDATE public.stock_openings SET total_value = $2::numeric WHERE id = $1::uuid", [
    openingId,
    String(total),
  ]);
}

export async function insertStockAdjustment(
  tx: PoolClient,
  a: {
    number: string;
    warehouseId: string;
    effectiveDate: string | null;
    reason: string;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.stock_adjustments (document_number, warehouse_id, effective_date, reason, note, created_by)
     VALUES ($1, $2::uuid, COALESCE($3::date, CURRENT_DATE), $4, NULLIF(BTRIM($5), ''), $6::uuid)
     RETURNING id`,
    [a.number, a.warehouseId, a.effectiveDate, a.reason, a.note, a.createdBy],
  );
  return rows[0].id;
}

export async function insertStockAdjustmentItem(
  tx: PoolClient,
  a: {
    adjustmentId: string;
    productId: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    note: string | null;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.stock_adjustment_items (adjustment_id, product_id, quantity, unit_cost, total_cost, note)
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::numeric, $6)`,
    [
      a.adjustmentId,
      a.productId,
      String(a.quantity),
      String(a.unitCost),
      String(a.totalCost),
      a.note,
    ],
  );
}

export async function updateStockAdjustmentTotal(
  tx: PoolClient,
  adjustmentId: string,
  total: number,
): Promise<void> {
  await tx.query(
    "UPDATE public.stock_adjustments SET total_value = $2::numeric WHERE id = $1::uuid",
    [adjustmentId, String(total)],
  );
}

export async function fixAdjustmentMovementReason(
  tx: PoolClient,
  adjustmentId: string,
  reason: string,
): Promise<void> {
  await tx.query(
    `UPDATE public.stock_movements SET adjustment_reason = $2
      WHERE source_type = 'stock_adjustment' AND source_id = $1::uuid
        AND movement_kind = 'ADJUSTMENT' AND adjustment_reason IS NULL`,
    [adjustmentId, reason],
  );
}

export async function stockItemClassCode(tx: PoolClient, productId: string): Promise<string> {
  const { rows } = await tx.query<{ code: string }>(
    `SELECT CASE p.item_class
              WHEN 'RAW_MATERIAL' THEN '1311'
              WHEN 'BY_PRODUCT'   THEN '1314'
              ELSE '1313' END AS code
       FROM public.products p WHERE p.id = $1::uuid`,
    [productId],
  );
  return rows[0].code;
}

export async function insertAudit(
  tx: PoolClient,
  a: { actorId: string; action: string; entityType: string; entityId: string; payload: unknown },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
    [a.actorId, a.action, a.entityType, a.entityId, JSON.stringify(a.payload)],
  );
}

// ── أرصدة أول المدة (مستند محاسبي) ────────────────────────────────────────

export async function insertOpeningBalanceDocument(
  tx: PoolClient,
  a: { number: string; effectiveDate: string; notes: string | null; createdBy: string },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.opening_balance_documents
       (document_number, effective_date, status, fiscal_year, notes, created_by)
     VALUES ($1, $2::date, 'DRAFT', EXTRACT(YEAR FROM $2::date)::int, NULLIF(BTRIM($3), ''), $4::uuid)
     RETURNING id`,
    [a.number, a.effectiveDate, a.notes, a.createdBy],
  );
  return rows[0].id;
}

export const OPENING_SECTIONS = [
  "STOCK",
  "RECEIVABLE",
  "PAYABLE",
  "CASH",
  "BANK",
  "ASSET",
  "LIABILITY",
  "CAPITAL",
] as const;

export function sectionSide(section: string): "DEBIT" | "CREDIT" {
  return ["STOCK", "RECEIVABLE", "CASH", "BANK", "ASSET"].includes(section) ? "DEBIT" : "CREDIT";
}

export interface OpeningLineInput {
  section: string;
  refType?: string | null;
  refId?: string | null;
  productId?: string | null;
  warehouseId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitCost?: number | null;
  amount?: number | null;
  ledgerAccountCode?: string | null;
}

export async function insertOpeningBalanceLine(
  tx: PoolClient,
  documentId: string,
  l: OpeningLineInput,
  side: "DEBIT" | "CREDIT",
): Promise<void> {
  await tx.query(
    `INSERT INTO public.opening_balance_lines
       (document_id, section, side, ref_type, ref_id, product_id, warehouse_id,
        customer_id, supplier_id, description, quantity, unit_cost, amount, ledger_account_code)
     VALUES ($1::uuid, $2, $3::public.journal_side, $4, $5::uuid, $6::uuid, $7::uuid,
             $8::uuid, $9::uuid, $10, $11::numeric, $12::numeric, $13::numeric, $14)`,
    [
      documentId,
      l.section,
      side,
      l.refType ?? null,
      l.refId ?? null,
      l.productId ?? null,
      l.warehouseId ?? null,
      l.customerId ?? null,
      l.supplierId ?? null,
      (l.description ?? "").trim() ? l.description!.trim() : l.section,
      l.quantity ?? null,
      l.unitCost ?? null,
      l.amount ?? null,
      (l.ledgerAccountCode ?? "").trim() ? l.ledgerAccountCode!.trim() : null,
    ],
  );
}

export async function lockOpeningDocument(
  tx: PoolClient,
  documentId: string,
): Promise<{
  id: string;
  status: string;
  documentNumber: string;
  effectiveDate: string;
  fiscalYear: number | null;
} | null> {
  const { rows } = await tx.query<{
    id: string;
    status: string;
    document_number: string;
    effective_date: string;
    fiscal_year: number | null;
  }>(
    "SELECT id, status::text, document_number, effective_date::text AS effective_date, fiscal_year FROM public.opening_balance_documents WHERE id = $1::uuid FOR UPDATE",
    [documentId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    status: rows[0].status,
    documentNumber: rows[0].document_number,
    effectiveDate: rows[0].effective_date,
    fiscalYear: rows[0].fiscal_year,
  };
}

export async function updateOpeningDocument(
  tx: PoolClient,
  a: { documentId: string; effectiveDate: string; notes: string | null },
): Promise<void> {
  await tx.query(
    `UPDATE public.opening_balance_documents
        SET effective_date = $2::date, fiscal_year = EXTRACT(YEAR FROM $2::date)::int,
            notes = NULLIF(BTRIM($3), '')
      WHERE id = $1::uuid`,
    [a.documentId, a.effectiveDate, a.notes],
  );
}

export async function deleteOpeningLines(tx: PoolClient, documentId: string): Promise<void> {
  await tx.query("DELETE FROM public.opening_balance_lines WHERE document_id = $1::uuid", [
    documentId,
  ]);
}

export async function insertCostingPolicyHistory(
  tx: PoolClient,
  a: { previous: string | null; notes: string | null; changedBy: string },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.costing_policy_history (costing_method, previous_method, reason, changed_by)
     VALUES ('MOVING_AVERAGE'::public.costing_method, $1::public.costing_method, NULLIF(BTRIM($2), ''), $3::uuid)`,
    [a.previous, a.notes, a.changedBy],
  );
}

export async function updateCostingSettings(
  tx: PoolClient,
  a: { notes: string | null; updatedBy: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.company_costing_settings
        SET costing_method = 'MOVING_AVERAGE'::public.costing_method,
            effective_from = CURRENT_DATE, updated_by = $2::uuid, updated_at = now(),
            notes = NULLIF(BTRIM($1), '')
      WHERE id = 1`,
    [a.notes, a.updatedBy],
  );
}

export async function anyCompanyStockOrCostLayers(tx: PoolClient): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM public.inventory i
         WHERE i.owner_type = 'COMPANY'::public.owner_type AND i.quantity <> 0
     ) OR EXISTS (
        SELECT 1 FROM public.item_cost_layers cl
         WHERE cl.owner_type = 'COMPANY'::public.owner_type
           AND (cl.quantity <> 0 OR cl.total_value <> 0)
     ) AS ok`,
  );
  return rows[0]?.ok === true;
}

export async function lockCostingSettings(tx: PoolClient): Promise<string | null> {
  const { rows } = await tx.query<{ costing_method: string | null }>(
    "SELECT costing_method::text FROM public.company_costing_settings WHERE id = 1 FOR UPDATE",
  );
  if (rows.length === 0) return null; // الصف مفقود — المستدعي يرمي رسالة الأصل
  return rows[0].costing_method;
}
