/**
 * /milling/intake — الاستلام (الشاشة الأولى من الثلاث).
 *
 * عميل + مخزن + صنف حبوب + أكياس + كجم → سطر INTAKE في custody_ledger.
 * لا أوزان ثلاثية، لا رطوبة، لا صوامع — القبّان يكتب رقمين: أكياس وكجم.
 * المرجع: docs/milling/00_خطة_التبسيط_المعتمدة.md §4.1
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PackagePlus, Scale, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import {
  custodyIntake,
  fetchGrainItems,
  fetchCustodyBalances,
  capacityKgOf,
  buildCustodyVoucher,
  custodyVoucherToDoc,
  fetchCustodyDocNumber,
  type ProductOption,
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
  Mono,
  MillingEmpty,
  fmtNum,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/milling/intake")({
  head: () => ({ meta: [{ title: "استلام الأمانات — فورتكس ERP" }] }),
  component: MillingIntakePage,
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

function MillingIntakePage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [itemId, setItemId] = useState("");
  const [bags, setBags] = useState("");
  const [kg, setKg] = useState("");
  /** هل الوزن الحالي محسوب تلقائياً من (أكياس × سعة الكيس)؟ */
  const [kgAuto, setKgAuto] = useState(false);
  const [notes, setNotes] = useState("");
  /** سند الطباعة الجاهز للمعاينة — يُفتح بعد تسجيل الاستلام (05 §بند 8.4). */
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

  /* المستودع الافتراضي يُحدد تلقائياً — لا يختاره المستخدم كل مرة (المصدر: warehouses.is_default). */
  useEffect(() => {
    if (warehouseId) return;
    const list = warehouses.data ?? [];
    const preferred = list.find((w) => w.is_default) ?? list[0];
    if (preferred) setWarehouseId(preferred.id);
  }, [warehouses.data, warehouseId]);

  const grainItems = useQuery({
    queryKey: ["milling", "grain-items"],
    queryFn: fetchGrainItems,
  });

  const balances = useQuery({
    queryKey: ["milling", "balances", customerId, warehouseId],
    queryFn: () => fetchCustodyBalances(customerId || undefined, warehouseId || undefined),
    enabled: Boolean(customerId && warehouseId),
  });

  /** سعة كيس الصنف المختار — من بيانات الصنف في القاعدة، لا يُدخل هنا. */
  const bagCapacity = capacityKgOf((grainItems.data ?? []).find((g) => g.id === itemId));

  function changeBags(v: string) {
    setBags(v);
    const n = Number(v) || 0;
    if (bagCapacity && (kgAuto || kg === "")) {
      setKg(n > 0 ? String(n * bagCapacity) : "");
      setKgAuto(n > 0);
    }
  }
  function changeKg(v: string) {
    setKg(v);
    setKgAuto(false);
  }

  const submit = useMutation({
    mutationFn: () =>
      custodyIntake({
        customerId,
        warehouseId,
        itemId,
        bags: Number(bags) || 0,
        kg: Number(kg) || 0,
        notes: notes || undefined,
      }),
    onSuccess: async (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر تسجيل الاستلام.");
        return;
      }
      toast.success("تم تسجيل الاستلام — أُضيف لرصيد العميل العيني.");
      /*
       * سند الاستلام يُبنى من السجل الفعلي (custody_ledger) بلا حالة شاشة،
       * ويُعرض عبر محرك الطباعة القياسي — لا قالب خاص ولا مصدر ثانٍ.
       */
      if (res.id) {
        try {
          const docNumber = await fetchCustodyDocNumber(res.id as string);
          if (docNumber) {
            const voucher = await buildCustodyVoucher(docNumber);
            if (voucher) {
              setPrintRequest({
                doc: custodyVoucherToDoc(voucher),
                documentType: "mill_document",
                rtl: true,
              });
            }
          }
        } catch {
          /* الطباعة تحسين تجربة لا تُفشل العملية — رسالة النجاح تكفي. */
        }
      }
      setItemId("");
      setBags("");
      setKg("");
      setKgAuto(false);
      setNotes("");
      void qc.invalidateQueries({ queryKey: ["milling"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "خطأ غير متوقع"),
  });

  const canSubmit = Boolean(
    customerId && warehouseId && itemId && (Number(bags) > 0 || Number(kg) > 0),
  );

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader
          title="استلام الأمانات"
          subtitle="حبوب العميل تُستلم كأمانة — رصيد عيني له، صفر أثر على مخزون المطحنة."
          actions={
            <Link
              to="/milling/milling"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
            >
              التالي: الطحن <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          }
        />

        <div className="grid gap-4 lg:grid-cols-5">
          {/* النموذج */}
          <MillingPanel className="lg:col-span-3">
            <MillingSectionTitle
              icon={<Scale className="h-4 w-4" />}
              title="سند الاستلام"
              subtitle="سطر واحد لكل استلام — الرصيد يُحتسب تلقائياً"
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
                <MillingField
                  label="المخزن *"
                  hint="المستودع الافتراضي مُحدد تلقائياً — غيّره عند الحاجة فقط."
                >
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

              <MillingField
                label="صنف الحبوب *"
                hint="القائمة من أصناف النظام (مواد خام) — لا يُدخل نوع جديد من هنا."
              >
                <MillingSelect
                  value={itemId}
                  onChange={(e) => {
                    setItemId(e.target.value);
                    // تغيير الصنف يعيد الاحتساب بسعة الكيس الجديدة إن كان الوزن تلقائياً.
                    const cap = capacityKgOf(
                      (grainItems.data ?? []).find((g) => g.id === e.target.value),
                    );
                    const n = Number(bags) || 0;
                    if (cap && (kgAuto || kg === "")) {
                      setKg(n > 0 ? String(n * cap) : "");
                      setKgAuto(n > 0);
                    }
                  }}
                >
                  <option value="">اختر الصنف…</option>
                  {(grainItems.data ?? []).map((g: ProductOption) => (
                    <option key={g.id} value={g.id}>
                      {g.name_ar || g.name}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>

              <div className="grid gap-4 sm:grid-cols-2">
                <MillingField label="عدد الأكياس">
                  <MillingInput
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="0"
                    value={bags}
                    onChange={(e) => changeBags(e.target.value)}
                  />
                </MillingField>
                <MillingField
                  label="الوزن الإجمالي (كجم)"
                  hint={
                    bagCapacity
                      ? `محسوب تلقائياً: الأكياس × سعة الكيس (${bagCapacity} كجم) — قابل للتعديل`
                      : "الصنف غير معبّأ بسعة معرّفة — أدخل الوزن يدوياً"
                  }
                >
                  <MillingInput
                    type="number"
                    min={0}
                    step="0.001"
                    inputMode="decimal"
                    placeholder="0"
                    value={kg}
                    onChange={(e) => changeKg(e.target.value)}
                  />
                </MillingField>
              </div>

              <MillingField
                label="ملاحظات"
                hint="اختيارية — رقم القاطبة، اسم السائق، أي وصف مطلوب."
              >
                <MillingTextarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: قاطبة 1234 — تفريغ صباحاً"
                />
              </MillingField>

              <button
                type="button"
                disabled={!canSubmit || submit.isPending}
                onClick={() => submit.mutate()}
                className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submit.isPending ? "جارٍ التسجيل…" : "تسجيل الاستلام"}
              </button>
            </div>
          </MillingPanel>

          {/* رصيد العميل الحالي */}
          <MillingPanel className="lg:col-span-2">
            <MillingSectionTitle
              title="رصيد العميل الحالي"
              subtitle="مشتق من السجل دائماً — لا رصيد مخزَّن"
            />
            <div className="space-y-3 p-4">
              {!customerId || !warehouseId ? (
                <MillingEmpty title="اختر العميل والمخزن لعرض رصيده" />
              ) : (balances.data ?? []).filter((b) => b.bags_balance > 0 || b.kg_balance > 0)
                  .length === 0 ? (
                <MillingEmpty title="لا يوجد رصيد حالياً" hint="أول استلام سيظهر هنا فوراً." />
              ) : (
                (balances.data ?? [])
                  .filter((b) => b.bags_balance > 0 || b.kg_balance > 0)
                  .map((b) => (
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
              {customerId && (
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  الرصيد يُعاد حسابه من السجل بعد كل حركة.
                </div>
              )}
            </div>
          </MillingPanel>
        </div>

        {/* سند الاستلام — معاين وطباعة عبر محرك الطباعة القياسي (05 §بند 8.4). */}
        {printRequest ? (
          <UniversalPrintPreview
            open
            onOpenChange={(open) => {
              if (!open) setPrintRequest(null);
            }}
            request={printRequest}
            title="سند استلام أمانة"
            rtl
          />
        ) : null}
      </div>
    </ModuleGuard>
  );
}
