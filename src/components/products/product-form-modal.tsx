/**
 * Market-Hub ERP — Master Product Engineering & Catalog Studio (ProductFormModal)
 * 
 * Redesigned from the ground up following UI/UX Pro Max Executive Standards:
 * - Ultra-luxurious obsidian glass aesthetic with metallic accents (Emerald, Champagne Amber, Sapphire)
 * - 5 Segmented Engineering Stations: Identity, Financials, Inventory, Taxonomy, Governance
 * - Live dynamic SVG Barcode visualizer & GS1 EAN-13 generator with modulo-10 checksum
 * - Real-time barcode uniqueness validator (checks against live database)
 * - Interactive Profit Simulator & Margin Presets (+15%, +25%, +35%, +50%, +100%) + Custom Slider
 * - Dual-currency & tax-inclusive live calculation
 * - "Digital Shelf" 3D-feel product preview card
 * - Data readiness & audit completeness score
 * - High-speed keyboard ergonomics (Ctrl+Enter to save, Esc to exit)
 * - "Save & Add Another" workflow for warehouse data entry
 * - Full Arabic RTL first-class luxury typography and micro-interactions
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
  AlertTriangle,
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
  Sliders,
  Plus,
  ArrowUpRight,
  Zap,
  CheckCheck,
  Coins,
  Eye,
  EyeOff,
  Calculator,
  ScanLine,
  LayoutGrid,
  ShieldAlert,
  ArrowRight,
  Crown,
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
  wholesale_price?: number | null;
  min_sale_price?: number | null;
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
  description?: string | null;
  tags?: string[] | null;
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

/** توليد باركود EAN-13 مع حساب رقم التحقق الرسمي Modulo-10 */
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

