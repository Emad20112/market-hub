/** Transport — المرحلة 5: تعديل نقاط الولاء (استبدال adjust_loyalty). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { adjustLoyalty } from "@/server/domains/sales/application/sales.usecases";

const inputSchema = z.object({
  customerId: z.string().uuid(),
  points: z.number(),
  kind: z.enum(["earn", "redeem", "adjust"]),
  note: z.string().nullable().optional(),
});

export const adjustLoyaltyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { transactionId } = await adjustLoyalty(sessionFromContext(context), data);
    return { ok: true as const, transactionId };
  });
