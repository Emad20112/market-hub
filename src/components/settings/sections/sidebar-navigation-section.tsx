import { PanelsTopLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  DEFAULT_SIDEBAR_PREFERENCES,
  useSidebarPreferences,
} from "@/lib/navigation/sidebar-preferences";
import { AutoSaveBadge } from "@/components/settings/auto-save-badge";

interface SidebarNavigationSectionProps {
  canEdit?: boolean;
  lang?: string;
}

export function SidebarNavigationSection({ canEdit = true, lang }: SidebarNavigationSectionProps) {
  const { user } = useAuth();
  const { lang: currentLang } = useI18n();
  const isAr = (lang ?? currentLang) === "ar";
  const { preferences, update } = useSidebarPreferences(user?.id);
  const [savePulse, setSavePulse] = useState(0);

  useEffect(() => {
    setSavePulse((n) => n + 1);
  }, [preferences]);

  const expansionOptions = [
    ["active", isAr ? "القسم الحالي" : "Current section"],
    ["all", isAr ? "كل الأقسام" : "All sections"],
    ["none", isAr ? "مطوية" : "Collapsed"],
  ] as const;

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl border-border/80 bg-card shadow-xs">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle className="flex items-center gap-3 text-base">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <PanelsTopLeft className="size-4" />
            </span>
            <span>
              <span className="block">
                {isAr ? "القائمة الجانبية" : "Sidebar"}
              </span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {isAr
                  ? "ترتيب ثابت حسب النشاط، بألوان موحدة وتمييز الأيقونة النشطة فقط."
                  : "Fixed activity sections with consistent colors; only the active icon is highlighted."}
              </span>
            </span>
            <AutoSaveBadge lang={isAr ? "ar" : "en"} trigger={savePulse} className="ms-auto" />
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">
              {isAr ? "الأقسام المفتوحة افتراضيًا" : "Sections expanded by default"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "اختر الأقسام التي تظهر روابط شاشاتها عند فتح القائمة. يمكنك فتح أو طي أي قسم يدويًا."
                : "Choose which sections show their screens when the sidebar opens. You can expand or collapse sections manually."}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {expansionOptions.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={preferences.defaultExpanded === value}
                  onClick={() => update({ defaultExpanded: value })}
                  className={`min-h-10 rounded-lg border px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50 ${
                    preferences.defaultExpanded === value
                      ? "border-primary/50 bg-primary/8"
                      : "border-border/70 hover:bg-muted/60"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <PanelsTopLeft className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              {isAr
                ? "تُعرض الشاشات حسب صلاحيات المستخدم والوحدات المفعّلة."
                : "Screens are shown according to the user's permissions and enabled modules."}
            </p>
          </div>

          <div className="flex justify-end border-t border-border/60 pt-4">
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => update(DEFAULT_SIDEBAR_PREFERENCES)}
              className="min-h-10 rounded-lg border border-border/70 px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-50"
            >
              {isAr ? "استعادة الإعداد الافتراضي" : "Restore default setting"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
