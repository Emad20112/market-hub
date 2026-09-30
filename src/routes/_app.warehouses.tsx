import { ModuleGuard, useModules } from "@/lib/modules";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Boxes,
  Pencil,
  Plus,
  Star,
  Trash2,
  LayoutGrid,
  List,
  TableProperties,
  MapPin,
  CheckCircle2,
  Sparkles,
  Loader2,
  X,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
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

export const Route = createFileRoute("/_app/warehouses")({
  head: () => ({ meta: [{ title: "المستودعات — فورتيكس ERP" }] }),
  component: () => (
    <ModuleGuard moduleId="multi_warehouse">
      <WarehousesPage />
    </ModuleGuard>
  ),
});

type Row = {
  id: string;
  name: string;
  name_ar: string | null;
  code: string | null;
  address: string | null;
  is_default: boolean;
  is_active: boolean;
};

function WarehousesPage() {
  const { checkQuota } = useModules();
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const breakpoint = useBreakpoint();
  const tableUsesHorizontalScroll =
    breakpoint === "xs" || breakpoint === "sm" || breakpoint === "md";

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [quickFilter, setQuickFilter] = useState<"all" | "active" | "inactive" | "default">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "table">("grid");
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);

  const label = (en?: string | null, ar?: string | null) =>
    (lang === "ar" ? ar || en : en || ar) ?? "—";

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["warehouses-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, code, address, is_default, is_active")
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  /** Stable reference: `data ?? []` would allocate a new array each render and
   * invalidate every downstream useMemo. */
  const rows = useMemo(() => data ?? [], [data]);

  /* ---------------- search (fuzzy) ---------------- */
  const searchIndex = useMemo(
    () => buildSearchIndex(rows, (r) => [r.name, r.name_ar, r.code, r.address]),
    [rows],
  );

  const searched = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    return fuzzySearch(searchIndex, q, { threshold: 0.5, requireAll: true }).map((m) => m.item);
  }, [rows, query, searchIndex]);

  const filtered = useMemo(
    () =>
      applyFilters(searched, filters, {
        status: (r) => (r.is_active ? "active" : "inactive"),
      }),
    [searched, filters],
  );

  const displayRows = useMemo(
    () =>
      filtered.filter((r) => {
        if (quickFilter === "active") return r.is_active;
        if (quickFilter === "inactive") return !r.is_active;
        if (quickFilter === "default") return r.is_default;
        return true;
      }),
    [filtered, quickFilter],
  );

  const kpi = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const r of rows) {
      if (r.is_active) active++;
      else inactive++;
    }
    return { active, inactive };
  }, [rows]);

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    return [
      {
        key: "status",
        label: t("warehouses.filter.status"),
        type: "select",
        options: [
          { value: "active", label: t("common.active") },
          { value: "inactive", label: t("common.inactive") },
        ],
      },
    ];
  }, [t]);

  const sortOptions = useMemo<SortOption[]>(() => {
    return [
      { value: "", label: lang === "ar" ? "الافتراضي" : "Default" },
      { value: "name", label: t("warehouses.sort.name") },
      { value: "code", label: t("warehouses.sort.code") },
    ];
  }, [lang, t]);

  /**
   * The grid/list cards render `displayRows` directly and sort here, so the
   * order matches the classic table. `DataTable` performs the equivalent sort
   * for itself from its `sort` prop — sorting twice would be wasted work.
   */
  const sortedRows = useMemo(() => {
    if (!sort?.key) return displayRows;
    const dir = sort.direction === "desc" ? -1 : 1;
    const val = (r: Row): string => {
      if (sort.key === "code") return r.code ?? "";
      return (lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar) ?? "";
    };
    return [...displayRows].sort(
      (a, b) => val(a).localeCompare(val(b), lang === "ar" ? "ar" : "en") * dir,
    );
  }, [displayRows, sort, lang]);

  /* ---------------- mutations (unchanged DB behaviour) ---------------- */
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.deleted") || "Deleted");
      qc.invalidateQueries({ queryKey: ["warehouses-admin"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("warehouses").update({ is_default: false }).neq("id", id);
      const { error } = await supabase
        .from("warehouses")
        .update({ is_default: true, is_active: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses-admin"] });
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    const qCheck = checkQuota("warehouses", rows.length);
    if (!qCheck.allowed) {
      toast.error(lang === "ar" ? qCheck.message?.ar : qCheck.message?.en);
      return;
    }
    setEditing(null);
    setOpen(true);
  };

  /* ---------------- classic columns ---------------- */
  const columns = useMemo<DataTableColumn<Row>[]>(() => {
    return [
      {
        key: "name",
        header: t("warehouses.name"),
        sortable: true,
        width: "w-[240px]",
        sortValue: (r) => (lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar) ?? "",
        cell: (r) => {
          const primary = lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar || "—";
          const other = lang === "ar" ? r.name : r.name_ar;
          const secondary = other && other.trim() && other.trim() !== primary.trim() ? other : null;
          return (
            <div className="flex flex-col py-0.5">
              <span className="flex items-center gap-2 truncate text-sm font-semibold leading-snug text-foreground">
                {primary}
                {r.is_default && <Star className="size-3.5 shrink-0 text-amber-500" />}
              </span>
              {secondary ? (
                <span className="truncate text-[11px] text-muted-foreground">{secondary}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "code",
        header: t("warehouses.code"),
        sortable: true,
        width: "w-[130px]",
        sortValue: (r) => r.code ?? "",
        cell: (r) => (
          <span className="font-mono text-xs text-muted-foreground">{r.code ?? "—"}</span>
        ),
      },
      {
        key: "address",
        header: t("warehouses.address"),
        width: "w-[260px]",
        cell: (r) => (
          <span className="block truncate text-xs text-muted-foreground">{r.address ?? "—"}</span>
        ),
      },
      {
        key: "status",
        header: t("common.status"),
        width: "w-[130px]",
        cell: (r) => (
          <StatusBadge tone={r.is_active ? "success" : "neutral"} dot>
            {r.is_active ? t("common.active") : t("common.inactive")}
          </StatusBadge>
        ),
      },
      {
        key: "actions",
        header: t("common.actions"),
        align: "end",
        width: "w-[150px]",
        cell: (r) => (
          <div className="inline-flex items-center gap-1.5 pe-2">
            {!r.is_default && (
              <IconButton
                size="sm"
                variant="ghost"
                tooltip
                ariaLabel={t("warehouses.set_default")}
                icon={<Star />}
                round
                onClick={(event) => {
                  event.stopPropagation();
                  setDefault.mutate(r.id);
                }}
              />
            )}
            <IconButton
              size="sm"
              variant="outline"
              tooltip
              ariaLabel={t("common.edit")}
              icon={<Pencil />}
              round
              onClick={(event) => {
                event.stopPropagation();
                setEditing(r);
                setOpen(true);
              }}
            />
            <IconButton
              size="sm"
              variant="danger"
              tooltip
              ariaLabel={t("common.delete")}
              icon={<Trash2 />}
              round
              onClick={(event) => {
                event.stopPropagation();
                setConfirmDelete(r);
              }}
            />
          </div>
        ),
      },
    ];
  }, [lang, t, setDefault]);

  const emptyState = (
    <div className="card-mullak flex flex-col items-center justify-center space-y-3 p-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-muted/30 text-muted-foreground">
        <WarehouseIcon className="size-8" />
      </div>
      <h4 className="text-base font-bold text-foreground">{t("warehouses.empty")}</h4>
      <p className="max-w-sm text-xs text-muted-foreground">{t("warehouses.empty_hint")}</p>
      <Button size="sm" icon={<Plus />} onClick={openNew}>
        {t("warehouses.new")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-4 pb-12">
      <PageHeader title={t("warehouses.title")} subtitle={t("warehouses.subtitle")} />

      {/* ─── KPI cards ─── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-xs">
              {t("warehouses.kpi.total")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {rows.length.toLocaleString()}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
              <Sparkles className="size-3 text-primary" />
              {lang === "ar" ? "مواقع تخزين" : "storage locations"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-sm transition-transform group-hover:scale-105">
            <Boxes className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-primary/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-500/90 sm:text-xs">
              {t("warehouses.kpi.active")}
            </p>
            <h3 className="mt-1 font-mono text-xl font-bold tracking-tight text-emerald-400 sm:text-2xl">
              {kpi.active.toLocaleString()}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-500/80">
              <CheckCircle2 className="size-3" />
              {lang === "ar" ? "جاهزة للعمل" : "ready to use"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-sm transition-transform group-hover:scale-105">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-emerald-500/10 blur-xl" />
        </div>

        <div className="card-mullak group relative flex items-center justify-between overflow-hidden p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-500/90 sm:text-xs">
              {t("warehouses.kpi.default")}
            </p>
            <h3 className="mt-1 truncate text-base font-bold tracking-tight text-amber-400 sm:text-lg">
              {label(rows.find((r) => r.is_default)?.name, rows.find((r) => r.is_default)?.name_ar)}
            </h3>
            <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-500/80">
              <Star className="size-3" />
              {lang === "ar" ? "الوجهة الافتراضية" : "default target"}
            </span>
          </div>
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-sm transition-transform group-hover:scale-105">
            <Star className="size-6" />
          </div>
          <div className="pointer-events-none absolute -left-6 -top-6 size-20 rounded-full bg-amber-500/10 blur-xl" />
        </div>
      </div>

      {/* ─── Toolbar ─── */}
      <div className="pt-2 sm:pt-3.5">
        <TableToolbar
          sticky
          search={{
            value: query,
            onValueChange: setQuery,
            placeholder: t("common.search"),
            resultCount: rows.length,
            loading: isFetching && !isLoading,
          }}
          filters={{ definitions: filterDefinitions, values: filters, onValueChange: setFilters }}
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
                  ? t("warehouses.view_grid")
                  : viewMode === "list"
                    ? t("warehouses.view_list")
                    : t("warehouses.view_classic")
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
              label={t("warehouses.new")}
              icon={<Plus />}
              tone="primary"
              onClick={openNew}
            />
          }
        >
          {viewMode !== "table" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(
                [
                  { id: "all", label: t("warehouses.quick.all"), count: rows.length },
                  { id: "active", label: t("warehouses.quick.active"), count: kpi.active },
                  { id: "inactive", label: t("warehouses.quick.inactive"), count: kpi.inactive },
                  {
                    id: "default",
                    label: t("warehouses.quick.default"),
                    count: rows.filter((r) => r.is_default).length,
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
          )}
        </TableToolbar>
      </div>

      {/* ─── Grid ─── */}
      {viewMode === "grid" ? (
        <div className="space-y-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="card-mullak h-40 animate-pulse rounded-2xl bg-surface-2/40"
                />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {sortedRows.map((r) => {
                const primary = lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar || "—";
                const other = lang === "ar" ? r.name : r.name_ar;
                const secondary =
                  other && other.trim() && other.trim() !== primary.trim() ? other : null;
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                    className={`card-mullak group relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border border-r-4 p-4 transition-all duration-200 sm:p-5 ${
                      !r.is_active
                        ? "border-r-muted-foreground/40 hover:border-border"
                        : r.is_default
                          ? "border-r-amber-500 hover:border-amber-500/60"
                          : "border-r-emerald-500 hover:border-primary/40"
                    }`}
                  >
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <span className="inline-flex size-10 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                        <Boxes className="size-5" />
                      </span>
                      {r.is_default ? (
                        <StatusBadge tone="warning" dot>
                          {t("warehouses.is_default")}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone={r.is_active ? "success" : "neutral"} dot>
                          {r.is_active ? t("common.active") : t("common.inactive")}
                        </StatusBadge>
                      )}
                    </div>

                    <div className="mb-3">
                      <h4
                        className="line-clamp-2 text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
                        dir={lang === "ar" ? "rtl" : "ltr"}
                      >
                        {primary}
                      </h4>
                      {secondary && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">
                          {secondary}
                        </p>
                      )}
                    </div>

                    <div className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      {r.code && (
                        <span className="rounded-md border border-border/50 bg-surface-2/70 px-2 py-0.5 font-mono text-[10px]">
                          {r.code}
                        </span>
                      )}
                      {r.address && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-surface-2/70 px-2 py-0.5 text-[10px]">
                          <MapPin className="size-2.5" />
                          <span className="truncate">{r.address}</span>
                        </span>
                      )}
                    </div>

                    <div className="mt-auto flex items-center justify-end gap-1 border-t border-border/60 pt-3 opacity-90 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      {!r.is_default && (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          tooltip
                          ariaLabel={t("warehouses.set_default")}
                          icon={<Star className="size-3.5" />}
                          round
                          onClick={(event) => {
                            event.stopPropagation();
                            setDefault.mutate(r.id);
                          }}
                        />
                      )}
                      <IconButton
                        size="sm"
                        variant="outline"
                        tooltip
                        ariaLabel={t("common.edit")}
                        icon={<Pencil className="size-3.5" />}
                        round
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(r);
                          setOpen(true);
                        }}
                      />
                      <IconButton
                        size="sm"
                        variant="danger"
                        tooltip
                        ariaLabel={t("common.delete")}
                        icon={<Trash2 className="size-3.5" />}
                        round
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmDelete(r);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* ─── List ─── */
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="card-mullak h-20 animate-pulse rounded-2xl bg-surface-2/40"
                />
              ))}
            </div>
          ) : sortedRows.length === 0 ? (
            emptyState
          ) : (
            <div className="space-y-2.5">
              {sortedRows.map((r) => {
                const primary = lang === "ar" ? r.name_ar || r.name : r.name || r.name_ar || "—";
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setEditing(r);
                      setOpen(true);
                    }}
                    className="card-mullak group relative flex cursor-pointer flex-col justify-between gap-3 rounded-2xl border p-3.5 transition-all duration-200 hover:border-primary/50 hover:shadow-md sm:p-4 md:flex-row md:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        aria-hidden
                        className={`h-11 w-1.5 shrink-0 rounded-full sm:h-12 ${
                          !r.is_active
                            ? "bg-muted-foreground/30"
                            : r.is_default
                              ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                              : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                        }`}
                      />
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary transition-all group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground">
                        <Boxes className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4
                            className="truncate text-sm font-bold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-base"
                            dir={lang === "ar" ? "rtl" : "ltr"}
                          >
                            {primary}
                          </h4>
                          {r.is_default && (
                            <StatusBadge tone="warning" dot>
                              {t("warehouses.is_default")}
                            </StatusBadge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          {r.code && (
                            <span className="rounded-md border border-border/50 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                              {r.code}
                            </span>
                          )}
                          {r.address && (
                            <span className="inline-flex items-center gap-1 text-[10px]">
                              <MapPin className="size-2.5" />
                              {r.address}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/50 pt-2 ps-4 md:border-t-0 md:pt-0">
                      <StatusBadge tone={r.is_active ? "success" : "neutral"} dot>
                        {r.is_active ? t("common.active") : t("common.inactive")}
                      </StatusBadge>
                      <IconButton
                        size="sm"
                        variant="outline"
                        tooltip
                        ariaLabel={t("common.edit")}
                        icon={<Pencil className="size-3.5" />}
                        round
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(r);
                          setOpen(true);
                        }}
                      />
                      <IconButton
                        size="sm"
                        variant="danger"
                        tooltip
                        ariaLabel={t("common.delete")}
                        icon={<Trash2 className="size-3.5" />}
                        round
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirmDelete(r);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ─── Classic ─── */
        <div className="panel-elevated -mx-1 overflow-hidden rounded-2xl border border-border/70 sm:mx-0">
          <DataTable
            className="px-0"
            columns={columns}
            rows={displayRows}
            rowKey={(r) => r.id}
            loading={isLoading}
            initialLoading={isLoading}
            refreshing={isFetching && !isLoading}
            error={(error as Error) ?? null}
            onRetry={() => refetch()}
            sort={sort}
            onSortChange={setSort}
            minWidth={760}
            horizontalScroll={tableUsesHorizontalScroll}
            stickyHeader
            onRowClick={(r) => {
              setEditing(r);
              setOpen(true);
            }}
            empty={{
              icon: <WarehouseIcon />,
              title: t("warehouses.empty"),
              description: t("warehouses.empty_hint"),
              action: (
                <Button size="sm" icon={<Plus />} onClick={openNew}>
                  {t("warehouses.new")}
                </Button>
              ),
            }}
          />
        </div>
      )}

      <p className="px-1 text-[11px] text-muted-foreground/70">{t("warehouses.scope_hint")}</p>

      {open && (
        <WarehouseDialog
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["warehouses-admin"] });
            qc.invalidateQueries({ queryKey: QUERY_KEYS.warehouses });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete != null}
        onClose={() => setConfirmDelete(null)}
        tone="danger"
        title={t("common.delete")}
        description={`${t("common.delete")} ${label(confirmDelete?.name, confirmDelete?.name_ar)}?`}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (confirmDelete) remove.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition";

function WarehouseDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    name_ar: initial?.name_ar ?? "",
    code: initial?.code ?? "",
    address: initial?.address ?? "",
    is_default: initial?.is_default ?? false,
    is_active: initial?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name_ar.trim() && !form.name.trim()) {
      toast.error(t("catalog.name_required"));
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim() || form.name_ar.trim(),
      name_ar: form.name_ar.trim() || null,
      code: form.code.trim() || null,
      address: form.address.trim() || null,
      is_default: form.is_default,
      is_active: form.is_active,
    };
    if (form.is_default) {
      await supabase
        .from("warehouses")
        .update({ is_default: false })
        .neq("id", initial?.id ?? "00000000-0000-0000-0000-000000000000");
    }
    const { error } = initial
      ? await supabase.from("warehouses").update(payload).eq("id", initial.id)
      : await supabase.from("warehouses").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved") || "Saved");
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="panel-elevated w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            {initial ? t("warehouses.edit") : t("warehouses.new")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <Field label={`${t("warehouses.name_ar")} *`}>
            <input
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              className={inputCls}
              dir="rtl"
              required
            />
          </Field>
          <Field label={t("warehouses.name")}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label={t("warehouses.code")}>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label={t("common.status")}>
            <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="text-muted-foreground">{t("common.active")}</span>
            </label>
          </Field>
          <Field label={t("warehouses.address")} className="sm:col-span-2">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label={t("warehouses.is_default")} className="sm:col-span-2">
            <label className="flex h-9 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm">
              <input
                type="checkbox"
                checked={form.is_default}
                onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
              />
              <span className="text-muted-foreground">{t("warehouses.set_default")}</span>
            </label>
          </Field>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface/40 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex h-9 items-center rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
