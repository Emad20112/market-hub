import { useState, useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Layers, Phone, ShieldCheck, Sparkles, X } from "lucide-react";

/**
 * نافذة الترحيب.
 *
 * تُركّب في جذر الشجرة، فتظهر في كل صفحة — بما فيها تسجيل الدخول. وطبقتها
 * `bg-black/60` مع z-[99990] تمنع النقر عمّا تحتها، فكانت أوّل ما يراه الزائر
 * على شاشة الدخول حاجزاً أسود لا يمكن تجاوزه إلا بإغلاقه.
 *
 * ولا معنى لترحيب بـ«المبيعات والمخزون» لمن لم يسجّل دخوله بعد، فصارت
 * تظهر لأهل النظام فقط.
 */
export function VortexWelcomeOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const location = useLocation();

  // صفحات الدخول والأخطاء ليست «أهل النظام»: لا ترحيب فيها.
  // الجذر `/` يعرض صفحة الدخول لمن لم يسجّل، فلا يُعدّ جذراً داخلياً.
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
      // التخزين محظور: لا ترحيب، فموعد النافذة ليس سبباً لتعطيل الواجهة.
      return;
    }
    if (seen) return;
    // بعد شاشة البداية: أن تخرج طبقتان في الوقت نفسه يجعل الإغلاق يبدو عطلاً.
    const timer = setTimeout(() => setOpen(true), 2200);
    return () => clearTimeout(timer);
  }, [isAppRoute]);

  const handleFinish = () => {
    try {
      localStorage.setItem("vortex_welcome_seen", "true");
    } catch {
      /* لا شيء: الإغلاق هو المهم */
    }
    setOpen(false);
  };

  if (!open || !isAppRoute) return null;

  const steps = [
    {
      title: "مرحباً بك في فورتكس ERP",
      subtitle: "نظام إدارة الأعمال السحابي المتكامل",
      description:
        "منصة شاملة صُممت خصيصاً لإدارة المبيعات والمشتريات والمخزون ونقاط البيع السريعة بكل سلاسة وكفاءة عالية.",
      icon: <Sparkles className="size-8 text-primary" />,
    },
    {
      title: "إدارة دقيقة وفورية",
      subtitle: "متابعة المخزون والعمليات المالية",
      description:
        "تقارير محاسبية فورية، فواتير متوافقة، ومزامنة لحظية لحركات الصناديق والمستودعات لدعم قراراتك اليومية.",
      icon: <Layers className="size-8 text-emerald-500" />,
    },
    {
      title: "تطوير ودعم إنما سوفت",
      subtitle: "شريكك التقني الموثوق في اليمن",
      description:
        "تم تصميم وتطوير النظام بواسطة إنما سوفت مع دعم فني مستمر وتحديثات متواصلة.",
      extra: (
        <div className="mt-3 p-3.5 rounded-2xl bg-muted/60 border border-border/70 space-y-2 text-right">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">الجهة المطوّرة:</span>
            <span className="font-bold text-foreground">إنما سوفت (Inama Soft)</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">المطور المسؤول:</span>
            <span className="font-semibold text-foreground">موسى جميل العوضي</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">خدمة العملاء والدعم:</span>
            <a
              href="tel:+967772217218"
              className="font-bold font-mono text-primary hover:underline inline-flex items-center gap-1"
              dir="ltr"
            >
              <Phone className="size-3" />
              +967 772 217 218
            </a>
          </div>
        </div>
      ),
      icon: <ShieldCheck className="size-8 text-indigo-500" />,
    },
  ];

  const current = steps[step];

  return (
    <div
      className="fixed inset-0 z-[99990] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300"
      dir="rtl"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 sm:p-7 shadow-2xl space-y-6 text-center">
        <button
          type="button"
          onClick={handleFinish}
          className="absolute top-4 left-4 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/70 transition cursor-pointer"
          aria-label="تخطي"
        >
          <X className="size-4" />
        </button>

        <div className="mx-auto flex justify-center pt-2">
          <img
            src="/vortex-erp-wordmark.png"
            alt="Vortex ERP"
            className="h-12 w-auto object-contain"
          />
        </div>

        <div className="space-y-3">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-muted/60 border border-border/60 shadow-inner">
            {current.icon}
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-tight text-foreground">{current.title}</h3>
            <p className="text-xs font-semibold text-primary">{current.subtitle}</p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground px-2">{current.description}</p>
          {current.extra}
        </div>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2.5 pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="h-10 px-4 rounded-xl border border-border text-foreground font-semibold text-xs hover:bg-muted transition flex items-center gap-1 cursor-pointer"
            >
              <ChevronRight className="size-3.5" />
              <span>السابق</span>
            </button>
          ) : (
            <div />
          )}

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="h-10 px-5 rounded-xl bg-foreground text-background font-bold text-xs hover:opacity-90 transition flex items-center gap-1 shadow-md cursor-pointer mr-auto"
            >
              <span>التالي</span>
              <ChevronLeft className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="h-10 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-95 transition flex items-center gap-1.5 shadow-md shadow-primary/20 cursor-pointer mr-auto"
            >
              <Check className="size-3.5" />
              <span>ابدأ استخدام النظام</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
