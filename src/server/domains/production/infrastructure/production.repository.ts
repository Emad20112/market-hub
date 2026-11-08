/**
 * مستودع الإنتاج — المرحلة 11 (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج الوصول للبيانات كما في دوال 013/005/009/010 المرجعية حرفيًا:
 * نفس الترتيب، نفس الأقفال (FOR UPDATE/FOR SHARE)، نفس التقريب، نفس الرسائل.
 *
 * اعتماديات انتقالية موثقة في DECISIONS-LOG (تبقى في القاعدة وتُستدعى من هنا
 * لأن سياسات RLS ومشغلات السلامة تستهلكها):
 *  - is_staff / has_role / is_platform_superadmin
 *  - item_effective_policy
 *  - expense_role_rank (تُقرأ صراحة هنا لمكافئ can_read_finance)
 */
import type { PoolClient } from "pg";
import type { ServerSession } from "@/server/shared/auth/session";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";

// ── الصلاحيات (نفس دلالات دوال 002/010 الأصلية) ────────────────────────────

export async function isStaff(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>("SELECT public.is_staff($1::uuid) AS ok", [
    userId,
  ]);
  return rows[0]?.ok === true;
}

export async function hasRole(tx: PoolClient, userId: string, role: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT public.has_role($1::uuid, $2::public.app_role) AS ok",
    [userId, role],
  );
  return rows[0]?.ok === true;
}

/** can_read_finance حرفيًا: is_staff AND expense_role_rank >= 30. */
export async function canReadFinance(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT (public.is_staff($1::uuid) AND public.expense_role_rank($1::uuid) >= 30) AS ok`,
    [userId],
  );
  return rows[0]?.ok === true;
}

/** can_operate_milling حرفيًا (012): staff + (owner/manager/warehouse/cashier OR superadmin). */
export async function canOperateMilling(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT (public.is_staff($1::uuid) AND (
        EXISTS (SELECT 1 FROM public.user_roles ur
                 WHERE ur.user_id = $1::uuid
                   AND ur.role IN ('owner','manager','warehouse','cashier'))
        OR public.is_platform_superadmin($1::uuid))) AS ok`,
    [userId],
  );
  return rows[0]?.ok === true;
}

/** production_quantity_in_base حرفيًا (005). */
export async function productionQuantityInBase(
  tx: PoolClient,
  productId: string,
  quantity: number,
  uomId: string | null,
): Promise<number> {
  const { rows } = await tx.query<{ q: string }>(
    "SELECT public.production_quantity_in_base($1::uuid, $2::numeric, $3::uuid)::text AS q",
    [productId, quantity, uomId],
  );
  return Number(rows[0].q);
}

/** production_mass_in_kg حرفيًا (005) — قد تعيد NULL (صنف بلا مكافئ كتلي). */
export async function productionMassInKg(
  tx: PoolClient,
  productId: string,
  baseQuantity: number,
): Promise<number | null> {
  const { rows } = await tx.query<{ m: string | null }>(
    "SELECT public.production_mass_in_kg($1::uuid, $2::numeric)::text AS m",
    [productId, baseQuantity],
  );
  return rows[0]?.m === null || rows[0]?.m === undefined ? null : Number(rows[0].m);
}

/** production_inventory_account_code حرفيًا (009). */
export function productionInventoryAccountCode(itemClass: string | null): string {
  switch (itemClass) {
    case "RAW_MATERIAL":
      return "1311";
    case "BY_PRODUCT":
      return "1314";
    case "PACKAGING":
      return "1315";
    default:
      return "1313";
  }
}

/** item_effective_policy — تبقى في القاعدة (تستهلكها RLS) وتُستدعى من هنا. */
export async function itemEffectivePolicy(tx: PoolClient, productId: string): Promise<string> {
  const { rows } = await tx.query<{ p: string }>(
    "SELECT public.item_effective_policy($1::uuid)::text AS p",
    [productId],
  );
  return rows[0]?.p ?? "UNTRACKED";
}

// ── الأوامر ────────────────────────────────────────────────────────────────

export interface ProductionOrderRow {
  id: string;
  orderNumber: string;
  warehouseId: string;
  costCenterId: string;
  productionDate: string;
  status: string;
  materialCost: number;
  conversionCost: number;
  totalCost: number;
  outputCost: number;
  abnormalLossCost: number;
  notes: string | null;
  createdBy: string | null;
  completedAt: Date | null;
}

type RawOrder = Record<string, unknown>;

export async function lockProductionOrder(
  tx: PoolClient,
  orderId: string,
): Promise<ProductionOrderRow | null> {
  const { rows } = await tx.query<RawOrder>(
    "SELECT * FROM public.production_orders WHERE id = $1::uuid FOR UPDATE",
    [orderId],
  );
  return mapOrder(rows[0]);
}

export async function readProductionOrder(
  tx: PoolClient,
  orderId: string,
): Promise<ProductionOrderRow | null> {
  const { rows } = await tx.query<RawOrder>(
    "SELECT * FROM public.production_orders WHERE id = $1::uuid",
    [orderId],
  );
  return mapOrder(rows[0]);
}

