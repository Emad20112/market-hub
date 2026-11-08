/**
 * محرك المخزون — المرحلة 4: إعادة تنفيذ post_stock_delta + apply_cost_movement
 * (006) في TypeScript حرفيًا: نفس التحقق، نفس الأقفال، نفس التقريب، نفس رسائل
 * الرفض، نفس ترتيب الكتابة (inventory → movement → cost layer → cost tx → audit
 * → تصحيح كلفة الحركة).
 *
 * الوضع الانتقالي: دالة القاعدة بقيت للمستدعين SQL الباقين (مبيعات/مشتريات/طحن/إنتاج)
 * حتى نهاية النقل — التكافؤ مثبت باختبار، والإسقاط في المرحلة 13 (DECISIONS-LOG).
 */
import type { PoolClient } from "pg";
import { BusinessRuleError } from "@/server/shared/errors/domain-error";
import {
  companyAllowsNegativeSales,
  companyCostingMethod,
  costLayerValue,
  insertCostAudit,
  insertCostTransaction,
  insertStockMovement,
  isStaff,
  itemNatureAndPolicy,
  lockCostLayer,
  lockInventoryQty,
  productCostPrice,
  roundN,
  setStockEngine,
  updateMovementCosts,
  upsertCostLayer,
  upsertInventory,
  type StockKeys,
} from "../infrastructure/stock.repository";

export interface StockDeltaArgs extends StockKeys {
  /** كمية موقعة: موجب يزيد، سالب ينقص. */
  signedQty: number;
  unitCost: number | null;
  movementKind:
    "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "OPENING" | "TRANSFER_IN" | "TRANSFER_OUT" | "PRODUCTION";
  sourceType: string | null;
  sourceId: string | null;
  note: string | null;
  /** الفاعل (created_by) — null يعني نداء نظام بلا هوية (كما الأصل). */
  actorId: string | null;
  /** legacy movement_type من المستدعين القدامى — coalesce كما في الأصل. */
  movementTypeLegacy: string | null;
}

function legacyMovementType(kind: StockDeltaArgs["movementKind"]): string {
  switch (kind) {
    case "RECEIPT":
      return "purchase";
    case "ISSUE":
      return "sale";
    case "TRANSFER_IN":
      return "transfer_in";
    case "TRANSFER_OUT":
      return "transfer_out";
    default:
      return "adjustment";
  }
}

/** التكلفة الفعلية للحركة — مطابق لـ apply_cost_movement. */
export async function applyCostMovement(
  tx: PoolClient,
  a: Omit<StockDeltaArgs, "movementTypeLegacy">,
): Promise<void> {
  if (a.signedQty === 0) return;
  if (a.signedQty !== roundN(a.signedQty, 3)) {
    throw new BusinessRuleError(
      "Stock movement quantity exceeds the supported precision of three decimal places",
    );
  }
  if (!a.productId || !a.warehouseId) {
    throw new BusinessRuleError("Item and location are required to value a movement");
  }

  const method =
    a.ownerType === "COMPANY"
      ? ((await companyCostingMethod(tx)) ?? "MOVING_AVERAGE")
      : "MOVING_AVERAGE";
  if (a.ownerType === "COMPANY" && method !== "MOVING_AVERAGE") {
    throw new BusinessRuleError(
      `Company stock posting is blocked because the saved costing method (${method}) is not supported. Switch to MOVING_AVERAGE in Stock Settings before posting stock documents.`,
    );
  }

  const before = await lockCostLayer(tx, a);
  const qty0 = before.qty;
  const val0 = before.value;
  const qty1 = roundN(qty0 + a.signedQty, 3);

  let incomingCost: number | null = null;
  let outCost: number | null = null;
  let txCost: number;
  let val1: number;

  if (a.signedQty > 0) {
    if (a.unitCost !== null) incomingCost = a.unitCost;
    else if (qty0 > 0) incomingCost = roundN(val0 / qty0, 4);
    else incomingCost = await productCostPrice(tx, a.productId);
    const eff = incomingCost ?? 0;
    val1 = val0 + roundN(a.signedQty * eff, 2);
    txCost = incomingCost ?? 0;
  } else {
    if (qty0 > 0) outCost = roundN(val0 / qty0, 4);
    else outCost = (await productCostPrice(tx, a.productId)) ?? 0;
    // لا تُحصر عند الصفر: قيمة سالبة = كلفة تقديرية لرصيد مباع أكثر من المتوفر،
    // تُسوّى بالإيصال التالي (سلوك الأصل المتعمد).
    val1 = val0 - roundN(Math.abs(a.signedQty) * (outCost ?? 0), 2);
    txCost = outCost ?? 0;
  }

  await upsertCostLayer(tx, a, {
    qty1,
    val1,
    method,
    lastUnitCost: a.unitCost ?? incomingCost ?? outCost ?? 0,
  });

  await insertCostTransaction(tx, {
    productId: a.productId,
    warehouseId: a.warehouseId,
    ownerType: a.ownerType,
    ownerId: a.ownerId,
    direction: a.signedQty > 0 ? "IN" : "OUT",
    absQty: Math.abs(a.signedQty),
    txCost,
    value: roundN(Math.abs(a.signedQty) * txCost, 2),
    method,
    qty0,
    val0,
    qty1,
    val1,
    sourceType: a.sourceType,
    sourceId: a.sourceId,
    note: a.note,
  });

  await insertCostAudit(tx, {
    actorId: a.actorId,
    productId: a.productId,
    warehouseId: a.warehouseId,
    method,
    direction: a.signedQty > 0 ? "IN" : "OUT",
    absQty: Math.abs(a.signedQty),
    incomingCost: a.signedQty > 0 ? a.unitCost : null,
    valuationCost: a.signedQty > 0 ? incomingCost : outCost,
    qty1,
    val1,
    sourceType: a.sourceType,
    sourceId: a.sourceId,
  });
}

