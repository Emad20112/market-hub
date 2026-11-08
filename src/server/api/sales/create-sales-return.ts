/** Transport — المرحلة 5: مرتجع مبيعات مربوط بفاتورته الأصلية (استبدال create_sales_return). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createSalesReturn } from "@/server/domains/sales/application/sales.usecases";

const inputSchema = z.object({
  invoiceId: z.string().uuid(),
  warehouseId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid().nullable().optional(),
  refundMethod: z.enum(["cash", "card", "bank_transfer", "mobile_money", "split", "credit"]),
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

export const createSalesReturnFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { returnId } = await createSalesReturn(sessionFromContext(context), data);
    return { ok: true as const, returnId };
  });
