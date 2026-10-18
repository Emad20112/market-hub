import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { postStockAdjustment } from "@/lib/items/stock-operations";
import { toast } from "sonner";
import {
  X,
  Scale,
  Warehouse,
  Package,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Search,
  ClipboardCheck,
  Boxes,
  RotateCcw,
  Sparkles,
  Info,
} from "lucide-react";

type ProductItem = {
  id: string;
  name: string;
  name_ar: string | null;
  sku: string | null;
  barcode: string | null;
  cost_price: number;
};

type WarehouseItem = {
  id: string;
  name: string;
  name_ar: string | null;
  code: string | null;
  is_default: boolean;
};

interface StockAdjustmentDialogProps {
  initialProductId?: string;
  initialWarehouseId?: string;
  onClose: () => void;
  onSaved: () => void;
}

// Format numbers strictly without thousands commas
function formatClean(val: number, decimals = 2): string {
  if (isNaN(val) || val === null || val === undefined) return "0";
  return (Math.round(val * 100) / 100).toFixed(decimals).replace(/,/g, "");
}

export function StockAdjustmentDialog({
  initialProductId,
  initialWarehouseId,
  onClose,
  onSaved,
}: StockAdjustmentDialogProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(initialWarehouseId || "");
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || "");
  const [productSearch, setProductSearch] = useState("");
  const [actualQtyStr, setActualQtyStr] = useState<string>("");
  const [unitCostStr, setUnitCostStr] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [reasonError, setReasonError] = useState<boolean>(false);
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // 1. Fetch Warehouses
  const { data: warehouses = [] } = useQuery<WarehouseItem[]>({
    queryKey: ["warehouses_adjustment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, code, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WarehouseItem[];
    },
  });

  // Auto select default warehouse if not selected
  useEffect(() => {
    if (!selectedWarehouseId && warehouses.length > 0) {
      setSelectedWarehouseId(warehouses[0].id);
    }
  }, [warehouses, selectedWarehouseId]);

  // 2. Fetch Products
  const { data: products = [] } = useQuery<ProductItem[]>({
    queryKey: ["products_adjustment_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, name_ar, sku, barcode, cost_price")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductItem[];
    },
  });

  // Filter products by search
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => {
      const name = `${p.name} ${p.name_ar ?? ""} ${p.sku ?? ""} ${p.barcode ?? ""}`.toLowerCase();
      return name.includes(q);
    });
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  // Update default unit cost when selected product changes
  useEffect(() => {
    if (selectedProduct) {
      setUnitCostStr(formatClean(selectedProduct.cost_price ?? 0, 2));
    }
  }, [selectedProduct]);

  // 3. Fetch Current System Balance for selected Product + Warehouse
  const { data: systemQty = 0, isLoading: isLoadingStock } = useQuery<number>({
    queryKey: ["inventory_balance_check", selectedProductId, selectedWarehouseId],
    queryFn: async () => {
      if (!selectedProductId || !selectedWarehouseId) return 0;
      const { data, error } = await supabase
        .from("inventory")
        .select("quantity")
        .eq("product_id", selectedProductId)
        .eq("warehouse_id", selectedWarehouseId)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.quantity ?? 0);
    },
    enabled: Boolean(selectedProductId && selectedWarehouseId),
  });

  // Initialize actual count string when systemQty finishes loading or product changes
  useEffect(() => {
    if (selectedProductId && selectedWarehouseId && !isLoadingStock) {
      setActualQtyStr(formatClean(systemQty, 2));
    }
  }, [selectedProductId, selectedWarehouseId, systemQty, isLoadingStock]);

  // Calculated Difference (strictly no commas)
  const actualQty = Number(actualQtyStr.replace(/,/g, ""));
  const isActualValid = actualQtyStr.trim() !== "" && !isNaN(actualQty) && actualQty >= 0;
  const difference = isActualValid ? actualQty - systemQty : 0;
  const isMatching = isActualValid && Math.abs(difference) < 0.0001;
  const isShortage = isActualValid && difference < -0.0001;
  const isSurplus = isActualValid && difference > 0.0001;

  // Auto suggest reason based on surplus/shortage
  useEffect(() => {
    if (isSurplus && !reason) setReason("surplus");
    if (isShortage && !reason) setReason("shortfall");
  }, [isSurplus, isShortage, reason]);

  const reasonPresets = [
    { value: "shortfall", labelAr: "عجز جردي", labelEn: "Shortfall" },
    { value: "surplus", labelAr: "فائض جردي", labelEn: "Surplus" },
    { value: "damaged", labelAr: "تلف / كسر", labelEn: "Damaged" },
    { value: "expiry", labelAr: "انتهاء صلاحية", labelEn: "Expired" },
    { value: "stocktake", labelAr: "تسوية دورية", labelEn: "Stocktake" },
    { value: "other", labelAr: "سبب آخر", labelEn: "Other" },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedWarehouseId) {
      toast.error(isAr ? "يرجى تحديد المستودع" : "Please select a warehouse");
      return;
    }
    if (!selectedProductId) {
      toast.error(isAr ? "يرجى تحديد المنتج" : "Please select a product");
      return;
    }
    if (!isActualValid) {
      toast.error(isAr ? "يرجى إدخال كمية جرد فعلي صحيحة" : "Please enter a valid actual count");
      return;
    }
    if (isMatching) {
      toast.error(
        isAr
          ? "رصيد الجرد الفعلي مطابق لرصيد النظام، لا توجد فروقات للتسوية"
          : "Actual count matches system balance, no adjustment needed",
      );
      return;
    }
    if (!reason) {
      setReasonError(true);
      toast.error(isAr ? "يرجى اختيار سبب التسوية" : "Please select an adjustment reason");
      return;
    }

    setSaving(true);
    try {
      const result = await postStockAdjustment({
        warehouseId: selectedWarehouseId,
        reason,
        note: note.trim() || undefined,
        effectiveDate: new Date().toISOString().slice(0, 10),
        lines: [
          {
            productId: selectedProductId,
            quantity: difference,
            unitCost: Number(unitCostStr.replace(/,/g, "")) || 0,
            note: note.trim() || undefined,
          },
        ],
      });

      if (!result.ok) {
        throw new Error(result.message || (isAr ? "فشل تنفيذ التسوية" : "Failed to apply adjustment"));
      }

      toast.success(
        isAr
          ? `تم اعتماد التسوية الجردية بنجاح (${difference > 0 ? "+" : ""}${formatClean(difference, 2)})`
          : `Stock adjustment recorded successfully (${difference > 0 ? "+" : ""}${formatClean(difference, 2)})`,
      );

      onSaved();
    } catch (err: any) {
      console.error("Adjustment failed:", err);
      toast.error(err.message || (isAr ? "فشل تنفيذ التسوية" : "Failed to apply adjustment"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-border/80 bg-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3.5">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-500/15 text-sky-500 border border-sky-500/20 shadow-sm">
              <Scale className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">
                  {isAr ? "تسوية مخزنية (جرد فعلي)" : "Stock Adjustment (Physical Count)"}
                </h2>
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  {isAr ? "مطابقة الأرصدة" : "Reconciliation"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isAr
                  ? "مقارنة الجرد الفعلي على الرف برصيد النظام واحتساب فرق العجز أو الفائض بدقة"
                  : "Reconcile physical shelf count with system balance to compute shortage or surplus"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5 text-sm custom-scrollbar">
          {/* Top Section: Warehouse & Product Selection side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Warehouse Selection */}
            <div className="rounded-2xl border border-border/80 bg-surface p-4 space-y-2 shadow-xs">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Warehouse className="h-4 w-4 text-sky-500" />
                  {isAr ? "المستودع المستهدف" : "Target Warehouse"}
                </span>
                {initialWarehouseId && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {isAr ? "محدد مسبقاً" : "Preselected"}
                  </span>
                )}
              </label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-muted/20 px-3 text-sm text-foreground outline-none focus:border-primary transition"
                disabled={Boolean(initialWarehouseId)}
              >
                <option value="">{isAr ? "اختر المستودع..." : "Select Warehouse..."}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {isAr ? w.name_ar || w.name : w.name || w.name_ar} {w.code ? `(${w.code})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                {isAr
                  ? "سيتم تطبيق حركة التسوية على هذا المستودع حصراً."
                  : "Movement will be applied strictly to this warehouse."}
              </p>
            </div>

            {/* Product Selection */}
            <div className="rounded-2xl border border-border/80 bg-surface p-4 space-y-2 shadow-xs">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Package className="h-4 w-4 text-sky-500" />
                  {isAr ? "المنتج / الصنف" : "Product / Item"}
                </span>
                {selectedProduct && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    SKU: {selectedProduct.sku || "—"}
                  </span>
                )}
              </label>

              {initialProductId && selectedProduct ? (
                <div className="flex h-10 items-center justify-between rounded-xl border border-border bg-muted/30 px-3">
                  <span className="font-semibold text-foreground text-xs truncate">
                    {isAr ? selectedProduct.name_ar || selectedProduct.name : selectedProduct.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {selectedProduct.sku || ""}
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground rtl:right-3 rtl:left-auto" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder={
                        isAr ? "بحث بالاسم أو SKU أو الباركود..." : "Search name, SKU, barcode..."
                      }
                      className="h-9 w-full rounded-xl border border-border bg-muted/20 px-8 text-xs outline-none focus:border-primary transition"
                    />
                  </div>
                  <select
                    size={3}
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface p-1 text-xs text-foreground outline-none focus:border-primary custom-scrollbar"
                  >
                    {filteredProducts.length === 0 && (
                      <option disabled className="p-2 text-center text-muted-foreground">
                        {isAr ? "لا توجد نتائج مطابقة" : "No matching products"}
                      </option>
                    )}
                    {filteredProducts.map((p) => (
                      <option key={p.id} value={p.id} className="rounded-lg p-1.5 hover:bg-accent text-xs">
                        {isAr ? p.name_ar || p.name : p.name} {p.sku ? `(${p.sku})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Active Product Reconciler */}
          {selectedProduct && selectedWarehouseId && (
            <div className="rounded-2xl border border-border/80 bg-muted/10 p-4 sm:p-5 space-y-4">
              {/* Product mini header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="size-3.5" />
                  </span>
                  <div>
                    <h3 className="font-bold text-foreground text-sm">
                      {isAr ? selectedProduct.name_ar || selectedProduct.name : selectedProduct.name}
                    </h3>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      {selectedProduct.sku ? `SKU: ${selectedProduct.sku}` : ""}{" "}
                      {selectedProduct.barcode ? `| Barcode: ${selectedProduct.barcode}` : ""}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{isAr ? "سعر التكلفة:" : "Cost:"}</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatClean(selectedProduct.cost_price ?? 0, 2)}
                  </span>
                </div>
              </div>

              {/* COMPACT Balance & Physical Count Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* 1. System Balance (Compact) */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 shadow-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <Boxes className="size-4" />
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-foreground block">
                        {isAr ? "رصيد النظام الحالي" : "Current System Balance"}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {isAr ? "الدفتري المسجل في المستودع" : "Ledger balance"}
                      </span>
                    </div>
                  </div>

                  <div className="text-end">
                    <span className="font-mono text-base font-extrabold text-foreground tracking-tight">
                      {isLoadingStock ? "..." : formatClean(systemQty, 2)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      {isAr ? "وحدة" : "units"}
                    </span>
                  </div>
                </div>

                {/* 2. Actual Count Input (Compact + Wheel Disabled + No Comma) */}
                <div className="flex items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 shadow-xs focus-within:ring-2 focus-within:ring-primary/20 transition">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <ClipboardCheck className="size-4" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-primary block">
                        {isAr ? "الجرد الفعلي (على الرف) *" : "Actual Shelf Count *"}
                      </label>
                      <span className="text-[10px] text-muted-foreground block">
                        {isAr ? "المحصور على أرض الواقع" : "Counted on shelf"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title={isAr ? "مطابقة مع رصيد النظام" : "Match system balance"}
                      onClick={() => setActualQtyStr(formatClean(systemQty, 2))}
                      className="grid size-7 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-accent transition"
                    >
                      <RotateCcw className="size-3" />
                    </button>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={actualQtyStr}
                      onChange={(e) => setActualQtyStr(e.target.value.replace(/,/g, ""))}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      placeholder="0.00"
                      required
                      className="h-8 w-24 sm:w-28 rounded-lg border border-primary/40 bg-surface px-2 text-center font-mono text-sm sm:text-base font-bold text-foreground outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Status & Difference Badge / Card */}
              {isActualValid && (
                <div
                  className={`rounded-xl border p-3.5 transition-all ${
                    isMatching
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                      : isShortage
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm">
                      {isMatching && <CheckCircle2 className="h-4 w-4 text-sky-500" />}
                      {isShortage && <TrendingDown className="h-4 w-4 text-rose-500" />}
                      {isSurplus && <TrendingUp className="h-4 w-4 text-emerald-500" />}
                      <span>
                        {isMatching && (isAr ? "الرصيد مطابق تماماً — لا توجد فروقات" : "Stock is matching — No difference")}
                        {isShortage && (isAr ? "عجز جردي (نقص في المخزون)" : "Stock Shortage (Deficit)")}
                        {isSurplus && (isAr ? "فائض جردي (زيادة في المخزون)" : "Stock Surplus (Excess)")}
                      </span>
                    </div>

                    <div className="font-mono text-sm sm:text-base font-extrabold tracking-tight">
                      {difference > 0 ? `+${formatClean(difference, 2)}` : formatClean(difference, 2)}
                    </div>
                  </div>

                  <p className="mt-1 text-[11px] opacity-90 leading-relaxed">
                    {isMatching &&
                      (isAr
                        ? "الجرد الفعلي يطابق تماماً رصيد النظام، لن يتم إنشاء حركة تسوية غير ضرورية."
                        : "Actual shelf count exactly matches system ledger. No adjustment needed.")}
                    {isShortage &&
                      (isAr
                        ? `سيتم تخفيض رصيد المستودع بمقدار (${formatClean(Math.abs(difference), 2)}) ليصل تماماً إلى الجرد الفعلي (${formatClean(actualQty, 2)}).`
                        : `Stock balance will be reduced by (${formatClean(Math.abs(difference), 2)}) to equal actual count (${formatClean(actualQty, 2)}).`)}
                    {isSurplus &&
                      (isAr
                        ? `سيتم زيادة رصيد المستودع بمقدار (+${formatClean(difference, 2)}) ليصل تماماً إلى الجرد الفعلي (${formatClean(actualQty, 2)}).`
                        : `Stock balance will be increased by (+${formatClean(difference, 2)}) to equal actual count (${formatClean(actualQty, 2)}).`)}
                  </p>
                </div>
              )}

              {/* Adjustment Reason & Details */}
              {!isMatching && isActualValid && (
                <div className="space-y-3.5 pt-1 border-t border-border/60">
                  {/* Reason presets pills */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Info className="size-3.5 text-sky-500" />
                      {isAr ? "سبب التسوية الجردية *" : "Adjustment Reason *"}
                    </label>

                    <div className="flex flex-wrap gap-1.5">
                      {reasonPresets.map((preset) => {
                        const isSelected = reason === preset.value;
                        return (
                          <button
                            key={preset.value}
                            type="button"
                            onClick={() => {
                              setReason(preset.value);
                              setReasonError(false);
                            }}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                              isSelected
                                ? "bg-primary text-primary-foreground shadow-xs font-bold"
                                : "border border-border bg-surface text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          >
                            {isAr ? preset.labelAr : preset.labelEn}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Grid for Reason dropdown, unit cost, and notes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-foreground">
                        {isAr ? "قائمة الأسباب المعتمدة" : "Standard Reason"}
                      </label>
                      <select
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          if (e.target.value) setReasonError(false);
                        }}
                        className={`h-9 w-full rounded-xl border bg-surface px-3 text-xs outline-none focus:border-primary ${
                          reasonError ? "border-rose-500 ring-1 ring-rose-500" : "border-border"
                        }`}
                      >
                        <option value="">{isAr ? "حدد سبب التسوية..." : "Select reason..."}</option>
                        <option value="shortfall">{isAr ? "عجز جردي" : "Stock Shortfall"}</option>
                        <option value="surplus">{isAr ? "فائض جردي" : "Stock Surplus"}</option>
                        <option value="damaged">{isAr ? "تلف سوء تخزين / كسر" : "Damaged / Broken"}</option>
                        <option value="expiry">{isAr ? "انتهاء صلاحية" : "Expired Product"}</option>
                        <option value="stocktake">{isAr ? "تسوية جرد دوري" : "Periodic Stocktake"}</option>
                        <option value="other">{isAr ? "سبب آخر (اذكره في الملاحظات)" : "Other Reason"}</option>
                      </select>
                      {reasonError && (
                        <span className="text-[10px] text-rose-500 block">
                          {isAr ? "السبب إجباري لاعتماد حركة التسوية" : "Reason is required"}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-foreground">
                        {isAr ? "تكلفة الوحدة للتسوية" : "Unit Cost for Adjustment"}
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={unitCostStr}
                        onChange={(e) => setUnitCostStr(e.target.value.replace(/,/g, ""))}
                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                        className="h-9 w-full rounded-xl border border-border bg-surface px-3 font-mono text-xs outline-none focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-foreground">
                      {isAr ? "ملاحظات إدارية وتفاصيل إضافية" : "Administrative Notes"}
                    </label>
                    <textarea
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={
                        isAr
                          ? "اكتب أي تفاصيل أو أرقام محاضر الجرد أو مبررات التسوية..."
                          : "Write details, report numbers or justification..."
                      }
                      className="w-full rounded-xl border border-border bg-surface p-2.5 text-xs outline-none focus:border-primary resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/80 bg-muted/20 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 items-center rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-muted-foreground hover:text-foreground transition"
          >
            {isAr ? "إلغاء" : "Cancel"}
          </button>

          <button
            type="submit"
            disabled={
              saving || !selectedProductId || !selectedWarehouseId || !isActualValid || isMatching
            }
            className="flex h-10 items-center gap-2 rounded-xl bg-primary px-6 text-xs font-bold text-primary-foreground shadow-sm hover:opacity-95 transition disabled:opacity-40"
          >
            {saving ? (
              <span>{isAr ? "جاري الاعتماد في السجلات..." : "Saving..."}</span>
            ) : (
              <>
                <Scale className="h-4 w-4" />
                <span>
                  {isMatching
                    ? isAr
                      ? "الرصيد مطابق (لا تسوية)"
                      : "Matching (No action)"
                    : isAr
                      ? "اعتماد التسوية الجردية"
                      : "Apply Stock Adjustment"}
                </span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
