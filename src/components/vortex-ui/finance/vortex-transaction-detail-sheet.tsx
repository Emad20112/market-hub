"use client";

import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import {
  Receipt,
  CheckCircle2,
  Calendar,
  User,
  CreditCard,
  MessageSquareText,
  Copy,
  Check,
  Share2,
  Printer,
  Sparkles,
  Phone,
  ArrowDownLeft,
  ArrowUpRight,
  Hash,
} from "lucide-react";
import { VortexDrawerDialog } from "../form/vortex-drawer-dialog";
import { VortexDateBadge } from "../display/vortex-date-badge";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import { useCompanyCurrency } from "@/hooks/use-company-currency";
import { toSystemDigits, formatSystemNumber } from "@/lib/format-preferences";
import {
  buildUnifiedContext,
  renderMessage,
  playSuccessChime,
  buildWhatsAppLink,
  isValidWhatsAppPhone,
} from "@/lib/communication";
import { cn } from "@/lib/utils";

export interface VortexTransactionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "view" | "success";
  playChime?: boolean;
  transaction: {
    id: string;
    type: "payment" | "invoice" | "debt" | "sale" | "purchase" | "receipt_voucher" | "payment_voucher";
    title?: string;
    amount: number;
    date: string;
    customerName: string;
    customerPhone?: string | null;
    referenceNumber?: string;
    method?: string;
    notes?: string;
    partyRole?: string;
    accountName?: string;
    previousBalance?: number;
    newBalance?: number;
    items?: Array<{ name: string; quantity: number; price: number; total: number }>;
  } | null;
  onPrint?: () => void;
  onNewOperation?: () => void;
}

