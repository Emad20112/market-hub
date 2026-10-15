/**
 * Market-Hub ERP — Custody data layer (the simplified mill).
 *
 * One table (custody_ledger), one line per movement, and the balance is always
 * derived — never stored. Every write goes through an atomic RPC; the browser
 * has no INSERT on the table (R-23).
 *
 * The three concepts this module keeps apart, on purpose:
 *   custodyIntake()    customer grain arrives      → stock impact: NONE
 *   custodyMilling()   grain is milled for someone → stock impact: NONE
 *   custodyDelivery()  goods leave to the customer → stock impact: NONE
 *
 * A mill that sells its own flour does that through the ordinary sales screens.
 * Nothing here touches grain stock — that is the whole point of the module.
 *
 * المرجع: docs/milling/00_خطة_التبسيط_المعتمدة.md
 */

import { supabase } from "@/integrations/supabase/client";

/* The generated types do not know the custody schema yet. Widening the global
 * Database type for one feature would hide real errors elsewhere, so we keep a
 * single narrow, documented escape hatch here. */
const db = supabase as any;

/* ------------------------------------------------------------------ types */

export type CustodyEntryType = "INTAKE" | "MILLING" | "DELIVERY" | "ADJUSTMENT";

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  name_ar: string | null;
  item_class: string;
  sale_price: number;
  /** سعة العبوة بالكجم إن كان الصنف معبّأً — تُستخدم لاحتساب الوزن تلقائياً. */
  package_weight_kg: number | null;
}

export interface CustodyBalance {
  customer_id: string;
  warehouse_id: string;
  item_id: string;
  sku: string;
  name_ar: string;
  item_class: string;
  bags_balance: number;
  kg_balance: number;
}

export interface CustodyStatementRow {
  customer_id: string;
  customer_name_ar: string;
  warehouse_id: string;
  warehouse_name_ar: string;
  item_id: string;
  sku: string;
  item_name_ar: string;
  item_class: string;
  received_bags: number;
  received_kg: number;
  issued_bags: number;
  issued_kg: number;
  remaining_bags: number;
  remaining_kg: number;
  last_movement_at: string;
}

export interface CustodyMoneyRow {
  custody_entry_id: string;
  customer_id: string;
  customer_name_ar: string;
  doc_number: string;
  created_at: string;
  invoice_id: string;
  invoice_number: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  outstanding: number;
}

export interface CustodyLossRow {
  customer_id: string;
  customer_name_ar: string;
  warehouse_id: string;
  warehouse_name_ar: string;
  item_id: string;
  grain_name_ar: string;
  milled_bags: number;
  milled_kg: number;
  produced_bags: number;
  produced_kg: number;
  detected_loss_kg: number;
  loss_status: "OK" | "REVIEW";
}

export interface CustodyLine {
  itemId: string;
  bags: number;
  kg: number;
}

export interface OpResult<T = string> {
  ok: boolean;
  id?: T;
  data?: T;
  message?: string;
}

/* --------------------------------------------------------- label helpers */

export function translateCustodyError(msg: string): string {
  if (!msg) return "حدث خطأ غير متوقع في معالجة العملية.";
  if (msg.includes("balance") && msg.includes("less than"))
    return "الكمية المطلوبة أكبر من رصيد العميل المتبقي.";
  if (msg.includes("RAW_MATERIAL")) return "صنف الاستلام يجب أن يكون حبوباً خاماً.";
  if (msg.includes("FINISHED_GOOD"))
    return "صنف الناتج يجب أن يكون منتجاً نهائياً أو ناتجاً جانبياً.";
  if (msg.includes("reason is required")) return "سبب التعديل إلزامي.";
  if (msg.includes("Customer, warehouse")) return "يرجى تحديد العميل والمخزن والصنف.";
  if (msg.includes("Not authenticated")) return "يجب تسجيل الدخول أولاً.";
  if (msg.includes("not permitted")) return "لا تملك صلاحية هذه العملية.";
  return msg;
}

/* ------------------------------------------------------------- item reads */

/** حبوب خام للقوائم — من القاعدة لا من مصفوفات الكود. */
export async function fetchGrainItems(): Promise<ProductOption[]> {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, name_ar, item_class, sale_price, package_weight_kg")
    .eq("item_class", "RAW_MATERIAL")
    .eq("is_active", true)
    .order("name_ar");

  if (error) throw error;
  return (data ?? []) as ProductOption[];
}

