import React, { useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ltr-value";
import type { ReportColumnDefinition } from "@/lib/reports/types";

interface ReportDataTableProps {
  columns: ReportColumnDefinition[];
  rows: Record<string, any>[];
  columnVisibility?: Record<string, boolean>;
  sortField?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (field: string) => void;
  currencySymbol?: string;
  companyName?: string;
  loading?: boolean;
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const quantityFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function ReportDataTable({
  columns,
  rows,
  columnVisibility,
  sortField,
  sortOrder,
  onSort,
  currencySymbol = "ر.ي",
  companyName = "مؤسسة اليمامة التجارية",
  loading = false,
}: ReportDataTableProps) {
  const visibleColumns = useMemo(
    () =>
      columns.filter((col) => {
        if (col.essential) return true;
        if (columnVisibility && columnVisibility[col.key] !== undefined) {
          return columnVisibility[col.key];
        }
        return col.defaultVisible;
      }),
    [columns, columnVisibility],
  );

  function formatCellValue(val: any, col: ReportColumnDefinition) {
    if (val === undefined || val === null || val === "") return "—";

    switch (col.dataType) {
      case "money": {
        const unit = col.unit && col.unit !== "ر.س" ? col.unit : currencySymbol;
        return (
          <Ltr className="font-mono font-medium">
            {moneyFormatter.format(Number(val || 0))} {unit}
          </Ltr>
        );
      }
      case "quantity":
        return <Ltr className="font-mono">{quantityFormatter.format(Number(val || 0))}</Ltr>;
      case "percentage":
        return <Ltr className="font-mono font-semibold">{`${Number(val).toFixed(2)}%`}</Ltr>;
      case "integer":
        return <Ltr className="font-mono">{Number(val).toLocaleString("en-US")}</Ltr>;
      case "date":
        return (
          <Ltr className="text-muted-foreground text-xs">
            {new Date(val).toLocaleDateString("en-CA")}
          </Ltr>
        );
      case "datetime":
        return (
          <Ltr className="text-muted-foreground text-xs">
            {new Date(val).toLocaleString("ar-YE")}
          </Ltr>
        );
      case "badge":
        return (
          <Badge variant="outline" className="text-[10px] py-0 px-2 font-medium">
            {String(val)}
          </Badge>
        );
      default:
        return String(val);
    }
  }

  const hasAggregates = useMemo(
    () => visibleColumns.some((c) => Boolean(c.aggregate)),
    [visibleColumns],
  );

  function calculateAggregate(col: ReportColumnDefinition) {
    if (!col.aggregate) return "";

    const nums = rows.map((r) => Number(r[col.key] || 0)).filter((n) => !isNaN(n));
    if (nums.length === 0) return "0.00";

    if (col.aggregate === "sum") {
      const sum = nums.reduce((acc, curr) => acc + curr, 0);
      const unit = col.unit && col.unit !== "ر.س" ? col.unit : currencySymbol;
      return `${col.dataType === "money" ? moneyFormatter.format(sum) : quantityFormatter.format(sum)} ${
        col.dataType === "money" ? unit : ""
      }`;
    }

    if (col.aggregate === "avg") {
      const avg = nums.reduce((acc, curr) => acc + curr, 0) / nums.length;
      return `${moneyFormatter.format(avg)} (متوسط)`;
    }

    if (col.aggregate === "count") {
      return `${nums.length} سجل`;
    }

    return "";
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/90 shadow-xl shadow-cyan-950/20 backdrop-blur-md">
      {/* ── Table Top Bar: Detailed Data Table on Left, Company Name on Right (مطابق للموك أب) ── */}
      <div className="flex items-center justify-between border-b border-cyan-500/20 bg-slate-950/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 text-cyan-400" />
          <span className="text-xs sm:text-sm font-bold tracking-tight text-foreground font-mono">
            Detailed Data Table
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400 font-mono">
            {rows.length} rows
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cyan-400" />
          <span className="text-xs sm:text-sm font-bold text-cyan-300">
            {companyName}
          </span>
        </div>
      </div>

      {/* ── Responsive Table ── */}
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <table className="w-full text-xs text-right border-collapse">
          <thead>
            <tr className="border-b border-cyan-500/20 bg-slate-950/80 font-bold text-slate-300">
              {visibleColumns.map((col) => {
                const isSorted = sortField === col.key;
                const alignClass =
                  col.align === "left"
                    ? "text-left"
                    : col.align === "center"
                    ? "text-center"
                    : "text-right";

                return (
                  <th
                    key={col.key}
                    onClick={() => onSort?.(col.key)}
                    aria-sort={isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                    className={`py-3 px-3.5 whitespace-nowrap select-none ${alignClass} ${
                      onSort ? "cursor-pointer hover:text-cyan-300 transition-colors" : ""
                    }`}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === "left" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <span>{col.labelAr}</span>
                      {onSort && (
                        <span className="text-slate-500">
                          {isSorted ? (
                            sortOrder === "asc" ? (
                              <ArrowUp className="h-3 w-3 text-cyan-400" />
                            ) : (
                              <ArrowDown className="h-3 w-3 text-cyan-400" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60">
            {loading && rows.length === 0 && (
              Array.from({ length: 6 }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="animate-pulse">
                  {visibleColumns.map((column) => (
                    <td key={column.key} className="p-3">
                      <div className="h-4 min-w-20 rounded bg-slate-800/80" />
                    </td>
                  ))}
                </tr>
              ))
            )}

            {rows.map((row, rIdx) => (
              <tr
                key={row.id || row.invoice_item_id || row.invoice_id || rIdx}
                className="odd:bg-slate-900/40 even:bg-slate-950/40 hover:bg-cyan-950/20 transition-colors"
              >
                {visibleColumns.map((col) => {
                  const alignClass =
                    col.align === "left"
                      ? "text-left font-mono"
                      : col.align === "center"
                      ? "text-center"
                      : "text-right";

                  return (
                    <td key={col.key} className={`py-2.5 px-3.5 whitespace-nowrap tabular-nums ${alignClass}`}>
                      {formatCellValue(row[col.key], col)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>

          {hasAggregates && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-cyan-500/30 bg-slate-950 font-bold text-foreground">
                {visibleColumns.map((col, idx) => {
                  const alignClass =
                    col.align === "left"
                      ? "text-left font-mono"
                      : col.align === "center"
                      ? "text-center"
                      : "text-right";

                  return (
                    <td key={col.key} className={`py-3 px-3.5 whitespace-nowrap ${alignClass}`}>
                      {idx === 0 && !col.aggregate ? "الإجمالي" : calculateAggregate(col)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
