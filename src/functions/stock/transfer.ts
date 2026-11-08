/** Transport — المرحلة 13.2: تحويل مخزني بين مستودعين (استبدال create_stock_transfer). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createStockTransfer } from "@/server/domains/stock/application/stock.usecases";

const inputSchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  note: z.string().nullable().optional(),
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().positive() }))
    .min(1),
});

export const createStockTransferFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { transferId } = await createStockTransfer(sessionFromContext(context), {
      from: data.from,
      to: data.to,
      note: data.note ?? null,
      items: data.items,
    });
    return { ok: true as const, transferId };
  });
