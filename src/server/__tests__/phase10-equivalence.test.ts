/**
 * اختبار تكافؤ المرحلة 10a (ADR-006): مساعدات المصاريف (TS) مقابل دوال القاعدة.
 * - expense_write_supplier_ledger: قيد دائن/مدين على دفتر المورد (balance_after + صف الدفتر).
 * - expense_round / settlement / line_net: دوال نقية — تُقارن مخرجاتها مباشرة.
 * سيناريوهات القديمة تُتخطى بعد إسقاط دوال القاعدة (المرحلة 13).
 * تشغيل (npm run test:server:phase10) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ??
  "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  expenseLineNet,
  expenseRound,
  expenseSettlementStatus,
  expenseWriteSupplierLedger,
} from "@/server/domains/expenses/infrastructure/expenses.repository";

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

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const { rows: fnRows } = await pool.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='expense_write_supplier_ledger'",
  );
  const oldAvailable = Number(fnRows[0].n) > 0;

  // ── دوال نقية: مقارنة مخرجات مباشرة مع SQL
  await run("[تكافؤ] expense_round", async () => {
    const values = [null, 0, 1.005, 2.675, -3.455, 100.999];
    for (const v of values) {
      const { rows } = await pool.query<{ r: string }>(
        "SELECT public.expense_round($1::numeric)::text AS r",
        [v],
      );
      assert.equal(expenseRound(v).toFixed(2), rows[0].r, `expense_round(${v})`);
    }
  });

  await run("[تكافؤ] expense_settlement_status", async () => {
    const cases: Array<[string, number, number]> = [
      ["DRAFT", 5, 10],
      ["POSTED", 0, 10],
      ["POSTED", 10, 10],
      ["POSTED", 9.995, 10],
      ["POSTED", 5, 10],
      ["PARTIALLY_PAID", 10, 10],
    ];
    for (const [s, paid, total] of cases) {
      const { rows } = await pool.query<{ r: string }>(
        "SELECT public.expense_settlement_status($1::public.expense_status, $2::numeric, $3::numeric)::text AS r",
        [s, paid, total],
      );
      assert.equal(expenseSettlementStatus(s, paid, total), rows[0].r, `${s}/${paid}/${total}`);
    }
  });

  await run("[تكافؤ] expense_line_net", async () => {
    const cases: Array<[number, number, string]> = [
      [110, 10, "INCLUSIVE"],
      [100, 10, "EXCLUSIVE"],
      [100, 0, "NONE"],
      [115, 15, "INCLUSIVE"],
    ];
    for (const [gross, rate, mode] of cases) {
      const { rows } = await pool.query<{ r: string }>(
        "SELECT public.expense_line_net($1::numeric, $2::numeric, $3::public.expense_tax_mode)::text AS r",
        [gross, rate, mode],
      );
      assert.equal(
        expenseLineNet(gross, rate, mode).toFixed(2),
        rows[0].r,
        `${gross}/${rate}/${mode}`,
      );
    }
  });

  // ── expense_write_supplier_ledger: مساران في معاملتين مُرجَعتين
  await run(
    "[تكافؤ] expense_write_supplier_ledger (CREDIT ثم DEBIT)",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return withTransaction({ rollback: true }, async (tx) => {
              const { rows: supRows } = await tx.query<{ id: string; balance: string }>(
                "SELECT id::text, balance::text FROM public.suppliers WHERE is_active AND is_system IS NOT TRUE ORDER BY created_at LIMIT 1",
              );
              assert.ok(supRows[0], "يوجد مورد غير نظامي");
              const SUPPLIER = supRows[0].id;
              const before = Number(supRows[0].balance);

              if (useNew) {
                await expenseWriteSupplierLedger(tx, {
                  supplierId: SUPPLIER,
                  entryType: "EXPENSE",
                  side: "CREDIT",
                  amount: 12.345,
                  referenceType: "expense_entry",
                  referenceId: "00000000-0000-0000-0000-00000000000a",
                  sourceKey: "probe-credit:new",
                  note: "تكافؤ دائن",
                  actor: "00000000-0000-0000-0000-00000000000b",
                });
                await expenseWriteSupplierLedger(tx, {
                  supplierId: SUPPLIER,
                  entryType: "EXPENSE",
                  side: "DEBIT",
                  amount: 2.5,
                  referenceType: "expense_entry",
                  referenceId: "00000000-0000-0000-0000-00000000000a",
                  sourceKey: "probe-debit:new",
                  note: "تكافؤ مدين",
                  actor: "00000000-0000-0000-0000-00000000000b",
                });
              } else {
                await tx.query(
                  `SELECT public.expense_write_supplier_ledger($1::uuid, 'EXPENSE', 'CREDIT', 12.345,
                      'expense_entry', '00000000-0000-0000-0000-00000000000a'::uuid, 'probe-credit:old',
                      NULL::date, NULL::timestamptz, 'تكافؤ دائن', '00000000-0000-0000-0000-00000000000b'::uuid)`,
                  [SUPPLIER],
                );
                await tx.query(
                  `SELECT public.expense_write_supplier_ledger($1::uuid, 'EXPENSE', 'DEBIT', 2.5,
                      'expense_entry', '00000000-0000-0000-0000-00000000000a'::uuid, 'probe-debit:old',
                      NULL::date, NULL::timestamptz, 'تكافؤ مدين', '00000000-0000-0000-0000-00000000000b'::uuid)`,
                  [SUPPLIER],
                );
              }

              const { rows: bal } = await tx.query<{ balance: string }>(
                "SELECT balance::text FROM public.suppliers WHERE id=$1::uuid",
                [SUPPLIER],
              );
              const { rows: ledger } = await tx.query(
                `SELECT entry_type::text, debit::text, credit::text, balance_after::text, source_key
                   FROM public.supplier_ledger WHERE supplier_id=$1::uuid AND source_key LIKE 'probe-%'
                  ORDER BY source_key`,
                [SUPPLIER],
              );
              void before;
              const normalize = (o: { source_key?: string }) =>
                o.source_key ? { ...o, source_key: o.source_key.replace(/:(old|new)$/, ":k") } : o;
              return { balance: bal[0].balance, ledger: ledger.map(normalize) };
            });
          }
          const oldRes = (await cycle(false)) as { balance: string; ledger: unknown[] };
          const newRes = (await cycle(true)) as { balance: string; ledger: unknown[] };
          assert.deepEqual(newRes, oldRes, "دفتر المورد متطابق");
        }
      : null,
  );

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 10 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
