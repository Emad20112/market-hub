import { ReportTemplateSelector } from "./report-template-selector";
import { ReportTemplateCreatorDialog } from "./report-template-creator-dialog";
import { ReportColumnVisibilityButton } from "./report-column-visibility-button";
import type { ReportDomain } from "@/lib/reports/types";
import type { CustomReportTemplate } from "@/lib/reports/custom-templates-store";

interface ReportViewControlsBarProps {
  currentDomain: ReportDomain;
  activeReportId?: string;
  onSelectReport: (reportId: string) => void;
  onOpenColumnPicker?: () => void;
  visibleColumnsCount?: number;
  totalColumnsCount?: number;
  customTemplates?: CustomReportTemplate[];
  onCustomTemplatesChange?: () => void;
  className?: string;
}

export function ReportViewControlsBar({
  currentDomain,
  activeReportId,
  onSelectReport,
  onOpenColumnPicker,
  visibleColumnsCount,
  totalColumnsCount,
  customTemplates,
  onCustomTemplatesChange,
  className,
}: ReportViewControlsBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-xs ${className || ""}`}
    >
      {/* 1. مكون اختيار نوع القالب بقائمة منسدلة */}
      <ReportTemplateSelector
        currentDomain={currentDomain}
        activeReportId={activeReportId}
        onSelectReport={onSelectReport}
        customTemplates={customTemplates}
        onCustomTemplatesChange={onCustomTemplatesChange}
      />

      {/* 2. مكون إنشاء وتصميم قالب جديد */}
      <ReportTemplateCreatorDialog
        currentDomain={currentDomain}
        activeReportId={activeReportId}
        onTemplateCreated={(newId) => {
          onCustomTemplatesChange?.();
          onSelectReport(newId);
        }}
      />

      {/* 3. مكون ظهور وتخصيص الأعمدة بجانب اختيار القالب وإنشاء القالب */}
      {onOpenColumnPicker && (
        <ReportColumnVisibilityButton
          onClick={onOpenColumnPicker}
          visibleCount={visibleColumnsCount}
          totalCount={totalColumnsCount}
        />
      )}
    </div>
  );
}
