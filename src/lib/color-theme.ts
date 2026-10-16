/**
 * Vortex ERP — Executive Theme & Accent Color Engine
 * 
 * Manages:
 * - 6 Curated Executive Themes (Sapphire Default, Emerald, Amethyst, Ruby, Amber, Topaz)
 * - Custom Hex Color Engine (auto-derives primary, rings, hover tones, contrast fg, sidebar accents)
 * - Color Archive (user-managed palette repository stored in localStorage)
 * - Real-time CSS Variable injection without page reloads
 * - Zero-flash pre-render head script integration
 */

export type AccentThemeId =
  | "sapphire"
  | "emerald"
  | "amethyst"
  | "ruby"
  | "amber"
  | "topaz"
  | "custom";

export interface ColorSchemeVariables {
  primary: string;
  primaryForeground: string;
  ring: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarRing: string;
  sidebarActiveRing: string;
  tonePrimary: string;
  tonePrimaryFg: string;
  toneInfo: string;
  toneInfoFg: string;
  chart1: string;
}

export interface CuratedThemeDefinition {
  id: AccentThemeId;
  name_ar: string;
  name_en: string;
  description_ar: string;
  description_en: string;
  hex: string;
  previewGradient: string;
  dark: ColorSchemeVariables;
  light: ColorSchemeVariables;
}

export interface ArchivedColor {
  id: string;
  hex: string;
  name_ar: string;
  name_en: string;
  isPreset?: boolean;
}

export const ACCENT_STORAGE_KEY = "vortex_accent_theme_id";
export const CUSTOM_COLOR_STORAGE_KEY = "vortex_custom_accent_hex";
export const ARCHIVE_STORAGE_KEY = "vortex_color_archive";
export const DEFAULT_ACCENT_THEME: AccentThemeId = "sapphire";
export const DEFAULT_CUSTOM_HEX = "#2563EB";

/**
 * الثيمات الستة المدروسة بعناية فائقة (الافتراضي + 5 ألوان تنفيذية فاخرة)
 */
