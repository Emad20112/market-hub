"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface VortexMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  trend?: {
    value: string | number;
    direction?: "up" | "down" | "neutral";
    isPositive?: boolean;
    label?: string;
  };
  highlight?: boolean;
  currency?: string;
  badge?: string;
  className?: string;
  onClick?: () => void;
}

export function VortexMetricCard({
  title,
  value,
  subtitle,
  icon,
  iconClassName = "bg-primary/10 text-primary",
  trend,
  highlight = false,
  currency = "ر.س",
  badge,
  className,
  onClick,
}: VortexMetricCardProps) {
  const isClickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={cn(
        "group relative overflow-hidden rounded-3xl border bg-card p-4 sm:p-5 transition-all duration-200",
        highlight
          ? "border-primary/40 bg-gradient-to-br from-primary/5 via-card to-card shadow-lg shadow-primary/5"
          : "border-border/70 shadow-sm hover:border-border hover:shadow-md",
        isClickable && "cursor-pointer active:scale-[0.99]",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{title}</span>
            {badge && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                {badge}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 pt-0.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-foreground font-mono">
              {typeof value === "number" ? value.toLocaleString("ar-SA") : value}
            </span>
            {currency && (
              <span className="text-xs font-bold text-muted-foreground">{currency}</span>
            )}
          </div>
        </div>

        {icon && (
          <div
            className={cn(
              "grid size-11 place-items-center rounded-2xl shadow-sm transition-transform duration-200 group-hover:scale-105",
              iconClassName
            )}
          >
            {React.isValidElement(icon)
              ? icon
              : typeof icon === "function" || (typeof icon === "object" && icon !== null && "$$typeof" in icon)
              ? React.createElement(icon as React.ComponentType<{ className?: string }>, { className: "size-5" })
              : (icon as React.ReactNode)}
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-border/40">
          {trend ? (
            <div
              className={cn(
                "flex items-center gap-1 font-bold text-[11px]",
                (trend.direction === "up" || trend.isPositive === true)
                  ? "text-emerald-600 dark:text-emerald-400"
                  : (trend.direction === "down" || trend.isPositive === false)
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-muted-foreground"
              )}
            >
              {(trend.direction === "up" || trend.isPositive === true) && <TrendingUp className="size-3.5" />}
              {(trend.direction === "down" || trend.isPositive === false) && <TrendingDown className="size-3.5" />}
              {trend.direction === "neutral" && <Minus className="size-3.5" />}
              <span>{trend.value}</span>
              {trend.label && (
                <span className="font-normal text-muted-foreground">({trend.label})</span>
              )}
            </div>
          ) : (
            <div />
          )}

          {subtitle && (
            <span className="text-[11px] text-muted-foreground font-medium">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
