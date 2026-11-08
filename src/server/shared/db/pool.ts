/**
 * الاتصال بقاعدة PostgreSQL — المرحلة 0 (ADR-004).
 *
 * المصدر الوحيد لاتصال pg في الخادم. الواجهة لا تلمس هذه الطبقة أبدًا.
 * لا تطبع أبداً بيانات الاتصال في السجلات أو الأخطاء.
 *
 * ترتيب حل بيانات الاتصال:
 *  1. SERVER_DATABASE_URL          (مخصص للـ Backend؛ الأعلى أولوية)
 *  2. SUPABASE_DB_URL              (يضبطه المشروع في .env)
 *  3. SUPABASE_DB_HOST/PORT/NAME/USER/PASSWORD (بناء صريح)
 *  4. قيمة محلية افتراضية لـ Supabase CLI Docker (127.0.0.1:5432).
 */
import { Pool, type PoolClient } from "pg";

export type DbExecutor = Pool | PoolClient;

let _pool: Pool | undefined;

function resolveConnectionString(): string {
  const explicit = process.env.SERVER_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const supabase = process.env.SUPABASE_DB_URL?.trim();
  if (supabase) return supabase;
  const host = process.env.SUPABASE_DB_HOST?.trim();
  if (host) {
    const port = process.env.SUPABASE_DB_PORT?.trim() || "5432";
    const name = process.env.SUPABASE_DB_NAME?.trim() || "postgres";
    const user = process.env.SUPABASE_DB_USER?.trim() || "postgres";
    const pass = process.env.SUPABASE_DB_PASSWORD ?? "";
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;
  }
  // قيمة محلية افتراضية لبيئة Supabase CLI Docker لهذا المشروع فقط.
  return "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
}

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: resolveConnectionString(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // لا نطبع أخطاء الاتصال مع connection string
      log: undefined,
    });
    _pool.on("error", (err) => {
      console.error("[server/db] pool error:", err.message);
    });
  }
  return _pool;
}

/** فحص صحة الاتصال — يعيد زمن الاستجابة بالملي ثانية. */
export async function pingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

/** للاختبارات فقط: إغلاق الـ Pool. */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}
