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
import { searchReportProducts } from '@/lib/reports/report-execution.functions';
import { Input } from '@/components/ui/input';
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

  // البحث في الأصناف ينفذ على الخادم؛ لا نحمل كتالوج المنتجات كاملاً للمتصفح.
  const [productsList, setProductsList] = useState<
    { id: string; name?: string | null; name_ar?: string | null; sku?: string | null }[]
  >([]);
  const [productSearch, setProductSearch] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);

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

  // جلب قائمة أصناف محدودة وقابلة للبحث من دالة الخادم.
  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(async () => {
      setProductsLoading(true);
      try {
        const products = await searchReportProducts({ data: { search: productSearch } });
        if (active) setProductsList(products);
      } finally {
        if (active) setProductsLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [productSearch]);

  const selectedProduct = useMemo(
    () => productsList.find((product) => product.id === filters.productId),
    [productsList, filters.productId]
  );

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
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/15 px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Package className="h-4 w-4 text-primary" />
          <span>الصنف المستهدف:</span>
        </div>
        <div className="w-full sm:w-72">
          <Input
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="ابحث بالاسم أو رمز الصنف..."
            className="mb-2 h-8 text-xs"
          />
          <Select
            value={filters.productId || ''}
            onValueChange={(val) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, productId: val }));
            }}
          >
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue placeholder={productsLoading ? 'جارٍ البحث...' : 'اختر الصنف...'} />
            </SelectTrigger>
            <SelectContent>
              {productsList.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name_ar || p.name || 'صنف بلا اسم'} {p.sku ? `(${p.sku})` : ''}
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
        onChange={(k, v) => {
          setPage(1);
          setFilters((prev) => ({ ...prev, [k]: v }));
        }}
        onReset={() => setFilters({ productId: filters.productId })}
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
          loading={loading}
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