export function VortexTransactionDetailSheet({
  open,
  onOpenChange,
  mode = "view",
  playChime = true,
  transaction,
  onPrint,
  onNewOperation,
}: VortexTransactionDetailSheetProps) {
  const { currency } = useCompanyCurrency();
  const [copied, setCopied] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<"official" | "reminder" | "short">("official");

  useEffect(() => {
    if (open && mode === "success" && playChime) {
      playSuccessChime();
    }
  }, [open, mode, playChime]);

  const messageContext = useMemo(() => {
    if (!transaction) return null;
    const isPayment =
      transaction.type === "payment" ||
      transaction.type === "receipt_voucher" ||
      transaction.type === "payment_voucher";

    return buildUnifiedContext({
      event: isPayment ? "payment_received" : "invoice_created",
      customer: {
        id: transaction.id,
        name: transaction.customerName,
        phone: transaction.customerPhone || null,
        balance: transaction.newBalance ?? 0,
      },
      payment: isPayment
        ? {
            id: transaction.id,
            receiptNumber: transaction.referenceNumber || transaction.id.slice(0, 8),
            amount: transaction.amount,
            remainingBalance: transaction.newBalance ?? 0,
            method: transaction.method || "cash",
            date: transaction.date,
          }
        : undefined,
      invoice: !isPayment
        ? {
            id: transaction.id,
            invoiceNumber: transaction.referenceNumber || transaction.id.slice(0, 8),
            total: transaction.amount,
            paid: transaction.amount,
            remaining: transaction.newBalance ?? 0,
            date: transaction.date,
          }
        : undefined,
    });
  }, [transaction]);

  const activeMessage = useMemo(() => {
    if (!messageContext) return "";
    const rendered = renderMessage({
      ...messageContext,
      event:
        selectedTemplate === "official"
          ? ("payment_received" as const)
          : ("payment_request" as const),
    });
    return rendered.text;
  }, [messageContext, selectedTemplate]);

  if (!transaction) return null;

  const handleCopy = async () => {
    const textToCopy =
      activeMessage ||
      `سند رقم: ${transaction.referenceNumber || transaction.id}\nالطرف: ${transaction.customerName}\nالمبلغ: ${transaction.amount} ${currency}\nالتاريخ: ${transaction.date}`;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsApp = () => {
    const phone = transaction.customerPhone;
    if (phone && isValidWhatsAppPhone(phone)) {
      // buildWhatsAppLink قد تُعيد null حين يكون الرقم غير صالح للواتساب.
      window.open(
        buildWhatsAppLink(phone, activeMessage) ||
          `https://wa.me/?text=${encodeURIComponent(activeMessage)}`,
        "_blank",
      );
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(activeMessage)}`, "_blank");
    }
  };

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const isIncome =
    transaction.type === "payment" ||
    transaction.type === "receipt_voucher" ||
    transaction.type === "sale";

  return (
    <VortexDrawerDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        mode === "success"
          ? "تمت العملية بنجاح"
          : transaction.title || "تفاصيل العملية المالية"
      }
      description={`المرجع: ${toSystemDigits(transaction.referenceNumber || transaction.id.slice(0, 8))}`}
      className="max-w-lg"
    >
      <div className="space-y-4 py-2">
        {mode === "success" ? (
          <div className="flex flex-col items-center justify-center py-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mb-2 shadow-lg shadow-emerald-500/20 animate-in zoom-in-50 duration-300">
              <Check className="w-8 h-8 stroke-[3]" />
            </div>
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
              {toSystemDigits(formatSystemNumber(transaction.amount))} {currency}
            </div>
            <p className="text-xs text-muted-foreground mt-1">تم توثيق وترحيل العملية بنجاح</p>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 bg-muted/40 border rounded-2xl">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center",
                  isIncome
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                )}
              >
                {isIncome ? (
                  <ArrowDownLeft className="w-6 h-6" />
                ) : (
                  <ArrowUpRight className="w-6 h-6" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">قيمة السند</p>
                <p className="text-xl font-black text-foreground">
                  {toSystemDigits(formatSystemNumber(transaction.amount))} {currency}
                </p>
              </div>
            </div>
            <VortexDateBadge date={transaction.date} />
          </div>
        )}

        <div className="bg-card border rounded-xl p-4 space-y-2.5 text-xs">
          <div className="flex justify-between items-center text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-primary" />
              {transaction.partyRole || "الطرف المعني"}
            </span>
            <span className="font-semibold text-foreground">{transaction.customerName}</span>
          </div>

          {transaction.customerPhone && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" />
                رقم الهاتف
              </span>
              <span className="font-mono text-foreground" dir="ltr">
                {transaction.customerPhone}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-primary" />
              طريقة الدفع
            </span>
            <span className="font-medium text-foreground">
              {transaction.method || "نقداً (الصندوق الرئيسي)"}
            </span>
          </div>

          {transaction.accountName && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span>الحساب / الصندوق</span>
              <span className="font-medium text-foreground">{transaction.accountName}</span>
            </div>
          )}

          {transaction.previousBalance !== undefined && (
            <div className="flex justify-between items-center text-muted-foreground">
              <span>الرصيد السابق</span>
              <span className="font-medium text-foreground">
                {toSystemDigits(formatSystemNumber(transaction.previousBalance))} {currency}
              </span>
            </div>
          )}

          {transaction.newBalance !== undefined && (
            <div className="flex justify-between items-center text-muted-foreground pt-1.5 border-t">
              <span>الرصيد الحالي المتبقي</span>
              <span className="font-bold text-foreground">
                {toSystemDigits(formatSystemNumber(transaction.newBalance))} {currency}
              </span>
            </div>
          )}

          {transaction.notes && (
            <div className="pt-2 border-t text-muted-foreground">
              <span className="block mb-1 font-medium">ملاحظات:</span>
              <p className="text-foreground bg-muted/40 p-2 rounded-lg">{transaction.notes}</p>
            </div>
          )}
        </div>

        <div className="bg-muted/40 border rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5 text-primary">
              <Sparkles className="w-3.5 h-3.5" />
              إشعار العميل الذكي
            </span>
            <div className="flex items-center gap-1 bg-background border rounded-lg p-0.5 text-[10px]">
              <button
                type="button"
                onClick={() => setSelectedTemplate("official")}
                className={cn("px-2 py-0.5 rounded", selectedTemplate === "official" && "bg-primary text-primary-foreground font-medium")}
              >
                رسمي
              </button>
              <button
                type="button"
                onClick={() => setSelectedTemplate("reminder")}
                className={cn("px-2 py-0.5 rounded", selectedTemplate === "reminder" && "bg-primary text-primary-foreground font-medium")}
              >
                موجز
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-background/80 p-2.5 rounded-lg border leading-relaxed">
            {activeMessage || "لا توجد رسالة متاحة"}
          </p>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              type="button"
              onClick={handleWhatsApp}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
            >
              <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
              واتساب
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border bg-background hover:bg-muted text-xs font-medium transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "تم النسخ" : "نسخ التفاصيل"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border bg-background hover:bg-muted text-xs font-medium transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة السند
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          {mode === "success" && onNewOperation && (
            <button
              type="button"
              onClick={onNewOperation}
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all"
            >
              عملية جديدة
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 py-2.5 rounded-xl border bg-background hover:bg-muted text-xs font-semibold transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </VortexDrawerDialog>
  );
}
