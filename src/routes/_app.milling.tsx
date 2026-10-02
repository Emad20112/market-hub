import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Scale,
  PackagePlus,
  Cog,
  Truck,
  FileText,
  ArrowLeft,
  Wheat,
  PackageCheck,
  Receipt,
  Layers,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import { fetchDashboardStats, fetchIntakes, fetchJobs, fetchDeliveries } from "@/lib/milling";
import {
  MillingPanel,
  MillingSectionTitle,
  StatTile,
  StatusBadge,
  Mono,
  Pill,
  MillingEmpty,
  Cell,
} from "@/components/milling/milling-ui";
import type { PageGuideConfig } from "@/components/page-guide";

export const Route = createFileRoute("/_app/milling")({
  head: () => ({ meta: [{ title: "لوحة المطحنة — فورتكس ERP" }] }),
  component: MillingLayout,
});

/*
 * /milling is a layout route: its four child screens (intake, jobs, delivery,
 * customer-statement) are rendered through the Outlet below. Without the
 * Outlet every child URL resolved to the dashboard, because a parent route
 * that renders no Outlet never mounts its children — the dashboard swallowed
 * them silently. The dashboard itself is shown only on the exact /milling path.
 */
function MillingLayout() {
  const { pathname } = useLocation();
  const isDashboard = pathname.replace(/\/+$/, "") === "/milling";

  return (
    <ModuleGuard moduleId="milling_operations">
      {isDashboard ? <MillingDashboard /> : <Outlet />}
    </ModuleGuard>
  );
}

