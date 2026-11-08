/**
 * Transport — المرحلة 12: النسخ الاحتياطي الخادمي (استبدال backup_* RPCs).
 * ملاحظة حجم: التصدير قد يعيد payload ضخمًا — يمرر عبر server function كما هو.
 */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  backupExport,
  backupFingerprint,
  backupRestore,
} from "@/server/domains/reports/application/reports.usecases";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const backupExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ maxLogRows: z.number().int().positive().optional() }).parse)
  .handler(async ({ data, context }) => {
    const result = await backupExport(sessionFromContext(context), data.maxLogRows ?? 5000);
    return result as { [key: string]: JsonValue };
  });

export const backupRestoreFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      payload: z.object({
        kind: z.string(),
        schema_fingerprint: z.string().nullable().optional(),
        tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
      }),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const result = await backupRestore(sessionFromContext(context), data.payload);
    return result as { [key: string]: JsonValue };
  });

export const backupFingerprintFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const fp = await backupFingerprint(sessionFromContext(context));
    return { fingerprint: fp };
  });
