import { memo } from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Search,
  Receipt,
  Package,
  Users,
  Settings,
  X,
  ArrowRight,
  Sparkles,
  Command as CommandIcon,
  Loader2,
  Building2,
  Boxes,
  RotateCcw,
  BarChart3,
  Scale,
  LineChart,
  HardDriveDownload,
  Wallet,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useModules } from "@/lib/modules";
import { useMillingMode, isRouteVisibleByMillingMode } from "@/lib/milling-mode";
import { cn } from "@/lib/utils";

// تطبيع النصوص للبحث التسامحي (عربي وإنجليزي)
function normalizeText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // إزالة التشكيل
    .trim();
}

interface NavItem {
  id: string;
  title: string;
  sub: string;
  to: string;
  icon: any;
  category: "navigation" | "settings";
  moduleId?: string;
  keywords?: string[];
}

interface SearchResultItem {
  id: string;
  title: string;
  subtitle: string;
  category: "invoice" | "product" | "customer" | "supplier" | "nav";
  to: string;
  badge?: string;
  icon: any;
}

import { useBreakpoint } from "@/design/breakpoints";

export const VortexHeaderOmnisearch = memo(function VortexHeaderOmnisearch({
  onFocusChange,
}: {
  onFocusChange?: (focused: boolean) => void;
}) {
  const { lang } = useI18n();
  const isAr = lang === "ar";
  const navigate = useNavigate();
  const { isModuleEnabled } = useModules();
  const { mode: millingMode } = useMillingMode();
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === "xs" || breakpoint === "sm";

  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dataResults, setDataResults] = useState<SearchResultItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // قائمة الواجهات والإعدادات الرئيسية للنظام
  const navigationIndex = useMemo<NavItem[]>(() => {
    return [
      { id: "dash", title: isAr ? "لوحة التحكم الرئيسية" : "Dashboard", sub: isAr ? "نظرة عامة على الأعمال والمؤشرات" : "Overview & metrics", to: "/dashboard", icon: LineChart, category: "navigation" as const, keywords: ["رئيسية", "dashboard", "مؤشرات"] },
      { id: "pos", title: isAr ? "نقطة البيع (الكاشير)" : "POS Cashier", sub: isAr ? "تسجيل المبيعات وطباعة الفواتير السريعة" : "Quick sales & printing", to: "/pos", icon: Receipt, category: "navigation" as const, moduleId: "pos", keywords: ["كاشير", "بيع", "pos", "فاتورة"] },
      { id: "sales", title: isAr ? "فواتير المبيعات" : "Sales Invoices", sub: isAr ? "سجل ومتابعة جميع فواتير البيع" : "Manage sales records", to: "/sales", icon: Receipt, category: "navigation" as const, keywords: ["فواتير", "مبيعات", "sales"] },
      { id: "products", title: isAr ? "المنتجات والأصناف" : "Products", sub: isAr ? "إدارة بطاقات المنتجات والتسعير والباركود" : "Catalog & pricing", to: "/products", icon: Package, category: "navigation" as const, keywords: ["اصناف", "منتج", "منتجات", "اسعار", "باركود"] },
      { id: "inventory", title: isAr ? "إدارة المخزون" : "Inventory", sub: isAr ? "جرد ومتابعة كميات المستودعات" : "Stock & warehouse quantities", to: "/inventory", icon: Boxes, category: "navigation" as const, keywords: ["مخزون", "جرد", "كميات", "stock"] },
      { id: "customers", title: isAr ? "العملاء والحسابات" : "Customers", sub: isAr ? "دليل العملاء والأرصدة والديون" : "Customer balances & debts", to: "/customers", icon: Users, category: "navigation" as const, keywords: ["عميل", "عملاء", "زبائن", "ديون"] },
      { id: "debts", title: isAr ? "سجل الديون والتحصيل" : "Debts & Collection", sub: isAr ? "تحصيل مديونيات العملاء والآجال" : "Overdue balances", to: "/debts", icon: Scale, category: "navigation" as const, keywords: ["ديون", "تحصيل", "اجل", "سداد"] },
      { id: "purchases", title: isAr ? "المشتريات والتوريد" : "Purchases", sub: isAr ? "فواتير الشراء وإدخال البضائع" : "Purchase orders & stock-in", to: "/purchases", icon: Building2, category: "navigation" as const, moduleId: "purchases", keywords: ["شراء", "مشتريات", "توريد"] },
      { id: "suppliers", title: isAr ? "الموردين والشركات" : "Suppliers", sub: isAr ? "سجل الموردين وحساباتهم" : "Vendor accounts", to: "/suppliers", icon: Building2, category: "navigation" as const, moduleId: "purchases", keywords: ["مورد", "موردين", "شركات"] },
      { id: "reports", title: isAr ? "التقارير المالية" : "Financial Reports", sub: isAr ? "الأرباح والخسائر والتدفقات" : "Profit & balance reports", to: "/reports", icon: BarChart3, category: "navigation" as const, moduleId: "analytics", keywords: ["تقارير", "ارباح", "خسائر", "مالية"] },
      { id: "expenses", title: isAr ? "المصروفات اليومية" : "Expenses", sub: isAr ? "سندات الصرف والمصاريف التشغيلية" : "Operational expenses", to: "/expenses", icon: Wallet, category: "navigation" as const, moduleId: "expenses", keywords: ["مصروفات", "مصاريف", "سند صرف"] },
      { id: "returns", title: isAr ? "مرتجعات المبيعات" : "Sales Returns", sub: isAr ? "معالجة مرتجع البضاعة والعملاء" : "Return items", to: "/sales-returns", icon: RotateCcw, category: "navigation" as const, moduleId: "returns", keywords: ["مرتجع", "ترجيع"] },
      { id: "milling", title: isAr ? "نظام المطحنة والأمانات" : "Milling Operations", sub: isAr ? "إدارة تشغيل الحبوب والطحن والتسليم" : "Grain intake & jobs", to: "/milling", icon: Scale, category: "navigation" as const, moduleId: "milling_operations", keywords: ["مطحنة", "طحن", "حبوب", "امانات"] },
      { id: "backup", title: isAr ? "النسخ الاحتياطي والأمان" : "Backup Settings", sub: isAr ? "تحميل واستعادة النسخ الاحتياطية" : "Download & restore backups", to: "/settings", icon: HardDriveDownload, category: "settings" as const, keywords: ["نسخ احتياطي", "تنزيل", "باك اب", "backup", "حفظ"] },
      { id: "settings", title: isAr ? "إعدادات النظام العامة" : "System Settings", sub: isAr ? "إعدادات الفاتورة والعملة والضريبة" : "Company & invoice config", to: "/settings", icon: Settings, category: "settings" as const, keywords: ["اعدادات", "ضبط", "خيارات", "العملة", "الاسم"] },
    ].filter(item => (!item.moduleId || isModuleEnabled(item.moduleId)) && isRouteVisibleByMillingMode(item.to, millingMode));
  }, [isAr, isModuleEnabled, millingMode]);

  // إغلاق القائمة عند النقر خارجها
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        onFocusChange?.(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // اختصارات لوحة المفاتيح: '/' و 'Ctrl+K' / 'Cmd+K'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isInput = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA");

      // زر '/' عندما لا يكون المستخدم داخل حقل إدخال آخر
      if (e.key === "/" && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }

      // اختصار Ctrl+K أو Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }

      // زر Escape للإغلاق
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        inputRef.current?.blur();
        onFocusChange?.(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // البحث التسامحي في البيانات عبر Supabase مع Debounce
  useEffect(() => {
    const cleanQuery = query.trim();
    if (!cleanQuery || cleanQuery.length < 2) {
      setDataResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const handler = setTimeout(async () => {
      try {
        const normQ = cleanQuery.replace(/[#]/g, "").trim();
        const digitsOnly = cleanQuery.replace(/\D/g, "");
        const invoiceSearchTerm = normQ.replace(/^(inv-|فاتورة\s*|فاتوره\s*)/i, "").trim() || normQ;

        // جلب متزامن ذكي فائق السرعة مع تحمل الأخطاء الجزئية
        const [productsSettled, invoicesSettled, customersSettled, suppliersSettled] = await Promise.allSettled([
          supabase
            .from("products")
            .select("id, name, name_ar, barcode, sku, retail_price")
            .or(`name.ilike.%${normQ}%,name_ar.ilike.%${normQ}%,barcode.ilike.%${normQ}%,sku.ilike.%${normQ}%`)
            .limit(6),
          supabase
            .from("sales_invoices")
            .select("id, invoice_number, customer_name, total_amount, created_at")
            .or(`invoice_number.ilike.%${invoiceSearchTerm}%,customer_name.ilike.%${normQ}%${digitsOnly ? `,invoice_number.ilike.%${digitsOnly}%` : ""}`)
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("customers")
            .select("id, name, phone, balance")
            .or(`name.ilike.%${normQ}%${digitsOnly.length >= 3 ? `,phone.ilike.%${digitsOnly}%` : `,phone.ilike.%${normQ}%`}`)
            .limit(6),
          supabase
            .from("suppliers")
            .select("id, name, phone, balance")
            .or(`name.ilike.%${normQ}%${digitsOnly.length >= 3 ? `,phone.ilike.%${digitsOnly}%` : `,phone.ilike.%${normQ}%`}`)
            .limit(6),
        ]);

        const productsRes = productsSettled.status === "fulfilled" ? productsSettled.value : { data: [] };
        const invoicesRes = invoicesSettled.status === "fulfilled" ? invoicesSettled.value : { data: [] };
        const customersRes = customersSettled.status === "fulfilled" ? customersSettled.value : { data: [] };
        const suppliersRes = suppliersSettled.status === "fulfilled" ? suppliersSettled.value : { data: [] };

        const results: SearchResultItem[] = [];

        // 1) فواتير
        (invoicesRes.data || []).forEach((inv: any) => {
          results.push({
            id: `inv-${inv.id}`,
            title: `${isAr ? "فاتورة رقم" : "Invoice #"} ${inv.invoice_number}`,
            subtitle: `${inv.customer_name || (isAr ? "عميل نقدي" : "Cash")} • ${inv.total_amount?.toLocaleString()} ${isAr ? "ر.ي" : "YER"}`,
            category: "invoice",
            to: `/sales?invoiceId=${inv.id}`,
            badge: isAr ? "فاتورة" : "Invoice",
            icon: Receipt,
          });
        });

        // 2) منتجات
        (productsRes.data || []).forEach((p: any) => {
          results.push({
            id: `prod-${p.id}`,
            title: p.name_ar || p.name,
            subtitle: `${p.barcode ? `[${p.barcode}] • ` : ""}${isAr ? "السعر:" : "Price:"} ${p.retail_price?.toLocaleString()} ${isAr ? "ر.ي" : "YER"}`,
            category: "product",
            to: `/products?search=${encodeURIComponent(p.barcode || p.name)}`,
            badge: isAr ? "منتج" : "Product",
            icon: Package,
          });
        });

        // 3) عملاء
        (customersRes.data || []).forEach((c: any) => {
          results.push({
            id: `cust-${c.id}`,
            title: c.name,
            subtitle: `${c.phone ? `${c.phone} • ` : ""}${isAr ? "الرصيد:" : "Balance:"} ${c.balance?.toLocaleString()} ${isAr ? "ر.ي" : "YER"}`,
            category: "customer",
            to: `/customers?search=${encodeURIComponent(c.name)}`,
            badge: isAr ? "عميل" : "Customer",
            icon: Users,
          });
        });

                // 4) موردين
        (suppliersRes.data || []).forEach((s: any) => {
          results.push({
            id: `supp-${s.id}`,
            title: s.name,
            subtitle: `${s.phone ? `${s.phone} • ` : ""}${isAr ? "الرصيد للمورد:" : "Supplier balance:"} ${s.balance?.toLocaleString()} ${isAr ? "ر.ي" : "YER"}`,
            category: "supplier",
            to: `/suppliers?search=${encodeURIComponent(s.name)}`,
            badge: isAr ? "مورد" : "Supplier",
            icon: Building2,
          });
        });
        setDataResults(results);
      } catch (err) {
        console.warn("[Omnisearch] Error searching:", err);
      } finally {
        setIsLoading(false);
      }
    }, 200);

    return () => clearTimeout(handler);
  }, [query, isAr]);

  // تصفية الواجهات حسب البحث
  const filteredNav = useMemo(() => {
    if (!query.trim()) return navigationIndex.slice(0, 8); // الافتراضي
    const nq = normalizeText(query);
    return navigationIndex.filter((nav) => {
      const matchTitle = normalizeText(nav.title).includes(nq);
      const matchSub = normalizeText(nav.sub).includes(nq);
      const matchKw = nav.keywords?.some((k) => normalizeText(k).includes(nq));
      return matchTitle || matchSub || matchKw;
    });
  }, [query, navigationIndex]);

  // دمج كافة النتائج
  const allResults = useMemo(() => {
    const list: (SearchResultItem | (NavItem & { isNav: true }))[] = [];
    dataResults.forEach((d) => list.push(d));
    filteredNav.forEach((n) => list.push({ ...n, isNav: true }));
    return list;
  }, [dataResults, filteredNav]);

  // التنقل السريع عند الضغط على عنصر
  const handleSelect = (to: string) => {
    setIsOpen(false);
    setQuery("");
    navigate({ to });
  };

  // التحكم بالأسهم للأسفل والأعلى وEnter
  const handleKeyDownInput = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < allResults.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = allResults[selectedIndex];
      if (current) {
        handleSelect(current.to);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 w-full min-w-0 max-w-none">
      {/* Search Input Bar in Header */}
      <div
        className={cn(
          "group relative flex h-10 w-full items-center gap-2.5 rounded-full border bg-surface/90 px-3.5 text-sm transition-all duration-200",
          isOpen
            ? "border-primary/60 bg-surface shadow-md shadow-primary/10 ring-2 ring-primary/20"
            : "border-border/60 hover:border-ring/40 hover:bg-surface",
        )}
      >
        <Search
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            isOpen ? "text-primary stroke-[2.5]" : "text-muted-foreground group-hover:text-foreground",
          )}
        />

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
            setSelectedIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            // Delay to allow click events on dropdown items
            setTimeout(() => onFocusChange?.(false), 200);
          }}
          onKeyDown={handleKeyDownInput}
          placeholder={
            isMobile
              ? isAr ? "بحث..." : "Search..."
              : isAr ? "ابحث عن فاتورة، عميل، منتج، مورد... (/)" : "Search invoices, products, customers... (/)"
          }
          className="h-full flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground/75 placeholder:truncate focus:outline-none"
        />

        {isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : isMobile && isOpen ? (
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              inputRef.current?.blur();
              onFocusChange?.(false);
            }}
            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            title={isAr ? "إغلاق البحث" : "Close search"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <kbd className="hidden sm:inline-flex h-5 min-w-[20px] items-center justify-center rounded-md border border-border/80 bg-background/80 px-1.5 text-[10px] font-mono font-bold text-muted-foreground/90 shadow-sm">
              /
            </kbd>
            <kbd className="hidden lg:inline-flex h-5 items-center gap-0.5 rounded-md border border-border/80 bg-background/80 px-1.5 text-[10px] font-mono font-medium text-muted-foreground shadow-sm">
              <CommandIcon className="h-3 w-3" /> K
            </kbd>
          </div>
        )}
      </div>

      {/* Floating Expansive Results Dropdown anchored directly below header */}
      {isOpen && (
        <div
          className={cn(
            "fixed inset-x-2.5 top-[68px] z-50 max-h-[75vh] overflow-hidden rounded-2xl border border-border/80 bg-popover/95 p-2 shadow-2xl backdrop-blur-2xl transition-all animate-in fade-in-0 zoom-in-95 sm:absolute sm:top-full sm:inset-x-auto sm:mt-2 sm:w-[580px] md:w-[680px] lg:w-[760px]",
            isAr ? "sm:right-0" : "sm:left-0",
          )}
        >
          {/* Header indicator */}
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-semibold text-foreground/80">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {query
                ? isAr
                  ? `نتائج البحث عن: "${query}"`
                  : `Search results for: "${query}"`
                : isAr
                  ? "البحث الذكي الشامل في النظام"
                  : "Vortex OmniSearch"}
            </span>
            <span className="text-[11px] font-mono opacity-80">
              {isAr ? "استخدم الأسهم ↑ ↓ ثم Enter" : "Use ↑ ↓ then Enter"}
            </span>
          </div>

          <div className="overflow-y-auto max-h-[60vh] p-1.5 space-y-3 custom-scrollbar">
            {/* 1) نتائج البيانات الحية: فواتير، منتجات، عملاء */}
            {dataResults.length > 0 && (
              <div className="space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {isAr ? "البيانات والسجلات المطابقة" : "Matching Records"}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {dataResults.map((item, idx) => {
                    const isSelected = selectedIndex === idx;
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item.to)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "group flex items-center justify-between gap-3 rounded-xl border p-2.5 cursor-pointer transition-all duration-150",
                          isSelected
                            ? "border-primary/50 bg-primary/10 shadow-sm"
                            : "border-border/40 bg-surface/60 hover:border-border hover:bg-surface",
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
                              item.category === "invoice"
                                ? "bg-emerald-500/15 border-emerald-500/20 text-emerald-500"
                                : item.category === "product"
                                  ? "bg-teal-500/15 border-teal-500/20 text-teal-500"
                                  : "bg-blue-500/15 border-blue-500/20 text-blue-500",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-foreground truncate">
                              {item.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {item.subtitle}
                            </div>
                          </div>
                        </div>
                        {item.badge && (
                          <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/50">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2) الواجهات والصفحات والإعدادات */}
            {filteredNav.length > 0 && (
              <div className="space-y-1">
                <div className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {isAr ? "الواجهات والإعدادات السريعة" : "Navigation & Settings"}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {filteredNav.map((nav, nIdx) => {
                    const actualIdx = dataResults.length + nIdx;
                    const isSelected = selectedIndex === actualIdx;
                    const Icon = nav.icon;
                    return (
                      <div
                        key={nav.id}
                        onClick={() => handleSelect(nav.to)}
                        onMouseEnter={() => setSelectedIndex(actualIdx)}
                        className={cn(
                          "group flex items-center justify-between gap-3 rounded-xl border p-2.5 cursor-pointer transition-all duration-150",
                          isSelected
                            ? "border-primary/50 bg-primary/10 shadow-sm"
                            : "border-border/40 bg-surface/50 hover:border-border hover:bg-surface",
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 border border-border/50 text-foreground group-hover:text-primary transition-colors">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-xs text-foreground truncate">
                              {nav.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {nav.sub}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* في حال عدم وجود نتائج */}
            {dataResults.length === 0 && filteredNav.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                <p className="text-sm font-medium">
                  {isAr ? "لم نجد نتائج مطابقة لبحثك" : "No matching results found"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground/75">
                  {isAr
                    ? "جرّب البحث باسم العميل، رقم الفاتورة، أو اسم الشاشة"
                    : "Try searching by invoice number, product name, or module"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
