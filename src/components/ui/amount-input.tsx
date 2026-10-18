/**
 * AmountInput — الحقل المالي الموحد للنظام كامل.
 *
 * الاستبدال الرسمي لكل `<input type="number">` المستخدمة في حقول المبالغ:
 *
 *  1. **لا عجلة ماوس:** الإدخال يُعرض كـ `type="text"` مع `inputMode="decimal"`،
 *     لذلك المتصفح لا يطبق سلوك spinner/wheel الأصلي إطلاقًا.
 *  2. **فاصلة آلاف أثناء الكتابة:** "1250000" → "1,250,000" دون قفزة المؤشر،
 *     عبر `sanitizeNumericString` من `src/design/number.ts`.
 *  3. **أرقام عربية:** `١٢٣٤` و `۱۲۳۴` تُنقّى تلقائيًا إلى ASCII قبل التخزين.
 *  4. **ربط بالإعدادات الموحد:** رمز العملة يُقرأ من `company_settings`
 *     عبر `useCompanyCurrency()` — تغيير العملة في الإعدادات ينعكس هنا تلقائيًا.
 *
 * القيمة المخزّنة دائمًا `number | null`؛ النص المنسق للعرض فقط.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { FieldInput, type FieldInputProps } from "./input";
import { parseNumber, sanitizeNumericString } from "@/design/number";
import { useCompanyCurrency } from "@/hooks/use-company-currency";

export interface AmountInputProps extends Omit<
  FieldInputProps,
  "type" | "value" | "onChange" | "onValueChange" | "inputMode" | "clearable"
> {
  /** القيمة الفعلية المخزنة: رقم أو null للحقل الفارغ. */
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** عدد خانات الكسر المسموح (الافتراضي 2). 0 = أعداد صحيحة فقط. */
  decimals?: number;
  /** حدود تُطبق عند مغادرة الحقل. */
  min?: number;
  max?: number;
  /** كود العملة للتفقيط (الافتراضي يُقرأ من إعدادات المنشأة). */
  currency?: string;
  /** رمز العملة المعروض بجنب الحقل (الافتراضي يُقرأ من إعدادات المنشأة). */
  currencySymbol?: string;
  /** إظهار زر التفريغ (افتراضي true للحقل المالي). */
  clearable?: boolean;
}

/** عدد الأرقام الصريحة داخل سلسلة نصية (لحفظ موضع المؤشر). */
function countDigits(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= "0" && ch <= "9") n += 1;
  return n;
}

/** إضافة فاصلة آلاف مع الحفاظ على الكسر كما كتبه المستخدم (بحد `decimals`). */
function groupTyped(raw: string, decimals: number): string {
  const cleaned = sanitizeNumericString(raw);
  if (!cleaned || cleaned === "-" || cleaned === ".") return cleaned === "" ? "" : cleaned;
  const negative = cleaned.startsWith("-");
  const body = negative ? cleaned.slice(1) : cleaned;
  const dot = body.indexOf(".");
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const fracPart = dot === -1 ? "" : body.slice(dot + 1);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  let frac = "";
  if (decimals > 0 && fracPart !== "") {
    frac = "." + fracPart.slice(0, decimals);
  } else if (decimals > 0 && dot !== -1 && fracPart === "") {
    frac = "."; // اترك النقطة مؤقتًا حتى يكمل المستخدم الكسر
  }
  return (negative ? "-" : "") + grouped + frac;
}

/** تنسيق قيمة نهائية للعرض (بعد مغادرة الحقل): فاصلة آلاف + كسر محدود. */
function formatStored(value: number, decimals: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(value);
}

/** إعادة ضبط المؤشر بعد التجميع بحيث يبقى بعد نفس الرقم الذي كان بعده. */
function restoreCaret(el: HTMLInputElement, digitsBefore: number) {
  const text = el.value;
  let seen = 0;
  let target = text.length;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch >= "0" && ch <= "9") {
      seen += 1;
      if (seen > digitsBefore) {
        target = i;
        break;
      }
    }
  }
  try {
    el.setSelectionRange(target, target);
  } catch {
    /* عناصر غير قابلة للتحديد — تجاهل */
  }
}

export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  (
    {
      value,
      onValueChange,
      decimals = 2,
      min,
      max,
      currency,
      currencySymbol,
      clearable = true,
      className,
      ...props
    },
    ref,
  ) => {
    const { currency: settingsCurrency, currencySymbol: settingsSymbol } = useCompanyCurrency();
    const resolvedSymbol = currencySymbol ?? settingsSymbol;
    const resolvedCurrency = currency ?? settingsCurrency;

    const [text, setText] = React.useState(() =>
      value == null ? "" : formatStored(value, decimals),
    );
    const editing = React.useRef(false);
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const pendingCaret = React.useRef<number | null>(null);

    // مزامنة من الخارج — لكن لا نُقاتل المستخدم أثناء الكتابة.
    React.useEffect(() => {
      if (editing.current) return;
      setText(value == null ? "" : formatStored(value, decimals));
    }, [value, decimals]);

    // استعادة موضع المؤشر بعد إعادة الرسم بالنص المجمع.
    React.useLayoutEffect(() => {
      if (pendingCaret.current == null) return;
      const el = inputRef.current;
      if (el) restoreCaret(el, pendingCaret.current);
      pendingCaret.current = null;
    }, [text]);

    const clamp = React.useCallback(
      (n: number | null): number | null => {
        if (n == null) return null;
        let out = n;
        if (min != null && out < min) out = min;
        if (max != null && out > max) out = max;
        // تقريب الكسر إلى `decimals` حتى لا تُخزَّن قيم مثل 0.30000000000000004
        const factor = 10 ** decimals;
        out = Math.round(out * factor) / factor;
        return out;
      },
      [min, max, decimals],
    );

    return (
      <FieldInput
        {...props}
        ref={(el) => {
          inputRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref && typeof ref === "object")
            (ref as React.RefObject<HTMLInputElement>).current = el;
        }}
        type="currency" // يعرض كنص DOM مع inputMode="decimal" — لا spinner ولا عجلة ماوس
        clearable={clearable}
        suffix={
          resolvedSymbol ? (
            <span className="pointer-events-none select-none pe-3 text-xs font-bold text-muted-foreground">
              {resolvedSymbol}
            </span>
          ) : undefined
        }
        dir="ltr"
        className={cn("text-start font-semibold tabular-nums", className)}
        value={text}
        onFocus={(e) => {
          editing.current = true;
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          editing.current = false;
          const parsed = parseNumber(text);
          const bounded = clamp(parsed);
          onValueChange(bounded);
          setText(bounded == null ? "" : formatStored(bounded, decimals));
          props.onBlur?.(e);
        }}
        onChange={(e) => {
          // نلتقط موضع المؤشر قبل أن يعيد FieldInput التنقية
          const caret = e.target.selectionStart ?? undefined;
          if (caret != null) {
            pendingCaret.current = countDigits(e.target.value.slice(0, caret));
          }
          props.onChange?.(e);
        }}
        onValueChange={(next) => {
          const grouped = groupTyped(next, decimals);
          setText(grouped);
          if (grouped === "" || grouped === "-" || grouped === ".") {
            onValueChange(null);
            return;
          }
          onValueChange(clamp(parseNumber(grouped)));
        }}
      />
    );
  },
);
AmountInput.displayName = "AmountInput";
