/**
 * Use Cases: الإنتاج — المرحلة 11.
 * create/complete_production_order (بصيغتيهما المدمجتين)، reverse_production_order،
 * smart_manufacture، convert_stock، قراءة التاريخ والتفاصيل ومصادر التكلفة —
 * مطابقة لدوال 013/005/009/010 الأصلية حرفيًا (التحقق، الترتيب، الأقفال، الرسائل).
 *
 * القيود عبر محرك المرحلة 9 (createJournalEntryInner + رقم صريح = post_journal_entry)
 * والحركة عبر محرك المرحلة 4 (postStockDelta TS) — لا اعتماد خلفي على دالة القاعدة.
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { postStockDelta } from "@/server/domains/stock/application/engine";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";
import {
  activeCostCenterExists,
  activeWarehouseExists,
  canOperateMilling,
  canReadFinance,
  decrementBatch,
  expectedOutputTotalsForProduct,
  findBatchForProduct,
  firstCostTransactionForOutput,
  grainUnitCost,
  hasRole,
  insertBatchAllocation,
  insertConversionAudit,
  insertCostAllocation,
  insertOutputBatch,
  insertProductionLoss,
  insertProductionMaterial,
  insertProductionOrder,
  insertProductionOutput,
  isStaff,
  itemEffectivePolicy,
  kgFactor,
  latestMovementForSource,
  listCandidateBatches,
  listMaterials,
  listOutputsReversed,
  listOutputsWithTracking,
  listReversibleJournals,
  lockCostLayerState,
  lockExpenseLine,
  lockInventoryQuantity,
  lockProductionOrder,
  lockProductForShare,
  materialAccountTotals,
  materialBatchesTouchedAfter,
  nextMillingServiceRef,
  nextProductionOrderNumber,
  orderReproducesOwnInput,
  outputBatchStillIntact,
  outputHasDownstreamUse,
  markOrderReversed,
  postJournalEntryWithNumber,
  productionExpenseLineAvailable,
  productionInventoryAccountCode,
  productionMassInKg,
  productionQuantityInBase,
  readExpenseEntry,
  readProduct,
  readProductionOrder,
  readUnit,
  companyCostingMethodOrThrow,
  restoreBatchQuantities,
  laterMovementExistsForProduct,
  sharedAllocatedExpenseBlocksReversal,
  updateAllocationJournal,
  updateOrderPosted,
  updateMaterialMovement,
  updateOutputAfterReceipt,
  zeroBatchWithNote,
} from "../infrastructure/production.repository";

type Json = Record<string, unknown>;

function asArray(v: unknown, message: string): Json[] {
  if (!Array.isArray(v)) throw new BusinessRuleError(message);
  return v as Json[];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

// ── create_production_order (013 حرفيًا) ───────────────────────────────────

export async function createProductionOrderInner(
  tx: PoolClient,
  session: ServerSession,
  input: {
    warehouseId: string;
    costCenterId: string;
    productionDate?: string | null;
    notes?: string | null;
  },
): Promise<string> {
  const userId = session.userId;
  const staff = await isStaff(tx, userId);
  const roleOk =
    (await hasRole(tx, userId, "owner")) ||
    (await hasRole(tx, userId, "manager")) ||
    (await hasRole(tx, userId, "warehouse")) ||
    (await hasRole(tx, userId, "accountant"));
  if (!staff || !roleOk) {
    throw new AuthorizationError("ليس لديك صلاحية إنشاء تشغيلة إنتاج");
  }
  const productionDate = input.productionDate ?? new Date().toISOString().slice(0, 10);
  if (!input.warehouseId || !input.costCenterId || !productionDate) {
    throw new BusinessRuleError("المستودع ومركز التكلفة وتاريخ الإنتاج مطلوبة");
  }
  if (!(await activeWarehouseExists(tx, input.warehouseId))) {
    throw new BusinessRuleError("المستودع غير نشط أو غير موجود");
  }
  if (!(await activeCostCenterExists(tx, input.costCenterId))) {
    throw new BusinessRuleError("مركز التكلفة غير نشط أو غير موجود");
  }
  const orderNumber = await nextProductionOrderNumber(tx, productionDate);
  return insertProductionOrder(tx, {
    orderNumber,
    warehouseId: input.warehouseId,
    costCenterId: input.costCenterId,
    productionDate,
    notes: input.notes ?? null,
    createdBy: userId,
  });
}

// ── complete_production_order (013 حرفيًا) ─────────────────────────────────

export interface ProductionMaterialPayload {
  product_id: string;
  quantity: number;
  uom_id?: string | null;
  batch_id?: string | null;
}

export interface ProductionOutputPayload {
  product_id: string;
  quantity: number;
  uom_id?: string | null;
  allocation_value_per_base?: number | null;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface ProductionExpensePayload {
  expense_line_id: string;
  amount: number;
  basis: string;
  note?: string | null;
}

export interface ProductionLossPayload {
  loss_type: "NORMAL" | "ABNORMAL" | string;
  quantity: number;
  uom_id?: string | null;
  reason: string;
  product_id?: string | null;
  mass_kg?: number | null;
}

export async function completeProductionOrderInner(
  tx: PoolClient,
  session: ServerSession,
  input: {
    orderId: string;
    materials: ProductionMaterialPayload[];
    outputs: ProductionOutputPayload[];
    expenses?: ProductionExpensePayload[];
    losses?: ProductionLossPayload[];
  },
): Promise<string> {
  const userId = session.userId;
  const staff = await isStaff(tx, userId);
  const roleOk =
    (await hasRole(tx, userId, "owner")) ||
    (await hasRole(tx, userId, "manager")) ||
    (await hasRole(tx, userId, "warehouse")) ||
    (await hasRole(tx, userId, "accountant"));
  if (!staff || !roleOk) {
    throw new AuthorizationError("ليس لديك صلاحية ترحيل تشغيلة الإنتاج");
  }
  if (!Array.isArray(input.materials) || input.materials.length === 0) {
    throw new BusinessRuleError("أضف مادة واحدة وناتجاً واحداً على الأقل");
  }
  if (!Array.isArray(input.outputs) || input.outputs.length === 0) {
    throw new BusinessRuleError("أضف مادة واحدة وناتجاً واحداً على الأقل");
  }
  const expenses = input.expenses ?? [];
  const losses = input.losses ?? [];
  if (!Array.isArray(expenses) || !Array.isArray(losses)) {
    throw new BusinessRuleError("بيانات المصروفات أو الفاقد غير صحيحة");
  }

  const order = await lockProductionOrder(tx, input.orderId);
  if (!order) throw new BusinessRuleError("تشغيلة الإنتاج غير موجودة");
  if (order.status !== "DRAFT") {
    throw new BusinessRuleError("لا يمكن ترحيل تشغيلة ليست مسودة");
  }
  if (expenses.length > 0 && !(await canReadFinance(tx, userId))) {
    throw new BusinessRuleError("تخصيص المصروفات يتطلب صلاحية مالية");
  }

  const batchSettings = await loadBatchSettingsLocal(tx);
  const companyStrategy = batchSettings.strategy;
  const preventExpired = batchSettings.preventExpired;

  // ── المواد: تطبيع الوحدات، صرف المخزون مرة واحدة، كلفة المحرك الفعلية ──
  let totalMaterialCost = 0;
  let totalInputMass = 0;
  let inputMassComplete = true;

  for (const m of input.materials) {
    const product = await lockProductForShare(tx, m.product_id);
    if (!product || product.itemClass === null || product.itemNature === "SERVICE") {
      throw new BusinessRuleError(`المادة ${m.product_id} لا تدار كمخزون مملوك للمنشأة`);
    }
    if (["SERVICE", "NON_STOCK_ITEM"].includes(product.itemClass ?? "")) {
      throw new BusinessRuleError(`المادة ${m.product_id} لا تدار كمخزون مملوك للمنشأة`);
    }
    if ((await itemEffectivePolicy(tx, product.id)) !== "TRACKED") {
      throw new BusinessRuleError(`المادة ${m.product_id} لا تدار كمخزون مملوك للمنشأة`);
    }
    if (product.tracking === "SERIAL") {
      throw new BusinessRuleError(
        `التصنيع لا يدعم حالياً الصرف التسلسلي للصنف ${product.nameAr ?? product.name ?? product.id}`,
      );
    }
    const baseQty = await productionQuantityInBase(tx, product.id, m.quantity, m.uom_id ?? null);
    const factor = baseQty / m.quantity;
    if (baseQty !== roundN(baseQty, 3)) {
      throw new BusinessRuleError("كمية المادة تتجاوز دقة المخزون 0.001");
    }
    const mass = await productionMassInKg(tx, product.id, baseQty);
    if (product.itemClass === "RAW_MATERIAL") {
      if (mass === null) inputMassComplete = false;
      else totalInputMass += mass;
    }

    const materialId = await insertProductionMaterial(tx, {
      orderId: order.id,
      productId: product.id,
      enteredQuantity: m.quantity,
      uomId: m.uom_id ?? null,
      baseUomId: product.baseUomId ?? product.unitId,
      uomConversionFactor: factor,
      baseQuantity: baseQty,
      massKg: mass,
      inventoryAccountCode: productionInventoryAccountCode(product.itemClass),
    });

    if (product.tracking === "BATCH") {
      let remaining = baseQty;
      if (m.batch_id && m.batch_id !== "") {
        const batch = await findBatchForProduct(tx, {
          batchId: m.batch_id,
          productId: product.id,
          warehouseId: order.warehouseId,
        });
        if (!batch) throw new BusinessRuleError("الدفعة المحددة لا تخص المادة أو المستودع");
        if (
          preventExpired &&
          batch.expiryDate !== null &&
          new Date(batch.expiryDate) <= new Date(order.productionDate)
        ) {
          throw new BusinessRuleError(`لا يمكن صرف دفعة منتهية الصلاحية: ${batch.batchNumber}`);
        }
        if (batch.quantity < remaining) {
          throw new BusinessRuleError(`رصيد الدفعة ${batch.batchNumber} غير كافٍ`);
        }
        await decrementBatch(tx, batch.id, remaining);
        await insertBatchAllocation(tx, {
          materialId,
          batchId: batch.id,
          baseQuantity: remaining,
        });
      } else {
        const strategy = product.batchDispatchStrategy ?? companyStrategy;
        if (strategy === "MANUAL") {
          throw new BusinessRuleError(`حدد دفعة المادة ${product.nameAr} للصرف اليدوي`);
        }
        const candidates = await listCandidateBatches(tx, {
          productId: product.id,
          warehouseId: order.warehouseId,
          strategy,
          preventExpired,
        });
        for (const b of candidates) {
          if (remaining <= 0) break;
          const take = Math.min(b.quantity, remaining);
          await decrementBatch(tx, b.id, take);
          await insertBatchAllocation(tx, {
            materialId,
            batchId: b.id,
            baseQuantity: take,
          });
          remaining -= take;
        }
        if (remaining > 0) {
          throw new BusinessRuleError(`رصيد الدفعات الصالحة غير كافٍ للمادة ${product.nameAr}`);
        }
      }
    } else if (m.batch_id && m.batch_id !== "") {
      throw new BusinessRuleError("لا تقبل دفعة لصنف غير متتبع بالدفعات");
    }

    await postStockDelta(tx, {
      productId: product.id,
      warehouseId: order.warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: -baseQty,
      unitCost: null,
      movementKind: "PRODUCTION",
      sourceType: "production_material",
      sourceId: materialId,
      note: `صرف مواد لتشغيلة ${order.orderNumber}`,
      actorId: userId,
      movementTypeLegacy: "production_out",
    });
    const movement = await latestMovementForSource(tx, "production_material", materialId);
    if (!movement) throw new BusinessRuleError("لم تُسجل حركة صرف المادة");
    await updateMaterialMovement(tx, {
      materialId,
      movementId: movement.id,
      totalCost: movement.totalCost,
      unitCost: movement.unitCost,
    });
    totalMaterialCost += movement.totalCost;
  }

  // ── قيد صرف المواد: مدين WIP، دائن حسابات المخزون ──
  if (totalMaterialCost > 0) {
    const lines: Array<{ account_code: string; debit?: number; credit?: number; memo: string }> = [
      {
        account_code: "1312",
        debit: roundN(totalMaterialCost, 2),
        memo: `مواد مصروفة للتشغيلة ${order.orderNumber}`,
      },
    ];
    for (const g of await materialAccountTotals(tx, order.id, "total_cost", "materials")) {
      lines.push({
        account_code: g.code,
        credit: g.amount,
        memo: `صرف مخزون للتشغيلة ${order.orderNumber}`,
      });
    }
    await postJournalEntryWithNumber(tx, session, {
      entryDate: order.productionDate,
      memo: `صرف مواد لتشغيلة إنتاج ${order.orderNumber}`,
      sourceType: "production_material_issue",
      sourceId: order.id,
      entryNumber: `JE-PM-${order.orderNumber}`,
      lines,
    });
  }

  // ── المصروفات المؤهلة: رسملة صافية بخصم ضريبة المدخلات ──
  let totalConversionCost = 0;
  for (const e of expenses) {
    const line = await lockExpenseLine(tx, e.expense_line_id);
    if (!line) throw new BusinessRuleError("بند المصروف المحدد غير موجود");
    const entry = await readExpenseEntry(tx, line.entryId);
    if (!entry || !["POSTED", "PARTIALLY_PAID", "PAID", "CLOSED"].includes(entry.status)) {
      throw new BusinessRuleError("لا يمكن تحميل مصروف غير مرحّل على الإنتاج");
    }
    if (entry.expenseDate > order.productionDate) {
      throw new BusinessRuleError(
        `تاريخ المصروف ${entry.expenseDate} بعد تاريخ التشغيلة ${order.productionDate}`,
      );
    }
    if ((line.costCenterId ?? entry.costCenterId) !== order.costCenterId) {
      throw new BusinessRuleError("مركز تكلفة المصروف لا يطابق مركز تكلفة التشغيلة");
    }
    const lineCost = roundN(e.amount, 2);
    if (lineCost <= 0) throw new BusinessRuleError("قيمة تحميل المصروف يجب أن تكون موجبة");
    const avail = await productionExpenseLineAvailable(tx, line.id);
    if (!avail) {
      throw new BusinessRuleError("بند المصروف غير مرتبط بحساب مصروف نشط وقابل للترحيل");
    }
    if (lineCost > avail.availableAmount) {
      throw new BusinessRuleError(
        `قيمة تحميل المصروف ${lineCost} تتجاوز المتاح ${avail.availableAmount}`,
      );
    }
    if ((e.basis ?? "").trim().length < 3) {
      throw new BusinessRuleError("اذكر أساس توزيع تكلفة المصروف على التشغيلة");
    }
    const allocationId = await insertCostAllocation(tx, {
      orderId: order.id,
      expenseLineId: line.id,
      expenseEntryId: line.entryId,
      costCenterId: order.costCenterId,
      expenseAccountCode: avail.expenseAccountCode,
      amount: lineCost,
      allocationBasis: e.basis.trim(),
      note: e.note ?? null,
      createdBy: userId,
    });
    await postJournalEntryWithNumber(tx, session, {
      entryDate: order.productionDate,
      memo: `رسملة تكلفة إنتاج من المصروف ${(await readEntryReference(tx, line.entryId)) ?? ""}`,
      sourceType: "production_expense_allocation",
      sourceId: allocationId,
      entryNumber: `JE-PEX-${allocationId.replace(/-/g, "")}`,
      lines: [
        {
          account_code: "1312",
          debit: lineCost,
          memo: `تحميل على تشغيلة ${order.orderNumber}`,
        },
        {
          account_code: avail.expenseAccountCode,
          credit: lineCost,
          memo: "إعادة تصنيف مصروف إلى إنتاج",
        },
      ],
    });
    await updateAllocationJournal(tx, { allocationId, journalId: "" });
    totalConversionCost += lineCost;
  }

  // ── الفاقد: كتلة فقط (013) ──
  const kgF = await kgFactor(tx);
  let normalLossMass = 0;
  let abnormalLossMass = 0;
  for (const l of losses) {
    if (!l.uom_id)
      throw new BusinessRuleError("وحدة الفاقد يجب أن تكون وحدة كتلة معرفة مثل كجم أو جرام");
    const unit = await readUnit(tx, l.uom_id);
    if (!unit || unit.dimensionCode !== "MASS" || unit.factorToReference === null || kgF === null) {
      throw new BusinessRuleError("وحدة الفاقد يجب أن تكون وحدة كتلة معرفة مثل كجم أو جرام");
    }
    const mass = roundN((l.quantity * unit.factorToReference) / kgF, 6);
    if (mass <= 0) throw new BusinessRuleError("كمية الفاقد يجب أن تكون موجبة");
    const lossType = String(l.loss_type ?? "").toUpperCase();
    if (lossType === "NORMAL") normalLossMass += mass;
    else if (lossType === "ABNORMAL") abnormalLossMass += mass;
    else throw new BusinessRuleError("نوع الفاقد غير معروف");
    await insertProductionLoss(tx, {
      orderId: order.id,
      lossType,
      quantity: l.quantity,
      uomId: l.uom_id,
      massKg: mass,
      reason: (l.reason ?? "").trim(),
    });
  }

  // ── النواتج ──
  const outputCount = input.outputs.length;
  let outputIndex = 0;
  let totalOutputMass = 0;
  let outputMassComplete = true;
  for (const o of input.outputs) {
    outputIndex += 1;
    const product = await lockProductForShare(tx, o.product_id);
    if (
      !product ||
      product.itemClass === null ||
      !["FINISHED_GOOD", "BY_PRODUCT"].includes(product.itemClass) ||
      product.itemNature === "SERVICE" ||
      (await itemEffectivePolicy(tx, product.id)) !== "TRACKED" ||
      product.isSellable !== true
    ) {
      throw new BusinessRuleError(
        "الناتج يجب أن يكون منتجاً تاماً أو ناتجاً جانبياً مملوكاً ومخزونياً ومتاحاً للبيع",
      );
    }
    if (product.tracking === "SERIAL") {
      throw new BusinessRuleError("لا يدعم مسار الإنتاج حالياً تتبع الناتج التسلسلي");
    }
    const baseQty = await productionQuantityInBase(tx, product.id, o.quantity, o.uom_id ?? null);
    const factor = baseQty / o.quantity;
    if (baseQty !== roundN(baseQty, 3)) {
      throw new BusinessRuleError("كمية الناتج تتجاوز دقة المخزون 0.001");
    }
    const mass = await productionMassInKg(tx, product.id, baseQty);
    if (mass === null) outputMassComplete = false;
    else totalOutputMass += mass;
    let batchNumber = (o.batch_number ?? "").trim() || null;
    const expiry = o.expiry_date ?? null;
    if (product.tracking === "BATCH") {
      if (batchNumber === null)
        batchNumber = `${order.orderNumber}-${String(outputIndex).padStart(2, "0")}`;
      if (product.trackExpiry === true && expiry === null) {
        throw new BusinessRuleError(`تاريخ الانتهاء مطلوب للناتج ${product.nameAr}`);
      }
    } else if (batchNumber !== null || expiry !== null) {
      throw new BusinessRuleError("بيانات الدفعة لا تقبل لناتج غير متتبع بالدفعات");
    }
    await insertProductionOutput(tx, {
      orderId: order.id,
      productId: product.id,
      enteredQuantity: o.quantity,
      uomId: o.uom_id ?? null,
      baseUomId: product.baseUomId ?? product.unitId,
      uomConversionFactor: factor,
      baseQuantity: baseQty,
      massKg: mass,
      allocationValuePerBase: Math.max(num(o.allocation_value_per_base) ?? 0, 0),
      inventoryAccountCode: productionInventoryAccountCode(product.itemClass),
      batchNumber,
      expiryDate: expiry,
    });
  }

  // ── ميزان الكتلة (013 حرفيًا) ──
  if (inputMassComplete && outputMassComplete && totalInputMass > 0) {
    const expectedMass = totalOutputMass + normalLossMass + abnormalLossMass;
    if (Math.abs(totalInputMass - expectedMass) > 0.01) {
      throw new BusinessRuleError(
        `ميزان الكتلة غير متزن: مواد خام ${roundN(totalInputMass, 3)} كجم مقابل نواتج وفاقد ${roundN(expectedMass, 3)} كجم`,
      );
    }
  }
  if (abnormalLossMass > 0 && (!inputMassComplete || totalInputMass <= 0)) {
    throw new BusinessRuleError("يجب تعريف مكافئ كتلي للمواد الخام قبل تحميل الفاقد غير الطبيعي");
  }

  const totalWip = roundN(totalMaterialCost + totalConversionCost, 2);
  if (totalWip <= 0) {
    throw new BusinessRuleError("لا يمكن إقفال تشغيلة بلا تكلفة مواد أو تحويل مسجلة");
  }
  let abnormalCost = 0;
  if (abnormalLossMass > 0) {
    if (abnormalLossMass > totalInputMass) {
      throw new BusinessRuleError("الفاقد غير الطبيعي يتجاوز كتلة المواد الخام");
    }
    abnormalCost = roundN((totalWip * abnormalLossMass) / totalInputMass, 2);
  }

  // ── توزيع التكلفة على المخرجات (قيمة البيع التقديرية) ──
  if (outputCount > 1) {
    const outputs = await listOutputsWithTracking(tx, order.id);
    if (outputs.some((o) => o.allocationValuePerBase <= 0)) {
      throw new BusinessRuleError(
        "أدخل قيمة بيع تقديرية لوحدة الأساس لكل ناتج لتوزيع تكلفة التشغيل",
      );
    }
  }
  let remainingWip = roundN(totalWip - abnormalCost, 2);
  const outputsForAllocation = await listOutputsWithTracking(tx, order.id);
  for (let i = 0; i < outputsForAllocation.length; i++) {
    const o = outputsForAllocation[i];
    let allocated: number;
    if (i === outputCount - 1) {
      allocated = remainingWip;
    } else if (outputCount === 1) {
      allocated = remainingWip;
    } else {
      const weight = o.baseQuantity * o.allocationValuePerBase;
      const totalWeight = outputsForAllocation.reduce(
        (s, x) => s + x.baseQuantity * x.allocationValuePerBase,
        0,
      );
      allocated = roundN(((totalWip - abnormalCost) * weight) / totalWeight, 2);
    }
    await updateOutputAllocation(tx, {
      outputId: o.id,
      allocatedCost: allocated,
      unitCost: o.baseQuantity > 0 ? allocated / o.baseQuantity : 0,
    });
    remainingWip = roundN(remainingWip - allocated, 2);
  }

  // ── استلام النواتج عبر محرك التقييم نفسه (المشتريات) ──
  let actualOutputTotal = 0;
  for (const o of await listOutputsWithTracking(tx, order.id)) {
    const product = await readProduct(tx, o.productId);
    if (!product) throw new BusinessRuleError("الناتج غير موجود");
    await postStockDelta(tx, {
      productId: o.productId,
      warehouseId: order.warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: o.baseQuantity,
      unitCost: o.unitCost,
      movementKind: "RECEIPT",
      sourceType: "production_output",
      sourceId: o.id,
      note: `استلام ناتج تشغيلة ${order.orderNumber}`,
      actorId: userId,
      movementTypeLegacy: "production_in",
    });
    const movement = await latestMovementForSource(tx, "production_output", o.id);
    if (!movement) throw new BusinessRuleError("لم تُسجل حركة استلام الناتج");
    let batchId: string | null = null;
    if (product.tracking === "BATCH") {
      batchId = await insertOutputBatch(tx, {
        productId: o.productId,
        warehouseId: order.warehouseId,
        batchNumber: o.batchNumber ?? "",
        expiryDate: o.expiryDate,
        quantity: o.baseQuantity,
        unitCost: o.baseQuantity > 0 ? roundN(movement.totalCost / o.baseQuantity, 4) : 0,
        note: `ناتج تشغيلة ${order.orderNumber}`,
        createdBy: userId,
      });
    }
    await updateOutputAfterReceipt(tx, {
      outputId: o.id,
      movementId: movement.id,
      batchId,
      actualStockCost: movement.totalCost,
    });
    actualOutputTotal += movement.totalCost;
  }

  // ── إقفال WIP والاعتراف بالمخزون (القيود النهائية) ──
  const finalLines: Array<{ account_code: string; debit?: number; credit?: number; memo: string }> =
    [];
  for (const g of await materialAccountTotals(tx, order.id, "actual_stock_cost", "outputs")) {
    finalLines.push({
      account_code: g.code,
      debit: g.amount,
      memo: `استلام ناتج تشغيلة ${order.orderNumber}`,
    });
  }
  if (abnormalCost > 0) {
    finalLines.push({
      account_code: "5911",
      debit: abnormalCost,
      memo: `فاقد إنتاج غير طبيعي - ${order.orderNumber}`,
    });
  }
  const variance = roundN(totalWip - actualOutputTotal - abnormalCost, 2);
  if (variance > 0) {
    finalLines.push({
      account_code: "5911",
      debit: variance,
      memo: `فرق تقريب تكلفة استلام الإنتاج - ${order.orderNumber}`,
    });
  } else if (variance < 0) {
    finalLines.push({
      account_code: "5911",
      credit: Math.abs(variance),
      memo: `فرق تقريب تكلفة استلام الإنتاج - ${order.orderNumber}`,
    });
  }
  finalLines.push({
    account_code: "1312",
    credit: totalWip,
    memo: `إقفال الإنتاج تحت التنفيذ - ${order.orderNumber}`,
  });
  await postJournalEntryWithNumber(tx, session, {
    entryDate: order.productionDate,
    memo: `إقفال تشغيلة إنتاج ${order.orderNumber}`,
    sourceType: "production_completion",
    sourceId: order.id,
    entryNumber: `JE-PO-${order.orderNumber}`,
    lines: finalLines,
  });

  await updateOrderPosted(tx, {
    orderId: order.id,
    materialCost: roundN(totalMaterialCost, 2),
    conversionCost: roundN(totalConversionCost, 2),
    totalCost: totalWip,
    outputCost: roundN(actualOutputTotal, 2),
    abnormalLossCost: abnormalCost,
    completedBy: userId,
  });
  return order.id;
}

async function loadBatchSettingsLocal(tx: PoolClient): Promise<{
  strategy: string;
  preventExpired: boolean;
}> {
  const { rows } = await tx.query<{ s: string | null; p: boolean | null }>(
    `SELECT coalesce(cs.batch_settings, '{}'::jsonb) ->> 'dispatch_strategy' AS s,
            (coalesce(cs.batch_settings, '{}'::jsonb) ->> 'prevent_selling_expired')::boolean AS p
       FROM public.company_settings cs LIMIT 1`,
  );
  let strategy = rows[0]?.s ?? "FEFO";
  if (!["FEFO", "FIFO", "MANUAL"].includes(strategy)) strategy = "FEFO";
  return { strategy, preventExpired: rows[0]?.p ?? true };
}

async function updateOutputAllocation(
  tx: PoolClient,
  args: { outputId: string; allocatedCost: number; unitCost: number },
): Promise<void> {
  await tx.query(
    "UPDATE public.production_order_outputs SET allocated_cost = $2::numeric, unit_cost = $3::numeric WHERE id = $1::uuid",
    [args.outputId, args.allocatedCost, args.unitCost],
  );
}

async function readEntryReference(tx: PoolClient, entryId: string): Promise<string | null> {
  const { rows } = await tx.query<{ reference: string }>(
    "SELECT reference FROM public.expense_entries WHERE id = $1::uuid",
    [entryId],
  );
  return rows[0]?.reference ?? null;
}

/** create_and_post_production_order (013 حرفيًا). */
export async function createAndPostProductionOrderInner(
  tx: PoolClient,
  session: ServerSession,
  input: {
    warehouseId: string;
    costCenterId: string;
    productionDate?: string | null;
    notes?: string | null;
    materials: ProductionMaterialPayload[];
    outputs: ProductionOutputPayload[];
    expenses?: ProductionExpensePayload[];
    losses?: ProductionLossPayload[];
  },
): Promise<string> {
  const orderId = await createProductionOrderInner(tx, session, input);
  await completeProductionOrderInner(tx, session, { ...input, orderId });
  return orderId;
}

