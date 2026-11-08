/** Transport — المرحلة 3: تسليم مادة مملوكة للعميل (استبدال release_customer_owned_stock). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { releaseCustomerOwnedStock } from "@/server/domains/inventory/application/batches.usecase";

const inputSchema = z.object({
  customerId: z.string().uuid(),
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().positive(),
  note: z.string().nullable().optional(),
});

export const releaseCustomerOwnedStockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { movementId } = await releaseCustomerOwnedStock(sessionFromContext(context), data);
    return { movementId };
  });