function mapOrder(r: RawOrder | undefined): ProductionOrderRow | null {
  if (!r) return null;
  return {
    id: String(r.id),
    orderNumber: String(r.order_number),
    warehouseId: String(r.warehouse_id),
    costCenterId: String(r.cost_center_id),
    productionDate: String(r.production_date).slice(0, 10),
    status: String(r.status),
    materialCost: Number(r.material_cost ?? 0),
    conversionCost: Number(r.conversion_cost ?? 0),
    totalCost: Number(r.total_cost ?? 0),
    outputCost: Number(r.output_cost ?? 0),
    abnormalLossCost: Number(r.abnormal_loss_cost ?? 0),
    notes: (r.notes as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    completedAt: (r.completed_at as Date | null) ?? null,
  };
}

/** المنتج صفًا كاملًا كما يحتاجه منطق 013 (قيم المنتج الحسابية نصوص → أرقام). */
export interface ProductRow {
  id: string;
  itemClass: string | null;
  itemNature: string | null;
  isActive: boolean | null;
  isSellable: boolean | null;
  isCustodyItem: boolean | null;
  inventoryPolicy: string | null;
  tracking: string | null;
  trackExpiry: boolean | null;
  baseUomId: string | null;
  unitId: string | null;
  salePrice: number;
  costPrice: number;
  batchDispatchStrategy: string | null;
  nameAr: string | null;
  name: string | null;
  packageWeightKg: number | null;
}

type RawProduct = Record<string, unknown>;

function mapProduct(r: RawProduct | undefined): ProductRow | null {
  if (!r) return null;
  return {
    id: String(r.id),
    itemClass: (r.item_class as string | null) ?? null,
    itemNature: (r.item_nature as string | null) ?? null,
    isActive: (r.is_active as boolean | null) ?? null,
    isSellable: (r.is_sellable as boolean | null) ?? null,
    isCustodyItem: (r.is_custody_item as boolean | null) ?? null,
    inventoryPolicy: (r.inventory_policy as string | null) ?? null,
    tracking: (r.tracking as string | null) ?? null,
    trackExpiry: (r.track_expiry as boolean | null) ?? null,
    baseUomId: (r.base_uom_id as string | null) ?? null,
    unitId: (r.unit_id as string | null) ?? null,
    salePrice: Number(r.sale_price ?? 0),
    costPrice: Number(r.cost_price ?? 0),
    batchDispatchStrategy: (r.batch_dispatch_strategy as string | null) ?? null,
    nameAr: (r.name_ar as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    packageWeightKg:
      r.package_weight_kg === null || r.package_weight_kg === undefined
        ? null
        : Number(r.package_weight_kg),
  };
}

export async function lockProductForShare(
  tx: PoolClient,
  productId: string,
): Promise<ProductRow | null> {
  const { rows } = await tx.query<RawProduct>(
    "SELECT * FROM public.products WHERE id = $1::uuid FOR SHARE",
    [productId],
  );
  return mapProduct(rows[0]);
}

export async function readProduct(tx: PoolClient, productId: string): Promise<ProductRow | null> {
  const { rows } = await tx.query<RawProduct>("SELECT * FROM public.products WHERE id = $1::uuid", [
    productId,
  ]);
  return mapProduct(rows[0]);
}

/** activeWarehouseExists حرفيًا: المستودع نشط وواقع. */
export async function activeWarehouseExists(tx: PoolClient, warehouseId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM public.warehouses WHERE id = $1::uuid AND is_active) AS ok",
    [warehouseId],
  );
  return rows[0]?.ok === true;
}

export async function activeCostCenterExists(
  tx: PoolClient,
  costCenterId: string,
): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM public.expense_cost_centers WHERE id = $1::uuid AND is_active) AS ok",
    [costCenterId],
  );
  return rows[0]?.ok === true;
}

/** إنشاء أمر إنتاج (create_production_order): الترقيم والتسلسل حرفيًا. */
export async function insertProductionOrder(
  tx: PoolClient,
  a: {
    orderNumber: string;
    warehouseId: string;
    costCenterId: string;
    productionDate: string;
    notes: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.production_orders
       (order_number, warehouse_id, cost_center_id, production_date, notes, created_by)
     VALUES ($1, $2::uuid, $3::uuid, $4::date, nullif(btrim(coalesce($5, '')), ''), $6::uuid)
     RETURNING id::text AS id`,
    [a.orderNumber, a.warehouseId, a.costCenterId, a.productionDate, a.notes, a.createdBy],
  );
  return rows[0].id;
}

export async function nextProductionOrderNumber(
  tx: PoolClient,
  productionDate: string,
): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    "SELECT 'MO-' || to_char($1::date, 'YYYYMMDD') || '-' || lpad(nextval('public.production_order_number_seq')::text, 5, '0') AS n",
    [productionDate],
  );
  return rows[0].n;
}

// ── المواد والصرف ──────────────────────────────────────────────────────────

export interface InsertMaterialArgs {
  orderId: string;
  productId: string;
  enteredQuantity: number;
  uomId: string | null;
  baseUomId: string | null;
  uomConversionFactor: number;
  baseQuantity: number;
  massKg: number | null;
  inventoryAccountCode: string;
}

export async function insertProductionMaterial(
  tx: PoolClient,
  a: InsertMaterialArgs,
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.production_order_materials
       (production_order_id, product_id, entered_quantity, uom_id, base_uom_id,
        uom_conversion_factor, base_quantity, mass_kg, inventory_account_code)
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::uuid, $5::uuid, $6::numeric, $7::numeric,
             $8::numeric, $9)
     RETURNING id::text AS id`,
    [
      a.orderId,
      a.productId,
      a.enteredQuantity,
      a.uomId,
      a.baseUomId,
      a.uomConversionFactor,
      a.baseQuantity,
      a.massKg,
      a.inventoryAccountCode,
    ],
  );
  return rows[0].id;
}

