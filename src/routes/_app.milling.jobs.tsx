import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Cog,
  Plus,
  Printer,
  CheckCircle2,
  Receipt,
  Layers,
  AlertTriangle,
  X,
  Boxes,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import {
  createJob,
  addOutput,
  completeJob,
  invoiceJob,
  fetchJobs,
  fetchOutputs,
  fetchIntakes,
  fetchPackagingItems,
  outputLabel,
  BAG_SIZES_KG,
  type MillingJob,
  type MillingOutput,
  type MillingOutputType,
  type JobCompletionSummary,
} from "@/lib/milling";
import { printMillingJobTicket } from "@/lib/milling/print";
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
  LossWarning,
  Cell,
} from "@/components/milling/milling-ui";
import type { PageGuideConfig } from "@/components/page-guide";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/milling/jobs")({
  head: () => ({ meta: [{ title: "صالة التشغيل وأوامر الطحن — فورتكس ERP" }] }),
  component: MillingJobsPage,
});

const guide: PageGuideConfig = {
  title: "دليل صالة التشغيل وأوامر الطحن",
  subtitle: "كيف تفتح أمر طحن، تسجّل نواتجه، تُقفله بحساب الفاقد، ثم تُصدر أجور الطحن.",
  badge: "التشغيل والتصنيع",
  icon: <Cog className="h-5 w-5 text-orange-500" />,
  summaryText:
    "أمر الطحن مستند تشغيلي بحت: يسحب حبوب العميل من أماناته ويعيدها ему دقيقاً ونخالة، مع احتساب الفاقد آلياً. لا يُنشئ أي قيد مالي. الفاتورة هي ما يُنشئ الإيراد.",
  overviewCards: [
    {
      title: "نسبة الاستخراج",
      description: "نسبة الدقيق المتوقعة من الوزن الداخل — مؤشر أداء للمطحن.",
      icon: <Layers className="h-4 w-4" />,
      color: "blue",
    },
    {
      title: "الهدر المسموح",
      description: "نسبة الفاقد التعاقدية. تجاوزها يُسجَّل ولا يُمنع.",
      icon: <AlertTriangle className="h-4 w-4" />,
      color: "amber",
    },
    {
      title: "أكياس العميل أو المطحنة",
      description: "إن أحضر العميل أكياسه فلا أثر مالي، وإلا تُصرف من مخزونك وتُفوتر.",
      icon: <Boxes className="h-4 w-4" />,
      color: "purple",
    },
  ],
  matrixTitle: "متى يحدث كل أثر؟",
  matrixDescription: "تسلسل الأحداث من الاستلام حتى التحصيل.",
  impactMatrix: {
    columns: [
      { key: "step", label: "الحدث", className: "w-[28%]" },
      { key: "effect", label: "ما الذي يتغيّر", className: "w-[40%]" },
      { key: "nothing", label: "ما الذي لا يتغيّر إطلاقاً", className: "w-[32%]" },
    ],
    rows: [
      {
        badge: { label: "فتح أمر", variant: "blue" },
        fields: {
          step: "فتح أمر طحن من سند استلام",
          effect: "يُسجَّل سحب من رصيد أمانات العميل",
          nothing: "لا مخزون، لا إيراد، لا ذمة",
        },
      },
      {
        badge: { label: "نواتج", variant: "amber" },
        fields: {
          step: "تسجيل الدقيق والنخالة",
          effect: "يضيف نواتج العميل برصيدها العيني",
          nothing: "لا مخزون تجاري (حتى لو كانت الأكياس من المطحنة)",
        },
      },
      {
        badge: { label: "إقفال", variant: "emerald" },
        fields: {
          step: "إقفال الأمر",
          effect: "يُحتسب الفاقد والفاقد الزائد ويوثَّقان",
          nothing: "لا إيراد، لا ضريبة، لا ذمة",
        },
      },
      {
        badge: { label: "فوترة", variant: "purple" },
        fields: {
          step: "فاتورة أجور الطحن",
          effect: "إيراد خدمة + مديونية + صرف أكياس المطحنة (إن وجدت)",
          nothing: "لا يمس الحبوب ولا الدقيق ولا النخالة في المخزون",
        },
      },
    ],
  },
  stepsTitle: "مثال تطبيقي مختصر (400 كيس × 50 كجم)",
  steps: [
    { number: "1", title: "الاستلام", description: "20,000 كجم قمح أمانة → سند استلام IR-101." },
    { number: "2", title: "أمر الطحن", description: "فتح أمر طحن للـ 400 كيس على السند نفسه." },
    {
      number: "3",
      title: "النواتج",
      description: "312 كيس دقيق (15,600 كجم) + 100 كيس نخالة (4,000 كجم).",
    },
    {
      number: "4",
      title: "الإقفال والفوترة",
      description: "الفاقد 400 كجم (2%) ضمن المسموح. الفاتورة 400 × 6 = 2,400 + ضريبة.",
    },
  ],
  rulesTitle: "قواعد صريحة",
  rules: [
    {
      type: "danger",
      title: "الناتج لا يزيد عن الداخل",
      description: "يمنع الخادم تسجيل ناتج أكبر من وزن الدخول — خطأ إدخال، لا خطأ فيزيائي.",
    },
    {
      type: "warning",
      title: "تجاوز الهدر لا يمنع الإقفال",
      description: "يُسجَّل الفاقد الزائد ويظهر تحذير فوري، والقرار عن التسوية للمشغّل.",
    },
    {
      type: "info",
      title: "فاتورة واحدة لكل أمر",
      description: "لا يمكن إصدار فاتورتين لنفس أمر الطحن — حماية من الازدواج.",
    },
  ],
  footerTip: "نصيحة: أغلق الأمر قبل الفوترة دائماً، حتى تُمنع فاتورة على تشغيل لم ينتج بعد.",
};

