/**
 * اختبار تكافؤ المرحلة 10b (ADR-006): دورة حياة المصاريف (TS) مقابل دوال القاعدة.
 * دورة كاملة على نفس المدخلات:
 *   create → decide (اعتماد مباشر لمسودة من المالك) → post → payment → close
 * المقارنة: صف المستند (jsonb) + سطوره + القيد المحاسبي + دفتر المورد.
 *
 * ملاحظة عيب قديم موثقة: `decide_expense` القديمة تسجل الحركة 'approve'/'reject'
 * بينما قيد expense_approvals_action_known يسمح بـ 'approved'/'rejected' — فالدالة
 * تنهار لأي قرار. المسار الجديد يُصحّحها، والعيب يُثبت بتحديد صريح في السيناريو (ب).
 *
 * تشغيل (npm run test:server:phase10b) — يتطلب SERVER_DATABASE_URL لقاعدة البذور 5433.
 */
import assert from "node:assert/strict";
import net from "node:net";
process.env.SERVER_DATABASE_URL =
  process.env.SERVER_DATABASE_URL ??
  "postgresql://postgres:bbb1750d085fc3323699002b7a61d4a3@127.0.0.1:5433/postgres";
import { closePool, getPool } from "@/server/shared/db/pool";
import { withTransaction } from "@/server/shared/db/transaction";
import {
  cancelExpenseInner,
  closeExpenseInner,
  createExpenseInner,
  decideExpenseInner,
  postExpenseInner,
  recordExpensePaymentInner,
  submitExpenseInner,
  updateExpenseInner,
} from "@/server/domains/expenses/application/expense-lifecycle.usecases";

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

async function snapshotCycle(tx: import("pg").PoolClient, entryId: string) {
  const { rows: entry } = await tx.query(
    `SELECT reference ~ '\\d' AS ok, status::text, total_amount::text, paid_amount::text,
            line_count, version, payee_type::text, supplier_id IS NOT NULL AS has_supplier,
            tax_recoverable, allow_draft_post
       FROM public.expense_entries WHERE id=$1::uuid`,
    [entryId],
  );
  const { rows: lines } = await tx.query(
    `SELECT line_no, description, quantity::text, unit_price::text, net_amount::text,
            tax_amount::text, gross_amount::text
       FROM public.expense_lines WHERE entry_id=$1::uuid ORDER BY line_no`,
    [entryId],
  );
  const { rows: journal } = await tx.query(
    `SELECT je.entry_number ~ '\\d' AS ok, je.total_debit::text, je.total_credit::text,
            (SELECT jsonb_agg(jsonb_build_object('code', a.code, 'debit', jl.debit::text, 'credit', jl.credit::text) ORDER BY a.code)
               FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
              WHERE jl.entry_id = je.id) AS lines
       FROM public.journal_entries je
      WHERE je.source_type='expense' AND je.source_id=$1::uuid`,
    [entryId],
  );
  const { rows: ledger } = await tx.query(
    `SELECT entry_type::text, debit::text, credit::text, balance_after::text
       FROM public.supplier_ledger WHERE supplier_id = (SELECT supplier_id FROM public.expense_entries WHERE id=$1::uuid)
         AND source_key LIKE 'EXP%' ORDER BY source_key`,
    [entryId],
  );
  const { rows: payments } = await tx.query(
    `SELECT amount::text, payment_method::text FROM public.expense_payments WHERE entry_id=$1::uuid`,
    [entryId],
  );
  const { rows: approvals } = await tx.query(
    `SELECT action, to_status::text FROM public.expense_approvals WHERE entry_id=$1::uuid ORDER BY sequence`,
    [entryId],
  );
  return { entry: entry[0], lines, journal: journal[0] ?? null, ledger, payments, approvals };
}

