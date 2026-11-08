/** Transport — المرحلة 7: دفعة مقدمة من عميل (استبدال record_customer_advance_payment). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { recordCustomerAdvancePayment } from "@/server/domains/treasury/application/treasury.usecases";

const inputSchema = z.object({
  customerId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.string().min(1),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  note: z.string().nullable().optional(),
});

export const recordCustomerAdvancePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { paymentId } = await recordCustomerAdvancePayment(sessionFromContext(context), data);
    return { ok: true as const, paymentId };
  });
