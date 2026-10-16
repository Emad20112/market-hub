import type { CompanyProfile } from "./company-profile";
import { SUPPORT_CONTACTS, SUPPORT_CONTACT_LINE, companyCreditLine } from "@/lib/company-credit";

/**
 * إعادة تصدير عبارة الاعتماد من وحدة الفوتر.
 * القوالب التي تبني تذييلها بنفسها (كالصور الحرارية) تستوردها من هنا بدل
 * وحدة الاعتماد، فلا تحمل ملفات `lib/templates` أي اسم مؤسسة ثابت.
 */
export { companyCreditLine };

const esc = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * الفوتر الموحد — يُستخدم في كل القوالب والممرات (فواتير، سندات، كشوفات،
 * تقارير، مخزون، تحويلات، مطحنة، حراري، PDF، معاينة).
 *
 * يعرض بيانات تواصل المنشأة/المطحنة وأرقام الدعم المعتمدة وعلامة الاعتماد
 * في سطر اعتماد ثابت ومنفصل يمنع اختفاء الأرقام عند تعديل بيانات العميل أو المنشأة.
 */
export function renderUniversalFooter(
  company: CompanyProfile,
  rtl = true,
  compact = false,
): string {
  const companyPhone =
    company.phone ||
    (company.contacts && company.contacts.length > 0
      ? company.contacts.filter((c) => !(SUPPORT_CONTACTS as readonly string[]).includes(c)).join(" · ")
      : "") ||
    "";

  return `<footer class="universal-footer" dir="${rtl ? "rtl" : "ltr"}">
    ${company.name ? `<div class="footer-company">${esc(company.name)}</div>` : ""}
    ${company.footerText ? `<div class="footer-note">${esc(company.footerText)}</div>` : ""}
    ${companyPhone ? `<div class="footer-contact"><span class="footer-phone-label">${rtl ? "هاتف المنشأة:" : "Phone:"}</span><span dir="ltr">${esc(companyPhone)}</span></div>` : ""}
    ${company.email ? `<div class="footer-email">${esc(company.email)}</div>` : ""}
    ${!compact && company.address ? `<div class="footer-address">${esc(company.address)}</div>` : ""}
    <div class="footer-credit">${esc(companyCreditLine())}</div>
  </footer>`;
}

export const UNIVERSAL_FOOTER_CSS = `.universal-footer{margin-top:auto;padding-top:7px;border-top:1px solid var(--print-line,#cbd5e1);text-align:center;color:var(--print-muted,#475569);font-size:8.5px;line-height:1.45;break-inside:avoid;page-break-inside:avoid}.universal-footer .footer-company{font-weight:800;color:var(--print-ink,#0f172a);font-size:9.5px;margin-bottom:1px}.universal-footer .footer-note{font-weight:600;margin-bottom:2px}.universal-footer .footer-contact{direction:ltr;unicode-bidi:isolate;font-weight:700;margin:2px 0;font-size:8.5px}.universal-footer .footer-phone-label{direction:rtl;font-weight:600;margin-inline-end:4px}.universal-footer .footer-email,.universal-footer .footer-address{white-space:pre-wrap;display:inline-block;margin:0 4px}.universal-footer .footer-credit{margin-top:4px;padding-top:3px;border-top:1px dotted var(--print-line,#cbd5e1);font-weight:700;font-size:8.5px;color:var(--print-muted,#64748b);break-inside:avoid;page-break-inside:avoid;direction:ltr;unicode-bidi:isolate}@media print{.universal-footer{break-inside:avoid;page-break-inside:avoid}}`;