export async function updateMaterialMovement(
  tx: PoolClient,
  args: { materialId: string; movementId: string; totalCost: number; unitCost: number },
): Promise<void> {
  await tx.query(
    `UPDATE public.production_order_materials
        SET stock_movement_id = $2::uuid, total_cost = $3::numeric, unit_cost = $4::numeric
      WHERE id = $1::uuid`,
    [args.materialId, args.movementId, args.totalCost, args.unitCost],
  );
}

/** أحدث حركة لمصدر إنتاج (ترتيب الأصل: created_at DESC, id DESC). */
export async function latestMovementForSource(
  tx: PoolClient,
  sourceType: string,
  sourceId: string,
): Promise<{ id: string; totalCost: number; unitCost: number } | null> {
  const { rows } = await tx.query<{
    id: string;
    total_cost: string | null;
    unit_cost: string | null;
  }>(
    `SELECT sm.id, sm.total_cost, sm.unit_cost
       FROM public.stock_movements sm
      WHERE sm.source_type = $1 AND sm.source_id = $2::uuid
      ORDER BY sm.created_at DESC, sm.id DESC
      LIMIT 1`,
    [sourceType, sourceId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    totalCost: Number(rows[0].total_cost ?? 0),
    unitCost: Number(rows[0].unit_cost ?? 0),
  };
}

// ── الدفعات (صرف المواد) ───────────────────────────────────────────────────

export interface BatchSettings {
  strategy: string;
  preventExpired: boolean;
}

/** إعدادات الدفعات كما في complete_production_order (013). */
export async function loadBatchSettings(tx: PoolClient): Promise<BatchSettings> {
  const { rows } = await tx.query<{ s: string | null; p: boolean | null }>(
    `SELECT coalesce(cs.batch_settings, '{}'::jsonb) ->> 'dispatch_strategy' AS s,
            (coalesce(cs.batch_settings, '{}'::jsonb) ->> 'prevent_selling_expired')::boolean AS p
       FROM public.company_settings cs LIMIT 1`,
  );
  let strategy = rows[0]?.s ?? "FEFO";
  if (!["FEFO", "FIFO", "MANUAL"].includes(strategy)) strategy = "FEFO";
  return { strategy, preventExpired: rows[0]?.p ?? true };
}

export interface AllocatableBatch {
  id: string;
  batchNumber: string;
  expiryDate: string | null;
  quantity: number;
}

/** منتج واحد بعينه من جدول الدفعات — منتهية الصلاحية مستبعدة حسب الإعداد. */
export async function listCandidateBatches(
  tx: PoolClient,
  args: {
    productId: string;
    warehouseId: string;
    strategy: string;
    preventExpired: boolean;
  },
): Promise<AllocatableBatch[]> {
  const { rows } = await tx.query<
    AllocatableBatch & { expiry_date: string | null; batch_number: string }
  >(
    `SELECT pb.id, pb.batch_number, pb.expiry_date::text AS expiry_date, pb.quantity
       FROM public.product_batches pb
      WHERE pb.product_id = $1::uuid AND pb.warehouse_id = $2::uuid AND pb.quantity > 0
        AND (NOT $4 OR pb.expiry_date IS NULL OR pb.expiry_date > CURRENT_DATE)
      ORDER BY CASE WHEN $3 = 'FIFO' THEN pb.created_at END ASC,
               CASE WHEN $3 = 'FIFO' THEN pb.id END ASC,
               CASE WHEN $3 = 'FEFO' THEN pb.expiry_date END ASC NULLS LAST,
               CASE WHEN $3 = 'FEFO' THEN pb.created_at END ASC,
               pb.id
      FOR UPDATE`,
    [args.productId, args.warehouseId, args.strategy, args.preventExpired],
  );
  return rows.map((r) => ({
    id: r.id,
    batchNumber: r.batch_number,
    expiryDate: r.expiry_date,
    quantity: Number(r.quantity),
  }));
}

export async function findBatchForProduct(
  tx: PoolClient,
  args: { batchId: string; productId: string; warehouseId: string },
): Promise<AllocatableBatch | null> {
  const { rows } = await tx.query<{
    id: string;
    batch_number: string;
    expiry_date: string | null;
    quantity: string | number;
  }>(
    `SELECT id, batch_number, expiry_date::text AS expiry_date, quantity
       FROM public.product_batches
      WHERE id = $1::uuid AND product_id = $2::uuid AND warehouse_id = $3::uuid
      FOR UPDATE`,
    [args.batchId, args.productId, args.warehouseId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    batchNumber: rows[0].batch_number,
    expiryDate: rows[0].expiry_date,
    quantity: Number(rows[0].quantity),
  };
}

export async function decrementBatch(tx: PoolClient, batchId: string, qty: number): Promise<void> {
  await tx.query(
    "UPDATE public.product_batches SET quantity = round(quantity - $2::numeric, 3), updated_at = now() WHERE id = $1::uuid",
    [batchId, qty],
  );
}

export async function insertBatchAllocation(
  tx: PoolClient,
  args: { materialId: string; batchId: string; baseQuantity: number },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.production_order_batch_allocations (material_id, batch_id, base_quantity)
     VALUES ($1::uuid, $2::uuid, $3::numeric)`,
    [args.materialId, args.batchId, args.baseQuantity],
  );
}

// ── تخصيصات التكلفة (المصروفات) ────────────────────────────────────────────

export interface ExpenseLineFacts {
  id: string;
  entryId: string;
  costCenterId: string | null;
  netAmount: number;
}

export async function lockExpenseLine(
  tx: PoolClient,
  expenseLineId: string,
): Promise<ExpenseLineFacts | null> {
  const { rows } = await tx.query<{
    id: string;
    entry_id: string;
    cost_center_id: string | null;
    net_amount: string;
  }>(
    "SELECT id, entry_id, cost_center_id, net_amount FROM public.expense_lines WHERE id = $1::uuid FOR UPDATE",
    [expenseLineId],
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    entryId: rows[0].entry_id,
    costCenterId: rows[0].cost_center_id,
    netAmount: Number(rows[0].net_amount),
  };
}

export async function readExpenseEntry(
  tx: PoolClient,
  entryId: string,
): Promise<{
  status: string;
  expenseDate: string;
  costCenterId: string | null;
  taxRecoverable: boolean;
} | null> {
  const { rows } = await tx.query<{
    status: string;
    expense_date: string;
    cost_center_id: string | null;
    tax_recoverable: boolean | null;
  }>(
    "SELECT status::text AS status, expense_date::text AS expense_date, cost_center_id, tax_recoverable FROM public.expense_entries WHERE id = $1::uuid FOR SHARE",
    [entryId],
  );
  if (!rows[0]) return null;
  return {
    status: rows[0].status,
    expenseDate: String(rows[0].expense_date).slice(0, 10),
    costCenterId: rows[0].cost_center_id,
    taxRecoverable: rows[0].tax_recoverable === true,
  };
}

/** production_expense_line_available حرفيًا (013): sql STABLE security definer. */
export async function productionExpenseLineAvailable(
  tx: PoolClient,
  expenseLineId: string,
): Promise<{
  eligibleAmount: number;
  allocatedAmount: number;
  availableAmount: number;
  expenseAccountCode: string;
} | null> {
  const { rows } = await tx.query<{
    eligible_amount: string | number;
    allocated_amount: string | number;
    available_amount: string | number;
    expense_account_code: string;
  }>(
    `SELECT r.eligible_amount, r.allocated_amount, r.available_amount, r.expense_account_code
       FROM public.production_expense_line_available($1::uuid) r`,
    [expenseLineId],
  );
  if (!rows[0]) return null;
  return {
    eligibleAmount: Number(rows[0].eligible_amount),
    allocatedAmount: Number(rows[0].allocated_amount),
    availableAmount: Number(rows[0].available_amount),
    expenseAccountCode: rows[0].expense_account_code,
  };
}

export async function insertCostAllocation(
  tx: PoolClient,
  a: {
    orderId: string;
    expenseLineId: string;
    expenseEntryId: string;
    costCenterId: string;
    expenseAccountCode: string;
    amount: number;
    allocationBasis: string;
    note: string | null;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.production_order_cost_allocations
       (production_order_id, expense_line_id, expense_entry_id, cost_center_id,
        expense_account_code, amount, allocation_basis, note, created_by)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::numeric, $7,
             nullif(btrim(coalesce($8, '')), ''), $9::uuid)
     RETURNING id::text AS id`,
    [
      a.orderId,
      a.expenseLineId,
      a.expenseEntryId,
      a.costCenterId,
      a.expenseAccountCode,
      a.amount,
      a.allocationBasis,
      a.note,
      a.createdBy,
    ],
  );
  return rows[0].id;
}

export async function updateAllocationJournal(
  tx: PoolClient,
  args: { allocationId: string; journalId: string },
): Promise<void> {
  await tx.query(
    "UPDATE public.production_order_cost_allocations SET journal_entry_id = $2::uuid WHERE id = $1::uuid",
    [args.allocationId, args.journalId],
  );
}

// ── الفاقد ─────────────────────────────────────────────────────────────────

/** وحدة الكيلوغرام المرجعية (013: kg/كجم/كيلوجرام — kg أولًا). */
export async function kgFactor(tx: PoolClient): Promise<number | null> {
  const { rows } = await tx.query<{ f: string | null }>(
    `SELECT factor_to_reference::text AS f FROM public.units
      WHERE dimension_code = 'MASS' AND lower(short_name) IN ('kg', 'كجم', 'كيلوجرام')
      ORDER BY CASE WHEN lower(short_name) = 'kg' THEN 0 ELSE 1 END
      LIMIT 1`,
  );
  return rows[0]?.f == null ? null : Number(rows[0].f);
}

export async function readUnit(
  tx: PoolClient,
  unitId: string,
): Promise<{ dimensionCode: string; factorToReference: number | null } | null> {
  const { rows } = await tx.query<{ dimension_code: string; factor_to_reference: string | null }>(
    "SELECT dimension_code, factor_to_reference::text AS factor_to_reference FROM public.units WHERE id = $1::uuid",
    [unitId],
  );
  if (!rows[0]) return null;
  return {
    dimensionCode: rows[0].dimension_code,
    factorToReference:
      rows[0].factor_to_reference === null ? null : Number(rows[0].factor_to_reference),
  };
}

export async function insertProductionLoss(
  tx: PoolClient,
  a: {
    orderId: string;
    lossType: string;
    quantity: number;
    uomId: string;
    massKg: number;
    reason: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.production_order_losses
       (production_order_id, loss_type, quantity, uom_id, mass_kg, reason)
     VALUES ($1::uuid, $2, $3::numeric, $4::uuid, $5::numeric, $6)`,
    [a.orderId, a.lossType, a.quantity, a.uomId, a.massKg, a.reason],
  );
}

// ── النواتج ────────────────────────────────────────────────────────────────

export interface InsertOutputArgs {
  orderId: string;
  productId: string;
  enteredQuantity: number;
  uomId: string | null;
  baseUomId: string | null;
  uomConversionFactor: number;
  baseQuantity: number;
  massKg: number | null;
  allocationValuePerBase: number;
  inventoryAccountCode: string;
  batchNumber: string | null;
  expiryDate: string | null;
}

export async function insertProductionOutput(tx: PoolClient, a: InsertOutputArgs): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.production_order_outputs
       (production_order_id, product_id, entered_quantity, uom_id, base_uom_id,
        uom_conversion_factor, base_quantity, mass_kg, allocation_value_per_base,
        inventory_account_code, batch_number, expiry_date)
     VALUES ($1::uuid, $2::uuid, $3::numeric, $4::uuid, $5::uuid, $6::numeric, $7::numeric,
             $8::numeric, $9::numeric, $10, $11, $12::date)
     RETURNING id::text AS id`,
    [
      a.orderId,
      a.productId,
      a.enteredQuantity,
      a.uomId,
      a.baseUomId,
      a.uomConversionFactor,
      a.baseQuantity,
      a.massKg,
      a.allocationValuePerBase,
      a.inventoryAccountCode,
      a.batchNumber,
      a.expiryDate,
    ],
  );
  return rows[0].id;
}

export interface OutputRow {
  id: string;
  productId: string;
  baseQuantity: number;
  allocatedCost: number;
  allocationValuePerBase: number;
  actualStockCost: number;
  unitCost: number;
  inventoryAccountCode: string;
  batchNumber: string | null;
  expiryDate: string | null;
  tracking: string;
  batchId: string | null;
  stockMovementId: string | null;
}

type RawOutput = Record<string, unknown>;

function mapOutput(r: RawOutput): OutputRow {
  return {
    id: String(r.id),
    productId: String(r.product_id),
    baseQuantity: Number(r.base_quantity),
    allocatedCost: Number(r.allocated_cost ?? 0),
    allocationValuePerBase: Number(r.allocation_value_per_base ?? 0),
    actualStockCost: Number(r.actual_stock_cost ?? 0),
    unitCost: Number(r.unit_cost ?? 0),
    inventoryAccountCode: String(r.inventory_account_code),
    batchNumber: (r.batch_number as string | null) ?? null,
    expiryDate: r.expiry_date ? String(r.expiry_date).slice(0, 10) : null,
    tracking: String(r.tracking),
    batchId: (r.batch_id as string | null) ?? null,
    stockMovementId: (r.stock_movement_id as string | null) ?? null,
  };
}

/** نواتج الأمر بترتيب الأصل (created_at, id) مع تتبع المنتج. */
export async function listOutputsWithTracking(
  tx: PoolClient,
  orderId: string,
): Promise<OutputRow[]> {
  const { rows } = await tx.query<RawOutput>(
    `SELECT o.*, p.tracking
       FROM public.production_order_outputs o
       JOIN public.products p ON p.id = o.product_id
      WHERE o.production_order_id = $1::uuid
      ORDER BY o.created_at, o.id`,
    [orderId],
  );
  return rows.map(mapOutput);
}

/** نواتج الأمر بترتيب معاكس للعكس (created_at DESC, id DESC). */
export async function listOutputsReversed(tx: PoolClient, orderId: string): Promise<OutputRow[]> {
  const { rows } = await tx.query<RawOutput>(
    `SELECT o.*, p.tracking
       FROM public.production_order_outputs o
       JOIN public.products p ON p.id = o.product_id
      WHERE o.production_order_id = $1::uuid
      ORDER BY o.created_at DESC, o.id DESC`,
    [orderId],
  );
  return rows.map(mapOutput);
}

export async function updateOutputAfterReceipt(
  tx: PoolClient,
  args: {
    outputId: string;
    movementId: string;
    batchId: string | null;
    actualStockCost: number;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.production_order_outputs
        SET stock_movement_id = $2::uuid, batch_id = $3::uuid,
            actual_stock_cost = $4::numeric,
            unit_cost = CASE WHEN base_quantity > 0 THEN $4::numeric / base_quantity ELSE 0 END
      WHERE id = $1::uuid`,
    [args.outputId, args.movementId, args.batchId, args.actualStockCost],
  );
}

export async function insertOutputBatch(
  tx: PoolClient,
  a: {
    productId: string;
    warehouseId: string;
    batchNumber: string;
    expiryDate: string | null;
    quantity: number;
    unitCost: number;
    note: string;
    createdBy: string;
  },
): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO public.product_batches
       (product_id, warehouse_id, batch_number, expiry_date, quantity, unit_cost, note, created_by)
     VALUES ($1::uuid, $2::uuid, $3, $4::date, $5::numeric, $6::numeric, $7, $8::uuid)
     RETURNING id::text AS id`,
    [
      a.productId,
      a.warehouseId,
      a.batchNumber,
      a.expiryDate,
      a.quantity,
      a.unitCost,
      a.note,
      a.createdBy,
    ],
  );
  return rows[0].id;
}

// ── القيود ─────────────────────────────────────────────────────────────────

/** post_journal_entry حرفيًا (009): create_journal_entry ثم رقم صريح. */
export async function postJournalEntryWithNumber(
  tx: PoolClient,
  session: ServerSession,
  a: {
    entryDate: string;
    memo: string;
    sourceType: string;
    sourceId: string;
    entryNumber: string;
    lines: Array<{ account_code: string; debit?: number; credit?: number; memo?: string }>;
  },
): Promise<string> {
  const { createJournalEntryInner } = await import("@/server/domains/accounting");
  const entryId = await createJournalEntryInner(tx, session, {
    memo: a.memo,
    entryDate: a.entryDate,
    sourceType: a.sourceType,
    sourceId: a.sourceId,
    isSystem: true,
    lines: a.lines,
  });
  await tx.query("UPDATE public.journal_entries SET entry_number = $2 WHERE id = $1::uuid", [
    entryId,
    a.entryNumber,
  ]);
  return entryId;
}

// ── الإقفال ────────────────────────────────────────────────────────────────

export async function updateOrderPosted(
  tx: PoolClient,
  a: {
    orderId: string;
    materialCost: number;
    conversionCost: number;
    totalCost: number;
    outputCost: number;
    abnormalLossCost: number;
    completedBy: string;
  },
): Promise<void> {
  await tx.query(
    `UPDATE public.production_orders
        SET status = 'POSTED', material_cost = $2::numeric, conversion_cost = $3::numeric,
            total_cost = $4::numeric, output_cost = $5::numeric,
            abnormal_loss_cost = $6::numeric, completed_by = $7::uuid,
            completed_at = now(), updated_at = now()
      WHERE id = $1::uuid`,
    [
      a.orderId,
      a.materialCost,
      a.conversionCost,
      a.totalCost,
      a.outputCost,
      a.abnormalLossCost,
      a.completedBy,
    ],
  );
}

// ── مواد الأمر (للعكس والقيد) ──────────────────────────────────────────────

export interface MaterialRow {
  id: string;
  productId: string;
  baseQuantity: number;
  totalCost: number;
  unitCost: number;
  inventoryAccountCode: string;
  stockMovementId: string | null;
}

type RawMaterial = Record<string, unknown>;

function mapMaterial(r: RawMaterial): MaterialRow {
  return {
    id: String(r.id),
    productId: String(r.product_id),
    baseQuantity: Number(r.base_quantity),
    totalCost: Number(r.total_cost ?? 0),
    unitCost: Number(r.unit_cost ?? 0),
    inventoryAccountCode: String(r.inventory_account_code),
    stockMovementId: (r.stock_movement_id as string | null) ?? null,
  };
}

export async function listMaterials(tx: PoolClient, orderId: string): Promise<MaterialRow[]> {
  const { rows } = await tx.query<RawMaterial>(
    "SELECT * FROM public.production_order_materials WHERE production_order_id = $1::uuid ORDER BY created_at, id",
    [orderId],
  );
  return rows.map(mapMaterial);
}

/** جرد أرصدة المواد لسطور القيد (GROUP BY inventory_account_code HAVING sum>0). */
export async function materialAccountTotals(
  tx: PoolClient,
  orderId: string,
  column: "total_cost" | "actual_stock_cost",
  table: "materials" | "outputs",
): Promise<Array<{ code: string; amount: number }>> {
  const tableName =
    table === "materials" ? "public.production_order_materials" : "public.production_order_outputs";
  const costCol = column === "total_cost" ? "total_cost" : "actual_stock_cost";
  const { rows } = await tx.query<{ code: string; amount: string }>(
    `SELECT inventory_account_code AS code, round(sum(${costCol}), 2) AS amount
       FROM ${tableName} WHERE production_order_id = $1::uuid
      GROUP BY inventory_account_code HAVING sum(${costCol}) > 0`,
    [orderId],
  );
  return rows.map((r) => ({ code: r.code, amount: Number(r.amount) }));
}

// ── العكس ──────────────────────────────────────────────────────────────────

/** production_output_has_downstream_use حرفيًا (013). */
export async function outputHasDownstreamUse(tx: PoolClient, outputId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT public.production_output_has_downstream_use($1::uuid) AS ok`,
    [outputId],
  );
  return rows[0]?.ok === true;
}

export async function firstCostTransactionForOutput(
  tx: PoolClient,
  args: { orderId: string; productId: string; warehouseId: string },
): Promise<{ quantityBefore: number; valueBefore: number } | null> {
  const { rows } = await tx.query<{ quantity_before: string; value_before: string }>(
    `SELECT ict.quantity_before::text AS quantity_before, ict.value_before::text AS value_before
       FROM public.item_cost_transactions ict
       JOIN public.production_order_outputs o
         ON ict.source_type = 'production_output' AND ict.source_id = o.id
      WHERE o.production_order_id = $1::uuid AND o.product_id = $2::uuid
        AND ict.warehouse_id = $3::uuid
        AND ict.owner_type = 'COMPANY' AND ict.owner_id IS NULL
      ORDER BY ict.created_at, ict.id
      LIMIT 1`,
    [args.orderId, args.productId, args.warehouseId],
  );
  if (!rows[0]) return null;
  return {
    quantityBefore: Number(rows[0].quantity_before),
    valueBefore: Number(rows[0].value_before),
  };
}

export async function laterMovementExistsForProduct(
  tx: PoolClient,
  a: {
    productId: string;
    warehouseId: string;
    after: Date;
    excludeSourceTypes: string[];
    excludeSourceIds: string[];
  },
): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.stock_movements sm
        WHERE sm.product_id = $1::uuid AND sm.warehouse_id = $2::uuid
          AND sm.owner_type = 'COMPANY' AND sm.owner_id IS NULL
          AND sm.created_at > $3::timestamptz
          AND NOT (sm.source_type = ANY($4::text[]) AND sm.source_id = ANY($5::uuid[]))
     ) AS ok`,
    [a.productId, a.warehouseId, a.after, a.excludeSourceTypes, a.excludeSourceIds],
  );
  return rows[0]?.ok === true;
}

