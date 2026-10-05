/**
 * Market-Hub ERP — Unified Milling Operations Layer.
 *
 * Provides a single-entry operational engine for the Simplified Milling Workflow:
 * 1. Direct Cash Milling Ticket (طحن فوري نقدي):
 *    Intake -> Job -> Optional Packaging -> Complete -> Invoiced -> Delivered
 *    All executed in one seamless coordinated operation. Zero stock impact on customer grain,
 *    accurate sales revenue recognition, mill packaging stock deduction, and immediate ticket generation.
 *
 * 2. Bulk Trader/Farmer Custody Intake (استلام وتخزين تجاري بالأمانات):
 *    Records grain intake into customer custody without production complexity, with flexible delivery
 *    (instant or on-demand batches).
 */

import { supabase } from "@/integrations/supabase/client";
import {
  createIntake,
  createJob,
  addOutput,
  completeJob,
  invoiceJob,
  processDelivery,
  fetchIntakes,
  fetchJobs,
  fetchDeliveries,
  fetchPackagingItems,
  BAG_SIZES_KG,
  type MillingOutputType,
  type MillingStatus,
} from "@/lib/milling";

const db = supabase as any;

/* ------------------------------------------------------------------ types */

export interface GrainGradeOption {
  id: string;
  product_id: string;
  sku?: string;
  grade_code: string;
  grade_name_ar: string;
  origin: string | null;
  max_moisture: number;
  max_impurities: number;
  default_bag_size_kg: number;
  default_bag_type?: string | null;
  default_service_sku?: string | null;
  is_active: boolean;
}

export interface DirectMillingTicketInput {
  storeId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  grainType: string;
  grainGradeId?: string | null;
  grainProductId?: string | null;
  millingType: "FLOUR_GRADE_1" | "FLOUR_GRADE_2" | "SEMOLINA" | "BRAN";
  bagCount: number;
  bagSizeKg: number;
  totalWeightKg?: number;
  bagsSource: "CUSTOMER" | "MILL";
  millBagProductId?: string | null;
  millBagsCount?: number;
  millBagPrice?: number;
  millingFeeRate: number; // Fee per bag or per unit
  discount?: number;
  paymentMethod: "cash" | "card" | "transfer" | "debt";
  paidAmount?: number;
  notes?: string;
}

export interface DirectMillingTicketResult {
  ok: boolean;
  message?: string;
  ticketNumber?: string;
  invoiceId?: string;
  jobId?: string;
  intakeId?: string;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  details?: {
    customerName: string;
    grainType: string;
    millingTypeLabel: string;
    bagCount: number;
    bagSizeKg: number;
    totalWeightKg: number;
    bagsSourceLabel: string;
    millingFeeTotal: number;
    packagingTotal: number;
    grandTotal: number;
    createdAt: string;
  };
}

export interface BulkCustodyIntakeInput {
  storeId: string;
  customerId: string;
  grainType: string;
  grainGradeId?: string | null;
  grainProductId?: string | null;
  bagCount: number;
  bagSizeKg: number;
  grossWeightKg?: number;
  tareWeightKg?: number;
  moisture?: number;
  impurities?: number;
  truckPlate?: string;
  driverName?: string;
  siloOrLocation?: string;
  notes?: string;
}

export interface QuickMillingFeedItem {
  id: string;
  docNumber: string;
  type: "DIRECT_MILL" | "CUSTODY_INTAKE" | "DELIVERY";
  typeLabelAr: string;
  customerName: string;
  customerId: string;
  grainType: string;
  weightKg: number;
  bagCount: number;
  bagSizeKg: number;
  status: MillingStatus | "DELIVERED";
  statusLabelAr: string;
  amount: number;
  paid: number;
  createdAt: string;
  jobId?: string;
  intakeId?: string;
  invoiceId?: string;
  isDelivered: boolean;
}

/* ---------------------------------------------------- grain grade helpers */

/**
 * Fetches all active grain grades from the database.
 * Used by the unified desk to populate grain type dropdowns.
 */
