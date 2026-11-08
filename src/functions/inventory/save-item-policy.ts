/** Transport — المرحلة 3: حفظ سياسة الصنف (استبدال save_item_policy). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { saveItemPolicy } from "@/server/domains/inventory/application/batches.usecase";

const inputSchema = z.object({
  itemId: z.string().uuid(),
  itemNature: z.enum(["GOOD", "SERVICE"]),
  inventoryPolicy: z.enum(["TRACKED", "UNTRACKED"]),
  costingMethod: z.enum(["AVG", "FIFO", "LIFO", "NONE"]),
  tracking: z.enum(["NONE", "BATCH", "SERIAL"]),
  isSellable: z.boolean(),
  isPurchasable: z.boolean(),
  baseUomId: z.string().uuid().nullable().optional(),
  salesUomId: z.string().uuid().nullable().optional(),
  purchaseUomId: z.string().uuid().nullable().optional(),
  uomConversions: z.unknown().nullable().optional(),
});

export const saveItemPolicyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { itemId } = await saveItemPolicy(sessionFromContext(context), data);
    return { itemId };
  });
