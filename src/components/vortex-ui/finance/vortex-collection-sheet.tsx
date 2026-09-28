"use client";

import * as React from "react";
import { useState } from "react";
import {
  Banknote,
  CreditCard,
  Building2,
  FileCheck,
  CheckCircle2,
  MessageCircle,
  Send,
  Copy,
  Receipt,
  User,
  Check
} from "lucide-react";
import { VortexDrawerDialog } from "../form/vortex-drawer-dialog";
import { cn } from "@/lib/utils";

export type PaymentMethod = "cash" | "card" | "transfer" | "cheque";

export interface CollectionCustomer {
  id: string;
  name: string;
  phone?: string | null;
  balance: number;
}

export interface VortexCollectionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CollectionCustomer | null;
  onSuccess?: (receipt: CollectionReceipt) => void;
  onSavePayment: (data: {
    customerId: string;
    amount: number;
    method: PaymentMethod;
    notes?: string;
  }) => Promise<{ receiptNumber: string }>;
}

export interface CollectionReceipt {
  receiptNumber: string;
  customerName: string;
  customerPhone?: string;
  amount: number;
  remainingBalance: number;
  method: PaymentMethod;
  date: string;
}

export function VortexCollectionSheet({
  open,
  onOpenChange,
  customer,
  onSuccess,
  onSavePayment,
}: VortexCollectionSheetProps) {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<CollectionReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => {
    if (customer && customer.balance > 0) {
      setAmount(String(customer.balance));
    } else {
      setAmount("");
    }
    setNotes("");
    setReceipt(null);
  }, [customer, open]);

  if (!customer) return null;

  const currentBalance = customer.balance || 0;
  const payAmount = parseFloat(amount) || 0;
  const remaining = Math.max(0, currentBalance - payAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payAmount <= 0) return;

    try {
      setIsSubmitting(true);
      const res = await onSavePayment({
        customerId: customer.id,
        amount: payAmount,
        method,
        notes,
      });

      const newReceipt: CollectionReceipt = {
        receiptNumber: res.receiptNumber || String(Date.now()).slice(-6),
        customerName: customer.name,
        customerPhone: customer.phone || undefined,
        amount: payAmount,
        remainingBalance: remaining,
        method,
        date: new Date().toLocaleDateString("ar-SA"),
      };

      setReceipt(newReceipt);
      onSuccess?.(newReceipt);
    } finally {
      setIsSubmitting(false);
    }
  };

  const paymentMethods = [
    { id: "cash", label: "نقداً (كاش)", icon: Banknote },
    { id: "card", label: "بطاقة مدى / شبكة", icon: CreditCard },
    { id: "transfer", label: "حوالة بنكية", icon: Building2 },
    { id: "cheque", label: "شيك مصرفي", icon: FileCheck },
  ] as const;

  const generateMessage = (r: CollectionReceipt) => {
    return `سند قبض إلكتروني
العميل: ${r.customerName}
المبلغ المستلم: ${r.amount.toLocaleString("ar-SA")} ر.س
المتبقي: ${r.remainingBalance.toLocaleString("ar-SA")} ر.س
رقم السند: #${r.receiptNumber}
التاريخ: ${r.date}
شكراً لتعاملكم معنا.`;
  };

  const shareWhatsApp = () => {
    if (!receipt) return;
    const text = encodeURIComponent(generateMessage(receipt));
    const phone = (receipt.customerPhone || "").replace(/\D/g, "");
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  };

  const shareSMS = () => {
    if (!receipt) return;
    const text = encodeURIComponent(generateMessage(receipt));
    const phone = (receipt.customerPhone || "").replace(/\D/g, "");
    window.open(`sms:${phone}?body=${text}`, "_blank");
  };

  const copyReceiptText = () => {
    if (!receipt) return;
    navigator.clipboard.writeText(generateMessage(receipt));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <VortexDrawerDialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={receipt ? "تم تسجيل سند القبض بنجاح" : "سند قبض وتحصيل سريع"}
      subtitle={
        receipt
          ? "يمكنك الآن إرسال إشعار السند للعميل مباشرة"
          : `العميل: ${customer.name} (الرصيد الحالي: ${currentBalance.toLocaleString("ar-SA")} ر.س)`
      }
      icon={
        <div className="grid size-10 place-items-center rounded-2xl bg-foreground text-background shadow-md">
          {receipt ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Receipt className="size-5" />}
        </div>
      }
    >
      {receipt ? (
        /* ─── Receipt Success & Messaging Screen ─── */
        <div className="space-y-4 py-2">
          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center space-y-1.5">
            <span className="text-xs font-bold text-muted-foreground">المبلغ المستلم</span>
            <div className="text-3xl font-black text-foreground font-mono">
              {receipt.amount.toLocaleString("ar-SA")} <span className="text-sm">ر.س</span>
            </div>
            <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground pt-1">
              <span>سند رقم: #{receipt.receiptNumber}</span>
              <span>•</span>
              <span>المتبقي: {receipt.remainingBalance.toLocaleString("ar-SA")} ر.س</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-foreground block">إشعار العميل المباشر</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={shareWhatsApp}
                className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-98 transition cursor-pointer"
              >
                <MessageCircle className="size-4" />
                <span>إرسال عبر واتساب</span>
              </button>

              <button
                type="button"
                onClick={shareSMS}
                className="h-12 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-sky-600/20 active:scale-98 transition cursor-pointer"
              >
                <Send className="size-4" />
                <span>رسالة نصية SMS</span>
              </button>
            </div>

            <button
              type="button"
              onClick={copyReceiptText}
              className="w-full h-11 rounded-2xl border border-border bg-card text-foreground font-bold text-xs flex items-center justify-center gap-2 hover:bg-muted transition cursor-pointer"
            >
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              <span>{copied ? "تم نسخ نص السند بنجاح" : "نسخ نص الإشعار"}</span>
            </button>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-xs sm:text-sm shadow-md hover:opacity-95 transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      ) : (
        /* ─── Collection Input Form ─── */
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Balance card */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-muted/60 border border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-card text-foreground border">
                <User className="size-4 text-primary" />
              </div>
              <div>
                <span className="block text-xs font-bold text-foreground">{customer.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {customer.phone || "بدون رقم هاتف"}
                </span>
              </div>
            </div>
            <div className="text-left">
              <span className="block text-[10px] text-muted-foreground font-semibold">الرصيد المستحق</span>
              <span className="text-sm font-black font-mono text-rose-600 dark:text-rose-400">
                {currentBalance.toLocaleString("ar-SA")} ر.س
              </span>
            </div>
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground">المبلغ المحصل</label>
              {currentBalance > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(currentBalance))}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer"
                >
                  سداد كامل المستحق
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                className="w-full h-12 rounded-2xl border border-border bg-card px-4 pl-12 text-base font-black font-mono text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition"
              />
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                ر.س
              </span>
            </div>
            {payAmount > 0 && (
              <div className="text-[11px] text-muted-foreground flex justify-between px-1">
                <span>المتبقي بعد التحصيل:</span>
                <span className="font-bold font-mono text-foreground">
                  {remaining.toLocaleString("ar-SA")} ر.س
                </span>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">طريقة الدفع</label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((m) => {
                const Icon = m.icon;
                const isSelected = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    className={cn(
                      "flex items-center gap-2 h-11 px-3 rounded-2xl border text-xs font-bold transition cursor-pointer",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary font-black shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("size-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">ملاحظات أو رقم المرجع (اختياري)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="رقم الحوالة، أو مرجع الشيك..."
              className="w-full h-11 rounded-2xl border border-border bg-card px-4 text-xs font-medium text-foreground focus:border-primary focus:outline-none transition"
            />
          </div>

          {/* Submit */}
          <div className="pt-3">
            <button
              type="submit"
              disabled={isSubmitting || payAmount <= 0}
              className="w-full h-12 rounded-2xl bg-foreground text-background font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-foreground/15 hover:opacity-95 active:scale-98 transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "جاري الحفظ..." : "تأكيد وإصدار السند فوراً"}
            </button>
          </div>
        </form>
      )}
    </VortexDrawerDialog>
  );
}
