import React, { useState, useMemo, useEffect } from 'react';
import { Package } from 'lucide-react';
import type { ReportDefinition } from '@/lib/reports/types';
import {
  InventoryMovementsDataProvider,
  type InventoryMovementRow,
} from '@/lib/reports/data-providers/inventory-movements';
import { ReportHeader } from '../shared/report-header';
import { ReportSummaryDeck } from '../shared/report-summary-deck';
import { ReportFiltersBar } from '../shared/report-filters-bar';
import { ReportDataTable } from '../shared/report-data-table';
import { ReportPagination } from '../shared/report-pagination';
import { ReportEmptyState, ReportErrorState } from '../shared/report-states';
import { createReportColumnRegistry } from '@/lib/reports/registry/column-bridge';
import { defaultVisibility, resolveVisibility } from '@/lib/records/column-registry';
import { RecordsColumnPicker } from '@/components/ui/records-column-picker';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { ReportExportDialog } from '../shared/report-export-dialog';
import type { ReportExportPayload } from '@/lib/reports/export/types';

interface MovementStatementTemplateProps {
  definition: ReportDefinition;
  onPrint?: () => void;
  onExport?: () => void;
}

export function MovementStatementTemplate({
  definition,
  onPrint,
  onExport,
}: MovementStatementTemplateProps) {
  // 1. الفلاتر وحالة الصفحة
  const [filters, setFilters] = useState<Record<string, any>>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // قائمة المنتجات لاختيار الصنف
  const [productsList, setProductsList] = useState<{ id: string; name_ar: string; sku: string }[]>(
    []
  );

  // 2. حالة جلب البيانات
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryMovementRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});

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

  const dataProvider = useMemo(() => new InventoryMovementsDataProvider(), []);

  // جلب قائمة المنتجات للاختيار السريع
  useEffect(() => {
    async function fetchProducts() {
      const { data } = await supabase
        .from('products')
        .select('id, name_ar, sku')
        .order('name_ar');
      if (data) {
        setProductsList(data as any);
        // اختيار أول صنف تلقائياً إذا لم يتم الاختيار
        if (data.length > 0 && !filters.productId) {
          setFilters((prev) => ({ ...prev, productId: data[0].id }));
        }
      }
    }
    fetchProducts();
  }, []);

  // جلب كشف حركة الصنف
  async function fetchData() {
    if (!filters.productId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await dataProvider.execute({
        reportId: definition.id,
        filters,
        pagination: { page, pageSize },
      });

      setRows(result.rows);
      setMetrics(result.metrics);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء تحميل كشف حركة الصنف');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (filters.productId) {
      fetchData();
    }
  }, [filters, page, pageSize]);

  const totalRowCount = metrics.totalRowCount || rows.length;
  const totalPages = Math.ceil(totalRowCount / pageSize) || 1;

  const exportPayload: ReportExportPayload = useMemo(
    () => ({
      definition,
      rows,
      metrics,
      appliedFilters: filters,
      currencySymbol: 'ر.س',
    }),
    [definition, rows, metrics, filters]
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
        loading={loading}
        onRefresh={fetchData}
        onPrint={handleOpenPrint}
        onExport={handleOpenExport}
      />

      {/* شريط اختيار الصنف الأساسي */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/15 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Package className="h-4 w-4 text-primary" />
          <span>الصنف المستهدف:</span>
        </div>
        <div className="w-72">
          <Select
            value={filters.productId || ''}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, productId: val }))}
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue placeholder="اختر الصنف..." />
            </SelectTrigger>
            <SelectContent>
              {productsList.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name_ar} {p.sku ? `(${p.sku})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedProduct && (
          <span className="text-xs text-muted-foreground font-mono">
            SKU: {selectedProduct.sku || '—'}
          </span>
        )}
      </div>

      {/* 2. شريط الفلاتر الديناميكي */}
      <ReportFiltersBar
        filters={definition.filters}
        values={filters}
        onChange={(k, v) => setFilters((prev) => ({ ...prev, [k]: v }))}
        onReset={() => setFilters({ productId: prev => prev.productId })}
        onOpenColumnPicker={() => setIsColumnPickerOpen(true)}
      />

      {/* 3. بطاقات المؤشرات (الافتتاحي، الوارد، الصادر، الختامي) */}
      <ReportSummaryDeck
        metricsDefinitions={definition.metrics}
        metricsValues={metrics}
      />

      {/* 4. جدول البيانات وحالات الخطأ والعدم */}
      {error ? (
        <ReportErrorState error={error} onRetry={fetchData} />
      ) : rows.length === 0 && !loading ? (
        <ReportEmptyState
          title="لا توجد حركات مخزنية لهذا الصنف في الفترة المحددة"
          description="تأكد من تاريخ البداية والنهاية أو اختر صنفاً آخر."
          onResetFilters={() => setFilters((prev) => ({ productId: prev.productId }))}
        />
      ) : (
        <ReportDataTable
          columns={definition.columns}
          rows={rows}
          columnVisibility={columnVisibility}
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
