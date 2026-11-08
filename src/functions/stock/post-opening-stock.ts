/** Transport — المرحلة 4: ترحيل رصيد أول المدة المخزني (استبدال post_opening_stock). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { postOpeningStock } from "@/server/domains/stock/application/stock.usecases";

const inputSchema = z.object({
  warehouseId: z.string().uuid(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
        note: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

export const postOpeningStockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { openingId } = await postOpeningStock(sessionFromContext(context), data);
    return { ok: true as const, openingId };
  });
