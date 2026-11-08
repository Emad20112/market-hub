"use client";

import React, { useState } from "react";
import {
  Wheat,
  Truck,
  Receipt,
  Printer,
  Copy,
  Check,
  Wallet,
  Building2,
  User,
  Clock,
  Phone,
  FileText,
  AlertCircle,
  CheckCircle2,
  PackageCheck,
  Scale,
  Sparkles,
  Layers,
  Calendar,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { VortexDateBadge } from "@/components/vortex-ui";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { toSystemDigits } from "@/lib/format-preferences";
import { money } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/payments/payment-methods";
import { PaymentMethodChip } from "@/components/ui/payment-method";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface MillingRecordDetailLine {
  id: string;
  entry_type: "INTAKE" | "MILLING" | "DELIVERY" | "ADJUSTMENT";
  item_name: string;
  item_sku?: string | null;
  bags_in: number;
  bags_out: number;
  kg_in: number;
  kg_out: number;
  notes?: string | null;
}

export interface UnifiedMillingRecord {
  id: string;
  document_number: string;
  record_type: "INTAKE" | "DELIVERY" | "INTAKE_DELIVERY";
  status: "RECEIVED" | "PROCESSED" | "DELIVERED";
  created_at: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_balance?: number;
  warehouse_id: string | null;
  warehouse_name: string;

  // Aggregate quantities
  total_intake_bags: number;
  total_intake_kg: number;
  total_delivered_bags: number;
  total_delivered_kg: number;
  intake_summary: string;
  delivery_summary: string;

  // Financial details (from linked sales_invoice)
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_status: string | null;
  billing_basis?: string | null;
  fee_per_unit?: number | null;
  fee_quantity?: number | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
  payment_method: string | null;
  payment_status: string | null;
  note: string | null;

  // Detail item lines
  lines: MillingRecordDetailLine[];

  // Raw reference
  raw_service_doc?: any;
}

interface MillingRecordDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: UnifiedMillingRecord | null;
  onPrint?: (record: UnifiedMillingRecord) => void;
  onWhatsApp?: (record: UnifiedMillingRecord) => void;
  onCollect?: (record: UnifiedMillingRecord) => void;
  isRtl?: boolean;
}

