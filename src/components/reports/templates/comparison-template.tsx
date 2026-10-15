import React, { useState, useMemo, useEffect } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReportDefinition } from "@/lib/reports/types";
import { SalesRegisterDataProvider } from "@/lib/reports/data-providers/sales-register";
import { PurchaseRegisterDataProvider } from "@/lib/reports/data-providers/purchase-register";
import { executeComparisonReport } from "@/lib/reports/report-execution.functions";
import { ReportHeader } from "../shared/report-header";
import { ReportSummaryDeck } from "../shared/report-summary-deck";
import { ReportFiltersBar } from "../shared/report-filters-bar";
import { ReportDataTable } from "../shared/report-data-table";
import { ReportPagination } from "../shared/report-pagination";
import { ReportEmptyState, ReportErrorState } from "../shared/report-states";
import { createReportColumnRegistry } from "@/lib/reports/registry/column-bridge";
import { defaultVisibility, resolveVisibility } from "@/lib/records/column-registry";
import { RecordsColumnPicker } from "@/components/ui/records-column-picker";
import { ReportExportDialog } from "../shared/report-export-dialog";
import type { ReportExportPayload } from "@/lib/reports/export/types";
import { useReportCompanyInfo } from "@/hooks/use-report-company-info";

interface ComparisonTemplateProps {
  definition: ReportDefinition;
  onPrint?: () => void;
  onExport?: () => void;
  onSelectReport?: (reportId: string) => void;
}

