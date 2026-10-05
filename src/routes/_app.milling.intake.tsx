import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PackagePlus, Printer, Scale, Wheat, Calculator, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import { createIntake, fetchIntakes, BAG_SIZES_KG, type MillingIntake } from "@/lib/milling";
import { fetchGrainGrades, checkGrainGrade } from "@/lib/milling/agreements";
import { printIntakeReceipt, type MillingPaper } from "@/lib/milling/print";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingField,
  MillingInput,
  MillingSelect,
  MillingTextarea,
  StatusBadge,
  Mono,
  Pill,
  MillingEmpty,
  Cell,
  QueryErrorGuard,
} from "@/components/milling/milling-ui";
import type { PageGuideConfig } from "@/components/page-guide";

export const Route = createFileRoute("/_app/milling/intake")({
  head: () => ({ meta: [{ title: "قبّان الميزان والاستلام — فورتكس ERP" }] }),
  component: MillingIntakePage,
});

const guide: PageGuideConfig = {
  title: "دليل شاشة الاستلام (القبّان)",
  subtitle: "كيف تسجّل حبوب العميل الواصلة بأكياسها وأوزانها، ولماذا لا تصبح مخزوناً للمطحنة.",
  badge: "العيّنة والمخزون",
  icon: <Scale className="h-5 w-5 text-amber-500" />,
  summaryText:
    "هذه الشاشة تسجّل استلام أمانات عينية. السند يثبت أن这些东西 داخل صومعة المطحنة لكنها ملك العميل، لذلك لا تدخل تقييم المخزون ولا تكلفة البضاعة المباعة، ولا تُنشئ أي مديونية على العميل.",
  overviewCards: [
    {
      title: "الوزن الاسمي",
      description: "عدد الأكياس × سعة الكيس. يُحسب آلياً بمجرد إدخال العدد.",
      icon: <Calculator className="h-4 w-4" />,
      color: "blue",
    },
    {
      title: "الوزن الصافي",
      description: "الوزن القائم − الفارغ، كما يقرأه الميزان. هو المرجع المعتمد.",
      icon: <Scale className="h-4 w-4" />,
      color: "amber",
    },
    {
      title: "عجز أوزان الأكياس",
      description: "الفرق بين الاسمي والصافي يبقى ظاهراً كدليل، ولا يُسوّى تلقائياً.",
      icon: <Info className="h-4 w-4" />,
      color: "purple",
    },
  ],
  stepsTitle: "خطوات الاستلام",
  steps: [
    {
      number: "1",
      title: "اختر العميل والمستودع",
      description: "الأمانات 항상 لعميل محدد؛ لا يوجد سند استلام بلا صاحب.",
    },
    {
      number: "2",
      title: "أدخل عدد الأكياس وسعة الكيس",
      description: "الوزن الاسمي يُحسب فوراً. مثال: 400 كيس × 50 كجم = 20,000 كجم.",
    },
    {
      number: "3",
      title: "أدخل أوزان الميزان",
      description: "الوزن القائم ووزن الفارغ؛ الصافي يُشتق في الخادم ولا يُقبل من الجهاز.",
    },
    {
      number: "4",
      title: "سجّل واطبع",
      description: "بعد الحفظ تظهر خيارات الطباعة الحرارية أو A4/A5 مع باركود السند.",
    },
  ],
  rulesTitle: "ما لا تفعله هذه الشاشة",
  rules: [
    {
      type: "danger",
      title: "لا تُنشئ شراء ولا ذمة",
      description: "سند الاستلام ليس فاتورة. لا مدين ولا دائن ولا أثر على رصيد العميل المالي.",
    },
    {
      type: "danger",
      title: "لا يمس المخزون التجاري",
      description:
        "الحبوب تُحفظ في جداول milling_* فقط، ولا تُسجَّل في inventory أو stock_movements.",
    },
    {
      type: "info",
      title: "الوزن الصافي يُشتق في الخادم",
      description: "ما يرسله المتصفح يُرفض؛ الخادم يحسب الصافي = القائم − الفارغ دائماً.",
    },
  ],
  footerTip: "نصيحة: سجّل نسبة الرطوبة عند الاستلام، فهي أساس تسوية الفاقد عند التسليم.",
};

