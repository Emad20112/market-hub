/** الواجهة العامة لنطاق المخزون المتحرك (ADR-007). */
export { postStockDelta, applyCostMovement } from "./application/engine";
export {
  postOpeningStock,
  postStockAdjustment,
  createOpeningBalance,
  updateOpeningBalance,
  setCompanyCostingMethod,
} from "./application/stock.usecases";
export type { StockDeltaArgs } from "./application/engine";
export type { OpeningStockLineInput, AdjustmentLineInput } from "./application/stock.usecases";
