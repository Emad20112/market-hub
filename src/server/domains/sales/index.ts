/** الواجهة العامة لنطاق المبيعات (ADR-007). */
export { createSale, createSalesReturn, adjustLoyalty } from "./application/sales.usecases";
export type {
  CreateSaleInput,
  SaleLineInput,
  PaymentSplitInput,
  CreateSalesReturnInput,
  ReturnLineInput,
  AdjustLoyaltyInput,
} from "./application/sales.usecases";
