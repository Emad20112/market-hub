import { useModules } from "@/lib/modules";
import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import {
  Warehouse,
  Search,
  ArrowUpDown,
  AlertTriangle,
  X,
  Plus,
  Minus,
  Package,
  LayoutGrid,
  List,
  TableProperties,
  Barcode,
  Boxes,
  MapPin,
  Tag,
  CheckCircle2,
  Loader2,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
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
import { moneyCell, qtyCell } from "@/lib/format";
import { useBreakpoint } from "@/design/breakpoints";
import { useRealtimeTable } from "@/lib/realtime";
import { QUERY_KEYS } from "@/lib/query-keys";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — Vortex ERP" }] }),
  component: InventoryPage,
});

const INVENTORY_PAGE_SIZE = 50;

/**
 * Stock state derived purely from data already present on the row.
 * No schema change is involved — this is a client-side classification.
 */
type StockState = "out" | "low" | "near" | "healthy" | "untracked";

type Row = {
  id: string;
  name: string;
  name_ar: string | null;
  sku: string | null;
  barcode: string | null;
  min_stock: number;
  cost_price: number;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  shelf_location: string | null;
  category?: { name: string; name_ar: string | null } | null;
  brand?: { name: string; name_ar: string | null } | null;
  unit?: { short_name: string; name_ar: string | null } | null;
  inventory: { warehouse_id: string; quantity: number }[];
};

