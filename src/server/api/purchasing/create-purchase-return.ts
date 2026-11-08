/** Transport — المرحلة 8: مرتجع مشتريات مربوط بفاتورته الأصلية (استبدال create_purchase_return). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createPurchaseReturn } from "@/server/domains/purchasing/application/purchasing.usecases";

const inputSchema = z.object({
  invoiceId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  supplierId: z.string().uuid(),
  refundMethod: z.string().min(1),
  note: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        invoiceItemId: z.string().uuid(),
        productId: z.string().uuid(),
        quantity: z.number().positive(),
        uomId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1),
});

export const createPurchaseReturnFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { returnId } = await createPurchaseReturn(sessionFromContext(context), data);
    return { ok: true as const, returnId };
  });
