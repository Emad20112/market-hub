/** Transport — المرحلة 13.2: حفظ أبعاد المصاريف (استبدال save_expense_dimension).
 *  نفس العقد حرفيًا (010): kind ∈ {cost_center, project}، الإرجاع jsonb الصف،
 *  والصلاحية expense.dimension.manage (rank ≥ 40) عبر expenseAssertCapability. */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import { withTransaction } from "@/server/shared/db/transaction";
import { expenseAssertCapability } from "@/server/domains/expenses/infrastructure/expenses.repository";
import type { JsonValue } from "@/functions/expenses/expense-transitions";

const inputSchema = z.object({
  kind: z.enum(["cost_center", "project"]),
  id: z.string().uuid().nullable().optional(),
  code: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  nameAr: z.string().nullable().optional(),
  isActive: z.boolean().nullable().optional(),
});

export const saveExpenseDimensionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(inputSchema.parse)
  .handler(async ({ data, context }) => {
    const session = sessionFromContext(context);
    return withTransaction(async (tx) => {
      await expenseAssertCapability(tx, session.userId, "expense.dimension.manage");

      const name = (data.name ?? "").trim() || null;
      const code = (data.code ?? "").trim() || null;
      const nameAr = (data.nameAr ?? "").trim() || null;
      const isCreate = data.id == null;

      if (isCreate && name === null) {
        throw new Error("A name is required");
      }

      let row: JsonValue | null = null;
      if (data.kind === "cost_center") {
        if (isCreate) {
          const { rows } = await tx.query(
            `INSERT INTO public.expense_cost_centers (code, name, name_ar, is_active, created_by)
             VALUES ($1, $2, $3, COALESCE($4, true), $5::uuid)
             RETURNING to_jsonb(expense_cost_centers.*) AS row`,
            [code, name, nameAr, data.isActive ?? null, session.userId],
          );
          row = rows[0]?.row ?? null;
        } else {
          const { rows } = await tx.query(
            `UPDATE public.expense_cost_centers
                SET code      = CASE WHEN $2::text IS NULL THEN code ELSE $2::text END,
                    name      = COALESCE($3::text, name),
                    name_ar   = CASE WHEN $4::text IS NULL THEN name_ar
                                     ELSE nullif(btrim($4::text), '') END,
                    is_active = COALESCE($5::boolean, is_active)
              WHERE id = $1::uuid
             RETURNING to_jsonb(expense_cost_centers.*) AS row`,
            [data.id, code, name, nameAr, data.isActive ?? null],
          );
          row = rows[0]?.row ?? null;
          if (!row) throw new Error("Cost centre not found");
        }
      } else {
        if (isCreate) {
          const { rows } = await tx.query(
            `INSERT INTO public.expense_projects (code, name, name_ar, is_active, created_by)
             VALUES ($1, $2, $3, COALESCE($4, true), $5::uuid)
             RETURNING to_jsonb(expense_projects.*) AS row`,
            [code, name, nameAr, data.isActive ?? null, session.userId],
          );
          row = rows[0]?.row ?? null;
        } else {
          const { rows } = await tx.query(
            `UPDATE public.expense_projects
                SET code      = CASE WHEN $2::text IS NULL THEN code ELSE $2::text END,
                    name      = COALESCE($3::text, name),
                    name_ar   = CASE WHEN $4::text IS NULL THEN name_ar
                                     ELSE nullif(btrim($4::text), '') END,
                    is_active = COALESCE($5::boolean, is_active)
              WHERE id = $1::uuid
             RETURNING to_jsonb(expense_projects.*) AS row`,
            [data.id, code, name, nameAr, data.isActive ?? null],
          );
          row = rows[0]?.row ?? null;
          if (!row) throw new Error("Project not found");
        }
      }

      const rowId =
        row && typeof row === "object" && !Array.isArray(row)
          ? ((row as { id?: string }).id ?? null)
          : null;
      await tx.query(
        `INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
         VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
        [
          session.userId,
          `expense.${data.kind}.${isCreate ? "created" : "updated"}`,
          `expense_${data.kind}`,
          rowId,
          JSON.stringify(row ?? {}),
        ],
      );

      return { ok: true as const, row: row as JsonValue | null };
    });
  });
