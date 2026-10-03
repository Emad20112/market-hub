import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Truck, Printer, CheckCircle2, PackageCheck, Boxes, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import {
  processDelivery,
  fetchJobs,
  fetchOutputs,
  fetchDeliveries,
  outputLabel,
  type DeliveryLine,
} from "@/lib/milling";
import { printDeliveryNote, type MillingPaper } from "@/lib/milling/print";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingField,
  MillingInput,
  MillingSelect,
  MillingTextarea,
  StatusBadge,
  OutputBadge,
  Mono,
  Pill,
  MillingEmpty,
  Cell,
  QueryErrorGuard,
} from "@/components/milling/milling-ui";
import type { PageGuideConfig } from "@/components/page-guide";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/milling/delivery")({
  head: () => ({ meta: [{ title: "بوابة التسليم — فورتكس ERP" }] }),
  component: MillingDeliveryPage,
});

const guide: PageGuideConfig = {
  title: "دليل بوابة التسليم وإذن الخروج",
  subtitle: "كيف تسلّم نواتج العميل من الصوامع إلى شاحنته، ولماذا لا ينشئ ذلك أي مديونية.",
  badge: "العينيات والبوابة",
  icon: <Truck className="h-5 w-5 text-lime-500" />,
  summaryText:
    "إذن التسليم نقل عيني لأمانات العميل. يخصم من رصيده الدقيق أو النخالة، ولا يُنشئ إيراداً ولا ذمة ولا حركة مخزون. كل ذلك منقول إلى مالكه عند باب المصنع.",
  overviewCards: [
    {
      title: "تسليم جزئي",
      description: "يمكن تسليم 150 من 600 كيس، والباقي يبقى في صوامع الأمانات.",
      icon: <Boxes className="h-4 w-4" />,
      color: "blue",
    },
    {
      title: "منع التسليم الزائد",
      description: "الخادم يمنع تسليم أكثر من المُنتَج، فلا يمكن تسليم صنف غير موجود.",
      icon: <AlertTriangle className="h-4 w-4" />,
      color: "amber",
    },
    {
      title: "إذن مطبوع",
      description: "إذن باركود مخصص للبوابة، يُوقَّع من المخزن والسائق والعميل.",
      icon: <Printer className="h-4 w-4" />,
      color: "purple",
    },
  ],
  stepsTitle: "مثال تطبيقي (تسليم على دفعات)",
  steps: [
    {
      number: "1",
      title: "اختر العميل",
      description: "اعرض أوامره المنتهية وما تبقّى له من نواتج.",
    },
    {
      number: "2",
      title: "حدد ناتج التسليم",
      description: "أدخل عدد الأكياس والوزن لكل درجة ناتج.",
    },
    {
      number: "3",
      title: "أدخل بيانات الشاحنة",
      description: "رقم اللوحة واسم السائق لتوثيق من حمل الشحنة.",
    },
    { number: "4", title: "أصدر واطبع الإذن", description: "يخصم الكميات من رصيد العميل فوراً." },
  ],
  rulesTitle: "ما لا يحدث عند التسليم",
  rules: [
    {
      type: "danger",
      title: "لا ذمة ولا إيراد",
      description: "الإذن نقل عيني فقط. أجور الطحن تُفوتر في الفاتورة، لا في البوابة.",
    },
    {
      type: "danger",
      title: "لا يمس مخزون المطحنة",
      description: "الدقيق المُسلَّم ملك العميل، ولا يُخصم من مخزون المنشأة التجاري.",
    },
    {
      type: "success",
      title: "التسليم بعد الإقفال فقط",
      description: "لا يُسلَّم ناتج أمر لم يُغلق بعد، حتى تكون الكميات نهائية.",
    },
  ],
  footerTip: "نصيحة: اطبع الإذن على A5 لتسليم السائق، واحتفظ بنسخة حرارية للبوابة.",
};

const db = supabase as any;

