import React, { useEffect, useMemo, useState } from 'react';
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
import { searchReportFilterOptions } from '@/lib/reports/report-execution.functions';

type FilterOption = { id: string; label: string; secondaryLabel?: string | null };

const optionSourceByControl = {
  customer_select: 'customers',
  supplier_select: 'suppliers',
  warehouse_select: 'warehouses',
  product_select: 'products',
} as const;

const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'card', label: 'بطاقة' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'credit', label: 'آجل' },
];

const INVOICE_STATUSES = [
  { value: 'draft', label: 'مسودة' },
  { value: 'confirmed', label: 'مؤكدة' },
  { value: 'completed', label: 'مكتملة' },
  { value: 'cancelled', label: 'ملغاة' },
  { value: 'returned', label: 'مرتجعة' },
];

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
  const selectableFilters = useMemo(
    () => filters.filter((filter) => filter.controlType in optionSourceByControl),
    [filters]
  );
  const [optionsBySource, setOptionsBySource] = useState<Record<string, FilterOption[]>>({});
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [searchDraft, setSearchDraft] = useState(values.search || '');

  // لا نرسل طلب تقرير جديداً مع كل ضغطة مفتاح. يبقى الإدخال فورياً للمستخدم
  // ثم تزامن قيمة البحث بعد توقف قصير فقط.
  useEffect(() => {
    setSearchDraft(values.search || '');
  }, [values.search]);

  useEffect(() => {
    if (searchDraft === (values.search || '')) return;
    const timeout = window.setTimeout(() => onChange('search', searchDraft), 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft, values.search, onChange]);

  useEffect(() => {
    const sources = [...new Set(selectableFilters.map((filter) => optionSourceByControl[filter.controlType as keyof typeof optionSourceByControl]))];
    if (sources.length === 0) return;
    let active = true;
    setOptionsLoading(true);
    Promise.all(sources.map(async (source) => [source, await searchReportFilterOptions({ data: { source } })] as const))
      .then((entries) => {
        if (active) setOptionsBySource(Object.fromEntries(entries));
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => { active = false; };
  }, [selectableFilters]);

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
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={searchFilter.placeholderAr || 'بحث...'}
              className="h-8 pr-8 text-xs bg-background/80"
            />
          </div>
        )}

        {selectableFilters.map((filter) => {
          const source = optionSourceByControl[filter.controlType as keyof typeof optionSourceByControl];
          const options = optionsBySource[source] || [];
          return (
            <Select
              key={filter.key}
              value={values[filter.key] || '__all__'}
              onValueChange={(value) => onChange(filter.key, value === '__all__' ? undefined : value)}
            >
              <SelectTrigger className="h-8 w-40 bg-background/80 text-xs">
                <SelectValue placeholder={optionsLoading ? 'جارٍ التحميل...' : filter.placeholderAr} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{filter.placeholderAr || 'الكل'}</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option.id} value={option.id} className="text-xs">
                    {option.label}{option.secondaryLabel ? ` (${option.secondaryLabel})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}

        {filters.some((filter) => filter.controlType === 'payment_method_select') && (
          <Select value={values.paymentMethod || '__all__'} onValueChange={(value) => onChange('paymentMethod', value === '__all__' ? undefined : value)}>
            <SelectTrigger className="h-8 w-36 bg-background/80 text-xs"><SelectValue placeholder="كل طرق الدفع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل طرق الدفع</SelectItem>
              {PAYMENT_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {filters.some((filter) => filter.controlType === 'invoice_status_select') && (
          <Select value={values.status || '__all__'} onValueChange={(value) => onChange('status', value === '__all__' ? undefined : value)}>
            <SelectTrigger className="h-8 w-32 bg-background/80 text-xs"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل الحالات</SelectItem>
              {INVOICE_STATUSES.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
            </SelectContent>
          </Select>
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
