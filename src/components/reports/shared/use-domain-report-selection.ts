import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { ReportRegistry } from '@/lib/reports/registry';
import type { ReportDomain } from '@/lib/reports/types';
import { REPORT_DOMAINS_CONFIG } from './domain-report-shell';

/** يحفظ التقرير النشط في الرابط كي لا تفتح كل بطاقات المركز التقرير الافتراضي. */
export function useDomainReportSelection(domain: ReportDomain, defaultReportId: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeReportId, setActiveReportId] = useState(defaultReportId);

  useEffect(() => {
    const requested = new URLSearchParams(location.searchStr ?? '').get('report');
    const requestedDefinition = requested ? ReportRegistry.get(requested) : undefined;
    setActiveReportId(
      requestedDefinition?.domain === domain ? requestedDefinition.id : defaultReportId
    );
  }, [location.searchStr, domain, defaultReportId]);

  const selectReport = (reportId: string) => {
    const definition = ReportRegistry.get(reportId);
    if (!definition || definition.domain !== domain) return;
    setActiveReportId(reportId);
    const path = REPORT_DOMAINS_CONFIG.find((entry) => entry.id === domain)?.path;
    if (!path) return;
    navigate({ to: path as never, search: { report: reportId } as never });
  };

  return { activeReportId, selectReport };
}
