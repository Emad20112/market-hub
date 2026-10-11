/**
 * Unified Modern Layout — القالب الموحد لكل المستندات.
 *
 * المبدأ المعماري:
 *   نفس HTML structure + نفس Data Mapping + نفس Header + نفس جدول البنود +
 *   نفس الإجماليات + نفس Footer + نفس التوقيعات.
 *   الاختلاف الوحيد بين الأنماط هو الألوان والحدود والخلفيات والكثافة — وهذا
 *   يُدار عبر `PrintTheme` (standard / luxury / formal) وليس بقالب HTML منفصل.
 *
 * `renderStandardTemplate` و`renderElegantTemplate` أصبحا واجهتين رفيعتين
 * تستدعيان هذه الدالة بنفس التركيب وtheme مختلف — لا تكرار HTML.
 *
 * البيانات تُترجم من `UnifiedDocumentData` فقط؛ هذا الملف لا يستعلم عن أي شيء
 * ولا يعيد حساب أي رقم.
 */

import {
  UnifiedDocumentData,
  InvoiceLabels,
  escapeHtml,
  formatMoney,
  DEFAULT_COMPANY_LOGO,
  getCompanyLogo,
  CustomFieldOptions,
} from "./types";
import { numberToArabicWords } from "./tafqeet";
import { PRINT_THEMES, deriveThemeTokens, type PrintTheme } from "@/lib/printing/themes";
import { renderUniversalFooter, UNIVERSAL_FOOTER_CSS } from "@/lib/printing/footer";
import { getCachedCompanyProfile, type CompanyProfile } from "@/lib/printing/company-profile";
import { generateBarcodeSvg, generateQrCodeSvg } from "@/lib/printing/barcode-qr";
import type { PaperProfileId } from "./paper-profiles";

export interface UnifiedLayoutOptions extends CustomFieldOptions {
  /** نمط المستند — يغيّر الألوان والحدود فقط. */
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
  const border = theme === "luxury" ? `1.5px solid ${t.line}` : `1px solid ${t.line}`;

  // مقاسات ونسب الخطوط وهوامش الحشو المتجاوبة مع حجم الورق المحدد (A4 / A5)
  const baseFontSize = isA5 ? "10px" : "11.5px";
  const headerPadding = isA5 ? "8px 0" : "12px 0";
  const logoSize = isA5 ? "38px" : "48px";
  const companyTitleSize = isA5 ? "16px" : "20px";
  const bannerPadding = isA5 ? "8px 12px" : "11px 16px";
  const invTitleSize = isA5 ? "15px" : "19px";
  const badgeFontSize = isA5 ? "11.5px" : "13.5px";
  const badgePadding = isA5 ? "3px 10px" : "4px 13px";
  const cardPadding = isA5 ? "7px 9px" : "9px 12px";
  const cardIconSize = isA5 ? "26px" : "32px";
  const cardLabelSize = isA5 ? "8.5px" : "9.5px";
  const cardValueSize = isA5 ? "11px" : "12.5px";
  const tableThPadding = isA5 ? "7px 8px" : "9px 12px";
  const tableTdPadding = isA5 ? "6px 8px" : "8px 12px";
  const notesPadding = isA5 ? "9px 11px" : "11px 14px";
  const totalsPadding = isA5 ? "9px 12px" : "12px 15px";
  const grandTotalPadding = isA5 ? "7px 11px" : "9px 13px";
  const grandTotalAmountSize = isA5 ? "14px" : "16px";

  // تدرج راقٍ ومظهر فاخر للقالب التنفيذي مع حواف مذهبة
  const isLuxury = theme === "luxury";
  const bannerBackground = isLuxury
    ? `linear-gradient(135deg, ${t.accentSoft} 0%, #fff 100%)`
    : t.accentSoft;

  const tableHeaderBg = isLuxury
    ? `linear-gradient(135deg, ${t.accent} 0%, color-mix(in srgb, ${t.accent} 82%, #000) 100%)`
    : t.accent;

