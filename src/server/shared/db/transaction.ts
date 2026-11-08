/**
 * إدارة المعاملات — Unit of Work (ADR-003).
 *
 * الضمانات:
 *  - كل عملية مركبة تعمل في معاملة واحدة: BEGIN … COMMIT أو ROLLBACK عند أول خطأ.
 *  - التعشيش صريح عبر withSavepoint(tx, fn): فشل جزئي يعود لسماوه دون إسقاط المعاملة كلها.
 *  - هوية المستخدم تُحقن في كل معاملة (SET LOCAL role/request.jwt.claims) فتبقى
 *    سياسات RLS مطبقة على كل استعلام — دفاع ثانٍ فوق Authorization في Backend.
 *  - مهلة بيان صريحة لمنع الانتظار اللانهائي.
 *
 * الاستخدام:
 *   await withTransaction({ userId }, async (tx) => {
 *     await salesRepo.insertInvoice(tx, dto);
 *     await stockRepo.postDelta(tx, lines);
 *     await accountingRepo.postJournal(tx, entry);
 *   });
 *
 * الاستدعاء المتعشّش داخل نفس المعاملة:
 *   await withSavepoint(tx, async (tx2) => { … }); // فشل tx2 يرجع لحد tx2 فقط
 */
import type { PoolClient } from "pg";
import type { DbExecutor } from "./pool";
import { getPool } from "./pool";

export interface TxOptions {
  /** معرّف المستخدم (auth.uid()) لتفعيل RLS داخل المعاملة. إن غاب: service_role. */
  userId?: string;
  /** مهلة بيان بالملي ثانية (افتراضي 15s). */
  statementTimeoutMs?: number;
  /** إعادة تلقائية واحدة عند تعارض التزامن (deadlock/serialization). */
  retryOnDeadlock?: boolean;
  /** للاختبارات: ROLLBACK بدل COMMIT حتى عند النجاح (لا أثر على القاعدة). */
  rollback?: boolean;
}

/** كائن تنفيذ: Pool (خارج معاملة) أو PoolClient (داخل معاملة). */
export type Tx = DbExecutor;

/**
 * تنفيذ `fn` داخل معاملة جديدة. أي خطأ يرجع كل شيء (ROLLBACK) ويعاد رميه.
 * التعشيش يُنجز عبر withSavepoint(tx, fn) — لا سياق خفي.
 */
export async function withTransaction<T>(
  optsOrFn: TxOptions | ((tx: PoolClient) => Promise<T>),
  maybeFn?: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const opts: TxOptions = typeof optsOrFn === "function" ? {} : optsOrFn;
  const fn = typeof optsOrFn === "function" ? optsOrFn : maybeFn!;
  if (!fn) throw new Error("withTransaction: fn مطلوب");

  const pool = getPool();
  const client = await pool.connect();
  try {
    const attempt = async (): Promise<T> => {
      await client.query("BEGIN");
      try {
        await applySessionContext(client, opts);
        const result = await fn(client);
        await client.query(opts.rollback ? "ROLLBACK" : "COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("[server/db] rollback failed:", (rollbackErr as Error).message);
        }
        throw err;
      }
    };
    return await (opts.retryOnDeadlock === false ? attempt() : withDeadlockRetry(attempt));
  } finally {
    client.release();
  }
}

const DEADLOCK_CODES = new Set(["40P01", "40001"]);

async function withDeadlockRetry<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (err) {
    if (DEADLOCK_CODES.has((err as { code?: string }).code ?? "")) {
      return attempt(); // إعادة واحدة بترتيب أقفال موحد
    }
    throw err;
  }
}

/**
 * تنفيذ `fn` داخل المعاملة الجارية تحت SAVEPOINT.
 * فشل `fn` يعود لحد هذه النقطة فقط ويُعاد رمي الخطأ — المعاملة الخارجية تبقى سليمة.
 */
export async function withSavepoint<T>(
  tx: PoolClient,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const sp = `mh_sp_${Math.random().toString(36).slice(2, 10)}`;
  await tx.query(`SAVEPOINT ${sp}`);
  try {
    const result = await fn(tx);
    await tx.query(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (err) {
    try {
      await tx.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    } catch (rollbackErr) {
      console.error("[server/db] savepoint rollback failed:", (rollbackErr as Error).message);
    }
    throw err;
  }
}

/** يضبط الهوية ومهلة البيان داخل المعاملة الحالية فقط (SET LOCAL لا يقبل معاملات). */
async function applySessionContext(client: PoolClient, opts: TxOptions): Promise<void> {
  const timeout = Math.max(0, Math.min(Math.trunc(opts.statementTimeoutMs ?? 15_000), 300_000));
  await client.query(`SET LOCAL statement_timeout = ${timeout}`);
  if (opts.userId) {
    // RLS يعمل كما هو: الدور authenticated + claims المستخدم.
    // sub هو UUID مُتحقق منه من Supabase Auth؛ لا مدخلات حرة هنا.
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      `SET LOCAL request.jwt.claims = '${JSON.stringify({
        sub: opts.userId,
        role: "authenticated",
      }).replace(/'/g, "''")}'`,
    );
  } else {
    await client.query("SET LOCAL ROLE service_role");
  }
}
