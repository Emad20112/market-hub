import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { setCompanySettingsCache } from "@/lib/format";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "الإعدادات — فورتيكس ERP" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const { t, lang } = useI18n();
  const { hasRole } = useAuth();
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
    invoice_prefix: "INV",
    barcode_enabled: true,
  });
  const [exists, setExists] = useState(false);
  const [saving, setSaving] = useState(false);

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
          setForm(data);
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
    await queryClient.invalidateQueries({ queryKey: ["company-settings", "currency"] });
    toast.success(
      lang === "ar" ? "تم حفظ الإعدادات بنجاح" : t("common.saved") || t("common.success"),
    );
    setExists(true);
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title={t("settings.title")}
        subtitle={
          lang === "ar"
            ? "إدارة إعدادات النظام الموجودة: المنشأة، الفواتير، الطباعة، النشاط، الباقة، النسخ الاحتياطي، الأرقام، والمظهر"
            : "Manage existing system settings: company, invoicing, printing, catalog, plan, backup, numbers, and appearance"
        }
        actions={
          canEdit && (
            <Button onClick={save} disabled={saving} className="rounded-full gap-1.5 px-5">
              <Save className={`h-4 w-4 me-1 ${saving ? "animate-pulse" : ""}`} />
              {saving ? (lang === "ar" ? "جارٍ الحفظ..." : "Saving...") : t("common.save")}
            </Button>
          )
        }
      />

      <SettingsLayout
        form={form}
        setForm={setForm}
        enablePosServiceFee={enablePosServiceFee}
        setEnablePosServiceFee={setEnablePosServiceFee}
        printMode={"ask" as any}
        setPrintMode={() => {}}
        defaultPrintTemplate={undefined}
        setDefaultPrintTemplate={() => {}}
        canEdit={canEdit}
        lang={lang}
      />
    </div>
  );
}