  const grandTotalBg = isLuxury
    ? `linear-gradient(135deg, ${t.accent} 0%, color-mix(in srgb, ${t.accent} 80%, #000) 100%)`
    : t.accent;

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
      line-height: 1.45;
      direction: ${rtl ? "rtl" : "ltr"};
      text-align: ${rtl ? "right" : "left"};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page-container {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      background: #fff;
      position: relative;
      padding: ${isA5 ? "6mm 8mm" : "10mm 12mm"};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: ${isA5 ? "200mm" : "285mm"};
    }
    header.invoice-header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: ${isA5 ? "10px" : "18px"};
      padding-bottom: ${headerPadding};
      border-bottom: ${border};
      break-inside: avoid;
    }
    .header-side-right {
      display: flex;
      flex-direction: column;
      gap: ${isA5 ? "2px" : "4px"};
      text-align: right;
      direction: rtl;
      min-width: 0;
      justify-content: center;
    }
    .header-company-name {
      font-size: ${companyTitleSize};
      font-weight: 800;
      color: var(--print-ink);
      margin: 0;
      line-height: 1.25;
      letter-spacing: -0.2px;
      word-break: break-word;
    }
    .header-company-sub {
      color: var(--print-accent);
      font-size: ${isA5 ? "8.5px" : "10px"};
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .header-meta-item {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: ${isA5 ? "9px" : "10.5px"};
      color: var(--print-muted);
      line-height: 1.35;
    }
    .header-side-right .header-meta-item {
      justify-content: flex-start;
    }
    .header-side-left .header-meta-item {
      justify-content: flex-end;
      direction: ltr;
    }
    .header-meta-item svg {
      color: var(--print-accent);
      flex-shrink: 0;
    }
    .header-center-logo {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 4px;
    }
    .header-logo-container {
      width: ${isA5 ? "54px" : "74px"};
      height: ${isA5 ? "54px" : "74px"};
      border-radius: ${isLuxury ? "14px" : "10px"};
      background: var(--print-accent-soft);
      border: ${border};
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: 4px;
      flex-shrink: 0;
      box-shadow: ${isLuxury ? "0 4px 12px rgba(0,0,0,0.06)" : "0 2px 8px rgba(0,0,0,0.04)"};
    }
    .header-logo-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .header-side-left {
      display: flex;
      flex-direction: column;
      gap: ${isA5 ? "2px" : "4px"};
      text-align: left;
      direction: ltr;
      min-width: 0;
      justify-content: center;
      align-items: flex-end;
    }
    .header-company-en {
      font-size: ${isA5 ? "11px" : "13.5px"};
      font-weight: 800;
      color: var(--print-ink);
      letter-spacing: 0.3px;
      margin: 0;
      line-height: 1.25;
      text-transform: uppercase;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .invoice-title-banner {
      margin: ${isA5 ? "8px 0 10px" : "12px 0 14px"};
      background: ${bannerBackground};
      border: ${border};
      border-radius: var(--print-radius);
      padding: ${bannerPadding};
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      break-inside: avoid;
      box-shadow: ${isLuxury ? "0 2px 10px rgba(0,0,0,0.03)" : "none"};
    }
    .inv-heading-title {
      font-size: ${invTitleSize};
      font-weight: 900;
      color: var(--print-ink);
      margin: 0;
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .inv-heading-title svg {
      color: var(--print-accent);
      flex-shrink: 0;
    }
    .inv-number-badge {
      background: var(--print-accent);
      color: #fff;
      font-family: ui-monospace, 'Courier New', monospace;
      font-weight: 800;
      font-size: ${badgeFontSize};
      padding: ${badgePadding};
      border-radius: 20px;
      display: inline-block;
      box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      letter-spacing: 0.5px;
    }
    .inv-date-tag {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: ${isA5 ? "10px" : "11.5px"};
      color: var(--print-muted);
      font-weight: 700;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: ${isA5 ? "6px" : "9px"};
      margin-bottom: ${isA5 ? "10px" : "14px"};
      break-inside: avoid;
    }
    .info-card {
      background: var(--print-surface);
      border: ${border};
      border-radius: var(--print-radius);
      padding: ${cardPadding};
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
      box-shadow: ${isLuxury ? "0 1px 4px rgba(0,0,0,0.02)" : "none"};
    }
    .card-icon-circle {
      width: ${cardIconSize};
      height: ${cardIconSize};
      border-radius: var(--print-radius);
      background: var(--print-accent-soft);
      color: var(--print-accent);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .card-body-content {
      flex: 1;
      min-width: 0;
    }
    .card-label {
      font-size: ${cardLabelSize};
      font-weight: 800;
      color: var(--print-accent);
      margin-bottom: 2px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .card-value {
      font-size: ${cardValueSize};
      font-weight: 800;
      color: var(--print-ink);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card-subtext {
      font-size: ${isA5 ? "8.5px" : "9.5px"};
      color: var(--print-muted);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .table-container {
      border: ${border};
      border-radius: var(--print-radius);
      overflow: hidden;
      margin-bottom: ${isA5 ? "10px" : "14px"};
      background: #fff;
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
      background: ${tableHeaderBg};
      color: #fff;
    }
    table.items-table thead th {
      padding: ${tableThPadding};
      font-size: ${isA5 ? "9.5px" : "11px"};
      font-weight: 800;
      border: none;
      letter-spacing: 0.2px;
    }
    .col-num { width: 34px; text-align: center; }
    .col-desc { text-align: ${rtl ? "right" : "left"}; }
    .col-qty { width: 75px; text-align: center; }
    .col-price { width: 95px; text-align: ${rtl ? "left" : "right"}; }
    .col-total { width: 105px; text-align: ${rtl ? "left" : "right"}; font-weight: 800; }
    table.items-table tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    table.items-table tbody td {
      padding: ${tableTdPadding};
      border-bottom: 1px solid var(--print-line);
      font-size: ${isA5 ? "10px" : "11.5px"};
      vertical-align: middle;
    }
    table.items-table tbody tr:nth-child(even) {
      background: var(--print-surface);
    }
    .p-title {
      font-weight: 700;
      color: var(--print-ink);
      line-height: 1.35;
    }
    .p-code {
      font-size: ${isA5 ? "8px" : "9px"};
      color: var(--print-muted);
      font-family: ui-monospace, 'Courier New', monospace;
      margin-top: 1px;
    }
    .bottom-grid {
      display: grid;
      grid-template-columns: 1fr ${isA5 ? "240px" : "290px"};
      gap: ${isA5 ? "10px" : "14px"};
      margin-bottom: ${isA5 ? "10px" : "14px"};
      align-items: start;
      break-inside: avoid;
    }
    .notes-card {
      background: var(--print-surface);
      border: ${border};
      border-radius: var(--print-radius);
      padding: ${notesPadding};
      height: 100%;
    }
    .tafqeet-banner {
      background: var(--print-accent-soft);
      border: ${border};
      border-radius: var(--print-radius);
      padding: ${isA5 ? "6px 9px" : "8px 11px"};
      margin-bottom: 8px;
      font-size: ${isA5 ? "9.5px" : "11px"};
      font-weight: 700;
      color: var(--print-accent);
      display: flex;
      align-items: center;
      gap: 6px;
      line-height: 1.35;
    }
    .notes-header-title {
      font-size: ${isA5 ? "9.5px" : "11px"};
      font-weight: 800;
      color: var(--print-accent);
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 5px;
    }
    .notes-body-text {
      font-size: ${isA5 ? "9.5px" : "10.5px"};
      color: var(--print-muted);
      line-height: 1.5;
      white-space: pre-line;
    }
    .totals-card {
      background: var(--print-surface);
      border: ${border};
      border-radius: var(--print-radius);
      padding: ${totalsPadding};
      display: flex;
      flex-direction: column;
      gap: 4px;
      box-shadow: ${isLuxury ? "0 2px 8px rgba(0,0,0,0.03)" : "none"};
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: ${isA5 ? "10px" : "11.5px"};
      color: var(--print-ink);
      padding: 2.5px 0;
    }
    .totals-row.discount-row {
      color: #b91c1c;
      font-weight: 700;
    }
    .grand-total-banner {
      background: ${grandTotalBg};
      color: #fff;
      border-radius: var(--print-radius);
      padding: ${grandTotalPadding};
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .grand-total-banner .gt-label {
      font-size: ${isA5 ? "11px" : "13px"};
      font-weight: 900;
    }
    .grand-total-banner .gt-amount {
      font-size: ${grandTotalAmountSize};
      font-weight: 900;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .signatures-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${isA5 ? "20px" : "36px"};
      margin: ${isA5 ? "6px 0 10px" : "10px 0 14px"};
      padding: 0 16px;
      break-inside: avoid;
    }
    .sig-box {
      text-align: center;
    }
    .sig-graphic {
      height: ${isA5 ? "28px" : "36px"};
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--print-accent);
      opacity: 0.85;
    }
    .sig-title-line {
      border-top: 1.5px dashed var(--print-accent);
      padding-top: 5px;
      font-size: ${isA5 ? "9.5px" : "11px"};
      font-weight: 800;
      color: var(--print-ink);
    }
    .doc-footer {
      margin-top: auto;
      break-inside: avoid;
    }
    @media screen {
      .page-container {
        box-shadow: 0 8px 30px rgba(0,0,0,0.08);
        border-radius: 8px;
        margin: 12px auto;
        border: 1px solid var(--print-line);
      }
    }
    @media print {
      body {
        background: #fff;
      }
      .page-container {
        box-shadow: none;
        padding: 0;
        margin: 0;
        width: 100%;
        min-height: auto;
      }
      tr, .info-card, .totals-card, .notes-card, .sig-box, header, .invoice-title-banner, .doc-footer {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
    ${UNIVERSAL_FOOTER_CSS}
  `;
}

/**
 * القالب الموحد — يستخدمه `standard` و`luxury` (وعبرهما `elegant` القديم).
 */
export function renderUnifiedLayout(
  doc: UnifiedDocumentData,
  L: InvoiceLabels,
  rtl: boolean,
  options?: UnifiedLayoutOptions,
): string {
  const theme: PrintTheme = options?.theme ?? "standard";
  const c = doc.currency ?? "";
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
  // `doc.options` must not be able to re-enable a footer the caller disabled.
  if (options?.showFooter === false) opts.showFooter = false;

  const qrPayload = [
    `Seller: ${options?.company?.name || getCachedCompanyProfile().name}`,
    `Invoice: ${doc.number}`,
    `Date: ${doc.date}`,
    `Total: ${doc.total || 0} ${c}`,
  ].join("\n");

  const barcodeSvg =
    opts.showBarcode !== false && doc.number ? generateBarcodeSvg(doc.number, 32) : "";
  const qrSvg = opts.showQrCode !== false ? generateQrCodeSvg(qrPayload, 80) : "";

  // Company Profile is the single source of company data — never a constant.
  // The document may carry a snapshot, but the profile is authoritative when
  // the snapshot has no name of its own.
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
      <td class="col-num">${i + 1}</td>
      <td class="col-desc">
        <div class="p-title">${esc(l.product)}</div>
        ${l.code ? `<div class="p-code">${rtl ? "كود" : "SKU"}: ${esc(l.code)}</div>` : ""}
      </td>
      <td class="col-qty">${l.qty} ${l.unit ? esc(l.unit) : rtl ? "حبة" : ""}</td>
      <td class="col-price">${money(itemPrice)}</td>
      <td class="col-total">${money(itemTotal)}</td>
    </tr>`;
    })
    .join("");

  const numColumns = 5;
  const isA5 = options?.paperProfileId === "a5";
  const customAccent = options?.accentColor ?? doc.options?.accentColor ?? null;

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
  <div>
    <header class="invoice-header">
      <!-- 1. Right Side (اليمين): الاسم والموقع بشكل احترافي متناسق -->
      <div class="header-side-right">
        ${
          opts.showCompanyInfo
            ? `
        <h1 class="header-company-name">${esc(arabicName || companyName || (rtl ? "المركز التجاري" : "Vortex Commercial"))}</h1>
        ${
          companyAddress
            ? `<div class="header-meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span>${esc(companyAddress)}</span>
        </div>`
            : ""
        }
        ${
          companyVat
            ? `<div class="header-meta-item">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>
          <span>${rtl ? "الرقم الضريبي" : "Tax No"}: ${esc(companyVat)}</span>
        </div>`
            : ""
        }`
            : "<div></div>"
        }
      </div>

      <!-- 2. Center (المنتصف): الشعار بشكل احترافي -->
      <div class="header-center-logo">
        ${
          opts.showLogo
            ? `
        <div class="header-logo-container">
          <img
            src="${esc(logoUrl)}"
            alt="${esc(companyName || "Logo")}"
            class="header-logo-img"
            onerror="this.onerror=null; this.src='${DEFAULT_COMPANY_LOGO}';"
          />
        </div>`
            : "<div></div>"
        }
      </div>

      <!-- 3. Left Side (اليسار): أرقام التواصل أو البيانات باللغة الإنجليزية -->
      <div class="header-side-left">
        ${
          opts.showCompanyInfo
            ? `
        ${
          englishName
            ? `<div class="header-company-en">${esc(englishName)}</div>`
            : `<div class="header-company-en">VORTEX ERP</div>`
        }
        ${
          companyPhone
            ? `<div class="header-meta-item">
          <span dir="ltr">${esc(companyPhone)}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </div>`
            : ""
        }
        ${
          companyEmail
            ? `<div class="header-meta-item">
          <span dir="ltr">${esc(companyEmail)}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
        </div>`
            : companyWebsite
              ? `<div class="header-meta-item">
          <span dir="ltr">${esc(companyWebsite)}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
        </div>`
              : companyVat
                ? `<div class="header-meta-item">
          <span dir="ltr">VAT: ${esc(companyVat)}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 7h10M7 12h10M7 17h6"/></svg>
        </div>`
                : ""
        }`
            : "<div></div>"
        }
      </div>
    </header>

    <div class="invoice-title-banner">
      <h2 class="inv-heading-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        ${esc(doc.title || L.invoice)}
      </h2>

      ${
        opts.showDocNumberDate
          ? `
      <div style="display: flex; align-items: center; gap: 10px;">
        ${qrSvg ? `<div style="display: flex; align-items: center; background: #fff; padding: 2px; border-radius: 4px;">${qrSvg}</div>` : ""}
        <div>
          <div class="inv-number-badge">#${esc(doc.number)}</div>
          ${barcodeSvg ? `<div style="margin-top: 3px; text-align: center;">${barcodeSvg}</div>` : ""}
        </div>
      </div>

      <div class="inv-date-tag">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>${L.date}: ${esc(doc.date)}</span>
      </div>`
          : ""
      }
    </div>

    <div class="cards-grid">
      ${
        opts.showCustomerInfo && doc.partyName
          ? `
      <div class="info-card">
        <div class="card-icon-circle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="card-body-content">
          <div class="card-label">${esc(doc.partyLabel || L.billTo)}</div>
          <div class="card-value">${esc(doc.partyName)}</div>
          ${doc.partyVat ? `<div class="card-subtext">${rtl ? "الرقم الضريبي" : "VAT"}: ${esc(doc.partyVat)}</div>` : ""}
          ${doc.partyPhone ? `<div class="card-subtext">${rtl ? "هاتف" : "Tel"}: ${esc(doc.partyPhone)}</div>` : ""}
        </div>
      </div>`
          : `
      <div class="info-card">
        <div class="card-icon-circle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div class="card-body-content">
          <div class="card-label">${L.billTo}</div>
          <div class="card-value">${rtl ? "عميل عام" : "General Customer"}</div>
        </div>
      </div>`
      }

      ${
        opts.showMovementInfo
          ? `
      <div class="info-card">
        <div class="card-icon-circle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div class="card-body-content">
          <div class="card-label">${L.warehouse}</div>
          <div class="card-value">${esc(doc.warehouse || (rtl ? "المستودع الرئيسي" : "Main Warehouse"))}</div>
          ${doc.destinationWarehouse ? `<div class="card-subtext">${rtl ? "إلى" : "To"}: ${esc(doc.destinationWarehouse)}</div>` : ""}
        </div>
      </div>`
          : `<div></div>`
      }

      ${
        opts.showPaymentInfo
          ? `
      <div class="info-card">
        <div class="card-icon-circle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        </div>
        <div class="card-body-content">
          <div class="card-label">${L.payment}</div>
          <div class="card-value">${esc(doc.payment || (rtl ? "نقداً (Cash)" : "Cash"))}</div>
          <div class="card-subtext">${L.status}: ${esc(doc.status || (rtl ? "مدفوعة" : "Paid"))}</div>
        </div>
      </div>`
          : `<div></div>`
      }
    </div>

    <div class="table-container">
      <table class="items-table">
        <thead>
          <tr>
            <th class="col-num">${rtl ? "م" : "#"}</th>
            <th class="col-desc">${L.product}</th>
            <th class="col-qty">${L.qty}</th>
            <th class="col-price">${L.price}</th>
            <th class="col-total">${L.total}</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${numColumns}" style="text-align:center; padding: 16px; color: var(--print-muted);">${rtl ? "لا توجد عناصر" : "No Items"}</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="bottom-grid">
      <div class="notes-card">
        ${
          opts.showFinancialDetails
            ? `
        <div class="tafqeet-banner">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M4 17v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><rect width="20" height="10" x="2" y="7" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
          <span><b>${rtl ? "المبلغ كتابةً" : "Amount in words"}:</b> ${esc(numberToArabicWords(doc.total ?? 0, doc.currency))}</span>
        </div>`
            : ""
        }

        ${
          opts.showNotes && doc.notes
            ? `
        <div class="notes-header-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          <span>${rtl ? "ملاحظات" : "Notes"}</span>
        </div>
        <div class="notes-body-text">${esc(doc.notes)}</div>
        `
            : `
        <div class="notes-header-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          <span>${L.thanks}</span>
        </div>
        <div class="notes-body-text">${rtl ? "نشكركم على اختياركم ونتطلع دائماً لخدمتكم." : "We appreciate your business and look forward to serving you."}</div>
        `
        }
      </div>

      ${
        opts.showFinancialDetails
          ? `
      <div class="totals-card">
        <div class="totals-row">
          <span>${L.subtotal}</span>
          <span style="font-family: system-ui, sans-serif; font-weight: 700;">${money(doc.subtotal)}</span>
        </div>

        ${
          doc.discount
            ? `
        <div class="totals-row discount-row">
          <span>${L.discount}</span>
          <span style="font-family: system-ui, sans-serif; font-weight: 700;">- ${money(doc.discount)}</span>
        </div>`
            : ""
        }

        ${
          doc.tax
            ? `
        <div class="totals-row">
          <span>${L.tax}</span>
          <span style="font-family: system-ui, sans-serif; font-weight: 700;">+ ${money(doc.tax)}</span>
        </div>`
            : ""
        }

        <div class="grand-total-banner">
          <span class="gt-label">${L.grandTotal}</span>
          <span class="gt-amount">${money(doc.total)}</span>
        </div>

        ${
          doc.paid !== undefined
            ? `
        <div class="totals-row" style="margin-top: 4px;">
          <span>${L.paid}</span>
          <span style="font-family: system-ui, sans-serif; font-weight: 700;">${money(doc.paid)}</span>
        </div>
        <div class="totals-row">
          <span>${L.balance}</span>
          <span style="font-family: system-ui, sans-serif; font-weight: 700;">${money((doc.total ?? 0) - doc.paid)}</span>
        </div>`
            : ""
        }
      </div>`
          : "<div></div>"
      }
    </div>

    ${
      opts.showSignatures
        ? `
    <div class="signatures-row">
      <div class="sig-box">
        <div class="sig-graphic">
          <svg width="100" height="32" viewBox="0 0 160 45" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 32 C 30 10, 45 40, 70 20 C 85 8, 100 35, 125 15 C 140 5, 150 25, 155 35" />
            <path d="M40 25 Q 70 5, 95 38" />
          </svg>
        </div>
        <div class="sig-title-line">${rtl ? "توقيع المستلم" : "Recipient Signature"}</div>
      </div>

      <div class="sig-box">
        <div class="sig-graphic">
          <svg width="100" height="32" viewBox="0 0 160 45" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 20 Q 35 5, 60 30 T 110 15 T 145 28" />
            <path d="M30 35 C 50 15, 80 40, 130 10" />
          </svg>
        </div>
        <div class="sig-title-line">${rtl ? "توقيع المدير / المخزن" : "Manager / Warehouse Signature"}</div>
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
