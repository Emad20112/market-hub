/**
 * Unified Modern Layout — القالب الموحد لكل المستندات الفاخرة والمؤسسية.
 *
 * تصميمان متقدمان عاليَا الدقة مستوحيان من النماذج المعتمدة:
 * 1. القالب التنفيذي الفاخر (Executive Luxury - مستوحى من النموذج الأول بألوان كحلية وزرقاء ملكية).
 * 2. القالب القياسي المؤسسي (Corporate Standard - مستوحى من النموذج الثاني بأسلوب الشركات العصري).
 *
 * كلاهما يدعم أحجام A4 و A5 بذكاء مع تناسق كامل في الطباعة والمعاينة
 * مع الحفاظ على كافة الحقول والبيانات الحسابية والباركود و QR والفوتر الموحد.
 */

import {
  UnifiedDocumentData,
  InvoiceLabels,
  escapeHtml,
  formatMoney,
  DEFAULT_COMPANY_LOGO,
  CustomFieldOptions,
} from "./types";
import { numberToArabicWords } from "./tafqeet";
import { PRINT_THEMES, deriveThemeTokens, type PrintTheme } from "@/lib/printing/themes";
import { renderUniversalFooter, UNIVERSAL_FOOTER_CSS } from "@/lib/printing/footer";
import { getCachedCompanyProfile, type CompanyProfile } from "@/lib/printing/company-profile";
import { generateBarcodeSvg, generateQrCodeSvg } from "@/lib/printing/barcode-qr";
import { getUnifiedPrintSettings } from "@/lib/printing/settings";
import type { PaperProfileId } from "./paper-profiles";

export interface UnifiedLayoutOptions extends CustomFieldOptions {
  /** نمط المستند — يغيّر الهيكل والسمة البصرية (standard / luxury / formal). */
  theme?: PrintTheme;
  /** بيانات الشركة؛ إن لم تُمرَّر تُقرأ من كاش Company Profile. */
  company?: CompanyProfile;
  /** مقاس الورق الحالي للمستند لضبط الأبعاد والهوامش ونسب الخطوط (A4 / A5) */
  paperProfileId?: PaperProfileId | string;
}