/** حركة مخزون موقعة — مطابق لـ post_stock_delta.
 *  الأمان: كما كانت الدالة القديمة SECURITY DEFINER — الكتابة بـ service_role
 *  مع فحص is_staff صراحة هنا (لا RLS على مسار المحرك). */
export async function postStockDelta(tx: PoolClient, a: StockDeltaArgs): Promise<void> {
  if (a.actorId && !(await isStaff(tx, a.actorId))) {
    throw new BusinessRuleError("Forbidden");
  }
  if (a.signedQty === 0) return;
  if (a.signedQty !== roundN(a.signedQty, 3)) {
    throw new BusinessRuleError(
      "Stock movement quantity exceeds the supported precision of three decimal places",
    );
  }
  if (!a.productId || !a.warehouseId) {
    throw new BusinessRuleError("Item and warehouse are required for a stock movement");
  }

  const allowNegativeSales = await companyAllowsNegativeSales(tx);
  const permittedNegativeIssue =
    allowNegativeSales &&
    a.ownerType === "COMPANY" &&
    a.movementKind === "ISSUE" &&
    a.sourceType === "sales_invoice";

  const movementType = a.movementTypeLegacy ?? legacyMovementType(a.movementKind);

  const { nature, policy } = await itemNatureAndPolicy(tx, a.productId);
  if (nature === "SERVICE" || policy !== "TRACKED") {
    throw new BusinessRuleError(
      `Item ${a.productId} does not hold company stock (nature ${nature ?? "?"}, policy ${policy ?? "?"})`,
    );
  }

  const before = await lockInventoryQty(tx, a);
  const after = roundN(before + a.signedQty, 3);
  if (after < 0 && !permittedNegativeIssue) {
    // تنسيق الرقم مطابق لطبع numeric في PostgreSQL (مقياس 3 خانات) — رسالة الأصل حرفيًا.
    throw new BusinessRuleError(
      `Insufficient stock for item ${a.productId} in warehouse ${a.warehouseId}: available ${before.toFixed(3)}, requested ${Math.abs(a.signedQty)}`,
    );
  }

  await upsertInventory(tx, a, after);

  const val0 = await costLayerValue(tx, a);

  await setStockEngine(tx, true);
  let movementId: string;
  try {
    movementId = await insertStockMovement(tx, {
      productId: a.productId,
      warehouseId: a.warehouseId,
      movementType,
      signedQty: a.signedQty,
      unitCost: a.unitCost,
      reference: (a.sourceType ?? "") + (a.sourceId ? ":" + a.sourceId : ""),
      note: a.note,
      createdBy: a.actorId,
      movementKind: a.movementKind,
      sourceType: a.sourceType,
      sourceId: a.sourceId,
      ownerType: a.ownerType,
      ownerId: a.ownerId,
      adjustmentReason:
        movementType === "adjustment"
          ? a.note?.trim() || a.sourceType?.trim() || "Stock adjustment"
          : null,
    });

    await applyCostMovement(tx, a);

    const val1 = await costLayerValue(tx, a);
    const totalCost =
      a.signedQty > 0 ? roundN(Math.abs(val1 - val0), 2) : roundN(Math.abs(val0 - val1), 2);
    await updateMovementCosts(tx, movementId, totalCost, a.signedQty);
  } finally {
    try {
      await setStockEngine(tx, false);
    } catch {
      // لا تُطغِ على الخطأ الأصلي إذا كانت المعاملة فاشلة أصلًا (ستُرجَع ROLLBACK).
    }
  }
}
