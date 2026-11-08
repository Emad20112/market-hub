/**
 * اختبار تكافؤ المرحلة 4 (ADR-006): محرك المخزون الجديد (TS) مقابل دالة القاعدة.
 * كل سيناريو في معاملتين مُرجَعتين على نفس المنتج/المستودع ثم مقارنة:
 * inventory، item_cost_layers، stock_movements (آخر حركة)، item_cost_transactions.
 * سيناريوهات القديمة تُتخطى بعد إسقاط دوال القاعدة (المرحلة 13).
 * تشغيل (npm run test:server:phase4) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import { postStockDelta as newPostStockDelta } from "@/server/domains/stock/application/engine";

let failures = 0;
async function run(name: string, fn: (() => Promise<void>) | null) {
  if (!fn) {
    console.log(`⏭ ${name} (دالة القاعدة مُسقطة)`);
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

async function fnExists(name: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=$1",
    [name],
  );
  return Number(rows[0].n) > 0;
}

/** لقطة الحالة ذات الصلة بعد حركة، من اتصال المعاملة نفسها.
 *  movementFilter: تحديد حركة معينة إلزامي لأن id عشوائي (uuid) والترتيب الزمني
 *  داخل المعاملة متساوٍ — اختيار "الأحدث" غير حاسم. */
