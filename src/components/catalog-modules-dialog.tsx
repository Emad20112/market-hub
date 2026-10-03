import { useState } from "react";
import { useCatalogModules, type BusinessProfile } from "@/lib/catalog-modules";
import { useI18n } from "@/lib/i18n";
import {
  SlidersHorizontal,
  Bike,
  ShoppingCart,
  Store,
  Check,
  CheckCircle2,
  Globe2,
  Medal,
  Layers,
  Box,
  Car,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormGrid, FormSection } from "@/components/ui/form-layout";
import { VortexDrawerDialog } from "@/components/vortex-ui";
import { toast } from "sonner";

interface CatalogModulesDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CatalogModulesDialog({ open, onClose }: CatalogModulesDialogProps) {
  const { lang } = useI18n();
  const { config, setProfile, updateConfig } = useCatalogModules();

  if (!open) return null;

  const profiles: {
    id: BusinessProfile;
    titleAr: string;
    titleEn: string;
    descAr: string;
    descEn: string;
    icon: typeof Bike;
    badgeColor: string;
  }[] = [
    {
      id: "spare_parts",
      titleAr: "قطع غيار ودراجات ومركبات",
      titleEn: "Spare Parts & Automotive",
      descAr: "تفعيل كافة ميزات توافق الموديلات، درجات الجودة (أصلي/تجاري)، وبلدان المنشأ.",
      descEn: "Full fitment compatibility, quality grades (OEM/Aftermarket), and origins.",
      icon: Bike,
      badgeColor: "border-primary/40 bg-primary/10 text-primary",
    },
    {
      id: "grocery",
      titleAr: "مواد غذائية وبقالة وسوبرماركت",
      titleEn: "Grocery & Food Market",
      descAr: "إلغاء توافق المركبات ودرجات الجودة، والتركيز على التصنيفات والماركات والوحدات.",
      descEn: "Disables vehicle fitment and grades, keeping categories, brands, and units.",
      icon: ShoppingCart,
      badgeColor: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      id: "retail",
      titleAr: "تجارة عامة وملابس وتجزئة",
      titleEn: "General Retail & Apparel",
      descAr: "تصنيفات، ماركات، وحدات، مع إمكانية تحديد بلدان المنشأ وإلغاء فلاتر المركبات.",
      descEn: "Categories, brands, units, and origin countries without vehicle fitment.",
      icon: Store,
      badgeColor: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
    },
  ];

  const modules = [
    {
      key: "enableMakesAndModels" as const,
      titleAr: "ماركات وموديلات المركبات وتوافق القطع",
      titleEn: "Vehicle Makes, Models & Part Fitment",
      descAr:
        "إدارة ماركات وموديلات الدراجات والمركبات وتحديد توافق القطعة مع موديلات متعددة في كرت الصنف والـ POS.",
      descEn:
        "Manage vehicle makes/models and match parts with specific models in products and POS.",
      icon: Car,
      current: config.enableMakesAndModels,
    },
    {
      key: "enableQualityGrades" as const,
      titleAr: "درجات الجودة (أصلي / وكالة / تجاري)",
      titleEn: "Quality Grades (OEM / Genuine / Aftermarket)",
      descAr: "تصنيف القطع والأصناف بحسب درجات الجودة، وترتيبها وفلترتها في نقطة البيع.",
      descEn: "Classify items by grade (OEM, Genuine, Grade A, Economy) with POS filtering.",
      icon: Medal,
      current: config.enableQualityGrades,
    },
    {
      key: "enableOrigins" as const,
      titleAr: "بلدان المنشأ وكود الدولة",
      titleEn: "Countries of Origin & Country Codes",
      descAr: "إدارة بلدان التصنيع والمنشأ للأصناف مع كود المنشأ (مثال: JP اليابان، CN الصين).",
      descEn: "Track country of manufacture with 2-letter country codes.",
      icon: Globe2,
      current: config.enableOrigins,
    },
    {
      key: "enableBrands" as const,
      titleAr: "العلامات التجارية والشركات المصنعة",
      titleEn: "Brands & Manufacturers",
      descAr: "إدارة الماركات المصنعة للبضائع والقطع (مثال: NGK, Castrol, المراعي).",
      descEn: "Manage item manufacturers and brand lines.",
      icon: Layers,
      current: config.enableBrands,
    },
    {
      key: "enableUnits" as const,
      titleAr: "الوحدات والعبوات المتعددة",
      titleEn: "Units of Measurement & Packaging",
      descAr: "إدارة وحدات القياس (حبة، كرتون، باكت، طقم، درزن...).",
      descEn: "Track measurement units (piece, carton, pack, set...).",
      icon: Box,
      current: config.enableUnits,
    },
  ];

