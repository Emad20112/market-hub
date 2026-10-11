import { Trash2, Wrench, Sparkles } from "lucide-react";
import { QuantityStepper } from "./quantity-stepper";
import { PriceField } from "./price-field";
import { cn } from "@/lib/utils";

export interface CartLineData {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  isService?: boolean;
  priceModified?: boolean;
  stock?: number;
  barcode?: string;
  unit?: string;
}

export interface CartLineLabels {
  price: string;
  quantity: string;
  remove: string;
  priceModified?: string;
  stockLabel?: string;
}

export interface CartLineProps {
  line: CartLineData;
  labels: CartLineLabels;
  formatMoney: (n: number) => string;
  onQuantityCommit: (next: number | null) => void;
  onPriceChange: (next: number) => void;
  onRemove: () => void;
}

export function CartLine({
  line,
  labels,
  formatMoney,
  onQuantityCommit,
  onPriceChange,
  onRemove,
}: CartLineProps) {
  const lineTotal = line.quantity * line.unitPrice;

  return (
    <div className="group relative rounded-xl border border-border/70 bg-card/75 p-2 transition-all duration-150 hover:border-primary/40 hover:bg-card hover:shadow-xs">
      {/* Top row: Name, Tags, Line Total, Delete */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {line.isService ? (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
              title="خدمة / تركيب"
            >
              <Wrench className="h-2.5 w-2.5" />
              خدمة
            </span>
          ) : null}

          <span
            className="truncate text-xs font-semibold text-foreground/90 transition-colors group-hover:text-foreground"
            title={line.name}
          >
            {line.name}
          </span>

          {line.priceModified ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.2 text-[9px] font-medium text-primary"
              title={labels.priceModified || "سعر معدّل"}
            >
              <Sparkles className="h-2 w-2" />
              معدّل
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="font-mono text-xs font-bold tabular-nums text-primary [unicode-bidi:isolate]">
            {formatMoney(lineTotal)}
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={labels.remove}
            title={labels.remove}
            className="rounded-lg p-1 text-muted-foreground/60 transition hover:bg-destructive/15 hover:text-destructive active:scale-90"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom row: Compact Quantity Stepper, Multiplication, Price Input, Unit/Stock pill */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-1.5">
        <div className="flex items-center gap-1.5">
          <QuantityStepper
            value={line.quantity}
            onCommit={onQuantityCommit}
            max={line.stock}
            unbounded={line.isService}
            ariaLabel={labels.quantity}
          />
          <span className="text-[11px] text-muted-foreground font-mono select-none">×</span>
          <PriceField
            value={line.unitPrice}
            onChange={onPriceChange}
            modified={line.priceModified}
            ariaLabel={labels.price}
            className="h-7 w-[4.75rem] text-xs"
          />
        </div>

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {line.stock != null && !line.isService && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px]",
                line.stock <= line.quantity
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold"
                  : "bg-muted/70 text-muted-foreground",
              )}
            >
              {labels.stockLabel || "المتوفر"}: {line.stock}
            </span>
          )}
          {line.unit && (
            <span className="text-[10px] text-muted-foreground/75 font-medium">{line.unit}</span>
          )}
        </div>
      </div>
    </div>
  );
}
