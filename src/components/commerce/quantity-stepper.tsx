import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * QuantityStepper — the single quantity control for POS and Purchase POS.
 *
 * WHY THIS EXISTS (requirement: "typing 5 must become 5, not 15")
 * ---------------------------------------------------------------
 * A controlled `value={qty}` input that commits on every keystroke fights the
 * user: an out-of-range keypress is rejected by the business rule and the field
 * snaps back to the old number, which reads as "my typing was ignored" or as
 * concatenation. This component keeps a LOCAL text buffer while the field is
 * focused, lets the operator overwrite the whole value freely, and only commits
 * on blur or Enter.
 *
 * It deliberately does NOT own the validation rules. `onCommit` receives the
 * parsed number (or `null` when the field is emptied) and the parent applies the
 * exact same stock / service / minimum rules it already had. An empty field is
 * never auto-deleted here — the parent decides on commit.
 *
 * Increment/decrement buttons commit immediately (they are unambiguous), and
 * clamp to `max` locally so the `+` button stops at available stock.
 */
export interface QuantityStepperProps {
  value: number;
  /** Called with the committed quantity. `null` means the field was emptied. */
  onCommit: (next: number | null) => void;
  /** Upper bound for the `+` button (stock). Ignored when `unbounded`. */
  max?: number;
  /** Services have no stock ceiling and keep a 1 minimum. */
  unbounded?: boolean;
  min?: number;
  disabled?: boolean;
  /** Accessible label, e.g. "الكمية". */
  ariaLabel?: string;
  className?: string;
  size?: "sm" | "md";
}

export function QuantityStepper({
  value,
  onCommit,
  max,
  unbounded = false,
  min = 1,
  disabled = false,
  ariaLabel,
  className,
  size = "sm",
}: QuantityStepperProps) {
  const [text, setText] = useState(() => String(value));
  const editing = useRef(false);

  // Keep the buffer in sync with outside changes (scanner, +/- buttons, reset),
  // but never overwrite what the operator is currently typing.
  useEffect(() => {
    if (editing.current) return;
    setText(String(value));
  }, [value]);

  const ceiling = unbounded ? Number.POSITIVE_INFINITY : max;

  function commit(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    // Round to a sane integer-ish quantity; the parent still enforces stock.
    // Zero is an intentional POS action: the parent removes the line.  Do not
    // clamp it to the minimum here or the delete-on-zero path is unreachable.
    if (parsed <= 0) {
      onCommit(0);
      setText("0");
      return;
    }
    let next = parsed;
    if (next < min) next = min;
    if (ceiling != null && Number.isFinite(ceiling) && next > ceiling) next = ceiling;
    onCommit(next);
    setText(String(next));
  }

  const btn = size === "md" ? "h-8 w-8" : "h-7 w-7";
  const input = size === "md" ? "h-8 w-12 text-sm" : "h-7 w-11 text-xs";

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/80 bg-surface/90 p-0.5 shadow-2xs",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCommit(value <= min ? 0 : value - 1)}
        aria-label="decrease"
        className={cn(
          btn,
          "grid place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground active:scale-90 disabled:opacity-40",
        )}
      >
        <Minus className="h-3 w-3" />
      </button>

      <input
        type="text"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        aria-label={ariaLabel}
        onFocus={(e) => {
          editing.current = true;
          // Select-all so the first keystroke replaces the value outright.
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
          input,
          "bg-transparent text-center font-mono font-bold tabular-nums text-foreground outline-none [unicode-bidi:plaintext] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        )}
      />

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const next = value + 1;
          if (!unbounded && ceiling != null && next > ceiling) return;
          onCommit(next);
        }}
        aria-label="increase"
        className={cn(
          btn,
          "grid place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2 hover:text-foreground active:scale-90 disabled:opacity-40",
        )}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
