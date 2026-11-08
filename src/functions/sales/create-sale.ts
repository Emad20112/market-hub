/** Transport — المرحلة 5: إنشاء فاتورة بيع ذرّية (استبدال create_sale). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createSale } from "@/server/domains/sales/application/sales.usecases";

const lineSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  taxRate: z.number().min(0).max(100).nullable().optional(),
  isService: z.boolean().optional(),
  name: z.string().nullable().optional(),
  batchId: z.string().uuid().nullable().optional(),
  batchNumber: z.string().nullable().optional(),
  uomId: z.string().uuid().nullable().optional(),
});

const splitSchema = z.object({
  method: z.string().min(1),
  amount: z.number().positive(),
  paymentMethodId: z.string().nullable().optional(),
  cashboxId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  reference: z.string().nullable().optional(),
});

const inputSchema = z.object({
  warehouseId: z.string().uuid(),
  customerId: z.string().uuid().nullable().optional(),
  paymentMethod: z.string().min(1),
  paid: z.number().min(0).nullable().optional(),
  discount: z.number().min(0).nullable().optional(),
  note: z.string().nullable().optional(),
  saleDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  paymentSplits: z.array(splitSchema).nullable().optional(),
  items: z.array(lineSchema).min(1),
});

export const createSaleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { invoiceId } = await createSale(sessionFromContext(context), data);
    return { ok: true as const, invoiceId };
  });
