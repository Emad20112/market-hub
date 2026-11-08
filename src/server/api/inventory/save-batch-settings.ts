/** Transport — المرحلة 2: حفظ إعدادات الدفعات عبر Use Case. */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { saveBatchSettings } from "@/server/domains/inventory/application/save-batch-settings.usecase";

const inputSchema = z.object({
  settings: z.record(z.string(), z.unknown()),
});

/** DTO قابل للتسلسل عبر حدود server function. */
export interface BatchSettingsDto {
  [key: string]: string | number | boolean | null;
}

export const saveBatchSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const merged = await saveBatchSettings(sessionFromContext(context), data.settings);
    return { ok: true as const, settings: merged };
  });
