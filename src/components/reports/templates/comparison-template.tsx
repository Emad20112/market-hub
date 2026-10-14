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

interface ComparisonTemplateProps {
  definition: ReportDefinition;
  onPrint?: () => void;
  onExport?: () => void;
}

function formatPercent(value: number | undefined) {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${Number(value).toFixed(2)}%`;
}

/**
 * قالب تقرير المقارنة والتحليل (Comparison Template) — المرحلة 5.
 *
 * يقارن مقياسًا بين فترتين زمنيتين ويبرز الفارق المطلق ونسبة التغير.
 * كتلة المقارنة تُحسب بالكامل في الخادم عبر `executeComparisonReport`،
 * فلا يُنقل أي تجميع خام إلى المتصفح.
 */
export function ComparisonTemplate({ definition, onPrint, onExport }: ComparisonTemplateProps) {
  const [filters, setFilters] = useState<Record<string, any>>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

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

  // مزود الصفوف التفصيلية يبقى كما هو؛ كتلة المقارنة تأتي من دالة خادمية مخصصة.
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
            field: definition.defaultSortField || "created_at",
            order: definition.defaultSortOrder || "desc",
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
      setComparison(comparisonResult.comparison);
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل بيانات تقرير المقارنة");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [filters, page, pageSize]);

  const totalPages = Math.ceil(totalRowCount / pageSize) || 1;

  const exportPayload: ReportExportPayload = useMemo(
    () => ({
      definition,
      rows,
      metrics,
      appliedFilters: filters,
      currencySymbol: "ر.س",
      comparison: comparison
        ? {
            metricLabelAr: comparison.metricLabelAr,
            currentValue: comparison.currentValue,
            previousValue: comparison.previousValue,
            absoluteDelta: comparison.absoluteDelta,
            percentChange: comparison.percentChange,
          }
        : undefined,
    }),
    [definition, rows, metrics, filters, comparison],
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
  const favorable = comparison ? comparison.percentChange !== null : false;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <ReportHeader
        definition={definition}
        loading={loading}
        onRefresh={fetchData}
        onPrint={handleOpenPrint}
        onExport={handleOpenExport}
      />

      <ReportFiltersBar
        filters={definition.filters}
        values={filters}
        onChange={(k, v) => {
          setPage(1);
          setFilters((prev) => ({ ...prev, [k]: v }));
        }}
        onReset={() => setFilters({})}
        onOpenColumnPicker={() => setIsColumnPickerOpen(true)}
      />

      {/* كتلة المقارنة: الفارق المطلق ونسبة التغير محسوبان في الخادم */}
      {comparison && (
        <div className="border-b border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-4">
            <div className="flex-1 rounded-lg border border-border/60 bg-card/60 p-3">
              <div className="text-[11px] font-medium text-muted-foreground">
                {comparison.metricLabelAr} — الفترة الحالية
              </div>
              <div className="mt-1 font-mono text-base font-bold text-foreground">
                {Number(comparison.currentValue).toLocaleString("en-US", {
                  minimumFractionDigits: comparison.format === "money" ? 2 : 0,
                  maximumFractionDigits: comparison.format === "money" ? 2 : 3,
                })}
              </div>
            </div>

            <div className="flex-1 rounded-lg border border-border/60 bg-card/60 p-3">
              <div className="text-[11px] font-medium text-muted-foreground">
                {comparison.metricLabelAr} — الفترة السابقة
              </div>
              <div className="mt-1 font-mono text-base font-bold text-foreground">
                {Number(comparison.previousValue).toLocaleString("en-US", {
                  minimumFractionDigits: comparison.format === "money" ? 2 : 0,
                  maximumFractionDigits: comparison.format === "money" ? 2 : 3,
                })}
              </div>
            </div>

            <div
              className={`flex-1 rounded-lg border p-3 ${
                deltaIsFlat
                  ? "border-border/60 bg-card/60"
                  : deltaIsUp
                    ? "border-emerald-500/30 bg-emerald-500/10"
                    : "border-rose-500/30 bg-rose-500/10"
              }`}
            >
              <div className="text-[11px] font-medium text-muted-foreground">
                الفارق ونسبة التغير
              </div>
              <div
                className={`mt-1 flex items-center gap-2 font-mono text-base font-bold ${
                  deltaIsFlat
                    ? "text-foreground"
                    : deltaIsUp
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
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
                  })}
                </span>
                <span className="text-xs">
                  ({favorable ? formatPercent(comparison.percentChange ?? undefined) : "—"})
                </span>
              </div>
              {comparison.previousStartDate && comparison.previousEndDate && (
                <div className="mt-1 text-[9px] text-muted-foreground/80">
                  الفترة المقارنة: {comparison.previousStartDate} → {comparison.previousEndDate}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ReportSummaryDeck metricsDefinitions={definition.metrics} metricsValues={metrics} />

      {error ? (
        <ReportErrorState error={error} onRetry={fetchData} />
      ) : rows.length === 0 && !loading ? (
        <ReportEmptyState onResetFilters={() => setFilters({})} />
      ) : (
        <ReportDataTable
          columns={definition.columns}
          rows={rows}
          loading={loading}
          columnVisibility={columnVisibility}
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
