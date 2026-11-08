import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Printer,
  Receipt,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  Warehouse as WarehouseIcon,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { useI18n } from "@/lib/i18n";
import { money } from "@/lib/format";
import { toSystemDigits } from "@/lib/format-preferences";
import { toast } from "sonner";
import { printInvoice, type InvoiceTemplate } from "@/lib/invoice-print";
import type { InvoiceDoc } from "@/lib/pdf";
import { translateRpcError } from "@/lib/errors/rpc-errors";
import { OperationSuccessModal } from "@/components/communication/operation-success-modal";
import { LuxuryPrintPreviewModal } from "@/components/luxury-print-preview-modal";
import { playSuccessChime } from "@/lib/communication/audio";
import { useFormNavigationScope } from "@/hooks/use-form-navigation";
import { WarehousePicker, type WarehouseItem } from "@/components/warehouse/warehouse-picker";
import { WarehouseFormDialog } from "@/components/warehouse/warehouse-form-dialog";
import { SupplierFormDialog } from "@/components/contacts/supplier-form-dialog";
import { toLegacyPaymentValue, paymentMethodLabel } from "@/lib/payments/payment-methods";
import type { PaymentSettlementSelection } from "@/lib/payments/treasury-types";
import {
  PurchaseProductFinder,
  type PurchasableProduct,
  type PurchasableUom,
} from "./purchase-product-finder";
import { PurchaseLinesGrid, type PurchaseCartLine, type UnitOption } from "./purchase-lines-grid";
import { PurchaseSummaryPanel, type SummarySupplier } from "./purchase-summary-panel";

interface SavedPurchaseInvoice {
  id: string;
  number: string;
  total: number;
  doc: InvoiceDoc;
}

