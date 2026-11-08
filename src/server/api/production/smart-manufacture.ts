/** Transport — المرحلة 11: تصنيع ذكي وتحويل مخزون (استبدال smart_manufacture/convert_stock). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  convertStock,
  smartManufacture,
} from "@/server/domains/production/application/production.service";

const outputLine = z.object({
  item_id: z.string().uuid(),
  qty: z.number().positive(),
  uom_id: z.string().uuid().nullable().optional(),
});

export const smartManufactureFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      warehouseId: z.string().uuid(),
      grainItemId: z.string().uuid(),
      grainQty: z.number().positive(),
      grainUomId: z.string().uuid().nullable().optional(),
      outputs: z.array(outputLine).min(1),
      notes: z.string().max(2000).nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const ref = await smartManufacture(sessionFromContext(context), data);
    return { ok: true as const, ref };
  });

export const convertStockFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      warehouseId: z.string().uuid(),
      sourceItemId: z.string().uuid(),
      sourceQty: z.number().positive(),
      outputs: z.array(z.object({ item_id: z.string().uuid(), qty: z.number().positive() })).min(1),
      lossQty: z.number().min(0).nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const ref = await convertStock(sessionFromContext(context), data);
    return { ok: true as const, ref };
  });
