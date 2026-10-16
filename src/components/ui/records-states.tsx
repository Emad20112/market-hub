import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState, Spinner } from "@/components/ui/feedback";
import { QueryErrorState } from "@/components/ui/connection";
import type { RecordsViewMode } from "@/components/ui/records-view";

/**
 * RecordsStates — the ONE set of loading / empty / error presentations for
 * every records list, in every view mode.
 *
 * Before this, each screen re-rolled its own spinner, its own card skeleton
 * (four copies in products alone), its own empty panel — and some screens
 * showed "no data" while the first fetch was still in flight. What lives here:
 *
 *  - `RecordsSkeleton` — density matched to the active view mode:
 *      cards → the same unified grid the cards render into,
 *      list  → row-height placeholders,
 *      table → a header strip plus row bars. One animation (`shimmer`).
 *  - `RecordsEmpty` — the shared `EmptyState`, page variant.
 *  - `RecordsError` — the shared `QueryErrorState` with one retry button.
 *
 * Contract: an empty state may ONLY render when `loading` is false. Screens
 * that hand their list to `RecordsView` get this for free; screens rendering
 * their own modes must use these primitives so the shapes stay identical.
 */

/** The unified cards grid — matches `RecordsView`'s default. */
export const UNIFIED_CARDS_GRID =
  "grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5";

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

export function RecordsSkeleton({
  mode,
  count,
  className,
}: {
  mode: RecordsViewMode;
  /** How many placeholders to draw; defaults to one screen's worth per mode. */
  count?: number;
  className?: string;
}) {
  if (mode === "table") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "panel-elevated -mx-1 overflow-hidden rounded-2xl border border-border/70 sm:mx-0",
          className,
        )}
      >
        <div className="flex h-11 items-center gap-4 border-b border-border/60 bg-surface-2/40 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 w-20 rounded-full bg-surface-3/70 shimmer" />
          ))}
        </div>
        {Array.from({ length: count ?? 7 }).map((_, i) => (
          <div
            key={i}
            className="flex h-12 items-center gap-4 border-b border-border/40 px-4 last:border-b-0"
          >
            {Array.from({ length: 5 }).map((_, j) => (
              <div
                key={j}
                className="h-3 rounded-full bg-surface-2/80 shimmer"
                style={{ width: j === 0 ? "18%" : `${10 + ((i + j) % 3) * 4}%` }}
              />
            ))}
          </div>
        ))}
        <span className="sr-only">
          <Spinner /> Loading
        </span>
      </div>
    );
  }

  if (mode === "list") {
    return (
      <div role="status" aria-live="polite" className={cn("space-y-2.5", className)}>
        {Array.from({ length: count ?? 6 }).map((_, i) => (
          <div key={i} className="card-mullak h-20 rounded-2xl bg-surface-2/40 shimmer" />
        ))}
        <span className="sr-only">
          <Spinner /> Loading
        </span>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cn(UNIFIED_CARDS_GRID, className)}>
      {Array.from({ length: count ?? 8 }).map((_, i) => (
        <div key={i} className="card-mullak h-44 rounded-2xl bg-surface-2/40 shimmer" />
      ))}
      <span className="sr-only">
        <Spinner /> Loading
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty                                                              */
/* ------------------------------------------------------------------ */

export interface RecordsEmptyProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Usually the "New …" action, repeated inside the empty state. */
  action?: React.ReactNode;
  hint?: string;
  className?: string;
}

export function RecordsEmpty({
  title,
  description,
  icon,
  action,
  hint,
  className,
}: RecordsEmptyProps) {
  return (
    <EmptyState
      variant="page"
      icon={icon ?? <Inbox />}
      title={title}
      description={description}
      action={action}
      hint={hint}
      className={className}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Error                                                              */
/* ------------------------------------------------------------------ */

export function RecordsError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return <QueryErrorState error={error} onRetry={onRetry} className={className} />;
}
