import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Boxes, Cog, Plus, TriangleAlert, Wheat, Trash2, CheckCircle2 } from "lucide-react";

import { ModuleGuard } from "@/lib/modules";
import { PRODUCTION_MODULE_ID } from "@/lib/production";
import {
  ALLOCATION_BASIS_OPTIONS,
  PRODUCTION_STATUS_LABELS,
  addOutput,
  completeOrder,
  createOrder,
  fetchBoms,
  fetchIssuableItems,
  fetchOrderLosses,
  fetchOrderLines,
  fetchOrderOutputs,
  fetchOrders,
  fetchProducibleItems,
  issueMaterial,
  recordLoss,
  unreconciled,
  type AllocationBasis,
  type OutputRole,
} from "@/lib/production";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import {
  Cell,
  MillingEmpty,
  MillingPanel,
  MillingRow,
  MillingSectionTitle,
  MillingTable,
  Mono,
  Pill,
  StatTile,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/production")({
  component: ProductionPage,
});

const nf = (v: number | null | undefined, d = 0) =>
  (v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

const MUTED = "text-muted-foreground";

/**
 * إنتاج المطحنة لملكها.
 *
 * مسار منفصل تماماً عن طحن الغير: هناك القمح ملك العميل وأثره صفر على
 * المخزون، وهنا القمح ملك المطحنة وكل حركة له مستند وتكلفة ومصدر.
 *
 * الفارق الجوهري في هذه الشاشة: الرقم الذي يهم ليس الإنتاج بل **الفرق غير
 * المفسَّر**. فارق صفر يعني أن الحساب قد استوفى؛ وأي فارق يعني وزناً اختفى،
 * ويقوم المحرك بتسجيله كفاقد بلا سبب إن أُغلق الأمر الآن.
 */
function ProductionPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["production"] });
  };

  const warehouses = useQuery({
    queryKey: ["production", "warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name_ar, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as { id: string; name_ar: string | null; is_default: boolean }[];
    },
  });
  const storeId = warehouses.data?.find((w) => w.is_default)?.id ?? warehouses.data?.[0]?.id;

  const orders = useQuery({
    queryKey: ["production", "orders", storeId],
    queryFn: () => fetchOrders(storeId),
    enabled: Boolean(storeId),
  });

  const activeId = selectedId ?? orders.data?.[0]?.id ?? null;

  const lines = useQuery({
    queryKey: ["production", "lines", activeId],
    queryFn: () => fetchOrderLines(activeId!),
    enabled: Boolean(activeId),
  });
  const outputs = useQuery({
    queryKey: ["production", "outputs", activeId],
    queryFn: () => fetchOrderOutputs(activeId!),
    enabled: Boolean(activeId),
  });
  const losses = useQuery({
    queryKey: ["production", "losses", activeId],
    queryFn: () => fetchOrderLosses(activeId!),
    enabled: Boolean(activeId),
  });
  const issuable = useQuery({
    queryKey: ["production", "issuable", storeId],
    queryFn: () => fetchIssuableItems(storeId!),
    enabled: Boolean(storeId),
  });
  const producible = useQuery({
    queryKey: ["production", "producible"],
    queryFn: fetchProducibleItems,
  });

  const order = orders.data?.find((o) => o.id === activeId) ?? null;
  const totalLoss = (losses.data ?? []).reduce((s, l) => s + Number(l.qty), 0);
  const gap = order ? unreconciled(order, totalLoss) : 0;

  /*
   * Generic so useMutation infers TVariables from the mutationFn signature.
   * Without the type parameters the inferred TData becomes `unknown`, the
   * variables collapse to `void`, and every mutate({...}) call is a type error.
   */
  const run = <TData, TVars>(fn: (v: TVars) => Promise<TData>, okMessage: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      setError(null);
      setNotice(okMessage);
      refresh();
    },
    onError: (e: Error) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const create = useMutation(
    run<string, void>(async () => {
      if (!storeId) throw new Error("اختر المستودع أولاً");
      return createOrder({
        warehouseId: storeId,
        bomId: null,
        allocationBasis:
          ((document.getElementById("alloc") as HTMLSelectElement)?.value as
            AllocationBasis | undefined) ?? "REMAINDER_TO_PRIMARY",
      });
    }, "تم فتح أمر الإنتاج"),
  );

  const issuableMutation = useMutation(
    run<void, { productId: string; qty: number }>(async (v) => {
      if (!activeId) throw new Error("اختر أمراً أولاً");
      return issueMaterial({ orderId: activeId, productId: v.productId, qty: v.qty });
    }, "تم صرف المواد من المخزون"),
  );

  const outputMutation = useMutation(
    run<void, { productId: string; qty: number; role: OutputRole }>(async (v) => {
      if (!activeId) throw new Error("اختر أمراً أولاً");
      return addOutput({ orderId: activeId, productId: v.productId, qty: v.qty, role: v.role });
    }, "تم استلام الناتج"),
  );

  const lossMutation = useMutation(
    run<void, { reason: string; qty: number }>(async (v) => {
      if (!activeId) throw new Error("اختر أمراً أولاً");
      return recordLoss({ orderId: activeId, reason: v.reason, qty: v.qty });
    }, "تم تسجيل الفاقد بسببه"),
  );

  const completeMutation = useMutation(
    run<void, void>(async () => {
      if (!activeId) throw new Error("اختر أمراً أولاً");
      const labour = Number((document.getElementById("labour") as HTMLInputElement)?.value || 0);
      const overhead = Number(
        (document.getElementById("overhead") as HTMLInputElement)?.value || 0,
      );
      return completeOrder({ orderId: activeId, labour, overhead });
    }, "تم إقفال الأمر وتوزيع التكلفة"),
  );

  const readNumber = (id: string) =>
    Number((document.getElementById(id) as HTMLInputElement)?.value || 0);
  const readText = (id: string) =>
    (document.getElementById(id) as HTMLInputElement | HTMLSelectElement)?.value ?? "";

  const basisHint =
    ALLOCATION_BASIS_OPTIONS.find(
      (o) => o.value === (order?.allocation_basis ?? "REMAINDER_TO_PRIMARY"),
    )?.hint ?? "";

  return (
    <ModuleGuard moduleId={PRODUCTION_MODULE_ID}>
      <PageHeader
        title="إنتاج المطحنة"
        subtitle="دورة إنتاج ملك المطحنة: قمح ← صرف ← نواتج ← فاقد ← تكلفة"
      />

      <div className="space-y-4">
        {/* ── مؤشرات ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={<Wheat className="h-4 w-4" />}
            title="أوامر إنتاج"
            value={orders.data?.length ?? 0}
            tone="amber"
          />
          <StatTile
            icon={<Cog className="h-4 w-4" />}
            title="مكتملة"
            value={(orders.data ?? []).filter((o) => o.status === "COMPLETED").length}
            tone="emerald"
          />
          <StatTile
            icon={<Boxes className="h-4 w-4" />}
            title="كجم ناتج مسجَّل"
            value={nf((orders.data ?? []).reduce((s, o) => s + Number(o.actual_output_qty), 0))}
            tone="sky"
          />
          <StatTile
            icon={<TriangleAlert className="h-4 w-4" />}
            title="أوامر فرقها غير مفسر"
            value={
              (orders.data ?? []).filter((o) => {
                const l = (losses.data ?? []).filter((x) => x.order_id === o.id);
                return (
                  o.actual_input_qty > 0 &&
                  unreconciled(
                    o,
                    l.reduce((s, x) => s + Number(x.qty), 0),
                  ) !== 0
                );
              }).length
            }
            tone="amber"
          />
        </div>

        {error && (
          <MillingPanel>
            <div className="flex items-start gap-3 p-4">
              <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <p className="text-xs leading-relaxed text-foreground">{error}</p>
            </div>
          </MillingPanel>
        )}
        {notice && !error && (
          <MillingPanel>
            <p className="flex items-center gap-2 p-4 text-xs font-bold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> {notice}
            </p>
          </MillingPanel>
        )}

        {/* ── الأوامر ── */}
        <MillingPanel>
          <MillingSectionTitle
            icon={<Boxes className="h-4 w-4" />}
            title="أوامر الإنتاج"
            subtitle="اختر أمراً لإدارة صرفه ونواتجه وتكلفته"
          />

          <div className="flex flex-wrap items-end gap-2 border-b border-border p-3">
            <label className="text-xs font-bold">
              أساس توزيع التكلفة
              <select
                id="alloc"
                className="mt-1 block rounded-lg border border-border bg-background px-2 py-1.5"
              >
                {ALLOCATION_BASIS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
              {basisHint}
            </p>
            <button
              type="button"
              onClick={() => create.mutate(undefined)}
              disabled={create.isPending || !storeId}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> أمر جديد
            </button>
          </div>

          {orders.isLoading ? (
            <p className="p-6 text-center text-xs text-muted-foreground">جارٍ التحميل…</p>
          ) : orders.isError ? (
            <div className="p-6">
              <p className="text-center text-xs font-bold text-rose-600">
                تعذّر تحميل أوامر الإنتاج: {(orders.error as Error).message}
              </p>
            </div>
          ) : !orders.data?.length ? (
            <MillingEmpty
              title="لا توجد أوامر إنتاج بعد"
              description="أنشئ أمراً لتبدأ دورة إنتاج قمح المطحنة."
            />
          ) : (
            <MillingTable
              minWidth={900}
              headers={[
                "الأمر",
                "التاريخ",
                "الحالة",
                "داخل كجم",
                "ناتج كجم",
                "الاستخلاص",
                "تكلفة ر.ي",
              ]}
            >
              {orders.data.map((o) => (
                <MillingRow
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={o.id === activeId ? "bg-muted/60" : undefined}
                >
                  <Cell>
                    <Mono className="font-bold">{o.order_number}</Mono>
                  </Cell>
                  <Cell className={MUTED}>{o.production_date}</Cell>
                  <Cell>
                    <Pill
                      tone={
                        o.status === "COMPLETED"
                          ? "emerald"
                          : o.status === "CANCELLED"
                            ? "rose"
                            : "amber"
                      }
                    >
                      {PRODUCTION_STATUS_LABELS[o.status]}
                    </Pill>
                  </Cell>
                  <Cell align="end">
                    <Mono>{nf(o.actual_input_qty)}</Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono>{nf(o.actual_output_qty)}</Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono
                      className={Number(o.actual_yield_pct ?? 0) < 75 ? "text-rose-600" : undefined}
                    >
                      {nf(o.actual_yield_pct, 1)}%
                    </Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono className="font-bold">{nf(o.total_cost, 0)}</Mono>
                  </Cell>
                </MillingRow>
              ))}
            </MillingTable>
          )}
        </MillingPanel>

        {/* ── تفاصيل الأمر ── */}
        {order && (
          <>
            <MillingPanel>
              <MillingSectionTitle
                icon={<Wheat className="h-4 w-4" />}
                title={`المواد المصروفة — ${order.order_number}`}
                subtitle="ما خرج فعلاً من المخزون：公司 فقط، وأمانات العميل غير قابلة للاستهلاك"
              />
              <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-3">
                <select
                  id="mat-pick"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">— اختر المادة —</option>
                  {(issuable.data ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku} · {i.name_ar ?? ""} (متاح {nf(i.on_hand)} كجم)
                    </option>
                  ))}
                </select>
                <input
                  id="mat-qty"
                  type="number"
                  placeholder="الكمية كجم"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    issuableMutation.mutate({
                      productId: readText("mat-pick"),
                      qty: readNumber("mat-qty"),
                    })
                  }
                  className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-bold hover:bg-muted"
                >
                  صرف من المخزون
                </button>
              </div>
              {!issuable.isLoading && !(issuable.data ?? []).length && (
                <p className="px-3 py-2 text-[11px] text-amber-600">
                  لا توجد مواد خام في مخزون الشركة لهذا المستودع. اشترِ قمحاً أولاً — أمانات العميل
                  ليست مادة إنتاج.
                </p>
              )}
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                المواد المتاحة:{" "}
                {(issuable.data ?? []).map((i) => `${i.sku} (${nf(i.on_hand)})`).join(" · ") ||
                  "لا شيء"}
              </p>
              {lines.data?.length ? (
                <MillingTable minWidth={520} headers={["الصنف", "مخطط", "فعلي", "تكلفة"]}>
                  {lines.data.map((l) => (
                    <MillingRow key={l.id}>
                      <Cell className={MUTED}>{l.product_id.slice(0, 8)}</Cell>
                      <Cell align="end">
                        <Mono>{nf(l.planned_qty)}</Mono>
                      </Cell>
                      <Cell align="end">
                        <Mono className="font-bold">{nf(l.actual_qty)}</Mono>
                      </Cell>
                      <Cell align="end">
                        <Mono>{nf(l.total_cost, 0)}</Mono>
                      </Cell>
                    </MillingRow>
                  ))}
                </MillingTable>
              ) : (
                <p className="p-4 text-center text-xs text-muted-foreground">لم تُصرف مواد بعد.</p>
              )}
            </MillingPanel>

            <MillingPanel>
              <MillingSectionTitle
                icon={<Boxes className="h-4 w-4" />}
                title="النواتج"
                subtitle="الأساسي يحمل التكلفة، والجانبي يُقيَّم بحسب أساس التوزيع"
              />
              <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-4">
                <select
                  id="out-pick"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="">— اختر الناتج —</option>
                  {(producible.data ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku} · {i.name_ar ?? ""} [
                      {i.item_class === "BY_PRODUCT" ? "جانبي" : "نهائي"}]
                    </option>
                  ))}
                </select>
                <input
                  id="out-qty"
                  type="number"
                  placeholder="الكمية كجم"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
                <select
                  id="out-role"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                >
                  <option value="PRIMARY">أساسي</option>
                  <option value="BY_PRODUCT">جانبي</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    outputMutation.mutate({
                      productId: readText("out-pick"),
                      qty: readNumber("out-qty"),
                      role: (document.getElementById("out-role") as HTMLSelectElement)
                        .value as OutputRole,
                    })
                  }
                  className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-bold hover:bg-muted"
                >
                  استلام الناتج
                </button>
              </div>
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                الأصناف القابلة للإنتاج:{" "}
                {(producible.data ?? []).map((i) => `${i.sku} [${i.item_class}]`).join(" · ") ||
                  "لا شيء"}
              </p>
              {outputs.data?.length ? (
                <MillingTable minWidth={560} headers={["الصنف", "الدور", "فعلي", "تكلفة"]}>
                  {outputs.data.map((o) => (
                    <MillingRow key={o.id}>
                      <Cell className={MUTED}>{o.sku ?? o.product_id.slice(0, 8)}</Cell>
                      <Cell>
                        <Pill tone={o.output_role === "PRIMARY" ? "emerald" : "sky"}>
                          {o.output_role === "PRIMARY" ? "أساسي" : "جانبي"}
                        </Pill>
                      </Cell>
                      <Cell align="end">
                        <Mono className="font-bold">{nf(o.actual_qty)}</Mono>
                      </Cell>
                      <Cell align="end">
                        <Mono>{nf(o.total_cost, 0)}</Mono>
                      </Cell>
                    </MillingRow>
                  ))}
                </MillingTable>
              ) : (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  لم تُستلم نواتج بعد.
                </p>
              )}
            </MillingPanel>

            <MillingPanel>
              <MillingSectionTitle
                icon={<Trash2 className="h-4 w-4" />}
                title="الفاقل"
                subtitle="كل فاقد بسبب؛ الفارق غير المفسَّر يُسجَّل ولا يُبتلع"
              />
              <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-3">
                <input
                  id="loss-reason"
                  type="text"
                  placeholder="السبب"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
                <input
                  id="loss-qty"
                  type="number"
                  placeholder="الكمية كجم"
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    lossMutation.mutate({
                      reason: readText("loss-reason"),
                      qty: readNumber("loss-qty"),
                    })
                  }
                  className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-bold hover:bg-muted"
                >
                  تسجيل الفاقد
                </button>
              </div>
              {losses.data?.length ? (
                <MillingTable minWidth={520} headers={["السبب", "الكمية", "القيمة"]}>
                  {losses.data.map((l) => (
                    <MillingRow key={l.id}>
                      <Cell>{l.reason}</Cell>
                      <Cell align="end">
                        <Mono className="font-bold">{nf(l.qty)}</Mono>
                      </Cell>
                      <Cell align="end">
                        <Mono>{nf(l.value, 0)}</Mono>
                      </Cell>
                    </MillingRow>
                  ))}
                </MillingTable>
              ) : (
                <p className="p-4 text-center text-xs text-muted-foreground">لا فاقد مسجَّل.</p>
              )}
            </MillingPanel>

            <MillingPanel>
              <MillingSectionTitle
                icon={<CheckCircle2 className="h-4 w-4" />}
                title="إقفال الأمر"
                subtitle="يوزّع التكلفة المشتركة ويقيّم النواتج في طبقة التكلفة"
              />
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                  <span className="text-xs font-bold">الفرق غير المفسَّر</span>
                  <Mono
                    className={
                      Math.abs(gap) < 0.001 ? "text-emerald-600" : "text-rose-600 font-bold"
                    }
                  >
                    {nf(gap, 3)} كجم
                  </Mono>
                  <span className="text-[11px] text-muted-foreground">
                    {Math.abs(gap) < 0.001
                      ? "الحساب متوازن."
                      : "هذا الوزن غير محسوب. إقفال الأمر الآن سيُسجّله فاقداً بلا سبب."}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    id="labour"
                    type="number"
                    placeholder="أجر مباشر ر.ي"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  />
                  <input
                    id="overhead"
                    type="number"
                    placeholder="مصروفات إضافية ر.ي"
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => completeMutation.mutate(undefined)}
                    disabled={completeMutation.isPending || order.status === "COMPLETED"}
                    className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground disabled:opacity-50"
                  >
                    إقفال وتوزيع التكلفة
                  </button>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  التكلفة الحالية {nf(order.total_cost, 0)} ر.ي — مواد {nf(order.material_cost, 0)}{" "}
                  · أجر {nf(order.direct_labour, 0)} · إضافية {nf(order.overhead_cost, 0)}.
                </p>
              </div>
            </MillingPanel>
          </>
        )}
      </div>
    </ModuleGuard>
  );
}
