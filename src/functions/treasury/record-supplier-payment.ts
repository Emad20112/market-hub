/** Transport — المرحلة 7: سند صرف لمورد (استبدال record_supplier_payment). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { recordSupplierPayment } from "@/server/domains/treasury/application/treasury.usecases";

const inputSchema = z.object({
  supplierId: z.string().uuid(),
  amount: z.number().positive(),
  paymentMethod: z.string().nullable().optional(),
  accountCode: z.string().nullable().optional(),
  paymentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  cashboxId: z.string().uuid().nullable().optional(),
  bankAccountId: z.string().uuid().nullable().optional(),
});

export const recordSupplierPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const result = await recordSupplierPayment(sessionFromContext(context), data);
    return {
      ok: true as const,
      paymentId: result.paymentId,
      voucherNumber: result.voucherNumber,
      journalEntryId: result.journalEntryId,
      newBalance: result.newBalance,
    };
  });
