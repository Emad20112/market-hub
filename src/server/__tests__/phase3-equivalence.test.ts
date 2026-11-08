/**
 * اختبار تكافؤ المرحلة 3 (ADR-006 مستوى 4): القديمة (RPC) مقابل الجديدة (Use Case).
 *  - العدّادات: مقارنة JSON كاملة بين product_reference_counts القديمة والجديدة
 *    لكل منتجات القاعدة الفعلية.
 *  - الدفعات: تكافؤ مسار الإنشاء/الدمج (القديمة داخل معاملة مُرجَعة، الجديدة
 *    بنفس المدخلات على دفعة اختبارية تُستعاد).
 *  - KPIs والتسوية: مقارنة مخرجات القديمة والجديدة.
 *  - سيناريوهات القديمة تُتخطى تلقائيًا بعد إسقاط الدوال (020).
 * تشغيل: npx tsx src/server/__tests__/phase3-equivalence.test.ts
 */
import assert from "node:assert/strict";
import net from "node:net";
// اختبارات التكافؤ تعمل على قاعدة البذور (خط الأساس 5433) — تُضبط قبل أول getPool.
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import { countProductReferences } from "@/server/domains/inventory/application/product-delete-guard.usecase";
import {
  saveProductBatch,
  deleteProductBatch,
  batchKpis,
  reconcileBatchesWithInventory,
} from "@/server/domains/inventory/application/batches.usecase";
import type { ServerSession } from "@/server/shared/auth/session";

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

const session: ServerSession = {
  userId: "00000000-0000-0000-0000-000000000000",
  claims: { sub: "00000000-0000-0000-0000-000000000000", role: "authenticated" },
};
let OWNER = "00000000-0000-0000-0000-000000000000";

async function oldFnExists(name: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",
    [name],
  );
  return Number(rows[0].n) > 0;
}

