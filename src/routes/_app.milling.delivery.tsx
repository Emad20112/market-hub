/**
 * /milling/delivery — التسليم (الشاشة الثالثة من الثلاث).
 *
 * رصيد العميل العيني → يُدخل المسلَّم → أسطر DELIVERY في custody_ledger.
 * لا يُسلَّم أكثر مما تبقى باسم العميل — الدالة في القاعدة ترفض ذلك.
 * المرجع: docs/milling/00_خطة_التبسيط_المعتمدة.md §4.1
 */
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Truck, Plus, Trash2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import {
  custodyDelivery,
  fetchCustodyBalances,
  capacityKgOf,
  buildCustodyVoucher,
  custodyVoucherToDoc,
  type CustodyLine,
} from "@/lib/milling";
import { UniversalPrintPreview } from "@/components/universal-print-preview";
import { type PrintRequest } from "@/lib/printing";
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
  component: () => <Navigate to="/milling/intake" replace />,
});

interface CustomerOption {
  id: string;
  name: string;
}
interface WarehouseOption {
  id: string;
  name_ar: string | null;
  name: string;
  is_default?: boolean;
}

function MillingDeliveryPage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [lines, setLines] = useState<CustodyLine[]>([{ itemId: "", bags: 0, kg: 0 }]);
  const [autoKgLines, setAutoKgLines] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");
  /** سند الطباعة الجاهز للمعاينة — يُفتح بعد تسجيل التسليم (05 §بند 8.4). */
  const [printRequest, setPrintRequest] = useState<PrintRequest | null>(null);

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
        .select("id, name, name_ar, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WarehouseOption[];
    },
  });

  /* المستودع الافتراضي يُحدد تلقائياً — لا يختاره المستخدم كل مرة. */
  useEffect(() => {
    if (warehouseId) return;
    const list = warehouses.data ?? [];
    const preferred = list.find((w) => w.is_default) ?? list[0];
    if (preferred) setWarehouseId(preferred.id);
  }, [warehouses.data, warehouseId]);

  const balances = useQuery({
    queryKey: ["milling", "balances", customerId, warehouseId],
    queryFn: () => fetchCustodyBalances(customerId || undefined, warehouseId || undefined),
    enabled: Boolean(customerId && warehouseId),
  });

  /** الأرصدة القابلة للتسليم (نواتج وحبوب متبقية باسم العميل). */
  const available = (balances.data ?? []).filter(
    (b) => (b.bags_balance > 0 || b.kg_balance > 0) && b.item_class !== "RAW_MATERIAL",
  );

  /** خريطة سعة العبوة لكل صنف — من القاعدة. */
  const capacityMap = useQuery({
    queryKey: ["milling", "capacity-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, package_weight_kg")
        .eq("is_active", true)
        .limit(2000);
      if (error) throw error;
      const m = new Map<string, number | null>();
      for (const r of (data ?? []) as { id: string; package_weight_kg: number | null }[]) {
        m.set(r.id, capacityKgOf(r));
      }
      return m;
    },
  });
  const cap = (itemId: string) => capacityMap.data?.get(itemId) ?? null;

  function changeLineItem(idx: number, itemId: string) {
    const c = cap(itemId);
    setLines((l) =>
      l.map((x, i) => {
        if (i !== idx) return x;
        const n = Number(x.bags) || 0;
        const auto = autoKgLines.has(idx) || x.kg === 0;
        const kg = c && auto && n > 0 ? n * c : x.kg;
        return { ...x, itemId, kg };
      }),
    );
    if (c) setAutoKgLines((s) => new Set(s).add(idx));
  }
  function changeLineBags(idx: number, bags: number) {
    setLines((l) =>
      l.map((x, i) => {
        if (i !== idx) return x;
        const c = cap(x.itemId);
        const auto = autoKgLines.has(idx) || x.kg === 0;
        if (c && auto) return { ...x, bags, kg: bags > 0 ? bags * c : 0 };
        return { ...x, bags };
      }),
    );
  }
  function changeLineKg(idx: number, kg: number) {
    setLines((l) => l.map((x, i) => (i === idx ? { ...x, kg } : x)));
    setAutoKgLines((s) => {
      const n = new Set(s);
      n.delete(idx);
      return n;
    });
  }

  const submit = useMutation({
    mutationFn: () =>
      custodyDelivery({
        customerId,
        warehouseId,
        lines,
        notes: notes || undefined,
      }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر تسجيل التسليم.");
        return;
      }
      toast.success(`تم تسجيل التسليم — سند ${res.data ?? ""}`);
      /*
       * سند التسليم يُبنى من السجل الفعلي عبر رقم السند الذي تعيده الدالة،
       * ويُعرض عبر محرك الطباعة القياسي — لا قالب خاص ولا مصدر ثانٍ.
       */
      if (res.data) {
        try {
          const voucher = await buildCustodyVoucher(res.data as string);
          if (voucher) {
            setPrintRequest({
              doc: custodyVoucherToDoc(voucher),
              documentType: "mill_document",
              rtl: true,
            });
          }
        } catch {
          /* الطباعة تحسين تجربة لا تُفشل العملية. */
        }
      }
      setLines([{ itemId: "", bags: 0, kg: 0 }]);
      setAutoKgLines(new Set());
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["milling"] });
      /*
       * After a full delivery the side balance card disappears — so say it
       * plainly instead of leaving the screen silent (05 §بند 8.2). The check
       * reads the derived balance view, never a stored number.
       */
      void fetchCustodyBalances(customerId, warehouseId).then((rows) => {
        const stillHolding = rows.some(
          (b) => Number(b.bags_balance) > 0 || Number(b.kg_balance) > 0,
        );
        if (!stillHolding) {
          toast.success("تم تسليم كامل رصيد هذا العميل");
        }
      });
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
                      onChange={(e) => changeLineItem(idx, e.target.value)}
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
                      onChange={(e) => changeLineBags(idx, Number(e.target.value) || 0)}
                    />
                    <MillingInput
                      type="number"
                      min={0}
                      step="0.001"
                      inputMode="decimal"
                      placeholder="كجم"
                      title={
                        cap(line.itemId)
                          ? `محسوب تلقائياً من السعة ${cap(line.itemId)} كجم — قابل للتعديل`
                          : undefined
                      }
                      value={line.kg || ""}
                      onChange={(e) => changeLineKg(idx, Number(e.target.value) || 0)}
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

        {/* سند التسليم — معاين وطباعة عبر محرك الطباعة القياسي (05 §بند 8.4). */}
        {printRequest ? (
          <UniversalPrintPreview
            open
            onOpenChange={(open) => {
              if (!open) setPrintRequest(null);
            }}
            request={printRequest}
            title="سند تسليم أمانة"
            rtl
          />
        ) : null}
      </div>
    </ModuleGuard>
  );
}
