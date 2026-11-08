/** Transport — المرحلة 3: حذف منتج محروس (استبدال product_delete_guard). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { deleteProductGuarded } from "@/server/domains/inventory/application/product-delete-guard.usecase";

const inputSchema = z.object({ productId: z.string().uuid() });

export const productDeleteGuardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const result = await deleteProductGuarded(sessionFromContext(context), data.productId);
    return {
      deleted: result.deleted,
      reason: result.reason,
      counts: result.counts,
    };
  });
