/**
 * اختبار تكافؤ المرحلة 8 (ADR-006): المشتريات الجديدة (TS) مقابل دوال القاعدة.
 * - create_purchase (نقدي كامل / آجل جزئي يرفع رصيد المورد)
 * - create_purchase_return (مرتجع كامل لفاتورة مشتريات)
 * كل سيناريو في معاملتين مُرجَعتين، مقارنة: الفاتورة وسطورها وحركات المخزون،
 * رصيد المورد، وقيد الترحيل. سيناريوهات القديمة تُتخطى بعد إسقاط الدوال (ترحيل 023).
 * تشغيل (npm run test:server:phase8) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ?? "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  createPurchaseInner,
  createPurchaseReturnInner,
} from "@/server/domains/purchasing/application/purchasing.usecases";

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

const CLAIMS = (owner: string) => JSON.stringify({ sub: owner, role: "authenticated" });

async function snapshotPurchase(tx: import("pg").PoolClient, invoiceId: string) {
  const { rows: head } = await tx.query(
    `SELECT invoice_number LIKE 'PUR-%' OR invoice_number ~ '\\d' AS ok, supplier_id::text,
            warehouse_id::text, status::text, payment_status::text, subtotal::text,
            discount::text, tax::text, total::text, paid::text, payment_method::text,
            cashbox_id IS NOT NULL AS has_cashbox
       FROM public.purchase_invoices WHERE id=$1::uuid`,
    [invoiceId],
  );
  const { rows: lines } = await tx.query(
    `SELECT product_id::text, quantity::text, unit_cost::text, tax::text, total::text,
            line_type::text, stock_effect::text, base_unit_cost::text, entered_quantity::text,
            base_quantity::text, uom_conversion_factor::text, entered_unit_cost::text
       FROM public.purchase_invoice_items WHERE invoice_id=$1::uuid ORDER BY product_id`,
    [invoiceId],
  );
  const { rows: mvts } = await tx.query(
    `SELECT product_id::text, quantity::text, unit_cost::text, total_cost::text
       FROM public.stock_movements WHERE source_type='purchase_invoice' AND source_id=$1::uuid
       ORDER BY product_id`,
    [invoiceId],
  );
  return { head: head[0], lines, mvts };
}

async function snapshotSupplierBalance(tx: import("pg").PoolClient, supplierId: string) {
  const { rows: bal } = await tx.query<{ balance: string }>(
    "SELECT balance::text FROM public.suppliers WHERE id=$1::uuid",
    [supplierId],
  );
  return bal[0]?.balance ?? "0";
}

async function snapshotPurchaseReturn(tx: import("pg").PoolClient, returnId: string) {
  const { rows: head } = await tx.query(
    `SELECT return_number LIKE 'PRT-%' OR return_number ~ '\\d' AS ok, invoice_id::text,
            supplier_id::text, warehouse_id::text, subtotal::text, tax::text, total::text,
            refund_method::text
       FROM public.purchase_returns WHERE id=$1::uuid`,
    [returnId],
  );
  const { rows: lines } = await tx.query(
    `SELECT product_id::text, quantity::text, unit_cost::text, tax::text, total::text,
            line_type::text, invoice_item_id::text, entered_quantity::text, base_quantity::text,
            uom_conversion_factor::text, entered_unit_cost::text
       FROM public.purchase_return_items WHERE return_id=$1::uuid ORDER BY product_id`,
    [returnId],
  );
  const { rows: mvts } = await tx.query(
    `SELECT product_id::text, quantity::text, unit_cost::text, total_cost::text
       FROM public.stock_movements WHERE source_type='purchase_return' AND source_id=$1::uuid
       ORDER BY product_id`,
    [returnId],
  );
  const normalize = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? "<id>" : v;
  const norm = (arr: Record<string, unknown>[]) =>
    arr.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalize(v)])));
  return {
    head: Object.fromEntries(
      Object.entries(head[0]).map(([k, v]) => [k, k === "invoice_id" ? "<id>" : normalize(v)]),
    ),
    lines: norm(lines).map((l) => ({ ...l, invoice_item_id: "<id>" })),
    mvts: norm(mvts),
  };
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("create_purchase");

  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT user_id::text AS id FROM public.user_roles WHERE role='owner'::public.app_role LIMIT 1",
  );
  const OWNER = ownerRows[0].id;
  const session = { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } };

  /** معاملة اختبار موحدة: service_role + claims (كلا المسارين). */
  async function txWithClaims(fn: (tx: import("pg").PoolClient) => Promise<unknown>) {
    return withTransaction({ rollback: true }, async (tx) => {
      await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS(OWNER)]);
      return fn(tx);
    });
  }

  async function testContext(tx: import("pg").PoolClient) {
    const { rows: supRows } = await tx.query<{ id: string }>(
      "SELECT id::text FROM public.suppliers WHERE is_active AND is_system IS NOT TRUE ORDER BY created_at LIMIT 1",
    );
    assert.ok(supRows[0], "يوجد مورد حقيقي غير نظامي");
    const { rows: whRows } = await tx.query<{ id: string }>(
      "SELECT id::text FROM public.warehouses LIMIT 1",
    );
    const { rows: prodRows } = await tx.query<{ id: string }>(
      `SELECT p.id::text FROM public.products p
        WHERE p.item_nature <> 'SERVICE' AND p.is_active AND p.is_purchasable
          AND EXISTS (SELECT 1 FROM public.product_uoms pu
                      WHERE pu.product_id = p.id AND pu.unit_id = coalesce(p.base_uom_id, p.unit_id)
                        AND pu.can_purchase AND pu.is_active)
        ORDER BY p.created_at LIMIT 1`,
    );
    assert.ok(prodRows[0], "يوجد منتج قابل للشراء");
    const product = prodRows[0].id;
    await tx.query("UPDATE public.products SET cost_price = 6 WHERE id = $1::uuid", [product]);
    // item_class يجب ألا يكون فارغًا: الدالة القديمة (012) تتعارض مع coalesce(r.item_class,'GOOD')
    // عندما يكون فارغًا ('GOOD' قيمة item_nature وليست item_class) — عيب قديم مكتشف بالتكافؤ.
    await tx.query(
      "UPDATE public.products SET item_class = 'FINISHED_GOOD' WHERE id = $1::uuid AND item_class IS NULL",
      [product],
    );
    await tx.query(
      "UPDATE public.product_uoms SET can_purchase = true, is_active = true WHERE product_id = $1::uuid",
      [product],
    );
    return { SUPPLIER: supRows[0].id, WAREHOUSE: whRows[0].id, PRODUCT: product };
  }

  // ── 1) create_purchase: شراء نقدي كامل
  await run(
    "[تكافؤ] create_purchase شراء نقدي — الفاتورة والسطور والمخزون",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              const { SUPPLIER, WAREHOUSE, PRODUCT } = await testContext(tx);
              const items = [
                {
                  product_id: PRODUCT,
                  quantity: 4,
                  unit_cost: 6,
                  tax_rate: 0,
                  batch_number: null,
                  expiry_date: null,
                  uom_id: null,
                },
              ];
              let invoiceId: string;
              if (useNew) {
                invoiceId = await createPurchaseInner(tx, session, {
                  warehouseId: WAREHOUSE,
                  supplierId: SUPPLIER,
                  paymentMethod: "cash",
                  paid: 24,
                  discount: 0,
                  note: "تكافؤ شراء",
                  items: [
                    {
                      productId: PRODUCT,
                      quantity: 4,
                      unitCost: 6,
                      taxRate: 0,
                      batchNumber: null,
                      expiryDate: null,
                      uomId: null,
                    },
                  ],
                });
              } else {
                const { rows } = await tx.query<{ out: string }>(
                  `SELECT public.create_purchase($1::uuid, $2::uuid, 'cash', 24, 0, 'تكافؤ شراء',
                      $3::jsonb, NULL::uuid, NULL::uuid, NULL::text, NULL::text) AS out`,
                  [WAREHOUSE, SUPPLIER, JSON.stringify(items)],
                );
                invoiceId = rows[0].out;
              }
              const snap = await snapshotPurchase(tx, invoiceId);
              const balance = await snapshotSupplierBalance(tx, SUPPLIER);
              return { snap, balance };
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "الشراء النقدي متطابق");
        }
      : null,
  );

  // ── 2) create_purchase: شراء آجل جزئي يرفع رصيد المورد
  await run(
    "[تكافؤ] create_purchase آجل جزئي — رصيد المورد",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              const { SUPPLIER, WAREHOUSE, PRODUCT } = await testContext(tx);
              const items = [
                {
                  product_id: PRODUCT,
                  quantity: 2,
                  unit_cost: 6,
                  tax_rate: 0,
                  batch_number: null,
                  expiry_date: null,
                  uom_id: null,
                },
              ];
              let invoiceId: string;
              if (useNew) {
                invoiceId = await createPurchaseInner(tx, session, {
                  warehouseId: WAREHOUSE,
                  supplierId: SUPPLIER,
                  paymentMethod: "credit",
                  paid: 0,
                  discount: 0,
                  note: "تكافؤ آجل",
                  items: [{ productId: PRODUCT, quantity: 2, unitCost: 6, taxRate: 0 }],
                });
              } else {
                const { rows } = await tx.query<{ out: string }>(
                  `SELECT public.create_purchase($1::uuid, $2::uuid, 'credit', 0, 0, 'تكافؤ آجل',
                    $3::jsonb, NULL::uuid, NULL::uuid, NULL::text, NULL::text) AS out`,
                  [WAREHOUSE, SUPPLIER, JSON.stringify(items)],
                );
                invoiceId = rows[0].out;
              }
              const snap = await snapshotPurchase(tx, invoiceId);
              const balance = await snapshotSupplierBalance(tx, SUPPLIER);
              return { snap, balance };
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "الشراء الآجل متطابق");
        }
      : null,
  );

  // ── 3) create_purchase_return: المسار الجديد كاملًا + إثبات عيب الدالة القديمة
  // ملاحظة تكافؤ موثقة: الدالة القديمة (012) تنهار دائمًا لأي مرتجع مخزون —
  // coalesce(r.item_class,'GOOD') يحوّل 'GOOD' إلى enum item_class وقت الترجمة
  // ('GOOD' قيمة item_nature لا item_class). النسخة الجديدة تُصحّح العيب،
  // والمقارنة بيتًا-بيتًا مستحيلة لأن المعاملة القديمة تُرجَع كاملة عند الانهيار.
  await run(
    "[تكافؤ] create_purchase_return — المسار الجديد (البذرة + القيد المتوازن) + عيب القديمة الموثق",
    oldAvailable
      ? async () => {
          // (أ) المسار الجديد: مرتجع كامل مع تحقق شامل
          const newRes = (await txWithClaims(async (tx) => {
            const { SUPPLIER, WAREHOUSE, PRODUCT } = await testContext(tx);
            const invoiceId = await createPurchaseInner(tx, session, {
              warehouseId: WAREHOUSE,
              supplierId: SUPPLIER,
              paymentMethod: "cash",
              paid: 24,
              discount: 0,
              note: "بذر مرتجع",
              items: [
                {
                  productId: PRODUCT,
                  quantity: 4,
                  unitCost: 6,
                  taxRate: 0,
                  batchNumber: null,
                  expiryDate: null,
                  uomId: null,
                },
              ],
            });
            const { rows: itemRows } = await tx.query<{
              id: string;
              product_id: string;
              uom_id: string | null;
            }>(
              "SELECT id::text, product_id::text, uom_id::text FROM public.purchase_invoice_items WHERE invoice_id=$1::uuid ORDER BY product_id",
              [invoiceId],
            );
            const returnId = await createPurchaseReturnInner(tx, session, {
              invoiceId,
              warehouseId: WAREHOUSE,
              supplierId: SUPPLIER,
              refundMethod: "credit",
              note: "تكافؤ",
              items: itemRows.map((r) => ({
                invoiceItemId: r.id,
                productId: r.product_id,
                quantity: 4,
                uomId: r.uom_id,
              })),
            });
            const snap = await snapshotPurchaseReturn(tx, returnId);
            const balance = await snapshotSupplierBalance(tx, SUPPLIER);
            const { rows: inventory } = await tx.query<{ q: string }>(
              "SELECT quantity::text FROM public.inventory WHERE product_id=$1::uuid AND warehouse_id=$2::uuid AND owner_type='COMPANY' AND owner_id IS NULL",
              [PRODUCT, WAREHOUSE],
            );
            // القيد مُرحَّل ومتوازن
            const { rows: entry } = await tx.query<{ d: string; c: string }>(
              `SELECT (SELECT coalesce(sum(jl.debit),0) FROM public.journal_lines jl WHERE jl.entry_id = je.id)::text AS d,
                      (SELECT coalesce(sum(jl.credit),0) FROM public.journal_lines jl WHERE jl.entry_id = je.id)::text AS c
                 FROM public.journal_entries je
                WHERE je.source_type='purchase_return' AND je.source_id=$1::uuid AND je.status <> 'REVERSED'`,
              [returnId],
            );
            assert.ok(entry[0], "قيد المرتجع مُرحَّل");
            assert.equal(entry[0].d, entry[0].c, "القيد متوازن");
            // المخزون عاد لصفر (4 استلام − 4 صرف مرتجع)
            assert.equal(Number(inventory[0]?.q ?? 0), 0, "المخزون صفر بعد المرتجع");
            // T-12: رصيد المورد يصير دائنًا (-24) لأن الفاتورة نقدية مسددة والمرتجع كامل — سلوك الأصل المتعمد.
            assert.equal(balance, "-24.00", "رصيد المورد دائن -24 بعد مرتجع فاتورة مسددة");
            return snap;
          })) as Awaited<ReturnType<typeof snapshotPurchaseReturn>>;
          assert.ok(newRes.head, "المرتجع مسجل");

          // (ب) إثبات العيب القديم الموثق: نفس السيناريو عبر RPC يفشل بالخطأ المعروف
          const oldErr = (await txWithClaims(async (tx) => {
            const { SUPPLIER, WAREHOUSE, PRODUCT } = await testContext(tx);
            const { rows } = await tx.query<{ out: string }>(
              `SELECT public.create_purchase($1::uuid, $2::uuid, 'cash', 24, 0, 'بذر مرتجع',
                  $3::jsonb, NULL::uuid, NULL::uuid, NULL::text, NULL::text) AS out`,
              [
                WAREHOUSE,
                SUPPLIER,
                JSON.stringify([
                  {
                    product_id: PRODUCT,
                    quantity: 4,
                    unit_cost: 6,
                    tax_rate: 0,
                    batch_number: null,
                    expiry_date: null,
                    uom_id: null,
                  },
                ]),
              ],
            );
            const invoiceId = rows[0].out;
            const { rows: itemRows } = await tx.query<{
              id: string;
              product_id: string;
              uom_id: string | null;
            }>(
              "SELECT id::text, product_id::text, uom_id::text FROM public.purchase_invoice_items WHERE invoice_id=$1::uuid ORDER BY product_id",
              [invoiceId],
            );
            try {
              await tx.query(
                `SELECT public.create_purchase_return($1::uuid, $2::uuid, $3::uuid, 'credit', 'تكافؤ', $4::jsonb)`,
                [
                  invoiceId,
                  WAREHOUSE,
                  SUPPLIER,
                  JSON.stringify(
                    itemRows.map((r) => ({
                      invoice_item_id: r.id,
                      product_id: r.product_id,
                      quantity: 4,
                      uom_id: r.uom_id,
                    })),
                  ),
                ],
              );
              return "لم ينهار!";
            } catch (e) {
              return (e as Error).message;
            }
          })) as string;
          assert.match(
            oldErr,
            /invalid input value for enum item_class: .GOOD./,
            "العيب القديم كما هو موثق",
          );
        }
      : null,
  );

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 8 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();

