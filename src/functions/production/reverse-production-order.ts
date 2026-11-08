/** Transport — المرحلة 11: عكس تشغيلة إنتاج (استبدال reverse_production_order). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { reverseProductionOrder } from "@/server/domains/production/application/production.service";

export const reverseProductionOrderFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      orderId: z.string().uuid(),
      reason: z.string().min(3),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const orderId = await reverseProductionOrder(sessionFromContext(context), data);
    return { ok: true as const, orderId };
  });