// نُبقي النص حراً كاحتياط فقط. سلسلة الحيازة: القيمة الفعلية تأتي من
// فحص معرَّف في grain_grade_id، ونستخدمه كنص مشتق للعرض فقط.
// المرحلة 0: استُبدلت القائمة الثابتة `const grainTypes` بمرجع القاعدة.
const FALLBACK_GRAIN_TYPES = [
  "قمح صلب",
  "قمح بلدي",
  "قمح طري",
  "ذرة صفراء",
  "شعير",
  "شعير مجروش",
  "ذرة مجروشة",
];

const silos = ["صومعة 1", "صومعة 2", "صومعة 3", "عنبر 1", "عنبر 2", "مستودع الأمانات"];

const nf = (v: number, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

function MillingIntakePage() {
  const qc = useQueryClient();

  const [customerId, setCustomerId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [grainGradeId, setGrainGradeId] = useState("");
  const [grainType, setGrainType] = useState("");
  const [bagSize, setBagSize] = useState<number>(50);
  const [bagCount, setBagCount] = useState<number>(0);
  const [bagType, setBagType] = useState("شوال خيش طبيعي 50 كجم");
  const [bagSource, setBagSource] = useState<"CUSTOMER" | "MILL">("CUSTOMER");
  const [bagCondition, setBagCondition] = useState("سليم ومحكم");
  const [gross, setGross] = useState<number>(0);
  const [tare, setTare] = useState<number>(0);
  const [moisture, setMoisture] = useState<number>(0);
  const [impurities, setImpurities] = useState<number>(0);
  const [truckPlate, setTruckPlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [silo, setSilo] = useState(silos[0]);
  const [notes, setNotes] = useState("");

  // المرحلة 0: الفحوص تأتي من القاعدة، لا من مصفوفة ثابتة في الكود.
  // هذا يحل الانقسام بين "قمح صلب" (بلا مرجع) و "قمح صلب مستورد" (مرتبط).
  const {
    data: grainGrades,
    isError: grainGradesError,
    error: grainGradesDetail,
    refetch: grainGradesRefetch,
  } = useQuery({
    queryKey: ["milling", "grain-grades"],
    queryFn: () => fetchGrainGrades(true),
  });

  // اختيار أوتوماتيكي لأول درجة حبوب عند التحميل لمنع أي خطأ
  useState(() => {
    // Initial check
  });
  useMemo(() => {
    if (grainGrades && grainGrades.length > 0 && !grainGradeId) {
      const first = grainGrades[0];
      setGrainGradeId(first.id);
      setGrainType(first.grade_name_ar);
      setBagSize(Number(first.default_bag_size_kg) || 50);
      if (first.default_bag_type) {
        setBagType(first.default_bag_type);
      }
    }
  }, [grainGrades, grainGradeId]);

  // فحص الرطوبة/الشوائب مقابل الحد الفني — تنبيه لا منع (قرار المستخدم).
  const {
    data: gradeCheck,
    isError: gradeCheckError,
    error: gradeCheckDetail,
    refetch: gradeCheckRefetch,
  } = useQuery({
    queryKey: ["milling", "grade-check", grainGradeId, moisture || 0, impurities || 0],
    queryFn: () => checkGrainGrade(grainGradeId || null, moisture || 0, impurities || 0),
    enabled: !!grainGradeId,
  });

  const activeGrade = grainGrades?.find((g) => g.id === grainGradeId) ?? null;

  const {
    data: warehouses,
    isError: warehousesError,
    error: warehousesDetail,
    refetch: warehousesRefetch,
  } = useQuery({
    queryKey: ["milling", "warehouses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("warehouses")
        .select("id, name, name_ar, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      return (data ?? []) as {
        id: string;
        name: string;
        name_ar: string | null;
        is_default: boolean;
      }[];
    },
  });

  const {
    data: customers,
    isError: customersError,
    error: customersDetail,
    refetch: customersRefetch,
  } = useQuery({
    queryKey: ["milling", "customers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const activeStore = useMemo(
    () => storeId || warehouses?.find((w) => w.is_default)?.id || warehouses?.[0]?.id || "",
    [storeId, warehouses],
  );

  const {
    data: receipts,
    isError: receiptsError,
    error: receiptsDetail,
    refetch: receiptsRefetch,
  } = useQuery({
    queryKey: ["milling", "intakes", activeStore],
    queryFn: () => fetchIntakes(activeStore),
    enabled: Boolean(activeStore),
  });

  /* ------------------------------------------------- live scale calculator */

  const nominal = bagSize * (bagCount || 0);
  const net = Math.max((gross || 0) - (tare || 0), 0);
  const shortage = nominal - net;
  const tons = net / 1000;

  const createMutation = useMutation({
    mutationFn: createIntake,
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.message ?? "تعذّر حفظ سند الاستلام");
        return;
      }
      toast.success("تم تسجيل سند الاستلام — سند أمانات عينية");
      void qc.invalidateQueries({ queryKey: ["milling"] });
      setBagCount(0);
      setGross(0);
      setTare(0);
      setMoisture(0);
      setImpurities(0);
      setTruckPlate("");
      setDriverName("");
      setNotes("");
    },
    onError: () => toast.error("تعذّر حفظ سند الاستلام"),
  });

  const submit = () => {
    if (!customerId) return toast.error("اختر صاحب الأمانات");
    if (!activeStore) return toast.error("اختر المستودع");
    if (!grainGradeId) return toast.error("اختر نوع الحبوب — بدون فحص مرتبط لا يُحفظ السند");
    if (net <= 0) return toast.error("أدخل أوزان الميزان (القائم والفارغ)");

    // تنبيه فقط — لا يمنع (قرار المستخدم 2026-10-03).
    if (gradeCheck?.status === "WARN") {
      toast.warning(gradeCheck.message_ar);
    }

    createMutation.mutate({
      storeId: activeStore,
      customerId,
      grainType,
      grainGradeId: grainGradeId || null,
      grainProductId: activeGrade?.product_id ?? null,
      bagSizeKg: bagSize,
      bagCount: bagCount || 0,
      grossWeightKg: gross || 0,
      tareWeightKg: tare || 0,
      moisture: moisture || 0,
      impurities: impurities || 0,
      truckPlate,
      driverName,
      silo,
      notes,
    });
  };

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? "—";

  const warehouseName = (id: string) => {
    const w = warehouses?.find((x) => x.id === id);
    return w?.name_ar || w?.name || "—";
  };

  const doPrint = (r: MillingIntake, paper: MillingPaper) =>
    printIntakeReceipt(
      {
        receipt: r,
        customerName: customerName(r.customer_id),
        warehouseName: warehouseName(r.store_id),
      },
      paper,
    );

  /*
   * These 5 queries feed the tables and the counters below. A failed
   * one used to render as an empty table or a row of zeros, which reads as a
   * quiet day rather than a broken connection. The guard below turns any
   * failure into a stated error.
   */
  const queryStates = [
    { isError: grainGradesError, error: grainGradesDetail, refetch: grainGradesRefetch },
    { isError: gradeCheckError, error: gradeCheckDetail, refetch: gradeCheckRefetch },
    { isError: warehousesError, error: warehousesDetail, refetch: warehousesRefetch },
    { isError: customersError, error: customersDetail, refetch: customersRefetch },
    { isError: receiptsError, error: receiptsDetail, refetch: receiptsRefetch },
  ];

  if (queryStates.some((q) => q.isError)) {
    return <QueryErrorGuard what="سناد الاستلام" queries={queryStates} />;
  }

  return (
    <ModuleGuard moduleId="milling_operations">
      <PageHeader
        title="قبّان الميزان واستلام الأمانات"
        subtitle="سجّل وصول حبوب العميل بالأكياس والأوزان — مستند عيني بلا أي أثر على مخزون المطحنة"
        guide={guide}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ------------------------------------------------------ the form */}
        <MillingPanel>
          <MillingSectionTitle
            icon={<Wheat className="h-4 w-4" />}
            title="بيانات سند الاستلام"
            subtitle="الحقول المعلّمة بـ * إلزامية"
          />

          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <MillingField label="صاحب الأمانات *">
                <MillingSelect value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">— اختر العميل —</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>

              <MillingField label="المستودع / الصومعة *">
                <MillingSelect value={activeStore} onChange={(e) => setStoreId(e.target.value)}>
                  {warehouses?.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name_ar || w.name}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>

              <MillingField label="نوع ودرجة الحبوب *">
                <MillingSelect
                  value={grainGradeId}
                  onChange={(e) => {
                    const gid = e.target.value;
                    setGrainGradeId(gid);
                    const g = grainGrades?.find((x) => x.id === gid);
                    if (g) {
                      setGrainType(g.grade_name_ar);
                      setBagSize(Number(g.default_bag_size_kg) || 50);
                      if (g.default_bag_type) {
                        setBagType(g.default_bag_type);
                      }
                    }
                  }}
                >
                  <option value="">— اختر نوع ودرجة الحبوب —</option>
                  {(grainGrades?.length ? grainGrades : []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.grade_name_ar} {g.origin === "IMPORTED" ? "(مستورد)" : "(محلي)"} — سعة {g.default_bag_size_kg || 50} كجم
                    </option>
                  ))}
                </MillingSelect>
                {(!grainGrades || grainGrades.length === 0) && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    جاري تحميل درجات الحبوب المعتمدة...
                  </p>
                )}
              </MillingField>

              <MillingField label="مكان التخزين">
                <MillingSelect value={silo} onChange={(e) => setSilo(e.target.value)}>
                  {silos.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>
            </div>

            {/* bags system */}
            <div className="rounded-2xl border border-border/60 bg-surface-2/30 p-3.5 space-y-3">
              <p className="flex items-center gap-2 text-xs font-bold text-foreground">
                <PackagePlus className="h-4 w-4 text-amber-500" />
                نظام ومواصفات الأكياس
              </p>

              <div className="grid gap-3 sm:grid-cols-3">
                <MillingField label="مصدر الأكياس">
                  <MillingSelect
                    value={bagSource}
                    onChange={(e) => setBagSource(e.target.value as any)}
                  >
                    <option value="CUSTOMER">أكياس العميل الخاصة</option>
                    <option value="MILL">أكياس جديدة من المطحنة</option>
                  </MillingSelect>
                </MillingField>

                <MillingField label="نوع وخامة الكيس">
                  <MillingSelect
                    value={bagType}
                    onChange={(e) => setBagType(e.target.value)}
                  >
                    <option value="شوال خيش طبيعي 50 كجم">شوال خيش طبيعي (50 كجم)</option>
                    <option value="كيس بولي بروبيلين منسوج 50 كجم">بولي بروبيلين منسوج (50 كجم)</option>
                    <option value="كيس تعبئة دقيق 25 كجم">كيس تعبئة دقيق (25 كجم)</option>
                    <option value="كيس صغير 10 كجم">كيس صغير (10 كجم)</option>
                  </MillingSelect>
                </MillingField>

                <MillingField label="حالة الأكياس المستلمة">
                  <MillingSelect
                    value={bagCondition}
                    onChange={(e) => setBagCondition(e.target.value)}
                  >
                    <option value="سليم ومحكم">سليم ومحكم (ممتاز)</option>
                    <option value="مستعمل نظيف">مستعمل نظيف (جيد)</option>
                    <option value="يحتاج خياطة ورتق">يحتاج خياطة ورتق (وسط)</option>
                  </MillingSelect>
                </MillingField>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <MillingField label="سعة الكيس (كجم)">
                  <MillingSelect
                    value={String(bagSize)}
                    onChange={(e) => setBagSize(Number(e.target.value))}
                  >
                    {BAG_SIZES_KG.map((s) => (
                      <option key={s} value={s}>
                        {s} كجم
                      </option>
                    ))}
                  </MillingSelect>
                </MillingField>
                <MillingField label="عدد الأكياس المستلمة">
                  <MillingInput
                    type="number"
                    min={0}
                    value={bagCount || ""}
                    onChange={(e) => setBagCount(Number(e.target.value))}
                    placeholder="0"
                  />
                </MillingField>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3 py-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  الوزن الاسمي (أكياس × سعة)
                </span>
                <Mono className="font-bold text-amber-600 dark:text-amber-400">
                  {nf(nominal)} كجم
                </Mono>
              </div>
            </div>

            {/* scale */}
            <div className="rounded-2xl border border-border/60 bg-surface-2/30 p-3.5">
              <p className="mb-3 flex items-center gap-2 text-xs font-bold text-foreground">
                <Scale className="h-4 w-4 text-amber-500" />
                قراءات الميزان (القبّان)
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <MillingField label="الوزن القائم (كجم)">
                  <MillingInput
                    type="number"
                    step="0.001"
                    min={0}
                    value={gross || ""}
                    onChange={(e) => setGross(Number(e.target.value))}
                    placeholder="0.000"
                  />
                </MillingField>
                <MillingField label="الوزن الفارغ (كجم)">
                  <MillingInput
                    type="number"
                    step="0.001"
                    min={0}
                    value={tare || ""}
                    onChange={(e) => setTare(Number(e.target.value))}
                    placeholder="0.000"
                  />
                </MillingField>
                <MillingField label="الوزن الصافي (محسوب)">
                  <div className="flex h-10 items-center justify-end rounded-xl border border-amber-500/40 bg-amber-500/10 px-3">
                    <Mono className="font-bold text-amber-600 dark:text-amber-400">
                      {nf(net, 3)} كجم
                    </Mono>
                  </div>
                </MillingField>
              </div>

              {nominal > 0 && Math.abs(shortage) >= 1 && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    فرق أوزان الأكياس:{" "}
                    <span className="font-bold text-foreground">
                      {nf(Math.abs(shortage), 3)} كجم
                    </span>{" "}
                    {shortage > 0
                      ? "عجز عن الوزن الاسمي — سيُحفظ كدليل على السند."
                      : "زيادة عن الوزن الاسمي — تُحفظ ملاحظة على السند."}
                  </span>
                </p>
              )}
            </div>

            {/* quality + truck */}
            <div className="grid gap-3 sm:grid-cols-4">
              <MillingField label="نسبة الرطوبة %">
                <MillingInput
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={moisture || ""}
                  onChange={(e) => setMoisture(Number(e.target.value))}
                  placeholder="0.00"
                />
              </MillingField>
              <MillingField label="نسبة الشوائب %">
                <MillingInput
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={impurities || ""}
                  onChange={(e) => setImpurities(Number(e.target.value))}
                  placeholder="0.00"
                />
              </MillingField>
              <MillingField label="رقم الشاحنة">
                <MillingInput
                  value={truckPlate}
                  onChange={(e) => setTruckPlate(e.target.value)}
                  placeholder="أ ب ج 1234"
                />
              </MillingField>
              <MillingField label="اسم السائق">
                <MillingInput
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="—"
                />
              </MillingField>
            </div>

            {/* المرحلة 0: نتيجة الفحص الفني — تنبيه فقط، لا يمنع الحفظ. */}
            {grainGradeId && gradeCheck && gradeCheck.status !== "OK" && (
              <p
                className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11.5px] leading-relaxed ${
                  gradeCheck.status === "WARN"
                    ? "border-amber-500/30 bg-amber-500/8 text-muted-foreground"
                    : "border-destructive/30 bg-destructive/8 text-muted-foreground"
                }`}
              >
                <TriangleAlert
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    gradeCheck.status === "WARN" ? "text-amber-500" : "text-destructive"
                  }`}
                />
                <span>{gradeCheck.message_ar}</span>
              </p>
            )}

            <MillingField label="ملاحظات">
              <MillingTextarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أي ملاحظات على الاستلام أو حالة الأكياس…"
              />
            </MillingField>

            <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                الحفظ يُنشئ سند أمانات فقط. لا شراء، ولا ذمة على العميل.
              </p>
              <button
                type="button"
                onClick={submit}
                disabled={createMutation.isPending || !customerId || net <= 0}
                className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-40"
              >
                <PackagePlus className="h-4 w-4" />
                {createMutation.isPending ? "جارٍ الحفظ…" : "تسجيل سند الاستلام"}
              </button>
            </div>
          </div>
        </MillingPanel>

        {/* ------------------------------------------------ live calculator */}
        <div className="space-y-4">
          <MillingPanel>
            <MillingSectionTitle
              icon={<Calculator className="h-4 w-4" />}
              title="حاسبة الميزان"
              subtitle="تتحدث مع كل رقم تُدخله"
            />
            <div className="space-y-2.5 p-4">
              {[
                { label: "عدد الأكياس", value: `${nf(bagCount || 0)} × ${bagSize} كجم` },
                { label: "الوزن الاسمي", value: `${nf(nominal)} كجم` },
                { label: "الوزن القائم", value: `${nf(gross || 0, 3)} كجم` },
                { label: "الوزن الفارغ", value: `${nf(tare || 0, 3)} كجم` },
                { label: "الوزن الصافي", value: `${nf(net, 3)} كجم`, strong: true },
                { label: "بالأطنان", value: `${tons.toFixed(3)} طن`, strong: true },
              ].map((row) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs ${
                    row.strong ? "bg-amber-500/12" : "bg-surface-2/40"
                  }`}
                >
                  <span className="text-muted-foreground">{row.label}</span>
                  <Mono
                    className={
                      row.strong ? "font-bold text-amber-600 dark:text-amber-400" : "font-semibold"
                    }
                  >
                    {row.value}
                  </Mono>
                </div>
              ))}

              {nominal > 0 && net > 0 && (
                <div className="mt-1 rounded-xl border border-border/60 px-3 py-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">نسبة المحقق من الوزن الاسمي</span>
                    <Mono className="font-bold">{((net / nominal) * 100).toFixed(1)}%</Mono>
                  </div>
                </div>
              )}
            </div>
          </MillingPanel>

          <MillingPanel>
            <MillingSectionTitle icon={<Wheat className="h-4 w-4" />} title="حالة الوحدة" />
            <div className="space-y-2.5 p-4 text-xs leading-relaxed text-muted-foreground">
              <p className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                سجل الأمانات مستقل تماماً عن مخزون المنشأة.
              </p>
              <p className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                الأكياس الواردة لا تُسجَّل كأصل ولا كـ COGS.
              </p>
              <p className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                الوزن الصافي يُشتق في الخادم ولا يُقبل من المتصفح.
              </p>
            </div>
          </MillingPanel>
        </div>
      </div>

      {/* ------------------------------------------------------- recent list */}
      <MillingPanel className="mt-4">
        <MillingSectionTitle
          icon={<Wheat className="h-4 w-4" />}
          title="سندات الاستلام الأخيرة"
          subtitle="اضغط على أي سند لطباعته"
          action={
            (receipts?.length ?? 0) > 0 ? (
              <Pill tone="slate">{receipts?.length} سند</Pill>
            ) : undefined
          }
        />

        {(!receipts || receipts.length === 0) && (
          <MillingEmpty
            title="لا توجد سندات استلام"
            description="ستظهر هنا فور تسجيل أول سند استلام في هذه المطحنة."
          />
        )}

        {receipts && receipts.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-medium">رقم السند</th>
                  <th className="px-4 py-2.5 text-start font-medium">العميل</th>
                  <th className="px-4 py-2.5 text-start font-medium">الحبوب</th>
                  <th className="px-4 py-2.5 text-start font-medium">الشاحنة</th>
                  <th className="px-4 py-2.5 text-end font-medium">أكياس</th>
                  <th className="px-4 py-2.5 text-end font-medium">صافي (كجم)</th>
                  <th className="px-4 py-2.5 text-end font-medium">رطوبة</th>
                  <th className="px-4 py-2.5 text-start font-medium">الحالة</th>
                  <th className="px-4 py-2.5 text-start font-medium">طباعة</th>
                </tr>
              </thead>
              <tbody>
                {receipts.slice(0, 40).map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-border/50 last:border-0 hover:bg-surface-2/40"
                  >
                    <Cell>
                      <Mono className="font-bold">{r.receipt_number}</Mono>
                    </Cell>
                    <Cell>
                      <span className="text-xs">{customerName(r.customer_id)}</span>
                    </Cell>
                    <Cell>
                      <span className="text-xs">{r.grain_type}</span>
                    </Cell>
                    <Cell>
                      <Mono>{r.truck_plate_number || "—"}</Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono>{nf(r.intake_bag_count)}</Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono className="font-bold">{nf(r.net_weight_kg)}</Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono>{nf(r.moisture_percentage, 2)}%</Mono>
                    </Cell>
                    <Cell>
                      <StatusBadge status={r.status} />
                    </Cell>
                    <Cell>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => doPrint(r, "thermal")}
                          title="طباعة حرارية 80mm"
                          className="grid h-7 w-7 place-items-center rounded-lg border border-border/70 text-muted-foreground transition hover:border-amber-500/40 hover:text-amber-500"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => doPrint(r, "a4")}
                          title="طباعة A4"
                          className="rounded-lg border border-border/70 px-2 py-1 text-[10.5px] font-bold text-muted-foreground transition hover:border-amber-500/40 hover:text-amber-500"
                        >
                          A4
                        </button>
                        <button
                          type="button"
                          onClick={() => doPrint(r, "a5")}
                          title="طباعة A5"
                          className="rounded-lg border border-border/70 px-2 py-1 text-[10.5px] font-bold text-muted-foreground transition hover:border-amber-500/40 hover:text-amber-500"
                        >
                          A5
                        </button>
                      </div>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MillingPanel>
    </ModuleGuard>
  );
}
