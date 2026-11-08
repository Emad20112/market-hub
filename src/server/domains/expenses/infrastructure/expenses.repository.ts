/**
 * مستودع المصاريف — المرحلة 10a (ADR-004: SQL داخل infrastructure فقط).
 * يعيد إنتاج دوال 010 المساعدة الحاسمة حرفيًا: expense_can/expense_assert_capability،
 * expense_round، expense_settlement_status، expense_line_net،
 * expense_line_production_base_amount، expense_required_approval_rank،
 * expense_log_action، expense_write_supplier_ledger، expense_posting_account_code.
 */
import type { PoolClient } from "pg";
import { roundN } from "@/server/domains/stock/infrastructure/stock.repository";

export async function isStaff(tx: PoolClient, userId: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>("SELECT public.is_staff($1::uuid) AS ok", [
    userId,
  ]);
  return rows[0]?.ok === true;
}

export async function expenseRoleRank(tx: PoolClient, userId: string): Promise<number> {
  const { rows } = await tx.query<{ r: number }>("SELECT public.expense_role_rank($1::uuid) AS r", [
    userId,
  ]);
  return Number(rows[0]?.r ?? 0);
}

/** نفس جدول الصلاحيات حرفيًا (010). */
export async function expenseCan(
  tx: PoolClient,
  userId: string,
  capability: string,
): Promise<boolean> {
  if (!(await isStaff(tx, userId))) return false;
  const rank = await expenseRoleRank(tx, userId);
  const thresholds: Record<string, number> = {
    "expense.view": 10,
    "expense.create": 10,
    "expense.edit": 10,
    "expense.submit": 10,
    "expense.approve": 40,
    "expense.reject": 40,
    "expense.post": 30,
    "expense.pay": 20,
    "expense.reverse": 30,
    "expense.cancel": 40,
    "expense.category.manage": 40,
    "expense.dimension.manage": 40,
    "expense.report": 30,
    "expense.payment.reverse": 30,
  };
  const min = thresholds[capability];
  return min !== undefined && rank >= min;
}

export async function expenseAssertCapability(
  tx: PoolClient,
  userId: string,
  capability: string,
): Promise<void> {
  if (!(await expenseCan(tx, userId, capability))) {
    throw new Error(`Forbidden: ${capability} requires a higher role`);
  }
}

/** expense_round: منزلتان، تقريب numeric في PostgreSQL (نصف للأعلى بعيدًا عن الصفر)
 *  بلا انزلاق فاصلة: حساب عشري نصي (1.005 → 1.01 كما ينتظر المحاسب). */
export function expenseRound(value: number | null | undefined): number {
  const v = value ?? 0;
  const sign = v < 0 ? -1 : 1;
  const s = Math.abs(v).toFixed(10); // تكفي 10 خانات عشرية لكل مدخلات مالية
  const [intPart, fracPart = ""] = s.split(".");
  const kept = fracPart.slice(0, 2);
  const rest = fracPart.slice(2);
  const up = rest.length > 0 && Number(rest) >= 5;
  let keptNum = Number(kept) + (up ? 1 : 0);
  let intNum = Number(intPart);
  if (keptNum >= 100) {
    keptNum -= 100;
    intNum += 1;
  }
  return sign * (intNum + keptNum / 100);
}

/** expense_settlement_status حرفيًا (>= من جهة السداد، > على الصفر). */
export function expenseSettlementStatus(
  current: string,
  paid: number | null,
  total: number | null,
): string {
  if (!["POSTED", "PARTIALLY_PAID", "PAID"].includes(current)) return current;
  if ((total ?? 0) <= 0) return current;
  if ((paid ?? 0) <= 0) return "POSTED";
  if ((paid ?? 0) >= (total ?? 0) - 0.005) return "PAID";
  return "PARTIALLY_PAID";
}

/** expense_line_net حرفيًا (INCLUSIVE/EXCLUSIVE/NONE). */
export function expenseLineNet(gross: number, taxRate: number, mode: string): number {
  if (mode === "INCLUSIVE") {
    if (taxRate === 100) return gross;
    return expenseRound(gross / (1 + taxRate / 100));
  }
  return gross;
}

/** expense_line_production_base_amount حرفيًا. */
export function expenseLineProductionBaseAmount(
  netAmount: number,
  taxAmount: number,
  taxRecoverable: boolean,
): number {
  return taxRecoverable ? netAmount : netAmount + taxAmount;
}

export async function expenseRequiredApprovalRank(tx: PoolClient, amount: number): Promise<number> {
  const { rows } = await tx.query<{ r: number }>(
    `SELECT coalesce(max(r.required_role_rank), 0) AS r
       FROM public.expense_approval_rules r
      WHERE r.min_amount <= $1::numeric`,
    [amount],
  );
  return Number(rows[0]?.r ?? 0);
}

