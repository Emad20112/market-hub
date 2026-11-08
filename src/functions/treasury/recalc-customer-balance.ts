/** Transport — المرحلة 13.2: إعادة احتساب رصيد العميل (استبدال recalculate_customer_balance).
 *  نفس صلاحية الدالة القديمة (مالك/مدير/محاسب) ونفس العقد (reason/type). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { recalcCustomerBalance } from "@/server/domains/treasury/application/treasury.usecases";
import type { JsonValue } from "@/functions/expenses/expense-transitions";

const inputSchema = z.object({
  customerId: z.string().uuid(),
  reason: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
});

export const recalcCustomerBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const result = await recalcCustomerBalance(sessionFromContext(context), {
      customerId: data.customerId,
      reason: data.reason ?? null,
      type: data.type ?? "recalculation",
    });
    return { ok: true as const, result: result as JsonValue | null };
  });