export function MillingRecordDetailsSheet({
  open,
  onOpenChange,
  record,
  onPrint,
  onWhatsApp,
  onCollect,
  isRtl = true,
}: MillingRecordDetailsSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!record) return null;

  const isIntake = record.record_type === "INTAKE" || record.record_type === "INTAKE_DELIVERY";
  const isDelivery = record.record_type === "DELIVERY" || record.record_type === "INTAKE_DELIVERY";

  const intakeLines = record.lines.filter((l) => l.entry_type === "INTAKE");
  const deliveryLines = record.lines.filter((l) => l.entry_type === "DELIVERY");

  const copyDocNumber = () => {
    navigator.clipboard.writeText(record.document_number);
    setCopied(true);
    toast.success(
      isRtl
        ? `تم نسخ رقم المستند: ${record.document_number}`
        : `Copied document number: ${record.document_number}`,
    );
    setTimeout(() => setCopied(false), 2000);
  };

  const statusMeta = () => {
    if (record.record_type === "DELIVERY" || record.status === "DELIVERED") {
      return {
        label: isRtl ? "مُسلَّم بالكامل" : "Delivered",
        tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        icon: PackageCheck,
      };
    }
    if (record.status === "PROCESSED") {
      return {
        label: isRtl ? "مطحون — بانتظار التسليم" : "Processed / Ready",
        tone: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        icon: Clock,
      };
    }
    return {
      label: isRtl ? "مستلم في الأمانة" : "Received in Custody",
      tone: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
      icon: CheckCircle2,
    };
  };

  const status = statusMeta();
  const StatusIcon = status.icon;

  const hasInvoice = Boolean(record.invoice_id || record.total > 0);
  const hasRemaining = record.remaining > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isRtl ? "left" : "right"}
        className="w-full max-w-full overflow-y-auto border-border bg-card p-0 sm:max-w-2xl sm:rounded-s-3xl"
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="sticky top-0 z-20 border-b border-border bg-card/95 p-6 backdrop-blur-md">
            <SheetHeader className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "grid size-12 shrink-0 place-items-center rounded-2xl border shadow-sm",
                      isIntake
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {isIntake ? <Wheat className="size-6" /> : <Truck className="size-6" />}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SheetTitle className="text-xl font-black text-foreground">
                        {record.document_number}
                      </SheetTitle>
                      <button
                        type="button"
                        onClick={copyDocNumber}
                        className="rounded-lg p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title={isRtl ? "نسخ رقم السند" : "Copy number"}
                      >
                        {copied ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    </div>
                    <SheetDescription className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {record.record_type === "INTAKE"
                        ? isRtl
                          ? "سند استلام حبوب وفاتورة أجور"
                          : "Grain Intake & Fee Document"
                        : record.record_type === "DELIVERY"
                          ? isRtl
                            ? "سند صرف وتسليم أمانات"
                            : "Custody Delivery Voucher"
                          : isRtl
                            ? "سند استلام وتسليم موحد"
                            : "Intake & Delivery Document"}
                    </SheetDescription>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
                      status.tone,
                    )}
                  >
                    <StatusIcon className="size-3.5" />
                    {status.label}
                  </span>
                  <VortexDateBadge date={record.created_at} variant="subtle" size="sm" />
                </div>
              </div>

              {/* Action buttons strip */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {onPrint && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPrint(record)}
                    className="gap-2 rounded-xl border-border font-bold shadow-xs hover:border-primary"
                  >
                    <Printer className="size-4" />
                    <span>{isRtl ? "طباعة السند" : "Print Voucher"}</span>
                  </Button>
                )}

                {onWhatsApp && record.customer_phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onWhatsApp(record)}
                    className="gap-2 rounded-xl border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400 font-bold shadow-xs"
                  >
                    <WhatsAppIcon className="size-4" />
                    <span>{isRtl ? "إرسال واتساب" : "WhatsApp"}</span>
                  </Button>
                )}

                {hasRemaining && onCollect && (
                  <Button
                    size="sm"
                    onClick={() => onCollect(record)}
                    className="gap-2 rounded-xl bg-amber-500 font-bold text-white shadow-xs hover:bg-amber-600 ms-auto"
                  >
                    <Wallet className="size-4" />
                    <span>{isRtl ? "تحصيل المبلغ المتبقي" : "Collect Balance"}</span>
                  </Button>
                )}
              </div>
            </SheetHeader>
          </div>

          {/* Body Content */}
          <div className="flex-1 space-y-6 p-6">
            {/* Customer & Warehouse Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Customer Box */}
              <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface-1 p-4 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-2">
                  <User className="size-3.5 text-primary" />
                  <span>{isRtl ? "بيانات العميل / صاحب الأمانة" : "Customer / Account"}</span>
                </div>
                <div className="font-black text-base text-foreground truncate">
                  {record.customer_name}
                </div>
                {record.customer_phone && (
                  <div
                    className="mt-1 flex items-center gap-1.5 text-xs font-mono text-muted-foreground"
                    dir="ltr"
                  >
                    <Phone className="size-3 text-muted-foreground/70" />
                    <span>{toSystemDigits(record.customer_phone)}</span>
                  </div>
                )}
                {record.customer_balance != null && (
                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {isRtl ? "رصيد الحساب المالي:" : "Financial Balance:"}
                    </span>
                    <span
                      className={cn(
                        "font-mono font-bold",
                        record.customer_balance > 0 ? "text-rose-500" : "text-emerald-500",
                      )}
                    >
                      {toSystemDigits(money(record.customer_balance))}
                    </span>
                  </div>
                )}
              </div>

              {/* Warehouse Box */}
              <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface-1 p-4 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground mb-2">
                  <Building2 className="size-3.5 text-primary" />
                  <span>{isRtl ? "المستودع وموقع الخدمة" : "Warehouse & Location"}</span>
                </div>
                <div className="font-black text-base text-foreground truncate">
                  {record.warehouse_name || (isRtl ? "المستودع الرئيسي" : "Main Warehouse")}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="size-3 text-muted-foreground/70" />
                  <span>
                    {new Date(record.created_at).toLocaleDateString(isRtl ? "ar-EG" : "en-US", {
                      dateStyle: "long",
                    })}
                  </span>
                </div>
                <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {isRtl ? "نوع السند:" : "Voucher Type:"}
                  </span>
                  <span className="font-bold text-primary">
                    {record.record_type === "INTAKE"
                      ? isRtl
                        ? "استلام حبوب"
                        : "Grain Intake"
                      : record.record_type === "DELIVERY"
                        ? isRtl
                          ? "تسليم نواتج"
                          : "Delivery"
                        : isRtl
                          ? "استلام وتسليم"
                          : "Intake & Delivery"}
                  </span>
                </div>
              </div>
            </div>

            {/* Custody Items / Grain Breakdown */}
            {intakeLines.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-surface-1">
                <div className="flex items-center justify-between bg-amber-500/10 px-4 py-3 border-b border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <Wheat className="size-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="font-black text-sm text-foreground">
                      {isRtl ? "الحبوب المستلمة (الأمانات)" : "Received Custody Grains"}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-amber-700 dark:text-amber-300">
                    <span>
                      {record.total_intake_bags} {isRtl ? "كيس" : "bags"}
                    </span>
                    <span>·</span>
                    <span>
                      {record.total_intake_kg.toLocaleString()} {isRtl ? "كجم" : "kg"}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-border/60 overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="px-4 py-2.5 text-start font-bold">
                          {isRtl ? "نوع الحبوب" : "Grain Item"}
                        </th>
                        <th className="px-4 py-2.5 text-center font-bold">
                          {isRtl ? "عدد الأكياس" : "Bags"}
                        </th>
                        <th className="px-4 py-2.5 text-end font-bold">
                          {isRtl ? "الوزن الإجمالي" : "Weight (kg)"}
                        </th>
                        <th className="px-4 py-2.5 text-start font-bold">
                          {isRtl ? "ملاحظات" : "Notes"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {intakeLines.map((line, idx) => (
                        <tr key={line.id || idx} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-bold text-foreground">{line.item_name}</td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-amber-600 dark:text-amber-400">
                            {line.bags_in} {isRtl ? "كيس" : "bags"}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-bold text-foreground">
                            {line.kg_in
                              ? `${line.kg_in.toLocaleString()} ${isRtl ? "كجم" : "kg"}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-[11px]">
                            {line.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Delivery Items Breakdown */}
            {deliveryLines.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-surface-1">
                <div className="flex items-center justify-between bg-emerald-500/10 px-4 py-3 border-b border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <Truck className="size-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="font-black text-sm text-foreground">
                      {isRtl ? "النواتج المسلمة للعميل" : "Delivered Outputs"}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <span>
                      {record.total_delivered_bags} {isRtl ? "كيس" : "bags"}
                    </span>
                    <span>·</span>
                    <span>
                      {record.total_delivered_kg.toLocaleString()} {isRtl ? "كجم" : "kg"}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-border/60 overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="bg-muted/40 text-muted-foreground">
                        <th className="px-4 py-2.5 text-start font-bold">
                          {isRtl ? "صنف الناتج" : "Product"}
                        </th>
                        <th className="px-4 py-2.5 text-center font-bold">
                          {isRtl ? "الأكياس المسلمة" : "Delivered Bags"}
                        </th>
                        <th className="px-4 py-2.5 text-end font-bold">
                          {isRtl ? "الوزن المسلم" : "Delivered Weight"}
                        </th>
                        <th className="px-4 py-2.5 text-start font-bold">
                          {isRtl ? "ملاحظات" : "Notes"}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {deliveryLines.map((line, idx) => (
                        <tr key={line.id || idx} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-bold text-foreground">{line.item_name}</td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {line.bags_out} {isRtl ? "كيس" : "bags"}
                          </td>
                          <td className="px-4 py-3 text-end font-mono font-bold text-foreground">
                            {line.kg_out
                              ? `${line.kg_out.toLocaleString()} ${isRtl ? "كجم" : "kg"}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-[11px]">
                            {line.notes || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Official Linked Invoice Section */}
            {hasInvoice && (
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-surface-1 p-5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-primary" />
                    <h3 className="font-black text-sm text-foreground">
                      {isRtl ? "فاتورة أجور الطحن المرتبطة" : "Associated Fee Invoice"}
                    </h3>
                  </div>
                  {record.invoice_number && (
                    <span className="font-mono text-xs font-bold text-primary">
                      {record.invoice_number}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">
                      {isRtl ? "أساس الاحتساب" : "Billing Basis"}
                    </div>
                    <div className="mt-1 font-bold text-xs text-foreground">
                      {record.billing_basis === "PER_BAG"
                        ? isRtl
                          ? "لكيس مُطحَن"
                          : "Per Bag"
                        : isRtl
                          ? "لكيلو مُطحَن"
                          : "Per Kg"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">
                      {isRtl ? "طريقة السداد" : "Payment Method"}
                    </div>
                    <div className="mt-1">
                      <PaymentMethodChip
                        value={record.payment_method || "cash"}
                        lang={isRtl ? "ar" : "en"}
                        className="text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">
                      {isRtl ? "إجمالي الأجور" : "Total Fee"}
                    </div>
                    <div className="mt-1 font-mono font-bold text-sm text-foreground">
                      {toSystemDigits(money(record.total))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                    <div className="text-[11px] text-muted-foreground">
                      {isRtl ? "المدفوع نقداً" : "Paid"}
                    </div>
                    <div className="mt-1 font-mono font-bold text-sm text-emerald-500">
                      {toSystemDigits(money(record.paid))}
                    </div>
                  </div>
                </div>

                {/* Balance Due Notice */}
                {hasRemaining ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="size-4 text-rose-500" />
                      <span className="font-bold text-rose-700 dark:text-rose-300">
                        {isRtl ? "المبلغ المتبقي بذمة العميل (آجل):" : "Balance Due:"}{" "}
                        <span className="font-mono text-sm">
                          {toSystemDigits(money(record.remaining))}
                        </span>
                      </span>
                    </div>
                    {onCollect && (
                      <Button
                        size="sm"
                        onClick={() => onCollect(record)}
                        className="h-8 gap-1.5 rounded-lg bg-rose-600 font-bold text-white hover:bg-rose-700 shadow-xs"
                      >
                        <Wallet className="size-3.5" />
                        <span>{isRtl ? "تحصيل الآن" : "Collect Now"}</span>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    <span>
                      {isRtl
                        ? "تم سداد قيمة الفاتورة بالكامل — لا توجد مستحقات معلقة."
                        : "Invoice fully paid."}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* General Notes if any */}
            {record.note && (
              <div className="rounded-2xl border border-border/70 bg-surface-1 p-4 text-xs">
                <div className="font-bold text-muted-foreground mb-1">
                  {isRtl ? "ملاحظات السند:" : "Voucher Notes:"}
                </div>
                <div className="text-foreground">{record.note}</div>
              </div>
            )}
          </div>

          {/* Footer Bar */}
          <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-border"
            >
              {isRtl ? "إغلاق" : "Close"}
            </Button>

            <div className="flex items-center gap-2">
              {onWhatsApp && record.customer_phone && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onWhatsApp(record)}
                  className="gap-2 rounded-xl border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10"
                >
                  <WhatsAppIcon className="size-4" />
                  <span>{isRtl ? "واتساب" : "WhatsApp"}</span>
                </Button>
              )}

              {onPrint && (
                <Button
                  size="sm"
                  onClick={() => onPrint(record)}
                  className="gap-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-xs hover:bg-primary/90"
                >
                  <Printer className="size-4" />
                  <span>{isRtl ? "إعادة الطباعة" : "Reprint"}</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
