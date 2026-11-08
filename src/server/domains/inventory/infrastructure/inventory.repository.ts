/**
 * مستودع المخزون الثابت (منتجات، دفعات، سياسات) — المرحلة 3.
 * SQL فقط هنا (ADR-004). الأصل: دوال 006/012 المنقولة؛ كل كود يعيد سلوكها حرفيًا.
 * الاعتماد الانتقالي: post_stock_delta يبقى في القاعدة حتى المرحلة 4 (مؤكد في
 * DECISIONS-LOG) — Use Cases تستدعيه عبر SQL داخل نفس المعاملة.
 */
import type { PoolClient } from "pg";
import { NotFoundError } from "@/server/shared/errors/domain-error";

export async function hasRole(tx: PoolClient, userId: string, role: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT public.has_role($1::uuid, $2::public.app_role) AS ok",
    [userId, role],
  );
  return rows[0]?.ok === true;
}

export async function assertAnyRole(
  tx: PoolClient,
  userId: string,
  roles: string[],
): Promise<void> {
  for (const r of roles) if (await hasRole(tx, userId, r)) return;
  // الرسائل هنا لن تظهر — كل مستدِع يرمي رسالته الخاصة قبلهما حسب الترتيب الأصلي.
  throw new Error("Not authorized");
}

// ── الدفعات ────────────────────────────────────────────────────────────────

export interface BatchRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  batch_number: string;
  expiry_date: string | null;
  quantity: string | number;
  unit_cost: string | number;
}

export async function lockBatchById(tx: PoolClient, batchId: string): Promise<BatchRow | null> {
  const { rows } = await tx.query<BatchRow>(
    "SELECT id, product_id, warehouse_id, batch_number, expiry_date, quantity, unit_cost FROM public.product_batches WHERE id = $1::uuid FOR UPDATE",
    [batchId],
  );
  return rows[0] ?? null;
}

export async function findBatchByNumber(
  tx: PoolClient,
  productId: string,
  warehouseId: string,
  batchNumber: string,
): Promise<BatchRow | null> {
  const { rows } = await tx.query<BatchRow>(
    "SELECT id, product_id, warehouse_id, batch_number, expiry_date, quantity, unit_cost FROM public.product_batches WHERE product_id = $1::uuid AND warehouse_id = $2::uuid AND batch_number = $3 FOR UPDATE",
    [productId, warehouseId, batchNumber],
  );
  return rows[0] ?? null;
}

export async function isProductTracked(tx: PoolClient, productId: string): Promise<boolean> {
  const { rows } = await tx.query<{ tracked: boolean | null }>(
    "SELECT (inventory_policy = 'TRACKED') AS tracked FROM public.products WHERE id = $1::uuid",
    [productId],
  );
  return rows[0] ? (rows[0].tracked ?? true) : true;
}

export async function insertBatch(
  tx: PoolClient,
  b: {
    productId: string;
    warehouseId: string;
    batchNumber: string;
    expiryDate: string | null;
    quantity: string;
    unitCost: string;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.product_batches (product_id, warehouse_id, batch_number, expiry_date, quantity, unit_cost, note, created_by)
     VALUES ($1::uuid, $2::uuid, $3, $4::date, $5::numeric, $6::numeric, NULLIF(BTRIM($7), ''), $8::uuid)
     RETURNING id`,
    [
      b.productId,
      b.warehouseId,
      b.batchNumber,
      b.expiryDate,
      b.quantity,
      b.unitCost,
      b.note,
      b.createdBy,
    ],
  );
  return rows[0].id;
}

export async function mergeIntoBatch(
  tx: PoolClient,
  batchId: string,
  p: { quantity: string; unitCost: string; expiryDate: string | null; note: string | null },
): Promise<void> {
  await tx.query(
    `UPDATE public.product_batches
        SET quantity = round(quantity + $2::numeric, 3),
            unit_cost = CASE WHEN $3::numeric > 0 THEN $3::numeric ELSE unit_cost END,
            expiry_date = COALESCE($4::date, expiry_date),
            note = COALESCE(NULLIF(BTRIM($5), ''), note),
            updated_at = now()
      WHERE id = $1::uuid`,
    [batchId, p.quantity, p.unitCost, p.expiryDate, p.note],
  );
}

export async function updateBatchFull(
  tx: PoolClient,
  batchId: string,
  p: {
    productId: string;
    warehouseId: string;
    batchNumber: string;
    expiryDate: string | null;
    quantity: string;
    unitCost: string;
    note: string | null;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.product_batches
        SET product_id = $2::uuid, warehouse_id = $3::uuid, batch_number = $4,
            expiry_date = $5::date, quantity = $6::numeric, unit_cost = $7::numeric,
            note = NULLIF(BTRIM($8), ''), updated_at = now()
      WHERE id = $1::uuid`,
    [
      batchId,
      p.productId,
      p.warehouseId,
      p.batchNumber,
      p.expiryDate,
      p.quantity,
      p.unitCost,
      p.note,
    ],
  );
}