const nf = (v: number, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

function MillingDeliveryPage() {
  const qc = useQueryClient();

  const [customerId, setCustomerId] = useState("");
  const [jobId, setJobId] = useState("");
  const [truckPlate, setTruckPlate] = useState("");
  const [driverName, setDriverName] = useState("");
  const [notes, setNotes] = useState("");
  const [paper, setPaper] = useState<MillingPaper>("a5");
  // outputId -> { bags, weight }
  const [lines, setLines] = useState<Record<string, { bags: number; weight: number }>>({});
  const [lastNoteId, setLastNoteId] = useState<string>("");

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

  const storeId = useMemo(
    () => warehouses?.find((w) => w.is_default)?.id ?? warehouses?.[0]?.id ?? "",
    [warehouses],
  );

  const {
    data: jobs,
    isError: jobsError,
    error: jobsDetail,
    refetch: jobsRefetch,
  } = useQuery({
    queryKey: ["milling", "jobs", storeId],
    queryFn: () => fetchJobs(storeId),
    enabled: Boolean(storeId),
  });

  // Only completed jobs with something left in custody can be delivered.
  const deliverableJobs = (jobs ?? []).filter(
    (j) => j.status === "COMPLETED" || j.status === "DELIVERED",
  );

  const {
    data: customerJobs,
    isError: customerJobsError,
    error: customerJobsDetail,
    refetch: customerJobsRefetch,
  } = useQuery({
    queryKey: ["milling", "jobs", storeId, "byCustomer", customerId],
    queryFn: () => fetchJobs(storeId, undefined),
    enabled: Boolean(storeId),
  });

  const filteredJobs = customerId
    ? (customerJobs ?? []).filter(
        (j) =>
          j.customer_id === customerId && (j.status === "COMPLETED" || j.status === "DELIVERED"),
      )
    : deliverableJobs;

  const {
    data: outputs,
    isError: outputsError,
    error: outputsDetail,
    refetch: outputsRefetch,
  } = useQuery({
    queryKey: ["milling", "outputs", jobId],
    queryFn: () => fetchOutputs(jobId),
    enabled: Boolean(jobId),
  });

  const {
    data: deliveries,
    isError: deliveriesError,
    error: deliveriesDetail,
    refetch: deliveriesRefetch,
  } = useQuery({
    queryKey: ["milling", "deliveries", storeId],
    queryFn: () => fetchDeliveries(storeId),
    enabled: Boolean(storeId),
  });

  // Reset the selection when the chosen job changes.
  useEffect(() => {
    setLines({});
  }, [jobId]);

  // Outputs that actually have something left.
  const available = (outputs ?? []).filter(
    (o) => o.produced_bag_count - o.delivered_bag_count > 0 && o.output_type !== "WASTE",
  );

  const selectedJob = (jobs ?? []).find((j) => j.id === jobId) ?? null;

  const totalBags = Object.values(lines).reduce((s, l) => s + (l.bags || 0), 0);
  const totalKg = Object.values(lines).reduce((s, l) => s + (l.weight || 0), 0);

  const hasLines = Object.values(lines).some((l) => l.bags > 0 || l.weight > 0);

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? "—";

  const refresh = () => qc.invalidateQueries({ queryKey: ["milling"] });

  const mutation = useMutation({
    mutationFn: processDelivery,
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.message ?? "تعذّر إصدار الإذن");
      toast.success("تم إصدار إذن التسليم");
      setLastNoteId(res.id ?? "");
      setLines({});
      setTruckPlate("");
      setDriverName("");
      void refresh();
    },
  });

  const submit = () => {
    const items: DeliveryLine[] = Object.entries(lines)
      .filter(([, l]) => l.bags > 0 && l.weight > 0)
      .map(([jobOutputId, l]) => ({
        jobOutputId,
        deliveredBags: l.bags,
        deliveredWeightKg: l.weight,
      }));

    if (items.length === 0) {
      return toast.error("حدّد عدد الأكياس والوزن لناتج واحد على الأقل");
    }

    mutation.mutate({ jobId, items, truckPlate, driverName, notes });
  };

  const setLine = (outputId: string, patch: Partial<{ bags: number; weight: number }>) =>
    setLines((prev) => ({
      ...prev,
      // `prev[outputId]` is undefined the first time a line is touched, and
      // spreading undefined is a TypeError, so the default comes first.
      [outputId]: { ...{ bags: 0, weight: 0 }, ...prev[outputId], ...patch },
    }));

  const printNote = async (id: string, p: MillingPaper) => {
    const d = (deliveries ?? []).find((x) => x.id === id);
    if (!d) return;

    // The note's own line items are the authoritative record of what went out on
    // THIS load — the job's running outputs only show the cumulative balance.
    const { data: items } = await db
      .from("milling_delivery_items")
      .select(
        "delivered_bags, delivered_weight_kg, job_output_id, milling_job_outputs(output_type, bag_size_kg)",
      )
      .eq("delivery_id", id);

    printDeliveryNote(
      {
        delivery: d,
        customerName: customerName(d.customer_id),
        jobNumber: (jobs ?? []).find((j) => j.id === d.job_id)?.job_number ?? "—",
        warehouseName: warehouses?.find((w) => w.id === d.store_id)?.name_ar ?? null,
        items: ((items ?? []) as any[]).map((i) => ({
          output_type: i.milling_job_outputs?.output_type ?? "",
          bag_size_kg: i.milling_job_outputs?.bag_size_kg ?? 0,
          delivered_bags: i.delivered_bags,
          delivered_weight_kg: i.delivered_weight_kg,
        })),
      },
      p,
    );
  };

  /*
   * These 6 queries feed the tables and the counters below. A failed
   * one used to render as an empty table or a row of zeros, which reads as a
   * quiet day rather than a broken connection. The guard below turns any
   * failure into a stated error.
   */
  const queryStates = [
    { isError: warehousesError, error: warehousesDetail, refetch: warehousesRefetch },
    { isError: customersError, error: customersDetail, refetch: customersRefetch },
    { isError: jobsError, error: jobsDetail, refetch: jobsRefetch },
    { isError: customerJobsError, error: customerJobsDetail, refetch: customerJobsRefetch },
    { isError: outputsError, error: outputsDetail, refetch: outputsRefetch },
    { isError: deliveriesError, error: deliveriesDetail, refetch: deliveriesRefetch },
  ];

  if (queryStates.some((q) => q.isError)) {
    return <QueryErrorGuard what="إذن التسليم" queries={queryStates} />;
  }

  return (
    <ModuleGuard moduleId="milling_operations">
      <PageHeader
        title="بوابة التسليم وإذن الخروج"
        subtitle="سلّم نواتج العميل من الصوامع إلى شاحنته — مستند عيني بلا إيراد ولا ذمة"
        guide={guide}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------------- selection + lines */}
        <div className="space-y-4">
          <MillingPanel>
            <MillingSectionTitle
              icon={<Truck className="h-4 w-4" />}
              title="اختر العميل وأمر الطحن"
              subtitle="تظهر فقط الأوامر المنتهية التي بها رصيد متبقٍ"
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <MillingField label="العميل">
                <MillingSelect
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setJobId("");
                  }}
                >
                  <option value="">— كل العملاء —</option>
                  {customers?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>

              <MillingField label="أمر الطحن">
                <MillingSelect value={jobId} onChange={(e) => setJobId(e.target.value)}>
                  <option value="">— اختر الأمر —</option>
                  {filteredJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_number} — {customerName(j.customer_id)}
                    </option>
                  ))}
                </MillingSelect>
              </MillingField>
            </div>
          </MillingPanel>

          {/* available outputs */}
          {selectedJob && (
            <MillingPanel>
              <MillingSectionTitle
                icon={<PackageCheck className="h-4 w-4" />}
                title="النواتج المتبقية للعميل"
                subtitle="أدخل ما تريد تحميله في هذه الشحنة"
              />

              {available.length === 0 ? (
                <MillingEmpty
                  title="لا توجد نواتج متبقية"
                  description="كل نواتج هذا الأمر سُلِّمت بالكامل."
                />
              ) : (
                <div className="space-y-3 p-4">
                  {available.map((o) => {
                    const remainingBags = o.produced_bag_count - o.delivered_bag_count;
                    const line = lines[o.id] ?? { bags: 0, weight: 0 };
                    const overBags = line.bags > remainingBags;
                    const overWeight = line.weight > o.produced_weight_kg - o.delivered_weight_kg;

                    return (
                      <div
                        key={o.id}
                        className={cn(
                          "rounded-2xl border p-3.5 transition",
                          overBags || overWeight
                            ? "border-rose-500/50 bg-rose-500/5"
                            : "border-border/60 bg-surface-2/30",
                        )}
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <OutputBadge type={o.output_type} label={outputLabel(o.output_type)} />
                          <Pill tone="slate">سعة {nf(o.bag_size_kg, 2)} كجم</Pill>
                          <Pill tone="emerald">
                            متبقٍ {nf(remainingBags)} كيس ·{" "}
                            {nf(o.produced_weight_kg - o.delivered_weight_kg)} كجم
                          </Pill>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <MillingField label="أكياس الشحنة الحالية">
                            <MillingInput
                              type="number"
                              min={0}
                              max={remainingBags}
                              value={line.bags || ""}
                              onChange={(e) => setLine(o.id, { bags: Number(e.target.value) })}
                              placeholder={String(remainingBags)}
                            />
                          </MillingField>
                          <MillingField label="الوزن (كجم)">
                            <MillingInput
                              type="number"
                              step="0.001"
                              min={0}
                              value={line.weight || ""}
                              onChange={(e) => setLine(o.id, { weight: Number(e.target.value) })}
                              placeholder="0.000"
                            />
                          </MillingField>
                          <MillingField label="ملء سريع">
                            <div className="flex h-10 gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setLine(o.id, {
                                    bags: remainingBags,
                                    weight: o.produced_weight_kg - o.delivered_weight_kg,
                                  })
                                }
                                className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
                              >
                                الكل
                              </button>
                              <button
                                type="button"
                                onClick={() => setLine(o.id, { bags: 0, weight: 0 })}
                                className="flex-1 rounded-xl border border-border/70 text-[11px] font-bold text-muted-foreground"
                              >
                                صفر
                              </button>
                            </div>
                          </MillingField>
                        </div>

                        {(overBags || overWeight) && (
                          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {overBags
                              ? `الحد الأقصى ${nf(remainingBags)} كيس`
                              : "الوزن يتجاوز المتبقي"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* truck + submit */}
              <div className="space-y-3 border-t border-border/60 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
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
                <MillingField label="ملاحظات">
                  <MillingTextarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="حالة الأكياس، ملاحظات السائق…"
                  />
                </MillingField>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <Pill tone="amber">{nf(totalBags)} كيس</Pill>
                    <Pill tone="sky">{nf(totalKg)} كجم</Pill>
                    {totalBags > 0 && (
                      <span className="text-muted-foreground">
                        ({(totalKg / 1000).toFixed(3)} طن)
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={mutation.isPending || !hasLines || !jobId}
                    className="flex h-11 items-center gap-2 rounded-xl bg-lime-600 px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {mutation.isPending ? "جارٍ الإصدار…" : "إصدار إذن التسليم"}
                  </button>
                </div>
              </div>
            </MillingPanel>
          )}

          {/* history */}
          <MillingPanel>
            <MillingSectionTitle
              icon={<Truck className="h-4 w-4" />}
              title="سجل إذونات التسليم"
              subtitle="اضغط لطباعة الإذن"
            />
            {(!deliveries || deliveries.length === 0) && (
              <MillingEmpty
                title="لا توجد إذونات تسليم"
                description="ستظهر هنا فور إصدار أول إذن."
              />
            )}
            {deliveries && deliveries.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 text-start font-medium">رقم الإذن</th>
                      <th className="px-4 py-2.5 text-start font-medium">العميل</th>
                      <th className="px-4 py-2.5 text-start font-medium">الشاحنة</th>
                      <th className="px-4 py-2.5 text-end font-medium">أكياس</th>
                      <th className="px-4 py-2.5 text-end font-medium">الوزن</th>
                      <th className="px-4 py-2.5 text-start font-medium">التاريخ</th>
                      <th className="px-4 py-2.5 text-start font-medium">طباعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveries.slice(0, 40).map((d) => (
                      <tr
                        key={d.id}
                        className={cn(
                          "border-b border-border/50 last:border-0 hover:bg-surface-2/40",
                          d.id === lastNoteId && "bg-lime-500/8",
                        )}
                      >
                        <Cell>
                          <Mono className="font-bold">{d.delivery_number}</Mono>
                        </Cell>
                        <Cell>
                          <span className="text-xs">{customerName(d.customer_id)}</span>
                        </Cell>
                        <Cell>
                          <Mono>{d.truck_plate_number || "—"}</Mono>
                        </Cell>
                        <Cell align="end">
                          <Mono className="font-bold">{nf(d.total_bags)}</Mono>
                        </Cell>
                        <Cell align="end">
                          <Mono>{nf(d.total_weight_kg)}</Mono>
                        </Cell>
                        <Cell>
                          <span className="text-xs text-muted-foreground">
                            {new Date(d.created_at).toLocaleDateString("ar-EG")}
                          </span>
                        </Cell>
                        <Cell>
                          <button
                            type="button"
                            onClick={() => printNote(d.id, paper)}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-border/70 text-muted-foreground transition hover:border-lime-500/40 hover:text-lime-500"
                            title="طباعة الإذن"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </MillingPanel>
        </div>

        {/* ------------------------------------------------------- side panel */}
        <div className="space-y-4">
          <MillingPanel>
            <MillingSectionTitle icon={<Truck className="h-4 w-4" />} title="حالة الشحنة" />
            <div className="space-y-2.5 p-4">
              <div className="flex items-center justify-between rounded-xl bg-lime-500/10 px-3 py-2">
                <span className="text-xs text-muted-foreground">إجمالي الأكياس</span>
                <Mono className="font-bold text-lime-600 dark:text-lime-400">{nf(totalBags)}</Mono>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-sky-500/10 px-3 py-2">
                <span className="text-xs text-muted-foreground">إجمالي الوزن</span>
                <Mono className="font-bold text-sky-600 dark:text-sky-400">{nf(totalKg)} كجم</Mono>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-surface-2/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">بالأطنان</span>
                <Mono className="font-bold">{(totalKg / 1000).toFixed(3)} طن</Mono>
              </div>

              {selectedJob && (
                <div className="mt-3 rounded-xl bg-surface-2/40 p-3 text-[11px] leading-relaxed">
                  <p className="font-bold text-foreground">{selectedJob.job_number}</p>
                  <p className="mt-1 text-muted-foreground">
                    {customerName(selectedJob.customer_id)}
                  </p>
                  <div className="mt-2">
                    <StatusBadge status={selectedJob.status} />
                  </div>
                </div>
              )}
            </div>
          </MillingPanel>

          <MillingPanel>
            <MillingSectionTitle icon={<Printer className="h-4 w-4" />} title="مقاس الطباعة" />
            <div className="space-y-2.5 p-4">
              <MillingField label="ورق الإذن">
                <MillingSelect
                  value={paper}
                  onChange={(e) => setPaper(e.target.value as MillingPaper)}
                >
                  <option value="a5">A5 — للبوابة والسائق</option>
                  <option value="a4">A4 — نسخة رسمية</option>
                  <option value="thermal">حراري 80mm — طابعة باركود</option>
                </MillingSelect>
              </MillingField>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                الإذن يحمل باركود رقمه، ليستطيع ماسح البوابة قراءته مباشرة.
              </p>
            </div>
          </MillingPanel>
        </div>
      </div>
    </ModuleGuard>
  );
}
