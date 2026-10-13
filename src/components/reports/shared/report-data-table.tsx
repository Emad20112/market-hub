import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ReportColumnDefinition } from '@/lib/reports/types';

interface ReportDataTableProps {
  columns: ReportColumnDefinition[];
  rows: Record<string, any>[];
  columnVisibility?: Record<string, boolean>;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  currencySymbol?: string;
}

export function ReportDataTable({
  columns,
  rows,
  columnVisibility,
  sortField,
  sortOrder,
  onSort,
  currencySymbol = 'ر.س',
}: ReportDataTableProps) {
  // تصفية الأعمدة المرئية فقط
  const visibleColumns = columns.filter((col) => {
    if (col.essential) return true;
    if (columnVisibility && columnVisibility[col.key] !== undefined) {
      return columnVisibility[col.key];
    }
    return col.defaultVisible;
  });

  function formatCellValue(val: any, col: ReportColumnDefinition) {
    if (val === undefined || val === null || val === '') return '—';

    switch (col.dataType) {
      case 'money':
        return `${Number(val || 0).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${col.unit || currencySymbol}`;

      case 'quantity':
        return Number(val || 0).toLocaleString('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3,
        });

      case 'percentage':
        return `${Number(val || 0).toFixed(2)}%`;

      case 'code':
        return <span className="font-mono text-xs font-semibold">{String(val)}</span>;

      case 'status_badge':
        return (
          <Badge variant="secondary" className="font-medium text-[11px]">
            {String(val)}
          </Badge>
        );

      case 'datetime':
        try {
          const d = new Date(val);
          return d.toLocaleString('ar-SA', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch {
          return String(val);
        }

      case 'date':
        try {
          const d = new Date(val);
          return d.toLocaleDateString('ar-SA');
        } catch {
          return String(val);
        }

      default:
        return String(val);
    }
  }

  // احتساب السطر الختامي للإجماليات (Footer Aggregates)
  const hasAggregates = visibleColumns.some((col) => col.aggregate && col.aggregate !== 'none');

  function calculateAggregate(col: ReportColumnDefinition) {
    if (!col.aggregate || col.aggregate === 'none' || rows.length === 0) return '';

    if (col.aggregate === 'count') {
      return rows.length.toLocaleString('en-US');
    }

    let sum = 0;
    for (const r of rows) {
      sum += Number(r[col.key]) || 0;
    }

    if (col.aggregate === 'sum') {
      if (col.dataType === 'money') {
        return `${sum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} ${col.unit || currencySymbol}`;
      }
      return sum.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });
    }

    if (col.aggregate === 'avg') {
      const avg = sum / rows.length;
      return avg.toFixed(2);
    }

    return '';
  }

  return (
    <div className="relative w-full overflow-auto">
      <table className="w-full text-right text-xs border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
            {visibleColumns.map((col) => {
              const isSorted = sortField === col.key;
              const alignClass =
                col.align === 'left'
                  ? 'text-left'
                  : col.align === 'center'
                  ? 'text-center'
                  : 'text-right';

              return (
                <th
                  key={col.key}
                  onClick={() => onSort?.(col.key)}
                  className={`p-3 whitespace-nowrap select-none ${alignClass} ${
                    onSort ? 'cursor-pointer hover:text-foreground' : ''
                  }`}
                >
                  <div className={`inline-flex items-center gap-1.5 ${
                    col.align === 'left' ? 'flex-row-reverse' : ''
                  }`}>
                    <span>{col.labelAr}</span>
                    {onSort && (
                      <span className="text-muted-foreground/60">
                        {isSorted ? (
                          sortOrder === 'asc' ? (
                            <ArrowUp className="h-3 w-3 text-primary" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-primary" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row, rIdx) => (
            <tr
              key={row.id || row.invoice_item_id || row.invoice_id || rIdx}
              className="hover:bg-muted/30 transition-colors"
            >
              {visibleColumns.map((col) => {
                const alignClass =
                  col.align === 'left'
                    ? 'text-left font-mono'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-right';

                return (
                  <td key={col.key} className={`p-3 whitespace-nowrap ${alignClass}`}>
                    {formatCellValue(row[col.key], col)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {hasAggregates && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/50 font-bold text-foreground">
              {visibleColumns.map((col, idx) => {
                const alignClass =
                  col.align === 'left'
                    ? 'text-left font-mono'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-right';

                return (
                  <td key={col.key} className={`p-3 whitespace-nowrap ${alignClass}`}>
                    {idx === 0 && !col.aggregate
                      ? 'الإجمالي'
                      : calculateAggregate(col)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
