/**
 * Market-Hub ERP — Milling module: data access layer.
 *
 * Every write goes through an atomic RPC. None of them touches a table
 * directly, because a custody document, its job and its delivery must move
 * together or not at all — and because the browser is never granted INSERT on
 * the `milling_*` tables.
 *
 * The three concepts this module keeps apart, on purpose:
 *
 *   createIntake()   customer grain arrives      → stock impact: NONE
 *   createJob()      grain is milled for someone → stock impact: NONE
 *   invoiceJob()     the mill earns a fee        → stock impact: MILL PACKAGING ONLY
 *
 * A mill that sells its own flour does that through the ordinary sales screens.
 * Nothing here touches grain, and that is the whole point of the module.
 */

import { supabase } from "@/integrations/supabase/client";

/* The generated types do not know the `milling_*` schema yet. Widening the
 * global Database type for one feature would hide real errors elsewhere, so we
 * keep a single narrow, documented escape hatch here — the same posture
 * `stock-operations.ts` takes for the stock views. */
const db = supabase as any;

export const MILLING_MODULE_ID = "milling_operations";

/* ------------------------------------------------------------------ types */

export type MillingStatus =
  "DRAFT" | "RECEIVED" | "PROCESSING" | "COMPLETED" | "DELIVERED" | "CANCELLED";

export type MillingOutputType = "FLOUR_GRADE_1" | "FLOUR_GRADE_2" | "BRAN" | "SEMOLINA" | "WASTE";

export interface MillingIntake {
  id: string;
  store_id: string;
  receipt_number: string;
  customer_id: string;
  truck_plate_number: string | null;
  driver_name: string | null;
  grain_type: string;
  grain_product_id: string | null;
  /** مرجع فحص الحبوب (المرحلة 0/4). grain_type مشتق منه. */
  grain_grade_id: string | null;
  bag_size_kg: number;
  intake_bag_count: number;
  nominal_weight_kg: number;
  gross_weight_kg: number;
  tare_weight_kg: number;
  net_weight_kg: number;
  moisture_percentage: number;
  impurities_percentage: number;
  silo_or_location: string | null;
  status: MillingStatus;
  notes: string | null;
  created_at: string;
}

