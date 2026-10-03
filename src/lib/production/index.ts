/**
 * Market-Hub ERP — Production module: data access layer.
 *
 * The mill's OWN production, as a track separate from milling other people's
 * grain. The two must not be confused:
 *
 *   milling module   grain belongs to a customer, stock impact: NONE
 *   this module      grain belongs to the mill,   stock impact: FULL
 *
 * Every write goes through one of the engine's RPCs. The production tables
 * carry no browser INSERT or UPDATE policy at all, so this layer cannot write
 * them directly even by mistake — which is deliberate: an order whose cost was
 * edited by hand is an order nobody can explain.
 *
 * Query failures are THROWN, never swallowed. `fetchOrders` returning [] on
 * error would render "no production orders" to a user whose data failed to
 * load, and an empty state is a claim about reality, not about the network.
 */
import { supabase } from "@/integrations/supabase/client";

/* The generated types do not know the production_* schema yet. Same narrow,
 * documented escape hatch `milling/index.ts` uses. */
const db = supabase as any;

/*
 * Production belongs to the mill module rather than to a module of its own.
 * ModuleGuard denies a module the company has not enabled, so a brand new id
 * would render a blank screen with no explanation; reusing the mill module,
 * which is already enabled here, keeps the same authorisation and the same
 * meaning - this is mill work.
 */
export const PRODUCTION_MODULE_ID = "milling_operations";

/* ------------------------------------------------------------------ types */

export type ProductionStatus = "PLANNED" | "ISSUED" | "COMPLETED" | "CANCELLED";
export type OutputRole = "PRIMARY" | "BY_PRODUCT";
export type AllocationBasis =
  "REMAINDER_TO_PRIMARY" | "NET_REALISABLE_VALUE" | "RELATIVE_SALES_VALUE";

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  PLANNED: "مخطط",
  ISSUED: "صُرف",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
};

/*
 * The allocation basis is spelled out in full because it decides who carries
 * the shared production cost. Presenting it as a bare enum would invite the
 * default to be chosen without reading it, and the default is the one that
 * makes bran look free.
 */
export const ALLOCATION_BASIS_OPTIONS: {
  value: AllocationBasis;
  label: string;
  hint: string;
}[] = [
  {
    value: "REMAINDER_TO_PRIMARY",
    label: "الباقي على الأساسي",
    hint: "الطحين يحمل تكلفة الإنتاج كاملة، والنخالة بلا تكلفة. الخيار المحافظ.",
  },
  {
    value: "NET_REALISABLE_VALUE",
    label: "القيمة البيعية الصافية",
    hint: "تُخصم قيمة النخالة بسعر بيعها من تكلفة الطحين. يتطلب سعر بيع واقعياً للنخالة.",
  },
  {
    value: "RELATIVE_SALES_VALUE",
    label: "القيمة البيعية النسبية",
    hint: "توزيع التكلفة بنسبة أسعار البيع بين الأساسي والجانبي.",
  },
];

export interface ProductionOrder {
  id: string;
  order_number: string;
  warehouse_id: string;
  bom_id: string | null;
  production_date: string;
  status: ProductionStatus;
  planned_input_qty: number;
  planned_output_qty: number;
  planned_yield_pct: number | null;
  actual_input_qty: number;
  actual_output_qty: number;
  actual_yield_pct: number | null;
  material_cost: number;
  direct_labour: number;
  overhead_cost: number;
  total_cost: number;
  costing_method: string;
  allocation_basis: AllocationBasis;
  notes: string | null;
  created_at: string;
}

export interface ProductionOrderLine {
  id: string;
  order_id: string;
  product_id: string;
  sku?: string;
  name_ar?: string;
  planned_qty: number;
  actual_qty: number;
  unit_cost: number;
  total_cost: number;
}

export interface ProductionOutputLine extends ProductionOrderLine {
  output_role: OutputRole;
}

export interface ProductionLoss {
  id: string;
  order_id: string;
  reason: string;
  qty: number;
  value: number;
  notes: string | null;
  created_at: string;
}

export interface StockOption {
  id: string;
  sku: string;
  name_ar: string | null;
  item_class: string;
  on_hand: number;
}

/* --------------------------------------------------------------- helpers */

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) {
    throw new Error(`${what}: ${result.error.message}`);
  }
  return result.data as T;
}

/* ---------------------------------------------------------------- reads */

export async function fetchOrders(storeId?: string): Promise<ProductionOrder[]> {
  let q = db
    .from("production_orders")
    .select("*")
    .order("production_date", { ascending: false })
    .limit(200);
  if (storeId) q = q.eq("warehouse_id", storeId);
  return unwrap(await q, "تعذّر تحميل أوامر الإنتاج");
}

export async function fetchOrderLines(orderId: string): Promise<ProductionOrderLine[]> {
  return unwrap(
    await db.from("production_order_materials").select("*").eq("order_id", orderId),
    "تعذّر تحميل مواد الأمر",
  );
}

