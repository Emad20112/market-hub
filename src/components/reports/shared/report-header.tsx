import React from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ReportDefinition } from '@/lib/reports/types';

interface ReportHeaderProps {
  definition: ReportDefinition;
  costBasisNotice?: 'ACTUAL' | 'REFERENCE_ONLY' | 'MIXED';
  loading?: boolean;
  onRefresh?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
}

export function ReportHeader({
  definition,
  costBasisNotice,
  loading = false,
  onRefresh,
  onPrint,
  onExport,
}: ReportHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-border bg-card/40 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            {definition.titleAr}
          </h1>
          <span className="text-xs text-muted-foreground font-mono">
            ({definition.titleEn})
          </span>
          {costBasisNotice === 'ACTUAL' && (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-[10px]">
              <ShieldCheck className="h-3 w-3" />
              تكلفة محققة (Actual Cost)
            </Badge>
          )}
          {costBasisNotice === 'REFERENCE_ONLY' && (
            <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 text-[10px]">
              <ShieldAlert className="h-3 w-3" />
              تكلفة استرشادية (Reference Only)
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {definition.descriptionAr}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        )}
        {onPrint && (
          <Button
            variant="outline"
            size="sm"
            onClick={onPrint}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <Printer className="h-3.5 w-3.5" />
            طباعة
          </Button>
        )}
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            تصدير
          </Button>
        )}
      </div>
    </div>
  );
}