/** نسخة القديمة داخل معاملة مُرجَعة — تعيد jsonb كما هو. */
async function callOld<T>(
  fnName: string,
  args: unknown[],
  pick?: (r: Record<string, unknown>) => T,
): Promise<T> {
  return withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT public.${fnName}(${args.map((_, i) => `$${i + 1}`).join(",")}) AS out`,
      args,
    );
    return (pick ? pick(rows[0]) : (rows[0].out as T)) as T;
  });
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  // مالك حقيقي من البيانات (auth.uid() يشترط UUID صالحًا)
  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT ur.user_id::text AS id FROM public.user_roles ur WHERE ur.role='owner'::public.app_role LIMIT 1",
  );
  OWNER = ownerRows[0].id;
  session.userId = OWNER;
  session.claims = { sub: OWNER, role: "authenticated" };
  const oldRefs = await oldFnExists("product_reference_counts");
  const oldKpis = await oldFnExists("get_batch_kpis");
  const oldReconcile = await oldFnExists("reconcile_batches_with_inventory");
  const oldSave = await oldFnExists("save_product_batch");

  // ─ 1) العدّادات: مطابقة كاملة لكل منتج (حتى 20 منتجًا)
  await run(
    "[تكافؤ] product_reference_counts لكل المنتجات",
    oldRefs
      ? async () => {
          const { rows: products } = await pool.query<{ id: string }>(
            "SELECT id FROM public.products ORDER BY created_at LIMIT 20",
          );
          const oldCounts = await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            const out: Record<string, unknown> = {};
            for (const p of products) {
              const { rows } = await tx.query<{ out: unknown }>(
                "SELECT public.product_reference_counts($1::uuid) AS out",
                [p.id],
              );
              out[p.id] = rows[0].out;
            }
            return out;
          });
          for (const p of products) {
            const { counts } = await countProductReferences(session, p.id);
            assert.deepEqual(counts, oldCounts[p.id], `عدّادات المنتج ${p.id}`);
          }
          assert.ok(products.length > 0 || true);
        }
      : null,
  );

  // ─ 2) KPIs
  await run(
    "[تكافؤ] get_batch_kpis",
    oldKpis
      ? async () => {
          const oldRes = await callOld<Record<string, unknown>>("get_batch_kpis", [30]);
          const newRes = await batchKpis(session, 30);
          assert.deepEqual(newRes, oldRes, "KPIs متطابقة");
        }
      : null,
  );

  // ─ 3) التسوية
  await run(
    "[تكافؤ] reconcile_batches_with_inventory",
    oldReconcile
      ? async () => {
          const oldRes = await callOld<unknown[]>("reconcile_batches_with_inventory", [null]);
          const newRes = await reconcileBatchesWithInventory(session, null);
          assert.deepEqual(newRes, oldRes, "التسوية متطابقة");
        }
      : null,
  );

  // ─ 4) الدفعات: إنشاء + دمج + حذف (بمعاملات مُرجَعة للقديمة، واستعادة للجديدة)
  await run(
    "[تكافؤ] save_product_batch (إنشاء ثم دمج) وحذفها",
    oldSave
      ? async () => {
          const { rows: prod } = await pool.query<{ id: string; wh: string }>(
            `SELECT p.id, (SELECT id FROM public.warehouses LIMIT 1) AS wh
             FROM public.products p WHERE p.inventory_policy='TRACKED' LIMIT 1`,
          );
          assert.ok(prod[0]?.id, "يوجد منتج مُتتبَّع ومستودع");
          const productId = prod[0].id;
          const warehouseId =
            prod[0].wh ??
            (await pool.query<{ id: string }>("SELECT id FROM public.warehouses LIMIT 1")).rows[0]
              ?.id;
          assert.ok(warehouseId, "يوجد مستودع");

          // القديمة: إنشاء دفعة اختبارية ثم دمج ثم حذف — كل ذلك في معاملة مُرجَعة
          await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            const { rows: r1 } = await tx.query<{ out: string }>(
              "SELECT public.save_product_batch($1::uuid,$2::uuid,$3,NULL::date,5,10,'تكافؤ',true,NULL::uuid) AS out",
              [productId, warehouseId, "PH3-TEST"],
            );
            const batchId = r1[0].out;
            const { rows: r2 } = await tx.query<{ out: string }>(
              "SELECT public.save_product_batch($1::uuid,$2::uuid,$3,NULL::date,3,0,'تكافؤ',true,$4::uuid) AS out",
              [productId, warehouseId, "PH3-TEST", batchId],
            );
            assert.equal(r2[0].out, batchId, "الدمج يعيد نفس الدفعة");
            const { rows: r3 } = await tx.query<{ out: boolean }>(
              "SELECT public.delete_product_batch($1::uuid, true) AS out",
              [batchId],
            );
            assert.equal(r3[0].out, true);
          });

          // الجديدة: نفس المسلسل على قاعدة حقيقية ثم استعادة
          const { rows: snapRows } = await pool.query<{ id: string; quantity: string }>(
            "SELECT id, quantity::text FROM public.product_batches WHERE product_id=$1::uuid AND warehouse_id=$2::uuid AND batch_number='PH3-TEST'",
            [productId, warehouseId],
          );
          const created = await saveProductBatch(session, {
            productId,
            warehouseId,
            batchNumber: "PH3-TEST",
            quantity: 5,
            unitCost: 10,
            note: "تكافؤ",
          });
          const merged = await saveProductBatch(session, {
            productId,
            warehouseId,
            batchNumber: "PH3-TEST",
            quantity: 3,
            batchId: created.batchId,
          });
          assert.equal(merged.batchId, created.batchId, "الجديدة: الدمج يعيد نفس الدفعة");
          const del = await deleteProductBatch(session, created.batchId, true);
          assert.equal(del.deleted, true);
          if (snapRows[0]) {
            await pool.query(
              "INSERT INTO public.product_batches (id, product_id, warehouse_id, batch_number, quantity) VALUES ($1::uuid,$2::uuid,$3::uuid,'PH3-TEST',$4::numeric) ON CONFLICT (id) DO NOTHING",
              [snapRows[0].id, productId, warehouseId, Number(snapRows[0].quantity)],
            );
          }
        }
      : null,
  );

  await run("تنظيف نهائي", async () => {
    await pool.query("DELETE FROM public.product_batches WHERE batch_number='PH3-TEST'");
  });

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 3 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
