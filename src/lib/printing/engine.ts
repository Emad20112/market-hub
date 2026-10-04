import {
  renderDocumentHTML,
  type InvoiceLabels,
  type UnifiedDocumentData,
  type InvoiceTemplateId,
} from "@/lib/templates";
import { getCachedCompanyProfile } from "./company-profile";
import { PRINT_PAPERS, paperCss, type PrintOrientation, type PrintPaperId } from "./paper";
import { renderFormalTemplate } from "./formal";
import { normalizeTheme, type PrintTheme } from "./themes";
import { getUnifiedPrintSettings, type PrintMethod, type UnifiedPrintSettings } from "./settings";
import type { PrintingDocumentType } from "./document-types";
import { openPrintWindow } from "@/lib/print/print-window";

export interface PrintRequest {
  doc: UnifiedDocumentData;
  documentType?: PrintingDocumentType;
  labels?: Partial<InvoiceLabels>;
  rtl?: boolean;
  templateId?: InvoiceTemplateId;
  theme?: PrintTheme;
  paperId?: PrintPaperId;
  orientation?: PrintOrientation;
  copies?: number;
  method?: PrintMethod;
  settings?: UnifiedPrintSettings;
}

function labelsFor(rtl: boolean, labels?: Partial<InvoiceLabels>): InvoiceLabels {
  return {
    invoice: rtl ? "المستند" : "Document",
    date: rtl ? "التاريخ" : "Date",
    billTo: rtl ? "الطرف" : "Party",
    warehouse: rtl ? "المستودع" : "Warehouse",
    payment: rtl ? "طريقة الدفع" : "Payment",
    status: rtl ? "الحالة" : "Status",
    product: rtl ? "الصنف" : "Item",
    qty: rtl ? "الكمية" : "Qty",
    price: rtl ? "السعر" : "Price",
    total: rtl ? "الإجمالي" : "Total",
    subtotal: rtl ? "المجموع الفرعي" : "Subtotal",
    tax: rtl ? "الضريبة" : "Tax",
    discount: rtl ? "الخصم" : "Discount",
    grandTotal: rtl ? "الإجمالي النهائي" : "Grand total",
    paid: rtl ? "المدفوع" : "Paid",
    balance: rtl ? "المتبقي" : "Balance",
    thanks: rtl ? "شكرًا لتعاملكم معنا" : "Thank you",
    poweredBy: "",
    notes: rtl ? "ملاحظات" : "Notes",
    ...labels,
  };
}

export function renderUnifiedDocument(request: PrintRequest): string {
  const settings = request.settings ?? getUnifiedPrintSettings();
  const type = request.documentType ?? request.doc.docType ?? "customer_invoice";
  const override = settings.overrides[type];
  const rtl = request.rtl ?? true;
  const paperId = request.paperId ?? override?.paperId ?? settings.paperId;
  const orientation = request.orientation ?? override?.orientation ?? settings.orientation;
  const theme = normalizeTheme(request.theme ?? override?.theme ?? settings.theme);
  const profile = PRINT_PAPERS[paperId];
  const labels = labelsFor(rtl, request.labels);
  const html =
    theme === "formal"
      ? renderFormalTemplate(
          request.doc,
          labels,
          rtl,
          { showFooter: settings.footerEnabled },
          getCachedCompanyProfile(),
        )
      : renderDocumentHTML(
          request.doc,
          request.templateId ??
            override?.templateId ??
            (theme === "luxury" ? "elegant" : "standard"),
          labels,
          rtl,
          { showFooter: settings.footerEnabled },
          paperId === "a4" || paperId === "a5" ? "a4" : paperId,
        );
  return html
    .replace(
      "</head>",
      `<style data-unified-print="true">${paperCss(profile, orientation)}</style></head>`,
    )
    .replace(/<body([^>]*)>/i, "<body>");
}

export function printUnifiedDocument(request: PrintRequest): void {
  const settings = request.settings ?? getUnifiedPrintSettings();
  if (
    (request.method ?? settings.method) !== "browser" &&
    (request.method ?? settings.method) !== "thermal"
  )
    return;
  const html = renderUnifiedDocument(request);
  const copies = Math.max(1, Math.min(20, request.copies ?? settings.copies));
  for (let i = 0; i < copies; i += 1) openPrintWindow(html);
}

export function shouldPreview(settings = getUnifiedPrintSettings()): boolean {
  return settings.preview;
}


