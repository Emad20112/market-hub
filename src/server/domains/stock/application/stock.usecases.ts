/**
 * Use Cases: المخزون — المرحلة 4.
 * post_opening_stock، post_stock_adjustment، create/update_opening_balance،
 * set_company_costing_method — مطابقة لدوال 006/009 الأصلية حرفيًا (التحقق،
 * الترتيب، رسائل الرفض).
 *
 * اعتماديات انتقالية موثقة في DECISIONS-LOG:
 *  - create_journal_entry (المحاسبة) — حتى المرحلة 9.
 *  - item_effective_policy — تبقى في القاعدة (تستخدمها سياسات RLS).
 */
import type { PoolClient } from "pg";
import { AuthorizationError, BusinessRuleError } from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { hasRole } from "@/server/domains/identity/infrastructure/identity.repository";
import { applyCostMovement, postStockDelta } from "./engine";
import {
  createJournalEntryInner,
  reverseJournalEntryInner,
} from "@/server/domains/accounting/application/accounting.usecases";
import {
  deleteOpeningLines,
  fixAdjustmentMovementReason,
  insertAudit,
  insertCostingPolicyHistory,
  insertOpeningBalanceDocument,
  insertOpeningBalanceLine,
  insertStockAdjustment,
  insertStockAdjustmentItem,
  insertStockOpening,
  insertStockOpeningItem,
  insertStockTransfer,
  insertStockTransferItem,
  itemNatureAndPolicy,
  lockCostingSettings,
  lockOpeningDocument,
  nextStockAdjustmentNumber,
  nextStockOpeningNumber,
  nextTransferNumber,
  OPENING_SECTIONS,
  roundN,
  sectionSide,
  stockItemClassCode,
  updateCostingSettings,
  updateOpeningDocument,
  updateStockAdjustmentTotal,
  updateStockOpeningTotal,
  anyCompanyStockOrCostLayers,
  isStaff,
  type OpeningLineInput,
} from "../infrastructure/stock.repository";

async function assertAnyRole(
  tx: PoolClient,
  session: ServerSession,
  roles: string[],
  message: string,
): Promise<void> {
  for (const r of roles) {
    if (await hasRole(tx, session.userId, r)) return;
  }
  throw new AuthorizationError(message);
}

async function itemEffectivePolicy(tx: PoolClient, productId: string): Promise<string> {
  const { rows } = await tx.query<{ policy: string }>(
    "SELECT public.item_effective_policy($1::uuid)::text AS policy",
    [productId],
  );
  return rows[0].policy;
}

// ── post_opening_stock ─────────────────────────────────────────────────────

export interface OpeningStockLineInput {
  productId: string;
  quantity: number;
  unitCost: number;
  note?: string | null;
}

/** التنفيذ الداخلي داخل معاملة ممرّرة — للتغليف العام وللاختبار. */
export async function postOpeningStockInner(
  tx: PoolClient,
  actorId: string,
  input: {
    warehouseId: string;
    effectiveDate?: string | null;
    note?: string | null;
    items: OpeningStockLineInput[];
  },
): Promise<string> {
  const session: ServerSession = {
    userId: actorId,
    claims: { sub: actorId, role: "authenticated" },
  };
  await assertAnyRole(
    tx,
    session,
    ["owner", "manager", "warehouse", "accountant"],
    "You are not permitted to post opening stock",
  );
  if (!input.warehouseId) throw new BusinessRuleError("Warehouse is required");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BusinessRuleError("Opening stock requires at least one item");
  }

  // التحقق الكامل قبل كتابة رأس المستند (كما في الأصل)
  for (const line of input.items) {
    if (!line.productId || line.quantity === null || line.quantity <= 0) {
      throw new BusinessRuleError("Every opening line requires an item and a positive quantity");
    }
    if (line.unitCost < 0) throw new BusinessRuleError("Unit cost cannot be negative");
    const { nature } = await itemNatureAndPolicy(tx, line.productId);
    if (nature === null) {
      throw new BusinessRuleError(`Item ${line.productId} does not exist`);
    }
    if (nature === "SERVICE") {
      throw new BusinessRuleError(
        `Item ${line.productId} is a SERVICE and cannot hold an inventory balance`,
      );
    }
    const policy = await itemEffectivePolicy(tx, line.productId);
    if (policy !== "TRACKED") {
      throw new BusinessRuleError(
        `Item ${line.productId} has inventory policy ${policy}, so it cannot receive an opening balance (only TRACKED items can)`,
      );
    }
  }

  const number = await nextStockOpeningNumber(tx);
  const openingId = await insertStockOpening(tx, {
    number,
    warehouseId: input.warehouseId,
    effectiveDate: input.effectiveDate ?? null,
    note: input.note ?? null,
    createdBy: session.userId,
  });

  let total = 0;
  for (const line of input.items) {
    const lineTotal = roundN(line.quantity * line.unitCost, 2);
    total += lineTotal;
    await insertStockOpeningItem(tx, {
      openingId,
      productId: line.productId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      totalCost: lineTotal,
      note: line.note ?? null,
    });
    await postStockDelta(tx, {
      productId: line.productId,
      warehouseId: input.warehouseId,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: line.quantity,
      unitCost: line.unitCost,
      movementKind: "OPENING",
      sourceType: "stock_opening",
      sourceId: openingId,
      note: line.note ?? "رصيد أول المدة",
      actorId: session.userId,
      movementTypeLegacy: "opening",
    });
  }

  await updateStockOpeningTotal(tx, openingId, total);
  await insertAudit(tx, {
    actorId: session.userId,
    action: "stock_opening.posted",
    entityType: "stock_opening",
    entityId: openingId,
    payload: {
      document_number: number,
      warehouse_id: input.warehouseId,
      effective_date: input.effectiveDate ?? null,
      lines: input.items.length,
      total_value: total,
    },
  });
  return openingId;
}

/** الغلاف العام: يفتح معاملة واحدة ويستدعي المنطق الداخلي. */
export async function postOpeningStock(
  session: ServerSession,
  input: {
    warehouseId: string;
    effectiveDate?: string | null;
    note?: string | null;
    items: OpeningStockLineInput[];
  },
): Promise<{ openingId: string }> {
  return withTransaction((tx) =>
    postOpeningStockInner(tx, session.userId, input).then((openingId) => ({ openingId })),
  );
}

// ── post_stock_adjustment ──────────────────────────────────────────────────

export interface AdjustmentLineInput {
  productId: string;
  /** موقعة: موجب يزيد، سالب ينقص. */
  quantity: number;
  unitCost: number;
  note?: string | null;
}

export async function postStockAdjustment(
  session: ServerSession,
  input: {
    warehouseId: string;
    reason: string;
    note?: string | null;
    effectiveDate?: string | null;
    items: AdjustmentLineInput[];
  },
): Promise<{ adjustmentId: string }> {
  return withTransaction(async (tx) => {
    await assertAnyRole(
      tx,
      session,
      ["owner", "manager", "warehouse", "accountant"],
      "You are not permitted to post stock adjustments",
    );
    if (!input.warehouseId) throw new BusinessRuleError("Warehouse is required");
    if (!input.reason || input.reason.trim() === "") {
      throw new BusinessRuleError("A documented reason is required for every stock adjustment");
    }
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new BusinessRuleError("A stock adjustment requires at least one item");
    }

    for (const line of input.items) {
      if (!line.productId || line.quantity === null || line.quantity === 0) {
        throw new BusinessRuleError(
          "Every adjustment line requires an item and a non-zero quantity",
        );
      }
      const { nature } = await itemNatureAndPolicy(tx, line.productId);
      if (nature === null) {
        throw new BusinessRuleError(`Item ${line.productId} does not exist`);
      }
      if (nature === "SERVICE") {
        throw new BusinessRuleError(
          `Item ${line.productId} is a SERVICE and has no inventory to adjust`,
        );
      }
      const policy = await itemEffectivePolicy(tx, line.productId);
      if (policy !== "TRACKED") {
        throw new BusinessRuleError(
          `Item ${line.productId} has inventory policy ${policy}, so it has no inventory balance to adjust`,
        );
      }
    }

    const number = await nextStockAdjustmentNumber(tx);
    const adjustmentId = await insertStockAdjustment(tx, {
      number,
      warehouseId: input.warehouseId,
      effectiveDate: input.effectiveDate ?? null,
      reason: input.reason.trim(),
      note: input.note ?? null,
      createdBy: session.userId,
    });

    let total = 0;
    // سطور القيد تُجمع هنا وتُرحَّل عبر create_journal_entry (انتقالي — المرحلة 9)
    const journalLines: Array<Record<string, unknown>> = [];

    for (const line of input.items) {
      const lineTotal = roundN(Math.abs(line.quantity) * line.unitCost, 2);
      total += lineTotal;
      const stockCode = await stockItemClassCode(tx, line.productId);

      await insertStockAdjustmentItem(tx, {
        adjustmentId,
        productId: line.productId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        totalCost: lineTotal,
        note: line.note ?? null,
      });

      await postStockDelta(tx, {
        productId: line.productId,
        warehouseId: input.warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: line.quantity,
        unitCost: line.unitCost,
        movementKind: "ADJUSTMENT",
        sourceType: "stock_adjustment",
        sourceId: adjustmentId,
        note: line.note ?? input.reason.trim(),
        actorId: session.userId,
        movementTypeLegacy: "adjustment",
      });

      if (line.quantity < 0) {
        journalLines.push({
          account_code: "5921",
          debit: lineTotal,
          memo: `نقص جرد — ${input.reason.trim()}`,
        });
        journalLines.push({ account_code: stockCode, credit: lineTotal, memo: "مخزون" });
      } else {
        journalLines.push({ account_code: stockCode, debit: lineTotal, memo: "فائض جرد" });
        journalLines.push({
          account_code: "5911",
          credit: lineTotal,
          memo: `فائض جرد — ${input.reason.trim()}`,
        });
      }
    }

    // قيد قاعدة البيانات يشترط سببًا موثقًا لكل حركة تسوية.
    await fixAdjustmentMovementReason(tx, adjustmentId, input.reason.trim());
    await updateStockAdjustmentTotal(tx, adjustmentId, total);

    // T-09: قيد التسوية في الأستاذ — استدعاء انتقالي لدالة المحاسبة (المرحلة 9)
    let journalEntryId: string | null = null;
    if (total > 0 && journalLines.length >= 2) {
      const { rows } = await tx.query<{ entry: string }>(
        `SELECT public.create_journal_entry($1, COALESCE($2::date, CURRENT_DATE), 'stock_adjustment', $3::uuid, true, $4::jsonb) AS entry`,
        [
          `تسوية مخزون ${number}`,
          input.effectiveDate ?? null,
          adjustmentId,
          JSON.stringify(journalLines),
        ],
      );
      journalEntryId = rows[0]?.entry ?? null;
    }

    await insertAudit(tx, {
      actorId: session.userId,
      action: "stock_adjustment.posted",
      entityType: "stock_adjustment",
      entityId: adjustmentId,
      payload: {
        document_number: number,
        warehouse_id: input.warehouseId,
        reason: input.reason.trim(),
        effective_date: input.effectiveDate ?? null,
        lines: input.items.length,
        total_value: total,
        journal_entry_id: journalEntryId,
      },
    });
    return { adjustmentId };
  });
}

