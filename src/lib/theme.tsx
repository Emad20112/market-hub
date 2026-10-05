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

export type Theme = "dark" | "light";

const STORAGE_KEY = "theme";
const DEFAULT_THEME: Theme = "light";

/**
 * مصدر واحد لحالة السمة.
 *
 * كان قبل: الحالة تعيش داخل `useState` في `app-shell`. غلاف التطبيق يُركَّب بعد
 * تسجيل الدخول فقط، فالصفحات العامة (تسجيل الدخول) والمكوّنات التي تُرسم قبله
 * (شاشة البداية، الإرشاد الترحيبي) لم تكن ترى السمة إطلاقاً. أثر ذلك:
 *  - ألوان المظهر الفاتح لا تُطبَّق إلا جزئياً،
 *  - وخيار الوضع الليلي المُبدَّل قبل الدخول كان يُقرأ خطأً من مفتاحين مختلفين.
 *
 * الآن: مزوّد واحد يُركَّب فوق الجذر كله، والترتيب موحّد على مستويين:
 *  1) التخزين المحلي (يُطبَّق قبل أول رسم عبر السكربت في __root حتى لا يومض),
 *  2) قيمة الشركة/المستخدم القادمة من الخادم (تُطبَّق مرة واحدة عند وصولها,
 *     ولا تعيد الكتابة على اختيار المستخدم اللاحق).
 */
const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
} | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* التخزين قد يكون محجوباً (وضع خاص/حصة ممتلئة) — الافتراضي يكفي */
  }
  return DEFAULT_THEME;
}

/** يطبّق السمة على عنصر الجذر. الدالة الوحيدة المسموح لها لمس الكلاس. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0A0A0B" : "#FBFAF9");
}

/**
 * سكربت الحجب قبل الرسم.
 *
 * يُوضع في `<head>` كأول شيء تنفيذي، فيقرأ الاختيار المحفوظ ويطبّقه على `<html>`
 * قبل أن يرسم المتصفح أي بكسل. بدونه يبدأ الصفحة دائماً بالوضع الفاتح (كلاس
 * `light` في الجذر) ثم ينقلب ليلاً بعد ترطيب React — وميضٌ أزرق مزعج في كل تحميل.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="dark"&&t!=="light"){t="${DEFAULT_THEME}"}var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.classList.toggle("light",t==="light");r.dataset.theme=t;r.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",t==="dark"?"#0A0A0B":"#FBFAF9")}}catch(e){}})();`;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // يمنع إعادة تطبيق الاختيار المحفوظ فوق تغييرٍ صار في نفس الجلسة.
  const hydrated = useRef(false);

  useEffect(() => {
    applyTheme(theme);
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* التخزين غير متاح — السمة تبقى صحيحة للجلسة الحالية */
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === "dark" ? "light" : "dark")),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  // خارج المزوّد (اختبارات/لقطات معزولة): نسقط إلى قراءة مباشرة بدل الانهيار.
  return {
    theme: readStoredTheme(),
    setTheme: (theme: Theme) => applyTheme(theme),
    toggleTheme: () => applyTheme(readStoredTheme() === "dark" ? "light" : "dark"),
  };
}
