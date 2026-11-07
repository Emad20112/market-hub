import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  LoaderCircle,
  MessageCircle,
  MessageSquareText,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { buildUnifiedContext, renderMessage } from "@/lib/communication";
import {
  normalizeCommunicationSettings,
  type CommunicationSettings,
} from "@/lib/communication/settings";
import { useCommunicationSettings } from "@/lib/communication/settings-store";
import type { CommunicationEventType } from "@/lib/communication/types";

interface CommunicationSectionProps {
  canEdit: boolean;
  lang: string;
}

const FIELD_OPTIONS = [
  {
    key: "showCustomerName",
    ar: "اسم العميل",
    en: "Customer name",
    descriptionAr: "إظهار اسم المستلم في بداية الرسالة.",
    descriptionEn: "Show the recipient name near the start of the message.",
  },
  {
    key: "showPrices",
    ar: "الأسعار والمبالغ",
    en: "Prices and amounts",
    descriptionAr: "إظهار الإجماليات والمدفوعات والأجور في جميع القوالب.",
    descriptionEn: "Include invoice totals, payments, and service fees in templates.",
  },
  {
    key: "showBalances",
    ar: "الأرصدة المتبقية",
    en: "Outstanding balances",
    descriptionAr: "إظهار الرصيد المتبقي وحالة الحساب.",
    descriptionEn: "Include remaining balances and account status.",
  },
  {
    key: "showDates",
    ar: "التواريخ والفترات",
    en: "Dates and periods",
    descriptionAr: "إظهار تاريخ السند أو فترة كشف الحساب.",
    descriptionEn: "Include document dates or statement periods.",
  },
  {
    key: "showReferences",
    ar: "أرقام المراجع والسندات",
    en: "Reference numbers",
    descriptionAr: "إظهار أرقام الفواتير والسندات وعدد الحركات.",
    descriptionEn: "Include invoice and receipt numbers and transaction counts.",
  },
  {
    key: "showPaymentMethods",
    ar: "طريقة الدفع",
    en: "Payment method",
    descriptionAr: "إظهار وسيلة الدفع في إشعارات التحصيل.",
    descriptionEn: "Include the payment method in receipts.",
  },
  {
    key: "showQuantities",
    ar: "الكميات والأوزان",
    en: "Quantities and weights",
    descriptionAr: "إظهار الأكياس والأوزان والنواتج في رسائل المطحنة.",
    descriptionEn: "Include bags, weights, and outputs in milling messages.",
  },
  {
    key: "showCompanyName",
    ar: "اسم المنشأة",
    en: "Company name",
    descriptionAr: "إظهار اسم منشأتك كترويسة للرسالة.",
    descriptionEn: "Show your company name as the message heading.",
  },
  {
    key: "showCompanyPhone",
    ar: "هاتف المنشأة",
    en: "Company phone",
    descriptionAr: "إضافة رقم المنشأة في التوقيع عند توفره.",
    descriptionEn: "Add the company phone to the signature when available.",
  },
  {
    key: "showGreeting",
    ar: "التحية",
    en: "Greeting",
    descriptionAr: "إظهار افتتاحية مهذبة موحّدة.",
    descriptionEn: "Include a consistent, courteous opening.",
  },
  {
    key: "showClosing",
    ar: "الخاتمة والتوقيع",
    en: "Closing and sign-off",
    descriptionAr: "إظهار خاتمة موحّدة وبيانات التواصل المسموح بها.",
    descriptionEn: "Include a consistent closing and enabled contact details.",
  },
] as const;