// ── create_opening_balance / update_opening_balance ───────────────────────

function validateOpeningLine(l: OpeningLineInput): void {
  if (!OPENING_SECTIONS.includes(l.section as (typeof OPENING_SECTIONS)[number])) {
    throw new BusinessRuleError(`Unknown opening section: ${l.section}`);
  }
  const amount = l.amount ?? 0;
  if (amount <= 0) {
    throw new BusinessRuleError(`Line amount must be greater than zero (section ${l.section})`);
  }
  if (l.section === "STOCK" && (!l.productId || !l.warehouseId || (l.quantity ?? 0) <= 0)) {
    throw new BusinessRuleError(
      "Stock opening line requires an item, warehouse and positive quantity",
    );
  }
  if (l.section === "RECEIVABLE" && !l.customerId) {
    throw new BusinessRuleError("Receivable opening line requires a customer");
  }
  if (l.section === "PAYABLE" && !l.supplierId) {
    throw new BusinessRuleError("Payable opening line requires a supplier");
  }
}

async function assertOpeningRole(
  tx: PoolClient,
  session: ServerSession,
  verb: "open" | "edit",
): Promise<void> {
  for (const r of ["owner", "manager", "accountant"]) {
    if (await hasRole(tx, session.userId, r)) return;
  }
  throw new AuthorizationError(
    verb === "open"
      ? "Only an owner, manager or accountant may open the books"
      : "Only an owner, manager or accountant may edit opening balances",
  );
}

