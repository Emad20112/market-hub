import React from 'react';
import { Calendar, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ReportFilterDefinition } from '@/lib/reports/types';

interface ReportFiltersBarProps {
  filters: ReportFilterDefinition[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
  onOpenColumnPicker?: () => void;
}

export function ReportFiltersBar({
  filters,
  values,
  onChange,
  onReset,
  onOpenColumnPicker,
}: ReportFiltersBarProps) {
  const hasDateRange = filters.some((f) => f.controlType === 'date_range');
  const searchFilter = filters.find((f) => f.controlType === 'text_search');

  function handlePresetChange(preset: string) {
    const today = new Date();
    let start = '';
    let end = today.toISOString().split('T')[0];

    if (preset === 'today') {
      start = end;
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      start = y.toISOString().split('T')[0];
      end = start;
    } else if (preset === 'this_week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = d.toISOString().split('T')[0];
    } else if (preset === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = firstDay.toISOString().split('T')[0];
    } else if (preset === 'last_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      start = firstDay.toISOString().split('T')[0];
      end = lastDay.toISOString().split('T')[0];
    } else if (preset === 'all') {
      start = '';
      end = '';
    }

    onChange('startDate', start);
    onChange('endDate', end);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/20 p-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {hasDateRange && (
          <div className="flex items-center gap-1.5 bg-background/80 rounded-md border border-border px-2 py-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Select onValueChange={handlePresetChange} defaultValue="this_month">
              <SelectTrigger className="h-7 border-0 bg-transparent px-1 text-xs focus:ring-0 w-[110px]">
                <SelectValue placeholder="الفترة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">اليوم</SelectItem>
                <SelectItem value="yesterday">أمس</SelectItem>
                <SelectItem value="this_week">آخر 7 أيام</SelectItem>
                <SelectItem value="this_month">الشهر الحالي</SelectItem>
                <SelectItem value="last_month">الشهر السابق</SelectItem>
                <SelectItem value="all">كل الفترات</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1 border-r border-border pr-1">
              <input
                type="date"
                value={values.startDate || ''}
                onChange={(e) => onChange('startDate', e.target.value)}
                className="h-6 w-28 rounded bg-transparent px-1 text-[11px] text-foreground focus:outline-hidden"
                placeholder="من"
              />
              <span className="text-[10px] text-muted-foreground">—</span>
              <input
                type="date"
                value={values.endDate || ''}
                onChange={(e) => onChange('endDate', e.target.value)}
                className="h-6 w-28 rounded bg-transparent px-1 text-[11px] text-foreground focus:outline-hidden"
                placeholder="إلى"
              />
            </div>
          </div>
        )}

        {searchFilter && (
          <div className="relative w-48 sm:w-60">
            <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              value={values.search || ''}
              onChange={(e) => onChange('search', e.target.value)}
              placeholder={searchFilter.placeholderAr || 'بحث...'}
              className="h-8 pr-8 text-xs bg-background/80"
            />
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          تفريغ الفلاتر
        </Button>
      </div>

      {onOpenColumnPicker && (
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenColumnPicker}
          className="h-8 gap-1.5 text-xs bg-background/80"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          تخصيص الأعمدة
        </Button>
      )}
    </div>
  );
}