export function PurchaseInvoiceComposer() {
  const { lang, t } = useI18n();
  const isRtl = lang === "ar";
  const navigate = useNavigate();
  const scopeRef = useFormNavigationScope<HTMLDivElement>();
  const finderRef = useRef<HTMLDivElement>(null);

  // States
  const [suppliers, setSuppliers] = useState<SummarySupplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [products, setProducts] = useState<PurchasableProduct[]>([]);
  const [cart, setCart] = useState<PurchaseCartLine[]>([]);

  // Payment & Details
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [settlement, setSettlement] = useState<PaymentSettlementSelection>({ method: "cash" });
  const [paid, setPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [note, setNote] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Dialogs & Modals
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [warehouseDialogOpen, setWarehouseDialogOpen] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [luxuryPreviewOpen, setLuxuryPreviewOpen] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<SavedPurchaseInvoice | null>(null);

  // Loading
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Load Data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [suppliersRes, whRes, productsRes] = await Promise.all([
        supabase
          .from("suppliers")
          .select("id, name, phone, balance, is_system")
          .eq("is_active", true)
          .order("name")
          .limit(1000),
        supabase
          .from("warehouses")
          .select("id, name, name_ar")
          .eq("is_active", true)
          .order("name")
          .limit(200),
        supabase
          .from("products")
          .select(
            "id, name, name_ar, sku, barcode, unit_id, cost_price, sale_price, tax_rate, tracking, unit:units!products_unit_id_fkey(short_name, name, name_ar)",
          )
          .eq("is_active", true)
          .eq("is_custody_item", false)
          .eq("is_purchasable", true)
          .order("name")
          .limit(1000),
      ]);

      if (suppliersRes.error) throw suppliersRes.error;
      if (whRes.error) throw whRes.error;
      if (productsRes.error) throw productsRes.error;

      const supplierRows = (suppliersRes.data ?? []) as SummarySupplier[];
      setSuppliers(supplierRows);
      if (!supplierId && supplierRows.length) {
        const cashSupplier = supplierRows.find((s) => s.is_system) || supplierRows[0];
        setSupplierId(cashSupplier.id);
      }

      const whRows = (whRes.data ?? []) as WarehouseItem[];
      setWarehouses(whRows);
      if (!warehouseId && whRows.length) {
        setWarehouseId(whRows[0].id);
      }

      // Fetch product UOMs and company costs
      const rawProducts = (productsRes.data ?? []) as any[];
      const pIds = rawProducts.map((p) => p.id);

      const uomMap = new Map<string, PurchasableUom[]>();
      const baseCosts = new Map<string, number>();

      if (pIds.length > 0) {
        const [uomsRes, companyItemsRes] = await Promise.all([
          (supabase as any)
            .from("product_uoms")
            .select(
              "id, product_id, unit_id, factor_to_base, quantity_increment, can_purchase, is_default_purchase, unit:units!product_uoms_unit_id_fkey(short_name, name, name_ar)",
            )
            .in("product_id", pIds)
            .eq("is_active", true),
          (supabase as any)
            .from("company_items")
            .select("item_id, default_cost")
            .eq("company_id", 1)
            .eq("is_active", true)
            .in("item_id", pIds),
        ]);

        if (companyItemsRes.data) {
          for (const item of companyItemsRes.data) {
            if (item.default_cost != null) {
              baseCosts.set(item.item_id, Number(item.default_cost));
            }
          }
        }

        if (uomsRes.data && !uomsRes.error) {
          const uomList = uomsRes.data as any[];
          const uomIds = uomList.map((u) => u.id);

          const [pricesRes, barcodesRes] = uomIds.length
            ? await Promise.all([
                (supabase as any)
                  .from("product_uom_prices")
                  .select("product_uom_id, purchase_price")
                  .in("product_uom_id", uomIds)
                  .eq("company_id", 1),
                (supabase as any)
                  .from("product_uom_barcodes")
                  .select("product_uom_id, barcode")
                  .in("product_uom_id", uomIds),
              ])
            : [{ data: [] }, { data: [] }];

          const priceByUom = new Map<string, number>();
          for (const p of pricesRes.data ?? []) {
            if (p.purchase_price != null)
              priceByUom.set(p.product_uom_id, Number(p.purchase_price));
          }

          const barcodesByUom = new Map<string, string[]>();
          for (const b of barcodesRes.data ?? []) {
            const arr = barcodesByUom.get(b.product_uom_id) ?? [];
            arr.push(b.barcode);
            barcodesByUom.set(b.product_uom_id, arr);
          }

          for (const row of uomList) {
            if (row.can_purchase === false) continue;
            const bCost = baseCosts.get(row.product_id) ?? 0;
            const factor = Number(row.factor_to_base) || 1;
            const list = uomMap.get(row.product_id) ?? [];
            const unit = row.unit;
            list.push({
              unit_id: row.unit_id,
              factor_to_base: factor,
              cost_price: priceByUom.get(row.id) ?? bCost * factor,
              quantity_increment: Number(row.quantity_increment) || 1,
              label: unit
                ? `${isRtl ? unit.name_ar || unit.name : unit.name || unit.name_ar}${unit.short_name ? ` (${unit.short_name})` : ""}`
                : "",
              is_default_purchase: row.is_default_purchase === true,
              barcodes: barcodesByUom.get(row.id) ?? [],
            });
            uomMap.set(row.product_id, list);
          }
        }
      }

      // Map to PurchasableProduct
      const purchasableProducts: PurchasableProduct[] = rawProducts.map((p) => {
        const uoms = uomMap.get(p.id) ?? [];
        const baseCost = baseCosts.get(p.id) ?? Number(p.cost_price || 0);
        const baseUnitLabel = p.unit
          ? p.unit.short_name ||
            (isRtl ? p.unit.name_ar || p.unit.name : p.unit.name || p.unit.name_ar)
          : null;
        const defaultUom = uoms.find((u) => u.is_default_purchase) ?? uoms[0];

        return {
          id: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: (isRtl ? p.name_ar || p.name : p.name || p.name_ar) as string,
          cost_price: defaultUom?.cost_price ?? baseCost,
          tax_rate: Number(p.tax_rate || 0),
          unit_id: p.unit_id,
          item_class: p.item_class,
          on_hand: 0,
          base_unit_label: baseUnitLabel,
          purchase_uoms: uoms,
          default_purchase_uom_id: defaultUom?.unit_id ?? p.unit_id,
          default_purchase_factor: defaultUom?.factor_to_base ?? 1,
          default_unit_label: defaultUom?.label ?? baseUnitLabel,
          tracking: p.tracking,
        };
      });

      setProducts(purchasableProducts);
    } catch (err: any) {
      console.error(err);
      toast.error(isRtl ? "تعذر تحميل بيانات الفاتورة" : "Failed to load purchase data");
    } finally {
      setLoading(false);
    }
  }, [isRtl, supplierId, warehouseId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Focus finder
  const focusFinder = useCallback(() => {
    const input = finderRef.current?.querySelector("input");
    input?.focus();
    input?.select();
  }, []);

  // Keyboard Shortcuts: F2 for search, Ctrl+Enter to submit
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        focusFinder();
        return;
      }
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Calculate Totals
  const subtotal = useMemo(() => {
    return (
      Math.round(
        cart.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0) *
          100,
      ) / 100
    );
  }, [cart]);

  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, Math.round((subtotal - discountNum) * 100) / 100);

  const isCredit = paymentMethod === "credit";
  const paidNum = isCredit ? 0 : paid === "" ? total : Math.max(0, Number(paid) || 0);
  const remaining = Math.max(0, Math.round((total - paidNum) * 100) / 100);
  const totalQuantity = useMemo(() => {
    return cart.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [cart]);

  // Adding product to cart
  const handlePickProduct = useCallback((product: PurchasableProduct, uomId?: string) => {
    setCart((prev) => {
      const uom = product.purchase_uoms.find((u) => u.unit_id === uomId);
      const factor = uom?.factor_to_base ?? product.default_purchase_factor ?? 1;
      const uomLabel = uom?.label ?? product.default_unit_label ?? product.base_unit_label ?? "";
      const price = uom?.cost_price ?? product.cost_price;
      const targetUomId = uom?.unit_id ?? product.default_purchase_uom_id ?? product.unit_id;

      const existingIndex = prev.findIndex(
        (line) => line.product.id === product.id && line.uomId === targetUomId,
      );

      if (existingIndex >= 0) {
        const next = [...prev];
        const curr = next[existingIndex];
        const currQty = Number(curr.quantity) || 0;
        next[existingIndex] = {
          ...curr,
          quantity: currQty + 1,
        };
        return next;
      }

      const newLine: PurchaseCartLine = {
        lineKey: `${product.id}-${targetUomId ?? "base"}-${Date.now()}`,
        product,
        quantity: 1,
        unitPrice: price,
        uomId: targetUomId,
        uomFactor: factor,
        uomLabel,
        quantityIncrement: uom?.quantity_increment ?? 1,
      };

      return [...prev, newLine];
    });
  }, []);

  // Update line
  const handleUpdateLine = useCallback((index: number, patch: Partial<PurchaseCartLine>) => {
    setCart((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], ...patch };
      }
      return next;
    });
  }, []);

  // Remove line
  const handleRemoveLine = useCallback((index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Move line
  const handleMoveLine = useCallback((index: number, direction: -1 | 1) => {
    setCart((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }, []);

  // Unit change
  const handleUnitChange = useCallback((index: number, uomId: string | null) => {
    setCart((prev) => {
      const line = prev[index];
      if (!line) return prev;
      const uom = line.product.purchase_uoms.find((u) => u.unit_id === uomId);
      const factor = uom?.factor_to_base ?? 1;
      const price = uom?.cost_price ?? line.product.cost_price;
      const uomLabel =
        uom?.label ?? line.product.default_unit_label ?? line.product.base_unit_label ?? "";

      const next = [...prev];
      next[index] = {
        ...line,
        uomId,
        uomFactor: factor,
        uomLabel,
        unitPrice: price,
        quantityIncrement: uom?.quantity_increment ?? 1,
      };
      return next;
    });
  }, []);

  // Unit options for line
  const unitOptionsForLine = useCallback(
    (line: PurchaseCartLine): UnitOption[] => {
      const baseLabel = line.product.base_unit_label || (isRtl ? "وحدة الأساس" : "Base unit");
      const list: UnitOption[] = [
        {
          id: line.product.unit_id,
          label: baseLabel,
          factor: 1,
          price: line.product.cost_price,
          quantityIncrement: 1,
        },
      ];
      for (const uom of line.product.purchase_uoms) {
        if (uom.unit_id && uom.unit_id !== line.product.unit_id) {
          list.push({
            id: uom.unit_id,
            label: uom.label,
            factor: uom.factor_to_base,
            price: uom.cost_price,
            quantityIncrement: uom.quantity_increment,
          });
        }
      }
      return list;
    },
    [isRtl],
  );

  // Clear cart
  const handleClear = useCallback(() => {
    if (cart.length === 0) return;
    if (window.confirm(isRtl ? "هل أنت متأكد من تفريغ بنود الفاتورة؟" : "Clear all items?")) {
      setCart([]);
      setDiscount("");
      setPaid("");
      setNote("");
    }
  }, [cart.length, isRtl]);

  // Selected supplier & warehouse objects
  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);
  const cashSupplier = suppliers.find((s) => s.is_system);

  // Submit purchase
  const handleSubmit = async () => {
    if (submitting) return;
    if (!warehouseId) {
      return toast.error(isRtl ? "يرجى اختيار المستودع أولاً" : "Select a warehouse first");
    }
    if (!supplierId) {
      return toast.error(isRtl ? "يرجى اختيار المورد أولاً" : "Select a supplier first");
    }
    if (cart.length === 0) {
      return toast.error(isRtl ? "أضف بندًا واحدًا على الأقل للفاتورة" : "Add at least one item");
    }

    // Validation
    for (let i = 0; i < cart.length; i++) {
      const l = cart[i];
      const q = Number(l.quantity) || 0;
      const p = Number(l.unitPrice) || 0;
      if (q <= 0) {
        return toast.error(
          isRtl
            ? `الكمية غير صحيحة للبند: ${l.product.name}`
            : `Invalid quantity for: ${l.product.name}`,
        );
      }
      if (p < 0) {
        return toast.error(
          isRtl
            ? `السعر غير صالح للبند: ${l.product.name}`
            : `Invalid price for: ${l.product.name}`,
        );
      }
      if (l.product.tracking === "BATCH" && !l.batchNumber?.trim()) {
        return toast.error(
          isRtl
            ? `يرجى إدخال رقم الدفعة للصنف: ${l.product.name}`
            : `Enter batch number for: ${l.product.name}`,
        );
      }
    }

    if (discountNum > subtotal) {
      return toast.error(
        isRtl ? "مبلغ الخصم أكبر من إجمالي الفاتورة" : "Discount cannot exceed subtotal",
      );
    }

    if (remaining > 0 && selectedSupplier?.is_system) {
      return toast.error(
        isRtl
          ? "المورد النقدي لا يحمل ديناً — ادفع كامل المبلغ أو اختر مورداً مسجلاً"
          : "Cash supplier cannot carry debt — pay in full or pick a registered supplier",
      );
    }

    setSubmitting(true);
    try {
      const payload = {
        _warehouse_id: warehouseId,
        _supplier_id: supplierId,
        _payment_method: toLegacyPaymentValue(paymentMethod),
        _paid: paidNum,
        _discount: discountNum,
        _note: note || null,
        _items: cart.map((l) => ({
          product_id: l.product.id,
          quantity: Number(l.quantity) || 0,
          unit_cost: Number(l.unitPrice) || 0,
          uom_id: l.uomId,
          tax_rate: Number(l.product.tax_rate) || 0,
          batch_number: l.batchNumber?.trim() || null,
          expiry_date: l.expiryDate || null,
        })),
      };

      // eslint-disable-next-line no-restricted-properties
      const { data: purchaseId, error } = await (supabase.rpc as any)("create_purchase", payload);
      if (error) {
        throw new Error(
          translateRpcError(
            error,
            isRtl ? "ar" : "en",
            isRtl ? "تعذر تسجيل فاتورة المشتريات" : "Failed to record purchase invoice",
          ),
        );
      }

      // Optional settlement metadata update
      if (
        settlement.cashboxId ||
        settlement.bankAccountId ||
        settlement.reference ||
        settlement.paymentMethodId
      ) {
        await (supabase.from("purchase_invoices") as any)
          .update({
            cashbox_id: settlement.cashboxId || null,
            bank_account_id: settlement.bankAccountId || null,
            payment_reference: settlement.reference || settlement.paymentReference || null,
            payment_method_id: settlement.paymentMethodId || paymentMethod,
          })
          .eq("id", purchaseId);
      }

      // Fetch created invoice number
      const { data: invoiceRow } = await (supabase.from("purchase_invoices") as any)
        .select("invoice_number")
        .eq("id", purchaseId)
        .maybeSingle();

      const invoiceNumber = invoiceRow?.invoice_number ?? String(purchaseId).slice(0, 8);

      const doc: InvoiceDoc = {
        title: isRtl ? "فاتورة مشتريات" : "Purchase Invoice",
        number: invoiceNumber,
        date: new Date().toISOString(),
        partyLabel: isRtl ? "المورد" : "Supplier",
        partyName: selectedSupplier?.name || "",
        partyPhone: selectedSupplier?.phone || undefined,
        warehouse: isRtl
          ? selectedWarehouse?.name_ar || selectedWarehouse?.name
          : selectedWarehouse?.name,
        payment: paymentMethodLabel(paymentMethod, isRtl ? "ar" : "en"),
        status: isCredit
          ? isRtl
            ? "آجل"
            : "Credit"
          : remaining > 0
            ? isRtl
              ? "جزئي"
              : "Partial"
            : isRtl
              ? "مدفوع"
              : "Paid",
        lines: cart.map((line) => ({
          product: line.product.name,
          unit: line.uomLabel || undefined,
          qty: Number(line.quantity) || 0,
          price: Number(line.unitPrice) || 0,
          total:
            Math.round((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * 100) / 100,
        })),
        subtotal,
        tax: 0,
        discount: discountNum,
        total,
        paid: paidNum,
        remaining,
        notes: note || undefined,
      };

      setLastInvoice({
        id: String(purchaseId),
        number: invoiceNumber,
        total,
        doc,
      });

      playSuccessChime();
      toast.success(
        isRtl
          ? `تم إنشاء فاتورة المشتريات ${invoiceNumber}`
          : `Purchase invoice ${invoiceNumber} created`,
      );

      // Open Success Modal
      setSuccessModalOpen(true);

      // Reset cart and inputs
      setCart([]);
      setDiscount("");
      setPaid("");
      setNote("");
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.message || (isRtl ? "تعذر إصدار فاتورة المشتريات" : "Failed to record invoice"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const printLast = (template: InvoiceTemplate) => {
    if (!lastInvoice) return;
    printInvoice(lastInvoice.doc, template, {
      invoice: isRtl ? "فاتورة مشتريات" : "Purchase Invoice",
      date: t("common.date"),
      billTo: isRtl ? "المورد" : "Supplier",
      warehouse: isRtl ? "المستودع" : "Warehouse",
      paymentMethod: isRtl ? "طريقة الدفع" : "Payment Method",
      status: isRtl ? "الحالة" : "Status",
      item: isRtl ? "الصنف" : "Item",
      unit: isRtl ? "الوحدة" : "Unit",
      quantity: isRtl ? "الكمية" : "Qty",
      unitPrice: isRtl ? "سعر الشراء" : "Unit Cost",
      total: isRtl ? "الإجمالي" : "Total",
      subtotal: isRtl ? "المجموع" : "Subtotal",
      discount: isRtl ? "الخصم" : "Discount",
      tax: isRtl ? "الضريبة" : "Tax",
      netTotal: isRtl ? "الصافي" : "Net Total",
      paid: isRtl ? "المدفوع" : "Paid",
      remaining: isRtl ? "المتبقي" : "Remaining",
      currency: "YER",
      notes: isRtl ? "ملاحظات" : "Notes",
    });
  };

  const warehouseLabel =
    (isRtl ? selectedWarehouse?.name_ar || selectedWarehouse?.name : selectedWarehouse?.name) ||
    "—";

  return (
    <div ref={scopeRef} data-form-nav-scope className="flex flex-col gap-4 p-4 lg:p-6">
      <PageHeader
        title={isRtl ? "إنشاء فاتورة مشتريات" : "New Purchase Invoice"}
        subtitle={
          isRtl
            ? "تسجيل مشتريات بضائع جديدة وإضافتها للمخزون وحساب المورد"
            : "Record incoming supplier purchase invoice and stock receipts"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {lastInvoice && (
              <button
                type="button"
                onClick={() => setLuxuryPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/20"
              >
                <Receipt className="size-3.5" />
                <span>
                  {isRtl ? "آخر فاتورة:" : "Last:"} #{toSystemDigits(lastInvoice.number)}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={handleClear}
              disabled={cart.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
              <span>{isRtl ? "تفريغ المستند" : "Clear"}</span>
            </button>
          </div>
        }
      />

      {/* Main Grid: Document Lines + Sticky Decision Column */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left Column: Product Search & Document Lines */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* Top Bar: Search + Warehouse Picker */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div ref={finderRef} className="min-w-[280px] flex-1">
              <PurchaseProductFinder
                products={products}
                isRtl={isRtl}
                disabled={loading}
                onPick={handlePickProduct}
                onTabForward={() => {
                  const firstInput = scopeRef.current?.querySelector(
                    "table input",
                  ) as HTMLInputElement | null;
                  firstInput?.focus();
                  firstInput?.select();
                }}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <WarehousePicker
                warehouses={warehouses}
                selectedId={warehouseId}
                onSelect={setWarehouseId}
                isRtl={isRtl}
                disabled={loading}
                className="h-11"
              />
            </div>
          </div>

          {/* Lines Grid */}
          <div className="min-h-[420px]">
            {loading ? (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-border/80 bg-surface/50">
                <Loader2 className="size-7 animate-spin text-primary" />
              </div>
            ) : (
              <PurchaseLinesGrid
                lines={cart}
                isRtl={isRtl}
                onUpdate={handleUpdateLine}
                unitOptionsFor={unitOptionsForLine}
                onUnitChange={handleUnitChange}
                onRemove={handleRemoveLine}
                onMove={handleMoveLine}
                onRequestAdd={focusFinder}
                onExitForward={() => {
                  // Move focus into summary panel paid input or submit button
                  const paidInput = scopeRef.current?.querySelector(
                    "[data-summary-paid-input]",
                  ) as HTMLInputElement | null;
                  paidInput?.focus();
                  paidInput?.select();
                }}
              />
            )}
          </div>
        </div>

        {/* Right Column: POS-Style Purchase Summary Panel */}
        <div className="w-full">
          <PurchaseSummaryPanel
            isRtl={isRtl}
            suppliers={suppliers}
            cashSupplierId={cashSupplier?.id || ""}
            supplierId={supplierId}
            onSupplierChange={setSupplierId}
            onNewSupplier={() => setSupplierDialogOpen(true)}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            settlement={settlement}
            onSettlementChange={setSettlement}
            paid={paid}
            onPaidChange={setPaid}
            subtotal={subtotal}
            discount={discount}
            onDiscountChange={setDiscount}
            total={total}
            effectivePaid={paidNum}
            remaining={remaining}
            lineCount={cart.length}
            totalQuantity={totalQuantity}
            submitting={submitting}
            canSubmit={cart.length > 0 && !submitting}
            onSubmit={handleSubmit}
            note={note}
            onNoteChange={setNote}
            date={invoiceDate}
            onDateChange={setInvoiceDate}
            warehouseLabel={warehouseLabel}
          />
        </div>
      </div>

      {/* Supplier Creation Dialog */}
      <SupplierFormDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        onSuccess={(created) => {
          if (created?.id) {
            setSuppliers((prev) => [
              {
                id: created.id,
                name: created.name,
                phone: created.phone,
                balance: 0,
              },
              ...prev,
            ]);
            setSupplierId(created.id);
          }
          void loadData();
        }}
      />

      {/* Warehouse Creation Dialog */}
      <WarehouseFormDialog
        open={warehouseDialogOpen}
        onOpenChange={setWarehouseDialogOpen}
        onSuccess={(created) => {
          if (created?.id) {
            setWarehouses((prev) => [
              {
                id: created.id,
                name: created.name,
                name_ar: created.name_ar,
              },
              ...prev,
            ]);
            setWarehouseId(created.id);
          }
          void loadData();
        }}
      />

      {/* Operation Success Modal */}
      <OperationSuccessModal
        open={successModalOpen}
        onClose={() => setSuccessModalOpen(false)}
        title={isRtl ? "تم تسجيل فاتورة المشتريات بنجاح" : "Purchase Invoice Recorded"}
        subtitle={
          lastInvoice
            ? isRtl
              ? `فاتورة مشتريات #${lastInvoice.number}`
              : `Purchase Invoice #${lastInvoice.number}`
            : undefined
        }
        amount={lastInvoice?.total}
        referenceNumber={lastInvoice?.number}
        customer={
          selectedSupplier
            ? {
                id: selectedSupplier.id,
                name: selectedSupplier.name,
                phone: selectedSupplier.phone || undefined,
              }
            : undefined
        }
        invoice={
          lastInvoice
            ? {
                id: lastInvoice.id,
                invoiceNumber: lastInvoice.number,
                date: new Date().toISOString().split("T")[0],
                subtotal: lastInvoice.total,
                total: lastInvoice.total,
                paid: paidNum,
                remaining,
              }
            : null
        }
        eventType="purchase_created"
        onPrint={() => {
          setSuccessModalOpen(false);
          setLuxuryPreviewOpen(true);
        }}
        onThermalPrint={() => printLast("thermal")}
      />

      {/* Luxury Print Preview Modal */}
      {lastInvoice && (
        <LuxuryPrintPreviewModal
          open={luxuryPreviewOpen}
          onClose={() => setLuxuryPreviewOpen(false)}
          doc={lastInvoice.doc}
          documentType="purchase_invoice"
          title={isRtl ? "معاينة وطباعة فاتورة المشتريات" : "Purchase Invoice Preview"}
          customerPhone={selectedSupplier?.phone || undefined}
          customerName={selectedSupplier?.name || undefined}
        />
      )}
    </div>
  );
}
