/**
 * Market-Hub ERP — Product Creation & Editing Studio (ProductFormModal)
 * 
 * Designed completely from scratch following UI/UX Pro Max principles:
 * - Dual-pane studio layout with live preview & financial profit simulator
 * - Real-time barcode generation (GS1 EAN-13 with check digit calculation)
 * - Dynamic SKU generation & clipboard integration
 * - Quick margin presets (+10%, +25%, +35%, +50%, +100%) and instant pricing calculations
 * - Micro-interactions, visual readiness checklist, keyboard shortcuts (Ctrl+Enter)
 * - Full Arabic RTL first-class design with localized typography
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Package,
  Barcode as BarcodeIcon,
  Tag,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  Sparkles,
  Camera,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  X,
  Boxes,
  ShieldCheck,
  Globe2,
  Award,
  Bookmark,
  MapPin,
  Scale,
  Wrench,
  FileText,
  CornerDownLeft,
  ChevronRight,
  Info,
  RefreshCw,
} from "lucide-react";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { useKeyboardWedge } from "@/hooks/use-keyboard-wedge";
import { useProductFieldVisibility } from "@/hooks/use-product-field-visibility";
import { useCatalogModules } from "@/lib/catalog-modules";
import { useModules } from "@/lib/modules";
import {
  DEFAULT_USER_ITEM_POLICY_PREFERENCES,
  readUserItemPolicyPreferences,
  saveUserItemPolicyPreferences,
  type UserItemPolicyPreferences,
} from "@/lib/items/user-policy-preferences";
import {
  validateItemPolicy,
  type CostingMethod,
  type InventoryPolicy,
  type ItemNature,
  type ItemTracking,
} from "@/lib/items/policy";
import type { ProductFieldKey } from "@/lib/product-field-visibility";

export interface ProductRowLike {
  id: string;
  name: string;
  name_ar: string | null;
  sku: string | null;
  barcode: string | null;
  sale_price: number;
  cost_price: number;
  tax_rate: number;
  min_stock: number;
  shelf_location: string | null;
  origin_id: string | null;
  quality_grade_id: string | null;
  is_active: boolean;
  category_id: string | null;
  brand_id: string | null;
  unit_id: string | null;
  item_nature?: ItemNature | null;
  inventory_policy?: InventoryPolicy | null;
  tracking?: ItemTracking | null;
  costing_method?: CostingMethod | null;
  is_sellable?: boolean | null;
  is_purchasable?: boolean | null;
  [key: string]: any;
}

export interface ProductFormModalProps {
  open?: boolean;
  initial?: ProductRowLike | null;
  initialBarcode?: string;
  userId?: string | null;
  canViewCost?: boolean;
  meta: {
    categories: { id: string; name: string; name_ar: string | null }[];
    brands: { id: string; name: string; name_ar: string | null }[];
    units: { id: string; name: string; name_ar: string | null; short_name: string }[];
    origins: { id: string; code: string; name: string; name_ar: string }[];
    qualities: { id: string; name: string; name_ar: string; code?: string; sort_order?: number }[];
  };
  onClose: () => void;
  onSaved: () => void;
}

/** توليد باركود EAN-13 مع حساب رقم التحقق الرسمي */
function generateEAN13(prefix = "628"): string {
  let code = prefix;
  while (code.length < 12) {
    code += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit.toString();
}

/** توليد SKU ذكي ومنسق */
function generateSKU(categoryName?: string): string {
  const prefix = (categoryName || "PRD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 3)
    .toUpperCase() || "PRD";
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const numPart = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${numPart}-${randomPart}`;
}

type TabType = "identity" | "pricing" | "inventory" | "classification" | "policy";

export function ProductFormModal({
  open = true,
  initial,
  initialBarcode,
  userId,
  canViewCost = true,
  meta,
  onClose,
  onSaved,
}: ProductFormModalProps) {
  const { lang, t } = useI18n();
  const ar = lang === "ar";
  const { config } = useCatalogModules();
  const { isModuleEnabled } = useModules();
  const { isVisible: isFieldVisible } = useProductFieldVisibility();
  const showForm = (key: ProductFieldKey) => isFieldVisible("form", key);

  const [activeTab, setActiveTab] = useState<TabType>("identity");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const policyFromProduct = (product: ProductRowLike): UserItemPolicyPreferences => ({
    item_nature: product.item_nature ?? "GOOD",
    inventory_policy: product.inventory_policy ?? "TRACKED",
    tracking: product.tracking ?? "NONE",
    costing_method: product.costing_method ?? "MOVING_AVERAGE",
    is_sellable: product.is_sellable ?? true,
    is_purchasable: product.is_purchasable ?? true,
  });

  const [policy, setPolicy] = useState<UserItemPolicyPreferences>(() =>
    initial
      ? policyFromProduct(initial)
      : userId
        ? readUserItemPolicyPreferences(userId)
        : DEFAULT_USER_ITEM_POLICY_PREFERENCES,
  );

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    name_ar: initial?.name_ar ?? "",
    sku: initial?.sku ?? "",
    barcode: initial?.barcode ?? initialBarcode ?? "",
    category_id: initial?.category_id ?? "",
    brand_id: initial?.brand_id ?? "",
    unit_id: initial?.unit_id ?? "",
    cost_price: initial?.cost_price != null ? String(initial.cost_price) : "",
    sale_price: initial?.sale_price != null ? String(initial.sale_price) : "",
    tax_rate: initial?.tax_rate != null ? String(initial.tax_rate) : "0",
    min_stock: initial?.min_stock != null ? String(initial.min_stock) : "1",
    shelf_location: initial?.shelf_location ?? "",
    origin_id: initial?.origin_id ?? "",
    quality_grade_id: initial?.quality_grade_id ?? "",
    is_active: initial?.is_active ?? true,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setPolicy(policyFromProduct(initial));
      setForm({
        name: initial.name ?? "",
        name_ar: initial.name_ar ?? "",
        sku: initial.sku ?? "",
        barcode: initial.barcode ?? "",
        category_id: initial.category_id ?? "",
        brand_id: initial.brand_id ?? "",
        unit_id: initial.unit_id ?? "",
        cost_price: initial.cost_price != null ? String(initial.cost_price) : "",
        sale_price: initial.sale_price != null ? String(initial.sale_price) : "",
        tax_rate: initial.tax_rate != null ? String(initial.tax_rate) : "0",
        min_stock: initial.min_stock != null ? String(initial.min_stock) : "1",
        shelf_location: initial.shelf_location ?? "",
        origin_id: initial.origin_id ?? "",
        quality_grade_id: initial.quality_grade_id ?? "",
        is_active: initial.is_active ?? true,
      });
    } else {
      setPolicy(userId ? readUserItemPolicyPreferences(userId) : DEFAULT_USER_ITEM_POLICY_PREFERENCES);
    }
  }, [initial, userId]);

  useKeyboardWedge({
    onScan: (barcode) => {
      setForm((current) => ({ ...current, barcode }));
      toast.success(ar ? `تم مسح الباركود: ${barcode}` : `Barcode scanned: ${barcode}`);
    },
    disabled: !isModuleEnabled("barcode") || scannerOpen,
  });

  // حساب الأرباح والهامش الفوري
  const costNum = Number(form.cost_price) || 0;
  const saleNum = Number(form.sale_price) || 0;
  const profitNum = saleNum - costNum;
  const marginPercent = saleNum > 0 ? Math.round((profitNum / saleNum) * 100) : 0;
  const markupPercent = costNum > 0 ? Math.round((profitNum / costNum) * 100) : 0;

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(ar ? "تم النسخ للحافظة" : "Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const applyMarkup = (percent: number) => {
    const baseCost = costNum > 0 ? costNum : 100;
    const newPrice = Math.round(baseCost * (1 + percent / 100) * 100) / 100;
    setForm((prev) => ({ ...prev, sale_price: String(newPrice) }));
    toast.info(ar ? `تم ضبط السعر بهامش ربح +${percent}%` : `Applied +${percent}% margin`);
  };

  const handleGenerateBarcode = () => {
    const code = generateEAN13();
    setForm((prev) => ({ ...prev, barcode: code }));
    toast.success(ar ? "تم توليد باركود EAN-13 معتمد" : "Generated EAN-13 Barcode");
  };

  const handleGenerateSKU = () => {
    const cat = meta.categories.find((c) => c.id === form.category_id);
    const sku = generateSKU(cat?.name);
    setForm((prev) => ({ ...prev, sku }));
    toast.success(ar ? "تم توليد رمز صنف SKU فريد" : "Generated unique SKU");
  };

  const selectedCategory = meta.categories.find((c) => c.id === form.category_id);
  const selectedUnit = meta.units.find((u) => u.id === form.unit_id);
  const selectedBrand = meta.brands.find((b) => b.id === form.brand_id);
  const selectedOrigin = meta.origins.find((o) => o.id === form.origin_id);
  const selectedQuality = meta.qualities.find((q) => q.id === form.quality_grade_id);

  // اختصارات لوحة المفاتيح
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [form, policy, saving]);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (saving) return;

    if (!form.name_ar.trim()) {
      toast.error(
        ar
          ? "اسم المنتج بالعربية مطلوب لظهوره في بطاقات وقوائم النظام."
          : "Arabic product name is required.",
      );
      setActiveTab("identity");
      return;
    }

    const policyCheck = validateItemPolicy(policy);
    if (!policyCheck.valid) {
      toast.error(ar ? policyCheck.errors[0] : "The selected item policy is not valid.");
      setActiveTab("policy");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim() || form.name_ar.trim(),
        name_ar: form.name_ar.trim() || null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        category_id: form.category_id || null,
        brand_id: config.enableBrands ? form.brand_id || null : null,
        unit_id: config.enableUnits ? form.unit_id || null : null,
        cost_price: Number(form.cost_price) || 0,
        sale_price: Number(form.sale_price) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        min_stock: Number(form.min_stock) || 1,
        shelf_location: form.shelf_location.trim() || null,
        origin_id: config.enableOrigins ? form.origin_id || null : null,
        quality_grade_id: config.enableQualityGrades ? form.quality_grade_id || null : null,
        is_active: form.is_active,
        item_nature: policy.item_nature,
        inventory_policy: policy.inventory_policy,
        tracking: policy.tracking,
        costing_method: policy.costing_method,
        is_sellable: policy.is_sellable,
        is_purchasable: policy.is_purchasable,
      };

      const request: any = initial
        ? (supabase.from("products") as any)
            .update(payload)
            .eq("id", initial.id)
            .select("id")
            .single()
        : (supabase.from("products") as any).insert(payload).select("id").single();

      const { error: writeError } = await request;

      if (writeError) {
        const databaseError = writeError as { code?: string; message?: string };
        if (
          databaseError.code === "23505" ||
          /duplicate key|products_barcode_key/i.test(databaseError.message ?? "")
        ) {
          toast.error(
            ar
              ? "هذا الباركود مستخدم لمنتج آخر بالفعل في النظام."
              : "This barcode is already assigned to another product.",
          );
          setActiveTab("identity");
          return;
        }
        toast.error(databaseError.message ?? "تعذر حفظ المنتج.");
        return;
      }

      if (userId) saveUserItemPolicyPreferences(userId, policy);
      toast.success(
        ar
          ? initial
            ? "تم تحديث بيانات الصنف بنجاح"
            : "تم إنشاء الصنف الجديد بنجاح"
          : initial
            ? "Product updated successfully"
            : "Product created successfully",
      );
      onSaved();
    } catch (err) {
      console.error("[ProductFormModal] save error:", err);
      toast.error(
        ar
          ? "تعذّر حفظ التغييرات. تحقق من الاتصال بالشبكة."
          : "Could not save product. Please check your network.",
      );
    } finally {
      setSaving(false);
    }
  }

  const tabsConfig = [
    { id: "identity", label: ar ? "الهوية والترميز" : "Identity & Barcodes", icon: BarcodeIcon, desc: ar ? "الأسماء والأكواد والرف" : "Names, SKU, Barcode" },
    { id: "pricing", label: ar ? "التسعير والأرباح" : "Pricing & Profits", icon: DollarSign, desc: ar ? "التكلفة وهامش الربح والضريبة" : "Cost, Sale & Margin" },
    { id: "inventory", label: ar ? "المخزون والوحدات" : "Stock & Units", icon: Boxes, desc: ar ? "الوحدات والحد الأدنى" : "UOM & Reorder Point" },
    { id: "classification", label: ar ? "التصنيف والمواصفات" : "Classification", icon: Layers, desc: ar ? "الفئات والعلامة ورتبة الجودة" : "Category, Brand, Quality" },
    { id: "policy", label: ar ? "سياسات الصنف" : "Item Policy", icon: ShieldCheck, desc: ar ? "طبيعة السلعة والتتبع والتسعير" : "Nature, Tracking & Costing" },
  ] as const;

  if (!open) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md transition-all duration-300 animate-in fade-in" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 flex h-[94vh] max-h-[900px] w-[95vw] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-border/80 bg-background/95 p-0 shadow-2xl backdrop-blur-2xl duration-300 focus:outline-none animate-in fade-in zoom-in-95"
          dir={ar ? "rtl" : "ltr"}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border/70 bg-surface/50 px-6 py-4.5">
            <div className="flex items-center gap-3.5">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs ring-1 ring-primary/20">
                <Package className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <DialogPrimitive.Title className="text-lg font-black tracking-tight text-foreground sm:text-xl">
                    {initial
                      ? ar
                        ? "استوديو تعديل المنتج"
                        : "Edit Product Studio"
                      : ar
                        ? "استوديو إضافة منتج جديد"
                        : "New Product Creation Studio"}
                  </DialogPrimitive.Title>
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    <Sparkles className="size-3" />
                    {policy.item_nature === "GOOD" ? (ar ? "سلعة مخزنية" : "Inventory Good") : (ar ? "خدمة" : "Service")}
                  </span>
                </div>
                <DialogPrimitive.Description className="text-xs text-muted-foreground mt-0.5">
                  {ar
                    ? "واجهة حديثة متكاملة لتعريف الأصناف بدقة وحساب هوامش الربحية وتطبيق سياسات الجودة"
                    : "Complete modern studio to define items, simulate profitability, and govern item policies"}
                </DialogPrimitive.Description>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Active Toggle */}
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2 transition">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="size-4 rounded border-border accent-primary focus:ring-0"
                />
                <span className={form.is_active ? "text-primary font-bold" : "text-muted-foreground"}>
                  {form.is_active ? (ar ? "الصنف نشط ومتاح" : "Active Item") : (ar ? "الصنف معطل مؤقتاً" : "Inactive")}
                </span>
              </label>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="flex size-9 items-center justify-center rounded-xl border border-border/70 bg-surface text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
              >
                <X className="size-4.5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/60 bg-surface/30 px-6 py-2.5 custom-scrollbar">
            {tabsConfig.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`group flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-[1.02]"
                      : "text-muted-foreground hover:bg-surface-2 hover:text-foreground border border-transparent hover:border-border/60"
                  }`}
                >
                  <Icon className={`size-4 ${isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Studio Body: Dual-Pane Layout */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left/Main Column: Form Station (62%) */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto">
                {/* 1. IDENTITY & BARCODES */}
                {activeTab === "identity" && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="rounded-2xl border border-border/70 bg-surface/40 p-4.5 space-y-4 shadow-xs">
                      <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                        <Tag className="size-4.5 text-primary" />
                        <h3 className="text-sm font-bold text-foreground">
                          {ar ? "مسميات الصنف في المنظومة" : "Product Names"}
                        </h3>
                      </div>

                      {/* Arabic Name (Essential) */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-foreground flex items-center gap-1">
                            <span>{ar ? "اسم المنتج بالعربية" : "Arabic Product Name"}</span>
                            <span className="text-destructive font-black text-sm">*</span>
                          </label>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {ar ? "يظهر في الفواتير والبطاقات" : "Used on invoices & POS"}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={form.name_ar}
                          onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
                          placeholder={ar ? "مثال: دقيق بر فخر اليمن فاخر 50 كجم" : "e.g. Premium Wheat Flour 50kg"}
                          className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3.5 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                          autoFocus
                          required
                        />
                      </div>

                      {/* English / Alternative Name */}
                      {showForm("nameEn") && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-foreground/80">
                              {ar ? "الاسم بالإنجليزية (أو الرديف)" : "English / Secondary Name"}
                            </label>
                            <span className="text-[11px] text-muted-foreground">{ar ? "اختياري" : "Optional"}</span>
                          </div>
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Premium Whole Wheat Flour 50kg"
                            dir="ltr"
                            className="w-full h-10 rounded-xl border border-border/80 bg-surface px-3.5 text-sm font-medium text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                          />
                        </div>
                      )}
                    </div>

                    {/* Barcode & SKU Station */}
                    <div className="rounded-2xl border border-border/70 bg-surface/40 p-4.5 space-y-4 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <div className="flex items-center gap-2">
                          <BarcodeIcon className="size-4.5 text-primary" />
                          <h3 className="text-sm font-bold text-foreground">
                            {ar ? "الترميز، الباركود والـ SKU" : "Barcode & SKU Codes"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {ar ? "يدعم قارئ الباركود اللاسلكي والكاميرا" : "Supports Wedge & Camera"}
                        </span>
                      </div>

                      {/* Barcode Input with Instant Tools */}
                      {showForm("barcode") && (
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center justify-between">
                            <span>{ar ? "الباركود (رقم الترميز الدولي)" : "Barcode / EAN-13"}</span>
                            {form.barcode && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(form.barcode, "barcode")}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                {copiedKey === "barcode" ? <Check className="size-3" /> : <Copy className="size-3" />}
                                <span>{copiedKey === "barcode" ? (ar ? "تم النسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</span>
                              </button>
                            )}
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={form.barcode}
                                onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))}
                                placeholder={ar ? "امسح بالقارئ أو اضغط توليد..." : "Scan or generate..."}
                                dir="ltr"
                                className="w-full h-10 rounded-xl border border-border/80 bg-surface px-3.5 font-mono text-sm font-semibold tracking-wider text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleGenerateBarcode}
                              title={ar ? "توليد باركود EAN-13 عشوائي معتمد" : "Generate EAN-13"}
                              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/20 transition active:scale-95 shrink-0"
                            >
                              <Sparkles className="size-3.5" />
                              <span>{ar ? "توليد EAN-13" : "Generate"}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setScannerOpen(true)}
                              title={ar ? "فتح كاميرا الهاتف/الجهاز للمسح" : "Scan via camera"}
                              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-2 transition active:scale-95 shrink-0"
                            >
                              <Camera className="size-4 text-muted-foreground" />
                              <span className="hidden sm:inline">{ar ? "كاميرا" : "Camera"}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* SKU Input */}
                      {showForm("sku") && (
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center justify-between">
                            <span>{ar ? "رمز تعريف الصنف (SKU)" : "SKU Code"}</span>
                            {form.sku && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(form.sku, "sku")}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                {copiedKey === "sku" ? <Check className="size-3" /> : <Copy className="size-3" />}
                                <span>{copiedKey === "sku" ? (ar ? "تم النسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</span>
                              </button>
                            )}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={form.sku}
                              onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                              placeholder="e.g. FLR-050-YEM"
                              dir="ltr"
                              className="flex-1 h-10 rounded-xl border border-border/80 bg-surface px-3.5 font-mono text-sm font-semibold tracking-wider text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                            />
                            <button
                              type="button"
                              onClick={handleGenerateSKU}
                              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-2 transition active:scale-95 shrink-0"
                            >
                              <Sparkles className="size-3.5 text-muted-foreground" />
                              <span>{ar ? "توليد SKU" : "Auto SKU"}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Shelf / Warehouse Location */}
                      {showForm("shelfLocation") && (
                        <div>
                          <label className="text-xs font-medium text-foreground/80 mb-1.5 block">
                            {ar ? "موقع التخزين والرف بالمستودع" : "Warehouse Shelf Location"}
                          </label>
                          <div className="relative">
                            <MapPin className="size-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none rtl:right-3 rtl:left-auto ltr:left-3 ltr:right-auto" />
                            <input
                              type="text"
                              value={form.shelf_location}
                              onChange={(e) => setForm((prev) => ({ ...prev, shelf_location: e.target.value }))}
                              placeholder={ar ? "مثال: ممر 4 - الرف B2" : "e.g. Aisle 4, Shelf B2"}
                              className="w-full h-10 rounded-xl border border-border/80 bg-surface px-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. PRICING & PROFITS */}
                {activeTab === "pricing" && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="rounded-2xl border border-border/70 bg-surface/40 p-4.5 space-y-4 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <div className="flex items-center gap-2">
                          <DollarSign className="size-4.5 text-primary" />
                          <h3 className="text-sm font-bold text-foreground">
                            {ar ? "معادلة التسعير وحساب الأرباح" : "Pricing & Margin Formula"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {ar ? "حساب فوري للأرباح وهوامش التكلفة" : "Live profit calculations"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Cost Price */}
                        {canViewCost && (
                          <div>
                            <label className="text-xs font-bold text-foreground mb-1.5 flex items-center justify-between">
                              <span>{ar ? "سعر التكلفة (شراء)" : "Cost Price (Purchasing)"}</span>
                              <span className="text-[11px] font-normal text-muted-foreground">{ar ? "لكل وحدة" : "per unit"}</span>
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={form.cost_price}
                                onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                                placeholder="0.00"
                                dir="ltr"
                                className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3.5 font-mono text-base font-bold text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                              />
                            </div>
                          </div>
                        )}

                        {/* Sale Price */}
                        <div>
                          <label className="text-xs font-bold text-foreground mb-1.5 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <span>{ar ? "سعر البيع الافتراضي" : "Selling Price"}</span>
                              <span className="text-destructive font-black text-sm">*</span>
                            </span>
                            <span className="text-[11px] font-bold text-primary">
                              {marginPercent > 0 && `(هامش ${marginPercent}%)`}
                            </span>
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.sale_price}
                              onChange={(e) => setForm((prev) => ({ ...prev, sale_price: e.target.value }))}
                              placeholder="0.00"
                              dir="ltr"
                              className="w-full h-11 rounded-xl border border-primary/50 bg-primary/5 px-3.5 font-mono text-base font-bold text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* Quick Margin Presets Buttons */}
                      {canViewCost && (
                        <div className="pt-2">
                          <span className="text-[11px] font-bold text-muted-foreground block mb-2">
                            {ar ? "تطبيق هوامش ربح سريعة بناءً على التكلفة:" : "Quick Profit Margin Presets:"}
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {[10, 15, 20, 25, 35, 50, 100].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                onClick={() => applyMarkup(pct)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-surface px-2.5 py-1 text-xs font-bold text-foreground hover:border-primary hover:bg-primary/10 hover:text-primary transition active:scale-95"
                              >
                                <Percent className="size-3 text-muted-foreground" />
                                <span>+{pct}%</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Tax Rate */}
                      {showForm("taxRate") && (
                        <div className="border-t border-border/40 pt-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-medium text-foreground">
                              {ar ? "معدل ضريبة القيمة المضافة (%)" : "Tax Rate (%)"}
                            </label>
                            <div className="flex items-center gap-1">
                              {[0, 5, 15].map((rate) => (
                                <button
                                  key={rate}
                                  type="button"
                                  onClick={() => setForm((prev) => ({ ...prev, tax_rate: String(rate) }))}
                                  className={`rounded-md px-2 py-0.5 text-[11px] font-semibold transition ${
                                    form.tax_rate === String(rate)
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-surface-2 text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {rate}%
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            value={form.tax_rate}
                            onChange={(e) => setForm((prev) => ({ ...prev, tax_rate: e.target.value }))}
                            placeholder="0"
                            dir="ltr"
                            className="w-full h-10 rounded-xl border border-border/80 bg-surface px-3.5 font-mono text-sm text-foreground focus:border-primary outline-none transition"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. INVENTORY & UNITS */}
                {activeTab === "inventory" && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="rounded-2xl border border-border/70 bg-surface/40 p-4.5 space-y-4 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <div className="flex items-center gap-2">
                          <Boxes className="size-4.5 text-primary" />
                          <h3 className="text-sm font-bold text-foreground">
                            {ar ? "إدارة وحدات القياس وحد إعادة الطلب" : "Units of Measure & Stock Limits"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {ar ? "التحكم في مستويات المخزون" : "Stock control parameters"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Unit Select */}
                        {config.enableUnits && showForm("unit") && (
                          <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                              {ar ? "وحدة القياس الأساسية (UOM)" : "Base Unit of Measure"}
                            </label>
                            <select
                              value={form.unit_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, unit_id: e.target.value }))}
                              className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3 text-sm font-medium text-foreground focus:border-primary outline-none transition"
                            >
                              <option value="">{ar ? "— حدد الوحدة (قطعة، كجم، كرتون...) —" : "— Select Unit —"}</option>
                              {meta.units.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {ar ? u.name_ar || u.name : u.name} ({u.short_name})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Minimum Stock Alert Level */}
                        {showForm("minStock") && (
                          <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center justify-between">
                              <span>{ar ? "حد الأمان للتنبيه (الحد الأدنى)" : "Reorder Threshold (Min Stock)"}</span>
                              <span className="text-[11px] text-muted-foreground">{ar ? "تنبيه بالنواقص" : "Alert level"}</span>
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={form.min_stock}
                              onChange={(e) => setForm((prev) => ({ ...prev, min_stock: e.target.value }))}
                              placeholder="1"
                              dir="ltr"
                              className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3.5 font-mono text-sm font-bold text-foreground focus:border-primary outline-none transition"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. CLASSIFICATION & ATTRIBUTES */}
                {activeTab === "classification" && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="rounded-2xl border border-border/70 bg-surface/40 p-4.5 space-y-4 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <div className="flex items-center gap-2">
                          <Layers className="size-4.5 text-primary" />
                          <h3 className="text-sm font-bold text-foreground">
                            {ar ? "التصنيف والماركات والمواصفات" : "Taxonomy & Attributes"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {ar ? "يُسهّل فلترة وتقارير المبيعات" : "Filtering & sales analytics"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Category */}
                        {showForm("category") && (
                          <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                              {ar ? "التصنيف / الفئة الرئيسية" : "Category"}
                            </label>
                            <select
                              value={form.category_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
                              className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3 text-sm font-medium text-foreground focus:border-primary outline-none transition"
                            >
                              <option value="">{ar ? "— اختر فئة المنتج —" : "— Select Category —"}</option>
                              {meta.categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {ar ? c.name_ar || c.name : c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Brand */}
                        {config.enableBrands && showForm("brand") && (
                          <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                              {ar ? "العلامة التجارية / الماركة" : "Brand / Manufacturer"}
                            </label>
                            <select
                              value={form.brand_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, brand_id: e.target.value }))}
                              className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3 text-sm font-medium text-foreground focus:border-primary outline-none transition"
                            >
                              <option value="">{ar ? "— بدون علامة تجارية محددة —" : "— No Brand —"}</option>
                              {meta.brands.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {ar ? b.name_ar || b.name : b.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Origin */}
                        {config.enableOrigins && showForm("origin") && (
                          <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                              {ar ? "بلد المنشأ / المصدر" : "Country of Origin"}
                            </label>
                            <select
                              value={form.origin_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, origin_id: e.target.value }))}
                              className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3 text-sm font-medium text-foreground focus:border-primary outline-none transition"
                            >
                              <option value="">{ar ? "— اختر بلد المنشأ —" : "— Select Origin —"}</option>
                              {meta.origins.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {ar ? o.name_ar || o.name : o.name} ({o.code})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Quality Grade */}
                        {config.enableQualityGrades && showForm("qualityGrade") && (
                          <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                              {ar ? "رتبة ودرجة الجودة" : "Quality Grade"}
                            </label>
                            <select
                              value={form.quality_grade_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, quality_grade_id: e.target.value }))}
                              className="w-full h-11 rounded-xl border border-border/80 bg-surface px-3 text-sm font-medium text-foreground focus:border-primary outline-none transition"
                            >
                              <option value="">{ar ? "— رتبة الجودة الافتراضية —" : "— Select Quality Grade —"}</option>
                              {meta.qualities.map((q) => (
                                <option key={q.id} value={q.id}>
                                  {ar ? q.name_ar || q.name : q.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. ITEM POLICY */}
                {activeTab === "policy" && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="rounded-2xl border border-border/70 bg-surface/40 p-4.5 space-y-5 shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/50 pb-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-4.5 text-primary" />
                          <h3 className="text-sm font-bold text-foreground">
                            {ar ? "طبيعة وسياسات الصنف في المنظومة" : "Item Nature & Governance Policy"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {ar ? "تحدد مسارات المحاسبة والمخزون" : "Ledger & inventory flow"}
                        </span>
                      </div>

                      {/* Nature Card Selector */}
                      <div>
                        <label className="text-xs font-bold text-foreground mb-2 block">
                          {ar ? "طبيعة الصنف الأساسية:" : "Primary Item Nature:"}
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setPolicy((prev) => ({
                                ...prev,
                                item_nature: "GOOD",
                                inventory_policy: "TRACKED",
                              }))
                            }
                            className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-start transition ${
                              policy.item_nature === "GOOD"
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border/70 bg-surface hover:border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                                <Package className="size-4 text-primary" />
                                {ar ? "سلعة مادية ملموسة (Good)" : "Physical Product (Good)"}
                              </span>
                              {policy.item_nature === "GOOD" && <CheckCircle2 className="size-4 text-primary" />}
                            </div>
                            <span className="text-xs text-muted-foreground leading-relaxed">
                              {ar ? "بضاعة لها وجود مادي، تُشترى وتُخزن في المستودع وتُباع" : "Physical inventory that is stocked and counted"}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPolicy((prev) => ({
                                ...prev,
                                item_nature: "SERVICE",
                                inventory_policy: "UNTRACKED",
                                tracking: "NONE",
                              }))
                            }
                            className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-start transition ${
                              policy.item_nature === "SERVICE"
                                ? "border-primary bg-primary/10 shadow-sm"
                                : "border-border/70 bg-surface hover:border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                                <Wrench className="size-4 text-primary" />
                                {ar ? "خدمة أو عمل (Service)" : "Service / Labor"}
                              </span>
                              {policy.item_nature === "SERVICE" && <CheckCircle2 className="size-4 text-primary" />}
                            </div>
                            <span className="text-xs text-muted-foreground leading-relaxed">
                              {ar ? "أتعاب أو خدمات مثل الطحن، النقل، أو الصيانة بلا مخزون مادي" : "Intangible service without inventory counting"}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Stock Tracking (Goods only) */}
                      {policy.item_nature === "GOOD" && (
                        <div className="border-t border-border/50 pt-3">
                          <label className="text-xs font-bold text-foreground mb-2 block">
                            {ar ? "سياسة تتبع المخزون في المستودعات:" : "Inventory Stock Tracking:"}
                          </label>
                          <div className="grid grid-cols-2 gap-3">
                            <label className={`flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                              policy.inventory_policy === "TRACKED" ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border/70 bg-surface text-muted-foreground"
                            }`}>
                              <input
                                type="radio"
                                name="inventory_policy"
                                checked={policy.inventory_policy === "TRACKED"}
                                onChange={() => setPolicy((p) => ({ ...p, inventory_policy: "TRACKED" }))}
                                className="size-4 accent-primary"
                              />
                              <div>
                                <div className="text-xs font-bold">{ar ? "تتبع المخزون بدقة (مُوصى به)" : "Track Stock (Recommended)"}</div>
                                <div className="text-[11px] text-muted-foreground">{ar ? "يُسجل الوارد والمنصرف ورصيد المستودع" : "Full stock ledger balance"}</div>
                              </div>
                            </label>

                            <label className={`flex items-center gap-2.5 rounded-xl border p-3 cursor-pointer transition ${
                              policy.inventory_policy === "UNTRACKED" ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border/70 bg-surface text-muted-foreground"
                            }`}>
                              <input
                                type="radio"
                                name="inventory_policy"
                                checked={policy.inventory_policy === "UNTRACKED"}
                                onChange={() => setPolicy((p) => ({ ...p, inventory_policy: "UNTRACKED" }))}
                                className="size-4 accent-primary"
                              />
                              <div>
                                <div className="text-xs font-bold">{ar ? "سلعة بلا تتبع كميات" : "Untracked Good"}</div>
                                <div className="text-[11px] text-muted-foreground">{ar ? "تُباع وتُشترى دون تقييد الرصيد" : "No stock balances checked"}</div>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Availability (Sellable / Purchasable) */}
                      <div className="border-t border-border/50 pt-3">
                        <label className="text-xs font-bold text-foreground mb-2 block">
                          {ar ? "صلاحيات ومجالات استخدام الصنف:" : "Item Usage & Permissions:"}
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface p-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={policy.is_sellable}
                              onChange={(e) => setPolicy((p) => ({ ...p, is_sellable: e.target.checked }))}
                              className="size-4 accent-primary rounded"
                            />
                            <div>
                              <div className="text-xs font-bold text-foreground">{ar ? "متاح للبيع (فواتير المبيعات ونقاط البيع)" : "Sellable (POS & Invoices)"}</div>
                              <div className="text-[11px] text-muted-foreground">{ar ? "يظهر في شاشات الكاشير والمبيعات" : "Appears on POS screens"}</div>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface p-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={policy.is_purchasable}
                              onChange={(e) => setPolicy((p) => ({ ...p, is_purchasable: e.target.checked }))}
                              className="size-4 accent-primary rounded"
                            />
                            <div>
                              <div className="text-xs font-bold text-foreground">{ar ? "متاح للشراء (فواتير المشتريات والتوريد)" : "Purchasable (Purchases)"}</div>
                              <div className="text-[11px] text-muted-foreground">{ar ? "يظهر عند إدخال فواتير الموردين" : "Appears on purchase bills"}</div>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* Right Column: Live Product Studio Preview & Financial Simulator (38%) */}
            <div className="hidden lg:flex w-96 shrink-0 flex-col border-s border-border/70 bg-surface/30 p-6 overflow-y-auto space-y-5 custom-scrollbar">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <Sparkles className="size-4 text-primary" />
                <span>{ar ? "المعاينة الحيّة والمحاكي المالي" : "Live Preview & Insights"}</span>
              </div>

              {/* Realistic Retail Card Simulation */}
              <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                    {selectedCategory ? (ar ? selectedCategory.name_ar || selectedCategory.name : selectedCategory.name) : (ar ? "عام / بدون فئة" : "General")}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    form.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                  }`}>
                    {form.is_active ? (ar ? "نشط" : "Active") : (ar ? "معطل" : "Inactive")}
                  </span>
                </div>

                <div>
                  <h4 className="text-base font-black text-foreground line-clamp-2">
                    {form.name_ar || (ar ? "اسم المنتج سيظهر هنا..." : "Product name will appear here...")}
                  </h4>
                  {form.name && (
                    <p className="text-xs text-muted-foreground font-medium mt-0.5 line-clamp-1" dir="ltr">
                      {form.name}
                    </p>
                  )}
                </div>

                {/* Price Display */}
                <div className="rounded-xl bg-background/80 p-3.5 border border-border/60 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{ar ? "سعر البيع:" : "Price:"}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black font-mono text-primary">
                      {saleNum > 0 ? saleNum.toLocaleString() : "0.00"}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">{ar ? "ر.ي" : "YER"}</span>
                  </div>
                </div>

                {/* Barcode & SKU preview */}
                <div className="pt-2 border-t border-border/50 space-y-1.5 text-[11px] font-mono">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{ar ? "الباركود:" : "Barcode:"}</span>
                    <span className="font-bold text-foreground">{form.barcode || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{ar ? "رمز SKU:" : "SKU:"}</span>
                    <span className="font-bold text-foreground">{form.sku || "—"}</span>
                  </div>
                  {selectedUnit && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{ar ? "الوحدة:" : "Unit:"}</span>
                      <span className="font-bold text-foreground">{ar ? selectedUnit.name_ar || selectedUnit.name : selectedUnit.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Profit & Margin Simulator */}
              {canViewCost && (
                <div className="rounded-2xl border border-border/80 bg-surface/90 p-5 shadow-sm space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <TrendingUp className="size-4 text-primary" />
                      <span>{ar ? "مؤشر الربحية لكل قطعة" : "Profitability Simulator"}</span>
                    </div>
                    <span className={`text-xs font-black ${
                      marginPercent >= 20 ? "text-emerald-500" : marginPercent >= 10 ? "text-amber-500" : "text-destructive"
                    }`}>
                      {marginPercent}% {ar ? "هامش" : "Margin"}
                    </span>
                  </div>

                  {/* Visual Gauge Bar */}
                  <div className="w-full h-2.5 rounded-full bg-surface-2 overflow-hidden flex">
                    <div
                      className={`h-full transition-all duration-300 ${
                        marginPercent >= 25 ? "bg-emerald-500" : marginPercent >= 10 ? "bg-amber-500" : "bg-destructive"
                      }`}
                      style={{ width: `${Math.min(Math.max(marginPercent, 0), 100)}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="rounded-lg bg-background/60 p-2 border border-border/50">
                      <span className="text-[10px] text-muted-foreground block">{ar ? "صافي الربح المتوقع:" : "Net Profit:"}</span>
                      <span className={`font-mono font-bold text-sm ${profitNum >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {profitNum.toLocaleString()} {ar ? "ر.ي" : "YER"}
                      </span>
                    </div>
                    <div className="rounded-lg bg-background/60 p-2 border border-border/50">
                      <span className="text-[10px] text-muted-foreground block">{ar ? "نسبة الزيادة (Markup):" : "Cost Markup:"}</span>
                      <span className="font-mono font-bold text-sm text-foreground">
                        +{markupPercent}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Readiness Checklist */}
              <div className="rounded-2xl border border-border/80 bg-surface/90 p-4.5 shadow-sm space-y-2.5">
                <span className="text-xs font-bold text-foreground block">
                  {ar ? "جاهزية الحفظ والاعتماد:" : "Readiness Checklist:"}
                </span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    {form.name_ar.trim() ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="size-4 text-amber-500" />
                    )}
                    <span className={form.name_ar.trim() ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {ar ? "الاسم العربي مكتمل" : "Arabic name specified"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {saleNum > 0 ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="size-4 text-muted-foreground" />
                    )}
                    <span className={saleNum > 0 ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {ar ? "سعر البيع محدد" : "Selling price configured"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {form.barcode.trim() ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <span className="size-4 rounded-full border border-border flex items-center justify-center text-[10px] text-muted-foreground">•</span>
                    )}
                    <span className={form.barcode.trim() ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {ar ? "الباركود الدولي مدخل" : "Barcode set"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="flex shrink-0 items-center justify-between border-t border-border/70 bg-surface/60 px-6 py-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="hidden sm:inline-flex items-center gap-1">
                <CornerDownLeft className="size-3.5 text-primary" />
                <span>{ar ? "اضغط Ctrl + Enter للحفظ السريع" : "Press Ctrl+Enter to save"}</span>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-xl border border-border/80 bg-surface px-4 text-xs font-semibold text-foreground hover:bg-surface-2 transition active:scale-95"
              >
                {ar ? "إلغاء الأمر" : "Cancel"}
              </button>

              <button
                type="button"
                onClick={() => handleSubmit()}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-bold text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/90 transition active:scale-95 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>{ar ? "جارٍ الحفظ..." : "Saving..."}</span>
                  </>
                ) : (
                  <>
                    <Check className="size-4" />
                    <span>{initial ? (ar ? "حفظ التعديلات" : "Update Product") : (ar ? "إنشاء الصنف الآن" : "Create Product")}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Barcode Camera Modal */}
          {scannerOpen && (
            <BarcodeScanner
              open={scannerOpen}
              onClose={() => setScannerOpen(false)}
              onDetected={(barcode) => {
                setForm((prev) => ({ ...prev, barcode }));
                setScannerOpen(false);
                toast.success(ar ? "تمت قراءة الباركود بالكاميرا" : "Barcode detected");
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
