/** Transport — المرحلة 13.2: ترحيل/عكس مستند الأرصدة الافتتاحية
 *  (استبدال post_opening_balance / reverse_opening_balance). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  postOpeningBalance,
  reverseOpeningBalance,
} from "@/server/domains/stock/application/stock.usecases";

export const postOpeningBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ documentId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { documentId } = await postOpeningBalance(sessionFromContext(context), data.documentId);
    return { ok: true as const, documentId };
  });

export const reverseOpeningBalanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ documentId: z.string().uuid(), reason: z.string().min(1) }).parse)
  .handler(async ({ data, context }) => {
    const { reversalDocumentId } = await reverseOpeningBalance(sessionFromContext(context), {
      documentId: data.documentId,
      reason: data.reason,
    });
    return { ok: true as const, reversalDocumentId };
  });
