/**
 * Market-Hub ERP — Stock operations API.
 *
 * Every function here calls an atomic RPC. None of them writes a table
 * directly, because stock, its ledger and the owning document must move
 * together or not at all (design sections 10 and 18).
 *
 * The three concepts this module keeps apart, on purpose:
 *
 *   postOpeningStock()     a standing balance, NOT a purchase
 *   postStockAdjustment()  a correction to a balance, NOT a purchase
 *   receiveCustomerOwned() material we hold but do not own
 *
 * A purchase is a purchase. It goes through `create_purchase` in the
 * procurement module, and it is the only thing that shows in the purchase
 * report.
 */

import { supabase } from "@/integrations/supabase/client";
import { receiveCustomerOwnedStockFn } from "@/server/api/inventory/receive-customer-owned-stock";
import { releaseCustomerOwnedStockFn } from "@/server/api/inventory/release-customer-owned-stock";
import { postOpeningStockFn } from "@/server/api/stock/post-opening-stock";
import { postStockAdjustmentFn } from "@/server/api/stock/post-stock-adjustment";

const db = supabase as any;

export interface StockOperationResult {
  ok: boolean;
  id?: string;
  message?: string;
}

/* --------------------------------------------------------- opening stock */

export interface OpeningStockLine {
  productId: string;
  quantity: number;
  unitCost: number;
  note?: string;
}

/**
 * Posts an opening balance. Design rule #6: this creates a real stock position
 * and its ledger entry, and it must never be counted as a purchase.
 */
export async function postOpeningStock(input: {
  warehouseId: string;
  effectiveDate: string;
  note?: string;
  lines: OpeningStockLine[];
}): Promise<StockOperationResult> {
  if (input.lines.length === 0) {
    return { ok: false, message: "لا توجد بنود في رصيد أول المدة." };
  }

  try {
    const res = await postOpeningStockFn({
      data: {
        warehouseId: input.warehouseId,
        effectiveDate: input.effectiveDate,
        note: input.note ?? null,
        items: input.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          note: line.note ?? null,
        })),
      },
    });
    return { ok: true, id: res.openingId };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/* ------------------------------------------------------ stock adjustment */

export interface AdjustmentLine {
  productId: string;
  /** Signed: positive increases the balance, negative decreases it. */
  quantity: number;
  unitCost: number;
  note?: string;
}

/**
 * Posts a documented adjustment. Design rule #6: this is not a purchase either.
 * The reason is mandatory and is stored on the movement itself.
 */
export async function postStockAdjustment(input: {
  warehouseId: string;
  reason: string;
  note?: string;
  effectiveDate: string;
  lines: AdjustmentLine[];
}): Promise<StockOperationResult> {
  if (!input.reason?.trim()) {
    return { ok: false, message: "سبب التسوية إلزامي." };
  }
  if (input.lines.length === 0) {
    return { ok: false, message: "لا توجد بنود في التسوية." };
  }

  try {
    const res = await postStockAdjustmentFn({
      data: {
        warehouseId: input.warehouseId,
        reason: input.reason,
        note: input.note ?? null,
        effectiveDate: input.effectiveDate,
        items: input.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          note: line.note ?? null,
        })),
      },
    });
    return { ok: true, id: res.adjustmentId };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/* --------------------------------------------------- customer-owned stock */

/**
 * Records material that physically sits in our premises but belongs to a
 * customer. Because the inventory row is written under owner_type = CUSTOMER,
 * it is excluded from `company_stock_positions` and from company valuation.
 */
export async function receiveCustomerOwnedStock(input: {
  customerId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCost?: number;
  note?: string;
}): Promise<StockOperationResult> {
  try {
    const res = await receiveCustomerOwnedStockFn({
      data: {
        customerId: input.customerId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        unitCost: input.unitCost ?? 0,
        note: input.note ?? null,
      },
    });
    return { ok: true, id: res.movementId };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/**
 * Releases customer-owned material — a physical hand-over, not a sale. It
 * changes no revenue and no receivable.
 */
export async function releaseCustomerOwnedStock(input: {
  customerId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  note?: string;
}): Promise<StockOperationResult> {
  try {
    const res = await releaseCustomerOwnedStockFn({
      data: {
        customerId: input.customerId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        quantity: input.quantity,
        note: input.note ?? null,
      },
    });
    return { ok: true, id: res.movementId };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/* --------------------------------------------------------------- reading */

export interface StockPositionRow {
  item_id: string;
  warehouse_id: string;
  owner_type: string;
  owner_id: string | null;
  quantity: number;
  item_nature: string;
  inventory_policy: string;
  reference_valuation: number;
  is_company_owned: boolean;
  warehouse_name: string | null;
  warehouse_name_ar: string | null;
  item_name: string;
  item_name_ar: string | null;
  sku: string | null;
}

/**
 * Company-owned, tracked stock only. This is the correct source for an
 * inventory report: it excludes services, untracked goods and — crucially —
 * customer-owned material.
 */
export async function fetchCompanyStockPositions(): Promise<StockPositionRow[]> {
  const { data, error } = await db
    .from("company_stock_positions")
    .select(
      "item_id, warehouse_id, owner_type, owner_id, quantity, item_nature, inventory_policy, reference_valuation, is_company_owned, warehouse_name, warehouse_name_ar, item_name, item_name_ar, sku",
    )
    .order("item_name");

  if (error) return [];
  return (data ?? []) as StockPositionRow[];
}

/** Material held for customers. Its value is explicitly not company inventory. */
export async function fetchCustomerOwnedPositions(): Promise<StockPositionRow[]> {
  const { data, error } = await db
    .from("customer_owned_positions")
    .select(
      "item_id, warehouse_id, owner_type, owner_id, quantity, item_nature, inventory_policy, reference_valuation, is_company_owned, warehouse_name, warehouse_name_ar, item_name, item_name_ar, sku",
    )
    .order("item_name");

  if (error) return [];
  return (data ?? []) as StockPositionRow[];
}
