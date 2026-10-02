import { Receipt, ScanBarcode, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface InvoicingSectionProps {
  form: any;
  setForm: (form: any) => void;
  enablePosServiceFee: boolean;
  setEnablePosServiceFee: (v: boolean) => void;
  canEdit: boolean;
  lang: string;
}

export function InvoicingSection({
  form,
  setForm,
  enablePosServiceFee,
  setEnablePosServiceFee,
  canEdit,
  lang,
}: InvoicingSectionProps) {
  const isAr = lang === "ar";
  return (
    <Card className="rounded-3xl border-border/80 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <div>{isAr ? "إعدادات المبيعات ونقطة البيع" : "Sales & POS Settings"}</div>
            <div className="text-xs text-muted-foreground font-normal mt-0.5">
              {isAr
                ? "ضبط العملة، الضرائب، ترقيم الفواتير، الخدمات الإضافية، والباركود"
                : "Configure currency, taxes, invoice numbering, extra services, and barcode"}
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {/* Currency & Financial Standards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">{isAr ? "العملة" : "Currency"}</Label>
            <Input
              value={form.currency ?? "USD"}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              disabled={!canEdit}
              placeholder="YER / SAR / USD"
              className="rounded-2xl uppercase font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">
              {isAr ? "رمز العملة" : "Currency symbol"}
            </Label>
            <Input
              value={form.currency_symbol ?? ""}
              onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
              disabled={!canEdit}
              placeholder="ر.ي / $"
              className="rounded-2xl"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">
              {isAr ? "نسبة الضريبة %" : "Tax rate %"}
            </Label>
            <Input
              type="number"
              value={String(form.tax_rate ?? 0)}
              onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              disabled={!canEdit}
              placeholder="15"
              className="rounded-2xl font-mono"
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold">
              {isAr ? "بادئة الفاتورة" : "Invoice prefix"}
            </Label>
            <Input
              value={form.invoice_prefix ?? "INV"}
              onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })}
              disabled={!canEdit}
              placeholder="INV"
              className="rounded-2xl uppercase font-mono"
            />
          </div>
        </div>

        {/* Feature Switches */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Custom Labor Fee Switch */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-border/80 bg-surface/70">
            <div className="space-y-1 pe-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-500" />
                {isAr ? "خدمة أو أجرة تركيب بسعر مخصص" : "Custom Labor / Installation Fee"}
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? "إظهار زر مخصص في سلة نقطة البيع (POS) لإضافة بند خدمة سريعة أو أجور عمالة مباشرة."
                  : "Enable quick custom service or labor fee entry in POS cart without catalog lookup."}
              </div>
            </div>
            <Switch
              checked={enablePosServiceFee}
              onCheckedChange={setEnablePosServiceFee}
              disabled={!canEdit}
            />
          </div>

          {/* Barcode Scanner Mode */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-border/80 bg-surface/70">
            <div className="space-y-1 pe-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ScanBarcode className="h-4 w-4 text-violet-500" />
                {isAr ? "تفعيل قارئ الباركود في POS" : "Barcode Scanner Mode"}
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {isAr
                  ? "السماح بمسح وقراءة الباركود بالكاميرا أو القارئ اليدوي في شاشة نقطة البيع."
                  : "Allow barcode scanning at POS."}
              </div>
            </div>
            <Switch
              checked={!!form.barcode_enabled}
              onCheckedChange={(v) => setForm({ ...form, barcode_enabled: v })}
              disabled={!canEdit}
            />
          </div>
        </div>

      </CardContent>
    </Card>
  );
}
