import type { InvoiceDoc } from "./pdf";
import {
  InvoiceLabels,
  InvoiceTemplateId,
  UnifiedInvoiceData,
  DEFAULT_BRANDING,
  getPrintSettings,
} from "./templates";
import { printUnifiedDocument } from "./printing";

export type { InvoiceLabels as Labels };
export type InvoiceTemplate = InvoiceTemplateId;
export { DEFAULT_BRANDING };

export function printInvoice(
  doc: InvoiceDoc | UnifiedInvoiceData,
  template: InvoiceTemplate,
  labels: InvoiceLabels,
  rtl: boolean,
) {
  // Honour the existing legacy off switch while the unified store migrates.
  if (getPrintSettings().printMode === "off") return;

  // Ensure default branding is present
  const fullDoc: UnifiedInvoiceData = {
    ...doc,
    brandingText: "brandingText" in doc && doc.brandingText ? doc.brandingText : DEFAULT_BRANDING,
  };

  // Route invoices through the shared engine; the document snapshot is reused.
  printUnifiedDocument({
    doc: fullDoc,
    documentType: fullDoc.docType ?? "customer_invoice",
    templateId: template,
    labels,
    rtl,
  });
}