export async function fetchGrainGrades(): Promise<GrainGradeOption[]> {
  const { data, error } = await db
    .from("milling_grain_grades_view")
    .select(
      "id, product_id, sku, grade_code, grade_name_ar, origin, max_moisture, max_impurities, default_bag_size_kg, default_bag_type, default_service_sku, is_active",
    )
    .eq("is_active", true)
    .order("grade_name_ar");

  if (!error && data && data.length > 0) {
    return data as GrainGradeOption[];
  }

  // Fallback to table if view has issue
  const { data: rawData, error: rawError } = await db
    .from("milling_grain_grades")
    .select(
      "id, product_id, grade_code, grade_name_ar, origin, max_moisture, max_impurities, default_bag_size_kg, default_bag_type, default_service_sku, is_active",
    )
    .eq("is_active", true)
    .order("grade_name_ar");

  if (rawError) {
    console.warn("لم يتم تحميل أنواع الحبوب المرجعية:", rawError.message);
    return [];
  }
  return (rawData || []) as GrainGradeOption[];
}

/**
 * Auto-resolves grain_grade_id from grain type text when not explicitly provided.
 * Falls back to the first active grade if no match found.
 */
async function resolveGrainGradeId(
  grainGradeId: string | null | undefined,
  grainType: string,
): Promise<{ gradeId: string | null; productId: string | null; gradeName: string }> {
  // If already provided, just validate and return
  if (grainGradeId) {
    const { data: grade } = await db
      .from("milling_grain_grades")
      .select("id, product_id, grade_name_ar")
      .eq("id", grainGradeId)
      .eq("is_active", true)
      .maybeSingle();

    if (grade) {
      return { gradeId: grade.id, productId: grade.product_id, gradeName: grade.grade_name_ar };
    }
  }

  // Try fuzzy text match on grade_name_ar
  const searchTerm = grainType.trim();
  if (searchTerm) {
    const { data: grades } = await db
      .from("milling_grain_grades")
      .select("id, product_id, grade_name_ar")
      .eq("is_active", true)
      .ilike("grade_name_ar", `%${searchTerm}%`)
      .limit(1);

    if (grades && grades.length > 0) {
      return {
        gradeId: grades[0].id,
        productId: grades[0].product_id,
        gradeName: grades[0].grade_name_ar,
      };
    }
  }

  // Fallback: get the first active grade
  const { data: anyGrade } = await db
    .from("milling_grain_grades")
    .select("id, product_id, grade_name_ar")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (anyGrade) {
    return {
      gradeId: anyGrade.id,
      productId: anyGrade.product_id,
      gradeName: anyGrade.grade_name_ar,
    };
  }

  return { gradeId: null, productId: null, gradeName: searchTerm };
}

/* ----------------------------------------------------------- direct ticket */

