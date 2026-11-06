import { useMemo, type Dispatch, type SetStateAction } from "react";
import { MessageSquareText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildUnifiedContext,
  getMessageSettings,
  normalizeMessageSettings,
  renderMessage,
  setActiveMessageSettings,
  type MessageSettings,
} from "@/lib/communication";

interface MessagesSectionProps {
  form: Record<string, unknown>;
  setForm: Dispatch<SetStateAction<Record<string, unknown>>>;
  canEdit: boolean;
  lang: string;
}

const TOGGLES: { key: keyof MessageSettings; ar: string; en: string; hintAr: string }[] = [
  {
    key: "showInvoiceRemaining",
    ar: "إظهار متبقي الفاتورة الحالية",
    en: "Show current invoice remaining",
    hintAr: "يظهر المبلغ المتبقي من هذه الفاتورة فقط، أو «مسددة بالكامل».",
  },
  {
    key: "showPreviousBalance",
    ar: "إظهار الرصيد السابق (المتراكم)",
    en: "Show previous balance",
    hintAr: "يظهر المديونية القديمة منفصلة حتى لو كانت الفاتورة الحالية مسددة.",
  },
  {
    key: "showTotalBalance",
    ar: "إظهار إجمالي المستحق على العميل",
    en: "Show total amount due",
    hintAr: "مجموع الرصيد السابق ومتبقي الفاتورة الحالية.",
  },
  {
    key: "showCompanyPhone",
    ar: "إضافة رقم تواصل المنشأة في نهاية الرسالة",
    en: "Append company phone",
    hintAr: "يستخدم رقم الهاتف من معلومات المنشأة.",
  },
];

export function MessagesSection({ form, setForm, canEdit, lang }: MessagesSectionProps) {
  const isAr = lang === "ar";
  const catalog = (form.catalog_modules as Record<string, unknown>) || {};
  const rawSettings = catalog.messageSettings;
  const settings = useMemo(() => normalizeMessageSettings(rawSettings), [rawSettings]);

  const update = (patch: Partial<MessageSettings>) => {
    setForm((prev) => {
      const prevCatalog = (prev.catalog_modules as Record<string, unknown>) || {};
      const current = normalizeMessageSettings(prevCatalog.messageSettings);
      return {
        ...prev,
        catalog_modules: { ...prevCatalog, messageSettings: { ...current, ...patch } },
      };
    });
  };

  // معاينة حية: فاتورة عليها متبقٍ مع مديونية سابقة — الحالة التي طلبها العميل.
  const preview = useMemo(() => {
    const saved = getMessageSettings();
    setActiveMessageSettings(settings);
    try {
      return renderMessage(
        buildUnifiedContext({
          event: "milling_document_share",
          language: "ar",
          customer: { id: "preview", name: "أحمد علي", balance: 0, currentBalance: 6500 },
          invoice: { invoiceNumber: "INV-1024", total: 2500, paid: 1000, remaining: 1500 },
          millingDocumentNumber: "ML-0310",
        }),
      ).text;
    } finally {
      setActiveMessageSettings(saved);
    }
  }, [settings]);

  return (
    <Card className="rounded-3xl shadow-xs">
      <CardHeader className="border-b border-border/40 pb-4">
        <CardTitle className="flex items-center gap-2.5 text-base font-bold">
          <span className="rounded-2xl bg-primary/10 p-2.5 text-primary">
            <MessageSquareText className="h-5 w-5" />
          </span>
          <span>
            {isAr ? "تخصيص رسائل العملاء" : "Customer Messages"}
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              {isAr
                ? "المصطلحات الظاهرة للعميل، وما يُعرض من أرصدة في رسائل واتساب. تُحفظ بزر «حفظ» أعلى الصفحة."
                : "Customer-facing terms and balance lines in WhatsApp messages."}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{isAr ? "اسم مواد العميل في المطحنة" : "Milling goods term"}</Label>
              <Input
                value={settings.millingGoodsTerm}
                disabled={!canEdit}
                maxLength={30}
                placeholder="حبوب"
                onChange={(e) => update({ millingGoodsTerm: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                {isAr ? "يظهر مثل: «سند حبوب #123»." : "Shown as: “Grain receipt #123”."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? "اسم خدمة المطحنة" : "Milling service name"}</Label>
              <Input
                value={settings.millingServiceName}
                disabled={!canEdit}
                maxLength={40}
                placeholder="خدمة الطحن"
                onChange={(e) => update({ millingServiceName: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-3">
            {TOGGLES.map((t) => (
              <label
                key={t.key}
                className="flex items-start justify-between gap-4 rounded-2xl border border-border/70 p-3"
              >
                <span>
                  <span className="block text-sm font-medium">{isAr ? t.ar : t.en}</span>
                  {isAr ? (
                    <span className="block text-[11px] text-muted-foreground">{t.hintAr}</span>
                  ) : null}
                </span>
                <Switch
                  checked={Boolean(settings[t.key])}
                  disabled={!canEdit}
                  onCheckedChange={(v) => update({ [t.key]: v } as Partial<MessageSettings>)}
                />
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>{isAr ? "التحية الافتتاحية (اختياري)" : "Greeting (optional)"}</Label>
            <Input
              value={settings.greetingAr}
              disabled={!canEdit}
              maxLength={80}
              placeholder="السلام عليكم ورحمة الله وبركاته"
              onChange={(e) => update({ greetingAr: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{isAr ? "العبارة الختامية (اختياري)" : "Closing line (optional)"}</Label>
            <Textarea
              value={settings.closingAr}
              disabled={!canEdit}
              maxLength={200}
              rows={2}
              placeholder="شاكرين لكم ثقتكم ونسعد بخدمتكم دائماً."
              onChange={(e) => update({ closingAr: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{isAr ? "معاينة الرسالة" : "Preview"}</Label>
          <pre
            dir="rtl"
            className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-muted/40 p-4 font-sans text-sm leading-7"
          >
            {preview}
          </pre>
          <p className="text-[11px] text-muted-foreground">
            {isAr
              ? "مثال: فاتورة 2,500 دُفع منها 1,000، وعلى العميل رصيد سابق 5,000."
              : "Example: invoice 2,500, paid 1,000, previous balance 5,000."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