// ── reverse_production_order (013 حرفيًا) ───────────────────────────────────

export async function reverseProductionOrderInner(
  tx: PoolClient,
  session: ServerSession,
  input: { orderId: string; reason: string },
): Promise<string> {
  const userId = session.userId;
  const staff = await isStaff(tx, userId);
  const roleOk =
    (await hasRole(tx, userId, "owner")) ||
    (await hasRole(tx, userId, "manager")) ||
    (await hasRole(tx, userId, "accountant"));
  if (!staff || !roleOk) {
    throw new AuthorizationError("عكس تشغيلة الإنتاج يتطلب صلاحية المالك أو المدير أو المحاسب");
  }
  if ((input.reason ?? "").trim().length < 3) {
    throw new BusinessRuleError("اكتب سببًا واضحًا لعكس التشغيلة");
  }

  const order = await lockProductionOrder(tx, input.orderId);
  if (!order) throw new BusinessRuleError("تشغيلة الإنتاج غير موجودة");
  if (order.status !== "POSTED" || order.completedAt === null) {
    throw new BusinessRuleError("لا يمكن عكس إلا تشغيلة إنتاج مرحلة وغير معكوسة");
  }

  if (await orderReproducesOwnInput(tx, order.id)) {
    throw new BusinessRuleError("لا يمكن عكس تشغيلة تعيد إنتاج الصنف نفسه المستخدم كمدخل");
  }

  const outputs = await listOutputsWithTracking(tx, order.id);

  // بوّابة الأثر اللاحق (013): قبل أي عكس مادي.
  for (const o of outputs) {
    if (await outputHasDownstreamUse(tx, o.id)) {
      throw new BusinessRuleError(
        `لا يمكن عكس التشغيلة ${order.orderNumber}: الناتج ${o.productId} استُخدم في حركة لاحقة`,
      );
    }
  }

  // كل ناتج بدأ من رصيد صفري ولا توجد حركة لاحقة له.
  for (const o of outputs) {
    if (o.stockMovementId === null) {
      throw new BusinessRuleError(
        `حركة ناتج التشغيلة ${o.productId} غير موجودة؛ لا يمكن العكس بأمان`,
      );
    }
    const first = await firstCostTransactionForOutput(tx, {
      orderId: order.id,
      productId: o.productId,
      warehouseId: order.warehouseId,
    });
    if (!first || first.quantityBefore !== 0 || first.valueBefore !== 0) {
      throw new BusinessRuleError(
        `لا يمكن عكس الناتج ${o.productId} لأن له رصيدًا سابقًا عند الترحيل`,
      );
    }
    const orderSourceIds = outputs.filter((x) => x.productId === o.productId).map((x) => x.id);
    if (
      await laterMovementExistsForProduct(tx, {
        productId: o.productId,
        warehouseId: order.warehouseId,
        after: order.completedAt,
        excludeSourceTypes: ["production_output"],
        excludeSourceIds: orderSourceIds,
      })
    ) {
      throw new BusinessRuleError(
        `تعذر عكس الناتج ${o.productId} لوجود حركة مخزون لاحقة؛ عالج الحركة اللاحقة أولًا`,
      );
    }
    const invQty = await lockInventoryQuantity(tx, {
      productId: o.productId,
      warehouseId: order.warehouseId,
    });
    const expected = await expectedOutputTotalsForProduct(tx, {
      orderId: order.id,
      productId: o.productId,
    });
    if (Math.abs(invQty - expected.qty) > 0.001) {
      throw new BusinessRuleError(
        `رصيد الناتج ${o.productId} تغير بعد التشغيلة؛ لا يمكن العكس بأمان`,
      );
    }
    const layer = await lockCostLayerState(tx, {
      productId: o.productId,
      warehouseId: order.warehouseId,
    });
    if (
      Math.abs(layer.qty - expected.qty) > 0.001 ||
      Math.abs(layer.value - expected.value) > 0.011
    ) {
      throw new BusinessRuleError(`طبقة تكلفة الناتج ${o.productId} تغيرت؛ لا يمكن العكس بأمان`);
    }
    if (o.tracking === "BATCH") {
      if (
        o.batchId === null ||
        !(await outputBatchStillIntact(tx, {
          batchId: o.batchId,
          baseQuantity: o.baseQuantity,
          completedAt: order.completedAt,
        }))
      ) {
        throw new BusinessRuleError(
          `دفعة الناتج ${o.productId} تغيرت بعد الترحيل؛ لا يمكن العكس بأمان`,
        );
      }
    }
  }

  // المدخلات أيضًا غير مماسة منذ الترحيل.
  const materials = await listMaterials(tx, order.id);
  for (const m of materials) {
    if (m.stockMovementId === null) {
      throw new BusinessRuleError(`حركة صرف المادة ${m.productId} غير موجودة؛ لا يمكن العكس بأمان`);
    }
    if (
      await laterMovementExistsForProduct(tx, {
        productId: m.productId,
        warehouseId: order.warehouseId,
        after: order.completedAt,
        excludeSourceTypes: ["production_material"],
        excludeSourceIds: materials.map((x) => x.id),
      })
    ) {
      throw new BusinessRuleError(
        `تعذر رد المادة ${m.productId} لوجود حركة مخزون لاحقة؛ عالج الحركة اللاحقة أولًا`,
      );
    }
    if (
      await materialBatchesTouchedAfter(tx, {
        materialId: m.id,
        completedAt: order.completedAt,
      })
    ) {
      throw new BusinessRuleError(
        `دفعة المادة ${m.productId} تغيرت بعد الترحيل؛ لا يمكن العكس بأمان`,
      );
    }
    await lockInventoryQuantity(tx, { productId: m.productId, warehouseId: order.warehouseId });
  }

  // بوّابة المصروف المشترك — نفس شرط المشغل الأصلي.
  if (await sharedAllocatedExpenseBlocksReversal(tx, order.id)) {
    throw new BusinessRuleError(
      "لا يمكن عكس التشغيلة: أحد مصروفاتها محمّل على أمر إنتاج آخر غير معكوس",
    );
  }

  // عكس استلام النواتج أولًا ثم رد المواد الخام.
  const reversedOutputs = await listOutputsReversed(tx, order.id);
  for (const o of reversedOutputs) {
    await postStockDelta(tx, {
      productId: o.productId,
      warehouseId: order.warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: -o.baseQuantity,
      unitCost: null,
      movementKind: "PRODUCTION",
      sourceType: "production_reversal_output",
      sourceId: o.id,
      note: `عكس ناتج تشغيلة ${order.orderNumber}: ${input.reason.trim()}`,
      actorId: userId,
      movementTypeLegacy: "production_out",
    });
    if (o.batchId !== null) {
      await zeroBatchWithNote(tx, {
        batchId: o.batchId,
        note: `عكس تشغيلة ${order.orderNumber}: ${input.reason.trim()}`,
      });
    }
  }

  for (const m of materials) {
    await postStockDelta(tx, {
      productId: m.productId,
      warehouseId: order.warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: m.baseQuantity,
      unitCost: m.baseQuantity > 0 ? m.totalCost / m.baseQuantity : 0,
      movementKind: "PRODUCTION",
      sourceType: "production_reversal_material",
      sourceId: m.id,
      note: `رد مادة تشغيلة ${order.orderNumber}: ${input.reason.trim()}`,
      actorId: userId,
      movementTypeLegacy: "production_in",
    });
  }

  await restoreBatchQuantities(tx, order.id);

  // عكس القيود عبر محرك المرحلة 9 (الأصل عبر reverse_journal_entry).
  const { reverseJournalEntryInner } = await import("@/server/domains/accounting");
  const journals = (await listReversibleJournals(tx, order.id)).sort(
    (a, b) => a.rank - b.rank || 0,
  );
  for (const j of journals) {
    await reverseJournalEntryInner(tx, session, {
      entryId: j.id,
      reason: `عكس تشغيلة ${order.orderNumber}: ${input.reason.trim()}`,
    });
  }

  await markOrderReversed(tx, {
    orderId: order.id,
    userId,
    reason: input.reason.trim(),
  });
  await insertConversionAudit(tx, {
    actorId: userId,
    action: "production.order_reversed",
    entityType: "production_order",
    entityId: order.id,
    payload: { order_number: order.orderNumber, reason: input.reason.trim() },
  });
  return order.id;
}

