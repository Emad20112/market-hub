import { useEffect, useState, useMemo } from "react";
import {
  Download,
  Calendar,
  Printer,
  TrendingUp,
  Receipt,
  CreditCard,
  AlertTriangle,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ltr-value";
import { exportToCSV, type ExportColumn } from "@/lib/excel-export";
import { printReportDocument, type PrintSection } from "@/lib/print/report-print";
import {
  lowStockColumns,
  lowStockPrintSection,
  lowStockRows,
  paymentMixColumns,
  paymentMixPrintSection,
  paymentMixRows,
  salesColumns,
  salesPrintSection,
  salesRows,
  topProductColumns,
  topProductPrintSection,
  topProductRows,
} from "@/lib/reports/reports-export";
import { cn } from "@/lib/utils";

export type ReportSubSection = "top" | "sales" | "payments" | "low";

interface ReportsHubTabProps {
  ar: boolean;
  initialSubSection?: ReportSubSection;
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function ReportsHubTab({ ar, initialSubSection = "top" }: ReportsHubTabProps) {
  const [subSection, setSubSection] = useState<ReportSubSection>(initialSubSection);
  const [range, setRange] = useState(defaultRange());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [sales, setSales] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [byMethod, setByMethod] = useState<Record<string, number>>({});

  // Sort state
  const [sortField, setSortField] = useState<string>("default");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  async function loadData() {
    setLoading(true);
    const fromTs = `${range.from}T00:00:00`;
    const toTs = `${range.to}T23:59:59`;

    try {
      const [salesRes, purchRes, itemsRes, prodRes, invRes] = await Promise.all([
        supabase
          .from("sales_invoices")
          .select("id,invoice_number,total,paid,payment_method,status,created_at,customer_id,customers(name)")
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false }),
        supabase
          .from("purchase_invoices")
          .select("id,invoice_number,total,paid,status,created_at,supplier_id")
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false }),
        supabase
          .from("sales_invoice_items")
          .select("product_id,quantity,total,invoice_id,sales_invoices!inner(created_at)")
          .gte("sales_invoices.created_at", fromTs)
          .lte("sales_invoices.created_at", toTs),
        supabase
          .from("products")
          .select("id,name,name_ar,min_stock,sale_price,sku,barcode")
          .eq("inventory_policy" as never, "TRACKED" as never),
        supabase.from("company_stock_positions" as never).select("item_id,quantity"),
      ]);

      setSales(salesRes.data ?? []);
      setPurchases(purchRes.data ?? []);

      // Aggregate top products
      const map = new Map<string, { qty: number; total: number }>();
      (itemsRes.data ?? []).forEach((it: any) => {
        const cur = map.get(it.product_id) ?? { qty: 0, total: 0 };
        cur.qty += Number(it.quantity);
        cur.total += Number(it.total);
        map.set(it.product_id, cur);
      });
      const prodMap = new Map((prodRes.data ?? []).map((p: any) => [p.id, p]));
      const tops = Array.from(map.entries())
        .map(([pid, v]) => ({ ...v, product: prodMap.get(pid) }))
        .sort((a, b) => b.total - a.total);
      setTopProducts(tops);

      // Payment method split
      const methods: Record<string, number> = {};
      (salesRes.data ?? []).forEach((s: any) => {
        const m = s.payment_method || "cash";
        methods[m] = (methods[m] ?? 0) + Number(s.paid ?? s.total ?? 0);
      });
      setByMethod(methods);

      // Low stock
      const stockMap = new Map<string, number>();
      (invRes.data ?? []).forEach((i: { item_id: string; quantity: number }) => {
        stockMap.set(i.item_id, (stockMap.get(i.item_id) ?? 0) + Number(i.quantity));
      });
      const low = (prodRes.data ?? [])
        .map((p: any) => ({ ...p, stock: stockMap.get(p.id) ?? 0 }))
        .filter((p: any) => p.stock <= Number(p.min_stock ?? 0))
        .sort((a: any, b: any) => a.stock - b.stock);
      setLowStock(low);
    } catch (e) {
      console.error("Error loading reports data:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [range.from, range.to]);

  const salesTotal = sales.reduce((a, r) => a + Number(r.total || 0), 0);
  const salesPaid = sales.reduce((a, r) => a + Number(r.paid || 0), 0);
  const purchasesTotal = purchases.reduce((a, r) => a + Number(r.total || 0), 0);
  const netPurchasing = salesTotal - purchasesTotal;

  function productName(p: any) {
    return ar ? p?.name_ar ?? p?.name ?? "" : p?.name ?? "";
  }

  // Pre-formatted data for export
  const topRowsData = useMemo(() => {
    return topProducts.map((tp) => ({
      name: productName(tp.product),
      qty: tp.qty,
      total: tp.total,
    }));
  }, [topProducts, ar]);

  const salesRowsData = useMemo(() => {
    return sales.map((s) => ({
      invoiceNumber: s.invoice_number,
      customerName: s.customers?.name || (ar ? "عميل نقدي" : "Cash"),
      date: s.created_at,
      status: s.status,
      paymentMethod: s.payment_method,
      total: Number(s.total),
      paid: Number(s.paid),
    }));
  }, [sales, ar]);

  const totalPayments = Object.values(byMethod).reduce((a, b) => a + b, 0);
  const paymentRowsData = useMemo(() => {
    return Object.entries(byMethod)
      .map(([method, amount]) => ({
        method,
        amount,
        pct: totalPayments > 0 ? (amount / totalPayments) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [byMethod, totalPayments]);

  const lowRowsData = useMemo(() => {
    return lowStock.map((p) => ({
      name: productName(p),
      stock: p.stock,
      min: Number(p.min_stock ?? 0),
      salePrice: Number(p.sale_price ?? 0),
    }));
  }, [lowStock, ar]);

  // Filtered views based on searchQuery
  const filteredTopProducts = useMemo(() => {
    let list = topProducts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((tp) => {
        const name = (tp.product?.name || "").toLowerCase();
        const nameAr = (tp.product?.name_ar || "").toLowerCase();
        const barcode = (tp.product?.barcode || "").toLowerCase();
        return name.includes(q) || nameAr.includes(q) || barcode.includes(q);
      });
    }
    if (sortField === "qty") {
      list = [...list].sort((a, b) => (sortAsc ? a.qty - b.qty : b.qty - a.qty));
    } else if (sortField === "total") {
      list = [...list].sort((a, b) => (sortAsc ? a.total - b.total : b.total - a.total));
    }
    return list;
  }, [topProducts, searchQuery, sortField, sortAsc]);

  const filteredSales = useMemo(() => {
    let list = sales;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) => {
        const inv = (s.invoice_number || "").toLowerCase();
        const cust = (s.customers?.name || "").toLowerCase();
        return inv.includes(q) || cust.includes(q);
      });
    }
    if (sortField === "total") {
      list = [...list].sort((a, b) => (sortAsc ? a.total - b.total : b.total - a.total));
    } else if (sortField === "date") {
      list = [...list].sort((a, b) => {
        const d1 = new Date(a.created_at).getTime();
        const d2 = new Date(b.created_at).getTime();
        return sortAsc ? d1 - d2 : d2 - d1;
      });
    }
    return list;
  }, [sales, searchQuery, sortField, sortAsc]);

  const filteredLowStock = useMemo(() => {
    let list = lowStock;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => {
        const name = (p.name || "").toLowerCase();
        const nameAr = (p.name_ar || "").toLowerCase();
        const barcode = (p.barcode || "").toLowerCase();
        return name.includes(q) || nameAr.includes(q) || barcode.includes(q);
      });
    }
    if (sortField === "stock") {
      list = [...list].sort((a, b) => (sortAsc ? a.stock - b.stock : b.stock - a.stock));
    } else if (sortField === "min") {
      list = [...list].sort((a, b) =>
        sortAsc ? a.min_stock - b.min_stock : b.min_stock - a.min_stock,
      );
    }
    return list;
  }, [lowStock, searchQuery, sortField, sortAsc]);

  const periodLabel = `${range.from} → ${range.to}`;

  function exportSection(
    name: string,
    columns: ExportColumn[],
    rows: Record<string, string | number | null | undefined>[],
  ) {
    if (rows.length === 0) return;
    exportToCSV({
      filename: `report_${name}_${range.from}_${range.to}`,
      title: `${ar ? "تقرير" : "Report"} — ${periodLabel}`,
      columns,
      rows,
      rtl: ar,
    });
  }

  function printSection(section: PrintSection) {
    printReportDocument({
      lang: ar ? "ar" : "en",
      title: ar ? "مركز التقارير" : "Reports Center",
      subtitle: ar ? "تحليلات الأداء، الأكثر مبيعاً، التدفق والمخزون" : "Performance Analytics",
      period: periodLabel,
      generatedAt: new Date().toLocaleString(),
      kpis: [
        { label: ar ? "إجمالي المبيعات" : "Total sales", value: money(salesTotal) },
        { label: ar ? "المحصّل" : "Collected", value: money(salesPaid) },
        { label: ar ? "تكلفة المشتريات" : "Purchase cost", value: money(purchasesTotal) },
        {
          label: ar ? "صافي المقارنة" : "Sales less purchases",
          value: money(netPurchasing),
          tone: netPurchasing >= 0 ? "pos" : "neg",
        },
      ],
      sections: [section],
    });
  }

  const handlePreset = (days: number | "month" | "year") => {
    const to = new Date();
    const from = new Date();
    if (days === "month") {
      from.setDate(1);
    } else if (days === "year") {
      from.setMonth(0, 1);
    } else {
      from.setDate(from.getDate() - days);
    }
    setRange({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    });
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Compact Controls Deck: Sub-navigation, Date Presets, and Filters ─── */}
      <div className="panel-elevated p-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Navigation Selector for Reports */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-surface-2 border border-border/70">
          <button
            type="button"
            onClick={() => {
              setSubSection("top");
              setSortField("default");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              subSection === "top"
                ? "bg-surface text-primary shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            )}
          >
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <span>{ar ? "الأكثر مبيعاً" : "Top selling"}</span>
            <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
              {topProducts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubSection("sales");
              setSortField("default");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              subSection === "sales"
                ? "bg-surface text-primary shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            )}
          >
            <Receipt className="h-3.5 w-3.5 text-blue-500" />
            <span>{ar ? "المبيعات" : "Sales log"}</span>
            <span className="rounded-full bg-blue-500/10 px-1.5 text-[10px] text-blue-500">
              {sales.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubSection("payments");
              setSortField("default");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              subSection === "payments"
                ? "bg-surface text-primary shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            )}
          >
            <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
            <span>{ar ? "طرق الدفع" : "Payment methods"}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubSection("low");
              setSortField("default");
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              subSection === "low"
                ? "bg-surface text-rose-500 shadow-sm font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-surface/50",
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
            <span>{ar ? "مخزون منخفض" : "Low stock"}</span>
            {lowStock.length > 0 && (
              <span className="rounded-full bg-rose-500/10 px-1.5 text-[10px] text-rose-500 font-bold">
                {lowStock.length}
              </span>
            )}
          </button>
        </div>

        {/* Date presets & Pickers */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground bg-surface-2 p-1 rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => handlePreset(7)}
              className="px-2 py-0.5 rounded hover:bg-surface hover:text-foreground transition"
            >
              7 {ar ? "أيام" : "d"}
            </button>
            <button
              type="button"
              onClick={() => handlePreset(30)}
              className="px-2 py-0.5 rounded hover:bg-surface hover:text-foreground transition"
            >
              30 {ar ? "يوم" : "d"}
            </button>
            <button
              type="button"
              onClick={() => handlePreset("month")}
              className="px-2 py-0.5 rounded hover:bg-surface hover:text-foreground transition"
            >
              {ar ? "الشهر" : "Month"}
            </button>
            <button
              type="button"
              onClick={() => handlePreset("year")}
              className="px-2 py-0.5 rounded hover:bg-surface hover:text-foreground transition"
            >
              {ar ? "السنة" : "Year"}
            </button>
          </div>

          <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-xl border border-border/80 text-xs">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="h-7 w-28 border-0 p-0 text-xs bg-transparent focus-visible:ring-0 shadow-none"
            />
            <span className="text-muted-foreground">→</span>
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="h-7 w-28 border-0 p-0 text-xs bg-transparent focus-visible:ring-0 shadow-none"
            />
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 w-8 p-0 rounded-full"
            title={ar ? "تحديث البيانات" : "Refresh"}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 text-muted-foreground", loading && "animate-spin text-primary")} />
          </Button>
        </div>
      </div>

      {/* ─── High-Level KPIs Row ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border/70 bg-surface/80 p-3.5 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">
            {ar ? "إجمالي المبيعات" : "Total sales"}
          </div>
          <div className="mt-1 font-mono text-base sm:text-lg font-bold text-foreground">
            <Ltr>{money(salesTotal)}</Ltr>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {sales.length} {ar ? "فاتورة مسجلة" : "invoices"}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-surface/80 p-3.5 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">
            {ar ? "المحصّل الفعلي" : "Collected cash"}
          </div>
          <div className="mt-1 font-mono text-base sm:text-lg font-bold text-emerald-500">
            <Ltr>{money(salesPaid)}</Ltr>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {ar ? "نقد ومصارف" : "Cash & bank"}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-surface/80 p-3.5 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">
            {ar ? "تكلفة المشتريات" : "Purchases cost"}
          </div>
          <div className="mt-1 font-mono text-base sm:text-lg font-bold text-rose-500">
            <Ltr>{money(purchasesTotal)}</Ltr>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {purchases.length} {ar ? "فاتورة شراء" : "purchase bills"}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-surface/80 p-3.5 shadow-sm">
          <div className="text-xs text-muted-foreground font-medium">
            {ar ? "صافي المقارنة التشغيلية" : "Sales less purchases"}
          </div>
          <div
            className={cn(
              "mt-1 font-mono text-base sm:text-lg font-bold",
              netPurchasing >= 0 ? "text-primary" : "text-amber-500",
            )}
          >
            <Ltr>{money(netPurchasing)}</Ltr>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {netPurchasing >= 0 ? (ar ? "فائض تشغيلي" : "Surplus") : (ar ? "عجز نقدي" : "Deficit")}
          </div>
        </div>
      </div>

      {/* ─── Search & Actions Toolbar inside Tab ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              subSection === "top"
                ? ar ? "ابحث في الأصناف الأكثر مبيعاً... (/)" : "Search top products... (/)"
                : subSection === "sales"
                  ? ar ? "ابحث برقم الفاتورة أو العميل... (/)" : "Search invoice # or customer... (/)"
                  : subSection === "low"
                    ? ar ? "ابحث في أصناف المخزون المنخفض... (/)" : "Search low stock items... (/)"
                    : ar ? "ابحث... (/)" : "Search..."
            }
            className="h-9 ps-9 pe-8 text-xs rounded-xl bg-surface border-border/70"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {subSection === "top" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportSection(
                    "top-products",
                    topProductColumns(ar ? "ar" : "en"),
                    topProductRows(topRowsData),
                  )
                }
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                {ar ? "تصدير CSV" : "Export CSV"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printSection(topProductPrintSection(topRowsData, ar ? "ar" : "en"))}
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Printer className="h-3.5 w-3.5 text-primary" />
                {ar ? "طباعة التقرير" : "Print"}
              </Button>
            </>
          )}

          {subSection === "sales" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportSection(
                    "sales",
                    salesColumns(ar ? "ar" : "en"),
                    salesRows(salesRowsData),
                  )
                }
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                {ar ? "تصدير CSV" : "Export CSV"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printSection(salesPrintSection(salesRowsData, ar ? "ar" : "en"))}
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Printer className="h-3.5 w-3.5 text-primary" />
                {ar ? "طباعة التقرير" : "Print"}
              </Button>
            </>
          )}

          {subSection === "payments" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportSection(
                    "payment-mix",
                    paymentMixColumns(ar ? "ar" : "en"),
                    paymentMixRows(paymentRowsData),
                  )
                }
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                {ar ? "تصدير CSV" : "Export CSV"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printSection(paymentMixPrintSection(paymentRowsData, ar ? "ar" : "en"))}
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Printer className="h-3.5 w-3.5 text-primary" />
                {ar ? "طباعة التقرير" : "Print"}
              </Button>
            </>
          )}

          {subSection === "low" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  exportSection(
                    "low-stock",
                    lowStockColumns(ar ? "ar" : "en"),
                    lowStockRows(lowRowsData),
                  )
                }
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                {ar ? "تصدير CSV" : "Export CSV"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => printSection(lowStockPrintSection(lowRowsData, ar ? "ar" : "en"))}
                className="h-8 gap-1.5 text-xs rounded-xl"
              >
                <Printer className="h-3.5 w-3.5 text-primary" />
                {ar ? "طباعة التقرير" : "Print"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── Active Report Table Display ─── */}
      <div className="panel-elevated p-0 overflow-hidden rounded-2xl border border-border/70">
        {subSection === "top" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold">#</TableHead>
                <TableHead className="font-semibold">{ar ? "المنتج / الصنف" : "Product"}</TableHead>
                <TableHead
                  onClick={() => toggleSort("qty")}
                  className="text-end font-semibold cursor-pointer hover:text-primary transition-colors"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{ar ? "الكمية المباعة" : "Qty sold"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("total")}
                  className="text-end font-semibold cursor-pointer hover:text-primary transition-colors"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{ar ? "إجمالي الإيراد" : "Revenue"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" />
                    <span className="mt-2 block text-xs">{ar ? "جارٍ تحليل المبيعات..." : "Analyzing sales..."}</span>
                  </TableCell>
                </TableRow>
              ) : filteredTopProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground text-xs">
                    {ar ? "لا توجد حركات مبيعات في هذه الفترة" : "No sales data found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTopProducts.map((tp, idx) => (
                  <TableRow key={idx} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-xs text-foreground">
                        {productName(tp.product)}
                      </div>
                      {tp.product?.barcode && (
                        <div className="font-mono text-[10px] text-muted-foreground">
                          {tp.product.barcode}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-end font-mono text-xs font-semibold">
                      <Ltr>{tp.qty.toLocaleString()}</Ltr>
                    </TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold text-primary">
                      <Ltr>{money(tp.total)}</Ltr>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {subSection === "sales" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold">{ar ? "رقم الفاتورة" : "Invoice #"}</TableHead>
                <TableHead
                  onClick={() => toggleSort("date")}
                  className="font-semibold cursor-pointer hover:text-primary transition-colors"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{ar ? "التاريخ والوقت" : "Date & time"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
                <TableHead className="font-semibold">{ar ? "العميل" : "Customer"}</TableHead>
                <TableHead className="font-semibold">{ar ? "الحالة وطريقة الدفع" : "Status & Method"}</TableHead>
                <TableHead
                  onClick={() => toggleSort("total")}
                  className="text-end font-semibold cursor-pointer hover:text-primary transition-colors"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredSales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground text-xs">
                    {ar ? "لا توجد فواتير مبيعات مطابقة" : "No invoices found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredSales.map((s) => (
                  <TableRow key={s.id} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      <Ltr>{s.invoice_number}</Ltr>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <Ltr>{new Date(s.created_at).toLocaleString(ar ? "ar-YE" : "en-GB")}</Ltr>
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {s.customers?.name || (ar ? "عميل نقدي" : "Cash")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={s.status === "paid" ? "default" : "secondary"}
                          className="text-[10px] py-0 px-1.5"
                        >
                          {s.status === "paid" ? (ar ? "مدفوعة" : "Paid") : s.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {s.payment_method || "cash"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold">
                      <Ltr>{money(Number(s.total))}</Ltr>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {subSection === "payments" && (
          <div className="p-5 space-y-4">
            <div className="text-xs text-muted-foreground font-medium">
              {ar
                ? "توزيع المبالغ المحصلة والمبيعات بحسب قنوات وطرق الدفع"
                : "Payment methods collection breakdown"}
            </div>
            {paymentRowsData.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                {ar ? "لا توجد مبالغ مسددة في هذه الفترة" : "No payment data"}
              </div>
            ) : (
              paymentRowsData.map((row) => (
                <div key={row.method} className="space-y-1.5 p-3 rounded-xl bg-surface-2/40 border border-border/50">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-3.5 w-3.5 text-primary" />
                      <span className="font-semibold text-foreground uppercase">
                        {row.method}
                      </span>
                    </div>
                    <div className="font-mono font-bold text-foreground">
                      <Ltr>
                        {money(row.amount)}{" "}
                        <span className="text-[11px] font-normal text-muted-foreground">
                          ({row.pct.toFixed(1)}%)
                        </span>
                      </Ltr>
                    </div>
                  </div>
                  <div className="h-2.5 w-full bg-surface-3 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {subSection === "low" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold">{ar ? "المنتج / الصنف" : "Product"}</TableHead>
                <TableHead
                  onClick={() => toggleSort("stock")}
                  className="text-end font-semibold cursor-pointer hover:text-rose-500 transition-colors"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{ar ? "الكمية الحالية المتوفرة" : "On hand"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => toggleSort("min")}
                  className="text-end font-semibold cursor-pointer hover:text-primary transition-colors"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>{ar ? "حد الطلب الأدنى" : "Min threshold"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
                <TableHead className="text-end font-semibold">
                  {ar ? "سعر البيع" : "Sale price"}
                </TableHead>
                <TableHead className="text-center font-semibold">{ar ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : filteredLowStock.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-emerald-500 text-xs font-medium">
                    ✓ {ar ? "كل المنتجات المتتبعة أعلى من الحد الأدنى للمخزون" : "All tracked products are above minimum"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLowStock.map((p) => {
                  const isDepleted = p.stock <= 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-surface-2/50 transition-colors">
                      <TableCell>
                        <div className="font-semibold text-xs text-foreground">
                          {productName(p)}
                        </div>
                        {p.barcode && (
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {p.barcode}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                        <Ltr>{p.stock.toLocaleString()}</Ltr>
                      </TableCell>
                      <TableCell className="text-end font-mono text-xs text-muted-foreground">
                        <Ltr>{p.min_stock ?? 0}</Ltr>
                      </TableCell>
                      <TableCell className="text-end font-mono text-xs">
                        <Ltr>{money(Number(p.sale_price ?? 0))}</Ltr>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="destructive"
                          className={cn(
                            "text-[10px] py-0 px-2 font-medium",
                            isDepleted ? "bg-rose-600" : "bg-amber-600",
                          )}
                        >
                          {isDepleted
                            ? ar ? "نفد المخزون" : "Out of stock"
                            : ar ? "تحت الحد الأدنى" : "Low stock"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
