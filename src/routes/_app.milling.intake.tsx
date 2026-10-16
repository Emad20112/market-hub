/**
 * /milling/intake — كاونتر المطحنة الموحد.
 *
 * العميل + الحبوب + الأكياس + السعة + الوزن التلقائي
 * + أجرة الطحن + الخصم + طريقة الدفع + المدفوع/الآجل
 * = مستند مطحنة واحد + فاتورة مبيعات رسمية حقيقية في نفس المعاملة.
 *
 * يدعم:
 *   1. إنشاء مستند جديد مع فاتورته الرسمية مباشرة.
 *   2. فتح أي مستند قائم لاحقاً عبر ?docId= أو من قائمة متابعة المستندات والبحث.
 *   3. الضبط المحكم للوزن الآلي حسب سعة العبوة الرسمية للصنف.
 * المرجع: docs/milling/07_تدقيق_ما_قبل_التسليم_والفجوات.md
 */
import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import {
  Scale,
  CheckCircle2,
  ReceiptText,
  Search,
  FileText,
  Clock,
  Sparkles,
  ChevronLeft,
  X,
  Filter,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { CustomerFormDialog } from "@/components/contacts/customer-form-dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  createMillingServiceDocument,
  fetchGrainItems,
  fetchServiceItem,
  fetchCustodyBalances,
  fetchMillingDocuments,
  fetchMillingServiceDocument,
  capacityKgOf,
  syncAutoWeightOnItemChange,
  type MillingServiceDocumentCreated,
  type ProductOption,
  type MillingServiceDocument,
} from "@/lib/milling";
import { PaymentMethodPicker } from "@/components/ui/payment-method";
import {
  getPaymentMethodDefinition,
  toLegacyPaymentValue,
  paymentMethodLabel,
} from "@/lib/payments/payment-methods";
import { MillingDocumentWorkflow } from "@/components/milling/milling-document-workflow";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingField,
  MillingInput,
  MillingSelect,
  MillingTextarea,
  Pill,
  Mono,
  MillingEmpty,
  fmtNum,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/milling/intake")({
  validateSearch: (search: Record<string, unknown>): { docId?: string } => ({
    docId: typeof search.docId === "string" ? search.docId : undefined,
  }),
  head: () => ({ meta: [{ title: "استقبال وفواتير الطحن — فورتكس ERP" }] }),
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
  const navigate = useNavigate();
  const { docId: initialDocId } = useSearch({ from: "/_app/milling/intake" });

  const [activeTab, setActiveTab] = useState<"new" | "open_docs">("new");
  const [customerId, setCustomerId] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [itemId, setItemId] = useState("");
  const [bags, setBags] = useState("");
  const [kg, setKg] = useState("");
  /** هل الوزن الحالي محسوب تلقائياً من (أكياس × سعة الكيس)؟ */
  const [kgAuto, setKgAuto] = useState(false);
  const [notes, setNotes] = useState("");
  const [servicePrice, setServicePrice] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paid, setPaid] = useState("");
  const [createdDocument, setCreatedDocument] = useState<MillingServiceDocumentCreated | null>(
    null,
  );

  // مرشحات قائمة المستندات المفتوحة
  const [docSearch, setDocSearch] = useState("");
  const [docStatusFilter, setDocStatusFilter] = useState<string>("ALL");

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

  const grainItems = useQuery({
    queryKey: ["milling", "grain-items"],
    queryFn: fetchGrainItems,
  });
  const serviceItem = useQuery({
    queryKey: ["milling", "service-item"],
    queryFn: fetchServiceItem,
  });

  useEffect(() => {
    if (!servicePrice && serviceItem.data)
      setServicePrice(String(serviceItem.data.sale_price ?? 0));
  }, [serviceItem.data, servicePrice]);

  const balances = useQuery({
    queryKey: ["milling", "balances", customerId, warehouseId],
    queryFn: () => fetchCustodyBalances(customerId || undefined, warehouseId || undefined),
    enabled: Boolean(customerId && warehouseId),
  });

  // قائمة المستندات المفتوحة للمتابعة والبحث
  const openDocumentsQuery = useQuery({
    queryKey: ["milling", "open-documents", docStatusFilter],
    queryFn: () => fetchMillingDocuments({ status: docStatusFilter }),
  });

  // فتح مستند تلقائياً إذا كان ممرراً عبر الرابط ?docId=
  const loadedDocQuery = useQuery({
    queryKey: ["milling", "single-doc", initialDocId],
    queryFn: () => (initialDocId ? fetchMillingServiceDocument(initialDocId) : null),
    enabled: Boolean(initialDocId),
  });

  useEffect(() => {
    if (loadedDocQuery.data) {
      setCreatedDocument({
        document_id: loadedDocQuery.data.id,
        document_number: loadedDocQuery.data.document_number,
        invoice_id: loadedDocQuery.data.sales_invoice_id,
        invoice_number: loadedDocQuery.data.sales_invoices?.invoice_number || "—",
      });
    }
  }, [loadedDocQuery.data]);

  /** سعة كيس الصنف المختار — من بيانات الصنف في القاعدة. */
  const selectedGrainItem = (grainItems.data ?? []).find((g) => g.id === itemId);
  const bagCapacity = capacityKgOf(selectedGrainItem);

  function changeBags(v: string) {
    setBags(v);
    const n = Number(v) || 0;
    if (bagCapacity && (kgAuto || kg === "" || Number(kg) === 0)) {
      setKg(n > 0 ? String(n * bagCapacity) : "");
      setKgAuto(n > 0);
    }
  }

  function changeKg(v: string) {
    setKg(v);
    setKgAuto(false);
  }

  function handleGrainItemChange(newId: string) {
    setItemId(newId);
    const nextItem = (grainItems.data ?? []).find((g) => g.id === newId);
    const synced = syncAutoWeightOnItemChange(nextItem, bags, kgAuto, kg);
    setKg(synced.kg);
    setKgAuto(synced.isAuto);
  }

  const submit = useMutation({
    mutationFn: () =>
      createMillingServiceDocument({
        customerId,
        warehouseId,
        grainItemId: itemId,
        bags: Number(bags) || 0,
        kg: Number(kg) || 0,
        serviceItemId: serviceItem.data?.id ?? "",
        serviceUnitPrice: Number(servicePrice) || 0,
        discount: Number(discount) || 0,
        paymentMethod: toLegacyPaymentValue(paymentMethod),
        paid: paymentMethod === "credit" ? 0 : Number(paid) || 0,
        notes: notes || undefined,
      }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "تعذر تسجيل الاستلام.");
        return;
      }
      setCreatedDocument(res.data ?? null);
      toast.success("تم إنشاء مستند الطحن وفاتورة المبيعات الرسمية بنجاح.");
      setItemId("");
      setBags("");
      setKg("");
      setKgAuto(false);
      setNotes("");
      setPaid("");
      void qc.invalidateQueries({ queryKey: ["milling"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "خطأ غير متوقع"),
  });

  const canSubmit = Boolean(
    customerId &&
    warehouseId &&
    itemId &&
    Boolean(serviceItem.data?.id) &&
    (Number(bags) > 0 || Number(kg) > 0),
  );

  const filteredOpenDocs = useMemo(() => {
    let list = openDocumentsQuery.data ?? [];
    if (docSearch.trim()) {
      const q = docSearch.trim().toLowerCase();
      list = list.filter(
        (d) =>
          (d.document_number || "").toLowerCase().includes(q) ||
          (d.customers?.name || "").toLowerCase().includes(q) ||
          (d.sales_invoices?.invoice_number || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [openDocumentsQuery.data, docSearch]);

  const openDocument = (doc: MillingServiceDocument) => {
    setCreatedDocument({
      document_id: doc.id,
      document_number: doc.document_number,
      invoice_id: doc.sales_invoice_id,
      invoice_number: doc.sales_invoices?.invoice_number || "—",
    });
    // Scroll to workflow
    window.scrollTo({ top: 400, behavior: "smooth" });
  };

  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <PageHeader
          title="استقبال وفواتير الطحن"
          subtitle="إصدار فاتورة أجور الطحن الرسمية واستلام أمانة العميل ومتابعة الطحن والتسليم في معاملة واحدة."
        />

        {/* التبويبات العلوية: إنشاء مستند جديد / المستندات المفتوحة */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
          <div className="flex rounded-xl bg-muted p-1 border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("new")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "new" ? "bg-amber-500 text-white shadow-xs" : "text-muted-foreground"
              }`}
            >
              <Scale className="me-1.5 inline h-3.5 w-3.5" /> استلام جديد وفاتورة طحن
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("open_docs")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "open_docs"
                  ? "bg-amber-500 text-white shadow-xs"
                  : "text-muted-foreground"
              }`}
            >
              <FileText className="me-1.5 inline h-3.5 w-3.5" /> المستندات المفتوحة والبحث
              {(openDocumentsQuery.data ?? []).length > 0 && (
                <span className="ms-1.5 rounded-full bg-white/20 px-1.5 py-0.2 text-[10px]">
                  {(openDocumentsQuery.data ?? []).length}
                </span>
              )}
            </button>
          </div>

          {createdDocument && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs">
              <span className="font-bold text-primary">المستند النشط:</span>
              <Mono className="font-bold text-foreground">{createdDocument.document_number}</Mono>
              <button
                type="button"
                onClick={() => setCreatedDocument(null)}
                className="text-muted-foreground hover:text-foreground text-[11px] ms-1"
                title="إغلاق المستند النشط"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* تبويب: مستند جديد (الاستلام والفاتورة) */}
        {activeTab === "new" && (
          <div className="grid gap-4 lg:grid-cols-5">
            {/* النموذج */}
            <MillingPanel className="lg:col-span-3">
              <MillingSectionTitle
                icon={<Scale className="h-4 w-4" />}
                title="استلام وفاتورة أجور طحن"
                subtitle="سجل الأمانة العينية والفاتورة الرسمية ينشآن معاً، بلا شاشات متعددة أو ربط يدوي."
              />
              <div className="space-y-4 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <MillingField label="صاحب الأمانة / العميل *">
                    <div className="flex items-center gap-1.5">
                      <MillingSelect
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        className="flex-1"
                      >
                        <option value="">اختر العميل…</option>
                        {(customers.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </MillingSelect>
                      <button
                        type="button"
                        onClick={() => setQuickCustomerOpen(true)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-2 text-xs font-bold text-primary shadow-xs transition hover:bg-primary/20"
                        title="إضافة عميل جديد سريعاً دون مغادرة الكاونتر"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">جديد</span>
                      </button>
                    </div>
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
                  label="صنف الحبوب المستلمة *"
                  hint="من أصناف المواد الخام المسجلة — تُحدد سعة الكيس منها تلقائياً."
                >
                  <MillingSelect
                    value={itemId}
                    onChange={(e) => handleGrainItemChange(e.target.value)}
                  >
                    <option value="">اختر الصنف…</option>
                    {(grainItems.data ?? []).map((g: ProductOption) => (
                      <option key={g.id} value={g.id}>
                        {g.name_ar || g.name}
                        {g.package_weight_kg ? ` (${g.package_weight_kg} كجم)` : ""}
                      </option>
                    ))}
                  </MillingSelect>
                </MillingField>

                {/* قسم الفاتورة الرسمية المدمجة في نفس المعاملة */}
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-foreground">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="h-4 w-4 text-amber-600" /> فاتورة أجور الطحن الرسمية
                    </div>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      فاتورة مبيعات حقيقية برقم رسمي
                    </span>
                  </div>
                  {serviceItem.data ? (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">
                        بند الخدمة:{" "}
                        <strong className="text-foreground">
                          {serviceItem.data.name_ar || serviceItem.data.name}
                        </strong>
                      </p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <MillingField label="سعر الخدمة">
                          <MillingInput
                            type="number"
                            min={0}
                            step="0.01"
                            value={servicePrice}
                            onChange={(e) => setServicePrice(e.target.value)}
                          />
                        </MillingField>
                        <MillingField label="الخصم">
                          <MillingInput
                            type="number"
                            min={0}
                            step="0.01"
                            value={discount}
                            onChange={(e) => setDiscount(e.target.value)}
                          />
                        </MillingField>
                        <MillingField label="المدفوع نقداً/شبكة">
                          <MillingInput
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={paymentMethod === "credit"}
                            value={paymentMethod === "credit" ? "0" : paid}
                            onChange={(e) => setPaid(e.target.value)}
                          />
                        </MillingField>
                      </div>
                      <MillingField label="طريقة الدفع">
                        <PaymentMethodPicker
                          context="sales"
                          value={paymentMethod}
                          onChange={(method) => {
                            setPaymentMethod(method);
                            if (getPaymentMethodDefinition(method)?.isCreditTerm) setPaid("0");
                          }}
                          ensureIds={[paymentMethod]}
                          ariaLabel="طريقة دفع فاتورة الطحن"
                        />
                      </MillingField>
                      <div className="flex items-center justify-between border-t border-amber-500/20 pt-2 text-xs font-semibold">
                        <span className="text-muted-foreground">إجمالي الفاتورة:</span>
                        <span className="text-foreground font-bold text-sm">
                          {fmtNum(
                            Math.max(0, (Number(servicePrice) || 0) - (Number(discount) || 0)),
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-rose-600">
                      يلزم تعريف صنف خدمة نشط لأجور الطحن قبل إنشاء الفاتورة.
                    </p>
                  )}
                </div>

                {/* الأكياس والوزن مع الحساب التلقائي المحكم */}
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
                        ? `سعة العبوة ${bagCapacity} كجم — يحسب تلقائياً وقابل للتعديل`
                        : "الصنف غير معبّأ بسعة معرّفة — أدخل الوزن يدوياً"
                    }
                  >
                    <div className="space-y-1">
                      <MillingInput
                        type="number"
                        min={0}
                        step="0.001"
                        inputMode="decimal"
                        placeholder="0"
                        value={kg}
                        onChange={(e) => changeKg(e.target.value)}
                      />
                      {kgAuto && bagCapacity && Number(bags) > 0 && (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          محسوب تلقائياً: {bags} كيس × {bagCapacity} كجم = {kg} كجم
                        </div>
                      )}
                    </div>
                  </MillingField>
                </div>

                <MillingField
                  label="ملاحظات الاستلام"
                  hint="اختيارية — رقم القاطبة، اسم السائق، رقم الإشعار اليدوي."
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
                  className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submit.isPending
                    ? "جارٍ تسجيل الاستلام والفاتورة…"
                    : "تسجيل الاستلام وإصدار فاتورة الأجور"}
                </button>
              </div>
            </MillingPanel>

            {/* رصيد العميل الحالي */}
            <MillingPanel className="lg:col-span-2">
              <MillingSectionTitle
                title="رصيد أمانات العميل"
                subtitle="مشتق دائماً من السجل — لا رصيد مخزَّن"
              />
              <div className="space-y-3 p-4">
                {!customerId || !warehouseId ? (
                  <MillingEmpty title="اختر العميل والمخزن لعرض رصيده العيني" />
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
                    الرصيد يُعاد حسابه من السجل بعد كل حركة أمانة.
                  </div>
                )}
              </div>
            </MillingPanel>
          </div>
        )}

        {/* تبويب: قائمة المستندات المفتوحة والبحث */}
        {activeTab === "open_docs" && (
          <div className="space-y-4">
            <MillingPanel>
              <div className="p-4 border-b border-border/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <MillingInput
                      value={docSearch}
                      onChange={(e) => setDocSearch(e.target.value)}
                      placeholder="بحث بالعميل، رقم المستند، الفاتورة…"
                      className="ps-8 text-xs"
                    />
                  </div>
                  <div className="flex rounded-lg bg-muted p-0.5 border border-border text-xs">
                    {(["ALL", "RECEIVED", "PROCESSED", "DELIVERED"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setDocStatusFilter(st)}
                        className={`px-2.5 py-1 rounded-md font-semibold transition ${
                          docStatusFilter === st
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {st === "ALL"
                          ? "الكل"
                          : st === "RECEIVED"
                            ? "مستلم"
                            : st === "PROCESSED"
                              ? "تم الطحن"
                              : "تم التسليم"}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  عرض {filteredOpenDocs.length} مستند
                </span>
              </div>

              <div className="overflow-x-auto">
                {filteredOpenDocs.length === 0 ? (
                  <div className="p-8">
                    <MillingEmpty
                      title="لا توجد مستندات مطابقة للبحث"
                      hint="سجل استلاماً جديداً أو غيّر معايير التصفية."
                    />
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/70 text-muted-foreground">
                        <th className="px-4 py-2.5 text-start font-bold">رقم المستند</th>
                        <th className="px-3 py-2.5 text-start font-bold">العميل</th>
                        <th className="px-3 py-2.5 text-center font-bold">الحالة</th>
                        <th className="px-3 py-2.5 text-center font-bold">الفاتورة</th>
                        <th className="px-3 py-2.5 text-center font-bold">الإجمالي</th>
                        <th className="px-3 py-2.5 text-center font-bold">المدفوع</th>
                        <th className="px-3 py-2.5 text-center font-bold">المتبقي</th>
                        <th className="px-3 py-2.5 text-center font-bold">تاريخ الاستلام</th>
                        <th className="px-4 py-2.5 text-end font-bold">الإجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOpenDocs.map((d) => {
                        const total = Number(d.sales_invoices?.total ?? 0);
                        const paid = Number(d.sales_invoices?.paid ?? 0);
                        const remaining = Math.max(0, total - paid);
                        const isCurrent = createdDocument?.document_id === d.id;

                        return (
                          <tr
                            key={d.id}
                            className={`border-b border-border/40 transition hover:bg-muted/40 ${
                              isCurrent ? "bg-primary/5" : ""
                            }`}
                          >
                            <td className="px-4 py-2.5 font-bold">
                              <Mono className="text-primary">{d.document_number}</Mono>
                            </td>
                            <td className="px-3 py-2.5 font-bold text-foreground">
                              {d.customers?.name || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {d.status === "DELIVERED" ? (
                                <Pill tone="emerald">تم التسليم</Pill>
                              ) : d.status === "PROCESSED" ? (
                                <Pill tone="amber">تم الطحن</Pill>
                              ) : (
                                <Pill tone="neutral">مستلم</Pill>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <Mono>#{d.sales_invoices?.invoice_number || "—"}</Mono>
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums font-semibold">
                              {fmtNum(total)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums text-emerald-600">
                              {fmtNum(paid)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {remaining > 0 ? (
                                <span className="font-bold text-rose-600">{fmtNum(remaining)}</span>
                              ) : (
                                <span className="text-emerald-600 font-semibold">مسدد</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center text-muted-foreground">
                              {new Date(d.received_at).toLocaleDateString("ar-EG")}
                            </td>
                            <td className="px-4 py-2.5 text-end">
                              <button
                                type="button"
                                onClick={() => openDocument(d)}
                                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                  isCurrent
                                    ? "bg-primary text-white"
                                    : "border border-border bg-card text-foreground hover:bg-muted"
                                }`}
                              >
                                {isCurrent ? "المستند مفتوح" : "فتح ومتابعة"}
                                <ChevronLeft className="h-3 w-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </MillingPanel>
          </div>
        )}

        {/* عرض ومتابعة المستند المفتوح (الطحن والتسليم والطباعة والواتساب) */}
        {createdDocument ? (
          <div className="mt-6">
            <MillingDocumentWorkflow
              document={createdDocument}
              onClose={() => setCreatedDocument(null)}
            />
          </div>
        ) : null}

        {/* نافذة إضافة عميل جديد سريعاً دون مغادرة الكاونتر */}
        <CustomerFormDialog
          open={quickCustomerOpen}
          onClose={() => setQuickCustomerOpen(false)}
          hint="سيتم اختيار العميل تلقائياً فور حفظه."
          onSaved={(newCust) => {
            void qc.invalidateQueries({ queryKey: ["milling", "customers"] });
            setCustomerId(newCust.id);
            setQuickCustomerOpen(false);
            toast.success(`تمت إضافة واختيار العميل: ${newCust.name}`);
          }}
        />
      </div>
    </ModuleGuard>
  );
}