// ── smart_manufacture (013 حرفيًا — الصيغة الموسعة 6 معاملات) ──────────────

export interface SmartManufacturePayload {
  warehouseId: string;
  grainItemId: string;
  grainQty: number;
  grainUomId?: string | null;
  outputs: Array<{ item_id: string; qty: number; uom_id?: string | null }>;
  notes?: string | null;
}

export async function smartManufactureInner(
  tx: PoolClient,
  session: ServerSession,
  input: SmartManufacturePayload,
): Promise<string> {
  const userId = session.userId;
  if (!(await canOperateMilling(tx, userId))) {
    throw new AuthorizationError("You are not permitted to run smart manufacture");
  }
  if (!input.warehouseId || !input.grainItemId) {
    throw new BusinessRuleError("Warehouse and grain item are required");
  }
  if ((input.grainQty ?? 0) <= 0) {
    throw new BusinessRuleError("Grain quantity must be positive");
  }
  const rawOutputs = (input.outputs ?? []) as Array<{
    item_id: string;
    qty: number;
    uom_id?: string | null;
  }>;
  if (!Array.isArray(rawOutputs) || rawOutputs.length === 0) {
    throw new BusinessRuleError("At least one output line is required");
  }
  if ((input.notes ?? "").length > 2000) {
    throw new BusinessRuleError("ملاحظات التصنيع طويلة جداً (الحد 2000 محرف)");
  }

  const grain = await readProduct(tx, input.grainItemId);
  if (!grain || grain.itemClass !== "RAW_MATERIAL" || grain.isActive !== true) {
    throw new BusinessRuleError("Input must be an active RAW_MATERIAL grain");
  }
  if (grain.isCustodyItem === true || grain.inventoryPolicy === "CUSTOMER_OWNED") {
    throw new BusinessRuleError(
      "حبوب العميل المملوكة له لا تُصنَّع هنا؛ استخدم مسار العهدة وخدمة الطحن",
    );
  }
  if ((await itemEffectivePolicy(tx, grain.id)) !== "TRACKED") {
    throw new BusinessRuleError("القمح المستخدم في التصنيع يجب أن يكون صنفاً مخزونياً متتابعاً");
  }
  const costingMethod = await companyCostingMethodOrThrow(tx);
  if (costingMethod !== "MOVING_AVERAGE") {
    throw new BusinessRuleError(
      `ترحيل الإنتاج متوقف: طريقة التكلفة المحفوظة (${costingMethod}) غير مدعومة لهذا المسار`,
    );
  }

  const outputCount = rawOutputs.length;
  const grainBaseQty = await productionQuantityInBase(
    tx,
    grain.id,
    input.grainQty,
    input.grainUomId ?? null,
  );

  // مادة القمح موجودة فعلًا بكميتها المحوّلة في مخزون الشركة (FOR UPDATE).
  const available = await lockInventoryQuantity(tx, {
    productId: grain.id,
    warehouseId: input.warehouseId,
  });
  if (available < grainBaseQty) {
    throw new BusinessRuleError(
      `رصيد القمح غير كافٍ: المطلوب ${roundN(grainBaseQty, 3)} وحدة أساس والمتاح ${roundN(available, 3)}`,
    );
  }

  const grainMassKg = await productionMassInKg(tx, grain.id, grainBaseQty);
  let allMass = grainMassKg !== null;
  let outputMassKg = 0;
  let outputValue = 0;

  interface ValidatedOutput {
    productId: string;
    qty: number;
    uomId: string | null;
    baseQty: number;
    weight: number;
    itemClass: string;
    name: string;
  }
  const validated: ValidatedOutput[] = [];
  for (const r of rawOutputs) {
    if (!r.item_id || (r.qty ?? 0) <= 0) {
      throw new BusinessRuleError("Every output line needs an item and a positive quantity");
    }
    const product = await readProduct(tx, r.item_id);
    if (
      !product ||
      !["FINISHED_GOOD", "BY_PRODUCT"].includes(product.itemClass ?? "") ||
      product.isActive !== true
    ) {
      throw new BusinessRuleError("Outputs must be FINISHED_GOOD or BY_PRODUCT items");
    }
    if (product.isCustodyItem === true || product.inventoryPolicy === "CUSTOMER_OWNED") {
      throw new BusinessRuleError("ناتج التصنيع لا يمكن أن يكون صنفاً مملوكاً للعميل");
    }
    // فحص الملكية تم أعلاه؛ هنا فقط سياسة المخزون الفعالة (نفس الأصل).
    if (
      product.inventoryPolicy === "CUSTOMER_OWNED" ||
      (await itemEffectivePolicy(tx, product.id)) !== "TRACKED"
    ) {
      throw new BusinessRuleError("ناتج التصنيع يجب أن يكون مخزنياً متتبعاً للشركة");
    }
    const baseQty = await productionQuantityInBase(tx, product.id, r.qty, r.uom_id ?? null);
    const mass = await productionMassInKg(tx, product.id, baseQty);
    if (mass === null) allMass = false;
    else outputMassKg += mass;
    const weight = baseQty * (product.salePrice ?? 0);
    outputValue += weight;
    validated.push({
      productId: product.id,
      qty: r.qty,
      uomId: r.uom_id ?? null,
      baseQty,
      weight,
      itemClass: product.itemClass ?? "FINISHED_GOOD",
      name: product.nameAr ?? product.name ?? "",
    });
  }

  if (outputValue <= 0) {
    throw new BusinessRuleError("Outputs must have sale prices to allocate cost by relative value");
  }

  const grainCost = await grainUnitCost(tx, {
    productId: grain.id,
    warehouseId: input.warehouseId,
    costPrice: grain.costPrice ?? 0,
  });

  const totalInputCost = roundN(grainBaseQty * grainCost, 2);
  const docId = await newDocId(tx);
  const ref = await nextMillingServiceRef(tx, "SM-");

  if (!allMass || grainMassKg === null) {
    throw new BusinessRuleError(
      "لا يمكن احتساب الفاقد: تعريف كتلي مفقود لأحد الأصناف. اضبط وحدة كتلة الأساس أو وزن العبوة",
    );
  }
  if (outputMassKg > grainMassKg) {
    throw new BusinessRuleError(
      `Total output mass (${roundN(outputMassKg, 3)}) cannot exceed input grain mass (${roundN(grainMassKg, 3)})`,
    );
  }
  const wasteMassKg = Math.max(0, grainMassKg - outputMassKg);
  const wasteCost = wasteMassKg > 0 && grainCost > 0 ? roundN(wasteMassKg * grainCost, 2) : 0;
  const allocatableCost = Math.max(0, totalInputCost - wasteCost);
  if (allocatableCost <= 0) {
    throw new BusinessRuleError("لا يمكن ترحيل تصنيع بلا تكلفة قابلة للتوزيع");
  }

  await postStockDelta(tx, {
    productId: grain.id,
    warehouseId: input.warehouseId,
    ownerType: "COMPANY",
    ownerId: null,
    signedQty: -grainBaseQty,
    unitCost: grainCost,
    movementKind: "PRODUCTION",
    sourceType: "smart_manufacture",
    sourceId: docId,
    note: `تصنيع ذكي ${ref}${input.notes ? " — " + input.notes : ""}`,
    actorId: userId,
    movementTypeLegacy: "production_out",
  });

  const journalLines: Array<{
    account_code: string;
    debit?: number;
    credit?: number;
    memo: string;
  }> = [];
  let totalAllocated = 0;
  let lineIdx = 0;
  for (const v of validated) {
    lineIdx += 1;
    let lineAllocated: number;
    if (lineIdx === outputCount) {
      lineAllocated = allocatableCost - totalAllocated;
    } else {
      lineAllocated = roundN((allocatableCost * v.weight) / outputValue, 2);
      totalAllocated += lineAllocated;
    }
    const unitCost = roundN(lineAllocated / (v.baseQty === 0 ? NaN : v.baseQty) || 0, 4) || 0;

    await postStockDelta(tx, {
      productId: v.productId,
      warehouseId: input.warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: v.baseQty,
      unitCost,
      movementKind: "RECEIPT",
      sourceType: "smart_manufacture",
      sourceId: docId,
      note: `تصنيع ذكي ${ref}${input.notes ? " — " + input.notes : ""}`,
      actorId: userId,
      movementTypeLegacy: "production_in",
    });

    const acctCode = v.itemClass === "BY_PRODUCT" ? "1314" : "1313";
    if (lineAllocated > 0) {
      journalLines.push({
        account_code: acctCode,
        debit: lineAllocated,
        memo: `إنتاج مخزون ${v.name} (${ref})`,
      });
    }
  }

  if (wasteCost > 0) {
    journalLines.push({
      account_code: "5921",
      debit: wasteCost,
      memo: `فاقد وتلف تشغيلي مطحنة (${ref})`,
    });
  }
  journalLines.push({
    account_code: "1311",
    credit: totalInputCost,
    memo: `سحب قمح خام للتصنيع (${ref})`,
  });

  await postJournalEntryWithNumber(tx, session, {
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `تصنيع ذكي ${ref}${input.notes ? " — " + input.notes : ""}`,
    sourceType: "smart_manufacture",
    sourceId: docId,
    entryNumber: await nextJournalNumberForSmart(tx),
    lines: journalLines,
  });

  await insertConversionAudit(tx, {
    actorId: userId,
    action: "manufacture.smart",
    entityType: "stock_movement",
    entityId: docId,
    payload: {
      doc_id: docId,
      ref,
      warehouse_id: input.warehouseId,
      grain_item_id: grain.id,
      grain_entered_qty: input.grainQty ?? 0,
      grain_uom_id: input.grainUomId ?? null,
      grain_base_qty: grainBaseQty,
      grain_mass_kg: grainMassKg,
      grain_unit_cost: grainCost,
      output_mass_kg: outputMassKg,
      waste_mass_kg: wasteMassKg,
      waste_cost: wasteCost,
      total_cost: totalInputCost,
      outputs: rawOutputs,
      allocation: "RELATIVE_SALES_VALUE",
      uom_normalized: "BASE_UOM",
      waste_basis: "MASS_KG",
    },
  });
  return ref;
}

