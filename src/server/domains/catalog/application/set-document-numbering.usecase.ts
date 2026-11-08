/**
 * Use Case: set_document_numbering — المرحلة 2.
 * مطابق للدالة القديمة public.fn_set_document_numbering (012):
 *  - actor owner/manager، وثق الترقيم معروف، صف scope='global' موجود.
 *  - حارس قيمة البدء: أكبر رقم صادر فعليًا لكل نوع مستند (استخراج رقمي من النص)،
 *    ويُرفض أي بدء <= ذلك الرقم بنفس رسالة الأصل.
 *  - setval(seq, n, false) ثم تحديث الصف بدمج COALESCE وcurrent_value = n-1.
 *  - سجل تدقيق في backup_logs (best-effort) بنفس بنية الأصل.
 */
import type { PoolClient } from "pg";
import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
} from "@/server/shared/errors/domain-error";
import type { ServerSession } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { hasRole } from "@/server/domains/identity/infrastructure/identity.repository";

export interface DocumentNumberingInput {
  documentType: string;
  prefix?: string | null;
  formatTokens?: string | null;
  padding?: number | null;
  datePart?: string | null;
  separator?: string | null;
  resetPolicy?: string | null;
  nextValue?: number | null;
}

export interface DocumentNumberingRow {
  id: string;
  document_type: string;
  section: string;
  scope: string;
  prefix: string;
  format_tokens: string;
  padding: number;
  date_part: string;
  separator: string;
  reset_policy: string;
  current_value: string | number;
  sequence_name: string;
  updated_at: string;
}

/** أكبر رقم صادر فعليًا — مطابق للـ CASE في الأصل. */
const MAX_SQL_BY_TYPE: Record<string, string> = {
  sales_invoice:
    "SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\\D', '', 'g'), '')::bigint), 0) AS m FROM public.sales_invoices",
  purchase_invoice:
    "SELECT COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\\D', '', 'g'), '')::bigint), 0) AS m FROM public.purchase_invoices",
  sales_return:
    "SELECT COALESCE(MAX(NULLIF(regexp_replace(return_number, '\\D', '', 'g'), '')::bigint), 0) AS m FROM public.sales_returns",
  purchase_return:
    "SELECT COALESCE(MAX(NULLIF(regexp_replace(return_number, '\\D', '', 'g'), '')::bigint), 0) AS m FROM public.purchase_returns",
  stock_transfer:
    "SELECT COALESCE(MAX(NULLIF(regexp_replace(transfer_number, '\\D', '', 'g'), '')::bigint), 0) AS m FROM public.stock_transfers",
};

export async function setDocumentNumbering(
  session: ServerSession,
  input: DocumentNumberingInput,
): Promise<DocumentNumberingRow> {
  return withTransaction(async (tx: PoolClient) => {
    const isOwner = await hasRole(tx, session.userId, "owner");
    const isManager = await hasRole(tx, session.userId, "manager");
    if (!isOwner && !isManager) throw new AuthorizationError("Forbidden");

    const { rows: seqRows } = await tx.query<{ sequence_name: string | null }>(
      "SELECT public.fn_document_numbering_sequence_name($1) AS sequence_name",
      [input.documentType],
    );
    const seqName = seqRows[0]?.sequence_name;
    if (!seqName) {
      throw new BusinessRuleError(`Unknown document type: ${input.documentType}`);
    }

    const { rows: cfgRows } = await tx.query<DocumentNumberingRow>(
      "SELECT * FROM public.document_numbering WHERE document_type = $1 AND scope = 'global' FOR UPDATE",
      [input.documentType],
    );
    const row = cfgRows[0];
    if (!row) {
      throw new NotFoundError("numbering configuration", input.documentType);
    }

    if (input.nextValue !== undefined && input.nextValue !== null) {
      if (input.nextValue < 0) {
        throw new BusinessRuleError("Starting number cannot be negative");
      }
      const maxSql = MAX_SQL_BY_TYPE[input.documentType];
      if (maxSql) {
        const { rows: maxRows } = await tx.query<{ m: string }>(maxSql);
        const max = Number(maxRows[0]?.m ?? 0);
        if (input.nextValue <= max) {
          throw new BusinessRuleError(
            `Starting number ${input.nextValue} is not greater than an existing number (${max}). Choose a value above ${max}.`,
          );
        }
      }
      await tx.query(
        `SELECT setval('${seqName.replace(/'/g, "''")}', ${Math.trunc(input.nextValue)}, false)`,
      );
    }

    const { rows: updated } = await tx.query<DocumentNumberingRow>(
      `UPDATE public.document_numbering SET
          prefix        = COALESCE($2, prefix),
          format_tokens = COALESCE($3, format_tokens),
          padding       = COALESCE($4, padding),
          date_part     = COALESCE($5, date_part),
          separator     = COALESCE($6, separator),
          reset_policy  = COALESCE($7, reset_policy),
          current_value = CASE WHEN $8::bigint IS NOT NULL THEN $8::bigint - 1 ELSE current_value END,
          updated_at    = now()
        WHERE id = $1
       RETURNING *`,
      [
        row.id,
        input.prefix ?? null,
        input.formatTokens ?? null,
        input.padding ?? null,
        input.datePart ?? null,
        input.separator ?? null,
        input.resetPolicy ?? null,
        input.nextValue ?? null,
      ],
    );

    // سجل تدقيق best-effort (نفس بنية الأصل؛ تجاهل غياب الجدول/الأعمدة).
    try {
      await tx.query(
        `INSERT INTO public.backup_logs (log_type, status, message, details)
         VALUES ('settings', 'success', $1, $2::jsonb)`,
        [
          `Document numbering updated: ${input.documentType}`,
          JSON.stringify({
            document_type: input.documentType,
            next_value: input.nextValue ?? null,
            prefix: updated[0].prefix,
            format_tokens: updated[0].format_tokens,
            padding: updated[0].padding,
            date_part: updated[0].date_part,
            actor: session.userId,
          }),
        ],
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "42P01" || code === "42703") {
        // جدول/عمود غير موجود — الأصل كان يتجاهل بصمت.
      } else {
        throw err;
      }
    }

    return updated[0];
  });
}