const EVENT_OPTIONS: Array<{ key: CommunicationEventType; ar: string; en: string }> = [
  { key: "payment_received", ar: "إشعار استلام دفعة", en: "Payment receipt" },
  { key: "payment_request", ar: "طلب سداد مستحقات", en: "Payment request" },
  { key: "debt_reminder", ar: "تذكير بالرصيد", en: "Balance reminder" },
  { key: "invoice_created", ar: "إصدار فاتورة", en: "Invoice issued" },
  { key: "invoice_share", ar: "مشاركة فاتورة مبيعات", en: "Share sales invoice" },
  {
    key: "purchase_invoice_share",
    ar: "إشعار فاتورة مشتريات للمورد",
    en: "Purchase invoice notice",
  },
  { key: "statement_share", ar: "ملخص كشف الحساب", en: "Account statement summary" },
  { key: "supplier_notice", ar: "إشعار حساب المورد", en: "Supplier account notice" },
  { key: "general_customer_notice", ar: "رسالة عامة للعميل", en: "General customer notice" },
  {
    key: "milling_document_share",
    ar: "سندات المطحنة والأمانات",
    en: "Milling and custody documents",
  },
];

function ToggleRow({
  id,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/70 p-3">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        <p id={`${id}-description`} className="mt-1 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={`${id}-description`}
      />
    </div>
  );
}

