/** Transport — المرحلة 13.2: التوريد المخزني المباشر (استبدال post_stock_delta عبر RPC).
 *  نفس عقد الدالة القديمة: حركة موقعة من المحرك (RECEIPT)، is_staff شرط،
 *  مصدر مباشر source_type = direct_stock_in بمفتاح قيمة (لا FK) كما في الأصل. */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { postStockDelta } from "@/server/domains/stock/application/engine";
import { itemNatureAndPolicy } from "@/server/domains/stock/infrastructure/stock.repository";
import { BusinessRuleError } from "@/server/shared/errors/domain-error";
import { withTransaction } from "@/server/shared/db/transaction";

const inputSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().min(0).nullable().optional(),
  note: z.string().nullable().optional(),
});

export const directStockInFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const session = sessionFromContext(context);
    await withTransaction(async (tx) => {
      const { nature } = await itemNatureAndPolicy(tx, data.productId);
      if (nature === null) throw new BusinessRuleError(`Item ${data.productId} does not exist`);
      if (nature === "SERVICE") {
        throw new BusinessRuleError(
          `Item ${data.productId} is a SERVICE and has no inventory balance`,
        );
      }
      await postStockDelta(tx, {
        productId: data.productId,
        warehouseId: data.warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: data.quantity,
        unitCost: data.unitCost ?? null,
        movementKind: "RECEIPT",
        sourceType: "direct_stock_in",
        // مفتاح قيمة كما في الأصل — عمود source_id مجاني في مسار هذا المصدر.
        sourceId: crypto.randomUUID(),
        note: data.note ?? null,
        actorId: session.userId,
        movementTypeLegacy: "purchase",
      });
    });
    return { ok: true as const };
  });