export const CURATED_THEMES: Record<Exclude<AccentThemeId, "custom">, CuratedThemeDefinition> = {
  sapphire: {
    id: "sapphire",
    name_ar: "الأزرق الملكي (الافتراضي)",
    name_en: "Royal Sapphire (Default)",
    description_ar: "اللون الافتراضي المعتمد لمنظومة فورتيكس ERP - هيبة استقرار ورصانة مالية",
    description_en: "The original signature Vortex ERP theme — corporate confidence & clarity",
    hex: "#2563EB",
    previewGradient: "from-blue-600 via-indigo-600 to-blue-500",
    dark: {
      primary: "oklch(0.66 0.22 255)",
      primaryForeground: "oklch(1 0 0)",
      ring: "oklch(0.66 0.22 255 / 0.6)",
      sidebarPrimary: "oklch(0.66 0.22 255)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.66 0.22 255 / 0.6)",
      sidebarActiveRing: "oklch(1 0 0 / 0.10)",
      tonePrimary: "oklch(0.66 0.22 255 / 0.20)",
      tonePrimaryFg: "oklch(0.84 0.14 255)",
      toneInfo: "oklch(0.66 0.20 255 / 0.20)",
      toneInfoFg: "oklch(0.84 0.14 255)",
      chart1: "oklch(0.66 0.22 255)",
    },
    light: {
      primary: "oklch(0.55 0.22 258)",
      primaryForeground: "oklch(0.99 0.01 55)",
      ring: "oklch(0.55 0.22 258 / 0.5)",
      sidebarPrimary: "oklch(0.52 0.20 258)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.52 0.20 258 / 0.5)",
      sidebarActiveRing: "oklch(0.52 0.20 258 / 0.18)",
      tonePrimary: "oklch(0.55 0.22 258 / 0.12)",
      tonePrimaryFg: "oklch(0.38 0.18 258)",
      toneInfo: "oklch(0.55 0.18 255 / 0.12)",
      toneInfoFg: "oklch(0.38 0.18 255)",
      chart1: "oklch(0.55 0.20 255)",
    },
  },

  emerald: {
    id: "emerald",
    name_ar: "الزمرد الإمبراطوري",
    name_en: "Imperial Emerald",
    description_ar: "رمز الازدهار، الثراء التجاري، والنمو المالي الراسخ",
    description_en: "Prestige emerald tone — symbolizes prosperity, trading growth & balance",
    hex: "#059669",
    previewGradient: "from-emerald-600 via-teal-600 to-emerald-500",
    dark: {
      primary: "oklch(0.68 0.20 155)",
      primaryForeground: "oklch(1 0 0)",
      ring: "oklch(0.68 0.20 155 / 0.6)",
      sidebarPrimary: "oklch(0.68 0.20 155)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.68 0.20 155 / 0.6)",
      sidebarActiveRing: "oklch(1 0 0 / 0.10)",
      tonePrimary: "oklch(0.68 0.20 155 / 0.20)",
      tonePrimaryFg: "oklch(0.85 0.15 155)",
      toneInfo: "oklch(0.68 0.18 155 / 0.20)",
      toneInfoFg: "oklch(0.85 0.15 155)",
      chart1: "oklch(0.68 0.20 155)",
    },
    light: {
      primary: "oklch(0.54 0.18 155)",
      primaryForeground: "oklch(0.99 0.01 55)",
      ring: "oklch(0.54 0.18 155 / 0.5)",
      sidebarPrimary: "oklch(0.50 0.18 155)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.50 0.18 155 / 0.5)",
      sidebarActiveRing: "oklch(0.50 0.18 155 / 0.18)",
      tonePrimary: "oklch(0.54 0.18 155 / 0.12)",
      tonePrimaryFg: "oklch(0.34 0.16 155)",
      toneInfo: "oklch(0.54 0.18 155 / 0.12)",
      toneInfoFg: "oklch(0.34 0.16 155)",
      chart1: "oklch(0.54 0.18 155)",
    },
  },

  amethyst: {
    id: "amethyst",
    name_ar: "الأرجوان المخملي",
    name_en: "Royal Amethyst",
    description_ar: "فخامة ملكية متطورة توحي بالحداثة والذكاء المؤسسي المتقدم",
    description_en: "Executive regal purple — modern intelligence, luxury & prestige",
    hex: "#7C3AED",
    previewGradient: "from-purple-600 via-violet-600 to-indigo-600",
    dark: {
      primary: "oklch(0.66 0.24 295)",
      primaryForeground: "oklch(1 0 0)",
      ring: "oklch(0.66 0.24 295 / 0.6)",
      sidebarPrimary: "oklch(0.66 0.24 295)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.66 0.24 295 / 0.6)",
      sidebarActiveRing: "oklch(1 0 0 / 0.10)",
      tonePrimary: "oklch(0.66 0.24 295 / 0.20)",
      tonePrimaryFg: "oklch(0.84 0.16 295)",
      toneInfo: "oklch(0.66 0.24 295 / 0.20)",
      toneInfoFg: "oklch(0.84 0.16 295)",
      chart1: "oklch(0.66 0.24 295)",
    },
    light: {
      primary: "oklch(0.55 0.24 295)",
      primaryForeground: "oklch(0.99 0.01 55)",
      ring: "oklch(0.55 0.24 295 / 0.5)",
      sidebarPrimary: "oklch(0.52 0.22 295)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.52 0.22 295 / 0.5)",
      sidebarActiveRing: "oklch(0.52 0.22 295 / 0.18)",
      tonePrimary: "oklch(0.55 0.24 295 / 0.12)",
      tonePrimaryFg: "oklch(0.38 0.20 295)",
      toneInfo: "oklch(0.55 0.24 295 / 0.12)",
      toneInfoFg: "oklch(0.38 0.20 295)",
      chart1: "oklch(0.55 0.24 295)",
    },
  },

  ruby: {
    id: "ruby",
    name_ar: "الياقوت القرمزي",
    name_en: "Crimson Ruby",
    description_ar: "حيوية واثقة، طاقة تجارية ملهمة، وطابع تنفيذي جريء وأنيق",
    description_en: "Confident crimson jewel tone — dynamic momentum, ambition & warmth",
    hex: "#E11D48",
    previewGradient: "from-rose-600 via-pink-600 to-rose-500",
    dark: {
      primary: "oklch(0.65 0.24 15)",
      primaryForeground: "oklch(1 0 0)",
      ring: "oklch(0.65 0.24 15 / 0.6)",
      sidebarPrimary: "oklch(0.65 0.24 15)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.65 0.24 15 / 0.6)",
      sidebarActiveRing: "oklch(1 0 0 / 0.10)",
      tonePrimary: "oklch(0.65 0.24 15 / 0.20)",
      tonePrimaryFg: "oklch(0.84 0.16 15)",
      toneInfo: "oklch(0.65 0.24 15 / 0.20)",
      toneInfoFg: "oklch(0.84 0.16 15)",
      chart1: "oklch(0.65 0.24 15)",
    },
    light: {
      primary: "oklch(0.55 0.23 15)",
      primaryForeground: "oklch(0.99 0.01 55)",
      ring: "oklch(0.55 0.23 15 / 0.5)",
      sidebarPrimary: "oklch(0.51 0.21 15)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.51 0.21 15 / 0.5)",
      sidebarActiveRing: "oklch(0.51 0.21 15 / 0.18)",
      tonePrimary: "oklch(0.55 0.23 15 / 0.12)",
      tonePrimaryFg: "oklch(0.38 0.18 15)",
      toneInfo: "oklch(0.55 0.23 15 / 0.12)",
      toneInfoFg: "oklch(0.38 0.18 15)",
      chart1: "oklch(0.55 0.23 15)",
    },
  },

  amber: {
    id: "amber",
    name_ar: "الذهب الأندلسي",
    name_en: "Andalusian Gold",
    description_ar: "دفء الأصالة، بريق السبائك المالية، وهيبة المصارف العريقة",
    description_en: "Warm gold & bronze bullion — rich treasury heritage, warmth & prestige",
    hex: "#D97706",
    previewGradient: "from-amber-600 via-yellow-600 to-amber-500",
    dark: {
      primary: "oklch(0.74 0.19 75)",
      primaryForeground: "oklch(0.12 0 0)",
      ring: "oklch(0.74 0.19 75 / 0.6)",
      sidebarPrimary: "oklch(0.74 0.19 75)",
      sidebarPrimaryForeground: "oklch(0.12 0 0)",
      sidebarRing: "oklch(0.74 0.19 75 / 0.6)",
      sidebarActiveRing: "oklch(1 0 0 / 0.10)",
      tonePrimary: "oklch(0.74 0.19 75 / 0.20)",
      tonePrimaryFg: "oklch(0.88 0.14 75)",
      toneInfo: "oklch(0.74 0.19 75 / 0.20)",
      toneInfoFg: "oklch(0.88 0.14 75)",
      chart1: "oklch(0.74 0.19 75)",
    },
    light: {
      primary: "oklch(0.58 0.18 75)",
      primaryForeground: "oklch(1 0 0)",
      ring: "oklch(0.58 0.18 75 / 0.5)",
      sidebarPrimary: "oklch(0.54 0.17 75)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.54 0.17 75 / 0.5)",
      sidebarActiveRing: "oklch(0.54 0.17 75 / 0.18)",
      tonePrimary: "oklch(0.58 0.18 75 / 0.12)",
      tonePrimaryFg: "oklch(0.40 0.16 75)",
      toneInfo: "oklch(0.58 0.18 75 / 0.12)",
      toneInfoFg: "oklch(0.40 0.16 75)",
      chart1: "oklch(0.58 0.18 75)",
    },
  },

  topaz: {
    id: "topaz",
    name_ar: "التوباز البحري",
    name_en: "Oceanic Topaz",
    description_ar: "وضوح رقمي عصري، إشراقة فينتك متقدمة، ودقة تحليلية فائقة",
    description_en: "Modern cyan-teal fintech palette — crisp analytics, precision & refreshing clarity",
    hex: "#0891B2",
    previewGradient: "from-cyan-600 via-teal-600 to-cyan-500",
    dark: {
      primary: "oklch(0.70 0.18 215)",
      primaryForeground: "oklch(0.10 0 0)",
      ring: "oklch(0.70 0.18 215 / 0.6)",
      sidebarPrimary: "oklch(0.70 0.18 215)",
      sidebarPrimaryForeground: "oklch(0.10 0 0)",
      sidebarRing: "oklch(0.70 0.18 215 / 0.6)",
      sidebarActiveRing: "oklch(1 0 0 / 0.10)",
      tonePrimary: "oklch(0.70 0.18 215 / 0.20)",
      tonePrimaryFg: "oklch(0.86 0.13 215)",
      toneInfo: "oklch(0.70 0.18 215 / 0.20)",
      toneInfoFg: "oklch(0.86 0.13 215)",
      chart1: "oklch(0.70 0.18 215)",
    },
    light: {
      primary: "oklch(0.56 0.18 215)",
      primaryForeground: "oklch(1 0 0)",
      ring: "oklch(0.56 0.18 215 / 0.5)",
      sidebarPrimary: "oklch(0.52 0.17 215)",
      sidebarPrimaryForeground: "oklch(1 0 0)",
      sidebarRing: "oklch(0.52 0.17 215 / 0.5)",
      sidebarActiveRing: "oklch(0.52 0.17 215 / 0.18)",
      tonePrimary: "oklch(0.56 0.18 215 / 0.12)",
      tonePrimaryFg: "oklch(0.36 0.16 215)",
      toneInfo: "oklch(0.56 0.18 215 / 0.12)",
      toneInfoFg: "oklch(0.36 0.16 215)",
      chart1: "oklch(0.56 0.18 215)",
    },
  },
};