export function CommunicationSection({ canEdit, lang }: CommunicationSectionProps) {
  const isArabic = lang === "ar";
  const { settings, isLoading, save } = useCommunicationSettings();
  const [draft, setDraft] = useState(settings);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => setDraft(settings), [settings]);

  const preview = useMemo(() => {
    const context = buildUnifiedContext({
      event: "milling_document_share",
      language: isArabic ? "ar" : "en",
      customer: {
        id: "preview",
        name: isArabic ? "العميل الكريم" : "Valued customer",
        phone: "771234567",
      },
      milling: {
        stage: "delivery",
        ticketNumber: "CUS-2026-0142",
        date: new Date().toISOString(),
        status: isArabic ? "مُسلّم" : "Delivered",
        items: [
          {
            name: isArabic ? "دقيق قمح" : "Wheat flour",
            bags: 12,
            weightKg: 600,
            remainingBags: 3,
          },
          { name: isArabic ? "نخالة" : "Bran", bags: 2, weightKg: 50 },
        ],
      },
    });
    return renderMessage(context, draft);
  }, [draft, isArabic]);

  const persist = async (next: CommunicationSettings) => {
    setDraft(next);
    setSaveState("saving");
    try {
      await save(next);
      setSaveState("saved");
    } catch (error) {
      setDraft(settings);
      setSaveState("error");
      toast.error(
        error instanceof Error
          ? error.message
          : isArabic
            ? "تعذر حفظ إعدادات الرسائل."
            : "Could not save communication settings.",
      );
    }
  };

  const changeChannel = (key: keyof CommunicationSettings["channels"], value: boolean) => {
    void persist(
      normalizeCommunicationSettings({
        ...draft,
        channels: { ...draft.channels, [key]: value },
      }),
    );
  };

  const changeField = (key: keyof CommunicationSettings["fields"], value: boolean) => {
    void persist(
      normalizeCommunicationSettings({
        ...draft,
        fields: { ...draft.fields, [key]: value },
      }),
    );
  };

  const changeEvent = (key: CommunicationEventType, value: boolean) => {
    void persist(
      normalizeCommunicationSettings({
        ...draft,
        events: { ...draft.events, [key]: value },
      }),
    );
  };

  const disabled = !canEdit || isLoading || saveState === "saving";

  return (
    <div className="flex flex-col gap-4" dir={isArabic ? "rtl" : "ltr"}>
      {!canEdit && (
        <p
          role="status"
          className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          {isArabic
            ? "تحتاج صلاحية المالك أو المدير لتعديل هذه الإعدادات."
            : "Owner or manager access is required to change these settings."}
        </p>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <MessageSquareText
                className="mt-0.5 size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              <div>
                <CardTitle>{isArabic ? "قنوات الإرسال" : "Delivery channels"}</CardTitle>
                <CardDescription className="mt-1">
                  {isArabic
                    ? "فعّل القنوات التي يسمح النظام باستخدامها لإرسال الرسائل."
                    : "Choose which channels the system may use to send messages."}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={saveState === "error" ? "destructive" : "secondary"}
              role="status"
              aria-live="polite"
            >
              {saveState === "saving" ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              ) : null}
              {saveState === "saved" ? <Check className="size-3.5" aria-hidden="true" /> : null}
              {saveState === "error" ? (
                <AlertCircle className="size-3.5" aria-hidden="true" />
              ) : null}
              <span>
                {isLoading
                  ? isArabic
                    ? "جارٍ تحميل الإعدادات"
                    : "Loading settings"
                  : saveState === "saving"
                    ? isArabic
                      ? "جارٍ الحفظ"
                      : "Saving"
                    : saveState === "saved"
                      ? isArabic
                        ? "تم الحفظ"
                        : "Saved"
                      : saveState === "error"
                        ? isArabic
                          ? "تعذر الحفظ"
                          : "Save failed"
                        : isArabic
                          ? "حفظ تلقائي"
                          : "Auto-saved"}
              </span>
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <ToggleRow
            id="communication-whatsapp"
            label={isArabic ? "واتساب" : "WhatsApp"}
            description={
              isArabic
                ? "إظهار وإتاحة فتح رسالة واتساب من شاشات النظام."
                : "Allow WhatsApp messages from system screens."
            }
            checked={draft.channels.whatsapp}
            disabled={disabled}
            onChange={(value) => changeChannel("whatsapp", value)}
          />
          <ToggleRow
            id="communication-sms"
            label={isArabic ? "الرسائل النصية SMS" : "SMS text messages"}
            description={
              isArabic
                ? "إتاحة إنشاء رسالة نصية بمحتوى القالب الموحد."
                : "Allow composing an SMS with the unified template."
            }
            checked={draft.channels.sms}
            disabled={disabled}
            onChange={(value) => changeChannel("sms", value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <MessageCircle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <CardTitle>{isArabic ? "محتوى الرسائل" : "Message content"}</CardTitle>
              <CardDescription className="mt-1">
                {isArabic
                  ? "تحكم بما يظهر في قوالب واتساب والرسائل النصية معاً."
                  : "Control which details appear in both WhatsApp and SMS templates."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {FIELD_OPTIONS.map((option) => (
            <ToggleRow
              key={option.key}
              id={`communication-field-${option.key}`}
              label={isArabic ? option.ar : option.en}
              description={isArabic ? option.descriptionAr : option.descriptionEn}
              checked={draft.fields[option.key]}
              disabled={disabled}
              onChange={(value) => changeField(option.key, value)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <CardTitle>{isArabic ? "أنواع الرسائل" : "Message types"}</CardTitle>
              <CardDescription className="mt-1">
                {isArabic
                  ? "أوقف نوعاً محدداً لإخفاء خيارات إرساله، دون التأثير على بقية الرسائل."
                  : "Disable a specific message type without affecting other templates."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {EVENT_OPTIONS.map((option) => (
            <ToggleRow
              key={option.key}
              id={`communication-event-${option.key}`}
              label={isArabic ? option.ar : option.en}
              description={
                isArabic
                  ? "تفعيل هذا القالب في الشاشات المرتبطة به."
                  : "Enable this template in its related screens."
              }
              checked={draft.events[option.key]}
              disabled={disabled}
              onChange={(value) => changeEvent(option.key, value)}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Eye className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <CardTitle>{isArabic ? "معاينة موحّدة" : "Unified preview"}</CardTitle>
              <CardDescription className="mt-1">
                {isArabic
                  ? "مثال لسند تسليم أمانة المطحنة بعد تطبيق إعداداتك."
                  : "Example milling-custody delivery message using your current settings."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {preview.text ? (
            <pre className="whitespace-pre-wrap rounded-xl border border-border/70 bg-muted/30 p-4 font-sans text-sm leading-7 text-foreground">
              {preview.text}
            </pre>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {isArabic
                ? "قالب تسليم الأمانة متوقف حالياً من إعدادات أنواع الرسائل."
                : "The custody-delivery template is currently disabled."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
