import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  CheckCircle2,
  Cog,
  PackagePlus,
  Receipt,
  Truck,
  Warehouse,
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
    title: "1. طحن حبوب العميل للغير",
    icon: Wheat,
    tone: "amber",
    purpose: "العميل يملك الحبوب والنواتج؛ المطحنة تبيع خدمة الطحن فقط.",
    steps: [
      {
        screen: "قبّان الميزان والاستلام",
        to: "/milling/intake",
        action: "اختر العميل، الصومعة، درجة الحبوب، عدد الأكياس والوزن القائم والفارغ.",
        result: "سند أمانات ووزن صافٍ؛ لا يدخل مخزون المطحنة.",
      },
      {
        screen: "صالة التشغيل وأوامر الطحن",
        to: "/milling/jobs",
        action:
          "أنشئ عقد الطحن مباشرة بعد الوزن: الناتج المطلوب، الأكياس، أساس السعر (كيس أو طن) والسعر المتفق عليه.",
        result: "يثبت السعر قبل التشغيل، ثم يفتح أمر طحن من العقد.",
      },
      {
        screen: "صالة التشغيل وأوامر الطحن",
        to: "/milling/jobs",
        action: "سجّل الدقيق والنخالة والفاقد الفعلي، ثم أقفل الأمر بعد مراجعة الكميات.",
        result: "يبقى الناتج أمانة للعميل ولا يتحول لبضاعة للمطحنة.",
      },
      {
        screen: "فاتورة أجور الطحن",
        to: "/milling/jobs",
        action:
          "من الأمر المقفل أصدر فاتورة الخدمة وحدد المدفوع أو الآجل. أضف الأكياس فقط إن وفرتها المطحنة.",
        result: "إيراد خدمة وذمة مالية منفصلة؛ فاتورة واحدة لكل أمر.",
      },
      {
        screen: "بوابة التسليم وإذن الخروج",
        to: "/milling/delivery",
        action: "اختر الناتج الجاهز، سجّل الكميات المسلّمة واطبع إذن الخروج للتوقيع.",
        result: "يخفض رصيد أمانات العميل فقط.",
      },
    ],
    rule: "لا تسجل قمح العميل أو دقيقه كمخزون أو كمبيعات للمطحنة.",
  },
  {
    title: "2. شراء قمح المطحنة وإنتاج وبيع منتجاتها",
    icon: Cog,
    tone: "sky",
    purpose: "المطحنة تملك القمح والدقيق؛ كل حركة تؤثر في المخزون والتكلفة والربح.",
    steps: [
      {
        screen: "نقطة المشتريات السريعة والتوريد",
        to: "/purchase-pos",
        action:
          "أنشئ المورد، اختر قمح المطحنة، أدخل الكمية والتكلفة وطريقة الدفع ثم احفظ فاتورة التوريد.",
        result: "يزيد مخزون القمح وتظهر ذمة المورد عند الشراء الآجل.",
      },
      {
        screen: "المخزون",
        to: "/inventory",
        action: "تحقق من استلام القمح في المستودع الصحيح قبل بدء أي إنتاج.",
        result: "رصيد خام صحيح وقابل للجرد.",
      },
      {
        screen: "تشغيل المطحنة",
        to: "/milling/jobs",
        action:
          "لا تستخدم مسار أمانات العميل لإنتاج المطحنة. سجّل إنتاج الشركة فقط عبر مسار الإنتاج المعتمد بعد تهيئته.",
        result: "خصم الخام وإضافة الدقيق والنخالة يجب أن يكونا بحركة مخزنية موثقة.",
      },
      {
        screen: "المبيعات أو نقطة البيع",
        to: "/sales",
        action: "بع الدقيق أو النخالة كأصناف مخزنية، واختر العميل والدفع والخصم ضمن الصلاحية.",
        result: "تُخصم البضاعة، وتُنشأ فاتورة وذمة العميل عند البيع الآجل.",
      },
    ],
    rule: "لا تخلط منتجات المطحنة مع نواتج عملاء الطحن؛ لكل منهما ملكية وتكلفة مختلفة.",
  },
  {
    title: "3. تخزين حبوب العميل للغير",
    icon: Warehouse,
    tone: "violet",
    purpose: "خدمة حفظ أمانات بلا طحن؛ العميل يبقى مالك الحبوب طوال المدة.",
    steps: [
      {
        screen: "قبّان الميزان والاستلام",
        to: "/milling/intake",
        action: "سجّل العميل والحبوب والوزن وموقع الصومعة، واطبع سند الاستلام.",
        result: "رصيد أمانة قابل للمراجعة.",
      },
      {
        screen: "كشف حساب الأمانات المزدوج",
        to: "/milling/customer-statement",
        action: "راجع الرصيد العيني دورياً مع جرد الصومعة، وسجل أي حركة فقط بسندها الصحيح.",
        result: "كشف عيني مستقل عن الذمة المالية.",
      },
      {
        screen: "بوابة التسليم وإذن الخروج",
        to: "/milling/delivery",
        action: "عند طلب العميل، سلّم الكمية فعلياً بإذن خروج موقع.",
        result: "يخفض الأمانة ولا ينشئ بيعاً.",
      },
    ],
    rule: "رسوم التخزين خدمة تُتفق وتفوتر بشكل مستقل؛ لا تحول الأمانة إلى مخزون تجاري.",
  },
];

