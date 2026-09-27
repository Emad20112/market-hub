/**
 * مساعدات واتساب — فتح محادثة برسالة جاهزة عبر رابط wa.me.
 * لا يحتاج أي مفاتيح أو خادم: يفتح واتساب (ويب/تطبيق) لدى المستخدم.
 */

/** يحوّل رقم الجوال إلى صيغة دولية بأرقام فقط (مثل 9665xxxxxxxx). يدعم الصيغة السعودية 05xxxxxxxx. */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (/^05\d{8}$/.test(d)) d = "966" + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = "966" + d;
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  return d;
}

/** يبني رابط wa.me مع نص جاهز. يعيد null إذا كان الرقم غير صالح. */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string,
): string | null {
  const p = normalizeWhatsAppPhone(phone);
  if (!p) return null;
  return `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
}

/** يفتح واتساب في تبويب جديد برسالة جاهزة. يعيد false إذا كان الرقم غير صالح. */
export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const link = buildWhatsAppLink(phone, message);
  if (!link) return false;
  window.open(link, "_blank", "noopener,noreferrer");
  return true;
}
