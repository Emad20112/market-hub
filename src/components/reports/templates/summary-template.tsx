import React, { useState, useMemo, useEffect } from "react";
import type { ReportDefinition } from "@/lib/reports/types";
import { SalesRegisterDataProvider } from "@/lib/reports/data-providers/sales-register";
import { PurchaseRegisterDataProvider } from "@/lib/reports/data-providers/purchase-register";
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

interface SummaryTemplateProps {
  definition: ReportDefinition;
  onPrint?: () => void;
  onExport?: () => void;
}

/**
 * قالب التقرير الملخص (Summary Report Template) — المرحلة 5.
 *
 * نمط عرض يركز على بطاقات المؤشرات (KPIs) المكثفة مع جدول ملخص موجز.
 * لا يُحمّل أي بيانات تجميعية في المتصفح: الإجماليات تُحسب في الخادم وتصل
 * عبر `metrics` جاهزة، والصفوف تصل مرقّمة من الخادم.
 */
export function SummaryTemplate({ definition, onPrint, onExport }: SummaryTemplateProps) {
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

  const dataProvider = useMemo(() => {
    if (definition.dataProviderId === "dp-purchase-register") {
      return new PurchaseRegisterDataProvider();
    }
    return new SalesRegisterDataProvider();
  }, [definition.dataProviderId]);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const result = await dataProvider.execute({
        reportId: definition.id,
        filters,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
      });

      setRows(result.rows);
      setMetrics(result.metrics);
      setTotalRowCount(result.totalRowCount);
    } catch (err: any) {
      setError(err?.message || "تعذر تحميل بيانات التقرير الملخص");
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
      currencySymbol: "ر.س",
    }),
    [definition, rows, metrics, filters],
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
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
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
