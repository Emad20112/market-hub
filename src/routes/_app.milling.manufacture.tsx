/**
 * /milling/manufacture — زر التصنيع الذكي (خطوة 7).
 *
 * من مخزوننا: وارد قمح يُنقص من المخزون، صادر نواتج تزيد، والتكلفة توزَّع
 * على النواتج حسب أسعار البيع النسبية — لا ربح وهمي ولا تكلفة صفر.
 * مرجع: docs/milling/00 §4.3 و02 خطوة 7.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Factory, Plus, Trash2, ArrowLeft, Info } from "lucide-react";
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
  head: () => ({ meta: [{ title: "التصنيع الذكي — فورتكس ERP" }] }),
  component: SmartManufacturePage,
});

interface WarehouseOption {
  id: string;
  name_ar: string | null;
  name: string;
}

interface OutputLine {
  itemId: string;
  qty: string;
}

function SmartManufacturePage() {
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState("");
  const [grainItemId, setGrainItemId] = useState("");
  const [grainQty, setGrainQty] = useState("");
  const [outputs, setOutputs] = useState<OutputLine[]>([{ itemId: "", qty: "" }]);
  const [notes, setNotes] = useState("");

  const warehouses = useQuery({
    queryKey: ["milling", "warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name, name_ar")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WarehouseOption[];
    },
  });

  const grainItems = useQuery({
    queryKey: ["milling", "grain-items"],
    queryFn: fetchGrainItems,
  });

  const outputItems = useQuery({
    queryKey: ["milling", "output-items"],
    queryFn: fetchOutputItems,
  });

  const allItems = [...(grainItems.data ?? []), ...(outputItems.data ?? [])];
  const priceOf = (id: string) => allItems.find((p) => p.id === id)?.sale_price ?? 0;

  /** قيمة النواتج بسعر البيع — أساس التوزيع النسبي المعروض. */
  const totalOutputValue = outputs.reduce(
    (s, l) => s + (Number(l.qty) || 0) * priceOf(l.itemId),
    0,
  );

  const submit = useMutation({
    mutationFn: () =>
      smartManufacture({
        warehouseId,
        grainItemId,
        grainQty: Number(grainQty) || 0,
        outputs: outputs.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) || 0 })),
        notes: notes || undefined,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر تنفيذ التصنيع.");
        return;
      }
      toast.success(`تم التصنيع — مستند ${res.data ?? ""}`);
      setGrainQty("");
      setOutputs([{ itemId: "", qty: "" }]);
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["milling"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "خطأ غير متوقع"),
  });

  const canSubmit = Boolean(
    warehouseId &&
    grainItemId &&
    Number(grainQty) > 0 &&
    outputs.some((l) => l.itemId && Number(l.qty) > 0),
  );

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <PageHeader
          title="التصنيع الذكي"
          subtitle="من مخزوننا: قمح يُنقص من المخزون، ونواتج تدخل بتكلفة موزعة حسب أسعار البيع النسبية."
          actions={
            <Link
              to="/milling/consumables"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
            >
              صرف مستهلكات <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          }
        />

        <div className="flex items-start gap-2 rounded-xl bg-sky-500/10 px-3 py-2.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          التكلفة توزَّع آلياً على النواتج بنسبة قيمة كل ناتج من إجمالي قيمة النواتج بسعر البيع —
          لذلك كل ناتج يدخل المخزون بتكلفته الفعلية، ولا يظهر ربح وهمي عند البيع.
        </div>

        <MillingPanel>
          <MillingSectionTitle
            icon={<Factory className="h-4 w-4" />}
            title="مستند التصنيع"
            subtitle="وارد واحد (قمح) + صادر متعدد (نواتج)"
          />
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <MillingField label="المخزن *">
                <MillingSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                  <option value="">اختر المخزن…</option>
                  {(warehouses.data ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name_ar || w.name}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>
              <MillingField label="صنف القمح *">
                <MillingSelect value={grainItemId} onChange={(e) => setGrainItemId(e.target.value)}>
                  <option value="">اختر الصنف…</option>
                  {(grainItems.data ?? []).map((g: ProductOption) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar || g.name}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>
              <MillingField label="الكمية (كجم) *">
                <MillingInput
                  type="number"
                  min={0}
                  step="0.001"
                  inputMode="decimal"
                  placeholder="0"
                  value={grainQty}
                  onChange={(e) => setGrainQty(e.target.value)}
                />
              </MillingField>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  النواتج (الكمية بالكجم)
                </label>
                <button
                  type="button"
                  onClick={() => setOutputs((o) => [...o, { itemId: "", qty: "" }])}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted"
                >
                  <Plus className="h-3 w-3" /> ناتج آخر
                </button>
              </div>
              {outputs.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_110px_36px] items-center gap-2">
                  <MillingSelect
                    value={line.itemId}
                    onChange={(e) =>
                      setOutputs((o) =>
                        o.map((l, i) => (i === idx ? { ...l, itemId: e.target.value } : l)),
                      )
                    }
                  >
                    <option value="">اختر الناتج…</option>
                    {(outputItems.data ?? []).map((p: ProductOption) => (
                      <option key={p.id} value={p.id}>
                        {p.name_ar || p.name} — سعر بيع {fmtNum(p.sale_price)}
                      </option>
                    ))}
                  </MillingSelect>
                  <MillingInput
                    type="number"
                    min={0}
                    step="0.001"
                    inputMode="decimal"
                    placeholder="كجم"
                    value={line.qty}
                    onChange={(e) =>
                      setOutputs((o) =>
                        o.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l)),
                      )
                    }
                  />
                  <button
                    type="button"
                    disabled={outputs.length === 1}
                    onClick={() => setOutputs((o) => o.filter((_, i) => i !== idx))}
                    className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-500/10 disabled:opacity-30"
                    aria-label="حذف السطر"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {totalOutputValue > 0 && (
                <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  أساس التوزيع: إجمالي قيمة النواتج بسعر البيع ={" "}
                  <Mono>{fmtNum(totalOutputValue)}</Mono>
                </p>
              )}
            </div>

            <MillingField label="ملاحظات" hint="اختيارية">
              <MillingTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: تشغيل صباحي — دفعة 12"
              />
            </MillingField>

            <button
              type="button"
              disabled={!canSubmit || submit.isPending}
              onClick={() => submit.mutate()}
              className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submit.isPending ? "جارٍ التنفيذ…" : "تنفيذ التصنيع"}
            </button>
          </div>
        </MillingPanel>
      </div>
    </ModuleGuard>
  );
}