export interface MillingJob {
  id: string;
  store_id: string;
  job_number: string;
  intake_receipt_id: string;
  customer_id: string;
  input_bag_count: number;
  input_bag_size_kg: number;
  input_weight_kg: number;
  milling_fee_per_bag: number;
  milling_fee_per_ton: number;
  service_product_id: string | null;
  /** العقد الذي ينفذه هذا الأمر. NULL = أمر قديم قبل نظام العقود. */
  agreement_id: string | null;
  expected_extraction_rate: number;
  allowed_loss_percentage: number;
  actual_loss_kg: number;
  loss_excess_kg: number;
  status: MillingStatus;
  started_at: string | null;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface MillingOutput {
  id: string;
  job_id: string;
  output_type: MillingOutputType;
  bag_size_kg: number;
  produced_bag_count: number;
  produced_weight_kg: number;
  bags_source: "CUSTOMER" | "MILL";
  mill_bag_product_id: string | null;
  mill_bags_used: number;
  delivered_bag_count: number;
  delivered_weight_kg: number;
}

export interface MillingDelivery {
  id: string;
  store_id: string;
  delivery_number: string;
  customer_id: string;
  job_id: string;
  truck_plate_number: string | null;
  driver_name: string | null;
  total_bags: number;
  total_weight_kg: number;
  notes: string | null;
  created_at: string;
}

/** Result of a successful completion, as computed and committed by the DB. */
export interface JobCompletionSummary {
  job_id: string;
  input_weight_kg: number;
  total_output_weight_kg: number;
  total_output_bags: number;
  actual_loss_kg: number;
  allowed_loss_kg: number;
  loss_excess_kg: number;
  actual_extraction_rate: number;
  expected_extraction_rate: number;
  loss_exceeds_allowance: boolean;
}

export interface CustomerCustodyRow {
  customer_id: string;
  received_kg: number;
  received_bags: number;
  milled_kg: number;
  milled_bags: number;
  produced_bags: number;
  produced_kg: number;
  delivered_bags: number;
  delivered_kg: number;
}

export interface OutputBalanceRow {
  customer_id: string;
  store_id: string;
  output_type: MillingOutputType;
  bag_size_kg: number;
  produced_bags: number;
  produced_kg: number;
  delivered_bags: number;
  delivered_kg: number;
  remaining_bags: number;
  remaining_kg: number;
}

export interface ServiceMoneyRow {
  job_id: string;
  customer_id: string;
  warehouse_id: string;
  invoice_id: string;
  invoice_number: string;
  created_at: string;
  status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paid: number;
  outstanding: number;
  job_number: string;
}

export interface OpResult<T = string> {
  ok: boolean;
  id?: T;
  data?: T;
  message?: string;
}

/* --------------------------------------------------------- label helpers */

export const OUTPUT_LABELS_AR: Record<MillingOutputType, string> = {
  FLOUR_GRADE_1: "دقيق نمرة 1 (فاخر)",
  FLOUR_GRADE_2: "دقيق بر / نمرة 2",
  BRAN: "نخالة (ردة)",
  SEMOLINA: "سميد",
  WASTE: "فاقد وهدر",
};

export const OUTPUT_LABELS_EN: Record<MillingOutputType, string> = {
  FLOUR_GRADE_1: "Flour Grade 1",
  FLOUR_GRADE_2: "Flour Grade 2",
  BRAN: "Bran",
  SEMOLINA: "Semolina",
  WASTE: "Waste",
};

/** The bag sizes the module seeds, in kilograms. Order matters: biggest first. */
export const BAG_SIZES_KG = [50, 40, 25, 10] as const;

export function outputLabel(type: MillingOutputType, lang: "ar" | "en" = "ar"): string {
  return (lang === "ar" ? OUTPUT_LABELS_AR : OUTPUT_LABELS_EN)[type] ?? type;
}

export const STATUS_LABELS_AR: Record<MillingStatus, string> = {
  DRAFT: "مسودة",
  RECEIVED: "مستلم",
  PROCESSING: "قيد التشغيل",
  COMPLETED: "منتهي",
  DELIVERED: "مسلّم",
  CANCELLED: "ملغى",
};

/* ------------------------------------------------------------- 1. intake */

export interface CreateIntakeInput {
  storeId: string;
  customerId: string;
  grainType: string;
  grainProductId?: string | null;
  /** مرجع فحص الحبوب. يقود التسمية المشتقة لـ grainType (المرحلة 0). */
  grainGradeId?: string | null;
  bagSizeKg: number;
  bagCount: number;
  grossWeightKg: number;
  tareWeightKg: number;
  moisture?: number;
  impurities?: number;
  truckPlate?: string;
  driverName?: string;
  silo?: string;
  notes?: string;
}

/**
 * Records a customer's grain as custody.
 *
 * The server derives the net weight from the scale ticket and stores it beside
 * the nominal bag weight, so a shortage in bag weights stays visible instead of
 * being reconciled away.
 */
export async function createIntake(input: CreateIntakeInput): Promise<OpResult> {
  if (!input.customerId) {
    return { ok: false, message: "اختر العميل صاحب الأمانات." };
  }
  if (!input.storeId) {
    return { ok: false, message: "اختر المستودع." };
  }
  if (!input.grainType.trim()) {
    return { ok: false, message: "حدد نوع الحبوب." };
  }
  if (input.bagSizeKg <= 0) {
    return { ok: false, message: "سعة الكيس يجب أن تكون أكبر من صفر." };
  }
  if (input.grossWeightKg - input.tareWeightKg <= 0) {
    return { ok: false, message: "الوزن الصافي يجب أن يكون أكبر من صفر." };
  }

  const { data, error } = await db.rpc("create_milling_intake", {
    _store_id: input.storeId,
    _customer_id: input.customerId,
    _grain_type: input.grainType.trim(),
    _grain_product_id: input.grainProductId ?? null,
    _grain_grade_id: input.grainGradeId ?? null,
    _bag_size_kg: input.bagSizeKg,
    _bag_count: input.bagCount,
    _gross_weight_kg: input.grossWeightKg,
    _tare_weight_kg: input.tareWeightKg,
    _moisture: input.moisture ?? 0,
    _impurities: input.impurities ?? 0,
    _truck_plate: input.truckPlate ?? null,
    _driver_name: input.driverName ?? null,
    _silo: input.silo ?? null,
    _notes: input.notes ?? null,
  });

  if (error) return { ok: false, message: translateMillingError(error.message) };
  return { ok: true, id: data as string };
}

function translateMillingError(msg: string): string {
  if (!msg) return "حدث خطأ غير متوقع في معالجة العملية.";
  if (msg.includes("Grain grade is required") || msg.includes("grain_grade_id")) {
    return "نوع ودرجة الحبوب مطلوبة — تحديد درجة الحبوب مطلوب لحساب سعر وتكلفة الطحن لاحقاً.";
  }
  if (msg.includes("Warehouse is required")) return "يرجى تحديد المستودع / الصومعة.";
  if (msg.includes("Customer is required")) return "يرجى اختيار العميل صاحب الأمانات.";
  if (msg.includes("Bag size must be greater than zero"))
    return "سعة الكيس يجب أن تكون أكبر من صفر.";
  if (msg.includes("Net weight must be positive")) return "الوزن الصافي يجب أن يكون أكبر من صفر.";
  return msg;
}

/* --------------------------------------------------------------- 2. jobs */

export interface CreateJobInput {
  intakeReceiptId: string;
  inputBagCount: number;
  inputBagSizeKg: number;
  inputWeightKg: number;
  feePerBag?: number;
  feePerTon?: number;
  serviceProductId?: string | null;
  expectedExtractionRate?: number;
  allowedLossPercentage?: number;
  notes?: string;
}

export async function createJob(input: CreateJobInput): Promise<OpResult> {
  if (!input.intakeReceiptId) {
    return { ok: false, message: "اختر سند الاستلام." };
  }
  if (input.inputWeightKg <= 0) {
    return { ok: false, message: "الكمية المسحوبة يجب أن تكون أكبر من صفر." };
  }
  if (!input.feePerBag && !input.feePerTon) {
    return { ok: false, message: "حدّد أجرة الكيس أو أجرة الطن." };
  }

  const { data, error } = await db.rpc("create_milling_job", {
    _intake_receipt_id: input.intakeReceiptId,
    _input_bag_count: input.inputBagCount,
    _input_bag_size_kg: input.inputBagSizeKg,
    _input_weight_kg: input.inputWeightKg,
    _fee_per_bag: input.feePerBag ?? 0,
    _fee_per_ton: input.feePerTon ?? 0,
    _service_product_id: input.serviceProductId ?? null,
    _expected_extraction_rate: input.expectedExtractionRate ?? 80,
    _allowed_loss_percentage: input.allowedLossPercentage ?? 2,
    _notes: input.notes ?? null,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data as string };
}

export interface AddOutputInput {
  jobId: string;
  outputType: MillingOutputType;
  bagSizeKg: number;
  producedBagCount: number;
  producedWeightKg: number;
  bagsSource: "CUSTOMER" | "MILL";
  millBagProductId?: string | null;
  millBagsUsed?: number;
}

export async function addOutput(input: AddOutputInput): Promise<OpResult> {
  if (input.producedBagCount <= 0 && input.producedWeightKg <= 0) {
    return { ok: false, message: "سجّل عدد الأكياس أو الوزن على الأقل." };
  }
  if (input.bagsSource === "MILL" && !input.millBagProductId) {
    return { ok: false, message: "اختر صنف الأكياس من مخزون المطحنة." };
  }

  const { data, error } = await db.rpc("add_milling_output", {
    _job_id: input.jobId,
    _output_type: input.outputType,
    _bag_size_kg: input.bagSizeKg,
    _produced_bag_count: input.producedBagCount,
    _produced_weight_kg: input.producedWeightKg,
    _bags_source: input.bagsSource,
    _mill_bag_product_id: input.millBagProductId ?? null,
    _mill_bags_used: input.millBagsUsed ?? 0,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data as string };
}

/**
 * Closes the job. The server computes the actual loss, compares it with the
 * contractual allowance, and returns the committed figures so the UI shows the
 * operator exactly what was written.
 */
export async function completeJob(
  jobId: string,
  notes?: string,
): Promise<OpResult<JobCompletionSummary>> {
  const { data, error } = await db.rpc("complete_milling_job", {
    _job_id: jobId,
    _notes: notes ?? null,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, data: data as JobCompletionSummary };
}

/** Cancels only an untouched job; completed or posted work requires a reversal. */
export async function cancelJob(jobId: string, reason: string): Promise<OpResult> {
  if (!reason.trim()) return { ok: false, message: "سبب الإلغاء إلزامي." };
  const { error } = await db.rpc("cancel_milling_job", {
    _job_id: jobId,
    _reason: reason.trim(),
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/* ---------------------------------------------------------- 3. invoicing */

export interface InvoiceJobInput {
  jobId: string;
  paymentMethod: string;
  paid?: number;
  discount?: number;
  note?: string;
  includePackaging?: boolean;
}

/**
 * Issues the toll-milling fee invoice.
 *
 * This is the only call in the module that can move stock, and only for the
 * mill's own packaging items. The fee line is a SERVICE, so the grain and the
 * flour stay out of `inventory` entirely.
 */
export async function invoiceJob(input: InvoiceJobInput): Promise<OpResult> {
  if (!input.paymentMethod) {
    return { ok: false, message: "اختر طريقة الدفع." };
  }

  const { data, error } = await db.rpc("issue_milling_service_invoice", {
    _job_id: input.jobId,
    _payment_method: input.paymentMethod,
    _paid: input.paid ?? 0,
    _discount: input.discount ?? 0,
    _note: input.note ?? null,
    _include_packaging: input.includePackaging ?? true,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data as string };
}

/* ---------------------------------------------------------- 4. delivery */

export interface DeliveryLine {
  jobOutputId: string;
  deliveredBags: number;
  deliveredWeightKg: number;
}

export interface ProcessDeliveryInput {
  jobId: string;
  items: DeliveryLine[];
  truckPlate?: string;
  driverName?: string;
  notes?: string;
}

export async function processDelivery(input: ProcessDeliveryInput): Promise<OpResult> {
  if (input.items.length === 0) {
    return { ok: false, message: "اختر ناتجاً واحداً على الأقل للتسليم." };
  }
  if (input.items.some((i) => i.deliveredBags <= 0 || i.deliveredWeightKg <= 0)) {
    return { ok: false, message: "كل بند يحتاج عدد أكياس ووزن أكبر من صفر." };
  }

  const { data, error } = await db.rpc("process_milling_delivery", {
    _job_id: input.jobId,
    _truck_plate: input.truckPlate ?? null,
    _driver_name: input.driverName ?? null,
    _notes: input.notes ?? null,
    _items: input.items.map((i) => ({
      job_output_id: i.jobOutputId,
      delivered_bags: i.deliveredBags,
      delivered_weight_kg: i.deliveredWeightKg,
    })),
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data as string };
}

/* ------------------------------------------------------------- 5. reading */

export async function fetchIntakes(
  storeId?: string,
  customerId?: string,
): Promise<MillingIntake[]> {
  let q = db
    .from("milling_intake_receipts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (storeId) q = q.eq("store_id", storeId);
  if (customerId) q = q.eq("customer_id", customerId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MillingIntake[];
}

export async function fetchJobs(storeId?: string, status?: MillingStatus): Promise<MillingJob[]> {
  let q = db.from("milling_jobs").select("*").order("created_at", { ascending: false }).limit(200);

  if (storeId) q = q.eq("store_id", storeId);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MillingJob[];
}

export async function fetchOutputs(jobId: string): Promise<MillingOutput[]> {
  const { data, error } = await db
    .from("milling_job_outputs")
    .select("*")
    .eq("job_id", jobId)
    .order("output_type");

  if (error) throw error;
  return (data ?? []) as MillingOutput[];
}

export async function fetchDeliveries(
  storeId?: string,
  customerId?: string,
): Promise<MillingDelivery[]> {
  let q = db
    .from("milling_delivery_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (storeId) q = q.eq("store_id", storeId);
  if (customerId) q = q.eq("customer_id", customerId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MillingDelivery[];
}

/** The packaging items the mill can supply and invoice, from the seed. */
export async function fetchPackagingItems(): Promise<
  { id: string; sku: string; name: string; name_ar: string | null; sale_price: number }[]
> {
  const { data, error } = await db
    .from("products")
    .select("id, sku, name, name_ar, sale_price")
    .like("sku", "PKG-BAG-%")
    .eq("is_active", true)
    .order("sku");

  if (error) throw error;
  return (data ?? []) as any;
}

/** The customer's full physical custody balance. */
export async function fetchCustomerCustody(customerId: string): Promise<CustomerCustodyRow | null> {
  const { data, error } = await db
    .from("milling_customer_custody")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as CustomerCustodyRow;
}

/** What is still physically held for a customer, by grade. */
export async function fetchOutputBalances(customerId: string): Promise<OutputBalanceRow[]> {
  const { data, error } = await db
    .from("milling_output_balances")
    .select("*")
    .eq("customer_id", customerId)
    .gt("remaining_bags", 0)
    .order("output_type");

  if (error) throw error;
  return (data ?? []) as OutputBalanceRow[];
}

/** The milling-fee side of the statement only — never goods sales. */
export async function fetchServiceMoney(customerId: string): Promise<ServiceMoneyRow[]> {
  const { data, error } = await db
    .from("milling_service_money")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ServiceMoneyRow[];
}

/* ------------------------------------------------------- dashboard stats */

export interface MillingDashboardStats {
  intakeTonsToday: number;
  intakeBagsToday: number;
  milledBagsTotal: number;
  milledTonsTotal: number;
  readyBags: number;
  readyTons: number;
  activeJobs: number;
  pendingInvoices: number;
}

/**
 * The `/milling` KPI row.
 *
 * Every figure is derived from the custody ledger only. Nothing here reads
 * `inventory`, which is the point: the dashboard can never be accused of mixing
 * a customer's wheat into the mill's own stock.
 */
export async function fetchDashboardStats(storeId?: string): Promise<MillingDashboardStats> {
  const empty: MillingDashboardStats = {
    intakeTonsToday: 0,
    intakeBagsToday: 0,
    milledBagsTotal: 0,
    milledTonsTotal: 0,
    readyBags: 0,
    readyTons: 0,
    activeJobs: 0,
    pendingInvoices: 0,
  };

  const [intakes, jobs, balances, invoices] = await Promise.all([
    fetchIntakes(storeId),
    fetchJobs(storeId),
    storeId
      ? db
          .from("milling_output_balances")
          .select("remaining_bags, remaining_kg")
          .eq("store_id", storeId)
      : db.from("milling_output_balances").select("remaining_bags, remaining_kg"),
    db
      .from("milling_service_money")
      .select("invoice_id, warehouse_id, outstanding")
      .not("outstanding", "is", null),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const todayIntakes = intakes.filter((i) => (i.created_at ?? "").slice(0, 10) === today);

  const liveJobs = jobs.filter((j) => j.status !== "CANCELLED" && j.status !== "DELIVERED");

  const balanceRows = (balances.data ?? []) as {
    remaining_bags: number;
    remaining_kg: number;
  }[];

  const invoiceRows = (invoices.data ?? []) as {
    invoice_id: string;
    warehouse_id: string;
    outstanding: number;
  }[];

  return {
    intakeTonsToday:
      Math.round(todayIntakes.reduce((s, i) => s + Number(i.net_weight_kg ?? 0), 0) / 10) / 100,
    intakeBagsToday: todayIntakes.reduce((s, i) => s + Number(i.intake_bag_count ?? 0), 0),
    milledBagsTotal: liveJobs.reduce((s, j) => s + Number(j.input_bag_count ?? 0), 0),
    milledTonsTotal:
      Math.round(liveJobs.reduce((s, j) => s + Number(j.input_weight_kg ?? 0), 0) / 10) / 100,
    readyBags: balanceRows.reduce((s, b) => s + Number(b.remaining_bags ?? 0), 0),
    readyTons:
      Math.round(balanceRows.reduce((s, b) => s + Number(b.remaining_kg ?? 0), 0) / 10) / 100,
    activeJobs: liveJobs.length,
    pendingInvoices: invoiceRows.filter((i) => !storeId || i.warehouse_id === storeId).length,
  };
}
