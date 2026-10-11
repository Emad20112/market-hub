import * as React from "react";
import { ArrowDownUp, Filter as FilterIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";
import { RecordsViewToggle } from "@/components/ui/records-view-toggle";
import { RecordsColumnPicker } from "@/components/ui/records-column-picker";
import type { RecordsViewMode } from "@/components/ui/records-view";
import type { ColumnDefinition, ColumnVisibility } from "@/lib/records/column-registry";
import { useI18n } from "@/lib/i18n";

/**
 * RecordsToolbar — the one bar at the top of every records screen (plan §9.1).
 *
 * It replaces the per-page assemblies of search + filter panel + sort panel +
 * a bespoke view button. What it guarantees, on every screen that uses it:
 *
 *  - **Search, filter, sort, view and columns always sit in the same order**,
 *    so muscle memory transfers between screens.
 *  - **The filter bar stays visible in all three view modes.** Filter chips
 *    render under the search row regardless of whether the records below are
 *    cards, a list or a table — a filter row that disappeared when you switched
 *    to table mode was one of the reported inconsistencies.
 *  - **Active filters are counted and clearable in one press**, with the count
 *    on the filter button itself.
 *  - **The primary action is on the same row** and is a single element, so
 *    "New …" cannot appear twice.
 *
 * The component owns presentation only. Data, filtering and permissions stay
 * with the screen; `onFilterOpen`/`onSortOpen` are simple callbacks so a screen
 * can keep using its existing panel markup if it has one.
 */
export interface RecordsToolbarProps {
  /* ---- search ---- */
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Number shown beside the search box. Must be the *match* count. */
  resultCount?: number;
  searchLoading?: boolean;
  /** Slot rendered inside the search row, before the controls (e.g. a hint). */
  searchAdornment?: React.ReactNode;

  /* ---- filters ---- */
  activeFilterCount?: number;
  onFilterOpen?: () => void;
  /** Chips row. Omit to render no chip strip. */
  filterChips?: React.ReactNode;
  onClearFilters?: () => void;
  filterLabel?: string;
  /** Hides the filter button entirely (a screen with no filters). */
  hideFilter?: boolean;

  /* ---- sort ---- */
  onSortOpen?: () => void;
  sortActive?: boolean;
  sortLabel?: string;

  /* ---- view mode ---- */
  viewMode?: RecordsViewMode;
  onViewModeChange?: (mode: RecordsViewMode) => void;
  viewModes?: RecordsViewMode[];

  /* ---- columns ---- */
  columns?: ColumnDefinition[];
  columnVisibility?: ColumnVisibility;
  onToggleColumn?: (key: string) => void;
  onResetColumns?: () => void;

  /* ---- actions ---- */
  action?: React.ReactNode;
  end?: React.ReactNode;

  sticky?: boolean;
  className?: string;
  /** Extra row under the chips (e.g. quick-filter segments on inventory). */
  children?: React.ReactNode;
}

export function RecordsToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  resultCount,
  searchLoading,
  searchAdornment,
  activeFilterCount = 0,
  onFilterOpen,
  filterChips,
  onClearFilters,
  filterLabel,
  hideFilter = false,
  onSortOpen,
  sortActive = false,
  sortLabel,
  viewMode,
  onViewModeChange,
  viewModes,
  columns,
  columnVisibility,
  onToggleColumn,
  onResetColumns,
  action,
  end,
  sticky = true,
  className,
  children,
}: RecordsToolbarProps) {
  const { t } = useI18n();
  const showColumns = Boolean(
    columns?.length && columnVisibility && onToggleColumn && onResetColumns,
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-2",
        sticky &&
          "sticky top-0 z-30 -mx-1 rounded-2xl border border-border/60 bg-surface/92 px-2 py-2 backdrop-blur-xl sm:mx-0 sm:px-3",
        className,
      )}
    >
      {/* Row 1 — search on a flexible track, then the controls. The action is
       *  last so it always sits on the trailing edge in both directions. */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <SearchInput
          value={searchValue}
          onValueChange={onSearchChange}
          placeholder={searchPlaceholder}
          resultCountText={resultCount == null ? undefined : String(resultCount)}
          clearLabel={t("common.clear")}
          loading={searchLoading}
          enableSlashShortcut
          containerClassName="flex-1 min-w-0"
        />
        {searchAdornment}

        {!hideFilter && onFilterOpen ? (
          <ToolbarIconAction
            label={filterLabel ?? t("common.filter")}
            onClick={onFilterOpen}
            active={activeFilterCount > 0}
            badge={activeFilterCount}
            controls="records-filter-panel"
            icon={<FilterIcon />}
          />
        ) : null}

        {onSortOpen ? (
          <ToolbarIconAction
            label={sortLabel ?? t("nav.section.operations")}
            onClick={onSortOpen}
            active={sortActive}
            controls="records-sort-panel"
            icon={<ArrowDownUp />}
          />
        ) : null}

        {viewMode && onViewModeChange ? (
          <RecordsViewToggle value={viewMode} onChange={onViewModeChange} modes={viewModes} />
        ) : null}

        {showColumns ? (
          <RecordsColumnPicker
            columns={columns!}
            visibility={columnVisibility!}
            onToggle={onToggleColumn!}
            onReset={onResetColumns!}
          />
        ) : null}

        {end ? <div className="hidden items-center gap-2 xl:flex">{end}</div> : null}

        {action}
      </div>

      {/* Row 2 — active filters. Deliberately OUTSIDE the view-mode branch:
       *  the plan requires the filter bar to be present in cards, list and
       *  table alike. */}
      {(activeFilterCount > 0 || filterChips) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips}
          {activeFilterCount > 0 && onClearFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3" aria-hidden />
              {t("records.filters.clear_all")}
            </button>
          ) : null}
        </div>
      )}

      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Local controls                                                     */
/* ------------------------------------------------------------------ */

/**
 * A toolbar button. Mirrors `ToolbarAction` from `table-toolbar` (icon on a
 * phone, icon + label from `sm` up) but stays local so the records toolbar has
 * no dependency on the older toolbar's label plumbing.
 */
function ToolbarIconAction({
  label,
  icon,
  onClick,
  active = false,
  badge = 0,
  controls,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  badge?: number;
  controls?: string;
}) {
  return (
    <button
      type="button"
      id={controls}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      aria-expanded={active}
      className={cn(
        "relative inline-flex size-10 shrink-0 items-center justify-center gap-1.5 rounded-full border text-sm font-medium shadow-[var(--shadow-control)] backdrop-blur-xl transition-[background-color,border-color,color,transform] duration-200 sm:h-11 sm:w-auto sm:px-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95",
        active
          ? "border-primary/45 bg-primary/12 text-primary"
          : "border-border/70 bg-surface/55 text-muted-foreground hover:border-primary/30 hover:bg-surface/85 hover:text-foreground",
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      {badge > 0 ? (
        <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-surface sm:static sm:ring-0">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
