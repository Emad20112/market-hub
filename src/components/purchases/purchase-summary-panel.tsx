import * as React from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Loader2,
  ShoppingBag,
  Truck,
  UserPlus,
  Warehouse as WarehouseIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { money } from "@/lib/format";
import { toSystemDigits } from "@/lib/format-preferences";
import { AmountInput } from "@/components/ui/amount-input";
import { DynamicPaymentSelector } from "@/components/ui/payment-method/dynamic-payment-selector";
import { PartyPicker } from "@/components/commerce/party-picker";
import type { PaymentSettlementSelection } from "@/lib/payments/treasury-types";

export interface SummarySupplier {
  id: string;
  name: string;
  phone?: string | null;
  balance?: number | null;
  is_system?: boolean | null;
}

export interface PurchaseSummaryPanelProps {
  isRtl: boolean;
  suppliers: SummarySupplier[];
  cashSupplierId: string;
  supplierId: string;
  onSupplierChange: (id: string) => void;
  onNewSupplier?: () => void;
  paymentMethod: string;
  onPaymentMethodChange: (methodId: string) => void;
  settlement: PaymentSettlementSelection;
  onSettlementChange: (selection: PaymentSettlementSelection) => void;
  paid: string;
  onPaidChange: (value: string) => void;
  subtotal: number;
  discount: string;
  onDiscountChange: (value: string) => void;
  total: number;
  effectivePaid: number;
  remaining: number;
  lineCount: number;
  totalQuantity?: number;
  submitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  note: string;
  onNoteChange: (value: string) => void;
  date: string;
  onDateChange: (value: string) => void;
  warehouseLabel: string;
  remainingError?: string | null;
}

const stepLabel =
  "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground";

function Divider() {
  return <div className="h-px bg-border/60" aria-hidden />;
}