export async function executeDirectMillingTicket(
  input: DirectMillingTicketInput,
): Promise<DirectMillingTicketResult> {
  try {
    // 1. Resolve Warehouse & Customer
    let customerId = input.customerId;
    let customerName = input.customerName || "عميل نقدي صالة";

    if (!customerId) {
      // Find or use default cash customer
      const { data: cashCust } = await db
        .from("customers")
        .select("id, name")
        .ilike("name", "%نقدي%")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (cashCust) {
        customerId = cashCust.id;
        if (!input.customerName) customerName = cashCust.name;
      } else {
        // Fallback to any active customer
        const { data: anyCust } = await db
          .from("customers")
          .select("id, name")
          .eq("is_active", true)
          .limit(1)
          .single();
        if (!anyCust) throw new Error("لا يوجد عملاء معرفين في النظام. أضف عميلاً أولاً.");
        customerId = anyCust.id;
        if (!input.customerName) customerName = anyCust.name;
      }
    }

    if (!customerId) {
      throw new Error("تعذر تحديد العميل لإصدار التذكرة.");
    }

    const bagCount = Math.max(1, Number(input.bagCount) || 1);
    const bagSizeKg = Number(input.bagSizeKg) || 50;
    const totalWeightKg = input.totalWeightKg || bagCount * bagSizeKg;
    const millingFeeTotal = round2(bagCount * (Number(input.millingFeeRate) || 0));

    let packagingTotal = 0;
    const millBagsUsed = input.bagsSource === "MILL" ? Number(input.millBagsCount || bagCount) : 0;
    if (input.bagsSource === "MILL" && input.millBagProductId) {
      packagingTotal = round2(millBagsUsed * (Number(input.millBagPrice) || 0));
    }

    const discount = Number(input.discount) || 0;
    const grandTotal = Math.max(0, round2(millingFeeTotal + packagingTotal - discount));
    const paidAmount = input.paidAmount !== undefined ? Number(input.paidAmount) : grandTotal;
    const remainingAmount = round2(grandTotal - paidAmount);

    // 1.5 Resolve grain grade (critical — RPC requires it)
    const grainResolved = await resolveGrainGradeId(
      input.grainGradeId,
      input.grainType || "قمح بلدي محلي",
    );

    // 2. Step 1: Create Intake Receipt (Custody Intake with nominal weight)
    const intakeRes = await createIntake({
      storeId: input.storeId,
      customerId,
      grainType: grainResolved.gradeName || input.grainType || "قمح بلدي",
      grainProductId: grainResolved.productId || input.grainProductId || null,
      grainGradeId: grainResolved.gradeId,
      bagSizeKg,
      bagCount,
      grossWeightKg: totalWeightKg,
      tareWeightKg: 0,
      notes: `طحن فوري نقدي — ${customerName} (${input.notes || ""})`,
    });

    if (!intakeRes.ok || !intakeRes.id) {
      throw new Error(intakeRes.message || "فشل تسجيل استلام الحبوب للطحن الفوري.");
    }

    const intakeId = intakeRes.id;

    // 3. Step 2: Create Milling Job
    const jobRes = await createJob({
      intakeReceiptId: intakeId,
      inputBagCount: bagCount,
      inputBagSizeKg: bagSizeKg,
      inputWeightKg: totalWeightKg,
      feePerBag: Number(input.millingFeeRate) || 0,
      feePerTon: 0,
      notes: `أمر طحن فوري — ${customerName}`,
    });

    if (!jobRes.ok || !jobRes.id) {
      throw new Error(jobRes.message || "فشل فتح أمر الطحن الفوري.");
    }

    const jobId = jobRes.id;

    // 4. Step 3: Add Output Record
    const addOutRes = await addOutput({
      jobId,
      outputType: input.millingType || "FLOUR_GRADE_1",
      bagSizeKg,
      producedBagCount: bagCount,
      producedWeightKg: totalWeightKg,
      bagsSource: input.bagsSource,
      millBagProductId: input.bagsSource === "MILL" ? input.millBagProductId : null,
      millBagsUsed,
    });

    if (!addOutRes.ok) {
      console.warn("لم يتم تسجيل سطر الناتج، سيتم إقفال الأمر مباشرة:", addOutRes.message);
    }

    // 5. Step 4: Complete Job
    const completeRes = await completeJob(jobId, "طحن فوري مكتمل في الصالة");
    if (!completeRes.ok) {
      throw new Error(completeRes.message || "فشل إقفال أمر الطحن الفوري.");
    }

    // 6. Step 5: Issue Service & Packaging Invoice
    const invoiceRes = await invoiceJob({
      jobId,
      paymentMethod: input.paymentMethod,
      paid: paidAmount,
      discount,
      note: `فاتورة طحن فوري — ${customerName} (${grainResolved.gradeName || input.grainType})`,
      includePackaging: input.bagsSource === "MILL",
    });

    let invoiceId: string | undefined = undefined;
    if (invoiceRes.ok && invoiceRes.id) {
      invoiceId = invoiceRes.id;
    }

    // 7. Step 6: Process Delivery Note (Instant Delivery of ground bags)
    try {
      // Find output id to deliver
      const { data: outputs } = await db
        .from("milling_outputs")
        .select("id, produced_bag_count, produced_weight_kg")
        .eq("job_id", jobId);

      if (outputs && outputs.length > 0) {
        await processDelivery({
          jobId,
          truckPlate: "تسليم فوري صالة",
          driverName: customerName,
          notes: "تم تسليم الدقيق المطحون للعميل في الحال",
          items: outputs.map((o: any) => ({
            jobOutputId: o.id,
            deliveredBags: Number(o.produced_bag_count) || bagCount,
            deliveredWeightKg: Number(o.produced_weight_kg) || totalWeightKg,
          })),
        });
      }
    } catch (delErr) {
      console.warn("لم يكتمل سند التسليم:", delErr);
    }

    // Read back formatted document number
    let ticketNumber = `MIL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${jobId.slice(0, 4).toUpperCase()}`;
    if (invoiceId) {
      const { data: invRow } = await db
        .from("sales_invoices")
        .select("invoice_number")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invRow?.invoice_number) ticketNumber = invRow.invoice_number;
    }

    const millingLabels: Record<string, string> = {
      FLOUR_GRADE_1: "طحن ناعم (دقيق زيرو نمرة 1)",
      FLOUR_GRADE_2: "طحن بر (دقيق بلدي كامل)",
      SEMOLINA: "طحن سميد",
      BRAN: "جرش نخالة",
    };

    return {
      ok: true,
      ticketNumber,
      invoiceId,
      jobId,
      intakeId,
      totalAmount: grandTotal,
      paidAmount,
      remainingAmount,
      details: {
        customerName,
        grainType: grainResolved.gradeName || input.grainType,
        millingTypeLabel: millingLabels[input.millingType] || "طحن ناعم",
        bagCount,
        bagSizeKg,
        totalWeightKg,
        bagsSourceLabel: input.bagsSource === "MILL" ? "أكياس المطحنة" : "أكياس العميل",
        millingFeeTotal,
        packagingTotal,
        grandTotal,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err.message || "حدث خطأ غير متوقع أثناء معالجة تذكرة الطحن.",
    };
  }
}

