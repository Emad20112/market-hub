import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Users,
  Scale,
  Wallet,
  Wheat,
  PackageCheck,
  Receipt,
  Printer,
  Search,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerCustody,
  fetchOutputBalances,
  fetchServiceMoney,
  outputLabel,
  type CustomerCustodyRow,
  type OutputBalanceRow,
  type ServiceMoneyRow,
} from "@/lib/milling";
import {
  MillingPanel,
  MillingSectionTitle,
  MillingSelect,
  OutputBadge,
  Mono,
  Pill,
  MillingEmpty,
  Cell,
} from "@/components/milling/milling-ui";
import type { PageGuideConfig } from "@/components/page-guide";
import { cn } from "@/lib/utils";
import { money } from "@/lib/format";

export const Route = createFileRoute("/_app/milling/customer-statement")({
  head: () => ({ meta: [{ title: "كشف حساب الأمانات — فورتكس ERP" }] }),
  component: MillingStatementPage,
});

const guide: PageGuideConfig = {
  title: "دليل كشف حساب الأمانات المزدوج",
  subtitle: "لكل عميل مطحون كشفان منفصلان: كشف عيني للأكياس والأطنان، وكشف مالي لأجور الطحن.",
  badge: "الكشوفات",
  icon: <FileText className="h-5 w-5 text-yellow-500" />,
  summaryText:
    "الفصل بين الكشفين هو أساس المصالحة: كشف العيني يقرأ من جداول milling_* فقط ولا يعرف شيئاً عن المال، وكشف المالي يقرأ من sales_invoices المرتبطة بأوامر الطحن فقط ولا يشمل بيع البضاعة.",
  overviewCards: [
    {
      title: "التبويب العيني",
      description: "وارد حبوب − مطحون − ناتج − مسلّم = المتبقي في الصوامع، بالأكياس والأطنان.",
      icon: <Scale className="h-4 w-4" />,
      color: "amber",
    },
    {
      title: "التبويب المالي",
      description: "فواتير أجور الطحن، المدفوع، والمتبقي على العميل — بلا أي بند تجاري.",
      icon: <Wallet className="h-4 w-4" />,
      color: "emerald",
    },
    {
      title: "لا خلط",
      description: "بيع دقيق المطحنة الخاص لنفس العميل يظهر في كشف المبيعات العادي، وليس هنا.",
      icon: <Receipt className="h-4 w-4" />,
      color: "purple",
    },
  ],
  matrixTitle: "كيف يُحسب كل رقم",
  matrixDescription: "المصدر الحقيقي لكل عمود في الكشفين.",
  impactMatrix: {
    columns: [
      { key: "col", label: "العمود", className: "w-[30%]" },
      { key: "src", label: "المصدر", className: "w-[34%]" },
      { key: "note", label: "ملاحظة", className: "w-[36%]" },
    ],
    rows: [
      {
        badge: { label: "عيني", variant: "amber" },
        fields: {
          col: "وارد / مطحون / مسلّم",
          src: "milling_intake_receipts + milling_jobs + milling_job_outputs",
          note: "لا يحتسب المخزون التجاري ولا أي فاتورة",
        },
      },
      {
        badge: { label: "عيني", variant: "amber" },
        fields: {
          col: "المتبقي في الصوامع",
          src: "الناتج − المسلّم، لكل درجة على حدة",
          note: "الفاقد لا يُحتسب رصيداً لأنه ليس بضاعة قابلة للتسليم",
        },
      },
      {
        badge: { label: "مالي", variant: "emerald" },
        fields: {
          col: "أجور الطحن والمتبقي",
          src: "sales_invoices حيث milling_job_id ليس فارغاً",
          note: "فواتير البضاعة العادية مستثناة عمداً",
        },
      },
    ],
  },
  rulesTitle: "قاعدة واحدة تحكم الكشفين",
  rules: [
    {
      type: "danger",
      title: "الكشفان لا يختلطان",
      description: "لا يظهر أي رقم مالي في الكشف العيني، ولا أي كمية عينية في الكشف المالي.",
    },
    {
      type: "info",
      title: "الرصيد المالي هنا جزئي",
      description: "يغطي أجور الطحن فقط. الرصيد الكلي للعميل يظهر في كشف الحساب المالي العام.",
    },
  ],
  footerTip: "نصيحة: طابق الكشف العيني مع جرد الصوامع نهاية كل أسبوع لتكتشف أي فرق مبكراً.",
};