function themeCss(
  theme: PrintTheme,
  rtl: boolean,
  customAccent?: string | null,
  isA5 = false,
): string {
  const t = deriveThemeTokens(theme, customAccent);
  const isLuxury = theme === "luxury";

  // مقاييس متجاوبة ودقيقة بين أحجام A4 و A5 لمنع الانقسام وتداخل الخطوط
  const baseFontSize = isA5 ? "9.5px" : "11px";
  const baseLineHeight = isA5 ? "1.38" : "1.45";
  const containerPadding = isA5 ? "5mm 7mm" : "9mm 11mm";
  const containerMinHeight = isA5 ? "200mm" : "285mm";
  const headerPadding = isA5 ? "8px 10px" : "12px 16px";
  const logoBoxSize = isA5 ? "44px" : "68px";
  const companyTitleSize = isA5 ? "14.5px" : "18.5px";
  const companySubtitleSize = isA5 ? "8.5px" : "10px";
  const invoiceTitleSize = isA5 ? "15px" : "20px";
  const cardPadding = isA5 ? "6px 8px" : "9px 12px";
  const cardLabelSize = isA5 ? "8px" : "9px";
  const cardValueSize = isA5 ? "10.5px" : "12px";
  const tableThPadding = isA5 ? "6px 7px" : "8px 12px";
  const tableTdPadding = isA5 ? "5px 7px" : "7px 12px";
  const notesPadding = isA5 ? "7px 9px" : "10px 14px";
  const totalsPadding = isA5 ? "8px 10px" : "11px 14px";
  const totalAmountSize = isA5 ? "14px" : "17px";
  const bannerTotalDuePadding = isA5 ? "5px 10px" : "7px 14px";

  // ألوان متناسقة مشتقة
  const primaryAccent = t.accent;
  const softAccent = t.accentSoft;
  const darkNavy = isLuxury ? "#0a192f" : "#0f172a";
  const secondaryAccent = isLuxury ? "#1e40af" : "#0284c7";

  return `
    :root {
      --print-accent: ${t.accent};
      --print-accent-soft: ${t.accentSoft};
      --print-ink: ${t.ink};
      --print-muted: ${t.muted};
      --print-line: ${t.line};
      --print-surface: ${t.surface};
      --print-radius: ${t.radius};
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0; padding: 0;
      background: ${t.surface};
      color: var(--print-ink);
      font-family: 'Cairo', 'Tajawal', system-ui, -apple-system, sans-serif;
      font-size: ${baseFontSize};
      line-height: ${baseLineHeight};
      direction: ${rtl ? "rtl" : "ltr"};
      text-align: ${rtl ? "right" : "left"};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* الحاوية الرئيسية للورقة */
    .page-container {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      background: #ffffff;
      position: relative;
      padding: ${containerPadding};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: ${containerMinHeight};
      overflow: hidden;
    }

    /* ══════════════════════════════════════════════════════════════
       النمط الأول: التنفيذي الفاخر (Executive Luxury)
       أشكال هندسية مضلعة بزوايا راقية كحلية وزرقاء مستوحاة من النموذج الأول
       ══════════════════════════════════════════════════════════════ */
    .luxury-polygon-top {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: ${isA5 ? "16px" : "22px"};
      background: linear-gradient(135deg, ${darkNavy} 0%, ${darkNavy} 45%, ${primaryAccent} 45%, ${primaryAccent} 78%, ${secondaryAccent} 78%, ${secondaryAccent} 100%);
      clip-path: polygon(0 0, 100% 0, 100% 65%, 68% 100%, 0 75%);
      z-index: 1;
    }
    .luxury-polygon-bottom {
      position: absolute;
      bottom: 0;
      ${rtl ? "left: 0;" : "right: 0;"}
      width: ${isA5 ? "110px" : "160px"};
      height: ${isA5 ? "18px" : "24px"};
      background: linear-gradient(135deg, ${primaryAccent} 0%, ${darkNavy} 100%);
      clip-path: ${rtl ? "polygon(0 0, 100% 100%, 0 100%)" : "polygon(100% 0, 100% 100%, 0 100%)"};
      z-index: 1;
      opacity: 0.9;
    }

    header.luxury-header-wrap {
      position: relative;
      margin-top: ${isA5 ? "4px" : "8px"};
      margin-bottom: ${isA5 ? "9px" : "13px"};
      padding: ${headerPadding};
      background: #ffffff;
      border-bottom: 2px solid ${t.line};
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .luxury-header-grid {
      display: grid;
      grid-template-columns: 1.1fr auto 1.1fr;
      align-items: center;
      gap: ${isA5 ? "8px" : "14px"};
    }
    .luxury-header-right {
      display: flex;
      flex-direction: column;
      gap: 3px;
      text-align: right;
      direction: rtl;
    }
    .luxury-brand-title {
      font-size: ${companyTitleSize};
      font-weight: 900;
      color: ${darkNavy};
      margin: 0;
      line-height: 1.25;
      letter-spacing: -0.2px;
    }
    .luxury-brand-sub {
      font-size: ${companySubtitleSize};
      font-weight: 700;
      color: ${primaryAccent};
      letter-spacing: 0.2px;
    }
    .luxury-meta-line {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: ${isA5 ? "8.5px" : "10px"};
      color: var(--print-muted);
      font-weight: 600;
      line-height: 1.35;
    }
    .luxury-meta-line svg {
      color: ${primaryAccent};
      flex-shrink: 0;
    }
    .luxury-meta-line b {
      color: ${darkNavy};
    }

    .luxury-header-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 0 4px;
    }
    .luxury-logo-box {
      width: ${logoBoxSize};
      height: ${logoBoxSize};
      border-radius: 12px;
      background: #ffffff;
      border: 1.5px solid ${t.line};
      box-shadow: 0 2px 8px rgba(15, 43, 92, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 4px;
      flex-shrink: 0;
    }
    .luxury-logo-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .luxury-codes-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      background: #ffffff;
      padding: 2px 5px;
      border-radius: 6px;
      border: 1px dashed ${t.line};
      max-width: ${isA5 ? "110px" : "140px"};
    }

    .luxury-header-left {
      display: flex;
      flex-direction: column;
      gap: 3px;
      text-align: left;
      direction: ltr;
      align-items: flex-end;
    }
    .luxury-inv-badge-title {
      font-size: ${invoiceTitleSize};
      font-weight: 900;
      color: ${primaryAccent};
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin: 0;
      line-height: 1.2;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .luxury-inv-num-pill {
      background: linear-gradient(135deg, ${darkNavy} 0%, ${primaryAccent} 100%);
      color: #ffffff;
      padding: ${isA5 ? "2px 8px" : "3px 11px"};
      border-radius: 6px;
      font-family: ui-monospace, 'Courier New', monospace;
      font-size: ${isA5 ? "10px" : "12px"};
      font-weight: 800;
      display: inline-block;
      margin-top: 2px;
      letter-spacing: 0.5px;
    }
    .luxury-inv-details-list {
      font-size: ${isA5 ? "8.5px" : "10px"};
      color: var(--print-muted);
      line-height: 1.35;
      font-weight: 600;
      text-align: right;
      direction: rtl;
    }

    /* ══════════════════════════════════════════════════════════════
       النمط الثاني: القياسي المؤسسي (Corporate Standard)
       شريط جانبي مميز، شريط Total Due أفقي، وأسلوب مؤسسي عصري
       ══════════════════════════════════════════════════════════════ */
    .corporate-side-accent {
      position: absolute;
      top: 0;
      ${rtl ? "right: 0;" : "left: 0;"}
      bottom: 0;
      width: ${isA5 ? "5px" : "7px"};
      background: linear-gradient(180deg, ${primaryAccent} 0%, ${primaryAccent} 35%, ${secondaryAccent} 100%);
      z-index: 1;
    }
    header.corporate-header-wrap {
      margin-bottom: ${isA5 ? "8px" : "12px"};
      padding-bottom: ${isA5 ? "7px" : "11px"};
      border-bottom: 1.5px solid ${t.line};
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .corporate-header-grid {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: ${isA5 ? "8px" : "14px"};
    }
    .corporate-header-right {
      display: flex;
      flex-direction: column;
      gap: 3px;
      text-align: right;
      direction: rtl;
    }
    .corporate-brand-name {
      font-size: ${companyTitleSize};
      font-weight: 900;
      color: var(--print-ink);
      margin: 0;
      line-height: 1.25;
    }
    .corporate-brand-sub {
      font-size: ${companySubtitleSize};
      font-weight: 700;
      color: ${primaryAccent};
    }
    .corporate-header-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .corporate-logo-box {
      width: ${logoBoxSize};
      height: ${logoBoxSize};
      border-radius: 10px;
      background: #ffffff;
      border: 1px solid ${t.line};
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }
    .corporate-logo-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .corporate-header-left {
      display: flex;
      flex-direction: column;
      gap: 3px;
      text-align: left;
      direction: ltr;
      align-items: flex-end;
    }
    .corporate-inv-title {
      font-size: ${invoiceTitleSize};
      font-weight: 900;
      color: ${primaryAccent};
      margin: 0;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .corporate-total-due-ribbon {
      background: #1e293b;
      color: #ffffff;
      padding: ${bannerTotalDuePadding};
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: ${isA5 ? "8px" : "12px"};
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      break-inside: avoid;
    }
    .corporate-total-due-ribbon .due-label {
      font-size: ${isA5 ? "9.5px" : "11.5px"};
      font-weight: 800;
      letter-spacing: 0.3px;
    }
    .corporate-total-due-ribbon .due-amount {
      font-size: ${isA5 ? "13px" : "16px"};
      font-weight: 900;
      font-family: system-ui, sans-serif;
      direction: ltr;
      unicode-bidi: isolate;
      color: #38bdf8;
    }

    /* ══════════════════════════════════════════════════════════════
       البطاقات والمعلومات المنظمة (فاتورة إلى وبيانات الدفع)
       ══════════════════════════════════════════════════════════════ */
    .party-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${isA5 ? "7px" : "11px"};
      margin-bottom: ${isA5 ? "9px" : "13px"};
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .party-card {
      background: ${softAccent};
      border: 1px solid ${t.line};
      border-radius: 8px;
      padding: ${cardPadding};
      display: flex;
      flex-direction: column;
      gap: 2.5px;
      min-width: 0;
    }
    .party-card-title {
      font-size: ${cardLabelSize};
      font-weight: 800;
      color: ${primaryAccent};
      text-transform: uppercase;
      letter-spacing: 0.3px;
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 1px;
    }
    .party-card-name {
      font-size: ${cardValueSize};
      font-weight: 800;
      color: var(--print-ink);
      line-height: 1.3;
    }
    .party-card-row {
      font-size: ${isA5 ? "8px" : "9.5px"};
      color: var(--print-muted);
      line-height: 1.35;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .party-card-row b {
      color: var(--print-ink);
    }

    /* ══════════════════════════════════════════════════════════════
       جدول البنود المنظم — متطابق مع النماذج
       ══════════════════════════════════════════════════════════════ */
    .table-container {
      border: 1px solid ${t.line};
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: ${isA5 ? "9px" : "13px"};
      background: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    table.items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
    }
    table.items-table thead {
      display: table-header-group;
    }
    table.items-table thead tr {
      background: ${isLuxury ? `linear-gradient(135deg, ${darkNavy} 0%, ${primaryAccent} 100%)` : primaryAccent};
      color: #ffffff;
    }
    table.items-table thead th {
      padding: ${tableThPadding};
      font-size: ${isA5 ? "8.5px" : "10.5px"};
      font-weight: 800;
      border: none;
      letter-spacing: 0.3px;
      text-align: inherit;
    }
    .col-idx { width: 32px; text-align: center; }
    .col-desc { text-align: ${rtl ? "right" : "left"}; }
    .col-qty { width: 75px; text-align: center; }
    .col-price { width: 90px; text-align: ${rtl ? "left" : "right"}; }
    .col-total { width: 100px; text-align: ${rtl ? "left" : "right"}; font-weight: 800; }
    
    table.items-table tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table.items-table tbody td {
      padding: ${tableTdPadding};
      border-bottom: 1px solid ${t.line};
      font-size: ${isA5 ? "9px" : "11px"};
      vertical-align: middle;
    }
    table.items-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .prod-name {
      font-weight: 700;
      color: var(--print-ink);
      line-height: 1.35;
    }
    .prod-code {
      font-size: ${isA5 ? "7.5px" : "9px"};
      color: var(--print-muted);
      font-family: ui-monospace, 'Courier New', monospace;
      margin-top: 1px;
    }
    .num-isolated {
      direction: ltr;
      unicode-bidi: isolate;
      font-family: system-ui, -apple-system, sans-serif;
    }

    /* ══════════════════════════════════════════════════════════════
       القسم السفلي: الملاحظات، التفقيط، الإجماليات، والتوقيعات
       ══════════════════════════════════════════════════════════════ */
    .bottom-section-grid {
      display: grid;
      grid-template-columns: 1.15fr ${isA5 ? "230px" : "285px"};
      gap: ${isA5 ? "9px" : "13px"};
      margin-bottom: ${isA5 ? "9px" : "13px"};
      align-items: start;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .left-side-box {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tafqeet-box {
      background: ${softAccent};
      border: 1px solid ${t.line};
      border-radius: 6px;
      padding: ${isA5 ? "5px 8px" : "7px 11px"};
      font-size: ${isA5 ? "8.5px" : "10px"};
      font-weight: 700;
      color: ${primaryAccent};
      display: flex;
      align-items: center;
      gap: 5px;
      line-height: 1.35;
    }
    .thanks-notes-card {
      background: #ffffff;
      border: 1px solid ${t.line};
      border-radius: 8px;
      padding: ${notesPadding};
    }
    .thanks-title {
      font-size: ${isA5 ? "9px" : "10.5px"};
      font-weight: 800;
      color: ${primaryAccent};
      margin-bottom: 3px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .notes-content-text {
      font-size: ${isA5 ? "8.5px" : "10px"};
      color: var(--print-muted);
      line-height: 1.45;
      white-space: pre-line;
    }
    .contact-icons-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: ${isA5 ? "6px" : "10px"};
      margin-top: 5px;
      padding-top: 5px;
      border-top: 1px dashed ${t.line};
      font-size: ${isA5 ? "8px" : "9px"};
      color: var(--print-muted);
    }
    .contact-badge-item {
      display: inline-flex;
      align-items: center;
      gap: 3.5px;
      font-weight: 600;
      direction: ltr;
      unicode-bidi: isolate;
    }
    .contact-badge-item svg {
      color: ${primaryAccent};
      flex-shrink: 0;
    }

    /* صندوق الإجماليات مع مستطيل الإجمالي البارز */
    .totals-card {
      background: #ffffff;
      border: 1px solid ${t.line};
      border-radius: 8px;
      padding: ${totalsPadding};
      display: flex;
      flex-direction: column;
      gap: 3px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: ${isA5 ? "9.5px" : "11px"};
      color: var(--print-ink);
      padding: 2px 0;
    }
    .totals-row.discount-row {
      color: #b91c1c;
      font-weight: 700;
    }

    /* مستطيل الإجمالي النهائي البارز (Bold Striking Total Block) */
    .grand-total-highlight-banner {
      background: ${isLuxury ? `linear-gradient(135deg, ${darkNavy} 0%, ${primaryAccent} 100%)` : primaryAccent};
      color: #ffffff;
      border-radius: 6px;
      padding: ${isA5 ? "6px 9px" : "8px 12px"};
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    }
    .grand-total-highlight-banner .gt-label {
      font-size: ${isA5 ? "10.5px" : "12.5px"};
      font-weight: 900;
      letter-spacing: 0.2px;
    }
    .grand-total-highlight-banner .gt-amount {
      font-size: ${totalAmountSize};
      font-weight: 900;
      font-family: system-ui, -apple-system, sans-serif;
      direction: ltr;
      unicode-bidi: isolate;
    }

    /* التوقيعات */
    .signatures-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${isA5 ? "16px" : "28px"};
      margin: ${isA5 ? "4px 0 8px" : "8px 0 12px"};
      padding: 0 12px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .sig-box {
      text-align: center;
    }
    .sig-graphic {
      height: ${isA5 ? "24px" : "32px"};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${primaryAccent};
      opacity: 0.8;
    }
    .sig-line {
      border-top: 1.5px dashed ${primaryAccent};
      padding-top: 4px;
      font-size: ${isA5 ? "8.5px" : "10px"};
      font-weight: 800;
      color: var(--print-ink);
    }

    .doc-footer {
      margin-top: auto;
      break-inside: avoid;
      page-break-inside: avoid;
      position: relative;
      z-index: 2;
    }

    @media screen {
      .page-container {
        box-shadow: 0 8px 30px rgba(0,0,0,0.08);
        border-radius: 8px;
        margin: 12px auto;
        border: 1px solid ${t.line};
      }
    }
    @media print {
      body {
        background: #ffffff;
      }
      .page-container {
        box-shadow: none;
        padding: 0;
        margin: 0;
        width: 100%;
        min-height: auto;
      }
      tr, .party-card, .totals-card, .thanks-notes-card, .sig-box, header, .doc-footer {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
    ${UNIVERSAL_FOOTER_CSS}
  `;
}