/** نواتج (منتجات نهائية + نواتج جانبية). */
export async function fetchOutputItems(): Promise<ProductOption[]> {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, name_ar, item_class, sale_price, package_weight_kg")
    .in("item_class", ["FINISHED_GOOD", "BY_PRODUCT"])
    .eq("is_active", true)
    .order("name_ar");

  if (error) throw error;
  return (data ?? []) as ProductOption[];
}

/** صنف الأجور الخدمي — سعره هو مصدر السعر الوحيد (ق5). */
export async function fetchServiceItem(): Promise<ProductOption | null> {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, name_ar, item_class, sale_price, package_weight_kg")
    .eq("item_class", "SERVICE")
    .eq("is_active", true)
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ProductOption | null;
}

/**
 * سعة العبوة الرسمية (بالكجم) لصنف من القاعدة — مصدر واحد لا يُدخل في الواجهة.
 * منتج بلا سعة أو بغير وزن يُعيد null والواجهة تعامل الوزن يدوياً.
 */
export function capacityKgOf(
  item: ProductOption | { package_weight_kg?: number | null } | null | undefined,
): number | null {
  const v = Number(item?.package_weight_kg ?? 0);
  return Number.isFinite(v) && v > 0 ? v : null;
}

/* -------------------------------------------------------------- balances */

export async function fetchCustodyBalances(
  customerId?: string,
  warehouseId?: string,
): Promise<CustodyBalance[]> {
  let q = db.from("custody_balances").select("*").order("name_ar");
  if (customerId) q = q.eq("customer_id", customerId);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CustodyBalance[];
}

/* ------------------------------------------------------------ the writes */

export interface CustodyIntakeInput {
  customerId: string;
  warehouseId: string;
  itemId: string;
  bags: number;
  kg: number;
  notes?: string;
}

export async function custodyIntake(input: CustodyIntakeInput): Promise<OpResult> {
  if (!input.customerId) return { ok: false, message: "اختر العميل صاحب الأمانات." };
  if (!input.warehouseId) return { ok: false, message: "اختر المستودع." };
  if (!input.itemId) return { ok: false, message: "اختر صنف الحبوب." };
  if ((input.bags ?? 0) <= 0 && (input.kg ?? 0) <= 0) {
    return { ok: false, message: "سجّل عدد الأكياس أو الوزن على الأقل." };
  }

  const { data, error } = await db.rpc("custody_intake", {
    _customer_id: input.customerId,
    _warehouse_id: input.warehouseId,
    _item_id: input.itemId,
    _bags: input.bags ?? 0,
    _kg: input.kg ?? 0,
    _notes: input.notes ?? null,
  });
  if (error) return { ok: false, message: translateCustodyError(error.message) };
  return { ok: true, id: data as string };
}

/** رقم السند من معرّف السطر — لاستخدام طباعة السند بعد الحفظ مباشرة. */
export async function fetchCustodyDocNumber(entryId: string): Promise<string | null> {
  const { data, error } = await db
    .from("custody_ledger")
    .select("doc_number")
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  return (data as { doc_number: string | null } | null)?.doc_number ?? null;
}

export interface CustodyMillingInput {
  customerId: string;
  warehouseId: string;
  grainItemId: string;
  bagsOut: number;
  kgOut: number;
  outputs: CustodyLine[];
  notes?: string;
}

export async function custodyMilling(input: CustodyMillingInput): Promise<OpResult> {
  if (!input.customerId) return { ok: false, message: "اختر العميل." };
  if (!input.warehouseId) return { ok: false, message: "اختر المستودع." };
  if (!input.grainItemId) return { ok: false, message: "اختر صنف الحبوب المطحونة." };
  if ((input.bagsOut ?? 0) <= 0 && (input.kgOut ?? 0) <= 0) {
    return { ok: false, message: "حدد كمية الحبوب المطحونة (أكياس أو كجم)." };
  }
  const validOutputs = (input.outputs ?? []).filter(
    (o) => o.itemId && ((o.bags ?? 0) > 0 || (o.kg ?? 0) > 0),
  );
  if (validOutputs.length === 0) {
    return { ok: false, message: "أضف ناتجاً واحداً على الأقل (صنف + كمية)." };
  }

  const { data, error } = await db.rpc("custody_milling", {
    _customer_id: input.customerId,
    _warehouse_id: input.warehouseId,
    _grain_item_id: input.grainItemId,
    _bags_out: input.bagsOut ?? 0,
    _kg_out: input.kgOut ?? 0,
    _outputs: validOutputs.map((o) => ({
      item_id: o.itemId,
      bags: o.bags ?? 0,
      kg: o.kg ?? 0,
    })),
    _notes: input.notes ?? null,
  });
  if (error) return { ok: false, message: translateCustodyError(error.message) };
  return { ok: true, data: data as string };
}