/* ------------------------------------------------------------- bulk intake */

export async function executeBulkCustodyIntake(
  input: BulkCustodyIntakeInput,
): Promise<{ ok: boolean; id?: string; number?: string; message?: string }> {
  try {
    const bagCount = Math.max(1, Number(input.bagCount) || 1);
    const bagSizeKg = Number(input.bagSizeKg) || 50;
    const nominalWeight = bagCount * bagSizeKg;
    const grossWeight = input.grossWeightKg || nominalWeight;
    const tareWeight = input.tareWeightKg || 0;

    // Resolve grain grade
    const grainResolved = await resolveGrainGradeId(
      input.grainGradeId,
      input.grainType || "قمح بلدي محلي",
    );

    const res = await createIntake({
      storeId: input.storeId,
      customerId: input.customerId,
      grainType: grainResolved.gradeName || input.grainType,
      grainProductId: grainResolved.productId || input.grainProductId || null,
      grainGradeId: grainResolved.gradeId,
      bagSizeKg,
      bagCount,
      grossWeightKg: grossWeight,
      tareWeightKg: tareWeight,
      moisture: input.moisture,
      impurities: input.impurities,
      truckPlate: input.truckPlate,
      driverName: input.driverName,
      silo: input.siloOrLocation,
      notes: input.notes,
    });

    if (!res.ok || !res.id) {
      throw new Error(res.message || "تعذر تسجيل سند استلام الحبوب بالأمانات.");
    }

    const { data: row } = await db
      .from("milling_intake_receipts")
      .select("receipt_number")
      .eq("id", res.id)
      .maybeSingle();

    return {
      ok: true,
      id: res.id,
      number: row?.receipt_number,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err.message || "فشل تسجيل سند الأمانات.",
    };
  }
}

/* ----------------------------------------------------------- live feed */

