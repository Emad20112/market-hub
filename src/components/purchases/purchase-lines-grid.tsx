import * as React from "react";
import { Calendar, GripVertical, Layers, Package, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { toSystemDigits } from "@/lib/format-preferences";
import { QuantityInput } from "@/components/ui/quantity-input";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import type { PurchasableProduct } from "./purchase-product-finder";

export interface UnitOption {
  id: string | null;
  label: string;
  factor: number;
  price: number;
  quantityIncrement: number;
}

export interface PurchaseCartLine {
  lineKey: string;
  product: PurchasableProduct;
  quantity: string | number;
  unitPrice: string | number;
  uomId: string | null;
  uomFactor: number;
  uomLabel: string;
  quantityIncrement: number;
  batchNumber?: string;
  expiryDate?: string;
}

export interface PurchaseLinesGridProps {
  lines: PurchaseCartLine[];
  isRtl: boolean;
  onUpdate: (index: number, patch: Partial<PurchaseCartLine>) => void;
  unitOptionsFor?: (line: PurchaseCartLine) => UnitOption[];
  onUnitChange?: (index: number, uomId: string | null) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRequestAdd?: () => void;
  onExitForward?: () => void;
}

interface CellHandle {
  row: number;
  field: "qty" | "price";
  el: HTMLInputElement | null;
}

export function PurchaseLinesGrid({
  lines,
  isRtl,
  onUpdate,
  unitOptionsFor,
  onUnitChange,
  onRemove,
  onMove,
  onRequestAdd,
  onExitForward,
}: PurchaseLinesGridProps) {
  const cellRefs = React.useRef<Map<string, CellHandle>>(new Map());
  const [activeRow, setActiveRow] = React.useState<number | null>(null);

  const register = (row: number, field: "qty" | "price") => (el: HTMLInputElement | null) => {
    const key = `${row}:${field}`;
    if (el) cellRefs.current.set(key, { row, field, el });
    else cellRefs.current.delete(key);
  };

  function focusCell(row: number, field: "qty" | "price") {
    const handle = cellRefs.current.get(`${row}:${field}`);
    if (!handle?.el) return;
    handle.el.focus();
    try {
      handle.el.select();
    } catch {
      /* ignore */
    }
    setActiveRow(row);
  }

  function handleAdvance(row: number, field: "qty" | "price", backwards: boolean) {
    if (!backwards) {
      if (field === "qty") return focusCell(row, "price");
      if (field === "price") {
        if (row < lines.length - 1) return focusCell(row + 1, "qty");
        if (onExitForward) return onExitForward();
        if (onRequestAdd) return onRequestAdd();
      }
    } else {
      if (field === "price") return focusCell(row, "qty");
      if (field === "qty" && row > 0) return focusCell(row - 1, "price");
    }
  }

  function handleKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    field: "qty" | "price",
  ) {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const dir = event.key === "ArrowUp" ? -1 : 1;
      const target = row + dir;
      if (target >= 0 && target < lines.length) {
        onMove(row, dir);
        window.setTimeout(() => focusCell(target, field), 40);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (row < lines.length - 1) focusCell(row + 1, field);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (row > 0) focusCell(row - 1, field);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      handleAdvance(row, field, event.shiftKey);
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      const val = field === "qty" ? lines[row]?.quantity : lines[row]?.unitPrice;
      if (val === "" || val === 0 || val === "0") {
        if (lines.length > 1 && field === "qty") {
          event.preventDefault();
          onRemove(row);
          const next = Math.min(row, lines.length - 2);
          window.setTimeout(() => focusCell(next, "qty"), 40);
        }
      }
    }
  }

  if (lines.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-surface/40 p-8 text-center">
        <div className="mb-3 grid size-12 place-items-center rounded-2xl border border-border/70 bg-surface-2 text-muted-foreground">
          <Package className="size-6" />
        </div>
        <h3 className="text-sm font-bold text-foreground">
          {isRtl ? "فاتورة المشتريات فارغة" : "Purchase invoice is empty"}
        </h3>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          {isRtl
            ? "ابحث عن أصناف الكتالوج من الحقل في الأعلى وأضفها، أو امسح الباركود مباشرة لإدراج البنود."
            : "Search products above or scan barcodes to add purchase lines."}
        </p>
        {onRequestAdd && (
          <button
            type="button"
            onClick={onRequestAdd}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
          >
            {isRtl ? "البحث عن صنف (F2)" : "Search item (F2)"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-right text-xs">
          <thead>
            <tr className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold text-muted-foreground">
              <th className="w-10 px-2 py-2.5 text-center">#</th>
              <th className="px-3 py-2.5">{isRtl ? "الصنف والبيان" : "Item & Details"}</th>
              <th className="w-24 px-2 py-2.5 text-center">{isRtl ? "الوحدة" : "Unit"}</th>
              <th className="w-28 px-2 py-2.5 text-center">{isRtl ? "الكمية" : "Quantity"}</th>
              <th className="w-32 px-2 py-2.5 text-end">{isRtl ? "سعر الشراء" : "Cost Price"}</th>
              <th className="w-32 px-3 py-2.5 text-end">{isRtl ? "الإجمالي" : "Total"}</th>
              <th className="w-10 px-2 py-2.5 text-center" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {lines.map((line, index) => {
              const unitOptions = unitOptionsFor ? unitOptionsFor(line) : [];
              const quantityNum = Number(line.quantity) || 0;
              const priceNum = Number(line.unitPrice) || 0;
              const lineAmount = Math.round(quantityNum * priceNum * 100) / 100;
              const isSelected = activeRow === index;
              const isBatchTracked = line.product.tracking === "BATCH";

              return (
                <tr
                  key={line.lineKey}
                  className={cn(
                    "group transition-colors",
                    isSelected ? "bg-primary/5" : "hover:bg-muted/30",
                  )}
                >
                  <td className="px-2 py-2 text-center align-middle font-mono text-[11px] text-muted-foreground">
                    <div className="flex items-center justify-center gap-1">
                      <span className="opacity-0 transition group-hover:opacity-100">
                        <GripVertical className="size-3 cursor-grab text-muted-foreground/60" />
                      </span>
                      <span>{toSystemDigits(index + 1)}</span>
                    </div>
                  </td>

                  <td className="px-3 py-2 align-middle">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{line.product.name}</span>
                        {line.product.sku && (
                          <span className="rounded border border-border/60 bg-surface-2 px-1 font-mono text-[10px] text-muted-foreground">
                            {line.product.sku}
                          </span>
                        )}
                        {isBatchTracked && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.2 text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                            <Layers className="size-2.5" />
                            {isRtl ? "دفعة" : "Batch"}
                          </span>
                        )}
                      </div>

                      {/* إدخال رقم الدفعة وتاريخ الصلاحية للصنف المتتبع */}
                      {isBatchTracked && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {isRtl ? "رقم الدفعة:" : "Batch #:"}
                            </span>
                            <Input
                              value={line.batchNumber || ""}
                              onChange={(e) => onUpdate(index, { batchNumber: e.target.value })}
                              placeholder={isRtl ? "رقم الدفعة…" : "Batch #"}
                              className="h-6 w-28 rounded border-border/80 bg-background px-1.5 text-[10px]"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              <Calendar className="size-2.5 inline me-0.5" />
                              {isRtl ? "الانتهاء:" : "Exp:"}
                            </span>
                            <Input
                              type="date"
                              value={line.expiryDate || ""}
                              onChange={(e) => onUpdate(index, { expiryDate: e.target.value })}
                              className="h-6 w-32 rounded border-border/80 bg-background px-1.5 text-[10px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </td>

                  {/* اختيار الوحدة */}
                  <td className="px-2 py-2 align-middle text-center">
                    {unitOptions.length > 1 && onUnitChange ? (
                      <select
                        value={line.uomId ?? unitOptions[0]?.id ?? ""}
                        onChange={(e) => onUnitChange(index, e.target.value || null)}
                        data-form-nav
                        aria-label={isRtl ? `وحدة البند ${index + 1}` : `Unit of line ${index + 1}`}
                        className="h-8 w-full rounded-lg border border-border/70 bg-surface px-1 text-center text-[11px] font-semibold text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                      >
                        {unitOptions.map((unit) => (
                          <option key={unit.id ?? "base"} value={unit.id ?? ""}>
                            {unit.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="inline-block rounded-md border border-border/60 bg-surface-2/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {line.uomLabel || line.product.base_unit_label || "—"}
                      </span>
                    )}
                  </td>

                  {/* الكمية */}
                  <td className="px-2 py-2 align-middle">
                    <QuantityInput
                      ref={register(index, "qty")}
                      decimals={Math.min(
                        6,
                        (String(line.quantityIncrement ?? 0.001).split(".")[1] ?? "").length,
                      )}
                      min={0}
                      value={line.quantity === "" ? null : Number(line.quantity)}
                      unit={line.uomLabel || undefined}
                      onValueChange={(v) =>
                        onUpdate(index, { quantity: v == null ? "" : String(v) })
                      }
                      onFocus={(e) => {
                        setActiveRow(index);
                        e.currentTarget.select();
                      }}
                      onKeyDown={(e) => handleKeyDown(e, index, "qty")}
                      className="h-8 rounded-lg border-border/70 bg-surface text-center [direction:ltr]"
                      containerClassName="[&_input]:h-8"
                      aria-label={
                        isRtl ? `كمية البند ${index + 1}` : `Quantity of line ${index + 1}`
                      }
                    />
                  </td>

                  {/* سعر الشراء (تكلفة الوحدة - قابل للتعديل بحرية) */}
                  <td className="px-2 py-2 align-middle">
                    <AmountInput
                      ref={register(index, "price")}
                      min={0}
                      showInWords={false}
                      value={line.unitPrice === "" ? null : Number(line.unitPrice)}
                      onValueChange={(v) =>
                        onUpdate(index, { unitPrice: v == null ? "" : String(v) })
                      }
                      onFocus={(e) => {
                        setActiveRow(index);
                        e.currentTarget.select();
                      }}
                      onKeyDown={(e) => handleKeyDown(e, index, "price")}
                      className="h-8 rounded-lg border-border/70 bg-surface text-end"
                      containerClassName="[&_input]:h-8"
                      aria-label={
                        isRtl ? `سعر شراء البند ${index + 1}` : `Cost of line ${index + 1}`
                      }
                    />
                  </td>

                  {/* الإجمالي */}
                  <td className="px-3 py-2 align-middle text-end">
                    <span className="font-mono text-[13px] font-bold tabular-nums text-foreground">
                      {toSystemDigits(money(lineAmount))}
                    </span>
                  </td>

                  {/* إجراء حذف */}
                  <td className="px-2 py-2 align-middle text-center">
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => onRemove(index)}
                      title={isRtl ? "حذف البند" : "Remove line"}
                      aria-label={isRtl ? `حذف البند ${index + 1}` : `Remove line ${index + 1}`}
                      className="grid size-7 place-items-center rounded-lg text-muted-foreground/60 opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border/70 bg-muted/30 text-xs">
              <td />
              <td className="px-3 py-2 font-semibold text-muted-foreground">
                {isRtl
                  ? `إجمالي ${toSystemDigits(lines.length)} بند`
                  : `${toSystemDigits(lines.length)} item(s)`}
              </td>
              <td />
              <td className="px-2 py-2 text-center font-mono font-bold text-foreground">
                {toSystemDigits(
                  lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0).toFixed(2),
                )}
              </td>
              <td />
              <td className="px-3 py-2 text-end font-mono font-bold text-foreground">
                {toSystemDigits(
                  money(
                    lines.reduce(
                      (s, l) =>
                        s +
                        Math.round((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * 100) /
                          100,
                      0,
                    ),
                  ),
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