const guide: PageGuideConfig = {
  title: "دليل وحدة المطحنة وإدارة الأمانات",
  subtitle:
    "كيف تُدار حركة حبوب العملاء وأوامر الطحن وأجور الخدمة داخل النظام، وما الذي لا تفعله هذه الوحدة على الإطلاق.",
  badge: "وحدة المطاحن",
  icon: <Scale className="h-5 w-5 text-amber-500" />,
  summaryText:
    "وحدة المطحنة تفصل بين مسارين تجاريين منفصلين تماماً: (1) طحن حبوب العميل مقابل أجرة — الأثر Commercial صفر، و(2) تصنيع وبيع مخزون المطحنة الخاص — impact كامل عبر شاشات البيع العادية. هذا الفصل هو ما يحمي تقييم المخزون والوضع الضريبي.",
  overviewCards: [
    {
      title: "سند استلام الأمانات",
      description: "عيني فقط: يزيد رصيد العميل من الحبوب. لا يُسجَّل في المخزون ولا يُنشئ مديونية.",
      icon: <Wheat className="h-4 w-4" />,
      color: "amber",
    },
    {
      title: "أمر الطحن",
      description:
        "مستند تشغيلي: يسحب من أمانات العميل ويضيف نواتج (دقيق/نخالة) له. يحتسب الفاقد تلقائياً.",
      icon: <Cog className="h-4 w-4" />,
      color: "blue",
    },
    {
      title: "فاتورة أجور الطحن",
      description: "المستند المالي الوحيد: إيراد خدمة للمطحنة + مديونية على العميل + ضريبة.",
      icon: <Receipt className="h-4 w-4" />,
      color: "emerald",
    },
    {
      title: "إذن التسليم",
      description: "عيني بحت: ينقل نواتج العميل من الصوامع إلى شاحنته. لا إيراد ولا ذمة.",
      icon: <Truck className="h-4 w-4" />,
      color: "purple",
    },
  ],
  matrixTitle: "مصفوفة تأثير مستندات المطحنة",
  matrixDescription: "جدول يوضح بدقة: أي مستند يلامس المخزون التجاري، وأي مستند لا يلمسه إطلاقاً.",
  impactMatrix: {
    columns: [
      { key: "doc", label: "المستند", className: "w-[24%]" },
      { key: "custody", label: "الأثر على أمانات العميل", className: "w-[28%]" },
      { key: "stock", label: "الأثر على مخزون المطحنة", className: "w-[22%]" },
      { key: "finance", label: "الأثر المالي", className: "w-[26%]" },
    ],
    rows: [
      {
        badge: { label: "استلام", variant: "amber" },
        fields: {
          doc: "سند استلام حبوب",
          custody: "إضافة رصيد حبوب (أكياس + كجم)",
          stock: "صفر — لا يمس المخزون",
          finance: "لا يوجد — لا شراء ولا ذمة",
        },
      },
      {
        badge: { label: "تشغيل", variant: "blue" },
        fields: {
          doc: "أمر طحن / تشغيل",
          custody: "خصم حبوب خام، إضافة دقيق ونخالة",
          stock: "صفر — لا يمس المخزون",
          finance: "لا يوجد — مستند فني فقط",
        },
      },
      {
        badge: { label: "مالي", variant: "emerald" },
        fields: {
          doc: "فاتورة خدمة طحن",
          custody: "لا يمس الأمانات",
          stock: "يخصم الأكياس التي وفّرتها المطحنة فقط",
          finance: "إيراد خدمات + مديونية العميل + ضريبة",
        },
      },
      {
        badge: { label: "عيني", variant: "purple" },
        fields: {
          doc: "إذن تسليم ناتج",
          custody: "خصم نواتج مسلَّمة",
          stock: "صفر — لا يمس المخزون",
          finance: "صفر — لا يُنشئ مديونية",
        },
      },
    ],
  },
  stepsTitle: "مسار العمل اليومي في المطحنة",
  steps: [
    {
      number: "1",
      title: "الاستلام عند القبّان",
      description: "سجّل سند استلام بأكياس العميل وأوزانه الفعلية من الميزان.",
    },
    {
      number: "2",
      title: "فتح أمر الطحن",
      description: "اسحب الكمية من سند الاستلام، وحدد أجرة الكيس أو الطن ونسبة الهدر المسموح.",
    },
    {
      number: "3",
      title: "تسجيل النواتج",
      description: "أدخل الدفع والنخالة المنتجة، وحدد إن كانت الأكياس من العميل أم من المطحنة.",
    },
    {
      number: "4",
      title: "إقفال الأمر والفوترة",
      description: "أكمل الأمر ليُحتسب الفاقد، ثم أصدر فاتورة أجور الطحن.",
    },
    {
      number: "5",
      title: "التسليم من البوابة",
      description: "أصدر إذن خروج للشحنة الحالية واطبعه ليُوقَّع عند البوابة.",
    },
  ],
  rulesTitle: "قواعد حاكمة لا تُخترق",
  rules: [
    {
      type: "danger",
      title: "حبوب العميل لا تدخل مخزون المطحنة",
      description:
        "ممنوع منعاً باتاً تسجيل أمانات العملاء في المخزون التجاري أو حركاته. الأثر المخزني صفر تماماً.",
    },
    {
      type: "info",
      title: "البيع التجاري للدقيق يمر من الشاشات العادية",
      description:
        "بيع دقيق المطحنة الخاص يتم من شاشة المبيعات أو نقطة البيع كأي بضاعة أخرى، بلا أي تدخل من وحدة المطحنة.",
    },
    {
      type: "success",
      title: "العميل له كشفان منفصلان",
      description: "كشف عيني (أكياس وأطنان) وكشف مالي (أجور ومديونيات)، ولا يختلطان.",
    },
  ],
  footerTip:
    "نصيحة: راجع كشف حساب الأمانات قبل نهاية الدوام للتأكد من مطابقة رصيد كل عميل مع صوامعه الفعلية.",
};

const tiles = [
  {
    to: "/milling/intake",
    icon: PackagePlus,
    title: "قبّان الميزان والاستلام",
    description: "سجّل وصول حبوب العميل بالأكياس والأوزان واطبع سند الاستلام.",
  },
  {
    to: "/milling/jobs",
    icon: Cog,
    title: "صالة التشغيل وأوامر الطحن",
    description: "تابع الأوامر، سجّل النواتج، وأغلق أمر الطحن بحساب الفاقد.",
  },
  {
    to: "/milling/delivery",
    icon: Truck,
    title: "بوابة التسليم وإذن الخروج",
    description: "اعرض النواتج المتبقية للعميل واصدر إذن خروج للشحنة.",
  },
  {
    to: "/milling/customer-statement",
    icon: FileText,
    title: "كشف حساب الأمانات المزدوج",
    description: "كشف عيني (أكياس وأطنان) وكشف مالي لأجور الطحن.",
  },
  {
    to: "/milling/operations-guide",
    icon: Layers,
    title: "دليل العمليات ودورة الحياة",
    description: "تعليمات متسلسلة للطحن للغير، تجارة منتجات المطحنة، وتخزين الأمانات.",
  },
];

