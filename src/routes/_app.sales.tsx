import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Receipt,
  Eye,
  X,
  FileDown,
  Printer,
  Sparkles,
  ScrollText,
  CreditCard,
  Banknote,
  Landmark,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
  MessageCircle,
  Share2,
  Copy,
  Check,
  Phone,
  Building2,
  Coins,
  HandCoins,
  ChevronRight,
  TrendingUp,
  SlidersHorizontal,
  Calendar,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { useModules } from "@/lib/modules";
import { money } from "@/lib/format";
import { toSystemDigits } from "@/lib/format-preferences";
import { generateInvoicePDF, type InvoiceDoc } from "@/lib/pdf";
import { printInvoice, type InvoiceTemplate } from "@/lib/invoice-print";
import {
  VortexMetricCard,
  VortexSearchInput,
  VortexDateBadge,
  VortexFilterSheet,
  VortexFilterSection,
  VortexCollectionSheet,
  type PaymentMethod,
} from "@/components/vortex-ui";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/sales")({
  head: () => ({ meta: [{ title: "المبيعات والفواتير — فورتيكس ERP" }] }),
  component: SalesPage,
});

interface CustomerInfo {
  id?: string;
  name: string;
  phone?: string | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  payment_method: string;
  note: string | null;
  created_at: string;
  customer_id: string | null;
  warehouse_id: string | null;
  customers: CustomerInfo | null;
  warehouses: { name: string; name_ar: string | null } | null;
}

interface Line {
  id: string;
  quantity: number;
  unit_price: number;
  tax: number;
  total: number;
  products: { name: string; sku: string | null } | null;
}

type StatusTab = "all" | "paid" | "partial" | "unpaid" | "cancelled";
type ViewMode = "table" | "grid";