function parseOpeningLines(lines: unknown): OpeningLineInput[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new BusinessRuleError("An opening entry needs at least one line");
  }
  return lines as OpeningLineInput[];
}

export async function createOpeningBalance(
  session: ServerSession,
  input: { effectiveDate: string; lines: unknown; notes?: string | null },
): Promise<{ documentId: string }> {
  return withTransaction(async (tx) => {
    await assertOpeningRole(tx, session, "open");
    if (!input.effectiveDate) throw new BusinessRuleError("Effective date is required");
    const lines = parseOpeningLines(input.lines);

    const { rows: seqRows } = await tx.query<{ n: string }>(
      "SELECT 'OB-' || to_char($1::date, 'YYYYMMDD') || '-' || lpad(nextval('public.opening_balance_seq')::text, 3, '0') AS n",
      [input.effectiveDate],
    );
    const number = seqRows[0].n;
    const documentId = await insertOpeningBalanceDocument(tx, {
      number,
      effectiveDate: input.effectiveDate,
      notes: input.notes ?? null,
      createdBy: session.userId,
    });

    for (const l of lines) {
      validateOpeningLine(l);
      await insertOpeningBalanceLine(tx, documentId, l, sectionSide(l.section));
    }
    return { documentId };
  });
}

export async function updateOpeningBalance(
  session: ServerSession,
  input: { documentId: string; effectiveDate: string; lines: unknown; notes?: string | null },
): Promise<{ documentId: string }> {
  return withTransaction(async (tx) => {
    await assertOpeningRole(tx, session, "edit");
    if (!input.effectiveDate) throw new BusinessRuleError("Effective date is required");
    const lines = parseOpeningLines(input.lines);

    const doc = await lockOpeningDocument(tx, input.documentId);
    if (!doc || doc.status !== "DRAFT") {
      throw new BusinessRuleError("Only a draft opening document can be edited");
    }

    await updateOpeningDocument(tx, {
      documentId: input.documentId,
      effectiveDate: input.effectiveDate,
      notes: input.notes ?? null,
    });
    await deleteOpeningLines(tx, input.documentId);

    for (const l of lines) {
      validateOpeningLine(l);
      await insertOpeningBalanceLine(tx, input.documentId, l, sectionSide(l.section));
    }
    return { documentId: input.documentId };
  });
}

// ── set_company_costing_method ─────────────────────────────────────────────

export async function setCompanyCostingMethod(
  session: ServerSession,
  input: { method: string; source?: string | null; notes?: string | null },
): Promise<{ changed: boolean }> {
  return withTransaction(async (tx) => {
    const ownerOk =
      (await hasRole(tx, session.userId, "owner")) ||
      (await hasRole(tx, session.userId, "manager"));
    if (!ownerOk) {
      throw new AuthorizationError(
        "Only an owner or manager can change the company costing method",
      );
    }

    const method = (input.method ?? "").trim().toUpperCase();
    if (method !== "MOVING_AVERAGE") {
      throw new BusinessRuleError(
        "Only MOVING_AVERAGE is currently available. FIFO valuation layers and standard cost variance posting are not complete.",
      );
    }

    const old = await lockCostingSettings(tx);
    if (old === null) {
      throw new BusinessRuleError("Company costing settings row is missing");
    }
    if (old === "MOVING_AVERAGE") return { changed: false };

    if (await anyCompanyStockOrCostLayers(tx)) {
      throw new BusinessRuleError(
        "Cannot switch the saved costing method while company stock or non-zero cost layers exist. Reconcile the balances before changing the valuation method.",
      );
    }

    await updateCostingSettings(tx, { notes: input.notes ?? null, updatedBy: session.userId });
    await insertCostingPolicyHistory(tx, {
      previous: old,
      notes: input.notes ?? null,
      changedBy: session.userId,
    });
    return { changed: true };
  });
}

// ── post_opening_balance (نقل كامل — 13.2) ──────────────────────────────────