export async function fetchTodayUnifiedFeed(storeId?: string): Promise<QuickMillingFeedItem[]> {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Fetch recent jobs
  let qJobs = db
    .from("milling_jobs")
    .select(
      `
      id, job_number, status, input_bag_count, input_bag_size_kg, input_weight_kg,
      milling_fee_per_bag, created_at, customer_id, intake_receipt_id,
      customers(name),
      milling_intake_receipts(grain_type, receipt_number)
    `,
    )
    .gte("created_at", `${today}T00:00:00.000Z`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (storeId) qJobs = qJobs.eq("store_id", storeId);

  const { data: jobsData } = await qJobs;

  // 2. Fetch recent standalone intakes (not yet converted to jobs)
  let qIntakes = db
    .from("milling_intake_receipts")
    .select(
      `
      id, receipt_number, status, intake_bag_count, bag_size_kg, net_weight_kg,
      grain_type, created_at, customer_id, customers(name)
    `,
    )
    .gte("created_at", `${today}T00:00:00.000Z`)
    .order("created_at", { ascending: false })
    .limit(30);

  if (storeId) qIntakes = qIntakes.eq("store_id", storeId);

  const { data: intakesData } = await qIntakes;

  // 3. Combine and normalize
  const feed: QuickMillingFeedItem[] = [];
  const processedIntakeIds = new Set<string>();

  for (const j of jobsData || []) {
    if (j.intake_receipt_id) processedIntakeIds.add(j.intake_receipt_id);

    const isDelivered = j.status === "DELIVERED";
    const bagCount = Number(j.input_bag_count) || 0;
    const bagSize = Number(j.input_bag_size_kg) || 50;
    const weight = Number(j.input_weight_kg) || bagCount * bagSize;
    const feeRate = Number(j.milling_fee_per_bag) || 0;
    const totalAmount = bagCount * feeRate;

    feed.push({
      id: j.id,
      docNumber: j.job_number,
      type: "DIRECT_MILL",
      typeLabelAr: "طحن وتشغيل",
      customerName: j.customers?.name || "عميل نقدي",
      customerId: j.customer_id,
      grainType: j.milling_intake_receipts?.grain_type || "حبوب قمح",
      weightKg: weight,
      bagCount,
      bagSizeKg: bagSize,
      status: j.status,
      statusLabelAr: getMillingStatusLabel(j.status),
      amount: totalAmount,
      paid: totalAmount,
      createdAt: j.created_at,
      jobId: j.id,
      intakeId: j.intake_receipt_id,
      isDelivered,
    });
  }

  // Add unprocessed custody intakes
  for (const i of intakesData || []) {
    if (processedIntakeIds.has(i.id)) continue;

    const bagCount = Number(i.intake_bag_count) || 0;
    const bagSize = Number(i.bag_size_kg) || 50;
    const weight = Number(i.net_weight_kg) || bagCount * bagSize;

    feed.push({
      id: i.id,
      docNumber: i.receipt_number,
      type: "CUSTODY_INTAKE",
      typeLabelAr: "سند أمانات",
      customerName: i.customers?.name || "عميل أمانات",
      customerId: i.customer_id,
      grainType: i.grain_type || "حبوب قمح",
      weightKg: weight,
      bagCount,
      bagSizeKg: bagSize,
      status: i.status || "RECEIVED",
      statusLabelAr: "بالأمانات (جاهز)",
      amount: 0,
      paid: 0,
      createdAt: i.created_at,
      intakeId: i.id,
      isDelivered: false,
    });
  }

  // Sort descending
  return feed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/* ------------------------------------------------------------- helpers */

function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

function getMillingStatusLabel(status: string): string {
  switch (status) {
    case "DELIVERED":
      return "تم الطحن والتسليم";
    case "COMPLETED":
      return "مطحون (جاهز للاستلام)";
    case "PROCESSING":
      return "قيد الطحن بالصالة";
    case "RECEIVED":
      return "مستلم بالأمانات";
    default:
      return status;
  }
}
