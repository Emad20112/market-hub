/** Transport — المرحلة 3: استلام مادة مملوكة للعميل (استبدال receive_customer_owned_stock). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { receiveCustomerOwnedStock } from "@/server/domains/inventory/application/batches.usecase";

const inputSchema = z.object({
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0).optional(),
  note: z.string().nullable().optional(),
});

export const receiveCustomerOwnedStockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { movementId } = await receiveCustomerOwnedStock(sessionFromContext(context), data);
    return { movementId };
  });
