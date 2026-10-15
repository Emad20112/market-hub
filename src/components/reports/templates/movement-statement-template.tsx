import React, { useState, useMemo, useEffect } from "react";
import { Package } from "lucide-react";
import type { ReportDefinition } from "@/lib/reports/types";
import {
  InventoryMovementsDataProvider,
  type InventoryMovementRow,
} from "@/lib/reports/data-providers/inventory-movements";
import { ReportHeader } from "../shared/report-header";
import { ReportSummaryDeck } from "../shared/report-summary-deck";
import { ReportFiltersBar } from "../shared/report-filters-bar";
import { ReportDataTable } from "../shared/report-data-table";
import { ReportPagination } from "../shared/report-pagination";
import { ReportEmptyState, ReportErrorState } from "../shared/report-states";
import { createReportColumnRegistry } from "@/lib/reports/registry/column-bridge";
import { defaultVisibility, resolveVisibility } from "@/lib/records/column-registry";
import { RecordsColumnPicker } from "@/components/ui/records-column-picker";
import { searchReportProducts } from "@/lib/reports/report-execution.functions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportExportDialog } from "../shared/report-export-dialog";
import type { ReportExportPayload } from "@/lib/reports/export/types";
import { useReportCompanyInfo } from "@/hooks/use-report-company-info";

interface MovementStatementTemplateProps {
  definition: ReportDefinition;
  onPrint?: () => void;
  onExport?: () => void;
  onSelectReport?: (reportId: string) => void;
}

export function MovementStatementTemplate({
  definition,
  onPrint,
  onExport,
  onSelectReport,
}: MovementStatementTemplateProps) {
  const { companyName, currencySymbol } = useReportCompanyInfo();

  const [filters, setFilters] = useState<Record<string, any>>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [productsList, setProductsList] = useState<
    { id: string; name?: string | null; name_ar?: string | null; sku?: string | null }[]
  >([]);
  const [productSearch, setProductSearch] = useState("");
  const [productsLoading, setProductsLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryMovementRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, number>>({});

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

  const dataProvider = useMemo(() => new InventoryMovementsDataProvider(), []);

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
    [productsList, filters.productId],
  );

  async function fetchData() {
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
      setError(err?.message || "تعذر تحميل بيانات كشف الحركة");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [filters, page, pageSize]);

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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card shadow-xs p-2 sm:p-3 overflow-hidden">
      <ReportHeader
        definition={definition}
        companyName={companyName}
        costBasisNotice={definition.costBasisNotice}
      />

      {/* Target Product Selection Strip with system styling */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Package className="h-4 w-4 text-primary" />
          <span>الصنف المستهدف للتقرير:</span>
        </div>
        <div className="flex-1 min-w-[200px] max-w-sm flex items-center gap-2">
          <Input
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="ابحث بالاسم أو رمز الصنف..."
            className="h-8 text-xs"
          />
          <Select
            value={filters.productId || ""}
            onValueChange={(val) => {
              setPage(1);
              setFilters((prev) => ({ ...prev, productId: val }));
            }}
          >
            <SelectTrigger className="h-7 text-xs bg-slate-950 border-slate-700 text-slate-200">
              <SelectValue placeholder={productsLoading ? "جارٍ البحث..." : "اختر الصنف..."} />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700 text-xs">
              {productsList.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name_ar || p.name || "صنف بلا اسم"} {p.sku ? `(${p.sku})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedProduct && (
          <span className="text-xs text-muted-foreground font-mono">
            SKU: {selectedProduct.sku || "—"}
          </span>
        )}
      </div>

      <ReportFiltersBar
        definition={definition}
        filters={definition.filters}
        values={filters}
        onChange={(k, v) => {
          setPage(1);
          setFilters((prev) => ({ ...prev, [k]: v }));
        }}
        onReset={() => setFilters({ productId: filters.productId })}
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

      <ReportSummaryDeck
        metricsDefinitions={definition.metrics}
        metricsValues={metrics}
        currencySymbol={currencySymbol}
      />

      {error ? (
        <ReportErrorState error={error} onRetry={fetchData} />
      ) : rows.length === 0 && !loading ? (
        <ReportEmptyState
          title="لا توجد حركات مخزنية لهذا الصنف في الفترة المحددة"
          description="تأكد من تاريخ البداية والنهاية أو اختر صنفاً آخر."
          onResetFilters={() => setFilters((prev) => ({ productId: prev.productId }))}
          context={{
            hasAnyFilters: Boolean(filters.productId),
            hasRequiredFilter: Boolean(filters.productId),
            requiredFilterLabel: "الصنف المستهدف",
          }}
        />
      ) : (
        <ReportDataTable
          columns={definition.columns}
          rows={rows}
          loading={loading}
          columnVisibility={columnVisibility}
          currencySymbol={currencySymbol}
          companyName={companyName}
        />
      )}

      {rows.length > 0 && (
        <ReportPagination
          page={page}
          pageSize={pageSize}
          totalPages={Math.ceil(rows.length / pageSize) || 1}
          totalRowCount={rows.length}
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
