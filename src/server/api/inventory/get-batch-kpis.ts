/** Transport — المرحلة 3: مؤشرات الدفعات (استبدال get_batch_kpis). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { batchKpis } from "@/server/domains/inventory/application/batches.usecase";

const inputSchema = z.object({ warningDays: z.number().int().min(1).max(365).optional() });

export const getBatchKpisFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const kpis = await batchKpis(sessionFromContext(context), data.warningDays ?? 30);
    return { kpis };
  });
