import { useState, useEffect } from "react";
import { Warehouse, MapPin, Tag, Check, X, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";

export interface WarehouseRecord {
  id: string;
  name: string;
  name_ar?: string | null;
  code?: string | null;
  address?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export interface WarehouseFormDialogProps {
  open: boolean;
  onClose: () => void;
  initial?: Partial<WarehouseRecord> | null;
  onSaved?: (record: WarehouseRecord) => void;
  hint?: string;
}

export function WarehouseFormDialog({
  open,
  onClose,
  initial,
  onSaved,
  hint,
}: WarehouseFormDialogProps) {
  const { lang } = useI18n();
  const isAr = lang === "ar";

  const [nameAr, setNameAr] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [showAdditional, setShowAdditional] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNameAr(initial?.name_ar ?? initial?.name ?? "");
      setNameEn(initial?.name ?? "");
      setCode(initial?.code ?? "");
      setAddress(initial?.address ?? "");
      setIsDefault(Boolean(initial?.is_default));
      setShowAdditional(
        Boolean(initial?.address || (initial?.name && initial.name !== initial.name_ar)),
      );
    }
  }, [open, initial]);

  if (!open) return null;

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (saving) return;

    const trimmedAr = nameAr.trim();
    const trimmedEn = nameEn.trim();
    if (!trimmedAr && !trimmedEn) {
      toast.error(isAr ? "يرجى إدخال اسم المستودع" : "Warehouse name is required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: trimmedEn || trimmedAr,
        name_ar: trimmedAr || null,
        code: code.trim() || null,
        address: address.trim() || null,
        is_default: isDefault,
        is_active: true,
      };

      if (isDefault) {
        // إذا تم تحديده كافتراضي، قم بإلغاء الافتراضي من المستودعات الأخرى
        await supabase
          .from("warehouses")
          .update({ is_default: false })
          .neq("id", initial?.id ?? "00000000-0000-0000-0000-000000000000");
      }

      const { data, error } = initial?.id
        ? await supabase
            .from("warehouses")
            .update(payload)
            .eq("id", initial.id)
            .select("*")
            .single()
        : await supabase.from("warehouses").insert(payload).select("*").single();

      if (error) throw error;

      toast.success(isAr ? "تم حفظ المستودع بنجاح" : "Warehouse saved successfully");
      if (data && onSaved) {
        onSaved(data as WarehouseRecord);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(isAr ? `فشل حفظ المستودع: ${msg}` : `Failed to save warehouse: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-border/80 bg-card shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* الترويسة الفاخرة */}
        <div className="flex items-center justify-between border-b border-border/70 bg-gradient-to-b from-amber-500/[0.12] via-amber-500/[0.04] to-transparent p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl border border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs">
              <Warehouse className="size-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {initial?.id
                  ? isAr
                    ? "تعديل بيانات المستودع"
                    : "Edit Warehouse"
                  : isAr
                    ? "إضافة مستودع / مخزن جديد"
                    : "New Warehouse"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isAr
                  ? "تسجيل مستودع لتخزين الحبوب والمواد ونواتج التشغيل"
                  : "Register warehouse for grain storage and inventory"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* جسم النموذج */}
        <form onSubmit={handleSave} className="space-y-4 p-5">
          {/* اسم المستودع بالعربي */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              {isAr ? "اسم المستودع / المخزن" : "Warehouse Name"}{" "}
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Warehouse className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground z-10" />
              <input
                required
                autoFocus
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder={
                  isAr ? "مثال: المخزن الرئيسي، مستودع الحبوب رقم 1" : "e.g. Main Warehouse"
                }
                className="h-11 w-full rounded-2xl border border-border/80 bg-surface/80 ps-11 pe-4 text-sm font-medium transition placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* كود المستودع */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              {isAr ? "رمز / كود المستودع (اختياري)" : "Warehouse Code (Optional)"}
            </label>
            <div className="relative">
              <Tag className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground z-10" />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WH-01"
                className="h-11 w-full rounded-2xl border border-border/80 bg-surface/80 ps-11 pe-4 font-mono text-sm font-medium transition placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
            </div>
          </div>

          {/* خيار المستودع الافتراضي */}
          <label className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-surface/50 p-3 cursor-pointer hover:bg-surface transition">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-4 rounded-md border-border text-amber-500 focus:ring-amber-500/30"
            />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-foreground">
                {isAr ? "تعيين كمستودع افتراضي للنظام" : "Set as Default Warehouse"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {isAr
                  ? "يُحدد تلقائياً في شاشات الاستلام، الطحن، والتسليم"
                  : "Auto-selected in intake, milling, and delivery"}
              </span>
            </div>
          </label>

          {/* قسم معلومات إضافية قابل للطي */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdditional(!showAdditional)}
              className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3 text-amber-500" />
                {isAr
                  ? "معلومات إضافية (العنوان، الاسم بالإنجليزية)"
                  : "Additional Info (Address, English Name)"}
              </span>
              <span className="text-[11px] text-amber-600 dark:text-amber-400">
                {showAdditional ? (isAr ? "إخفاء ▲" : "Hide ▲") : isAr ? "إظهار ▼" : "Show ▼"}
              </span>
            </button>

            {showAdditional && (
              <div className="mt-2.5 space-y-3 animate-in fade-in duration-200">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    {isAr ? "العنوان أو الموقع" : "Address / Location"}
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground z-10" />
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder={isAr ? "المدينة، المنطقة، المبنى" : "City, Area, Building"}
                      className="h-11 w-full rounded-2xl border border-border/80 bg-surface/80 ps-11 pe-4 text-sm font-medium transition placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    {isAr ? "الاسم بالإنجليزية (اختياري)" : "English Name (Optional)"}
                  </label>
                  <input
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    placeholder="Main Warehouse"
                    className="h-11 w-full rounded-2xl border border-border/80 bg-surface/80 px-4 text-sm font-medium transition placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
              </div>
            )}
          </div>

          {hint && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">
              {hint}
            </p>
          )}

          {/* الأزرار في الأسفل */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border/70 pt-4">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="h-10 rounded-xl border border-border bg-surface px-4 text-xs font-semibold text-foreground transition hover:bg-muted"
            >
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              type="submit"
              disabled={saving || (!nameAr.trim() && !nameEn.trim())}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-500 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>{isAr ? "جارٍ الحفظ…" : "Saving…"}</span>
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  <span>{isAr ? "حفظ المستودع" : "Save Warehouse"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