export interface CustodyDeliveryInput {
  customerId: string;
  warehouseId: string;
  lines: CustodyLine[];
  notes?: string;
}

export async function custodyDelivery(input: CustodyDeliveryInput): Promise<OpResult> {
  if (!input.customerId) return { ok: false, message: "اختر العميل." };
  if (!input.warehouseId) return { ok: false, message: "اختر المستودع." };
  const validLines = (input.lines ?? []).filter(
    (l) => l.itemId && ((l.bags ?? 0) > 0 || (l.kg ?? 0) > 0),
  );
  if (validLines.length === 0) {
    return { ok: false, message: "أضف سطر تسليم واحداً على الأقل." };
  }

  const { data, error } = await db.rpc("custody_delivery", {
    _customer_id: input.customerId,
    _warehouse_id: input.warehouseId,
    _lines: validLines.map((l) => ({
      item_id: l.itemId,
      bags: l.bags ?? 0,
      kg: l.kg ?? 0,
    })),
    _notes: input.notes ?? null,
  });
  if (error) return { ok: false, message: translateCustodyError(error.message) };
  return { ok: true, data: data as string };
}

export interface CustodyAdjustmentInput {
  customerId: string;
  warehouseId: string;
  itemId: string;
  bagsDelta: number;
  kgDelta: number;
  reason: string;
}

export async function custodyAdjustment(input: CustodyAdjustmentInput): Promise<OpResult> {
  if (!input.customerId || !input.warehouseId || !input.itemId) {
    return { ok: false, message: "يرجى تحديد العميل والمخزن والصنف." };
  }
  if (!input.reason?.trim()) return { ok: false, message: "سبب التعديل إلزامي." };
  if ((input.bagsDelta ?? 0) === 0 && (input.kgDelta ?? 0) === 0) {
    return { ok: false, message: "التعديل يحتاج فرقاً غير صفري في الأكياس أو الكجم." };
  }

  const { data, error } = await db.rpc("custody_adjustment", {
    _customer_id: input.customerId,
    _warehouse_id: input.warehouseId,
    _item_id: input.itemId,
    _bags_delta: input.bagsDelta ?? 0,
    _kg_delta: input.kgDelta ?? 0,
    _reason: input.reason.trim(),
  });
  if (error) return { ok: false, message: translateCustodyError(error.message) };
  return { ok: true, id: data as string };
}

/* ------------------------------------------------------- the statement */

export async function fetchCustodyStatement(customerId?: string): Promise<CustodyStatementRow[]> {
  let q = db.from("custody_customer_statement").select("*").order("customer_name_ar");
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CustodyStatementRow[];
}

/** التبويب المالي: فواتير الأجور المرتبطة بسطور الأمانة. */
export async function fetchCustodyServiceMoney(customerId?: string): Promise<CustodyMoneyRow[]> {
  let q = db
    .from("custody_service_money")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CustodyMoneyRow[];
}

/** سطور الطحن غير المربوطة بفاتورة أجور — تُربط من التبويب المالي. */
export interface UnlinkedMillingEntry {
  id: string;
  customer_id: string;
  doc_number: string;
  created_at: string;
}
export async function fetchUnlinkedMillingEntries(): Promise<UnlinkedMillingEntry[]> {
  const { data, error } = await db
    .from("custody_ledger")
    .select("id, customer_id, doc_number, created_at")
    .eq("entry_type", "MILLING")
    .is("service_invoice_id", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as UnlinkedMillingEntry[];
}

/** فواتير مبيعات مؤكدة ولم تُسدَّد بالكامل لعميل — مرشّحات لربط الأجور. */
export async function fetchCustomerOpenInvoices(customerId: string) {
  const { data, error } = await db
    .from("sales_invoices")
    .select("id, invoice_number, total, paid, status, payment_status, created_at")
    .eq("customer_id", customerId)
    /*
     * الفلترة على المحورين المنفصلين (01_core_enums_and_helpers):
     *  * status        = دورة المستند  -> 'confirmed' فقط (draft/cancelled/returned لا تُربط)
     *  * payment_status = حالة السداد  -> نستثني 'paid' المُسدَّدة بالكامل
     * كان الاستعلام السابق يفلتر status in ('confirmed','partial') و«partial»
     * ليست قيمة في invoice_status إطلاقاً، فكان الفلتر بلا أثر حقيقي.
     */
    .eq("status", "confirmed")
    .neq("payment_status", "paid")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    invoice_number: string;
    total: number;
    paid: number;
    status: string;
    payment_status: string;
    created_at: string;
  }[];
}