export function PurchaseSummaryPanel({
  isRtl,
  suppliers,
  cashSupplierId,
  supplierId,
  onSupplierChange,
  onNewSupplier,
  paymentMethod,
  onPaymentMethodChange,
  settlement,
  onSettlementChange,
  paid,
  onPaidChange,
  subtotal,
  discount,
  onDiscountChange,
  total,
  effectivePaid,
  remaining,
  lineCount,
  totalQuantity,
  submitting,
  canSubmit,
  onSubmit,
  note,
  onNoteChange,
  date,
  onDateChange,
  warehouseLabel,
  remainingError,
}: PurchaseSummaryPanelProps) {
  const selected = suppliers.find((s) => s.id === supplierId);
  const isCash = Boolean(selected?.is_system);
  const isBalanced = remaining === 0;

  // Alt+1 = سداد كامل، Alt+2 = آجل بالكامل
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "1") {
        event.preventDefault();
        onPaidChange(String(total));
      } else if (event.key === "2") {
        event.preventDefault();
        onPaidChange("0");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPaidChange, total]);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      {/* ═══ ترويسة: التاريخ • المستودع • عدد البنود ═══ */}
      <div className="flex items-center gap-2 border-b border-border/70 bg-gradient-to-b from-muted/45 to-transparent px-3 py-2">
        <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          type="date"
          value={date}
          data-form-nav
          onChange={(e) => onDateChange(e.target.value)}
          aria-label={isRtl ? "تاريخ الفاتورة" : "Invoice date"}
          className="w-[7.3rem] shrink-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] font-semibold text-foreground outline-none transition hover:border-border/70 focus:border-amber-500/60 focus:bg-surface focus:ring-2 focus:ring-amber-500/15"
        />
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 border-s border-border/60 ps-2">
          <WarehouseIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[11px] font-semibold text-foreground">
            {warehouseLabel}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-border/70 bg-surface px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
          {toSystemDigits(lineCount)}
        </span>
      </div>

      {/* ═══ ① الجهة (المورد) ═══ */}
      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className={stepLabel}>
            <span className="grid size-4 place-items-center rounded-full bg-amber-500/10 font-mono text-[9px] text-amber-600 dark:text-amber-400">
              ١
            </span>
            {isRtl ? "المورد" : "Supplier"}
          </span>
          {isCash && (
            <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
              {isRtl ? "مورد نقدي" : "Cash supplier"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <PartyPicker
            options={suppliers}
            value={supplierId}
            onChange={onSupplierChange}
            lang={isRtl ? "ar" : "en"}
            label={isRtl ? "المورد" : "Supplier"}
            emptyLabel={isRtl ? "اختر المورد…" : "Select supplier…"}
            kind="supplier"
            className="flex-1"
          />
          {onNewSupplier && (
            <button
              type="button"
              onClick={onNewSupplier}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-xs transition hover:border-amber-500/40 hover:bg-amber-500/15 active:scale-95 cursor-pointer"
              title={isRtl ? "إضافة مورد جديد" : "Add supplier"}
              aria-label={isRtl ? "إضافة مورد جديد" : "Add supplier"}
            >
              <UserPlus className="size-4" />
            </button>
          )}
        </div>
      </div>

      <Divider />

      {/* ═══ ② طريقة السداد ═══ */}
      <div className="space-y-1.5 px-3 py-2.5">
        <span className={stepLabel}>
          <span className="grid size-4 place-items-center rounded-full bg-amber-500/10 font-mono text-[9px] text-amber-600 dark:text-amber-400">
            ٢
          </span>
          {isRtl ? "طريقة السداد" : "Payment method"}
        </span>
        {paymentMethod !== "split" && (
          <DynamicPaymentSelector
            context="purchases"
            value={paymentMethod}
            onChange={onPaymentMethodChange}
            settlement={settlement}
            onSettlementChange={onSettlementChange}
            includeCredit
          />
        )}
      </div>

      <Divider />

      {/* ═══ ③ المدفوع ═══ */}
      <div className="space-y-1.5 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className={stepLabel}>
            <span className="grid size-4 place-items-center rounded-full bg-amber-500/10 font-mono text-[9px] text-amber-600 dark:text-amber-400">
              ٣
            </span>
            {isRtl ? "المبلغ المدفوع" : "Paid amount"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => onPaidChange(String(total))}
              title={isRtl ? "سداد كامل — Alt+1" : "Pay in full — Alt+1"}
              className="rounded-md border border-border/70 bg-surface px-1.5 py-0.5 text-[9px] font-bold text-foreground transition hover:border-amber-500/40 hover:text-amber-600"
            >
              {isRtl ? "كامل" : "Full"}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => onPaidChange("0")}
              title={isRtl ? "آجل بالكامل — Alt+2" : "Full credit — Alt+2"}
              className="rounded-md border border-border/70 bg-surface px-1.5 py-0.5 text-[9px] font-bold text-foreground transition hover:border-purple-500/40 hover:text-purple-600"
            >
              {isRtl ? "آجل" : "Credit"}
            </button>
          </div>
        </div>

        <AmountInput
          value={paid === "" ? null : Number(paid)}
          onValueChange={(v) => onPaidChange(v == null ? "" : String(v))}
          min={0}
          showInWords={false}
          data-form-nav
          className="h-10 rounded-lg border-border/80 bg-surface text-base font-black text-foreground"
          containerClassName="[&_input]:h-10 [&_input]:text-base [&_input]:font-black"
          placeholder={isRtl ? "كامل المبلغ" : "full amount"}
        />

        <div className="grid grid-cols-2 gap-1.5">
          <div
            className={cn(
              "rounded-lg border px-2 py-1",
              remaining > 0
                ? "border-amber-500/30 bg-amber-500/[0.08]"
                : "border-border/60 bg-surface/60",
            )}
          >
            <span className="block text-[9px] font-semibold text-muted-foreground">
              {isRtl ? "المتبقي (آجل للمورد)" : "Remaining due"}
            </span>
            <span
              className={cn(
                "block font-mono text-xs font-black tabular-nums",
                remaining > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
              )}
            >
              {toSystemDigits(money(remaining))}
            </span>
          </div>

          <label className="flex flex-col justify-center rounded-lg border border-border/60 bg-surface/60 px-2 py-1">
            <span className="text-[9px] font-semibold text-muted-foreground">
              {isRtl ? "الخصم المكتسب" : "Discount"}
            </span>
            <AmountInput
              value={discount === "" ? null : Number(discount)}
              onValueChange={(v) => onDiscountChange(v == null ? "" : String(v))}
              min={0}
              showInWords={false}
              data-form-nav
              className="h-6 w-full rounded-md border-border/70 bg-surface text-xs font-semibold"
              containerClassName="[&_input]:h-6"
            />
          </label>
        </div>

        {remainingError && (
          <p className="flex items-start gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-2 py-1 text-[10px] font-medium leading-relaxed text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            {remainingError}
          </p>
        )}
      </div>

      {/* ═══ ملاحظة ═══ */}
      <details className="group border-t border-border/60 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-semibold text-muted-foreground transition hover:text-foreground">
          <span>{isRtl ? "ملاحظة على الفاتورة" : "Invoice note"}</span>
          <ChevronDown className="size-3 transition group-open:rotate-180" />
        </summary>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          data-form-nav
          rows={2}
          placeholder={
            isRtl ? "اختياري — تُطبع أسفل مستند المشتريات" : "Optional — printed on document"
          }
          className="mt-1.5 w-full resize-none rounded-lg border border-border/70 bg-surface px-2 py-1 text-[11px] text-foreground outline-none transition focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/15"
        />
      </details>

      {/* ═══ تفصيل الحساب المالي بنمط سلة المبيعات (POS) ═══ */}
      <div className="space-y-1.5 border-t border-border/60 bg-muted/20 px-3 py-2 text-xs">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{isRtl ? "البنود والكميات" : "Items & Qty"}</span>
          <span className="font-mono font-bold text-foreground">
            {toSystemDigits(lineCount)} {isRtl ? "صنف" : "items"}
            {totalQuantity != null &&
              totalQuantity > 0 &&
              ` (${toSystemDigits(Math.round(totalQuantity * 1000) / 1000)})`}
          </span>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{isRtl ? "المجموع الفرعي" : "Subtotal"}</span>
          <span className="font-mono font-bold text-foreground">
            {toSystemDigits(money(subtotal))}
          </span>
        </div>

        {Number(discount) > 0 && (
          <div className="flex items-center justify-between text-[11px] text-rose-600 dark:text-rose-400">
            <span>{isRtl ? "الخصم المكتسب" : "Discount"}</span>
            <span className="font-mono font-bold">−{toSystemDigits(money(Number(discount)))}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
          <span>{isRtl ? "المبلغ المدفوع" : "Amount paid"}</span>
          <span className="font-mono font-bold">{toSystemDigits(money(effectivePaid))}</span>
        </div>

        {remaining > 0 && (
          <div className="flex items-center justify-between text-[11px] text-amber-700 dark:text-amber-300 font-bold">
            <span>{isRtl ? "المتبقي (آجل)" : "Remaining debt"}</span>
            <span className="font-mono">{toSystemDigits(money(remaining))}</span>
          </div>
        )}
      </div>

      {/* ═══ بطاقة الصافي والإصدار ═══ */}
      <div className="border-t border-border/70 bg-gradient-to-b from-muted/30 to-transparent px-3 pb-2.5 pt-2">
        <div className="relative overflow-hidden rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] via-card to-card px-3 py-2.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {isRtl ? "صافي الفاتورة الإجمالي" : "Net total"}
              </span>
              <span className="block font-mono text-2xl font-black leading-tight tabular-nums text-foreground">
                {toSystemDigits(money(total))}
              </span>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold",
                remaining > 0
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {remaining > 0 ? (isRtl ? "آجل" : "Credit") : isRtl ? "مسدد" : "Paid"}
            </span>
          </div>

          {total > 0 && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-amber-500 transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, (effectivePaid / total) * 100))}%` }}
              />
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold">
            <span className="text-emerald-600 dark:text-emerald-400">
              {isRtl ? "مدفوع" : "Paid"} {toSystemDigits(money(effectivePaid))}
            </span>
            <span
              className={
                remaining > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"
              }
            >
              {isRtl ? "متبقٍ" : "Due"} {toSystemDigits(money(remaining))}
            </span>
          </div>
        </div>

        <button
          type="button"
          data-form-nav
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className={cn(
            "mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none",
            isBalanced
              ? "bg-amber-500 text-white shadow-md shadow-amber-500/20 hover:bg-amber-600"
              : "bg-foreground text-background shadow-md hover:opacity-95",
          )}
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          {isRtl ? "تسجيل فاتورة المشتريات" : "Post purchase invoice"}
          <kbd className="ms-1 hidden rounded border border-current/25 px-1 text-[9px] font-medium opacity-80 sm:inline">
            Ctrl+↵
          </kbd>
        </button>

        <p className="mt-1.5 flex items-center justify-center gap-2 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <kbd className="rounded border border-border/70 bg-surface px-1">F2</kbd>
            {isRtl ? "بحث" : "find"}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <kbd className="rounded border border-border/70 bg-surface px-1">Alt+1</kbd>
            {isRtl ? "كامل" : "full"}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <kbd className="rounded border border-border/70 bg-surface px-1">Alt+2</kbd>
            {isRtl ? "آجل" : "credit"}
          </span>
        </p>
      </div>
    </div>
  );
}
