/** Transport — المرحلة 11: أمر إنتاج كامل (استبدال create_and_post_production_order). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createAndPostProductionOrder } from "@/server/domains/production/application/production.service";

const materialSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  uom_id: z.string().uuid().nullable().optional(),
  batch_id: z.string().uuid().nullable().optional(),
});

const outputSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  uom_id: z.string().uuid().nullable().optional(),
  allocation_value_per_base: z.number().min(0).nullable().optional(),
  batch_number: z.string().nullable().optional(),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

const expenseSchema = z.object({
  expense_line_id: z.string().uuid(),
  amount: z.number().positive(),
  basis: z.string().min(3),
  note: z.string().nullable().optional(),
});

const lossSchema = z.object({
  loss_type: z.enum(["NORMAL", "ABNORMAL"]),
  quantity: z.number().positive(),
  uom_id: z.string().uuid().nullable().optional(),
  reason: z.string().min(3),
  product_id: z.string().uuid().nullable().optional(),
  mass_kg: z.number().positive().nullable().optional(),
});

const inputSchema = z.object({
  warehouseId: z.string().uuid(),
  costCenterId: z.string().uuid(),
  productionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
  materials: z.array(materialSchema).min(1),
  outputs: z.array(outputSchema).min(1),
  expenses: z.array(expenseSchema).optional(),
  losses: z.array(lossSchema).optional(),
});

export const createAndPostProductionOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const orderId = await createAndPostProductionOrder(sessionFromContext(context), data);
    return { ok: true as const, orderId };
  });
