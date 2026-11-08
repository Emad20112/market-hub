/**
 * اختبار تكافؤ المرحلة 5 (ADR-006): المبيعات الجديدة (TS) مقابل دوال القاعدة.
 * - create_sale: فاتورة كاملة على منتج حقيقي — مقارنة رأس الفاتورة وسطورها
 *   وحركات المخزون والدفتر، بيتًا-بيتًا.
 * - create_sales_return: مرتجع كامل للفاتورة — مقارنة المرتجع وسطوره وحركات
 *   المخزون ودفتر العميل.
 * - adjust_loyalty: نفس سلوك earn/redeem.
 * كل سيناريو في معاملتين مُرجَعتين. سيناريوهات القديمة تُتخطى بعد إسقاط دوال
 * القاعدة (ترحيل 021). تشغيل (npm run test:server:phase5) — يتطلب
 * SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ??
  "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  createSaleInner,
  createSalesReturnInner,
  adjustLoyalty,
} from "@/server/domains/sales/application/sales.usecases";
import { postStockDelta } from "@/server/domains/stock/application/engine";

/** بذر مخزون داخل المعاملة قبل البيع. الطريقة تختلف حسب المسار حتى لا تُحجب بـ RLS:
 *  - old: استدعاء دالة القاعدة (SECURITY DEFINER) داخل معاملة authenticated.
 *  - new: المحرك الجديد (TS) داخل معاملة service_role — كما في اختبار المرحلة 4.
 *  كلاهما متكافئ (phase4)، واللقطات تقارن فقط أسطر البيع/المرتجع نفسها. */
async function seedStock(
  tx: import("pg").PoolClient,
  owner: string,
  productId: string,
  warehouseId: string,
  qty: number,
  mode: "old" | "new",
): Promise<void> {
  if (mode === "old") {
    await tx.query(
      "SELECT public.post_stock_delta($1::uuid,$2::uuid,$3::numeric,5,'OPENING','phase5_seed',NULL,'بذر اختبار المرحلة 5','COMPANY',NULL,'opening')",
      [productId, warehouseId, qty],
    );
  } else {
    await postStockDelta(tx, {
      productId,
      warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: qty,
      unitCost: 5,
      movementKind: "OPENING",
      sourceType: "phase5_seed",
      sourceId: null,
      note: "بذر اختبار المرحلة 5",
      actorId: owner,
      movementTypeLegacy: "opening",
    });
  }
}

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

/** لقطة الحالة ذات الصلة بعد الفاتورة/المرتجع — بلا id عشوائي. */
async function snapshotInvoice(tx: import("pg").PoolClient, invoiceId: string) {
  const { rows: head } = await tx.query(
    `SELECT invoice_number LIKE 'INV-%' OR invoice_number ~ '\\d' AS ok, customer_id::text,
            warehouse_id::text, status::text, payment_status::text, subtotal::text,
            discount::text, tax::text, total::text, paid::text, payment_method::text
       FROM public.sales_invoices WHERE id=$1::uuid`,
    [invoiceId],
  );
  const { rows: lines } = await tx.query(
    `SELECT product_id::text, description, quantity::text, unit_price::text, tax::text,
            total::text, line_type::text, stock_effect::text, entered_quantity::text,
            base_quantity::text, uom_conversion_factor::text, entered_unit_price::text,
            uom_quantity_increment::text
       FROM public.sales_invoice_items WHERE invoice_id=$1::uuid ORDER BY product_id NULLS FIRST`,
    [invoiceId],
  );
  const { rows: mvts } = await tx.query(
    `SELECT product_id::text, movement_type::text, quantity::text, unit_cost::text,
            split_part(reference, ':', 1) || ':<id>' AS reference, note, total_cost::text
       FROM public.stock_movements WHERE source_type='sales_invoice' AND source_id=$1::uuid
       ORDER BY product_id`,
    [invoiceId],
  );
  return { head: head[0], lines, mvts };
}