export async function deleteBatchRow(tx: PoolClient, batchId: string): Promise<void> {
  await tx.query("DELETE FROM public.product_batches WHERE id = $1::uuid", [batchId]);
}

/**
 * جسر للمحرك الجديد (المرحلة 4) — يحل الاستدعاء SQL القديم داخل المخزون.
 * نفس معاملات الاستدعاء السابق، ويُمرر الفاعل للـ audit وis_staff كالأصل.
 */
export async function postStockDeltaViaEngine(
  tx: PoolClient,
  a: {
    productId: string;
    warehouseId: string;
    delta: number;
    unitCost: number;
    kind: "RECEIPT" | "ISSUE" | "ADJUSTMENT";
    refTable: string;
    refId: string | null;
    note: string;
    ownerType: "COMPANY" | "CUSTOMER";
    ownerId: string | null;
    movementType: string;
    actorId: string;
  },
): Promise<void> {
  const { postStockDelta } = await import("@/server/domains/stock/application/engine");
  await postStockDelta(tx, {
    productId: a.productId,
    warehouseId: a.warehouseId,
    ownerType: a.ownerType,
    ownerId: a.ownerId,
    signedQty: a.delta,
    unitCost: a.unitCost,
    movementKind: a.kind,
    sourceType: a.refTable,
    sourceId: a.refId,
    note: a.note,
    actorId: a.actorId,
    movementTypeLegacy: a.movementType,
  });
}

// ── KPIs والتسوية ──────────────────────────────────────────────────────────

export interface BatchKpis {
  total: number;
  expired: number;
  soon: number;
  valid: number;
  none: number;
  at_risk: number;
}

export async function getBatchKpis(tx: PoolClient, warningDays: number): Promise<BatchKpis> {
  const { rows } = await tx.query<{
    total: string;
    expired: string;
    soon: string;
    valid: string;
    none: string;
  }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE) AS expired,
            count(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + ($1::int || ' days')::interval) AS soon,
            count(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date > CURRENT_DATE + ($1::int || ' days')::interval) AS valid,
            count(*) FILTER (WHERE expiry_date IS NULL) AS none
       FROM public.product_batches`,
    [warningDays],
  );
  const r = rows[0];
  const total = Number(r.total);
  const expired = Number(r.expired);
  const soon = Number(r.soon);
  const valid = Number(r.valid);
  const none = Number(r.none);
  return { total, expired, soon, valid, none, at_risk: expired + soon };
}

export interface ReconcileDiff {
  product_id: string;
  warehouse_id: string;
  batch_qty: string;
  inventory_qty: string;
  difference: string;
}

export async function reconcileBatches(
  tx: PoolClient,
  warehouseId: string | null,
): Promise<ReconcileDiff[]> {
  const { rows } = await tx.query<ReconcileDiff>(
    `WITH batch_sums AS (
       SELECT product_id, warehouse_id, sum(quantity) AS total_batch_qty
         FROM public.product_batches
        WHERE ($1::uuid IS NULL OR warehouse_id = $1::uuid)
        GROUP BY product_id, warehouse_id
     ),
     inv_stocks AS (
       SELECT product_id, warehouse_id, quantity AS inv_qty
         FROM public.inventory
        WHERE owner_type = 'COMPANY'
          AND ($1::uuid IS NULL OR warehouse_id = $1::uuid)
     )
     SELECT COALESCE(b.product_id, i.product_id)::text AS product_id,
            COALESCE(b.warehouse_id, i.warehouse_id)::text AS warehouse_id,
            COALESCE(b.total_batch_qty, 0)::text AS batch_qty,
            COALESCE(i.inv_qty, 0)::text AS inventory_qty,
            (COALESCE(b.total_batch_qty, 0) - COALESCE(i.inv_qty, 0))::text AS difference
       FROM batch_sums b
       FULL OUTER JOIN inv_stocks i
         ON b.product_id = i.product_id AND b.warehouse_id = i.warehouse_id
      WHERE COALESCE(b.total_batch_qty, 0) <> COALESCE(i.inv_qty, 0)`,
    [warehouseId],
  );
  return rows;
}

// ── مخزون العملاء ──────────────────────────────────────────────────────────

export async function getItemNature(tx: PoolClient, productId: string): Promise<string | null> {
  const { rows } = await tx.query<{ item_nature: string | null }>(
    "SELECT item_nature::text AS item_nature FROM public.products WHERE id = $1::uuid",
    [productId],
  );
  if (rows.length === 0) return null;
  return rows[0].item_nature;
}

export async function customerExists(tx: PoolClient, customerId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM public.customers WHERE id = $1::uuid) AS ok",
    [customerId],
  );
  return rows[0]?.ok === true;
}

export async function lastCustomerMovementId(
  tx: PoolClient,
  a: { productId: string; warehouseId: string; customerId: string },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM public.stock_movements
      WHERE product_id = $1::uuid AND warehouse_id = $2::uuid
        AND owner_type = 'CUSTOMER' AND owner_id = $3::uuid
      ORDER BY created_at DESC LIMIT 1`,
    [a.productId, a.warehouseId, a.customerId],
  );
  if (!rows[0]) throw new NotFoundError("stock movement");
  return rows[0].id;
}

