import React from "react";
import type { ReportDefinition } from "@/lib/reports/types";
import { DetailedTableTemplate } from "./templates/detailed-table-template";
import { GroupedRankingTemplate } from "./templates/grouped-ranking-template";
import { MovementStatementTemplate } from "./templates/movement-statement-template";
import { SummaryTemplate } from "./templates/summary-template";
import { ComparisonTemplate } from "./templates/comparison-template";
import { StatusExceptionsTemplate } from "./templates/status-exceptions-template";

interface ReportTemplateRendererProps {
  definition: ReportDefinition;
  onSelectReport?: (reportId: string) => void;
}

/** نقطة العرض الوحيدة؛ يحدد تعريف التقرير القالب المناسب. */
export function ReportTemplateRenderer({
  definition,
  onSelectReport,
}: ReportTemplateRendererProps) {
  switch (definition.viewTemplate) {
    case "grouped_ranking":
      return <GroupedRankingTemplate definition={definition} onSelectReport={onSelectReport} />;
    case "movement_statement":
      return <MovementStatementTemplate definition={definition} onSelectReport={onSelectReport} />;
    case "summary":
      return <SummaryTemplate definition={definition} onSelectReport={onSelectReport} />;
    case "comparison":
      return <ComparisonTemplate definition={definition} onSelectReport={onSelectReport} />;
    case "status_exceptions":
      return <StatusExceptionsTemplate definition={definition} onSelectReport={onSelectReport} />;
    case "detailed_table":
    default:
      return <DetailedTableTemplate definition={definition} onSelectReport={onSelectReport} />;
  }
}
