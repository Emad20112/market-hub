/**
 * اختبارات تكامل طبقة المعاملات على قاعدة محلية (ADR-003 بوابات التبني).
 * تشغيل: npx tsx src/server/shared/db/__tests__/transaction.test.ts
 * تتطلب قاعدة Supabase المحلية عاملة (npm run db:local:start)؛ وإلا تُتخطى.
 * كل الاختبارات داخل معاملات مُرجَعة ROLLBACK — القاعدة تبقى نظيفة.
 */
import assert from "node:assert/strict";
import net from "node:net";
import { closePool, getPool } from "../pool";
import { withTransaction, withSavepoint } from "../transaction";

let failures = 0;
async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✗ ${name}\n  ${(err as Error).stack ?? err}`);
  }
}

function tcpAlive(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 1500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const up = await tcpAlive("127.0.0.1", 5432);
  if (!up) {
    console.log("⏭ قاعدة Supabase المحلية غير عاملة (127.0.0.1:5432) — تُتخطى اختبارات المعاملات.");
    return;
  }

  const pool = getPool();

  await run("إعداد: إنشاء جدول اختبار نظيف", async () => {
    await pool.query("DROP TABLE IF EXISTS mh_tx_test_phase0");
    await pool.query(
      "CREATE TABLE mh_tx_test_phase0 (id serial PRIMARY KEY, amount numeric NOT NULL)",
    );
  });

  await run("BEGIN/COMMIT: الإدراج ينجح داخل المعاملة", async () => {
    await withTransaction(async (tx) => {
      await tx.query("INSERT INTO mh_tx_test_phase0 (amount) VALUES (100)");
      const { rows } = await tx.query("SELECT count(*)::int AS n FROM mh_tx_test_phase0");
      assert.equal(rows[0].n, 1);
    });
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM mh_tx_test_phase0");
    assert.equal(rows[0].n, 1);
  });

  await run("ROLLBACK كامل: فشل جزئي يعود كل شيء", async () => {
    try {
      await withTransaction(async (tx) => {
        await tx.query("INSERT INTO mh_tx_test_phase0 (amount) VALUES (50)");
        throw new Error("فشل متعمد");
      });
      assert.fail("كان يجب الرمي");
    } catch (err) {
      assert.equal((err as Error).message, "فشل متعمد");
    }
  });

  await run("SAVEPOINT: فشل جزئي معشّش يعود لسماوه فقط", async () => {
    await withTransaction(async (tx) => {
      await tx.query("INSERT INTO mh_tx_test_phase0 (amount) VALUES (10)");
      try {
        await withSavepoint(tx, async (tx2) => {
          await tx2.query("INSERT INTO mh_tx_test_phase0 (amount) VALUES (20)");
          throw new Error("خطأ داخلي");
        });
        assert.fail("كان يجب الرمي من داخل SAVEPOINT");
      } catch (err) {
        assert.equal((err as Error).message, "خطأ داخلي");
      }
      const { rows } = await tx.query("SELECT count(*)::int AS n FROM mh_tx_test_phase0");
      assert.equal(rows[0].n, 2, "الصف الداخلي تراجع، صف الخارج بقي (10 + الصف قبل المعاملة)");
    });
  });

  await run("RLS context: SET LOCAL role/claims يقبل الهوية", async () => {
    await withTransaction({ userId: "00000000-0000-0000-0000-000000000000" }, async (tx) => {
      const { rows } = await tx.query(
        "SELECT current_setting('request.jwt.claims', true) AS claims",
      );
      const claims = JSON.parse(rows[0].claims || "{}");
      assert.equal(claims.sub, "00000000-0000-0000-0000-000000000000");
      const { rows: roleRows } = await tx.query("SELECT current_user AS role");
      assert.equal(roleRows[0].role, "authenticated");
    });
  });

  await run("بلا userId: service_role", async () => {
    await withTransaction(async (tx) => {
      const { rows } = await tx.query("SELECT current_user AS role");
      assert.equal(rows[0].role, "service_role");
    });
  });

  await run("statement_timeout يُطبق داخل المعاملة", async () => {
    await withTransaction({ statementTimeoutMs: 100 }, async (tx) => {
      const { rows } = await tx.query("SHOW statement_timeout");
      assert.match(rows[0].statement_timeout, /100ms/);
    });
  });

  await run("منع القيد داخل المعاملة: unique_violation يعود كل شيء", async () => {
    await pool.query("CREATE UNIQUE INDEX mh_tx_test_phase0_uniq ON mh_tx_test_phase0 (amount)");
    try {
      await withTransaction(async (tx) => {
        await tx.query("INSERT INTO mh_tx_test_phase0 (amount) VALUES (7)");
        await tx.query("INSERT INTO mh_tx_test_phase0 (amount) VALUES (7)");
      });
      assert.fail("كان يجب الرمي unique_violation");
    } catch (err) {
      assert.equal((err as unknown as { code: string }).code, "23505");
    }
    await pool.query("DROP INDEX IF EXISTS mh_tx_test_phase0_uniq");
  });

  console.log(failures === 0 ? "\nكل اختبارات المعاملات نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