/** التنفيذ الداخلي داخل معاملة ممرّرة — كما الأصل حرفيًا (009). */
export async function postOpeningBalanceInner(
  tx: PoolClient,
  session: ServerSession,
  documentId: string,
): Promise<string> {
  const userId = session.userId;
  let ok = false;
  for (const r of ["owner", "manager", "accountant"]) {
    if (await hasRole(tx, userId, r)) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    throw new AuthorizationError("Only an owner, manager or accountant may post opening balances");
  }

  const doc = await lockOpeningDocument(tx, documentId);
  if (!doc) throw new BusinessRuleError("Opening document not found");
  if (doc.status !== "DRAFT") {
    throw new BusinessRuleError(`Document ${doc.documentNumber} is already ${doc.status}`);
  }

  const { rows: sums } = await tx.query<{
    debit: string;
    credit: string;
    capital: string;
  }>(
    `SELECT coalesce(sum(amount) FILTER (WHERE side = 'DEBIT'), 0)::text AS debit,
            coalesce(sum(amount) FILTER (WHERE side = 'CREDIT'), 0)::text AS credit,
            coalesce(sum(amount) FILTER (WHERE section = 'CAPITAL'), 0)::text AS capital
       FROM public.opening_balance_lines WHERE document_id = $1::uuid`,
    [documentId],
  );
  const debit = Number(sums[0].debit);
  const credit = Number(sums[0].credit);
  const capital = Number(sums[0].capital);
  if (debit !== credit) {
    const f = (v: number) => v.toFixed(2);
    throw new BusinessRuleError(
      `Opening entry does not balance: debits ${f(debit)} vs credits ${f(credit)} (difference ${f(debit - credit)}).`,
    );
  }

  const { rows: lines } = await tx.query<Record<string, unknown>>(
    "SELECT * FROM public.opening_balance_lines WHERE document_id = $1::uuid ORDER BY id",
    [documentId],
  );

  const jl: Array<{
    account_code: string;
    debit?: number;
    credit?: number;
    memo?: string;
  }> = [];
  for (const l of lines) {
    const section = l.section as string;
    const amount = Number(l.amount);
    const description = (l.description as string) ?? "";
    const memo = `رصيد افتتاحي — ${description}`;
    if (section === "STOCK") {
      const productId = l.product_id as string;
      const warehouseId = l.warehouse_id as string;
      const qty = Number(l.quantity);
      const unitCost = Number(l.unit_cost) || 0;
      const note = `رصيد افتتاحي ${doc.documentNumber}`;
      await postStockDelta(tx, {
        productId,
        warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: qty,
        unitCost,
        movementKind: "OPENING" as const,
        sourceType: "opening_balance",
        sourceId: documentId,
        note,
        actorId: userId,
        movementTypeLegacy: "opening",
      });
      await applyCostMovement(tx, {
        productId,
        warehouseId,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: qty,
        unitCost,
        movementKind: "OPENING" as const,
        sourceType: "opening_balance",
        sourceId: documentId,
        note,
        actorId: userId,
      });
      const { rows: acct } = await tx.query<{ code: string | null }>(
        `SELECT coalesce($2::text,
           CASE p.item_class WHEN 'RAW_MATERIAL' THEN '1311' WHEN 'BY_PRODUCT' THEN '1314' ELSE '1313' END) AS code
           FROM public.products p WHERE p.id = $1::uuid`,
        [productId, (l.ledger_account_code as string) ?? null],
      );
      jl.push({ account_code: acct[0].code!, debit: roundN(amount, 2), memo });
    } else if (section === "RECEIVABLE") {
      await tx.query(
        `INSERT INTO public.customer_ledger
           (customer_id, entry_type, debit, credit, reference_id, reference_type, occurred_at, created_by, note)
         VALUES ($1::uuid, 'adjustment', $2::numeric, 0, $3::uuid, 'opening_balance',
           $4::date::timestamptz, $5::uuid, $6)`,
        [
          l.customer_id,
          amount,
          documentId,
          doc.effectiveDate,
          userId,
          `رصيد افتتاحي ${doc.documentNumber}`,
        ],
      );
      jl.push({
        account_code: (l.ledger_account_code as string) ?? "1211",
        debit: roundN(amount, 2),
        memo,
      });
    } else if (section === "PAYABLE") {
      await tx.query(
        "UPDATE public.suppliers SET balance = coalesce(balance, 0) + $2::numeric WHERE id = $1::uuid",
        [l.supplier_id, amount],
      );
      const { rows: bal } = await tx.query<{ balance: string }>(
        "SELECT balance::text AS balance FROM public.suppliers WHERE id = $1::uuid",
        [l.supplier_id],
      );
      await tx.query(
        `INSERT INTO public.supplier_ledger
           (supplier_id, entry_type, debit, credit, balance_after, reference_type, reference_id,
            occurred_at, source_key, note, created_by)
         VALUES ($1::uuid, 'OPENING_BALANCE', 0, $2::numeric, $3::numeric, 'opening_balance', $4::uuid,
           $5::date::timestamptz, $6, $7, $8::uuid)
         ON CONFLICT (source_key) DO NOTHING`,
        [
          l.supplier_id,
          amount,
          bal[0]?.balance ?? "0",
          documentId,
          doc.effectiveDate,
          `OB-${documentId}-${l.id}`,
          `رصيد افتتاحي ${doc.documentNumber}`,
          userId,
        ],
      );
      jl.push({
        account_code: (l.ledger_account_code as string) ?? "2111",
        credit: roundN(amount, 2),
        memo,
      });
    } else {
      const fallback =
        section === "CASH"
          ? "1101"
          : section === "BANK"
            ? "1111"
            : section === "ASSET"
              ? "1411"
              : section === "LIABILITY"
                ? "2111"
                : section === "CAPITAL"
                  ? "3111"
                  : null;
      const account = (l.ledger_account_code as string) ?? fallback;
      if (!account) {
        throw new BusinessRuleError(`No ledger account mapping for ${section}`);
      }
      jl.push({
        account_code: account,
        ...(l.side === "DEBIT" ? { debit: roundN(amount, 2) } : { credit: roundN(amount, 2) }),
        memo,
      });
    }
  }

  const journalId = await createJournalEntryInner(tx, session, {
    memo: `رصيد افتتاحي ${doc.documentNumber}`,
    entryDate: doc.effectiveDate,
    sourceType: "opening_balance",
    sourceId: documentId,
    isSystem: true,
    lines: jl,
  });

  await tx.query(
    `UPDATE public.opening_balance_documents
        SET total_assets = $2::numeric, total_liabilities = $3::numeric,
            capital_required = $4::numeric, status = 'POSTED',
            posted_by = $5::uuid, posted_at = now()
      WHERE id = $1::uuid`,
    [documentId, debit, credit - capital, debit - credit + capital, userId],
  );
  await insertAudit(tx, {
    actorId: userId,
    action: "opening_balance.posted",
    entityType: "opening_balance",
    entityId: documentId,
    payload: {
      document_number: doc.documentNumber,
      debits: debit,
      credits: credit,
      journal_entry_id: journalId,
    },
  });
  return documentId;
}

