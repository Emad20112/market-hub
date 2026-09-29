import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw, Home, ShieldCheck, ChevronDown } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { I18nProvider } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";
import { ModulesProvider } from "@/lib/modules";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 selection:bg-primary/20">
      <div className="max-w-md w-full p-8 text-center rounded-3xl border border-border/80 bg-card/60 backdrop-blur-xl shadow-2xl space-y-4">
        <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-muted/70 text-foreground border border-border/60 shadow-inner">
          <span className="text-2xl font-black font-mono">404</span>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-black tracking-tight text-foreground">الصفحة غير موجودة</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            الرابط الذي تحاول الوصول إليه غير موجود أو تم نقله لمكان آخر.
          </p>
        </div>
        <div className="pt-2">
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-foreground text-background px-6 text-xs font-bold shadow-md hover:opacity-95 transition"
          >
            <Home className="size-4" />
            <span>العودة للرئيسية</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 selection:bg-primary/20" dir="rtl">
      <div className="max-w-lg w-full p-6 sm:p-8 rounded-3xl border border-border/80 bg-card/80 backdrop-blur-2xl shadow-2xl space-y-6 text-center">
        {/* Reassuring Security Icon */}
        <div className="mx-auto relative">
          <div className="size-16 mx-auto grid place-items-center rounded-3xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-md">
            <ShieldCheck className="size-8" />
          </div>
          <div className="absolute -bottom-1 -right-1 sm:right-36 size-6 rounded-full bg-primary/20 border border-primary/40 grid place-items-center">
            <span className="size-2 rounded-full bg-primary animate-pulse" />
          </div>
        </div>

        {/* Reassuring Text */}
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
            تعثّر مؤقت في تحميل الواجهة
          </h1>
          <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground max-w-md mx-auto">
            لا تقلق، <strong className="text-foreground font-bold">بياناتك وعملياتك وسجلاتك المالية بأمان تام</strong> في قاعدة البيانات. حدث تعثر بسيط أثناء تجهيز عرض الصفحة، ويمكنك المتابعة بسهولة.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="w-full sm:w-auto h-12 px-6 rounded-2xl bg-foreground text-background font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-foreground/10 hover:opacity-95 active:scale-98 transition cursor-pointer"
          >
            <RotateCcw className="size-4" />
            <span>إعادة المحاولة وتحديث الصفحة</span>
          </button>

          <a
            href="/"
            className="w-full sm:w-auto h-12 px-6 rounded-2xl border border-border bg-card text-foreground font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-muted active:scale-98 transition"
          >
            <Home className="size-4" />
            <span>العودة للوحة التحكم الرئيسية</span>
          </a>
        </div>

        {/* Technical Details for Support (Collapsible) */}
        <div className="pt-2 border-t border-border/50 text-right">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between text-[11px] font-bold text-muted-foreground hover:text-foreground py-1 transition cursor-pointer"
          >
            <span>التفاصيل التقنية (للدعم الفني)</span>
            <ChevronDown className={`size-3.5 transition-transform ${showDetails ? "rotate-180" : ""}`} />
          </button>

          {showDetails && (
            <div className="mt-2 p-3 rounded-2xl bg-muted/50 border border-border/50 font-mono text-[11px] text-foreground/80 overflow-x-auto text-left dir-ltr max-h-40">
              <div className="font-bold text-rose-500 mb-1">{error.name}: {error.message}</div>
              {error.stack && <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap">{error.stack}</pre>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "فورتيكس ERP - منصة البيع بالجملة والتجزئة" },
      {
        name: "description",
        content:
          "نظام ERP متكامل لإدارة المبيعات، المشتريات، المخزون، نقاط البيع، والمالية في منصة واحدة.",
      },
      { name: "author", content: "Inama Soft" },
      { name: "theme-color", content: "#0A0A0B" },
      { property: "og:title", content: "فورتيكس ERP - منصة البيع بالجملة والتجزئة" },
      {
        property: "og:description",
        content:
          "نظام ERP متكامل لإدارة المبيعات، المشتريات، المخزون، نقاط البيع، والمالية في منصة واحدة.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://market-hub-two-theta.vercel.app/" },
      { property: "og:site_name", content: "Vortex ERP" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "فورتيكس ERP - منصة البيع بالجملة والتجزئة" },
      {
        name: "twitter:description",
        content:
          "نظام ERP متكامل لإدارة المبيعات، المشتريات، المخزون، نقاط البيع، والمالية في منصة واحدة.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/140ea316-e570-4ca2-bfbb-ac4e2ba79f9b",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/140ea316-e570-4ca2-bfbb-ac4e2ba79f9b",
      },
    ],
    links: [
      { rel: "canonical", href: "https://market-hub-two-theta.vercel.app/" },
      { rel: "icon", type: "image/png", href: "/vortex-erp-mark.png" },
      { rel: "apple-touch-icon", href: "/vortex-erp-mark.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <ModulesProvider>
            <Outlet />
            <Toaster />
          </ModulesProvider>
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
