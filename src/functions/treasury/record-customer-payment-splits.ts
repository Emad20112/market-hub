/** Transport — المرحلة 7: تحصيل مجزأ (استبدال record_customer_payment_splits). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { recordCustomerPaymentSplits } from "@/server/domains/treasury/application/treasury.usecases";

const inputSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  note: z.string().nullable().optional(),
  splits: z
    .array(
      z.object({
        methodId: z.string().nullable().optional(),
        method: z.string().nullable().optional(),
        amount: z.number().positive(),
        reference: z.string().nullable().optional(),
        cashboxId: z.string().uuid().nullable().optional(),
        bankAccountId: z.string().uuid().nullable().optional(),
        paymentMethodId: z.string().nullable().optional(),
      }),
    )
    .min(2),
});

export const recordCustomerPaymentSplitsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { paymentId } = await recordCustomerPaymentSplits(sessionFromContext(context), data);
    return { ok: true as const, paymentId };
  });
