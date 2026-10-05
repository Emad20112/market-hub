import { useCatalogModules } from "@/lib/catalog-modules";
import { useI18n } from "@/lib/i18n";
import { Box, CheckCircle2, Package, Sprout, Warehouse } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-layout";
import { VortexDrawerDialog } from "@/components/vortex-ui";
import { toast } from "sonner";

interface CatalogModulesDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * تخصيص الفهرس لمطحنة.
 *
 * ما كان هنا قبل: قوالب جاهزة لقطع الغيار والبقالة والتجارة، مع مفاتيح
 * توافق المركبات ودرجات الجودة وبلدان المنشأ والماركات. لا شيء من ذلك
 * مُهيّأ في هذا النظام، فوجوده في الإعدادات وعدٌ لا يُوفى. أُبعد كل ما
 * لا يملكه الفهرس فعلياً، وأُبقي ما يملكه المطحنة: الوحدات، ودرجات
 * الحبوب، ومستلزمات التعبئة.
 */
export function CatalogModulesDialog({ open, onClose }: CatalogModulesDialogProps) {
  const { lang } = useI18n();
  const { config, updateConfig } = useCatalogModules();

  if (!open) return null;

  const modules = [
    {
      key: "enableUnits" as const,
      titleAr: "وحدات القياس والعبوات",
      titleEn: "Units & packaging sizes",
      descAr:
        "الوحدة التي يُقاس بها الصنف: كجم، طن، شوال 50 كجم، كيس 10/25 كجم، قطعة. بدون وحدة لا معنى لرصيد المخزون.",
      descEn: "The unit an item is measured in. Without one, an inventory balance has no meaning.",
      icon: Box,
      current: config.enableUnits,
    },
    {
      key: "enableGrainGrades" as const,
      titleAr: "درجات وأصناف الحبوب",
      titleEn: "Grain grades & varieties",
      descAr:
        "تصنيف القمح والذرة والشعير إلى أنواع تجارية (در أول، در ثانٍ) لأخذها في حساب سعر الشراء.",
      descEn: "Classify wheat, maize and barley into commercial grades for purchasing.",
      icon: Sprout,
      current: config.enableGrainGrades ?? true,
    },
    {
      key: "enablePackagingBags" as const,
      titleAr: "مستلزمات التعبئة والتغليف",
      titleEn: "Packaging supplies",
      descAr:
        "الأكياس والشوالات والخيوط. تُستخدم مع أي منتج نهائي، ولذلك هي أصناف مستهلكة تُشترى ولا تُطحن.",
      descEn: "Bags, sacks and thread: consumables bought, never milled.",
      icon: Package,
      current: config.enablePackagingBags ?? true,
    },
  ];

  return (
    <VortexDrawerDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      size="lg"
      title={lang === "ar" ? "تخصيص الفهرس" : "Catalogue settings"}
      description={
        lang === "ar"
          ? "ما تحتاجه المطحنة فقط. ما لا يوجد في فهرسك لا يظهر لك."
          : "Only what a mill actually uses. What is not in your catalogue is not offered."
      }
      icon={<Warehouse className="size-5" />}
      footer={
        <Button type="button" onClick={onClose} className="w-full rounded-xl sm:w-auto sm:min-w-28">
          {lang === "ar" ? "تم" : "Done"}
        </Button>
      }
      bodyClassName="px-4 py-4 sm:px-6 sm:py-5"
    >
      <div className="space-y-6">
        <FormSection
          title={lang === "ar" ? "أبعاد الفهرس" : "Catalogue dimensions"}
          description={
            lang === "ar"
              ? "إخفاء بُعد يخفي كل حقوله من الشاشات والفورم معاً."
              : "Hiding a dimension removes its fields from every screen and form."
          }
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
                        updateConfig({ [m.key]: val });
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
            <span>
              {lang === "ar"
                ? "التغييرات تُطبّق وتُحفظ فوراً"
                : "Changes apply and save immediately"}
            </span>
          </div>
        </FormSection>
      </div>
    </VortexDrawerDialog>
  );
}
