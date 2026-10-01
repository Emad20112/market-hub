import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { formatLuxuryDate, toSystemDigits } from "@/lib/format-preferences";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useModules } from "@/lib/modules";
import { useAuth } from "@/lib/auth";
import { money, num } from "@/lib/format";
import { VortexMetricCard } from "@/components/vortex-ui/finance/vortex-metric-card";
import {
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  ShoppingCart,
  Users,
  AlertTriangle,
  Package,
  TrendingUp,
  Wallet,
  ArrowRight,
  Sparkles,
  Receipt,
  Boxes,
  Sun,
  Moon,
  Sunrise,
  Crown,
  ShieldCheck,
  Calendar as CalendarIcon,
  Clock,
  ArrowLeft,
  ChevronLeft,,
  Radio,
  Activity,
  Zap,
  CheckCircle2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vortex ERP" }] }),
  component: DashboardPage,
});

const CHART_COLORS = [
  "oklch(0.62 0.21 260)",
  "oklch(0.7 0.18 180)",
  "oklch(0.72 0.18 60)",
  "oklch(0.68 0.2 340)",
  "oklch(0.75 0.15 140)",
];

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  fontSize: 12,
  boxShadow: "var(--shadow-elegant)",
} as const;
const TOOLTIP_ITEM_STYLE = { color: "var(--popover-foreground)" } as const;
const TOOLTIP_LABEL_STYLE = { color: "var(--muted-foreground)", marginBottom: 4 } as const;
const CHART_GRID_STROKE = "var(--border)";

function paymentMethodLabel(method: string | null | undefined, isAr: boolean): string {
  const map: Record<string, string> = {
    cash: isAr ? "نقدًا" : "Cash",
    card: isAr ? "بطاقة" : "Card",
    bank_transfer: isAr ? "تحويل بنكي" : "Bank transfer",
    bank: isAr ? "تحويل بنكي" : "Bank",
    credit: isAr ? "آجل" : "Credit",
  };
  if (!method) return isAr ? "غير محدد" : "Unspecified";
  return map[method] ?? method;
}

function getGreeting(hour: number, isAr: boolean) {
  if (hour >= 4 && hour < 12) {
    return {
      title: isAr ? "صباح الخير والبركة" : "Good morning",
      icon: Sunrise,
      badge: isAr ? "بداية يوم موفقة ☀️" : "Morning focus",
      color: "text-amber-500",
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      title: isAr ? "طاب يومك بكل خير" : "Good afternoon",
      icon: Sun,
      badge: isAr ? "ذروة النشاط 🌤️" : "Peak afternoon",
      color: "text-amber-400",
    };
  }
  return {
    title: isAr ? "مساء النور والمسرات" : "Good evening",
    icon: Moon,
    badge: isAr ? "أمسية سعيدة 🌙" : "Evening wrap-up",
    color: "text-indigo-400",
  };
}

function getRoleMeta(
  isPlatformSuperadmin: boolean,
  isPlatformAdmin: boolean,
  hasRole: (r: any) => boolean,
  isAr: boolean,
) {
  if (isPlatformSuperadmin) {
    return {
      label: isAr ? "السوبر أدمن 👑" : "Superadmin",
      badgeCls: "border-amber-500/40 bg-amber-500/10 text-amber-500",
      icon: Crown,
    };
  }
  if (isPlatformAdmin) {
    return {
      label: isAr ? "مدير المنصة 🛡️" : "Platform Admin",
      badgeCls: "border-primary/40 bg-primary/10 text-primary",
      icon: ShieldCheck,
    };
  }
  if (hasRole("owner")) {
    return {
      label: isAr ? "مالك النظام ⚡" : "Business Owner",
      badgeCls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
      icon: Crown,
    };
  }
  if (hasRole("admin")) {
    return {
      label: isAr ? "مدير النظام 👔" : "Admin",
      badgeCls: "border-primary/30 bg-primary/10 text-primary",
      icon: ShieldCheck,
    };
  }
  if (hasRole("accountant")) {
    return {
      label: isAr ? "المحاسب المالي 💼" : "Accountant",
      badgeCls: "border-blue-500/30 bg-blue-500/10 text-blue-500",
      icon: ShieldCheck,
    };
  }
  if (hasRole("cashier")) {
    return {
      label: isAr ? "كاشير 🏷️" : "Cashier",
      badgeCls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-500",
      icon: ShieldCheck,
    };
  }
  return {
    label: isAr ? "عضو فريق" : "Staff Member",
    badgeCls: "border-border bg-surface-2 text-muted-foreground",
    icon: ShieldCheck,
  };
}

