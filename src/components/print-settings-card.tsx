import { useState, useEffect, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Printer,
  Eye,
  ScrollText,
  Layers,
  Sliders,
  ShieldCheck,
  Check,
} from "lucide-react";
import {
  getPrintSettings,
  savePrintSettings,
  PrintSettings,
  InvoiceTemplateId,
  type PaperProfileId,
  PAPER_PROFILES,
  getTemplateMeta,
} from "@/lib/templates";
const PrintPreviewModal = lazy(() => import("@/components/print-preview").then(m => ({ default: m.PrintPreviewModal })));
import { toast } from "sonner";

interface PrintSettingsCardProps {
  canEdit?: boolean;
}

export function PrintSettingsCard({ canEdit = true }: PrintSettingsCardProps) {
  const [settings, setSettings] = useState<PrintSettings>(() => getPrintSettings());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocType, setPreviewDocType] = useState<"customer_invoice" | "inventory_document">("customer_invoice");

  useEffect(() => {
    setSettings(getPrintSettings());
  }, []);

  function handleToggle(key: keyof PrintSettings) {
    const updated = savePrintSettings({ [key]: !settings[key] });
    setSettings(updated);
    toast.success("تم تحديث إعدادات الطباعة");
  }

  function saveProfile(documentType: "customer" | "inventory", templateId: InvoiceTemplateId, paperProfileId: PaperProfileId) {
    const updated = savePrintSettings(
      documentType === "customer"
        ? { defaultCustomerTemplate: templateId, defaultCustomerPaperProfile: paperProfileId }
        : { defaultInventoryTemplate: templateId, defaultInventoryPaperProfile: paperProfileId },
    );
    setSettings(updated);
    toast.success("تم حفظ إعداد الطباعة الافتراضي");
  }

  return (
    <>
      <Card className="lg:col-span-2 rounded-3xl border-primary/20 bg-card shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              الطباعة والقوالب
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              className="rounded-full gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
            >
              <Eye className="h-4 w-4 me-1" />
              المعاينة التفاعلية المباشرة (Live Preview)
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-5">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-primary" />
                إعدادات الطباعة
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">اختر القالب وPaper Profile لكل نوع مستند، ثم عاين واحفظ الإعداد الافتراضي.</p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <PrintProfileCard
                documentType="customer_invoice"
                title="فاتورة المبيعات"
                description="الفاتورة التي يستلمها العميل"
                templateId={settings.defaultCustomerTemplate}
                paperProfileId={settings.defaultCustomerPaperProfile ?? "thermal-80"}
                canEdit={canEdit}
                onSave={(templateId, paperProfileId) => saveProfile("customer", templateId, paperProfileId)}
                onPreview={() => {
                  setPreviewDocType("customer_invoice");
                  setPreviewOpen(true);
                }}
              />
              <PrintProfileCard
                documentType="inventory_document"
                title="مستند حركة المخزون"
                description="مستند الصرف والاستلام والتحويل الداخلي"
                templateId={settings.defaultInventoryTemplate}
                paperProfileId={settings.defaultInventoryPaperProfile ?? "thermal-80"}
                canEdit={canEdit}
                onSave={(templateId, paperProfileId) => saveProfile("inventory", templateId, paperProfileId)}
                onPreview={() => {
                  setPreviewDocType("inventory_document");
                  setPreviewOpen(true);
                }}
              />
            </div>
          </div>

          {/* Section 2: Multi-Document Print Job Automation */}
          <div className="pt-2 border-t">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-primary" />
              2. الطباعة المتعددة التلقائية بعد إنهاء البيع (Multi-Document Print Jobs)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3.5 rounded-2xl border bg-surface/80">
                <div className="space-y-0.5 pe-3">
                  <div className="text-sm font-semibold">طباعة فاتورة العميل تلقائياً</div>
                  <div className="text-xs text-muted-foreground">
                    إرسال فاتورة العميل إلى المحرك فور اعتماد العملية.
                  </div>
                </div>
                <Switch
                  checked={settings.autoPrintCustomerInvoice}
                  onCheckedChange={() => handleToggle("autoPrintCustomerInvoice")}
                  disabled={!canEdit}
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl border bg-surface/80">
                <div className="space-y-0.5 pe-3">
                  <div className="text-sm font-semibold">طباعة مستند المخزون تلقائياً</div>
                  <div className="text-xs text-muted-foreground">
                    طباعة مستند إذن الصرف المخزني الداخلي بالتوازي مع الفاتورة.
                  </div>
                </div>
                <Switch
                  checked={settings.autoPrintInventoryDocument}
                  onCheckedChange={() => handleToggle("autoPrintInventoryDocument")}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Field Visibility Toggles (إظهار/إخفاء عناصر الفاتورة) */}
          <div className="pt-2 border-t">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-primary" />
              3. تخصيص إظهار وإخفاء عناصر المستندات (Field Visibility Customization)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-xs">
              <ToggleOption
                label="شعار المنشأة"
                checked={settings.showLogo}
                onChange={() => handleToggle("showLogo")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="بيانات المنشأة"
                checked={settings.showCompanyInfo}
                onChange={() => handleToggle("showCompanyInfo")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="بيانات العميل"
                checked={settings.showCustomerInfo}
                onChange={() => handleToggle("showCustomerInfo")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="رقم المستند والتاريخ"
                checked={settings.showDocNumberDate}
                onChange={() => handleToggle("showDocNumberDate")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="بيانات الحركة والمستودع"
                checked={settings.showMovementInfo}
                onChange={() => handleToggle("showMovementInfo")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="الضريبة والخصم"
                checked={settings.showFinancialDetails}
                onChange={() => handleToggle("showFinancialDetails")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="طريقة الدفع والمدفوع"
                checked={settings.showPaymentInfo}
                onChange={() => handleToggle("showPaymentInfo")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="الملاحظات والشروط"
                checked={settings.showNotes}
                onChange={() => handleToggle("showNotes")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="خانات التوقيعات"
                checked={settings.showSignatures}
                onChange={() => handleToggle("showSignatures")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="الهامش السفلي Footer"
                checked={settings.showFooter}
                onChange={() => handleToggle("showFooter")}
                disabled={!canEdit}
              />
              <ToggleOption
                label="التوقيع البرمجي (Inama Soft)"
                checked={settings.showBranding}
                onChange={() => handleToggle("showBranding")}
                disabled={!canEdit}
              />
            </div>
          </div>

          {/* Section 4: Direct Printer System Overview */}
          <div className="pt-2 border-t">
            <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/10 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" />
                محرك الطباعة المباشر ودعم طابعات الـ Thermal و A4
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                يدعم النظام طباعة الفواتير بدون توقف عبر متصفح الويب (Browser Print Engine) دون
                الحاجة لإضافات معقدة. كما أُعدت معمارية النظام (Architecture) لتكون جاهزة للتكامل
                المباشر مع خدمات الطباعة المحلية مثل <b>QZ Tray</b> أو برامج الـ Desktop Wrappers
                للطابعات الحرارية الشبكية والمباشرة USB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        <PrintPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          initialDocType={previewDocType}
        />
      </Suspense>
    </>
  );
}

function ToggleOption({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked?: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl border bg-surface/60 hover:bg-surface transition">
      <span className="font-medium text-foreground text-[11.5px] pe-2">{label}</span>
      <Switch
        checked={!!checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="scale-90"
      />
    </div>
  );
}


interface PrintProfileCardProps {
  documentType: "customer_invoice" | "inventory_document";
  title: string;
  description: string;
  templateId: InvoiceTemplateId;
  paperProfileId: PaperProfileId;
  canEdit: boolean;
  onSave: (templateId: InvoiceTemplateId, paperProfileId: PaperProfileId) => void;
  onPreview: () => void;
}

function PrintProfileCard({
  documentType,
  title,
  description,
  templateId: initialTemplateId,
  paperProfileId: initialPaperProfileId,
  canEdit,
  onSave,
  onPreview,
}: PrintProfileCardProps) {
  const [templateId, setTemplateId] = useState<InvoiceTemplateId>(initialTemplateId);
  const [paperProfileId, setPaperProfileId] = useState<PaperProfileId>(initialPaperProfileId);
  const templateMeta = getTemplateMeta(templateId);
  const supportedPapers = templateMeta?.supportedPaperProfiles ?? [];
  const templates = (["thermal", "standard", "elegant"] as InvoiceTemplateId[]).filter((id) => {
    const meta = getTemplateMeta(id);
    return meta && (!meta.supportedDocTypes || meta.supportedDocTypes.includes(documentType));
  });
  const isDirty = templateId !== initialTemplateId || paperProfileId !== initialPaperProfileId;
  const selectedPaper = supportedPapers.includes(paperProfileId) ? paperProfileId : supportedPapers[0];

  function handleTemplateChange(nextTemplateId: InvoiceTemplateId) {
    setTemplateId(nextTemplateId);
    const nextPapers = getTemplateMeta(nextTemplateId)?.supportedPaperProfiles ?? [];
    if (!nextPapers.includes(paperProfileId)) {
      setPaperProfileId(nextPapers[0]);
    }
  }

  return (
    <div className="rounded-2xl border-border/80 bg-surface/70 p-4 shadow-xs transition hover:border-primary/30 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="text-sm font-bold truncate">{title}</h5>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              <Check className="h-3 w-3" /> الافتراضي
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-xl bg-primary/10 p-2 text-primary shrink-0">
          <Printer className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-semibold">
          <span className="text-muted-foreground">القالب</span>
          <select
            value={templateId}
            disabled={!canEdit}
            onChange={(event) => handleTemplateChange(event.target.value)}
            className="h-10 w-full rounded-xl border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          >
            {templates.map((id) => {
              const meta = getTemplateMeta(id)!;
              return <option key={id} value={id}>{meta.nameAr}</option>;
            })}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-semibold">
          <span className="text-muted-foreground">Paper Profile</span>
          <select
            value={selectedPaper}
            disabled={!canEdit}
            onChange={(event) => setPaperProfileId(event.target.value as PaperProfileId)}
            className="h-10 w-full rounded-xl border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          >
            {supportedPapers.map((id) => {
              const paper = PAPER_PROFILES[id];
              return <option key={id} value={id}>{paper.nameAr}</option>;
            })}
          </select>
        </label>
      </div>

      <div className="mt-3 flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="text-[11px] text-muted-foreground">
          {templateMeta?.nameAr} · {PAPER_PROFILES[selectedPaper]?.nameAr}
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onPreview} className="h-8 rounded-lg gap-1.5 text-xs">
            <Eye className="h-3.5 w-3.5" /> معاينة
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canEdit || !isDirty || !selectedPaper}
            onClick={() => selectedPaper && onSave(templateId, selectedPaper)}
            className="h-8 rounded-lg gap-1.5 text-xs"
          >
            <Check className="h-3.5 w-3.5" /> حفظ
          </Button>
        </div>
      </div>
    </div>
  );
}
