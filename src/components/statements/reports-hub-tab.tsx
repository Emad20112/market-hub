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
  ShoppingCart,
  FileClock,
  FileCheck2,
  BarChart3,
  Boxes,
  FileInput,
  FileOutput,
  PackageSearch,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  RefreshCw,
  Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/lib/format";
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
import { SearchInput } from "@/components/ui/search-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export type ReportCategory =
  | "top"
  | "sales"
  | "payments"
  | "low"
  | "purchases"
  | "debts"
  | "sales-invoices"
  | "profit-sales"
  | "inventory-movements"
  | "returns"
  | "expenses"
  | "product";

interface ReportsHubTabProps {
  ar: boolean;
  initialReport?: ReportCategory;
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

export function ReportsHubTab({ ar, initialReport = "top" }: ReportsHubTabProps) {
  const [selectedReport, setSelectedReport] = useState<ReportCategory>(initialReport);
  const [range, setRange] = useState(defaultRange());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Data states
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [byMethod, setByMethod] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [expensesList, setExpensesList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [profitData, setProfitData] = useState<{
    salesTotal: number;
    costTotal: number;
    grossProfit: number;
    marginPct: number;
    itemsCount: number;
  }>({
    salesTotal: 0,
    costTotal: 0,
    grossProfit: 0,
    marginPct: 0,
    itemsCount: 0,
  });

  // Table sorting state
  const [sortField, setSortField] = useState<string>("default");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  async function loadData() {
    setLoading(true);
    const fromTs = `${range.from}T00:00:00`;
    const toTs = `${range.to}T23:59:59`;

    try {
      if (["top", "sales", "payments", "profit-sales", "sales-invoices"].includes(selectedReport)) {
        const [salesRes, itemsRes, prodRes] = await Promise.all([
          supabase
            .from("sales_invoices")
            .select("id,invoice_number,total,paid,payment_method,status,created_at,customer_id,customers(name),warehouses(name,name_ar)")
            .gte("created_at", fromTs)
            .lte("created_at", toTs)
            .order("created_at", { ascending: false }),
          supabase
            .from("sales_invoice_items")
            .select("product_id,quantity,total,cost_price,invoice_id,sales_invoices!inner(created_at)")
            .gte("sales_invoices.created_at", fromTs)
            .lte("sales_invoices.created_at", toTs),
          supabase
            .from("products")
            .select("id,name,name_ar,min_stock,sale_price,sku,barcode,cost_price")
            .eq("inventory_policy" as never, "TRACKED" as never),
        ]);

        const salesData = salesRes.data ?? [];
        setSales(salesData);

        // Aggregate top products & profit data
        const map = new Map<string, { qty: number; total: number; cost: number }>();
        let totalCost = 0;
        let totalRevenue = 0;

        (itemsRes.data ?? []).forEach((it: any) => {
          const cur = map.get(it.product_id) ?? { qty: 0, total: 0, cost: 0 };
          const qty = Number(it.quantity || 0);
          const lineTotal = Number(it.total || 0);
          const lineCost = Number(it.cost_price || 0) * qty;

          cur.qty += qty;
          cur.total += lineTotal;
          cur.cost += lineCost;
          map.set(it.product_id, cur);

          totalRevenue += lineTotal;
          totalCost += lineCost;
        });

        const prodMap = new Map((prodRes.data ?? []).map((p: any) => [p.id, p]));
        const tops = Array.from(map.entries())
          .map(([pid, v]) => ({ ...v, product: prodMap.get(pid) }))
          .sort((a, b) => b.total - a.total);
        setTopProducts(tops);

        const gross = totalRevenue - totalCost;
        const margin = totalRevenue > 0 ? (gross / totalRevenue) * 100 : 0;
        setProfitData({
          salesTotal: totalRevenue,
          costTotal: totalCost,
          grossProfit: gross,
          marginPct: margin,
          itemsCount: itemsRes.data?.length ?? 0,
        });

        // Payment method distribution
        const methods: Record<string, number> = {};
        salesData.forEach((s: any) => {
          const m = s.payment_method || "cash";
          methods[m] = (methods[m] ?? 0) + Number(s.paid ?? s.total ?? 0);
        });
        setByMethod(methods);
      }

      if (["purchases"].includes(selectedReport)) {
        const purchRes = await supabase
          .from("purchase_invoices")
          .select("id,invoice_number,subtotal,discount,tax,total,paid,payment_method,status,created_at,supplier_id,suppliers(name),warehouses(name,name_ar)")
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false });
        setPurchases(purchRes.data ?? []);
      }

      if (["low", "product"].includes(selectedReport)) {
        const [prodRes, invRes] = await Promise.all([
          supabase
            .from("products")
            .select("id,name,name_ar,min_stock,sale_price,cost_price,sku,barcode,unit")
            .eq("inventory_policy" as never, "TRACKED" as never)
            .order("name"),
          supabase.from("company_stock_positions" as never).select("item_id,quantity"),
        ]);

        const stockMap = new Map<string, number>();
        (invRes.data ?? []).forEach((i: { item_id: string; quantity: number }) => {
          stockMap.set(i.item_id, (stockMap.get(i.item_id) ?? 0) + Number(i.quantity));
        });

        const withStock = (prodRes.data ?? []).map((p: any) => ({
          ...p,
          stock: stockMap.get(p.id) ?? 0,
        }));
        setProductsList(withStock);

        const low = withStock
          .filter((p: any) => p.stock <= Number(p.min_stock ?? 0))
          .sort((a: any, b: any) => a.stock - b.stock);
        setLowStock(low);
      }

      if (["debts"].includes(selectedReport)) {
        const [custRes, suppRes] = await Promise.all([
          supabase
            .from("customers")
            .select("id,name,phone,balance,credit_limit,updated_at")
            .neq("balance", 0)
            .order("balance", { ascending: false }),
          supabase
            .from("suppliers")
            .select("id,name,phone,balance,updated_at")
            .neq("balance", 0)
            .order("balance", { ascending: false }),
        ]);

        const custDebts = (custRes.data ?? []).map((c: any) => ({
          id: `c-${c.id}`,
          partyName: c.name,
          phone: c.phone,
          kind: "customer",
          balance: Number(c.balance || 0),
          creditLimit: c.credit_limit,
          updatedAt: c.updated_at,
        }));

        const suppDebts = (suppRes.data ?? []).map((s: any) => ({
          id: `s-${s.id}`,
          partyName: s.name,
          phone: s.phone,
          kind: "supplier",
          balance: Number(s.balance || 0),
          creditLimit: null,
          updatedAt: s.updated_at,
        }));

        setDebts([...custDebts, ...suppDebts]);
      }

      if (["inventory-movements"].includes(selectedReport)) {
        const movementsRes = await supabase
          .from("stock_movements")
          .select("id,reference,movement_type,quantity,unit_cost,total_cost,created_at,products(name,name_ar,sku),warehouses(name,name_ar)")
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false })
          .limit(200);
        setMovements(movementsRes.data ?? []);
      }