export async function fetchOrderOutputs(orderId: string): Promise<ProductionOutputLine[]> {
  return unwrap(
    await db
      .from("production_order_outputs")
      .select("*, products(sku, name_ar)")
      .eq("order_id", orderId)
      .order("output_role"),
    "تعذّر تحميل نواتج الأمر",
  );
}

export async function fetchOrderLosses(orderId: string): Promise<ProductionLoss[]> {
  return unwrap(
    await db
      .from("production_order_losses")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at"),
    "تعذّر تحميل فاقد الإنتاج",
  );
}

/**
 * Items that can be ISSUED: raw materials and packaging the company actually
 * holds. Finished goods are excluded on purpose - grinding finished flour into
 * more flour is not a production route.
 */
export async function fetchIssuableItems(storeId: string): Promise<StockOption[]> {
  const rows = unwrap(
    await db
      .from("item_valuation")
      .select("product_id, sku, name_ar, item_class, on_hand_qty")
      .eq("item_class", "RAW_MATERIAL"),
    "تعذّر تحميل المواد الخام",
  ) as {
    product_id: string;
    sku: string;
    name_ar: string | null;
    item_class: string;
    on_hand_qty: number;
  }[];

  return rows
    .filter((r) => Number(r.on_hand_qty) > 0)
    .map((r) => ({
      id: r.product_id,
      sku: r.sku,
      name_ar: r.name_ar,
      item_class: r.item_class,
      on_hand: Number(r.on_hand_qty),
    }));
}

/**
 * Items that can be RECEIVED as output: finished goods and by-products.
 * Services and non-stock items are excluded, because producing them into stock
 * is refused by the engine and offering them in the form would only produce a
 * confusing error.
 */
export async function fetchProducibleItems(): Promise<StockOption[]> {
  const rows = unwrap(
    await db
      .from("item_valuation")
      .select("product_id, sku, name_ar, item_class, on_hand_qty")
      .in("item_class", ["FINISHED_GOOD", "BY_PRODUCT"]),
    "تعذّر تحميل الأصناف القابلة للإنتاج",
  ) as {
    product_id: string;
    sku: string;
    name_ar: string | null;
    item_class: string;
    on_hand_qty: number;
  }[];

  return rows.map((r) => ({
    id: r.product_id,
    sku: r.sku,
    name_ar: r.name_ar,
    item_class: r.item_class,
    on_hand: Number(r.on_hand_qty),
  }));
}

export async function fetchBoms(): Promise<{ id: string; name_ar: string; product_id: string }[]> {
  return unwrap(
    await db.from("production_boms").select("id, name_ar, product_id").eq("is_active", true),
    "تعذّر تحميل وصفات الإنتاج",
  );
}

/* --------------------------------------------------------------- writes */

export async function createOrder(input: {
  warehouseId: string;
  bomId?: string | null;
  allocationBasis: AllocationBasis;
  notes?: string;
}): Promise<string> {
  const { data, error } = await db.rpc("create_production_order", {
    _warehouse_id: input.warehouseId,
    _bom_id: input.bomId ?? null,
    _allocation_basis: input.allocationBasis,
    _notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function issueMaterial(input: {
  orderId: string;
  productId: string;
  qty: number;
}): Promise<void> {
  const { error } = await db.rpc("issue_production_materials", {
    _order_id: input.orderId,
    _product_id: input.productId,
    _qty: input.qty,
  });
  if (error) throw new Error(error.message);
}

export async function addOutput(input: {
  orderId: string;
  productId: string;
  qty: number;
  role: OutputRole;
}): Promise<void> {
  const { error } = await db.rpc("add_production_output", {
    _order_id: input.orderId,
    _product_id: input.productId,
    _qty: input.qty,
    _output_role: input.role,
  });
  if (error) throw new Error(error.message);
}

export async function recordLoss(input: {
  orderId: string;
  reason: string;
  qty: number;
  notes?: string;
}): Promise<void> {
  const { error } = await db.rpc("record_production_loss", {
    _order_id: input.orderId,
    _reason: input.reason,
    _qty: input.qty,
    _notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function completeOrder(input: {
  orderId: string;
  overhead?: number;
  labour?: number;
}): Promise<void> {
  const { error } = await db.rpc("complete_production_order", {
    _order_id: input.orderId,
    _overhead_cost: input.overhead ?? 0,
    _direct_labour: input.labour ?? 0,
  });
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------- helpers */

/**
 * The one number that matters on an order screen: what is still unaccounted
 * for. Input minus output minus recorded loss. Zero means the books balance;
 * anything else is weight that has gone missing and the engine will record it
 * as unexplained loss if the order is closed now.
 */
export function unreconciled(order: ProductionOrder, totalLoss: number): number {
  return Number(order.actual_input_qty) - Number(order.actual_output_qty) - totalLoss;
}
