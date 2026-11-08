/** الواجهة العامة لنطاق المحاسبة (ADR-007). */
export {
  createJournalEntry,
  createJournalEntryInner,
  reverseJournalEntry,
  reverseJournalEntryInner,
  setPeriodStatus,
  setPeriodStatusInner,
} from "./application/accounting.usecases";
export type { CreateJournalEntryInput } from "./application/accounting.usecases";
export type { JournalLineInput } from "./infrastructure/accounting.repository";
