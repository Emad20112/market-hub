import { ModuleGuard, useModules } from "@/lib/modules";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Plus,
  Trash2,
  AlertTriangle,
  X,
  LayoutGrid,
  List,
  TableProperties,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { DataTable, type DataTableColumn, type DataTableSort } from "@/components/ui/data-table";
import {
  TableToolbar,
  ToolbarAction,
  applyFilters,
  type FilterDefinition,
  type FilterValues,
  type SortOption,
} from "@/components/ui/table-toolbar";
import { buildSearchIndex, fuzzySearch } from "@/design/fuzzy";
import { useBreakpoint } from "@/design/breakpoints";
import { QUERY_KEYS } from "@/lib/query-keys";

export const Route = createFileRoute("/_app/batches")({
  head: () => ({ meta: [{ title: "Batches & Expiry — Vortex ERP" }] }),
  component: () => (
    <ModuleGuard moduleId="batches">
      <BatchesPage />
    </ModuleGuard>
  ),
});

interface Batch {
  id: string;
  product_id: string;
  warehouse_id: string;
  batch_number: string;
  expiry_date: string | null;
  quantity: number;
  unit_cost: number;
  products?: { name: string; name_ar: string | null; sku: string | null } | null;
  warehouses?: { name: string; name_ar: string | null } | null;
}

/**
 * Batches are streamed 50 rows at a time with `.range()`, matching the products,
 * transfers and settlements pages. The SELECT, joins and ordering are unchanged —
 * only the transport changed, so no schema, RLS or RPC is affected.
 */
const BATCHES_PAGE_SIZE = 50;

/** A batch is "expired" before today and "expiring soon" within 30 days. */
type ExpiryState = "expired" | "soon" | "valid" | "none";