async function nextJournalNumberForSmart(tx: PoolClient): Promise<string> {
  // الأصل يترك create_journal_entry يولّد JE-YYYYMMDD ثم لا يفرض رقمًا صريحًا.
  // نحاكي ذلك بتسلسل عام للأرشفة اليدوية عبر next_journal_number من القاعدة
  // (نفس الدالة التي يستخدمها محرك 9 داخليًا).
  const { rows } = await tx.query<{ n: string }>(
    `SELECT 'JE-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
            lpad(nextval('public.journal_number_seq')::text, 4, '0') AS n`,
  );
  return rows[0].n;
}

async function newDocId(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ id: string }>("SELECT gen_random_uuid()::text AS id");
  return rows[0].id;
}

/** مغلّف smart_manufacture(jsonb) — نفس مفاتيح الواجهة (_...). */
export async function smartManufacturePayloadInner(
  tx: PoolClient,
  session: ServerSession,
  payload: Json,
): Promise<string> {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new BusinessRuleError("حمولة التصنيع الذكي يجب أن تكون كائناً JSON");
  }
  const warehouseId = str(payload["_warehouse_id"]);
  const grainItemId = str(payload["_grain_item_id"]);
  const grainQty = num(payload["_grain_qty"]);
  const outputs = payload["_outputs"];
  const notes = str(payload["_notes"]);
  const grainUomId = str(payload["_grain_uom_id"]);
  if (!warehouseId || !grainItemId || grainQty === null) {
    throw new BusinessRuleError("الحقول _warehouse_id و_grain_item_id و_grain_qty مطلوبة");
  }
  return smartManufactureInner(tx, session, {
    warehouseId,
    grainItemId,
    grainQty,
    outputs: asArray(outputs, "At least one output line is required") as never,
    notes,
    grainUomId,
  });
}

