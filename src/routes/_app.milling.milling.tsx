/**
 * /milling/milling — الطحن (الشاشة الثانية من الثلاث).
 *
 * يعرض رصيد حبوب العميل → يُدخل النواتج (صنف + أكياس + كجم لكل ناتج)
 * → أسطر MILLING في custody_ledger. لا فاقد يُدخل: الفارق يظهر في الكشف.
 * المرجع: docs/milling/00_خطة_التبسيط_المعتمدة.md §4.1
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Cog, ArrowLeft, Plus, Trash2, Wheat } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import {
  custodyMilling,
  fetchCustodyBalances,
  fetchOutputItems,
  type CustodyLine,
  type ProductOption,
} from "@/lib/milling";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingField,
  MillingInput,
  MillingSelect,
  MillingTextarea,
  MillingEmpty,
  Mono,
  fmtNum,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/milling/milling")({
  head: () => ({ meta: [{ title: "الطحن — فورتكس ERP" }] }),
  component: MillingMillPage,
});

interface CustomerOption {
  id: string;
  name: string;
}
interface WarehouseOption {
  id: string;
  name_ar: string | null;
  name: string;
}

function MillingMillPage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [grainItemId, setGrainItemId] = useState("");
  const [bagsOut, setBagsOut] = useState("");
  const [kgOut, setKgOut] = useState("");
  const [outputs, setOutputs] = useState<CustodyLine[]>([{ itemId: "", bags: 0, kg: 0 }]);
  const [notes, setNotes] = useState("");

  const customers = useQuery({
    queryKey: ["milling", "customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as CustomerOption[];
    },
  });

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

  const outputItems = useQuery({
    queryKey: ["milling", "output-items"],
    queryFn: fetchOutputItems,
  });

  const balances = useQuery({
    queryKey: ["milling", "balances", customerId, warehouseId],
    queryFn: () => fetchCustodyBalances(customerId || undefined, warehouseId || undefined),
    enabled: Boolean(customerId && warehouseId),
  });

  /** أرصدة الحبوب الخام فقط — ما يمكن طحنه. */
  const grainBalances = (balances.data ?? []).filter(
    (b) => b.item_class === "RAW_MATERIAL" && (b.bags_balance > 0 || b.kg_balance > 0),
  );
  const selectedGrain = grainBalances.find((b) => b.item_id === grainItemId);

  const submit = useMutation({
    mutationFn: () =>
      custodyMilling({
        customerId,
        warehouseId,
        grainItemId,
        bagsOut: Number(bagsOut) || 0,
        kgOut: Number(kgOut) || 0,
        outputs,
        notes: notes || undefined,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر تسجيل الطحن.");
        return;
      }
      toast.success(`تم تسجيل الطحن — سند ${res.data ?? ""}`);
      setBagsOut("");
      setKgOut("");
      setOutputs([{ itemId: "", bags: 0, kg: 0 }]);
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["milling"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "خطأ غير متوقع"),
  });

  const canSubmit = Boolean(
    customerId &&
    warehouseId &&
    grainItemId &&
    (Number(bagsOut) > 0 || Number(kgOut) > 0) &&
    outputs.some((o) => o.itemId && (o.bags > 0 || o.kg > 0)),
  );

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader
          title="الطحن"
          subtitle="اختر من رصيد حبوب العميل وأدخل النواتج — الفارق يظهر في الكشف كفاقد مكتشف، ولا يُدخل."
          actions={
            <Link
              to="/milling/delivery"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
            >
              التالي: التسليم <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          }
        />

        <div className="grid gap-4 lg:grid-cols-5">
          <MillingPanel className="lg:col-span-3">
            <MillingSectionTitle
              icon={<Cog className="h-4 w-4" />}
              title="عملية الطحن"
              subtitle="صادر حبوب + وارد نواتج — في معاملة واحدة"
            />
            <div className="space-y-4 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <MillingField label="العميل *">
                  <MillingSelect value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                    <option value="">اختر العميل…</option>
                    {(customers.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </MillingSelect>
                </MillingField>
                <MillingField label="المخزن *">
                  <MillingSelect
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                  >
                    <option value="">اختر المخزن…</option>
                    {(warehouses.data ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name_ar || w.name}
                      </option>
                    ))}
                  </MillingSelect>
                </MillingField>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <MillingField label="الحنوب المطحونة *">
                  <MillingSelect
                    value={grainItemId}
                    onChange={(e) => setGrainItemId(e.target.value)}
                  >
                    <option value="">اختر الصنف…</option>
                    {grainBalances.map((b) => (
                      <option key={b.item_id} value={b.item_id}>
                        {b.name_ar} — متبقٍ {fmtNum(b.bags_balance)} كيس
                      </option>
                    ))}
                  </MillingSelect>
                </MillingField>
                <MillingField label="أكياس مطحونة">
                  <MillingInput
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={bagsOut}
                    onChange={(e) => setBagsOut(e.target.value)}
                  />
                </MillingField>
                <MillingField label="وزن مطحون (كجم)">
                  <MillingInput
                    type="number"
                    min={0}
                    step="0.001"
                    inputMode="decimal"
                    placeholder="0"
                    value={kgOut}
                    onChange={(e) => setKgOut(e.target.value)}
                  />
                </MillingField>
              </div>

              {selectedGrain && (
                <p className="rounded-xl bg-sky-500/10 px-3 py-2 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                  رصيد الحنوب المختار: {fmtNum(selectedGrain.bags_balance)} كيس /{" "}
                  {fmtNum(selectedGrain.kg_balance)} كجم
                </p>
              )}

              {/* النواتج */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">
                    النواتج (دقيق / نخالة / سميد…)
                  </label>
                  <button
                    type="button"
                    onClick={() => setOutputs((o) => [...o, { itemId: "", bags: 0, kg: 0 }])}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" /> ناتج آخر
                  </button>
                </div>
                {outputs.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_90px_100px_36px] items-center gap-2"
                  >
                    <MillingSelect
                      value={line.itemId}
                      onChange={(e) =>
                        setOutputs((o) =>
                          o.map((l, i) => (i === idx ? { ...l, itemId: e.target.value } : l)),
                        )
                      }
                    >
                      <option value="">اختر الناتج…</option>
                      {(outputItems.data ?? []).map((g: ProductOption) => (
                        <option key={g.id} value={g.id}>
                          {g.name_ar || g.name}
                        </option>
                      ))}
                    </MillingSelect>
                    <MillingInput
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="أكياس"
                      value={line.bags || ""}
                      onChange={(e) =>
                        setOutputs((o) =>
                          o.map((l, i) =>
                            i === idx ? { ...l, bags: Number(e.target.value) || 0 } : l,
                          ),
                        )
                      }
                    />
                    <MillingInput
                      type="number"
                      min={0}
                      step="0.001"
                      inputMode="decimal"
                      placeholder="كجم"
                      value={line.kg || ""}
                      onChange={(e) =>
                        setOutputs((o) =>
                          o.map((l, i) =>
                            i === idx ? { ...l, kg: Number(e.target.value) || 0 } : l,
                          ),
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
              </div>

              <MillingField label="ملاحظات" hint="اختيارية">
                <MillingTextarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: طحن ظهراً — آلة 2"
                />
              </MillingField>

              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate()}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submit.isPending ? "جارٍ التسجيل…" : "تسجيل الطحن"}
              </button>
            </div>
          </MillingPanel>

          <MillingPanel className="lg:col-span-2">
            <MillingSectionTitle
              icon={<Wheat className="h-4 w-4" />}
              title="أرصدة الحنوب"
              subtitle="ما يمكن طحنه الآن لهذا العميل"
            />
            <div className="space-y-3 p-4">
              {!customerId || !warehouseId ? (
                <MillingEmpty title="اختر العميل والمخزن" />
              ) : grainBalances.length === 0 ? (
                <MillingEmpty
                  title="لا حنوب في رصيد العميل"
                  hint="سجّل استلاماً أولاً من شاشة الاستلام."
                />
              ) : (
                grainBalances.map((b) => (
                  <div
                    key={b.item_id}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-surface-2/40 px-3 py-2"
                  >
                    <span className="text-xs font-bold text-foreground">{b.name_ar}</span>
                    <span className="flex items-center gap-2">
                      {b.bags_balance > 0 && <Mono>{fmtNum(b.bags_balance)} كيس</Mono>}
                      {b.kg_balance > 0 && <Mono>{fmtNum(b.kg_balance)} كجم</Mono>}
                    </span>
                  </div>
                ))
              )}
            </div>
          </MillingPanel>
        </div>
      </div>
    </ModuleGuard>
  );
}
