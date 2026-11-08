/**
 * أدوات اختبار تكامل بقاعدة محلية (ADR-006).
 * withRolledBackTransaction: ينفذ الاختبار داخل معاملة ثم يرجعها ROLLBACK —
 * القاعدة تبقى نظيفة بعد كل اختبار وبسرعة عالية.
 */
import { getPool } from "../db/pool";

/** لا تستخدم هذا في كود الإنتاج — للاختبارات فقط. */
export async function withRolledBackTransaction<T>(
  fn: (tx: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      return result;
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    client.release();
  }
}
