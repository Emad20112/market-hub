/**
 * Expense register — the list.
 *
 * The toolbar is the whole interaction model: search, filter, quick status
 * chips, and New. Everything below it is one `DataTable` fed by the paginated
 * `list_expenses` RPC, so adding a column never means adding a query.
 *
 * Keyboard behaviour is deliberate: F2 edits, F3 records a payment, Enter opens
 * the detail, Escape closes. This screen is used dozens of times a day by the
 * same people, and reaching for the mouse each time is the difference between a
 * system that is tolerated and one that is used.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { moneyCell } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldInput } from "@/components/ui/input";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageHeader } from "@/components/page-header";
import { ExpenseSummaryCards } from "./expense-summary-cards";
import { ExpenseFilterSheet } from "./expense-filter-sheet";
import { ExpenseStatusBadge, ExpensePaymentBadge } from "./expense-status-badge";
import {
  activeExpenseFilterCount,
  isOverdue,
  today,
  EMPTY_EXPENSE_FILTERS,
  type ExpenseListFilters,
} from "@/lib/expenses/query-keys";
import type { ExpenseListRow, ExpenseSummary } from "@/lib/expenses/types";
import { ArrowDownToLine, Filter, Plus, Receipt, RefreshCw, Search, X } from "lucide-react";

export interface ExpenseRegisterProps {
  rows: ExpenseListRow[];
  summary: ExpenseSummary | undefined;
  lookups: React.ComponentProps<typeof ExpenseFilterSheet>["lookups"];
  filters: ExpenseListFilters;
  onFiltersChange: (next: ExpenseListFilters) => void;
  onRefresh: () => void;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  error: Error | null;
  onCreate: () => void;
  onOpen: (row: ExpenseListRow) => void;
  onEdit: (row: ExpenseListRow) => void;
  onPay: (row: ExpenseListRow) => void;
}

export function ExpenseRegister({
  rows,
  summary,
  lookups,
  filters,
  onFiltersChange,
  onRefresh,
  isLoading,
  isFetching,
  isFetchingNextPage,
  hasNextPage,
  onLoadMore,
  error,
  onCreate,
  onOpen,
  onEdit,
  onPay,
}: ExpenseRegisterProps) {
  const { t, lang } = useI18n();
  const ar = lang === "ar";

  const [filterOpen, setFilterOpen] = useState(false);
  const [searchText, setSearchText] = useState(filters.search);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  /* -------------------------------------------------- debounced search */
  // 300 ms: long enough that typing "electricity" is one request, short enough
  // that the list feels like it is following the keystrokes.
  useEffect(() => {
    if (searchText === filters.search) return;
    const handle = setTimeout(() => {
      onFiltersChange({ ...filters, search: searchText });
    }, 300);
    return () => clearTimeout(handle);
  }, [searchText, filters, onFiltersChange]);

  // Keep the local box in sync when the filters are changed from elsewhere
  // (a summary card click, a reset) without fighting the user mid-typing.
  useEffect(() => {
    setSearchText((current) => (current === filters.search ? current : filters.search));
  }, [filters.search]);

  /* -------------------------------------------------- quick filters */
  const quickFilters = useMemo(
    () => [
      {
        id: "all",
        label: t("common.all"),
        active: filters.status.length === 0 && !filters.paymentState,
        apply: () => onFiltersChange({ ...filters, status: [], paymentState: null }),
      },
      {
        id: "pending",
        label: ar ? "بانتظار الاعتماد" : "Awaiting approval",
        count: summary?.pending_count ?? 0,
        active: filters.status.length === 1 && filters.status[0] === "SUBMITTED",
        apply: () => onFiltersChange({ ...filters, status: ["SUBMITTED"], paymentState: null }),
      },
      {
        id: "unpaid",
        label: ar ? "مستحق غير مسدّد" : "Outstanding",
        count: summary?.unpaid_count ?? 0,
        // "Outstanding" is the settlement bucket, NOT the status. Expressing it
        // as `status: ['POSTED']` would silently hide partially-paid documents,
        // which are exactly the ones a collector is chasing.
        active: filters.paymentState === "unpaid" || filters.paymentState === "partial",
        apply: () => onFiltersChange({ ...filters, paymentState: "unpaid", status: [] }),
      },
      {
        id: "overdue",
        label: ar ? "متأخر" : "Overdue",
        count: summary?.overdue_count ?? 0,
        // The due-date test itself is applied by the summary and by the row
        // badge; here the window is narrowed to what can be overdue at all.
        active:
          filters.paymentState === "unpaid" && filters.dateTo !== null && filters.dateTo <= today(),
        apply: () =>
          onFiltersChange({
            ...filters,
            paymentState: "unpaid",
            status: [],
            // Anything due after today cannot be overdue, so the upper bound is
            // today and the lower bound is left open.
            dateTo: today(),
            dateFrom: filters.dateFrom,
          }),
      },
      {
        id: "drafts",
        label: ar ? "مسودات" : "Drafts",
        count: summary?.draft_count ?? 0,
        active: filters.status.length === 1 && filters.status[0] === "DRAFT",
        apply: () => onFiltersChange({ ...filters, status: ["DRAFT"], paymentState: null }),
      },
    ],
    [filters, onFiltersChange, summary, ar, t],
  );

  /* -------------------------------------------------- keyboard */
  const focusedRow = useMemo(
    () => rows.find((row) => row.id === hoveredId) ?? null,
    [rows, hoveredId],
  );

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Never hijack a key while the operator is typing.
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (event.key) {
        case "F2":
          if (focusedRow && (focusedRow.status === "DRAFT" || focusedRow.status === "REJECTED")) {
            event.preventDefault();
            onEdit(focusedRow);
          } else if (focusedRow) {
            toast.info(t("expenses.warn.immutable"));
          }
          break;
        case "F3":
          if (
            focusedRow &&
            (focusedRow.status === "POSTED" || focusedRow.status === "PARTIALLY_PAID")
          ) {
            event.preventDefault();
            onPay(focusedRow);
          } else if (focusedRow) {
            toast.info(
              ar ? "لا يمكن الدفع قبل الترحيل" : "A payment can only be recorded after posting",
            );
          }
          break;
        case "Enter":
          if (focusedRow) {
            event.preventDefault();
            onOpen(focusedRow);
          }
          break;
        case "Escape":
          setHoveredId(null);
          break;
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedRow, onEdit, onPay, onOpen, ar, t]);

  /* -------------------------------------------------- columns */
  const columns = useMemo<DataTableColumn<ExpenseListRow>[]>(
    () => [
      {
        key: "reference",
        header: t("expenses.reference"),
        width: "w-[132px]",
        sticky: true,
        sortable: true,
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-mono text-[12px] font-semibold text-foreground">
              {row.reference}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{row.expense_date}</span>
          </div>
        ),
      },
      {
        key: "description",
        header: t("expenses.details"),
        cell: (row) => (
          <div className="flex flex-col">
            <span className="truncate text-[13px] text-foreground">
              {row.description || row.primary_category_ar || row.primary_category || "—"}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {[
                ar
                  ? row.primary_category_ar || row.primary_category
                  : row.primary_category || row.primary_category_ar,
                row.cost_center_name,
                row.project_name,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </span>
          </div>
        ),
      },
      {
        key: "payee",
        header: t("expenses.payee"),
        hideBelow: "md",
        cell: (row) => (
          <span className="text-[12px] text-muted-foreground">
            {row.supplier_name ?? row.employee_name ?? row.payee_name ?? "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: t("common.status"),
        width: "w-[130px]",
        cell: (row) => (
          <div className="flex flex-col items-start gap-1">
            <ExpenseStatusBadge status={row.status} showLock />
            <ExpensePaymentBadge
              paid={Number(row.paid_amount)}
              total={Number(row.total_amount)}
              status={row.status}
            />
          </div>
        ),
      },
      {
        key: "remaining",
        header: t("expenses.remaining"),
        align: "end",
        width: "w-[110px]",
        hideBelow: "sm",
        sortable: true,
        sortValue: (row) => Number(row.remaining_amount),
        cell: (row) => {
          const overdue = isOverdue(row.due_date, Number(row.remaining_amount), row.status);
          return (
            <span
              className={cn(
                "font-mono text-[12px] tabular-nums",
                overdue ? "font-semibold text-destructive" : "text-muted-foreground",
              )}
            >
              {moneyCell(row.remaining_amount)}
            </span>
          );
        },
      },
      {
        key: "total",
        header: t("common.total"),
        align: "end",
        width: "w-[120px]",
        sortable: true,
        sortValue: (row) => Number(row.total_amount),
        cell: (row) => (
          <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
            {moneyCell(row.total_amount)}
          </span>
        ),
      },
    ],
    [t, ar],
  );

  const activeCount = activeExpenseFilterCount(filters);

  /* -------------------------------------------------- export */
  // Export is bounded to what is loaded, and says so. A "download everything"
  // button against a million-row register is a denial-of-service you inflict on
  // yourself, and the honest alternative is a server-side export job.
  const exportCsv = useCallback(() => {
    if (!rows.length) {
      toast.info(t("common.no_data"));
      return;
    }

    const header = [
      ar ? "المرجع" : "Reference",
      ar ? "التاريخ" : "Date",
      ar ? "الجهة" : "Payee",
      ar ? "التصنيف" : "Category",
      ar ? "الحالة" : "Status",
      ar ? "الإجمالي" : "Total",
      ar ? "المدفوع" : "Paid",
      ar ? "المتبقي" : "Remaining",
    ];

    const body = rows.map((row) => [
      row.reference,
      row.expense_date,
      row.supplier_name ?? row.employee_name ?? row.payee_name ?? "",
      row.primary_category ?? "",
      row.status,
      Number(row.total_amount).toFixed(2),
      Number(row.paid_amount).toFixed(2),
      Number(row.remaining_amount).toFixed(2),
    ]);

    // BOM first: without it Excel renders Arabic columns as mojibake.
    const csv = [header, ...body]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `expenses-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    if (hasNextPage) {
      toast.info(
        ar
          ? "تم تصدير السجلات المحمّلة فقط — وسّع الفترة أو ضيّق الفلاتر للتصدير الكامل"
          : "Exported the loaded rows only — widen the period or narrow the filters for a full export",
      );
    }
  }, [rows, ar, t, hasNextPage]);

  return (
    <>
      <PageHeader
        title={t("expenses.title")}
        subtitle={t("expenses.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isFetching}>
              <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
              <span className="hidden sm:inline">{t("common.retry")}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <ArrowDownToLine className="size-3.5" />
              <span className="hidden sm:inline">{t("expenses.export")}</span>
            </Button>
            <Button size="sm" onClick={onCreate}>
              <Plus className="size-4" />
              {t("expenses.new")}
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        <ExpenseSummaryCards
          summary={summary}
          loading={isLoading && !summary}
          onSelect={(key) => {
            // The cards double as the fastest filter, so a click narrows the
            // register rather than doing nothing.
            if (key === "pending_total") {
              onFiltersChange({ ...filters, status: ["SUBMITTED"], paymentState: null });
            } else if (key === "outstanding_total") {
              onFiltersChange({ ...filters, status: [], paymentState: "unpaid" });
            } else if (key === "paid_total") {
              onFiltersChange({ ...filters, status: [], paymentState: "paid" });
            } else if (key === "period_total") {
              onFiltersChange({ ...filters, status: [], paymentState: null });
            }
          }}
        />

        <DataTable<ExpenseListRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          initialLoading={isLoading && rows.length === 0}
          loading={isLoading && rows.length === 0}
          refreshing={isFetching && !isLoading && !isFetchingNextPage}
          error={error}
          onRetry={onRefresh}
          infinite
          hasMore={Boolean(hasNextPage)}
          onLoadMore={onLoadMore}
          loadingMore={isFetchingNextPage}
          totalCount={summary?.total_count}
          onRowClick={(row) => onOpen(row)}
          empty={{
            icon: <Receipt />,
            title: t("expenses.empty"),
            description: t("expenses.empty_hint"),
            action: (
              <Button size="sm" onClick={onCreate}>
                <Plus className="size-4" />
                {t("expenses.new")}
              </Button>
            ),
          }}
          toolbar={
            <div
              className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between"
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <FieldInput
                    size="sm"
                    value={searchText}
                    onValueChange={setSearchText}
                    placeholder={t("expenses.search_placeholder")}
                    className="ps-9"
                    aria-label={t("common.search")}
                  />
                  {searchText ? (
                    <button
                      type="button"
                      onClick={() => setSearchText("")}
                      aria-label={t("common.clear")}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilterOpen(true)}
                  className="shrink-0"
                >
                  <Filter className="size-3.5" />
                  <span className="hidden sm:inline">{t("common.filter")}</span>
                  {activeCount > 0 ? (
                    <span className="grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {activeCount}
                    </span>
                  ) : null}
                </Button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {quickFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={filter.apply}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition",
                      filter.active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-surface text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {filter.label}
                    {filter.count !== undefined && filter.count > 0 ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] tabular-nums",
                          filter.active ? "bg-primary-foreground/25" : "bg-surface-2",
                        )}
                      >
                        {filter.count}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          }
          rowProps={(row) => ({
            onMouseEnter: () => setHoveredId(row.id),
          })}
        />
      </div>

      <ExpenseFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        filters={filters}
        onApply={onFiltersChange}
        lookups={lookups}
      />
    </>
  );
}

export { EMPTY_EXPENSE_FILTERS };
export type { ExpenseListFilters };