  return (
    <VortexDrawerDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="lg"
      title={lang === "ar" ? "إعداد النشاط والموديلات" : "Industry & Catalog Modules"}
      description={
        lang === "ar"
          ? "اختر نمط النشاط واضبط خصائص الفهرس التي تحتاجها."
          : "Choose an industry profile, then enable the catalog features you need. Changes save automatically."
      }
      icon={<SlidersHorizontal className="size-5" />}
      footer={
        <Button type="button" onClick={onClose} className="w-full rounded-xl sm:w-auto sm:min-w-28">
          {lang === "ar" ? "تم" : "Done"}
        </Button>
      }
      bodyClassName="px-4 py-4 sm:px-6 sm:py-5"
    >
      <div className="space-y-6">
        <FormSection
          title={lang === "ar" ? "نمط النشاط" : "Industry profile"}
          description={lang === "ar" ? "اختيار النمط يفعّل مجموعة مناسبة من خصائص الفهرس." : "A profile applies a sensible set of catalog features."}
        >
          <FormGrid cols={3} gap="sm">
            {profiles.map((p) => {
              const Icon = p.icon;
              const isSelected = config.profile === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProfile(p.id);
                    toast.success(
                      lang === "ar" ? `تم تطبيق نمط: ${p.titleAr}` : `Applied profile: ${p.titleEn}`,
                    );
                  }}
                  className={`group relative flex min-h-28 flex-col items-start gap-2 rounded-xl border p-3 text-start transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                      : "border-border/80 bg-surface hover:border-primary/40 hover:bg-surface-2"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${p.badgeColor}`}>
                      <Icon className="size-4" />
                    </span>
                    {isSelected && (
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-foreground">
                    {lang === "ar" ? p.titleAr : p.titleEn}
                  </span>
                  <span className="text-[11px] leading-relaxed text-muted-foreground">
                    {lang === "ar" ? p.descAr : p.descEn}
                  </span>
                </button>
              );
            })}
          </FormGrid>
        </FormSection>

        <FormSection
          title={lang === "ar" ? "خصائص الفهرس والموديلات" : "Catalog & model features"}
          description={lang === "ar" ? "يمكنك تعديل أي خاصية بشكل مستقل؛ ويُحفظ الاختيار فوراً." : "Toggle each feature independently; changes are saved immediately."}
        >
          <div className="space-y-2">
          {modules.map((m) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface p-3 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border/80 bg-surface-2 text-primary">
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-foreground">
                          {lang === "ar" ? m.titleAr : m.titleEn}
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                          {lang === "ar" ? m.descAr : m.descEn}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Switch
                        checked={m.current}
                        onCheckedChange={(val) => {
                          updateConfig({ [m.key]: val, profile: "custom" });
                          toast.success(
                            lang === "ar"
                              ? `${val ? "تم تفعيل" : "تم تعطيل"}: ${m.titleAr}`
                              : `${val ? "Enabled" : "Disabled"}: ${m.titleEn}`,
                          );
                        }}
                      />
                    </div>
                  </div>
                );
          })}
          </div>
          <div className="flex items-center gap-2 pt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{lang === "ar" ? "التغييرات تُطبّق وتُحفظ فوراً" : "Changes apply and save immediately"}</span>
          </div>
        </FormSection>
      </div>
    </VortexDrawerDialog>
  );
}