/** توليد SKU ذكي ومنسق بناءً على الفئة والبادئات */
function generateSKU(categoryName?: string, productName?: string): string {
  const catPart = (categoryName || "PRD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 3)
    .toUpperCase() || "PRD";
  const numPart = Math.floor(100 + Math.random() * 900);
  const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${catPart}-${numPart}-${randomPart}`;
}

/** مولد خطوط الباركود البصرية SVG الحية */
function LiveBarcodeStripes({ code }: { code: string }) {
  const bars = useMemo(() => {
    if (!code) return [];
    // خوارزمية بصرية تعتمد على أحرف الباركود لإنتاج خطوط واقعية
    const list: { width: number; space: number }[] = [];
    for (let i = 0; i < Math.max(code.length, 12); i++) {
      const charCode = code.charCodeAt(i % code.length) || 48;
      const w = (charCode % 3) + 1;
      const s = ((charCode >> 1) % 2) + 1;
      list.push({ width: w, space: s });
    }
    return list;
  }, [code]);

  if (!code) {
    return (
      <div className="flex h-10 w-full items-center justify-center rounded-lg border border-dashed border-slate-700/60 bg-slate-900/40 text-[11px] text-slate-500">
        أدخل الباركود لعرض المخطط البصري
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800 bg-white/95 p-2.5 shadow-inner">
      <svg className="h-10 w-full max-w-[280px]" viewBox="0 0 160 36" preserveAspectRatio="none">
        {/* البداية Guard bars */}
        <rect x="2" y="0" width="2" height="36" fill="#0f172a" />
        <rect x="6" y="0" width="2" height="36" fill="#0f172a" />
        {/* الخطوط التوليدية */}
        {bars.map((bar, idx) => {
          const xPos = 12 + idx * 10;
          if (xPos > 146) return null;
          return (
            <rect
              key={idx}
              x={xPos}
              y="0"
              width={bar.width * 1.5}
              height="30"
              fill="#0f172a"
            />
          );
        })}
        {/* النهاية Guard bars */}
        <rect x="152" y="0" width="2" height="36" fill="#0f172a" />
        <rect x="156" y="0" width="2" height="36" fill="#0f172a" />
      </svg>
      <span className="font-mono text-[11px] font-black tracking-[0.25em] text-slate-900 mt-1">
        {code}
      </span>
    </div>
  );
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
  const [hideCostValue, setHideCostValue] = useState(false);
  const [barcodeCheckStatus, setBarcodeCheckStatus] = useState<"idle" | "checking" | "unique" | "duplicate">("idle");
  const [duplicateProductName, setDuplicateProductName] = useState<string | null>(null);

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
    wholesale_price: initial?.wholesale_price != null ? String(initial.wholesale_price) : "",
    min_sale_price: initial?.min_sale_price != null ? String(initial.min_sale_price) : "",
    tax_rate: initial?.tax_rate != null ? String(initial.tax_rate) : "0",
    opening_stock: "0",
    min_stock: initial?.min_stock != null ? String(initial.min_stock) : "1",
    shelf_location: initial?.shelf_location ?? "",
    origin_id: initial?.origin_id ?? "",
    quality_grade_id: initial?.quality_grade_id ?? "",
    is_active: initial?.is_active ?? true,
    description: initial?.description ?? "",
  });

  const [saving, setSaving] = useState(false);
  const [saveAndAddAnother, setSaveAndAddAnother] = useState(false);

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
        wholesale_price: initial.wholesale_price != null ? String(initial.wholesale_price) : "",
        min_sale_price: initial.min_sale_price != null ? String(initial.min_sale_price) : "",
        tax_rate: initial.tax_rate != null ? String(initial.tax_rate) : "0",
        opening_stock: "0",
        min_stock: initial.min_stock != null ? String(initial.min_stock) : "1",
        shelf_location: initial.shelf_location ?? "",
        origin_id: initial.origin_id ?? "",
        quality_grade_id: initial.quality_grade_id ?? "",
        is_active: initial.is_active ?? true,
        description: initial.description ?? "",
      });
    } else {
      setPolicy(userId ? readUserItemPolicyPreferences(userId) : DEFAULT_USER_ITEM_POLICY_PREFERENCES);
    }
  }, [initial, userId]);

  // التحقق اللحظي من عدم تكرار الباركود
  useEffect(() => {
    const trimmed = form.barcode.trim();
    if (!trimmed || trimmed.length < 3) {
      setBarcodeCheckStatus("idle");
      setDuplicateProductName(null);
      return;
    }

    setBarcodeCheckStatus("checking");
    const timer = setTimeout(async () => {
      try {
        let query = (supabase.from("products") as any)
          .select("id, name, name_ar")
          .eq("barcode", trimmed)
          .limit(1);

        if (initial?.id) {
          query = query.neq("id", initial.id);
        }

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          setBarcodeCheckStatus("duplicate");
          setDuplicateProductName(data[0].name_ar || data[0].name || "منتج آخر");
        } else {
          setBarcodeCheckStatus("unique");
          setDuplicateProductName(null);
        }
      } catch {
        setBarcodeCheckStatus("idle");
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [form.barcode, initial?.id]);

  useKeyboardWedge({
    onScan: (barcode) => {
      setForm((current) => ({ ...current, barcode }));
      toast.success(ar ? `تم مسح الباركود بنجاح: ${barcode}` : `Barcode scanned: ${barcode}`);
    },
    disabled: !isModuleEnabled("barcode") || scannerOpen,
  });

  // الحسابات المالية اللحظية
  const costNum = Number(form.cost_price) || 0;
  const saleNum = Number(form.sale_price) || 0;
  const wholesaleNum = Number(form.wholesale_price) || 0;
  const taxRateNum = Number(form.tax_rate) || 0;

  const profitNum = saleNum - costNum;
  const marginPercent = saleNum > 0 ? Math.round((profitNum / saleNum) * 100) : 0;
  const markupPercent = costNum > 0 ? Math.round((profitNum / costNum) * 100) : 0;

  // السعر شامل الضريبة
  const salePriceWithTax = saleNum > 0 ? Math.round((saleNum * (1 + taxRateNum / 100)) * 100) / 100 : 0;

  // احتساب نسبة كمال وجاهزية بيانات المنتج (Audit Readiness Score)
  const readiness = useMemo(() => {
    let score = 0;
    const checks = [
      { key: "name_ar", label: ar ? "اسم المنتج العربي" : "Arabic Name", pass: Boolean(form.name_ar.trim()), weight: 25 },
      { key: "sale_price", label: ar ? "سعر البيع" : "Sale Price", pass: saleNum > 0, weight: 25 },
      { key: "barcode", label: ar ? "الباركود الدولي" : "Barcode", pass: Boolean(form.barcode.trim()), weight: 20 },
      { key: "category", label: ar ? "التصنيف الرئيسي" : "Category", pass: Boolean(form.category_id), weight: 15 },
      { key: "cost_price", label: ar ? "سعر التكلفة" : "Cost Price", pass: costNum > 0, weight: 15 },
    ];
    checks.forEach((c) => {
      if (c.pass) score += c.weight;
    });
    return { score, checks };
  }, [form.name_ar, form.barcode, form.category_id, saleNum, costNum, ar]);

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(ar ? "تم النسخ بنجاح للحافظة" : "Copied to clipboard");
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const applyMarkup = (percent: number) => {
    const baseCost = costNum > 0 ? costNum : 100;
    const newPrice = Math.round(baseCost * (1 + percent / 100) * 100) / 100;
    setForm((prev) => ({ ...prev, sale_price: String(newPrice) }));
    toast.info(ar ? `تم تطبيق هامش ربح +${percent}%` : `Applied +${percent}% margin`);
  };

  const handleGenerateBarcode = () => {
    const code = generateEAN13();
    setForm((prev) => ({ ...prev, barcode: code }));
    toast.success(ar ? "تم توليد باركود EAN-13 معتمد بمدلول رياضي" : "Generated EAN-13 Barcode");
  };

  const handleGenerateSKU = () => {
    const cat = meta.categories.find((c) => c.id === form.category_id);
    const sku = generateSKU(cat?.name, form.name || form.name_ar);
    setForm((prev) => ({ ...prev, sku }));
    toast.success(ar ? "تم توليد رمز SKU مميز" : "Generated SKU");
  };

  const selectedCategory = meta.categories.find((c) => c.id === form.category_id);
  const selectedUnit = meta.units.find((u) => u.id === form.unit_id);
  const selectedBrand = meta.brands.find((b) => b.id === form.brand_id);
  const selectedOrigin = meta.origins.find((o) => o.id === form.origin_id);
  const selectedQuality = meta.qualities.find((q) => q.id === form.quality_grade_id);

  // اختصارات لوحة المفاتيح الفاخرة
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

  async function handleSubmit(e?: React.FormEvent, andAddAnother = false) {
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

    if (barcodeCheckStatus === "duplicate") {
      toast.error(
        ar
          ? `الباركود مسجل بالفعل للمنتج: (${duplicateProductName}). يرجى استخدام باركود فريد.`
          : `Barcode already in use by ${duplicateProductName}.`,
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
      const payload: Record<string, any> = {
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

      const { data: savedData, error: writeError } = await request;

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
            : "تم إنشاء واعتماد الصنف الجديد في الكتالوج بنجاح"
          : initial
            ? "Product updated successfully"
            : "Product created successfully",
      );

      if (andAddAnother && !initial) {
        // تفريغ الفورم لإضافة صنف تالٍ فورا
        setForm({
          name: "",
          name_ar: "",
          sku: "",
          barcode: "",
          category_id: form.category_id, // الاحتفاظ بالتصنيف لتسريع الإدخال
          brand_id: form.brand_id,
          unit_id: form.unit_id,
          cost_price: "",
          sale_price: "",
          wholesale_price: "",
          min_sale_price: "",
          tax_rate: form.tax_rate,
          opening_stock: "0",
          min_stock: "1",
          shelf_location: form.shelf_location,
          origin_id: form.origin_id,
          quality_grade_id: form.quality_grade_id,
          is_active: true,
          description: "",
        });
        setActiveTab("identity");
        onSaved(); // تحديث الجدول في الخلفية
      } else {
        onSaved();
      }
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
    {
      id: "identity",
      label: ar ? "الهوية والترميز" : "Identity & Codes",
      icon: BarcodeIcon,
      subtitle: ar ? "الأسماء، الباركود وSKU" : "Names, Barcodes & SKU",
      isComplete: Boolean(form.name_ar.trim() && form.barcode.trim()),
    },
    {
      id: "pricing",
      label: ar ? "الهندسة المالية" : "Financials & Pricing",
      icon: DollarSign,
      subtitle: ar ? "التكلفة، البيع وهوامش الربح" : "Margins, Cost & VAT",
      isComplete: saleNum > 0,
    },
    {
      id: "inventory",
      label: ar ? "المخزون وسلاسل الإمداد" : "Inventory & Stock",
      icon: Boxes,
      subtitle: ar ? "وحدات القياس وحد إعادة الطلب" : "Units & Reorder Point",
      isComplete: Boolean(form.unit_id || form.min_stock),
    },
    {
      id: "classification",
      label: ar ? "التصنيف والمواصفات" : "Taxonomy & Specs",
      icon: Layers,
      subtitle: ar ? "الفئات، الماركات والمنشأ" : "Category, Brand & Origin",
      isComplete: Boolean(form.category_id),
    },
    {
      id: "policy",
      label: ar ? "حوكمة وسياسات الصنف" : "Governance Policy",
      icon: ShieldCheck,
      subtitle: ar ? "طبيعة السلعة، التتبع والمحاسبة" : "Nature, Ledger & Track",
      isComplete: true,
    },
  ] as const;

  if (!open) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        {/* Backdrop مع تدريج ناعم وعمق بصري عالي */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xl transition-all duration-300 animate-in fade-in" />
        
        {/* حاوية الاستوديو الفاخرة - مساحة عمل واسعة وأنيقة */}
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 flex h-[94vh] max-h-[960px] w-[96vw] max-w-7xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-[28px] border border-slate-800/90 bg-gradient-to-b from-slate-900/95 via-slate-950/98 to-slate-950 text-slate-100 shadow-[0_35px_100px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl duration-300 focus:outline-none animate-in fade-in zoom-in-95 overflow-hidden"
          dir={ar ? "rtl" : "ltr"}
        >
          {/* شريط الإضاءة العلوي الأنيق (Executive Rim Light) */}
          <div className="h-1 w-full bg-gradient-to-r from-amber-500 via-emerald-400 via-teal-400 to-indigo-500 shadow-[0_0_15px_rgba(16,185,129,0.5)] shrink-0" />

          {/* ترويسة الاستوديو الفاخرة */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/40 px-6 py-4 backdrop-blur-md">
            <div className="flex items-center gap-4">
              {/* أيقونة الصندوق المضيئة */}
              <div className="relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-indigo-500/20 text-emerald-400 ring-1 ring-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                <Crown className="size-6 text-emerald-400" />
                <span className="absolute -bottom-1 -right-1 flex size-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
                </span>
              </div>

              <div>
                <div className="flex items-center gap-3">
                  <DialogPrimitive.Title className="text-xl font-black tracking-tight text-white sm:text-2xl font-arabic">
                    {initial
                      ? ar
                        ? "استوديو هندسة وتعديل الصنف"
                        : "Master Product Studio — Edit"
                      : ar
                        ? "استوديو هندسة وتسجيل المنتجات"
                        : "Vortex Catalog Studio — New Product"}
                  </DialogPrimitive.Title>

                  {/* شارة الجاهزية الرقمية */}
                  <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
                    <Sparkles className="size-3.5 text-emerald-400" />
                    <span>{readiness.score}% جاهزية التداول</span>
                  </div>

                  <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                    {policy.item_nature === "GOOD" ? (ar ? "سلعة مخزنية" : "Inventory Good") : (ar ? "خدمة مستودعية" : "Service")}
                  </span>
                </div>

                <DialogPrimitive.Description className="text-xs text-slate-400 mt-0.5">
                  {ar
                    ? "منظومة إدخال شاملة لتعريف الأصناف بأعلى معايير الحوكمة وحساب الأرباح والترميز الدولي اللحظي"
                    : "Complete executive workstation to configure products, simulate profits, and enforce corporate item policy"}
                </DialogPrimitive.Description>
              </div>
            </div>

            {/* أدوات التحكم اليمينية */}
            <div className="flex items-center gap-3.5">
              {/* مفتاح تفعيل الصنف بلمسة فاخرة */}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-slate-700/70 bg-slate-800/50 px-3.5 py-2 text-xs font-bold text-slate-200 hover:border-emerald-500/40 hover:bg-slate-800 transition">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                  className="size-4 rounded border-slate-600 accent-emerald-500 focus:ring-0 cursor-pointer"
                />
                <span className={form.is_active ? "text-emerald-400" : "text-slate-400"}>
                  {form.is_active ? (ar ? "الصنف نشط ومفعل" : "Active Item") : (ar ? "الصنف معطل مؤقتاً" : "Inactive")}
                </span>
              </label>

              {/* زر الإغلاق الأنيق */}
              <button
                type="button"
                onClick={onClose}
                className="flex size-10 items-center justify-center rounded-2xl border border-slate-700/80 bg-slate-800/60 text-slate-400 hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400 transition active:scale-95 shadow-sm"
                title={ar ? "إغلاق الاستوديو (Esc)" : "Close Studio (Esc)"}
              >
                <X className="size-5" />
              </button>
            </div>
          </div>

          {/* منصة التبويبات الفاخرة الموزعة (Navigation Dock) */}
          <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-slate-800/80 bg-slate-950/60 px-6 py-2.5 custom-scrollbar">
            {tabsConfig.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`group relative flex items-center gap-3 rounded-2xl px-4 py-2 text-xs font-bold transition-all shrink-0 ${
                    isActive
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/30 ring-1 ring-white/20 scale-[1.02]"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent hover:border-slate-700/60"
                  }`}
                >
                  <div
                    className={`flex size-7 items-center justify-center rounded-xl transition ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200"
                    }`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="text-start">
                    <div className="flex items-center gap-1.5">
                      <span>{tab.label}</span>
                      {tab.isComplete && !isActive && (
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-normal block ${
                        isActive ? "text-emerald-100" : "text-slate-500 group-hover:text-slate-400"
                      }`}
                    >
                      {tab.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* جسم الاستوديو: تصميم لوحة مزدوجة واسعة (Dual-Pane Workspace) */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* المحطة الأساسية: حقول الإدخال والتحكم (64% من العرض) */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-8 custom-scrollbar">
              <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto">
                {/* 1. محطة الهوية والترميز (Identity & Barcodes) */}
                {activeTab === "identity" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    {/* بطاقة الأسماء والمسميات */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-4 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <Tag className="size-5 text-emerald-400" />
                          <h3 className="text-sm font-black text-white">
                            {ar ? "مسميات الصنف في المنظومة" : "Product Names & Branding"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {ar ? "الاسم العربي مطلوب لكافة المعاملات" : "Arabic name is required"}
                        </span>
                      </div>

                      {/* الاسم العربي الأساسي */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                            <span>{ar ? "اسم المنتج التجاري (عربي)" : "Product Name (Arabic)"}</span>
                            <span className="text-rose-500 font-black text-sm">*</span>
                          </label>
                          <span className="text-[11px] text-slate-500">
                            {ar ? "يظهر على الفواتير، الإيصالات وشاشات الكاشير" : "Shown on POS & receipts"}
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={form.name_ar}
                            onChange={(e) => setForm((prev) => ({ ...prev, name_ar: e.target.value }))}
                            placeholder={ar ? "مثال: دقيق فاخر نخب أول فخر اليمن 50 كجم" : "e.g. Premium White Flour 50kg"}
                            className="w-full h-12 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-4 text-base font-bold text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition shadow-inner font-arabic"
                            autoFocus
                            required
                          />
                        </div>
                      </div>

                      {/* الاسم بالإنجليزية أو البديل */}
                      {showForm("nameEn") && (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-semibold text-slate-300">
                              {ar ? "الاسم بالإنجليزية (أو الرديف اللاتيني)" : "English / Secondary Name"}
                            </label>
                            <span className="text-[11px] text-slate-500">{ar ? "اختياري للتقارير العالمية" : "Optional"}</span>
                          </div>
                          <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="e.g. Premium Whole Wheat Flour 50kg"
                            dir="ltr"
                            className="w-full h-11 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-4 text-sm font-medium text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition shadow-inner"
                          />
                        </div>
                      )}
                    </div>

                    {/* استوديو الباركود المباشر و SKU */}
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-5 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <BarcodeIcon className="size-5 text-emerald-400" />
                          <h3 className="text-sm font-black text-white">
                            {ar ? "مركز الباركود الحي والترميز الدولي (EAN & SKU)" : "Barcode & SKU Engineering"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {ar ? "يدعم الماسح اللاسلكي والكاميرا الحية" : "Wedge Scanner & Live Camera"}
                        </span>
                      </div>

                      {/* حقل الباركود مع أدوات التوليد اللحظي والتحقق من التكرار */}
                      {showForm("barcode") && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                              <span>{ar ? "رمز الباركود الدولي (Barcode / EAN-13)" : "International Barcode (EAN-13)"}</span>
                              {/* شارة حالة التحقق من التكرار */}
                              {barcodeCheckStatus === "checking" && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                  <RefreshCw className="size-3 animate-spin text-emerald-400" />
                                  <span>فحص التكرار...</span>
                                </span>
                              )}
                              {barcodeCheckStatus === "unique" && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                                  <Check className="size-3" />
                                  <span>باركود متاح وفريد</span>
                                </span>
                              )}
                              {barcodeCheckStatus === "duplicate" && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/30 animate-pulse">
                                  <AlertCircle className="size-3" />
                                  <span>مكرر: {duplicateProductName}</span>
                                </span>
                              )}
                            </label>

                            {form.barcode && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(form.barcode, "barcode")}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition"
                              >
                                {copiedKey === "barcode" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                                <span>{copiedKey === "barcode" ? (ar ? "تم النسخ" : "Copied") : (ar ? "نسخ الرمز" : "Copy")}</span>
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                value={form.barcode}
                                onChange={(e) => setForm((prev) => ({ ...prev, barcode: e.target.value }))}
                                placeholder={ar ? "امسح بالماسح اللاسلكي أو اضغط توليد..." : "Scan or click Generate..."}
                                dir="ltr"
                                className={`w-full h-11 rounded-2xl border px-4 font-mono text-base font-bold tracking-widest outline-none transition shadow-inner ${
                                  barcodeCheckStatus === "duplicate"
                                    ? "border-rose-500 bg-rose-950/20 text-rose-200 focus:ring-4 focus:ring-rose-500/20"
                                    : "border-slate-700/80 bg-slate-950/80 text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20"
                                }`}
                              />
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={handleGenerateBarcode}
                                className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-600/30 to-teal-600/30 px-3.5 text-xs font-bold text-emerald-300 hover:from-emerald-600/50 hover:to-teal-600/50 transition active:scale-95 shadow-sm"
                              >
                                <Sparkles className="size-4 text-emerald-400" />
                                <span>{ar ? "توليد EAN-13 معتمد" : "Generate EAN-13"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setScannerOpen(true)}
                                className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-slate-700/80 bg-slate-800/80 px-3.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition active:scale-95"
                              >
                                <Camera className="size-4 text-slate-400" />
                                <span>{ar ? "ماسح الكاميرا" : "Camera Scan"}</span>
                              </button>
                            </div>
                          </div>

                          {/* المخطط البصري الحي للباركود */}
                          <div className="pt-1">
                            <LiveBarcodeStripes code={form.barcode} />
                          </div>
                        </div>
                      )}

                      {/* حقل رمز التعريف SKU */}
                      {showForm("sku") && (
                        <div className="border-t border-slate-800/80 pt-4">
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-200">
                              {ar ? "رمز تعريف المخزون (SKU)" : "Stock Keeping Unit (SKU)"}
                            </label>
                            {form.sku && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(form.sku, "sku")}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300"
                              >
                                {copiedKey === "sku" ? <Check className="size-3" /> : <Copy className="size-3" />}
                                <span>{copiedKey === "sku" ? (ar ? "تم النسخ" : "Copied") : (ar ? "نسخ" : "Copy")}</span>
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={form.sku}
                              onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value.toUpperCase() }))}
                              placeholder="e.g. FLR-50K-YEM"
                              dir="ltr"
                              className="flex-1 h-11 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-4 font-mono text-sm font-bold tracking-wider text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition shadow-inner"
                            />
                            <button
                              type="button"
                              onClick={handleGenerateSKU}
                              className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-slate-700/80 bg-slate-800/80 px-3.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition active:scale-95 shrink-0"
                            >
                              <Sparkles className="size-4 text-amber-400" />
                              <span>{ar ? "توليد SKU ذكي" : "Smart SKU"}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* موقع التخزين والرف */}
                      {showForm("shelfLocation") && (
                        <div className="border-t border-slate-800/80 pt-4">
                          <label className="text-xs font-bold text-slate-200 mb-1.5 block">
                            {ar ? "موقع التخزين والرف في المستودع" : "Warehouse Shelf Location"}
                          </label>
                          <div className="relative">
                            <MapPin className="size-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none rtl:right-3.5 rtl:left-auto ltr:left-3.5 ltr:right-auto" />
                            <input
                              type="text"
                              value={form.shelf_location}
                              onChange={(e) => setForm((prev) => ({ ...prev, shelf_location: e.target.value }))}
                              placeholder={ar ? "مثال: ممر 4 - الرف B2 - القطاع الشمالي" : "e.g. Aisle 4, Shelf B2"}
                              className="w-full h-11 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-10 text-sm font-medium text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition shadow-inner"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 2. محطة الهندسة المالية والتسعير (Financial Architecture & Margins) */}
                {activeTab === "pricing" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-5 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <DollarSign className="size-5 text-emerald-400" />
                          <h3 className="text-sm font-black text-white">
                            {ar ? "معادلة التسعير وحساب هوامش الربحية" : "Pricing Architecture & Profit Margins"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {ar ? "حساب فوري للأرباح والضرائب" : "Real-time margins & tax calculation"}
                        </span>
                      </div>

                      {/* شبكة مدخلات الأسعار الرئيسية */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* سعر التكلفة مع إمكانية الإخفاء */}
                        {canViewCost && (
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                <span>{ar ? "سعر التكلفة (شراء)" : "Cost Price"}</span>
                                <span className="text-[11px] text-slate-500">{ar ? "لكل وحدة" : "per unit"}</span>
                              </label>
                              <button
                                type="button"
                                onClick={() => setHideCostValue(!hideCostValue)}
                                className="text-slate-500 hover:text-slate-300 transition"
                                title={hideCostValue ? "إظهار التكلفة" : "إخفاء التكلفة"}
                              >
                                {hideCostValue ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                              </button>
                            </div>
                            <div className="relative">
                              <input
                                type={hideCostValue ? "password" : "number"}
                                step="any"
                                min="0"
                                value={form.cost_price}
                                onChange={(e) => setForm((prev) => ({ ...prev, cost_price: e.target.value }))}
                                placeholder="0.00"
                                dir="ltr"
                                className="w-full h-12 rounded-xl border border-slate-700 bg-slate-900 px-4 font-mono text-lg font-black text-white placeholder:text-slate-600 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none transition"
                              />
                            </div>
                          </div>
                        )}

                        {/* سعر البيع الأساسي */}
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                              <span>{ar ? "سعر البيع النهائي (قطاعي)" : "Selling Price (Retail)"}</span>
                              <span className="text-rose-500 font-black text-sm">*</span>
                            </label>
                            {marginPercent > 0 && (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-300 border border-emerald-500/30">
                                هامش {marginPercent}%
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={form.sale_price}
                              onChange={(e) => setForm((prev) => ({ ...prev, sale_price: e.target.value }))}
                              placeholder="0.00"
                              dir="ltr"
                              className="w-full h-12 rounded-xl border border-emerald-500/50 bg-slate-900 px-4 font-mono text-xl font-black text-emerald-400 placeholder:text-slate-600 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/30 outline-none transition"
                              required
                            />
                          </div>
                        </div>
                      </div>

                      {/* منصة هوامش الربح السريعة (One-Click Margin Multipliers) */}
                      {canViewCost && (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-200 flex items-center gap-1.5">
                              <Calculator className="size-4 text-emerald-400" />
                              <span>{ar ? "تطبيق هوامش ربح قياسية فورية:" : "Quick Margin Multipliers:"}</span>
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {ar ? "تعتمد على سعر التكلفة المدخل" : "Calculated from cost"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {[
                              { pct: 15, label: ar ? "اقتصادي" : "Economy" },
                              { pct: 25, label: ar ? "متوازن" : "Balanced" },
                              { pct: 35, label: ar ? "متميز" : "Growth" },
                              { pct: 50, label: ar ? "فاخر" : "Premium" },
                              { pct: 100, label: ar ? "مضاعف" : "Double" },
                            ].map((item) => (
                              <button
                                key={item.pct}
                                type="button"
                                onClick={() => applyMarkup(item.pct)}
                                className="group flex flex-col items-center justify-center rounded-xl border border-slate-700/70 bg-slate-800/60 p-2.5 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition active:scale-95"
                              >
                                <span className="text-xs font-black text-emerald-300 group-hover:text-emerald-400">
                                  +{item.pct}%
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">
                                  {item.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* الضرائب والقيمة المضافة */}
                      {showForm("taxRate") && (
                        <div className="border-t border-slate-800/80 pt-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-200">
                              {ar ? "نسبة ضريبة القيمة المضافة (%)" : "VAT Rate (%)"}
                            </label>
                            <div className="flex items-center gap-1">
                              {[0, 5, 15].map((rate) => (
                                <button
                                  key={rate}
                                  type="button"
                                  onClick={() => setForm((prev) => ({ ...prev, tax_rate: String(rate) }))}
                                  className={`rounded-lg px-2.5 py-1 text-xs font-black transition ${
                                    form.tax_rate === String(rate)
                                      ? "bg-emerald-500 text-slate-950 shadow-sm"
                                      : "bg-slate-800 text-slate-400 hover:text-white"
                                  }`}
                                >
                                  {rate}%
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max="100"
                              value={form.tax_rate}
                              onChange={(e) => setForm((prev) => ({ ...prev, tax_rate: e.target.value }))}
                              placeholder="0"
                              dir="ltr"
                              className="w-32 h-11 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-4 font-mono text-sm font-bold text-white focus:border-emerald-500 outline-none transition"
                            />
                            {taxRateNum > 0 && saleNum > 0 && (
                              <span className="text-xs text-slate-400 font-medium">
                                {ar ? "السعر شامل الضريبة:" : "Price with VAT:"}{" "}
                                <strong className="text-white font-mono">{salePriceWithTax.toLocaleString()}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. محطة المخزون وسلاسل الإمداد (Inventory & Supply Chain) */}
                {activeTab === "inventory" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-5 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <Boxes className="size-5 text-emerald-400" />
                          <h3 className="text-sm font-black text-white">
                            {ar ? "وحدات القياس وحدود التخزين والأمان" : "Units of Measure & Stock Parameters"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {ar ? "تتبع أرصدة المخزون ونقاط إعادة الطلب" : "Stock control & reorder threshold"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* وحدة القياس الأساسية */}
                        {config.enableUnits && showForm("unit") && (
                          <div>
                            <label className="text-xs font-bold text-slate-200 mb-1.5 block">
                              {ar ? "وحدة القياس الأساسية (UOM)" : "Base Unit of Measure"}
                            </label>
                            <select
                              value={form.unit_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, unit_id: e.target.value }))}
                              className="w-full h-12 rounded-2xl border border-slate-700/80 bg-slate-950 px-4 text-sm font-bold text-white focus:border-emerald-500 outline-none transition cursor-pointer"
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

                        {/* حد الأمان للتنبيه */}
                        {showForm("minStock") && (
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="text-xs font-bold text-slate-200">
                                {ar ? "حد الأمان للتنبيه (نقطة إعادة الطلب)" : "Reorder Point (Min Stock)"}
                              </label>
                              <span className="text-[11px] text-amber-400 font-bold">{ar ? "تنبيه بالنواقص" : "Alert level"}</span>
                            </div>
                            <input
                              type="number"
                              min="0"
                              value={form.min_stock}
                              onChange={(e) => setForm((prev) => ({ ...prev, min_stock: e.target.value }))}
                              placeholder="1"
                              dir="ltr"
                              className="w-full h-12 rounded-2xl border border-slate-700/80 bg-slate-950 px-4 font-mono text-base font-bold text-white focus:border-emerald-500 outline-none transition"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. محطة التصنيف والمواصفات (Taxonomy & Attributes) */}
                {activeTab === "classification" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-5 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <Layers className="size-5 text-emerald-400" />
                          <h3 className="text-sm font-black text-white">
                            {ar ? "التصنيف، العلامات التجارية ومستويات الجودة" : "Taxonomy, Brands & Specifications"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {ar ? "يُسهّل البحث الذكي وتقارير المبيعات" : "Categorization & filtering"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* التصنيف الرئيسي */}
                        {showForm("category") && (
                          <div>
                            <label className="text-xs font-bold text-slate-200 mb-1.5 block">
                              {ar ? "التصنيف / الفئة الرئيسية" : "Product Category"}
                            </label>
                            <select
                              value={form.category_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, category_id: e.target.value }))}
                              className="w-full h-12 rounded-2xl border border-slate-700/80 bg-slate-950 px-4 text-sm font-bold text-white focus:border-emerald-500 outline-none transition cursor-pointer"
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

                        {/* العلامة التجارية */}
                        {config.enableBrands && showForm("brand") && (
                          <div>
                            <label className="text-xs font-bold text-slate-200 mb-1.5 block">
                              {ar ? "العلامة التجارية / الماركة" : "Brand / Manufacturer"}
                            </label>
                            <select
                              value={form.brand_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, brand_id: e.target.value }))}
                              className="w-full h-12 rounded-2xl border border-slate-700/80 bg-slate-950 px-4 text-sm font-bold text-white focus:border-emerald-500 outline-none transition cursor-pointer"
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

                        {/* بلد المنشأ */}
                        {config.enableOrigins && showForm("origin") && (
                          <div>
                            <label className="text-xs font-bold text-slate-200 mb-1.5 block">
                              {ar ? "بلد المنشأ / المصدر" : "Country of Origin"}
                            </label>
                            <select
                              value={form.origin_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, origin_id: e.target.value }))}
                              className="w-full h-12 rounded-2xl border border-slate-700/80 bg-slate-950 px-4 text-sm font-bold text-white focus:border-emerald-500 outline-none transition cursor-pointer"
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

                        {/* رتبة الجودة */}
                        {config.enableQualityGrades && showForm("qualityGrade") && (
                          <div>
                            <label className="text-xs font-bold text-slate-200 mb-1.5 block">
                              {ar ? "رتبة ودرجة الجودة" : "Quality Grade"}
                            </label>
                            <select
                              value={form.quality_grade_id}
                              onChange={(e) => setForm((prev) => ({ ...prev, quality_grade_id: e.target.value }))}
                              className="w-full h-12 rounded-2xl border border-slate-700/80 bg-slate-950 px-4 text-sm font-bold text-white focus:border-emerald-500 outline-none transition cursor-pointer"
                            >
                              <option value="">{ar ? "— رتبة الجودة القياسية —" : "— Select Quality Grade —"}</option>
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

                {/* 5. محطة الحوكمة وسياسات الصنف (Governance & Item Policy) */}
                {activeTab === "policy" && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 space-y-5 shadow-sm backdrop-blur-sm">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2.5">
                          <ShieldCheck className="size-5 text-emerald-400" />
                          <h3 className="text-sm font-black text-white">
                            {ar ? "طبيعة وسياسات الصنف في المنظومة المحاسبية" : "Item Nature & Accounting Policy"}
                          </h3>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {ar ? "تحدد قيود الحسابات وحركات المخزون" : "Ledger flow & audit policy"}
                        </span>
                      </div>

                      {/* بطاقات اختيار طبيعة الصنف (Good vs Service) */}
                      <div>
                        <label className="text-xs font-bold text-slate-200 mb-2.5 block">
                          {ar ? "طبيعة الصنف الأساسية:" : "Primary Item Nature:"}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setPolicy((prev) => ({
                                ...prev,
                                item_nature: "GOOD",
                                inventory_policy: "TRACKED",
                              }))
                            }
                            className={`flex flex-col items-start gap-2 rounded-2xl border p-4.5 text-start transition-all ${
                              policy.item_nature === "GOOD"
                                ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                                : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-black text-sm text-white flex items-center gap-2">
                                <Package className="size-4.5 text-emerald-400" />
                                {ar ? "سلعة مادية ملموسة (Good)" : "Physical Product (Good)"}
                              </span>
                              {policy.item_nature === "GOOD" && <CheckCircle2 className="size-4 text-emerald-400" />}
                            </div>
                            <span className="text-xs text-slate-400 leading-relaxed">
                              {ar
                                ? "بضاعة ومواد لها وجود مادي، تُشترى وتُخزن في المستودع وتُجرد بدقة."
                                : "Physical item that is stocked, counted and tracked in inventory."}
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
                            className={`flex flex-col items-start gap-2 rounded-2xl border p-4.5 text-start transition-all ${
                              policy.item_nature === "SERVICE"
                                ? "border-emerald-500 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                                : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-black text-sm text-white flex items-center gap-2">
                                <Wrench className="size-4.5 text-emerald-400" />
                                {ar ? "خدمة أو عمل مهني (Service)" : "Service / Labor"}
                              </span>
                              {policy.item_nature === "SERVICE" && <CheckCircle2 className="size-4 text-emerald-400" />}
                            </div>
                            <span className="text-xs text-slate-400 leading-relaxed">
                              {ar
                                ? "أتعاب أو خدمات مثل الطحن، التوصيل، أو الصيانة بلا مخزون مستودعي مادي."
                                : "Intangible services without warehouse inventory tracking."}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* تتبع المخزون */}
                      {policy.item_nature === "GOOD" && (
                        <div className="border-t border-slate-800/80 pt-4 space-y-2">
                          <label className="text-xs font-bold text-slate-200 block">
                            {ar ? "سياسة تتبع المخزون في المستودع:" : "Warehouse Stock Tracking:"}
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className={`flex items-center gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                              policy.inventory_policy === "TRACKED"
                                ? "border-emerald-500/50 bg-emerald-500/10 text-white font-bold"
                                : "border-slate-800 bg-slate-950 text-slate-400"
                            }`}>
                              <input
                                type="radio"
                                name="inventory_policy"
                                checked={policy.inventory_policy === "TRACKED"}
                                onChange={() => setPolicy((p) => ({ ...p, inventory_policy: "TRACKED" }))}
                                className="size-4 accent-emerald-500"
                              />
                              <div>
                                <div className="text-xs font-bold">{ar ? "تتبع المخزون بدقة (موصى به)" : "Track Stock (Recommended)"}</div>
                                <div className="text-[11px] text-slate-400">{ar ? "يُسجل الوارد والمنصرف ورصيد المستودع" : "Full stock ledger balance"}</div>
                              </div>
                            </label>

                            <label className={`flex items-center gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                              policy.inventory_policy === "UNTRACKED"
                                ? "border-emerald-500/50 bg-emerald-500/10 text-white font-bold"
                                : "border-slate-800 bg-slate-950 text-slate-400"
                            }`}>
                              <input
                                type="radio"
                                name="inventory_policy"
                                checked={policy.inventory_policy === "UNTRACKED"}
                                onChange={() => setPolicy((p) => ({ ...p, inventory_policy: "UNTRACKED" }))}
                                className="size-4 accent-emerald-500"
                              />
                              <div>
                                <div className="text-xs font-bold">{ar ? "سلعة بلا تتبع كميات" : "Untracked Good"}</div>
                                <div className="text-[11px] text-slate-400">{ar ? "تُباع وتُشترى دون تقييد الرصيد" : "No stock balances checked"}</div>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* صلاحيات البيع والشراء */}
                      <div className="border-t border-slate-800/80 pt-4 space-y-2">
                        <label className="text-xs font-bold text-slate-200 block">
                          {ar ? "صلاحيات تداول الصنف في الدفاتر:" : "Item Transaction Permissions:"}
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3.5 cursor-pointer hover:border-slate-700 transition">
                            <input
                              type="checkbox"
                              checked={policy.is_sellable}
                              onChange={(e) => setPolicy((p) => ({ ...p, is_sellable: e.target.checked }))}
                              className="size-4 accent-emerald-500 rounded cursor-pointer"
                            />
                            <div>
                              <div className="text-xs font-bold text-white">{ar ? "متاح للبيع (شاشات الكاشير والفواتير)" : "Sellable (POS & Sales)"}</div>
                              <div className="text-[11px] text-slate-400">{ar ? "يظهر في شاشات المبيعات" : "Appears on POS screens"}</div>
                            </div>
                          </label>

                          <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3.5 cursor-pointer hover:border-slate-700 transition">
                            <input
                              type="checkbox"
                              checked={policy.is_purchasable}
                              onChange={(e) => setPolicy((p) => ({ ...p, is_purchasable: e.target.checked }))}
                              className="size-4 accent-emerald-500 rounded cursor-pointer"
                            />
                            <div>
                              <div className="text-xs font-bold text-white">{ar ? "متاح للشراء (فواتير التوريد والموردين)" : "Purchasable (Purchases)"}</div>
                              <div className="text-[11px] text-slate-400">{ar ? "يظهر عند إدخال فواتير المشتريات" : "Appears on purchase orders"}</div>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>

            {/* الشريط الجانبي الفاخر: المعاينة الحية ومحاكي الأرباح والجاهزية (36% من العرض) */}
            <div className="hidden lg:flex w-[400px] shrink-0 flex-col border-s border-slate-800/80 bg-slate-950/70 p-6 overflow-y-auto space-y-6 custom-scrollbar backdrop-blur-md">
              <div className="flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Sparkles className="size-4" />
                  <span>{ar ? "رادار الأرباح والمعاينة الحية" : "Live Studio Showcase"}</span>
                </span>
                <span className="font-mono text-[11px] text-slate-500">POS PREVIEW</span>
              </div>

              {/* بطاقة "الرف الرقمي الفاخر" (The Digital Shelf Card) */}
              <div className="relative rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 p-5 shadow-2xl space-y-4 overflow-hidden">
                <div className="absolute top-0 right-0 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-[11px] font-bold text-emerald-300">
                    {selectedCategory ? (ar ? selectedCategory.name_ar || selectedCategory.name : selectedCategory.name) : (ar ? "عام / بدون فئة" : "General")}
                  </span>
                  <span
                    className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                      form.is_active
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                        : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                    }`}
                  >
                    {form.is_active ? (ar ? "صنف نشط" : "Active") : (ar ? "معطل" : "Inactive")}
                  </span>
                </div>

                <div>
                  <h4 className="text-lg font-black text-white line-clamp-2 font-arabic">
                    {form.name_ar || (ar ? "اسم المنتج سيظهر هنا مباشرة..." : "Product name will appear here...")}
                  </h4>
                  {form.name && (
                    <p className="text-xs text-slate-400 font-medium mt-1 line-clamp-1" dir="ltr">
                      {form.name}
                    </p>
                  )}
                </div>

                {/* استعراض السعر التجاري الفخم */}
                <div className="rounded-2xl bg-slate-950/90 p-4 border border-slate-800 flex items-baseline justify-between shadow-inner">
                  <span className="text-xs font-bold text-slate-400">{ar ? "سعر البيع:" : "Price:"}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-black font-mono text-emerald-400 tracking-tight">
                      {saleNum > 0 ? saleNum.toLocaleString() : "0.00"}
                    </span>
                    <span className="text-xs font-bold text-slate-400">{ar ? "ر.ي" : "YER"}</span>
                  </div>
                </div>

                {/* تفاصيل الباركود ووحدة القياس */}
                <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>{ar ? "الباركود:" : "Barcode:"}</span>
                    <span className="font-bold text-white">{form.barcode || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>{ar ? "رمز SKU:" : "SKU:"}</span>
                    <span className="font-bold text-white">{form.sku || "—"}</span>
                  </div>
                  {selectedUnit && (
                    <div className="flex items-center justify-between text-slate-400">
                      <span>{ar ? "الوحدة:" : "Unit:"}</span>
                      <span className="font-bold text-emerald-300 font-arabic">
                        {ar ? selectedUnit.name_ar || selectedUnit.name : selectedUnit.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* محاكي ورادار الربحية المالي (Financial Profit Simulator) */}
              {canViewCost && (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-black text-white">
                      <TrendingUp className="size-4.5 text-emerald-400" />
                      <span>{ar ? "تحليل ومؤشر الربحية اللحظي" : "Profitability Intelligence"}</span>
                    </div>
                    <span
                      className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                        marginPercent >= 25
                          ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                          : marginPercent >= 10
                            ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                            : "bg-rose-500/20 border-rose-500/30 text-rose-300"
                      }`}
                    >
                      {marginPercent}% {ar ? "هامش صافٍ" : "Margin"}
                    </span>
                  </div>

                  {/* شريط المقياس البصري المتقدم */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                      <span>{ar ? "كفاءة الهامش التجاري" : "Margin Health"}</span>
                      <span className={marginPercent >= 20 ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
                        {marginPercent >= 25 ? (ar ? "ممتاز وصحي" : "Excellent") : marginPercent >= 10 ? (ar ? "متوسط" : "Moderate") : (ar ? "منخفض" : "Low")}
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden flex shadow-inner">
                      <div
                        className={`h-full transition-all duration-500 ${
                          marginPercent >= 25
                            ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                            : marginPercent >= 10
                              ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                              : "bg-gradient-to-r from-rose-500 to-red-400"
                        }`}
                        style={{ width: `${Math.min(Math.max(marginPercent, 0), 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* بطاقات الإحصاءات السريعة */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="rounded-2xl bg-slate-950 p-3 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block mb-0.5">{ar ? "صافي الربح للقطعة:" : "Net Profit:"}</span>
                      <span
                        className={`font-mono font-black text-sm ${
                          profitNum >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {profitNum.toLocaleString()} {ar ? "ر.ي" : "YER"}
                      </span>
                    </div>

                    <div className="rounded-2xl bg-slate-950 p-3 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block mb-0.5">{ar ? "نسبة الزيادة (Markup):" : "Cost Markup:"}</span>
                      <span className="font-mono font-black text-sm text-white">
                        +{markupPercent}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* قائمة التحقق من الجاهزية والاعتماد (Audit Checklist) */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white block">
                    {ar ? "مؤشر كمال وتداولية الصنف:" : "Readiness Audit Checklist:"}
                  </span>
                  <span className="text-xs font-bold text-emerald-400">{readiness.score}%</span>
                </div>

                <div className="space-y-2 text-xs">
                  {readiness.checks.map((check) => (
                    <div key={check.key} className="flex items-center justify-between py-1 border-b border-slate-800/50 last:border-0">
                      <div className="flex items-center gap-2">
                        {check.pass ? (
                          <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle className="size-4 text-slate-500 shrink-0" />
                        )}
                        <span className={check.pass ? "text-white font-medium" : "text-slate-400"}>
                          {check.label}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">+{check.weight}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* شريط الإجراءات السفلي الفاخر (Executive Command Bar) */}
          <div className="flex shrink-0 items-center justify-between border-t border-slate-800/80 bg-slate-900/60 px-6 py-4 backdrop-blur-md">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 font-mono text-[11px] text-slate-400">
                <CornerDownLeft className="size-3.5 text-emerald-400" />
                <span>Ctrl + Enter للحفظ الفوري</span>
              </span>
              <span className="hidden md:inline text-slate-500">|</span>
              <span className="hidden md:inline text-slate-400">
                {readiness.score === 100 ? (ar ? "الصنف مكتمل وجاهز بنسبة 100%" : "Item 100% Ready") : (ar ? "يمكنك الحفظ في أي وقت" : "Ready to save")}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* زر الإلغاء */}
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-2xl border border-slate-700/80 bg-slate-800/60 px-5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition active:scale-95"
              >
                {ar ? "إلغاء الأمر" : "Cancel"}
              </button>

              {/* زر حفظ وإضافة آخر (للإدخال السريع بالمستودعات) */}
              {!initial && (
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  disabled={saving}
                  className="hidden sm:inline-flex h-11 items-center gap-2 rounded-2xl border border-emerald-500/40 bg-slate-800 px-5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200 transition active:scale-95 disabled:opacity-60"
                >
                  <Plus className="size-4" />
                  <span>{ar ? "حفظ وإضافة صنف آخر" : "Save & Add Another"}</span>
                </button>
              )}

              {/* الزر الرئيسي الفخم */}
              <button
                type="button"
                onClick={(e) => handleSubmit(e, false)}
                disabled={saving}
                className="inline-flex h-11 items-center gap-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 px-6 text-xs font-black text-white shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 transition active:scale-95 disabled:opacity-60 ring-1 ring-white/20"
              >
                {saving ? (
                  <>
                    <RefreshCw className="size-4 animate-spin" />
                    <span>{ar ? "جارٍ تسجيل الصنف بالدفاتر..." : "Saving..."}</span>
                  </>
                ) : (
                  <>
                    <CheckCheck className="size-4 text-emerald-200" />
                    <span>
                      {initial
                        ? ar
                          ? "حفظ واعتماد التعديلات"
                          : "Update Product"
                        : ar
                          ? "حفظ واعتماد الصنف بالكتالوج"
                          : "Save & Commit Product"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* نافذة الماسح بالكاميرا */}
          {scannerOpen && (
            <BarcodeScanner
              open={scannerOpen}
              onClose={() => setScannerOpen(false)}
              onDetected={(barcode) => {
                setForm((prev) => ({ ...prev, barcode }));
                setScannerOpen(false);
                toast.success(ar ? "تمت قراءة الباركود بالكاميرا بنجاح" : "Barcode detected");
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