/**
 * ربط سطر أمانة (MILLING) بفاتورة الأجور — القيمة الوحيدة المالية المرتبطة
 * بالأمانات. الفاتورة نفسها تُنشأ من شاشات المبيعات القياسية (ق5: سطر واحد)،
 * وهذا الربط فقط ما يجعلها تظهر في التبويب المالي للكشف.
 */
export async function linkCustodyInvoice(
  custodyEntryId: string,
  invoiceId: string,
): Promise<OpResult> {
  if (!custodyEntryId || !invoiceId) {
    return { ok: false, message: "سطر الأمانة والفاتورة مطلوبان." };
  }
  const { error } = await db.rpc("custody_link_invoice", {
    _custody_entry_id: custodyEntryId,
    _invoice_id: invoiceId,
  });
  if (error) return { ok: false, message: translateCustodyError(error.message) };
  return { ok: true };
}

/** الفاقد المكتشف — يُكتشف لا يُدخل (ق2). تنبيه ولا يمنع. */
export async function fetchDetectedLoss(): Promise<CustodyLossRow[]> {
  const { data, error } = await db
    .from("custody_detected_loss")
    .select("*")
    .order("customer_name_ar");
  if (error) throw error;
  return (data ?? []) as CustodyLossRow[];
}

/* ---------------------------------------------------------------- misc */

export const MILLING_MODULE_ID = "milling_operations";

/* ------------------------------------- print vouchers (05 §بند 8.4) */

/**
 * سند طباعة موحّد لعملية أمانة (استلام/طحن/تسليم/تعديل).
 *
 * يُبنى من سجل السند الفعلي في `custody_ledger` (لا من حالة الشاشة)، مع
 * أسماء العميل/المخزن/الأصناف من جداول النظام. الحقول المالية صفرية لأن
 * الأمانات بلا مال (ق2/د6) — الفاتورة الوحيدة هي فاتورة الأجور المربوطة.
 *
 * المستند يمرّ عبر محرك الطباعة القياسي للنظام (renderUnifiedDocument /
 * printUnifiedDocument) فترث أوراق A4/حراري وقالب `milling-clean` وقواعد
 * الطباعة العامة — لا قالب خاص بالمطحنة ولا مصدر ثانٍ للتنسيق.
 */
export interface CustodyVoucherData {
  entryType: "INTAKE" | "MILLING" | "DELIVERY" | "ADJUSTMENT";
  docNumber: string;
  createdAt: string;
  customerName: string;
  customerPhone?: string | null;
  warehouseName: string;
  notes?: string | null;
  /** أسطر السند: صنف + كمية — كجم يظهر وإن صفر لأكياس فقط. */
  lines: { item: string; bags: number; kg: number }[];
}

const VOUCHER_TITLES: Record<CustodyVoucherData["entryType"], string> = {
  INTAKE: "سند استلام أمانة",
  MILLING: "سند طحن أمانة",
  DELIVERY: "سند تسليم أمانة",
  ADJUSTMENT: "سند تعديل جردي",
};

export async function buildCustodyVoucher(docNumber: string): Promise<CustodyVoucherData | null> {
  if (!docNumber?.trim()) return null;

  /* سطور السند من السجل الوحيد — بلا حالة شاشة ولا حساب محلي. */
  const { data, error } = await db
    .from("custody_ledger")
    .select(
      `id, entry_type, doc_number, bags_in, bags_out, kg_in, kg_out, notes, created_at,
       customers(name, phone),
       warehouses(name, name_ar),
       products(name, name_ar, sku)`,
    )
    .eq("doc_number", docNumber.trim())
    .order("created_at");
  if (error) throw error;
  if (!data?.length) return null;

  const first = data[0] as {
    entry_type: CustodyVoucherData["entryType"];
    doc_number: string;
    created_at: string;
    notes: string | null;
    customers: { name: string; phone: string | null } | null;
    warehouses: { name: string; name_ar: string | null } | null;
  };

  const lines = data.map((r: any) => ({
    item: r.products?.name_ar || r.products?.name || "—",
    bags: Number(r.bags_in ?? 0) + Number(r.bags_out ?? 0),
    kg: Number(r.kg_in ?? 0) + Number(r.kg_out ?? 0),
  }));

  return {
    entryType: first.entry_type,
    docNumber: first.doc_number,
    createdAt: first.created_at,
    customerName: first.customers?.name || "—",
    customerPhone: first.customers?.phone || null,
    warehouseName: first.warehouses?.name_ar || first.warehouses?.name || "—",
    notes: first.notes,
    lines,
  };
}

