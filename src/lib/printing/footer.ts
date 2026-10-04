import type { CompanyProfile } from "./company-profile";

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");

export function renderUniversalFooter(
  company: CompanyProfile,
  rtl = true,
  compact = false,
): string {
  const contact = company.footerContact || company.contacts.join(" · ");
  return `<footer class="universal-footer" dir="${rtl ? "rtl" : "ltr"}">
    ${company.footerText ? `<div class="footer-note">${esc(company.footerText)}</div>` : ""}
    <div class="footer-contact">${esc(contact)}</div>
    ${company.email ? `<div class="footer-email">${esc(company.email)}</div>` : ""}
    ${!compact && company.address ? `<div class="footer-address">${esc(company.address)}</div>` : ""}
  </footer>`;
}

export const UNIVERSAL_FOOTER_CSS = `.universal-footer{margin-top:auto;padding-top:8px;border-top:1px solid var(--print-line,#9ca3af);text-align:center;color:var(--print-muted,#4b5563);font-size:9px;line-height:1.45;break-inside:avoid}.universal-footer .footer-note{font-weight:600}.universal-footer .footer-contact{direction:ltr;unicode-bidi:isolate;font-weight:700}.universal-footer .footer-email,.universal-footer .footer-address{white-space:pre-wrap}@media print{.universal-footer{break-inside:avoid}}`;

