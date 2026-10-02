import {
  InvoiceTemplateId,
  PrintTemplateMeta,
  TemplateRenderer,
  UnifiedDocumentData,
  InvoiceLabels,
  DocumentType,
  PrintJobItem,
  CustomFieldOptions,
  DEFAULT_BRANDING,
  PrintProfile,
} from "./types";
import {
  PAPER_PROFILES,
  paperCss,
  paperProfileForLegacySize,
  type PaperProfileId,
} from "./paper-profiles";
import { renderThermalTemplate } from "./thermal";
import { renderStandardTemplate } from "./standard";
import { renderElegantTemplate } from "./elegant";
import { renderInventoryThermalTemplate, renderInventoryStandardTemplate } from "./inventory";
import { getPrintSettings } from "./settings-store";

export * from "./types";
export * from "./settings-store";
export * from "./paper-profiles";
export { renderThermalTemplate } from "./thermal";
export { renderStandardTemplate } from "./standard";
export { renderElegantTemplate } from "./elegant";
export { renderInventoryThermalTemplate, renderInventoryStandardTemplate } from "./inventory";
export { numberToArabicWords } from "./tafqeet";

interface RegisteredTemplate {
  meta: PrintTemplateMeta;
  renderer: TemplateRenderer;
}

const templateRegistry = new Map<InvoiceTemplateId, RegisteredTemplate>();

/**
 * Register a new print template dynamically for any document type
 */
export function registerTemplate(meta: PrintTemplateMeta, renderer: TemplateRenderer): void {
  templateRegistry.set(meta.id, { meta, renderer });
}

/**
 * Get registered template renderer
 */
export function getTemplateRenderer(
  id: InvoiceTemplateId,
  docType?: DocumentType,
): TemplateRenderer {
  // If document is an inventory document and default thermal/standard requested, use specialized inventory layout
  if (docType === "inventory_document") {
    if (id === "thermal") return renderInventoryThermalTemplate;
    if (id === "standard" || id === "elegant") return renderInventoryStandardTemplate;
  }

  const registered = templateRegistry.get(id);
  if (registered) {
    return registered.renderer;
  }

  // Default customer invoice fallbacks
  switch (id) {
    case "thermal":
      return renderThermalTemplate;
    case "elegant":
      return renderElegantTemplate;
    case "standard":
    default:
      return renderStandardTemplate;
  }
}

/**
 * Get list of all available print templates
 */
export function getAvailableTemplates(): PrintTemplateMeta[] {
  return Array.from(templateRegistry.values()).map((t) => t.meta);
}

export function getTemplateMeta(id: InvoiceTemplateId): PrintTemplateMeta | undefined {
  return templateRegistry.get(id)?.meta;
}

export function getCompatibleTemplates(
  documentType: DocumentType,
  paperProfileId?: PaperProfileId,
): PrintTemplateMeta[] {
  return getAvailableTemplates().filter((template) => {
    const supportsDocument = !template.supportedDocTypes || template.supportedDocTypes.includes(documentType);
    const supportsPaper = !paperProfileId || template.supportedPaperProfiles.includes(paperProfileId);
    return supportsDocument && supportsPaper;
  });
}

export function resolvePrintProfile(
  documentType: DocumentType,
  templateId?: InvoiceTemplateId,
  paperProfileId?: PaperProfileId,
): PrintProfile {
  const settings = getPrintSettings();
  const requestedTemplate = templateId ||
    (documentType === "inventory_document" ? settings.defaultInventoryTemplate : settings.defaultCustomerTemplate);
  const legacyPaper = paperProfileForLegacySize(settings.paperSize);
  const requested = templateRegistry.get(requestedTemplate);
  const compatible = getCompatibleTemplates(documentType);
  const template = requested &&
    (!requested.meta.supportedDocTypes || requested.meta.supportedDocTypes.includes(documentType))
    ? requested.meta
    : compatible[0] || templateRegistry.get("thermal")!.meta;
  const requestedPaper = paperProfileId || (template.supportedPaperProfiles.includes(legacyPaper) ? legacyPaper : template.supportedPaperProfiles[0]);
  const resolvedPaper = template.supportedPaperProfiles.includes(requestedPaper)
    ? requestedPaper
    : template.supportedPaperProfiles[0];

  return { documentType, templateId: template.id, paperProfileId: resolvedPaper };
}

// Register built-in default templates
registerTemplate(
  {
    id: "thermal",
    nameAr: "حراري (POS 80mm)",
    nameEn: "Thermal (POS 80mm)",
    category: "thermal",
    paperSize: "80mm",
    supportedPaperProfiles: ["thermal-80", "thermal-58"],
    supportedDocTypes: ["customer_invoice", "inventory_document"],
  },
  renderThermalTemplate,
);

registerTemplate(
  {
    id: "standard",
    nameAr: "قياسي (A4)",
    nameEn: "Standard (A4)",
    category: "standard",
    paperSize: "A4",
    supportedPaperProfiles: ["a4"],
    supportedDocTypes: ["customer_invoice", "inventory_document"],
  },
  renderStandardTemplate,
);

registerTemplate(
  {
    id: "elegant",
    nameAr: "أنيق فاخر (A4)",
    nameEn: "Elegant Luxury (A4)",
    category: "standard",
    paperSize: "A4",
    supportedPaperProfiles: ["a4"],
    supportedDocTypes: ["customer_invoice"],
  },
  renderElegantTemplate,
);

