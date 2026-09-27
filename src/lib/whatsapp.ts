/**
 * مساعدات واتساب — فتح محادثة برسالة جاهزة عبر رابط wa.me.
 * لا يحتاج أي مفاتيح أو خادم: يفتح واتساب (ويب/تطبيق) لدى المستخدم.
 */

/** يحوّل الأرقام العربية-الهندية (٠١٢٣٤٥٦٧٨٩) والفارسية (۰۱۲۳۴۵۶۷۸۹) إلى أرقام إنجليزية. */
function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.codePointAt(0)!;
    // ٠-٩: U+0660..U+0669 ، ۰-۹: U+06F0..U+06F9
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/**
 * يحوّل رقم الجوال إلى صيغة دولية بأرقام فقط (مثل 9665xxxxxxxx).
 * يدعم: 05xxxxxxxx ، 5xxxxxxxx ، +966... ، 00966... ، والأرقام العربية-الهندية.
 * يعيد null إذا كان الرقم غير صالح.
 */
export function normalizeWhatsAppPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = toAsciiDigits(String(raw)).replace(/[^\d+]/g, "");
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
