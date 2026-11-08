/** Transport — المرحلة 3: حفظ دفعة منتج (استبدال save_product_batch). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { saveProductBatch } from "@/server/domains/inventory/application/batches.usecase";

const inputSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  batchNumber: z.string().min(1),
  expiryDate: z.string().nullable().optional(),
  quantity: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  note: z.string().nullable().optional(),
  syncInventory: z.boolean().optional(),
  batchId: z.string().uuid().nullable().optional(),
});

export const saveProductBatchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { batchId } = await saveProductBatch(sessionFromContext(context), data);
    return { ok: true as const, batchId };
  });
