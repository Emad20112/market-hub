import React from 'react';
import type { ReportDefinition } from '@/lib/reports/types';
import { DetailedTableTemplate } from './templates/detailed-table-template';
import { GroupedRankingTemplate } from './templates/grouped-ranking-template';
import { MovementStatementTemplate } from './templates/movement-statement-template';
import { SummaryTemplate } from './templates/summary-template';
import { ComparisonTemplate } from './templates/comparison-template';
import { StatusExceptionsTemplate } from './templates/status-exceptions-template';

interface ReportTemplateRendererProps {
  definition: ReportDefinition;
}

/** نقطة العرض الوحيدة؛ يحدد تعريف التقرير القالب وليس مسار الصفحة. */
export function ReportTemplateRenderer({ definition }: ReportTemplateRendererProps) {
  switch (definition.viewTemplate) {
    case 'grouped_ranking':
      return <GroupedRankingTemplate definition={definition} />;
    case 'movement_statement':
      return <MovementStatementTemplate definition={definition} />;
    case 'summary':
      return <SummaryTemplate definition={definition} />;
    case 'comparison':
      return <ComparisonTemplate definition={definition} />;
    case 'status_exceptions':
      return <StatusExceptionsTemplate definition={definition} />;
    case 'detailed_table':
    default:
      return <DetailedTableTemplate definition={definition} />;
  }
}