function MillingOperationsGuide() {
  return (
    <ModuleGuard moduleId="milling_operations">
      <PageHeader
        title="دليل عمليات المطحنة"
        subtitle="خطوات تشغيلية متسلسلة: أين تدخل، ماذا تسجل، وما الأثر على المخزون والذمم."
      />
      <div className="mb-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm leading-7 text-muted-foreground">
        <BookOpen className="me-2 inline h-4 w-4 text-primary" />
        ابدأ دائماً بتحديد الملكية: <b className="text-foreground">
          هل الحبوب للمطحنة أم للعميل؟
        </b>{" "}
        هذا القرار يحدد الشاشة والمسار المحاسبي الصحيح.
      </div>
      <div className="space-y-5">
        {flows.map((flow) => {
          const Icon = flow.icon;
          return (
            <section
              key={flow.title}
              className="overflow-hidden rounded-2xl border border-border/70 bg-surface/80"
            >
              <header className="flex gap-3 border-b border-border/60 p-4">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <div>
                  <h2 className="font-bold text-foreground">{flow.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">{flow.purpose}</p>
                </div>
              </header>
              <ol className="divide-y divide-border/50">
                {flow.steps.map((step, index) => (
                  <li
                    key={`${flow.title}-${step.screen}-${index}`}
                    className="grid gap-3 p-4 sm:grid-cols-[2rem_13rem_1fr]"
                  >
                    <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-xs font-bold text-primary">
                      {index + 1}
                    </span>
                    <Link
                      to={step.to}
                      className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
                    >
                      <PackagePlus className="size-4" />
                      {step.screen}
                    </Link>
                    <div className="text-xs leading-6 text-muted-foreground">
                      <p>{step.action}</p>
                      <p className="mt-1 font-semibold text-foreground">
                        <CheckCircle2 className="me-1 inline size-3.5 text-emerald-500" />
                        النتيجة: {step.result}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <footer className="flex gap-2 bg-rose-500/5 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
                <Receipt className="size-4 shrink-0" />
                <b>قاعدة:</b> {flow.rule}
              </footer>
            </section>
          );
        })}
      </div>
      <section className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          ["يوميًا", "طابق أمانات العملاء مع الصوامع قبل إغلاق الدوام."],
          ["قبل الفوترة", "راجع أن الأمر مقفل وأن السعر من العقد وليس من تقدير جديد."],
          ["أسبوعيًا", "راجع تقارير الاستخلاص والفاقد وفواتير الخدمة غير المحصلة."],
        ].map(([title, body]) => (
          <div key={title} className="rounded-xl border border-border/70 bg-surface p-4">
            <h3 className="font-bold text-foreground">{title}</h3>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{body}</p>
          </div>
        ))}
      </section>
    </ModuleGuard>
  );
}
