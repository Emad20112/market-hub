import { cn } from "@/lib/utils";
import { usePersistedViewMode } from "@/hooks/use-persisted-view-mode";
import { RecordsViewToggle } from "@/components/ui/records-view-toggle";
import type { RecordsViewMode } from "@/components/ui/records-view";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wheat,
  Truck,
  Receipt,
  FileText,
  Eye,
  Printer,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Clock,
  Copy,
  Check,
  Phone,
  Building2,
  SlidersHorizontal,
  Wallet,
  Scale,
  PackageCheck,
  Inbox,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { useModules } from "@/lib/modules";
import { money } from "@/lib/format";
import { toSystemDigits } from "@/lib/format-preferences";
import { LuxuryPrintPreviewModal } from "@/components/luxury-print-preview-modal";
import {
  VortexMetricCard,
  VortexSearchInput,
  VortexDateBadge,
  VortexFilterSheet,
  VortexFilterSection,
  VortexCollectionSheet,
} from "@/components/vortex-ui";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { type DataTableColumn, type DataTableSort } from "@/components/ui/data-table";
import { RecordsView } from "@/components/ui/records-view";
import { IconButton } from "@/components/ui/icon-button";
import { useBreakpoint } from "@/design/breakpoints";
import { PaymentMethodChip } from "@/components/ui/payment-method";
import { AmountInput } from "@/components/ui/amount-input";
import {
  MillingRecordDetailsSheet,
  type UnifiedMillingRecord,
  type MillingRecordDetailLine,
} from "@/components/milling/milling-record-details-sheet";
import {
  buildMillingDocumentUnifiedDoc,
  buildCustodyDeliveryDoc,
  fetchMillingDocumentDetails,
} from "@/lib/milling/custody";
import type { UnifiedDocumentData } from "@/lib/templates/types";
import { buildWhatsAppLink, isValidWhatsAppPhone } from "@/lib/communication";

export const Route = createFileRoute("/_app/milling/records")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    customerId?: string;
    type?: "all" | "intake" | "delivery";
  } => ({
    customerId: typeof search.customerId === "string" ? search.customerId : undefined,
    type: search.type === "intake" || search.type === "delivery" ? search.type : undefined,
  }),
  head: () => ({ meta: [{ title: "سجلات الاستلام والتسليم — فورتكس ERP" }] }),
  component: MillingRecordsPage,
});

type StatusTab = "all" | "intake" | "delivery" | "unpaid" | "paid";

