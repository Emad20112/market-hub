import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface PriceFieldProps {
  value: number;
  onChange: (next: number) => void;
  /** Marks the field visually when it differs from the product's default. */
  modified?: boolean;
  min?: number;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function PriceField({
  value,
  onChange,
  modified = false,
  min = 0,
  disabled = false,
  ariaLabel,
  className,
}: PriceFieldProps) {
  const [text, setText] = useState(() => formatPlain(value));
  const editing = useRef(false);

  useEffect(() => {
    if (editing.current) return;
    setText(formatPlain(value));
  }, [value]);

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange(min);
      setText(formatPlain(min));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setText(formatPlain(value));
      return;
    }
    const next = Math.max(min, parsed);
    onChange(next);
    setText(formatPlain(next));
  }

  return (
    <div className="relative inline-flex items-center min-w-0">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        onFocus={(e) => {
          editing.current = true;
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          editing.current = false;
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          "h-7 w-full min-w-[4.25rem] rounded-lg border px-2 text-center font-mono text-xs font-semibold tabular-nums text-foreground outline-none transition [unicode-bidi:plaintext] focus:border-primary focus:ring-1 focus:ring-primary/25",
          modified
            ? "border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-border/80 bg-background/80 hover:border-border focus:bg-background",
          className,
        )}
      />
    </div>
  );
}

function formatPlain(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return String(Math.round(n * 100) / 100);
}
