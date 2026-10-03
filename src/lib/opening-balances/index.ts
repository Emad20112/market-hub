/**
 * Market-Hub ERP — Opening balances: data access layer.
 *
 * Opening the books is a balancing act, not a data-entry act. This layer is
 * built around that: the summary it fetches carries `is_balanced` and
 * `capital_required_now`, so the screen can show how far off the entry is
 * BEFORE posting rather than after being refused.
 *
 * The side of a line (debit/credit) is never sent. The server derives it from
 * the section, because a line that claims to be an asset on the credit side is
 * exactly the mistake a balance check exists to catch.
 */
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type OpeningSection =
  "STOCK" | "RECEIVABLE" | "PAYABLE" | "CASH" | "BANK" | "ASSET" | "LIABILITY" | "CAPITAL";

export type OpeningStatus = "DRAFT" | "POSTED" | "REVERSED";

/**
 * Sections grouped by side, so the picker cannot offer a liability where an
 * asset belongs. The hint on CAPITAL matters most: capital is the balancing
 * figure, so the summary tells you what it SHOULD be rather than making you
 * guess and then be rejected.
 */
export const OPENING_SECTIONS: {
  value: OpeningSection;
  label: string;
  hint: string;
  needsRef: "customer" | "supplier" | "item" | null;
  needsQty: boolean;
}[] = [
  {
    value: "STOCK",
    label: "مخزون",
    hint: "كمية × تكلفة، يُرحَّل كمخزون حقيقي بحركة OPENING",
    needsRef: "item",
    needsQty: true,
  },
  {
    value: "RECEIVABLE",
    label: "ذمم عملاء",
    hint: "يدخل كشف حساب العميل",
    needsRef: "customer",
    needsQty: false,
  },
  {
    value: "CASH",
    label: "نقدية الصندوق",
    hint: "مُسجَّل فقط — لا يوجد دفتر نقدية في النظام بعد",
    needsRef: null,
    needsQty: false,
  },
  {
    value: "BANK",
    label: "أرصدة بنكية",
    hint: "مُسجَّل فقط — لا يوجد دفتر حسابات في النظام بعد",
    needsRef: null,
    needsQty: false,
  },
  {
    value: "ASSET",
    label: "أصول ثابتة",
    hint: "مُسجَّل فقط — يُقيَّم لاحقاً عند الإهلاك",
    needsRef: null,
    needsQty: false,
  },
  {
    value: "LIABILITY",
    label: "التزامات",
    hint: "ما على الشركة من ديون",
    needsRef: null,
    needsQty: false,
  },
  {
    value: "PAYABLE",
    label: "ذمم موردين",
    hint: "يدخل رصيد المورد",
    needsRef: "supplier",
    needsQty: false,
  },
  {
    value: "CAPITAL",
    label: "رأس المال",
    hint: "الرقم الذي يتوازن عليه القيد — الملخص يخبرك بالقيمة المطلوبة",
    needsRef: null,
    needsQty: false,
  },
];

export interface OpeningLine {
  id: string;
  section: OpeningSection;
  side: "DEBIT" | "CREDIT";
  description: string;
  product_id: string | null;
  warehouse_id: string | null;
  customer_id: string | null;
  supplier_id: string | null;
  quantity: number | null;
  unit_cost: number | null;
  amount: number;
}

export interface OpeningDocument {
  id: string;
  document_number: string;
  effective_date: string;
  status: OpeningStatus;
  fiscal_year: number;
  notes: string | null;
  created_at: string;
}

export interface OpeningSummary extends OpeningDocument {
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
  capital_required_now: number;
  stock_amount: number;
  receivable_amount: number;
  payable_amount: number;
  cash_amount: number;
  bank_amount: number;
  asset_amount: number;
  liability_amount: number;
  capital_amount: number;
}

export interface OpeningLineDraft {
  section: OpeningSection;
  description: string;
  amount: number;
  product_id?: string | null;
  warehouse_id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  quantity?: number | null;
  unit_cost?: number | null;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as T;
}

/* ---------------------------------------------------------------- reads */

export async function fetchOpeningDocuments(): Promise<OpeningSummary[]> {
  return unwrap(
    await db
      .from("opening_balance_summary")
      .select("*")
      .order("effective_date", { ascending: false })
      .limit(100),
    "تعذّر تحميل الأرصدة الافتتاحية",
  );
}

export async function fetchOpeningLines(documentId: string): Promise<OpeningLine[]> {
  return unwrap(
    await db.from("opening_balance_lines").select("*").eq("document_id", documentId),
    "تعذّر تحميل بنود الرصيد الافتتاحي",
  );
}

export async function fetchStockableItems(): Promise<
  { id: string; sku: string; name_ar: string | null }[]
> {
  const rows = unwrap(
    await db
      .from("products")
      .select("id, sku, name_ar")
      .eq("item_nature", "GOOD")
      .eq("inventory_policy", "TRACKED")
      .eq("is_active", true),
    "تعذّر تحميل أصناف المخزون",
  ) as { id: string; sku: string; name_ar: string | null }[];
  return rows;
}

export async function fetchCustomers(): Promise<{ id: string; name: string }[]> {
  return unwrap(
    await db.from("customers").select("id, name").eq("is_active", true),
    "تعذّر تحميل العملاء",
  ) as { id: string; name: string }[];
}

export async function fetchSuppliers(): Promise<{ id: string; name: string }[]> {
  return unwrap(
    await db.from("suppliers").select("id, name").eq("is_active", true),
    "تعذّر تحميل الموردين",
  ) as { id: string; name: string }[];
}

export async function fetchWarehouses(): Promise<{ id: string; name_ar: string | null }[]> {
  return unwrap(
    await db.from("warehouses").select("id, name_ar").eq("is_active", true),
    "تعذّر تحميل المستودعات",
  ) as { id: string; name_ar: string | null }[];
}

/* --------------------------------------------------------------- writes */

export async function createOpeningDocument(input: {
  effectiveDate: string;
  lines: OpeningLineDraft[];
  notes?: string;
}): Promise<string> {
  const { data, error } = await db.rpc("create_opening_balance", {
    _effective_date: input.effectiveDate,
    _lines: JSON.stringify(input.lines),
    _notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function postOpeningDocument(documentId: string): Promise<void> {
  const { error } = await db.rpc("post_opening_balance", { _document_id: documentId });
  if (error) throw new Error(error.message);
}

export async function reverseOpeningDocument(documentId: string, reason: string): Promise<void> {
  const { error } = await db.rpc("reverse_opening_balance", {
    _document_id: documentId,
    _reason: reason,
  });
  if (error) throw new Error(error.message);
}

/* -------------------------------------------------------------- helpers */

/** R.ي formatting with the currency the mill actually trades in. */
export const yer = (v: number | null | undefined) =>
  `${(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ر.ي`;
