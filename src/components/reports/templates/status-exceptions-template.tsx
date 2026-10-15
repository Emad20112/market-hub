import React, { useState, useMemo, useEffect } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { ReportDefinition } from "@/lib/reports/types";
import { executeExceptionsReport } from "@/lib/reports/report-execution.functions";
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

interface StatusExceptionsTemplateProps {
  definition: ReportDefinition;
  onPrint?: () => void;
  onExport?: () => void;
  onSelectReport?: (reportId: string) => void;
}

export function StatusExceptionsTemplate({
  definition,
  onPrint,
  onExport,
  onSelectReport,
}: StatusExceptionsTemplateProps) {
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

  const exceptionSource = definition.exceptionSource ?? "sales_register";

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const result = await executeExceptionsReport({
        data: {
          reportId: definition.id,
          filters,
          pagination: { page, pageSize },
          sort: { field: sortField, order: sortOrder },
          source: exceptionSource,
        },
      });

      setRows(result.rows);
      setMetrics(result.metrics);
      setTotalRowCount(result.totalRowCount);
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل بيانات الاستثناءات");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [filters, page, pageSize, sortField, sortOrder, exceptionSource]);

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

  const hasExceptions = totalRowCount > 0;

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

      {/* Exception Status Banner with system styling */}
      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold ${
          hasExceptions
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {loading ? (
          <ShieldAlert className="h-4 w-4 animate-pulse text-muted-foreground" />
        ) : hasExceptions ? (
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        )}
        <span>
          {loading
            ? "جارٍ فحص الحالات والاستثناءات وتدقيق السجلات..."
            : hasExceptions
              ? `تم رصد ${totalRowCount.toLocaleString("en-US")} حالة تتطلب المراجعة الفورية`
              : "لا توجد حالات استثناء — جميع السجلات سليمة ومطابقة للمحددات"}
        </span>
      </div>

      <ReportSummaryDeck
        metricsDefinitions={definition.metrics}
        metricsValues={metrics}
        currencySymbol={currencySymbol}
      />

      {error ? (
        <ReportErrorState error={error} onRetry={fetchData} />
      ) : rows.length === 0 && !loading ? (
        <ReportEmptyState
          title="لا توجد استثناءات مطابقة"
          description="لم تُرصد أي حالات غير طبيعية ضمن الفلاتر المحددة."
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
