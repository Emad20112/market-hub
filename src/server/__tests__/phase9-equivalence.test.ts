/**
 * اختبار تكافؤ المرحلة 9 (ADR-006): المحاسبة الجديدة (TS) مقابل دوال القاعدة.
 * - create_journal_entry: قيد نظامي متوازن (رأس/سطور/إجماليات/تدقيق)،
 *   ورفض غير المتوازن برسالة حرفية.
 * - reverse_journal_entry: عكس قيد POSTED (السطور مقلوبة + الحالة REVERSED).
 * - set_period_status: تبديل حالة فترة (تدقيق + closed_at/by).
 * سيناريوهات القديمة تُتخطى بعد إسقاط الدوال (ترحيل 024).
 * تشغيل (npm run test:server:phase9) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ??
  "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  createJournalEntryInner,
  reverseJournalEntryInner,
  setPeriodStatusInner,
} from "@/server/domains/accounting/application/accounting.usecases";

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

/** لقطة القيد — الرأس والسطور (بلا ids عشوائية). */
async function snapshotEntry(tx: import("pg").PoolClient, entryId: string) {
  const { rows: head } = await tx.query(
    `SELECT entry_number ~ '\\d' AS ok, entry_date::text, memo, source_type, source_id::text,
            is_system, total_debit::text, total_credit::text, status::text
       FROM public.journal_entries WHERE id=$1::uuid`,
    [entryId],
  );
  const { rows: lines } = await tx.query(
    `SELECT a.code, jl.debit::text, jl.credit::text, jl.memo, jl.partner_type::text, jl.partner_id::text
       FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
      WHERE jl.entry_id=$1::uuid ORDER BY a.code, jl.id`,
    [entryId],
  );
  const normalize = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? "<id>" : v;
  return {
    head: Object.fromEntries(
      Object.entries(head[0]).map(([k, v]) => [k, k === "source_id" ? "<id>" : normalize(v)]),
    ),
    lines: lines.map((l) => ({ ...l, partner_id: l.partner_id ? "<id>" : null })),
  };
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("create_journal_entry");

  const { rows: ownerRows } = await pool.query<{ id: string }>(
    "SELECT user_id::text AS id FROM public.user_roles WHERE role='owner'::public.app_role LIMIT 1",
  );
  const OWNER = ownerRows[0].id;
  const session = { userId: OWNER, claims: { sub: OWNER, role: "authenticated" } };

  async function txWithClaims(fn: (tx: import("pg").PoolClient) => Promise<unknown>) {
    return withTransaction({ rollback: true }, async (tx) => {
      await tx.query("SELECT set_config('request.jwt.claims', $1, true)", [CLAIMS(OWNER)]);
      return fn(tx);
    });
  }

  const LINES = [
    { account_code: "1101", debit: 100, credit: 0, memo: "قيد تكافؤ — مدين" },
    { account_code: "4111", debit: 0, credit: 100, memo: "قيد تكافؤ — دائن" },
  ];

  // ── 1) create_journal_entry: قيد نظامي متوازن
  await run(
    "[تكافؤ] create_journal_entry (نظامي متوازن) — رأس/سطور/إجماليات",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              let entryId: string;
              if (useNew) {
                entryId = await createJournalEntryInner(tx, session, {
                  memo: "قيد تكافؤ مرحلة 9",
                  entryDate: new Date().toISOString().slice(0, 10),
                  sourceType: "equivalence_test",
                  sourceId: null,
                  isSystem: true,
                  lines: LINES,
                });
              } else {
                const { rows } = await tx.query<{ out: string }>(
                  `SELECT public.create_journal_entry('قيد تكافؤ مرحلة 9', CURRENT_DATE,
                      'equivalence_test', NULL::uuid, true, $1::jsonb) AS out`,
                  [JSON.stringify(LINES)],
                );
                entryId = rows[0].out;
              }
              return snapshotEntry(tx, entryId);
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "القيد النظامي متطابق");
        }
      : null,
  );

  // ── 2) رفض غير المتوازن بنفس الرسالة
  await run(
    "[تكافؤ] رفض القيد غير المتوازن — نفس الرسالة",
    oldAvailable
      ? async () => {
          const BAD = [
            { account_code: "1101", debit: 50, credit: 0, memo: "مدين" },
            { account_code: "4111", debit: 0, credit: 40, memo: "دائن" },
          ];
          const oldMsg = (await txWithClaims(async (tx) => {
            try {
              await tx.query(
                `SELECT public.create_journal_entry('قيد سيء', CURRENT_DATE, NULL, NULL::uuid, true, $1::jsonb)`,
                [JSON.stringify(BAD)],
              );
              return "لم يرفض!";
            } catch (e) {
              return (e as Error).message;
            }
          })) as string;
          const newMsg = (await txWithClaims(async (tx) => {
            try {
              await createJournalEntryInner(tx, session, {
                memo: "قيد سيء",
                isSystem: true,
                lines: BAD,
              });
              return "لم يرفض!";
            } catch (e) {
              return (e as Error).message;
            }
          })) as string;
          assert.equal(newMsg, oldMsg);
          assert.match(newMsg, /Entry does not balance/);
        }
      : null,
  );

  // ── 3) reverse_journal_entry
  await run(
    "[تكافؤ] reverse_journal_entry — العكس والحالة",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              let entryId: string;
              if (useNew) {
                entryId = await createJournalEntryInner(tx, session, {
                  memo: "قيد للعكس",
                  isSystem: true,
                  lines: LINES,
                });
                await reverseJournalEntryInner(tx, session, {
                  entryId,
                  reason: "تكافؤ عكس",
                });
              } else {
                const { rows } = await tx.query<{ out: string }>(
                  `SELECT public.create_journal_entry('قيد للعكس', CURRENT_DATE, NULL, NULL::uuid, true, $1::jsonb) AS out`,
                  [JSON.stringify(LINES)],
                );
                entryId = rows[0].out;
                await tx.query("SELECT public.reverse_journal_entry($1::uuid, 'تكافؤ عكس')", [
                  entryId,
                ]);
              }
              const { rows: st } = await tx.query<{ status: string }>(
                "SELECT status::text FROM public.journal_entries WHERE id=$1::uuid",
                [entryId],
              );
              // القيد العكسي: السطور مقلوبة والرأس نظامي بنفس الإجمالي
              const { rows: rev } = await tx.query(
                `SELECT je.entry_number ~ '\\d' AS ok, je.is_system, je.total_debit::text, je.total_credit::text
                   FROM public.journal_entries je
                  WHERE je.source_type='journal_reversal' AND je.source_id=$1::uuid`,
                [entryId],
              );
              const { rows: revLines } = await tx.query(
                `SELECT a.code, jl.debit::text, jl.credit::text
                   FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
                   JOIN public.journal_entries je ON je.id = jl.entry_id
                  WHERE je.source_type='journal_reversal' AND je.source_id=$1::uuid
                  ORDER BY a.code`,
                [entryId],
              );
              return { status: st[0].status, revHead: rev[0] ?? null, revLines };
            });
          }
          const oldRes = await cycle(false);
          const newRes = await cycle(true);
          assert.deepEqual(newRes, oldRes, "العكس متطابق");
        }
      : null,
  );

  // ── 4) set_period_status
  await run(
    "[تكافؤ] set_period_status — الحالة والتدقيق",
    oldAvailable
      ? async () => {
          async function cycle(useNew: boolean) {
            return txWithClaims(async (tx) => {
              const { rows: per } = await tx.query<{ id: string; status: string }>(
                "SELECT id::text, status::text FROM public.fiscal_periods ORDER BY start_date LIMIT 1",
              );
              assert.ok(per[0], "توجد فترة مالية");
              const target = per[0].status === "OPEN" ? "CLOSED" : "OPEN";
              if (useNew) {
                await setPeriodStatusInner(tx, session, { periodId: per[0].id, status: target });
              } else {
                await tx.query("SELECT public.set_period_status($1::uuid, $2::text)", [
                  per[0].id,
                  target,
                ]);
              }
              const { rows: after } = await tx.query<{ status: string }>(
                "SELECT status::text FROM public.fiscal_periods WHERE id=$1::uuid",
                [per[0].id],
              );
              const { rows: audits } = await tx.query<{ action: string }>(
                "SELECT action FROM public.audit_logs WHERE entity_type='fiscal_period' AND entity_id=$1::uuid",
                [per[0].id],
              );
              // إرجاع الحالة الأصلية داخل المعاملة لالتقاط كلا الاتجاهين؟ لا — مُرجَعة كاملة.
              return { status: after[0].status, auditCount: audits.length };
            });
          }
          const oldRes = (await cycle(false)) as { status: string; auditCount: number };
          const newRes = (await cycle(true)) as { status: string; auditCount: number };
          assert.deepEqual(newRes, oldRes, "حالة الفترة متطابقة");
        }
      : null,
  );

  console.log(failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 9 نجحت." : `\nفشل ${failures} اختبار`);
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
