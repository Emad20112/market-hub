import React, { useState, useMemo, useEffect } from 'react';
import type { ReportDefinition } from '@/lib/reports/types';
import { executeSalesGroupedReport } from '@/lib/reports/report-execution.functions';
import { ReportHeader } from '../shared/report-header';
import { ReportSummaryDeck } from '../shared/report-summary-deck';
import { ReportFiltersBar } from '../shared/report-filters-bar';
import { ReportDataTable } from '../shared/report-data-table';
import { ReportPagination } from '../shared/report-pagination';
import { ReportEmptyState, ReportErrorState } from '../shared/report-states';
import { createReportColumnRegistry } from '@/lib/reports/registry/column-bridge';
import { defaultVisibility, resolveVisibility } from '@/lib/records/column-registry';
import { RecordsColumnPicker } from '@/components/ui/records-column-picker';

import { ReportExportDialog } from '../shared/report-export-dialog';
import type { ReportExportPayload } from '@/lib/reports/export/types';

interface GroupedRankingTemplateProps {
  definition: ReportDefinition;
  onPrint?: () => void;
  onExport?: () => void;
}

export function GroupedRankingTemplate({
  definition,
  onPrint,
  onExport,
}: GroupedRankingTemplateProps) {
  // 1. الفلاتر وحالة الصفحة
  const [filters, setFilters] = useState<Record<string, any>>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortField, setSortField] = useState(definition.defaultSortField || 'net_sales');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(definition.defaultSortOrder || 'desc');

  // 2. حالة جلب البيانات
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [totalRowCount, setTotalRowCount] = useState(0);
  const [costBasisNotice, setCostBasisNotice] = useState<'ACTUAL' | 'REFERENCE_ONLY' | 'MIXED'>('ACTUAL');

  // 3. حالة إظهار الأعمدة والحوارات
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportDialogMode, setExportDialogMode] = useState<'print' | 'export'>('print');
  const columnRegistry = useMemo(
    () => createReportColumnRegistry(definition.id, definition.columns),
    [definition.id, definition.columns]
  );
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() =>
    defaultVisibility(columnRegistry)
  );

  const groupBy = definition.id === 'rep-customers-sales-turnover' ? 'customer' : 'product';

  // التجميع والترتيب والترقيم كلها تنفذ داخل الخادم؛ لا تنقل البنود الخام للواجهة.
  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const result = await executeSalesGroupedReport({ data: {
        reportId: definition.id,
        filters,
        pagination: { page, pageSize },
        sort: { field: sortField, order: sortOrder },
        groupBy,
      }});

      setRows(result.rows);
      setMetrics(result.metrics);
      setTotalRowCount(result.totalRowCount);
      if (result.meta.costBasisNotice) {
        setCostBasisNotice(result.meta.costBasisNotice);
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء تحميل بيانات التقرير');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [filters, page, pageSize, sortField, sortOrder, groupBy]);

  const totalPages = Math.ceil(totalRowCount / pageSize) || 1;

  function handleSort(field: string) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }

  const exportPayload: ReportExportPayload = useMemo(
    () => ({
      definition,
      rows,
      metrics,
      appliedFilters: filters,
      costBasisNotice,
      currencySymbol: 'ر.س',
    }),
    [definition, rows, metrics, filters, costBasisNotice]
  );

  const handleOpenPrint = () => {
    if (onPrint) onPrint();
    else {
      setExportDialogMode('print');
      setIsExportDialogOpen(true);
    }
  };

  const handleOpenExport = () => {
    if (onExport) onExport();
    else {
      setExportDialogMode('export');
      setIsExportDialogOpen(true);
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      {/* 1. ترويسة التقرير */}
      <ReportHeader
        definition={definition}
        costBasisNotice={costBasisNotice}
        loading={loading}
        onRefresh={fetchData}
        onPrint={handleOpenPrint}
        onExport={handleOpenExport}
      />

      {/* 2. شريط الفلاتر الديناميكي */}
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

      {/* 3. بطاقات المؤشرات والإجماليات */}
      <ReportSummaryDeck
        metricsDefinitions={definition.metrics}
        metricsValues={metrics}
      />

      {/* 4. جدول البيانات أو حالات الخطأ والعدم */}
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

      {/* 5. شريط الترقيم */}
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

      {/* نافذة تخصيص الأعمدة */}
      <RecordsColumnPicker
        open={isColumnPickerOpen}
        onOpenChange={setIsColumnPickerOpen}
        columns={columnRegistry.columns}
        visibility={columnVisibility}
        onVisibilityChange={(newVis) =>
          setColumnVisibility(resolveVisibility(columnRegistry, newVis))
        }
      />

      {/* نافذة خيارات الطباعة والتصدير الموحدة */}
      <ReportExportDialog
        open={isExportDialogOpen}
        onOpenChange={setIsExportDialogOpen}
        payload={exportPayload}
        defaultMode={exportDialogMode}
      />
    </div>
  );
}
