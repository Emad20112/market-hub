/** Transport — المرحلة 3: حذف دفعة (استبدال delete_product_batch). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { deleteProductBatch } from "@/server/domains/inventory/application/batches.usecase";

const inputSchema = z.object({
  batchId: z.string().uuid(),
  syncInventory: z.boolean().optional(),
});

export const deleteProductBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { deleted } = await deleteProductBatch(
      sessionFromContext(context),
      data.batchId,
      data.syncInventory ?? true,
    );
    return { deleted };
  });
