/** Transport — المرحلة 10b: إنشاء مستند مصروف (استبدال create_expense_v2). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createExpense } from "@/server/domains/expenses/application/expense-lifecycle.usecases";

/** DTO قابل للتسلسل عبر حدود server function (jsonb الصف كما هو). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const lineSchema = z.object({
  description: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  quantity: z.number().positive().optional(),
  unit_price: z.number().min(0).optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  cost_center_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  note: z.string().nullable().optional(),
});

const inputSchema = z.object({
  lines: z.array(lineSchema).min(1),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  entryType: z.string().nullable().optional(),
  payeeType: z.string().nullable().optional(),
  payeeName: z.string().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  taxMode: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  submit: z.boolean().optional(),
  supplierInvoiceNumber: z.string().nullable().optional(),
  taxRecoverable: z.boolean().optional(),
  idempotencyKey: z.string().nullable().optional(),
});

export const createExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const entry = await createExpense(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });
