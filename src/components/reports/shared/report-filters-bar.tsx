import { useEffect, useState, useMemo } from "react";
import {
  Filter,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Printer,
  Download,
  Eye,
  CheckCircle2,
  Calendar,
  Layers,
  Users,
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
import type {
  ReportDefinition,
  ReportFilterDefinition,
  ReportFilterValues,
  ReportViewTemplateType,
} from "@/lib/reports/types";
import { searchReportFilterOptions } from "@/lib/reports/report-execution.functions";
import { TemplateTypeIndicator } from "./template-type-indicator";

interface ReportFiltersBarProps {
  filters: ReportFilterDefinition[];
  values: ReportFilterValues;
  onChange: (key: string, value: any) => void;
  onReset: () => void;
  onPreview?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
  onOpenColumnPicker?: () => void;
  loading?: boolean;
  definition?: ReportDefinition;
  currentTemplate?: ReportViewTemplateType;
}

const optionSourceByControl = {
  customer_select: "customers",
  supplier_select: "suppliers",
  warehouse_select: "warehouses",
  product_select: "products",
} as const;

const PAYMENT_METHODS = [
  { value: "cash", label: "نقدي" },
  { value: "card", label: "شبكة / بطاقة" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "credit", label: "آجل" },
];

const INVOICE_STATUSES = [
  { value: "draft", label: "مسودة" },
  { value: "confirmed", label: "مؤكدة" },
  { value: "completed", label: "مكتملة" },
  { value: "cancelled", label: "ملغاة" },
  { value: "returned", label: "مرتجعة" },
];

export function ReportFiltersBar({
  filters,
  values,
  onChange,
  onReset,
  onPreview,
  onPrint,
  onExport,
  onOpenColumnPicker,
  loading,
  definition,
  currentTemplate,
}: ReportFiltersBarProps) {
  const [searchDraft, setSearchDraft] = useState(values.search || "");
  const [optionsBySource, setOptionsBySource] = useState<
    Record<string, Array<{ id: string; label: string }>>
  >({});
  const [, setOptionsLoading] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("this_month");

  const selectableFilters = useMemo(
    () => filters.filter((f) => f.controlType in optionSourceByControl),
    [filters],
  );

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
      sources.map(
        async (source) => [source, await searchReportFilterOptions({ data: { source } })] as const,
      ),
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
    setSelectedPreset(preset);
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
      <div className="flex md:hidden items-center justify-between gap-2 border border-border rounded-xl bg-card p-2.5 shadow-xs">
        <div className="flex items-center gap-2">
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                <span>الفلاتر</span>
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="text-sm font-bold text-foreground">
                  خيارات الفلترة
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3.5 py-4 text-xs">
                {/* Mobile Filter Controls */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">الفترة الزمنية</label>
                  <Select onValueChange={handlePresetChange} value={selectedPreset}>
                    <SelectTrigger className="h-8 text-xs w-full">
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
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground block">من</span>
                      <Input
                        type="date"
                        value={values.startDate || ""}
                        onChange={(e) => onChange("startDate", e.target.value)}
                        className="h-8 text-xs w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground block">إلى</span>
                      <Input
                        type="date"
                        value={values.endDate || ""}
                        onChange={(e) => onChange("endDate", e.target.value)}
                        className="h-8 text-xs w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">البحث السريع</label>
                  <Input
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    placeholder="رقم الفاتورة، المرجع، الاسم..."
                    className="h-8 text-xs w-full"
                  />
                </div>

                {selectableFilters.map((filter) => {
                  const source =
                    optionSourceByControl[filter.controlType as keyof typeof optionSourceByControl];
                  const options = optionsBySource[source] || [];
                  const currentValue = values[filter.key] || "all";

                  return (
                    <div key={filter.key} className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">
                        {filter.labelAr}
                      </label>
                      <Select
                        value={currentValue}
                        onValueChange={(val) =>
                          onChange(filter.key, val === "all" ? undefined : val)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue placeholder={`كل ${filter.labelAr}`} />
                        </SelectTrigger>
                        <SelectContent className="max-h-[220px]">
                          <SelectItem value="all">كل {filter.labelAr}</SelectItem>
                          {options.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground">طريقة الدفع</label>
                    <Select
                      value={values.paymentMethod || "all"}
                      onValueChange={(val) =>
                        onChange("paymentMethod", val === "all" ? undefined : val)
                      }
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="طريقة الدفع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل طرق الدفع</SelectItem>
                        {PAYMENT_METHODS.map((pm) => (
                          <SelectItem key={pm.value} value={pm.value}>
                            {pm.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground">حالة الفاتورة</label>
                    <Select
                      value={values.status || "all"}
                      onValueChange={(val) => onChange("status", val === "all" ? undefined : val)}
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder="حالة الفاتورة" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الحالات</SelectItem>
                        {INVOICE_STATUSES.map((st) => (
                          <SelectItem key={st.value} value={st.value}>
                            {st.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-border">
                  <Button
                    onClick={() => {
                      if (onPreview) onPreview();
                      setMobileFiltersOpen(false);
                    }}
                    className="flex-1 h-8 text-xs font-semibold"
                  >
                    معاينة النتائج
                  </Button>
                  <Button
                    onClick={() => {
                      onReset();
                      setMobileFiltersOpen(false);
                    }}
                    variant="outline"
                    className="h-8 text-xs"
                  >
                    إعادة ضبط
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={mobileOptionsOpen} onOpenChange={setMobileOptionsOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>الخيارات والأعمدة</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[75vh]">
              <SheetHeader>
                <SheetTitle className="text-sm font-bold text-foreground">
                  خيارات التقرير
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-3.5 py-4">
                <Button
                  onClick={() => {
                    if (onOpenColumnPicker) onOpenColumnPicker();
                    setMobileOptionsOpen(false);
                  }}
                  variant="outline"
                  className="w-full h-8 text-xs justify-center gap-1.5"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  تخصيص الأعمدة المعروضة
                </Button>
                <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1 text-xs">
                  <div className="text-muted-foreground">
                    مصدر البيانات:{" "}
                    <span className="text-foreground font-semibold">
                      {definition?.dataSourceName || "سجل العمليات المعتمد"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    حبيبة الصف:{" "}
                    <span className="text-foreground font-semibold">
                      {definition?.rowGrainAr || "حركة مفصلة"}
                    </span>
                  </div>
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
              className="h-8 px-3 text-xs font-semibold"
            >
              <Eye className="h-3.5 w-3.5 ml-1" /> معاينة
            </Button>
          )}
        </div>
      </div>

      {/* ── لوحة الفلاتر الثلاثية المنظمة بتنسيق النظام ومرونة الشاشات ── */}
      <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs">
        {/* ── البطاقة 1: الفلترة الزمنية والبحث ── */}
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/20 p-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              الفترة والبحث
            </span>
            <span className="text-[10px] text-muted-foreground">التاريخ والنص</span>
          </div>

          <div className="space-y-2">
            {/* الفترة الزمنية */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-foreground block">
                الفترة الزمنية
              </label>
              <Select onValueChange={handlePresetChange} value={selectedPreset}>
                <SelectTrigger className="h-8 w-full text-xs">
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
            </div>

            {/* حقول التاريخ مرنة ومفصولة بنظام شبكي يمنع التراكب نهائياً */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] text-muted-foreground block">من تاريخ</span>
                <Input
                  type="date"
                  value={values.startDate || ""}
                  onChange={(e) => onChange("startDate", e.target.value)}
                  className="h-8 w-full text-xs min-w-0"
                />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[10px] text-muted-foreground block">إلى تاريخ</span>
                <Input
                  type="date"
                  value={values.endDate || ""}
                  onChange={(e) => onChange("endDate", e.target.value)}
                  className="h-8 w-full text-xs min-w-0"
                />
              </div>
            </div>

            {/* البحث السريع */}
            <div className="space-y-0.5 pt-0.5">
              <span className="text-[10px] text-muted-foreground block">البحث السريع</span>
              <div className="relative">
                <Search className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder="رقم الفاتورة، المرجع، الاسم..."
                  className="h-8 pr-8 text-xs w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── البطاقة 2: أطراف التعامل والأصناف ── */}
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/20 p-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              أطراف التعامل والمخزون
            </span>
            <span className="text-[10px] text-muted-foreground">العميل / الصنف</span>
          </div>

          <div className="space-y-2 flex-1">
            {selectableFilters.length > 0 ? (
              selectableFilters.map((filter) => {
                const source =
                  optionSourceByControl[filter.controlType as keyof typeof optionSourceByControl];
                const options = optionsBySource[source] || [];
                const currentValue = values[filter.key] || "all";

                return (
                  <div key={filter.key} className="space-y-1">
                    <label className="text-[11px] font-medium text-foreground block">
                      {filter.labelAr}
                    </label>
                    <Select
                      value={currentValue}
                      onValueChange={(val) => onChange(filter.key, val === "all" ? undefined : val)}
                    >
                      <SelectTrigger className="h-8 text-xs w-full">
                        <SelectValue placeholder={`كل ${filter.labelAr}`} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[220px]">
                        <SelectItem value="all">كل {filter.labelAr}</SelectItem>
                        {options.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-4 text-center text-xs text-muted-foreground">
                <span>لا توجد فلاتر أطراف خاصة بهذا التقرير</span>
                <span className="text-[10px] mt-1 text-muted-foreground/80">
                  يتم تطبيق التصفية العامة تلقائياً
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── البطاقة 3: الفلاتر المعتمدة والموحدة (بدل نصوص المصدر الثابتة) ── */}
        <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/20 p-3 shadow-xs md:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-primary" />
              الفلاتر المعتمدة والخيارات
            </span>
            <span className="text-[10px] text-muted-foreground">خيارات تشغيلية</span>
          </div>

          <div className="space-y-2 flex-1">
            {/* فلتر طريقة الدفع الموحد */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-foreground block">طريقة الدفع</label>
              <Select
                value={values.paymentMethod || "all"}
                onValueChange={(val) => onChange("paymentMethod", val === "all" ? undefined : val)}
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue placeholder="كل طرق الدفع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل طرق الدفع</SelectItem>
                  {PAYMENT_METHODS.map((pm) => (
                    <SelectItem key={pm.value} value={pm.value}>
                      {pm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* فلتر حالة الفاتورة / العملية الموحد */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-foreground block">
                حالة الفاتورة / العملية
              </label>
              <Select
                value={values.status || "all"}
                onValueChange={(val) => onChange("status", val === "all" ? undefined : val)}
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue placeholder="كل الحالات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  {INVOICE_STATUSES.map((st) => (
                    <SelectItem key={st.value} value={st.value}>
                      {st.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* تخصيص الأعمدة */}
            <div className="pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenColumnPicker}
                className="w-full h-8 text-xs justify-center gap-1.5 font-medium"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span>تخصيص الأعمدة المعروضة</span>
              </Button>
            </div>

            {/* سطر دلالي مصغر للمصدر والحبيبة في أسفل البطاقة */}
            <div className="pt-1 border-t border-border/50 text-[10px] text-muted-foreground flex items-center justify-between">
              <span className="truncate">
                المصدر: {definition?.dataSourceName || "سجل العمليات"}
              </span>
              <span className="truncate font-mono">{definition?.rowGrainAr || "حركة مفصلة"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── شريط أزرار الإجراءات: مرن ومتجاوب بتنسيق النظام ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* زر معاينة */}
          <Button
            size="sm"
            variant="default"
            onClick={onPreview}
            disabled={loading}
            className="h-8 text-xs font-semibold gap-1.5 px-3.5"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>معاينة</span>
          </Button>

          {/* زر إعادة الفلترة */}
          <Button
            size="sm"
            variant="outline"
            onClick={onReset}
            className="h-8 text-xs gap-1.5 px-3"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>إعادة الفلترة</span>
          </Button>

          {/* زر إلغاء */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            className="h-8 text-xs px-3 text-muted-foreground hover:text-foreground"
          >
            <span>إلغاء</span>
          </Button>
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span>{activeFiltersCount} فلاتر نشطة</span>
          </div>
        )}
      </div>

      {/* ── شريط الطباعة ونوع القالب ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-1">
        <div className="flex items-center gap-1.5">
          {onPrint && (
            <Button
              size="sm"
              variant="outline"
              onClick={onPrint}
              disabled={loading}
              className="h-8 w-8 p-0"
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
              className="h-8 w-8 p-0"
              title="تصدير Excel / CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>

        <TemplateTypeIndicator currentTemplate={currentTemplate || definition?.viewTemplate} />
      </div>
    </div>
  );
}