export async function insertAuditLog(
  tx: PoolClient,
  a: { actorId: string; action: string; entityType: string; entityId: string; payload: unknown },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
    [a.actorId, a.action, a.entityType, a.entityId, JSON.stringify(a.payload)],
  );
}

// ── سياسة الصنف ────────────────────────────────────────────────────────────

export interface ProductPolicyRow {
  item_nature: string;
  inventory_policy: string;
  costing_method: string;
  tracking: string;
}

export async function lockProductPolicy(tx: PoolClient, itemId: string): Promise<ProductPolicyRow> {
  const { rows } = await tx.query<ProductPolicyRow>(
    "SELECT item_nature::text, inventory_policy::text, costing_method::text, tracking::text FROM public.products WHERE id = $1::uuid FOR UPDATE",
    [itemId],
  );
  if (!rows[0]) throw new NotFoundError("item", itemId);
  return rows[0];
}

export async function itemHasStockHistory(tx: PoolClient, itemId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT public.item_has_stock_history($1::uuid) AS ok",
    [itemId],
  );
  return rows[0]?.ok === true;
}

export async function setPolicyChangeAllowed(tx: PoolClient): Promise<void> {
  // نفس آلية الأصل: GUC على مستوى المعاملة يقرأه مشغل tg_guard_item_policy_change.
  await tx.query("SELECT set_config('app.allow_policy_change', 'on', true)");
}

export async function updateProductCommercialFields(
  tx: PoolClient,
  itemId: string,
  p: {
    isSellable: boolean;
    isPurchasable: boolean;
    baseUomId: string | null;
    salesUomId: string | null;
    purchaseUomId: string | null;
    uomConversions: string | null;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.products
        SET is_sellable = $2::boolean, is_purchasable = $3::boolean,
            base_uom_id = $4::uuid, sales_uom_id = $5::uuid, purchase_uom_id = $6::uuid,
            uom_conversions = COALESCE($7::jsonb, uom_conversions),
            updated_at = now()
      WHERE id = $1::uuid`,
    [
      itemId,
      p.isSellable,
      p.isPurchasable,
      p.baseUomId,
      p.salesUomId,
      p.purchaseUomId,
      p.uomConversions,
    ],
  );
}

export async function updateProductPolicyFull(
  tx: PoolClient,
  itemId: string,
  p: {
    itemNature: string;
    inventoryPolicy: string;
    costingMethod: string;
    tracking: string;
    isSellable: boolean;
    isPurchasable: boolean;
    baseUomId: string | null;
    salesUomId: string | null;
    purchaseUomId: string | null;
    uomConversions: string | null;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.products
        SET item_nature = $2::public.item_nature,
            inventory_policy = $3::public.inventory_policy,
            costing_method = $4::public.costing_method,
            tracking = $5::public.item_tracking,
            is_sellable = $6::boolean, is_purchasable = $7::boolean,
            base_uom_id = $8::uuid, sales_uom_id = $9::uuid, purchase_uom_id = $10::uuid,
            uom_conversions = COALESCE($11::jsonb, uom_conversions),
            updated_at = now()
      WHERE id = $1::uuid`,
    [
      itemId,
      p.itemNature,
      p.inventoryPolicy,
      p.costingMethod,
      p.tracking,
      p.isSellable,
      p.isPurchasable,
      p.baseUomId,
      p.salesUomId,
      p.purchaseUomId,
      p.uomConversions,
    ],
  );
}

export async function auditPolicySnapshot(
  tx: PoolClient,
  itemId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  source: string,
): Promise<void> {
  // audit_item_policy_snapshot تبقى في القاعدة (تستخدمها مشغلات/سياسات) — استدعاء انتقالي.
  await tx.query(
    "SELECT public.audit_item_policy_snapshot($1::uuid, $2, $3::jsonb, $4::jsonb, $5)",
    [itemId, "item_policy.changed", JSON.stringify(before), JSON.stringify(after), source],
  );
}
