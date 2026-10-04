import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Scale,
  Zap,
  PackagePlus,
  Printer,
  CheckCircle2,
  Wheat,
  Boxes,
  Truck,
  Plus,
  RefreshCw,
  Search,
  Receipt,
  User,
  Phone,
  Clock,
  ChevronDown,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  executeDirectMillingTicket,
  executeBulkCustodyIntake,
  fetchTodayUnifiedFeed,
  fetchGrainGrades,
  type DirectMillingTicketInput,
  type QuickMillingFeedItem,
  type GrainGradeOption,
} from "@/lib/milling/unified-operations";
import {
  UnifiedPrintModal,
  type UnifiedTicketPrintData,
} from "@/components/milling/unified-print-modal";
import {
  MillingPanel,
  MillingSectionTitle,
  StatTile,
  Mono,
  Pill,
  Cell,
  MillingTable,
  MillingRow,
  MillingEmpty,
} from "@/components/milling/milling-ui";

const db = supabase as any;

export function UnifiedMillingDesk() {
  const qc = useQueryClient();

  // Active sub-mode: "DIRECT" (طحن فوري نقدي) vs "BULK" (استلام أمانات تجاري)
  const [activeTab, setActiveTab] = useState<"DIRECT" | "BULK">("DIRECT");

  // Search in feed
  const [feedSearch, setFeedSearch] = useState("");

  // Print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [ticketToPrint, setTicketToPrint] = useState<UnifiedTicketPrintData | null>(null);

  // ── Queries ──
  const warehouses = useQuery({
    queryKey: ["milling", "warehouses"],
    queryFn: async () => {
      const { data } = await db
        .from("warehouses")
        .select("id, name_ar, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      return (data || []) as { id: string; name_ar: string; is_default: boolean }[];
    },
  });
  const defaultStoreId = warehouses.data?.find((w) => w.is_default)?.id || warehouses.data?.[0]?.id || "";

  const customers = useQuery({
    queryKey: ["milling", "customers"],
    queryFn: async () => {
      const { data } = await db
        .from("customers")
        .select("id, name, phone")
        .eq("is_active", true)
        .order("name");
      return (data || []) as { id: string; name: string; phone: string | null }[];
    },
  });

  // ── Grain Grades from DB (unified for both forms) ──
  const grainGrades = useQuery({
    queryKey: ["milling", "grain-grades"],
    queryFn: fetchGrainGrades,
  });

  const packagingProducts = useQuery({
    queryKey: ["milling", "packaging-products"],
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("id, sku, name_ar, sale_price")
        .ilike("sku", "PKG-%")
        .eq("is_active", true);
      return (data || []) as { id: string; sku: string; name_ar: string; sale_price: number }[];
    },
  });

  const serviceFeeProduct = useQuery({
    queryKey: ["milling", "service-fee-product"],
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("id, sku, name_ar, sale_price")
        .eq("sku", "SRV-MILL-BAG50")
        .maybeSingle();
      return data;
    },
  });

  const feedQuery = useQuery({
    queryKey: ["milling", "unified-feed", defaultStoreId],
    queryFn: () => fetchTodayUnifiedFeed(defaultStoreId),
    enabled: Boolean(defaultStoreId),
    refetchInterval: 15000,
  });

  // ── Direct Ticket Form State ──
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [directCustomerName, setDirectCustomerName] = useState("عميل نقدي صالة");
  const [directCustomerPhone, setDirectCustomerPhone] = useState("");
  const [selectedGrainGradeId, setSelectedGrainGradeId] = useState<string>("");
  const [millingType, setMillingType] = useState<"FLOUR_GRADE_1" | "FLOUR_GRADE_2" | "SEMOLINA" | "BRAN">("FLOUR_GRADE_1");
  const [bagCount, setBagCount] = useState(1);
  const [bagSizeKg, setBagSizeKg] = useState(50);
  const [bagsSource, setBagsSource] = useState<"CUSTOMER" | "MILL">("CUSTOMER");
  const [selectedMillBagId, setSelectedMillBagId] = useState<string>("");
  const [millBagPrice, setMillBagPrice] = useState(500);
  const [millingFeeRate, setMillingFeeRate] = useState(1000);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "debt">("cash");
  const [directNotes, setDirectNotes] = useState("");

  // Auto-select first grain grade when loaded
  React.useEffect(() => {
    if (grainGrades.data && grainGrades.data.length > 0 && !selectedGrainGradeId) {
      setSelectedGrainGradeId(grainGrades.data[0].id);
    }
  }, [grainGrades.data]);

  // Get the selected grain grade object
  const selectedGrainGrade = useMemo(() => {
    return grainGrades.data?.find((g) => g.id === selectedGrainGradeId) || null;
  }, [grainGrades.data, selectedGrainGradeId]);

  // Update bag size when grain grade changes
  React.useEffect(() => {
    if (selectedGrainGrade?.default_bag_size_kg) {
      setBagSizeKg(Number(selectedGrainGrade.default_bag_size_kg));
    }
  }, [selectedGrainGrade]);

  // Update default fee from product when loaded
  React.useEffect(() => {
    if (serviceFeeProduct.data?.sale_price && Number(serviceFeeProduct.data.sale_price) > 0) {
      setMillingFeeRate(Number(serviceFeeProduct.data.sale_price));
    }
  }, [serviceFeeProduct.data]);

  // Update bag price when packaging item changes
  const handleSelectPackaging = (prodId: string) => {
    setSelectedMillBagId(prodId);
    const item = packagingProducts.data?.find((p) => p.id === prodId);
    if (item?.sale_price) {
      setMillBagPrice(Number(item.sale_price));
    }
  };

  // Direct calculation totals
  const totalWeightKg = useMemo(() => bagCount * bagSizeKg, [bagCount, bagSizeKg]);
  const millingFeeTotal = useMemo(() => bagCount * millingFeeRate, [bagCount, millingFeeRate]);
  const packagingTotal = useMemo(() => (bagsSource === "MILL" ? bagCount * millBagPrice : 0), [bagsSource, bagCount, millBagPrice]);
  const grandTotal = useMemo(() => Math.max(0, millingFeeTotal + packagingTotal - discount), [millingFeeTotal, packagingTotal, discount]);

  // ── Bulk Custody Form State ──
  const [bulkCustomerId, setBulkCustomerId] = useState("");
  const [bulkGrainGradeId, setBulkGrainGradeId] = useState("");
  const [bulkBagCount, setBulkBagCount] = useState(50);
  const [bulkBagSizeKg, setBulkBagSizeKg] = useState(50);
  const [bulkGrossWeight, setBulkGrossWeight] = useState(2500);
  const [bulkTareWeight, setBulkTareWeight] = useState(0);
  const [bulkTruckPlate, setBulkTruckPlate] = useState("");
  const [bulkDriverName, setBulkDriverName] = useState("");
  const [bulkNotes, setBulkNotes] = useState("");

  // Auto-select first grain grade for bulk too
  React.useEffect(() => {
    if (grainGrades.data && grainGrades.data.length > 0 && !bulkGrainGradeId) {
      setBulkGrainGradeId(grainGrades.data[0].id);
    }
  }, [grainGrades.data]);

  const selectedBulkGrainGrade = useMemo(() => {
    return grainGrades.data?.find((g) => g.id === bulkGrainGradeId) || null;
  }, [grainGrades.data, bulkGrainGradeId]);

  // Update bulk gross weight when bag count/size changes
  React.useEffect(() => {
    setBulkGrossWeight(bulkBagCount * bulkBagSizeKg);
  }, [bulkBagCount, bulkBagSizeKg]);

  // ── Mutations ──
  const directMillingMutation = useMutation({
    mutationFn: async () => {
      if (!defaultStoreId) throw new Error("المستودع غير محدد.");
      return executeDirectMillingTicket({
        storeId: defaultStoreId,
        customerId: selectedCustomerId || undefined,
        customerName: directCustomerName,
        customerPhone: directCustomerPhone || undefined,
        grainType: selectedGrainGrade?.grade_name_ar || "قمح بلدي محلي",
        grainGradeId: selectedGrainGradeId || undefined,
        grainProductId: selectedGrainGrade?.product_id || undefined,
        millingType,
        bagCount,
        bagSizeKg,
        totalWeightKg,
        bagsSource,
        millBagProductId: bagsSource === "MILL" ? selectedMillBagId || packagingProducts.data?.[0]?.id : null,
        millBagsCount: bagCount,
        millBagPrice,
        millingFeeRate,
        discount,
        paymentMethod,
        paidAmount: grandTotal,
        notes: directNotes,
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "فشل تنفيذ العملية.");
        return;
      }

      toast.success(`تم تنفيذ الطحن بنجاح! رقم الفاتورة: ${res.ticketNumber}`);
      void qc.invalidateQueries({ queryKey: ["milling"] });

      // Open print modal
      if (res.details) {
        setTicketToPrint({
          ticketNumber: res.ticketNumber || "MIL-001",
          customerName: res.details.customerName,
          customerPhone: directCustomerPhone,
          grainType: res.details.grainType,
          millingTypeLabel: res.details.millingTypeLabel,
          bagCount: res.details.bagCount,
          bagSizeKg: res.details.bagSizeKg,
          totalWeightKg: res.details.totalWeightKg,
          bagsSourceLabel: res.details.bagsSourceLabel,
          millingFeeTotal: res.details.millingFeeTotal,
          packagingTotal: res.details.packagingTotal,
          discount,
          grandTotal: res.details.grandTotal,
          paidAmount: res.paidAmount || res.details.grandTotal,
          remainingAmount: res.remainingAmount || 0,
          paymentMethodLabel: paymentMethod === "cash" ? "نقداً" : paymentMethod === "card" ? "شبكة" : paymentMethod === "transfer" ? "تحويل" : "آجل",
          createdAt: res.details.createdAt,
          notes: directNotes,
          companyName: "مطحنة الحبوب الحديثة",
        });
        setPrintModalOpen(true);
      }

      // Reset fast form to clean defaults
      setBagCount(1);
      setDiscount(0);
      setDirectNotes("");
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء معالجة العملية.");
    },
  });

  const bulkIntakeMutation = useMutation({
    mutationFn: async () => {
      if (!defaultStoreId) throw new Error("اختر المستودع أولاً.");
      if (!bulkCustomerId) throw new Error("اختر العميل صاحب الأمانات.");
      return executeBulkCustodyIntake({
        storeId: defaultStoreId,
        customerId: bulkCustomerId,
        grainType: selectedBulkGrainGrade?.grade_name_ar || "قمح بلدي محلي",
        grainGradeId: bulkGrainGradeId || undefined,
        grainProductId: selectedBulkGrainGrade?.product_id || undefined,
        bagCount: bulkBagCount,
        bagSizeKg: bulkBagSizeKg,
        grossWeightKg: bulkGrossWeight,
        tareWeightKg: bulkTareWeight,
        truckPlate: bulkTruckPlate || undefined,
        driverName: bulkDriverName || undefined,
        notes: bulkNotes || undefined,
      });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message || "فشل تسجيل سند الأمانات.");
        return;
      }
      toast.success(`تم استلام الحبوب بنجاح! رقم سند الأمانات: ${res.number}`);
      void qc.invalidateQueries({ queryKey: ["milling"] });
      // Reset form
      setBulkNotes("");
      setBulkTruckPlate("");
      setBulkDriverName("");
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء تسجيل السند.");
    },
  });

  // Today feed stats
  const feedItems = feedQuery.data || [];
  const todayMilledKg = feedItems.filter((i) => i.type === "DIRECT_MILL").reduce((s, i) => s + i.weightKg, 0);
  const todayTotalRevenue = feedItems.filter((i) => i.type === "DIRECT_MILL").reduce((s, i) => s + i.amount, 0);
  const todayCustodyKg = feedItems.filter((i) => i.type === "CUSTODY_INTAKE").reduce((s, i) => s + i.weightKg, 0);

  // Filtered feed
  const filteredFeed = useMemo(() => {
    if (!feedSearch.trim()) return feedItems;
    const q = feedSearch.trim().toLowerCase();
    return feedItems.filter(
      (item) =>
        item.customerName.toLowerCase().includes(q) ||
        item.docNumber.toLowerCase().includes(q) ||
        item.grainType.toLowerCase().includes(q)
    );
  }, [feedItems, feedSearch]);

  // Grain grade dropdown items (unified for both forms)
  const grainGradeItems = grainGrades.data || [];

  return (
    <div className="space-y-5">
      {/* ── Top Key Metrics ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={<Wheat className="h-4 w-4" />}
          title="عمليات وسندات اليوم"
          value={feedItems.length}
          tone="amber"
        />
        <StatTile
          icon={<Scale className="h-4 w-4" />}
          title="كجم مطحون فوري اليوم"
          value={todayMilledKg.toLocaleString()}
          tone="emerald"
        />
        <StatTile
          icon={<Receipt className="h-4 w-4" />}
          title="إيراد أجور الطحن اليوم"
          value={`${todayTotalRevenue.toLocaleString()} ر.ي`}
          tone="sky"
        />
        <StatTile
          icon={<Boxes className="h-4 w-4" />}
          title="حبوب واردة بالأمانات (كجم)"
          value={todayCustodyKg.toLocaleString()}
          tone="violet"
        />
      </div>

      {/* ── Mode Selection Header Banner ── */}
      <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-card to-card p-5 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Scale className="h-5 w-5" />
              </span>
              <h2 className="text-lg font-black text-foreground">
                كاونتر المطحنة السريع (استلام • طحن • فوترة)
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              الخطة المبسطة للمطحنة: معالجة فورية لزبائن الصالة بدون دورة تصنيع معقدة، أو استلام وتخزين تجاري بالأمانات.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-muted p-1 border border-border shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab("DIRECT")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "DIRECT"
                  ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Zap className="h-4 w-4" />
              طحن فوري نقدي (تسليم فوري)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("BULK")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === "BULK"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <PackagePlus className="h-4 w-4" />
              استلام كميات تجارية (أمانات)
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Operations Form ── */}
      {activeTab === "DIRECT" ? (
        /* Direct Cash Milling Ticket Form */
        <MillingPanel>
          <MillingSectionTitle
            icon={<Zap className="h-4 w-4 text-amber-500" />}
            title="تذكرة طحن فوري ونقدي"
            subtitle="عميل صالة يحضر حبوباً لطحنها فوراً ← إصدار فاتورة مبيعات وسند استلام/تسليم مدمج"
          />

          <div className="p-6 space-y-6">
            {/* Row 1: Customer Details */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  اسم العميل
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={directCustomerName}
                    onChange={(e) => setDirectCustomerName(e.target.value)}
                    placeholder="مثال: أحمد عبد الله (أو عميل نقدي)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-primary/30"
                  />
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value);
                      const c = customers.data?.find((x) => x.id === e.target.value);
                      if (c) {
                        setDirectCustomerName(c.name);
                        setDirectCustomerPhone(c.phone || "");
                      }
                    }}
                    className="w-28 rounded-xl border border-border bg-muted/60 px-2 py-2 text-[11px] text-muted-foreground"
                    title="اختيار من العملاء المسجلين"
                  >
                    <option value="">مسجل مسبقاً؟</option>
                    {(customers.data || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  رقم الهاتف (اختياري)
                </label>
                <input
                  type="text"
                  value={directCustomerPhone}
                  onChange={(e) => setDirectCustomerPhone(e.target.value)}
                  placeholder="77xxxxxxxx"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                  <Wheat className="h-3.5 w-3.5 text-amber-500" />
                  نوع ودرجة الحبوب
                </label>
                <select
                  value={selectedGrainGradeId}
                  onChange={(e) => setSelectedGrainGradeId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground"
                >
                  {grainGradeItems.length === 0 && (
                    <option value="">جارٍ التحميل...</option>
                  )}
                  {grainGradeItems.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.grade_name_ar} {g.origin === "IMPORTED" ? "(مستورد)" : "(محلي)"} — سعة {g.default_bag_size_kg || 50} كجم
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 2: Milling & Bags Specifications */}
            <div className="grid gap-4 sm:grid-cols-4 bg-muted/20 p-4 rounded-2xl border border-border/80">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">درجة ونوع الطحن</label>
                <select
                  value={millingType}
                  onChange={(e) => setMillingType(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-amber-600 dark:text-amber-400"
                >
                  <option value="FLOUR_GRADE_1">طحن ناعم (دقيق زيرو / نمرة 1)</option>
                  <option value="FLOUR_GRADE_2">طحن بر (دقيق بلدي كامل الحبة)</option>
                  <option value="SEMOLINA">طحن سميد فاخر</option>
                  <option value="BRAN">جرش خشن / ردة نخالة</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">عدد الأكياس</label>
                <input
                  type="number"
                  min={1}
                  value={bagCount}
                  onChange={(e) => setBagCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold font-mono text-center"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">سعة الكيس (كجم)</label>
                <select
                  value={bagSizeKg}
                  onChange={(e) => setBagSizeKg(parseInt(e.target.value) || 50)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold font-mono"
                >
                  <option value={50}>شوال 50 كجم</option>
                  <option value={25}>كيس 25 كجم</option>
                  <option value={40}>كيس 40 كجم</option>
                  <option value={10}>كيس 10 كجم</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">الوزن الصافي الإجمالي</label>
                <div className="flex items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs font-black font-mono text-amber-700 dark:text-amber-300">
                  {totalWeightKg.toLocaleString()} كجم
                </div>
              </div>
            </div>

            {/* Row 3: Packaging & Materials */}
            <div className="grid gap-4 sm:grid-cols-3 bg-muted/20 p-4 rounded-2xl border border-border/80">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                  مصدر أكياس التعبئة
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBagsSource("CUSTOMER")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      bagsSource === "CUSTOMER"
                        ? "bg-background border-primary text-primary shadow-xs"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    أكياس العميل (مجاناً)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBagsSource("MILL")}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                      bagsSource === "MILL"
                        ? "bg-background border-primary text-primary shadow-xs"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    أكياس المطحنة (بيع)
                  </button>
                </div>
              </div>

              {bagsSource === "MILL" && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground">نوع كيس المطحنة</label>
                    <select
                      value={selectedMillBagId}
                      onChange={(e) => handleSelectPackaging(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium"
                    >
                      <option value="">— اختر صنف الكيس —</option>
                      {(packagingProducts.data || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name_ar} ({p.sale_price} ر.ي)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground">سعر الكيس الواحد</label>
                    <input
                      type="number"
                      value={millBagPrice}
                      onChange={(e) => setMillBagPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Row 4: Pricing, Totals, and Checkout */}
            <div className="grid gap-4 sm:grid-cols-4 items-end bg-card p-4 rounded-2xl border-2 border-primary/20 shadow-xs">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">أجرة الطحن للكيس الواحد</label>
                <div className="relative">
                  <input
                    type="number"
                    value={millingFeeRate}
                    onChange={(e) => setMillingFeeRate(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold font-mono pe-10"
                  />
                  <span className="absolute end-3 top-2.5 text-[10px] text-muted-foreground font-mono">ر.ي</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">الخصم (إن وجد)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono pe-10"
                  />
                  <span className="absolute end-3 top-2.5 text-[10px] text-muted-foreground font-mono">ر.ي</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">طريقة الدفع</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold"
                >
                  <option value="cash">نقداً</option>
                  <option value="card">شبكة / مدى</option>
                  <option value="transfer">حوالة / تحويل</option>
                  <option value="debt">آجل على الحساب</option>
                </select>
              </div>

              {/* Grand Total Display */}
              <div className="space-y-1 p-3 rounded-xl bg-primary/10 border border-primary/30 text-center">
                <span className="text-[11px] font-bold text-primary block">الإجمالي الصافي المطلوب</span>
                <span className="text-xl font-black text-primary font-mono block">
                  {grandTotal.toLocaleString()} <span className="text-xs font-normal">ر.ي</span>
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">ملاحظات (اختياري)</label>
              <input
                type="text"
                value={directNotes}
                onChange={(e) => setDirectNotes(e.target.value)}
                placeholder="ملاحظات إضافية على العملية..."
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
              />
            </div>

            {/* Submit Action */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span>
                  العملية فورية: لا تؤثر على مخزون الحبوب وتصدر فاتورة المبيعات وسند الاستلام والطباعة فوراً.
                </span>
              </div>

              <Button
                type="button"
                onClick={() => directMillingMutation.mutate()}
                disabled={directMillingMutation.isPending}
                className="rounded-full px-8 py-6 text-sm font-extrabold gap-2.5 bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25 transition-transform active:scale-95"
              >
                <Printer className="h-5 w-5" />
                {directMillingMutation.isPending ? "جارٍ تسجيل وطحن الحبوب..." : "تنفيذ الطحن الفوري وإصدار الفاتورة والسند"}
              </Button>
            </div>
          </div>
        </MillingPanel>
      ) : (
        /* Bulk Trader Custody Intake Form */
        <MillingPanel>
          <MillingSectionTitle
            icon={<PackagePlus className="h-4 w-4 text-primary" />}
            title="سند استلام وتخزين تجاري (أمانات حبوب)"
            subtitle="استلام شحنات تجار ومزارعين بكميات كبيرة (50 إلى 200 شوال) وإيداعها بالأمانات للتسليم لاحقاً"
          />

          <div className="p-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">العميل صاحب الأمانات *</label>
                <select
                  value={bulkCustomerId}
                  onChange={(e) => setBulkCustomerId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold"
                >
                  <option value="">— اختر العميل المسجل —</option>
                  {(customers.data || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Wheat className="h-3.5 w-3.5 text-amber-500" />
                  نوع ودرجة الحبوب المستلمة
                </label>
                <select
                  value={bulkGrainGradeId}
                  onChange={(e) => setBulkGrainGradeId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold"
                >
                  {grainGradeItems.length === 0 && (
                    <option value="">جارٍ التحميل...</option>
                  )}
                  {grainGradeItems.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.grade_name_ar} {g.origin === "IMPORTED" ? "(مستورد)" : g.origin === "LOCAL" ? "(محلي)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">رقم شاحنة التوريد (اختياري)</label>
                <input
                  type="text"
                  value={bulkTruckPlate}
                  onChange={(e) => setBulkTruckPlate(e.target.value)}
                  placeholder="مثال: نقل 12345 ص"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">اسم السائق (اختياري)</label>
                <input
                  type="text"
                  value={bulkDriverName}
                  onChange={(e) => setBulkDriverName(e.target.value)}
                  placeholder="اسم سائق الشحنة"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">ملاحظات (اختياري)</label>
                <input
                  type="text"
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  placeholder="ملاحظات إضافية على السند..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4 bg-muted/20 p-4 rounded-2xl border border-border">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">عدد الأكياس</label>
                <input
                  type="number"
                  min={1}
                  value={bulkBagCount}
                  onChange={(e) => setBulkBagCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-bold text-center"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">سعة الكيس</label>
                <select
                  value={bulkBagSizeKg}
                  onChange={(e) => setBulkBagSizeKg(parseInt(e.target.value) || 50)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-bold"
                >
                  <option value={50}>شوال 50 كجم</option>
                  <option value={25}>كيس 25 كجم</option>
                  <option value={40}>كيس 40 كجم</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">الوزن القائم ميزان (كجم)</label>
                <input
                  type="number"
                  value={bulkGrossWeight}
                  onChange={(e) => setBulkGrossWeight(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono font-bold text-center"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">وزن السيارة الفارغة (كجم)</label>
                <input
                  type="number"
                  value={bulkTareWeight}
                  onChange={(e) => setBulkTareWeight(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono text-center"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground">
                الوزن الصافي المعتمد للأمانات:{" "}
                <span className="font-bold font-mono text-foreground">
                  {(bulkGrossWeight - bulkTareWeight).toLocaleString()} كجم
                </span>
              </div>

              <Button
                type="button"
                onClick={() => bulkIntakeMutation.mutate()}
                disabled={bulkIntakeMutation.isPending || !bulkCustomerId}
                className="rounded-full px-8 py-5 text-xs font-bold gap-2"
              >
                <PackagePlus className="h-4 w-4" />
                {bulkIntakeMutation.isPending ? "جارٍ حفظ السند..." : "إصدار سند استلام الأمانات"}
              </Button>
            </div>
          </div>
        </MillingPanel>
      )}

      {/* ── Today Live Feed Table ── */}
      <MillingPanel>
        <div className="flex flex-col gap-3 p-4 border-b border-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold text-foreground">سجل عمليات وتذاكر اليوم</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-mono font-bold text-muted-foreground">
              {feedItems.length} حركة
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute start-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={feedSearch}
                onChange={(e) => setFeedSearch(e.target.value)}
                placeholder="بحث برقم السند أو اسم العميل..."
                className="h-9 w-64 rounded-xl border border-border bg-background pe-3 ps-8 text-xs focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void feedQuery.refetch()}
              className="h-9 rounded-xl px-3 text-xs"
              title="تحديث السجل"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${feedQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {feedQuery.isLoading ? (
          <p className="p-8 text-center text-xs text-muted-foreground">جارٍ تحميل سجل العمليات...</p>
        ) : !filteredFeed.length ? (
          <MillingEmpty
            title="لا توجد عمليات مسجلة اليوم بعد"
            description="سجل أول عملية طحن فوري أو استلام أمانات من النموذج أعلاه."
          />
        ) : (
          <MillingTable
            minWidth={850}
            headers={[
              "رقم السند/الفاتورة",
              "نوع العملية",
              "العميل",
              "نوع الحبوب",
              "الكمية والأكياس",
              "الوزن (كجم)",
              "المبلغ (ر.ي)",
              "الحالة",
              "الإجراءات",
            ]}
          >
            {filteredFeed.map((item) => (
              <MillingRow key={item.id}>
                <Cell>
                  <Mono className="font-bold text-foreground">{item.docNumber}</Mono>
                </Cell>
                <Cell>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {item.typeLabelAr}
                  </span>
                </Cell>
                <Cell>
                  <span className="font-bold text-foreground">{item.customerName}</span>
                </Cell>
                <Cell className="text-xs text-muted-foreground">{item.grainType}</Cell>
                <Cell align="center">
                  <Mono>
                    {item.bagCount} كيس ({item.bagSizeKg} كجم)
                  </Mono>
                </Cell>
                <Cell align="center">
                  <Mono className="font-bold">{item.weightKg.toLocaleString()}</Mono>
                </Cell>
                <Cell align="end">
                  <Mono className="font-bold text-emerald-600">
                    {item.amount > 0 ? `${item.amount.toLocaleString()}` : "—"}
                  </Mono>
                </Cell>
                <Cell>
                  <Pill
                    tone={
                      item.status === "DELIVERED" || item.isDelivered
                        ? "emerald"
                        : item.status === "COMPLETED"
                          ? "sky"
                          : "amber"
                    }
                  >
                    {item.statusLabelAr}
                  </Pill>
                </Cell>
                <Cell align="end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTicketToPrint({
                        ticketNumber: item.docNumber,
                        customerName: item.customerName,
                        grainType: item.grainType,
                        millingTypeLabel: "طحن ناعم قياسي",
                        bagCount: item.bagCount,
                        bagSizeKg: item.bagSizeKg,
                        totalWeightKg: item.weightKg,
                        bagsSourceLabel: "أكياس العميل",
                        millingFeeTotal: item.amount,
                        packagingTotal: 0,
                        grandTotal: item.amount,
                        paidAmount: item.paid,
                        remainingAmount: Math.max(0, item.amount - item.paid),
                        createdAt: item.createdAt,
                      });
                      setPrintModalOpen(true);
                    }}
                    className="h-7 rounded-lg text-xs gap-1 border-border/80 hover:bg-muted"
                  >
                    <Printer className="h-3 w-3" />
                    طباعة
                  </Button>
                </Cell>
              </MillingRow>
            ))}
          </MillingTable>
        )}
      </MillingPanel>

      {/* ── Print & Receipt Modal ── */}
      <UnifiedPrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        data={ticketToPrint}
      />
    </div>
  );
}
