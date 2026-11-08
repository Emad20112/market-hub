/**
 * الغلاف العلوي للإنتاج — يلف Inner بمعاملة واحدة (نمط كل المجالات).
 * الفصل مقصود: Inner تُختبر بمعاملة ممرّرة، والغلاف يستخدم withTransaction.
 */
import { withTransaction } from "@/server/shared/db/transaction";
import type { ServerSession } from "@/server/shared/auth/session";
import {
  createAndPostProductionOrderInner,
  createProductionOrderInner,
  completeProductionOrderInner,
  convertStockInner,
  productionCostSources as productionCostSourcesInner,
  productionOrderCostCheck as productionOrderCostCheckInner,
  productionOrderCostDetail as productionOrderCostDetailInner,
  productionOrderHistory as productionOrderHistoryInner,
  reverseProductionOrderInner,
  smartManufactureInner,
  smartManufacturePayloadInner,
  type ConvertStockPayload,
  type ProductionExpensePayload,
  type ProductionLossPayload,
  type ProductionMaterialPayload,
  type ProductionOutputPayload,
  type SmartManufacturePayload,
} from "./production.usecases";

export type {
  ConvertStockPayload,
  ProductionExpensePayload,
  ProductionLossPayload,
  ProductionMaterialPayload,
  ProductionOutputPayload,
  SmartManufacturePayload,
};

export async function createProductionOrder(
  session: ServerSession,
  input: {
    warehouseId: string;
    costCenterId: string;
    productionDate?: string | null;
    notes?: string | null;
  },
): Promise<string> {
  return withTransaction((tx) => createProductionOrderInner(tx, session, input));
}

export async function createAndPostProductionOrder(
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
  return withTransaction((tx) => createAndPostProductionOrderInner(tx, session, input));
}

export async function completeProductionOrder(
  session: ServerSession,
  input: {
    orderId: string;
    materials: ProductionMaterialPayload[];
    outputs: ProductionOutputPayload[];
    expenses?: ProductionExpensePayload[];
    losses?: ProductionLossPayload[];
  },
): Promise<string> {
  return withTransaction((tx) => completeProductionOrderInner(tx, session, input));
}

export async function reverseProductionOrder(
  session: ServerSession,
  input: { orderId: string; reason: string },
): Promise<string> {
  return withTransaction((tx) => reverseProductionOrderInner(tx, session, input));
}

export async function smartManufacture(
  session: ServerSession,
  input: SmartManufacturePayload,
): Promise<string> {
  return withTransaction((tx) => smartManufactureInner(tx, session, input));
}

export async function smartManufacturePayload(
  session: ServerSession,
  payload: Record<string, unknown>,
): Promise<string> {
  return withTransaction((tx) => smartManufacturePayloadInner(tx, session, payload));
}

export async function convertStock(
  session: ServerSession,
  input: ConvertStockPayload,
): Promise<string> {
  return withTransaction((tx) => convertStockInner(tx, session, input));
}

export async function productionOrderHistory(
  session: ServerSession,
  limit?: number | null,
): Promise<unknown[]> {
  return productionOrderHistoryInner(session, limit);
}

export async function productionCostSources(session: ServerSession): Promise<unknown[]> {
  return productionCostSourcesInner(session);
}

export async function productionOrderCostCheck(
  session: ServerSession,
  orderId: string,
): Promise<Record<string, unknown>> {
  return productionOrderCostCheckInner(session, orderId);
}

export async function productionOrderCostDetail(
  session: ServerSession,
  orderId: string,
): Promise<Record<string, unknown>> {
  return productionOrderCostDetailInner(session, orderId);
}
