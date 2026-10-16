/**
 * /milling — layout route for the simplified mill.
 *
 * Its three child screens (intake, milling, delivery) render through the
 * Outlet below. On the exact /milling path we show a compact "today" overview
 * built entirely from the custody views — no jobs, no dashboards of dead data.
 * (docs/milling/00_خطة_التبسيط_المعتمدة.md §4.1)
 */
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wheat, Cog, Truck, FileText, Plus, Factory, PackageMinus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { fetchCustodyStatement, fetchDetectedLoss } from "@/lib/milling";
import {
  MillingPanel,
  MillingSectionTitle,
  StatTile,
  MillingEmpty,
  Mono,
  fmtNum,
} from "@/components/milling/milling-ui";

export const Route = createFileRoute("/_app/milling")({
  head: () => ({ meta: [{ title: "المطحنة — فورتكس ERP" }] }),
  component: MillingLayout,
});

const QUICK_LINKS = [
  {
    to: "/milling/intake",
    title: "الاستلام",
    subtitle: "حبوب العميل تُستلم كأمانة",
    icon: <Wheat className="h-5 w-5" />,
  },
  {
    to: "/milling/milling",
    title: "الطحن",
    subtitle: "من رصيد الحبوب إلى النواتج",
    icon: <Cog className="h-5 w-5" />,
  },
  {
    to: "/milling/delivery",
    title: "التسليم",
    subtitle: "أخرج الناتج لصاحبه",
    icon: <Truck className="h-5 w-5" />,
  },
  {
    to: "/milling/manufacture",
    title: "التصنيع الذكي",
    subtitle: "من مخزوننا: قمح يصير نواتج بتكلفة عادلة",
    icon: <Factory className="h-5 w-5" />,
  },
  {
    to: "/milling/consumables",
    title: "صرف مستهلكات",
    subtitle: "أكياس وخيط وزيت من المخزن",
    icon: <PackageMinus className="h-5 w-5" />,
  },
  {
    to: "/milling/customer-statement",
    title: "كشف الحساب",
    subtitle: "العيني والمالي في مكان واحد",
    icon: <FileText className="h-5 w-5" />,
  },
] as const;

function MillingLayout() {
  const { pathname } = useLocation();
  const isOverview = pathname.replace(/\/+$/, "") === "/milling";

  if (!isOverview) {
    return (
      <ModuleGuard moduleId="milling_operations">
        <Outlet />
      </ModuleGuard>
    );
  }

  return (
    <ModuleGuard moduleId="milling_operations">
      <MillingOverview />
    </ModuleGuard>
  );
}

function MillingOverview() {
  const statement = useQuery({
    queryKey: ["milling", "statement"],
    queryFn: () => fetchCustodyStatement(),
  });
  const loss = useQuery({
    queryKey: ["milling", "detected-loss"],
    queryFn: fetchDetectedLoss,
  });

  const rows = statement.data ?? [];
  /** ما يبقى الآن باسم العملاء (عيني) — مشتق من الكشف. */
  const heldBags = rows.reduce((s, r) => s + Math.max(0, Number(r.remaining_bags ?? 0)), 0);
  const heldKg = rows.reduce((s, r) => s + Math.max(0, Number(r.remaining_kg ?? 0)), 0);
  const receivedKg = rows.reduce((s, r) => s + Number(r.received_kg ?? 0), 0);
  const customersHolding = new Set(
    rows
      .filter((r) => Number(r.remaining_bags ?? 0) > 0 || Number(r.remaining_kg ?? 0) > 0)
      .map((r) => r.customer_id),
  ).size;
  const reviewCount = (loss.data ?? []).filter((l) => l.loss_status === "REVIEW").length;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4">
      <PageHeader
        title="المطحنة"
        subtitle="دورة واحدة بسيطة: استلام ثم طحن ثم تسليم — وكل شيء على كشف واحد."
      />

      {/* المؤشرات المشتقة من السجل فقط */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          title="مستلم تراكمي"
          value={fmtNum(receivedKg)}
          unit="كجم"
          icon={<Wheat className="h-4 w-4" />}
        />
        <StatTile
          title="يبقى باسم العملاء"
          value={fmtNum(heldBags)}
          unit="كيس"
          tone="emerald"
          icon={<Cog className="h-4 w-4" />}
        />
        <StatTile
          title="أرصدة كجم معلقة"
          value={fmtNum(heldKg)}
          unit="كجم"
          tone="sky"
          icon={<Truck className="h-4 w-4" />}
        />
        <StatTile
          title="عملاء لديهم رصيد"
          value={customersHolding}
          tone={reviewCount > 0 ? "rose" : "amber"}
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      {reviewCount > 0 && (
        <MillingPanel className="border-amber-500/40">
          <MillingSectionTitle
            title={`فاقد مكتشف يحتاج مراجعة (${reviewCount})`}
            subtitle="يُكتشف من الكشف ولا يُدخل — إن كان الرقم غير معقول راجع الميزان والتسجيل."
          />
          <div className="space-y-2 p-4">
            {(loss.data ?? [])
              .filter((l) => l.loss_status === "REVIEW")
              .slice(0, 5)
              .map((l) => (
                <div
                  key={`${l.customer_id}-${l.item_id}-${l.warehouse_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2"
                >
                  <span className="text-xs font-bold text-foreground">
                    {l.customer_name_ar} — {l.grain_name_ar}
                  </span>
                  <Mono>فاقد {fmtNum(l.detected_loss_kg)} كجم</Mono>
                </div>
              ))}
          </div>
        </MillingPanel>
      )}

      {/* الشاشات */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {QUICK_LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="group rounded-2xl border border-border/70 bg-surface-1/80 p-4 shadow-sm transition hover:border-amber-500/50 hover:bg-amber-500/5"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              {l.icon}
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">{l.title}</p>
            <p className="text-xs text-muted-foreground">{l.subtitle}</p>
          </Link>
        ))}
      </div>

      {rows.length === 0 && !statement.isLoading && (
        <MillingPanel>
          <div className="p-6">
            <MillingEmpty title="السجل فارغ" hint="ابدأ من شاشة الاستلام — أول سطر سيظهر هنا." />
          </div>
        </MillingPanel>
      )}

      {/* زر سريع للبدء */}
      {rows.length === 0 && (
        <div className="flex justify-center">
          <Link
            to="/milling/intake"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-amber-600"
          >
            <Plus className="h-4 w-4" /> تسجيل أول استلام
          </Link>
        </div>
      )}
    </div>
  );
}
