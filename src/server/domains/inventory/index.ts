/** الواجهة العامة لنطاق المخزون الثابت (ADR-007). */
export { saveBatchSettings } from "./application/save-batch-settings.usecase";
export {
  saveProductBatch,
  deleteProductBatch,
  batchKpis,
  reconcileBatchesWithInventory,
  receiveCustomerOwnedStock,
  releaseCustomerOwnedStock,
  saveItemPolicy,
} from "./application/batches.usecase";
export {
  countProductReferences,
  deleteProductGuarded,
} from "./application/product-delete-guard.usecase";
export type { BatchSettingsPayload } from "./application/save-batch-settings.usecase";
export type { SaveBatchInput } from "./application/batches.usecase";
export type {
  ProductReferenceCounts,
  DeleteGuardResult,
} from "./infrastructure/product.repository";