// ── convert_stock (013 حرفيًا) ─────────────────────────────────────────────

export interface ConvertStockPayload {
  warehouseId: string;
  sourceItemId: string;
  sourceQty: number;
  outputs: Array<{ item_id: string; qty: number }>;
  lossQty?: number | null;
  notes?: string | null;
}

export async function convertStockInner(
  tx: PoolClient,
  session: ServerSession,
  input: ConvertStockPayload,
): Promise<string> {
  const userId = session.userId;
  if (!(await canOperateMilling(tx, userId))) {
    throw new AuthorizationError("You are not permitted to run stock conversions");
  }
  if (!input.warehouseId || !input.sourceItemId) {
    throw new BusinessRuleError("Warehouse and source item are required");
  }
  if ((input.sourceQty ?? 0) <= 0) {
    throw new BusinessRuleError("Source quantity must be positive");
  }
  const outputs = (input.outputs ?? []) as Array<{ item_id: string; qty: number }>;
  if (!Array.isArray(outputs) || outputs.length === 0) {
    throw new BusinessRuleError("At least one output line is required");
  }
  const lossQty = input.lossQty ?? 0;
  if (lossQty < 0) throw new BusinessRuleError("Loss quantity cannot be negative");

  const source = await readProduct(tx, input.sourceItemId);
  if (!source || source.isActive !== true) {
    throw new BusinessRuleError("Source item is not an active product");
  }
  if (
    source.isCustodyItem === true ||
    source.inventoryPolicy === "CUSTOMER_OWNED" ||
    (await itemEffectivePolicy(tx, source.id)) !== "TRACKED"
  ) {
    throw new BusinessRuleError(
      "التحويل المخزني للشركة فقط؛ أصناف عهدة العميل لا تتحول إلى مخزون مملوك",
    );
  }

  let totalOutputQty = 0;
  for (const r of outputs) {
    if (!r.item_id || (r.qty ?? 0) <= 0) {
      throw new BusinessRuleError("Every output line needs an item and a positive quantity");
    }
    const product = await readProduct(tx, r.item_id);
    if (!product || product.isActive !== true) {
      throw new BusinessRuleError(`Output item ${r.item_id} is not an active product`);
    }
    if (product.isCustodyItem === true || product.inventoryPolicy === "CUSTOMER_OWNED") {
      throw new BusinessRuleError("ناتج التحويل لا يمكن أن يكون صنف أمانة عميل");
    }
    totalOutputQty += r.qty ?? 0;
  }
  if (totalOutputQty + lossQty !== input.sourceQty) {
    throw new BusinessRuleError(
      `Outputs + loss (${totalOutputQty + lossQty}) must equal the source quantity (${input.sourceQty})`,
    );
  }

  const docId = await newDocId(tx);
  const ref = await nextMillingServiceRef(tx, "CV-");

  await postStockDelta(tx, {
    productId: source.id,
    warehouseId: input.warehouseId,
    ownerType: "COMPANY",
    ownerId: null,
    signedQty: -input.sourceQty,
    unitCost: null,
    movementKind: "PRODUCTION",
    sourceType: "stock_conversion",
    sourceId: docId,
    note: `تحويل مخزون ${ref}${input.notes ? " — " + input.notes : ""}`,
    actorId: userId,
    movementTypeLegacy: "production_out",
  });

  for (const r of outputs) {
    await postStockDelta(tx, {
      productId: r.item_id,
      warehouseId: input.warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: r.qty,
      unitCost: null,
      movementKind: "PRODUCTION",
      sourceType: "stock_conversion",
      sourceId: docId,
      note: `تحويل مخزون ${ref}${input.notes ? " — " + input.notes : ""}`,
      actorId: userId,
      movementTypeLegacy: "production_in",
    });
  }

  await insertConversionAudit(tx, {
    actorId: userId,
    action: "stock.conversion",
    entityType: "stock_movements",
    entityId: docId,
    payload: {
      doc_id: docId,
      ref,
      warehouse_id: input.warehouseId,
      source_item_id: input.sourceItemId,
      source_qty: input.sourceQty ?? 0,
      outputs,
      loss_qty: lossQty ?? 0,
      cost_model: "FIXED_MANUAL — no allocation, no journal",
      notes: input.notes ?? null,
    },
  });
  return ref;
}