const outputTypes: MillingOutputType[] = [
  "FLOUR_GRADE_1",
  "FLOUR_GRADE_2",
  "BRAN",
  "SEMOLINA",
  "WASTE",
];

const nf = (v: number, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

function MillingJobsPage() {
  const qc = useQueryClient();

  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [showNewJob, setShowNewJob] = useState(false);
  const [completion, setCompletion] = useState<JobCompletionSummary | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const { data: warehouses } = useQuery({
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

  const { data: customers } = useQuery({
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

  const { data: jobs } = useQuery({
    queryKey: ["milling", "jobs", storeId],
    queryFn: () => fetchJobs(storeId),
    enabled: Boolean(storeId),
  });

  const { data: intakes } = useQuery({
    queryKey: ["milling", "intakes", storeId],
    queryFn: () => fetchIntakes(storeId),
    enabled: Boolean(storeId),
  });

  const { data: packaging } = useQuery({
    queryKey: ["milling", "packaging"],
    queryFn: fetchPackagingItems,
  });

  // Default to the first open job so the screen is useful on arrival.
  useEffect(() => {
    if (selectedJobId || !jobs) return;
    // `openJob` rather than `open`: the latter shadows the browser global.
    const openJob = jobs.find((j) => j.status === "PROCESSING" || j.status === "RECEIVED");
    if (openJob) setSelectedJobId(openJob.id);
  }, [jobs, selectedJobId]);

  const selectedJob = (jobs ?? []).find((j) => j.id === selectedJobId) ?? null;

  const { data: outputs } = useQuery({
    queryKey: ["milling", "outputs", selectedJobId],
    queryFn: () => fetchOutputs(selectedJobId),
    enabled: Boolean(selectedJobId),
  });

  const intakeNumber = (id: string) =>
    (intakes ?? []).find((i) => i.id === id)?.receipt_number ?? "—";

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? "—";

  const refresh = () => qc.invalidateQueries({ queryKey: ["milling"] });

  const completeMutation = useMutation({
    mutationFn: (jobId: string) => completeJob(jobId),
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.message ?? "تعذّر إقفال الأمر");
      setCompletion(res.data ?? null);
      toast.success("تم إقفال أمر الطحن واحتساب الفاقد");
      void refresh();
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: invoiceJob,
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.message ?? "تعذّر إصدار الفاتورة");
      toast.success("تم إصدار فاتورة أجور الطحن");
      setInvoiceOpen(false);
      void refresh();
    },
  });

  // Live totals so the loss guard rail reflects reality while the operator types.
  const producedKg = (outputs ?? []).reduce((s, o) => s + Number(o.produced_weight_kg ?? 0), 0);
  const producedBags = (outputs ?? []).reduce((s, o) => s + Number(o.produced_bag_count ?? 0), 0);

  const isOpen = selectedJob?.status === "PROCESSING" || selectedJob?.status === "RECEIVED";
  /*
   * The service invoice is deliberately gated the opposite way from the output
   * form: `issue_milling_service_invoice` only bills a COMPLETED/DELIVERED job,
   * because billing a run that is still in the mill would charge the customer
   * for grain the mill has not finished. The button used to render only while
   * `isOpen` — the exact state the engine rejects — so invoicing was impossible
   * from the UI even though the engine supported it.
   */
  const isInvoiceable = selectedJob?.status === "COMPLETED" || selectedJob?.status === "DELIVERED";

  return (
    <ModuleGuard moduleId="milling_operations">
      <PageHeader
        title="صالة التشغيل وأوامر الطحن"
        subtitle="تابع أوامر التشغيل، سجّل نواتج كل دفعة، وأغلقها بحساب الفاقد الفعلي"
        guide={guide}
        actions={
          <button
            type="button"
            onClick={() => setShowNewJob((v) => !v)}
            className="flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            {showNewJob ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showNewJob ? "إلغاء" : "أمر طحن جديد"}
          </button>
        }
      />

      {showNewJob && (
        <NewJobForm
          intakes={(intakes ?? []).filter((i) => i.status === "RECEIVED")}
          customerName={customerName}
          onDone={(id) => {
            setShowNewJob(false);
            void refresh();
            if (id) setSelectedJobId(id);
          }}
        />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ------------------------------------------------- job list (kanban) */}
        <MillingPanel className="self-start">
          <MillingSectionTitle
            icon={<Cog className="h-4 w-4" />}
            title="أوامر الطحن"
            subtitle={`${jobs?.length ?? 0} أمر`}
          />
          {(!jobs || jobs.length === 0) && (
            <MillingEmpty title="لا توجد أوامر" description="افتح أمر طحن جديد من سند استلام." />
          )}
          <ul className="max-h-[560px] divide-y divide-border/50 overflow-y-auto">
            {(jobs ?? []).map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedJobId(j.id);
                    setCompletion(null);
                  }}
                  className={cn(
                    "w-full px-4 py-3 text-start transition",
                    j.id === selectedJobId ? "bg-amber-500/10" : "hover:bg-surface-2/40",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Mono className="font-bold text-foreground">{j.job_number}</Mono>
                    <StatusBadge status={j.status} />
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {customerName(j.customer_id)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {nf(j.input_bag_count)} كيس · {nf(j.input_weight_kg)} كجم
                  </p>
                  {Number(j.loss_excess_kg) > 0 && (
                    <Pill tone="rose">فاقد زائد {nf(j.loss_excess_kg)} كجم</Pill>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </MillingPanel>

        {/* ------------------------------------------------------ job detail */}
        {!selectedJob ? (
          <MillingPanel>
            <MillingEmpty
              title="اختر أمر طحن"
              description="اختر أمراً من القائمة لعرض تفاصيله وتسجيل نواتجه."
            />
          </MillingPanel>
        ) : (
          <div className="space-y-4">
            {/* header card */}
            <MillingPanel>
              <MillingSectionTitle
                icon={<Cog className="h-4 w-4" />}
                title={`أمر الطحن ${selectedJob.job_number}`}
                subtitle={`${customerName(selectedJob.customer_id)} · من سند ${intakeNumber(selectedJob.intake_receipt_id)}`}
                action={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        printMillingJobTicket({
                          job: selectedJob,
                          customerName: customerName(selectedJob.customer_id),
                          intakeNumber: intakeNumber(selectedJob.intake_receipt_id),
                          outputs: outputs ?? [],
                        })
                      }
                      className="grid h-8 w-8 place-items-center rounded-lg border border-border/70 text-muted-foreground transition hover:border-amber-500/40 hover:text-amber-500"
                      title="طباعة أمر التشغيل"
                    >
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {isInvoiceable && (
                      <button
                        type="button"
                        onClick={() => setInvoiceOpen(true)}
                        className="flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        إصدار فاتورة أجور
                      </button>
                    )}
                  </div>
                }
              />

              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { l: "الكمية المسحوبة", v: `${nf(selectedJob.input_bag_count)} كيس` },
                  { l: "الوزن الداخل", v: `${nf(selectedJob.input_weight_kg)} كجم` },
                  { l: "مجموع النواتج", v: `${nf(producedKg)} كجم` },
                  { l: "أكياس منتجة", v: `${nf(producedBags)} كيس` },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl bg-surface-2/40 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{x.l}</p>
                    <Mono className="mt-0.5 block font-bold">{x.v}</Mono>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 border-t border-border/60 p-4 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-2/40 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">أجرة الكيس</p>
                  <Mono className="mt-0.5 block font-bold">
                    {nf(selectedJob.milling_fee_per_bag, 2)}
                  </Mono>
                </div>
                <div className="rounded-xl bg-surface-2/40 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">أجرة الطن</p>
                  <Mono className="mt-0.5 block font-bold">
                    {nf(selectedJob.milling_fee_per_ton, 2)}
                  </Mono>
                </div>
                <div className="rounded-xl bg-surface-2/40 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">الهدر المسموح</p>
                  <Mono className="mt-0.5 block font-bold">
                    {nf(selectedJob.allowed_loss_percentage, 2)}%
                  </Mono>
                </div>
              </div>

              {isOpen && (
                <div className="space-y-3 border-t border-border/60 p-4">
                  <LossWarning
                    inputKg={Number(selectedJob.input_weight_kg)}
                    outputKg={producedKg}
                    allowedPct={Number(selectedJob.allowed_loss_percentage)}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-muted-foreground">
                      إقفال الأمر يحسب الفاقد ويقارنه بالنسبة التعاقدية، ويوثّق الاثنين.
                    </p>
                    <button
                      type="button"
                      onClick={() => completeMutation.mutate(selectedJob.id)}
                      disabled={completeMutation.isPending || producedKg <= 0}
                      className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      إقفال أمر الطحن
                    </button>
                  </div>
                </div>
              )}

              {completion && (
                <div className="border-t border-border/60 bg-emerald-500/5 p-4">
                  <p className="mb-2.5 flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    نتيجة الإقفال
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {[
                      { l: "الفاقد الفعلي", v: `${nf(completion.actual_loss_kg)} كجم` },
                      { l: "الهدر المسموح", v: `${nf(completion.allowed_loss_kg)} كجم` },
                      {
                        l: "الفاقد الزائد",
                        v: `${nf(completion.loss_excess_kg)} كجم`,
                        tone: completion.loss_exceeds_allowance ? "rose" : "emerald",
                      },
                      {
                        l: "نسبة الاستخراج الفعلية",
                        v: `${nf(completion.actual_extraction_rate, 2)}%`,
                      },
                      { l: "المتوقعة", v: `${nf(completion.expected_extraction_rate, 2)}%` },
                      { l: "إجمالي الأكياس", v: `${nf(completion.total_output_bags)} كيس` },
                    ].map((x) => (
                      <div key={x.l} className="rounded-xl bg-surface/60 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{x.l}</p>
                        <Mono
                          className={cn(
                            "mt-0.5 block font-bold",
                            x.tone === "rose" && "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {x.v}
                        </Mono>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </MillingPanel>

            {/* outputs */}
            <MillingPanel>
              <MillingSectionTitle
                icon={<Layers className="h-4 w-4" />}
                title="النواتج"
                subtitle="دقيق ونخالة وسميد — مسجّلة بالعدد والوزن"
              />

              {(!outputs || outputs.length === 0) && (
                <MillingEmpty
                  title="لم تُسجَّل نواتج بعد"
                  description="سجّل الدفع والنخالة الناتجة عن هذه الدفعة بالأسفل."
                />
              )}

              {outputs && outputs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-4 py-2.5 text-start font-medium">الناتج</th>
                        <th className="px-4 py-2.5 text-end font-medium">سعة الكيس</th>
                        <th className="px-4 py-2.5 text-end font-medium">الأكياس</th>
                        <th className="px-4 py-2.5 text-end font-medium">الوزن (كجم)</th>
                        <th className="px-4 py-2.5 text-start font-medium">مصدر الأكياس</th>
                        <th className="px-4 py-2.5 text-end font-medium">المسلّم</th>
                        <th className="px-4 py-2.5 text-end font-medium">المتبقي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outputs.map((o) => (
                        <tr
                          key={o.id}
                          className="border-b border-border/50 last:border-0 hover:bg-surface-2/40"
                        >
                          <Cell>
                            <OutputBadge type={o.output_type} label={outputLabel(o.output_type)} />
                          </Cell>
                          <Cell align="end">
                            <Mono>{nf(o.bag_size_kg, 2)}</Mono>
                          </Cell>
                          <Cell align="end">
                            <Mono className="font-bold">{nf(o.produced_bag_count)}</Mono>
                          </Cell>
                          <Cell align="end">
                            <Mono>{nf(o.produced_weight_kg)}</Mono>
                          </Cell>
                          <Cell>
                            <Pill tone={o.bags_source === "MILL" ? "amber" : "slate"}>
                              {o.bags_source === "MILL"
                                ? `مخزون المطحنة (${nf(o.mill_bags_used)})`
                                : "أكياس العميل"}
                            </Pill>
                          </Cell>
                          <Cell align="end">
                            <Mono className="text-muted-foreground">
                              {nf(o.delivered_bag_count)}
                            </Mono>
                          </Cell>
                          <Cell align="end">
                            <Mono className="font-bold text-emerald-600 dark:text-emerald-400">
                              {nf(o.produced_bag_count - o.delivered_bag_count)}
                            </Mono>
                          </Cell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isOpen && (
                <OutputForm
                  jobId={selectedJob.id}
                  packaging={packaging ?? []}
                  existing={outputs ?? []}
                  onDone={() => void refresh()}
                />
              )}
            </MillingPanel>
          </div>
        )}
      </div>

      {invoiceOpen && selectedJob && (
        <InvoiceDialog
          job={selectedJob}
          outputs={outputs ?? []}
          packagingName={(id: string | null) =>
            packaging?.find((p) => p.id === id)?.name_ar ??
            packaging?.find((p) => p.id === id)?.name ??
            "—"
          }
          busy={invoiceMutation.isPending}
          onClose={() => setInvoiceOpen(false)}
          onSubmit={(payload) => invoiceMutation.mutate(payload)}
        />
      )}
    </ModuleGuard>
  );
}

/* ------------------------------------------------------- new job form */

function NewJobForm({
  intakes,
  customerName,
  onDone,
}: {
  intakes: {
    id: string;
    receipt_number: string;
    customer_id: string;
    net_weight_kg: number;
    intake_bag_count: number;
    bag_size_kg: number;
  }[];
  customerName: (id: string) => string;
  onDone: (jobId?: string) => void;
}) {
  const [intakeId, setIntakeId] = useState("");
  const [bags, setBags] = useState(0);
  const [bagSize, setBagSize] = useState(50);
  const [weight, setWeight] = useState(0);
  const [feeBag, setFeeBag] = useState(8);
  const [feeTon, setFeeTon] = useState(0);
  const [extraction, setExtraction] = useState(80);
  const [loss, setLoss] = useState(2);
  const [notes, setNotes] = useState("");

  const receipt = intakes.find((i) => i.id === intakeId);

  useEffect(() => {
    if (!receipt) return;
    setBags(receipt.intake_bag_count);
    setBagSize(receipt.bag_size_kg);
    setWeight(receipt.net_weight_kg);
  }, [receipt]);

  const mutation = useMutation({
    mutationFn: createJob,
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.message ?? "تعذّر فتح أمر الطحن");
      toast.success("تم فتح أمر الطحن");
      onDone(res.id);
    },
  });

  return (
    <MillingPanel>
      <MillingSectionTitle
        icon={<Plus className="h-4 w-4" />}
        title="فتح أمر طحن جديد"
        subtitle="الكمية تُسحَب من رصيد أمانات سند الاستلام — لا يمكن تجاوز المتاح"
      />
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <MillingField label="سند الاستلام *" className="sm:col-span-2">
          <MillingSelect value={intakeId} onChange={(e) => setIntakeId(e.target.value)}>
            <option value="">— اختر سند الاستلام —</option>
            {intakes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.receipt_number} — {customerName(i.customer_id)} ({nf(i.net_weight_kg)} كجم)
              </option>
            ))}
          </MillingSelect>
        </MillingField>

        <MillingField label="عدد الأكياس المسحوبة">
          <MillingInput
            type="number"
            min={0}
            value={bags || ""}
            onChange={(e) => setBags(Number(e.target.value))}
          />
        </MillingField>

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

        <MillingField label="الوزن المسحوب (كجم) *" hint="متاح من السند: راجع الحد الأعلى">
          <MillingInput
            type="number"
            step="0.001"
            min={0}
            value={weight || ""}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </MillingField>

        <MillingField label="أجرة الكيس">
          <MillingInput
            type="number"
            step="0.01"
            min={0}
            value={feeBag || ""}
            onChange={(e) => setFeeBag(Number(e.target.value))}
          />
        </MillingField>

        <MillingField label="أجرة الطن">
          <MillingInput
            type="number"
            step="0.01"
            min={0}
            value={feeTon || ""}
            onChange={(e) => setFeeTon(Number(e.target.value))}
          />
        </MillingField>

        <MillingField label="الهدر المسموح %">
          <MillingInput
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={loss || ""}
            onChange={(e) => setLoss(Number(e.target.value))}
          />
        </MillingField>

        <MillingField label="نسبة الاستخراج المتوقعة %">
          <MillingInput
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={extraction || ""}
            onChange={(e) => setExtraction(Number(e.target.value))}
          />
        </MillingField>

        <MillingField label="ملاحظات" className="sm:col-span-2 lg:col-span-4">
          <MillingTextarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </MillingField>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 p-4">
        <p className="text-[11px] text-muted-foreground">
          إن كان العقد بالأTON فاضبط أجرة الكيس على صفر.
        </p>
        <button
          type="button"
          onClick={() =>
            mutation.mutate({
              intakeReceiptId: intakeId,
              inputBagCount: bags,
              inputBagSizeKg: bagSize,
              inputWeightKg: weight,
              feePerBag: feeBag,
              feePerTon: feeTon,
              expectedExtractionRate: extraction,
              allowedLossPercentage: loss,
              notes,
            })
          }
          disabled={mutation.isPending || !intakeId || weight <= 0}
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          فتح أمر الطحن
        </button>
      </div>
    </MillingPanel>
  );
}

/* --------------------------------------------------------- output form */

function OutputForm({
  jobId,
  packaging,
  existing,
  onDone,
}: {
  jobId: string;
  packaging: {
    id: string;
    sku: string;
    name: string;
    name_ar: string | null;
    sale_price: number;
  }[];
  existing: MillingOutput[];
  onDone: () => void;
}) {
  const [type, setType] = useState<MillingOutputType>("FLOUR_GRADE_1");
  const [bagSize, setBagSize] = useState(50);
  const [bags, setBags] = useState(0);
  const [weight, setWeight] = useState(0);
  const [source, setSource] = useState<"CUSTOMER" | "MILL">("CUSTOMER");
  const [bagProduct, setBagProduct] = useState("");
  const [millBags, setMillBags] = useState(0);

  useEffect(() => {
    const current = existing.find((o) => o.output_type === type);
    if (current) {
      setBagSize(current.bag_size_kg);
      setBags(current.produced_bag_count);
      setWeight(current.produced_weight_kg);
      setSource(current.bags_source);
      setBagProduct(current.mill_bag_product_id ?? "");
      setMillBags(current.mill_bags_used);
    } else {
      setBags(0);
      setWeight(0);
      setSource("CUSTOMER");
      setBagProduct("");
      setMillBags(0);
    }
  }, [type, existing]);

  // Auto-derive weight from bags × size while the operator types bags, but let
  // them override it — real scale readings differ from nominal.
  useEffect(() => {
    if (bags > 0 && weight === 0) setWeight(bags * bagSize);
  }, [bags, bagSize, weight]);

  const mutation = useMutation({
    mutationFn: addOutput,
    onSuccess: (res) => {
      if (!res.ok) return toast.error(res.message ?? "تعذّر تسجيل الناتج");
      toast.success("تم تسجيل الناتج");
      onDone();
    },
  });

  return (
    <div className="border-t border-border/60 bg-surface-2/20 p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-bold text-foreground">
        <Boxes className="h-4 w-4 text-orange-500" />
        تسجيل / تصحيح ناتج
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MillingField label="نوع الناتج">
          <MillingSelect
            value={type}
            onChange={(e) => setType(e.target.value as MillingOutputType)}
          >
            {outputTypes.map((t) => (
              <option key={t} value={t}>
                {outputLabel(t)}
              </option>
            ))}
          </MillingSelect>
        </MillingField>

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

        <MillingField label="عدد الأكياس المنتجة">
          <MillingInput
            type="number"
            min={0}
            value={bags || ""}
            onChange={(e) => setBags(Number(e.target.value))}
          />
        </MillingField>

        <MillingField label="الوزن الإجمالي (كجم)">
          <MillingInput
            type="number"
            step="0.001"
            min={0}
            value={weight || ""}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </MillingField>

        <MillingField label="مصدر الأكياس">
          <MillingSelect
            value={source}
            onChange={(e) => setSource(e.target.value as "CUSTOMER" | "MILL")}
          >
            <option value="CUSTOMER">أكياس العميل (لا أثر مالي)</option>
            <option value="MILL">من مخزون المطحنة (تُفوتر)</option>
          </MillingSelect>
        </MillingField>

        {source === "MILL" && (
          <>
            <MillingField label="صنف الأكياس">
              <MillingSelect value={bagProduct} onChange={(e) => setBagProduct(e.target.value)}>
                <option value="">— اختر الصنف —</option>
                {packaging.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name_ar || p.name} ({p.sku})
                  </option>
                ))}
              </MillingSelect>
            </MillingField>
            <MillingField label="عدد الأكياس المصروفة">
              <MillingInput
                type="number"
                min={0}
                value={millBags || ""}
                onChange={(e) => setMillBags(Number(e.target.value))}
              />
            </MillingField>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() =>
            mutation.mutate({
              jobId,
              outputType: type,
              bagSizeKg: bagSize,
              producedBagCount: bags,
              producedWeightKg: weight,
              bagsSource: source,
              millBagProductId: source === "MILL" ? bagProduct : null,
              millBagsUsed: source === "MILL" ? millBags : 0,
            })
          }
          disabled={mutation.isPending || (bags <= 0 && weight <= 0)}
          className="flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          {existing.some((o) => o.output_type === type) ? "تحديث الناتج" : "تسجيل الناتج"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- invoice dialog */

function InvoiceDialog({
  job,
  outputs,
  packagingName,
  busy,
  onClose,
  onSubmit,
}: {
  job: MillingJob;
  outputs: MillingOutput[];
  packagingName: (id: string | null) => string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    jobId: string;
    paymentMethod: string;
    paid: number;
    discount: number;
    note: string;
    includePackaging: boolean;
  }) => void;
}) {
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paid, setPaid] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState("");
  const [includePackaging, setIncludePackaging] = useState(true);

  const millBags = outputs.filter((o) => o.bags_source === "MILL");
  const packagingTotal = millBags.reduce((s, o) => s + o.mill_bags_used, 0);

  const serviceFee =
    (Number(job.input_bag_count) * Number(job.milling_fee_per_bag) || 0) +
    ((Number(job.input_weight_kg) / 1000) * Number(job.milling_fee_per_ton) || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-border/80 bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Receipt className="h-4 w-4 text-emerald-500" />
            فاتورة أجور الطحن — {job.job_number}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 space-y-2 rounded-2xl bg-surface-2/40 p-3.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">أجرة الطحن</span>
            <Mono className="font-bold">{nf(serviceFee, 2)}</Mono>
          </div>
          {packagingTotal > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                أكياس ({packagingTotal} حبة) — تُخصم من المخزون
              </span>
              <Mono className="font-bold">{nf(packagingTotal, 0)}</Mono>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
            <span className="font-bold">قبل الضريبة</span>
            <Mono className="font-bold">{nf(serviceFee - discount, 2)}</Mono>
          </div>
        </div>

        <div className="space-y-3">
          <MillingField label="طريقة الدفع">
            <MillingSelect value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="cash">نقداً</option>
              <option value="bank_transfer">تحويل بنكي</option>
              <option value="credit">آجل (على حساب العميل)</option>
            </MillingSelect>
          </MillingField>

          <div className="grid grid-cols-2 gap-3">
            <MillingField label="المدفوع">
              <MillingInput
                type="number"
                step="0.01"
                min={0}
                value={paid || ""}
                onChange={(e) => setPaid(Number(e.target.value))}
              />
            </MillingField>
            <MillingField label="خصم">
              <MillingInput
                type="number"
                step="0.01"
                min={0}
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value))}
              />
            </MillingField>
          </div>

          {packagingTotal > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includePackaging}
                onChange={(e) => setIncludePackaging(e.target.checked)}
                className="h-4 w-4 rounded border-border/70"
              />
              فوترة الأكياس التي وفّرتها المطحنة
              <span className="text-[10.5px]">
                ({packagingName(millBags[0]?.mill_bag_product_id ?? null)})
              </span>
            </label>
          )}

          <MillingField label="ملاحظات">
            <MillingTextarea value={note} onChange={(e) => setNote(e.target.value)} />
          </MillingField>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-border/70 px-4 text-xs font-bold text-muted-foreground transition hover:bg-surface-2/50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({ jobId: job.id, paymentMethod, paid, discount, note, includePackaging })
            }
            disabled={busy || job.status === "PROCESSING"}
            className="flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            <Receipt className="h-4 w-4" />
            {busy ? "جارٍ الإصدار…" : "إصدار الفاتورة"}
          </button>
        </div>

        {job.status === "PROCESSING" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            يجب إقفال أمر الطحن قبل إصدار الفاتورة.
          </p>
        )}
      </div>
    </div>
  );
}
