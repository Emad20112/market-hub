import React, { useState, useMemo, useEffect } from 'react';
import type { ReportDefinition } from '@/lib/reports/types';
import { SalesRegisterDataProvider, type SalesRegisterRow } from '@/lib/reports/data-providers/sales-register';
import { ReportHeader } from '../shared/report-header';
import { ReportSummaryDeck } from '../shared/report-summary-deck';
import { ReportFiltersBar } from '../shared/report-filters-bar';
import { ReportDataTable } from '../shared/report-data-table';
import { ReportPagination } from '../shared/report-pagination';
import { ReportEmptyState, ReportErrorState } from '../shared/report-states';
import { createReportColumnRegistry } from '@/lib/reports/registry/column-bridge';
import { defaultVisibility, resolveVisibility } from '@/lib/records/column-registry';
import { RecordsColumnPicker } from '@/components/ui/records-column-picker';
import { calculateGrossMargin, calculateMarginPercentage, round2 } from '@/lib/reports/rules';

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
  const [rawData, setRawData] = useState<SalesRegisterRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
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

  // مزود البيانات
  const dataProvider = useMemo(() => new SalesRegisterDataProvider(), []);

  // جلب البيانات من الخادم
  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const result = await dataProvider.execute({
        reportId: definition.id,
        filters,
        pagination: { page: 1, pageSize: 1000 }, // جلب كافة البنود لتجميعها بدقة
      });

      setRawData(result.rows);
      setMetrics(result.metrics);
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
  }, [filters]);

  // تجميع المبيعات حسب المنتج (Product Grouping & Ranking)
  const groupedRows = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        sku: string;
        item_name_ar: string;
        quantity: number;
        gross_sales: number;
        discounts: number;
        net_sales: number;
        total_cost: number;
        gross_margin: number;
        margin_percentage: number;
      }
    >();

    for (const item of rawData) {
      const key = item.product_id || item.item_name_ar || item.item_name || 'other';
      const existing = map.get(key) || {
        id: key,
        sku: item.sku || '—',
        item_name_ar: item.item_name_ar || item.item_name || 'صنف غير محدد',
        quantity: 0,
        gross_sales: 0,
        discounts: 0,
        net_sales: 0,
        total_cost: 0,
        gross_margin: 0,
        margin_percentage: 0,
      };

      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const discount = Number(item.discount) || 0;
      const total = Number(item.total) || 0;
      const cost = Number(item.line_cost) || 0;

      existing.quantity += qty;
      existing.gross_sales += qty * unitPrice;
      existing.discounts += discount;
      existing.net_sales += total;
      existing.total_cost += cost;

      map.set(key, existing);
    }

    const list = Array.from(map.values()).map((row) => {
      const net = round2(row.net_sales);
      const cost = round2(row.total_cost);
      const margin = calculateGrossMargin(net, cost);
      const pct = calculateMarginPercentage(margin, net);

      return {
        ...row,
        quantity: round2(row.quantity),
        gross_sales: round2(row.gross_sales),
        discounts: round2(row.discounts),
        net_sales: net,
        total_cost: cost,
        gross_margin: margin,
        margin_percentage: pct,
      };
    });

    // الترتيب
    list.sort((a, b) => {
      const valA = (a as any)[sortField] ?? 0;
      const valB = (b as any)[sortField] ?? 0;
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [rawData, sortField, sortOrder]);

  // الترقيم في العرض
  const totalRowCount = groupedRows.length;
  const totalPages = Math.ceil(totalRowCount / pageSize) || 1;
  const pagedRows = useMemo(() => {
    const from = (page - 1) * pageSize;
    return groupedRows.slice(from, from + pageSize);
  }, [groupedRows, page, pageSize]);

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
      rows: groupedRows,
      metrics,
      appliedFilters: filters,
      costBasisNotice,
      currencySymbol: 'ر.س',
    }),
    [definition, groupedRows, metrics, filters, costBasisNotice]
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
        onChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
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
      ) : pagedRows.length === 0 && !loading ? (
        <ReportEmptyState onResetFilters={() => setFilters({})} />
      ) : (
        <ReportDataTable
          columns={definition.columns}
          rows={pagedRows}
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

