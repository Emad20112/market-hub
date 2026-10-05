/**
 * Market-Hub ERP — Milling module: shared UI pieces.
 *
 * Small, deliberately plain building blocks so every milling screen looks like
 * the rest of the system (panel-elevated surfaces, rounded-3xl, Tailwind tokens)
 * instead of introducing a second visual language.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Scale, AlertTriangle, TriangleAlert } from "lucide-react";
import type { MillingStatus, MillingOutputType } from "@/lib/milling";
import { STATUS_LABELS_AR } from "@/lib/milling";

/* --------------------------------------------------------------- surfaces */

export function MillingPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "panel-elevated overflow-hidden rounded-3xl border border-border/80 bg-surface/90 shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MillingSectionTitle({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 p-4">
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            {icon}
          </div>
        )}
        <div>
          <h2 className="text-sm font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------- fields */

const fieldBase =
  "h-10 w-full rounded-xl border border-border/70 bg-surface-2/50 px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

export function MillingField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

export function MillingInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(fieldBase, props.className)} />;
}

export function MillingSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(fieldBase, "cursor-pointer", props.className)} />;
}

export function MillingTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        fieldBase,
        "h-auto min-h-[72px] resize-y py-2 leading-relaxed",
        props.className,
      )}
    />
  );
}

/* ----------------------------------------------------------------- badges */

const statusStyles: Record<MillingStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  RECEIVED: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  PROCESSING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  DELIVERED: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  CANCELLED: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

export function StatusBadge({ status }: { status: MillingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        statusStyles[status] ?? statusStyles.DRAFT,
      )}
    >
      {STATUS_LABELS_AR[status] ?? status}
    </span>
  );
}

