import React from "react";
import { Link } from "@tanstack/react-router";
import { TrendingUp, Package, Truck, Users, Building2, ShieldAlert } from "lucide-react";
import type { ReportDomain } from "@/lib/reports/types";
import { ReportRegistry } from "@/lib/reports/registry";

interface DomainReportShellProps {
  currentDomain: ReportDomain;
  activeReportId?: string;
  onSelectReport?: (reportId: string) => void;
  children: React.ReactNode;
}

export const REPORT_DOMAINS_CONFIG: {
  id: ReportDomain;
  path: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  {
    id: "sales",
    path: "/reports/sales",
    titleAr: "المبيعات ونقاط البيع",
    titleEn: "Sales & POS",
    descriptionAr: "تحليل المبيعات، أرباح الأصناف، أداء الكاشير، ومزيج طرق السداد",
    icon: TrendingUp,
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    id: "inventory",
    path: "/reports/inventory",
    titleAr: "المخزون وحركة الأصناف",
    titleEn: "Stock & Inventory",
    descriptionAr: "بطاقات حركة الأصناف، الرصيد المتسلسل، بضاعة أوشكت على النفاد، والتقييم",
    icon: Package,
    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  },
  {
    id: "purchases",
    path: "/reports/purchases",
    titleAr: "المشتريات والتوريد",
    titleEn: "Purchases & Procurement",
    descriptionAr: "سجل فواتير الشراء، مشتريات الموردين، وتكاليف مدخلات البضائع",
    icon: Truck,
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
  {
    id: "customers",
    path: "/reports/customers",
    titleAr: "العملاء والتحصيل",
    titleEn: "Customers & Collections",
    descriptionAr: "كشوف مبيعات العملاء، نسب التحصيل الفوري، ومتابعة السدادات التشغيلية",
    icon: Users,
    color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
  },
  {
    id: "suppliers",
    path: "/reports/suppliers",
    titleAr: "الموردين والالتزامات",
    titleEn: "Suppliers & Payables",
    descriptionAr: "مستحقات التوريد، التزامات الفواتير المؤكدة، ومطابقات حسابات الموردين",
    icon: Building2,
    color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
  },
  {
    id: "operations_audit",
    path: "/reports/operations-audit",
    titleAr: "الرقابة والعمليات اليومية",
    titleEn: "Audit & Operations",
    descriptionAr: "مراجعة المرتجعات، الإلغاءات، سلامة الترحيل المحاسبي، وتدقيق العمليات",
    icon: ShieldAlert,
    color: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  },
];

export function DomainReportShell({
  currentDomain,
  activeReportId,
  onSelectReport,
  children,
}: DomainReportShellProps) {
  const currentDomainConfig = REPORT_DOMAINS_CONFIG.find((d) => d.id === currentDomain);
  // Preserve a useful fallback if an unregistered domain is opened.
  if (!currentDomainConfig) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <h1 className="text-base font-bold text-foreground">تعذر تحميل مجال التقارير</h1>
        <p className="mt-2 text-sm text-muted-foreground">أعد فتح المجال من القائمة الجانبية.</p>
      </div>
    );
  }

  const domainReports = ReportRegistry.getByDomain(currentDomain);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-0 animate-in fade-in duration-300">
      <nav
        aria-label={`تقارير ${currentDomainConfig.titleAr}`}
        className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-border bg-card/50 px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {domainReports.length > 0 ? (
          domainReports.map((report) => {
            const isSelected = activeReportId === report.id;
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => onSelectReport?.(report.id)}
                aria-current={isSelected ? "page" : undefined}
                aria-pressed={isSelected}
                className={`h-7 shrink-0 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {report.titleAr}
              </button>
            );
          })
        ) : (
          <span className="w-full py-1 text-center text-xs text-muted-foreground">
            لا توجد تقارير متاحة حالياً في هذا المجال
          </span>
        )}
      </nav>
      {/* مساحة عرض التقرير النشط */}
      <div className="w-full">{children}</div>
    </div>
  );
}