export function postOpeningBalance(
  session: ServerSession,
  documentId: string,
): Promise<{ documentId: string }> {
  return withTransaction((tx) =>
    postOpeningBalanceInner(tx, session, documentId).then((documentId) => ({ documentId })),
  );
}

// ── reverse_opening_balance (نقل كامل — 13.2) ───────────────────────────────

/** التنفيذ الداخلي داخل معاملة ممرّرة — كما الأصل حرفيًا (009). */
export async function reverseOpeningBalanceInner(
  tx: PoolClient,
  session: ServerSession,
  input: { documentId: string; reason: string },
): Promise<string> {
  const userId = session.userId;
  let ok = false;
  for (const r of ["owner", "manager", "accountant"]) {
    if (await hasRole(tx, userId, r)) {
      ok = true;
      break;
    }
  }
  if (!ok) {
    throw new AuthorizationError(
      "Only an owner, manager or accountant may reverse opening balances",
    );
  }
  const reason = input.reason?.trim() ?? "";
  if (reason === "") {
    throw new BusinessRuleError("Reversing an opening entry requires a reason");
  }
  const doc = await lockOpeningDocument(tx, input.documentId);
  if (!doc || doc.status !== "POSTED") {
    throw new BusinessRuleError("Only a posted opening document can be reversed");
  }

  const { rows: newRows } = await tx.query<{ id: string }>(
    `INSERT INTO public.opening_balance_documents
       (document_number, effective_date, status, fiscal_year, reverses_document_id,
        notes, created_by, posted_at, posted_by)
     VALUES ('OBR-' || $2, $3::date, 'POSTED', $4, $1::uuid,
       $5, $6::uuid, now(), $6::uuid)
     RETURNING id`,
    [
      input.documentId,
      doc.documentNumber,
      doc.effectiveDate,
      doc.fiscalYear,
      `عكس القيد الافتتاحي ${doc.documentNumber}: ${reason}`,
      userId,
    ],
  );
  const newId = newRows[0].id;

  await tx.query(
    `INSERT INTO public.opening_balance_lines
       (document_id, section, side, ref_type, ref_id, product_id, warehouse_id,
        customer_id, supplier_id, description, quantity, unit_cost, amount, ledger_account_code)
     SELECT $2::uuid, section, CASE WHEN side = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
       ref_type, ref_id, product_id, warehouse_id, customer_id, supplier_id,
       'عكس: ' || description, quantity, unit_cost, amount, ledger_account_code
       FROM public.opening_balance_lines WHERE document_id = $1::uuid`,
    [input.documentId, newId],
  );

  const { rows: lines } = await tx.query<Record<string, unknown>>(
    "SELECT * FROM public.opening_balance_lines WHERE document_id = $1::uuid ORDER BY id",
    [input.documentId],
  );

  for (const l of lines) {
    const section = l.section as string;
    const amount = Number(l.amount);
    if (section === "STOCK") {
      const note = `عكس رصيد افتتاحي ${doc.documentNumber}`;
      await postStockDelta(tx, {
        productId: l.product_id as string,
        warehouseId: l.warehouse_id as string,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: -Number(l.quantity),
        unitCost: Number(l.unit_cost) || 0,
        movementKind: "ADJUSTMENT" as const,
        sourceType: "opening_balance_reversal",
        sourceId: newId,
        note,
        actorId: userId,
        movementTypeLegacy: "opening",
      });
      await applyCostMovement(tx, {
        productId: l.product_id as string,
        warehouseId: l.warehouse_id as string,
        ownerType: "COMPANY",
        ownerId: null,
        signedQty: -Number(l.quantity),
        unitCost: null,
        movementKind: "ADJUSTMENT" as const,
        sourceType: "opening_balance_reversal",
        sourceId: newId,
        note,
        actorId: userId,
      });
    } else if (section === "RECEIVABLE") {
      await tx.query(
        `INSERT INTO public.customer_ledger
           (customer_id, entry_type, debit, credit, reference_id, reference_type, occurred_at, created_by, note)
         VALUES ($1::uuid, 'adjustment', 0, $2::numeric, $3::uuid, 'opening_balance_reversal',
           now(), $4::uuid, $5)`,
        [l.customer_id, amount, newId, userId, `عكس رصيد افتتاحي ${doc.documentNumber}`],
      );
    } else if (section === "PAYABLE") {
      await tx.query(
        "UPDATE public.suppliers SET balance = coalesce(balance, 0) - $2::numeric WHERE id = $1::uuid",
        [l.supplier_id, amount],
      );
      const { rows: bal } = await tx.query<{ balance: string }>(
        "SELECT balance::text AS balance FROM public.suppliers WHERE id = $1::uuid",
        [l.supplier_id],
      );
      await tx.query(
        `INSERT INTO public.supplier_ledger
           (supplier_id, entry_type, debit, credit, balance_after, reference_type, reference_id,
            occurred_at, source_key, note, created_by)
         VALUES ($1::uuid, 'OPENING_BALANCE', $2::numeric, 0, $3::numeric, 'opening_balance_reversal', $4::uuid,
           now(), $5, $6, $7::uuid)
         ON CONFLICT (source_key) DO NOTHING`,
        [
          l.supplier_id,
          amount,
          bal[0]?.balance ?? "0",
          newId,
          `OBR-${input.documentId}-${l.id}`,
          `عكس رصيد افتتاحي ${doc.documentNumber}: ${reason}`,
          userId,
        ],
      );
    }
  }

  const { rows: jr } = await tx.query<{ id: string }>(
    `SELECT id FROM public.journal_entries
      WHERE source_type = 'opening_balance' AND source_id = $1::uuid AND status = 'POSTED'
      FOR UPDATE`,
    [input.documentId],
  );
  if (jr[0]) {
    await reverseJournalEntryInner(tx, session, { entryId: jr[0].id, reason });
  }

  await tx.query(
    "UPDATE public.opening_balance_documents SET status = 'REVERSED' WHERE id = $1::uuid",
    [input.documentId],
  );
  await insertAudit(tx, {
    actorId: userId,
    action: "opening_balance.reversed",
    entityType: "opening_balance",
    entityId: input.documentId,
    payload: {
      reversal_document_id: newId,
      journal_entry_id: jr[0]?.id ?? null,
      reason,
    },
  });
  return newId;
}