const outputStyles: Record<MillingOutputType, string> = {
  FLOUR_GRADE_1: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  FLOUR_GRADE_2: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  BRAN: "bg-stone-500/15 text-stone-700 dark:text-stone-300",
  SEMOLINA: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  WASTE: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function OutputBadge({ type, label }: { type: MillingOutputType; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        outputStyles[type] ?? outputStyles.WASTE,
      )}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ stats */

export function StatTile({
  title,
  value,
  unit,
  icon,
  tone = "default",
  hint,
}: {
  title: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
  tone?: "default" | "amber" | "emerald" | "sky" | "violet";
  hint?: string;
}) {
  const tones = {
    default: "border-border/80 bg-surface-2/40 text-foreground",
    amber: "border-amber-500/30 bg-amber-500/8 text-foreground",
    emerald: "border-emerald-500/30 bg-emerald-500/8 text-foreground",
    sky: "border-sky-500/30 bg-sky-500/8 text-foreground",
    violet: "border-violet-500/30 bg-violet-500/8 text-foreground",
  } as const;

  return (
    <div className={cn("rounded-2xl border p-3.5 transition", tones[tone])}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{title}</span>
        {icon && <span className="shrink-0 opacity-70">{icon}</span>}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-xl font-black tabular-nums text-foreground">
          {typeof value === "number" ? value.toLocaleString("en-US") : value}
        </span>
        {unit && <span className="text-[11px] font-bold text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="mt-1 text-[10.5px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ empty state */

/**
 * A failed query rendered as an empty list is not an empty screen - it is a
 * false claim. "No production orders" and "the server did not answer" look
 * identical to a user, and the natural next action is to conclude there is
 * nothing to do. So a failed load must say it failed.
 *
 * `what` names the thing that would have loaded, so the message tells the user
 * what is missing rather than merely that something is.
 */
export function QueryErrorState({
  what,
  error,
  onRetry,
}: {
  what: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const message = error instanceof Error ? error.message : "تعذّر الاتصال بالخادم أو رُفض الطلب.";
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 p-8 text-center"
      data-testid="query-error"
    >
      <TriangleAlert className="h-6 w-6 text-rose-500" />
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">تعذّر تحميل {what}</p>
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{message}</p>
        <p className="text-[11px] text-muted-foreground">
          هذه ليست قائمة فارغة — البيانات لم تصل. جرّب مرة أخرى.
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-border px-3 text-xs font-bold text-foreground transition hover:bg-muted"
        >
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

/**
 * Aggregate guard for a screen that fires several queries. Renders nothing
 * when the data loaded, and the first failure when it did not.
 *
 * Usage:
 *   const failed = queries.find((q) => q.isError);
 *   {failed && <QueryErrorState what="…" error={failed.error} onRetry={failed.refetch} />}
 */
export function QueryErrorGuard({
  what,
  queries,
}: {
  what: string;
  queries: { isError: boolean; error: unknown; refetch: () => unknown }[];
}) {
  const failed = queries.find((q) => q.isError);
  if (!failed) return null;
  return <QueryErrorState what={what} error={failed.error} onRetry={() => void failed.refetch()} />;
}

export function MillingEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500/12 text-amber-500">
        <Scale className="h-6 w-6" />
      </div>
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}

/* ------------------------------------------------------- loss alert banner */

/**
 * The loss guard rail (plan,mill.md §8 example 5).
 *
 * Shown while a job is still open, live, so the operator sees the allowance
 * being breached BEFORE they close the run — not after.
 */
export function LossWarning({
  inputKg,
  outputKg,
  allowedPct,
}: {
  inputKg: number;
  outputKg: number;
  allowedPct: number;
}) {
  if (inputKg <= 0) return null;

  const loss = inputKg - outputKg;
  const allowed = (inputKg * allowedPct) / 100;
  const rate = (loss / inputKg) * 100;
  const excess = loss - allowed;

  if (excess <= 0.001) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3.5">
      <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-rose-500" />
      <div className="text-xs leading-relaxed">
        <p className="font-bold text-rose-600 dark:text-rose-400">
          الفاقد تجاوز النسبة المتفق عليها
        </p>
        <p className="mt-1 text-muted-foreground">
          الفاقد الفعلي{" "}
          <span className="font-bold text-foreground">
            {loss.toLocaleString("en-US", { maximumFractionDigits: 0 })} كجم
          </span>{" "}
          ({rate.toFixed(2)}%) — المسموح به{" "}
          <span className="font-bold text-foreground">
            {allowed.toLocaleString("en-US", { maximumFractionDigits: 0 })} كجم
          </span>{" "}
          ({allowedPct}%).
        </p>
        <p className="mt-1 font-semibold text-rose-600 dark:text-rose-400">
          الفاقد الزائد: {excess.toLocaleString("en-US", { maximumFractionDigits: 0 })} كجم — يستدعي
          تسوية عينية أو خصم من فاتورة الخدمة.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- data table */

export function MillingTable({
  headers,
  children,
  minWidth = 900,
}: {
  headers: ReactNode[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
            {headers.map((h, i) => (
              <th
                key={i}
                className={
                  i === 0
                    ? "px-4 py-2.5 text-start font-medium"
                    : "px-4 py-2.5 text-start font-medium"
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function MillingRow({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  /* Optional: orders and other selectable lists need a clickable row, and
   * making the caller wrap every cell in a button loses the row highlight. */
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={
        "border-b border-border/50 transition-colors last:border-0 hover:bg-surface-2/40" +
        (onClick ? " cursor-pointer" : "") +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </tr>
  );
}

export function Cell({
  children,
  className,
  align = "start",
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "end" | "center";
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle",
        align === "end" && "text-end",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------- misc atoms */

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12.5px] tabular-nums", className)}>{children}</span>;
}

export function Pill({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "emerald" | "amber" | "rose" | "sky";
}) {
  const tones = {
    slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
    emerald: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
    sky: "bg-sky-500/12 text-sky-600 dark:text-sky-300",
  } as const;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", tones[tone])}>
      {children}
    </span>
  );
}
