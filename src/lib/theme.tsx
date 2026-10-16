/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ACCENT_STORAGE_KEY,
  ARCHIVE_STORAGE_KEY,
  CUSTOM_COLOR_STORAGE_KEY,
  DEFAULT_ACCENT_THEME,
  DEFAULT_COLOR_ARCHIVE,
  DEFAULT_CUSTOM_HEX,
  applyAccentThemeVariables,
  readStoredAccentTheme,
  readStoredColorArchive,
  readStoredCustomHex,
  type AccentThemeId,
  type ArchivedColor,
} from "./color-theme";

export type Theme = "dark" | "light";

const STORAGE_KEY = "theme";
const DEFAULT_THEME: Theme = "light";

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Accent Themes & Custom Color System
  accentTheme: AccentThemeId;
  setAccentTheme: (id: AccentThemeId) => void;
  customColor: string;
  setCustomColor: (hex: string) => void;
  colorArchive: ArchivedColor[];
  addToArchive: (hex: string, name_ar?: string, name_en?: string) => void;
  removeFromArchive: (idOrHex: string) => void;
  resetArchive: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* التخزين قد يكون محجوباً */
  }
  return DEFAULT_THEME;
}

/** يطبّق السمة واللون على عنصر الجذر. */
export function applyTheme(
  theme: Theme,
  accentId: AccentThemeId = readStoredAccentTheme(),
  customHex: string = readStoredCustomHex(),
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0A0A0B" : "#FBFAF9");

  // تطبيق متغيرات لون الثيم (الأزرق، الزمرد، الأرجوان، الياقوت، الذهب، التوباز أو المخصص)
  applyAccentThemeVariables(accentId, theme, customHex);
}

/**
 * سكربت الحجب قبل الرسم (Zero-Flash Head Script).
 * يقرأ السمة الفاتحة/المظلمة ولون الثيم المخصص ويطبّقهما على <html> قبل أن يرسم المتصفح أي بكسل.
 */
