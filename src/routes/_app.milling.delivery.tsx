/**
 * /milling/delivery — التسليم (الشاشة الثالثة من الثلاث).
 *
 * رصيد العميل العيني → يُدخل المسلَّم → أسطر DELIVERY في custody_ledger.
 * لا يُسلَّم أكثر مما تبقى باسم العميل — الدالة في القاعدة ترفض ذلك.
 * المرجع: docs/milling/00_خطة_التبسيط_المعتمدة.md §4.1
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Truck, Plus, Trash2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import { custodyDelivery, fetchCustodyBalances, type CustodyLine } from "@/lib/milling";
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

export const Route = createFileRoute("/_app/milling/delivery")({
  head: () => ({ meta: [{ title: "التسليم — فورتكس ERP" }] }),
  component: MillingDeliveryPage,
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

function MillingDeliveryPage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<CustodyLine[]>([{ itemId: "", bags: 0, kg: 0 }]);
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

  const balances = useQuery({
    queryKey: ["milling", "balances", customerId, warehouseId],
    queryFn: () => fetchCustodyBalances(customerId || undefined, warehouseId || undefined),
    enabled: Boolean(customerId && warehouseId),
  });

  /** الأرصدة القابلة للتسليم (نواتج وحبوب متبقية باسم العميل). */
  const available = (balances.data ?? []).filter(
    (b) => (b.bags_balance > 0 || b.kg_balance > 0) && b.item_class !== "RAW_MATERIAL",
  );

  const submit = useMutation({
    mutationFn: () =>
      custodyDelivery({
        customerId,
        warehouseId,
        lines,
        notes: notes || undefined,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر تسجيل التسليم.");
        return;
      }
      toast.success(`تم تسليم التسليم — سند ${res.data ?? ""}`);
      setLines([{ itemId: "", bags: 0, kg: 0 }]);
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["milling"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "خطأ غير متوقع"),
  });

  const canSubmit = Boolean(
    customerId && warehouseId && lines.some((l) => l.itemId && (l.bags > 0 || l.kg > 0)),
  );

  const balanceFor = (itemId: string) => available.find((b) => b.item_id === itemId);

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader
          title="تسليم النواتج"
          subtitle="أخرج من رصيد العميل العيني — لا أثر مالي، والرصيد يُعاد حسابه فوراً."
          actions={
            <Link
              to="/milling/customer-statement"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
            >
              كشف الحساب
            </Link>
          }
        />

        <div className="grid gap-4 lg:grid-cols-5">
          <MillingPanel className="lg:col-span-3">
            <MillingSectionTitle
              icon={<Truck className="h-4 w-4" />}
              title="سند التسليم"
              subtitle="سطر لكل صنف يُسلَّم — جزئي أو كامل"
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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground">
                    المسلَّم للعميل
                  </label>
                  <button
                    type="button"
                    onClick={() => setLines((l) => [...l, { itemId: "", bags: 0, kg: 0 }])}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-bold text-foreground hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" /> سطر آخر
                  </button>
                </div>
                {lines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_90px_100px_36px] items-center gap-2"
                  >
                    <MillingSelect
                      value={line.itemId}
                      onChange={(e) =>
                        setLines((l) =>
                          l.map((x, i) => (i === idx ? { ...x, itemId: e.target.value } : x)),
                        )
                      }
                    >
                      <option value="">اختر الصنف…</option>
                      {available.map((b) => (
                        <option key={b.item_id} value={b.item_id}>
                          {b.name_ar} — متبقٍ {fmtNum(b.bags_balance)} كيس
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
                        setLines((l) =>
                          l.map((x, i) =>
                            i === idx ? { ...x, bags: Number(e.target.value) || 0 } : x,
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
                        setLines((l) =>
                          l.map((x, i) =>
                            i === idx ? { ...x, kg: Number(e.target.value) || 0 } : x,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      disabled={lines.length === 1}
                      onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}
                      className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-500/10 disabled:opacity-30"
                      aria-label="حذف السطر"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {lines.some((l) => l.itemId && balanceFor(l.itemId)) && (
                  <div className="space-y-1">
                    {lines
                      .filter((l) => l.itemId && balanceFor(l.itemId))
                      .map((l, i) => {
                        const b = balanceFor(l.itemId)!;
                        const overBags = l.bags > b.bags_balance;
                        const overKg = l.kg > b.kg_balance;
                        if (!overBags && !overKg) return null;
                        return (
                          <p
                            key={i}
                            className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-300"
                          >
                            {b.name_ar}: الكمية المطلوبة أكبر من المتبقي ({fmtNum(b.bags_balance)}{" "}
                            كيس / {fmtNum(b.kg_balance)} كجم)
                          </p>
                        );
                      })}
                  </div>
                )}
              </div>

              <MillingField label="ملاحظات" hint="اختيارية">
                <MillingTextarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: تسليم دفعة أولى — سيارة صغيرة"
                />
              </MillingField>

              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate()}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submit.isPending ? "جارٍ التسجيل…" : "تسجيل التسليم"}
              </button>
            </div>
          </MillingPanel>

          <MillingPanel className="lg:col-span-2">
            <MillingSectionTitle
              icon={<PackageCheck className="h-4 w-4" />}
              title="ما يبقى باسم العميل"
              subtitle="جاهز للتسليم الآن"
            />
            <div className="space-y-3 p-4">
              {!customerId || !warehouseId ? (
                <MillingEmpty title="اختر العميل والمخزن" />
              ) : available.length === 0 ? (
                <MillingEmpty
                  title="لا نواتج متبقية"
                  hint="بعد الطحن تظهر النواتج هنا جاهزة للتسليم."
                />
              ) : (
                available.map((b) => (
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
