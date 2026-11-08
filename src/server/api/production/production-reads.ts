/** Transport — المرحلة 11: قراءات الإنتاج (تاريخ، مصادر تكلفة، تفاصيل، فحص). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  productionCostSources,
  productionOrderCostCheck,
  productionOrderCostDetail,
  productionOrderHistory,
} from "@/server/domains/production/application/production.service";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const productionOrderHistoryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await productionOrderHistory(sessionFromContext(context), 250);
    return rows as Array<Record<string, JsonValue>>;
  });

export const productionCostSourcesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await productionCostSources(sessionFromContext(context));
    return rows as Array<Record<string, JsonValue>>;
  });

export const productionOrderCostDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const detail = await productionOrderCostDetail(sessionFromContext(context), data.orderId);
    return detail as { [key: string]: JsonValue };
  });

export const productionOrderCostCheckFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ orderId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const check = await productionOrderCostCheck(sessionFromContext(context), data.orderId);
    return check as { [key: string]: JsonValue };
  });
