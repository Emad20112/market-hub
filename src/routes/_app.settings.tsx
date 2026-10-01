import { getDigitPreference, setDigitPreference, type DigitStyle } from "@/lib/format-preferences";
import {
  getCurrencyOptions,
  getCurrencySymbol,
  type CurrencyOption,
} from "@/lib/currencies";
import { SubscriptionSettingsCard } from "@/components/subscription-settings-card";
import { BackupSettingsCard } from "@/components/backup-settings-card";
import { PrintSettingsCard } from "@/components/print-settings-card";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useCatalogModules } from "@/lib/catalog-modules";
import { CatalogModulesDialog } from "@/components/catalog-modules-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Hash,
  Image as ImageIcon,
  LoaderCircle,
  Save,
  Upload,
  Trash2,
  Building2,
  Receipt,
  Languages,
  SlidersHorizontal,
} from "lucide-react";
import { setCompanySettingsCache } from "@/lib/format";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — فورتيكس ERP" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { hasRole } = useAuth();
  const { config } = useCatalogModules();
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false);
  const canEdit = hasRole("owner") || hasRole("manager");
  const [form, setForm] = useState<any>({
    name: "",
    legal_name: "",
    tax_number: "",
    currency: "YER",
    currency_symbol: "ر.ي",
    tax_rate: 0,
    address: "",
    phone: "",
    email: "",
    invoice_prefix: "INV-",
    purchase_invoice_prefix: "PO-",
    invoice_number_period: "year_month",
    invoice_number_digits: 4,
    barcode_enabled: true,
    logo_url: null,
  });
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [digitStyle, setDigitStyle] = useState<DigitStyle>("latin");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const currencyOptions = useMemo(() => getCurrencyOptions(lang), [lang]);
  const invoiceNumberPreview = useMemo(() => {
    const cleanPrefix = (value: string) => value.trim().replace(/^-+|-+$/g, "");
    const sequence = "1".padStart(
      Math.max(1, Math.min(8, Number(form.invoice_number_digits) || 4)),
      "0",
    );
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const period =
      form.invoice_number_period === "year_month"
        ? `${year}${month}`
        : form.invoice_number_period === "year"
          ? year
          : "";
    const salesPrefix = cleanPrefix(form.invoice_prefix ?? "INV-");
    const purchasePrefix = cleanPrefix(form.purchase_invoice_prefix ?? "PO-");
    const joinNumber = (prefix: string) =>
      [prefix, period, sequence].filter(Boolean).join("-");

    return {
      sales: joinNumber(salesPrefix),
      purchase: joinNumber(purchasePrefix),
    };
  }, [
    form.invoice_number_digits,
    form.invoice_number_period,
    form.invoice_prefix,
    form.purchase_invoice_prefix,
  ]);

  useEffect(() => {
    setDigitStyle(getDigitPreference());
  }, []);

  const handleDigitChange = (style: DigitStyle) => {
    setDigitStyle(style);
    setDigitPreference(style);
    toast.success(lang === "ar" ? "تم حفظ تفضيل نظام الأرقام" : "Number system preference updated");
  };

  const [enablePosServiceFee, setEnablePosServiceFee] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("pos_enable_service_fee");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  useEffect(() => {
    supabase
      .from("company_settings")
      .select("*")
      .order("id")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setForm((current: any) => ({
            ...current,
            ...data,
            invoice_number_period: data.invoice_number_period ?? "year_month",
            invoice_number_digits: data.invoice_number_digits ?? 4,
            purchase_invoice_prefix: data.purchase_invoice_prefix ?? "PO-",
          }));
          setExists(true);
          if ((data as any).enable_pos_service_fee !== undefined) {
            setEnablePosServiceFee(Boolean((data as any).enable_pos_service_fee));
          }
          setCompanySettingsCache({
            currency: data.currency,
            currency_symbol: data.currency_symbol,
          });
        }
      });
  }, []);

  async function uploadCompanyLogo(file: File) {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(
        lang === "ar"
          ? "اختر صورة بصيغة PNG أو JPG أو WebP."
          : "Choose a PNG, JPG, or WebP image.",
      );
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error(
        lang === "ar"
          ? "حجم الشعار يجب ألا يتجاوز 3 ميجابايت."
          : "The logo must be 3 MB or smaller.",
      );
      return;
    }

    setLogoUploading(true);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `company/logo-${Date.now()}.${extension}`;

    try {
      const { error } = await supabase.storage
        .from("company-logos")
        .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
      if (error) throw error;

      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
      setForm((current: any) => ({ ...current, logo_url: data.publicUrl }));
      toast.success(
        lang === "ar"
          ? "تم رفع الشعار. اضغط «حفظ» لتطبيقه على الفواتير."
          : "Logo uploaded. Save the settings to apply it to invoices.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : lang === "ar"
            ? "تعذر رفع الشعار."
            : "Could not upload the logo.",
      );
    } finally {
      setLogoUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("pos_enable_service_fee", String(enablePosServiceFee));
    }
    const payload = { ...form, id: form.id ?? 1, tax_rate: Number(form.tax_rate) };
    const res = exists
      ? await supabase.from("company_settings").update(payload).eq("id", payload.id)
      : await supabase.from("company_settings").insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    setCompanySettingsCache({
      currency: payload.currency,
      currency_symbol: payload.currency_symbol,
    });
    toast.success(
      lang === "ar" ? "تم حفظ الإعدادات بنجاح" : t("common.saved") || t("common.success"),
    );
    setExists(true);
  }

  const profileLabel =
    config.profile === "spare_parts"
      ? lang === "ar"
        ? "قطع غيار ودراجات ومركبات"
        : "Spare Parts & Automotive"
      : config.profile === "grocery"
        ? lang === "ar"
          ? "مواد غذائية وبقالة وسوبرماركت"
          : "Grocery & Food Market"
        : config.profile === "retail"
          ? lang === "ar"
            ? "تجارة عامة وملابس وتجزئة"
            : "General Retail"
          : lang === "ar"
            ? "تخصيص يدوي مخصص"
            : "Custom Configuration";

  const previewDate = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const arabicPreviewDate = previewDate.replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
  const currencyPreviewSymbol = form.currency_symbol?.trim() || "ر.ي";

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        subtitle={
          lang === "ar"
            ? "بيانات الشركة، العملة، الضريبة، إعدادات سلة البيع، وتخصيص نشاط الفهرسة"
            : "Company profile, currency, tax, POS cart settings, and catalog customization"
        }
        actions={
          canEdit && (
              <Button
                onClick={save}
                disabled={saving || logoUploading}
                className="rounded-full gap-1.5 px-5"
              >
              <Save className="h-4 w-4 me-1" />
              {t("common.save")}
            </Button>
          )
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SubscriptionSettingsCard />
        <BackupSettingsCard />
        {/* Industry & Catalog Modules Card */}
        <Card className="lg:col-span-2 border-primary/30 bg-gradient-to-r from-primary/5 via-surface to-surface">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                {lang === "ar"
                  ? "تخصيص النشاط وموديولات الفهرسة"
                  : "Industry Profile & Catalog Modules"}
              </span>
              <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-3 py-0.5 text-xs font-bold">
                {profileLabel}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/80 bg-surface/80">
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {lang === "ar"
                    ? "تحديد الميزات المفعلة في الفهرس والمنتجات والـ POS"
                    : "Configure active catalog modules"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {lang === "ar"
                    ? "يمكنك بنقرة واحدة اختيار نشاطك (بقالة ومواد غذائية، قطع غيار ومركبات، تجارة عامة) لتفعيل أو إخفاء توافق القطع، درجات الجودة، وبلدان المنشأ."
                    : "Toggle vehicle fitment, quality grades, origins, brands, and units for your industry."}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCatalogDialogOpen(true)}
                className="rounded-full border-primary/40 text-primary hover:bg-primary/10"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 me-1.5" />
                {lang === "ar" ? "تخصيص الموديولات والنشاط" : "Customize Modules"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Numbering Format Card - Inspired by Mullak */}
        <Card className="rounded-3xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary" />
                {lang === "ar" ? "نظام الأرقام والترقيم الموحد" : "Numbering & Digit System"}
              </span>
              <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-xs font-medium">
                {digitStyle === "arabic" ? "الأرقام العربية (٠-٩)" : "Latin (0-9)"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {lang === "ar"
                ? "حدد النمط الرقمي المعتمد في كامل النظام (الفواتير، السندات، تقارير الديون، وبطاقات التحصيل)."
                : "Select the standard digit style used across all system views, invoices, and debt sheets."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => handleDigitChange("latin")}
                className={`cursor-pointer rounded-2xl border p-3.5 transition-all flex flex-col justify-between ${
                  digitStyle === "latin"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40 bg-surface"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">أرقام لاتينية / إنجليزية</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted">0 - 9</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {lang === "ar" ? "معاينة: " : "Preview: "}
                  1,250.00 {currencyPreviewSymbol} • {previewDate}
                </div>
              </div>

              <div
                onClick={() => handleDigitChange("arabic")}
                className={`cursor-pointer rounded-2xl border p-3.5 transition-all flex flex-col justify-between ${
                  digitStyle === "arabic"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40 bg-surface"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">أرقام عربية مشرقية</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted">٠ - ٩</span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {lang === "ar" ? "معاينة: " : "Preview: "}
                  ١,٢٥٠.٠٠ {currencyPreviewSymbol} • {arabicPreviewDate}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 1. Company Info */}
        <Card className="rounded-3xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              {lang === "ar" ? "معلومات المنشأة والمتجر" : "Company & Store Info"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field
              label={lang === "ar" ? "الاسم التجاري للمتجر" : "Trade name"}
              v={form.name}
              on={(v) => setForm({ ...form, name: v })}
              disabled={!canEdit}
            />
            <Field
              label={lang === "ar" ? "الاسم القانوني / السجل التجاري" : "Legal name"}
              v={form.legal_name ?? ""}
              on={(v) => setForm({ ...form, legal_name: v })}
              disabled={!canEdit}
            />
            <Field
              label={lang === "ar" ? "الرقم الضريبي" : "Tax number"}
              v={form.tax_number ?? ""}
              on={(v) => setForm({ ...form, tax_number: v })}
              disabled={!canEdit}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={lang === "ar" ? "الهاتف" : "Phone"}
                v={form.phone ?? ""}
                on={(v) => setForm({ ...form, phone: v })}
                disabled={!canEdit}
              />
              <Field
                label={lang === "ar" ? "البريد الإلكتروني" : "Email"}
                v={form.email ?? ""}
                on={(v) => setForm({ ...form, email: v })}
                disabled={!canEdit}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{lang === "ar" ? "العنوان والموقع" : "Address"}</Label>
              <Textarea
                rows={2}
                value={form.address ?? ""}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                disabled={!canEdit}
                className="rounded-2xl"
              />
            </div>
          </CardContent>
        </Card>

        {/* 2. Invoicing, POS & Cart Settings */}
        <Card className="rounded-3xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              {lang === "ar"
                ? "إعدادات الفواتير والسلة ونقطة البيع (POS)"
                : "Invoicing & POS Cart Settings"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {lang === "ar" ? "العملة والضريبة" : "Currency & tax"}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <CurrencyPicker
                  options={currencyOptions}
                  selectedCode={form.currency ?? "YER"}
                  language={lang}
                  disabled={!canEdit}
                  onSelect={(code) =>
                    setForm({
                      ...form,
                      currency: code,
                      currency_symbol: getCurrencySymbol(code, lang === "ar" ? "ar-YE" : "en"),
                    })
                  }
                />
                <Field
                  label={lang === "ar" ? "رمز العرض" : "Display symbol"}
                  v={form.currency_symbol ?? ""}
                  on={(v) => setForm({ ...form, currency_symbol: v })}
                  disabled={!canEdit}
                />
                <Field
                  label={lang === "ar" ? "نسبة الضريبة %" : "Tax rate %"}
                  v={String(form.tax_rate ?? 0)}
                  on={(v) => setForm({ ...form, tax_rate: v })}
                  type="number"
                  disabled={!canEdit}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "العملة الافتراضية للمنشآت الجديدة هي الريال اليمني. تغييرها لا يحوّل المبالغ القديمة."
                  : "New companies default to Yemeni Rial. Changing currency does not convert existing amounts."}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/80 bg-surface/50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Hash className="h-4 w-4 text-primary" />
                {lang === "ar" ? "ترقيم الفواتير" : "Invoice numbering"}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Field
                  label={lang === "ar" ? "بادئة فاتورة المبيعات" : "Sales invoice prefix"}
                  v={form.invoice_prefix ?? "INV-"}
                  on={(v) => setForm({ ...form, invoice_prefix: v })}
                  disabled={!canEdit}
                />
                <Field
                  label={lang === "ar" ? "بادئة فاتورة المشتريات" : "Purchase invoice prefix"}
                  v={form.purchase_invoice_prefix ?? "PO-"}
                  on={(v) => setForm({ ...form, purchase_invoice_prefix: v })}
                  disabled={!canEdit}
                />
                <div className="grid gap-1.5">
                  <Label htmlFor="invoice-period" className="text-xs">
                    {lang === "ar" ? "إضافة التاريخ إلى الرقم" : "Date in invoice number"}
                  </Label>
                  <select
                    id="invoice-period"
                    value={form.invoice_number_period ?? "year_month"}
                    onChange={(event) =>
                      setForm({ ...form, invoice_number_period: event.target.value })
                    }
                    disabled={!canEdit}
                    className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="none">{lang === "ar" ? "بدون تاريخ" : "No date"}</option>
                    <option value="year">{lang === "ar" ? "السنة" : "Year"}</option>
                    <option value="year_month">
                      {lang === "ar" ? "السنة والشهر" : "Year and month"}
                    </option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="invoice-number-digits" className="text-xs">
                    {lang === "ar" ? "الحد الأدنى لخانات التسلسل" : "Minimum sequence digits"}
                  </Label>
                  <select
                    id="invoice-number-digits"
                    value={String(form.invoice_number_digits ?? 4)}
                    onChange={(event) =>
                      setForm({ ...form, invoice_number_digits: Number(event.target.value) })
                    }
                    disabled={!canEdit}
                    className="h-10 w-full rounded-2xl border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="1">{lang === "ar" ? "1 — مثال: 1" : "1 — e.g. 1"}</option>
                    <option value="4">{lang === "ar" ? "4 — مثال: 0001" : "4 — e.g. 0001"}</option>
                    <option value="6">{lang === "ar" ? "6 — مثال: 000001" : "6 — e.g. 000001"}</option>
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background px-3.5 py-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {lang === "ar" ? "معاينة الأرقام القادمة" : "Invoice number preview"}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs" dir="ltr">
                  <span>
                    <span className="text-muted-foreground">
                      {lang === "ar" ? "مبيعات: " : "Sales: "}
                    </span>
                    <strong>{invoiceNumberPreview.sales}</strong>
                  </span>
                  <span>
                    <span className="text-muted-foreground">
                      {lang === "ar" ? "مشتريات: " : "Purchase: "}
                    </span>
                    <strong>{invoiceNumberPreview.purchase}</strong>
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {lang === "ar"
                  ? "الترقيم متسلسل وآمن، ولا يعاد إلى 0001 عند بداية شهر جديد."
                  : "Numbers stay sequential and do not reset to 0001 each month."}
              </p>
            </div>

            {/* Custom Labor / Service Fee Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border/80 bg-surface/70">
              <div className="space-y-0.5 pe-3">
                <div className="text-sm font-semibold text-foreground">
                  {lang === "ar"
                    ? "خدمة أو أجرة تركيب بسعر متفق عليه"
                    : "Custom Service / Installation Fee"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "إظهار زر مخصص في سلة البيع POS لإضافة بند خدمة سريعة أو أجور عمالة/تركيب دون الحاجة لتعريف منتج مسبق."
                    : "Enable quick custom service or labor fee entry in POS cart without catalog lookup."}
                </div>
              </div>
              <Switch
                checked={enablePosServiceFee}
                onCheckedChange={setEnablePosServiceFee}
                disabled={!canEdit}
              />
            </div>

            {/* Barcode Mode Toggle */}
            <div className="flex items-center justify-between p-3.5 rounded-2xl border border-border/80 bg-surface/70">
              <div className="space-y-0.5 pe-3">
                <div className="text-sm font-semibold text-foreground">
                  {lang === "ar" ? "تفعيل الباركود في POS" : "Barcode mode"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "السماح بمسح وقراءة الباركود بالكاميرا أو القارئ اليدوي"
                    : "Allow barcode scanning at POS"}
                </div>
              </div>
              <Switch
                checked={!!form.barcode_enabled}
                onCheckedChange={(v) => setForm({ ...form, barcode_enabled: v })}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {lang === "ar" ? "شعار الفاتورة" : "Invoice logo"}
              </div>
              <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/50 p-4 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
                  {form.logo_url ? (
                    <img
                      src={form.logo_url}
                      alt={lang === "ar" ? "معاينة شعار الفاتورة" : "Invoice logo preview"}
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-semibold">
                    {form.logo_url
                      ? lang === "ar"
                        ? "الشعار الحالي"
                        : "Current logo"
                      : lang === "ar"
                        ? "لم يتم اختيار شعار"
                        : "No logo selected"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? "ارفع صورة PNG أو JPG أو WebP بحد أقصى 3 ميجابايت. لن تحتاج إلى رابط خارجي."
                      : "Upload a PNG, JPG, or WebP image up to 3 MB. No external URL is needed."}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={!canEdit || logoUploading}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) void uploadCompanyLogo(file);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={!canEdit || logoUploading}
                      className="rounded-xl"
                    >
                      {logoUploading ? (
                        <LoaderCircle className="me-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="me-2 h-4 w-4" />
                      )}
                      {logoUploading
                        ? lang === "ar"
                          ? "جارٍ الرفع..."
                          : "Uploading..."
                        : form.logo_url
                          ? lang === "ar"
                            ? "استبدال الشعار"
                            : "Replace logo"
                          : lang === "ar"
                            ? "اختيار صورة"
                            : "Choose image"}
                    </Button>
                    {form.logo_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setForm({ ...form, logo_url: null })}
                        disabled={!canEdit || logoUploading}
                        className="rounded-xl text-muted-foreground"
                      >
                        <Trash2 className="me-2 h-4 w-4" />
                        {lang === "ar" ? "إزالة" : "Remove"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Print Settings — unified printing architecture (templates, paper size,
                auto-print jobs, and document field visibility). This card persists to the
                single source of truth and stays in sync with the legacy POS keys. */}
            <PrintSettingsCard canEdit={canEdit} />
          </CardContent>
        </Card>

        {/* Appearance & Language */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Languages className="h-4 w-4" />
              {lang === "ar" ? "المظهر واللغة" : "Appearance & Language"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <div className="text-sm font-medium">{lang === "ar" ? "اللغة" : "Language"}</div>
                <div className="text-xs text-muted-foreground">
                  {lang === "ar"
                    ? "اختر لغة الواجهة، يتم حفظ اختيارك تلقائياً"
                    : "Choose the interface language, your choice is saved automatically"}
                </div>
              </div>
              <div className="inline-flex rounded-full border border-border bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={`h-8 rounded-full px-4 text-xs font-medium transition-colors ${
                    lang === "en"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setLang("ar")}
                  className={`h-8 rounded-full px-4 text-xs font-medium transition-colors ${
                    lang === "ar"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  العربية
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <CatalogModulesDialog open={catalogDialogOpen} onClose={() => setCatalogDialogOpen(false)} />
    </>
  );
}

function Field({
  label,
  v,
  on,
  type = "text",
  disabled,
}: {
  label: string;
  v: string;
  on: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={v} onChange={(e) => on(e.target.value)} disabled={disabled} />
    </div>
  );
}

function CurrencyPicker({
  options,
  selectedCode,
  language,
  disabled,
  onSelect,
}: {
  options: CurrencyOption[];
  selectedCode: string;
  language: string;
  disabled: boolean;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isAr = language === "ar";
  const selected = options.find((currency) => currency.code === selectedCode);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{isAr ? "العملة الأساسية" : "Base currency"}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="h-10 w-full justify-between rounded-2xl px-3 font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="text-lg leading-none">
                {selected?.flag ?? "🌐"}
              </span>
              <span className="truncate text-start">
                <span className="font-mono font-semibold">{selectedCode}</span>
                {selected?.name && (
                  <span className="ms-2 text-muted-foreground">{selected.name}</span>
                )}
              </span>
            </span>
            <ChevronDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(360px,calc(100vw-2rem))] p-0">
          <Command dir={isAr ? "rtl" : "ltr"}>
            <CommandInput
              placeholder={isAr ? "ابحث باسم العملة أو رمزها..." : "Search by currency or code..."}
            />
            <CommandList>
              <CommandEmpty>
                {isAr ? "لم يتم العثور على عملة." : "No currency found."}</CommandEmpty>
              <CommandGroup heading={isAr ? "العملات" : "Currencies"}>
                {options.map((currency) => (
                  <CommandItem
                    key={currency.code}
                    value={`${currency.code} ${currency.name} ${currency.symbol}`}
                    onSelect={() => {
                      onSelect(currency.code);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <span aria-hidden="true" className="text-lg leading-none">
                      {currency.flag}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{currency.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {currency.code} · {currency.symbol}
                    </span>
                    <Check
                      className={`h-4 w-4 ${
                        currency.code === selectedCode ? "opacity-100" : "opacity-0"
                      }`}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
