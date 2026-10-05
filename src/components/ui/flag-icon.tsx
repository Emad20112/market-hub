import { useState } from "react";
import { cn } from "@/lib/utils";

interface FlagIconProps {
  /** ISO 3166-1 alpha-2 country code (e.g. "YE", "SA", "US") */
  code: string;
  /** Optional emoji fallback if image fails */
  emoji?: string;
  /** CSS size class — defaults to "size-5" */
  size?: string;
  className?: string;
}

/**
 * Renders a country flag as an SVG image from flagcdn.com.
 *
 * Emoji flags (🇾🇪) don't render as colorful flags on Windows desktop browsers
 * — they appear as two-letter ISO codes. This component solves that by using
 * CDN-hosted SVG flag images with an emoji fallback.
 */
export function FlagIcon({ code, emoji, size = "size-5", className }: FlagIconProps) {
  const [imgError, setImgError] = useState(false);
  const lowerCode = code?.toLowerCase();

  // If no valid code or image failed, show emoji or globe
  if (!lowerCode || imgError) {
    return (
      <span className={cn("inline-flex items-center justify-center leading-none", size, className)}>
        {emoji || "🌐"}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/${lowerCode}.svg`}
      alt={code}
      className={cn("inline-block rounded-[3px] object-cover", size, className)}
      style={{ aspectRatio: "4/3" }}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
}

/**
 * Extracts the country code from a currency code.
 * Most ISO 4217 currency codes share the first 2 letters with
 * the ISO 3166-1 country code (e.g. USD → US, YER → YE, SAR → SA).
 */
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  EUR: "eu",
  XAF: "cm",
  XOF: "sn",
  XCD: "ag",
  XPF: "pf",
};

export function currencyToCountryCode(currencyCode: string): string | null {
  if (CURRENCY_TO_COUNTRY[currencyCode]) return CURRENCY_TO_COUNTRY[currencyCode];
  if (/^[A-Z]{3}$/.test(currencyCode)) return currencyCode.slice(0, 2).toLowerCase();
  return null;
}