export async function lockInventoryQuantity(
  tx: PoolClient,
  args: { productId: string; warehouseId: string },
): Promise<number> {
  const { rows } = await tx.query<{ quantity: string | null }>(
    `SELECT quantity::text AS quantity FROM public.inventory i
      WHERE i.product_id = $1::uuid AND i.warehouse_id = $2::uuid
        AND i.owner_type = 'COMPANY' AND i.owner_id IS NULL
      FOR UPDATE`,
    [args.productId, args.warehouseId],
  );
  return rows[0]?.quantity == null ? 0 : Number(rows[0].quantity);
}

export async function expectedOutputTotalsForProduct(
  tx: PoolClient,
  args: { orderId: string; productId: string },
): Promise<{ qty: number; value: number }> {
  const { rows } = await tx.query<{ q: string; v: string }>(
    `SELECT coalesce(sum(o.base_quantity), 0)::text AS q,
            coalesce(sum(o.actual_stock_cost), 0)::text AS v
       FROM public.production_order_outputs o
      WHERE o.production_order_id = $1::uuid AND o.product_id = $2::uuid`,
    [args.orderId, args.productId],
  );
  return { qty: Number(rows[0].q), value: Number(rows[0].v) };
}

export async function lockCostLayerState(
  tx: PoolClient,
  args: { productId: string; warehouseId: string },
): Promise<{ qty: number; value: number }> {
  const { rows } = await tx.query<{ quantity: string | null; total_value: string | null }>(
    `SELECT quantity::text AS quantity, total_value::text AS total_value
       FROM public.item_cost_layers cl
      WHERE cl.product_id = $1::uuid AND cl.warehouse_id = $2::uuid
        AND cl.owner_type = 'COMPANY' AND cl.owner_id IS NULL
      FOR UPDATE`,
    [args.productId, args.warehouseId],
  );
  return {
    qty: rows[0]?.quantity == null ? 0 : Number(rows[0].quantity),
    value: rows[0]?.total_value == null ? 0 : Number(rows[0].total_value),
  };
}

