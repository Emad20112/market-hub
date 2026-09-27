/**
 * قوالب رسائل واتساب الجاهزة (عربي/إنجليزي) للديون والتحصيلات والعملاء والموردين.
 */

type Lang = "ar" | "en";

/** تذكير بسداد رصيد مستحق على عميل. */
export function debtReminderMessage(opts: { name: string; balance: string; lang: Lang }): string {
  const { name, balance, lang } = opts;
  return lang === "ar"
    ? `السلام عليكم ${name}،\nنود تذكيركم بالرصيد المستحق عليكم لدينا: ${balance}.\nنأمل التكرم بالسداد في أقرب وقت ممكن، وشكرًا لتعاونكم.`
    : `Hello ${name},\nThis is a friendly reminder of your outstanding balance: ${balance}.\nKindly arrange payment at your earliest convenience. Thank you.`;
}

/** إيصال استلام دفعة (تحصيل). */
export function paymentReceiptMessage(opts: {
  name: string;
  amount: string;
  date: string;
  invoiceNumber?: string | null;
  remaining?: string | null;
  lang: Lang;
}): string {
  const { name, amount, date, invoiceNumber, remaining, lang } = opts;
  if (lang === "ar") {
    const lines = [`السلام عليكم ${name}،`, `تم استلام دفعة بمبلغ ${amount} بتاريخ ${date}.`];
    if (invoiceNumber) lines.push(`الفاتورة: ${invoiceNumber}`);
    if (remaining) lines.push(`الرصيد المتبقي: ${remaining}`);
    lines.push("شكرًا لتعاملكم معنا.");
    return lines.join("\n");
  }
  const lines = [`Hello ${name},`, `We received your payment of ${amount} on ${date}.`];
  if (invoiceNumber) lines.push(`Invoice: ${invoiceNumber}`);
  if (remaining) lines.push(`Remaining balance: ${remaining}`);
  lines.push("Thank you for your business.");
  return lines.join("\n");
}

/** رسالة عامة لمورد (تذكير برصيد مستحق له/عليه أو تواصل). */
export function supplierMessage(opts: { name: string; balance: string; lang: Lang }): string {
  const { name, balance, lang } = opts;
  return lang === "ar"
    ? `السلام عليكم ${name}،\nالرصيد الحالي لحسابكم لدينا: ${balance}.\nللاستفسار أو التسوية يرجى التواصل معنا.`
    : `Hello ${name},\nYour current account balance with us is: ${balance}.\nPlease contact us for any inquiries or settlement.`;
}
