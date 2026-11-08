/** Transport — المرحلة 3: تسوية الدفعات مع المخزون (استبدال reconcile_batches_with_inventory). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { reconcileBatchesWithInventory } from "@/server/domains/inventory/application/batches.usecase";

const inputSchema = z.object({ warehouseId: z.string().uuid().nullable().optional() });

export const reconcileBatchesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const diffs = await reconcileBatchesWithInventory(
      sessionFromContext(context),
      data.warehouseId ?? null,
    );
    return { diffs };
  });
