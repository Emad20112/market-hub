import React, { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Database,
  Filter,
  Eye,
  X,
  Printer,
  Download,
  CheckCircle2,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import type { ReportDefinition, ReportFilterDefinition, ReportViewTemplateType } from "@/lib/reports/types";
import { searchReportFilterOptions } from "@/lib/reports/report-execution.functions";
import { TemplateTypeIndicator } from "./template-type-indicator";

type FilterOption = { id: string; label: string; secondaryLabel?: string | null };

const optionSourceByControl = {
  customer_select: "customers",
  supplier_select: "suppliers",
  warehouse_select: "warehouses",
  product_select: "products",
} as const;

const PAYMENT_METHODS = [
  { value: "all", label: "جميع طرق الدفع" },
  { value: "cash", label: "نقدي" },
  { value: "card", label: "بطاقة / شبكة" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "credit", label: "آجل" },
];

const INVOICE_STATUSES = [
  { value: "all", label: "جميع الحالات" },
  { value: "draft", label: "مسودة" },
  { value: "confirmed", label: "مؤكدة" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "returned", label: "مرتجعة" },
];

interface ReportFiltersBarProps {
  definition?: ReportDefinition;
  filters: ReportFilterDefinition[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
  onPreview?: () => void;
  onOpenColumnPicker?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
  currentTemplate?: ReportViewTemplateType;
  loading?: boolean;
}

export function ReportFiltersBar({
  definition,
  filters,
  values,
  onChange,
  onReset,
  onPreview,
  onOpenColumnPicker,
  onPrint,
  onExport,
  currentTemplate,
  loading = false,
}: ReportFiltersBarProps) {
  const hasDateRange = filters.some((f) => f.controlType === "date_range");
  const searchFilter = filters.find((f) => f.controlType === "text_search");
  const selectableFilters = useMemo(
    () => filters.filter((filter) => filter.controlType in optionSourceByControl),
    [filters],
  );

  const [optionsBySource, setOptionsBySource] = useState<Record<string, FilterOption[]>>({});
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [searchDraft, setSearchDraft] = useState(values.search || "");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

  useEffect(() => {
    setSearchDraft(values.search || "");
  }, [values.search]);

  useEffect(() => {
    if (searchDraft === (values.search || "")) return;
    const timeout = window.setTimeout(() => onChange("search", searchDraft), 300);
    return () => window.clearTimeout(timeout);
  }, [searchDraft, values.search, onChange]);

  useEffect(() => {
    const sources = [
      ...new Set(
        selectableFilters.map(
          (filter) =>
            optionSourceByControl[filter.controlType as keyof typeof optionSourceByControl],
        ),
      ),
    ];
    if (sources.length === 0) return;
    let active = true;
    setOptionsLoading(true);
    Promise.all(
      sources.map(async (source) => [source, await searchReportFilterOptions({ data: { source } })] as const),
    )
      .then((entries) => {
        if (active) setOptionsBySource(Object.fromEntries(entries));
      })
      .finally(() => {
        if (active) setOptionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectableFilters]);

  function handlePresetChange(preset: string) {
    const today = new Date();
    let start = "";
    let end = today.toISOString().split("T")[0];

    if (preset === "today") {
      start = end;
    } else if (preset === "yesterday") {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      start = y.toISOString().split("T")[0];
      end = start;
    } else if (preset === "this_week") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      start = d.toISOString().split("T")[0];
    } else if (preset === "this_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      start = firstDay.toISOString().split("T")[0];
    } else if (preset === "last_month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      start = firstDay.toISOString().split("T")[0];
      end = lastDay.toISOString().split("T")[0];
    } else if (preset === "all") {
      start = "";
      end = "";
    }

    onChange("startDate", start);
    onChange("endDate", end);
  }

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (values.startDate || values.endDate) count++;
    if (values.search) count++;
    selectableFilters.forEach((f) => {
      if (values[f.key]) count++;
    });
    if (values.paymentMethod && values.paymentMethod !== "all") count++;
    if (values.status && values.status !== "all") count++;
    return count;
  }, [values, selectableFilters]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Mobile Controls (< md) ── */}
      <div className="flex md:hidden items-center justify-between gap-2 border border-cyan-500/30 rounded-xl bg-slate-900/80 p-2.5">
        <div className="flex items-center gap-2">
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-cyan-500/40 text-cyan-300">
                <Filter className="h-3 w-3" />
                <span>الفلاتر</span>
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] bg-cyan-500/20 text-cyan-300">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto bg-slate-900 border-cyan-500/30">
              <SheetHeader>
                <SheetTitle className="text-sm font-bold text-cyan-300">خيارات الفلترة</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 py-4">
                {/* Mobile Filter Controls */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">الفترة الزمنية</label>
                  <Select onValueChange={handlePresetChange} defaultValue="this_month">
                    <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-700">
                      <SelectValue placeholder="اختر الفترة" />
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
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="date"
                      value={values.startDate || ""}
                      onChange={(e) => onChange("startDate", e.target.value)}
                      className="h-8 text-xs bg-slate-800 border-slate-700"
                    />
                    <Input
                      type="date"
                      value={values.endDate || ""}
                      onChange={(e) => onChange("endDate", e.target.value)}
                      className="h-8 text-xs bg-slate-800 border-slate-700"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300">البحث النصي</label>
                  <Input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="ابحث برقم الفاتورة أو الاسم..."
                    className="h-8 text-xs bg-slate-800 border-slate-700"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={() => {
                      if (onPreview) onPreview();
                      setMobileFiltersOpen(false);
                    }}
                    className="flex-1 h-8 text-xs bg-teal-500 text-slate-950 font-bold"
                  >
                    معاينة النتائج
                  </Button>
                  <Button
                    onClick={() => {
                      onReset();
                      setMobileFiltersOpen(false);
                    }}
                    variant="outline"
                    className="h-8 text-xs text-rose-400 border-rose-500/30"
                  >
                    إعادة ضبط
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={mobileOptionsOpen} onOpenChange={setMobileOptionsOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-slate-700 text-slate-300">
                <SlidersHorizontal className="h-3 w-3" />
                <span>التخصيص والمصادر</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[75vh] bg-slate-900 border-cyan-500/30">
              <SheetHeader>
                <SheetTitle className="text-sm font-bold text-cyan-300">التخصيص ومصادر التقرير</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4">
                <Button
                  onClick={() => {
                    if (onOpenColumnPicker) onOpenColumnPicker();
                    setMobileOptionsOpen(false);
                  }}
                  variant="outline"
                  className="w-full h-8 text-xs justify-center border-cyan-500/40 text-cyan-300"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 ml-2" />
                  تخصيص الأعمدة المعروضة
                </Button>
                <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-3 space-y-1.5 text-xs">
                  <div className="text-slate-400">مصدر البيانات: <span className="text-slate-200 font-semibold">{definition?.dataSourceName || "سجل العمليات المعتمد"}</span></div>
                  <div className="text-slate-400">حبيبة الصف: <span className="text-slate-200 font-semibold">{definition?.rowGrainAr || "حركة مفصلة"}</span></div>
                  {definition?.costBasisNotice && (
                    <div className="text-slate-400">أساس التكلفة: <span className="text-emerald-400 font-semibold">{definition.costBasisNotice}</span></div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex items-center gap-1.5">
          {onPreview && (
            <Button
              size="sm"
              onClick={onPreview}
              disabled={loading}
              className="h-7 px-2.5 text-xs bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold"
            >
              <Eye className="h-3 w-3 ml-1" /> معاينة
            </Button>
          )}
        </div>
      </div>

      {/* ── 3-Column Luxury Filter Panel (مطابق لصورة الموك أب تماماً) ── */}
      <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-3 rounded-2xl border border-cyan-500/40 bg-slate-900/90 p-4 shadow-xl shadow-cyan-950/20 backdrop-blur-md">
        {/* ── Column 1 (Left in image / الفلترة): حقول البحث والتصفية ── */}
        <div className="flex flex-col gap-2 rounded-xl border border-cyan-500/20 bg-slate-950/50 p-3 shadow-inner">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5 text-cyan-400" />
              الفلترة
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">(h-7, text-xs)</span>
          </div>

          <div className="space-y-1.5">
            {/* الفترة الزمنية */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span>الفترة الزمنية</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Select onValueChange={handlePresetChange} defaultValue="this_month">
                  <SelectTrigger className="h-7 w-28 border-slate-700/80 bg-slate-900 text-[11px] text-slate-200">
                    <SelectValue placeholder="اختر الفترة" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700 text-xs">
                    <SelectItem value="today">اليوم</SelectItem>
                    <SelectItem value="yesterday">أمس</SelectItem>
                    <SelectItem value="this_week">آخر 7 أيام</SelectItem>
                    <SelectItem value="this_month">الشهر الحالي</SelectItem>
                    <SelectItem value="last_month">الشهر السابق</SelectItem>
                    <SelectItem value="all">كل الفترات</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-1 flex-1">
                  <Input
                    type="date"
                    value={values.startDate || ""}
                    onChange={(e) => onChange("startDate", e.target.value)}
                    className="h-7 flex-1 border-slate-700/80 bg-slate-900 px-1.5 text-[11px] text-slate-200 focus-visible:ring-cyan-500"
                    placeholder="من"
                  />
                  <span className="text-slate-500 text-xs">→</span>
                  <Input
                    type="date"
                    value={values.endDate || ""}
                    onChange={(e) => onChange("endDate", e.target.value)}
                    className="h-7 flex-1 border-slate-700/80 bg-slate-900 px-1.5 text-[11px] text-slate-200 focus-visible:ring-cyan-500"
                    placeholder="إلى"
                  />
                </div>
              </div>
            </div>

            {/* البحث النصي */}
            <div className="space-y-1">
              <div className="relative">
                <Search className="absolute right-2 top-2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="البحث النصي (الرقم، المرجع، الاسم...)"
                  className="h-7 pr-7 text-xs border-slate-700/80 bg-slate-900 text-slate-200 placeholder:text-slate-500 focus-visible:ring-cyan-500"
                />
              </div>
            </div>

            {/* العميل / المورد */}
            {selectableFilters.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5">
                {selectableFilters.slice(0, 2).map((filter) => {
                  const source = optionSourceByControl[filter.controlType as keyof typeof optionSourceByControl];
                  const options = optionsBySource[source] || [];
                  const currentValue = values[filter.key] || "all";

                  return (
                    <Select
                      key={filter.key}
                      value={currentValue}
                      onValueChange={(val) => onChange(filter.key, val === "all" ? undefined : val)}
                    >
                      <SelectTrigger className="h-7 text-xs border-slate-700/80 bg-slate-900 text-slate-200">
                        <SelectValue placeholder={filter.labelAr} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[220px] bg-slate-900 border-slate-700 text-xs">
                        <SelectItem value="all">كل {filter.labelAr}</SelectItem>
                        {options.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Column 2 (Center in image / التخصيص): تخصيص الأعمدة والترتيب ── */}
        <div className="flex flex-col gap-2 rounded-xl border border-cyan-500/20 bg-slate-950/50 p-3 shadow-inner">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
              التخصيص
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">Options</span>
          </div>

          <div className="flex flex-col gap-2.5 justify-center flex-1">
            <button
              type="button"
              onClick={onOpenColumnPicker}
              className="group flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/40 bg-slate-900/80 p-3 text-xs font-semibold text-cyan-300 transition-all hover:bg-cyan-950/50 hover:border-cyan-400 shadow-sm"
            >
              <SlidersHorizontal className="h-4 w-4 transition-transform group-hover:rotate-45" />
              <span>تخصيص الأعمدة المعروضة</span>
            </button>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center justify-between">
                <span>طريقة العرض الحالية:</span>
                <span className="font-semibold text-slate-200">
                  {definition?.viewTemplate === "summary"
                    ? "ملخص مؤشرات"
                    : definition?.viewTemplate === "detailed_table"
                    ? "جدول كشف تفصيلي"
                    : "تحليلي متقدم"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>تصفية الصفرية:</span>
                <span className="text-emerald-400 font-medium">مستبعدة تلقائياً</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Column 3 (Right in image / مصادر التقرير): مصدر البيانات والحبيبة ── */}
        <div className="flex flex-col gap-2 rounded-xl border border-cyan-500/20 bg-slate-950/50 p-3 shadow-inner">
          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-1.5">
            <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-cyan-400" />
              مصادر التقرير
            </span>
            <span className="text-[10px] text-emerald-400 font-mono">LIVE DB</span>
          </div>

          <div className="space-y-2 text-xs py-1">
            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-400 font-medium">مصدر البيانات:</div>
              <div className="font-semibold text-slate-200 truncate">
                {definition?.dataSourceName || "مصدر البيانات حسب آلية التجارة المعتمدة"}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-400 font-medium">حبيبة الصف (grain):</div>
              <div className="font-mono text-slate-300 truncate">
                {definition?.rowGrainAr || "grain الصف — سجل العمليات الفعلي"}
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="text-[11px] text-slate-400 font-medium">نمط البيانات:</div>
              <div className="text-slate-300 text-[11px] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span>
                  {definition?.costBasisNotice === "ACTUAL"
                    ? "تكلفة محققة ومطابقة محاسبياً"
                    : "تكلفة استرشادية وقياسية"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Buttons Bar: [معاينة] [إعادة الفلترة] [إلغاء] (مطابق تماماً للموك أب) ── */}
      <div className="flex items-center justify-between border-b border-cyan-950/60 pb-2">
        <div className="flex items-center gap-2">
          {/* زر معاينة (Teal / Cyan Button) */}
          <Button
            size="sm"
            onClick={onPreview}
            disabled={loading}
            className="h-8 gap-1.5 rounded-xl bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold px-4 text-xs shadow-md shadow-teal-500/20 transition-all"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>معاينة</span>
          </Button>

          {/* زر إعادة الفلترة (Red / Coral Button) */}
          <Button
            size="sm"
            onClick={onReset}
            className="h-8 gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium px-3.5 text-xs shadow-md shadow-rose-600/20 transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>إعادة الفلترة</span>
          </Button>

          {/* زر إلغاء (Dark Subtle Button) */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            className="h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 text-xs transition-all"
          >
            <span>إلغاء</span>
          </Button>
        </div>

        {activeFiltersCount > 0 && (
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-cyan-400 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{activeFiltersCount} فلاتر نشطة</span>
          </div>
        )}
      </div>

      {/* ── Toolbar Strip: Print & Export on Left, Template View Icons on Right (مطابق للموك أب) ── */}
      <div className="flex items-center justify-between py-1 px-0.5">
        <div className="flex items-center gap-2">
          {onPrint && (
            <Button
              size="sm"
              variant="outline"
              onClick={onPrint}
              disabled={loading}
              className="h-8 w-8 p-0 rounded-xl border-slate-700 bg-slate-900/80 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 shadow-xs"
              title="طباعة التقرير"
            >
              <Printer className="h-4 w-4" />
            </Button>
          )}

          {onExport && (
            <Button
              size="sm"
              variant="outline"
              onClick={onExport}
              disabled={loading}
              className="h-8 w-8 p-0 rounded-xl border-slate-700 bg-slate-900/80 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50 shadow-xs"
              title="تصدير Excel / CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* 8 Template Indicators Pill Bar on Right */}
        <TemplateTypeIndicator currentTemplate={currentTemplate || definition?.viewTemplate} />
      </div>
    </div>
  );
}
