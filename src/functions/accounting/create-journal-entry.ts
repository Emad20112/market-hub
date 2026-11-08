/** Transport — المرحلة 9: قيد يومية يدوي (استبدال create_journal_entry للمسار اليدوي). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { createJournalEntry } from "@/server/domains/accounting/application/accounting.usecases";

const inputSchema = z.object({
  memo: z.string().min(1),
  entryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sourceType: z.string().nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(),
  lines: z
    .array(
      z.object({
        account_code: z.string().min(1),
        debit: z.number().min(0).optional(),
        credit: z.number().min(0).optional(),
        partner_type: z.string().nullable().optional(),
        partner_id: z.string().uuid().nullable().optional(),
        memo: z.string().nullable().optional(),
      }),
    )
    .min(2),
});

export const createJournalEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { entryId } = await createJournalEntry(sessionFromContext(context), data);
    return { ok: true as const, entryId };
  });
