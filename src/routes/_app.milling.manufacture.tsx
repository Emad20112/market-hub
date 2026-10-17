/**
 * /milling/manufacture — زر التصنيع الذكي المطور (طحن منتجات المنشأة).
 *
 * من مخزوننا: وارد قمح يُنقص من المخزون، صادر نواتج تزيد، والتكلفة توزَّع
 * على النواتج حسب أسعار البيع النسبية — لا ربح وهمي ولا تكلفة صفر.
 * يتضمن:
 * 1. فحص لحظي للرصيد المخزني المتاح للقمح في المستودع المختار.
 * 2. دعم وحدات التعبئة المعيارية للأكياس (50، 25، 10، 5 كجم وسائب).
 * 3. حاسبة توازن الطحن: نسبة الاستخلاص (Yield %) والفاقد/الهدر التشغيلي.
 * 4. معاينة فورية لتوزيع التكلفة التقديرية لكل ناتج.
 * 5. تحققات شاملة تمنع الأخطاء المحاسبية والمخزنية.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Factory,
  Plus,
  Trash2,
  ArrowLeft,
  Info,
  Package,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  PieChart,
  Warehouse as WarehouseIcon,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import {
  smartManufacture,
  fetchGrainItems,
  fetchOutputItems,
  type ProductOption,
} from "@/lib/milling";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingField,
  MillingInput,
  MillingSelect,
  MillingTextarea,
  Mono,
  fmtNum,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/milling/manufacture")({
  head: () => ({ meta: [{ title: "التصنيع الذكي وطحن منتجات المنشأة — فورتكس ERP" }] }),
  component: SmartManufacturePage,
});

interface WarehouseOption {
  id: string;
  name_ar: string | null;
  name: string;
  is_default: boolean | null;
}

interface OutputLine {
  itemId: string;
  packageType: "bulk" | "50" | "25" | "10" | "5" | "custom";
  customPackageKg?: string;
  bagsCount?: string;
  qty: string; // Net weight in kg
}

export function SmartManufacturePage() {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState("");
  const [grainItemId, setGrainItemId] = useState("");
  const [grainQty, setGrainQty] = useState("");
  const [batchRef, setBatchRef] = useState("");
  const [notes, setNotes] = useState("");

  const [outputs, setOutputs] = useState<OutputLine[]>([
    { itemId: "", packageType: "bulk", qty: "" },
  ]);

  // مستودعات النظام
  const warehouses = useQuery({
    queryKey: ["milling", "warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WarehouseOption[];
    },
  });

  // تحديد المستودع الافتراضي تلقائياً
  useEffect(() => {
    if (warehouseId) return;
    const list = warehouses.data ?? [];
    const preferred = list.find((w) => w.is_default) ?? list[0];
    if (preferred) setWarehouseId(preferred.id);
  }, [warehouses.data, warehouseId]);

  // قائمة أصناف الحبوب المتاحة
  const grainItems = useQuery({
    queryKey: ["milling", "grain-items"],
    queryFn: fetchGrainItems,
  });

  // قائمة النواتج المتاحة
  const outputItems = useQuery({
    queryKey: ["milling", "output-items"],
    queryFn: fetchOutputItems,
  });

  const allItems = [...(grainItems.data ?? []), ...(outputItems.data ?? [])];
  const selectedGrain = grainItems.data?.find((g) => g.id === grainItemId);

  // الرصيد المخزني المتاح للقمح في المستودع المختار
  const grainStockQuery = useQuery({
    queryKey: ["milling", "grain-stock", warehouseId, grainItemId],
    queryFn: async () => {
      if (!warehouseId || !grainItemId) return 0;
      const { data, error } = await supabase
        .from("inventory")
        .select("quantity")
        .eq("warehouse_id", warehouseId)
        .eq("product_id", grainItemId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching grain stock:", error);
        return 0;
      }
      return Number(data?.quantity ?? 0);
    },
    enabled: Boolean(warehouseId && grainItemId),
  });

  const availableStock = grainStockQuery.data ?? 0;
  const numGrainQty = Number(grainQty) || 0;
  const isOverStock = availableStock > 0 && numGrainQty > availableStock;

  // احتساب إجمالي النواتج بالكجم
  const totalOutputKg = useMemo(() => {
    return outputs.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
  }, [outputs]);

  // احتساب الهدر والفاقد التشغيلي ونسبة الاستخلاص
  const wasteKg = Math.max(0, numGrainQty - totalOutputKg);
  const wastePercent = numGrainQty > 0 ? (wasteKg / numGrainQty) * 100 : 0;
  const yieldPercent = numGrainQty > 0 ? (totalOutputKg / numGrainQty) * 100 : 0;
  const isOutputsOverGrain = numGrainQty > 0 && totalOutputKg > numGrainQty;

  // أسعار البيع والتكلفة
  const priceOf = (id: string) => allItems.find((p) => p.id === id)?.sale_price ?? 0;
  const costOfGrain = selectedGrain?.cost_price ?? selectedGrain?.sale_price ?? 0;
  const totalInputCost = numGrainQty * costOfGrain;

  // إجمالي قيمة النواتج بسعر البيع (أساس التوزيع النسبي)
  const totalOutputValue = useMemo(() => {
    return outputs.reduce((s, l) => s + (Number(l.qty) || 0) * priceOf(l.itemId), 0);
  }, [outputs, allItems]);

  // معالجة تغيير نوع التعبئة أو عدد الأكياس
  const handlePackageChange = (
    idx: number,
    packageType: OutputLine["packageType"],
    customKg?: string,
  ) => {
    setOutputs((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        let bagWeight = 0;
        if (packageType === "50") bagWeight = 50;
        else if (packageType === "25") bagWeight = 25;
        else if (packageType === "10") bagWeight = 10;
        else if (packageType === "5") bagWeight = 5;
        else if (packageType === "custom") bagWeight = Number(customKg) || 0;

        const bags = Number(line.bagsCount) || 0;
        const newQty = packageType === "bulk" ? line.qty : bags > 0 ? String(bags * bagWeight) : line.qty;

        return {
          ...line,
          packageType,
          customPackageKg: customKg !== undefined ? customKg : line.customPackageKg,
          qty: newQty,
        };
      }),
    );
  };

  const handleBagsCountChange = (idx: number, bagsCount: string) => {
    setOutputs((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;
        let bagWeight = 0;
        if (line.packageType === "50") bagWeight = 50;
        else if (line.packageType === "25") bagWeight = 25;
        else if (line.packageType === "10") bagWeight = 10;
        else if (line.packageType === "5") bagWeight = 5;
        else if (line.packageType === "custom") bagWeight = Number(line.customPackageKg) || 0;

        const bags = Number(bagsCount) || 0;
        const calculatedQty = bagWeight > 0 && bags > 0 ? String(bags * bagWeight) : line.qty;

        return {
          ...line,
          bagsCount,
          qty: bagWeight > 0 ? calculatedQty : line.qty,
        };
      }),
    );
  };

  // تنفيذ عملية التصنيع
  const submit = useMutation({
    mutationFn: () => {
      const fullNotes = [
        batchRef ? `تشغيلة: ${batchRef.trim()}` : "",
        notes ? notes.trim() : "",
      ]
        .filter(Boolean)
        .join(" — ");

      return smartManufacture({
        warehouseId,
        grainItemId,
        grainQty: numGrainQty,
        outputs: outputs.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) || 0 })),
        notes: fullNotes || undefined,
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر تنفيذ التصنيع.");
        return;
      }
      toast.success(`تم التصنيع بنجاح — مستند ${res.data ?? ""}`);
      setGrainQty("");
      setBatchRef("");
      setOutputs([{ itemId: "", packageType: "bulk", qty: "" }]);
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["milling"] });
      void qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "خطأ غير متوقع"),
  });

  // شروط تفعيل زر التنفيذ
  const canSubmit = Boolean(
    warehouseId &&
    grainItemId &&
    numGrainQty > 0 &&
    !isOverStock &&
    !isOutputsOverGrain &&
    outputs.length > 0 &&
    outputs.every((l) => l.itemId && (Number(l.qty) || 0) > 0) &&
    totalOutputValue > 0,
  );

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-5xl space-y-5 p-3 sm:p-5">
        <PageHeader
          title="التصنيع الذكي وطحن منتجات المنشأة"
          subtitle="تحويل مخزون الحبوب (القمح) إلى منتجات تامة ونواتج جانبية بتكلفة موزعة آلياً حسب القيمة النسبية."
          actions={
            <div className="flex items-center gap-2">
              <Link
                to="/milling/consumables"
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-foreground transition hover:bg-muted"
              >
                صرف مستهلكات تشغيلية <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
          }
        />

        {/* تنبيه الإيضاح المحاسبي المريح */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3.5 text-xs font-medium text-sky-800 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <p className="leading-relaxed">
            <strong>نظام التوزيع النسبي المعتمد:</strong> يتم خصم القمح من المخزون بتكلفته الفعلية، وتُوزع
            التكلفة بالكامل على النواتج بحسب نسبة القيمة السوقية لكل منتج (دقيق، سميد، نخالة)، مما يمنع
            الأرباح الوهمية ويطابق معايير الجرد المستمر.
          </p>
        </div>

        {/* ─── اللوحة الأولى: مدخلات القمح والمستودع ─── */}
        <MillingPanel>
          <MillingSectionTitle
            icon={<WarehouseIcon className="h-4 w-4 text-amber-500" />}
            title="1. مدخلات المادة الخام (القمح / الحبوب)"
            subtitle="حدد المستودع ونوع القمح والكمية المراد طحنها"
          />
          <div className="space-y-4 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <MillingField label="مستودع السحب *">
                <MillingSelect
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">اختر المخزن…</option>
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name_ar || w.name} {w.is_default ? "★ (الرئيسي)" : ""}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>

              <MillingField label="صنف الحبوب (القمح) *">
                <MillingSelect
                  value={grainItemId}
                  onChange={(e) => setGrainItemId(e.target.value)}
                >
                  <option value="">اختر الصنف…</option>
                  {(grainItems.data ?? []).map((g: ProductOption) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar || g.name} ({g.sku})
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>

              <MillingField label="الكمية المراد طحنها (كجم) *">
                <MillingInput
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={grainQty}
                  onChange={(e) => setGrainQty(e.target.value)}
                />
              </MillingField>
            </div>

            {/* شريط حالة الرصيد المخزني الفعلي */}
            {grainItemId && warehouseId && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface/80 p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span>
                    الرصيد المتاح في المخزن:{" "}
                    <strong className={availableStock > 0 ? "text-foreground" : "text-rose-500"}>
                      <Mono>{fmtNum(availableStock)}</Mono> كجم
                    </strong>
                  </span>
                  {selectedGrain?.cost_price && selectedGrain.cost_price > 0 && (
                    <span className="text-muted-foreground">
                      (متوسط التكلفة: <Mono>{fmtNum(selectedGrain.cost_price)}</Mono>)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {availableStock > 0 && (
                    <button
                      type="button"
                      onClick={() => setGrainQty(String(availableStock))}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-bold text-primary transition hover:bg-muted active:scale-95"
                    >
                      تعبئة كامل الرصيد المتاح
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* تحذير تجاوز الرصيد المتاح */}
            {isOverStock && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>
                  تنبيه: الكمية المدخلة (<Mono>{grainQty}</Mono> كجم) أكبر من الرصيد المتوفر في المخزن (
                  <Mono>{fmtNum(availableStock)}</Mono> كجم)! يرجى تقليل الكمية.
                </span>
              </div>
            )}
          </div>
        </MillingPanel>

        {/* ─── اللوحة الثانية: النواتج وتعبئة الأكياس ─── */}
        <MillingPanel>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 p-4">
            <MillingSectionTitle
              icon={<Factory className="h-4 w-4 text-emerald-500" />}
              title="2. المنتجات والنواتج المستخرجة"
              subtitle="أضف الأصناف الناتجة مع تحديد الأكياس أو الأوزان المباشرة"
            />
            <button
              type="button"
              onClick={() =>
                setOutputs((o) => [...o, { itemId: "", packageType: "bulk", qty: "" }])
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> إضافة سطر ناتج
            </button>
          </div>

          <div className="space-y-3.5 p-4 sm:p-5">
            {outputs.map((line, idx) => {
              const selectedProd = outputItems.data?.find((p) => p.id === line.itemId);
              const lineQtyNum = Number(line.qty) || 0;
              const lineValue = lineQtyNum * (selectedProd?.sale_price ?? 0);
              const valueRatio = totalOutputValue > 0 ? (lineValue / totalOutputValue) * 100 : 0;
              const estimatedUnitCost =
                lineQtyNum > 0 && totalOutputValue > 0 && totalInputCost > 0
                  ? (totalInputCost * (lineValue / totalOutputValue)) / lineQtyNum
                  : 0;

              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-border/80 bg-surface/50 p-3 sm:p-4 space-y-3 transition hover:border-border"
                >
                  <div className="grid gap-3 sm:grid-cols-[1.5fr_1.2fr_1fr_40px] items-start">
                    {/* اختيار صنف الناتج */}
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                        صنف الناتج *
                      </label>
                      <MillingSelect
                        value={line.itemId}
                        onChange={(e) => {
                          const val = e.target.value;
                          const prod = outputItems.data?.find((p) => p.id === val);
                          setOutputs((o) =>
                            o.map((l, i) =>
                              i === idx
                                ? {
                                    ...l,
                                    itemId: val,
                                    packageType:
                                      prod?.package_weight_kg === 50
                                        ? "50"
                                        : prod?.package_weight_kg === 25
                                          ? "25"
                                          : prod?.package_weight_kg === 10
                                            ? "10"
                                            : "bulk",
                                  }
                                : l,
                            ),
                          );
                        }}
                      >
                        <option value="">اختر الناتج…</option>
                        {(outputItems.data ?? []).map((p: ProductOption) => (
                          <option key={p.id} value={p.id}>
                            {p.name_ar || p.name} — سعر بيع {fmtNum(p.sale_price)}
                          </option>
                        ))}
                      </MillingSelect>
                    </div>

                    {/* نمط التعبئة (سائب أو أكياس معيارية) */}
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
                        نوع التعبئة
                      </label>
                      <div className="flex gap-1">
                        <select
                          className="h-10 w-full rounded-xl border border-border bg-surface px-2.5 text-xs font-semibold text-foreground outline-none transition focus:border-primary/60"
                          value={line.packageType}
                          onChange={(e) =>
                            handlePackageChange(idx, e.target.value as OutputLine["packageType"])
                          }
                        >
                          <option value="bulk">سائب (كجم مباشر)</option>
                          <option value="50">كيس 50 كجم</option>
                          <option value="25">كيس 25 كجم</option>
                          <option value="10">كيس 10 كجم</option>
                          <option value="5">كيس 5 كجم</option>
                          <option value="custom">وزن كيس مخصص</option>
                        </select>
                      </div>
                    </div>

                    {/* الكمية والوزن */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          {line.packageType === "bulk" ? "الكمية (كجم) *" : "عدد الأكياس *"}
                        </label>
                        {line.packageType !== "bulk" && (
                          <span className="text-[10px] text-muted-foreground">
                            = <Mono>{line.qty || "0"}</Mono> كجم
                          </span>
                        )}
                      </div>

                      {line.packageType === "bulk" ? (
                        <MillingInput
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          placeholder="كجم"
                          value={line.qty}
                          onChange={(e) =>
                            setOutputs((o) =>
                              o.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)),
                            )
                          }
                        />
                      ) : (
                        <div className="space-y-1.5">
                          <MillingInput
                            type="number"
                            min={0}
                            step="1"
                            placeholder="عدد الأكياس"
                            value={line.bagsCount ?? ""}
                            onChange={(e) => handleBagsCountChange(idx, e.target.value)}
                          />
                          {line.packageType === "custom" && (
                            <MillingInput
                              type="number"
                              min={0}
                              step="0.1"
                              placeholder="وزن الكيس كجم"
                              value={line.customPackageKg ?? ""}
                              onChange={(e) =>
                                handlePackageChange(idx, "custom", e.target.value)
                              }
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* زر حذف السطر */}
                    <div className="pt-6 flex justify-end">
                      <button
                        type="button"
                        disabled={outputs.length === 1}
                        onClick={() => setOutputs((o) => o.filter((_, i) => i !== idx))}
                        className="grid h-10 w-10 place-items-center rounded-xl text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-30"
                        aria-label="حذف السطر"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* ملخص السطر المالي والنسبي */}
                  {lineQtyNum > 0 && selectedProd && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-3">
                        <span>
                          قيمة الناتج: <strong><Mono>{fmtNum(lineValue)}</Mono></strong>
                        </span>
                        <span>
                          نسبة القيمة: <strong><Mono>{valueRatio.toFixed(1)}%</Mono></strong>
                        </span>
                      </div>
                      {estimatedUnitCost > 0 && (
                        <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          التكلفة التقديرية بعد التوزيع:{" "}
                          <Mono>{fmtNum(estimatedUnitCost)}</Mono> / كجم
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </MillingPanel>

        {/* ─── اللوحة الثالثة: لوحة توازن الطحن ونسبة الاستخلاص والفاقد ─── */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border/80 bg-surface/70 p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-amber-500" /> إجمالي القمح المدخل
            </span>
            <p className="text-xl font-black text-foreground">
              <Mono>{fmtNum(numGrainQty)}</Mono> <span className="text-xs font-normal">كجم</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface/70 p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> إجمالي النواتج
            </span>
            <p className="text-xl font-black text-foreground">
              <Mono>{fmtNum(totalOutputKg)}</Mono> <span className="text-xs font-normal">كجم</span>
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface/70 p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-rose-500" /> الهدر / الفاقد التشغيلي
            </span>
            <p className="text-xl font-black text-foreground">
              <Mono>{fmtNum(wasteKg)}</Mono>{" "}
              <span className="text-xs font-semibold text-muted-foreground">
                ({wastePercent.toFixed(1)}%)
              </span>
            </p>
          </div>

          <div className="rounded-2xl border border-border/80 bg-surface/70 p-4 space-y-1">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5 text-sky-500" /> نسبة الاستخلاص (Yield)
            </span>
            <p className="text-xl font-black text-foreground">
              <Mono>{yieldPercent.toFixed(1)}%</Mono>
            </p>
          </div>
        </div>

        {/* تنبيه إذا كانت النواتج أكبر من المدخلات */}
        {isOutputsOverGrain && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-bold text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
            <span>
              خطأ في الأوزان: إجمالي وزن النواتج المستخرجة (<Mono>{fmtNum(totalOutputKg)}</Mono> كجم)
              أكبر من كمية القمح المطحون (<Mono>{fmtNum(numGrainQty)}</Mono> كجم)! لا يمكن أن تزيد النواتج عن المدخلات.
            </span>
          </div>
        )}

        {/* ─── اللوحة الرابعة: رقم التشغيلة والملاحظات ─── */}
        <MillingPanel>
          <div className="p-4 sm:p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <MillingField label="رقم الدفعة / التشغيلة" hint="اختياري للربط والتتبع">
                <MillingInput
                  placeholder="مثال: BATCH-2026-10-A"
                  value={batchRef}
                  onChange={(e) => setBatchRef(e.target.value)}
                />
              </MillingField>

              <MillingField label="ملاحظات تشغيلية" hint="اختيارية">
                <MillingTextarea
                  placeholder="مثال: تشغيل صباحي — فحص نقاوة 98%..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </MillingField>
            </div>

            {/* زر الاعتماد والتنفيذ */}
            <div className="pt-2 border-t border-border/70 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground">
                {totalOutputValue > 0 && (
                  <span>
                    إجمالي القيمة السوقية للنواتج:{" "}
                    <strong className="text-foreground"><Mono>{fmtNum(totalOutputValue)}</Mono></strong>
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate()}
                className="w-full sm:w-auto min-w-[200px] flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-white shadow-md shadow-amber-500/20 transition hover:bg-amber-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {submit.isPending ? "جارٍ تسجيل التصنيع والحركات…" : "تنفيذ أمر التصنيع المخزني"}
              </button>
            </div>
          </div>
        </MillingPanel>
      </div>
    </ModuleGuard>
  );
}