export async function outputBatchStillIntact(
  tx: PoolClient,
  args: { batchId: string; baseQuantity: number; completedAt: Date },
): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.product_batches pb
        WHERE pb.id = $1::uuid AND pb.quantity = $2::numeric
          AND pb.updated_at <= $3::timestamptz
     ) AS ok`,
    [args.batchId, args.baseQuantity, args.completedAt],
  );
  return rows[0]?.ok === true;
}

export async function materialBatchesTouchedAfter(
  tx: PoolClient,
  args: { materialId: string; completedAt: Date },
): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.production_order_batch_allocations a
       JOIN public.product_batches pb ON pb.id = a.batch_id
        WHERE a.material_id = $1::uuid AND pb.updated_at > $2::timestamptz
     ) AS ok`,
    [args.materialId, args.completedAt],
  );
  return rows[0]?.ok === true;
}

export async function restoreBatchQuantities(tx: PoolClient, orderId: string): Promise<void> {
  await tx.query(
    `UPDATE public.product_batches pb
        SET quantity = round(pb.quantity + a.return_quantity, 3), updated_at = now()
       FROM (
         SELECT a.batch_id, sum(a.base_quantity) AS return_quantity
           FROM public.production_order_batch_allocations a
           JOIN public.production_order_materials m ON m.id = a.material_id
          WHERE m.production_order_id = $1::uuid
          GROUP BY a.batch_id
       ) a
      WHERE pb.id = a.batch_id`,
    [orderId],
  );
}