const nf = (v: number, d = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: d });

type Tab = "physical" | "financial";

function MillingStatementPage() {
  const [tab, setTab] = useState<Tab>("physical");
  const [customerId, setCustomerId] = useState("");
  const [query, setQuery] = useState("");

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

  useEffect(() => {
    if (!customerId && customers && customers.length > 0) {
      setCustomerId(customers[0].id);
    }
  }, [customers, customerId]);

  const { data: custody } = useQuery({
    queryKey: ["milling", "custody", customerId],
    queryFn: () => fetchCustomerCustody(customerId),
    enabled: Boolean(customerId),
  });

  const { data: balances } = useQuery({
    queryKey: ["milling", "balances", customerId],
    queryFn: () => fetchOutputBalances(customerId),
    enabled: Boolean(customerId),
  });

  const { data: money_ } = useQuery({
    queryKey: ["milling", "money", customerId],
    queryFn: () => fetchServiceMoney(customerId),
    enabled: Boolean(customerId),
  });

  const customerName = (id: string) => customers?.find((c) => c.id === id)?.name ?? "—";

  /* ------------------------------------------- derived physical arithmetic */
  const c: CustomerCustodyRow | null = custody ?? null;

  const stillInSilo = useMemo(() => {
    if (!c) return { grainLeftKg: 0, flourLeftBags: 0, flourLeftKg: 0 };
    // Received, not yet milled — grain still waiting in the silo.
    const grainLeftKg = Math.max(Number(c.received_kg ?? 0) - Number(c.milled_kg ?? 0), 0);
    // Finished output still waiting to be collected.
    const flourLeftBags = Number(c.produced_bags ?? 0) - Number(c.delivered_bags ?? 0);
    const flourLeftKg = Number(c.produced_kg ?? 0) - Number(c.delivered_kg ?? 0);
    return { grainLeftKg, flourLeftBags, flourLeftKg };
  }, [c]);

  const totals = useMemo(() => {
    const rows: ServiceMoneyRow[] = money_ ?? [];
    return {
      count: rows.length,
      billed: rows.reduce((s, r) => s + Number(r.total ?? 0), 0),
      paid: rows.reduce((s, r) => s + Number(r.paid ?? 0), 0),
      outstanding: rows.reduce((s, r) => s + Number(r.outstanding ?? 0), 0),
    };
  }, [money_]);

  const filteredMoney = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return money_ ?? [];
    return (money_ ?? []).filter((r) =>
      `${r.invoice_number} ${r.job_number}`.toLowerCase().includes(q),
    );
  }, [money_, query]);

  if (!customerId) {
    return (
      <ModuleGuard moduleId="milling_operations">
        <PageHeader
          title="كشف حساب الأمانات"
          subtitle="كشف عيني وكشف مالي منفصلان لكل عميل"
          guide={guide}
        />
        <MillingPanel>
          <MillingEmpty title="اختر عميلاً" description="لا يوجد عملاء بعد، أو لم يُحمَّلوا بعد." />
        </MillingPanel>
      </ModuleGuard>
    );
  }

  return (
    <ModuleGuard moduleId="milling_operations">
      <PageHeader
        title="كشف حساب الأمانات المزدوج"
        subtitle={customerName(customerId)}
        guide={guide}
        actions={
          <MillingSelect
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-56"
          >
            {customers?.map((c2) => (
              <option key={c2.id} value={c2.id}>
                {c2.name}
              </option>
            ))}
          </MillingSelect>
        }
      />

      {/* tabs */}
      <div className="mb-4 flex gap-1.5 rounded-full border border-border/70 bg-surface/80 p-1">
        {(
          [
            { id: "physical", label: "كشف الأمانات العيني", icon: Scale },
            { id: "financial", label: "كشف أجور الطحن المالي", icon: Wallet },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition",
              tab === t.id
                ? "bg-amber-500 text-white shadow-sm"
                : "text-muted-foreground hover:bg-surface-2/60",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "physical" ? (
        <PhysicalStatement custody={c} balances={balances ?? []} />
      ) : (
        <FinancialStatement
          totals={totals}
          rows={filteredMoney}
          query={query}
          onQuery={setQuery}
          customerName={customerName}
        />
      )}
    </ModuleGuard>
  );
}

/* --------------------------------------------------------- physical tab */

function PhysicalStatement({
  custody,
  balances,
}: {
  custody: CustomerCustodyRow | null;
  balances: OutputBalanceRow[];
}) {
  if (!custody) {
    return (
      <MillingPanel>
        <MillingEmpty
          title="لا توجد حركة أمانات لهذا العميل"
          description="سيظهر الكشف فور تسجيل أول سند استلام له."
        />
      </MillingPanel>
    );
  }

  const rows = [
    {
      label: "وارد حبوب",
      bags: custody.received_bags,
      kg: custody.received_kg,
      tone: "slate" as const,
    },
    { label: "مطحون", bags: custody.milled_bags, kg: custody.milled_kg, tone: "sky" as const },
    {
      label: "ناتج دقيق ونخالة",
      bags: custody.produced_bags,
      kg: custody.produced_kg,
      tone: "amber" as const,
    },
    {
      label: "مسلّم للعميل",
      bags: custody.delivered_bags,
      kg: custody.delivered_kg,
      tone: "emerald" as const,
    },
    {
      label: "متبقٍ في الصوامع والمستودع",
      bags: custody.produced_bags - custody.delivered_bags,
      kg: Math.max(custody.produced_kg - custody.delivered_kg, 0),
      tone: "amber" as const,
      strong: true,
    },
  ];

  return (
    <div className="space-y-4">
      <MillingPanel>
        <MillingSectionTitle
          icon={<Wheat className="h-4 w-4" />}
          title="حركة الأمانات العينية"
          subtitle="أكياس وأطنان — لا يظهر هنا أي رقم مالي إطلاقاً"
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-start font-medium">البند</th>
                <th className="px-4 py-2.5 text-end font-medium">عدد الأكياس</th>
                <th className="px-4 py-2.5 text-end font-medium">الوزن (كجم)</th>
                <th className="px-4 py-2.5 text-end font-medium">بالأطنان</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.label}
                  className={cn(
                    "border-b border-border/50 last:border-0",
                    r.strong && "bg-amber-500/8",
                  )}
                >
                  <Cell>
                    <div className="flex items-center gap-2">
                      <Pill tone={r.tone}>&nbsp;</Pill>
                      <span className={r.strong ? "font-bold text-foreground" : ""}>{r.label}</span>
                    </div>
                  </Cell>
                  <Cell align="end">
                    <Mono className={r.strong ? "font-bold" : ""}>{nf(r.bags)}</Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono className={r.strong ? "font-bold" : ""}>{nf(r.kg)}</Mono>
                  </Cell>
                  <Cell align="end">
                    <Mono className={r.strong ? "font-bold" : ""}>{(r.kg / 1000).toFixed(3)}</Mono>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MillingPanel>

      {/* per-grade balances */}
      <MillingPanel>
        <MillingSectionTitle
          icon={<PackageCheck className="h-4 w-4" />}
          title="المتبقي حسب درجة الناتج"
          subtitle="ما يمكن تسليمه للعميل الآن، لكل صنف على حدة"
        />

        {balances.length === 0 ? (
          <MillingEmpty
            title="لا يوجد ناتج متبقٍ في الصوامع"
            description="كل نواتج هذا العميل سُلِّمت، أو لم يكتمل أي أمر طحن بعد."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-medium">الناتج</th>
                  <th className="px-4 py-2.5 text-end font-medium">سعة الكيس</th>
                  <th className="px-4 py-2.5 text-end font-medium">أكياس متبقية</th>
                  <th className="px-4 py-2.5 text-end font-medium">وزن متبقٍ</th>
                  <th className="px-4 py-2.5 text-end font-medium">بالأطنان</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr
                    key={`${b.output_type}-${b.bag_size_kg}`}
                    className="border-b border-border/50 last:border-0 hover:bg-surface-2/40"
                  >
                    <Cell>
                      <OutputBadge type={b.output_type} label={outputLabel(b.output_type)} />
                    </Cell>
                    <Cell align="end">
                      <Mono>{nf(b.bag_size_kg, 2)} كجم</Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono className="font-bold text-emerald-600 dark:text-emerald-400">
                        {nf(b.remaining_bags)}
                      </Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono>{nf(b.remaining_kg)}</Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono>{(b.remaining_kg / 1000).toFixed(3)}</Mono>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MillingPanel>
    </div>
  );
}

/* -------------------------------------------------------- financial tab */

function FinancialStatement({
  totals,
  rows,
  query,
  onQuery,
  customerName,
}: {
  totals: { count: number; billed: number; paid: number; outstanding: number };
  rows: ServiceMoneyRow[];
  query: string;
  onQuery: (v: string) => void;
  customerName: (id: string) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <MillingPanel className="p-4">
          <p className="text-[11px] text-muted-foreground">إجمالي أجور الطحن المفوترة</p>
          <Mono className="mt-1 block text-lg font-black">{money(totals.billed)}</Mono>
          <p className="mt-1 text-[11px] text-muted-foreground">{totals.count} فاتورة</p>
        </MillingPanel>
        <MillingPanel className="p-4">
          <p className="text-[11px] text-muted-foreground">المسدد</p>
          <Mono className="mt-1 block text-lg font-black text-emerald-600 dark:text-emerald-400">
            {money(totals.paid)}
          </Mono>
        </MillingPanel>
        <MillingPanel className="p-4">
          <p className="text-[11px] text-muted-foreground">المتبقي على العميل (أجور الطحن)</p>
          <Mono
            className={cn(
              "mt-1 block text-lg font-black",
              totals.outstanding > 0 ? "text-rose-600 dark:text-rose-400" : "",
            )}
          >
            {money(totals.outstanding)}
          </Mono>
        </MillingPanel>
      </div>

      <MillingPanel>
        <MillingSectionTitle
          icon={<Wallet className="h-4 w-4" />}
          title="فواتير أجور الطحن"
          subtitle="فواتير مبيعات عادية مرتبطة بأوامر الطحن — تستثنى مبيعات البضاعة"
          action={
            <div className="flex h-9 min-w-[220px] items-center gap-2 rounded-full border border-border/70 bg-surface-2/50 px-3">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => onQuery(e.target.value)}
                placeholder="ابحث برقم الفاتورة أو الأمر…"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          }
        />

        {rows.length === 0 ? (
          <MillingEmpty
            title="لا توجد فواتير أجور طحن"
            description="ستظهر هنا فور إصدار فاتورة أجور من شاشة صالة التشغيل."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-medium">الفاتورة</th>
                  <th className="px-4 py-2.5 text-start font-medium">أمر الطحن</th>
                  <th className="px-4 py-2.5 text-start font-medium">العميل</th>
                  <th className="px-4 py-2.5 text-start font-medium">الحالة</th>
                  <th className="px-4 py-2.5 text-end font-medium">الإجمالي</th>
                  <th className="px-4 py-2.5 text-end font-medium">المدفوع</th>
                  <th className="px-4 py-2.5 text-end font-medium">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.invoice_id}
                    className="border-b border-border/50 last:border-0 hover:bg-surface-2/40"
                  >
                    <Cell>
                      <Mono className="font-bold">{r.invoice_number}</Mono>
                    </Cell>
                    <Cell>
                      <Mono className="text-muted-foreground">{r.job_number}</Mono>
                    </Cell>
                    <Cell>
                      <span className="text-xs">{customerName(r.customer_id)}</span>
                    </Cell>
                    <Cell>
                      <span className="text-xs">{r.status}</span>
                    </Cell>
                    <Cell align="end">
                      <Mono className="font-bold">{money(r.total)}</Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono className="text-emerald-600 dark:text-emerald-400">
                        {money(r.paid)}
                      </Mono>
                    </Cell>
                    <Cell align="end">
                      <Mono
                        className={cn(
                          Number(r.outstanding) > 0 && "font-bold text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {money(r.outstanding)}
                      </Mono>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border/60 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <Users className="h-3.5 w-3.5 shrink-0" />
          هذه الفواتير فواتير مبيعات قياسية، فتظهر أيضاً في المبيعات والذمم وميزان المراجعة بشكل
          طبيعي — بدون أي معالجة خاصة.
        </div>
      </MillingPanel>
    </div>
  );
}