// ── القراءة (013 حرفيًا) ───────────────────────────────────────────────────

export async function productionOrderHistory(
  session: ServerSession,
  limit?: number | null,
): Promise<unknown[]> {
  return withTransaction({ rollback: true }, async (tx) => {
    if (!(await isStaff(tx, session.userId))) {
      throw new AuthorizationError("ليس لديك صلاحية قراءة سجل الإنتاج");
    }
    const vLimit = Math.min(Math.max(limit ?? 250, 1), 500);
    const { rows } = await tx.query(
      `SELECT o.id::text, o.order_number, o.production_date::text, o.status,
              o.warehouse_id::text, o.cost_center_id::text, o.material_cost::text,
              o.conversion_cost::text, o.total_cost::text, o.output_cost::text,
              o.abnormal_loss_cost::text, o.notes,
              o.completed_at, o.reversed_at, o.reversal_reason
         FROM public.production_orders o
        ORDER BY o.created_at DESC
        LIMIT $1`,
      [vLimit],
    );
    return rows;
  });
}

export async function productionCostSources(session: ServerSession): Promise<unknown[]> {
  return withTransaction({ rollback: true }, async (tx) => {
    if (!(await canReadFinance(tx, session.userId))) {
      throw new AuthorizationError("لا تتوفر صلاحية قراءة مصروفات الإنتاج");
    }
    const { rows } = await tx.query(
      `SELECT l.id::text AS expense_line_id, e.id::text AS expense_entry_id, e.reference,
              e.expense_date::text, coalesce(l.description, e.description, 'مصروف') AS description,
              coalesce(c.name_ar, c.name, 'مصروف') AS category_name,
              coalesce(l.cost_center_id, e.cost_center_id)::text AS cost_center_id,
              a.code, l.net_amount::text,
              coalesce(sum(pa.amount), 0)::text AS allocated_amount,
              greatest(l.net_amount - coalesce(sum(pa.amount), 0), 0)::text AS available_amount
         FROM public.expense_lines l
         JOIN public.expense_entries e ON e.id = l.entry_id
         JOIN public.expense_categories c
           ON c.id = l.category_id AND c.production_cost_eligible AND c.is_active
         JOIN public.accounts a ON a.id = c.account_id AND a.account_type::text = 'EXPENSE'
           AND a.is_active AND a.is_postable
         LEFT JOIN public.production_order_cost_allocations pa ON pa.expense_line_id = l.id
        WHERE e.status::text IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED')
          AND l.net_amount > 0
        GROUP BY l.id, e.id, e.reference, e.expense_date, l.description, e.description,
                 c.name_ar, c.name, l.cost_center_id, e.cost_center_id, a.code, l.net_amount
       HAVING l.net_amount - coalesce(sum(pa.amount), 0) > 0
        ORDER BY e.expense_date DESC, e.reference, l.line_no`,
    );
    return rows;
  });
}

