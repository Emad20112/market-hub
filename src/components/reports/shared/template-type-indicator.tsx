import React from "react";
import {
  BarChart3,
  Table2,
  GitBranch,
  LineChart,
  ArrowLeftRight,
  ShieldAlert,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import type { ReportViewTemplateType } from "@/lib/reports/types";

interface TemplateTypeIndicatorProps {
  currentTemplate?: ReportViewTemplateType;
}

const TEMPLATE_MODES: {
  id: ReportViewTemplateType | "custom_1" | "custom_2";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}[] = [
  { id: "summary", icon: BarChart3, label: "الملخص اليومي والمؤشرات" },
  { id: "detailed_table", icon: Table2, label: "جدول كشف تفصيلي" },
  { id: "movement_statement", icon: GitBranch, label: "كشف حركة تسلسلي" },
  { id: "grouped_ranking", icon: LineChart, label: "تحليل وتجميع تصنيفي" },
  { id: "comparison", icon: ArrowLeftRight, label: "مقارنة فترات وأداء" },
  { id: "status_exceptions", icon: ShieldAlert, label: "استثناءات وفروقات" },
  { id: "custom_1", icon: Layers, label: "مصفوفة البيانات" },
  { id: "custom_2", icon: FileSpreadsheet, label: "عرض السجلات الكامل" },
];

export function TemplateTypeIndicator({ currentTemplate = "summary" }: TemplateTypeIndicatorProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-cyan-500/40 bg-slate-900/80 p-1 shadow-xs backdrop-blur-sm">
      {TEMPLATE_MODES.map((item) => {
        const isActive = item.id === currentTemplate;
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            title={item.label}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${
              isActive
                ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/50 shadow-sm shadow-amber-500/20"
                : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>
        );
      })}
    </div>
  );
}
