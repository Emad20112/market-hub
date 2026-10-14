import React from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReportDefinition } from "@/lib/reports/types";

interface ReportHeaderProps {
  definition: ReportDefinition;
  companyName?: string;
  costBasisNotice?: "ACTUAL" | "REFERENCE_ONLY" | "MIXED";
  loading?: boolean;
  onRefresh?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
}

export function ReportHeader({
  definition,
  companyName,
  costBasisNotice,
}: ReportHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-cyan-950/40 bg-slate-900/60 px-4 py-2.5 backdrop-blur-xs">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-sm sm:text-base font-bold tracking-tight text-foreground">
          {definition.titleAr}
        </h1>
        <span className="text-[11px] text-muted-foreground font-mono">
          ({definition.titleEn})
        </span>

        {costBasisNotice === "ACTUAL" && (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] py-0"
          >
            <ShieldCheck className="h-3 w-3" />
            تكلفة محققة (Actual)
          </Badge>
        )}
        {costBasisNotice === "REFERENCE_ONLY" && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] py-0"
          >
            <ShieldAlert className="h-3 w-3" />
            تكلفة استرشادية
          </Badge>
        )}
      </div>

      {companyName && (
        <span className="text-xs text-cyan-300 font-semibold font-mono">
          {companyName}
        </span>
      )}
    </div>
  );
}
