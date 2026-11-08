/** Transport — المرحلة 4: مستند أرصدة أول المدة (استبدال create/update_opening_balance). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  createOpeningBalance,
  updateOpeningBalance,
} from "@/server/domains/stock/application/stock.usecases";

const lineSchema = z.record(z.string(), z.unknown());

const inputSchema = z.object({
  op: z.enum(["create", "update"]),
  documentId: z.string().uuid().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(lineSchema).min(1),
  notes: z.string().nullable().optional(),
});

export const openingBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    if (data.op === "update") {
      if (!data.documentId) throw new Error("documentId مطلوب للتحديث");
      const { documentId } = await updateOpeningBalance(sessionFromContext(context), {
        documentId: data.documentId,
        effectiveDate: data.effectiveDate,
        lines: data.lines,
        notes: data.notes ?? null,
      });
      return { ok: true as const, documentId };
    }
    const { documentId } = await createOpeningBalance(sessionFromContext(context), {
      effectiveDate: data.effectiveDate,
      lines: data.lines,
      notes: data.notes ?? null,
    });
    return { ok: true as const, documentId };
  });