/** يحوّل سند الأمانة إلى UnifiedDocumentData لمحرك الطباعة القياسي. */
export function custodyVoucherToDoc(v: CustodyVoucherData) {
  const title = VOUCHER_TITLES[v.entryType];
  return {
    docType: "mill_document" as const,
    title,
    number: v.docNumber,
    date: new Date(v.createdAt).toLocaleString("ar-EG"),
    partyLabel: "صاحب الأمانة:",
    partyName: v.customerName,
    partyPhone: v.customerPhone ?? undefined,
    warehouse: v.warehouseName,
    movementType: "أمانة — بلا أثر مخزني أو مالي",
    status: "مسجّل",
    lines: v.lines.map((l) => ({
      product: l.item,
      qty: l.bags > 0 ? l.bags : l.kg,
      unit: l.bags > 0 ? "كيس" : "كجم",
      price: 0,
      total: 0,
      note: l.bags > 0 && l.kg > 0 ? `${l.kg} كجم` : undefined,
    })),
    notes: v.notes ?? "حبوب/نواتج ملك العميل — أمانة لا ذمة. صفر أثر على مخزون المطحنة.",
    options: {
      showFinancialDetails: false,
      showPaymentInfo: false,
      showBarcode: true,
      showQrCode: true,
    },
  };
}

/* ----------------------------------------- smart manufacture (خطوة 7) */

/** مستند تحويل/تصنيع: وارد قمح يُنقص، صادر نواتج تزيد، تكلفة موزّعة نسبياً. */
export async function smartManufacture(input: {
  warehouseId: string;
  grainItemId: string;
  grainQty: number;
  outputs: { itemId: string; qty: number }[];
  notes?: string;
}): Promise<OpResult> {
  if (!input.warehouseId || !input.grainItemId) {
    return { ok: false, message: "اختر المخزن وصنف القمح." };
  }
  if ((input.grainQty ?? 0) <= 0) {
    return { ok: false, message: "كمية القمح يجب أن تكون أكبر من صفر." };
  }
  const validOutputs = (input.outputs ?? []).filter((o) => o.itemId && (o.qty ?? 0) > 0);
  if (validOutputs.length === 0) {
    return { ok: false, message: "أضف ناتجاً واحداً على الأقل (صنف + كمية)." };
  }

  const { data, error } = await db.rpc("smart_manufacture", {
    _warehouse_id: input.warehouseId,
    _grain_item_id: input.grainItemId,
    _grain_qty: input.grainQty,
    _outputs: validOutputs.map((o) => ({ item_id: o.itemId, qty: o.qty })),
    _notes: input.notes ?? null,
  });
  if (error) return { ok: false, message: translateCustodyError(error.message) };
  return { ok: true, data: data as string };
}

/* --------------------------------- internal consumables issue (خطوة 7 — ق4) */

/** فاتورة صرف مستهلكات داخلي: تُنقص كمياتها من مخزن المستهلكات بدقة. */
export async function consumeInternalSupplies(input: {
  warehouseId: string;
  lines: { itemId: string; qty: number }[];
  notes?: string;
}): Promise<OpResult> {
  if (!input.warehouseId) return { ok: false, message: "اختر المخزن." };
  const validLines = (input.lines ?? []).filter((l) => l.itemId && (l.qty ?? 0) > 0);
  if (validLines.length === 0) {
    return { ok: false, message: "أضف سطراً واحداً على الأقل (صنف + كمية)." };
  }

  const { data, error } = await db.rpc("consume_internal_supplies", {
    _warehouse_id: input.warehouseId,
    _lines: validLines.map((l) => ({ item_id: l.itemId, qty: l.qty })),
    _notes: input.notes ?? null,
  });
  if (error) return { ok: false, message: translateCustodyError(error.message) };
  return { ok: true, data: data as string };
}

/** مستهلكات (أكياس/خيط/زيت) — تصرف من مخزن المستهلكات. */
export async function fetchConsumableItems(): Promise<ProductOption[]> {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, name_ar, item_class, sale_price, package_weight_kg")
    .in("item_class", ["NON_STOCK_ITEM", "PACKAGING"])
    .eq("is_active", true)
    .order("name_ar");
  if (error) throw error;
  return (data ?? []) as ProductOption[];
}
