import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** إعدادات أبعاد الفهرس، قابلة للاختيار لكل نشاط. */
export interface CatalogModulesConfig {
  enableUnits: boolean; // الوحدات والعبوات
  enableGrainGrades: boolean; // درجات وأصناف الحبوب
  enablePackagingBags: boolean; // مستلزمات التعبئة والتغليف

  enableMakesAndModels: boolean;
  enableOrigins: boolean;
  enableQualityGrades: boolean;
  enableBrands: boolean;
}

const STORAGE_KEY = "vortex_catalog_modules_v1";
const EVENT_NAME = "vortex_catalog_modules_changed";

export const DEFAULT_CATALOG_CONFIG: CatalogModulesConfig = {
  enableUnits: true,
  enableGrainGrades: true,
  enablePackagingBags: true,
  enableMakesAndModels: false,
  enableOrigins: false,
  enableQualityGrades: false,
  enableBrands: false,
};

/**
 * يقبل الإعدادات القديمة والجديدة، ويكمل المفاتيح غير الموجودة بالقيم الافتراضية.
 */
function coerceConfig(raw: unknown): CatalogModulesConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const pick = (key: keyof CatalogModulesConfig): boolean | undefined =>
    typeof source[key] === "boolean" ? (source[key] as boolean) : undefined;

  const units = pick("enableUnits");
  const grades = pick("enableGrainGrades");
  const bags = pick("enablePackagingBags");
  if (units === undefined && grades === undefined && bags === undefined) return null;

  return {
    ...DEFAULT_CATALOG_CONFIG,
    enableUnits: units ?? DEFAULT_CATALOG_CONFIG.enableUnits,
    enableGrainGrades: grades ?? DEFAULT_CATALOG_CONFIG.enableGrainGrades,
    enablePackagingBags: bags ?? DEFAULT_CATALOG_CONFIG.enablePackagingBags,
    enableMakesAndModels:
      pick("enableMakesAndModels") ?? DEFAULT_CATALOG_CONFIG.enableMakesAndModels,
    enableOrigins: pick("enableOrigins") ?? DEFAULT_CATALOG_CONFIG.enableOrigins,
    enableQualityGrades: pick("enableQualityGrades") ?? DEFAULT_CATALOG_CONFIG.enableQualityGrades,
    enableBrands: pick("enableBrands") ?? DEFAULT_CATALOG_CONFIG.enableBrands,
  };
}

export function getCatalogModulesConfig(): CatalogModulesConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CATALOG_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CATALOG_CONFIG };
    const coerced = coerceConfig(JSON.parse(raw));
    if (coerced) return coerced;

    return { ...DEFAULT_CATALOG_CONFIG };
  } catch {
    return { ...DEFAULT_CATALOG_CONFIG };
  }
}

export function saveCatalogModulesConfig(config: CatalogModulesConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: config }));

    void supabase
      .from("company_settings")
      .update({ catalog_modules: config } as any)
      .eq("id", 1)
      .then(
        () => {},
        () => {},
      );
  } catch (err) {
    console.error("Failed to save catalog modules config:", err);
  }
}

export function useCatalogModules() {
  const [config, setConfigState] = useState<CatalogModulesConfig>(() => getCatalogModulesConfig());

  useEffect(() => {
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent<CatalogModulesConfig>;
      if (customEvent.detail) {
        setConfigState(customEvent.detail);
      } else {
        setConfigState(getCatalogModulesConfig());
      }
    };
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // الإعداد يُخزَّن في القاعدة أيضاً ليصل إلى الأجهزة الأخرى.
  useEffect(() => {
    supabase
      .from("company_settings")
      .select("catalog_modules" as any)
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        const remote = coerceConfig((data as any).catalog_modules);
        if (!remote) return;
        setConfigState(remote);
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
        }
      });
  }, []);

  const updateConfig = (updates: Partial<CatalogModulesConfig>) => {
    const next: CatalogModulesConfig = { ...config, ...updates };
    setConfigState(next);
    saveCatalogModulesConfig(next);
  };

  const isTabEnabled = (
    tab:
      | "categories"
      | "units"
      | "grain_grades"
      | "packaging_bags"
      // أبعاد مغلقة: تقبلها الدالة لتبقى الشاشات الأخرى متوافقة، لكنها لا
      // تُدرج في شريط التبويبات أبداً.
      | "brands"
      | "origins"
      | "qualities"
      | "makes"
      | "models",
  ): boolean => {
    switch (tab) {
      case "categories":
        return true; // التصنيف بنية أساسية، لا يُخفى
      case "units":
        return config.enableUnits;
      case "grain_grades":
        return config.enableGrainGrades;
      case "packaging_bags":
        return config.enablePackagingBags;
      case "brands":
        return config.enableBrands;
      case "origins":
        return config.enableOrigins;
      case "qualities":
        return config.enableQualityGrades;
      case "makes":
      case "models":
        return config.enableMakesAndModels;
      default:
        return false;
    }
  };

  return { config, updateConfig, isTabEnabled };
}
