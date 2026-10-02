import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, Search as SearchIcon } from "lucide-react";
import { SettingsSidebar } from "./settings-sidebar";
import {
  getRegisteredSettingsSections,
  getSettingsSection,
  SettingsSectionId,
  SettingsSectionMeta,
} from "./settings-registry";
import { VortexSearchInput } from "@/components/vortex-ui";
import { cn } from "@/lib/utils";

interface SettingsLayoutProps {
  form: any;
  setForm: (form: any) => void;
  enablePosServiceFee: boolean;
  setEnablePosServiceFee: (v: boolean) => void;
  printMode: "auto" | "ask" | "off";
  setPrintMode: (v: "auto" | "ask" | "off") => void;
  defaultPrintTemplate: any;
  setDefaultPrintTemplate: (v: any) => void;
  canEdit: boolean;
  lang: string;
}

export function SettingsLayout({
  form,
  setForm,
  enablePosServiceFee,
  setEnablePosServiceFee,
  printMode,
  setPrintMode,
  defaultPrintTemplate,
  setDefaultPrintTemplate,
  canEdit,
  lang,
}: SettingsLayoutProps) {
  const isAr = lang === "ar";
  const sections = getRegisteredSettingsSections();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSectionId, setActiveSectionId] = useState<SettingsSectionId | null>(null);

  const openSection = (id: SettingsSectionId) => {
    setActiveSectionId(id);
    setSearchQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closeSection = () => setActiveSectionId(null);

  // Search across the settings that actually exist in the system
  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [] as SettingsSectionMeta[];
    return sections.filter(
      (s) =>
        s.titleAr.toLowerCase().includes(q) ||
        s.titleEn.toLowerCase().includes(q) ||
        s.descriptionAr.toLowerCase().includes(q) ||
        s.descriptionEn.toLowerCase().includes(q),
    );
  }, [searchQuery, sections]);

  const activeMeta = activeSectionId ? getSettingsSection(activeSectionId) : undefined;
  const SectionComponent = activeMeta?.component;

  const renderSectionComponent = () =>
    SectionComponent ? (
      <SectionComponent
        form={form}
        setForm={setForm}
        enablePosServiceFee={enablePosServiceFee}
        setEnablePosServiceFee={setEnablePosServiceFee}
        printMode={printMode}
        setPrintMode={setPrintMode}
        defaultPrintTemplate={defaultPrintTemplate}
        setDefaultPrintTemplate={setDefaultPrintTemplate}
        canEdit={canEdit}
        lang={lang}
      />
    ) : (
      <div className="text-center py-12 text-muted-foreground text-sm">
        {isAr ? "القسم غير موجود" : "Section not found"}
      </div>
    );

  return (
    <div className="relative">
      {/* ===== Mobile / Tablet (<md): Hub ⇄ Detail with fixed bottom search in Hub ===== */}
      <div className="md:hidden">
        {activeSectionId ? (
          /* --- Detail page --- */
          <div className="space-y-4">
            <button
              type="button"
              onClick={closeSection}
              className="flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full px-2 py-1 -ms-2"
            >
              <ArrowRight className="h-4 w-4 rtl:hidden" />
              <ArrowRight className="h-4 w-4 ltr:hidden" />
              {isAr ? "رجوع إلى الإعدادات" : "Back to Settings"}
            </button>
            {renderSectionComponent()}
          </div>
        ) : (
          /* --- Hub list --- */
          <div className="space-y-2.5 pb-28">
            {sections.map((sec) => {
              const Icon = sec.icon;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => openSection(sec.id)}
                  className="w-full text-start p-4 rounded-2xl border border-border/70 bg-surface/80 hover:bg-surface-2 active:bg-muted/60 transition-all group flex items-center gap-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-foreground truncate">
                      {isAr ? sec.titleAr : sec.titleEn}
                    </span>
                    <span className="block text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                      {isAr ? sec.descriptionAr : sec.descriptionEn}
                    </span>
                  </span>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground/60 rtl:hidden shrink-0" />
                  <ChevronLeft className="h-4 w-4 text-muted-foreground/60 ltr:hidden shrink-0 rotate-180" />
                </button>
              );
            })}
          </div>
        )}

        {/* Fixed bottom search — Hub only, disappears on Detail */}
        {!activeSectionId && (
          <div className="fixed bottom-0 inset-x-0 z-40 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-background via-background/95 to-background/80 border-t border-border/50">
            <div className="mx-auto max-w-2xl">
              <VortexSearchInput
                value={searchQuery}
                onValueChange={setSearchQuery}
                enableSlashShortcut={false}
                placeholder={isAr ? "بحث في الإعدادات..." : "Search settings..."}
              />
              {searchQuery.trim() && (
                <div className="mt-2 rounded-2xl border border-border/70 bg-card shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                  {filteredSections.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      {isAr ? "لا توجد نتائج مطابقة" : "No matching settings"}
                    </div>
                  ) : (
                    filteredSections.map((sec) => {
                      const Icon = sec.icon;
                      return (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => openSection(sec.id)}
                          className="w-full text-start flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40 last:border-b-0 focus-visible:outline-none focus-visible:bg-muted/60"
                        >
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs font-bold text-foreground truncate">
                              {isAr ? sec.titleAr : sec.titleEn}
                            </span>
                            <span className="block text-[10px] text-muted-foreground truncate">
                              {isAr ? sec.descriptionAr : sec.descriptionEn}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===== Desktop (md+): Settings Sidebar + Content ===== */}
      <div className="hidden md:block">
        {/* Top search bar of the Settings area */}
        <div className="mb-6 max-w-xl">
          <div className="relative">
            <VortexSearchInput
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder={isAr ? "بحث في الإعدادات..." : "Search settings..."}
            />
            {searchQuery.trim() && (
              <div className="absolute top-full mt-2 inset-x-0 z-30 rounded-2xl border border-border/70 bg-card shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                {filteredSections.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    {isAr ? "لا توجد نتائج مطابقة" : "No matching settings"}
                  </div>
                ) : (
                  filteredSections.map((sec) => {
                    const Icon = sec.icon;
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => openSection(sec.id)}
                        className="w-full text-start flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors border-b border-border/40 last:border-b-0 focus-visible:outline-none focus-visible:bg-muted/60"
                      >
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-bold text-foreground truncate">
                            {isAr ? sec.titleAr : sec.titleEn}
                          </span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {isAr ? sec.descriptionAr : sec.descriptionEn}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6 items-start">
          {/* Settings navigation column — visually distinct from app sidebar */}
          <div className="col-span-4 lg:col-span-3 sticky top-4">
            <SettingsSidebar
              activeSectionId={activeSectionId ?? ""}
              onSelectSection={setActiveSectionId}
              lang={lang}
            />
          </div>

          {/* Settings content column */}
          <div className={cn("col-span-8 lg:col-span-9 space-y-6")}>
            {activeSectionId ? (
              <div className="space-y-4">{renderSectionComponent()}</div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/70 p-12 text-center text-muted-foreground">
                <SearchIcon className="mx-auto h-8 w-8 mb-3 opacity-40" />
                <p className="text-sm font-bold text-foreground mb-1">
                  {isAr ? "اختر قسماً من القائمة" : "Select a section"}
                </p>
                <p className="text-xs">
                  {isAr
                    ? "اختر إحدى التصنيفات من القائمة الجانبية لعرض إعداداتها، أو ابحث أعلى الصفحة."
                    : "Pick a category from the sidebar, or use the search above."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