function DashboardPage() {
  const { isModuleEnabled } = useModules();
  const { t, lang, dir } = useI18n();
  const isAr = lang === "ar";
  const { user, isPlatformAdmin, isPlatformSuperadmin, hasRole } = useAuth();

  // User Profile
  const { data: profile } = useQuery({
    queryKey: ["current-user-profile", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const userName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    (user?.email ? user.email.split("@")[0] : isAr ? "موسى" : "User");

  const now = new Date();
  const currentHour = now.getHours();
  const greeting = getGreeting(currentHour, isAr);
  const roleMeta = getRoleMeta(isPlatformSuperadmin, isPlatformAdmin, hasRole, isAr);

  // Elegant Date formatting
  const formattedDate = now.toLocaleDateString(isAr ? "ar-SA" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const { data } = useQuery({
    queryKey: ["dashboard-v2"],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const since14 = new Date(Date.now() - 14 * 86400_000).toISOString();
      const [sales, customers, products, inv, items, recent, expenses] = await Promise.all([
        supabase
          .from("sales_invoices")
          .select("total,paid,payment_method,created_at,status,customer_id")
          .gte("created_at", since),
        supabase
          .from("customers")
          .select("id,name,balance", { count: "exact" })
          .eq("is_active", true),
        supabase.from("products").select("id,name,name_ar,min_stock,sale_price"),
        supabase.from("inventory").select("product_id,quantity"),
        supabase
          .from("sales_invoice_items")
          .select(
            "product_id,quantity,total,invoice_id,sales_invoices!inner(created_at,customer_id)",
          )
          .gte("sales_invoices.created_at", since)
          .limit(2000),
        supabase
          .from("sales_invoices")
          .select("id,invoice_number,total,status,created_at,customers(name)")
          .gte("created_at", since14)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("expenses").select("amount,created_at").gte("created_at", since),
      ]);

      const salesRows = sales.data ?? [];
      const stockMap = new Map<string, number>();
      (inv.data ?? []).forEach((r: any) =>
        stockMap.set(r.product_id, (stockMap.get(r.product_id) ?? 0) + Number(r.quantity)),
      );
      const lowStock = (products.data ?? []).filter(
        (p: any) => (stockMap.get(p.id) ?? 0) <= Number(p.min_stock ?? 0),
      );

      const daily: { day: string; revenue: number; orders: number }[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400_000);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString(lang === "ar" ? "ar" : "en", { weekday: "short" });
        const rows = salesRows.filter((r) => (r as any).created_at.slice(0, 10) === key);
        daily.push({
          day: label,
          revenue: rows.reduce((a, r: any) => a + Number(r.total), 0),
          orders: rows.length,
        });
      }

      const prodAgg = new Map<string, { qty: number; total: number }>();
      (items.data ?? []).forEach((it: any) => {
        const cur = prodAgg.get(it.product_id) ?? { qty: 0, total: 0 };
        cur.qty += Number(it.quantity);
        cur.total += Number(it.total);
        prodAgg.set(it.product_id, cur);
      });
      const prodMap = new Map((products.data ?? []).map((p: any) => [p.id, p]));
      const topProducts = Array.from(prodAgg.entries())
        .map(([id, v]) => ({ ...v, product: prodMap.get(id) as any }))
        .filter((x) => x.product)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      const paySplit: Record<string, number> = {};
      salesRows.forEach((r: any) => {
        const label = paymentMethodLabel(r.payment_method, lang === "ar");
        paySplit[label] = (paySplit[label] ?? 0) + Number(r.paid);
      });

      const totalRev = salesRows.reduce((a, r: any) => a + Number(r.total), 0);
      const totalPaid = salesRows.reduce((a, r: any) => a + Number(r.paid), 0);
      const totalExpenses = (expenses.data ?? []).reduce((a, r: any) => a + Number(r.amount), 0);
      const receivables = (customers.data ?? []).reduce(
        (a, r: any) => a + Math.max(0, Number(r.balance ?? 0)),
        0,
      );
      const topDebtors = (customers.data ?? [])
        .filter((c: any) => Number(c.balance) > 0)
        .sort((a: any, b: any) => Number(b.balance) - Number(a.balance))
        .slice(0, 5);

      return {
        revenue: totalRev,
        collected: totalPaid,
        orders: salesRows.length,
        customers: customers.count ?? 0,
        alerts: lowStock.length,
        expenses: totalExpenses,
        receivables,
        netCash: totalPaid - totalExpenses,
        daily,
        topProducts,
        paySplit,
        recent: recent.data ?? [],
        lowStock: lowStock.slice(0, 6).map((p: any) => ({ ...p, stock: stockMap.get(p.id) ?? 0 })),
        topDebtors,
      };
    },
  });

  const paymentPie = Object.entries(data?.paySplit ?? {}).map(([name, value]) => ({ name, value }));

  const GreetingIcon = greeting.icon;

  return (
    <>
      <PageHeader
        title={t("dash.title")}
        subtitle={t("dash.subtitle")}
        actions={
          isModuleEnabled("analytics") ? (
            <Link
              to="/analytics"
              className="hidden sm:flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 text-xs font-medium text-primary hover:bg-primary/20 transition shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5" />{" "}
              {lang === "ar" ? "التحليلات المتقدمة" : "Advanced analytics"}
            </Link>
          ) : undefined
        }
      />

      {/* Executive Command Center / Hero Card — Reimagined as an Integrated Business Command Deck */}
      <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-card via-card/95 to-surface-2/40 shadow-panel backdrop-blur-xl">
        {/* Subtle Architectural Ambient Accents */}
        <div className="pointer-events-none absolute -top-32 -end-24 size-96 rounded-full bg-primary/10 blur-3xl opacity-60" />
        <div className="pointer-events-none absolute -bottom-32 -start-24 size-80 rounded-full bg-emerald-500/10 blur-3xl opacity-40" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        {/* ─── Layer 1: Identity Horizon & Chronos Capsule ─── */}
        <div className="relative flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between border-b border-border/50">
          {/* Executive Identity & Status */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={userName}
                  className="size-14 sm:size-16 rounded-2xl object-cover ring-2 ring-primary/20 shadow-md shadow-primary/10"
                />
              ) : (
                <div className="grid size-14 sm:size-16 place-items-center rounded-2xl bg-gradient-to-tr from-primary/90 via-primary to-primary/75 text-primary-foreground font-black text-xl sm:text-2xl shadow-md shadow-primary/20 ring-1 ring-primary/40">
                  {userName ? userName.charAt(0).toUpperCase() : "V"}
                </div>
              )}
              {/* Telemetry Radar Ping */}
              <span className="absolute -bottom-1 -end-1 flex size-4 items-center justify-center" title={isAr ? "متصل ومباشر" : "Live"}>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex size-3 rounded-full bg-emerald-500 ring-2 ring-card" />
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                  <GreetingIcon className={`size-3.5 ${greeting.color}`} />
                  <span>{greeting.badge}</span>
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${roleMeta.badgeCls}`}>
                  <span>{roleMeta.label}</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{isAr ? "نظام فورتكس مباشر ومتزامن" : "Vortex Live & Synced"}</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
                <span>{greeting.title}،</span>
                <span className="text-primary">
                  {userName}
                </span>
              </h2>

              <p className="text-xs text-muted-foreground font-medium">
                {isAr
                  ? "مركز القيادة المباشر • ملخص الإيرادات والسيولة وتنبيهات المنشأة"
                  : "Command Center • Real-time revenue, liquidity & operational alerts"}
              </p>
            </div>
          </div>

          {/* Architectural Chronos Horizon Widget */}
          <div className="flex items-center self-stretch sm:self-auto justify-between sm:justify-end">
            {(() => {
              const luxuryDate = formatLuxuryDate(now, { showDayName: true, showYear: true });
              return (
                <div className="flex w-full sm:w-auto items-stretch rounded-2xl border border-border/80 bg-surface/70 shadow-xs backdrop-blur-md">
                  {/* Date Pillar */}
                  <div className="flex items-center gap-3 px-3.5 py-2.5">
                    <div className="grid place-items-center min-w-[2.4rem] h-10 rounded-xl bg-primary/10 text-primary font-mono font-black text-xl leading-none">
                      {luxuryDate.day}
                    </div>
                    <div className="space-y-0.5">
                      <span className="block text-xs font-bold text-foreground">
                        {luxuryDate.weekday}
                      </span>
                      <span className="block text-[11px] text-muted-foreground font-medium font-mono">
                        {luxuryDate.month} {luxuryDate.year}
                      </span>
                    </div>
                  </div>

                  {/* Vertical Hairline Divider */}
                  <div className="w-px bg-border/60 self-center h-8" />

                  {/* Time & Telemetry Pillar */}
                  <div className="flex flex-col justify-center px-3.5 py-2.5 space-y-0.5 text-end">
                    <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-foreground justify-end">
                      <Clock className="size-3 text-primary" />
                      <span>{now.toLocaleTimeString(isAr ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium justify-end">
                      <Radio className="size-2.5 text-emerald-500 animate-pulse" />
                      <span>{isAr ? "مزامنة لحظية" : "Realtime"}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ─── Layer 2: Integrated Business Vitals Deck (Single-Surface, No Box Clutter) ─── */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-border/50 bg-surface/30">
            {(() => {
              const todayDaily = data.daily ? data.daily[data.daily.length - 1] : null;
              const todayRev = todayDaily?.revenue ?? 0;
              const todayOrd = todayDaily?.orders ?? 0;
              const alerts = data.alerts ?? 0;
              const rec = data.receivables ?? 0;

              return (
                <>
                  {/* Vital 1: Sales Velocity */}
                  <div className="p-4 sm:p-5 flex flex-col justify-between transition-colors hover:bg-surface/50">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <TrendingUp className="size-3.5 text-primary" />
                        {isAr ? "مبيعات اليوم المسجلة" : "Today Recorded Sales"}
                      </span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        {isAr ? "تدفق حي" : "Live stream"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground">
                        {money(todayRev)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ShoppingCart className="size-3 text-muted-foreground/70" />
                        <span>{num(todayOrd)} {isAr ? "فواتير اليوم" : "orders today"}</span>
                      </span>
                      <Link
                        to="/sales"
                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
                      >
                        {isAr ? "عرض السجل" : "View log"}
                        <ChevronLeft className="size-3 rtl:rotate-0 rotate-180" />
                      </Link>
                    </div>
                  </div>

                  {/* Vital 2: Liquidity & Receivables */}
                  <div className="p-4 sm:p-5 flex flex-col justify-between transition-colors hover:bg-surface/50">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Wallet className="size-3.5 text-amber-500" />
                        {isAr ? "المستحقات المفتوحة بالسوق" : "Market Receivables"}
                      </span>
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        {isAr ? "تحصيل" : "To collect"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground">
                        {money(rec)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{isAr ? "ديون مستحقة على العملاء" : "Outstanding customer balances"}</span>
                      <Link
                        to="/debts"
                        className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
                      >
                        {isAr ? "متابعة وسندات" : "Collect"}
                        <ChevronLeft className="size-3 rtl:rotate-0 rotate-180" />
                      </Link>
                    </div>
                  </div>

                  {/* Vital 3: Operational Attention Radar (What Needs Attention Now) */}
                  <div className="p-4 sm:p-5 flex flex-col justify-between transition-colors hover:bg-surface/50 sm:col-span-2 lg:col-span-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <Activity className="size-3.5 text-primary" />
                        {isAr ? "رادار الانتباه الفوري" : "Attention Radar"}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                        {isAr ? "المخزون والتشغيل" : "Inventory & Ops"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2.5">
                      {alerts > 0 ? (
                        <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 text-rose-600 dark:text-rose-400">
                          <AlertTriangle className="size-4 shrink-0 animate-bounce" />
                          <span className="text-xs sm:text-sm font-bold">
                            {alerts} {isAr ? "أصناف أوشكت على النفاد" : "items below safety stock"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-4 shrink-0" />
                          <span className="text-xs sm:text-sm font-bold">
                            {isAr ? "المستودعات متزنة ومستقرة تماماً" : "All warehouses at optimal level"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {alerts > 0
                          ? (isAr ? "تحتاج لإصدار أمر شراء سريع" : "Purchase order recommended")
                          : (isAr ? "لا توجد نواقص حرجة تتطلب تدخلاً" : "No critical stock deficits")}
                      </span>
                      <Link
                        to="/inventory"
                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
                      >
                        {isAr ? "فحص المستودع" : "Inspect"}
                        <ChevronLeft className="size-3 rtl:rotate-0 rotate-180" />
                      </Link>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ─── Layer 3: Command Flight Deck & Deep Analytics Gateway ─── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 sm:p-4.5 bg-card/80 border-t border-border/60">
          {/* Fast Operational Launchers */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/pos"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-95"
            >
              <Zap className="size-3.5" />
              <span>{lang === "ar" ? "نقطة البيع (POS)" : "Open POS"}</span>
              <kbd className="hidden md:inline-block rounded bg-primary-foreground/20 px-1 py-0.2 text-[9px] font-mono">F2</kbd>
            </Link>

            <Link
              to="/sales"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 text-xs font-semibold text-foreground hover:bg-surface-2 transition-all active:scale-95"
            >
              <Receipt className="size-3.5 text-muted-foreground" />
              <span>{lang === "ar" ? "فواتير المبيعات" : "Invoices"}</span>
            </Link>

            <Link
              to="/debts"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 text-xs font-semibold text-foreground hover:bg-surface-2 transition-all active:scale-95"
            >
              <Wallet className="size-3.5 text-muted-foreground" />
              <span>{lang === "ar" ? "الديون والتحصيل" : "Debts"}</span>
            </Link>

            <Link
              to="/products"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/80 bg-surface/70 px-3 text-xs font-semibold text-foreground hover:bg-surface-2 transition-all active:scale-95"
            >
              <Package className="size-3.5 text-muted-foreground" />
              <span>{lang === "ar" ? "كتالوج المنتجات" : "Products"}</span>
            </Link>
          </div>

          {/* Deep Intelligence & Advanced Analytics Portal */}
          {isModuleEnabled("analytics") && (
            <Link
              to="/analytics"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-xs font-bold text-primary hover:bg-primary/20 hover:border-primary/50 transition-all active:scale-95 shadow-xs"
            >
              <Sparkles className="size-3.5 text-primary" />
              <span>{lang === "ar" ? "التحليلات والتوقعات المتقدمة" : "Advanced Analytics & Forecasts"}</span>
              <ArrowLeft className="size-3.5 rtl:rotate-0 rotate-180" />
            </Link>
          )}
        </div>
      </div>

      {/* Modern Vortex Metric Cards Grid - 2 cards per row on mobile */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4 mb-6">
        <Link to="/sales" className="block focus:outline-none">
          <VortexMetricCard
            title={t("dash.sales")}
            value={num(data?.orders ?? 0)}
            subtitle={lang === "ar" ? "مبيعات آخر 30 يوماً" : "Last 30 days"}
            badge={lang === "ar" ? "فواتير" : "Orders"}
            currency=""
            icon={<ShoppingCart className="size-5" />}
            iconClassName="bg-primary/10 text-primary"
            trend={{
              value: "+4.2%",
              direction: "up",
              isPositive: true,
              label: lang === "ar" ? "نمو" : "growth",
            }}
          />
        </Link>

        <Link to="/customers" className="block focus:outline-none">
          <VortexMetricCard
            title={t("dash.customers")}
            value={num(data?.customers ?? 0)}
            subtitle={lang === "ar" ? "عملاء نشطون مسجلون" : "Registered customers"}
            badge={lang === "ar" ? "عميل" : "Clients"}
            currency=""
            icon={<Users className="size-5" />}
            iconClassName="bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
            trend={{
              value: "+2",
              direction: "up",
              isPositive: true,
              label: lang === "ar" ? "جديد" : "new",
            }}
          />
        </Link>

        <Link to="/finance" className="block focus:outline-none">
          <VortexMetricCard
            title={lang === "ar" ? "المصروفات التشغيلية" : "Expenses"}
            value={money(data?.expenses ?? 0)}
            subtitle={lang === "ar" ? "المصروفات المسجلة" : "Logged expenses"}
            currency=""
            icon={<Wallet className="size-5" />}
            iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            trend={{
              value: "-3%",
              direction: "down",
              isPositive: true,
              label: lang === "ar" ? "وفورات" : "savings",
            }}
          />
        </Link>

        <Link to="/inventory" className="block focus:outline-none">
          <VortexMetricCard
            title={t("dash.alerts")}
            value={num(data?.alerts ?? 0)}
            subtitle={
              (data?.alerts ?? 0) > 0
                ? lang === "ar"
                  ? "منتجات تحت حد الطلب"
                  : "Items below min stock"
                : lang === "ar"
                  ? "المخزون بمستوى ممتاز"
                  : "Stock level healthy"
            }
            currency=""
            badge={(data?.alerts ?? 0) > 0 ? (lang === "ar" ? "تنبيه" : "Alert") : undefined}
            icon={<AlertTriangle className="size-5" />}
            iconClassName={
              (data?.alerts ?? 0) > 0
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            }
            trend={{
              value: (data?.alerts ?? 0) > 0 ? `${data?.alerts} تنبيه` : "سليم ✓",
              direction: (data?.alerts ?? 0) > 0 ? "down" : "up",
              isPositive: (data?.alerts ?? 0) === 0,
            }}
            highlight={(data?.alerts ?? 0) > 0}
          />
        </Link>
      </div>

      {/* Charts row */}
      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="panel-elevated lg:col-span-2 p-5 rounded-3xl border border-border/80 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">{t("dash.revenue_trend")}</h3>
              <p className="text-xs text-muted-foreground">{t("dash.last_14_days")}</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" /> {isAr ? "الإيراد" : "Revenue"}
              <span className="ms-2 h-2 w-2 rounded-full bg-chart-2" />{" "}
              {isAr ? "الطلبات" : "Orders"}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.daily ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary, #3b82f6)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary, #3b82f6)" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="currentColor"
                  className="text-muted-foreground opacity-60"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  yAxisId="rev"
                  stroke="currentColor"
                  className="text-muted-foreground opacity-60"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
                />
                <YAxis
                  yAxisId="orders"
                  orientation="right"
                  stroke="currentColor"
                  className="text-muted-foreground opacity-40"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(val: any, name: any) => [
                    name === "revenue"
                      ? money(Number(val))
                      : `${num(Number(val))} ${isAr ? "طلب" : "orders"}`,
                    name === "revenue"
                      ? isAr
                        ? "الإيراد"
                        : "Revenue"
                      : isAr
                        ? "عدد الفواتير"
                        : "Orders",
                  ]}
                />
                <Area
                  yAxisId="rev"
                  type="monotone"
                  dataKey="revenue"
                  name="revenue"
                  stroke="var(--primary, #3b82f6)"
                  strokeWidth={2.5}
                  fill="url(#g1)"
                />
                <Area
                  yAxisId="orders"
                  type="monotone"
                  dataKey="orders"
                  name="orders"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#g2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel-elevated p-5 rounded-3xl border border-border/80 shadow-sm">
          <h3 className="text-sm font-semibold">
            {lang === "ar" ? "توزيع طرق الدفع" : "Payment mix"}
          </h3>
          <p className="text-xs text-muted-foreground">{t("dash.last_30_days")}</p>
          <div className="mt-4 h-52">
            {paymentPie.length === 0 ? (
              <div className="grid h-full place-items-center text-xs text-muted-foreground">
                {t("common.no_data")}
              </div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={paymentPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    strokeWidth={0}
                  >
                    {paymentPie.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(val: any) => [money(Number(val)), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 space-y-1.5">
            {paymentPie.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  {p.name}
                </span>
                <span className="font-mono">{money(p.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top products & Recent sales */}
      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="panel-elevated p-5 rounded-3xl border border-border/80 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Package className="h-4 w-4 text-chart-2" /> {t("dash.top_products")}
              </h3>
              <p className="text-xs text-muted-foreground">{t("dash.last_30_days")}</p>
            </div>
          </div>
          {(data?.topProducts.length ?? 0) === 0 ? (
            <div className="grid place-items-center py-10 text-xs text-muted-foreground">
              {t("common.no_data")}
            </div>
          ) : (
            <div className="space-y-3">
              {data!.topProducts.map((tp, i) => {
                const max = data!.topProducts[0].total || 1;
                const pct = (tp.total / max) * 100;
                const name =
                  lang === "ar"
                    ? tp.product?.name_ar || tp.product?.name
                    : tp.product?.name || tp.product?.name_ar;
                return (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate font-medium">{name}</span>
                      <span className="font-mono text-muted-foreground">
                        {money(tp.total)} · {tp.qty}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-chart-4"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel-elevated p-5 rounded-3xl border border-border/80 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-primary" /> {t("dash.recent_sales")}
            </h3>
            <Link
              to="/sales"
              className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
            >
              {lang === "ar" ? "الكل" : "All"} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {(data?.recent.length ?? 0) === 0 ? (
            <div className="grid place-items-center py-10 text-xs text-muted-foreground">
              {t("dash.no_invoices_hint")}
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {(data?.recent ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {r.customers?.name ?? (lang === "ar" ? "عميل نقدي" : "Walk-in")}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      {r.invoice_number}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-semibold font-mono">{money(Number(r.total))}</div>
                    <div
                      className={`text-[10px] ${r.status === "paid" ? "text-emerald-500" : r.status === "partial" ? "text-amber-500" : "text-muted-foreground"}`}
                    >
                      {r.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low stock & Top debtors */}
      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="panel-elevated p-5 rounded-3xl border border-border/80 shadow-sm">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Boxes className="h-4 w-4 text-warning" />{" "}
            {lang === "ar" ? "منتجات على وشك النفاد" : "Low stock alerts"}
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            {lang === "ar" ? "المنتجات تحت الحد الأدنى" : "Products below minimum"}
          </p>
          {(data?.lowStock.length ?? 0) === 0 ? (
            <div className="grid place-items-center py-10 text-xs text-emerald-500">
              ✓ {lang === "ar" ? "المخزون بحالة جيدة" : "All stock is healthy"}
            </div>
          ) : (
            <div className="space-y-2">
              {data!.lowStock.map((p: any) => {
                const name = lang === "ar" ? p.name_ar || p.name : p.name || p.name_ar;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-sm"
                  >
                    <span className="truncate">{name}</span>
                    <span className="font-mono text-warning">
                      {p.stock} / {p.min_stock}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel-elevated p-5 rounded-3xl border border-border/80 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Users className="h-4 w-4 text-chart-3" />{" "}
              {lang === "ar" ? "أعلى الديون" : "Top debtors"}
            </h3>
            <Link
              to="/debts"
              className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
            >
              {lang === "ar" ? "الكل" : "All"} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {(data?.topDebtors.length ?? 0) === 0 ? (
            <div className="grid place-items-center py-10 text-xs text-emerald-500">
              ✓ {lang === "ar" ? "لا توجد ذمم" : "No outstanding balances"}
            </div>
          ) : (
            <div className="space-y-2">
              {data!.topDebtors.map((c: any) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="font-mono text-rose-500">{money(Number(c.balance))}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MiniBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pos" | "neg" | "warn" | "neutral";
}) {
  const cls =
    tone === "pos"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
      : tone === "neg"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-500"
        : tone === "neutral"
          ? "border-primary/25 bg-primary/5 text-primary"
          : "border-amber-500/30 bg-amber-500/10 text-amber-500";
  return (
    <div className={`rounded-full border px-3 py-1 text-xs backdrop-blur shadow-sm ${cls}`}>
      <span className="opacity-70">{label}:</span>{" "}
      <span className="font-bold font-mono">{value}</span>
    </div>
  );
}
