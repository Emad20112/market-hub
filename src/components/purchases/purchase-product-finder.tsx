import * as React from "react";
import { CornerDownLeft, Package, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { toSystemDigits } from "@/lib/format-preferences";

export interface PurchasableUom {
  unit_id: string;
  factor_to_base: number;
  cost_price: number;
  quantity_increment: number;
  label: string;
  is_default_purchase: boolean;
  barcodes: string[];
}

export interface PurchasableProduct {
  id: string;
  sku: string | null;
  barcode: string | null;
  name: string;
  cost_price: number;
  tax_rate: number;
  unit_id: string | null;
  item_class: string | null;
  on_hand: number;
  base_unit_label: string | null;
  purchase_uoms: PurchasableUom[];
  default_purchase_uom_id: string | null;
  default_purchase_factor: number;
  default_unit_label: string | null;
  tracking?: "NONE" | "BATCH" | "SERIAL" | null;
}

export interface PurchaseProductFinderProps {
  products: PurchasableProduct[];
  isRtl: boolean;
  disabled?: boolean;
  onPick: (product: PurchasableProduct, uomId?: string) => void;
  onTabForward?: () => void;
  limit?: number;
  className?: string;
}

function filterProducts(products: PurchasableProduct[], query: string, limit: number) {
  const q = query.trim().toLowerCase();
  if (!q) return products.slice(0, limit);
  return products
    .filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.purchase_uoms ?? []).some((uom) =>
          uom.barcodes.some((code) => code.toLowerCase().includes(q)),
        ),
    )
    .slice(0, limit);
}

export function PurchaseProductFinder({
  products,
  isRtl,
  disabled,
  onPick,
  onTabForward,
  limit = 6,
  className,
}: PurchaseProductFinderProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const results = React.useMemo(
    () => filterProducts(products, query, limit),
    [products, query, limit],
  );

  React.useEffect(() => {
    setActiveIndex((current) =>
      current >= results.length ? Math.max(0, results.length - 1) : current,
    );
  }, [results.length]);

  const optionId = (index: number) => `purchase-product-option-${index}`;

  function pick(product: PurchasableProduct) {
    const exactCode = query.trim().toLowerCase();
    const scannedUom = product.purchase_uoms?.find((uom) =>
      uom.barcodes.some((code) => code.toLowerCase() === exactCode),
    );
    onPick(product, scannedUom?.unit_id);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (["Enter", "ArrowDown", "ArrowUp", "Escape"].includes(event.key)) {
      event.stopPropagation();
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else {
        setQuery("");
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) pick(target);
      return;
    }

    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      setOpen(false);
      if (onTabForward) onTabForward();
      else inputRef.current?.blur();
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-11 items-center gap-2.5 rounded-xl border bg-surface px-3.5 transition",
          open
            ? "border-primary/60 ring-4 ring-primary/10"
            : "border-border/80 hover:border-border",
        )}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          dir={isRtl ? "rtl" : "ltr"}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={onKeyDown}
          data-form-nav-skip
          role="combobox"
          aria-expanded={open}
          aria-controls="purchase-product-results"
          aria-autocomplete="list"
          aria-activedescendant={open && results[activeIndex] ? optionId(activeIndex) : undefined}
          aria-label={isRtl ? "ابحث عن صنف لإضافته للفاتورة" : "Search item to add"}
          placeholder={
            isRtl
              ? "ابحث باسم الصنف، الباركود أو الكود ثم اضغط Enter…"
              : "Search by item name, SKU or barcode…"
          }
          className="h-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        {query && (
          <span className="hidden shrink-0 rounded-md border border-border/60 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            {toSystemDigits(results.length)} / {toSystemDigits(limit)}
          </span>
        )}
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded-md border border-border/70 bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
          <CornerDownLeft className="size-2.5" />
          {isRtl ? "إضافة" : "add"}
        </kbd>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-border/80 bg-popover/98 shadow-2xl backdrop-blur-xl">
          {results.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
              <Package className="size-5 text-muted-foreground/50" />
              <p className="text-xs font-semibold text-foreground">
                {isRtl ? "لا يوجد صنف مطابق للشراء" : "No matching purchasable item"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isRtl
                  ? "جرّب اسمًا آخر أو تحقق من إتاحة الصنف للشراء."
                  : "Try another name or SKU."}
              </p>
            </div>
          ) : (
            <ul
              ref={listRef}
              id="purchase-product-results"
              role="listbox"
              aria-label={isRtl ? "نتائج البحث" : "Search results"}
              className="max-h-[min(18rem,40dvh)] overflow-y-auto p-1.5 custom-scrollbar"
            >
              {results.map((product, index) => {
                const active = index === activeIndex;
                return (
                  <li
                    key={product.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={active}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        pick(product);
                      }
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(product)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors",
                      active ? "bg-primary/10" : "hover:bg-surface-2/70",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg border",
                        active
                          ? "border-primary/40 bg-primary/20 text-primary"
                          : "border-border/60 bg-surface-2 text-muted-foreground",
                      )}
                    >
                      <Package className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {product.name}
                        </span>
                        {product.sku && (
                          <span className="shrink-0 rounded border border-border/60 bg-surface-2/80 px-1 font-mono text-[10px] text-muted-foreground">
                            {product.sku}
                          </span>
                        )}
                        {product.tracking === "BATCH" && (
                          <span className="shrink-0 rounded bg-amber-500/10 px-1 text-[9px] font-medium text-amber-700 dark:text-amber-400">
                            {isRtl ? "دفعات" : "Batch"}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>
                          {isRtl ? "الوحدة:" : "Unit:"}{" "}
                          <strong className="font-medium text-foreground/80">
                            {product.default_unit_label || product.base_unit_label || "—"}
                          </strong>
                        </span>
                        <span>
                          {isRtl ? "المتوفر:" : "Stock:"}{" "}
                          <span className="font-mono text-foreground/80">
                            {toSystemDigits(product.on_hand)}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="font-mono text-xs font-bold text-foreground">
                        {toSystemDigits(money(product.cost_price))}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {isRtl ? "تكلفة الشراء" : "Cost price"}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
