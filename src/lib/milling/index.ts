/**
 * Market-Hub ERP — Milling module barrel.
 *
 * The simplified mill has ONE data layer: custody (docs/milling/00 — ق9).
 * Intake, milling, delivery, adjustments and the statement all go through
 * `custody.ts` — one ledger line per movement, balances always derived.
 *
 * Everything the old module held (jobs, agreements, grain grades, packaging
 * units, print tickets) was removed with the old system; see
 * docs/milling/01_التحليل_المعمق_وحذف_التعقيد.md.
 */

export {
  // types
  type CustodyEntryType,
  type ProductOption,
  type CustodyBalance,
  type CustodyStatementRow,
  type CustodyMoneyRow,
  type CustodyLossRow,
  type CustodyLine,
  type OpResult,
  type CustodyIntakeInput,
  type CustodyMillingInput,
  type CustodyDeliveryInput,
  type CustodyAdjustmentInput,
  // reads
  fetchGrainItems,
  fetchOutputItems,
  fetchServiceItem,
  fetchConsumableItems,
  fetchCustodyBalances,
  fetchCustodyStatement,
  fetchCustodyServiceMoney,
  fetchCustomerOpenInvoices,
  fetchUnlinkedMillingEntries,
  fetchDetectedLoss,
  fetchCustodyDocNumber,
  // writes (RPC only)
  custodyIntake,
  custodyMilling,
  custodyDelivery,
  custodyAdjustment,
  linkCustodyInvoice,
  smartManufacture,
  consumeInternalSupplies,
  type UnlinkedMillingEntry,
  // print vouchers (05 §بند 8.4)
  buildCustodyVoucher,
  custodyVoucherToDoc,
  type CustodyVoucherData,
  // helpers
  translateCustodyError,
  capacityKgOf,
  MILLING_MODULE_ID,
} from "./custody";
