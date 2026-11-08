/** Transport — المرحلة 2: تحديث ترقيم المستندات عبر Use Case. */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { setDocumentNumbering } from "@/server/domains/catalog/application/set-document-numbering.usecase";

const inputSchema = z.object({
  documentType: z.string().min(1),
  prefix: z.string().nullable().optional(),
  formatTokens: z.string().nullable().optional(),
  padding: z.number().int().min(0).max(20).nullable().optional(),
  datePart: z.string().nullable().optional(),
  separator: z.string().nullable().optional(),
  resetPolicy: z.string().nullable().optional(),
  nextValue: z.number().int().min(0).nullable().optional(),
});

export const setDocumentNumberingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const row = await setDocumentNumbering(sessionFromContext(context), {
      documentType: data.documentType,
      prefix: data.prefix ?? null,
      formatTokens: data.formatTokens ?? null,
      padding: data.padding ?? null,
      datePart: data.datePart ?? null,
      separator: data.separator ?? null,
      resetPolicy: data.resetPolicy ?? null,
      nextValue: data.nextValue ?? null,
    });
    return { ok: true as const, numbering: row };
  });