export async function zeroBatchWithNote(
  tx: PoolClient,
  args: { batchId: string; note: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.product_batches
        SET quantity = 0, updated_at = now(), note = concat_ws(E'\\n', nullif(note, ''), $2)
      WHERE id = $1::uuid`,
    [args.batchId, args.note],
  );
}

/** القيود المعلقة للعكس بترتيب الأصل (completion → allocations → issue، أحدث أولًا). */
export async function listReversibleJournals(
  tx: PoolClient,
  orderId: string,
): Promise<Array<{ id: string; sourceType: string; rank: number }>> {
  const { rows } = await tx.query<{ id: string; source_type: string; rank: number }>(
    `SELECT je.id, je.source_type,
            CASE je.source_type WHEN 'production_completion' THEN 1
                                WHEN 'production_material_issue' THEN 3 ELSE 2 END AS rank
       FROM public.journal_entries je
      WHERE je.status = 'POSTED' AND (
        (je.source_type = 'production_completion' AND je.source_id = $1::uuid)
        OR (je.source_type = 'production_material_issue' AND je.source_id = $1::uuid)
        OR je.id IN (
          SELECT a.journal_entry_id FROM public.production_order_cost_allocations a
           WHERE a.production_order_id = $1::uuid AND a.journal_entry_id IS NOT NULL
        )
      )`,
    [orderId],
  );
  return rows.map((r) => ({ id: r.id, sourceType: r.source_type, rank: Number(r.rank) }));
}

export async function markOrderReversed(
  tx: PoolClient,
  a: { orderId: string; userId: string; reason: string },
): Promise<void> {
  await tx.query(
    `UPDATE public.production_orders
        SET status = 'REVERSED', reversed_at = now(), reversed_by = $2::uuid,
            reversal_reason = btrim($3), updated_at = now()
      WHERE id = $1::uuid`,
    [a.orderId, a.userId, a.reason],
  );
}

/** بوّابة المصروف المشترك (013): guard_reverse_production_with_shared_expenses. */
export async function sharedAllocatedExpenseBlocksReversal(
  tx: PoolClient,
  orderId: string,
): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM public.production_order_cost_allocations mine
         JOIN public.production_order_cost_allocations other
           ON other.expense_line_id = mine.expense_line_id
          AND other.production_order_id <> mine.production_order_id
         JOIN public.production_orders oo ON oo.id = other.production_order_id
        WHERE mine.production_order_id = $1::uuid
          AND oo.status = 'POSTED'
     ) AS ok`,
    [orderId],
  );
  return rows[0]?.ok === true;
}

