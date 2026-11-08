/** Transport — المرحلة 8: فاتورة مشتريات ذرّية (استبدال create_purchase). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createPurchase } from "@/server/domains/purchasing/application/purchasing.usecases";

const inputSchema = z.object({
  warehouseId: z.string().uuid(),
  supplierId: z.string().uuid(),
  paymentMethod: z.string().min(1),
  paid: z.number().min(0).nullable().optional(),
  discount: z.number().min(0).nullable().optional(),
  note: z.string().nullable().optional(),
  cashboxId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  paymentReference: z.string().nullable().optional(),
  paymentMethodId: z.string().nullable().optional(),
  paymentSplits: z
    .array(
      z.object({
        method: z.string().min(1),
        amount: z.number().positive(),
        paymentMethodId: z.string().nullable().optional(),
        cashboxId: z.string().uuid().nullable().optional(),
        bankAccountId: z.string().uuid().nullable().optional(),
        reference: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().nullable().optional(),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
        taxRate: z.number().min(0).max(100).nullable().optional(),
        isService: z.boolean().optional(),
        batchNumber: z.string().nullable().optional(),
        expiryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        uomId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1),
});

export const createPurchaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { invoiceId } = await createPurchase(sessionFromContext(context), data);
    return { ok: true as const, invoiceId };
  });