export function SalesPage() {
  const { t, lang } = useI18n();
  const { isModuleEnabled } = useModules();
  const hasMultiWarehouse = isModuleEnabled("multi_warehouse");

  const [rows, setRows] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // Filter Sheet State
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [filterDatePreset, setFilterDatePreset] = useState<string>("all");
  const [filterWarehouse, setFilterWarehouse] = useState<string>("all");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");

  // Selected & Details State
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);

  // Quick Collection Sheet State
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionTarget, setCollectionTarget] = useState<{
    invoiceId: string;
    customerId: string | null;
    customerName: string;
    phone?: string;
    balance: number;
  } | null>(null);

  const isRtl = lang === "ar";

  const whName = (w: { name: string; name_ar: string | null } | null | undefined) =>
    !w ? undefined : lang === "ar" ? w.name_ar || w.name : w.name || w.name_ar || undefined;

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select(
          "id,invoice_number,status,subtotal,discount,tax,total,paid,payment_method,note,created_at,customer_id,warehouse_id,customers(id,name,phone),warehouses(name,name_ar)",
        )
        .order("created_at", { ascending: false })
        .limit(300);

      if (error) {
        console.error("Failed to load sales invoices:", error);
        toast.error(isRtl ? "تعذر تحميل فواتير المبيعات" : "Failed to load sales invoices");
      } else {
        setRows((data ?? []) as any);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openInvoice(inv: Invoice) {
    setSelected(inv);
    setLoadingLines(true);
    try {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select("id,quantity,unit_price,tax,total,products(name,sku)")
        .eq("invoice_id", inv.id);

      if (!error) {
        setLines((data ?? []) as any);
      }
    } finally {
      setLoadingLines(false);
    }
  }

  const copyInvoiceNumber = (invNum: string, id: string) => {
    navigator.clipboard.writeText(invNum);
    setCopiedInvoiceId(id);
    toast.success(isRtl ? `تم نسخ رقم الفاتورة: ${invNum}` : `Invoice number copied: ${invNum}`);
    setTimeout(() => setCopiedInvoiceId(null), 2000);
  };

  const pmLabel = (m: string, note?: string | null) => {
    const isSplit = Boolean(note && (note.includes("[دفع مجزأ:") || note.includes("[Split:")));
    if (isSplit || m === "split") {
      return isRtl ? "دفع مجزأ" : "Split";
    }
    const map: Record<string, string> = {
      cash: t("pos.pm.cash") || (isRtl ? "نقداً" : "Cash"),
      card: t("pos.pm.card") || (isRtl ? "شبكة/بطاقة" : "Card"),
      bank_transfer: t("pos.pm.bank") || (isRtl ? "تحويل بنكي" : "Bank Transfer"),
      bank: t("pos.pm.bank") || (isRtl ? "تحويل بنكي" : "Bank"),
      credit: t("pos.pm.credit") || (isRtl ? "آجل" : "Credit"),
      cheque: isRtl ? "شيك" : "Cheque",
      mobile_money: isRtl ? "محفظة إلكترونية" : "Mobile Money",
    };
    return map[m] ?? m;
  };

  const pmIcon = (m: string, note?: string | null) => {
    const isSplit = Boolean(note && (note.includes("[دفع مجزأ:") || note.includes("[Split:")));
    if (isSplit || m === "split") return <Coins className="h-3.5 w-3.5 text-amber-500" />;
    switch (m) {
      case "cash":
        return <Banknote className="h-3.5 w-3.5 text-emerald-500" />;
      case "card":
        return <CreditCard className="h-3.5 w-3.5 text-blue-500" />;
      case "bank":
      case "bank_transfer":
        return <Landmark className="h-3.5 w-3.5 text-indigo-500" />;
      case "credit":
        return <Clock className="h-3.5 w-3.5 text-purple-500" />;
      default:
        return <Receipt className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      paid: isRtl ? "مدفوعة بالكامل" : "Paid",
      partial: isRtl ? "دفع جزئي" : "Partial",
      unpaid: isRtl ? "غير مدفوعة (آجل)" : "Unpaid",
      cancelled: isRtl ? "ملغاة" : "Cancelled",
    };
    return map[s] ?? s;
  };

  const statusBadge = (s: string) => {
    switch (s) {
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
            <CheckCircle2 className="h-3 w-3" />
            {statusLabel(s)}
          </span>
        );
      case "partial":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-500">
            <Clock className="h-3 w-3" />
            {statusLabel(s)}
          </span>
        );
      case "unpaid":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-500">
            <AlertCircle className="h-3 w-3" />
            {statusLabel(s)}
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-500">
            <XCircle className="h-3 w-3" />
            {statusLabel(s)}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {s}
          </span>
        );
    }
  };

  // WhatsApp Message Generator
  const shareInvoiceWhatsApp = (inv: Invoice) => {
    const customerName = inv.customers?.name || (isRtl ? "العميل الكريم" : "Valued Customer");
    const remaining = Math.max(0, Number(inv.total) - Number(inv.paid));
    const formattedTotal = toSystemDigits(money(Number(inv.total)));
    const formattedPaid = toSystemDigits(money(Number(inv.paid)));
    const formattedRemaining = toSystemDigits(money(remaining));
    const dateFormatted = new Date(inv.created_at).toLocaleDateString(isRtl ? "ar-EG" : "en-US");

    let text = "";
    if (isRtl) {
      text = `السلام عليكم ورحمة الله وبركاته،\nعزيزنا *${customerName}*،\nتفاصيل فاتورة المبيعات الخاصة بكم:\n` +
        `🧾 *رقم الفاتورة:* ${inv.invoice_number}\n` +
        `📅 *التاريخ:* ${dateFormatted}\n` +
        `💵 *الإجمالي:* ${formattedTotal}\n` +
        `✅ *المدفوع:* ${formattedPaid}\n` +
        (remaining > 0 ? `⏳ *المتبقي:* ${formattedRemaining}\n` : `✨ *الحالة:* مسددة بالكامل\n`) +
        `\nشكراً لتعاملكم معنا ونسعد بخدمتكم دائماً!`;
    } else {
      text = `Hello ${customerName},\nHere are the details for your sales invoice:\n` +
        `🧾 *Invoice #:* ${inv.invoice_number}\n` +
        `📅 *Date:* ${dateFormatted}\n` +
        `💵 *Total:* ${formattedTotal}\n` +
        `✅ *Paid:* ${formattedPaid}\n` +
        (remaining > 0 ? `⏳ *Remaining:* ${formattedRemaining}\n` : `✨ *Status:* Fully Paid\n`) +
        `\nThank you for choosing us!`;
    }

    const cleanPhone = (inv.customers?.phone || "").replace(/[^0-9]/g, "");
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.open(waUrl, "_blank");
  };

  // Quick Collect trigger
  const triggerQuickCollect = (inv: Invoice) => {
    const remaining = Math.max(0, Number(inv.total) - Number(inv.paid));
    setCollectionTarget({
      invoiceId: inv.id,
      customerId: inv.customer_id,
      customerName: inv.customers?.name || (isRtl ? "عميل نقدي" : "Walk-in"),
      phone: inv.customers?.phone || undefined,
      balance: remaining,
    });
    setCollectionOpen(true);
  };

  // Handle saving payment from collection sheet
  const handleSaveCollection = async (payment: {
    amount: number;
    payment_method: PaymentMethod;
    payment_date: string;
    note: string;
  }) => {
    if (!collectionTarget) return;

    const dbMethodMap: Record<PaymentMethod, string> = {
      cash: "cash",
      bank_transfer: "bank_transfer",
      cheque: "bank_transfer",
      transfer: "bank_transfer",
    };
    const dbMethod = dbMethodMap[payment.payment_method] || "cash";

    // 1. Record customer payment if customer exists
    if (collectionTarget.customerId) {
      const { error: pError } = await (supabase as any).from("customer_payments").insert({
        customer_id: collectionTarget.customerId,
        invoice_id: collectionTarget.invoiceId,
        amount: payment.amount,
        payment_method: dbMethod,
        note: payment.note || null,
        payment_date: payment.payment_date || new Date().toISOString(),
      });
      if (pError) throw pError;
    }

    // 2. Update the sales invoice paid amount and status with 2-decimal precision & cap
    const inv = rows.find((r) => r.id === collectionTarget.invoiceId);
    if (inv) {
      const invTotal = Number(inv.total) || 0;
      const currentPaid = Number(inv.paid) || 0;
      const remaining = Math.max(0, Math.round((invTotal - currentPaid) * 100) / 100);
      const payAmt = Math.min(Number(payment.amount) || 0, remaining > 0 ? remaining : Number(payment.amount) || 0);
      const newPaid = Math.min(invTotal, Math.round((currentPaid + payAmt) * 100) / 100);
      const newStatus = newPaid >= invTotal ? "paid" : newPaid > 0 ? "partial" : "unpaid";

      const { error: invErr } = await (supabase as any)
        .from("sales_invoices")
        .update({
          paid: newPaid,
          status: newStatus,
        })
        .eq("id", collectionTarget.invoiceId);

      if (invErr) {
        console.error("Failed to update invoice:", invErr);
        toast.error(isRtl ? "تعذر تحديث حالة الفاتورة" : "Failed to update invoice status");
        return;
      }
    }

    // 3. Keep customer balance consistent in customers table
    if (collectionTarget.customerId) {
      const { data: custData } = await supabase
        .from("customers")
        .select("balance")
        .eq("id", collectionTarget.customerId)
        .maybeSingle();

      if (custData) {
        const curBal = Number(custData.balance) || 0;
        const newBal = Math.round((curBal - Number(payment.amount)) * 100) / 100;
        await (supabase as any)
          .from("customers")
          .update({ balance: newBal })
          .eq("id", collectionTarget.customerId);
      }
    }

    toast.success(isRtl ? "تم تسجيل التحصيل وتحديث الفاتورة بنجاح" : "Payment collected successfully");
    await load();
  };

  // Build Invoice Document for Print & PDF
  async function buildDoc(): Promise<InvoiceDoc | null> {
    if (!selected) return null;
    const { data: cs } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
    return {
      title: isRtl ? "فاتورة مبيعات ضريبية" : "Tax Sales Invoice",
      number: selected.invoice_number,
      date: new Date(selected.created_at).toLocaleString(isRtl ? "ar-EG" : "en-US"),
      partyLabel: isRtl ? "العميل / المشترى:" : "Bill To:",
      partyName: selected.customers?.name ?? (isRtl ? "عميل نقدي" : "Walk-in"),
      warehouse: hasMultiWarehouse ? (whName(selected.warehouses) ?? undefined) : undefined,
      payment: pmLabel(selected.payment_method, selected.note),
      status: statusLabel(selected.status),
      lines: lines.map((l) => ({
        product: l.products?.name ?? "—",
        qty: Number(l.quantity),
        price: Number(l.unit_price),
        total: Number(l.total),
      })),
      subtotal: Number(selected.subtotal),
      tax: Number(selected.tax),
      discount: Number(selected.discount),
      total: Number(selected.total),
      paid: Number(selected.paid),
      company: cs
        ? {
            name: (cs as any).company_name,
            address: (cs as any).address,
            phone: (cs as any).phone,
            vat: (cs as any).vat_number,
          }
        : undefined,
      currency: (cs as any)?.currency ?? (isRtl ? "ريال" : ""),
    };
  }

  async function doPrint(template: InvoiceTemplate) {
    const doc = await buildDoc();
    if (!doc) return;
    printInvoice(
      doc,
      template,
      {
        invoice: isRtl ? "فاتورة مبيعات" : "Sales Invoice",
        date: t("common.date"),
        billTo: isRtl ? "العميل" : "Bill To",
        warehouse: t("common.warehouse"),
        payment: isRtl ? "طريقة السداد" : "Payment",
        status: t("common.status"),
        product: isRtl ? "الصنف / المنتج" : "Item",
        qty: t("common.qty"),
        price: t("common.price"),
        total: t("common.total"),
        subtotal: t("common.subtotal"),
        tax: t("common.tax"),
        discount: t("common.discount"),
        grandTotal: isRtl ? "الإجمالي الكلي" : "Grand Total",
        paid: isRtl ? "المسدد" : "Paid",
        balance: isRtl ? "المتبقي" : "Balance",
        thanks: isRtl ? "شكراً لزيارتكم ونتمنى لكم يوماً سعيداً" : "Thank you for your visit!",
        poweredBy: "Vortex ERP",
      },
      isRtl,
    );
    setPrintOpen(false);
  }

  async function doPDF() {
    const doc = await buildDoc();
    if (doc) generateInvoicePDF(doc);
  }

  // Calculate Metrics from Rows
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;
    let cancelledCount = 0;

    rows.forEach((r) => {
      const tot = Number(r.total) || 0;
      const pd = Number(r.paid) || 0;
      const rem = Math.max(0, tot - pd);

      if (r.status !== "cancelled") {
        totalRevenue += tot;
        totalPaid += pd;
        totalPending += rem;
      }

      if (r.status === "paid") paidCount++;
      else if (r.status === "partial") partialCount++;
      else if (r.status === "unpaid") unpaidCount++;
      else if (r.status === "cancelled") cancelledCount++;
    });

    const activeInvoices = rows.filter((r) => r.status !== "cancelled").length;
    const avgTicket = activeInvoices > 0 ? totalRevenue / activeInvoices : 0;

    return {
      totalRevenue,
      totalPaid,
      totalPending,
      totalCount: rows.length,
      paidCount,
      partialCount,
      unpaidCount,
      cancelledCount,
      avgTicket,
    };
  }, [rows]);

  // Filter Rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      // 1. Status Tab
      if (statusTab !== "all" && r.status !== statusTab) {
        return false;
      }

      // 2. Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const invNum = r.invoice_number.toLowerCase();
        const custName = (r.customers?.name ?? "").toLowerCase();
        const custPhone = (r.customers?.phone ?? "").toLowerCase();
        const note = (r.note ?? "").toLowerCase();
        if (!invNum.includes(q) && !custName.includes(q) && !custPhone.includes(q) && !note.includes(q)) {
          return false;
        }
      }

      // 3. Payment Method filter
      if (filterPaymentMethod !== "all") {
        if (filterPaymentMethod === "split") {
          const isSplit = Boolean(r.note && (r.note.includes("[دفع مجزأ:") || r.note.includes("[Split:")));
          if (!isSplit && r.payment_method !== "split") return false;
        } else if (r.payment_method !== filterPaymentMethod) {
          return false;
        }
      }

      // 4. Warehouse filter
      if (filterWarehouse !== "all" && r.warehouse_id !== filterWarehouse) {
        return false;
      }

      // 5. Min / Max amount
      const tot = Number(r.total) || 0;
      if (minAmount && tot < Number(minAmount)) return false;
      if (maxAmount && tot > Number(maxAmount)) return false;

      // 6. Date preset filter
      if (filterDatePreset !== "all") {
        const rowDate = new Date(r.created_at);
        const now = new Date();
        if (filterDatePreset === "today") {
          if (rowDate.toDateString() !== now.toDateString()) return false;
        } else if (filterDatePreset === "last7") {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (rowDate < sevenDaysAgo) return false;
        } else if (filterDatePreset === "thisMonth") {
          if (rowDate.getMonth() !== now.getMonth() || rowDate.getFullYear() !== now.getFullYear()) {
            return false;
          }
        }
      }

      return true;
    });
  }, [rows, statusTab, search, filterPaymentMethod, filterWarehouse, minAmount, maxAmount, filterDatePreset]);

  // Unique Warehouses for Filter
  const availableWarehouses = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => {
      if (r.warehouse_id && r.warehouses) {
        map.set(r.warehouse_id, whName(r.warehouses) || r.warehouses.name);
      }
    });
    return Array.from(map.entries());
  }, [rows, lang]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterPaymentMethod !== "all") count++;
    if (filterDatePreset !== "all") count++;
    if (filterWarehouse !== "all") count++;
    if (minAmount) count++;
    if (maxAmount) count++;
    return count;
  }, [filterPaymentMethod, filterDatePreset, filterWarehouse, minAmount, maxAmount]);

  const clearAllFilters = () => {
    setFilterPaymentMethod("all");
    setFilterDatePreset("all");
    setFilterWarehouse("all");
    setMinAmount("");
    setMaxAmount("");
    setSearch("");
    setStatusTab("all");
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title={isRtl ? "المبيعات والفواتير" : "Sales & Invoices"}
          subtitle={
            isRtl
              ? "متابعة فواتير المبيعات، المدفوعات، التحصيلات الفورية والطباعة الفاخرة"
              : "Track sales invoices, collections, payment statuses and luxury printing"
          }
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
            title={isRtl ? "تحديث البيانات" : "Refresh"}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline">{isRtl ? "تحديث" : "Refresh"}</span>
          </button>



          <Link
            to="/pos"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            <span>{isRtl ? "فاتورة جديدة (نقطة البيع)" : "New Invoice (POS)"}</span>
          </Link>
        </div>
      </div>

      {/* Vortex Metrics Cards - 2 Columns on Mobile, 4 on Desktop */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <VortexMetricCard
          title={isRtl ? "إجمالي المبيعات" : "Total Revenue"}
          value={toSystemDigits(money(metrics.totalRevenue))}
          subtitle={`${toSystemDigits(metrics.totalCount.toString())} ${isRtl ? "فاتورة مسجلة" : "invoices"}`}
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          gradient="emerald"
        />
        <VortexMetricCard
          title={isRtl ? "المبالغ المحصلة" : "Collected Cash"}
          value={toSystemDigits(money(metrics.totalPaid))}
          subtitle={`${toSystemDigits(metrics.paidCount.toString())} ${isRtl ? "مسددة بالكامل" : "fully paid"}`}
          icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />}
          gradient="blue"
        />
        <VortexMetricCard
          title={isRtl ? "المتبقي والآجل" : "Receivables & Due"}
          value={toSystemDigits(money(metrics.totalPending))}
          subtitle={`${toSystemDigits((metrics.unpaidCount + metrics.partialCount).toString())} ${isRtl ? "فواتير معلقة" : "pending invoices"}`}
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          gradient="amber"
        />
        <VortexMetricCard
          title={isRtl ? "متوسط قيمة الفاتورة" : "Average Ticket"}
          value={toSystemDigits(money(metrics.avgTicket))}
          subtitle={isRtl ? "لكل عملية بيع نشطة" : "per active sale"}
          icon={<Receipt className="h-4 w-4 text-purple-500" />}
          gradient="purple"
        />
      </div>

      {/* Status Segment Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2 text-xs">
        <button
          onClick={() => setStatusTab("all")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
            statusTab === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
        >
          <span>{isRtl ? "الكل" : "All"}</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              statusTab === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {toSystemDigits(rows.length.toString())}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("paid")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
            statusTab === "paid"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
        >
          <span>{isRtl ? "مسددة" : "Paid"}</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              statusTab === "paid" ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-500"
            }`}
          >
            {toSystemDigits(metrics.paidCount.toString())}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("partial")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
            statusTab === "partial"
              ? "bg-amber-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
        >
          <span>{isRtl ? "دفع جزئي" : "Partial"}</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              statusTab === "partial" ? "bg-white/20 text-white" : "bg-amber-500/10 text-amber-500"
            }`}
          >
            {toSystemDigits(metrics.partialCount.toString())}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("unpaid")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
            statusTab === "unpaid"
              ? "bg-rose-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
        >
          <span>{isRtl ? "غير مسددة (آجلة)" : "Unpaid"}</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              statusTab === "unpaid" ? "bg-white/20 text-white" : "bg-rose-500/10 text-rose-500"
            }`}
          >
            {toSystemDigits(metrics.unpaidCount.toString())}
          </span>
        </button>

        <button
          onClick={() => setStatusTab("cancelled")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
            statusTab === "cancelled"
              ? "bg-red-600 text-white shadow-sm"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
        >
          <span>{isRtl ? "ملغاة" : "Cancelled"}</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              statusTab === "cancelled" ? "bg-white/20 text-white" : "bg-red-500/10 text-red-500"
            }`}
          >
            {toSystemDigits(metrics.cancelledCount.toString())}
          </span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <VortexSearchInput
            value={search}
            onChange={setSearch}
            placeholder={
              isRtl
                ? "البحث برقم الفاتورة، اسم العميل، رقم الهاتف أو الملاحظات..."
                : "Search invoice #, customer name, phone or notes..."
            }
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(true)}
            className={`relative inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition ${
              activeFiltersCount > 0
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border bg-surface text-foreground hover:bg-surface-2"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>{isRtl ? "تصفية متقدمة" : "Filters"}</span>
            {activeFiltersCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {activeFiltersCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-surface px-2.5 text-xs text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              <span>{isRtl ? "إلغاء التصفية" : "Reset"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Table or Grid View */}
      {loading ? (
        <div className="panel-elevated flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-primary opacity-80" />
          <p className="text-sm">{isRtl ? "جاري تحميل بيانات المبيعات..." : "Loading sales data..."}</p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="panel-elevated flex min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
            <Receipt className="h-8 w-8 opacity-60" />
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground">
              {isRtl ? "لا توجد فواتير مبيعات مطابقة" : "No matching sales invoices"}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {search || activeFiltersCount > 0 || statusTab !== "all"
                ? isRtl
                  ? "جرب تعديل خيارات البحث أو التصفية"
                  : "Try adjusting your search query or filters"
                : isRtl
                  ? "يمكنك إنشاء أول فاتورة عبر نقطة البيع الآن"
                  : "Start creating invoices via the POS page"}
            </p>
          </div>
          <div className="mt-2 flex gap-2">
            {(search || activeFiltersCount > 0 || statusTab !== "all") && (
              <button
                onClick={clearAllFilters}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs hover:bg-surface-2"
              >
                <X className="h-3 w-3" />
                {isRtl ? "مسح التصفية" : "Clear filters"}
              </button>
            )}
            <Link
              to="/pos"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3 w-3" />
              {isRtl ? "إنشاء فاتورة الآن" : "Create Invoice"}
            </Link>
          </div>
        </div>
      ) : viewMode === "table" ? (
        /* Table View */
        <div className="panel-elevated overflow-hidden border border-border/80">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2/60 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start">{isRtl ? "رقم الفاتورة والتاريخ" : "Invoice & Date"}</th>
                  <th className="px-4 py-3 text-start">{isRtl ? "العميل" : "Customer"}</th>
                  {hasMultiWarehouse && (
                    <th className="px-4 py-3 text-start">{isRtl ? "المستودع" : "Warehouse"}</th>
                  )}
                  <th className="px-4 py-3 text-start">{isRtl ? "طريقة السداد" : "Payment"}</th>
                  <th className="px-4 py-3 text-start">{isRtl ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3 text-end">{isRtl ? "الإجمالي" : "Total"}</th>
                  <th className="px-4 py-3 text-end">{isRtl ? "المدفوع / المتبقي" : "Paid / Due"}</th>
                  <th className="px-4 py-3 text-center">{isRtl ? "الإجراءات" : "Actions"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRows.map((inv) => {
                  const total = Number(inv.total) || 0;
                  const paid = Number(inv.paid) || 0;
                  const remaining = Math.max(0, total - paid);

                  return (
                    <tr
                      key={inv.id}
                      className="group transition hover:bg-surface-2/40 cursor-pointer"
                      onClick={() => openInvoice(inv)}
                    >
                      {/* Invoice & Date */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground group-hover:text-primary transition">
                            {inv.invoice_number}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyInvoiceNumber(inv.invoice_number, inv.id);
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-surface hover:text-foreground"
                            title={isRtl ? "نسخ الرقم" : "Copy number"}
                          >
                            {copiedInvoiceId === inv.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                        <div className="mt-1">
                          <VortexDateBadge date={inv.created_at} variant="subtle" />
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-foreground">
                            {(inv.customers?.name ?? (isRtl ? "ع" : "W")).slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">
                              {inv.customers?.name ?? (isRtl ? "عميل نقدي" : "Walk-in")}
                            </div>
                            {inv.customers?.phone && (
                              <div className="text-[11px] text-muted-foreground dir-ltr">
                                {toSystemDigits(inv.customers.phone)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Warehouse (if multi-warehouse enabled) */}
                      {hasMultiWarehouse && (
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {whName(inv.warehouses) ?? "—"}
                        </td>
                      )}

                      {/* Payment Method */}
                      <td className="px-4 py-3">
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-surface px-2.5 py-1 text-xs">
                          {pmIcon(inv.payment_method, inv.note)}
                          <span>{pmLabel(inv.payment_method, inv.note)}</span>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3">{statusBadge(inv.status)}</td>

                      {/* Total */}
                      <td className="px-4 py-3 text-end font-semibold text-foreground">
                        {toSystemDigits(money(total))}
                      </td>

                      {/* Paid / Due */}
                      <td className="px-4 py-3 text-end text-xs">
                        <div className="font-medium text-emerald-500">{toSystemDigits(money(paid))}</div>
                        {remaining > 0 ? (
                          <div className="text-[11px] font-semibold text-rose-500">
                            {isRtl ? "متبقي: " : "Due: "}
                            {toSystemDigits(money(remaining))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground">{isRtl ? "خالص" : "Settled"}</div>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-1">
                          {/* Quick Collect button if due */}
                          {remaining > 0 && inv.status !== "cancelled" && (
                            <button
                              type="button"
                              onClick={() => triggerQuickCollect(inv)}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/20 transition"
                              title={isRtl ? "تحصيل سريع" : "Quick Collect"}
                            >
                              <HandCoins className="h-3.5 w-3.5" />
                              <span className="hidden xl:inline">{isRtl ? "تحصيل" : "Collect"}</span>
                            </button>
                          )}

                          {/* WhatsApp Share */}
                          <button
                            type="button"
                            onClick={() => shareInvoiceWhatsApp(inv)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-emerald-500 transition"
                            title={isRtl ? "مشاركة عبر واتساب" : "Share via WhatsApp"}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </button>

                          {/* Details */}
                          <button
                            type="button"
                            onClick={() => openInvoice(inv)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground transition"
                            title={isRtl ? "عرض التفاصيل" : "View Details"}
                          >
                            <Eye className="h-4 w-4" />
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
      ) : (
        /* Cards / Grid View - 2 Columns on Mobile, 3 on Desktop */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRows.map((inv) => {
            const total = Number(inv.total) || 0;
            const paid = Number(inv.paid) || 0;
            const remaining = Math.max(0, total - paid);

            return (
              <div
                key={inv.id}
                onClick={() => openInvoice(inv)}
                className="group relative flex flex-col justify-between rounded-xl border border-border/80 bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md cursor-pointer"
              >
                <div>
                  {/* Top: Invoice # & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold text-foreground group-hover:text-primary transition">
                          {inv.invoice_number}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyInvoiceNumber(inv.invoice_number, inv.id);
                          }}
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          {copiedInvoiceId === inv.id ? (
                            <Check className="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                      <div className="mt-1">
                        <VortexDateBadge date={inv.created_at} variant="subtle" />
                      </div>
                    </div>
                    <div>{statusBadge(inv.status)}</div>
                  </div>

                  {/* Customer and Payment method */}
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold">
                        {(inv.customers?.name ?? (isRtl ? "ع" : "W")).slice(0, 1).toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">
                        {inv.customers?.name ?? (isRtl ? "عميل نقدي" : "Walk-in")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      {pmIcon(inv.payment_method, inv.note)}
                      <span className="text-[11px]">{pmLabel(inv.payment_method, inv.note)}</span>
                    </div>
                  </div>

                  {/* Financial Breakdown */}
                  <div className="mt-3 rounded-lg border border-border/60 bg-surface-2/40 p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>{isRtl ? "إجمالي الفاتورة:" : "Total:"}</span>
                      <span className="font-semibold text-foreground text-sm">
                        {toSystemDigits(money(total))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>{isRtl ? "المسدد:" : "Paid:"}</span>
                      <span className="font-medium text-emerald-500">
                        {toSystemDigits(money(paid))}
                      </span>
                    </div>
                    {remaining > 0 && (
                      <div className="flex items-center justify-between border-t border-border/40 pt-1 text-xs font-semibold text-rose-500">
                        <span>{isRtl ? "المتبقي (آجل):" : "Remaining Due:"}</span>
                        <span>{toSystemDigits(money(remaining))}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Quick Actions */}
                <div
                  className="mt-3 flex items-center justify-between border-t border-border/60 pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => shareInvoiceWhatsApp(inv)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-emerald-500 transition"
                      title={isRtl ? "واتساب" : "WhatsApp"}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openInvoice(inv)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground transition"
                      title={isRtl ? "تفاصيل" : "Details"}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>

                  {remaining > 0 && inv.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={() => triggerQuickCollect(inv)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/20 transition"
                    >
                      <HandCoins className="h-3.5 w-3.5" />
                      <span>{isRtl ? "تحصيل فوري" : "Collect"}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(inv);
                        setPrintOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-2 transition"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>{isRtl ? "طباعة" : "Print"}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Advanced Filter Sheet */}
      <VortexFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title={isRtl ? "خيارات التصفية المتقدمة للفواتير" : "Advanced Invoices Filter"}
        activeFiltersCount={activeFiltersCount}
        onReset={clearAllFilters}
      >
        {/* Date Preset */}
        <VortexFilterSection title={isRtl ? "الفترة الزمنية" : "Time Period"}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: "all", label: isRtl ? "كل الأوقات" : "All Time" },
              { id: "today", label: isRtl ? "اليوم" : "Today" },
              { id: "last7", label: isRtl ? "آخر 7 أيام" : "Last 7 Days" },
              { id: "thisMonth", label: isRtl ? "هذا الشهر" : "This Month" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setFilterDatePreset(p.id)}
                className={`rounded-lg border px-3 py-2 text-center transition ${
                  filterDatePreset === p.id
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </VortexFilterSection>

        {/* Payment Method */}
        <VortexFilterSection title={isRtl ? "طريقة السداد" : "Payment Method"}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: "all", label: isRtl ? "الكل" : "All" },
              { id: "cash", label: isRtl ? "نقداً" : "Cash" },
              { id: "card", label: isRtl ? "شبكة/بطاقة" : "Card" },
              { id: "bank_transfer", label: isRtl ? "تحويل بنكي" : "Bank Transfer" },
              { id: "credit", label: isRtl ? "آجل" : "Credit" },
              { id: "split", label: isRtl ? "دفع مجزأ" : "Split" },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setFilterPaymentMethod(m.id)}
                className={`rounded-lg border px-3 py-2 text-center transition ${
                  filterPaymentMethod === m.id
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </VortexFilterSection>

        {/* Warehouse Selector (if multi warehouse enabled) */}
        {hasMultiWarehouse && availableWarehouses.length > 0 && (
          <VortexFilterSection title={isRtl ? "المستودع / الفرع" : "Warehouse"}>
            <select
              value={filterWarehouse}
              onChange={(e) => setFilterWarehouse(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-xs"
            >
              <option value="all">{isRtl ? "كل المستودعات" : "All Warehouses"}</option>
              {availableWarehouses.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </VortexFilterSection>
        )}

        {/* Amount Range */}
        <VortexFilterSection title={isRtl ? "نطاق قيمة الفاتورة" : "Invoice Amount Range"}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] text-muted-foreground">{isRtl ? "من (الحد الأدنى)" : "Min"}</label>
              <input
                type="number"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                placeholder="0"
                className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">{isRtl ? "إلى (الحد الأقصى)" : "Max"}</label>
              <input
                type="number"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                placeholder="0"
                className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-xs"
              />
            </div>
          </div>
        </VortexFilterSection>
      </VortexFilterSheet>

      {/* Luxury Invoice Details Drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-end bg-black/65 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelected(null)}
        >
          <div
            className="h-full w-full max-w-2xl border-s border-border/80 bg-background/95 backdrop-blur-md p-6 shadow-2xl overflow-y-auto animate-in slide-in-from-left duration-200 relative flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
            dir={isRtl ? "rtl" : "ltr"}
          >
            {/* Ambient decorative glow */}
            <div className="absolute -top-12 -right-12 size-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/80 bg-surface-2/40 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-lg font-bold text-foreground">
                      {selected.invoice_number}
                    </h3>
                    <button
                      type="button"
                      onClick={() => copyInvoiceNumber(selected.invoice_number, selected.id)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {copiedInvoiceId === selected.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="mt-0.5">
                    <VortexDateBadge date={selected.created_at} variant="subtle" />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div>{statusBadge(selected.status)}</div>
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Info Grid */}
              <div
                className={`grid gap-3 rounded-xl border border-border/80 bg-surface-2/30 p-4 text-xs ${
                  hasMultiWarehouse ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"
                }`}
              >
                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {isRtl ? "العميل" : "Customer"}
                  </span>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {selected.customers?.name ?? (isRtl ? "عميل نقدي" : "Walk-in")}
                  </p>
                  {selected.customers?.phone && (
                    <p className="text-[11px] text-muted-foreground dir-ltr">
                      {toSystemDigits(selected.customers.phone)}
                    </p>
                  )}
                </div>

                {hasMultiWarehouse && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                      {isRtl ? "المستودع / الفرع" : "Warehouse"}
                    </span>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">
                      {whName(selected.warehouses) ?? "—"}
                    </p>
                  </div>
                )}

                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {isRtl ? "طريقة السداد" : "Payment Method"}
                  </span>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {pmIcon(selected.payment_method, selected.note)}
                    <span>{pmLabel(selected.payment_method, selected.note)}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {isRtl ? "حالة السداد" : "Payment Status"}
                  </span>
                  <p className="mt-0.5 text-sm font-semibold text-foreground">
                    {statusLabel(selected.status)}
                  </p>
                </div>
              </div>

              {/* Note / Split details if present */}
              {selected.note && (
                <div className="rounded-xl border border-border/80 bg-surface-2/40 p-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground me-1">
                    {isRtl ? "الملاحظات وتفاصيل الدفع:" : "Note & Payment Details:"}
                  </span>
                  {selected.note}
                </div>
              )}

              {/* Items Table */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isRtl ? "بنود الفاتورة والمنتجات" : "Invoice Items"}
                </h4>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-2/70 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 text-start font-medium">{isRtl ? "المنتج / الصنف" : "Item"}</th>
                        <th className="px-3 py-2.5 text-center font-medium">{isRtl ? "الكمية" : "Qty"}</th>
                        <th className="px-3 py-2.5 text-end font-medium">{isRtl ? "سعر الوحدة" : "Unit Price"}</th>
                        <th className="px-3 py-2.5 text-end font-medium">{isRtl ? "الإجمالي" : "Total"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {loadingLines ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-muted-foreground">
                            <RefreshCw className="mx-auto h-4 w-4 animate-spin mb-1 text-primary" />
                            {isRtl ? "جاري جلب تفاصيل البنود..." : "Loading items..."}
                          </td>
                        </tr>
                      ) : lines.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-muted-foreground">
                            {isRtl ? "لا توجد بنود مسجلة لهذه الفاتورة" : "No items recorded"}
                          </td>
                        </tr>
                      ) : (
                        lines.map((l) => (
                          <tr key={l.id} className="hover:bg-surface-2/30">
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-foreground">{l.products?.name ?? "—"}</div>
                              {l.products?.sku && (
                                <div className="text-[10px] font-mono text-muted-foreground">
                                  SKU: {l.products.sku}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="inline-block rounded-md bg-surface-2 px-2 py-0.5 font-mono font-semibold text-foreground">
                                {toSystemDigits(l.quantity.toString())}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-end font-mono">
                              {toSystemDigits(money(Number(l.unit_price)))}
                            </td>
                            <td className="px-3 py-2.5 text-end font-mono font-semibold text-foreground">
                              {toSystemDigits(money(Number(l.total)))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Totals Breakdown */}
              <div className="rounded-xl border border-border/80 bg-surface-2/30 p-4 text-xs space-y-1.5">
                <div className="flex justify-between text-muted-foreground">
                  <span>{isRtl ? "المجموع الفرعي (قبل الضريبة):" : "Subtotal:"}</span>
                  <span className="font-mono">{toSystemDigits(money(Number(selected.subtotal)))}</span>
                </div>
                {Number(selected.discount) > 0 && (
                  <div className="flex justify-between text-emerald-500">
                    <span>{isRtl ? "الخصم الممنوح:" : "Discount:"}</span>
                    <span className="font-mono">-{toSystemDigits(money(Number(selected.discount)))}</span>
                  </div>
                )}
                {Number(selected.tax) > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{isRtl ? "ضريبة القيمة المضافة:" : "VAT / Tax:"}</span>
                    <span className="font-mono">{toSystemDigits(money(Number(selected.tax)))}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 text-sm font-bold text-foreground">
                  <span>{isRtl ? "الإجمالي الكلي:" : "Grand Total:"}</span>
                  <span className="font-mono text-base">{toSystemDigits(money(Number(selected.total)))}</span>
                </div>
                <div className="flex justify-between text-emerald-500 font-medium">
                  <span>{isRtl ? "المسدد نقداً / مدفوع:" : "Paid:"}</span>
                  <span className="font-mono">{toSystemDigits(money(Number(selected.paid)))}</span>
                </div>
                {Math.max(0, Number(selected.total) - Number(selected.paid)) > 0 && (
                  <div className="flex justify-between text-rose-500 font-bold border-t border-border/60 pt-1 text-xs">
                    <span>{isRtl ? "المتبقي (دين آجل مستحق):" : "Remaining Due:"}</span>
                    <span className="font-mono">
                      {toSystemDigits(money(Math.max(0, Number(selected.total) - Number(selected.paid))))}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer / Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-surface-2/40 px-6 py-4">
              <div className="flex items-center gap-2">
                {/* WhatsApp invoice share */}
                <button
                  type="button"
                  onClick={() => shareInvoiceWhatsApp(selected)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-500 hover:bg-emerald-500/20 transition"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{isRtl ? "مشاركة واتساب" : "WhatsApp"}</span>
                </button>

                {/* PDF */}
                <button
                  type="button"
                  onClick={doPDF}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-2 transition"
                >
                  <FileDown className="h-4 w-4" />
                  <span>{isRtl ? "تحميل PDF" : "PDF"}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Quick Collect Button if invoice has balance */}
                {Math.max(0, Number(selected.total) - Number(selected.paid)) > 0 &&
                  selected.status !== "cancelled" && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerQuickCollect(selected);
                        setSelected(null);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-amber-500 px-4 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-400 transition"
                    >
                      <HandCoins className="h-4 w-4" />
                      <span>{isRtl ? "تحصيل الدفعة الآن" : "Collect Payment"}</span>
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => setPrintOpen(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-95 transition"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isRtl ? "طباعة الفاتورة" : "Print"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="h-9 rounded-lg border border-border bg-surface px-4 text-xs font-medium text-foreground hover:bg-surface-2 transition"
                >
                  {isRtl ? "إغلاق" : "Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Print Selection Dialog */}
      {printOpen && selected && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setPrintOpen(false)}
        >
          <div className="panel-elevated w-full max-w-xl p-6 shadow-2xl border border-border/80" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">
                  {isRtl ? "خيارات ونماذج الطباعة الفاخرة" : "Invoice Print Templates"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isRtl ? "اختر القالب الأنسب لطابعتك ونوع الورق" : "Select the best template for your printer"}
                </p>
              </div>
              <button
                onClick={() => setPrintOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <TemplateCard
                icon={<ScrollText className="h-6 w-6 text-amber-500" />}
                title={isRtl ? "فاتورة حرارية" : "Thermal Receipt"}
                desc={isRtl ? "طابعات الكاشير 80mm و 58mm" : "Cashier POS rolls (80mm/58mm)"}
                accent="from-amber-500/20 to-orange-500/10 border-amber-500/30"
                onClick={() => doPrint("thermal")}
              />
              <TemplateCard
                icon={<Printer className="h-6 w-6 text-blue-500" />}
                title={isRtl ? "قياسي A4" : "Standard A4"}
                desc={isRtl ? "نموذج رسمي كلاسيكي متكامل" : "Classic official corporate layout"}
                accent="from-blue-500/20 to-indigo-500/10 border-blue-500/30"
                onClick={() => doPrint("standard")}
              />
              <TemplateCard
                icon={<Sparkles className="h-6 w-6 text-yellow-500" />}
                title={isRtl ? "تصميم فاخر" : "Luxury Elegant"}
                desc={isRtl ? "تنسيق تنفيذي أنيق لكبار العملاء" : "VIP executive styled format"}
                accent="from-yellow-500/20 via-amber-500/10 to-rose-500/10 border-yellow-500/40"
                onClick={() => doPrint("elegant")}
              />
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border/80 pt-4">
              <button
                type="button"
                onClick={doPDF}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-xs font-medium text-foreground hover:bg-surface-2 transition"
              >
                <FileDown className="h-4 w-4" />
                <span>{isRtl ? "تنزيل نسخة PDF" : "Download PDF"}</span>
              </button>

              <button
                type="button"
                onClick={() => setPrintOpen(false)}
                className="h-9 rounded-lg border border-border bg-surface px-4 text-xs font-medium text-foreground hover:bg-surface-2"
              >
                {isRtl ? "إلغاء" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vortex Collection Sheet for Quick Collection */}
      <VortexCollectionSheet
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        customer={
          collectionTarget
            ? {
                id: collectionTarget.customerId || "temp",
                name: collectionTarget.customerName,
                phone: collectionTarget.phone,
                balance: collectionTarget.balance,
              }
            : null
        }
        onSavePayment={handleSaveCollection}
        onSuccess={() => {
          void load();
        }}
      />

      {/* Bottom Floating/Docked View Switcher & Record Counter */}
      <div className="sticky bottom-4 z-20 mx-auto mt-6 flex max-w-fit items-center gap-3 rounded-2xl border border-border/80 bg-background/90 px-4 py-2 shadow-lg backdrop-blur-md">
        <span className="text-xs font-medium text-muted-foreground">
          {isRtl ? `إجمالي الفواتير: ${filteredRows.length}` : `Total Invoices: ${filteredRows.length}`}
        </span>
        <div className="h-4 w-px bg-border" />
        <div className="flex items-center rounded-xl border border-border bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              viewMode === "table"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            <span>{isRtl ? "جدول" : "Table"}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              viewMode === "grid"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span>{isRtl ? "بطاقات" : "Grid"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  icon,
  title,
  desc,
  accent,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 text-start transition hover:scale-[1.02] hover:shadow-lg ${accent}`}
    >
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-background/70 backdrop-blur">
        {icon}
      </div>
      <div className="text-sm font-bold text-foreground">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</div>
    </button>
  );
}
