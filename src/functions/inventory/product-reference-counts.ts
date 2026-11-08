/** Transport — المرحلة 3: فحص مراجع المنتج قبل الحذف (استبدال product_reference_counts). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { countProductReferences } from "@/server/domains/inventory/application/product-delete-guard.usecase";

const inputSchema = z.object({ productId: z.string().uuid() });

export const productReferenceCountsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { counts } = await countProductReferences(sessionFromContext(context), data.productId);
    return { counts };
  });
