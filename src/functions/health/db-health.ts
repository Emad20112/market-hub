/**
 * Server function تجريبية للمرحلة 0 — تثبت سلك المسار الإلزامي:
 * Frontend → Server Function → (Use Case لاحقًا) → Repository → Database.
 * فحص صحة قاعدة البيانات عبر اتصال pg المخصص للـ Backend (لا PostgREST).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pingDb } from "@/server/shared/db/pool";

export const getDbHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const health = await pingDb();
    return {
      ok: health.ok,
      latencyMs: health.latencyMs,
      error: health.ok ? undefined : "قاعدة البيانات غير قابلة للوصول",
    };
  });