async function main() {
  if (!(await tcpAlive("127.0.0.1", 5433))) {
    console.log("⏭ قاعدة خط الأساس غير عاملة (5433) — تُتخطى اختبارات التكافؤ.");
    return;
  }
  const pool = getPool();
  const oldAvailable = await fnExists("create_expense_v2");

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

  await run(
    "[تكافؤ] دورة حياة مصروف كامل (المسار الجديد) + عيب القديمة (decide_expense) موثقًا",
    oldAvailable
      ? async () => {
          // (أ) المسار الجديد كاملًا مع تحقق ذاتي صارم — الدالة القديمة تنهار
          //     في decide_expense دائمًا (action يخالف قيد expense_approvals)،
          //     فالمقارنة بيتًا-بيتًا مستحيلة؛ العيب يُثبت في (ب) أدناه.
          const newRes = (await txWithClaims(async (tx) => {
            const { rows: supRows } = await tx.query<{ id: string }>(
              "SELECT id::text FROM public.suppliers WHERE is_active AND is_system IS NOT TRUE ORDER BY created_at LIMIT 1",
            );
            assert.ok(supRows[0], "يوجد مورد غير نظامي");
            const SUPPLIER = supRows[0].id;
            const { rows: catRows } = await tx.query<{ id: string }>(
              `SELECT c.id::text FROM public.expense_categories c
                  JOIN public.accounts a ON a.id = c.account_id
                 WHERE c.is_active AND a.account_type::text='EXPENSE' AND a.is_active AND a.is_postable
                 ORDER BY c.sort_order LIMIT 1`,
            );
            assert.ok(catRows[0], "توجد فئة مصروف بحساب قابل للترحيل");
            const lines = [
              {
                description: "صنف تكافؤ",
                category_id: catRows[0].id,
                quantity: 2,
                unit_price: 50,
                tax_rate: 0,
                cost_center_id: null,
                project_id: null,
                note: null,
              },
            ];
            const header = {
              expenseDate: new Date().toISOString().slice(0, 10),
              dueDate: null,
              entryType: "DIRECT",
              payeeType: "SUPPLIER",
              payeeName: "مورد تكافؤ",
              supplierId: SUPPLIER,
              employeeId: null,
              warehouseId: null,
              costCenterId: null,
              projectId: null,
              description: "دورة تكافؤ 10b",
              note: null,
              taxMode: "NONE",
            };

            const created = (await createExpenseInner(tx, session, {
              ...header,
              lines,
              submit: false,
              taxRecoverable: false,
            })) as { id: string };
            const entryId = created.id;
            // اعتماد مباشر للمسودة من المالك (بسبب مكتوب) — المسار الوحيد الذي
            // يسمح به القاعدة لمنشئه؛ الإرسال ثم الاعتماد الذاتي ممنوع (maker-checker).
            await decideExpenseInner(tx, session, {
              entryId,
              approve: true,
              reason: "اعتماد مباشر للتكافؤ من المالك",
            });
            await postExpenseInner(tx, session, { entryId });
            await recordExpensePaymentInner(tx, session, {
              entryId,
              amount: 100,
              paymentMethod: "cash",
              paymentDate: new Date().toISOString().slice(0, 10),
              note: "تسوية تكافؤ",
            });
            await closeExpenseInner(tx, session, entryId);

            const snap = await snapshotCycle(tx, entryId);
            const balance = (
              await tx.query<{ b: string }>(
                "SELECT balance::text AS b FROM public.suppliers WHERE id=$1::uuid",
                [SUPPLIER],
              )
            ).rows[0].b;

            // تحققات ذاتية (الأصل كان سيحققها لو صحّ عيبه):
            assert.equal(snap.entry.status, "CLOSED", "المصروف مُقفل");
            assert.equal(snap.entry.total_amount, "100.00", "الإجمالي 100");
            assert.equal(snap.entry.paid_amount, "100.00", "مسدد بالكامل");
            assert.ok(snap.journal, "قيد الاستحقاق مُرحَّل");
            assert.equal(snap.journal.total_debit, snap.journal.total_credit, "القيد متوازن");
            assert.equal(snap.ledger.length, 1, "صف استحقاق واحد في دفتر المورد");
            assert.equal(snap.ledger[0].entry_type, "EXPENSE_ACCRUAL", "نوع الاستحقاق");
            assert.equal(snap.payments.length, 1, "دفعة واحدة");
            assert.equal(
              snap.approvals.some((a: { action: string }) => a.action === "approved"),
              true,
              "حركة اعتماد مسجلة بالاسم الصحيح",
            );
            // تسوية دفتر المورد: استحقاق دائن 100 ثم سداد مدين 100 → الرصيد ثابت
            assert.equal(balance, "0", "رصيد المورد ثابت بعد الدورة");
            return snap;
          })) as Record<string, unknown>;

          // (ب) إثبات العيب القديم: decide_expense ينهار بقيد الموافقات
          const oldErr = (await txWithClaims(async (tx) => {
            const { rows: catRows } = await tx.query<{ id: string }>(
              `SELECT c.id::text FROM public.expense_categories c
                  JOIN public.accounts a ON a.id = c.account_id
                 WHERE c.is_active AND a.account_type::text='EXPENSE' AND a.is_active AND a.is_postable
                 ORDER BY c.sort_order LIMIT 1`,
            );
            const { rows } = await tx.query<{ id: string }>(
              `SELECT (public.create_expense_v2($1::jsonb, CURRENT_DATE, NULL, 'DIRECT',
                 'NONE', NULL, NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid,
                 NULL::uuid, 'عيب decide', NULL, 'NONE', NULL, false, NULL, false)).id AS id`,
              [
                JSON.stringify([
                  {
                    description: "عيب",
                    category_id: catRows[0].id,
                    quantity: 1,
                    unit_price: 10,
                    tax_rate: 0,
                    cost_center_id: null,
                    project_id: null,
                    note: null,
                  },
                ]),
              ],
            );
            const entryId = rows[0].id;
            try {
              await tx.query("SELECT public.decide_expense($1::uuid, true, 'قرار تكافؤ')", [
                entryId,
              ]);
              return "لم ينهار!";
            } catch (e) {
              return (e as Error).message;
            }
          })) as string;
          assert.match(
            oldErr,
            /expense_approvals_action_known/,
            "عيب decide_expense القديم كما هو موثق",
          );
          void newRes;
        }
      : null,
  );

  // ── 2) update/submit/cancel: مسار جديد فقط (القديمة تحتاج decide المكسورة)
  await run(
    "[تكافؤ] update→submit→cancel (المسار الجديد)",
    oldAvailable
      ? async () => {
          await txWithClaims(async (tx) => {
            const { rows: catRows } = await tx.query<{ id: string }>(
              "SELECT id::text FROM public.expense_categories ORDER BY sort_order LIMIT 1",
            );
            const lines = [
              {
                description: "بند للتحديث",
                category_id: catRows[0].id,
                quantity: 1,
                unit_price: 7,
                tax_rate: 0,
                cost_center_id: null,
                project_id: null,
                note: null,
              },
            ];
            const day = new Date().toISOString().slice(0, 10);
            const created = (await createExpenseInner(tx, session, {
              lines,
              expenseDate: day,
              taxMode: "NONE",
            })) as { id: string; version: number };
            const entryId = created.id;
            // تحديث المسودة (version++ ثم DRAFT)
            await updateExpenseInner(tx, session, {
              entryId,
              expectedVersion: created.version,
              lines: lines.map((l) => ({ ...l, unit_price: 9 })),
              expenseDate: day,
              taxMode: "NONE",
            });
            // إرسال ثم إلغاء
            await submitExpenseInner(tx, session, { entryId, expectedVersion: 1 });
            await cancelExpenseInner(tx, session, {
              entryId,
              reason: "تكافؤ إلغاء",
              expectedVersion: 2,
            });
            const snap = await snapshotCycle(tx, entryId);
            assert.equal(snap.entry.status, "CANCELLED", "المصروف ملغى");
            assert.equal(snap.entry.total_amount, "9.00", "الإجمالي بعد التحديث");
            assert.equal(
              snap.approvals.some((a: { action: string }) => a.action === "cancelled"),
              true,
              "حركة إلغاء مسجلة",
            );
          });
        }
      : null,
  );

  console.log(
    failures === 0 ? "\nكل اختبارات تكافؤ المرحلة 10b نجحت." : `\nفشل ${failures} اختبار`,
  );
  await closePool();
  if (failures > 0) process.exit(1);
}

void main();
