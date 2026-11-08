/** Transport — المرحلة 4: طريقة تكلفة المنشأة (استبدال set_company_costing_method). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { setCompanyCostingMethod } from "@/server/domains/stock/application/stock.usecases";

const inputSchema = z.object({
  method: z.string().min(1),
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const setCompanyCostingMethodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { changed } = await setCompanyCostingMethod(sessionFromContext(context), data);
    return { ok: true as const, changed };
  });
