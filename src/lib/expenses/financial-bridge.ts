/**
 * Unified Financial Bridge for Expense Accounting
 *
 * Provides a single source of truth for all modules, dashboards, and financial
 * statements calculating expense metrics. Enforces the strict GAAP/ERP boundary:
 *
 * 1. Accrual Expenses (Income Statement / P&L) = `postedTotal`
 *    All recognized expenses incurred in the period regardless of cash settlement.
 *
 * 2. Cash Outflow (Cash Statement / Cash-on-hand) = `paidCashOut`
 *    Actual money paid out from treasury/bank during the period.
 *
 * 3. Accrued Liabilities (Balance Sheet / Payables) = `outstandingTotal`
 *    Unpaid balance remaining on posted expenses.
 *
 * 4. Delinquent Payables = `overdueTotal`
 *    Expenses past their due date with remaining unpaid balance.
 */

import { supabase } from "@/integrations/supabase/client";
import { listExpensesFn, expenseSummaryFn } from "@/functions/reports/expense-reads";

export interface UnifiedExpenseStats {
  postedTotal: number;
  paidCashOut: number;
  outstandingTotal: number;
  overdueTotal: number;
}

export async function fetchUnifiedExpenseStats(options?: {
  dateFrom?: string | null;
  dateTo?: string | null;
  warehouseId?: string | null;
}): Promise<UnifiedExpenseStats> {
  // عبر الباك اند (expense_summary المنقولة — المرحلة 12) — بلا fallback مباشر.
  const data = await expenseSummaryFn({
    data: {
      dateFrom: options?.dateFrom || null,
      dateTo: options?.dateTo || null,
      warehouseId: options?.warehouseId || null,
    },
  });
  const row = (data ?? {}) as unknown as Record<string, unknown>;
  return {
    postedTotal: Number(row.posted_total ?? 0),
    paidCashOut: Number(row.paid_total ?? 0),
    outstandingTotal: Number(row.outstanding_total ?? 0),
    overdueTotal: Number(row.overdue_total ?? 0),
  };
}
