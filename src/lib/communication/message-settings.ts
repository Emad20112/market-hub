/**
 * إعدادات تخصيص رسائل العملاء ومصطلحات المطحنة.
 *
 * تُحفظ داخل `company_settings.catalog_modules.messageSettings` (عمود jsonb موجود)
 * فلا تحتاج ترحيلاً جديداً، وتُنسخ إلى ذاكرة محلية لقراءة فورية بلا طلبات شبكة
 * عند كل رسالة. المسار الوحيد للكتابة في الكاش هو `cacheMessageSettingsFromRow`
 * الذي يستدعيه `cacheCompanyProfile` عند تحميل/حفظ إعدادات المنشأة.
 */

export interface MessageSettings {
  /** المصطلح الذي يظهر للعميل بدل كلمة «أمانة» (مثل: حبوب، طحين، مواد العميل). */
  millingGoodsTerm: string;
  /** اسم خدمة المطحنة في ترويسة الرسائل. */
  millingServiceName: string;
  /** إظهار متبقي الفاتورة الحالية. */
  showInvoiceRemaining: boolean;
  /** إظهار الرصيد السابق (المديونية القديمة) منفصلاً عن الفاتورة. */
  showPreviousBalance: boolean;
  /** إظهار إجمالي المستحق على العميل (السابق + الحالي). */
  showTotalBalance: boolean;
  /** إظهار رقم تواصل المنشأة في ذيل الرسالة. */
  showCompanyPhone: boolean;
  /** تحية افتتاحية مخصّصة (فارغة = الافتراضية). */
  greetingAr: string;
  /** عبارة ختامية مخصّصة (فارغة = الافتراضية). */
  closingAr: string;
}

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = {
  millingGoodsTerm: "حبوب",
  millingServiceName: "خدمة الطحن",
  showInvoiceRemaining: true,
  showPreviousBalance: true,
  showTotalBalance: true,
  showCompanyPhone: false,
  greetingAr: "",
  closingAr: "",
};

const CACHE_KEY = "message_settings_cache_v1";
let memorySettings: MessageSettings | null = null;

/** يدمج قيمة خام مع الافتراضيات ويتجاهل الأنواع الخاطئة. */
export function normalizeMessageSettings(raw: unknown): MessageSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_MESSAGE_SETTINGS };
  (Object.keys(DEFAULT_MESSAGE_SETTINGS) as (keyof MessageSettings)[]).forEach((key) => {
    const def = DEFAULT_MESSAGE_SETTINGS[key];
    const val = src[key];
    if (typeof def === "boolean" && typeof val === "boolean") out[key] = val;
    if (typeof def === "string" && typeof val === "string") out[key] = val.trim();
  });
  const settings = out as unknown as MessageSettings;
  if (!settings.millingGoodsTerm)
    settings.millingGoodsTerm = DEFAULT_MESSAGE_SETTINGS.millingGoodsTerm;
  if (!settings.millingServiceName)
    settings.millingServiceName = DEFAULT_MESSAGE_SETTINGS.millingServiceName;
  return settings;
}

/** يستخرج الإعدادات من صف company_settings. */
export function messageSettingsFromRow(row: Record<string, unknown> | null | undefined) {
  const catalog = (row?.catalog_modules ?? {}) as Record<string, unknown>;
  return normalizeMessageSettings(catalog?.messageSettings);
}

export function cacheMessageSettingsFromRow(row: Record<string, unknown>): void {
  if (!row || !("catalog_modules" in row)) return;
  const settings = messageSettingsFromRow(row);
  memorySettings = settings;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* التخزين ممتلئ أو محظور — نكتفي بالذاكرة */
  }
}

export function getMessageSettings(): MessageSettings {
  if (memorySettings) return memorySettings;
  if (typeof window === "undefined") return DEFAULT_MESSAGE_SETTINGS;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    memorySettings = raw ? normalizeMessageSettings(JSON.parse(raw)) : DEFAULT_MESSAGE_SETTINGS;
  } catch {
    memorySettings = DEFAULT_MESSAGE_SETTINGS;
  }
  return memorySettings;
}

/** يستبدل الإعدادات النشطة مؤقتاً (للمعاينة الحية والاختبارات). */
export function setActiveMessageSettings(s: Partial<MessageSettings> | null) {
  memorySettings = s ? normalizeMessageSettings(s) : null;
}

/**
 * حساب الأرصدة الذكي: يفصل متبقي الفاتورة الحالية عن المديونية السابقة.
 *
 * - `currentBalance` رصيد العميل الحي من قاعدة البيانات (يشمل هذه الفاتورة).
 * - إن لم يتوفر، يُعامل `balanceBefore` كرصيد ما قبل الفاتورة.
 */
export function splitCustomerBalance(opts: {
  invoiceRemaining: number;
  currentBalance?: number | null;
  balanceBefore?: number | null;
}): { invoiceRemaining: number; previousBalance: number; totalBalance: number } {
  const invoiceRemaining = round2(Math.max(0, Number(opts.invoiceRemaining) || 0));
  if (opts.currentBalance != null && Number.isFinite(Number(opts.currentBalance))) {
    const total = round2(Number(opts.currentBalance));
    return {
      invoiceRemaining,
      previousBalance: round2(total - invoiceRemaining),
      totalBalance: total,
    };
  }
  const prev = round2(Number(opts.balanceBefore ?? 0) || 0);
  return { invoiceRemaining, previousBalance: prev, totalBalance: round2(prev + invoiceRemaining) };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