function formatPercent(value: number | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

export function ComparisonTemplate({
  definition,
  onPrint,
  onExport,
  onSelectReport,
}: ComparisonTemplateProps) {
  const { companyName, currencySymbol } = useReportCompanyInfo();

  const [filters, setFilters] = useState<Record<string, any>>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState(definition.defaultSortField || "created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(definition.defaultSortOrder || "desc");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [comparison, setComparison] = useState<{
    metricKey: string;
    metricLabelAr: string;
    currentValue: number;
    previousValue: number;
    absoluteDelta: number;
    percentChange: number | null;
    previousStartDate: string | null;
    previousEndDate: string | null;
    format: string;
  } | null>(null);
  const [totalRowCount, setTotalRowCount] = useState(0);

  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportDialogMode, setExportDialogMode] = useState<"print" | "export">("print");

  const columnRegistry = useMemo(
    () => createReportColumnRegistry(definition.id, definition.columns),
    [definition.id, definition.columns],
  );
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    defaultVisibility(columnRegistry),
  );

  const detailProvider = useMemo(() => {
    if (definition.dataProviderId === "dp-purchase-register") {
      return new PurchaseRegisterDataProvider();
    }
    return new SalesRegisterDataProvider();
  }, [definition.dataProviderId]);

  const comparisonMetricKey = definition.comparison?.metricKey ?? "net_sales";

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const [detailResult, comparisonResult] = await Promise.all([
        detailProvider.execute({
          reportId: definition.id,
          filters,
          pagination: { page, pageSize },
          sort: {
            field: sortField,
            order: sortOrder,
          },
        }),
        executeComparisonReport({
          data: {
            reportId: definition.id,
            filters,
            metricKey: comparisonMetricKey,
          },
        }),
      ]);

      setRows(detailResult.rows);
      setMetrics(detailResult.metrics);
      setTotalRowCount(detailResult.totalRowCount);
      setComparison(comparisonResult);
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل بيانات المقارنة");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [filters, page, pageSize, sortField, sortOrder]);

  const totalPages = Math.ceil(totalRowCount / pageSize) || 1;

  function handleSort(field: string) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  const exportPayload: ReportExportPayload = useMemo(
    () => ({
      definition,
      rows,
      metrics,
      appliedFilters: filters,
      currencySymbol,
    }),
    [definition, rows, metrics, filters, currencySymbol],
  );

  const handleOpenPrint = () => {
    if (onPrint) onPrint();
    else {
      setExportDialogMode("print");
      setIsExportDialogOpen(true);
    }
  };

  const handleOpenExport = () => {
    if (onExport) onExport();
    else {
      setExportDialogMode("export");
      setIsExportDialogOpen(true);
    }
  };

  const deltaIsUp = (comparison?.absoluteDelta ?? 0) > 0;
  const deltaIsFlat = (comparison?.absoluteDelta ?? 0) === 0;
  const favorable = definition.comparison?.favorableDirection === "down" ? !deltaIsUp : deltaIsUp;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card shadow-xs p-2 sm:p-3 overflow-hidden">
      <ReportHeader
        definition={definition}
        companyName={companyName}
        costBasisNotice={definition.costBasisNotice}
      />

      <ReportFiltersBar
        definition={definition}
        filters={definition.filters}
        values={filters}
        onChange={(k, v) => {
          setPage(1);
          setFilters((prev) => ({ ...prev, [k]: v }));
        }}
        onReset={() => setFilters({})}
        onPreview={fetchData}
        onOpenColumnPicker={() => setIsColumnPickerOpen(true)}
        onPrint={handleOpenPrint}
        onExport={handleOpenExport}
        currentTemplate={definition.viewTemplate}
        loading={loading}
        onSelectReport={onSelectReport}
        totalColumnsCount={definition.columns.length}
        visibleColumnsCount={
          definition.columns.filter((c) => columnVisibility[c.key] !== false).length
        }
      />

      {comparison && (
        <div className="rounded-xl border border-border bg-muted/20 p-3 shadow-xs">
          <div className="text-xs font-semibold text-foreground mb-2">
            مقارنة الأداء والنمو: {comparison.metricLabelAr}
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[11px] font-medium text-muted-foreground">
                {comparison.metricLabelAr} — الفترة الحالية
              </div>
              <div className="mt-1 font-mono text-base font-bold text-foreground">
                {Number(comparison.currentValue).toLocaleString("en-US", {
                  minimumFractionDigits: comparison.format === "money" ? 2 : 0,
                  maximumFractionDigits: comparison.format === "money" ? 2 : 3,
                })}{" "}
                {comparison.format === "money" ? currencySymbol : ""}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[11px] font-medium text-slate-400">
                {comparison.metricLabelAr} — الفترة السابقة
              </div>
              <div className="mt-1 font-mono text-base font-bold text-foreground">
                {Number(comparison.previousValue).toLocaleString("en-US", {
                  minimumFractionDigits: comparison.format === "money" ? 2 : 0,
                  maximumFractionDigits: comparison.format === "money" ? 2 : 3,
                })}{" "}
                {comparison.format === "money" ? currencySymbol : ""}
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 ${
                deltaIsFlat
                  ? "border-slate-800 bg-slate-950/60"
                  : deltaIsUp
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-rose-500/30 bg-rose-500/10"
              }`}
            >
              <div className="text-[11px] font-medium text-slate-400">الفارق ونسبة التغير</div>
              <div
                className={`mt-1 flex items-center gap-2 font-mono text-base font-bold ${
                  deltaIsFlat ? "text-foreground" : deltaIsUp ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {deltaIsFlat ? (
                  <Minus className="h-4 w-4" />
                ) : deltaIsUp ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                <span>
                  {Number(comparison.absoluteDelta).toLocaleString("en-US", {
                    minimumFractionDigits: comparison.format === "money" ? 2 : 0,
                    maximumFractionDigits: comparison.format === "money" ? 2 : 3,
                  })}{" "}
                  {comparison.format === "money" ? currencySymbol : ""}
                </span>
                <span className="text-xs">
                  ({favorable ? formatPercent(comparison.percentChange ?? undefined) : "—"})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReportSummaryDeck
        metricsDefinitions={definition.metrics}
        metricsValues={metrics}
        currencySymbol={currencySymbol}
      />

      {error ? (
        <ReportErrorState error={error} onRetry={fetchData} />
      ) : rows.length === 0 && !loading ? (
        <ReportEmptyState
          onResetFilters={() => setFilters({})}
          context={{
            hasAnyFilters: Object.keys(filters).some((k) => Boolean(filters[k])),
            hasRequiredFilter: true,
          }}
        />
      ) : (
        <ReportDataTable
          columns={definition.columns}
          rows={rows}
          loading={loading}
          columnVisibility={columnVisibility}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          currencySymbol={currencySymbol}
          companyName={companyName}
        />
      )}

      {totalRowCount > 0 && (
        <ReportPagination
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          totalRowCount={totalRowCount}
          onPageChange={setPage}
          onPageSizeChange={(newSize) => {
            setPageSize(newSize);
            setPage(1);
          }}
        />
      )}

      <RecordsColumnPicker
        open={isColumnPickerOpen}
        onOpenChange={setIsColumnPickerOpen}
        columns={columnRegistry.columns}
        visibility={columnVisibility}
        onVisibilityChange={(newVis) =>
          setColumnVisibility(resolveVisibility(columnRegistry, newVis))
        }
      />

      <ReportExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        payload={exportPayload}
        defaultMode={exportDialogMode}
      />
    </div>
  );
}
