/** Transport — المرحلة 7: سند قبض من عميل (استبدال record_customer_payment). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { recordCustomerPayment } from "@/server/domains/treasury/application/treasury.usecases";

const inputSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  method: z.string().min(1),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  note: z.string().nullable().optional(),
  cashboxId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
  paymentMethodId: z.string().nullable().optional(),
  chequeNumber: z.string().nullable().optional(),
  chequeBank: z.string().nullable().optional(),
  chequeDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  chequeDrawer: z.string().nullable().optional(),
});

export const recordCustomerPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { paymentId } = await recordCustomerPayment(sessionFromContext(context), data);
    return { ok: true as const, paymentId };
  });
