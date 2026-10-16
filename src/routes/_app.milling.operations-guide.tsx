/**
 * /milling/operations-guide — دليل عمليات المطحنة (داخل النظام).
 *
 * مرآة مختصرة لـ docs/milling/03_دليل_التشغيل_لصاحب_المطحنة.md — بلغة
 * المشغّل: شاشة، إجراء، نتيجة، وقاعدة لا تُكسر. كل مسار في الدليل موجود فعلاً.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  CheckCircle2,
  Cog,
  PackageMinus,
  PackagePlus,
  Receipt,
  Truck,
  Wheat,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ModuleGuard } from "@/lib/modules";

export const Route = createFileRoute("/_app/milling/operations-guide")({
  head: () => ({ meta: [{ title: "دليل عمليات المطحنة — فورتكس ERP" }] }),
  component: MillingOperationsGuide,
});

type Step = { screen: string; to: string; action: string; result: string };

const flows: {
  title: string;
  icon: typeof Wheat;
  tone: string;
  purpose: string;
  steps: Step[];
  rule: string;
}[] = [
  {
    title: "1. طحن حبوب العميل للغير (الأمانات)",
    icon: Wheat,
    tone: "amber",
    purpose: "العميل يملك الحبوب والنواتج؛ المطحنة تبيع خدمة الطحن فقط. صفر أثر على مخزون المطحنة.",
    steps: [
      {
        screen: "استلام الأمانات",
        to: "/milling/intake",
        action: "اختر العميل والمخزن وصنف الحبوب، ثم اكتب عدد الأكياس و/أو الوزن بالكيلو.",
        result: "رصيد عيني باسم العميل — لا مخزون لك ولا فاتورة. سطر واحد في السجل.",
      },
      {
        screen: "الطحن",
        to: "/milling/milling",
        action:
          "اختر الحبوب من رصيد العميل، وأدخل النواتج: سطر لكل ناتج (دقيق/نخالة/سميد) بالأكياس والكيلو.",
        result:
          "حبوبه نقصت ونواتجه زادت في رصيده. الفاقد يُكتشف تلقائياً في الكشف — لا حقل إدخال له.",
      },
      {
        screen: "المبيعات (فاتورة الأجور)",
        to: "/sales",
        action:
          "فاتورة عادية ببند واحد «أجور طحن وتجهيز» — سعرها محفوظ على الصنف نفسه. ثم اربطها من الكشف.",
        result: "إيراد خدمات منفصل عن مبيعات البضاعة + ذمة على العميل إن لم يدفع.",
      },
      {
        screen: "تسليم النواتج",
        to: "/milling/delivery",
        action: "اختر ما يبقى باسمه وسجّل المسلَّم — جزئي أو كامل.",
        result: "يخفض رصيد أمانات العميل فقط. النظام يرفض تسليم أكثر من المتبقي.",
      },
    ],
    rule: "لا تسجل قمح العميل أو دقيقه كمخزون أو كمبيعات للمطحنة — أبداً.",
  },
  {
    title: "2. قمح المطحنة الخاص (شراء وتصنيع وبيع)",
    icon: Cog,
    tone: "sky",
    purpose: "المطحنة تملك القمح والدقيق؛ كل حركة تؤثر في المخزون والتكلفة والربح.",
    steps: [
      {
        screen: "المشتريات",
        to: "/purchase-pos",
        action:
          "فاتورة توريد عادية: المورد + الكمية + التكلفة. القمح يدخل مخزونك بتكلفته الحقيقية.",
        result: "مخزون قمح صحيح وذمة مورد عند الشراء الآجل.",
      },
      {
        screen: "التصنيع الذكي",
        to: "/milling/manufacture",
        action:
          "وارد: كمية القمح المطحون. صادر: سطر لكل ناتج (دقيق/نخالة) بالكيلو. التكلفة توزَّع آلياً حسب أسعار البيع النسبية.",
        result:
          "القمح يُنقص من مخزونك، والنواتج تدخل بتكلفة فعلية موزعة — فربحك عند البيع حقيقي لا وهمي.",
      },
      {
        screen: "المبيعات أو نقطة البيع",
        to: "/sales",
        action: "بيع الدقيق والنخالة كأي بضاعة.",
        result: "خصم من المخزون + إيراد + تكلفة مبيعات محسوبة تلقائياً.",
      },
    ],
    rule: "لا تستخدم مسار أمانات العميل لقمحك أنت — المسار البضاعة منفصل تماماً.",
  },
  {
    title: "3. المستهلكات (أكياس، خيط، زيت)",
    icon: PackageMinus,
    tone: "violet",
    purpose: "تُشترى كأصناف وتُصرف من مخزن المستهلكات — الرصيد لا يكذب.",
    steps: [
      {
        screen: "المشتريات",
        to: "/purchase-pos",
        action: "فاتورة توريد عادية لأصناف المستهلكات.",
        result: "تدخل مخزن المستهلكات كميات حقيقية.",
      },
      {
        screen: "صرف مستهلكات داخلي",
        to: "/milling/consumables",
        action: "سطر لكل مستهلك استُخدم: صنف + كمية.",
        result: "تُنقص من مخزون المستهلكات فوراً — لا أرصدة وهمية.",
      },
    ],
    rule: "كل ما استُخدم فعلاً يُصرف يوم استخدامه — لا تراكم أرصدة وهمية.",
  },
  {
    title: "4. كشف العميل (نهاية اليوم أو أي وقت)",
    icon: Receipt,
    tone: "emerald",
    purpose: "كل أرقام العميل في شاشة واحدة: عيني ومالي، والفاقد المكتشف.",
    steps: [
      {
        screen: "كشف حساب الأمانات",
        to: "/milling/customer-statement",
        action: "تبويب عيني: استُلم/صادر/متبقٍ لكل عميل وصنف. تبويب مالي: فواتير الأجور وسدادها.",
        result: "لا حساب يدوي — كل الرقيم مشتقة من السجل. الفاقد المكتشف يظهر للمراجعة.",
      },
    ],
    rule: "المتبقي باسم العميل هو الحقيقة — لا رصيد مخزَّن يتخلف عن الواقع.",
  },
];

function MillingOperationsGuide() {
  return (
    <ModuleGuard moduleId="milling_operations">
      <div className="mx-auto max-w-5xl space-y-5 p-4">
        <PageHeader
          title="دليل عمليات المطحنة"
          subtitle="دورتان فقط: حبوب الغير (أمانات) وقمح المطحنة. كل ما عداها يدور حولهما."
        />

        {/* القاعدة الذهبية */}
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-300">
            <CheckCircle2 className="h-4 w-4" /> قبل أي تسجيل اسأل نفسك: الحبوب هذي مين؟
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong>العميل</strong> → استلام ← طحن ← تسليم (مسار الأمانات، صفر مخزون).{" "}
            <strong>المطحنة</strong> → مشتريات ← تصنيع ذكي ← بيع (مسار البضاعة، مخزون وتكلفة وربح).
          </p>
        </div>

        {/* الدورات */}
        {flows.map((flow) => (
          <div
            key={flow.title}
            className="rounded-2xl border border-border/70 bg-surface-1/80 p-5 shadow-sm"
          >
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <flow.icon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-foreground">{flow.title}</h2>
                <p className="text-xs text-muted-foreground">{flow.purpose}</p>
              </div>
            </div>

            <ol className="mt-4 space-y-3">
              {flow.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-xl border border-border/60 bg-surface-2/40 p-3"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/20 text-[11px] font-black text-amber-700 dark:text-amber-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground">{s.screen}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.action}</p>
                    <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ← {s.result}
                    </p>
                  </div>
                  {s.to && (
                    <Link
                      to={s.to}
                      className="shrink-0 self-center rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted"
                    >
                      افتح الشاشة
                    </Link>
                  )}
                </li>
              ))}
            </ol>

            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {flow.rule}
            </p>
          </div>
        ))}

        {/* للتوثيق الكامل */}
        <div className="rounded-2xl border border-border/70 bg-surface-1/80 p-4 text-center">
          <p className="text-xs text-muted-foreground">
            الدليل الكامل بلغة صاحب المطحنة — مع مصفوفة الأمان والأسئلة الشائعة — في
            <span className="mx-1 font-mono text-[11px] text-foreground">
              docs/milling/03_دليل_التشغيل_لصاحب_المطحنة.md
            </span>
          </p>
        </div>
      </div>
    </ModuleGuard>
  );
}
