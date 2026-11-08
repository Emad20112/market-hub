/** Transport — المرحلة 9: تغيير حالة فترة مالية (استبدال set_period_status). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { setPeriodStatus } from "@/server/domains/accounting/application/accounting.usecases";

const inputSchema = z.object({
  periodId: z.string().uuid(),
  status: z.enum(["OPEN", "CLOSED"]),
});

export const setPeriodStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { changed } = await setPeriodStatus(sessionFromContext(context), data);
    return { ok: true as const, changed };
  });