function InventoryPage() {
  const { t, lang } = useI18n();
  const { isModuleEnabled } = useModules();
  const { hasRole, isPlatformAdmin, isPlatformSuperadmin } = useAuth();
  const canViewCost =
    isPlatformAdmin ||
    isPlatformSuperadmin ||
    hasRole("owner") ||
    hasRole("manager") ||
    hasRole("accountant");
  const qc = useQueryClient();
  const breakpoint = useBreakpoint();
  const tableUsesHorizontalScroll =
    breakpoint === "xs" || breakpoint === "sm" || breakpoint === "md";

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [quickFilter, setQuickFilter] = useState<"all" | "low" | "out" | "healthy">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("grid");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [adjust, setAdjust] = useState<{ product: Row } | null>(null);

  const { data: warehouses } = useQuery({
    queryKey: QUERY_KEYS.warehouses,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, code, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!warehouses?.length) return;
    if (!warehouseId) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);

  /*
   * Read-only streaming query.
   *
   * Previously this page fetched the ENTIRE active catalogue on every visit.
   * It now requests 50 rows at a time with `.range()`, exactly like the
   * products page, so the payload stays flat as the catalogue grows. No schema,
   * RLS or RPC was touched — this only narrows an existing SELECT.
   */
  const {
    data: rowPages,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: QUERY_KEYS.inventory(warehouseId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * INVENTORY_PAGE_SIZE;
      const to = from + INVENTORY_PAGE_SIZE - 1;
      const { data, error: rowsError } = await (supabase.from("products") as any)
        .select(
          "id, name, name_ar, sku, barcode, min_stock, cost_price, category_id, brand_id, unit_id, shelf_location, category:categories(name, name_ar), brand:brands(name, name_ar), unit:units(short_name, name_ar), inventory(warehouse_id, quantity)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (rowsError) throw rowsError;
      const rows = (data ?? []) as unknown as Row[];
      return { rows, hasMore: rows.length === INVENTORY_PAGE_SIZE };
    },
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length : undefined),
    enabled: true,
  });

  // The stream never knows the catalogue size, so the total comes from a
  // dedicated count query that returns no rows at all.
  const { data: totalCount } = useQuery({
    queryKey: ["inventory", "count"],
    queryFn: async () => {
      const { count, error: countError } = await (supabase.from("products") as any)
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("is_active", true);
      if (countError) throw countError;
      return count ?? 0;
    },
    staleTime: 30_000,
  });

  const rows = useMemo(() => rowPages?.pages.flatMap((page) => page.rows) ?? [], [rowPages]);

  useRealtimeTable<Row>(
    { table: "inventory", queryKey: QUERY_KEYS.inventory(warehouseId), debounceMs: 150 },
    qc,
  );

  const label = (en?: string | null, ar?: string | null) =>
    (lang === "ar" ? ar || en : en || ar) ?? "—";

  /** Quantity for the selected warehouse (or the sum across all of them). */
  const qtyFor = (r: Row) => {
    if (!warehouseId) return r.inventory.reduce((a, i) => a + Number(i.quantity), 0);
    return Number(r.inventory.find((i) => i.warehouse_id === warehouseId)?.quantity ?? 0);
  };

  /**
   * Stock classification. Derived entirely on the client from `quantity` and
   * the product's existing `min_stock` — no new column or stored state.
   */
  const stateFor = (r: Row): StockState => {
    const min = Number(r.min_stock) || 0;
    const qty = qtyFor(r);
    if (min <= 0) return qty <= 0 ? "out" : "untracked";
    if (qty <= 0) return "out";
    if (qty <= min) return "low";
    if (qty <= min * 1.2) return "near";
    return "healthy";
  };

  const stateLabel = (s: StockState) =>
    s === "out"
      ? t("inventory.status.out")
      : s === "low"
        ? t("inventory.status.low")
        : s === "near"
          ? t("inventory.status.near")
          : t("inventory.status.healthy");

  const barClass = (s: StockState) =>
    s === "out"
      ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.45)]"
      : s === "low"
        ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
        : s === "near"
          ? "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.4)]"
          : s === "healthy"
            ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
            : "bg-muted-foreground/30";

  /* ---------------- search (fuzzy, Arabic-normalised) ---------------- */
  const searchIndex = useMemo(
    () => buildSearchIndex(rows, (r) => [r.name, r.name_ar, r.sku, r.barcode]),
    [rows],
  );

  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return fuzzySearch(searchIndex, q, { threshold: 0.5, requireAll: true }).map((m) => m.item);
  }, [rows, query, searchIndex]);

  /* ---------------- filters ---------------- */
  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const defs: FilterDefinition[] = [];
    if (isModuleEnabled("multi_warehouse") && warehouses?.length) {
      defs.push({
        key: "warehouse",
        label: lang === "ar" ? "المستودع" : "Warehouse",
        type: "select",
        options: warehouses.map((w: any) => ({
          value: w.id,
          label: label(w.name, w.name_ar),
        })),
      });
    }
    defs.push({
      key: "status",
      label: t("inventory.status"),
      type: "select",
      options: [
        { value: "out", label: t("inventory.status.out") },
        { value: "low", label: t("inventory.status.low") },
        { value: "near", label: t("inventory.status.near") },
        { value: "healthy", label: t("inventory.status.healthy") },
      ],
    });
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, isModuleEnabled, lang, t]);

  const filtered = useMemo(
    () =>
      applyFilters(searched, filters, {
        status: (r) => stateFor(r),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, filters, warehouseId],
  );

  const displayRows = useMemo(
    () =>
      filtered.filter((r) => {
        const s = stateFor(r);
        if (quickFilter === "low") return s === "low" || s === "near";
        if (quickFilter === "out") return s === "out";
        if (quickFilter === "healthy") return s === "healthy" || s === "untracked";
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, quickFilter, warehouseId],
  );

  /* ---------------- KPI counts (over loaded rows) ---------------- */
  const kpi = useMemo(() => {
    let low = 0;
    let out = 0;
    let value = 0;
    for (const r of rows) {
      const s = stateFor(r);
      if (s === "out") out++;
      else if (s === "low" || s === "near") low++;
      if (canViewCost) value += qtyFor(r) * (Number(r.cost_price) || 0);
    }
    return { low, out, value };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, canViewCost, warehouseId]);

  /* ---------------- sort options ---------------- */
  const sortOptions = useMemo<SortOption[]>(() => {
    void sort;
    return [
      { value: "", label: lang === "ar" ? "الافتراضي (الأحدث)" : "Default (newest)" },
      { value: "on_hand", label: t("inventory.sort.on_hand") },
      { value: "min_stock", label: t("inventory.sort.min") },
      { value: "gap", label: t("inventory.sort.gap") },
      { value: "name", label: t("common.name") },
      { value: "sku", label: t("products.sku") },
    ];
  }, [lang, t, sort]);

  const sortedRows = useMemo(() => {
    if (!sort?.key) return displayRows;
    const dir = sort.direction === "desc" ? -1 : 1;
    const val = (r: Row): string | number => {
      switch (sort.key) {
        case "on_hand":
          return qtyFor(r);
        case "min_stock":
          return Number(r.min_stock) || 0;
        case "gap":
          return Math.max(0, (Number(r.min_stock) || 0) - qtyFor(r));
        case "sku":
          return r.sku ?? "";
        default:
          return (lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar) ?? "";
      }
    };
    return [...displayRows].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), lang === "ar" ? "ar" : "en") * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayRows, sort, lang, warehouseId]);

  const openAdjust = (r: Row) => {
    if (!warehouseId) {
      toast.error(t("inventory.select_warehouse"));
      return;
    }
    setAdjust({ product: r });
  };

  /* ---------------- classic table columns ---------------- */
  const columns = useMemo<DataTableColumn<Row>[]>(() => {
    const statusTone = (s: StockState) =>
      s === "out" ? "danger" : s === "low" ? "warning" : s === "near" ? "warning" : "success";
    return [
      {
        key: "name",
        header: t("products.product"),
        sortable: true,
        width: "w-[240px]",
        sortValue: (r) => (lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar) ?? "",
        cell: (r) => {
          const primary = lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar || "—";
          const other = lang === "ar" ? r.name : r.name_ar;
          const secondary = other && other.trim() && other.trim() !== primary.trim() ? other : null;
          return (
            <div className="flex flex-col py-0.5">
              <span
                className="truncate text-sm font-semibold leading-snug text-foreground"
                dir={lang === "ar" ? "rtl" : "ltr"}
              >
                {primary}
              </span>
              {secondary ? (
                <span
                  className="truncate text-[11px] text-muted-foreground"
                  dir={lang === "ar" ? "ltr" : "rtl"}
                >
                  {secondary}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "sku",
        header: t("products.sku"),
        width: "w-[130px]",
        cell: (r) => (
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {r.sku ?? "—"}
          </span>
        ),
      },
      {
        key: "min_stock",
        header: t("products.min"),
        align: "end",
        sortable: true,
        width: "w-[110px]",
        sortValue: (r) => Number(r.min_stock) || 0,
        cell: (r) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {qtyCell(r.min_stock)}
          </span>
        ),
      },
      {
        key: "on_hand",
        header: t("inventory.on_hand"),
        align: "end",
        sortable: true,
        width: "w-[124px]",
        sortValue: (r) => qtyFor(r),
        cell: (r) => {
          const s = stateFor(r);
          const tone =
            s === "out"
              ? "text-red-500"
              : s === "low"
                ? "text-amber-500"
                : s === "near"
                  ? "text-orange-400"
                  : s === "healthy"
                    ? "text-emerald-500"
                    : "text-muted-foreground";
          return (
            <span className={`font-mono text-xs font-bold tabular-nums ${tone}`}>
              {qtyCell(qtyFor(r))}
            </span>
          );
        },
      },
      {
        key: "status",
        header: t("inventory.status"),
        width: "w-[130px]",
        cell: (r) => {
          const s = stateFor(r);
          return (
            <StatusBadge tone={statusTone(s)} dot>
              {stateLabel(s)}
            </StatusBadge>
          );
        },
      },
      {
        key: "actions",
        header: t("common.actions"),
        align: "end",
        width: "w-[110px]",
        cell: (r) => (
          <div className="inline-flex items-center gap-1.5 pe-2">
            <IconButton
              size="sm"
              variant="outline"
              tooltip
              ariaLabel={t("inventory.adjust_stock")}
              icon={<ArrowUpDown />}
              round
              onClick={(event) => {
                event.stopPropagation();
                openAdjust(r);
              }}
            />
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, t, warehouseId]);

  const emptyState = (
    <div className="card-mullak flex flex-col items-center justify-center space-y-3 p-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-muted/30 text-muted-foreground">
        <Warehouse className="size-8" />
      </div>
      <h4 className="text-base font-bold text-foreground">{t("inventory.no_inventory")}</h4>
      <p className="max-w-sm text-xs text-muted-foreground">{t("inventory.empty_hint")}</p>
    </div>
  );

  return (
    <div className="space-y-4 pb-12">
      <PageHeader title={t("inventory.title")} subtitle={t("inventory.subtitle")} />

      {/* ─── KPI cards: stock health at a glance ─── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
              {t("inventory.kpi.total")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {(totalCount ?? rows.length).toLocaleString()}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
              <Sparkles className="size-3 text-primary" />
              {lang === "ar" ? "أصناف نشطة" : "active items"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm transition-transform group-hover:scale-105">
            <Package className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-primary/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/90 sm:text-xs">
              {t("inventory.kpi.low")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-amber-400 sm:text-2xl">
              {kpi.low.toLocaleString()}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-500/80">
              <TrendingDown className="size-3" />
              {lang === "ar" ? "تحت الحد الأدنى" : "below minimum"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-sm transition-transform group-hover:scale-105">
            <AlertTriangle className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-amber-500/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-500/90 sm:text-xs">
              {t("inventory.kpi.out")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-red-400 sm:text-2xl">
              {kpi.out.toLocaleString()}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-500/80">
              <AlertTriangle className="size-3" />
              {lang === "ar" ? "بحاجة لإعادة تعبئة" : "needs restocking"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 shadow-sm transition-transform group-hover:scale-105">
            <Boxes className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-red-500/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/90 sm:text-xs">
              {t("inventory.kpi.value")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-emerald-400 sm:text-2xl">
              {canViewCost ? moneyCell(kpi.value) : "•••"}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-500/80">
              <Wallet className="size-3" />
              {lang === "ar" ? "بسعر التكلفة" : "at cost"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-sm transition-transform group-hover:scale-105">
            <Wallet className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-emerald-500/10 blur-xl" />
        </div>
      </div>

      {/* ─── Toolbar: search + filters + sort + view toggle + quick pills ─── */}
      <div className="pt-2 sm:pt-3.5">
        <TableToolbar
          sticky
          search={{
            value: query,
            onValueChange: setQuery,
            placeholder: t("inventory.search"),
            resultCount: totalCount ?? displayRows.length,
            loading: isFetching && !isLoading,
          }}
          filters={{
            definitions: filterDefinitions,
            values: filters,
            onValueChange: (v) => {
              setFilters(v);
              const w = typeof v.warehouse === "string" ? v.warehouse : "";
              if (w) setWarehouseId(w);
            },
          }}
          sort={{
            options: sortOptions,
            value: sort?.key ?? "",
            onValueChange: (v) => setSort(v ? { key: v, direction: "asc" } : null),
            label: lang === "ar" ? "ترتيب" : "Sort",
          }}
          viewToggle={
            <ToolbarAction
              label={
                viewMode === "grid"
                  ? t("inventory.view_grid")
                  : viewMode === "list"
                    ? t("inventory.view_list")
                    : t("inventory.view_classic")
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
        >
          {viewMode !== "table" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(
                [
                  { id: "all", label: t("inventory.quick.all"), count: totalCount ?? rows.length },
                  { id: "low", label: t("inventory.quick.low"), count: kpi.low },
                  { id: "out", label: t("inventory.quick.out"), count: kpi.out },
                  {
                    id: "healthy",
                    label: t("inventory.quick.healthy"),
                    count: Math.max(0, rows.length - kpi.low - kpi.out),
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setQuickFilter(f.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
                    quickFilter === f.id
                      ? "border-primary bg-primary text-primary-foreground shadow-xs shadow-primary/20"
                      : "border-border/70 bg-surface/70 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-mono ${
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
          )}
        </TableToolbar>
      </div>

      {/* ─── Grid view ─── */}
      {viewMode === "grid" ? (
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="card-mullak h-44 animate-pulse rounded-2xl bg-surface-2/40"
                />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {sortedRows.map((r) => {
                  const s = stateFor(r);
                  const primary = lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar || "—";
                  const other = lang === "ar" ? r.name : r.name_ar;
                  const secondary =
                    other && other.trim() && other.trim() !== primary.trim() ? other : null;
                  const qty = qtyFor(r);
                  const min = Number(r.min_stock) || 0;
                  return (
                    <div
                      key={r.id}
                      onClick={() => openAdjust(r)}
                      className={`card-mullak group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-r-4 p-4 transition-all duration-200 sm:p-5 ${
                        s === "out"
                          ? "border-r-red-500 hover:border-red-500/60"
                          : s === "low"
                            ? "border-r-amber-500 hover:border-amber-500/60"
                            : s === "near"
                              ? "border-r-orange-400 hover:border-orange-400/60"
                              : s === "healthy"
                                ? "border-r-emerald-500 hover:border-primary/40"
                                : "border-r-muted-foreground/40"
                      }`}
                    >
                      <div className="mb-2.5 flex items-center justify-between gap-2">
                        <span className="inline-flex max-w-[150px] items-center gap-1 truncate rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                          <Tag className="size-3 shrink-0" />
                          <span className="truncate">
                            {label(r.category?.name, r.category?.name_ar) ||
                              (lang === "ar" ? "عام" : "General")}
                          </span>
                        </span>
                        <span
                          className={`size-2 shrink-0 rounded-full ${
                            s === "out"
                              ? "bg-red-500 ring-2 ring-red-500/20"
                              : s === "low"
                                ? "bg-amber-500 ring-2 ring-amber-500/20"
                                : s === "near"
                                  ? "bg-orange-400 ring-2 ring-orange-400/20"
                                  : s === "healthy"
                                    ? "bg-emerald-500 ring-2 ring-emerald-500/20"
                                    : "bg-muted-foreground/40"
                          }`}
                          title={stateLabel(s)}
                        />
                      </div>

                      <div className="mb-3">
                        <h4
                          className="line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
                          dir={lang === "ar" ? "rtl" : "ltr"}
                        >
                          {primary}
                        </h4>
                        {secondary && (
                          <p
                            className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80"
                            dir={lang === "ar" ? "ltr" : "rtl"}
                          >
                            {secondary}
                          </p>
                        )}
                      </div>

                      <div className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        {r.sku && (
                          <span className="rounded-md border border-border/50 bg-surface-2/70 px-2 py-0.5 font-mono text-[10px]">
                            {r.sku}
                          </span>
                        )}
                        {r.barcode && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-surface-2/70 px-2 py-0.5 font-mono text-[10px]">
                            <Barcode className="size-2.5" />
                            <span>{r.barcode}</span>
                          </span>
                        )}
                        {r.shelf_location && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-surface-2/70 px-2 py-0.5 text-[10px]">
                            <MapPin className="size-2.5" />
                            <span>{r.shelf_location}</span>
                          </span>
                        )}
                        {min > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-500">
                            <Boxes className="size-2.5" />
                            <span>{qtyCell(min)}</span>
                          </span>
                        )}
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-2 border-t border-border/60 pt-3">
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground">
                            {t("inventory.on_hand")}
                          </p>
                          <p
                            className={`font-mono text-lg font-bold tracking-tight ${
                              s === "out"
                                ? "text-red-500"
                                : s === "low"
                                  ? "text-amber-500"
                                  : s === "near"
                                    ? "text-orange-400"
                                    : s === "healthy"
                                      ? "text-emerald-500"
                                      : "text-foreground"
                            }`}
                          >
                            {qtyCell(qty)}
                          </p>
                          {min > 0 && qty < min && (
                            <p className="text-[10px] font-mono text-red-500/80">
                              {t("inventory.diff")}: {qtyCell(min - qty)}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-90 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                          <IconButton
                            size="sm"
                            variant="outline"
                            tooltip
                            ariaLabel={t("inventory.adjust_stock")}
                            icon={<ArrowUpDown className="size-3.5" />}
                            round
                            onClick={(event) => {
                              event.stopPropagation();
                              openAdjust(r);
                            }}
                          />
                        </div>
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
                    className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-6 py-2.5 text-xs font-bold text-foreground shadow-sm transition hover:bg-surface-2 active:scale-95 disabled:opacity-50"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>{t("inventory.loading_more")}</span>
                      </>
                    ) : (
                      <span>{t("inventory.load_more")}</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* ─── List view: horizontal row cards with accent bar ─── */
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="card-mullak h-20 animate-pulse rounded-2xl bg-surface-2/40"
                />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <>
              <div className="space-y-2.5">
                {sortedRows.map((r) => {
                  const s = stateFor(r);
                  const primary = lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar || "—";
                  const qty = qtyFor(r);
                  const min = Number(r.min_stock) || 0;
                  return (
                    <div
                      key={r.id}
                      onClick={() => openAdjust(r)}
                      className="card-mullak group relative flex cursor-pointer flex-col justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-200 hover:border-primary/50 hover:shadow-md sm:p-4 md:flex-row md:items-center"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span
                          aria-hidden
                          className={`h-11 w-1.5 shrink-0 rounded-full sm:h-12 ${barClass(s)}`}
                        />
                        <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-all group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground">
                          <Package className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4
                              className="truncate text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
                              dir={lang === "ar" ? "rtl" : "ltr"}
                            >
                              {primary}
                            </h4>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-surface-2/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                              {label(r.category?.name, r.category?.name_ar) ||
                                (lang === "ar" ? "عام" : "General")}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {r.sku ? (
                              <span className="rounded-md border border-border/50 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                                {r.sku}
                              </span>
                            ) : null}
                            {r.barcode ? (
                              <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                                <Barcode className="size-2.5" />
                                <span>{r.barcode}</span>
                              </span>
                            ) : null}
                            {r.shelf_location ? (
                              <span className="inline-flex items-center gap-1 text-[10px]">
                                <MapPin className="size-2.5" />
                                <span className="font-mono">{r.shelf_location}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3 ps-4 text-xs sm:gap-4 md:ps-0">
                        {min > 0 && (
                          <div className="hidden items-center gap-1 rounded-xl border border-border/40 bg-surface-2/60 px-2.5 py-1 text-[11px] text-muted-foreground sm:flex">
                            <Boxes className="size-3" />
                            <span className="font-mono">{qtyCell(min)}</span>
                          </div>
                        )}
                        <StatusBadge
                          tone={
                            s === "out"
                              ? "danger"
                              : s === "low" || s === "near"
                                ? "warning"
                                : "success"
                          }
                          dot
                        >
                          {stateLabel(s)}
                        </StatusBadge>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/50 ps-4 pt-2 md:justify-end md:border-t-0 md:pt-0">
                        <div className="text-start md:text-end">
                          <p className="text-[10px] font-medium text-muted-foreground">
                            {t("inventory.on_hand")}
                          </p>
                          <p
                            className={`font-mono text-base font-bold tracking-tight sm:text-lg ${
                              s === "out"
                                ? "text-red-500"
                                : s === "low"
                                  ? "text-amber-500"
                                  : s === "near"
                                    ? "text-orange-400"
                                    : s === "healthy"
                                      ? "text-emerald-500"
                                      : "text-foreground"
                            }`}
                          >
                            {qtyCell(qty)}
                          </p>
                          {canViewCost && min > 0 && qty < min && (
                            <p className="text-[10px] font-mono text-red-500/80">
                              {t("inventory.diff")}: {qtyCell(min - qty)}
                            </p>
                          )}
                        </div>
                        <IconButton
                          size="sm"
                          variant="outline"
                          tooltip
                          ariaLabel={t("inventory.adjust_stock")}
                          icon={<ArrowUpDown className="size-3.5" />}
                          round
                          onClick={(event) => {
                            event.stopPropagation();
                            openAdjust(r);
                          }}
                        />
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
                    className="flex items-center gap-2 rounded-2xl border border-border/80 bg-surface px-6 py-2.5 text-xs font-bold text-foreground shadow-sm transition hover:bg-surface-2 active:scale-95 disabled:opacity-50"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        <span>{t("inventory.loading_more")}</span>
                      </>
                    ) : (
                      <span>{t("inventory.load_more")}</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ─── Classic table view with infinite scroll sentinel ─── */
        <div className="panel-elevated -mx-1 overflow-hidden rounded-2xl border border-border/70 sm:mx-0">
          <DataTable
            className="px-0"
            columns={columns}
            rows={sortedRows}
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
            pageSize={INVENTORY_PAGE_SIZE}
            totalCount={totalCount}
            minWidth={860}
            horizontalScroll={tableUsesHorizontalScroll}
            stickyHeader
            onRowClick={(r) => openAdjust(r)}
            empty={{
              icon: <Warehouse />,
              title: t("inventory.no_inventory"),
              description: t("inventory.empty_hint"),
            }}
          />
        </div>
      )}

      <p className="px-1 text-[11px] text-muted-foreground/70">{t("inventory.scope_hint")}</p>

      {adjust && warehouseId && (
        <AdjustDialog
          product={adjust.product}
          warehouseId={warehouseId}
          currentQty={qtyFor(adjust.product)}
          onClose={() => setAdjust(null)}
          onSaved={() => {
            setAdjust(null);
            qc.invalidateQueries({ queryKey: QUERY_KEYS.inventory(warehouseId) });
            qc.invalidateQueries({ queryKey: ["inventory", "count"] });
          }}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  product,
  warehouseId,
  currentQty,
  onClose,
  onSaved,
}: {
  product: Row;
  warehouseId: string;
  currentQty: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [mode, setMode] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("0");
  const [note, setNote] = useState("");
  // سبب التسوية إلزامي — يُخزّن في عمود adjustment_reason المخصص للتدقيق
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = Number(qty);
    if (!q || q <= 0) {
      toast.error(t("inventory.qty_required"));
      return;
    }
    if (!reason) {
      setReasonError(true);
      toast.error(t("inventory.reason_required"));
      return;
    }
    setSaving(true);
    const signed = mode === "in" ? q : -q;
    const newQty = currentQty + signed;
    if (newQty < 0) {
      toast.error(t("inventory.negative"));
      setSaving(false);
      return;
    }

    // 1) upsert inventory row
    const { error: invErr } = await supabase
      .from("inventory")
      .upsert(
        { product_id: product.id, warehouse_id: warehouseId, quantity: newQty },
        { onConflict: "product_id,warehouse_id" },
      );
    if (invErr) {
      toast.error(invErr.message);
      setSaving(false);
      return;
    }

    // 2) log stock movement
    const { error: mvErr } = await supabase.from("stock_movements").insert({
      product_id: product.id,
      warehouse_id: warehouseId,
      movement_type: "adjustment",
      quantity: signed,
      unit_cost: Number(unitCost) || 0,
      note: note || null,
      adjustment_reason: reason,
      created_by: user?.id ?? null,
    } as any);
    if (mvErr) {
      toast.error(mvErr.message);
      setSaving(false);
      return;
    }

    toast.success(t("inventory.adjusted"));
    setSaving(false);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      mobile="sheet"
      title={t("inventory.adjust_stock")}
      description={`${product.name} · ${t("inventory.on_hand")}: ${currentQty.toFixed(2)}`}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="outline" block={false} onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="inventory-adjust-form"
            variant="primary"
            block={false}
            disabled={saving || !reason}
            icon={saving ? <Loader2 className="animate-spin" /> : undefined}
          >
            {saving ? t("common.saving") : t("inventory.apply")}
          </Button>
        </div>
      }
    >
      <form id="inventory-adjust-form" onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("in")}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition ${mode === "in" ? "border-success/50 bg-success/10 text-success" : "border-border bg-surface text-muted-foreground"}`}
          >
            <Plus className="h-4 w-4" /> {t("inventory.stock_in")}
          </button>
          <button
            type="button"
            onClick={() => setMode("out")}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-md border text-sm font-medium transition ${mode === "out" ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border bg-surface text-muted-foreground"}`}
          >
            <Minus className="h-4 w-4" /> {t("inventory.stock_out")}
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("common.quantity")}
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none"
            required
            autoFocus
          />
        </label>

        {mode === "in" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("inventory.unit_cost")}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm outline-none"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("inventory.reason_label")}
          </span>
          <select
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (e.target.value) setReasonError(false);
            }}
            aria-invalid={reasonError}
            className={`h-9 rounded-md border bg-surface px-3 text-sm outline-none ${reasonError ? "border-destructive text-destructive" : "border-border"}`}
          >
            <option value="">{t("inventory.reason_select")}</option>
            <option value="damaged">{t("inventory.reason.damaged")}</option>
            <option value="expiry">{t("inventory.reason.expiry")}</option>
            <option value="shortfall">{t("inventory.reason.shortfall")}</option>
            <option value="surplus">{t("inventory.reason.surplus")}</option>
            <option value="stocktake">{t("inventory.reason.stocktake")}</option>
            <option value="other">{t("inventory.reason.other")}</option>
          </select>
          {reasonError && (
            <span className="text-[11px] font-medium text-destructive">
              {t("inventory.reason_required")}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("common.note")}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="resize-none rounded-md border border-border bg-surface p-3 text-sm outline-none"
            placeholder={t("inventory.reason")}
          />
        </label>

        <div className="rounded-md border border-border bg-surface/60 p-3 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>{t("inventory.new_on_hand")}</span>
            <span className="font-mono text-foreground">
              {(currentQty + (mode === "in" ? Number(qty) : -Number(qty || 0))).toFixed(2)}
            </span>
          </div>
        </div>
      </form>
    </Modal>
  );
}