async function snapshot(
  tx: import("pg").PoolClient,
  productId: string,
  warehouseId: string,
  movementFilter: string,
) {
  const { rows: inv } = await tx.query(
    `SELECT product_id::text, warehouse_id::text, owner_type::text, owner_id::text, quantity::text
       FROM public.inventory WHERE product_id=$1::uuid AND warehouse_id=$2::uuid`,
    [productId, warehouseId],
  );
  const { rows: layers } = await tx.query(
    `SELECT product_id::text, warehouse_id::text, owner_type::text, owner_id::text, quantity::text,
            total_value::text, valuation_method::text, last_unit_cost::text
       FROM public.item_cost_layers WHERE product_id=$1::uuid AND warehouse_id=$2::uuid`,
    [productId, warehouseId],
  );
  const { rows: mvts } = await tx.query(
    `SELECT product_id::text, warehouse_id::text, movement_type::text, quantity::text,
              unit_cost::text, reference, note, movement_kind::text, source_type, source_id::text,
              owner_type::text, owner_id::text, adjustment_reason, total_cost::text
         FROM public.stock_movements WHERE product_id=$1::uuid AND warehouse_id=$2::uuid ${movementFilter}`,
    [productId, warehouseId],
  );
  const { rows: ctxs } = await tx.query(
    `SELECT direction::text, quantity::text, unit_cost::text, value::text, method::text,
              quantity_before::text, value_before::text, quantity_after::text, value_after::text
         FROM public.item_cost_transactions WHERE product_id=$1::uuid AND warehouse_id=$2::uuid
           ${movementFilter.replace(/note/g, "note")}`,
    [productId, warehouseId],
  );
  return { inv, layers, mvts, ctxs };
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("post_stock_delta");

  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT user_id::text AS id FROM public.user_roles WHERE role='owner'::public.app_role LIMIT 1",
  );
  const OWNER = ownerRows[0].id;
  const { rows: prodRows } = await pool.query<{ id: string; wh: string | null }>(
    `SELECT p.id, (SELECT id FROM public.warehouses LIMIT 1) AS wh
       FROM public.products p WHERE p.inventory_policy='TRACKED'
         AND p.item_nature <> 'SERVICE' ORDER BY p.created_at LIMIT 1`,
  );
  assert.ok(prodRows[0]?.id, "يوجد منتج مُتتبَّع");
  assert.ok(prodRows[0].wh, "يوجد مستودع");
  const PRODUCT = prodRows[0].id;
  const WAREHOUSE = prodRows[0].wh!;

  // ── 1) استلام: مقارنة كاملة للحالة
  await run(
    "[تكافؤ] استلام 5×10: inventory/cost layer/movement/cost tx",
    oldAvailable
      ? async () => {
          let oldSnap: Awaited<ReturnType<typeof snapshot>> | null = null;
          await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            await tx.query(
              "SELECT public.post_stock_delta($1::uuid,$2::uuid,5,10,'RECEIPT','equivalence_test',NULL,'اختبار تكافؤ','COMPANY',NULL,'purchase')",
              [PRODUCT, WAREHOUSE],
            );
            oldSnap = await snapshot(tx, PRODUCT, WAREHOUSE, " AND note = 'اختبار تكافؤ'");
          });
          let newSnap: Awaited<ReturnType<typeof snapshot>> | null = null;
          await withTransaction({ rollback: true }, async (tx) => {
            await newPostStockDelta(tx, {
              productId: PRODUCT,
              warehouseId: WAREHOUSE,
              ownerType: "COMPANY",
              ownerId: null,
              signedQty: 5,
              unitCost: 10,
              movementKind: "RECEIPT",
              sourceType: "equivalence_test",
              sourceId: null,
              note: "اختبار تكافؤ",
              actorId: OWNER,
              movementTypeLegacy: "purchase",
            });
            newSnap = await snapshot(tx, PRODUCT, WAREHOUSE, " AND note = 'اختبار تكافؤ'");
          });
          assert.deepEqual(newSnap, oldSnap, "الحالة بعد الاستلام متطابقة");
        }
      : null,
  );

  // ── 2) صرف متوسط متحرك بعد استلام
  await run(
    "[تكافؤ] صرف 2 بعد استلام: متوسط متحرك صحيح",
    oldAvailable
      ? async () => {
          let oldSnap: Awaited<ReturnType<typeof snapshot>> | null = null;
          await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            await tx.query(
              "SELECT public.post_stock_delta($1::uuid,$2::uuid,5,10,'RECEIPT','eq2',NULL,'s1','COMPANY',NULL,'purchase')",
              [PRODUCT, WAREHOUSE],
            );
            await tx.query(
              "SELECT public.post_stock_delta($1::uuid,$2::uuid,-2,NULL,'ISSUE','eq2',NULL,'s2','COMPANY',NULL,'sale')",
              [PRODUCT, WAREHOUSE],
            );
            oldSnap = await snapshot(tx, PRODUCT, WAREHOUSE, " AND note = 's2'");
          });
          let newSnap: Awaited<ReturnType<typeof snapshot>> | null = null;
          await withTransaction({ rollback: true }, async (tx) => {
            await newPostStockDelta(tx, {
              productId: PRODUCT,
              warehouseId: WAREHOUSE,
              ownerType: "COMPANY",
              ownerId: null,
              signedQty: 5,
              unitCost: 10,
              movementKind: "RECEIPT",
              sourceType: "eq2",
              sourceId: null,
              note: "s1",
              actorId: OWNER,
              movementTypeLegacy: "purchase",
            });
            await newPostStockDelta(tx, {
              productId: PRODUCT,
              warehouseId: WAREHOUSE,
              ownerType: "COMPANY",
              ownerId: null,
              signedQty: -2,
              unitCost: null,
              movementKind: "ISSUE",
              sourceType: "eq2",
              sourceId: null,
              note: "s2",
              actorId: OWNER,
              movementTypeLegacy: "sale",
            });
            newSnap = await snapshot(tx, PRODUCT, WAREHOUSE, " AND note = 's2'");
          });
          assert.deepEqual(newSnap, oldSnap, "المتوسط المتحرك متطابق");
        }
      : null,
  );

  // ── 3) رفض مخزون غير كافٍ بنفس الرسالة
  await run(
    "[تكافؤ] رفض الصرف بلا رصيد — نفس الرسالة",
    oldAvailable
      ? async () => {
          const oldMsg = await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            try {
              await tx.query(
                "SELECT public.post_stock_delta($1::uuid,$2::uuid,-1,NULL,'ISSUE','eq3',NULL,'x','COMPANY',NULL,'sale')",
                [PRODUCT, WAREHOUSE],
              );
              return "لم يرفض!";
            } catch (e) {
              return (e as Error).message;
            }
          });
          const newMsg = await withTransaction({ rollback: true }, async (tx) => {
            try {
              await newPostStockDelta(tx, {
                productId: PRODUCT,
                warehouseId: WAREHOUSE,
                ownerType: "COMPANY",
                ownerId: null,
                signedQty: -1,
                unitCost: null,
                movementKind: "ISSUE",
                sourceType: "eq3",
                sourceId: null,
                note: "x",
                actorId: OWNER,
                movementTypeLegacy: "sale",
              });
              return "لم يرفض!";
            } catch (e) {
              return (e as Error).message;
            }
          });
          assert.equal(newMsg, oldMsg);
          assert.match(newMsg, /Insufficient stock/);
        }
      : null,
  );

  // ── 4) رفض صنف خدمة/غير متتبع بنفس الرسالة
  await run(
    "[تكافؤ] رفض صنف خدمة/غير مُتتبَّع — نفس الرسالة",
    oldAvailable
      ? async () => {
          const { rows: svc } = await pool.query<{ id: string }>(
            "SELECT id::text FROM public.products WHERE item_nature='SERVICE' OR inventory_policy<>'TRACKED' LIMIT 1",
          );
          if (!svc[0]) {
            console.log("   (لا يوجد منتج خدمة/غير متتبع — تخطٍ)");
            return;
          }
          const oldMsg = await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            try {
              await tx.query(
                "SELECT public.post_stock_delta($1::uuid,$2::uuid,1,0,'RECEIPT','eq4',NULL,'x','COMPANY',NULL,'purchase')",
                [svc[0].id, WAREHOUSE],
              );
              return "لم يرفض!";
            } catch (e) {
              return (e as Error).message;
            }
          });
          const newMsg = await withTransaction({ rollback: true }, async (tx) => {
            try {
              await newPostStockDelta(tx, {
                productId: svc[0].id,
                warehouseId: WAREHOUSE,
                ownerType: "COMPANY",
                ownerId: null,
                signedQty: 1,
                unitCost: 0,
                movementKind: "RECEIPT",
                sourceType: "eq4",
                sourceId: null,
                note: "x",
                actorId: OWNER,
                movementTypeLegacy: "purchase",
              });
              return "لم يرفض!";
            } catch (e) {
              return (e as Error).message;
            }
          });
          assert.equal(newMsg, oldMsg);
          assert.match(newMsg, /does not hold company stock/);
        }
      : null,
  );

  // ── 5) post_opening_stock: القديمة مقابل الجديدة (رأس + بنود + حركات)
  await run(
    "[تكافؤ] post_opening_stock",
    (await fnExists("post_opening_stock"))
      ? async () => {
          const items = [
            { product_id: PRODUCT, quantity: 7, unit_cost: 12, note: "تكافؤ 7" },
            { product_id: PRODUCT, quantity: 3, unit_cost: 8, note: "تكافؤ 3" },
          ];
          let oldRes: Record<string, unknown> | null = null;
          await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            const { rows } = await tx.query<{ out: string }>(
              "SELECT public.post_opening_stock($1::uuid, CURRENT_DATE, 'تكافؤ', $2::jsonb) AS out",
              [WAREHOUSE, JSON.stringify(items)],
            );
            const openingId = rows[0].out;
            const head = await tx.query(
              "SELECT document_number LIKE 'OP-%' AS ok, total_value::text, effective_date::text, note FROM public.stock_openings WHERE id=$1::uuid",
              [openingId],
            );
            const lines = await tx.query(
              "SELECT product_id::text, quantity::text, unit_cost::text, total_cost::text, note FROM public.stock_opening_items WHERE opening_id=$1::uuid ORDER BY product_id",
              [openingId],
            );
            const mvts = await tx.query(
              "SELECT count(*)::int AS n, sum(quantity)::text AS qty, sum(total_cost)::text AS cost FROM public.stock_movements WHERE source_type='stock_opening' AND source_id=$1::uuid",
              [openingId],
            );
            oldRes = { head: head.rows[0], lines: lines.rows, mvts: mvts.rows[0] };
          });
          let newRes: Record<string, unknown> | null = null;
          await withTransaction({ rollback: true }, async (tx) => {
            const { postOpeningStockInner } =
              await import("@/server/domains/stock/application/stock.usecases");
            const openingId = await postOpeningStockInner(tx, OWNER, {
              warehouseId: WAREHOUSE,
              effectiveDate: null,
              note: "تكافؤ",
              items: items.map((i) => ({
                productId: i.product_id,
                quantity: i.quantity,
                unitCost: i.unit_cost,
                note: i.note,
              })),
            });
            const head = await tx.query(
              "SELECT document_number LIKE 'OP-%' AS ok, total_value::text, effective_date::text, note FROM public.stock_openings WHERE id=$1::uuid",
              [openingId],
            );
            const lines = await tx.query(
              "SELECT product_id::text, quantity::text, unit_cost::text, total_cost::text, note FROM public.stock_opening_items WHERE opening_id=$1::uuid ORDER BY product_id",
              [openingId],
            );
            const mvts = await tx.query(
              "SELECT count(*)::int AS n, sum(quantity)::text AS qty, sum(total_cost)::text AS cost FROM public.stock_movements WHERE source_type='stock_opening' AND source_id=$1::uuid",
              [openingId],
            );
            newRes = { head: head.rows[0], lines: lines.rows, mvts: mvts.rows[0] };
          });
          assert.deepEqual(newRes, oldRes, "post_opening_stock متطابق");
        }
      : null,
  );

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 4 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