export async function productionOrderCostCheck(
  session: ServerSession,
  orderId: string,
): Promise<Json> {
  return withTransaction({ rollback: true }, async (tx) => {
    if (!(await isStaff(tx, session.userId))) {
      throw new AuthorizationError("ليس لديك صلاحية قراءة أمر الإنتاج");
    }
    const order = await readProductionOrder(tx, orderId);
    if (!order) throw new BusinessRuleError("أمر الإنتاج غير موجود");
    const variance = roundN(order.totalCost - order.outputCost - order.abnormalLossCost, 2);
    return {
      order_id: order.id,
      status: order.status,
      material_cost: order.materialCost,
      conversion_cost: order.conversionCost,
      wip_total: order.totalCost,
      wip_from_parts: roundN(order.materialCost + order.conversionCost, 2),
      actual_output_cost: order.outputCost,
      abnormal_loss_cost: order.abnormalLossCost,
      rounding_variance: variance,
      wip_balanced:
        roundN(order.materialCost + order.conversionCost, 2) === order.totalCost &&
        Math.abs(variance) < 0.01,
    };
  });
}

/** تفاصيل تكلفة الأمر — نفس بنية jsonb للأصل (production_order_cost_detail). */
export async function productionOrderCostDetail(
  session: ServerSession,
  orderId: string,
): Promise<Json> {
  return withTransaction({ rollback: true }, async (tx) => {
    if (!(await isStaff(tx, session.userId))) {
      throw new AuthorizationError("ليس لديك صلاحية قراءة أمر الإنتاج");
    }
    if (!orderId) throw new BusinessRuleError("معرّف أمر الإنتاج مطلوب");
    const order = await readProductionOrder(tx, orderId);
    if (!order) throw new BusinessRuleError("أمر الإنتاج غير موجود");

    const { rows: matSub } = await tx.query<{ s: string }>(
      "SELECT coalesce(sum(total_cost), 0)::text AS s FROM public.production_order_materials WHERE production_order_id = $1::uuid",
      [order.id],
    );
    const { rows: convSub } = await tx.query<{ s: string }>(
      "SELECT coalesce(sum(amount), 0)::text AS s FROM public.production_order_cost_allocations WHERE production_order_id = $1::uuid",
      [order.id],
    );
    const subtotalMaterial = Number(matSub[0].s);
    const subtotalConversion = Number(convSub[0].s);
    const totalWip = roundN(subtotalMaterial + subtotalConversion, 2);
    const variance = roundN(totalWip - order.outputCost - order.abnormalLossCost, 2);

    const materials = (
      await tx.query(
        `SELECT m.id::text, m.product_id::text, coalesce(p.name_ar, p.name) AS product_name,
                m.entered_quantity::text, eu.short_name AS entered_uom,
                m.base_quantity::text, bu.short_name AS base_uom,
                m.uom_conversion_factor::text, m.mass_kg::text, m.unit_cost::text,
                m.total_cost::text, m.inventory_account_code, m.stock_movement_id::text,
                coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                    'batch_id', a.batch_id::text, 'batch_number', pb.batch_number,
                    'base_quantity', a.base_quantity::text))
                    FROM public.production_order_batch_allocations a
                    JOIN public.product_batches pb ON pb.id = a.batch_id
                   WHERE a.material_id = m.id), '[]'::jsonb) AS batches
           FROM public.production_order_materials m
           JOIN public.products p ON p.id = m.product_id
           LEFT JOIN public.units eu ON eu.id = m.uom_id
           LEFT JOIN public.units bu ON bu.id = m.base_uom_id
          WHERE m.production_order_id = $1::uuid
          ORDER BY m.created_at, m.id`,
        [order.id],
      )
    ).rows;

    const costSources = (
      await tx.query(
        `SELECT a.id::text, a.expense_line_id::text, a.expense_entry_id::text,
                e.reference, e.expense_date::text,
                coalesce(c.name_ar, c.name) AS category,
                a.expense_account_code, a.amount::text, a.allocation_basis,
                a.note, a.journal_entry_id::text
           FROM public.production_order_cost_allocations a
           JOIN public.expense_entries e ON e.id = a.expense_entry_id
           LEFT JOIN public.expense_lines el ON el.id = a.expense_line_id
           LEFT JOIN public.expense_categories c ON c.id = el.category_id
          WHERE a.production_order_id = $1::uuid
          ORDER BY a.created_at, a.id`,
        [order.id],
      )
    ).rows;

    const outputs = (
      await tx.query(
        `SELECT o.id::text, o.product_id::text, coalesce(p.name_ar, p.name) AS product_name,
                p.item_class::text, o.entered_quantity::text, eu.short_name AS entered_uom,
                o.base_quantity::text, bu.short_name AS base_uom, o.mass_kg::text,
                o.allocation_value_per_base::text,
                round(o.base_quantity * o.allocation_value_per_base, 6)::text AS allocation_weight,
                o.allocated_cost::text, o.actual_stock_cost::text, o.unit_cost::text,
                o.inventory_account_code, o.batch_id::text, o.batch_number,
                o.expiry_date::text, o.stock_movement_id::text
           FROM public.production_order_outputs o
           JOIN public.products p ON p.id = o.product_id
           LEFT JOIN public.units eu ON eu.id = o.uom_id
           LEFT JOIN public.units bu ON bu.id = o.base_uom_id
          WHERE o.production_order_id = $1::uuid
          ORDER BY o.created_at, o.id`,
        [order.id],
      )
    ).rows;

    const losses = (
      await tx.query(
        `SELECT l.id::text, l.loss_type, l.quantity::text, u.short_name AS uom,
                l.mass_kg::text, l.reason,
                CASE WHEN l.loss_type = 'ABNORMAL' AND $2::numeric > 0
                     THEN round($2::numeric * l.mass_kg / nullif((
                       SELECT sum(x.mass_kg) FROM public.production_order_losses x
                        WHERE x.production_order_id = $1::uuid AND x.loss_type = 'ABNORMAL'), 0), 2)::text
                     ELSE '0' END AS charged_cost
           FROM public.production_order_losses l
           LEFT JOIN public.units u ON u.id = l.uom_id
          WHERE l.production_order_id = $1::uuid
          ORDER BY l.created_at, l.id`,
        [order.id, order.abnormalLossCost],
      )
    ).rows;

    const journals = (
      await tx.query(
        `SELECT je.id::text, je.entry_number, je.entry_date::text, je.memo,
                je.source_type, je.status::text
           FROM public.journal_entries je
          WHERE (je.source_type IN ('production_material_issue', 'production_completion')
                AND je.source_id = $1::uuid)
             OR je.id IN (
               SELECT a.journal_entry_id FROM public.production_order_cost_allocations a
                WHERE a.production_order_id = $1::uuid AND a.journal_entry_id IS NOT NULL)
          ORDER BY je.created_at, je.id`,
        [order.id],
      )
    ).rows;

    const excluded = (
      await tx.query(
        `SELECT l.id::text AS expense_line_id, e.id::text AS expense_entry_id,
                e.reference, e.expense_date::text,
                coalesce(c.name_ar, c.name) AS category,
                l.net_amount::text, l.tax_amount::text,
                coalesce(e.tax_recoverable, false) AS tax_recoverable,
                (coalesce(l.cost_center_id, e.cost_center_id) = $2::uuid) AS cost_center_matches,
                coalesce(c.production_cost_eligible, false) AS category_eligible,
                CASE
                  WHEN coalesce(c.production_cost_eligible, false) IS NOT TRUE THEN 'تصنيف غير مؤهل للرسملة'
                  WHEN e.status::text NOT IN ('POSTED','PARTIALLY_PAID','PAID','CLOSED') THEN 'المصروف غير مرحّل'
                  WHEN e.expense_date > $3::date THEN 'تاريخ المصروف بعد تاريخ التشغيلة'
                  WHEN coalesce(l.cost_center_id, e.cost_center_id) IS DISTINCT FROM $2::uuid THEN 'مركز تكلفة مختلف'
                  WHEN l.net_amount <= 0 THEN 'صافي السطر غير موجب'
                  WHEN NOT EXISTS (SELECT 1 FROM public.production_order_cost_allocations x
                                    WHERE x.expense_line_id = l.id)
                    AND coalesce(public.expense_line_production_base_amount(
                          l.net_amount, l.tax_amount, e.tax_recoverable), 0)
                      - coalesce((SELECT sum(x.amount) FROM public.production_order_cost_allocations x
                                   WHERE x.expense_line_id = l.id), 0) <= 0
                    THEN 'المتاح صفر بعد التحميل السابق'
                  ELSE NULL END AS reason
           FROM public.expense_lines l
           JOIN public.expense_entries e ON e.id = l.entry_id
           LEFT JOIN public.expense_categories c ON c.id = l.category_id
          WHERE e.expense_date <= $3::date
            AND (coalesce(c.production_cost_eligible, false) IS FALSE
                 OR coalesce(l.cost_center_id, e.cost_center_id) = $2::uuid)
          ORDER BY e.expense_date DESC, e.reference`,
        [order.id, order.costCenterId, order.productionDate],
      )
    ).rows;

    const { rows: summary } = await tx.query<{
      wip_debit: string;
      wip_credit: string;
    }>(
      `SELECT round(coalesce((
         SELECT sum(jl.debit) FROM public.journal_lines jl
          JOIN public.journal_entries je ON je.id = jl.entry_id
         WHERE je.source_type IN ('production_material_issue', 'production_completion')
           AND je.source_id = $1::uuid
           AND jl.account_id = (SELECT id FROM public.accounts WHERE code = '1312')), 0), 2)::text AS wip_debit,
        round(coalesce((
         SELECT sum(jl.credit) FROM public.journal_lines jl
          JOIN public.journal_entries je ON je.id = jl.entry_id
         WHERE je.source_type IN ('production_material_issue', 'production_completion')
           AND je.source_id = $1::uuid
           AND jl.account_id = (SELECT id FROM public.accounts WHERE code = '1312')), 0), 2)::text AS wip_credit`,
      [order.id],
    );

    const conversionFromExpenses = subtotalConversion;
    return {
      order: {
        id: order.id,
        order_number: order.orderNumber,
        production_date: order.productionDate,
        status: order.status,
        warehouse_id: order.warehouseId,
        cost_center_id: order.costCenterId,
        material_cost: order.materialCost,
        conversion_cost: order.conversionCost,
        total_cost: order.totalCost,
        output_cost: order.outputCost,
        abnormal_loss_cost: order.abnormalLossCost,
        reversed_at: order.completedAt && order.status === "REVERSED" ? true : undefined,
        reversal_reason: null,
        completed_at: order.completedAt,
        notes: order.notes,
      },
      materials,
      cost_sources: costSources,
      outputs,
      losses,
      journals,
      excluded_expenses: excluded,
      summary: {
        wip_debit: Number(summary[0]?.wip_debit ?? 0),
        wip_credit: Number(summary[0]?.wip_credit ?? 0),
        conversion_from_expenses: roundN(conversionFromExpenses, 2),
        unallocated_conversion: roundN(order.conversionCost - conversionFromExpenses, 2),
        material_subtotal: roundN(subtotalMaterial, 2),
        conversion_subtotal: roundN(subtotalConversion, 2),
        wip_total_from_parts: totalWip,
        rounding_variance: variance,
        wip_balanced:
          roundN(subtotalMaterial + subtotalConversion, 2) === order.totalCost &&
          Math.abs(variance) < 0.01,
        allocation_basis: "RELATIVE_SALES_VALUE",
      },
    };
  });
}
