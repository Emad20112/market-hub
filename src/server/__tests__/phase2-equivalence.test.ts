/**
 * اختبار تكافؤ المرحلة 2 (ADR-006 مستوى 4): القديمة (RPC) مقابل الجديدة (Use Case)
 * على بيانات خط الأساس الفعلية.
 *  - الفوكسات تُنجز بصلاحية postgres (خارج RLS) وتُستعاد دائمًا في finally.
 *  - استدعاءات القديمة داخل معاملات مُرجَعة ROLLBACK.
 *  - بعد إسقاط الدوال القديمة (ترحيل 019) تُتخطى سيناريوهات "القديمة" تلقائيًا؛
 *    التكافؤ الكامل (12/12) ثبت قبل الإسقاط — DECISIONS-LOG.
 * تشغيل: npx tsx src/server/__tests__/phase2-equivalence.test.ts
 */
import assert from "node:assert/strict";
import net from "node:net";
// اختبارات التكافؤ تعمل على قاعدة البذور (خط الأساس 5433) — تُضبط قبل أول getPool.
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction, withSavepoint } from "@/server/shared/db/transaction";
import {
  setProfileActive,
  assertNotLastActiveOwner,
  assertCanChangeProfileStatus,
} from "@/server/domains/identity/application/set-profile-active.usecase";
import { saveBatchSettings } from "@/server/domains/inventory/application/save-batch-settings.usecase";

let failures = 0;
async function run(name: string, fn: (() => Promise<void>) | null) {
  if (!fn) {
    console.log(`⏭ ${name} (الدالة القديمة مُسقطة)`);
    return;
  }
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

const U = (n: number) => `a0000000-0000-4000-a000-00000000000${n}`;
const OWNER1 = U(1);
const OWNER2 = U(2);
const OWNER3 = U(3);
const OWNER4 = U(4);
const ALL = [OWNER1, OWNER2, OWNER3, OWNER4];
const session = (id: string) => ({ userId: id, claims: { sub: id, role: "authenticated" } });

/** هل الدالة القديمة ما تزال في القاعدة؟ (قبل تطبيق ترحيل الإسقاط) */
async function oldFnExists(name: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",
    [name],
  );
  return Number(rows[0].n) > 0;
}

/** القديمة: استدعاء الدالة داخل معاملة بهوية actor وROLLBACK (لا أثر). */
async function oldSetProfileActive(actorId: string, targetId: string, isActive: boolean) {
  await withTransaction({ userId: actorId, rollback: true }, async (tx) => {
    await tx.query("SELECT public.set_profile_active($1::uuid, $2::boolean)", [targetId, isActive]);
  });
}

/** استعادة الحالة الافتراضية (مطابقة البذور). */
async function restoreDefaults(): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE public.profiles SET is_active = true WHERE id = ANY($1)", [ALL]);
  await pool.query(
    `INSERT INTO public.user_roles (user_id, role)
     VALUES ($1::uuid, 'owner'::public.app_role) ON CONFLICT DO NOTHING`,
    [OWNER4],
  );
  await pool.query("DELETE FROM public.platform_admins WHERE user_id = $1::uuid", [OWNER4]);
  await pool.query(
    `INSERT INTO public.platform_admins (user_id, role)
     SELECT p.id, 'superadmin' FROM public.profiles p
     WHERE p.id = ANY($1)
     ON CONFLICT DO NOTHING`,
    [[OWNER1, OWNER2, OWNER3]],
  );
}

