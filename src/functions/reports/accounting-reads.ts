/** Transport — المرحلة 12: دليل الحسابات وكشف المورد (استبدال RPCs القرائية). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  chartOfAccounts,
  supplierLedgerStatement,
} from "@/server/domains/reports/application/reports.usecases";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const chartOfAccountsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rows = await chartOfAccounts(sessionFromContext(context));
    return rows as Array<Record<string, JsonValue>>;
  });

export const supplierStatementFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      supplierId: z.string().uuid(),
      startDate: z.string().nullable().optional(),
      endDate: z.string().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const rows = await supplierLedgerStatement(sessionFromContext(context), {
      supplierId: data.supplierId,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
    });
    return rows as Array<Record<string, JsonValue>>;
  });