async function snapshotReturn(tx: import("pg").PoolClient, returnId: string) {
  const { rows: head } = await tx.query(
    `SELECT return_number LIKE 'SR-%' AS ok, invoice_id::text, customer_id::text,
            warehouse_id::text, subtotal::text, tax::text, total::text, refund_method::text
       FROM public.sales_returns WHERE id=$1::uuid`,
    [returnId],
  );
  const { rows: lines } = await tx.query(
    `SELECT product_id::text, quantity::text, unit_price::text, tax::text, total::text,
            line_type::text, invoice_item_id::text, entered_quantity::text, base_quantity::text,
            uom_conversion_factor::text, entered_unit_price::text
       FROM public.sales_return_items WHERE return_id=$1::uuid ORDER BY product_id`,
    [returnId],
  );
  const { rows: mvts } = await tx.query(
    `SELECT product_id::text, quantity::text, total_cost::text
       FROM public.stock_movements WHERE source_type='sales_return' AND source_id=$1::uuid
       ORDER BY product_id`,
    [returnId],
  );
  const { rows: ledger } = await tx.query(
    `SELECT entry_type::text, credit::text, reference_type::text, note
       FROM public.customer_ledger WHERE reference_id=$1::uuid ORDER BY source_key`,
    [returnId],
  );
  // UUIDs المولّدة داخل كل معاملة مختلفة بطبيعتها — تُطبَّع للمقارنة.
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
    ledger: norm(ledger),
  };
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("create_sale");

  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT user_id::text AS id FROM public.user_roles WHERE role='owner'::public.app_role LIMIT 1",
  );
  const OWNER = ownerRows[0].id;
  const { rows: prodRows } = await pool.query<{ id: string; wh: string | null }>(
    `SELECT p.id, (SELECT id FROM public.warehouses LIMIT 1) AS wh
       FROM public.products p
      WHERE p.inventory_policy='TRACKED'
        AND p.item_nature <> 'SERVICE' AND p.is_active AND p.is_sellable
        AND EXISTS (
          SELECT 1 FROM public.product_uoms pu
           WHERE pu.product_id = p.id
             AND pu.unit_id = coalesce(p.base_uom_id, p.unit_id)
             AND pu.can_sell AND pu.is_active)
      ORDER BY p.created_at LIMIT 1`,
  );
  assert.ok(prodRows[0]?.id, "يوجد منتج مُتتبَّع");
  assert.ok(prodRows[0].wh, "يوجد مستودع");
  const PRODUCT = prodRows[0].id;
  const WAREHOUSE = prodRows[0].wh!;

  // المنتج المختار سعره 0 في البذرة — نرفعه داخل معاملات الاختبار فقط
  // (مُرجَعة) حتى يكون البيع والمرتجع بقيمة > 0 كاملة في المسارين.
  async function raiseProductPrice(tx: import("pg").PoolClient): Promise<void> {
    await tx.query("UPDATE public.products SET sale_price = 10 WHERE id = $1::uuid", [PRODUCT]);
  }

  // ── 1) create_sale: بيع نقدي كامل
  await run(
    "[تكافؤ] create_sale بيع نقدي — رأس/سطور/مخزون متطابقة",
    oldAvailable
      ? async () => {
          const items = [
            {
              product_id: PRODUCT,
              quantity: 2,
              unit_price: 15,
              tax_rate: 0,
              is_service: false,
              name: null,
              batch_id: null,
              batch_number: null,
              uom_id: null,
            },
          ];
          let oldSnap: Awaited<ReturnType<typeof snapshotInvoice>> | null = null;
          await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            await raiseProductPrice(tx);
            await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "old");
            const { rows } = await tx.query<{ out: string }>(
              "SELECT public.create_sale($1::uuid, NULL::uuid, 'cash', 30, 0, 'تكافؤ بيع', $2::jsonb, CURRENT_DATE, '[]'::jsonb) AS out",
              [WAREHOUSE, JSON.stringify(items)],
            );
            oldSnap = await snapshotInvoice(tx, rows[0].out);
          });
          let newSnap: Awaited<ReturnType<typeof snapshotInvoice>> | null = null;
          await withTransaction({ rollback: true }, async (tx) => {
            await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub: OWNER, role: "authenticated" }),
            ]);
            await raiseProductPrice(tx);
            await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "new");
            const invoiceId = await createSaleInner(
              tx,
              { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } },
              {
                warehouseId: WAREHOUSE,
                customerId: null,
                paymentMethod: "cash",
                paid: 30,
                discount: 0,
                note: "تكافؤ بيع",
                saleDate: new Date().toISOString().slice(0, 10),
                paymentSplits: [],
                items: [
                  {
                    productId: PRODUCT,
                    quantity: 2,
                    unitPrice: 15,
                    taxRate: 0,
                    isService: false,
                    name: null,
                    batchId: null,
                    batchNumber: null,
                    uomId: null,
                  },
                ],
              },
            );
            newSnap = await snapshotInvoice(tx, invoiceId);
          });
          assert.deepEqual(newSnap, oldSnap, "البيع النقدي متطابق");
        }
      : null,
  );

  // ── 2) create_sale آجل: الدفتر والرصيد
  await run(
    "[تكافؤ] create_sale آجل — دفتر العميل والرصيد",
    oldAvailable
      ? async () => {
          const { rows: custRows } = await pool.query<{ id: string }>(
            "SELECT id::text FROM public.customers WHERE is_system IS NOT TRUE AND is_active ORDER BY created_at LIMIT 1",
          );
          assert.ok(custRows[0], "يوجد عميل حقيقي");
          const CUSTOMER = custRows[0].id;
          const items = [
            {
              product_id: PRODUCT,
              quantity: 1,
              unit_price: 10,
              tax_rate: 0,
              is_service: false,
              name: null,
              batch_id: null,
              batch_number: null,
              uom_id: null,
            },
          ];
          let oldLedger: unknown, oldBalance: unknown, oldSnap: unknown;
          await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            await raiseProductPrice(tx);
            await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "old");
            const { rows } = await tx.query<{ out: string }>(
              "SELECT public.create_sale($1::uuid, $2::uuid, 'credit', 0, 0, 'تكافؤ آجل', $3::jsonb, CURRENT_DATE, '[]'::jsonb) AS out",
              [WAREHOUSE, CUSTOMER, JSON.stringify(items)],
            );
            const inv = rows[0].out;
            oldSnap = await snapshotInvoice(tx, inv);
            const { rows: led } = await tx.query(
              `SELECT entry_type::text, debit::text, reference_type::text FROM public.customer_ledger
                WHERE reference_id=$1::uuid ORDER BY source_key`,
              [inv],
            );
            oldLedger = led;
            const { rows: bal } = await tx.query<{ balance: string }>(
              "SELECT balance::text FROM public.customers WHERE id=$1::uuid",
              [CUSTOMER],
            );
            oldBalance = bal[0]?.balance;
          });
          let newLedger: unknown, newBalance: unknown, newSnap: unknown;
          await withTransaction({ rollback: true }, async (tx) => {
            await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub: OWNER, role: "authenticated" }),
            ]);
            await raiseProductPrice(tx);
            await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "new");
            const inv = await createSaleInner(
              tx,
              { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } },
              {
                warehouseId: WAREHOUSE,
                customerId: CUSTOMER,
                paymentMethod: "credit",
                paid: 0,
                discount: 0,
                note: "تكافؤ آجل",
                saleDate: new Date().toISOString().slice(0, 10),
                paymentSplits: [],
                items: [
                  {
                    productId: PRODUCT,
                    quantity: 1,
                    unitPrice: 10,
                    taxRate: 0,
                    isService: false,
                    name: null,
                    batchId: null,
                    batchNumber: null,
                    uomId: null,
                  },
                ],
              },
            );
            newSnap = await snapshotInvoice(tx, inv);
            const { rows: led } = await tx.query(
              `SELECT entry_type::text, debit::text, reference_type::text FROM public.customer_ledger
                WHERE reference_id=$1::uuid ORDER BY source_key`,
              [inv],
            );
            newLedger = led;
            const { rows: bal } = await tx.query<{ balance: string }>(
              "SELECT balance::text FROM public.customers WHERE id=$1::uuid",
              [CUSTOMER],
            );
            newBalance = bal[0]?.balance;
          });
          assert.deepEqual(newSnap, oldSnap, "البيع الآجل متطابق");
          assert.deepEqual(newLedger, oldLedger, "دفتر العميل متطابق");
          assert.equal(newBalance, oldBalance, "رصيد العميل متطابق");
        }
      : null,
  );

  // ── 3) create_sale: رفض مخزون غير كافٍ بنفس الرسالة
  await run(
    "[تكافؤ] رفض بيع بلا مخزون — نفس الرسالة",
    oldAvailable
      ? async () => {
          const items = [
            {
              product_id: PRODUCT,
              quantity: 999999,
              unit_price: 1,
              tax_rate: 0,
              is_service: false,
              name: null,
            },
          ];
          const oldMsg = await withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
            await raiseProductPrice(tx);
            await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "old");
            try {
              await tx.query(
                "SELECT public.create_sale($1::uuid, NULL::uuid, 'cash', 0, 0, 'x', $2::jsonb, CURRENT_DATE, '[]'::jsonb)",
                [WAREHOUSE, JSON.stringify(items)],
              );
              return "لم يرفض!";
            } catch (e) {
              return (e as Error).message;
            }
          });
          const newMsg = await withTransaction({ rollback: true }, async (tx) => {
            await raiseProductPrice(tx);
            await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "new");
            try {
              await createSaleInner(
                tx,
                { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } },
                {
                  warehouseId: WAREHOUSE,
                  customerId: null,
                  paymentMethod: "cash",
                  paid: 0,
                  discount: 0,
                  note: "x",
                  items: [
                    {
                      productId: PRODUCT,
                      quantity: 999999,
                      unitPrice: 1,
                      taxRate: 0,
                      isService: false,
                    },
                  ],
                },
              );
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

  // ── 4) create_sales_return: مرتجع كامل لفاتورة آجلة
  await run(
    "[تكافؤ] create_sales_return — المرتجع والدفتر والمخزون",
    oldAvailable
      ? async () => {
          // فاتورة آجلة أصلًا (القديمة) ثم مرتجع كامل؛ ثم نفس الشيء (الجديدة)
          async function cycle(useNew: boolean): Promise<{
            snap: Awaited<ReturnType<typeof snapshotReturn>>;
            invoiceStatus: string;
            ledgerBalance: string;
          }> {
            // كل مسار في معاملته الصحيحة: القديم authenticated (لأن RPC يقرأ auth.uid())،
            // والجديد service_role كما في الإنتاج — مع claims لـ post_sales_invoice.
            if (useNew) {
              return withTransaction({ rollback: true }, async (tx) => {
                await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [
                  JSON.stringify({ sub: OWNER, role: "authenticated" }),
                ]);
                await raiseProductPrice(tx);
                await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "new");
                return await cycleInner(tx, true);
              });
            }
            return withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
              await raiseProductPrice(tx);
              await seedStock(tx, OWNER, PRODUCT, WAREHOUSE, 5, "old");
              return await cycleInner(tx, false);
            });

            async function cycleInner(tx: import("pg").PoolClient, useNew: boolean) {
              const { rows: custRows } = await tx.query<{ id: string }>(
                "SELECT id::text FROM public.customers WHERE is_system IS NOT TRUE AND is_active ORDER BY created_at LIMIT 1",
              );
              const CUSTOMER = custRows[0].id;
              const items = [
                {
                  product_id: PRODUCT,
                  quantity: 2,
                  unit_price: 10,
                  tax_rate: 0,
                  is_service: false,
                  name: null,
                  batch_id: null,
                  batch_number: null,
                  uom_id: null,
                },
              ];
              let invoiceId: string;
              if (useNew) {
                invoiceId = await createSaleInner(
                  tx,
                  { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } },
                  {
                    warehouseId: WAREHOUSE,
                    customerId: CUSTOMER,
                    paymentMethod: "credit",
                    paid: 0,
                    discount: 0,
                    note: "تكافؤ مرتجع",
                    saleDate: new Date().toISOString().slice(0, 10),
                    paymentSplits: [],
                    items: [
                      {
                        productId: PRODUCT,
                        quantity: 2,
                        unitPrice: 10,
                        taxRate: 0,
                        isService: false,
                        name: null,
                        batchId: null,
                        batchNumber: null,
                        uomId: null,
                      },
                    ],
                  },
                );
              } else {
                const { rows } = await tx.query<{ out: string }>(
                  "SELECT public.create_sale($1::uuid, $2::uuid, 'credit', 0, 0, 'تكافؤ مرتجع', $3::jsonb, CURRENT_DATE, '[]'::jsonb) AS out",
                  [WAREHOUSE, CUSTOMER, JSON.stringify(items)],
                );
                invoiceId = rows[0].out;
              }

              const { rows: itemRows } = await tx.query<{
                id: string;
                product_id: string;
                uom_id: string | null;
              }>(
                "SELECT id::text, product_id::text, uom_id::text FROM public.sales_invoice_items WHERE invoice_id=$1::uuid ORDER BY product_id",
                [invoiceId],
              );
              const retItems = itemRows.map((r) => ({
                invoice_item_id: r.id,
                product_id: r.product_id,
                quantity: 2,
                uom_id: r.uom_id,
              }));

              let returnId: string;
              if (useNew) {
                const res = await createSalesReturnInner(
                  tx,
                  { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } },
                  {
                    invoiceId,
                    warehouseId: WAREHOUSE,
                    customerId: CUSTOMER,
                    refundMethod: "cash",
                    note: "تكافؤ",
                    items: retItems.map((r) => ({
                      invoiceItemId: r.invoice_item_id,
                      productId: r.product_id,
                      quantity: r.quantity,
                      uomId: r.uom_id,
                    })),
                  },
                );
                returnId = res.returnId;
              } else {
                const { rows } = await tx.query<{ out: string }>(
                  "SELECT public.create_sales_return($1::uuid, $2::uuid, $3::uuid, 'cash', 'تكافؤ', $4::jsonb) AS out",
                  [invoiceId, WAREHOUSE, CUSTOMER, JSON.stringify(retItems)],
                );
                returnId = rows[0].out;
              }

              const snap = await snapshotReturn(tx, returnId);
              const { rows: st } = await tx.query<{ status: string }>(
                "SELECT status::text FROM public.sales_invoices WHERE id=$1::uuid",
                [invoiceId],
              );
              const { rows: bal } = await tx.query<{ balance: string }>(
                "SELECT balance::text FROM public.customers WHERE id=$1::uuid",
                [CUSTOMER],
              );
              return { snap, invoiceStatus: st[0].status, ledgerBalance: bal[0]?.balance ?? "0" };
            }
          }

          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes.snap, oldRes.snap, "المرتجع متطابق");
          assert.equal(newRes.invoiceStatus, oldRes.invoiceStatus, "حالة الفاتورة متطابقة");
          assert.equal(newRes.ledgerBalance, oldRes.ledgerBalance, "رصيد العميل متطابق");
        }
      : null,
  );

  // ── 5) adjust_loyalty: earn ثم redeem
  await run(
    "[تكافؤ] adjust_loyalty earn/redeem",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean): Promise<{ points: string }> {
            return withTransaction({ userId: OWNER, rollback: true }, async (tx) => {
              const { rows: custRows } = await tx.query<{ id: string }>(
                "SELECT id::text FROM public.customers WHERE is_system IS NOT TRUE AND is_active ORDER BY created_at LIMIT 1",
              );
              const CUSTOMER = custRows[0].id;
              if (useNew) {
                await adjustLoyalty(
                  { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } },
                  { customerId: CUSTOMER, points: 5, kind: "earn", note: "تكافؤ" },
                );
                await adjustLoyalty(
                  { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } },
                  { customerId: CUSTOMER, points: 8, kind: "redeem", note: "تكافؤ" },
                );
              } else {
                await tx.query("SELECT public.adjust_loyalty($1::uuid, 5, 'earn', 'تكافؤ')", [
                  CUSTOMER,
                ]);
                await tx.query("SELECT public.adjust_loyalty($1::uuid, 8, 'redeem', 'تكافؤ')", [
                  CUSTOMER,
                ]);
              }
              const { rows: bal } = await tx.query<{ points: string }>(
                "SELECT loyalty_points::text AS points FROM public.customers WHERE id=$1::uuid",
                [CUSTOMER],
              );
              return { points: bal[0].points };
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.equal(newRes.points, oldRes.points, "نقاط الولاء متطابقة (5 ثم 0 بعد redeem)");
        }
      : null,
  );

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 5 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
