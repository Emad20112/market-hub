/**
 * اختبار تكافؤ المرحلة 7 (ADR-006): الخزينة الجديدة (TS) مقابل دوال القاعدة.
 * - record_customer_payment (مع فاتورة / بتوزيع تلقائي)
 * - record_customer_payment_splits
 * - record_supplier_payment (9-معاملات)
 * كل سيناريو في معاملتين مُرجَعتين، مقارنة: سند الدفع، الدفتر، الفاتورة/المورد،
 * الرصيد، وربط القيد. سيناريوهات القديمة تُتخطى بعد إسقاط دوال القاعدة (ترحيل 022).
 * تشغيل (npm run test:server:phase7) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ??
  "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  recordCustomerPaymentInner,
  recordCustomerPaymentSplitsInner,
  recordSupplierPaymentInner,
} from "@/server/domains/treasury/application/treasury.usecases";
import { postStockDelta } from "@/server/domains/stock/application/engine";

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

/** لقطة حالة التحصيل بعد السند — بلا ids عشوائية (تُطبَّع). */
async function snapshotCollection(
  tx: import("pg").PoolClient,
  customerId: string,
  invoiceId: string | null,
) {
  const { rows: payments } = await tx.query(
    `SELECT amount::text, payment_method::text, payment_date::text, note
       FROM public.customer_payments WHERE customer_id=$1::uuid ORDER BY created_at, id`,
    [customerId],
  );
  const { rows: ledger } = await tx.query(
    `SELECT entry_type::text, credit::text, reference_type::text, note
       FROM public.customer_ledger WHERE customer_id=$1::uuid ORDER BY source_key`,
    [customerId],
  );
  const { rows: bal } = await tx.query<{ balance: string }>(
    "SELECT balance::text FROM public.customers WHERE id=$1::uuid",
    [customerId],
  );
  let invoice: Record<string, unknown> | null = null;
  if (invoiceId) {
    const { rows: inv } = await tx.query(
      `SELECT paid::text, status::text, payment_status::text
         FROM public.sales_invoices WHERE id=$1::uuid`,
      [invoiceId],
    );
    invoice = inv[0] ?? null;
  }
  const normalize = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? "<id>" : v;
  const norm = (arr: Record<string, unknown>[]) =>
    arr.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalize(v)])));
  return { payments: norm(payments), ledger: norm(ledger), balance: bal[0]?.balance, invoice };
}

