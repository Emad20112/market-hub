/**
 * Transport — المرحلة 2. رقيقة: جلسة + تحقق مدخل + استدعاء Use Case.
 * Frontend → server function → Use Case → Repository → Database.
 */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { setProfileActive } from "@/server/domains/identity/application/set-profile-active.usecase";

const inputSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export const activateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    await setProfileActive(sessionFromContext(context), data);
    return { ok: true };
  });