/**
 * الأرشيف الأولي للألوان المحفوظة (Default Curated Swatches)
 */
export const DEFAULT_COLOR_ARCHIVE: ArchivedColor[] = [
  { id: "arc-1", hex: "#2563EB", name_ar: "أزرق ملكي سافيري", name_en: "Royal Sapphire", isPreset: true },
  { id: "arc-2", hex: "#059669", name_ar: "زمرد الغابات التجاري", name_en: "Forest Emerald", isPreset: true },
  { id: "arc-3", hex: "#7C3AED", name_ar: "أرجوان ملكي عميق", name_en: "Royal Amethyst", isPreset: true },
  { id: "arc-4", hex: "#E11D48", name_ar: "ياقوت قرمزي فاخر", name_en: "Crimson Ruby", isPreset: true },
  { id: "arc-5", hex: "#D97706", name_ar: "ذهب أندلسي عتيق", name_en: "Andalusian Amber", isPreset: true },
  { id: "arc-6", hex: "#0891B2", name_ar: "توباز بحري نقي", name_en: "Oceanic Topaz", isPreset: true },
  { id: "arc-7", hex: "#4F46E5", name_ar: "نيلي إنسايت تكنولوجي", name_en: "Tech Indigo", isPreset: true },
  { id: "arc-8", hex: "#DB2777", name_ar: "فوشيا مخملي راقٍ", name_en: "Velvet Magenta", isPreset: true },
  { id: "arc-9", hex: "#0D9488", name_ar: "بترولي كلاسيكي", name_en: "Classic Teal", isPreset: true },
  { id: "arc-10", hex: "#64748B", name_ar: "سليت تيتانيوم صلب", name_en: "Titanium Slate", isPreset: true },
];

