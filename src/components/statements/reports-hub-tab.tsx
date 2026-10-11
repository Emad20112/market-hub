import { useEffect, useState, useMemo } from "react";
import {
  Download,
  Calendar,
  Printer,
  TrendingUp,
  Receipt,
  CreditCard,
  AlertTriangle,
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
  FileText,
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
  TableFooter,
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

  // Raw fetched datasets
  const [rawTopProducts, setRawTopProducts] = useState<any[]>([]);
  const [rawSales, setRawSales] = useState<any[]>([]);
  const [rawPurchases, setRawPurchases] = useState<any[]>([]);
  const [rawDebts, setRawDebts] = useState<any[]>([]);
  const [rawMovements, setRawMovements] = useState<any[]>([]);
  const [rawReturnsList, setRawReturnsList] = useState<any[]>([]);
  const [rawExpensesList, setRawExpensesList] = useState<any[]>([]);
  const [rawProductsList, setRawProductsList] = useState<any[]>([]);
  const [profitSummary, setProfitSummary] = useState({
    salesTotal: 0,
    costTotal: 0,
    grossProfit: 0,
    marginPct: 0,
    invoicesCount: 0,
    itemsCount: 0,
  });

  // Table sorting state
  const [sortField, setSortField] = useState<string>("default");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function productName(p: any) {
    return ar ? (p?.name_ar ?? p?.name ?? "") : (p?.name ?? "");
  }

  // Generic sort toggle
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Sort indicator helper
  const renderSortIndicator = (field: string) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-3 w-3 opacity-40 shrink-0" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary shrink-0" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary shrink-0" />
    );
  };

  async function loadData() {
    setLoading(true);
    const fromTs = `${range.from}T00:00:00`;
    const toTs = `${range.to}T23:59:59`;

    try {
      if (["top", "sales", "payments", "profit-sales", "sales-invoices"].includes(selectedReport)) {
        const [salesRes, itemsRes, prodRes] = await Promise.all([
          supabase
            .from("sales_invoices")
            .select(
              "id,invoice_number,total,paid,payment_method,status,created_at,customer_id,customers(name),warehouses(name,name_ar)",
            )
            .gte("created_at", fromTs)
            .lte("created_at", toTs)
            .order("created_at", { ascending: false }),
          supabase
            .from("sales_invoice_items")
            .select(
              "product_id,quantity,total,cost_price,invoice_id,sales_invoices!inner(created_at)",
            )
            .gte("sales_invoices.created_at", fromTs)
            .lte("sales_invoices.created_at", toTs),
          supabase
            .from("products")
            .select("id,name,name_ar,min_stock,sale_price,sku,barcode,cost_price")
            .eq("inventory_policy" as never, "TRACKED" as never),
        ]);

        const salesData = salesRes.data ?? [];
        setRawSales(salesData);

        // Aggregate top products & profit data
        const itemMap = new Map<string, { qty: number; total: number; cost: number }>();
        let totalCost = 0;
        let totalRev = 0;
        let totalItemsSold = 0;

        (itemsRes.data ?? []).forEach((item: any) => {
          const prev = itemMap.get(item.product_id) || { qty: 0, total: 0, cost: 0 };
          const qty = Number(item.quantity || 0);
          const lineTotal = Number(item.total || 0);
          const lineCost = Number(item.cost_price || 0) * qty;

          totalCost += lineCost;
          totalRev += lineTotal;
          totalItemsSold += qty;

          itemMap.set(item.product_id, {
            qty: prev.qty + qty,
            total: prev.total + lineTotal,
            cost: prev.cost + lineCost,
          });
        });

        const prodMap = new Map<string, any>();
        (prodRes.data ?? []).forEach((p: any) => prodMap.set(p.id, p));

        const ranked = Array.from(itemMap.entries())
          .map(([pid, stats]) => ({
            product: prodMap.get(pid) || { name: pid },
            qty: stats.qty,
            total: stats.total,
            cost: stats.cost,
            profit: stats.total - stats.cost,
          }))
          .sort((a, b) => b.qty - a.qty);

        setRawTopProducts(ranked);

        const grossProfit = totalRev - totalCost;
        const marginPct = totalRev > 0 ? (grossProfit / totalRev) * 100 : 0;
        setProfitSummary({
          salesTotal: totalRev,
          costTotal: totalCost,
          grossProfit,
          marginPct,
          invoicesCount: salesData.length,
          itemsCount: totalItemsSold,
        });
      }

      if (["purchases"].includes(selectedReport)) {
        const purchRes = await supabase
          .from("purchase_invoices")
          .select(
            "id,invoice_number,subtotal,discount,tax,total,paid,payment_method,status,created_at,supplier_id,suppliers(name),warehouses(name,name_ar)",
          )
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false });
        setRawPurchases(purchRes.data ?? []);
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
        setRawProductsList(withStock);
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

        setRawDebts([...custDebts, ...suppDebts]);
      }

      if (["inventory-movements"].includes(selectedReport)) {
        const movementsRes = await supabase
          .from("stock_movements")
          .select(
            "id,reference,movement_type,quantity,unit_cost,total_cost,created_at,products(name,name_ar,sku),warehouses(name,name_ar)",
          )
          .gte("created_at", fromTs)
          .lte("created_at", toTs)
          .order("created_at", { ascending: false })
          .limit(300);
        setRawMovements(movementsRes.data ?? []);
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
            party: r.customers?.name || (ar ? "عميل نقدي" : "Cash customer"),
          })),
          ...(purchRet.data ?? []).map((r: any) => ({
            ...r,
            type: "purchase",
            party: r.suppliers?.name || (ar ? "مورد" : "Supplier"),
          })),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setRawReturnsList(formatted);
      }

      if (["expenses"].includes(selectedReport)) {
        const expRes = await (supabase as any)
          .from("expense_entries")
          .select(
            "id,reference,expense_date,total_amount,status,description,note,expense_lines(category_id,expense_categories(name,name_ar))",
          )
          .gte("expense_date", range.from)
          .lte("expense_date", range.to)
          .order("expense_date", { ascending: false });

        const mapped = ((expRes.data ?? []) as any[]).map((e) => ({
          ...e,
          categoryName: ar
            ? e.expense_lines?.[0]?.expense_categories?.name_ar ||
              e.expense_lines?.[0]?.expense_categories?.name ||
              "عام"
            : e.expense_lines?.[0]?.expense_categories?.name || "General",
        }));
        setRawExpensesList(mapped);
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

  const periodLabel = `${range.from} → ${range.to}`;

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

  // ══════════════════════════════════════════════════════════════
  // MEMOIZED FILTERED & SORTED DATASETS FOR ALL 12 REPORTS
  // ══════════════════════════════════════════════════════════════

  // 1. الأكثر مبيعاً
  const topProducts = useMemo(() => {
    let list = [...rawTopProducts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((tp) => {
        const name = productName(tp.product).toLowerCase();
        const barcode = String(tp.product?.barcode ?? "").toLowerCase();
        return name.includes(q) || barcode.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "qty") {
        return sortDirection === "asc" ? a.qty - b.qty : b.qty - a.qty;
      }
      if (sortField === "total") {
        return sortDirection === "asc" ? a.total - b.total : b.total - a.total;
      }
      if (sortField === "name") {
        const nameA = productName(a.product);
        const nameB = productName(b.product);
        return sortDirection === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      return b.qty - a.qty;
    });
    return list;
  }, [rawTopProducts, searchQuery, sortField, sortDirection, ar]);

  // 2. سجل المبيعات
  const sales = useMemo(() => {
    let list = [...rawSales];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const inv = String(s.invoice_number ?? "").toLowerCase();
        const cust = String(s.customers?.name ?? "").toLowerCase();
        const pm = String(s.payment_method ?? "").toLowerCase();
        const status = String(s.status ?? "").toLowerCase();
        return inv.includes(q) || cust.includes(q) || pm.includes(q) || status.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "created_at" || sortField === "default") {
        const t1 = new Date(a.created_at).getTime();
        const t2 = new Date(b.created_at).getTime();
        return sortDirection === "asc" ? t1 - t2 : t2 - t1;
      }
      if (sortField === "total") {
        const v1 = Number(a.total || 0);
        const v2 = Number(b.total || 0);
        return sortDirection === "asc" ? v1 - v2 : v2 - v1;
      }
      if (sortField === "invoice_number") {
        return sortDirection === "asc"
          ? String(a.invoice_number).localeCompare(String(b.invoice_number))
          : String(b.invoice_number).localeCompare(String(a.invoice_number));
      }
      return 0;
    });
    return list;
  }, [rawSales, searchQuery, sortField, sortDirection]);

  // 3. طرق الدفع (جدول إحصائي موحد)
  const paymentMethodsTable = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    let overall = 0;

    rawSales.forEach((s) => {
      const m = String(s.payment_method ?? "cash").toLowerCase();
      const amt = Number(s.paid ?? s.total ?? 0);
      overall += amt;
      const prev = map.get(m) || { count: 0, total: 0 };
      map.set(m, { count: prev.count + 1, total: prev.total + amt });
    });

    const methodLabels: Record<string, { ar: string; en: string }> = {
      cash: { ar: "نقداً (كاش)", en: "Cash" },
      card: { ar: "شبكة / مدى / بطاقة", en: "Card / POS" },
      transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
      credit: { ar: "آجل (ذمم)", en: "Credit" },
      split: { ar: "دفع متعدد / مجزأ", en: "Split Payment" },
    };

    let rows = Array.from(map.entries()).map(([method, data]) => {
      const pct = overall > 0 ? (data.total / overall) * 100 : 0;
      const label = methodLabels[method]
        ? ar
          ? methodLabels[method].ar
          : methodLabels[method].en
        : method.toUpperCase();
      return {
        key: method,
        label,
        count: data.count,
        total: data.total,
        percentage: pct,
      };
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter((r) => r.label.toLowerCase().includes(q) || r.key.includes(q));
    }

    rows.sort((a, b) => {
      if (sortField === "count") {
        return sortDirection === "asc" ? a.count - b.count : b.count - a.count;
      }
      if (sortField === "total" || sortField === "default") {
        return sortDirection === "asc" ? a.total - b.total : b.total - a.total;
      }
      return 0;
    });

    return { rows, overall };
  }, [rawSales, searchQuery, sortField, sortDirection, ar]);

  // 4. مخزون منخفض
  const lowStock = useMemo(() => {
    let list = rawProductsList.filter((p: any) => p.stock <= Number(p.min_stock ?? 0));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const name = productName(p).toLowerCase();
        const barcode = String(p.barcode ?? "").toLowerCase();
        const sku = String(p.sku ?? "").toLowerCase();
        return name.includes(q) || barcode.includes(q) || sku.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "stock") {
        return sortDirection === "asc" ? a.stock - b.stock : b.stock - a.stock;
      }
      if (sortField === "min_stock") {
        return sortDirection === "asc"
          ? Number(a.min_stock || 0) - Number(b.min_stock || 0)
          : Number(b.min_stock || 0) - Number(a.min_stock || 0);
      }
      if (sortField === "price") {
        return sortDirection === "asc"
          ? Number(a.sale_price || 0) - Number(b.sale_price || 0)
          : Number(b.sale_price || 0) - Number(a.sale_price || 0);
      }
      return a.stock - b.stock;
    });
    return list;
  }, [rawProductsList, searchQuery, sortField, sortDirection, ar]);

  // 5. كشف المشتريات
  const purchases = useMemo(() => {
    let list = [...rawPurchases];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const inv = String(p.invoice_number ?? "").toLowerCase();
        const sup = String(p.suppliers?.name ?? "").toLowerCase();
        const wh = String(p.warehouses?.name_ar ?? p.warehouses?.name ?? "").toLowerCase();
        const st = String(p.status ?? "").toLowerCase();
        return inv.includes(q) || sup.includes(q) || wh.includes(q) || st.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "created_at" || sortField === "default") {
        const t1 = new Date(a.created_at).getTime();
        const t2 = new Date(b.created_at).getTime();
        return sortDirection === "asc" ? t1 - t2 : t2 - t1;
      }
      if (sortField === "total") {
        return sortDirection === "asc"
          ? Number(a.total || 0) - Number(b.total || 0)
          : Number(b.total || 0) - Number(a.total || 0);
      }
      if (sortField === "paid") {
        return sortDirection === "asc"
          ? Number(a.paid || 0) - Number(b.paid || 0)
          : Number(b.paid || 0) - Number(a.paid || 0);
      }
      return 0;
    });
    return list;
  }, [rawPurchases, searchQuery, sortField, sortDirection]);

  // 6. كشف الديون والمستحقات
  const debts = useMemo(() => {
    let list = [...rawDebts];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((d) => {
        const name = String(d.partyName ?? "").toLowerCase();
        const phone = String(d.phone ?? "").toLowerCase();
        return name.includes(q) || phone.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "balance" || sortField === "default") {
        return sortDirection === "asc"
          ? Math.abs(a.balance) - Math.abs(b.balance)
          : Math.abs(b.balance) - Math.abs(a.balance);
      }
      if (sortField === "name") {
        return sortDirection === "asc"
          ? String(a.partyName).localeCompare(String(b.partyName))
          : String(b.partyName).localeCompare(String(a.partyName));
      }
      return 0;
    });
    return list;
  }, [rawDebts, searchQuery, sortField, sortDirection]);

  // 7. كشف فواتير العملاء (مبيعات مفصلة مع المدفوع والمتبقي)
  const customerInvoices = useMemo(() => {
    let list = [...rawSales];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((s) => {
        const inv = String(s.invoice_number ?? "").toLowerCase();
        const cust = String(s.customers?.name ?? "").toLowerCase();
        const wh = String(s.warehouses?.name_ar ?? s.warehouses?.name ?? "").toLowerCase();
        return inv.includes(q) || cust.includes(q) || wh.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "created_at" || sortField === "default") {
        const t1 = new Date(a.created_at).getTime();
        const t2 = new Date(b.created_at).getTime();
        return sortDirection === "asc" ? t1 - t2 : t2 - t1;
      }
      if (sortField === "total") {
        return sortDirection === "asc"
          ? Number(a.total || 0) - Number(b.total || 0)
          : Number(b.total || 0) - Number(a.total || 0);
      }
      if (sortField === "remaining") {
        const r1 = Number(a.total || 0) - Number(a.paid || 0);
        const r2 = Number(b.total || 0) - Number(b.paid || 0);
        return sortDirection === "asc" ? r1 - r2 : r2 - r1;
      }
      return 0;
    });
    return list;
  }, [rawSales, searchQuery, sortField, sortDirection]);

  // 8. حركة المخزون
  const movements = useMemo(() => {
    let list = [...rawMovements];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => {
        const ref = String(m.reference ?? "").toLowerCase();
        const prod = productName(m.products).toLowerCase();
        const type = String(m.movement_type ?? "").toLowerCase();
        return ref.includes(q) || prod.includes(q) || type.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "created_at" || sortField === "default") {
        const t1 = new Date(a.created_at).getTime();
        const t2 = new Date(b.created_at).getTime();
        return sortDirection === "asc" ? t1 - t2 : t2 - t1;
      }
      if (sortField === "quantity") {
        return sortDirection === "asc"
          ? Number(a.quantity || 0) - Number(b.quantity || 0)
          : Number(b.quantity || 0) - Number(a.quantity || 0);
      }
      if (sortField === "total_cost") {
        return sortDirection === "asc"
          ? Number(a.total_cost || 0) - Number(b.total_cost || 0)
          : Number(b.total_cost || 0) - Number(a.total_cost || 0);
      }
      return 0;
    });
    return list;
  }, [rawMovements, searchQuery, sortField, sortDirection, ar]);

  // 9. كشف المرتجعات
  const returnsList = useMemo(() => {
    let list = [...rawReturnsList];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => {
        const num = String(r.return_number ?? "").toLowerCase();
        const party = String(r.party ?? "").toLowerCase();
        const reason = String(r.reason ?? "").toLowerCase();
        return num.includes(q) || party.includes(q) || reason.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "created_at" || sortField === "default") {
        const t1 = new Date(a.created_at).getTime();
        const t2 = new Date(b.created_at).getTime();
        return sortDirection === "asc" ? t1 - t2 : t2 - t1;
      }
      if (sortField === "total") {
        return sortDirection === "asc"
          ? Number(a.total || 0) - Number(b.total || 0)
          : Number(b.total || 0) - Number(a.total || 0);
      }
      return 0;
    });
    return list;
  }, [rawReturnsList, searchQuery, sortField, sortDirection]);

  // 10. كشف المصروفات
  const expensesList = useMemo(() => {
    let list = [...rawExpensesList];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((e) => {
        const ref = String(e.reference ?? "").toLowerCase();
        const cat = String(e.categoryName ?? "").toLowerCase();
        const desc = String(e.description ?? e.note ?? "").toLowerCase();
        return ref.includes(q) || cat.includes(q) || desc.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "expense_date" || sortField === "default") {
        return sortDirection === "asc"
          ? String(a.expense_date).localeCompare(String(b.expense_date))
          : String(b.expense_date).localeCompare(String(a.expense_date));
      }
      if (sortField === "total_amount") {
        return sortDirection === "asc"
          ? Number(a.total_amount || 0) - Number(b.total_amount || 0)
          : Number(b.total_amount || 0) - Number(a.total_amount || 0);
      }
      return 0;
    });
    return list;
  }, [rawExpensesList, searchQuery, sortField, sortDirection]);

  // 11. كشف الصنف
  const productsList = useMemo(() => {
    let list = [...rawProductsList];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const name = productName(p).toLowerCase();
        const barcode = String(p.barcode ?? "").toLowerCase();
        const sku = String(p.sku ?? "").toLowerCase();
        return name.includes(q) || barcode.includes(q) || sku.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortField === "stock") {
        return sortDirection === "asc" ? a.stock - b.stock : b.stock - a.stock;
      }
      if (sortField === "sale_price") {
        return sortDirection === "asc"
          ? Number(a.sale_price || 0) - Number(b.sale_price || 0)
          : Number(b.sale_price || 0) - Number(a.sale_price || 0);
      }
      if (sortField === "name") {
        return sortDirection === "asc"
          ? productName(a).localeCompare(productName(b))
          : productName(b).localeCompare(productName(a));
      }
      return 0;
    });
    return list;
  }, [rawProductsList, searchQuery, sortField, sortDirection, ar]);

  // Generic CSV Export Handler for all reports
  function handleExportCsv() {
    if (selectedReport === "top") {
      exportToCSV({
        filename: `top_products_${range.from}_${range.to}`,
        title: ar ? `الأكثر مبيعاً — ${periodLabel}` : `Top Selling — ${periodLabel}`,
        columns: [
          { header: ar ? "المنتج / الصنف" : "Product", key: "name" },
          { header: ar ? "الباركود" : "Barcode", key: "barcode" },
          { header: ar ? "الكمية المباعة" : "Qty Sold", key: "qty" },
          { header: ar ? "إجمالي الإيراد" : "Revenue", key: "total" },
        ],
        rows: topProducts.map((tp) => ({
          name: productName(tp.product),
          barcode: tp.product?.barcode || "—",
          qty: tp.qty,
          total: tp.total,
        })),
        rtl: ar,
      });
    } else if (selectedReport === "sales" || selectedReport === "sales-invoices") {
      exportToCSV({
        filename: `sales_${range.from}_${range.to}`,
        title: ar ? `المبيعات وفواتير العملاء — ${periodLabel}` : `Sales — ${periodLabel}`,
        columns: [
          { header: ar ? "رقم الفاتورة" : "Invoice #", key: "inv" },
          { header: ar ? "التاريخ" : "Date", key: "date" },
          { header: ar ? "العميل" : "Customer", key: "cust" },
          { header: ar ? "المستودع" : "Warehouse", key: "wh" },
          { header: ar ? "طريقة الدفع" : "Payment Method", key: "pm" },
          { header: ar ? "الإجمالي" : "Total", key: "tot" },
          { header: ar ? "المدفوع" : "Paid", key: "paid" },
          { header: ar ? "المتبقي" : "Remaining", key: "rem" },
          { header: ar ? "الحالة" : "Status", key: "st" },
        ],
        rows: customerInvoices.map((s) => ({
          inv: s.invoice_number,
          date: new Date(s.created_at).toLocaleString(ar ? "ar-YE" : "en-GB"),
          cust: s.customers?.name || (ar ? "عميل نقدي" : "Cash"),
          wh: s.warehouses?.name_ar || s.warehouses?.name || "—",
          pm: s.payment_method || "cash",
          tot: Number(s.total || 0),
          paid: Number(s.paid || 0),
          rem: Number(s.total || 0) - Number(s.paid || 0),
          st: s.status,
        })),
        rtl: ar,
      });
    } else if (selectedReport === "purchases") {
      exportToCSV({
        filename: `purchases_${range.from}_${range.to}`,
        title: ar ? `كشف المشتريات — ${periodLabel}` : `Purchases — ${periodLabel}`,
        columns: [
          { header: ar ? "رقم الفاتورة" : "Invoice #", key: "inv" },
          { header: ar ? "التاريخ" : "Date", key: "date" },
          { header: ar ? "المورد" : "Supplier", key: "sup" },
          { header: ar ? "المستودع" : "Warehouse", key: "wh" },
          { header: ar ? "الإجمالي" : "Total", key: "tot" },
          { header: ar ? "المدفوع" : "Paid", key: "paid" },
          { header: ar ? "المتبقي" : "Remaining", key: "rem" },
          { header: ar ? "الحالة" : "Status", key: "st" },
        ],
        rows: purchases.map((p) => ({
          inv: p.invoice_number,
          date: new Date(p.created_at).toLocaleDateString(ar ? "ar-YE" : "en-GB"),
          sup: p.suppliers?.name || "—",
          wh: p.warehouses?.name_ar || p.warehouses?.name || "—",
          tot: Number(p.total || 0),
          paid: Number(p.paid || 0),
          rem: Number(p.total || 0) - Number(p.paid || 0),
          st: p.status,
        })),
        rtl: ar,
      });
    } else if (selectedReport === "debts") {
      exportToCSV({
        filename: `debts_${range.from}_${range.to}`,
        title: ar ? `كشف الديون والمستحقات — ${periodLabel}` : `Debts — ${periodLabel}`,
        columns: [
          { header: ar ? "الطرف" : "Party", key: "party" },
          { header: ar ? "نوع الحساب" : "Kind", key: "kind" },
          { header: ar ? "الهاتف" : "Phone", key: "phone" },
          { header: ar ? "الرصيد المستحق" : "Balance", key: "bal" },
        ],
        rows: debts.map((d) => ({
          party: d.partyName,
          kind:
            d.kind === "customer"
              ? ar
                ? "عميل (لنا)"
                : "Customer"
              : ar
                ? "مورد (علينا)"
                : "Supplier",
          phone: d.phone || "—",
          bal: d.balance,
        })),
        rtl: ar,
      });
    } else if (selectedReport === "payments") {
      exportToCSV({
        filename: `payments_${range.from}_${range.to}`,
        title: ar ? `توزيع طرق الدفع — ${periodLabel}` : `Payment Methods — ${periodLabel}`,
        columns: [
          { header: ar ? "طريقة الدفع" : "Method", key: "label" },
          { header: ar ? "عدد العمليات" : "Count", key: "count" },
          { header: ar ? "إجمالي المبلغ" : "Total", key: "total" },
          { header: ar ? "نسبة المساهمة %" : "Percentage", key: "pct" },
        ],
        rows: paymentMethodsTable.rows.map((r) => ({
          label: r.label,
          count: r.count,
          total: r.total,
          pct: `${r.percentage.toFixed(1)}%`,
        })),
        rtl: ar,
      });
    } else if (selectedReport === "inventory-movements") {
      exportToCSV({
        filename: `movements_${range.from}_${range.to}`,
        title: ar ? `كشف حركة المخزون — ${periodLabel}` : `Stock Movements — ${periodLabel}`,
        columns: [
          { header: ar ? "المرجع" : "Ref", key: "ref" },
          { header: ar ? "التاريخ" : "Date", key: "date" },
          { header: ar ? "الصنف" : "Product", key: "prod" },
          { header: ar ? "نوع الحركة" : "Type", key: "type" },
          { header: ar ? "الكمية" : "Qty", key: "qty" },
          { header: ar ? "إجمالي التكلفة" : "Total Cost", key: "cost" },
        ],
        rows: movements.map((m) => ({
          ref: m.reference || "—",
          date: new Date(m.created_at).toLocaleString(ar ? "ar-YE" : "en-GB"),
          prod: productName(m.products),
          type: m.movement_type,
          qty: m.quantity,
          cost: m.total_cost,
        })),
        rtl: ar,
      });
    } else if (selectedReport === "returns") {
      exportToCSV({
        filename: `returns_${range.from}_${range.to}`,
        title: ar ? `كشف المرتجعات — ${periodLabel}` : `Returns — ${periodLabel}`,
        columns: [
          { header: ar ? "رقم المرتجع" : "Return #", key: "num" },
          { header: ar ? "التاريخ" : "Date", key: "date" },
          { header: ar ? "النوع" : "Kind", key: "type" },
          { header: ar ? "الطرف" : "Party", key: "party" },
          { header: ar ? "المبلغ" : "Total", key: "tot" },
          { header: ar ? "الحالة" : "Status", key: "st" },
        ],
        rows: returnsList.map((r) => ({
          num: r.return_number,
          date: new Date(r.created_at).toLocaleDateString(ar ? "ar-YE" : "en-GB"),
          type:
            r.type === "sales"
              ? ar
                ? "مرتجع مبيعات"
                : "Sales"
              : ar
                ? "مرتجع مشتريات"
                : "Purchase",
          party: r.party,
          tot: r.total,
          st: r.status,
        })),
        rtl: ar,
      });
    } else if (selectedReport === "expenses") {
      exportToCSV({
        filename: `expenses_${range.from}_${range.to}`,
        title: ar ? `كشف المصروفات — ${periodLabel}` : `Expenses — ${periodLabel}`,
        columns: [
          { header: ar ? "المرجع" : "Ref", key: "ref" },
          { header: ar ? "التاريخ" : "Date", key: "date" },
          { header: ar ? "التصنيف" : "Category", key: "cat" },
          { header: ar ? "البيان" : "Description", key: "desc" },
          { header: ar ? "المبلغ" : "Amount", key: "amt" },
        ],
        rows: expensesList.map((e) => ({
          ref: e.reference || "—",
          date: e.expense_date,
          cat: e.categoryName,
          desc: e.description || e.note || "—",
          amt: e.total_amount,
        })),
        rtl: ar,
      });
    } else {
      // Products / Low stock
      exportToCSV({
        filename: `products_${range.from}_${range.to}`,
        title: ar ? `بيانات الأصناف والمخزون — ${periodLabel}` : `Products — ${periodLabel}`,
        columns: [
          { header: ar ? "اسم الصنف" : "Product", key: "name" },
          { header: ar ? "الباركود" : "Barcode", key: "barcode" },
          { header: ar ? "الوحدة" : "Unit", key: "unit" },
          { header: ar ? "المخزون الحالي" : "Stock", key: "stock" },
          { header: ar ? "الحد الأدنى" : "Min", key: "min" },
          { header: ar ? "سعر البيع" : "Price", key: "price" },
        ],
        rows: (selectedReport === "low" ? lowStock : productsList).map((p) => ({
          name: productName(p),
          barcode: p.barcode || "—",
          unit: p.unit || "—",
          stock: p.stock,
          min: p.min_stock ?? 0,
          price: p.sale_price || 0,
        })),
        rtl: ar,
      });
    }
  }

  // Unified Loading Row
  const renderLoadingRow = (colSpan: number) => (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-16 text-center">
        <div className="flex flex-col items-center justify-center gap-2.5">
          <RefreshCw className="h-6 w-6 animate-spin text-primary" />
          <span className="text-xs font-semibold text-muted-foreground">
            {ar ? "جارٍ تحليل وجلب بيانات التقرير..." : "Loading report records..."}
          </span>
        </div>
      </TableCell>
    </TableRow>
  );

  // Unified Empty Row
  const renderEmptyRow = (colSpan: number) => (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-16 text-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <FileText className="h-8 w-8 text-muted-foreground/35 stroke-1" />
          <span className="text-xs font-semibold text-foreground">
            {searchQuery
              ? ar
                ? "لا توجد نتائج مطابقة لمعايير البحث في هذا التقرير"
                : "No matching records found"
              : ar
                ? "لا توجد بيانات مسجلة في هذه الفترة الزمنية"
                : "No records found for this period"}
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-primary hover:underline font-medium"
            >
              {ar ? "مسح حقل البحث وعرض جميع السجلات" : "Clear search query"}
            </button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      {/* ═══ Header Bar: Selector Dropdown + Date Range Presets + Refresh ═══ */}
      <div className="panel-elevated p-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Dropdown Selector for All 12 Reports */}
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
                  {ar ? "💼 تقارير المشتريات والديون والعملاء" : "💼 Purchases, Debts & Invoices"}
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
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground",
                loading && "animate-spin text-primary",
              )}
            />
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
            onClick={handleExportCsv}
            className="h-8 gap-1.5 text-xs rounded-xl border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{ar ? "تصدير CSV" : "Export CSV"}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            className="h-8 gap-1.5 text-xs rounded-xl"
          >
            <Printer className="h-3.5 w-3.5 text-primary" />
            <span>{ar ? "طباعة فاخرة" : "Print"}</span>
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          UNIFIED TABLE DISPLAY CONTAINER ACROSS ALL 12 REPORTS
         ══════════════════════════════════════════════════════════════ */}
      <div className="panel-elevated p-0 overflow-hidden rounded-2xl border border-border/70 shadow-sm bg-surface">
        {/* 1. تقرير الأكثر مبيعاً */}
        {selectedReport === "top" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead
                  onClick={() => handleSort("name")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "المنتج / الصنف" : "Product"}</span>
                    {renderSortIndicator("name")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("qty")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "الكمية المباعة" : "Qty sold"}</span>
                    {renderSortIndicator("qty")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "إجمالي الإيراد" : "Revenue"}</span>
                    {renderSortIndicator("total")}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(4)
                : topProducts.length === 0
                  ? renderEmptyRow(4)
                  : topProducts.map((tp, idx) => (
                      <TableRow key={idx} className="hover:bg-surface-2/50 transition-colors">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-xs text-foreground">
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
                    ))}
            </TableBody>
            {topProducts.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={2} className="py-2.5">
                    {ar
                      ? `الإجمالي (${topProducts.length} صنف)`
                      : `Total (${topProducts.length} items)`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs">
                    <Ltr>
                      {topProducts.reduce((sum, item) => sum + item.qty, 0).toLocaleString()}
                    </Ltr>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-primary">
                    <Ltr>{money(topProducts.reduce((sum, item) => sum + item.total, 0))}</Ltr>
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 2. سجل المبيعات */}
        {selectedReport === "sales" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead
                  onClick={() => handleSort("invoice_number")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "رقم الفاتورة" : "Invoice #"}</span>
                    {renderSortIndicator("invoice_number")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("created_at")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "التاريخ والوقت" : "Date"}</span>
                    {renderSortIndicator("created_at")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "العميل" : "Customer"}
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "طريقة الدفع والحالة" : "Payment & Status"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    {renderSortIndicator("total")}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(6)
                : sales.length === 0
                  ? renderEmptyRow(6)
                  : sales.map((s, idx) => (
                      <TableRow key={s.id} className="hover:bg-surface-2/50 transition-colors">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          <Ltr>{s.invoice_number}</Ltr>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Ltr>{new Date(s.created_at).toLocaleString(ar ? "ar-YE" : "en-GB")}</Ltr>
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {s.customers?.name || (ar ? "عميل نقدي" : "Cash customer")}
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
                        <TableCell className="text-end font-mono text-xs font-bold text-primary">
                          <Ltr>{money(Number(s.total || 0))}</Ltr>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
            {sales.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={5} className="py-2.5">
                    {ar
                      ? `إجمالي المبيعات (${sales.length} فاتورة)`
                      : `Total Sales (${sales.length} invoices)`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-primary">
                    <Ltr>{money(sales.reduce((sum, s) => sum + Number(s.total || 0), 0))}</Ltr>
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 3. كشف توزيع طرق الدفع (جدول موحد) */}
        {selectedReport === "payments" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "طريقة الدفع" : "Payment Method"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("count")}
                  className="text-center font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-center w-full">
                    <span>{ar ? "عدد الفواتير والعمليات" : "Transactions"}</span>
                    {renderSortIndicator("count")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "إجمالي المبالغ المحصلة" : "Collected Amount"}</span>
                    {renderSortIndicator("total")}
                  </div>
                </TableHead>
                <TableHead className="w-56 font-semibold text-xs">
                  {ar ? "نسبة المساهمة والتوزيع" : "Distribution"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(5)
                : paymentMethodsTable.rows.length === 0
                  ? renderEmptyRow(5)
                  : paymentMethodsTable.rows.map((row, idx) => (
                      <TableRow key={row.key} className="hover:bg-surface-2/50 transition-colors">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-3.5 w-3.5 text-primary" />
                            <span className="font-semibold text-xs text-foreground">
                              {row.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs font-semibold">
                          <Ltr>{row.count.toLocaleString()}</Ltr>
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs font-bold text-primary">
                          <Ltr>{money(row.total)}</Ltr>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                              <span>{row.percentage.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 w-full bg-surface-3 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all duration-300 rounded-full"
                                style={{ width: `${row.percentage}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
            {paymentMethodsTable.rows.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={2} className="py-2.5">
                    {ar ? "المجموع الكلي للمتحصلات" : "Grand Total"}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs">
                    <Ltr>
                      {paymentMethodsTable.rows
                        .reduce((sum, r) => sum + r.count, 0)
                        .toLocaleString()}
                    </Ltr>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-primary">
                    <Ltr>{money(paymentMethodsTable.overall)}</Ltr>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-[11px]">100%</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 4. مخزون منخفض */}
        {selectedReport === "low" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "المنتج / الصنف" : "Product"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("stock")}
                  className="text-end font-semibold text-xs text-rose-500 cursor-pointer hover:text-rose-600 transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "المتاح حالياً" : "On hand"}</span>
                    {renderSortIndicator("stock")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("min_stock")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "الحد الأدنى" : "Min"}</span>
                    {renderSortIndicator("min_stock")}
                  </div>
                </TableHead>
                <TableHead className="text-end font-semibold text-xs text-amber-500">
                  {ar ? "العجز المطلوب" : "Shortage"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("price")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "سعر البيع" : "Price"}</span>
                    {renderSortIndicator("price")}
                  </div>
                </TableHead>
                <TableHead className="text-center font-semibold text-xs">
                  {ar ? "الحالة" : "Status"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(7)
                : lowStock.length === 0
                  ? renderEmptyRow(7)
                  : lowStock.map((p, idx) => {
                      const isDepleted = p.stock <= 0;
                      const shortage = Math.max(0, Number(p.min_stock ?? 0) - p.stock);
                      return (
                        <TableRow key={p.id} className="hover:bg-surface-2/50 transition-colors">
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold text-xs">{productName(p)}</div>
                            {p.barcode && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {p.barcode}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                            <Ltr>{p.stock}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs text-muted-foreground">
                            <Ltr>{p.min_stock ?? 0}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs font-semibold text-amber-500">
                            <Ltr>{shortage}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs">
                            <Ltr>{money(Number(p.sale_price || 0))}</Ltr>
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
                                ? ar
                                  ? "نفد المخزون"
                                  : "Out of stock"
                                : ar
                                  ? "تحت الحد الأدنى"
                                  : "Low stock"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
            </TableBody>
            {lowStock.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={7} className="py-2.5 text-rose-500">
                    {ar
                      ? `⚠️ يوجد ${lowStock.length} صنف يحتاج لإعادة الطلب والتوريد فوراً`
                      : `⚠️ ${lowStock.length} items require replenishment`}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 5. كشف المشتريات */}
        {selectedReport === "purchases" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "رقم الفاتورة" : "Invoice #"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("created_at")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "التاريخ" : "Date"}</span>
                    {renderSortIndicator("created_at")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "المورد" : "Supplier"}
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "المستودع" : "Warehouse"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    {renderSortIndicator("total")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("paid")}
                  className="text-end font-semibold text-xs text-emerald-500 cursor-pointer hover:text-emerald-600 transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "المدفوع" : "Paid"}</span>
                    {renderSortIndicator("paid")}
                  </div>
                </TableHead>
                <TableHead className="text-end font-semibold text-xs text-rose-500">
                  {ar ? "المتبقي" : "Remaining"}
                </TableHead>
                <TableHead className="text-center font-semibold text-xs">
                  {ar ? "الحالة" : "Status"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(9)
                : purchases.length === 0
                  ? renderEmptyRow(9)
                  : purchases.map((p, idx) => {
                      const rem = Number(p.total ?? 0) - Number(p.paid ?? 0);
                      return (
                        <TableRow key={p.id} className="hover:bg-surface-2/50 transition-colors">
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-primary">
                            <Ltr>{p.invoice_number}</Ltr>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <Ltr>
                              {new Date(p.created_at).toLocaleDateString(ar ? "ar-YE" : "en-GB")}
                            </Ltr>
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {p.suppliers?.name || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.warehouses?.name_ar || p.warehouses?.name || "—"}
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs font-bold text-foreground">
                            <Ltr>{money(Number(p.total ?? 0))}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs text-emerald-500 font-semibold">
                            <Ltr>{money(Number(p.paid ?? 0))}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs text-rose-500 font-bold">
                            <Ltr>{money(rem)}</Ltr>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                              {p.status ?? "—"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
            </TableBody>
            {purchases.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={5} className="py-2.5">
                    {ar
                      ? `إجمالي المشتريات (${purchases.length} فاتورة)`
                      : `Purchases Total (${purchases.length})`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold">
                    <Ltr>{money(purchases.reduce((s, p) => s + Number(p.total || 0), 0))}</Ltr>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs text-emerald-500 font-bold">
                    <Ltr>{money(purchases.reduce((s, p) => s + Number(p.paid || 0), 0))}</Ltr>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs text-rose-500 font-bold">
                    <Ltr>
                      {money(
                        purchases.reduce(
                          (s, p) => s + (Number(p.total || 0) - Number(p.paid || 0)),
                          0,
                        ),
                      )}
                    </Ltr>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 6. كشف الديون والمستحقات */}
        {selectedReport === "debts" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead
                  onClick={() => handleSort("name")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "الطرف" : "Party"}</span>
                    {renderSortIndicator("name")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "نوع الحساب" : "Kind"}
                </TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الهاتف" : "Phone"}</TableHead>
                <TableHead
                  onClick={() => handleSort("balance")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "الرصيد المستحق" : "Balance"}</span>
                    {renderSortIndicator("balance")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "آخر حركة" : "Updated"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(6)
                : debts.length === 0
                  ? renderEmptyRow(6)
                  : debts.map((d, idx) => (
                      <TableRow key={d.id} className="hover:bg-surface-2/50 transition-colors">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-semibold text-xs">{d.partyName}</TableCell>
                        <TableCell>
                          <Badge
                            variant={d.kind === "customer" ? "default" : "secondary"}
                            className="text-[10px] py-0 px-1.5"
                          >
                            {d.kind === "customer"
                              ? ar
                                ? "عميل (لنا)"
                                : "Customer (Asset)"
                              : ar
                                ? "مورد (علينا)"
                                : "Supplier (Liability)"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          <Ltr>{d.phone || "—"}</Ltr>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-end font-mono text-xs font-bold",
                            d.balance > 0 ? "text-rose-500" : "text-emerald-500",
                          )}
                        >
                          <Ltr>{money(Math.abs(d.balance))}</Ltr>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Ltr>
                            {d.updatedAt
                              ? new Date(d.updatedAt).toLocaleDateString(ar ? "ar-YE" : "en-GB")
                              : "—"}
                          </Ltr>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
            {debts.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={4} className="py-2.5">
                    {ar
                      ? `إجمالي الأرصدة (${debts.length} حساب)`
                      : `Total Balances (${debts.length})`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                    <Ltr>{money(debts.reduce((sum, d) => sum + Math.abs(d.balance), 0))}</Ltr>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 7. كشف فواتير العملاء (جدول فواتير مبيعات كامل) */}
        {selectedReport === "sales-invoices" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead
                  onClick={() => handleSort("invoice_number")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "رقم الفاتورة" : "Invoice #"}</span>
                    {renderSortIndicator("invoice_number")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("created_at")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "التاريخ والوقت" : "Date"}</span>
                    {renderSortIndicator("created_at")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "العميل" : "Customer"}
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "المستودع / الفرع" : "Warehouse"}
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "طريقة الدفع" : "Payment"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    {renderSortIndicator("total")}
                  </div>
                </TableHead>
                <TableHead className="text-end font-semibold text-xs text-emerald-500">
                  {ar ? "المدفوع" : "Paid"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("remaining")}
                  className="text-end font-semibold text-xs text-rose-500 cursor-pointer hover:text-rose-600 transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "المتبقي" : "Remaining"}</span>
                    {renderSortIndicator("remaining")}
                  </div>
                </TableHead>
                <TableHead className="text-center font-semibold text-xs">
                  {ar ? "الحالة" : "Status"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(10)
                : customerInvoices.length === 0
                  ? renderEmptyRow(10)
                  : customerInvoices.map((s, idx) => {
                      const remaining = Number(s.total || 0) - Number(s.paid || 0);
                      return (
                        <TableRow key={s.id} className="hover:bg-surface-2/50 transition-colors">
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-primary">
                            <Ltr>{s.invoice_number}</Ltr>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            <Ltr>
                              {new Date(s.created_at).toLocaleString(ar ? "ar-YE" : "en-GB")}
                            </Ltr>
                          </TableCell>
                          <TableCell className="text-xs font-medium">
                            {s.customers?.name || (ar ? "عميل نقدي" : "Cash")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {s.warehouses?.name_ar || s.warehouses?.name || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {s.payment_method || "cash"}
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs font-bold text-foreground">
                            <Ltr>{money(Number(s.total || 0))}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs text-emerald-500 font-semibold">
                            <Ltr>{money(Number(s.paid || 0))}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs text-rose-500 font-bold">
                            <Ltr>{money(remaining)}</Ltr>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={s.status === "paid" ? "default" : "secondary"}
                              className="text-[10px] py-0 px-1.5"
                            >
                              {s.status === "paid" ? (ar ? "مسددة" : "Paid") : s.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
            </TableBody>
            {customerInvoices.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={6} className="py-2.5">
                    {ar
                      ? `الإجمالي الكلي (${customerInvoices.length} فاتورة)`
                      : `Grand Total (${customerInvoices.length})`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-foreground">
                    <Ltr>
                      {money(customerInvoices.reduce((sum, s) => sum + Number(s.total || 0), 0))}
                    </Ltr>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs text-emerald-500 font-bold">
                    <Ltr>
                      {money(customerInvoices.reduce((sum, s) => sum + Number(s.paid || 0), 0))}
                    </Ltr>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs text-rose-500 font-bold">
                    <Ltr>
                      {money(
                        customerInvoices.reduce(
                          (sum, s) => sum + (Number(s.total || 0) - Number(s.paid || 0)),
                          0,
                        ),
                      )}
                    </Ltr>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 8. كشف الأرباح والمبيعات الأساسي */}
        {selectedReport === "profit-sales" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "المؤشر المالي والتحليلي" : "Financial Metric"}
                </TableHead>
                <TableHead className="text-center font-semibold text-xs">
                  {ar ? "عدد العمليات / الأصناف" : "Count / Items"}
                </TableHead>
                <TableHead className="text-end font-semibold text-xs">
                  {ar ? "القيمة المالية الإجمالية" : "Total Value"}
                </TableHead>
                <TableHead className="text-end font-semibold text-xs">
                  {ar ? "هامش الربح / النسبة" : "Margin %"}
                </TableHead>
                <TableHead className="text-center font-semibold text-xs">
                  {ar ? "التقييم التشغيلي" : "Status"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className="hover:bg-surface-2/50 transition-colors">
                <TableCell className="text-center font-mono text-xs text-muted-foreground">
                  1
                </TableCell>
                <TableCell className="font-semibold text-xs text-foreground">
                  {ar ? "إجمالي الإيرادات والمبيعات المحققة" : "Gross Revenue"}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-muted-foreground">
                  {profitSummary.invoicesCount} {ar ? "فاتورة" : "invoices"}
                </TableCell>
                <TableCell className="text-end font-mono text-xs font-bold text-foreground">
                  <Ltr>{money(profitSummary.salesTotal)}</Ltr>
                </TableCell>
                <TableCell className="text-end font-mono text-xs text-muted-foreground">
                  100%
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-[10px] py-0 px-2 font-medium">
                    {ar ? "نشاط معتمد" : "Active"}
                  </Badge>
                </TableCell>
              </TableRow>

              <TableRow className="hover:bg-surface-2/50 transition-colors">
                <TableCell className="text-center font-mono text-xs text-muted-foreground">
                  2
                </TableCell>
                <TableCell className="font-semibold text-xs text-foreground">
                  {ar ? "تكلفة البضاعة المباعة (COGS)" : "Cost of Goods Sold"}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-muted-foreground">
                  {profitSummary.itemsCount} {ar ? "قطعة مباعة" : "units"}
                </TableCell>
                <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                  <Ltr>{money(profitSummary.costTotal)}</Ltr>
                </TableCell>
                <TableCell className="text-end font-mono text-xs text-rose-500">
                  <Ltr>
                    {profitSummary.salesTotal > 0
                      ? `${((profitSummary.costTotal / profitSummary.salesTotal) * 100).toFixed(1)}%`
                      : "0%"}
                  </Ltr>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="secondary" className="text-[10px] py-0 px-2">
                    {ar ? "تكلفة معيارية" : "Cost"}
                  </Badge>
                </TableCell>
              </TableRow>

              <TableRow className="hover:bg-surface-2/50 bg-primary/5 transition-colors font-bold">
                <TableCell className="text-center font-mono text-xs text-primary">3</TableCell>
                <TableCell className="font-bold text-xs text-primary">
                  {ar ? "صافي مجمل الربح التشغيلي" : "Gross Operational Profit"}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-primary">
                  {profitSummary.itemsCount} {ar ? "صنف" : "items"}
                </TableCell>
                <TableCell className="text-end font-mono text-sm font-bold text-primary">
                  <Ltr>{money(profitSummary.grossProfit)}</Ltr>
                </TableCell>
                <TableCell className="text-end font-mono text-xs font-bold text-primary">
                  <Ltr>{profitSummary.marginPct.toFixed(1)}%</Ltr>
                </TableCell>
                <TableCell className="text-center">
                  <Badge className="text-[10px] py-0 px-2 bg-primary text-primary-foreground font-semibold">
                    {profitSummary.grossProfit >= 0
                      ? ar
                        ? "ربح إيجابي"
                        : "Profitable"
                      : ar
                        ? "عجز"
                        : "Loss"}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}

        {/* 9. كشف حركة المخزون */}
        {selectedReport === "inventory-movements" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "المرجع" : "Ref"}</TableHead>
                <TableHead
                  onClick={() => handleSort("created_at")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "التاريخ والوقت" : "Date"}</span>
                    {renderSortIndicator("created_at")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الصنف" : "Product"}</TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "المستودع" : "Warehouse"}
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "نوع الحركة" : "Type"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("quantity")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "الكمية" : "Qty"}</span>
                    {renderSortIndicator("quantity")}
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total_cost")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "إجمالي التكلفة" : "Total Cost"}</span>
                    {renderSortIndicator("total_cost")}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(8)
                : movements.length === 0
                  ? renderEmptyRow(8)
                  : movements.map((m, idx) => (
                      <TableRow key={m.id} className="hover:bg-surface-2/50 transition-colors">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-primary font-medium">
                          {m.reference || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Ltr>{new Date(m.created_at).toLocaleString(ar ? "ar-YE" : "en-GB")}</Ltr>
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {productName(m.products)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.warehouses?.name_ar || m.warehouses?.name || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {m.movement_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs font-bold text-foreground">
                          <Ltr>{m.quantity}</Ltr>
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs text-muted-foreground">
                          <Ltr>{money(Number(m.total_cost || 0))}</Ltr>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
            {movements.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={6} className="py-2.5">
                    {ar
                      ? `إجمالي الحركات (${movements.length})`
                      : `Total Movements (${movements.length})`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-foreground">
                    <Ltr>{movements.reduce((sum, m) => sum + Number(m.quantity || 0), 0)}</Ltr>
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-primary">
                    <Ltr>
                      {money(movements.reduce((sum, m) => sum + Number(m.total_cost || 0), 0))}
                    </Ltr>
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 10. كشف المرتجعات */}
        {selectedReport === "returns" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "رقم المرتجع" : "Return #"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("created_at")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "التاريخ" : "Date"}</span>
                    {renderSortIndicator("created_at")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "نوع المرتجع" : "Kind"}
                </TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الطرف" : "Party"}</TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "السبب / البيان" : "Reason"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "إجمالي المبلغ" : "Amount"}</span>
                    {renderSortIndicator("total")}
                  </div>
                </TableHead>
                <TableHead className="text-center font-semibold text-xs">
                  {ar ? "الحالة" : "Status"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(8)
                : returnsList.length === 0
                  ? renderEmptyRow(8)
                  : returnsList.map((r, idx) => (
                      <TableRow key={r.id} className="hover:bg-surface-2/50 transition-colors">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-primary">
                          {r.return_number}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Ltr>
                            {new Date(r.created_at).toLocaleDateString(ar ? "ar-YE" : "en-GB")}
                          </Ltr>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={r.type === "sales" ? "default" : "secondary"}
                            className="text-[10px] py-0 px-1.5"
                          >
                            {r.type === "sales"
                              ? ar
                                ? "مرتجع مبيعات"
                                : "Sales return"
                              : ar
                                ? "مرتجع مشتريات"
                                : "Purchase return"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium">{r.party}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.reason || "—"}
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                          <Ltr>{money(Number(r.total || 0))}</Ltr>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {r.status || "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
            {returnsList.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={6} className="py-2.5">
                    {ar
                      ? `إجمالي المرتجعات (${returnsList.length})`
                      : `Returns Total (${returnsList.length})`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                    <Ltr>
                      {money(returnsList.reduce((sum, r) => sum + Number(r.total || 0), 0))}
                    </Ltr>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 11. كشف المصروفات */}
        {selectedReport === "expenses" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "المرجع" : "Ref"}</TableHead>
                <TableHead
                  onClick={() => handleSort("expense_date")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "التاريخ" : "Date"}</span>
                    {renderSortIndicator("expense_date")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "التصنيف" : "Category"}
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "الوصف والبيان" : "Description"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("total_amount")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "المبلغ" : "Amount"}</span>
                    {renderSortIndicator("total_amount")}
                  </div>
                </TableHead>
                <TableHead className="text-center font-semibold text-xs">
                  {ar ? "الحالة" : "Status"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(7)
                : expensesList.length === 0
                  ? renderEmptyRow(7)
                  : expensesList.map((e, idx) => (
                      <TableRow key={e.id} className="hover:bg-surface-2/50 transition-colors">
                        <TableCell className="text-center font-mono text-xs text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-primary font-medium">
                          {e.reference || "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <Ltr>{e.expense_date}</Ltr>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-foreground">
                          {e.categoryName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.description || e.note || "—"}
                        </TableCell>
                        <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                          <Ltr>{money(Number(e.total_amount || 0))}</Ltr>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                            {e.status || "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
            {expensesList.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={5} className="py-2.5">
                    {ar
                      ? `إجمالي المصروفات (${expensesList.length})`
                      : `Total Expenses (${expensesList.length})`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold text-rose-500">
                    <Ltr>
                      {money(expensesList.reduce((sum, e) => sum + Number(e.total_amount || 0), 0))}
                    </Ltr>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}

        {/* 12. كشف الصنف */}
        {selectedReport === "product" && (
          <Table>
            <TableHeader className="bg-surface-2/60">
              <TableRow>
                <TableHead className="w-12 text-center font-semibold text-xs">#</TableHead>
                <TableHead
                  onClick={() => handleSort("name")}
                  className="font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5">
                    <span>{ar ? "اسم الصنف" : "Product Name"}</span>
                    {renderSortIndicator("name")}
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-xs">
                  {ar ? "الباركود" : "Barcode"}
                </TableHead>
                <TableHead className="font-semibold text-xs">{ar ? "الوحدة" : "Unit"}</TableHead>
                <TableHead
                  onClick={() => handleSort("stock")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "المخزون الحالي" : "Current Stock"}</span>
                    {renderSortIndicator("stock")}
                  </div>
                </TableHead>
                <TableHead className="text-end font-semibold text-xs text-muted-foreground">
                  {ar ? "الحد الأدنى" : "Min Stock"}
                </TableHead>
                <TableHead
                  onClick={() => handleSort("sale_price")}
                  className="text-end font-semibold text-xs cursor-pointer hover:text-primary transition-colors select-none"
                >
                  <div className="inline-flex items-center gap-1.5 justify-end w-full">
                    <span>{ar ? "سعر البيع" : "Sale Price"}</span>
                    {renderSortIndicator("sale_price")}
                  </div>
                </TableHead>
                <TableHead className="text-end font-semibold text-xs text-primary">
                  {ar ? "إجمالي القيمة" : "Total Value"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? renderLoadingRow(8)
                : productsList.length === 0
                  ? renderEmptyRow(8)
                  : productsList.map((p, idx) => {
                      const totalVal = Number(p.sale_price || 0) * Number(p.stock || 0);
                      return (
                        <TableRow key={p.id} className="hover:bg-surface-2/50 transition-colors">
                          <TableCell className="text-center font-mono text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-semibold text-xs text-foreground">
                            {productName(p)}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p.barcode || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {p.unit || "—"}
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs font-bold text-foreground">
                            <Ltr>{p.stock}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs text-muted-foreground">
                            <Ltr>{p.min_stock ?? 0}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs">
                            <Ltr>{money(Number(p.sale_price || 0))}</Ltr>
                          </TableCell>
                          <TableCell className="text-end font-mono text-xs font-bold text-primary">
                            <Ltr>{money(totalVal)}</Ltr>
                          </TableCell>
                        </TableRow>
                      );
                    })}
            </TableBody>
            {productsList.length > 0 && (
              <TableFooter className="bg-surface-2/80 font-semibold text-xs">
                <TableRow>
                  <TableCell colSpan={4} className="py-2.5">
                    {ar
                      ? `إجمالي الأصناف (${productsList.length})`
                      : `Total Products (${productsList.length})`}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs font-bold">
                    <Ltr>{productsList.reduce((sum, p) => sum + Number(p.stock || 0), 0)}</Ltr>
                  </TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-end font-mono text-xs font-bold text-primary">
                    <Ltr>
                      {money(
                        productsList.reduce(
                          (sum, p) => sum + Number(p.sale_price || 0) * Number(p.stock || 0),
                          0,
                        ),
                      )}
                    </Ltr>
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </div>
    </div>
  );
}
