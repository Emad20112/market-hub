/** الواجهة العامة لنطاق المشتريات (ADR-007). */
export {
  createPurchase,
  createPurchaseInner,
  postPurchaseInvoiceInner,
  createPurchaseReturn,
  createPurchaseReturnInner,
} from "./application/purchasing.usecases";
export type {
  CreatePurchaseInput,
  PurchaseLineInput,
  PurchaseSplitInput,
  CreatePurchaseReturnInput,
  PurchaseReturnLineInput,
} from "./application/purchasing.usecases";