function BatchesPage() {
  const { isModuleEnabled } = useModules();
  const hasMultiWarehouse = isModuleEnabled("multi_warehouse");
  const { lang, t } = useI18n();
  const qc = useQueryClient();
  const breakpoint = useBreakpoint();
  const tableUsesHorizontalScroll =
    breakpoint === "xs" || breakpoint === "sm" || breakpoint === "md";

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [quickFilter, setQuickFilter] = useState<"all" | "expired" | "soon" | "valid">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("grid");
  const [open, setOpen] = useState(false);

  const {
    data: batchPages,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: QUERY_KEYS.batches,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * BATCHES_PAGE_SIZE;
      const to = from + BATCHES_PAGE_SIZE - 1;
      const { data, error: rowsError } = await supabase
        .from("product_batches")
        .select("*, products(name,name_ar,sku), warehouses(name,name_ar)")
        .order("expiry_date", { ascending: true, nullsFirst: false })
        // `expiry_date` is not unique — batches routinely share an expiry date.
        // Without a deterministic tiebreaker the database may order equal rows
        // differently between page requests, which would duplicate or skip a row
        // across the `.range()` boundary. `id` makes the order total and stable.
        .order("id", { ascending: true })
        .range(from, to);
      if (rowsError) throw rowsError;
      const rows = (data ?? []) as unknown as Batch[];
      return { rows, hasMore: rows.length === BATCHES_PAGE_SIZE };
    },
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length : undefined),
  });

  const rows = useMemo(() => batchPages?.pages.flatMap((page) => page.rows) ?? [], [batchPages]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soon = new Date(today);
  soon.setDate(today.getDate() + 30);

  /** Classifies a batch by expiry. Single source of truth for pill, filters and quick chips. */
  const expiryState = (exp: string | null): ExpiryState => {
    if (!exp) return "none";
    const d = new Date(exp);
    if (d < today) return "expired";
    if (d < soon) return "soon";
    return "valid";
  };

  /* ---------------- search (fuzzy, Arabic-normalised) ---------------- */
  const searchIndex = useMemo(
    () =>
      buildSearchIndex(rows, (r) => [
        r.batch_number,
        r.products?.name,
        r.products?.name_ar,
        r.products?.sku,
      ]),
    [rows],
  );

  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return fuzzySearch(searchIndex, q, { threshold: 0.5, requireAll: true }).map((m) => m.item);
  }, [rows, query, searchIndex]);

  /* ---------------- filters ---------------- */
  const filtered = useMemo(
    () =>
      applyFilters(searched, filters, {
        status: (r) => expiryState(r.expiry_date),
        warehouse: (r) => r.warehouse_id ?? "",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, filters],
  );

  const displayRows = useMemo(
    () =>
      filtered.filter((r) => quickFilter === "all" || expiryState(r.expiry_date) === quickFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, quickFilter],
  );

  const expiredCount = useMemo(
    () => rows.filter((r) => expiryState(r.expiry_date) === "expired").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const soonCount = useMemo(
    () => rows.filter((r) => expiryState(r.expiry_date) === "soon").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const validCount = useMemo(
    () => rows.filter((r) => expiryState(r.expiry_date) === "valid").length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  /* ---------------- filter + sort definitions ---------------- */
  /**
   * Warehouses are read independently rather than derived from the loaded batch
   * pages, so the filter lists every active warehouse even when a warehouse's
   * batches all live on a page that has not been fetched yet. Same pattern as
   * `_app.transfers.tsx`. Read-only; no schema or RLS involved.
   */
  const { data: warehouses } = useQuery({
    queryKey: QUERY_KEYS.warehouses,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: hasMultiWarehouse,
  });

  const warehouseOptions = useMemo(
    () =>
      (warehouses ?? []).map((w) => ({
        value: w.id,
        label: (lang === "ar" ? w.name_ar || w.name : w.name || w.name_ar) ?? w.id,
      })),
    [warehouses, lang],
  );

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const defs: FilterDefinition[] = [
      {
        key: "status",
        label: lang === "ar" ? "حالة الصلاحية" : "Expiry status",
        type: "select",
        options: [
          { value: "expired", label: lang === "ar" ? "منتهي" : "Expired" },
          { value: "soon", label: lang === "ar" ? "قريب الانتهاء" : "Expiring soon" },
          { value: "valid", label: lang === "ar" ? "صالح" : "Valid" },
          { value: "none", label: lang === "ar" ? "بدون انتهاء" : "No expiry" },
        ],
      },
    ];
    if (hasMultiWarehouse && warehouseOptions.length) {
      defs.push({
        key: "warehouse",
        label: lang === "ar" ? "المستودع" : "Warehouse",
        type: "select",
        options: warehouseOptions,
      });
    }
    return defs;
  }, [lang, hasMultiWarehouse, warehouseOptions]);

  const sortOptions = useMemo<SortOption[]>(() => {
    void sort;
    return [
      {
        value: "",
        label: lang === "ar" ? "الافتراضي (الأقرب انتهاءً)" : "Default (soonest expiry)",
      },
      { value: "batch", label: lang === "ar" ? "رقم الدفعة" : "Batch number" },
      { value: "product", label: lang === "ar" ? "المنتج" : "Product" },
      { value: "quantity", label: lang === "ar" ? "الكمية" : "Quantity" },
      { value: "expiry", label: lang === "ar" ? "تاريخ الانتهاء" : "Expiry date" },
    ];
  }, [lang, sort]);

  const productName = (r: Batch) =>
    (lang === "ar"
      ? r.products?.name_ar || r.products?.name
      : r.products?.name || r.products?.name_ar) ?? "—";
  const warehouseName = (r: Batch) =>
    (lang === "ar"
      ? r.warehouses?.name_ar || r.warehouses?.name
      : r.warehouses?.name || r.warehouses?.name_ar) ?? "—";

  /** Grid/list cards sort here; `DataTable` sorts for itself from the `sort` prop. */
  const sortedRows = useMemo(() => {
    if (!sort?.key) return displayRows;
    const dir = sort.direction === "desc" ? -1 : 1;
    const val = (r: Batch): string | number => {
      switch (sort.key) {
        case "product":
          return productName(r);
        case "quantity":
          return Number(r.quantity ?? 0);
        case "expiry":
          return r.expiry_date ? new Date(r.expiry_date).getTime() : Number.MAX_SAFE_INTEGER;
        default:
          return r.batch_number ?? "";
      }
    };
    return [...displayRows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), lang === "ar" ? "ar" : "en") * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows, sort, lang]);

  /* ---------------- classic table columns ---------------- */
  const columns = useMemo<DataTableColumn<Batch>[]>(() => {
    const cols: DataTableColumn<Batch>[] = [
      {
        key: "batch",
        header: lang === "ar" ? "الدفعة" : "Batch",
        sortable: true,
        width: "w-[140px]",
        sortValue: (r) => r.batch_number ?? "",
        cell: (r) => <span className="font-mono text-xs text-foreground">{r.batch_number}</span>,
      },
      {
        key: "product",
        header: lang === "ar" ? "المنتج" : "Product",
        sortable: true,
        width: "w-[240px]",
        sortValue: (r) => productName(r),
        cell: (r) => (
          <div className="flex flex-col py-0.5">
            <span className="truncate text-sm font-semibold leading-snug text-foreground">
              {productName(r)}
            </span>
            {r.products?.sku ? (
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {r.products.sku}
              </span>
            ) : null}
          </div>
        ),
      },
    ];
    if (hasMultiWarehouse) {
      cols.push({
        key: "warehouse",
        header: lang === "ar" ? "المستودع" : "Warehouse",
        width: "w-[180px]",
        cell: (r) => <span className="text-sm text-muted-foreground">{warehouseName(r)}</span>,
      });
    }
    cols.push(
      {
        key: "quantity",
        header: lang === "ar" ? "الكمية" : "Qty",
        sortable: true,
        align: "end",
        width: "w-[110px]",
        sortValue: (r) => Number(r.quantity ?? 0),
        cell: (r) => <span className="font-mono text-sm tabular-nums">{r.quantity}</span>,
      },
      {
        key: "expiry",
        header: lang === "ar" ? "تاريخ الانتهاء" : "Expiry",
        sortable: true,
        width: "w-[140px]",
        sortValue: (r) => r.expiry_date ?? "",
        cell: (r) => (
          <span className="font-mono text-xs text-muted-foreground">{r.expiry_date ?? "—"}</span>
        ),
      },
      {
        key: "status",
        header: lang === "ar" ? "الحالة" : "Status",
        width: "w-[140px]",
        cell: (r) => {
          const s = status(r.expiry_date);
          return (
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] ${s.cls}`}>
              {s.label}
            </span>
          );
        },
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, hasMultiWarehouse, today, soon]);

  function status(exp: string | null) {
    if (!exp)
      return {
        label: lang === "ar" ? "بدون انتهاء" : "No expiry",
        cls: "bg-muted text-muted-foreground border-border",
      };
    const d = new Date(exp);
    if (d < today)
      return {
        label: lang === "ar" ? "منتهي" : "Expired",
        cls: "bg-red-500/10 text-red-400 border-red-500/20",
      };
    if (d < soon)
      return {
        label: lang === "ar" ? "قريب الانتهاء" : "Expiring soon",
        cls: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    return {
      label: lang === "ar" ? "صالح" : "Valid",
      cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    };
  }

  async function remove(id: string) {
    if (!confirm(t("common.confirm_delete"))) return;
    const { error: deleteError } = await supabase.from("product_batches").delete().eq("id", id);
    if (deleteError) return toast.error(deleteError.message);
    toast.success(t("common.deleted"));
    void qc.invalidateQueries({ queryKey: QUERY_KEYS.batches });
  }

  const expiringCount = expiredCount + soonCount;

  const emptyState = (
    <div className="card-mullak flex flex-col items-center justify-center space-y-3 p-12 text-center">
      <CalendarClock className="size-10 text-muted-foreground/60" />
      <p className="text-sm font-semibold text-foreground">
        {lang === "ar" ? "لا توجد دفعات" : "No batches yet"}
      </p>
      <p className="text-xs text-muted-foreground">
        {lang === "ar"
          ? "أضف دفعة جديدة لتتبع تواريخ الصلاحية"
          : "Add a batch to start tracking expiry dates"}
      </p>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:opacity-90 transition"
      >
        <Plus className="h-3.5 w-3.5" />
        {lang === "ar" ? "دفعة جديدة" : "New batch"}
      </button>
    </div>
  );

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title={lang === "ar" ? "الدفعات وتواريخ الانتهاء" : "Batches & Expiry"}
        subtitle={
          lang === "ar"
            ? "تتبع المنتجات حسب الدفعة وتاريخ الصلاحية"
            : "Track inventory by batch and expiry date"
        }
      />

      {expiringCount > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-500">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lang === "ar"
            ? `${expiringCount} دفعة قريبة الانتهاء أو منتهية`
            : `${expiringCount} batch(es) expired or expiring within 30 days`}
        </div>
      )}

      <div className="pt-2 sm:pt-3.5">
        <TableToolbar
          sticky
          search={{
            value: query,
            onValueChange: setQuery,
            placeholder: lang === "ar" ? "ابحث بالدفعة أو المنتج" : "Search batch or product",
            resultCount: rows.length,
            loading: isFetching && !isLoading,
          }}
          filters={{ definitions: filterDefinitions, values: filters, onValueChange: setFilters }}
          sort={{
            options: sortOptions,
            value: sort?.key ?? "",
            onValueChange: (v) =>
              setSort(v ? { key: v, direction: sort?.direction ?? "asc" } : null),
            label: lang === "ar" ? "ترتيب" : "Sort",
          }}
          viewToggle={
            <ToolbarAction
              label={
                viewMode === "grid"
                  ? lang === "ar"
                    ? "شبكة"
                    : "Grid"
                  : viewMode === "list"
                    ? lang === "ar"
                      ? "قائمة"
                      : "List"
                    : lang === "ar"
                      ? "كلاسيكي"
                      : "Classic"
              }
              icon={
                viewMode === "grid" ? (
                  <LayoutGrid />
                ) : viewMode === "list" ? (
                  <List />
                ) : (
                  <TableProperties />
                )
              }
              onClick={() =>
                setViewMode((prev) =>
                  prev === "grid" ? "list" : prev === "list" ? "table" : "grid",
                )
              }
              tone="ghost"
            />
          }
          action={
            <ToolbarAction
              label={lang === "ar" ? "دفعة جديدة" : "New batch"}
              icon={<Plus />}
              tone="primary"
              onClick={() => setOpen(true)}
            />
          }
        >
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {[
              { id: "all", label: lang === "ar" ? "الكل" : "All", count: rows.length },
              { id: "expired", label: lang === "ar" ? "منتهي" : "Expired", count: expiredCount },
              { id: "soon", label: lang === "ar" ? "قريب الانتهاء" : "Expiring", count: soonCount },
              { id: "valid", label: lang === "ar" ? "صالح" : "Valid", count: validCount },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setQuickFilter(f.id as any)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
                  quickFilter === f.id
                    ? "border-primary bg-primary text-primary-foreground shadow-xs shadow-primary/20"
                    : "border-border/70 bg-surface/70 text-muted-foreground hover:text-foreground hover:bg-surface-2"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`rounded-full px-1.5 font-mono text-[10px] ${
                    quickFilter === f.id
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </TableToolbar>
      </div>

      {viewMode === "grid" ? (
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card-mullak h-32 animate-pulse" />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {sortedRows.map((r) => {
                  const s = status(r.expiry_date);
                  return (
                    <div
                      key={r.id}
                      className="card-mullak flex flex-col gap-2.5 p-4 transition hover:border-primary/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">
                            {productName(r)}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                            {r.batch_number}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${s.cls}`}
                        >
                          {s.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-t border-border/60 pt-2.5 text-xs">
                        <span className="font-mono text-muted-foreground">
                          {r.expiry_date ?? "—"}
                        </span>
                        <span className="font-mono font-bold tabular-nums text-foreground">
                          {r.quantity}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {hasMultiWarehouse ? (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {warehouseName(r)}
                          </p>
                        ) : (
                          <span />
                        )}
                        <button
                          onClick={() => remove(r.id)}
                          title={t("common.delete")}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-destructive/30 bg-destructive/5 text-destructive transition hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-6 py-2.5 text-xs font-bold text-foreground shadow-sm hover:bg-surface-2 transition active:scale-95 disabled:opacity-50"
                  >
                    {isFetchingNextPage
                      ? lang === "ar"
                        ? "جارٍ التحميل…"
                        : "Loading…"
                      : lang === "ar"
                        ? "تحميل المزيد"
                        : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card-mullak h-16 animate-pulse" />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <>
              <div className="space-y-2.5">
                {sortedRows.map((r) => {
                  const s = status(r.expiry_date);
                  return (
                    <div
                      key={r.id}
                      className="card-mullak group flex flex-col gap-2.5 rounded-2xl border p-3.5 transition-all duration-200 hover:border-primary/50 hover:shadow-md sm:flex-row sm:items-center sm:gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">
                          {productName(r)}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                          {r.batch_number}
                          {hasMultiWarehouse ? ` · ${warehouseName(r)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.expiry_date ?? "—"}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${s.cls}`}
                        >
                          {s.label}
                        </span>
                        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
                          {r.quantity}
                        </span>
                        <button
                          onClick={() => remove(r.id)}
                          title={t("common.delete")}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-destructive/30 bg-destructive/5 text-destructive transition hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-6 py-2.5 text-xs font-bold text-foreground shadow-sm hover:bg-surface-2 transition active:scale-95 disabled:opacity-50"
                  >
                    {isFetchingNextPage
                      ? lang === "ar"
                        ? "جارٍ التحميل…"
                        : "Loading…"
                      : lang === "ar"
                        ? "تحميل المزيد"
                        : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="panel-elevated -mx-1 overflow-hidden rounded-2xl border border-border/70 sm:mx-0">
          <DataTable
            className="px-0"
            columns={columns}
            rows={displayRows}
            rowKey={(r) => r.id}
            loading={isLoading}
            initialLoading={isLoading}
            refreshing={isFetching && !isLoading && !isFetchingNextPage}
            error={(error as Error) ?? null}
            onRetry={() => refetch()}
            sort={sort}
            onSortChange={setSort}
            infinite
            hasMore={Boolean(hasNextPage)}
            onLoadMore={() => {
              if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
            }}
            loadingMore={isFetchingNextPage}
            pageSize={BATCHES_PAGE_SIZE}
            totalCount={rows.length}
            minWidth={hasMultiWarehouse ? 900 : 760}
            horizontalScroll={tableUsesHorizontalScroll}
            stickyHeader
            empty={{
              icon: <CalendarClock />,
              title: lang === "ar" ? "لا توجد دفعات" : "No batches yet",
              description:
                lang === "ar"
                  ? "أضف دفعة جديدة لتتبع تواريخ الصلاحية"
                  : "Add a batch to start tracking expiry dates",
              action: (
                <button
                  onClick={() => setOpen(true)}
                  className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {lang === "ar" ? "دفعة جديدة" : "New batch"}
                </button>
              ),
            }}
          />
        </div>
      )}

      {open && (
        <NewBatchModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            void qc.invalidateQueries({ queryKey: QUERY_KEYS.batches });
          }}
          hasMultiWarehouse={hasMultiWarehouse}
        />
      )}
    </div>
  );
}

function NewBatchModal({
  onClose,
  onSaved,
  hasMultiWarehouse,
}: {
  onClose: () => void;
  onSaved: () => void;
  hasMultiWarehouse?: boolean;
}) {
  const { lang, t } = useI18n();
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [form, setForm] = useState({
    product_id: "",
    warehouse_id: "",
    batch_number: "",
    expiry_date: "",
    quantity: 0,
    unit_cost: 0,
  });

  useEffect(() => {
    Promise.all([
      supabase
        .from("products")
        .select("id,name,name_ar,sku")
        .eq("is_active", true)
        .order("name")
        .limit(500),
      supabase.from("warehouses").select("id,name,name_ar").eq("is_active", true).order("name"),
    ]).then(([p, w]) => {
      setProducts(p.data ?? []);
      setWarehouses(w.data ?? []);
      if (w.data?.[0]) setForm((f) => ({ ...f, warehouse_id: f.warehouse_id || w.data[0].id }));
    });
  }, []);

  async function save() {
    if (!form.product_id || !form.warehouse_id || !form.batch_number) {
      toast.error(t("common.fill_form"));
      return;
    }
    const { error } = await supabase
      .from("product_batches")
      .insert({ ...form, expiry_date: form.expiry_date || null });
    if (error) return toast.error(error.message);
    toast.success(t("common.saved") || t("common.success"));
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 backdrop-blur-sm p-4">
      <div className="panel-elevated w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{lang === "ar" ? "دفعة جديدة" : "New batch"}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label={lang === "ar" ? "المنتج" : "Product"}>
            <select
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
            >
              <option value="">{lang === "ar" ? "اختر..." : "Select..."}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {lang === "ar" ? p.name_ar || p.name : p.name || p.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <Field label={lang === "ar" ? "المستودع" : "Warehouse"}>
            <select
              value={form.warehouse_id}
              onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
            >
              <option value="">{lang === "ar" ? "اختر..." : "Select..."}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {lang === "ar" ? w.name_ar || w.name : w.name || w.name_ar}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={lang === "ar" ? "رقم الدفعة" : "Batch #"}>
              <input
                value={form.batch_number}
                onChange={(e) => setForm({ ...form, batch_number: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
              />
            </Field>
            <Field label={lang === "ar" ? "تاريخ الانتهاء" : "Expiry"}>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
              />
            </Field>
            <Field label={lang === "ar" ? "الكمية" : "Quantity"}>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
              />
            </Field>
            <Field label={lang === "ar" ? "تكلفة الوحدة" : "Unit cost"}>
              <input
                type="number"
                value={form.unit_cost}
                onChange={(e) => setForm({ ...form, unit_cost: Number(e.target.value) })}
                className="h-9 w-full rounded-md border border-input bg-surface px-3 text-sm"
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-md border border-border px-4 text-sm hover:bg-surface-2"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={save}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