/** حكم العكس: أمر يعيد إنتاج مدخله (013). */
export async function orderReproducesOwnInput(tx: PoolClient, orderId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.production_order_materials m
         JOIN public.production_order_outputs o
           ON o.production_order_id = m.production_order_id AND o.product_id = m.product_id
        WHERE m.production_order_id = $1::uuid
     ) AS ok`,
    [orderId],
  );
  return rows[0]?.ok === true;
}

// ── الذكاء في التصنيع (smart_manufacture) ──────────────────────────────────

/** متوسط تكلفة القمح كما في smart_manufacture: طبقات وحدة التكلفة، ثم cost_price، ثم 0. */
export async function grainUnitCost(
  tx: PoolClient,
  args: { productId: string; warehouseId: string; costPrice: number },
): Promise<number> {
  const { rows } = await tx.query<{ c: string | null }>(
    `SELECT coalesce(
       (SELECT round(sum(cl.total_value) / nullif(sum(cl.quantity), 0), 4)::text
          FROM public.item_cost_layers cl
         WHERE cl.product_id = $1::uuid AND cl.warehouse_id = $2::uuid
           AND cl.owner_type = 'COMPANY' AND cl.quantity > 0),
       $3::text, '0')::text AS c`,
    [args.productId, args.warehouseId, args.costPrice === 0 ? null : String(args.costPrice)],
  );
  return Number(rows[0]?.c ?? 0);
}

export async function companyCostingMethodOrThrow(tx: PoolClient): Promise<string> {
  const { rows } = await tx.query<{ m: string | null }>(
    "SELECT costing_method::text AS m FROM public.company_costing_settings WHERE id = 1",
  );
  return rows[0]?.m ?? "MOVING_AVERAGE";
}

export async function insertConversionAudit(
  tx: PoolClient,
  a: {
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
    [a.actorId, a.action, a.entityType, a.entityId, JSON.stringify(a.payload)],
  );
}

export async function nextMillingServiceRef(tx: PoolClient, prefix: string): Promise<string> {
  const { rows } = await tx.query<{ n: string }>(
    `SELECT $1 || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.milling_service_seq')::text, 4, '0') AS n`,
    [prefix],
  );
  return rows[0].n;
}

/** طيب الحركة داخل الخزنة — طبقة التكلفة الحالية (للاستخدام في الفحوص). */
export async function inventoryQuantityFor(
  tx: PoolClient,
  args: { productId: string; warehouseId: string },
): Promise<number> {
  return lockInventoryQuantity(tx, args);
}

export { roundN };