export const THEME_BOOT_SCRIPT = `(function(){
  try {
    var t = localStorage.getItem("${STORAGE_KEY}");
    if (t !== "dark" && t !== "light") { t = "${DEFAULT_THEME}"; }
    var r = document.documentElement;
    r.classList.toggle("dark", t === "dark");
    r.classList.toggle("light", t === "light");
    r.dataset.theme = t;
    r.style.colorScheme = t;
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) { m.setAttribute("content", t === "dark" ? "#0A0A0B" : "#FBFAF9"); }

    var a = localStorage.getItem("${ACCENT_STORAGE_KEY}") || "${DEFAULT_ACCENT_THEME}";
    r.dataset.accent = a;
    
    // خريطة سريعة للألوان الستة
    var presets = {
      emerald: {
        dark: { p: "oklch(0.68 0.20 155)", fg: "oklch(1 0 0)", r: "oklch(0.68 0.20 155 / 0.6)", sp: "oklch(0.68 0.20 155)", tp: "oklch(0.68 0.20 155 / 0.20)" },
        light: { p: "oklch(0.54 0.18 155)", fg: "oklch(0.99 0.01 55)", r: "oklch(0.54 0.18 155 / 0.5)", sp: "oklch(0.50 0.18 155)", tp: "oklch(0.54 0.18 155 / 0.12)" }
      },
      amethyst: {
        dark: { p: "oklch(0.66 0.24 295)", fg: "oklch(1 0 0)", r: "oklch(0.66 0.24 295 / 0.6)", sp: "oklch(0.66 0.24 295)", tp: "oklch(0.66 0.24 295 / 0.20)" },
        light: { p: "oklch(0.55 0.24 295)", fg: "oklch(0.99 0.01 55)", r: "oklch(0.55 0.24 295 / 0.5)", sp: "oklch(0.52 0.22 295)", tp: "oklch(0.55 0.24 295 / 0.12)" }
      },
      ruby: {
        dark: { p: "oklch(0.65 0.24 15)", fg: "oklch(1 0 0)", r: "oklch(0.65 0.24 15 / 0.6)", sp: "oklch(0.65 0.24 15)", tp: "oklch(0.65 0.24 15 / 0.20)" },
        light: { p: "oklch(0.55 0.23 15)", fg: "oklch(0.99 0.01 55)", r: "oklch(0.55 0.23 15 / 0.5)", sp: "oklch(0.51 0.21 15)", tp: "oklch(0.55 0.23 15 / 0.12)" }
      },
      amber: {
        dark: { p: "oklch(0.74 0.19 75)", fg: "oklch(0.12 0 0)", r: "oklch(0.74 0.19 75 / 0.6)", sp: "oklch(0.74 0.19 75)", tp: "oklch(0.74 0.19 75 / 0.20)" },
        light: { p: "oklch(0.58 0.18 75)", fg: "oklch(1 0 0)", r: "oklch(0.58 0.18 75 / 0.5)", sp: "oklch(0.54 0.17 75)", tp: "oklch(0.58 0.18 75 / 0.12)" }
      },
      topaz: {
        dark: { p: "oklch(0.70 0.18 215)", fg: "oklch(0.10 0 0)", r: "oklch(0.70 0.18 215 / 0.6)", sp: "oklch(0.70 0.18 215)", tp: "oklch(0.70 0.18 215 / 0.20)" },
        light: { p: "oklch(0.56 0.18 215)", fg: "oklch(1 0 0)", r: "oklch(0.56 0.18 215 / 0.5)", sp: "oklch(0.52 0.17 215)", tp: "oklch(0.56 0.18 215 / 0.12)" }
      }
    };

    if (a in presets) {
      var s = presets[a][t];
      r.style.setProperty("--primary", s.p);
      r.style.setProperty("--primary-foreground", s.fg);
      r.style.setProperty("--ring", s.r);
      r.style.setProperty("--sidebar-primary", s.sp);
      r.style.setProperty("--sidebar-primary-foreground", s.fg);
      r.style.setProperty("--sidebar-ring", s.r);
      r.style.setProperty("--tone-primary", s.tp);
    } else if (a === "custom") {
      var c = localStorage.getItem("${CUSTOM_COLOR_STORAGE_KEY}") || "${DEFAULT_CUSTOM_HEX}";
      var clean = c.replace("#","");
      if(clean.length === 6) {
        var n = parseInt(clean, 16);
        var red = (n >> 16) & 255, green = (n >> 8) & 255, blue = n & 255;
        var lum = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
        var fg = lum > 0.62 ? "oklch(0.12 0 0)" : "oklch(1 0 0)";
        var rgbStr = "rgb(" + red + " " + green + " " + blue + ")";
        r.style.setProperty("--primary", rgbStr);
        r.style.setProperty("--primary-foreground", fg);
        r.style.setProperty("--ring", "rgb(" + red + " " + green + " " + blue + " / 0.55)");
        r.style.setProperty("--sidebar-primary", rgbStr);
        r.style.setProperty("--sidebar-primary-foreground", fg);
        r.style.setProperty("--sidebar-ring", "rgb(" + red + " " + green + " " + blue + " / 0.55)");
        r.style.setProperty("--tone-primary", "rgb(" + red + " " + green + " " + blue + " / 0.15)");
      }
    }
  } catch(e) {}
})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [accentTheme, setAccentThemeState] = useState<AccentThemeId>(readStoredAccentTheme);
  const [customColor, setCustomColorState] = useState<string>(readStoredCustomHex);
  const [colorArchive, setColorArchive] = useState<ArchivedColor[]>(readStoredColorArchive);

  const hydrated = useRef(false);

  useEffect(() => {
    applyTheme(theme, accentTheme, customColor);
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
      localStorage.setItem(ACCENT_STORAGE_KEY, accentTheme);
      localStorage.setItem(CUSTOM_COLOR_STORAGE_KEY, customColor);
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(colorArchive));
    } catch {
      /* التخزين غير متاح */
    }
  }, [theme, accentTheme, customColor, colorArchive]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  const setAccentTheme = useCallback(
    (id: AccentThemeId) => {
      setAccentThemeState(id);
      applyAccentThemeVariables(id, theme, customColor);
      try {
        localStorage.setItem(ACCENT_STORAGE_KEY, id);
      } catch {}
    },
    [theme, customColor],
  );

  const setCustomColor = useCallback(
    (hex: string) => {
      const formatted = hex.startsWith("#") ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
      setCustomColorState(formatted);
      if (accentTheme === "custom") {
        applyAccentThemeVariables("custom", theme, formatted);
      }
      try {
        localStorage.setItem(CUSTOM_COLOR_STORAGE_KEY, formatted);
      } catch {}
    },
    [accentTheme, theme],
  );

  const addToArchive = useCallback((hex: string, name_ar?: string, name_en?: string) => {
    const formatted = hex.startsWith("#") ? hex.toUpperCase() : `#${hex.toUpperCase()}`;
    setColorArchive((prev) => {
      if (prev.some((item) => item.hex.toUpperCase() === formatted)) {
        return prev; // مسجل بالفعل
      }
      const newItem: ArchivedColor = {
        id: `custom-${Date.now()}`,
        hex: formatted,
        name_ar: name_ar || `لون مخصص (${formatted})`,
        name_en: name_en || `Custom ${formatted}`,
        isPreset: false,
      };
      const next = [newItem, ...prev];
      try {
        localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const removeFromArchive = useCallback((idOrHex: string) => {
    setColorArchive((prev) => {
      const next = prev.filter(
        (item) => item.id !== idOrHex && item.hex.toUpperCase() !== idOrHex.toUpperCase(),
      );
      try {
        localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const resetArchive = useCallback(() => {
    setColorArchive(DEFAULT_COLOR_ARCHIVE);
    try {
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(DEFAULT_COLOR_ARCHIVE));
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        accentTheme,
        setAccentTheme,
        customColor,
        setCustomColor,
        colorArchive,
        addToArchive,
        removeFromArchive,
        resetArchive,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // خارج المزوّد (اختبارات معزولة):
  return {
    theme: readStoredTheme(),
    setTheme: (t) => applyTheme(t, readStoredAccentTheme(), readStoredCustomHex()),
    toggleTheme: () => {
      const next = readStoredTheme() === "dark" ? "light" : "dark";
      applyTheme(next, readStoredAccentTheme(), readStoredCustomHex());
    },
    accentTheme: readStoredAccentTheme(),
    setAccentTheme: (id) => applyAccentThemeVariables(id, readStoredTheme(), readStoredCustomHex()),
    customColor: readStoredCustomHex(),
    setCustomColor: () => {},
    colorArchive: readStoredColorArchive(),
    addToArchive: () => {},
    removeFromArchive: () => {},
    resetArchive: () => {},
  };
}