/** expense_log_action حرفيًا: تسلسل الموافقات + سجل التدقيق العام. */
export async function expenseLogAction(
  tx: PoolClient,
  args: {
    entryId: string;
    action: string;
    from: string;
    to: string;
    reason?: string | null;
    actor?: string | null;
  },
): Promise<void> {
  const actor = args.actor ?? null;
  const { rows } = await tx.query<{ n: number }>(
    "SELECT coalesce(max(sequence), 0) + 1 AS n FROM public.expense_approvals WHERE entry_id = $1::uuid",
    [args.entryId],
  );
  await tx.query(
    `INSERT INTO public.expense_approvals (
       entry_id, sequence, action, from_status, to_status, actor_id, reason
     )
     VALUES ($1::uuid, $2, $3, $4::public.expense_status, $5::public.expense_status, $6::uuid,
             nullif(btrim(coalesce($7, '')), ''))`,
    [args.entryId, rows[0].n, args.action, args.from, args.to, actor, args.reason ?? null],
  );
  await tx.query(
    `INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
     VALUES ($1::uuid, $2, 'expense_entry', $3::uuid, $4::jsonb)`,
    [
      actor,
      `expense.${args.action}`,
      args.entryId,
      JSON.stringify({ from: args.from, to: args.to, reason: args.reason ?? null }),
    ],
  );
}

export async function expensePostingAccountCode(tx: PoolClient, role: string): Promise<string> {
  const expectedType =
    role === "INPUT_TAX"
      ? "ASSET"
      : role === "SUPPLIER_PAYABLE" || role === "EMPLOYEE_PAYABLE" || role === "OTHER_PAYABLE"
        ? "LIABILITY"
        : null;
  if (expectedType === null) {
    throw new Error(`Unknown expense ledger role: ${role}`);
  }
  const { rows } = await tx.query<{ code: string | null }>(
    `SELECT a.code
       FROM public.expense_ledger_account_mappings m
       JOIN public.accounts a ON a.id = m.account_id
      WHERE m.role = $1 AND a.account_type::text = $2 AND a.is_active AND a.is_postable`,
    [role, expectedType],
  );
  const code = rows[0]?.code ?? null;
  if (!code) {
    throw new Error(
      `Configure an active, postable ${expectedType} account in Expense Setup before posting`,
    );
  }
  return code;
}

/** expense_write_supplier_ledger حرفيًا: قفل استشاري على الرصيد التراكمي + صف دفتر. */
export async function expenseWriteSupplierLedger(
  tx: PoolClient,
  args: {
    supplierId: string | null;
    entryType: string;
    side: "CREDIT" | "DEBIT";
    amount: number;
    referenceType: string;
    referenceId: string;
    sourceKey: string;
    dueDate?: string | null;
    occurredAt?: Date | null;
    note?: string | null;
    actor?: string | null;
  },
): Promise<void> {
  if (args.supplierId === null || args.sourceKey === null) return;
  const amount = expenseRound(args.amount);
  if (amount <= 0) return;
  if (!["CREDIT", "DEBIT"].includes(args.side)) {
    throw new Error("Supplier ledger side must be CREDIT or DEBIT");
  }

  // الحجز على ترتيب الرصيد التراكمي: دفتر المورد يُقرأ تسلسلياً في الكشف.
  await tx.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('supplier_ledger:' || $1::text, 0))",
    [args.supplierId],
  );

  const { rows } = await tx.query<{ balance: string | null }>(
    `UPDATE public.suppliers
        SET balance = public.expense_round(coalesce(balance, 0) ${args.side === "CREDIT" ? "+" : "-"} $2::numeric),
            updated_at = now()
      WHERE id = $1::uuid
      RETURNING balance::text AS balance`,
    [args.supplierId, amount],
  );
  if (!rows[0]) {
    throw new Error(`Supplier ${args.supplierId} not found`);
  }
  const newBalance = Number(rows[0].balance);

  await tx.query(
    `INSERT INTO public.supplier_ledger (
       supplier_id, entry_type, debit, credit, balance_after,
       reference_type, reference_id, due_date, occurred_at, created_by, source_key, note
     )
     VALUES ($1::uuid, $2, $3::numeric, $4::numeric, $5::numeric, $6, $7::uuid, $8::date,
             $9, $10::uuid, $11, $12)
     ON CONFLICT (source_key) DO NOTHING`,
    [
      args.supplierId,
      args.entryType,
      args.side === "DEBIT" ? amount : 0,
      args.side === "CREDIT" ? amount : 0,
      newBalance,
      args.referenceType,
      args.referenceId,
      args.dueDate ?? null,
      args.occurredAt ?? new Date(),
      args.actor ?? null,
      args.sourceKey,
      args.note ?? null,
    ],
  );
}

/** expense_reverse_supplier_ledger حرفيًا. */
export async function expenseReverseSupplierLedger(
  tx: PoolClient,
  args: {
    supplierId: string;
    sourceKey: string;
    referenceType: string;
    referenceId: string;
    reversalKey: string;
    note?: string | null;
    actor?: string | null;
  },
): Promise<void> {
  const { rows } = await tx.query<{
    debit: string;
    credit: string;
    entry_type: string;
    due_date: string | null;
    note: string | null;
  }>(
    `SELECT debit::text, credit::text, entry_type::text, due_date::text, note
       FROM public.supplier_ledger
      WHERE supplier_id = $1::uuid AND source_key = $2`,
    [args.supplierId, args.sourceKey],
  );
  const src = rows[0];
  if (!src) return;
  await expenseWriteSupplierLedger(tx, {
    supplierId: args.supplierId,
    entryType: src.entry_type,
    side: Number(src.credit) > 0 ? "DEBIT" : "CREDIT",
    amount: Number(src.credit) > 0 ? Number(src.credit) : Number(src.debit),
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    sourceKey: args.reversalKey,
    dueDate: src.due_date,
    note: args.note ?? src.note,
    actor: args.actor ?? null,
  });
}
