import React from 'react';
import type { ReportMetricDefinition } from '@/lib/reports/types';
import { Card, CardContent } from '@/components/ui/card';

interface ReportSummaryDeckProps {
  metricsDefinitions: ReportMetricDefinition[];
  metricsValues: Record<string, number>;
  currencySymbol?: string;
}

export function ReportSummaryDeck({
  metricsDefinitions,
  metricsValues,
  currencySymbol = 'ر.س',
}: ReportSummaryDeckProps) {
  if (!metricsDefinitions || metricsDefinitions.length === 0) return null;

  function formatValue(value: number | undefined, format: ReportMetricDefinition['format']) {
    if (value === undefined || value === null || isNaN(value)) return '—';

    switch (format) {
      case 'money':
        return `${Number(value).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${currencySymbol}`;
      case 'quantity':
        return Number(value).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        });
      case 'percentage':
        return `${Number(value).toFixed(2)}%`;
      case 'integer':
        return Number(value).toLocaleString('en-US');
      default:
        return String(value);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 bg-muted/20 border-b border-border">
      {metricsDefinitions.map((metric) => {
        const val = metricsValues[metric.key];
        const isPositiveProfit = metric.key.toLowerCase().includes('margin') && (val ?? 0) > 0;
        const isNegativeProfit = metric.key.toLowerCase().includes('margin') && (val ?? 0) < 0;

        return (
          <Card
            key={metric.key}
            className="border-border/60 bg-card/60 shadow-xs hover:border-primary/40 transition-colors"
          >
            <CardContent className="p-3">
              <div className="text-[11px] font-medium text-muted-foreground truncate">
                {metric.labelAr}
              </div>
              <div
                className={`mt-1 text-sm sm:text-base font-bold font-mono tracking-tight truncate ${
                  isPositiveProfit
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isNegativeProfit
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-foreground'
                }`}
                title={metric.descriptionAr || metric.calculationRuleAr}
              >
                {formatValue(val, metric.format)}
              </div>
              {metric.calculationRuleAr && (
                <div className="mt-1 text-[9px] text-muted-foreground/80 truncate">
                  {metric.calculationRuleAr}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
