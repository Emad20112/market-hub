import { useState, useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  Sparkles,
  Layers,
  Boxes,
  Truck,
  ArrowLeftRight,
  SlidersHorizontal,
  ShoppingCart,
  Receipt,
  CreditCard,
  Wheat,
  Scale,
  Building2,
  Phone,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  BadgeCheck,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function VortexWelcomeOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const location = useLocation();

  const path = location.pathname.replace(/\/+$/, "") || "/";
  const isAppRoute =
    path !== "/" &&
    !/^\/(login|register|forgot-password|reset-password|verify|auth|404|500)/.test(path);

  useEffect(() => {
    if (!isAppRoute) {
      setOpen(false);
      return;
    }
    let seen = false;
    try {
      seen = localStorage.getItem("vortex_welcome_seen") === "true";
    } catch {
      return;
    }
    if (seen) return;
    const timer = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(timer);
  }, [isAppRoute]);

  const handleFinish = () => {
    try {
      localStorage.setItem("vortex_welcome_seen", "true");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open || !isAppRoute) return null;

  const steps = [
    {
      id: "overview",
      badge: "نظام الجيل الجديد",
      badgeColor: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      title: "أهلاً بك في فورتكس ERP",
      subtitle: "منظومة الأعمال الشاملة لإدارة المؤسسات والمطاحن",
      description:
        "نظام ذكي متكامل مصمم خصيصاً لتنظيم المبيعات، المستودعات، الحسابات، وأمانات المطاحن بدقة فائقة وسرعة استثنائية.",
      cards: [
        {
          title: "مركز قيادة فوري",
          desc: "رؤية شاملة ومؤشرات أداء حية للسيولة والمبيعات والنشاط اليومي.",
          icon: Sparkles,
          color: "text-indigo-500 bg-indigo-500/10",
        },
        {
          title: "متعدد الفروع والمستودعات",
          desc: "عزل أمني تام وصلاحيات مرنة لفرق العمل والمستخدمين.",
          icon: Building2,
          color: "text-emerald-500 bg-emerald-500/10",
        },
        {
          title: "محرك محاسبي دقيق",
          desc: "قيود آلية متطابقة مع المعايير وميزان مراجعة وتقارير فورية.",
          icon: ShieldCheck,
          color: "text-violet-500 bg-violet-500/10",
        },
      ],
    },
    {
      id: "inventory",
      badge: "إدارة المخزون والتوريد",
      badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      title: "المخزون واللوجستيات الذكية",
      subtitle: "تحكم كامل بالمستودعات، الدفعات، والتحويلات",
      description:
        "تتبع كل قطعة وحركة بدقة؛ من الاستلام في المستودع حتى صرف البضاعة أو التسوية الجردية مع حماية التكلفة.",
      cards: [
        {
          title: "تعدد المستودعات والمواقع",
          desc: "إدارة غرف التخزين والصوامع مع ربط الحركات بالرصيد الفعلي.",
          icon: Boxes,
          color: "text-amber-500 bg-amber-500/10",
        },
        {
          title: "تتبع الدفعات وتواريخ الصلاحية",
          desc: "سياسات تسعير مرنة وتتبع تشغيلات الإنتاج والواردات.",
          icon: Layers,
          color: "text-orange-500 bg-orange-500/10",
        },
        {
          title: "التحويلات والتسويات الجردية",
          desc: "نقل سريع بين الفروع مع معالجة الفروقات الجردية آلياً.",
          icon: ArrowLeftRight,
          color: "text-blue-500 bg-blue-500/10",
        },
        {
          title: "تسويات المخزون (Settlements)",
          desc: "مطابقة الأرصدة الدفترية مع الجرد الفعلي بنقرة زر واحدة.",
          icon: SlidersHorizontal,
          color: "text-rose-500 bg-rose-500/10",
        },
      ],
    },
    {
      id: "sales",
      badge: "المبيعات والتحصيل",
      badgeColor: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      title: "المبيعات ونقاط البيع والتحصيل",
      subtitle: "سرعة في الكاشير ومتابعة صارمة لذمم العملاء",
      description:
        "شاشة بيع سريعة تدعم قارئ الباركود، مع كشوف حساب تفصيلية وسندات قبض إلكترونية تدعم المشاركة عبر واتساب.",
      cards: [
        {
          title: "نقطة بيع سريعة (POS)",
          desc: "إصدار فواتير بيع نقدية وآجلة بلمح البصر دون أي تعليق.",
          icon: ShoppingCart,
          color: "text-emerald-500 bg-emerald-500/10",
        },
        {
          title: "إدارة الديون والذمم",
          desc: "سقف ائتماني لكل عميل، وتنبيهات الاستحقاق لتفادي تعثر الديون.",
          icon: CreditCard,
          color: "text-purple-500 bg-purple-500/10",
        },
        {
          title: "سندات القبض والتحصيل",
          desc: "تسجيل الدفعات النقدية والبنكية وطباعة إيصالات متوافقة مع الهوية.",
          icon: Receipt,
          color: "text-teal-500 bg-teal-500/10",
        },
      ],
    },
    {
      id: "milling",
      badge: "قطاع المطاحن والأمانات",
      badgeColor: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      title: "منظومة المطاحن والأمانات المبسطة",
      subtitle: "إدارة متخصصة لطحن الأمانات وطحن المنشأة",
      description:
        "تذكرة استلام أمانات حبوب، أوزان القبان الصافية، اختيار الأكياس والطواحين، وتسليمات مرنة مع احتساب أجور الطحن تلقائياً.",
      cards: [
        {
          title: "تذاكر استلام الأمانات (Intake)",
          desc: "تسجيل حبوب العميل، الوزن الإجمالي والخصميات والكمية الصافية.",
          icon: Scale,
          color: "text-orange-500 bg-orange-500/10",
        },
        {
          title: "التسليم على دفعات أو دفعة واحدة",
          desc: "صرف الدقيق والردة مع احتساب تكلفة الأكياس وأجور الطحن بدقة.",
          icon: Wheat,
          color: "text-amber-500 bg-amber-500/10",
        },
        {
          title: "التحكم بالفهرسة وأصناف الحبوب",
          desc: "إدارة أنواع الحبوب ودرجاتها وأحجام الأكياس من شاشة الفهرس مباشرة.",
          icon: SlidersHorizontal,
          color: "text-emerald-500 bg-emerald-500/10",
        },
      ],
    },
    {
      id: "developer",
      badge: "التطوير والدعم الفني",
      badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      title: "إنما سوفت — شريكك التقني الموثوق",
      subtitle: "حلول برمجية متقدمة ودعم فني مكرس لنجاحك",
      description:
        "فريقنا جاهز دائماً لمساندتك وتقديم التحديثات المستمرة لتلبية تطلعات منشأتك وتطوير أعمالك باستمرار.",
      cards: [
        {
          title: "الجهة المطورة",
          desc: "إنما سوفت للحلول البرمجية الذكية (Inama Soft)",
          icon: BadgeCheck,
          color: "text-blue-500 bg-blue-500/10",
        },
        {
          title: "المسؤول المباشر والدعم الفني",
          desc: "منور جميل — دعم فني واستشارات متواصلة",
          icon: Phone,
          color: "text-emerald-500 bg-emerald-500/10",
        },
        {
          title: "رقم التواصل المباشر",
          desc: "+967 772 217 218 — اتصال وواتساب",
          icon: Phone,
          color: "text-purple-500 bg-purple-500/10",
        },
      ],
    },
  ];

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-background/80 backdrop-blur-md transition-all duration-300">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border/70 bg-card text-card-foreground shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header decoration */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-emerald-500" />

        {/* Close Button */}
        <button
          onClick={handleFinish}
          className="absolute top-4 left-4 z-10 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          aria-label="إغلاق"
        >
          <X className="size-5" />
        </button>

        {/* Body Container */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-5">
          {/* Badge & Title */}
          <div className="space-y-1.5 text-right">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
                current.badgeColor,
              )}
            >
              <Sparkles className="size-3.5" />
              {current.badge}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
              {current.title}
            </h2>
            <p className="text-xs sm:text-sm font-semibold text-primary">{current.subtitle}</p>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1">
              {current.description}
            </p>
          </div>

          {/* Feature Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {current.cards.map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={i}
                  className="group relative p-3.5 rounded-2xl border border-border/60 bg-muted/30 hover:bg-muted/60 transition-all text-right space-y-1.5 shadow-xs"
                >
                  <div className="flex items-center gap-2.5 justify-start flex-row-reverse">
                    <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {card.title}
                    </span>
                    <div className={cn("p-2 rounded-xl shrink-0", card.color)}>
                      <Icon className="size-4" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">{card.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Special contact box on last step */}
          {step === steps.length - 1 && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 text-right space-y-2">
              <div className="flex items-center justify-between text-xs sm:text-sm">
                <span className="text-muted-foreground font-medium">خط الدعم والخدمة:</span>
                <a
                  href="tel:+967772217218"
                  dir="ltr"
                  className="font-bold text-primary hover:underline text-sm sm:text-base font-mono"
                >
                  +967 772 217 218
                </a>
              </div>
              <p className="text-[11px] text-muted-foreground">
                نسعد بخدمتكم وتطوير مزايا النظام وفق متطلبات نشاطكم التجاري.
              </p>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 sm:px-7 sm:py-4 bg-muted/40 border-t border-border/60 flex items-center justify-between flex-row-reverse">
          <div className="flex items-center gap-2">
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
              >
                <span>التالي</span>
                <ChevronLeft className="size-4" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs sm:text-sm hover:bg-emerald-700 transition-all shadow-md shadow-emerald-600/25"
              >
                <CheckCircle2 className="size-4" />
                <span>ابدأ استخدام النظام</span>
              </button>
            )}

            {step > 0 && (
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="flex items-center gap-1 px-3 py-2 rounded-xl border border-border text-foreground font-medium text-xs sm:text-sm hover:bg-muted transition-colors"
              >
                <ChevronRight className="size-4" />
                <span>السابق</span>
              </button>
            )}
          </div>

          {/* Step Indicators */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                )}
                aria-label={`الخطوة ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
