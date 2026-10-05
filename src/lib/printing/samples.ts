/**
 * Sample documents for print preview.
 *
 * A single source of preview samples so the settings screen and any other
 * preview entry point render the same example. These are examples only —
 * they are never printed as real business data.
 */

import type { UnifiedDocumentData } from "@/lib/templates";

export const SAMPLE_CUSTOMER_INVOICE: UnifiedDocumentData = {
  docType: "customer_invoice",
  title: "فاتورة مبيعات",
  number: "INV-2026-0042",
  date: new Date().toLocaleDateString("ar-YE"),
  partyLabel: "العميل",
  partyName: "شركة الأمل للتجارة والخدمات",
  partyPhone: "771234567",
  partyVat: "300123456700003",
  warehouse: "المستودع الرئيسي",
  payment: "نقداً (Cash)",
  status: "مدفوعة",
  lines: [
    {
      product: "مرفاع زيت هيدروليكي 3 طن",
      qty: 2,
      unit: "حبة",
      price: 150,
      total: 300,
      code: "HYD-3T",
    },
    {
      product: "طقم مفاتيح رينج 12 قطعة",
      qty: 5,
      unit: "طقم",
      price: 45,
      total: 225,
      code: "RNG-12",
    },
    {
      product: "زيت محرك سوبر 15W-40 4L",
      qty: 4,
      unit: "جالون",
      price: 28,
      total: 112,
      code: "OIL-15W40",
    },
  ],
  subtotal: 637,
  tax: 95.55,
  discount: 32.55,
  total: 700,
  paid: 700,
  balance: 0,
  currency: "ر.ي",
};

export const SAMPLE_INVENTORY_DOC: UnifiedDocumentData = {
  docType: "inventory_document",
  title: "إذن صرف مبيعات مخزني",
  number: "STK-2026-0089",
  relatedRef: "INV-2026-0042",
  date: new Date().toLocaleDateString("ar-YE"),
  movementType: "صرف مبيعات (Sales Issue)",
  warehouse: "المستودع الرئيسي - قسم المعدات",
  operatorName: "أحمد يونس (أمناء المخازن)",
  notes: "تم تجهيز وتسليم الاصناف بحالة ممتازة وبحضور السائق.",
  lines: [
    { product: "مرفاع زيت هيدروليكي 3 طن", qty: 2, unit: "حبة", code: "HYD-3T", note: " رف A-14" },
    { product: "طقم مفاتيح رينج 12 قطعة", qty: 5, unit: "طقم", code: "RNG-12", note: "رف B-02" },
    {
      product: "زيت محرك سوبر 15W-40 4L",
      qty: 4,
      unit: "جالون",
      code: "OIL-15W40",
      note: "كرتون أصل",
    },
  ],
};

/** يعيد مستند معاينة مناسبًا لنوع المستند المطلوب. */
export function sampleDocumentFor(docType?: string): UnifiedDocumentData {
  return docType === "inventory_document" ? SAMPLE_INVENTORY_DOC : SAMPLE_CUSTOMER_INVOICE;
}
