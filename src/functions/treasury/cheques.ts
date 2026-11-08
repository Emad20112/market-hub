/** Transport — المرحلة 13.2: تحصيل/ارتداد الشيكات (استبدال clear_cheque/bounce_cheque — 9b). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { bounceCheque, clearCheque } from "@/server/domains/treasury/application/treasury.usecases";

export const clearChequeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      chequeId: z.string().uuid(),
      clearingBankAccountId: z.string().uuid(),
      clearedDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      notes: z.string().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const result = await clearCheque(sessionFromContext(context), data);
    return result;
  });

export const bounceChequeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      chequeId: z.string().uuid(),
      reason: z.string().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const result = await bounceCheque(sessionFromContext(context), data);
    return result;
  });
