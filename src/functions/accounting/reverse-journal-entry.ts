/** Transport — المرحلة 9: عكس قيد يومية (استبدال reverse_journal_entry). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { reverseJournalEntry } from "@/server/domains/accounting/application/accounting.usecases";

const inputSchema = z.object({
  entryId: z.string().uuid(),
  reason: z.string().min(1),
});

export const reverseJournalEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const { reversalId } = await reverseJournalEntry(sessionFromContext(context), data);
    return { ok: true as const, reversalId };
  });