function MillingDashboard() {
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

  const storeId = useMemo(
    () => warehouses?.find((w) => w.is_default)?.id ?? warehouses?.[0]?.id ?? undefined,
    [warehouses],
  );

  const { data: stats } = useQuery({
    queryKey: ["milling", "stats", storeId],
    queryFn: () => fetchDashboardStats(storeId),
    enabled: Boolean(warehouses && warehouses.length > 0),
  });

  const { data: intakes } = useQuery({
    queryKey: ["milling", "intakes", storeId],
    queryFn: () => fetchIntakes(storeId),
    enabled: Boolean(warehouses && warehouses.length > 0),
  });

  const { data: jobs } = useQuery({
    queryKey: ["milling", "jobs", storeId],
    queryFn: () => fetchJobs(storeId),
    enabled: Boolean(warehouses && warehouses.length > 0),
  });

  const { data: deliveries } = useQuery({
    queryKey: ["milling", "deliveries", storeId],
    queryFn: () => fetchDeliveries(storeId),
    enabled: Boolean(warehouses && warehouses.length > 0),
  });

  const loading = !warehouses || (warehouses.length > 0 && !stats);

  const activeJobs = (jobs ?? []).filter(
    (j) => j.status === "PROCESSING" || j.status === "RECEIVED",
  );

  const recentIntakes = (intakes ?? []).slice(0, 6);
  const recentDeliveries = (deliveries ?? []).slice(0, 6);

  const customerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of intakes ?? []) map.set(i.customer_id, i.customer_id);
    for (const j of jobs ?? []) map.set(j.customer_id, j.customer_id);
    return map;
  }, [intakes, jobs]);

  return (
    <>
      <PageHeader
        title="لوحة المطحنة والأمانات"
        subtitle="متابعة لحظية لحركة حبوب العملاء وأوامر الطحن والأكياس الجاهزة للتسليم"
        guide={guide}
      />

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          title="أطنان مستلمة اليوم"
          value={stats?.intakeTonsToday ?? 0}
          unit="طن"
          tone="amber"
          icon={<Wheat className="h-4 w-4" />}
          hint={`${stats?.intakeBagsToday ?? 0} كيس`}
        />
        <StatTile
          title="أكياس مطحونة (جارٍ)"
          value={stats?.milledBagsTotal ?? 0}
          unit="كيس"
          tone="sky"
          icon={<Cog className="h-4 w-4" />}
          hint={`${stats?.milledTonsTotal ?? 0} طن`}
        />
        <StatTile
          title="أكياس جاهزة للتسليم"
          value={stats?.readyBags ?? 0}
          unit="كيس"
          tone="emerald"
          icon={<PackageCheck className="h-4 w-4" />}
          hint={`${stats?.readyTons ?? 0} طن في الصوامع`}
        />
        <StatTile
          title="أوامر قيد التشغيل"
          value={stats?.activeJobs ?? 0}
          unit="أمر"
          tone="violet"
          icon={<Activity className="h-4 w-4" />}
          hint={`${stats?.pendingInvoices ?? 0} فاتورة خدمة`}
        />
      </div>

      {/* Quick actions */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-surface/80 p-4 transition hover:border-amber-500/40 hover:bg-surface-2/40"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-500 transition group-hover:scale-105">
              <t.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{t.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {t.description}
              </p>
            </div>
            <ArrowLeft className="ms-auto h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:-translate-x-0.5" />
          </Link>
        ))}
      </div>

      {loading ? (
        <MillingPanel>
          <MillingEmpty
            title="جارٍ تحميل لوحة المطحنة…"
            description="يتم الآن قراءة أرصدة الأمانات وأوامر الطحن من السجل المستقل."
          />
        </MillingPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Recent intakes */}
          <MillingPanel>
            <MillingSectionTitle
              icon={<Wheat className="h-4 w-4" />}
              title="آخر سندات الاستلام"
              subtitle="أمانات عينية — بلا أي أثر على المخزون التجاري"
            />
            {recentIntakes.length === 0 ? (
              <MillingEmpty
                title="لا توجد سندات استلام بعد"
                description="ابدأ بتسجيل أول سند استلام من شاشة قبّان الميزان."
              />
            ) : (
              <ul className="divide-y divide-border/50">
                {recentIntakes.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Mono className="font-bold text-foreground">{r.receipt_number}</Mono>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.grain_type} · {r.intake_bag_count} كيس × {r.bag_size_kg} كجم
                      </p>
                    </div>
                    <div className="text-end">
                      <Mono className="block font-bold text-foreground">
                        {Number(r.net_weight_kg).toLocaleString("en-US")} كجم
                      </Mono>
                      <span className="text-[10.5px] text-muted-foreground">
                        {customerNames.has(r.customer_id) ? "أمانات عميل" : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </MillingPanel>

          {/* Active jobs */}
          <MillingPanel>
            <MillingSectionTitle
              icon={<Cog className="h-4 w-4" />}
              title="أوامر الطحن الجارية"
              subtitle="أوامر مفتوحة لم تُغلق بعد"
            />
            {activeJobs.length === 0 ? (
              <MillingEmpty
                title="لا توجد أوامر طحن جارية"
                description="افتح أمر طحن جديد من شاشة صالة التشغيل."
              />
            ) : (
              <ul className="divide-y divide-border/50">
                {activeJobs.slice(0, 6).map((j) => (
                  <li key={j.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Mono className="font-bold text-foreground">{j.job_number}</Mono>
                        <StatusBadge status={j.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {j.input_bag_count} كيس ·{" "}
                        {Number(j.input_weight_kg).toLocaleString("en-US")} كجم
                      </p>
                    </div>
                    <Pill tone="slate">هدر مسموح {j.allowed_loss_percentage}%</Pill>
                  </li>
                ))}
              </ul>
            )}
          </MillingPanel>

          {/* Recent deliveries */}
          <MillingPanel className="lg:col-span-2">
            <MillingSectionTitle
              icon={<Truck className="h-4 w-4" />}
              title="آخر إذونات التسليم"
              subtitle="حركة عينية خارجة — لا تُنشئ أي مديونية"
            />
            {recentDeliveries.length === 0 ? (
              <MillingEmpty
                title="لم تصدر أي إذونات تسليم بعد"
                description="ستظهر هنا إذونات الخروج فور إصدارها من بوابة التسليم."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 text-start font-medium">رقم الإذن</th>
                      <th className="px-4 py-2.5 text-start font-medium">الشاحنة</th>
                      <th className="px-4 py-2.5 text-start font-medium">السائق</th>
                      <th className="px-4 py-2.5 text-end font-medium">الأكياس</th>
                      <th className="px-4 py-2.5 text-end font-medium">الوزن (كجم)</th>
                      <th className="px-4 py-2.5 text-start font-medium">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDeliveries.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-border/50 last:border-0 hover:bg-surface-2/40"
                      >
                        <Cell>
                          <Mono className="font-bold">{d.delivery_number}</Mono>
                        </Cell>
                        <Cell>
                          <Mono>{d.truck_plate_number || "—"}</Mono>
                        </Cell>
                        <Cell>{d.driver_name || "—"}</Cell>
                        <Cell align="end">
                          <Mono className="font-bold">{d.total_bags}</Mono>
                        </Cell>
                        <Cell align="end">
                          <Mono>{Number(d.total_weight_kg).toLocaleString("en-US")}</Mono>
                        </Cell>
                        <Cell>
                          <span className="text-xs text-muted-foreground">
                            {new Date(d.created_at).toLocaleDateString("ar-EG")}
                          </span>
                        </Cell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </MillingPanel>
        </div>
      )}

      <p className="mt-6 flex items-center gap-2 rounded-2xl border border-border/60 bg-surface-2/30 px-4 py-3 text-xs text-muted-foreground">
        <Layers className="h-4 w-4 shrink-0 text-amber-500" />
        هذه الوحدة تعمل على سجل مستقل تماماً (مilling_*) يقرأ ويكتب الأرصدة العينية للعميل فقط.
        مخزون المطحنة التجاري وتكلفة البضاعة المباعة لا يتأثران إطلاقاً بأي عملية في هذه الشاشة.
      </p>
    </>
  );
}