export function reverseOpeningBalance(
  session: ServerSession,
  input: { documentId: string; reason: string },
): Promise<{ reversalDocumentId: string }> {
  return withTransaction((tx) =>
    reverseOpeningBalanceInner(tx, session, input).then((reversalDocumentId) => ({
      reversalDocumentId,
    })),
  );
}

// ── create_stock_transfer (نقل كامل — 13.2) ─────────────────────────────────

interface StockTransferLineInput {
  productId: string;
  quantity: number;
}

/** التنفيذ الداخلي داخل معاملة ممرّرة — كما الأصل حرفيًا (006). */
export async function createStockTransferInner(
  tx: PoolClient,
  session: ServerSession,
  input: { from: string; to: string; note?: string | null; items: StockTransferLineInput[] },
): Promise<string> {
  const userId = session.userId;
  if (!(await isStaff(tx, userId))) throw new AuthorizationError("Forbidden");
  if (input.from === input.to) {
    throw new BusinessRuleError("Source and destination must differ");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BusinessRuleError("No items");
  }

  // فحص مسبق لكل الأسطر: طبيعة الصنف، السياسة الفعلية، والرصيد (كما في الأصل).
  for (const l of input.items) {
    if (!l.productId || l.quantity === null || l.quantity === undefined || l.quantity <= 0) {
      throw new BusinessRuleError("Invalid transfer quantity");
    }
    const { nature } = await itemNatureAndPolicy(tx, l.productId);
    if (nature === "SERVICE") {
      throw new BusinessRuleError(`Item ${l.productId} is a SERVICE and cannot be transferred`);
    }
    if ((await itemEffectivePolicy(tx, l.productId)) !== "TRACKED") {
      throw new BusinessRuleError(
        `Item ${l.productId} is not a tracked item and cannot be transferred between warehouses`,
      );
    }
    const { rows: stock } = await tx.query<{ quantity: string | null }>(
      `SELECT i.quantity::text AS quantity FROM public.inventory i
        WHERE i.product_id = $1::uuid AND i.warehouse_id = $2::uuid
          AND i.owner_type = 'COMPANY' AND i.owner_id IS NULL`,
      [l.productId, input.from],
    );
    if (Number(stock[0]?.quantity ?? 0) < l.quantity) {
      throw new BusinessRuleError(`Insufficient stock for item ${l.productId}`);
    }
  }

  const transferNumber = await nextTransferNumber(tx);
  const transferId = await insertStockTransfer(tx, {
    transferNumber,
    fromWarehouseId: input.from,
    toWarehouseId: input.to,
    note: input.note?.trim() || null,
    createdBy: userId,
  });

  for (const l of input.items) {
    await insertStockTransferItem(tx, { transferId, productId: l.productId, quantity: l.quantity });

    await postStockDelta(tx, {
      productId: l.productId,
      warehouseId: input.from,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: -l.quantity,
      unitCost: null,
      movementKind: "TRANSFER_OUT",
      sourceType: "stock_transfer",
      sourceId: transferId,
      note: "Transfer out",
      actorId: userId,
      movementTypeLegacy: "transfer_out",
    });
    await postStockDelta(tx, {
      productId: l.productId,
      warehouseId: input.to,
      ownerType: "COMPANY",
      ownerId: null,
      signedQty: l.quantity,
      unitCost: null,
      movementKind: "TRANSFER_IN",
      sourceType: "stock_transfer",
      sourceId: transferId,
      note: "Transfer in",
      actorId: userId,
      movementTypeLegacy: "transfer_in",
    });
  }

  await insertAudit(tx, {
    actorId: userId,
    action: "stock_transfer.posted",
    entityType: "stock_transfer",
    entityId: transferId,
    payload: {
      transfer_number: transferNumber,
      from_warehouse_id: input.from,
      to_warehouse_id: input.to,
      line_count: input.items.length,
    },
  });

  return transferId;
}

export function createStockTransfer(
  session: ServerSession,
  input: { from: string; to: string; note?: string | null; items: StockTransferLineInput[] },
): Promise<{ transferId: string }> {
  return withTransaction((tx) =>
    createStockTransferInner(tx, session, input).then((transferId) => ({ transferId })),
  );
}