async function snapshotSupplierPayment(tx: import("pg").PoolClient, supplierId: string) {
  const { rows: payments } = await tx.query(
    `SELECT voucher_number LIKE 'SP-%' OR voucher_number ~ '\\d' AS ok, amount::text,
            payment_method::text, account_code, payment_date::text, journal_entry_id IS NOT NULL AS has_journal
       FROM public.supplier_payments WHERE supplier_id=$1::uuid ORDER BY created_at, id`,
    [supplierId],
  );
  const { rows: ledger } = await tx.query(
    `SELECT entry_type::text, debit::text, balance_after::text, reference_type::text
       FROM public.supplier_ledger WHERE supplier_id=$1::uuid ORDER BY source_key`,
    [supplierId],
  );
  const { rows: bal } = await tx.query<{ balance: string }>(
    "SELECT balance::text FROM public.suppliers WHERE id=$1::uuid",
    [supplierId],
  );
  const normalize = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? "<id>" : v;
  const norm = (arr: Record<string, unknown>[]) =>
    arr.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, normalize(v)])));
  return { payments: norm(payments), ledger: norm(ledger), balance: bal[0]?.balance };
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("record_customer_payment");

  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT user_id::text AS id FROM public.user_roles WHERE role='owner'::public.app_role LIMIT 1",
  );
  const OWNER = ownerRows[0].id;
  const session = { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } };

  /** معاملة اختبار موحدة: service_role + claims — كلا المسارين يعملان تحتها
   *  (الدوال القديمة SECURITY DEFINER تقرأ auth.uid() من الـ claims GUC).
   *  البذر عبر محرك/Use Cases مثبتة تكافؤها في المراحل السابقة. */
  async function txWithClaims(fn: (tx: import("pg").PoolClient) => Promise<unknown>) {
    return withTransaction({ rollback: true }, async (tx) => {
      await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS(OWNER)]);
      return fn(tx);
    });
  }

  /** بذر فاتورة آجلة للعميل عبر createSaleInner (المرحلة 5 — مثبتة). */
  async function seedStockAndInvoice(
    tx: import("pg").PoolClient,
    customer: string,
    warehouse: string,
    product: string,
  ): Promise<string> {
    await postStockDelta(tx, {
      productId: product,
      warehouseId: warehouse,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: 5,
      unitCost: 5,
      movementKind: "OPENING",
      sourceType: "phase7_seed",
      sourceId: null,
      note: "بذر اختبار المرحلة 7",
      actorId: OWNER,
      movementTypeLegacy: "opening",
    });
    return seedCreditInvoice(tx, customer, warehouse, product);
  }
  async function seedCreditInvoice(
    tx: import("pg").PoolClient,
    customer: string,
    warehouse: string,
    product: string,
  ): Promise<string> {
    const { createSaleInner } = await import("@/server/domains/sales/application/sales.usecases");
    return createSaleInner(tx, session, {
      warehouseId: warehouse,
      customerId: customer,
      paymentMethod: "credit",
      paid: 0,
      discount: 0,
      note: "بذر اختبار المرحلة 7",
      saleDate: new Date().toISOString().slice(0, 10),
      paymentSplits: [],
      items: [{ productId: product, quantity: 2, unitPrice: 10, taxRate: 0 }],
    });
  }

  async function testContext(tx: import("pg").PoolClient) {
    const { rows: custRows } = await tx.query<{ id: string }>(
      "SELECT id::text FROM public.customers WHERE is_system IS NOT TRUE AND is_active ORDER BY created_at LIMIT 1",
    );
    assert.ok(custRows[0], "يوجد عميل حقيقي");
    const { rows: supRows } = await tx.query<{ id: string }>(
      "SELECT id::text FROM public.suppliers WHERE is_active AND is_system IS NOT TRUE ORDER BY created_at LIMIT 1",
    );
    assert.ok(supRows[0], "يوجد مورد حقيقي غير نظامي");
    const { rows: whRows } = await tx.query<{ id: string }>(
      "SELECT id::text FROM public.warehouses LIMIT 1",
    );
    const { rows: prodRows } = await tx.query<{ id: string }>(
      `SELECT p.id::text FROM public.products p
        WHERE p.inventory_policy='TRACKED' AND p.item_nature <> 'SERVICE'
          AND p.is_active AND p.is_sellable
          AND EXISTS (SELECT 1 FROM public.product_uoms pu
                      WHERE pu.product_id = p.id AND pu.unit_id = coalesce(p.base_uom_id, p.unit_id)
                        AND pu.can_sell AND pu.is_active)
        ORDER BY p.created_at LIMIT 1`,
    );
    assert.ok(prodRows[0], "يوجد منتج قابل للبيع");
    const product = prodRows[0].id;
    await tx.query("UPDATE public.products SET sale_price = 10 WHERE id = $1::uuid", [product]);
    await tx.query(
      `UPDATE public.product_uoms SET can_sell = true, is_active = true WHERE product_id = $1::uuid`,
      [product],
    );
    return {
      CUSTOMER: custRows[0].id,
      SUPPLIER: supRows[0].id,
      WAREHOUSE: whRows[0].id,
      PRODUCT: product,
    };
  }

  // ── 1) record_customer_payment بفاتورة
  await run(
    "[تكافؤ] record_customer_payment (فاتورة) — السند والدفتر والرصيد",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              const { CUSTOMER, WAREHOUSE, PRODUCT } = await testContext(tx);
              const INVOICE = await seedStockAndInvoice(tx, CUSTOMER, WAREHOUSE, PRODUCT);
              if (useNew) {
                await recordCustomerPaymentInner(tx, session, {
                  customerId: CUSTOMER,
                  invoiceId: INVOICE,
                  amount: 1,
                  method: "cash",
                  paymentDate: new Date().toISOString().slice(0, 10),
                  note: "تكافؤ تحصيل",
                });
              } else {
                await tx.query(
                  `SELECT public.record_customer_payment(
                      $1::uuid, $2::uuid, 1, 'cash', CURRENT_DATE, 'تكافؤ تحصيل',
                      NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date, NULL::text)`,
                  [CUSTOMER, INVOICE],
                );
              }
              return snapshotCollection(tx, CUSTOMER, INVOICE);
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "حالة التحصيل متطابقة");
        }
      : null,
  );

  // ── 2) record_customer_payment بتوزيع تلقائي (بلا فاتورة)
  await run(
    "[تكافؤ] record_customer_payment (توزيع تلقائي)",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              const { CUSTOMER, WAREHOUSE, PRODUCT } = await testContext(tx);
              // بذر ذمة: فاتورتان آجلتان ليُوزَّع التحصيل عليهما
              await seedStockAndInvoice(tx, CUSTOMER, WAREHOUSE, PRODUCT);
              await seedCreditInvoice(tx, CUSTOMER, WAREHOUSE, PRODUCT);
              if (useNew) {
                await recordCustomerPaymentInner(tx, session, {
                  customerId: CUSTOMER,
                  invoiceId: null,
                  amount: 0.5,
                  method: "cash",
                  paymentDate: new Date().toISOString().slice(0, 10),
                  note: "تكافؤ توزيع",
                });
              } else {
                await tx.query(
                  `SELECT public.record_customer_payment(
                      $1::uuid, NULL::uuid, 0.5, 'cash', CURRENT_DATE, 'تكافؤ توزيع',
                      NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date, NULL::text)`,
                  [CUSTOMER],
                );
              }
              return snapshotCollection(tx, CUSTOMER, null);
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "التوزيع التلقائي متطابق");
        }
      : null,
  );

  // ── 3) record_customer_payment_splits
  await run(
    "[تكافؤ] record_customer_payment_splits",
    oldAvailable
      ? async () => {
          const splits = [
            { method: "cash", amount: 0.4 },
            { method: "bank_transfer", amount: 0.6 },
          ];
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              const { CUSTOMER, WAREHOUSE, PRODUCT } = await testContext(tx);
              await seedStockAndInvoice(tx, CUSTOMER, WAREHOUSE, PRODUCT);
              if (useNew) {
                await recordCustomerPaymentSplitsInner(tx, session, {
                  customerId: CUSTOMER,
                  invoiceId: null,
                  amount: 1,
                  paymentDate: new Date().toISOString().slice(0, 10),
                  note: "تكافؤ مجزأ",
                  splits,
                });
              } else {
                await tx.query(
                  `SELECT public.record_customer_payment_splits(
                      $1::uuid, NULL::uuid, 1, CURRENT_DATE, 'تكافؤ مجزأ', $2::jsonb)`,
                  [CUSTOMER, JSON.stringify(splits)],
                );
              }
              return snapshotCollection(tx, CUSTOMER, null);
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "التحصيل المجزأ متطابق");
        }
      : null,
  );

  // ── 4) record_supplier_payment (9-معاملات)
  await run(
    "[تكافؤ] record_supplier_payment — السند والدفتر والرصيد",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              const { SUPPLIER } = await testContext(tx);
              if (useNew) {
                await recordSupplierPaymentInner(tx, session, {
                  supplierId: SUPPLIER,
                  amount: 3,
                  paymentMethod: "CASH",
                  accountCode: "1101",
                  paymentDate: new Date().toISOString().slice(0, 10),
                  notes: "تكافؤ صرف",
                });
              } else {
                await tx.query(
                  `SELECT public.record_supplier_payment(
                      $1::uuid, 3, 'CASH', '1101', CURRENT_DATE, 'تكافؤ صرف',
                      NULL::date, NULL::uuid, NULL::uuid)`,
                  [SUPPLIER],
                );
              }
              return snapshotSupplierPayment(tx, SUPPLIER);
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "سند الصرف متطابق");
        }
      : null,
  );

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 7 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
