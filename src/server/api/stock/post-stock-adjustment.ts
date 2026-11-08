/** Transport — المرحلة 4: تسوية مخزون موثقة (استبدال post_stock_adjustment). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { postStockAdjustment } from "@/server/domains/stock/application/stock.usecases";

const inputSchema = z.object({
  warehouseId: z.string().uuid(),
  reason: z.string().min(1),
  note: z.string().nullable().optional(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().refine((q) => q !== 0, "non-zero required"),
        unitCost: z.number().min(0),
        note: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

export const postStockAdjustmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { adjustmentId } = await postStockAdjustment(sessionFromContext(context), data);
    return { ok: true as const, adjustmentId };
  });