/**
 * Render document HTML string given document type, template ID, and customization options
 */
export function renderDocumentHTML(
  doc: UnifiedDocumentData,
  templateId?: InvoiceTemplateId,
  labels?: Partial<InvoiceLabels>,
  rtl = true,
  options?: CustomFieldOptions,
  paperProfileId?: PaperProfileId,
): string {
  const settings = getPrintSettings();
  const effectiveTemplateId =
    templateId ||
    (doc.docType === "inventory_document"
      ? settings.defaultInventoryTemplate
      : settings.defaultCustomerTemplate);

  const mergedLabels: InvoiceLabels = {
    invoice: rtl ? "فاتورة مبيعات" : "Invoice",
    date: rtl ? "التاريخ" : "Date",
    billTo: rtl ? "العميل" : "Bill To",
    warehouse: rtl ? "المستودع" : "Warehouse",
    payment: rtl ? "طريقة الدفع" : "Payment Method",
    status: rtl ? "الحالة" : "Status",
    product: rtl ? "المنتج" : "Product",
    qty: rtl ? "الكمية" : "Qty",
    price: rtl ? "السعر" : "Price",
    total: rtl ? "الإجمالي" : "Total",
    subtotal: rtl ? "المجموع الفرعي" : "Subtotal",
    tax: rtl ? "الضريبة" : "Tax",
    discount: rtl ? "الخصم" : "Discount",
    grandTotal: rtl ? "الإجمالي النهائي" : "Grand Total",
    paid: rtl ? "المدفوع" : "Paid",
    balance: rtl ? "المتبقي" : "Balance",
    thanks: rtl ? "شكرًا لتعاملكم معنا" : "Thank you for your business",
    poweredBy: doc.brandingText || DEFAULT_BRANDING,
    ...labels,
  };

  const mergedOptions: CustomFieldOptions = {
    ...settings,
    ...options,
    ...doc.options,
  };

  const profile = resolvePrintProfile(doc.docType || "customer_invoice", effectiveTemplateId, paperProfileId);
  const renderer = getTemplateRenderer(profile.templateId, doc.docType);
  const html = renderer(doc, mergedLabels, rtl, mergedOptions);
  return html.replace("</head>", `<style data-print-profile="${profile.paperProfileId}">${paperCss(PAPER_PROFILES[profile.paperProfileId])}</style></head>`).replace(/\s+onload="[^"]*"/gi, "");
}

/**
 * Backward compatible renderInvoiceHTML
 */
export function renderInvoiceHTML(
  firstArg: InvoiceTemplateId | UnifiedDocumentData,
  secondArg?: UnifiedDocumentData | InvoiceTemplateId,
  labels?: Partial<InvoiceLabels>,
  rtl = true,
  options?: CustomFieldOptions,
): string {
  if (typeof firstArg === "string") {
    // Legacy signature: renderInvoiceHTML(templateId, doc, labels, rtl)
    const templateId = firstArg;
    const doc = secondArg as UnifiedDocumentData;
    return renderDocumentHTML(doc, templateId, labels, rtl, options);
  } else {
    // New signature: renderInvoiceHTML(doc, templateId, labels, rtl, options)
    const doc = firstArg;
    const templateId = secondArg as InvoiceTemplateId;
    return renderDocumentHTML(doc, templateId, labels, rtl, options);
  }
}

/**
 * Dispatch a single document print task via a hidden iframe
 */
export function printDocument(
  doc: UnifiedDocumentData,
  templateId?: InvoiceTemplateId,
  labels?: Partial<InvoiceLabels>,
  rtl = true,
  options?: CustomFieldOptions,
  paperProfileId?: PaperProfileId,
): void {
  // Respect the global "no printing" mode unless the caller forces a print
  const settings = getPrintSettings();
  if (settings.printMode === "off") {
    return;
  }

  const html = renderDocumentHTML(doc, templateId, labels, rtl, options, paperProfileId);

  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const cw = iframe.contentWindow!;
  cw.document.open();
  cw.document.write(html);
  cw.document.close();

  const delay = templateId === "elegant" ? 550 : 250;
  setTimeout(() => {
    try {
      cw.focus();
      cw.print();
    } finally {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {
          /* already removed */
        }
      }, 2000);
    }
  }, delay);
}

/**
 * Multi-Document Print Job Manager:
 * Print multiple documents sequentially (e.g. Customer Invoice + Inventory Document)
 */
export function printJob(items: PrintJobItem[], labels?: Partial<InvoiceLabels>, rtl = true): void {
  if (!items || items.length === 0) return;

  const settings = getPrintSettings();
  if (settings.printMode === "off") return;

  // Honour the per-document auto-print switches so the print job matches the
  // configured architecture (customer invoice and/or inventory document).
  const allowed = items.filter((item) => {
    const isInventory = item.doc.docType === "inventory_document";
    return isInventory ? settings.autoPrintInventoryDocument : settings.autoPrintCustomerInvoice;
  });

  if (allowed.length === 0) return;

  allowed.forEach((item, index) => {
    setTimeout(() => {
      printDocument(item.doc, item.templateId, labels, rtl);
    }, index * 1000);
  });
}
