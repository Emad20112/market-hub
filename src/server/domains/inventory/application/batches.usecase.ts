/**
 * Use Cases: الدفعات (حفظ/حذف/KPI/تسوية) ومخزون العملاء — المرحلة 3.
 * كل دالة تعيد سلوك نظيرتها القديمة حرفيًا (التحقق، القفل FOR UPDATE، الدمج،
 * post_stock_delta الانتقالي، رسائل الرفض نفسها).
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  customerExists,
  deleteBatchRow,
  findBatchByNumber,
  getBatchKpis as repoKpis,
  getItemNature,
  hasRole,
  insertAuditLog,
  insertBatch,
  isProductTracked,
  lastCustomerMovementId,
  lockBatchById,
  lockProductPolicy,
  mergeIntoBatch,
  postStockDeltaViaEngine,
  reconcileBatches as repoReconcile,
  setPolicyChangeAllowed,
  itemHasStockHistory,
  updateBatchFull,
  updateProductCommercialFields,
  updateProductPolicyFull,
  auditPolicySnapshot,
  type BatchKpis,
  type ReconcileDiff,
} from "../infrastructure/inventory.repository";

// ── save_product_batch ─────────────────────────────────────────────────────

export interface SaveBatchInput {
  productId: string;
  warehouseId: string;
  batchNumber: string;
  expiryDate?: string | null;
  quantity?: number;
  unitCost?: number;
  note?: string | null;
  syncInventory?: boolean;
  batchId?: string | null;
}

export async function saveProductBatch(
  session: ServerSession,
  input: SaveBatchInput,
): Promise<{ batchId: string }> {
  const productId = input.productId;
  const warehouseId = input.warehouseId;
  const batchNumber = input.batchNumber;
  const quantity = input.quantity ?? 0;
  const cost = input.unitCost ?? 0;
  const sync = input.syncInventory ?? true;

  return withTransaction(async (tx: PoolClient) => {
    if (!productId) throw new BusinessRuleError("Product is required for batch");
    if (!warehouseId) throw new BusinessRuleError("Warehouse is required for batch");
    if (!batchNumber || batchNumber.trim() === "")
      throw new BusinessRuleError("Batch number is required");
    if (quantity < 0) throw new BusinessRuleError("Batch quantity cannot be negative");
    if (cost < 0) throw new BusinessRuleError("Batch unit cost cannot be negative");

    const productTracked = await isProductTracked(tx, productId);

    let batchId: string;
    let delta = 0;
    if (input.batchId) {
      const existing = await lockBatchById(tx, input.batchId);
      if (!existing) throw new BusinessRuleError(`Batch ${input.batchId} not found`);
      await updateBatchFull(tx, input.batchId, {
        productId,
        warehouseId,
        batchNumber: batchNumber.trim(),
        expiryDate: input.expiryDate ?? null,
        quantity: String(quantity),
        unitCost: String(cost),
        note: input.note ?? null,
      });
      batchId = input.batchId;
      delta = quantity - Number(existing.quantity);
    } else {
      const existing = await findBatchByNumber(tx, productId, warehouseId, batchNumber.trim());
      if (existing) {
        await mergeIntoBatch(tx, existing.id, {
          quantity: String(quantity),
          unitCost: String(cost),
          expiryDate: input.expiryDate ?? null,
          note: input.note ?? null,
        });
        batchId = existing.id;
        delta = quantity;
      } else {
        batchId = await insertBatch(tx, {
          productId,
          warehouseId,
          batchNumber: batchNumber.trim(),
          expiryDate: input.expiryDate ?? null,
          quantity: String(quantity),
          unitCost: String(cost),
          note: input.note ?? null,
          createdBy: session.userId,
        });
        delta = quantity;
      }
    }

    if (sync && delta !== 0 && productTracked) {
      await postStockDeltaViaEngine(tx, {
        productId,
        warehouseId,
        delta,
        unitCost: cost,
        kind: delta > 0 ? "RECEIPT" : "ADJUSTMENT",
        refTable: "product_batch",
        refId: batchId,
        note: delta > 0 ? `توريد دفعة: ${batchNumber.trim()}` : `تعديل دفعة: ${batchNumber.trim()}`,
        ownerType: "COMPANY",
        ownerId: null,
        movementType: delta > 0 ? "purchase" : "adjustment",
        actorId: session.userId,
      });
    }

    return { batchId };
  });
}

// ── delete_product_batch ───────────────────────────────────────────────────

export async function deleteProductBatch(
  session: ServerSession,
  batchId: string,
  syncInventory = true,
): Promise<{ deleted: boolean }> {
  return withTransaction(async (tx: PoolClient) => {
    const batch = await lockBatchById(tx, batchId);
    if (!batch) return { deleted: false };

    const tracked = await isProductTracked(tx, batch.product_id);
    await deleteBatchRow(tx, batchId);

    const qty = Number(batch.quantity);
    if (syncInventory && qty > 0 && tracked) {
      await postStockDeltaViaEngine(tx, {
        productId: batch.product_id,
        warehouseId: batch.warehouse_id,
        delta: -qty,
        unitCost: Number(batch.unit_cost),
        kind: "ADJUSTMENT",
        refTable: "product_batch",
        refId: batchId,
        note: `حذف دفعة رقم: ${batch.batch_number}`,
        ownerType: "COMPANY",
        ownerId: null,
        movementType: "adjustment",
        actorId: session.userId,
      });
    }
    return { deleted: true };
  });
}

// ── get_batch_kpis / reconcile_batches_with_inventory ─────────────────────

export async function batchKpis(_session: ServerSession, warningDays = 30): Promise<BatchKpis> {
  return withTransaction(async (tx) => repoKpis(tx, warningDays));
}

export async function reconcileBatchesWithInventory(
  _session: ServerSession,
  warehouseId?: string | null,
): Promise<ReconcileDiff[]> {
  return withTransaction(async (tx) => repoReconcile(tx, warehouseId ?? null));
}

// ── receive / release_customer_owned_stock ─────────────────────────────────

async function assertCustomerStockRole(
  tx: PoolClient,
  session: ServerSession,
  verb: "receive" | "release",
): Promise<void> {
  const ok =
    (await hasRole(tx, session.userId, "owner")) ||
    (await hasRole(tx, session.userId, "manager")) ||
    (await hasRole(tx, session.userId, "warehouse"));
  if (!ok) {
    throw new AuthorizationError(
      verb === "receive"
        ? "You are not permitted to receive customer-owned material"
        : "You are not permitted to release customer-owned material",
    );
  }
}

export async function receiveCustomerOwnedStock(
  session: ServerSession,
  input: {
    customerId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    unitCost?: number;
    note?: string | null;
  },
): Promise<{ movementId: string }> {
  return withTransaction(async (tx: PoolClient) => {
    await assertCustomerStockRole(tx, session, "receive");
    if (!input.customerId || !input.productId || !input.warehouseId) {
      throw new BusinessRuleError("Customer, item and location are all required");
    }
    if (input.quantity === null || input.quantity <= 0) {
      throw new BusinessRuleError("Quantity must be positive");
    }
    const nature = await getItemNature(tx, input.productId);
    if (nature === null) {
      throw new BusinessRuleError(`Item ${input.productId} does not exist`);
    }
    if (nature === "SERVICE") {
      throw new BusinessRuleError(
        `Item ${input.productId} is a SERVICE and cannot be held as physical material`,
      );
    }
    if (!(await customerExists(tx, input.customerId))) {
      throw new BusinessRuleError(`Customer ${input.customerId} does not exist`);
    }

    await postStockDeltaViaEngine(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      delta: input.quantity,
      unitCost: input.unitCost ?? 0,
      kind: "RECEIPT",
      refTable: "customer_owned_receipt",
      refId: null,
      note: input.note?.trim() || "استلام مادة مملوكة للعميل",
      ownerType: "CUSTOMER",
      ownerId: input.customerId,
      movementType: "purchase",
      actorId: session.userId,
    });

    const movementId = await lastCustomerMovementId(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      customerId: input.customerId,
    });

    await insertAuditLog(tx, {
      actorId: session.userId,
      action: "customer_owned.received",
      entityType: "customers",
      entityId: input.customerId,
      payload: {
        product_id: input.productId,
        warehouse_id: input.warehouseId,
        quantity: input.quantity,
        unit_cost: input.unitCost ?? 0,
        movement_id: movementId,
      },
    });
    return { movementId };
  });
}

export async function releaseCustomerOwnedStock(
  session: ServerSession,
  input: {
    customerId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    note?: string | null;
  },
): Promise<{ movementId: string }> {
  return withTransaction(async (tx: PoolClient) => {
    await assertCustomerStockRole(tx, session, "release");
    if (input.quantity === null || input.quantity <= 0) {
      throw new BusinessRuleError("Quantity must be positive");
    }

    await postStockDeltaViaEngine(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      delta: -input.quantity,
      unitCost: 0,
      kind: "ISSUE",
      refTable: "customer_owned_delivery",
      refId: null,
      note: input.note?.trim() || "تسليم مادة مملوكة للعميل",
      ownerType: "CUSTOMER",
      ownerId: input.customerId,
      movementType: "sale",
      actorId: session.userId,
    });

    const movementId = await lastCustomerMovementId(tx, {
      productId: input.productId,
      warehouseId: input.warehouseId,
      customerId: input.customerId,
    });

    await insertAuditLog(tx, {
      actorId: session.userId,
      action: "customer_owned.released",
      entityType: "customers",
      entityId: input.customerId,
      payload: {
        product_id: input.productId,
        warehouse_id: input.warehouseId,
        quantity: input.quantity,
        movement_id: movementId,
      },
    });
    return { movementId };
  });
}

// ── save_item_policy ───────────────────────────────────────────────────────

export interface SaveItemPolicyInput {
  itemId: string;
  itemNature: string;
  inventoryPolicy: string;
  costingMethod: string;
  tracking: string;
  isSellable: boolean;
  isPurchasable: boolean;
  baseUomId?: string | null;
  salesUomId?: string | null;
  purchaseUomId?: string | null;
  uomConversions?: unknown;
}

export async function saveItemPolicy(
  session: ServerSession,
  input: SaveItemPolicyInput,
): Promise<{ itemId: string }> {
  return withTransaction(async (tx: PoolClient) => {
    const staffOk =
      (await hasRole(tx, session.userId, "owner")) ||
      (await hasRole(tx, session.userId, "manager")) ||
      (await hasRole(tx, session.userId, "warehouse"));
    if (!staffOk) throw new AuthorizationError("You are not permitted to edit item policy");

    const current = await lockProductPolicy(tx, input.itemId);

    if (input.itemNature === "SERVICE" && input.inventoryPolicy !== "UNTRACKED") {
      throw new BusinessRuleError("A SERVICE can only be UNTRACKED");
    }
    if (input.inventoryPolicy === "TRACKED" && input.costingMethod === "NONE") {
      throw new BusinessRuleError("A TRACKED item requires a costing method other than NONE");
    }
    if (input.inventoryPolicy === "UNTRACKED" && input.tracking !== "NONE") {
      throw new BusinessRuleError("An UNTRACKED item cannot require batch or serial tracking");
    }
    if (!input.isSellable && !input.isPurchasable) {
      throw new BusinessRuleError("An item must be usable for selling, purchasing, or both");
    }
    if (
      input.uomConversions !== undefined &&
      input.uomConversions !== null &&
      !Array.isArray(input.uomConversions)
    ) {
      throw new BusinessRuleError("UOM conversions must be a JSON array");
    }

    const policyChanged =
      input.itemNature !== current.item_nature ||
      input.inventoryPolicy !== current.inventory_policy ||
      input.costingMethod !== current.costing_method ||
      input.tracking !== current.tracking;

    const conversions =
      input.uomConversions === undefined || input.uomConversions === null
        ? null
        : JSON.stringify(input.uomConversions);

    if (!policyChanged) {
      await updateProductCommercialFields(tx, input.itemId, {
        isSellable: input.isSellable,
        isPurchasable: input.isPurchasable,
        baseUomId: input.baseUomId ?? null,
        salesUomId: input.salesUomId ?? null,
        purchaseUomId: input.purchaseUomId ?? null,
        uomConversions: conversions,
      });
      return { itemId: input.itemId };
    }

    const hasHistory = await itemHasStockHistory(tx, input.itemId);
    let before: Record<string, unknown> | null = null;
    if (hasHistory) {
      const ownerOk =
        (await hasRole(tx, session.userId, "owner")) ||
        (await hasRole(tx, session.userId, "manager"));
      if (!ownerOk) {
        throw new AuthorizationError(
          `Item ${input.itemId} has inventory history; only an owner or manager may change its policy`,
        );
      }
      before = {
        item_nature: current.item_nature,
        inventory_policy: current.inventory_policy,
        costing_method: current.costing_method,
        tracking: current.tracking,
      };
      await setPolicyChangeAllowed(tx);
    }

    await updateProductPolicyFull(tx, input.itemId, {
      itemNature: input.itemNature,
      inventoryPolicy: input.inventoryPolicy,
      costingMethod: input.costingMethod,
      tracking: input.tracking,
      isSellable: input.isSellable,
      isPurchasable: input.isPurchasable,
      baseUomId: input.baseUomId ?? null,
      salesUomId: input.salesUomId ?? null,
      purchaseUomId: input.purchaseUomId ?? null,
      uomConversions: conversions,
    });

    if (before) {
      await auditPolicySnapshot(
        tx,
        input.itemId,
        before,
        {
          item_nature: input.itemNature,
          inventory_policy: input.inventoryPolicy,
          costing_method: input.costingMethod,
          tracking: input.tracking,
        },
        "item_editor",
      );
    }

    return { itemId: input.itemId };
  });
}
