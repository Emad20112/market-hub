import { supabase } from "@/integrations/supabase/client";

export interface CompanyProfile {
  name: string;
  arabicName?: string;
  englishName?: string;
  legalName?: string;
  phone?: string;
  contacts: string[];
  address?: string;
  email?: string;
  taxNumber?: string;
  logoUrl?: string;
  footerText?: string;
  footerContact?: string;
  currency?: string;
}

const CACHE_KEY = "company_settings_cache";
const DEFAULT_PROFILE: CompanyProfile = {
  name: "Vortex ERP",
  contacts: ["784795104"],
  footerText: "",
  footerContact: "784795104 · 772217218",
  logoUrl: "/inama-soft-logo.ico",
};

function fromRow(row: Record<string, unknown> | null | undefined): CompanyProfile {
  const phone = String(row?.phone ?? "").trim();
  const extra = String(row?.contact_numbers ?? "")
    .split(/[,،\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
  return {
    name: String(row?.name ?? "").trim() || DEFAULT_PROFILE.name,
    arabicName: String(row?.name_ar ?? "").trim() || undefined,
    englishName: String(row?.name_en ?? "").trim() || undefined,
    legalName: String(row?.legal_name ?? "").trim() || undefined,
    phone: phone || undefined,
    contacts: Array.from(new Set([phone, ...extra, "784795104"].filter(Boolean))),
    address: String(row?.address ?? "").trim() || undefined,
    email: String(row?.email ?? "").trim() || undefined,
    taxNumber: String(row?.tax_number ?? "").trim() || undefined,
    logoUrl: String(row?.logo_url ?? "").trim() || DEFAULT_PROFILE.logoUrl,
    footerText: String(row?.footer_text ?? "").trim() || undefined,
    footerContact: String(row?.footer_contact ?? "").trim() || "784795104 · 772217218",
    currency: String(row?.currency_symbol ?? row?.currency ?? "").trim() || undefined,
  };
}

export function getCachedCompanyProfile(): CompanyProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...fromRow(JSON.parse(raw)) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function cacheCompanyProfile(row: Record<string, unknown>): CompanyProfile {
  const profile = fromRow(row);
  if (typeof window !== "undefined") localStorage.setItem(CACHE_KEY, JSON.stringify(row));
  return profile;
}

export async function loadCompanyProfile(): Promise<CompanyProfile> {
  const cached = getCachedCompanyProfile();
  const { data, error } = await supabase
    .from("company_settings")
    .select("*")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error || !data) return cached;
  return cacheCompanyProfile(data as Record<string, unknown>);
}

export const DEFAULT_COMPANY_PROFILE = DEFAULT_PROFILE;

