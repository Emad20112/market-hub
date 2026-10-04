import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  PackagePlus,
  Plus,
  Pencil,
  Search,
  Check,
  Copy,
  Boxes,
  Tag,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { VortexDrawerDialog } from "@/components/vortex-ui";

const db = supabase as any;

export interface PackagingBagItem {
  id: string;
  sku: string;
  name: string;
  name_ar: string;
  sale_price: number;
  cost_price: number;
  is_active: boolean;
}

export function PackagingBagsCatalogView() {
  const { lang } = useI18n();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PackagingBagItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states
  const [formNameAr, setFormNameAr] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formSalePrice, setFormSalePrice] = useState(500);
  const [formCostPrice, setFormCostPrice] = useState(350);
  const [formIsActive, setFormIsActive] = useState(true);

  // Fetch packaging items from products table
  const { data: bags = [], isLoading } = useQuery({
    queryKey: ["catalog", "packaging-bags"],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select("id, sku, name, name_ar, sale_price, cost_price, is_active")
        .ilike("sku", "PKG-%")
        .order("sku");
      if (error) throw error;
      return (data || []) as PackagingBagItem[];
    },
  });

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return bags;
    return bags.filter((b) =>
      [b.name_ar, b.sku, b.name].some((v) => (v ?? "").toLowerCase().includes(s))
    );
  }, [bags, q]);

  const handleEdit = (b: PackagingBagItem) => {
    setEditing(b);
    setFormNameAr(b.name_ar || b.name);
    setFormSku(b.sku);
    setFormSalePrice(Number(b.sale_price) || 0);
    setFormCostPrice(Number(b.cost_price) || 0);
    setFormIsActive(b.is_active);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditing(null);
    setFormNameAr("");
    setFormSku("PKG-BAG-");
    setFormSalePrice(500);
    setFormCostPrice(350);
    setFormIsActive(true);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formNameAr.trim()) throw new Error("اسم الكيس أو المستلزم مطلوب");
      if (!formSku.trim()) throw new Error("كود الصنف (SKU) مطلوب");

      // Find category for packaging
      const { data: cat } = await db
        .from("categories")
        .select("id")
        .ilike("name_ar", "%تعبئة%")
        .maybeSingle();

      const payload = {
        name_ar: formNameAr.trim(),
        name: formNameAr.trim(),
        sku: formSku.trim().toUpperCase(),
        sale_price: formSalePrice,
        cost_price: formCostPrice,
        is_active: formIsActive,
        category_id: cat?.id || null,
        type: "product",
      };

      if (editing) {
        const { error } = await db
          .from("products")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("products").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "تم تعديل كيس التعبئة بنجاح" : "تمت إضافة الكيس بنجاح");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["catalog", "packaging-bags"] });
      qc.invalidateQueries({ queryKey: ["milling"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "فشل الحفظ");
    },
  });

  const copyText = (val: string, id: string) => {
    navigator.clipboard.writeText(val);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-5">
      {/* Search and Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث في الأكياس، كود الصنف، السعر..."
            className="w-full rounded-2xl border border-border bg-card pr-9 pl-4 py-2.5 text-xs focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="button"
          onClick={handleCreate}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary hover:bg-primary/90 px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-md transition active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>إضافة كيس تعبئة أو مستلزم جديد</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <PackagePlus className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">أصناف الأكياس المسجلة</p>
              <p className="text-xl font-black text-foreground">{bags.length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600">
              <DollarSign className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">سعر شوال 50 كجم للمطحنة</p>
              <p className="text-xl font-black font-mono text-foreground">
                {bags.find((b) => b.sku === "PKG-BAG-50")?.sale_price || 500} ر.ي
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-2xs">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">متوسط هامش الربح للكيس</p>
              <p className="text-xl font-black font-mono text-emerald-600">
                +150 ر.ي (30%)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 font-bold text-muted-foreground">
                <th className="px-4 py-3.5">اسم الكيس / المستلزم</th>
                <th className="px-4 py-3.5">كود الصنف (SKU)</th>
                <th className="px-4 py-3.5">سعر البيع للزبون</th>
                <th className="px-4 py-3.5">سعر التكلفة</th>
                <th className="px-4 py-3.5">هامش الربح</th>
                <th className="px-4 py-3.5">الحالة</th>
                <th className="px-4 py-3.5 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    جارٍ التحميل...
                  </td>
                </tr>
              )}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    لا توجد أكياس مسجلة.
                  </td>
                </tr>
              )}

              {filtered.map((b) => {
                const margin = Math.max(0, Number(b.sale_price || 0) - Number(b.cost_price || 0));
                return (
                  <tr key={b.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold">
                          <PackagePlus className="h-4 w-4" />
                        </div>
                        <span className="font-bold text-foreground">{b.name_ar || b.name}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex rounded-lg border border-border/80 bg-muted/50 px-2 py-0.5 font-mono text-[11px] font-bold text-foreground">
                        {b.sku}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-bold font-mono text-foreground">
                      {Number(b.sale_price).toLocaleString()} ر.ي
                    </td>

                    <td className="px-4 py-3.5 font-mono text-muted-foreground">
                      {Number(b.cost_price).toLocaleString()} ر.ي
                    </td>

                    <td className="px-4 py-3.5 font-mono text-emerald-600 font-bold">
                      +{margin.toLocaleString()} ر.ي
                    </td>

                    <td className="px-4 py-3.5">
                      {b.is_active ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                          <Check className="h-3 w-3" /> نشط
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">معطل</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyText(b.name_ar || b.name, b.id)}
                          className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted"
                          title="نسخ الاسم"
                        >
                          {copiedId === b.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(b)}
                          className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted"
                          title="تعديل السعر والمواصفات"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Dialog */}
      <VortexDrawerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "تعديل كيس تعبئة / مستلزم" : "إضافة كيس تعبئة جديد"}
      >
        <div className="space-y-4 p-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-bold text-foreground">اسم الكيس أو المستلزم بالعربي *</label>
            <input
              type="text"
              value={formNameAr}
              onChange={(e) => setFormNameAr(e.target.value)}
              placeholder="مثال: كيس تعبئة دقيق 50 كجم"
              className="w-full rounded-xl border border-border bg-background px-3 py-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-foreground">كود الصنف (SKU) *</label>
            <input
              type="text"
              value={formSku}
              onChange={(e) => setFormSku(e.target.value)}
              placeholder="مثال: PKG-BAG-50"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono uppercase"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="font-bold text-foreground">سعر البيع للزبون (ر.ي) *</label>
              <input
                type="number"
                min={0}
                value={formSalePrice}
                onChange={(e) => setFormSalePrice(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-bold text-foreground">سعر التكلفة للمطحنة (ر.ي)</label>
              <input
                type="number"
                min={0}
                value={formCostPrice}
                onChange={(e) => setFormCostPrice(Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isBagActive"
              checked={formIsActive}
              onChange={(e) => setFormIsActive(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="isBagActive" className="text-xs font-semibold text-foreground">
              صنف نشط ومتاح في كاونتر الطحن والمبيعات
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
              className="px-5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
            >
              {saveMutation.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </button>
          </div>
        </div>
      </VortexDrawerDialog>
    </div>
  );
}
