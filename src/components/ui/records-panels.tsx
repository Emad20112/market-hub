import * as React from "react";
import { CalendarDays, Check, ChevronDown, ListFilter, Search, ToggleLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/lib/i18n";
import type { FilterDefinition, FilterValues, SortOption } from "@/components/ui/table-toolbar";

/**
 * Filter and sort panels shared by every records screen.
 *
 * `table-toolbar.tsx` already had these, but they were private to that file and
 * tightly coupled to its own label-resolution contract. The records toolbar
 * needs the same two panels, so they are lifted here as first-class components
 * with the same behaviour the operators already know:
 *
 *  - a **draft** that only commits on "Apply", so tapping through five selects
 *    does not refetch five times;
 *  - a bottom sheet on phones and a small anchored panel on desktop
 *    (`Modal` handles that), because neither needs the full screen;
 *  - a live count of what is currently applied, so "Apply" is never pressed
 *    blind.
 */

const controlClass =
  "h-11 w-full rounded-full border border-border/70 bg-surface/55 px-4 text-sm text-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground/70 hover:border-primary/30 hover:bg-surface/75 focus:border-primary/60 focus:bg-surface/85 focus:outline-none focus:ring-4 focus:ring-primary/12";

function countActive(values: FilterValues): number {
  return Object.values(values).filter((value) => {
    if (value == null) return false;
    if (typeof value === "string") return value !== "";
    return Boolean(value.from || value.to);
  }).length;
}

function filterIcon(type: FilterDefinition["type"]) {
  const Icon =
    type === "date-range"
      ? CalendarDays
      : type === "text"
        ? Search
        : type === "boolean"
          ? ToggleLeft
          : ListFilter;
  return <Icon className="size-3.5" aria-hidden />;
}

export interface RecordsFilterPanelProps {
  open: boolean;
  onClose: () => void;
  definitions: FilterDefinition[];
  values: FilterValues;
  onSubmit: (values: FilterValues) => void;
  title?: string;
}

export function RecordsFilterPanel({
  open,
  onClose,
  definitions,
  values,
  onSubmit,
  title,
}: RecordsFilterPanelProps) {
  const { t } = useI18n();
  const [draft, setDraft] = React.useState<FilterValues>(values);

  // Re-seed on every open so the panel always reflects what is applied.
  React.useEffect(() => {
    if (open) setDraft(values);
  }, [open, values]);

  const activeCount = countActive(draft);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t("common.filter")}
      description={
        activeCount > 0
          ? t("records.filters.active").replace("{count}", String(activeCount))
          : undefined
      }
      size="sm"
      desktop="popover-start"
      sheetUntil="lg"
      footer={
        <div className="flex w-full items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft({})}
            disabled={activeCount === 0}
            className="flex-1"
            block={false}
          >
            {t("common.clear")}
          </Button>
          <Button type="button" onClick={() => onSubmit(draft)} className="flex-1" block={false}>
            {t("records.apply")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {definitions.map((definition) => (
          <FilterControl
            key={definition.key}
            def={definition}
            value={draft[definition.key]}
            onChange={(value) => setDraft((prev) => ({ ...prev, [definition.key]: value }))}
          />
        ))}
      </div>
    </Modal>
  );
}

function FilterControl({
  def,
  value,
  onChange,
}: {
  def: FilterDefinition;
  value: FilterValues[string];
  onChange: (value: FilterValues[string]) => void;
}) {
  const { t } = useI18n();

  const labelBlock = (
    <span className="flex items-center gap-1.5 text-label text-muted-foreground">
      <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary">
        {filterIcon(def.type)}
      </span>
      {def.label}
    </span>
  );

  if (def.type === "select") {
    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`filter-${def.key}`}
          className="flex items-center gap-1.5 text-label text-muted-foreground"
        >
          <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary">
            {filterIcon(def.type)}
          </span>
          {def.label}
        </label>
        <div className="relative">
          <select
            id={`filter-${def.key}`}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onChange(event.target.value || undefined)}
            className={`${controlClass} appearance-none pe-10`}
          >
            <option value="">{t("common.all")}</option>
            {def.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute inset-y-0 end-4 my-auto size-4 text-muted-foreground"
            aria-hidden
          />
        </div>
      </div>
    );
  }

  if (def.type === "boolean") {
    const current = typeof value === "string" ? value : "";
    return (
      <div className="flex flex-col gap-1.5">
        {labelBlock}
        <div className="flex gap-1.5" role="radiogroup" aria-label={def.label}>
          {[
            { value: "", label: t("common.all") },
            { value: "true", label: t("common.yes") },
            { value: "false", label: t("common.no") },
          ].map((option) => {
            const selected = current === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(option.value || undefined)}
                className={cn(
                  "h-10 flex-1 rounded-full border text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected
                    ? "border-primary/45 bg-primary/12 text-primary"
                    : "border-border/70 bg-surface/60 text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (def.type === "date-range") {
    const range = typeof value === "object" && value != null ? value : {};
    return (
      <div className="flex flex-col gap-1.5">
        {labelBlock}
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            aria-label={`${def.label} — ${t("common.from")}`}
            value={range.from ?? ""}
            onChange={(event) => onChange({ ...range, from: event.target.value || undefined })}
            className={controlClass}
          />
          <input
            type="date"
            aria-label={`${def.label} — ${t("common.to")}`}
            value={range.to ?? ""}
            onChange={(event) => onChange({ ...range, to: event.target.value || undefined })}
            className={controlClass}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={`filter-${def.key}`}
        className="flex items-center gap-1.5 text-label text-muted-foreground"
      >
        <span className="grid size-5 place-items-center rounded-full bg-primary/10 text-primary">
          {filterIcon(def.type)}
        </span>
        {def.label}
      </label>
      <input
        id={`filter-${def.key}`}
        value={typeof value === "string" ? value : ""}
        placeholder={def.placeholder}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={controlClass}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sort panel                                                        */
/* ------------------------------------------------------------------ */

export interface RecordsSortPanelProps {
  open: boolean;
  onClose: () => void;
  options: SortOption[];
  value: string;
  onSubmit: (value: string) => void;
  title?: string;
}

export function RecordsSortPanel({
  open,
  onClose,
  options,
  value,
  onSubmit,
  title,
}: RecordsSortPanelProps) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t("common.sort")}
      size="sm"
      desktop="popover-start"
      sheetUntil="lg"
    >
      <div className="flex flex-col gap-1" role="listbox" aria-label={t("common.sort")}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSubmit(option.value)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-full border border-transparent px-3.5 py-2.5 text-start text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selected
                  ? "border-primary/25 bg-primary/12 font-medium text-primary"
                  : "text-foreground hover:border-border/70 hover:bg-surface-2/70",
              )}
            >
              <span className="truncate">{option.label}</span>
              {selected ? <Check className="size-4 shrink-0" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