/**
 * القالب الموحد — ينفّذ التصميم التنفيذي الفاخر والقياسي المؤسسي بدقة واحترافية.
 */
export function renderUnifiedLayout(
  doc: UnifiedDocumentData,
  L: InvoiceLabels,
  rtl: boolean,
  options?: UnifiedLayoutOptions,
): string {
  const theme: PrintTheme = options?.theme ?? "standard";
  const isA5 = options?.paperProfileId === "a5";
  const isLuxury = theme === "luxury";
  const unifiedSettings = getUnifiedPrintSettings();
  const customAccent =
    options?.accentColor ??
    doc.options?.accentColor ??
    (isLuxury
      ? (options?.luxuryAccentColor ?? unifiedSettings.luxuryAccentColor)
      : (options?.standardAccentColor ?? unifiedSettings.standardAccentColor)) ??
    null;
  const c = doc.currency ?? "ر.ي";
  const esc = escapeHtml;
  const money = (n?: number) => formatMoney(n ?? 0, c);
  const company = options?.company ?? getCachedCompanyProfile();
  const rawLogo =
    doc.company?.logo || (doc.company as Record<string, any>)?.logo_url || company.logoUrl;
  const logoUrl =
    rawLogo &&
    typeof rawLogo === "string" &&
    rawLogo.trim().length > 0 &&
    !rawLogo.includes("inama-soft-logo.ico")
      ? rawLogo.trim()
      : DEFAULT_COMPANY_LOGO;

  const opts = {
    showLogo: true,
    showCompanyInfo: true,
    showCustomerInfo: true,
    showDocNumberDate: true,
    showMovementInfo: true,
    showFinancialDetails: true,
    showPaymentInfo: true,
    showNotes: true,
    showSignatures: true,
    showFooter: true,
    showBarcode: true,
    showQrCode: true,
    ...options,
    ...doc.options,
  };
  if (options?.showFooter === false) opts.showFooter = false;

  const qrPayload = [
    `Seller: ${company.name || "Company"}`,
    `Invoice: ${doc.number}`,
    `Date: ${doc.date}`,
    `Total: ${doc.total || 0} ${c}`,
  ].join("\n");

  const barcodeSvg =
    opts.showBarcode !== false && doc.number ? generateBarcodeSvg(doc.number, isA5 ? 16 : 22) : "";
  const qrSvg = opts.showQrCode !== false ? generateQrCodeSvg(qrPayload, isA5 ? 42 : 54) : "";

  const companyName = company.name || doc.company?.name || "";
  const arabicName = doc.company?.arabicName || company.arabicName || companyName;
  const englishName = doc.company?.englishName || company.englishName || "";
  const companyAddress = doc.company?.address || company.address || "";
  const companyPhone =
    doc.company?.phone ||
    company.phone ||
    (company.contacts && company.contacts.length > 0 ? company.contacts.join(" · ") : "") ||
    "";
  const companyVat = doc.company?.vat || company.taxNumber || "";
  const companyEmail = doc.company?.email || company.email || "";
  const companyWebsite = doc.company?.website || "";

  const rows = doc.lines
    .map((l, i) => {
      const itemPrice = l.price ?? 0;
      const itemTotal = l.total ?? l.qty * itemPrice;
      return `
    <tr>
      <td class="col-idx">${i + 1}</td>
      <td class="col-desc">
        <div class="prod-name">${esc(l.product)}</div>
        ${l.code ? `<div class="prod-code">${rtl ? "الرمز" : "Code"}: ${esc(l.code)}</div>` : ""}
      </td>
      <td class="col-qty num-isolated">${l.qty} ${l.unit ? esc(l.unit) : rtl ? "حبة" : ""}</td>
      <td class="col-price num-isolated">${money(itemPrice)}</td>
      <td class="col-total num-isolated">${money(itemTotal)}</td>
    </tr>`;
    })
    .join("");

  const numColumns = 5;

  return `<!doctype html>
<html dir="${rtl ? "rtl" : "ltr"}" lang="${rtl ? "ar" : "en"}">
<head>
  <meta charset="utf-8">
  <title>${esc(doc.title || (rtl ? "فاتورة مبيعات" : "Sales Invoice"))} - #${esc(doc.number)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=Tajawal:wght@500;700;800&display=swap" rel="stylesheet">
  <style>${themeCss(theme, rtl, customAccent, isA5)}</style>
</head>
<body>

<div class="page-container">
  ${isLuxury ? `<div class="luxury-polygon-top"></div><div class="luxury-polygon-bottom"></div>` : `<div class="corporate-side-accent"></div>`}

  <div>
    ${
      isLuxury
        ? `<!-- ══════════ ترويسة القالب التنفيذي الفاخر (Image 1 Style) ══════════ -->
    <header class="luxury-header-wrap">
      <div class="luxury-header-grid">
        <!-- اليمين: بيانات المنشأة بالعربية -->
        <div class="luxury-header-right">
          <h1 class="luxury-brand-title">${esc(companyName || arabicName || (rtl ? "مؤسسة الأعمال المتقدمة" : "Enterprise Solutions"))}</h1>
          <div class="luxury-brand-sub">${esc(arabicName !== companyName && arabicName ? arabicName : "أنظمة وحلول تجارية وصناعية متقدمة")}</div>
          ${companyAddress ? `<div class="luxury-meta-line"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span><b>العنوان:</b> ${esc(companyAddress)}</span></div>` : ""}
          ${companyVat ? `<div class="luxury-meta-line"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg><span><b>الرقم الضريبي:</b> <span dir="ltr">${esc(companyVat)}</span></span></div>` : ""}
          ${opts.showDocNumberDate ? `<div class="luxury-meta-line"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span><b>تاريخ الإصدار:</b> <span dir="ltr">${esc(doc.date)}</span></span></div>` : ""}
        </div>

        <!-- المنتصف: الشعار ورموز QR والباركود -->
        <div class="luxury-header-center">
          ${
            opts.showLogo
              ? `
          <div class="luxury-logo-box">
            <img src="${esc(logoUrl)}" alt="Logo" onerror="this.onerror=null; this.src='${DEFAULT_COMPANY_LOGO}';" />
          </div>`
              : "<div></div>"
          }
          ${
            qrSvg || barcodeSvg
              ? `
          <div class="luxury-codes-wrap">
            ${qrSvg ? `<div>${qrSvg}</div>` : ""}
            ${barcodeSvg ? `<div>${barcodeSvg}</div>` : ""}
          </div>`
              : ""
          }
        </div>

        <!-- اليسار: عنوان الفاتورة البارز، رقم الفاتورة، والبيانات الإنجليزية -->
        <div class="luxury-header-left">
          <div class="luxury-inv-badge-title">
            <span>${esc(doc.title || "INVOICE")}</span>
          </div>
          <div class="luxury-inv-num-pill">
            #${esc(doc.number)}
          </div>
          <div class="luxury-inv-details-list">
            ${englishName ? `<div style="font-weight: 800; font-size: ${isA5 ? "9px" : "11px"}; color: var(--print-ink);">${esc(englishName)}</div>` : ""}
            ${companyPhone ? `<div dir="ltr">${esc(companyPhone)}</div>` : ""}
            ${companyEmail ? `<div dir="ltr">${esc(companyEmail)}</div>` : ""}
          </div>
        </div>
      </div>
    </header>`
        : `<!-- ══════════ ترويسة القالب القياسي المؤسسي (Image 2 Style) ══════════ -->
    <header class="corporate-header-wrap">
      <div class="corporate-header-grid">
        <!-- اليمين: بيانات المنشأة -->
        <div class="corporate-header-right">
          <h1 class="corporate-brand-name">${esc(companyName || arabicName || (rtl ? "الشركة التجارية المعتمدة" : "Standard Corporation"))}</h1>
          <div class="corporate-brand-sub">${esc(arabicName || "خدمات ومنتجات تجارية")}</div>
          ${companyAddress ? `<div class="luxury-meta-line"><span>العنوان: ${esc(companyAddress)}</span></div>` : ""}
          ${companyVat ? `<div class="luxury-meta-line"><span>الرقم الضريبي: <span dir="ltr">${esc(companyVat)}</span></span></div>` : ""}
        </div>

        <!-- المنتصف: الشعار والرموز -->
        <div class="corporate-header-center">
          ${
            opts.showLogo
              ? `
          <div class="corporate-logo-box">
            <img src="${esc(logoUrl)}" alt="Logo" onerror="this.onerror=null; this.src='${DEFAULT_COMPANY_LOGO}';" />
          </div>`
              : "<div></div>"
          }
          ${
            qrSvg || barcodeSvg
              ? `
          <div class="luxury-codes-wrap">
            ${qrSvg ? `<div>${qrSvg}</div>` : ""}
            ${barcodeSvg ? `<div>${barcodeSvg}</div>` : ""}
          </div>`
              : ""
          }
        </div>

        <!-- اليسار: عنوان الفاتورة والرقم والتاريخ -->
        <div class="corporate-header-left">
          <h2 class="corporate-inv-title">${esc(doc.title || "INVOICE")}</h2>
          <div style="font-size: ${isA5 ? "9px" : "11px"}; font-weight: 700; color: var(--print-muted);">
            رقم الفاتورة: <b style="color: var(--print-accent);">#${esc(doc.number)}</b>
          </div>
          <div style="font-size: ${isA5 ? "8.5px" : "10px"}; color: var(--print-muted);">
            التاريخ: <span dir="ltr">${esc(doc.date)}</span>
          </div>
          ${englishName ? `<div style="font-size: ${isA5 ? "8px" : "9.5px"}; text-transform: uppercase; color: var(--print-muted);">${esc(englishName)}</div>` : ""}
        </div>
      </div>
    </header>

    <!-- شريط Total Due الأفقي البارز كما في النموذج الثاني -->
    <div class="corporate-total-due-ribbon">
      <span class="due-label">المبلغ الإجمالي المستحق (Total Due):</span>
      <span class="due-amount">${money(doc.total)}</span>
    </div>`
    }

    <!-- ══════════ بطاقات العميل وبيانات الحركة والدفع ══════════ -->
    <div class="party-info-grid">
      <!-- بطاقة العميل (فاتورة إلى / Invoice To) -->
      <div class="party-card">
        <div class="party-card-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span>${esc(doc.partyLabel || L.billTo)}</span>
        </div>
        <div class="party-card-name">${esc(doc.partyName || (rtl ? "عميل نقدي عام" : "General Customer"))}</div>
        ${doc.partyPhone ? `<div class="party-card-row"><span>الهاتف:</span> <span dir="ltr">${esc(doc.partyPhone)}</span></div>` : ""}
        ${doc.partyVat ? `<div class="party-card-row"><span>الرقم الضريبي:</span> <span dir="ltr">${esc(doc.partyVat)}</span></div>` : ""}
        ${doc.partyAddress ? `<div class="party-card-row"><span>العنوان:</span> <span>${esc(doc.partyAddress)}</span></div>` : ""}
      </div>

      <!-- بطاقة بيانات الفاتورة وطريقة الدفع (Payment & Invoice Details) -->
      <div class="party-card">
        <div class="party-card-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          <span>بيانات وطريقة الدفع (Payment Details)</span>
        </div>
        <div class="party-card-row">
          <span>طريقة الدفع:</span>
          <b>${esc(doc.payment || (rtl ? "نقداً" : "Cash"))}</b>
        </div>
        <div class="party-card-row">
          <span>حالة الفاتورة:</span>
          <b>${esc(doc.status || (rtl ? "مدفوعة بالكامل" : "Paid"))}</b>
        </div>
        ${
          doc.warehouse
            ? `
        <div class="party-card-row">
          <span>المستودع:</span>
          <span>${esc(doc.warehouse)}</span>
          ${doc.destinationWarehouse ? ` ➔ <span>${esc(doc.destinationWarehouse)}</span>` : ""}
        </div>`
            : ""
        }
        ${doc.operatorName ? `<div class="party-card-row"><span>الموظف المسؤول:</span> <span>${esc(doc.operatorName)}</span></div>` : ""}
      </div>
    </div>

    <!-- ══════════ جدول البنود المنظم ══════════ -->
    <div class="table-container">
      <table class="items-table">
        <thead>
          <tr>
            <th class="col-idx">${rtl ? "م" : "#"}</th>
            <th class="col-desc">${L.product}</th>
            <th class="col-qty">${L.qty}</th>
            <th class="col-price">${L.price}</th>
            <th class="col-total">${L.total}</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${numColumns}" style="text-align:center; padding: 14px; color: var(--print-muted);">${rtl ? "لا توجد بنود مسجلة" : "No items"}</td></tr>`}
        </tbody>
      </table>
    </div>

    <!-- ══════════ القسم السفلي: التفقيط، الملاحظات، والإجماليات ══════════ -->
    <div class="bottom-section-grid">
      <div class="left-side-box">
        ${
          opts.showFinancialDetails
            ? `
        <div class="tafqeet-box">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 7V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><rect width="20" height="10" x="2" y="7" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
          <span><b>المبلغ كتابةً:</b> ${esc(numberToArabicWords(doc.total ?? 0, doc.currency))}</span>
        </div>`
            : ""
        }

        <div class="thanks-notes-card">
          <div class="thanks-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            <span>${opts.showNotes && doc.notes ? (rtl ? "ملاحظات وشروط الفاتورة" : "Terms & Notes") : rtl ? "شكرًا لتعاملكم معنا" : "Thank You For Your Business"}</span>
          </div>
          <div class="notes-content-text">${esc(doc.notes || (rtl ? "نشكركم على اختياركم، البضاعة المباعة ترد وتستبدل وفق الشروط والأنظمة المعتمدة." : "We appreciate your business."))}</div>
          
          <div class="contact-icons-row">
            ${companyPhone ? `<div class="contact-badge-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>${esc(companyPhone)}</span></div>` : ""}
            ${companyEmail ? `<div class="contact-badge-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg><span>${esc(companyEmail)}</span></div>` : ""}
            ${companyAddress ? `<div class="contact-badge-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>${esc(companyAddress)}</span></div>` : ""}
          </div>
        </div>
      </div>

      <!-- كارد الإجماليات مع مستطيل الإجمالي البارز -->
      <div class="totals-card">
        <div class="totals-row">
          <span>${L.subtotal}:</span>
          <span class="num-isolated" style="font-weight: 700;">${money(doc.subtotal)}</span>
        </div>
        ${
          doc.discount
            ? `
        <div class="totals-row discount-row">
          <span>${L.discount}:</span>
          <span class="num-isolated">- ${money(doc.discount)}</span>
        </div>`
            : ""
        }
        ${
          doc.tax
            ? `
        <div class="totals-row">
          <span>${L.tax}:</span>
          <span class="num-isolated">+ ${money(doc.tax)}</span>
        </div>`
            : ""
        }

        <!-- مستطيل الإجمالي البارز -->
        <div class="grand-total-highlight-banner">
          <span class="gt-label">${L.grandTotal}</span>
          <span class="gt-amount">${money(doc.total)}</span>
        </div>

        ${
          doc.paid !== undefined
            ? `
        <div class="totals-row" style="margin-top: 3px;">
          <span>${L.paid}:</span>
          <span class="num-isolated" style="font-weight: 700;">${money(doc.paid)}</span>
        </div>
        <div class="totals-row">
          <span>${L.balance}:</span>
          <span class="num-isolated" style="font-weight: 700; color: ${(doc.total ?? 0) - doc.paid > 0 ? "#b91c1c" : "#047857"};">${money((doc.total ?? 0) - doc.paid)}</span>
        </div>`
            : ""
        }
      </div>
    </div>

    <!-- التوقيعات -->
    ${
      opts.showSignatures
        ? `
    <div class="signatures-row">
      <div class="sig-box">
        <div class="sig-graphic">
          <svg width="100" height="28" viewBox="0 0 160 45" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 32 C 30 10, 45 40, 70 20 C 85 8, 100 35, 125 15 C 140 5, 150 25, 155 35" />
            <path d="M40 25 Q 70 5, 95 38" />
          </svg>
        </div>
        <div class="sig-line">${rtl ? "توقيع المستلم" : "Recipient Signature"}</div>
      </div>
      <div class="sig-box">
        <div class="sig-graphic">
          <svg width="100" height="28" viewBox="0 0 160 45" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 20 Q 35 5, 60 30 T 110 15 T 145 28" />
            <path d="M30 35 C 50 15, 80 40, 130 10" />
          </svg>
        </div>
        <div class="sig-line">${rtl ? "الختم والتوقيع المعتمد" : "Authorized Signature & Stamp"}</div>
      </div>
    </div>`
        : ""
    }
  </div>

  ${opts.showFooter ? `<div class="doc-footer">${renderUniversalFooter(company, rtl)}</div>` : ""}
</div>

</body>
</html>`;
}
