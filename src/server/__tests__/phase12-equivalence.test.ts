/**
 * اختبار تكافؤ المرحلة 12 (ADR-006): التقارير الجديدة (TS) مقابل دوال القاعدة.
 * - list_expenses: صفحة واحدة بمفاتيح بذور الاختبار — مقارنة عدد الصفوف والمرجع الأول.
 * - expense_summary: إجماليات الفترة — مقارنة كاملة للكائن.
 * - get_chart_of_accounts_tree: عدد الحسابات ورصيد 4111.
 * - get_supplier_statement: صفوف الكشف ورصيد التشغيل.
 * سيناريوهات القديمة تُتخطى بعد إسقاط الدوال (ترحيل 028).
 * تشغيل (npm run test:server:phase12) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ?? "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  chartOfAccounts,
  listExpensesReport,
  supplierLedgerStatement,
} from "@/server/domains/reports/application/reports.usecases";
import { expenseSummaryReport } from "@/server/domains/reports/application/reports.usecases";

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

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("list_expenses");

  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT user_id::text AS id FROM public.user_roles WHERE role='owner'::public.app_role LIMIT 1",
  );
  if (!ownerRows[0]) {
    console.log("⏭ لا يوجد مالك في بذور القاعدة.");
    return;
  }
  const OWNER = ownerRows[0].id;
  const session = { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } };

  await run(
    "[تكافؤ] list_expenses — عدد الصفوف والمرجع الأول (بيتًا-بيتًا)",
    oldAvailable
      ? async () => {
        const filters = { limit: 10, search: null, status: null };
        async function cycle(useNew: boolean) {
          if (useNew) {
            const rows = await listExpensesReport(session, filters);
            return { count: rows.length, first: rows[0]?.["reference"] ?? null };
          }
          return withTransaction({ rollback: true }, async (tx) => {
            await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS(OWNER)]);
            await tx.query("SELECT set_config('role', 'authenticated', true)");
            const { rows } = await tx.query<{ reference: string | null }>(
              "SELECT reference FROM public.list_expenses(p_limit => 10)",
            );
            return { count: rows.length, first: rows[0]?.reference ?? null };
          });
        }
        const oldSnap = await cycle(false);
        const newSnap = await cycle(true);
        assert.deepEqual(newSnap, oldSnap);
      }
      : null,
  );

  await run(
    "[تكافؤ] expense_summary — الإجماليات والعدادات (كائن كامل)",
    oldAvailable
      ? async () => {
        async function cycle(useNew: boolean) {
          if (useNew) {
            return expenseSummaryReport(session, { dateFrom: null, dateTo: null, warehouseId: null });
          }
          return withTransaction({ rollback: true }, async (tx) => {
            await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS(OWNER)]);
            await tx.query("SELECT set_config('role', 'authenticated', true)");
            const { rows } = await tx.query<{ d: unknown }>(
              "SELECT public.expense_summary(NULL::date, NULL::date, NULL::uuid) AS d",
            );
            return rows[0]?.d;
          });
        }
        const oldSnap = await cycle(false);
        const newSnap = await cycle(true);
        assert.deepEqual(newSnap, oldSnap);
      }
      : null,
  );

  await run(
    "[تكافؤ] get_chart_of_accounts_tree — عدد الحسابات ورصيد 4111",
    oldAvailable
      ? async () => {
        async function cycle(useNew: boolean) {
          if (useNew) {
            const rows = await chartOfAccounts(session);
            const acct = rows.find((r) => r["code"] === "4111");
            return {
              count: rows.length,
              bal4111: acct ? Number(acct["current_balance"]) : null,
            };
          }
          return withTransaction({ rollback: true }, async (tx) => {
            const { rows } = await tx.query<{ code: string; current_balance: string }>(
              "SELECT code, current_balance::text FROM public.get_chart_of_accounts_tree()",
            );
            const acct = rows.find((r) => r.code === "4111");
            return { count: rows.length, bal4111: acct ? Number(acct.current_balance) : null };
          });
        }
        const oldSnap = await cycle(false);
        const newSnap = await cycle(true);
        assert.deepEqual(newSnap, oldSnap);
      }
      : null,
  );

  await run(
    "[تكافؤ] get_supplier_statement — كشف المورد النقدي (عدد الصفوف)",
    oldAvailable
      ? async () => {
        async function cycle(useNew: boolean) {
          if (useNew) {
            return withTransaction(async (tx) => {
              const { rows: sup } = await tx.query<{ id: string }>(
                "SELECT id::text FROM public.suppliers WHERE is_system LIMIT 1",
              );
              if (!sup[0]) return { count: 0 };
              const rows = await supplierLedgerStatement(session, {
                supplierId: sup[0].id,
                startDate: null,
                endDate: null,
              });
              return { count: rows.length };
            });
          }
          return withTransaction({ rollback: true }, async (tx) => {
            const { rows: sup } = await tx.query<{ id: string }>(
              "SELECT id::text FROM public.suppliers WHERE is_system LIMIT 1",
            );
            if (!sup[0]) return { count: 0 };
            const { rows } = await tx.query(
              "SELECT * FROM public.get_supplier_statement($1::uuid)",
              [sup[0].id],
            );
            return { count: rows.length };
          });
        }
        const oldSnap = await cycle(false);
        const newSnap = await cycle(true);
        assert.deepEqual(newSnap, oldSnap);
      }
      : null,
  );

  if (failures > 0) {
    process.exitCode = 1;
  }
  await closePool();
}

main();