/** تحويل Hex إلى RGB عادي */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "").trim();
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  if (isNaN(num)) return { r: 37, g: 99, b: 235 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/** احتساب لون النص المتباين تلقائياً لضمان قراءة مثالية بنسبة تباين عالية */
export function getContrastForeground(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "oklch(0.12 0 0)" : "oklch(1 0 0)";
}

/** توليد متغيرات اللون المخصص الكاملة بناءً على كود Hex */
export function deriveCustomColorVariables(hex: string): { dark: ColorSchemeVariables; light: ColorSchemeVariables } {
  const { r, g, b } = hexToRgb(hex);
  const fg = getContrastForeground(hex);

  // تمثيل بالـ rgb لمتوافقية شاملة
  const darkPrimary = `rgb(${r} ${g} ${b})`;
  const lightPrimary = `rgb(${Math.max(0, Math.floor(r * 0.9))} ${Math.max(0, Math.floor(g * 0.9))} ${Math.max(0, Math.floor(b * 0.9))})`;

  return {
    dark: {
      primary: darkPrimary,
      primaryForeground: fg,
      ring: `rgb(${r} ${g} ${b} / 0.6)`,
      sidebarPrimary: darkPrimary,
      sidebarPrimaryForeground: fg,
      sidebarRing: `rgb(${r} ${g} ${b} / 0.6)`,
      sidebarActiveRing: "oklch(1 0 0 / 0.10)",
      tonePrimary: `rgb(${r} ${g} ${b} / 0.20)`,
      tonePrimaryFg: `rgb(${Math.min(255, r + 45)} ${Math.min(255, g + 45)} ${Math.min(255, b + 45)})`,
      toneInfo: `rgb(${r} ${g} ${b} / 0.20)`,
      toneInfoFg: `rgb(${Math.min(255, r + 45)} ${Math.min(255, g + 45)} ${Math.min(255, b + 45)})`,
      chart1: darkPrimary,
    },
    light: {
      primary: lightPrimary,
      primaryForeground: fg,
      ring: `rgb(${r} ${g} ${b} / 0.5)`,
      sidebarPrimary: lightPrimary,
      sidebarPrimaryForeground: fg,
      sidebarRing: `rgb(${r} ${g} ${b} / 0.5)`,
      sidebarActiveRing: `rgb(${r} ${g} ${b} / 0.18)`,
      tonePrimary: `rgb(${r} ${g} ${b} / 0.12)`,
      tonePrimaryFg: `rgb(${Math.max(0, r - 30)} ${Math.max(0, g - 30)} ${Math.max(0, b - 30)})`,
      toneInfo: `rgb(${r} ${g} ${b} / 0.12)`,
      toneInfoFg: `rgb(${Math.max(0, r - 30)} ${Math.max(0, g - 30)} ${Math.max(0, b - 30)})`,
      chart1: lightPrimary,
    },
  };
}

/** تطبيق حزمة المتغيرات على عنصر جذر الوثيقة */
export function applyAccentThemeVariables(
  themeId: AccentThemeId,
  mode: "dark" | "light",
  customHex = DEFAULT_CUSTOM_HEX,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  let vars: ColorSchemeVariables;
  if (themeId === "custom") {
    const derived = deriveCustomColorVariables(customHex);
    vars = mode === "dark" ? derived.dark : derived.light;
  } else {
    const themeDef = CURATED_THEMES[themeId] || CURATED_THEMES.sapphire;
    vars = mode === "dark" ? themeDef.dark : themeDef.light;
  }

  root.style.setProperty("--primary", vars.primary);
  root.style.setProperty("--primary-foreground", vars.primaryForeground);
  root.style.setProperty("--ring", vars.ring);
  root.style.setProperty("--sidebar-primary", vars.sidebarPrimary);
  root.style.setProperty("--sidebar-primary-foreground", vars.sidebarPrimaryForeground);
  root.style.setProperty("--sidebar-ring", vars.sidebarRing);
  root.style.setProperty("--sidebar-active-ring", vars.sidebarActiveRing);
  root.style.setProperty("--tone-primary", vars.tonePrimary);
  root.style.setProperty("--tone-primary-fg", vars.tonePrimaryFg);
  root.style.setProperty("--chart-1", vars.chart1);
  root.dataset.accent = themeId;
}

/** قراءة الثيم النشط من التخزين المحلي */
export function readStoredAccentTheme(): AccentThemeId {
  if (typeof window === "undefined") return DEFAULT_ACCENT_THEME;
  try {
    const val = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentThemeId;
    if (val && (val === "custom" || val in CURATED_THEMES)) return val;
  } catch {
    /* fallback */
  }
  return DEFAULT_ACCENT_THEME;
}

/** قراءة اللون المخصص المحفوظ */
export function readStoredCustomHex(): string {
  if (typeof window === "undefined") return DEFAULT_CUSTOM_HEX;
  try {
    const val = localStorage.getItem(CUSTOM_COLOR_STORAGE_KEY);
    if (val && /^#[0-9A-Fa-f]{6}$/.test(val)) return val.toUpperCase();
  } catch {
    /* fallback */
  }
  return DEFAULT_CUSTOM_HEX;
}

/** قراءة أرشيف الألوان المحفوظ */
export function readStoredColorArchive(): ArchivedColor[] {
  if (typeof window === "undefined") return DEFAULT_COLOR_ARCHIVE;
  try {
    const raw = localStorage.getItem(ARCHIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* fallback */
  }
  return DEFAULT_COLOR_ARCHIVE;
}