/** فوكست مؤقت بصلاحية superuser مع استعادة حتمية. */
async function withFixtures(
  fix: () => Promise<unknown>,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fix();
    await fn();
  } finally {
    await restoreDefaults();
  }
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await oldFnExists("set_profile_active");
  const oldBatchAvailable = await oldFnExists("save_batch_settings");

  await run("تجهيز: فحص البيانات الفعلية (مالك ×4)", async () => {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        WHERE ur.role = 'owner'::public.app_role AND p.id = ANY($1)`,
      [ALL],
    );
    assert.equal(Number(rows[0].n), 4, "البذور المتوقعة: أربعة ملاك نشطين");
    await restoreDefaults();
  });

  // ── 1) تعطيل مالك (خارج سجل منصة المدراء) بوجود مالك نشط آخر: نجاح متطابق
  await run(
    "[قديم] تعطيل مالك (خارج سجل المنصة) بوجود مالك آخر: نجاح",
    oldAvailable
      ? async () => {
          await withFixtures(
            () =>
              pool.query("DELETE FROM public.platform_admins WHERE user_id = $1::uuid", [OWNER2]),
            async () => {
              await oldSetProfileActive(OWNER1, OWNER2, false);
              const { rows } = await pool.query(
                "SELECT is_active FROM public.profiles WHERE id=$1::uuid",
                [OWNER2],
              );
              assert.equal(rows[0].is_active, true, "ROLLBACK أعاد الحالة");
            },
          );
        }
      : null,
  );
  await run("[جديد] نفس السيناريو: نجاح — نفس النتيجة", async () => {
    await withFixtures(
      () => pool.query("DELETE FROM public.platform_admins WHERE user_id = $1::uuid", [OWNER2]),
      async () => {
        await setProfileActive(session(OWNER1), { userId: OWNER2, isActive: false });
        const { rows } = await pool.query(
          "SELECT is_active FROM public.profiles WHERE id=$1::uuid",
          [OWNER2],
        );
        assert.equal(rows[0].is_active, false);
      },
    );
  });

  // ── 2) التعطيل الذاتي مرفوض في الحالتين
  await run(
    "[قديم] رفض التعطيل الذاتي",
    oldAvailable
      ? async () => {
          await assert.rejects(
            () => oldSetProfileActive(OWNER1, OWNER1, false),
            /You cannot deactivate your own account/,
          );
        }
      : null,
  );
  await run("[جديد] رفض التعطيل الذاتي — نفس الرسالة", async () => {
    await assert.rejects(
      () => setProfileActive(session(OWNER1), { userId: OWNER1, isActive: false }),
      /You cannot deactivate your own account/,
    );
  });

  // ── 3) فاعل غير مالك مرفوض في الحالتين
  await run(
    "[قديم] فاعل غير مالك: رفض",
    oldAvailable
      ? async () => {
          await withFixtures(
            () =>
              pool.query(
                "DELETE FROM public.user_roles WHERE user_id=$1::uuid AND role='owner'::public.app_role",
                [OWNER4],
              ),
            async () => {
              await assert.rejects(
                () => oldSetProfileActive(OWNER4, OWNER2, false),
                /Only a store owner or platform superadmin/,
              );
            },
          );
        }
      : null,
  );
  await run("[جديد] فاعل غير مالك: رفض — نفس الرسالة", async () => {
    await withFixtures(
      () =>
        pool.query(
          "DELETE FROM public.user_roles WHERE user_id=$1::uuid AND role='owner'::public.app_role",
          [OWNER4],
        ),
      async () => {
        await assert.rejects(
          () => setProfileActive(session(OWNER4), { userId: OWNER2, isActive: false }),
          /Only a store owner or platform superadmin/,
        );
      },
    );
  });

  // ── 4) آخر مالك نشط: عبر superadmin (الطريق الوحيد غير الذاتي)
  await run(
    "[قديم] آخر مالك نشط: رفض",
    oldAvailable
      ? async () => {
          await withFixtures(
            async () => {
              await pool.query(
                `INSERT INTO public.platform_admins (user_id, role)
                 VALUES ($1::uuid, 'superadmin') ON CONFLICT DO NOTHING`,
                [OWNER4],
              );
              await pool.query("DELETE FROM public.platform_admins WHERE user_id = $1::uuid", [
                OWNER2,
              ]);
              await pool.query("UPDATE public.profiles SET is_active=false WHERE id = ANY($1)", [
                [OWNER1, OWNER3, OWNER4],
              ]);
            },
            async () => {
              await assert.rejects(
                () => oldSetProfileActive(OWNER4, OWNER2, false),
                /The last active store owner cannot be deactivated/,
              );
            },
          );
        }
      : null,
  );
  await run("[جديد] آخر مالك نشط: رفض — نفس الرسالة", async () => {
    await withFixtures(
      async () => {
        await pool.query(
          `INSERT INTO public.platform_admins (user_id, role)
           VALUES ($1::uuid, 'superadmin') ON CONFLICT DO NOTHING`,
          [OWNER4],
        );
        await pool.query("DELETE FROM public.platform_admins WHERE user_id = $1::uuid", [OWNER2]);
        await pool.query("UPDATE public.profiles SET is_active=false WHERE id = ANY($1)", [
          [OWNER1, OWNER3, OWNER4],
        ]);
      },
      async () => {
        await assert.rejects(
          () => setProfileActive(session(OWNER4), { userId: OWNER2, isActive: false }),
          /The last active store owner cannot be deactivated/,
        );
      },
    );
  });

  // ── 5) قواعد نقية: مصفوفة مطابقة
  await run("[تكافؤ] قواعد نقية", async () => {
    assert.throws(() =>
      assertNotLastActiveOwner(
        { userId: OWNER2, isActive: false },
        { targetHasOwnerRole: true, otherActiveOwnerExists: false },
      ),
    );
    assert.doesNotThrow(() =>
      assertNotLastActiveOwner(
        { userId: OWNER2, isActive: false },
        { targetHasOwnerRole: true, otherActiveOwnerExists: true },
      ),
    );
    assert.throws(() =>
      assertCanChangeProfileStatus(
        session(OWNER4),
        { userId: OWNER2, isActive: false },
        { isOwner: false, isSuperadmin: false, targetIsPlatformAdmin: false },
      ),
    );
  });

  // ── 6) save_batch_settings: تكافؤ الدمج (قبل إسقاط القديمة فقط)
  await run(
    "[تكافؤ] دمج الإعدادات — القديمة مقابل الجديدة",
    oldBatchAvailable
      ? async () => {
          const { rows: beforeRows } = await pool.query<{ batch_settings: unknown }>(
            "SELECT batch_settings FROM public.company_settings LIMIT 1",
          );
          const before = beforeRows[0]?.batch_settings ?? {};
          const input = { dispatch_strategy: "FIFO", prevent_selling_expired: false };
          try {
            const newResult = await saveBatchSettings(session(OWNER1), input);
            const oldResult = await withTransaction(
              { userId: OWNER1, rollback: true },
              async (tx) => {
                const { rows } = await tx.query<{ batch_settings: unknown }>(
                  "SELECT public.save_batch_settings($1::jsonb) AS batch_settings",
                  [JSON.stringify(input)],
                );
                return rows[0].batch_settings;
              },
            );
            assert.deepEqual(newResult, oldResult, "الدمج متطابق بين القديمة والجديدة");
          } finally {
            await pool.query("UPDATE public.company_settings SET batch_settings = $1::jsonb", [
              JSON.stringify(before),
            ]);
          }
        }
      : null,
  );

  await run("تنظيف نهائي: استعادة الحالة الافتراضية", async () => {
    await restoreDefaults();
  });

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 2 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