export function MillingRecordsPage() {
  const { customerId: searchCustomerId, type: searchType } = useSearch({
    from: "/_app/milling/records",
  });
  const { t, lang } = useI18n();
  const { isModuleEnabled } = useModules();
  const hasMultiWarehouse = isModuleEnabled("multi_warehouse");
  const qc = useQueryClient();
  const breakpoint = useBreakpoint();
  const tableUsesHorizontalScroll =
    breakpoint === "xs" || breakpoint === "sm" || breakpoint === "md";

  const isRtl = lang === "ar";

  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<StatusTab>(
    searchType === "intake" ? "intake" : searchType === "delivery" ? "delivery" : "all",
  );
  const [viewMode, setViewMode] = usePersistedViewMode("milling-records", "cards");
  const [sort, setSort] = useState<DataTableSort | null>(null);

  // Filter Sheet State
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterWarehouse, setFilterWarehouse] = useState<string>("all");
  const [filterDatePreset, setFilterDatePreset] = useState<string>("all");
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all");
  const [minAmount, setMinAmount] = useState<number | null>(null);
  const [maxAmount, setMaxAmount] = useState<number | null>(null);

  // Details Sheet State
  const [selectedRecord, setSelectedRecord] = useState<UnifiedMillingRecord | null>(null);
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);

  // Print Preview Modal State
  const [printDoc, setPrintDoc] = useState<UnifiedDocumentData | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [isGeneratingPrint, setIsGeneratingPrint] = useState(false);

  // Quick Collection Sheet State
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionTarget, setCollectionTarget] = useState<{
    invoiceId: string;
    customerId: string | null;
    customerName: string;
    phone?: string;
    balance: number;
  } | null>(null);

  // Fetch Milling Records Query
  const {
    data: records = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["milling-records-list"],
    queryFn: async (): Promise<UnifiedMillingRecord[]> => {
      // 1. Fetch milling service documents (Intake operations & full cycles)
      const { data: serviceDocs, error: sErr } = await (supabase as any)
        .from("milling_service_documents")
        .select(
          `
          id, document_number, customer_id, warehouse_id, sales_invoice_id, status,
          received_at, processed_at, delivered_at, created_at, billing_basis, fee_per_unit, fee_quantity,
          customers(id, name, phone, balance, is_system),
          warehouses(id, name, name_ar),
          sales_invoices(id, invoice_number, status, subtotal, discount, tax, total, paid, payment_method, payment_status, note)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (sErr) {
        console.error("Error fetching milling service documents:", sErr);
        toast.error(isRtl ? "تعذر تحميل مستندات المطحنة" : "Failed to load milling documents");
        throw sErr;
      }

      // 2. Fetch custody ledger lines for detail items (Intake & Delivery)
      const { data: rawLines, error: cErr } = await (supabase as any)
        .from("custody_ledger")
        .select(
          `
          id, customer_id, warehouse_id, entry_type, item_id, doc_number,
          bags_in, bags_out, kg_in, kg_out, milling_document_id, notes, created_at,
          products(id, name, name_ar, sku),
          customers(id, name, phone, balance, is_system),
          warehouses(id, name, name_ar)
        `,
        )
        .in("entry_type", ["INTAKE", "DELIVERY"])
        .order("created_at", { ascending: false })
        .limit(1000);

      if (cErr) {
        console.warn("Could not fetch custody ledger details:", cErr);
      }

      const allCustodyLines = (rawLines ?? []) as any[];

      // Group custody lines by milling_document_id
      const linesByDocId = new Map<string, MillingRecordDetailLine[]>();
      // Group standalone delivery lines by doc_number
      const standaloneDeliveriesByDocNum = new Map<string, any[]>();

      for (const line of allCustodyLines) {
        const detailLine: MillingRecordDetailLine = {
          id: line.id,
          entry_type: line.entry_type,
          item_name:
            line.products?.name_ar ||
            line.products?.name ||
            (isRtl ? "صنف غير مسمى" : "Unnamed item"),
          item_sku: line.products?.sku || null,
          bags_in: Number(line.bags_in || 0),
          bags_out: Number(line.bags_out || 0),
          kg_in: Number(line.kg_in || 0),
          kg_out: Number(line.kg_out || 0),
          notes: line.notes || null,
        };

        if (line.milling_document_id) {
          const existing = linesByDocId.get(line.milling_document_id) ?? [];
          existing.push(detailLine);
          linesByDocId.set(line.milling_document_id, existing);
        } else if (line.entry_type === "DELIVERY" && line.doc_number) {
          const existing = standaloneDeliveriesByDocNum.get(line.doc_number) ?? [];
          existing.push(line);
          standaloneDeliveriesByDocNum.set(line.doc_number, existing);
        }
      }

      const result: UnifiedMillingRecord[] = [];

      // Process milling service documents
      for (const doc of (serviceDocs ?? []) as any[]) {
        const docLines = linesByDocId.get(doc.id) ?? [];
        const intakeLines = docLines.filter((l) => l.entry_type === "INTAKE");
        const deliveryLines = docLines.filter((l) => l.entry_type === "DELIVERY");

        const totalIntakeBags = intakeLines.reduce((s, l) => s + l.bags_in, 0);
        const totalIntakeKg = intakeLines.reduce((s, l) => s + l.kg_in, 0);
        const totalDeliveredBags = deliveryLines.reduce((s, l) => s + l.bags_out, 0);
        const totalDeliveredKg = deliveryLines.reduce((s, l) => s + l.kg_out, 0);

        const intakeNames = Array.from(new Set(intakeLines.map((l) => l.item_name))).join("، ");
        const deliveryNames = Array.from(new Set(deliveryLines.map((l) => l.item_name))).join("، ");

        const inv = doc.sales_invoices;
        const subtotal = Number(inv?.subtotal ?? 0);
        const discount = Number(inv?.discount ?? 0);
        const tax = Number(inv?.tax ?? 0);
        const total = Number(inv?.total ?? 0);
        const paid = Number(inv?.paid ?? 0);
        const remaining = Math.max(0, total - paid);

        const isDelivered =
          doc.status === "DELIVERED" || totalDeliveredBags > 0 || totalDeliveredKg > 0;
        const recordType: UnifiedMillingRecord["record_type"] =
          isDelivered && totalIntakeBags > 0
            ? "INTAKE_DELIVERY"
            : isDelivered
              ? "DELIVERY"
              : "INTAKE";

        result.push({
          id: doc.id,
          document_number: doc.document_number || `MIL-${doc.id.slice(0, 8)}`,
          record_type: recordType,
          status: doc.status as any,
          created_at: doc.received_at || doc.created_at,
          customer_id: doc.customer_id,
          customer_name: doc.customers?.name || (isRtl ? "عميل نقدي" : "Cash Customer"),
          customer_phone: doc.customers?.phone || null,
          customer_balance: doc.customers?.balance ?? undefined,
          warehouse_id: doc.warehouse_id,
          warehouse_name: isRtl
            ? doc.warehouses?.name_ar || doc.warehouses?.name || "المستودع الرئيسي"
            : doc.warehouses?.name || doc.warehouses?.name_ar || "Main Warehouse",
          total_intake_bags: totalIntakeBags,
          total_intake_kg: totalIntakeKg,
          total_delivered_bags: totalDeliveredBags,
          total_delivered_kg: totalDeliveredKg,
          intake_summary: intakeNames ? `${intakeNames} (${totalIntakeBags} كيس)` : "",
          delivery_summary: deliveryNames ? `${deliveryNames} (${totalDeliveredBags} كيس)` : "",
          invoice_id: inv?.id || doc.sales_invoice_id || null,
          invoice_number: inv?.invoice_number || null,
          invoice_status: inv?.status || null,
          billing_basis: doc.billing_basis || null,
          fee_per_unit: Number(doc.fee_per_unit) || null,
          fee_quantity: Number(doc.fee_quantity) || null,
          subtotal,
          discount,
          tax,
          total,
          paid,
          remaining,
          payment_method: inv?.payment_method || null,
          payment_status: inv?.payment_status || null,
          note: inv?.note || null,
          lines: docLines,
          raw_service_doc: doc,
        });
      }

      // Process standalone delivery vouchers (from custodyDelivery)
      for (const [docNum, dLines] of standaloneDeliveriesByDocNum.entries()) {
        const first = dLines[0];
        const lines: MillingRecordDetailLine[] = dLines.map((l) => ({
          id: l.id,
          entry_type: "DELIVERY" as const,
          item_name:
            l.products?.name_ar || l.products?.name || (isRtl ? "صنف غير مسمى" : "Unnamed item"),
          item_sku: l.products?.sku || null,
          bags_in: 0,
          bags_out: Number(l.bags_out || 0),
          kg_in: 0,
          kg_out: Number(l.kg_out || 0),
          notes: l.notes || null,
        }));

        const totalBags = lines.reduce((s, l) => s + l.bags_out, 0);
        const totalKg = lines.reduce((s, l) => s + l.kg_out, 0);
        const names = Array.from(new Set(lines.map((l) => l.item_name))).join("، ");

        result.push({
          id: first.id,
          document_number: docNum,
          record_type: "DELIVERY",
          status: "DELIVERED",
          created_at: first.created_at,
          customer_id: first.customer_id,
          customer_name: first.customers?.name || (isRtl ? "عميل نقدي" : "Cash Customer"),
          customer_phone: first.customers?.phone || null,
          customer_balance: first.customers?.balance ?? undefined,
          warehouse_id: first.warehouse_id,
          warehouse_name: isRtl
            ? first.warehouses?.name_ar || first.warehouses?.name || "المستودع الرئيسي"
            : first.warehouses?.name || first.warehouses?.name_ar || "Main Warehouse",
          total_intake_bags: 0,
          total_intake_kg: 0,
          total_delivered_bags: totalBags,
          total_delivered_kg: totalKg,
          intake_summary: "",
          delivery_summary: names ? `${names} (${totalBags} كيس)` : "",
          invoice_id: null,
          invoice_number: null,
          invoice_status: null,
          billing_basis: null,
          fee_per_unit: null,
          fee_quantity: null,
          subtotal: 0,
          discount: 0,
          tax: 0,
          total: 0,
          paid: 0,
          remaining: 0,
          payment_method: null,
          payment_status: null,
          note: first.notes || null,
          lines,
          raw_service_doc: null,
        });
      }

      // Sort chronological descending
      return result.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    },
    staleTime: 30_000,
  });

  // Realtime subscription to refresh on new entries
  useEffect(() => {
    const channel = supabase
      .channel("milling-records-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "milling_service_documents" },
        () => {
          void refetch();
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "custody_ledger" }, () => {
        void refetch();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  // Overall Statistics / Metrics
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let intakeCount = 0;
    let deliveryCount = 0;
    let totalIntakeBags = 0;
    let totalIntakeKg = 0;
    let totalDeliveredBags = 0;
    let totalDeliveredKg = 0;

    for (const r of records) {
      if (r.invoice_status !== "cancelled") {
        totalRevenue += r.total;
        totalPaid += r.paid;
        totalPending += r.remaining;
      }

      if (r.total > 0) {
        if (r.remaining <= 0) paidCount++;
        else unpaidCount++;
      }

      if (r.record_type === "INTAKE" || r.record_type === "INTAKE_DELIVERY") {
        intakeCount++;
      }
      if (r.record_type === "DELIVERY" || r.record_type === "INTAKE_DELIVERY") {
        deliveryCount++;
      }

      totalIntakeBags += r.total_intake_bags;
      totalIntakeKg += r.total_intake_kg;
      totalDeliveredBags += r.total_delivered_bags;
      totalDeliveredKg += r.total_delivered_kg;
    }

    return {
      totalRevenue,
      totalPaid,
      totalPending,
      paidCount,
      unpaidCount,
      intakeCount,
      deliveryCount,
      totalCount: records.length,
      totalIntakeBags,
      totalIntakeKg,
      totalDeliveredBags,
      totalDeliveredKg,
    };
  }, [records]);

  // Unique Warehouses for Filter
  const availableWarehouses = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (r.warehouse_id && r.warehouse_name) {
        map.set(r.warehouse_id, r.warehouse_name);
      }
    }
    return Array.from(map.entries());
  }, [records]);

  // Filtered & Sorted Rows
  const filteredRows = useMemo(() => {
    return records.filter((r) => {
      // 1. Status Tab Filter
      if (statusTab === "intake") {
        if (r.record_type !== "INTAKE" && r.record_type !== "INTAKE_DELIVERY") return false;
      } else if (statusTab === "delivery") {
        if (r.record_type !== "DELIVERY" && r.record_type !== "INTAKE_DELIVERY") return false;
      } else if (statusTab === "unpaid") {
        if (r.remaining <= 0) return false;
      } else if (statusTab === "paid") {
        if (r.total <= 0 || r.remaining > 0) return false;
      }

      // 2. Customer ID Filter
      if (searchCustomerId && r.customer_id !== searchCustomerId) {
        return false;
      }

      // 3. Search query
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const docNum = r.document_number.toLowerCase();
        const invNum = (r.invoice_number ?? "").toLowerCase();
        const custName = r.customer_name.toLowerCase();
        const custPhone = (r.customer_phone ?? "").toLowerCase();
        const intSummary = r.intake_summary.toLowerCase();
        const delSummary = r.delivery_summary.toLowerCase();

        if (
          !docNum.includes(q) &&
          !invNum.includes(q) &&
          !custName.includes(q) &&
          !custPhone.includes(q) &&
          !intSummary.includes(q) &&
          !delSummary.includes(q)
        ) {
          return false;
        }
      }

      // 4. Warehouse filter
      if (filterWarehouse !== "all" && r.warehouse_id !== filterWarehouse) {
        return false;
      }

      // 5. Payment method filter
      if (filterPaymentMethod !== "all" && r.payment_method !== filterPaymentMethod) {
        return false;
      }

      // 6. Min/Max amount
      if (minAmount != null && r.total < minAmount) return false;
      if (maxAmount != null && r.total > maxAmount) return false;

      // 7. Date presets
      if (filterDatePreset !== "all") {
        const recDate = new Date(r.created_at);
        const now = new Date();
        if (filterDatePreset === "today") {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (recDate < startOfToday) return false;
        } else if (filterDatePreset === "week") {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          if (recDate < weekAgo) return false;
        } else if (filterDatePreset === "month") {
          const monthAgo = new Date();
          monthAgo.setDate(now.getDate() - 30);
          if (recDate < monthAgo) return false;
        }
      }

      return true;
    });
  }, [
    records,
    statusTab,
    searchCustomerId,
    search,
    filterWarehouse,
    filterPaymentMethod,
    minAmount,
    maxAmount,
    filterDatePreset,
  ]);

  // Copy document number helper
  const copyDocNumber = (docNum: string, id: string) => {
    navigator.clipboard.writeText(docNum);
    setCopiedDocId(id);
    toast.success(isRtl ? `تم نسخ رقم المستند: ${docNum}` : `Copied document number: ${docNum}`);
    setTimeout(() => setCopiedDocId(null), 2000);
  };

  // Quick Collect trigger
  const triggerQuickCollect = (record: UnifiedMillingRecord) => {
    if (!record.invoice_id) {
      toast.warning(
        isRtl ? "لا توجد فاتورة أجور مربوطة بهذا السند" : "No fee invoice linked to this voucher",
      );
      return;
    }
    setCollectionTarget({
      invoiceId: record.invoice_id,
      customerId: record.customer_id,
      customerName: record.customer_name,
      phone: record.customer_phone || undefined,
      balance: record.remaining,
    });
    setCollectionOpen(true);
  };

  // WhatsApp Share trigger
  const shareWhatsApp = (record: UnifiedMillingRecord) => {
    if (!record.customer_phone || !isValidWhatsAppPhone(record.customer_phone)) {
      toast.warning(isRtl ? "لا يوجد رقم هاتف صالح للعميل" : "No valid phone number for customer");
      return;
    }

    const typeTitle =
      record.record_type === "INTAKE"
        ? "سند استلام حبوب وأجور"
        : record.record_type === "DELIVERY"
          ? "سند تسليم حبوب ونواتج"
          : "سند استلام وتسليم موحد";

    const linesSummary = record.lines
      .map((l) => {
        const q =
          l.bags_in > 0
            ? `${l.bags_in} كيس (${l.kg_in} كجم)`
            : `${l.bags_out} كيس (${l.kg_out} كجم)`;
        return `• ${l.item_name}: ${q}`;
      })
      .join("\n");

    const financialSummary =
      record.total > 0
        ? `\n💰 قيمة الأجور: ${money(record.total)}\n✅ المدفوع: ${money(record.paid)}\n⏳ المتبقي: ${money(record.remaining)}`
        : "";

    const message = `السلام عليكم ورحمة الله،\nعزيزنا العميل: *${record.customer_name}*\n\nنحيطكم علماً بتفاصيل *${typeTitle}* رقم: *${record.document_number}*\nبتاريخ: ${new Date(record.created_at).toLocaleDateString("ar-EG")}\n\n📦 *تفاصيل الأصناف والكميات:*\n${linesSummary}${financialSummary}\n\nشكراً لتعاملكم معنا.`;

    const url = buildWhatsAppLink(record.customer_phone, message);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Print Preview trigger
  const handleOpenPrintPreview = async (record: UnifiedMillingRecord) => {
    setIsGeneratingPrint(true);
    try {
      if (record.raw_service_doc) {
        // Detailed milling service document with all lines
        const details = await fetchMillingDocumentDetails(record.id);
        if (details) {
          const uDoc = buildMillingDocumentUnifiedDoc(
            details,
            record.record_type === "DELIVERY" ? "delivery" : "intake",
          );
          setPrintDoc(uDoc);
          setPrintOpen(true);
          return;
        }
      }

      // Standalone delivery or custom built doc
      if (record.record_type === "DELIVERY") {
        const uDoc = buildCustodyDeliveryDoc({
          docNumber: record.document_number,
          customerName: record.customer_name,
          customerPhone: record.customer_phone,
          warehouseName: record.warehouse_name,
          lines: record.lines.map((l) => ({
            itemName: l.item_name,
            previousBags: l.bags_out,
            previousKg: l.kg_out,
            deliveredBags: l.bags_out,
            deliveredKg: l.kg_out,
            remainingBags: 0,
            remainingKg: 0,
          })),
          date: record.created_at,
          notes: record.note || undefined,
        });
        setPrintDoc(uDoc);
        setPrintOpen(true);
        return;
      }

      // Fallback unified document
      const fallbackDoc: UnifiedDocumentData = {
        docType: "mill_document",
        title:
          record.record_type === "INTAKE"
            ? "سند استلام حبوب وفاتورة أجور"
            : "سند تسليم حبوب ونواتج",
        number: record.document_number,
        relatedRef: record.invoice_number ? `فاتورة رقم ${record.invoice_number}` : undefined,
        date: record.created_at,
        partyLabel: isRtl ? "العميل:" : "Customer:",
        partyName: record.customer_name,
        partyPhone: record.customer_phone || undefined,
        warehouse: record.warehouse_name,
        movementType: record.record_type === "INTAKE" ? "استلام حبوب" : "تسليم نواتج وحبوب",
        status:
          record.status === "DELIVERED"
            ? "تم التسليم"
            : record.status === "PROCESSED"
              ? "تم الطحن"
              : "مستلم",
        lines: record.lines.map((l) => ({
          product: l.item_name,
          qty: l.bags_in > 0 ? l.bags_in : l.bags_out > 0 ? l.bags_out : l.kg_in || l.kg_out,
          unit: l.bags_in > 0 || l.bags_out > 0 ? "كيس" : "كجم",
          price: 0,
          total: 0,
          note: l.kg_in > 0 ? `${l.kg_in} كجم` : l.kg_out > 0 ? `${l.kg_out} كجم` : undefined,
        })),
        notes: record.note || undefined,
        options: {
          showFinancialDetails: record.total > 0,
          showPaymentInfo: Boolean(record.payment_method),
          showBarcode: true,
          showSignatures: true,
        },
      };

      setPrintDoc(fallbackDoc);
      setPrintOpen(true);
    } catch (err) {
      console.error("Print generation error:", err);
      toast.error(isRtl ? "تعذر تجهيز مستند الطباعة" : "Failed to prepare print document");
    } finally {
      setIsGeneratingPrint(false);
    }
  };

  // Status Badge Component
  const renderRecordStatusBadge = (r: UnifiedMillingRecord) => {
    if (r.record_type === "DELIVERY" || r.status === "DELIVERED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <PackageCheck className="size-3" />
          <span>{isRtl ? "مُسلَّم بالكامل" : "Delivered"}</span>
        </span>
      );
    }
    if (r.status === "PROCESSED") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
          <Clock className="size-3" />
          <span>{isRtl ? "مطحون (بانتظار التسليم)" : "Processed"}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
        <Inbox className="size-3" />
        <span>{isRtl ? "الكمية المستلمة" : "Received"}</span>
      </span>
    );
  };

  // Table Columns Definition
  const tableColumns: DataTableColumn<UnifiedMillingRecord>[] = useMemo(() => {
    return [
      {
        key: "document_number",
        header: isRtl ? "رقم السند" : "Doc #",
        sortable: true,
        width: "w-[150px]",
        cell: (r) => (
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-foreground">
            <span className="truncate">{r.document_number}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                copyDocNumber(r.document_number, r.id);
              }}
              className="text-muted-foreground/60 transition hover:text-foreground"
            >
              {copiedDocId === r.id ? (
                <Check className="size-3 text-emerald-500" />
              ) : (
                <Copy className="size-3" />
              )}
            </button>
          </div>
        ),
      },
      {
        key: "created_at",
        header: isRtl ? "التاريخ" : "Date",
        sortable: true,
        width: "w-[130px]",
        cell: (r) => <VortexDateBadge date={r.created_at} variant="subtle" size="sm" />,
      },
      {
        key: "customer",
        header: isRtl ? "العميل" : "Customer",
        sortable: true,
        width: "w-[180px]",
        cell: (r) => (
          <div className="min-w-0">
            <div className="font-bold text-xs text-foreground truncate">{r.customer_name}</div>
            {r.customer_phone && (
              <div className="font-mono text-[10px] text-muted-foreground" dir="ltr">
                {toSystemDigits(r.customer_phone)}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "type",
        header: isRtl ? "نوع السند" : "Type",
        width: "w-[120px]",
        cell: (r) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-bold",
              r.record_type === "INTAKE"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                : r.record_type === "DELIVERY"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20",
            )}
          >
            {r.record_type === "INTAKE" ? (
              <>
                <Wheat className="size-3" />
                <span>{isRtl ? "استلام" : "Intake"}</span>
              </>
            ) : r.record_type === "DELIVERY" ? (
              <>
                <Truck className="size-3" />
                <span>{isRtl ? "تسليم" : "Delivery"}</span>
              </>
            ) : (
              <>
                <PackageCheck className="size-3" />
                <span>{isRtl ? "استلام وتسليم" : "Intake & Delivery"}</span>
              </>
            )}
          </span>
        ),
      },
      {
        key: "quantities",
        header: isRtl ? "تفاصيل الكميات" : "Quantities",
        cell: (r) => {
          if (r.record_type === "INTAKE") {
            return (
              <div className="text-xs">
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {r.total_intake_bags} {isRtl ? "كيس" : "bags"}
                </span>
                {r.total_intake_kg > 0 && (
                  <span className="text-muted-foreground text-[11px]">
                    {" "}
                    ({r.total_intake_kg.toLocaleString()} كجم)
                  </span>
                )}
                {r.intake_summary && (
                  <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                    {r.intake_summary}
                  </div>
                )}
              </div>
            );
          }
          if (r.record_type === "DELIVERY") {
            return (
              <div className="text-xs">
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {r.total_delivered_bags} {isRtl ? "كيس" : "bags"}
                </span>
                {r.total_delivered_kg > 0 && (
                  <span className="text-muted-foreground text-[11px]">
                    {" "}
                    ({r.total_delivered_kg.toLocaleString()} كجم)
                  </span>
                )}
                {r.delivery_summary && (
                  <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                    {r.delivery_summary}
                  </div>
                )}
              </div>
            );
          }
          return (
            <div className="text-xs">
              <span className="font-mono font-bold text-amber-600">
                وارد {r.total_intake_bags} كيس
              </span>
              {" · "}
              <span className="font-mono font-bold text-emerald-600">
                منصرف {r.total_delivered_bags} كيس
              </span>
            </div>
          );
        },
      },
      {
        key: "financials",
        header: isRtl ? "قيمة الأجور / السداد" : "Fees / Payment",
        align: "end",
        width: "w-[150px]",
        cell: (r) => {
          if (r.total <= 0) {
            return <span className="text-muted-foreground/60 text-[11px]">—</span>;
          }
          return (
            <div className="flex flex-col items-end">
              <span className="font-mono text-xs font-bold text-foreground">
                {toSystemDigits(money(r.total))}
              </span>
              {r.remaining > 0 ? (
                <span className="font-mono text-[10px] font-semibold text-rose-500">
                  {isRtl ? "متبقي: " : "Due: "}
                  {toSystemDigits(money(r.remaining))}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-emerald-500">
                  {isRtl ? "خالص ومسدد" : "Fully paid"}
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: "status",
        header: isRtl ? "الحالة" : "Status",
        width: "w-[130px]",
        cell: (r) => renderRecordStatusBadge(r),
      },
      {
        key: "actions",
        header: isRtl ? "الإجراءات" : "Actions",
        align: "end",
        width: "w-[140px]",
        cell: (r) => (
          <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {r.remaining > 0 && (
              <IconButton
                size="sm"
                variant="outline"
                tooltip
                ariaLabel={isRtl ? "تحصيل سريع" : "Quick Collect"}
                icon={<Wallet className="text-amber-500" />}
                round
                onClick={() => triggerQuickCollect(r)}
              />
            )}
            <IconButton
              size="sm"
              variant="ghost"
              tooltip
              ariaLabel={isRtl ? "طباعة" : "Print"}
              icon={<Printer />}
              round
              onClick={() => void handleOpenPrintPreview(r)}
            />
            {r.customer_phone && (
              <IconButton
                size="sm"
                variant="ghost"
                tooltip
                ariaLabel={isRtl ? "واتساب" : "WhatsApp"}
                icon={<WhatsAppIcon className="size-3.5 text-emerald-500" />}
                round
                onClick={() => shareWhatsApp(r)}
              />
            )}
            <IconButton
              size="sm"
              variant="ghost"
              tooltip
              ariaLabel={isRtl ? "عرض التفاصيل" : "View Details"}
              icon={<Eye />}
              round
              onClick={() => setSelectedRecord(r)}
            />
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRtl, copiedDocId]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <PageHeader
        title={isRtl ? "سجلات ومستندات المطحنة" : "Milling Custody Records"}
        subtitle={
          isRtl
            ? "أرشيف وسجلات مستندات استلام الحبوب وتسليم النواتج وفواتير الأجور المرتبطة مع الفلترة، التحصيل، ومشاركة واتساب وإعادة الطباعة"
            : "Archive and records of grain intake, output delivery, and associated fee invoices with reprinting, collection, and WhatsApp"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/milling/intake"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-xs transition hover:bg-primary/90"
            >
              <Plus className="size-4" />
              <span>{isRtl ? "سند استلام جديد" : "New Intake"}</span>
            </Link>

            <Link
              to="/milling/delivery"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-xs font-bold text-foreground shadow-xs transition hover:bg-muted"
            >
              <Truck className="size-4 text-emerald-500" />
              <span>{isRtl ? "سند تسليم جديد" : "New Delivery"}</span>
            </Link>
          </div>
        }
      />

      {/* Metric Cards Banner (Exact styling as Sales) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <VortexMetricCard
          title={isRtl ? "إيراد أجور الطحن" : "Milling Fee Revenue"}
          value={toSystemDigits(money(metrics.totalRevenue))}
          subtitle={
            isRtl ? `من ${metrics.totalCount} سند ومستند` : `From ${metrics.totalCount} docs`
          }
          icon={<Receipt className="size-4" />}
          tone="default"
        />

        <VortexMetricCard
          title={isRtl ? "المحصّل الفعلي" : "Collected Amount"}
          value={toSystemDigits(money(metrics.totalPaid))}
          subtitle={
            isRtl ? `${metrics.paidCount} سند مسدد بالكامل` : `${metrics.paidCount} fully paid`
          }
          icon={<Wallet className="size-4 text-emerald-500" />}
          tone="success"
        />

        <VortexMetricCard
          title={isRtl ? "المتبقي والآجل" : "Pending / Due"}
          value={toSystemDigits(money(metrics.totalPending))}
          subtitle={
            isRtl
              ? `${metrics.unpaidCount} سند بانتظار التحصيل`
              : `${metrics.unpaidCount} pending collection`
          }
          icon={<AlertCircle className="size-4 text-rose-500" />}
          tone={metrics.totalPending > 0 ? "danger" : "default"}
        />

        <VortexMetricCard
          title={isRtl ? "الحبوب المستلمة" : "Grains Received"}
          value={`${metrics.totalIntakeBags.toLocaleString()} ${isRtl ? "كيس" : "bags"}`}
          subtitle={
            isRtl
              ? `إجمالي ${metrics.totalIntakeKg.toLocaleString()} كجم`
              : `Total ${metrics.totalIntakeKg.toLocaleString()} kg`
          }
          icon={<Wheat className="size-4 text-amber-500" />}
          tone="warning"
        />

        <VortexMetricCard
          title={isRtl ? "النواتج المسلّمة" : "Outputs Delivered"}
          value={`${metrics.totalDeliveredBags.toLocaleString()} ${isRtl ? "كيس" : "bags"}`}
          subtitle={
            isRtl
              ? `إجمالي ${metrics.totalDeliveredKg.toLocaleString()} كجم`
              : `Total ${metrics.totalDeliveredKg.toLocaleString()} kg`
          }
          icon={<Truck className="size-4 text-teal-500" />}
          tone="info"
        />
      </div>

      {/* Tabs & Controls Bar */}
      <div className="flex flex-col gap-4">
        {/* Quick Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-3">
          {[
            { id: "all" as const, label: isRtl ? "الكل" : "All", count: metrics.totalCount },
            {
              id: "intake" as const,
              label: isRtl ? "سندات الاستلام" : "Intakes",
              count: metrics.intakeCount,
            },
            {
              id: "delivery" as const,
              label: isRtl ? "سندات التسليم" : "Deliveries",
              count: metrics.deliveryCount,
            },
            {
              id: "unpaid" as const,
              label: isRtl ? "بانتظار التحصيل (آجل)" : "Pending Due",
              count: metrics.unpaidCount,
            },
            {
              id: "paid" as const,
              label: isRtl ? "مسدد بالكامل" : "Paid",
              count: metrics.paidCount,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition",
                statusTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "bg-surface-1 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                  statusTab === tab.id
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar: Search, Filters, View Modes, Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[280px] flex-1 items-center gap-2 sm:max-w-md">
            <VortexSearchInput
              value={search}
              onChange={setSearch}
              placeholder={
                isRtl
                  ? "بحث برقم السند / العميل / الهاتف / الصنف…"
                  : "Search doc #, customer, phone, item…"
              }
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2 ms-auto">
            <button
              type="button"
              onClick={() => setFilterOpen(true)}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-bold transition hover:bg-muted",
                (filterWarehouse !== "all" ||
                  filterDatePreset !== "all" ||
                  filterPaymentMethod !== "all" ||
                  minAmount != null ||
                  maxAmount != null) &&
                  "border-primary text-primary bg-primary/5",
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>{isRtl ? "تصفية متقدمة" : "Filter"}</span>
            </button>

            <RecordsViewToggle
              value={viewMode}
              onChange={(mode) => setViewMode(mode as RecordsViewMode)}
            />

            <button
              type="button"
              onClick={() => void refetch()}
              className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title={isRtl ? "تحديث" : "Refresh"}
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  (isLoading || isRefetching) && "animate-spin text-primary",
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Main Records List / Table / Cards */}
      <RecordsView<UnifiedMillingRecord>
        viewMode={viewMode}
        rows={filteredRows}
        loading={isLoading}
        columns={tableColumns}
        getRowId={(r) => r.id}
        onRowClick={(record) => setSelectedRecord(record)}
        renderCard={(r) => {
          const isIntakeDoc = r.record_type === "INTAKE" || r.record_type === "INTAKE_DELIVERY";
          const isDeliveredDoc =
            r.record_type === "DELIVERY" || r.record_type === "INTAKE_DELIVERY";

          return (
            <div
              key={r.id}
              onClick={() => setSelectedRecord(r)}
              className="card-mullak group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 transition-all duration-200 hover:border-primary/50 hover:shadow-md cursor-pointer"
            >
              <div>
                {/* Top Strip */}
                <div className="flex items-start justify-between gap-2 border-b border-border/60 pb-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl border shadow-2xs",
                        isIntakeDoc
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {isIntakeDoc ? <Wheat className="size-4" /> : <Truck className="size-4" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-black text-foreground">
                          {r.document_number}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyDocNumber(r.document_number, r.id);
                          }}
                          className="text-muted-foreground/50 transition hover:text-foreground"
                        >
                          {copiedDocId === r.id ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.record_type === "INTAKE"
                          ? isRtl
                            ? "سند استلام حبوب"
                            : "Grain Intake"
                          : r.record_type === "DELIVERY"
                            ? isRtl
                              ? "سند تسليم حبوب ونواتج"
                              : "Output Delivery"
                            : isRtl
                              ? "استلام وتسليم موحد"
                              : "Intake & Delivery"}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {renderRecordStatusBadge(r)}
                    <VortexDateBadge date={r.created_at} variant="subtle" size="sm" />
                  </div>
                </div>

                {/* Customer Details */}
                <div className="space-y-1 mb-3">
                  <div className="font-bold text-sm text-foreground truncate">
                    {r.customer_name}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {r.customer_phone && (
                      <span className="font-mono text-[11px]" dir="ltr">
                        {toSystemDigits(r.customer_phone)}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground/80">
                      📍 {r.warehouse_name}
                    </span>
                  </div>
                </div>

                {/* Quantities Strip */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5 text-xs space-y-1 mb-3">
                  {isIntakeDoc && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Wheat className="size-3 text-amber-500" />
                        <span>{isRtl ? "الحبوب المستلمة:" : "Intake:"}</span>
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        {r.total_intake_bags} {isRtl ? "كيس" : "bags"}
                        {r.total_intake_kg > 0 && ` (${r.total_intake_kg.toLocaleString()} كجم)`}
                      </span>
                    </div>
                  )}

                  {isDeliveredDoc && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Truck className="size-3 text-emerald-500" />
                        <span>{isRtl ? "النواتج المسلمة:" : "Delivered:"}</span>
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        {r.total_delivered_bags} {isRtl ? "كيس" : "bags"}
                        {r.total_delivered_kg > 0 &&
                          ` (${r.total_delivered_kg.toLocaleString()} كجم)`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Financial Overview (if linked invoice exists) */}
                {r.total > 0 && (
                  <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mb-3 text-xs">
                    <div>
                      <div className="text-[10px] text-muted-foreground">
                        {isRtl ? "قيمة الأجور:" : "Fee Total:"}
                      </div>
                      <div className="font-mono font-bold text-sm text-foreground">
                        {toSystemDigits(money(r.total))}
                      </div>
                    </div>

                    <div className="text-end">
                      {r.remaining > 0 ? (
                        <div>
                          <div className="text-[10px] text-rose-500 font-bold">
                            {isRtl ? "المتبقي (آجل):" : "Balance Due:"}
                          </div>
                          <div className="font-mono font-bold text-sm text-rose-500">
                            {toSystemDigits(money(r.remaining))}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                          <CheckCircle2 className="size-3.5" />
                          <span>{isRtl ? "مسدد بالكامل" : "Fully Paid"}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div
                className="flex items-center justify-between gap-2 border-t border-border/60 pt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(r)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted transition"
                  >
                    <Eye className="size-3.5" />
                    <span>{isRtl ? "تفاصيل" : "Details"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleOpenPrintPreview(r)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted transition"
                  >
                    <Printer className="size-3.5" />
                    <span>{isRtl ? "طباعة" : "Print"}</span>
                  </button>

                  {r.customer_phone && (
                    <button
                      type="button"
                      onClick={() => shareWhatsApp(r)}
                      className="grid size-8 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                      title={isRtl ? "مشاركة عبر واتساب" : "WhatsApp"}
                    >
                      <WhatsAppIcon className="size-3.5" />
                    </button>
                  )}
                </div>

                {r.remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => triggerQuickCollect(r)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-500 px-3 text-xs font-bold text-white hover:bg-amber-600 transition shadow-xs"
                  >
                    <Wallet className="size-3.5" />
                    <span>{isRtl ? "تحصيل" : "Collect"}</span>
                  </button>
                )}
              </div>
            </div>
          );
        }}
        renderListRow={(r) => {
          const isIntakeDoc = r.record_type === "INTAKE" || r.record_type === "INTAKE_DELIVERY";

          return (
            <div
              key={r.id}
              onClick={() => setSelectedRecord(r)}
              className="card-mullak group relative flex flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3.5 transition-all duration-200 hover:border-primary/50 hover:shadow-md sm:flex-row sm:items-center sm:p-4 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-xl border group-hover:scale-105 transition-all",
                    isIntakeDoc
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {isIntakeDoc ? <Wheat className="size-5" /> : <Truck className="size-5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {r.document_number}
                    </span>
                    {renderRecordStatusBadge(r)}
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs font-bold text-foreground truncate">
                      {r.customer_name}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {isIntakeDoc
                        ? `وارد: ${r.total_intake_bags} كيس`
                        : `منصرف: ${r.total_delivered_bags} كيس`}
                    </span>
                    <span>📍 {r.warehouse_name}</span>
                    <VortexDateBadge date={r.created_at} variant="subtle" size="sm" />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-2 sm:justify-end sm:border-t-0 sm:pt-0">
                {r.total > 0 && (
                  <div className="text-start sm:text-end min-w-[110px]">
                    <div className="text-[10px] text-muted-foreground">
                      {isRtl ? "الأجور:" : "Fee:"}
                    </div>
                    <div className="font-mono text-sm font-bold text-foreground">
                      {toSystemDigits(money(r.total))}
                    </div>
                    {r.remaining > 0 ? (
                      <div className="font-mono text-[10px] font-semibold text-rose-500">
                        {isRtl ? "متبقي: " : "Due: "}
                        {toSystemDigits(money(r.remaining))}
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-emerald-500">
                        {isRtl ? "خالص ومسدد" : "Settled"}
                      </div>
                    )}
                  </div>
                )}

                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.remaining > 0 && (
                    <button
                      type="button"
                      onClick={() => triggerQuickCollect(r)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-xs font-bold text-white hover:bg-amber-600 transition"
                      title={isRtl ? "تحصيل سريع" : "Quick Collect"}
                    >
                      <Wallet className="size-3.5" />
                      <span className="hidden md:inline">{isRtl ? "تحصيل" : "Collect"}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleOpenPrintPreview(r)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted transition"
                    title={isRtl ? "طباعة" : "Print"}
                  >
                    <Printer className="size-3.5" />
                    <span className="hidden md:inline">{isRtl ? "طباعة" : "Print"}</span>
                  </button>

                  {r.customer_phone && (
                    <button
                      type="button"
                      onClick={() => shareWhatsApp(r)}
                      className="grid size-8 place-items-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition"
                      title={isRtl ? "واتساب" : "WhatsApp"}
                    >
                      <WhatsAppIcon className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }}
      />

      {/* Advanced Filter Sheet */}
      <VortexFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        onReset={() => {
          setFilterWarehouse("all");
          setFilterDatePreset("all");
          setFilterPaymentMethod("all");
          setMinAmount(null);
          setMaxAmount(null);
        }}
      >
        <VortexFilterSection title={isRtl ? "المستودع وموقع الخدمة" : "Warehouse"}>
          <select
            value={filterWarehouse}
            onChange={(e) => setFilterWarehouse(e.target.value)}
            className="w-full rounded-xl border border-border bg-background p-2.5 text-xs font-bold"
          >
            <option value="all">{isRtl ? "جميع المستودعات" : "All Warehouses"}</option>
            {availableWarehouses.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </VortexFilterSection>

        <VortexFilterSection title={isRtl ? "الفترة الزمنية" : "Date Period"}>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { id: "all", label: isRtl ? "الكل" : "All Time" },
              { id: "today", label: isRtl ? "اليوم" : "Today" },
              { id: "week", label: isRtl ? "آخر 7 أيام" : "Last 7 Days" },
              { id: "month", label: isRtl ? "آخر 30 يوماً" : "Last 30 Days" },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setFilterDatePreset(d.id)}
                className={cn(
                  "rounded-xl border p-2 font-bold transition",
                  filterDatePreset === d.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </VortexFilterSection>

        <VortexFilterSection title={isRtl ? "مبلغ الأجور (ريال)" : "Fee Amount Range"}>
          <div className="grid grid-cols-2 gap-2">
            <AmountInput
              value={minAmount}
              onValueChange={(val) => setMinAmount(val)}
              placeholder={isRtl ? "الحد الأدنى" : "Min"}
              className="w-full text-xs font-mono"
            />
            <AmountInput
              value={maxAmount}
              onValueChange={(val) => setMaxAmount(val)}
              placeholder={isRtl ? "الحد الأقصى" : "Max"}
              className="w-full text-xs font-mono"
            />
          </div>
        </VortexFilterSection>
      </VortexFilterSheet>

      {/* Luxury Details Slide-over Sheet */}
      <MillingRecordDetailsSheet
        open={Boolean(selectedRecord)}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null);
        }}
        record={selectedRecord}
        onPrint={(r) => void handleOpenPrintPreview(r)}
        onWhatsApp={(r) => shareWhatsApp(r)}
        onCollect={(r) => triggerQuickCollect(r)}
        isRtl={isRtl}
      />

      {/* Print Preview Modal */}
      <LuxuryPrintPreviewModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        doc={printDoc}
        documentType={printDoc?.docType === "delivery_note" ? "delivery" : "mill"}
        title={printDoc?.title}
      />

      {/* Vortex Collection Sheet for Quick Invoice Collection */}
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
        initialInvoiceId={collectionTarget?.invoiceId}
        invoices={
          collectionTarget
            ? [{ id: collectionTarget.invoiceId, total: collectionTarget.balance, paid: 0 }]
            : []
        }
        onSuccess={() => {
          void refetch();
        }}
      />
    </div>
  );
}
