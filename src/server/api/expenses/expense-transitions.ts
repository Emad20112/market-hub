/** Transport — المرحلة 10b: انتقالات دورة حياة المصروف (استبدال دوال 010/011). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  cancelExpense,
  closeExpense,
  decideExpense,
  postExpense,
  recordExpensePayment,
  reverseExpense,
  reverseExpensePayment,
  submitExpense,
  updateExpense,
} from "@/server/domains/expenses/application/expense-lifecycle.usecases";

/** DTO قابل للتسلسل عبر حدود server function (jsonb الصف كما هو). */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const linesSchema = z
  .array(
    z.object({
      description: z.string().nullable().optional(),
      category_id: z.string().uuid().nullable().optional(),
      quantity: z.number().positive().optional(),
      unit_price: z.number().min(0).optional(),
      tax_rate: z.number().min(0).max(100).optional(),
      cost_center_id: z.string().uuid().nullable().optional(),
      project_id: z.string().uuid().nullable().optional(),
      note: z.string().nullable().optional(),
    }),
  )
  .min(1);

const updateSchema = z.object({
  entryId: z.string().uuid(),
  expectedVersion: z.number().int().nullable().optional(),
  lines: linesSchema,
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
  supplierInvoiceNumber: z.string().nullable().optional(),
  taxRecoverable: z.boolean().optional(),
});

export const updateExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(updateSchema.parse)
  .handler(async ({ data, context }) => {
    const entry = await updateExpense(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });

export const submitExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      entryId: z.string().uuid(),
      expectedVersion: z.number().int().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const entry = await submitExpense(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });

export const decideExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      entryId: z.string().uuid(),
      approve: z.boolean(),
      reason: z.string().nullable().optional(),
      expectedVersion: z.number().int().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const entry = await decideExpense(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });

const postSchema = z.object({
  entryId: z.string().uuid(),
  expectedVersion: z.number().int().nullable().optional(),
  payNow: z.boolean().optional(),
  paymentMethod: z.string().nullable().optional(),
  accountLabel: z.string().nullable().optional(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  idempotencyKey: z.string().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  cashboxId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  paymentMethodId: z.string().nullable().optional(),
});

export const postExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(postSchema.parse)
  .handler(async ({ data, context }) => {
    const entry = await postExpense(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });

export const recordExpensePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    postSchema.extend({
      amount: z.number().positive(),
      referenceNo: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const entry = await recordExpensePayment(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });

export const reverseExpensePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ paymentId: z.string().uuid(), reason: z.string().nullable().optional() }).parse,
  )
  .handler(async ({ data, context }) => {
    const entry = await reverseExpensePayment(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });

export const closeExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ entryId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const entry = await closeExpense(sessionFromContext(context), data.entryId);
    return { ok: true as const, entry: entry as JsonValue };
  });

export const cancelExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      entryId: z.string().uuid(),
      reason: z.string().min(1),
      expectedVersion: z.number().int().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const entry = await cancelExpense(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });

export const reverseExpenseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ entryId: z.string().uuid(), reason: z.string().nullable().optional() }).parse,
  )
  .handler(async ({ data, context }) => {
    const entry = await reverseExpense(sessionFromContext(context), data);
    return { ok: true as const, entry: entry as JsonValue };
  });
