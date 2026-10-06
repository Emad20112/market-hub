import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * PriceField — an inline, per-cart-line price editor.
 *
 * Used by POS (sale price) and Purchase POS (unit cost). It edits ONLY the
 * cart line's value: it never writes back to `products.sale_price` /
 * `products.cost_price`. The parent stores the parsed number on the cart line,
 * which is what the existing `create_sale` / `create_purchase` payloads already
 * read.
 *
 * Same commit-on-blur/Enter discipline as QuantityStepper so typing a new price
 * replaces the old one instead of being rejected mid-keystroke.
 */
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
        "w-full min-w-0 rounded-lg border bg-transparent px-2 py-1 text-end font-mono text-xs tabular-nums text-foreground outline-none transition [unicode-bidi:plaintext] focus:border-primary focus:ring-2 focus:ring-primary/20",
        modified ? "border-amber-500/50 bg-amber-500/5" : "border-border/70 bg-surface/60",
        className,
      )}
    />
  );
}

function formatPlain(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // Trim trailing zeros so 1000 shows as "1000", not "1000.00".
  return String(Math.round(n * 100) / 100);
}
