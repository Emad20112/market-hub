import React from "react";
import {
  TrendingUp,
  Package,
  Truck,
  Users,
  Building2,
  ShieldAlert,
  Settings,
  User,
} from "lucide-react";
import type { ReportDomain } from "@/lib/reports/types";
import { ReportRegistry } from "@/lib/reports/registry";
import { Badge } from "@/components/ui/badge";
import { ReportTemplateSelector } from "./report-template-selector";
import { ReportTemplateCreatorDialog } from "./report-template-creator-dialog";

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
    titleAr: "تقارير المبيعات ونقاط البيع",
    titleEn: "Sales & POS",
    descriptionAr: "تحليل المبيعات، أرباح الأصناف، أداء الكاشير، ومزيج طرق السداد",
    icon: TrendingUp,
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    id: "inventory",
    path: "/reports/inventory",
    titleAr: "تقارير المخزون وحركة الأصناف",
    titleEn: "Stock & Inventory",
    descriptionAr: "بطاقات حركة الأصناف، الرصيد المتسلسل، بضاعة أوشكت على النفاد، والتقييم",
    icon: Package,
    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  },
  {
    id: "purchases",
    path: "/reports/purchases",
    titleAr: "تقارير المشتريات والتوريد",
    titleEn: "Purchases & Procurement",
    descriptionAr: "سجل فواتير الشراء، مشتريات الموردين، وتكاليف مدخلات البضائع",
    icon: Truck,
    color: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  },
  {
    id: "customers",
    path: "/reports/customers",
    titleAr: "تقارير العملاء والتحصيل",
    titleEn: "Customers & Collections",
    descriptionAr: "كشوف مبيعات العملاء، نسب التحصيل الفوري، ومتابعة السدادات التشغيلية",
    icon: Users,
    color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/20",
  },
  {
    id: "suppliers",
    path: "/reports/suppliers",
    titleAr: "تقارير الموردين والالتزامات",
    titleEn: "Suppliers & Payables",
    descriptionAr: "مستحقات التوريد، التزامات الفواتير المؤكدة، ومطابقات حسابات الموردين",
    icon: Building2,
    color: "text-purple-500 bg-purple-500/10 border-purple-500/20",
  },
  {
    id: "operations_audit",
    path: "/reports/operations-audit",
    titleAr: "تقارير الرقابة والعمليات اليومية",
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

  if (!currentDomainConfig) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <h1 className="text-base font-bold text-foreground">تعذر تحميل مجال التقارير</h1>
        <p className="mt-2 text-sm text-muted-foreground">أعد فتح المجال من القائمة الجانبية.</p>
      </div>
    );
  }

  const domainReports = ReportRegistry.getByDomain(currentDomain);
  const activeReport = domainReports.find((r) => r.id === activeReportId) || domainReports[0];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-2 sm:p-4 animate-in fade-in duration-200">
      {/* ── Top Bar: اسم النظام في اليمين وعنوان المجال والأزرار في اليسار بتنسيق النظام ── */}
      <div className="flex items-center justify-between border-b border-border pb-2.5 px-1">
        <div className="flex items-center gap-2">
          <span className="text-sm sm:text-base font-bold tracking-tight text-foreground font-mono">
            Vortex ERP
          </span>
          <Badge variant="secondary" className="text-[10px] py-0 font-normal">
            PRO
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {activeReport ? activeReport.titleAr : currentDomainConfig.titleAr}
            </span>
            <span className="text-muted-foreground font-medium text-xs hidden sm:inline">
              • {currentDomainConfig.titleAr}
            </span>
          </div>

          <div className="flex items-center gap-1 text-muted-foreground">
            <button
              type="button"
              className="rounded-lg p-1.5 hover:bg-muted hover:text-foreground transition-colors"
              title="الإعدادات"
            >
              <Settings className="h-4 w-4" />
            </button>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </div>
          </div>
        </div>
      </div>

      {/* ── شريط التنقل العلوي بالقوالب: قائمة منسدلة + إنشاء قالب جديد ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* زر القائمة المنسدلة لاختيار نوع القالب */}
          <ReportTemplateSelector
            currentDomain={currentDomain}
            activeReportId={activeReportId}
            onSelectReport={(reportId) => onSelectReport?.(reportId)}
          />

          {/* مكون إنشاء وتصميم قالب جديد */}
          <ReportTemplateCreatorDialog
            currentDomain={currentDomain}
            activeReportId={activeReportId}
            onTemplateCreated={(newId) => onSelectReport?.(newId)}
          />
        </div>
      </div>

      {/* ── مساحة عرض محتوى التقرير ── */}
      <div className="w-full">{children}</div>
    </div>
  );
}
