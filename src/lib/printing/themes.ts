export type PrintTheme = "standard" | "luxury" | "formal";

export interface ThemeTokens {
  id: PrintTheme;
  accent: string;
  accentSoft: string;
  ink: string;
  muted: string;
  line: string;
  surface: string;
  radius: string;
}

export const PRINT_THEMES: Record<PrintTheme, ThemeTokens> = {
  standard: {
    id: "standard",
    accent: "#1d4ed8",
    accentSoft: "#eff6ff",
    ink: "#172033",
    muted: "#526174",
    line: "#d8e0ea",
    surface: "#f8fafc",
    radius: "6px",
  },
  luxury: {
    id: "luxury",
    accent: "#9a6b16",
    accentSoft: "#fbf7ea",
    ink: "#292217",
    muted: "#6c6251",
    line: "#dfd2ae",
    surface: "#fdfbf5",
    radius: "8px",
  },
  formal: {
    id: "formal",
    accent: "#111827",
    accentSoft: "#f3f4f6",
    ink: "#111827",
    muted: "#4b5563",
    line: "#9ca3af",
    surface: "#f9fafb",
    radius: "2px",
  },
};

export function normalizeTheme(value?: string): PrintTheme {
  if (value === "elegant" || value === "luxury") return "luxury";
  if (value === "formal") return "formal";
  return "standard";
}

