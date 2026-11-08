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
import { postStockDelta } from "./engine";
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
  itemNatureAndPolicy,
  lockCostingSettings,
  lockOpeningDocument,
  nextStockAdjustmentNumber,
  nextStockOpeningNumber,
  OPENING_SECTIONS,
  roundN,
  sectionSide,
  stockItemClassCode,
  updateCostingSettings,
  updateOpeningDocument,
  updateStockAdjustmentTotal,
  updateStockOpeningTotal,
  anyCompanyStockOrCostLayers,
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
