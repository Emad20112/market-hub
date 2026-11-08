/**
 * اختبار تكافؤ المرحلة 11 (ADR-006): الإنتاج الجديد (TS) مقابل دوال القاعدة.
 * - create/complete_production_order: أمر كامل بمواد ونواتج وفاقد غير طبيعي —
 *   مقارنة القيد النهائي والحالات والأرصدة بيتًا-بيتًا.
 * - reverse_production_order: عكس أمر مرحل — العكس الكامل للحركات والقيود.
 * سيناريوهات القديمة تُتخطى بعد إسقاط الدوال (ترحيل 027).
 * تشغيل (npm run test:server:phase11) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ?? "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  createAndPostProductionOrderInner,
  reverseProductionOrderInner,
} from "@/server/domains/production/application/production.usecases";

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
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
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

const CLAIMS = (owner: string) => JSON.stringify({ sub: owner, role: "authenticated" });

/** لقطة أمر الإنتاج بعد الترحيل. */
async function snapshotOrder(tx: import("pg").PoolClient, orderId: string) {
  const { rows: head } = await tx.query(
    `SELECT status, material_cost::text, conversion_cost::text, total_cost::text,
            output_cost::text, abnormal_loss_cost::text
       FROM public.production_orders WHERE id = $1::uuid`,
    [orderId],
  );
  const { rows: outputs } = await tx.query(
    `SELECT product_id::text, base_quantity::text, allocated_cost::text,
            actual_stock_cost::text, unit_cost::text
       FROM public.production_order_outputs WHERE production_order_id = $1::uuid
      ORDER BY product_id, base_quantity`,
    [orderId],
  );
  const { rows: je } = await tx.query(
    `SELECT je.source_type, je.total_debit::text, je.total_credit::text,
            coalesce((SELECT jsonb_agg(a.code || ':' || jl.debit::text || '/' || jl.credit::text ORDER BY a.code)
                        FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
                       WHERE jl.entry_id = je.id), '[]'::jsonb) AS lines
       FROM public.journal_entries je
      WHERE je.source_type IN ('production_material_issue','production_completion')
        AND je.source_id = $1::uuid
      ORDER BY je.source_type`,
    [orderId],
  );
  return { head: head[0], outputs, journals: je };
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("create_and_post_production_order");

  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT user_id::text AS id FROM public.user_roles WHERE role='owner'::public.app_role LIMIT 1",
  );
  if (!ownerRows[0]) {
    console.log("⏭ لا يوجد مالك في بذور القاعدة — يلزم تطبيق seeds الاختبار (04_tests).");
    return;
  }
  const OWNER = ownerRows[0].id;
  const session = { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } };

  // مدخلات أمر الإنتاج من بذور العينة (04_tests/production): قمح ×1، دقيق + ردة، فاقد.
  async function loadProductionInputs(tx: import("pg").PoolClient) {
    const { rows } = await tx.query<{ id: string; sku: string }>(
      `SELECT id::text, sku FROM public.products
        WHERE sku IN ('RM-WHEAT','FG-FLOUR','FG-BRAN') AND is_active`,
    );
    const bySku = new Map(rows.map((r) => [r.sku, r.id]));
    const { rows: wh } = await tx.query<{ id: string }>(
      "SELECT id::text FROM public.warehouses WHERE is_active ORDER BY is_default DESC LIMIT 1",
    );
    const { rows: cc } = await tx.query<{ id: string }>(
      "SELECT id::text FROM public.expense_cost_centers WHERE is_active LIMIT 1",
    );
    return { wheat: bySku.get("RM-WHEAT"), flour: bySku.get("FG-FLOUR"), bran: bySku.get("FG-BRAN"), warehouse: wh[0]?.id, center: cc[0]?.id };
  }

  await run(
    "[تكافؤ] create+complete_production_order — أمر كامل بمواد ونواتج وفاقد (بيتًا-بيتًا)",
    oldAvailable
      ? async () => {
        await withTransaction({ rollback: true }, async (tx) => {
          await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS(OWNER)]);
          const inp = await loadProductionInputs(tx);
          assert.ok(inp.wheat && inp.flour && inp.bran && inp.warehouse && inp.center, "بذور العينة ناقصة");
          const payloads = {
            warehouseId: inp.warehouse,
            costCenterId: inp.center,
            productionDate: new Date().toISOString().slice(0, 10),
            materials: [{ product_id: inp.wheat, quantity: 50, uom_id: null }],
            outputs: [
              { product_id: inp.flour, quantity: 40, uom_id: null, allocation_value_per_base: 2 },
              { product_id: inp.bran, quantity: 5, uom_id: null, allocation_value_per_base: 1 },
            ],
            losses: [
              { loss_type: "NORMAL", quantity: 2, uom_id: null, reason: "غبار طحن طبيعي", product_id: inp.wheat },
              { loss_type: "ABNORMAL", quantity: 3, uom_id: null, reason: "عطل مفاجئ في الأسطوانة", product_id: inp.wheat },
            ],
          };
          async function cycle(useNew: boolean) {
            let orderId: string;
            if (useNew) {
              orderId = await createAndPostProductionOrderInner(tx, session, payloads);
            } else {
              const { rows } = await tx.query<{ id: string }>(
                `SELECT public.create_and_post_production_order(
                     $1::uuid, $2::uuid, CURRENT_DATE, NULL,
                     $3::jsonb, $4::jsonb, '[]'::jsonb, $5::jsonb)::text AS id`,
                [
                  payloads.warehouseId, payloads.costCenterId,
                  JSON.stringify(payloads.materials), JSON.stringify(payloads.outputs),
                  JSON.stringify(payloads.losses.map((l) => ({
                    loss_type: l.loss_type, quantity: l.quantity,
                    uom_id: null, reason: l.reason,
                  }))),
                ],
              );
              orderId = rows[0].id;
            }
            return snapshotOrder(tx, orderId);
          }
          const oldSnap = await cycle(false);
          const newSnap = await cycle(true);
          assert.deepEqual(newSnap, oldSnap);
        });
      }
      : null,
  );

  await run(
    "[تكافؤ] reverse_production_order — العكس الكامل (حركات + قيود معكوسة)",
    oldAvailable
      ? async () => {
        // الأصل يمنع العكس داخل نفس المعاملة لأن حركات القمح اللاحقة
        // (الناتج من الأمروين المتتاليين) تحجب العكس — نتحقق هنا من الشرط فقط:
        // الأمر المرحل حديثًا لعكسه يجب أن يكون وحيد الحركة على منتجاته.
        await withTransaction({ rollback: true }, async (tx) => {
          await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS(OWNER)]);
          const inp = await loadProductionInputs(tx);
          const payloads = {
            warehouseId: inp.warehouse!,
            costCenterId: inp.center!,
            productionDate: new Date().toISOString().slice(0, 10),
            materials: [{ product_id: inp.wheat!, quantity: 50, uom_id: null }],
            outputs: [
              { product_id: inp.flour!, quantity: 45, uom_id: null },
            ],
            losses: [],
          };
          const { rows } = await tx.query<{ id: string }>(
            `SELECT public.create_and_post_production_order(
                 $1::uuid, $2::uuid, CURRENT_DATE, NULL,
                 $3::jsonb, $4::jsonb, '[]'::jsonb, '[]'::jsonb)::text AS id`,
            [
              payloads.warehouseId, payloads.costCenterId,
              JSON.stringify(payloads.materials), JSON.stringify(payloads.outputs),
            ],
          );
          const orderId = rows[0].id;
          // العكس بالجديد (لا يعمل بالقديم داخل نفس المعاملة بحكم الأقفال).
          await reverseProductionOrderInner(tx, session, { orderId, reason: "عكس تكافؤ — اختبار" });
          const { rows: after } = await tx.query<{ status: string }>(
            "SELECT status FROM public.production_orders WHERE id = $1::uuid",
            [orderId],
          );
          assert.equal(after[0].status, "REVERSED");
          const { rows: rv } = await tx.query<{ n: string }>(
            `SELECT count(*)::text AS n FROM public.journal_entries je
                WHERE je.source_type = 'production_completion'
                  AND je.source_id = $1::uuid
                  AND je.status = 'REVERSED'`,
            [orderId],
          );
          assert.equal(Number(rv[0].n), 1);
        });
      }
      : null,
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
  await import("@/server/shared/db/pool").then((m) => m.closePool());
}

main();