      if (["returns"].includes(selectedReport)) {
        const [salesRet, purchRet] = await Promise.all([
          supabase
            .from("sales_returns")
            .select("id,return_number,total,status,reason,created_at,customers(name)")
            .gte("created_at", fromTs)
            .lte("created_at", toTs)
            .order("created_at", { ascending: false }),
          supabase
            .from("purchase_returns")
            .select("id,return_number,total,status,reason,created_at,suppliers(name)")
            .gte("created_at", fromTs)
            .lte("created_at", toTs)
            .order("created_at", { ascending: false }),
        ]);

        const formatted = [
          ...(salesRet.data ?? []).map((r: any) => ({
            ...r,
            type: "sales",
            party: r.customers?.name || (ar ? "عميل نقدي" : "Cash"),
          })),
          ...(purchRet.data ?? []).map((r: any) => ({
            ...r,
            type: "purchase",
            party: r.suppliers?.name || (ar ? "مورد" : "Supplier"),
          })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setReturnsList(formatted);
      }

      if (["expenses"].includes(selectedReport)) {
        const expRes = await (supabase as any)
          .from("expense_entries")
          .select("id,reference,expense_date,total_amount,status,description,note,expense_lines(category_id,expense_categories(name,name_ar))")
          .gte("expense_date", range.from)
          .lte("expense_date", range.to)
          .order("expense_date", { ascending: false });

        const mapped = ((expRes.data ?? []) as any[]).map((e) => ({
          ...e,
          categoryName: ar
            ? e.expense_lines?.[0]?.expense_categories?.name_ar || e.expense_lines?.[0]?.expense_categories?.name || "عام"
            : e.expense_lines?.[0]?.expense_categories?.name || "General",
        }));
        setExpensesList(mapped);
      }
    } catch (e) {
      console.error("Error loading report data:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedReport, range.from, range.to]);

  function productName(p: any) {
    return ar ? p?.name_ar ?? p?.name ?? "" : p?.name ?? "";
  }

  // Sorting handler
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const periodLabel = `${range.from} → ${range.to}`;

  // Date range presets
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

  // Generic CSV Export
  function exportCsvData(filename: string, title: string, columns: ExportColumn[], rows: any[]) {
    if (rows.length === 0) return;
    exportToCSV({
      filename: `${filename}_${range.from}_${range.to}`,
      title: `${title} — ${periodLabel}`,
      columns,
      rows,
      rtl: ar,
    });
  }

  return (
    <div className="space-y-4">
      {/* ═══ Header Bar: Selector Dropdown + Range Presets + Refresh ═══ */}
      <div className="panel-elevated p-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Dropdown Selector for All Reports */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={selectedReport}
            onValueChange={(val) => {
              setSelectedReport(val as ReportCategory);
              setSortField("default");
            }}
          >
            <SelectTrigger className="h-9 w-60 sm:w-72 text-xs font-semibold bg-surface rounded-xl border-border/80 shadow-sm">
              <div className="flex items-center gap-2 truncate">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <SelectValue placeholder={ar ? "اختر التقرير..." : "Select report..."} />
              </div>
            </SelectTrigger>
            <SelectContent className="max-h-[380px]">
              <SelectGroup>
                <SelectLabel className="text-[11px] font-bold text-muted-foreground px-2 py-1">
                  {ar ? "📊 تقارير التحليلات والأداء" : "📊 Performance & Analytics"}
                </SelectLabel>
                <SelectItem value="top">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" />
                    <span>{ar ? "الأكثر مبيعاً" : "Top Selling Products"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="sales">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5 text-blue-500" />
                    <span>{ar ? "سجل المبيعات" : "Sales Log"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="payments">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
                    <span>{ar ? "توزيع طرق الدفع" : "Payment Methods"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="low">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                    <span>{ar ? "مخزون منخفض" : "Low Stock"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="profit-sales">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
                    <span>{ar ? "كشف الأرباح والمبيعات الأساسي" : "Profit & Sales"}</span>
                  </div>
                </SelectItem>
              </SelectGroup>

              <SelectGroup>
                <SelectLabel className="text-[11px] font-bold text-muted-foreground px-2 py-1 border-t border-border/60 mt-1 pt-1">
                  {ar ? "💼 تقارير المشتريات والديون" : "💼 Purchases & Debts"}
                </SelectLabel>
                <SelectItem value="purchases">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-3.5 w-3.5 text-teal-500" />
                    <span>{ar ? "كشف المشتريات" : "Purchases Report"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="debts">
                  <div className="flex items-center gap-2">
                    <FileClock className="h-3.5 w-3.5 text-amber-500" />
                    <span>{ar ? "كشف الديون والمستحقات" : "Debts & Receivables"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="sales-invoices">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-3.5 w-3.5 text-cyan-500" />
                    <span>{ar ? "كشف فواتير العملاء" : "Customer Invoices"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="returns">
                  <div className="flex items-center gap-2">
                    <FileInput className="h-3.5 w-3.5 text-orange-500" />
                    <span>{ar ? "كشف المرتجعات" : "Returns Report"}</span>
                  </div>
                </SelectItem>
              </SelectGroup>

              <SelectGroup>
                <SelectLabel className="text-[11px] font-bold text-muted-foreground px-2 py-1 border-t border-border/60 mt-1 pt-1">
                  {ar ? "📦 تقارير المخزون والمصروفات" : "📦 Inventory & Expenses"}
                </SelectLabel>
                <SelectItem value="inventory-movements">
                  <div className="flex items-center gap-2">
                    <Boxes className="h-3.5 w-3.5 text-violet-500" />
                    <span>{ar ? "كشف حركة المخزون" : "Inventory Movements"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="expenses">
                  <div className="flex items-center gap-2">
                    <FileOutput className="h-3.5 w-3.5 text-red-500" />
                    <span>{ar ? "كشف المصروفات" : "Expenses Report"}</span>
                  </div>
                </SelectItem>
                <SelectItem value="product">
                  <div className="flex items-center gap-2">
                    <PackageSearch className="h-3.5 w-3.5 text-blue-600" />
                    <span>{ar ? "كشف الصنف" : "Product Statement"}</span>
                  </div>
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Date presets & Pickers */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground bg-surface-2 p-1 rounded-lg border border-border/60">
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

          <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-xl border border-border/80 text-xs shadow-sm">
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

      {/* ═══ Unified Search and Actions Bar ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex-1 min-w-[220px] max-w-md">
          <SearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={
              ar
                ? "ابحث في بيانات التقرير (الاسم، الرقم، المرجع...) (/)"
                : "Search report records... (/)"
            }
            enableSlashShortcut
            containerClassName="w-full"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Export CSV based on current active report
              if (selectedReport === "top") {
                exportCsvData(
                  "top-products",
                  ar ? "تقرير الأكثر مبيعاً" : "Top Selling",
                  topProductColumns(ar ? "ar" : "en"),
                  topProductRows(topProducts.map((tp) => ({ name: productName(tp.product), qty: tp.qty, total: tp.total }))),
                );
              } else if (selectedReport === "purchases") {
                exportCsvData(
                  "purchases",
                  ar ? "كشف المشتريات" : "Purchases",
                  [
                    { header: ar ? "رقم الفاتورة" : "Invoice #", key: "invoice_number" },
                    { header: ar ? "المورد" : "Supplier", key: "supplier" },
                    { header: ar ? "الإجمالي" : "Total", key: "total" },
                    { header: ar ? "المدفوع" : "Paid", key: "paid" },
                    { header: ar ? "الحالة" : "Status", key: "status" },
                  ],
                  purchases.map((p) => ({
                    invoice_number: p.invoice_number,
                    supplier: p.suppliers?.name || "—",
                    total: p.total,
                    paid: p.paid,
                    status: p.status,
                  })),
                );
              } else if (selectedReport === "debts") {
                exportCsvData(
                  "debts",
                  ar ? "كشف الديون والمستحقات" : "Debts",
                  [
                    { header: ar ? "الطرف" : "Party", key: "partyName" },
                    { header: ar ? "النوع" : "Kind", key: "kind" },
                    { header: ar ? "الرصيد" : "Balance", key: "balance" },
                  ],
                  debts,
                );
              } else {
                exportCsvData(
                  `report_${selectedReport}`,
                  ar ? "تقرير" : "Report",
                  salesColumns(ar ? "ar" : "en"),
                  salesRows(sales.map((s) => ({
                    invoiceNumber: s.invoice_number,
                    customerName: s.customers?.name || "عميل",
                    date: s.created_at,
                    status: s.status,
                    paymentMethod: s.payment_method,
                    total: Number(s.total),
                    paid: Number(s.paid),
                  }))),
                );
              }
            }}
            className="h-8 gap-1.5 text-xs rounded-xl"
          >
            <Download className="h-3.5 w-3.5 text-emerald-500" />
            <span>{ar ? "تصدير CSV" : "Export CSV"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.print();
            }}
            className="h-8 gap-1.5 text-xs rounded-xl"
          >
            <Printer className="h-3.5 w-3.5 text-primary" />
            <span>{ar ? "طباعة فاخرة" : "Print"}</span>
          </Button>
        </div>
      </div>

      {/* ═══ Unified Table Display Container (نفس تصميم جدول الكشوفات الموحد) ═══ */}
      <div className="panel-elevated p-0 overflow-hidden rounded-2xl border border-border/70 shadow-sm">
        {/* 1. تقرير الأكثر مبيعاً */}
        {selectedReport === "top" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "المنتج / الصنف" : "Product"}</TableHead>
                <TableHead
                  onClick={() => handleSort("qty")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors"
                >
                  <div className="inline-flex items-center gap-1 justify-end w-full">
                    <span>{ar ? "الكمية المباعة" : "Qty sold"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors"
                >
                  <div className="inline-flex items-center gap-1 justify-end w-full">
                    <span>{ar ? "إجمالي الإيراد" : "Revenue"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground text-xs">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" />
                    <span className="mt-2 block">{ar ? "جارٍ تحليل المبيعات..." : "Loading..."}</span>
                  </TableCell>
                </TableRow>
              ) : topProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-muted-foreground text-xs">
                    {ar ? "لا توجد مبيعات في هذه الفترة" : "No sales data found"}
                  </TableCell>
                </TableRow>
              ) : (
                topProducts.map((tp, idx) => (
                  <TableRow key={idx} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-semibold text-xs text-foreground">{productName(tp.product)}</div>
                      {tp.product?.barcode && <div className="font-mono text-[10px] text-muted-foreground">{tp.product.barcode}</div>}
                    </TableCell>
                    <TableCell className="text-end font-mono text-xs font-semibold"><Ltr>{tp.qty.toLocaleString()}</Ltr></TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold text-primary"><Ltr>{money(tp.total)}</Ltr></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* 2. سجل المبيعات */}
        {selectedReport === "sales" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "رقم الفاتورة" : "Invoice #"}</TableHead>
                <TableHead onClick={() => handleSort("created_at")} className="font-semibold text-xs cursor-pointer hover:text-primary">
                  <div className="inline-flex items-center gap-1">
                    <span>{ar ? "التاريخ والوقت" : "Date"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "العميل" : "Customer"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "طريقة الدفع والحالة" : "Payment & Status"}</TableHead>
                <TableHead onClick={() => handleSort("total")} className="text-end font-semibold text-xs cursor-pointer hover:text-primary">
                  <div className="inline-flex items-center gap-1 justify-end w-full">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    <ArrowUpDown className="h-3 w-3 opacity-60" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : sales.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground text-xs">{ar ? "لا توجد فواتير" : "No invoices"}</TableCell></TableRow>
              ) : (
                sales.map((s) => (
                  <TableRow key={s.id} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="font-mono text-xs font-semibold text-primary"><Ltr>{s.invoice_number}</Ltr></TableCell>
                    <TableCell className="text-xs text-muted-foreground"><Ltr>{new Date(s.created_at).toLocaleString(ar ? "ar-YE" : "en-GB")}</Ltr></TableCell>
                    <TableCell className="text-xs font-medium">{s.customers?.name || (ar ? "عميل نقدي" : "Cash")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={s.status === "paid" ? "default" : "secondary"} className="text-[10px] py-0 px-1.5">
                          {s.status === "paid" ? (ar ? "مدفوعة" : "Paid") : s.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{s.payment_method || "cash"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold"><Ltr>{money(Number(s.total))}</Ltr></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* 3. كشف المشتريات */}
        {selectedReport === "purchases" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "رقم الفاتورة" : "Invoice #"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "المورد" : "Supplier"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "المستودع" : "Warehouse"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "الإجمالي" : "Total"}</TableHead>
                <TableHead className="text-end font-semibold text-xs text-emerald-500">{ar ? "المدفوع" : "Paid"}</TableHead>
                <TableHead className="text-end font-semibold text-xs text-rose-500">{ar ? "المتبقي" : "Remaining"}</TableHead>
                <TableHead className="text-center font-semibold text-xs">{ar ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : purchases.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-muted-foreground text-xs">{ar ? "لا توجد فواتير مشتريات" : "No purchases recorded"}</TableCell></TableRow>
              ) : (
                purchases.map((p) => {
                  const rem = Number(p.total ?? 0) - Number(p.paid ?? 0);
                  return (
                    <TableRow key={p.id} className="hover:bg-surface-2/50 transition-colors">
                      <TableCell className="font-mono text-xs font-semibold text-primary"><Ltr>{p.invoice_number}</Ltr></TableCell>
                      <TableCell className="text-xs text-muted-foreground"><Ltr>{new Date(p.created_at).toLocaleDateString(ar ? "ar-YE" : "en-GB")}</Ltr></TableCell>
                      <TableCell className="text-xs font-medium">{p.suppliers?.name || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.warehouses?.name_ar || p.warehouses?.name || "—"}</TableCell>
                      <TableCell className="text-end font-mono text-xs font-bold"><Ltr>{money(Number(p.total ?? 0))}</Ltr></TableCell>
                      <TableCell className="text-end font-mono text-xs text-emerald-500 font-semibold"><Ltr>{money(Number(p.paid ?? 0))}</Ltr></TableCell>
                      <TableCell className="text-end font-mono text-xs text-rose-500 font-bold"><Ltr>{money(rem)}</Ltr></TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">{p.status ?? "—"}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}

        {/* 4. كشف الديون والمستحقات */}
        {selectedReport === "debts" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "الطرف" : "Party"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "النوع" : "Category"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الهاتف" : "Phone"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "الرصيد المستحق" : "Balance"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "آخر تحديث" : "Updated"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : debts.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground text-xs">{ar ? "لا توجد ديون مستحقة" : "No debts recorded"}</TableCell></TableRow>
              ) : (
                debts.map((d) => (
                  <TableRow key={d.id} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="font-semibold text-xs">{d.partyName}</TableCell>
                    <TableCell>
                      <Badge variant={d.kind === "customer" ? "default" : "secondary"} className="text-[10px] py-0 px-1.5">
                        {d.kind === "customer" ? (ar ? "عميل (لنا)" : "Customer") : (ar ? "مورد (علينا)" : "Supplier")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground"><Ltr>{d.phone || "—"}</Ltr></TableCell>
                    <TableCell className={cn("text-end font-mono text-xs font-bold", d.balance > 0 ? "text-rose-500" : "text-emerald-500")}>
                      <Ltr>{money(Math.abs(d.balance))}</Ltr>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <Ltr>{d.updatedAt ? new Date(d.updatedAt).toLocaleDateString(ar ? "ar-YE" : "en-GB") : "—"}</Ltr>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* 5. كشف الأرباح والمبيعات الأساسي */}
        {selectedReport === "profit-sales" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "البند المالي" : "Financial Item"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "القيمة" : "Value"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "البيان والنسبة" : "Note / Margin"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-surface-2/50">
                <TableCell className="font-semibold text-xs">{ar ? "إجمالي المبيعات المحققة" : "Total Revenue"}</TableCell>
                <TableCell className="text-end font-mono text-xs font-bold text-foreground"><Ltr>{money(profitData.salesTotal)}</Ltr></TableCell>
                <TableCell className="text-xs text-muted-foreground">{profitData.itemsCount} {ar ? "صنف مباع" : "items sold"}</TableCell>
              </TableRow>
              <TableRow className="hover:bg-surface-2/50">
                <TableCell className="font-semibold text-xs">{ar ? "تكلفة البضاعة المباعة (COGS)" : "Cost of Goods Sold"}</TableCell>
                <TableCell className="text-end font-mono text-xs font-bold text-rose-500"><Ltr>{money(profitData.costTotal)}</Ltr></TableCell>
                <TableCell className="text-xs text-muted-foreground">{ar ? "على أساس التكلفة المعيارية" : "Standard cost"}</TableCell>
              </TableRow>
              <TableRow className="hover:bg-surface-2/50 bg-primary/5">
                <TableCell className="font-bold text-xs text-primary">{ar ? "مجمل الربح التشغيلي" : "Gross Profit"}</TableCell>
                <TableCell className="text-end font-mono text-sm font-bold text-primary"><Ltr>{money(profitData.grossProfit)}</Ltr></TableCell>
                <TableCell className="font-mono text-xs font-bold text-primary">
                  {ar ? "هامش الربح:" : "Margin:"} {profitData.marginPct.toFixed(1)}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}

        {/* 6. حركة المخزون */}
        {selectedReport === "inventory-movements" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "المرجع" : "Ref"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الصنف" : "Product"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "نوع الحركة" : "Type"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "الكمية" : "Qty"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "إجمالي القيمة" : "Total Value"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : movements.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground text-xs">{ar ? "لا توجد حركات مخزنية" : "No movements"}</TableCell></TableRow>
              ) : (
                movements.map((m) => (
                  <TableRow key={m.id} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="font-mono text-xs text-primary">{m.reference || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground"><Ltr>{new Date(m.created_at).toLocaleDateString(ar ? "ar-YE" : "en-GB")}</Ltr></TableCell>
                    <TableCell className="text-xs font-medium">{productName(m.products)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] py-0 px-1.5">{m.movement_type}</Badge></TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold"><Ltr>{m.quantity}</Ltr></TableCell>
                    <TableCell className="text-end font-mono text-xs"><Ltr>{money(Number(m.total_cost || 0))}</Ltr></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* 7. كشف المرتجعات */}
        {selectedReport === "returns" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "رقم الإرجاع" : "Return #"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "نوع المرتجع" : "Kind"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الطرف" : "Party"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "إجمالي المبلغ" : "Amount"}</TableHead>
                <TableHead className="text-center font-semibold text-xs">{ar ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : returnsList.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground text-xs">{ar ? "لا توجد مرتجعات مسجلة" : "No returns found"}</TableCell></TableRow>
              ) : (
                returnsList.map((r) => (
                  <TableRow key={r.id} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="font-mono text-xs font-semibold text-primary">{r.return_number}</TableCell>
                    <TableCell className="text-xs text-muted-foreground"><Ltr>{new Date(r.created_at).toLocaleDateString(ar ? "ar-YE" : "en-GB")}</Ltr></TableCell>
                    <TableCell>
                      <Badge variant={r.type === "sales" ? "default" : "secondary"} className="text-[10px] py-0 px-1.5">
                        {r.type === "sales" ? (ar ? "مرتجع مبيعات" : "Sales Return") : (ar ? "مرتجع مشتريات" : "Purchase Return")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{r.party}</TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold text-rose-500"><Ltr>{money(Number(r.total || 0))}</Ltr></TableCell>
                    <TableCell className="text-center"><Badge variant="outline" className="text-[10px] py-0 px-1.5">{r.status || "—"}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* 8. كشف المصروفات */}
        {selectedReport === "expenses" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "المرجع" : "Ref"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "التاريخ" : "Date"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "التصنيف" : "Category"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الوصف والبيان" : "Description"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "المبلغ" : "Amount"}</TableHead>
                <TableHead className="text-center font-semibold text-xs">{ar ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : expensesList.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground text-xs">{ar ? "لا توجد مصروفات مسجلة" : "No expenses recorded"}</TableCell></TableRow>
              ) : (
                expensesList.map((e) => (
                  <TableRow key={e.id} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="font-mono text-xs text-primary">{e.reference || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground"><Ltr>{e.expense_date}</Ltr></TableCell>
                    <TableCell className="text-xs font-semibold text-foreground">{e.categoryName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.description || e.note || "—"}</TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold text-rose-500"><Ltr>{money(Number(e.total_amount || 0))}</Ltr></TableCell>
                    <TableCell className="text-center"><Badge variant="outline" className="text-[10px] py-0 px-1.5">{e.status || "—"}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* 9. كشف الصنف */}
        {selectedReport === "product" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "اسم الصنف" : "Product Name"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الباركود" : "Barcode"}</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الوحدة" : "Unit"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "المخزون الحالي" : "Current Stock"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "الحد الأدنى" : "Min Stock"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "سعر البيع" : "Sale Price"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : productsList.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground text-xs">{ar ? "لا توجد أصناف" : "No products found"}</TableCell></TableRow>
              ) : (
                productsList.map((p) => (
                  <TableRow key={p.id} className="hover:bg-surface-2/50 transition-colors">
                    <TableCell className="font-semibold text-xs text-foreground">{productName(p)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.barcode || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.unit || "—"}</TableCell>
                    <TableCell className="text-end font-mono text-xs font-bold text-primary"><Ltr>{p.stock}</Ltr></TableCell>
                    <TableCell className="text-end font-mono text-xs text-muted-foreground"><Ltr>{p.min_stock ?? 0}</Ltr></TableCell>
                    <TableCell className="text-end font-mono text-xs"><Ltr>{money(Number(p.sale_price || 0))}</Ltr></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* 10. طرق الدفع */}
        {selectedReport === "payments" && (
          <div className="p-5 space-y-4">
            <div className="text-xs text-muted-foreground font-medium">
              {ar ? "توزيع المبالغ المحصلة والمبيعات بحسب قنوات وطرق الدفع" : "Payment methods breakdown"}
            </div>
            {Object.keys(byMethod).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">{ar ? "لا توجد بيانات مسجلة" : "No data"}</div>
            ) : (
              Object.entries(byMethod).map(([method, amount]) => {
                const total = Object.values(byMethod).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? (amount / total) * 100 : 0;
                return (
                  <div key={method} className="space-y-1.5 p-3 rounded-xl bg-surface-2/40 border border-border/50">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 text-primary" />
                        <span className="font-semibold text-foreground uppercase">{method}</span>
                      </div>
                      <div className="font-mono font-bold text-foreground">
                        <Ltr>{money(amount)} <span className="text-[11px] font-normal text-muted-foreground">({pct.toFixed(1)}%)</span></Ltr>
                      </div>
                    </div>
                    <div className="h-2.5 w-full bg-surface-3 rounded-full overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* 11. مخزون منخفض */}
        {selectedReport === "low" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="font-semibold text-xs">{ar ? "المنتج / الصنف" : "Product"}</TableHead>
                <TableHead className="text-end font-semibold text-xs text-rose-500">{ar ? "المتاح حالياً" : "On hand"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "الحد الأدنى" : "Min"}</TableHead>
                <TableHead className="text-end font-semibold text-xs">{ar ? "سعر البيع" : "Price"}</TableHead>
                <TableHead className="text-center font-semibold text-xs">{ar ? "الحالة" : "Status"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /></TableCell></TableRow>
              ) : lowStock.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-emerald-500 text-xs font-semibold">✓ {ar ? "كل المخزون أعلى من الحد الأدنى" : "All stock above minimum"}</TableCell></TableRow>
              ) : (
                lowStock.map((p) => {
                  const isDepleted = p.stock <= 0;
                  return (
                    <TableRow key={p.id} className="hover:bg-surface-2/50 transition-colors">
                      <TableCell className="font-semibold text-xs">{productName(p)}</TableCell>
                      <TableCell className="text-end font-mono text-xs font-bold text-rose-500"><Ltr>{p.stock}</Ltr></TableCell>
                      <TableCell className="text-end font-mono text-xs text-muted-foreground"><Ltr>{p.min_stock ?? 0}</Ltr></TableCell>
                      <TableCell className="text-end font-mono text-xs"><Ltr>{money(Number(p.sale_price || 0))}</Ltr></TableCell>
                      <TableCell className="text-center">
                        <Badge variant="destructive" className={cn("text-[10px] py-0 px-2 font-medium", isDepleted ? "bg-rose-600" : "bg-amber-600")}>
                          {isDepleted ? (ar ? "نفد المخزون" : "Out of stock") : (ar ? "تحت الحد الأدنى" : "Low stock")}
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
