import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  Wheat,
  Plus,
  Pencil,
  Scale,
  PackagePlus,
  Droplets,
  Layers,
  Check,
  Copy,
  SlidersHorizontal,
  Info,
  ShieldCheck,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { VortexDrawerDialog } from "@/components/vortex-ui";

const db = supabase as any;

export interface GrainGradeItem {
  id: string;
  product_id: string;
  sku?: string;
  product_name_ar?: string;
  grade_code: string;
  grade_name_ar: string;
  origin: "LOCAL" | "IMPORTED" | null;
  max_moisture: number;
  max_impurities: number;
  default_bag_size_kg: number;
  default_bag_type?: string | null;
  default_service_sku?: string | null;
  is_active: boolean;
}

export function GrainGradesCatalogView() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<GrainGradeItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states
  const [formNameAr, setFormNameAr] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formProductId, setFormProductId] = useState("");
  const [formOrigin, setFormOrigin] = useState<"LOCAL" | "IMPORTED">("LOCAL");
  const [formBagSize, setFormBagSize] = useState(50);
  const [formBagType, setFormBagType] = useState("شوال خيش طبيعي 50 كجم");
  const [formMaxMoisture, setFormMaxMoisture] = useState(14);
  const [formMaxImpurities, setFormMaxImpurities] = useState(2);
  const [formServiceSku, setFormServiceSku] = useState("SRV-MILL-BAG50");
  const [formIsActive, setFormIsActive] = useState(true);

  // Load Grain Grades from DB
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ["catalog", "grain-grades"],
    queryFn: async () => {
      const { data, error } = await db
        .from("milling_grain_grades_view")
        .select("*")
        .order("grade_name_ar");
      if (error) {
        // Fallback to table
        const { data: raw, error: rawErr } = await db
          .from("milling_grain_grades")
          .select("*")
          .order("grade_name_ar");
        if (rawErr) throw rawErr;
        return (raw || []) as GrainGradeItem[];
      }
      return (data || []) as GrainGradeItem[];
    },
  });

  // Load raw grain products to link
  const { data: rawProducts = [] } = useQuery({
    queryKey: ["raw-grain-products"],
    queryFn: async () => {
      const { data } = await db
        .from("products")
        .select("id, sku, name_ar")
        .ilike("sku", "RM-%")
        .eq("is_active", true);
      return (data || []) as { id: string; sku: string; name_ar: string }[];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return grades;
    return grades.filter((g) =>
      [g.grade_name_ar, g.grade_code, g.sku, g.origin, g.default_bag_type]
        .some((val) => (val ?? "").toLowerCase().includes(s))
    );
  }, [grades, q]);

  // Open edit dialog
  const handleEdit = (g: GrainGradeItem) => {
    setEditing(g);
    setFormNameAr(g.grade_name_ar);
    setFormCode(g.grade_code);
    setFormProductId(g.product_id);
    setFormOrigin(g.origin || "LOCAL");
    setFormBagSize(Number(g.default_bag_size_kg) || 50);
    setFormBagType(g.default_bag_type || "شوال خيش طبيعي 50 كجم");
    setFormMaxMoisture(Number(g.max_moisture) || 14);
    setFormMaxImpurities(Number(g.max_impurities) || 2);
    setFormServiceSku(g.default_service_sku || "SRV-MILL-BAG50");
    setFormIsActive(g.is_active);
    setDialogOpen(true);
  };

  // Open create dialog
  const handleCreate = () => {
    setEditing(null);
    setFormNameAr("");
    setFormCode("");
    setFormProductId(rawProducts[0]?.id || "");
    setFormOrigin("LOCAL");
    setFormBagSize(50);
    setFormBagType("شوال خيش طبيعي 50 كجم");
    setFormMaxMoisture(14);
    setFormMaxImpurities(2);
    setFormServiceSku("SRV-MILL-BAG50");
    setFormIsActive(true);
    setDialogOpen(true);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formNameAr.trim()) throw new Error("اسم درجة الحبوب بالعربي مطلوب");
      if (!formCode.trim()) throw new Error("الرمز التعريفي مطلوب");

      const payload = {
        grade_name_ar: formNameAr.trim(),
        grade_code: formCode.trim().toUpperCase(),
        product_id: formProductId || rawProducts[0]?.id,
        origin: formOrigin,
        default_bag_size_kg: formBagSize,
        default_bag_type: formBagType,
        max_moisture: formMaxMoisture,
        max_impurities: formMaxImpurities,
        default_service_sku: formServiceSku,
        is_active: formIsActive,
      };

      if (editing) {
        const { error } = await db
          .from("milling_grain_grades")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("milling_grain_grades").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم تحديث درجة الحبوب بنجاح" : "تمت إضافة نوع الحبوب بنجاح");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["catalog", "grain-grades"] });
      qc.invalidateQueries({ queryKey: ["milling"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "حدث خطأ أثناء الحفظ");
    },
  });

  const copyText = (val: string, id: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث في أنواع ودرجات الحبوب، الرمز، المنشأ..."
            className="w-full rounded-2xl border border-border bg-card pr-9 pl-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-500/20 transition active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>إضافة نوع / درجة حبوب جديدة</span>
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Wheat className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">أنواع الحبوب المعرفة</p>
              <p className="text-xl font-black text-foreground">{grades.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">حبوب بلدية محلية</p>
              <p className="text-xl font-black text-foreground">
                {grades.filter((g) => g.origin === "LOCAL").length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">حبوب مستوردة</p>
              <p className="text-xl font-black text-foreground">
                {grades.filter((g) => g.origin === "IMPORTED").length}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <PackagePlus className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">أكياس التعبئة المعتمدة</p>
              <p className="text-xl font-black text-foreground">50 كجم • 25 كجم</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-bold text-muted-foreground">
                <th className="px-4 py-3.5">نوع ودرجة الحبوب</th>
                <th className="px-4 py-3.5">الرمز والكود المرجعي</th>
                <th className="px-4 py-3.5">بلد / نوع المنشأ</th>
                <th className="px-4 py-3.5">نظام الأكياس الافتراضي</th>
                <th className="px-4 py-3.5">حدود الرطوبة والشوائب</th>
                <th className="px-4 py-3.5">خدمة الطحن المرتبطة</th>
                <th className="px-4 py-3.5">الحالة</th>
                <th className="px-4 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    جارٍ تحميل بيانات فهرس الحبوب...
                  </td>
                </tr>
              )}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    لا توجد درجات حبوب مطابقة للبحث.
                  </td>
                </tr>
              )}

              {filtered.map((g) => (
                <tr key={g.id} className="transition-colors hover:bg-muted/30">
                  {/* Name */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                        <Wheat className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-bold text-foreground">{g.grade_name_ar}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {g.sku ? `الصنف: ${g.sku}` : "غير مرتبط بصنف مخزون"}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Code */}
                  <td className="px-4 py-3.5">
                    <span className="inline-flex rounded-lg border border-border/80 bg-muted/50 px-2 py-0.5 font-mono text-[11px] font-bold text-foreground">
                      {g.grade_code}
                    </span>
                  </td>

                  {/* Origin */}
                  <td className="px-4 py-3.5">
                    {g.origin === "LOCAL" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        محلي
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        مستورد
                      </span>
                    )}
                  </td>

                  {/* Bag system */}
                  <td className="px-4 py-3.5">
                    <div className="space-y-0.5">
                      <span className="font-mono font-bold text-foreground">
                        {g.default_bag_size_kg} كجم
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        {g.default_bag_type || "شوال خيش طبيعي"}
                      </p>
                    </div>
                  </td>

                  {/* Tech specs */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium">
                        <Droplets className="h-3 w-3" />
                        رطوبة: {g.max_moisture}%
                      </span>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-muted-foreground">
                        شوائب: {g.max_impurities}%
                      </span>
                    </div>
                  </td>

                  {/* Service SKU */}
                  <td className="px-4 py-3.5 font-mono text-[11px] text-muted-foreground">
                    {g.default_service_sku || "SRV-MILL-BAG50"}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    {g.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                        <Check className="h-3 w-3" /> نشط
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">معطل</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyText(g.grade_name_ar, g.id)}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted"
                        title="نسخ الاسم"
                      >
                        {copiedId === g.id ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(g)}
                        className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted"
                        title="تعديل مواصفات الحبة والأكياس"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <VortexDrawerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "تعديل مواصفات درجة الحبوب والأكياس" : "إضافة درجة ونوع حبوب جديد للفهرس"}
      >
        <div className="space-y-4 p-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-bold text-foreground">اسم درجة الحبوب بالعربي *</label>
            <input
              type="text"
              value={formNameAr}
              onChange={(e) => setFormNameAr(e.target.value)}
              placeholder="مثال: قمح صلب مستورد (درجة أولى)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="font-bold text-foreground">الرمز المرجعي (Code) *</label>
              <input
                type="text"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                placeholder="مثال: HARD_IMPORT"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono uppercase"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">المنشأ</label>
              <select
                value={formOrigin}
                onChange={(e) => setFormOrigin(e.target.value as any)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
              >
                <option value="LOCAL">محلي (بلدي)</option>
                <option value="IMPORTED">مستورد</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-foreground">الصنف الخام المرتبط في المخزون</label>
            <select
              value={formProductId}
              onChange={(e) => setFormProductId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            >
              {rawProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name_ar} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          {/* Bag specifications */}
          <div className="rounded-2xl border border-border bg-muted/20 p-3.5 space-y-3">
            <div className="flex items-center gap-1.5 font-bold text-amber-600">
              <PackagePlus className="h-4 w-4" />
              <span>مواصفات نظام الأكياس</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">سعة الكيس الافتراضية (كجم)</label>
                <select
                  value={formBagSize}
                  onChange={(e) => setFormBagSize(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono"
                >
                  <option value={50}>50 كجم (شوال كبير)</option>
                  <option value={40}>40 كجم</option>
                  <option value={25}>25 كجم (كيس وسط)</option>
                  <option value={10}>10 كجم (كيس صغير)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">نوع وخامة الكيس الافتراضي</label>
                <input
                  type="text"
                  value={formBagType}
                  onChange={(e) => setFormBagType(e.target.value)}
                  placeholder="مثال: شوال خيش طبيعي 50 كجم"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                />
              </div>
            </div>
          </div>

          {/* Quality thresholds */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="font-bold text-foreground">الحد الأقصى للرطوبة %</label>
              <input
                type="number"
                step="0.1"
                value={formMaxMoisture}
                onChange={(e) => setFormMaxMoisture(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">الحد الأقصى للشوائب %</label>
              <input
                type="number"
                step="0.1"
                value={formMaxImpurities}
                onChange={(e) => setFormMaxImpurities(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActiveCheck"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="isActiveCheck" className="text-xs font-semibold text-foreground">
              درجة نشطة ومتاحة في كاونتر الاستلام والطحن
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              className="px-4 py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold"
            >
              {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </button>
          </div>
        </div>
      </VortexDrawerDialog>
    </div>
  );
}
