/** Transport — المرحلة 12: قراءات المصاريف (استبدال list/detail/summary/report/lookups RPCs). */
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sessionFromContext } from "@/server/shared/auth/session";
import {
  expenseDetailReport,
  expenseLookupsReport,
  expenseReportGrouped,
  expenseSummaryReport,
  listExpensesReport,
  millingServiceCost,
} from "@/server/domains/reports/application/reports.usecases";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const filtersSchema = z.object({
  search: z.string().nullable().optional(),
  status: z.array(z.string()).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  costCenterId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  paymentState: z.string().nullable().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  amountMin: z.number().nullable().optional(),
  amountMax: z.number().nullable().optional(),
  categoryIds: z.array(z.string().uuid()).nullable().optional(),
  limit: z.number().int().nullable().optional(),
  cursorDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  cursorId: z.string().uuid().nullable().optional(),
});

export const listExpensesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(filtersSchema.parse)
  .handler(async ({ data, context }) => {
    const rows = await listExpensesReport(sessionFromContext(context), data);
    return rows as Array<Record<string, JsonValue>>;
  });

export const expenseDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ entryId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const detail = await expenseDetailReport(sessionFromContext(context), data.entryId);
    return (detail ?? null) as { [key: string]: JsonValue } | null;
  });

export const expenseSummaryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      dateFrom: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      dateTo: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      warehouseId: z.string().uuid().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const summary = await expenseSummaryReport(sessionFromContext(context), {
      dateFrom: data.dateFrom ?? null,
      dateTo: data.dateTo ?? null,
      warehouseId: data.warehouseId ?? null,
    });
    return (summary ?? null) as { [key: string]: JsonValue } | null;
  });

export const expenseReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      groupBy: z.enum([
        "category",
        "month",
        "warehouse",
        "cost_center",
        "project",
        "payee",
        "status",
      ]),
      dateFrom: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      dateTo: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      warehouseId: z.string().uuid().nullable().optional(),
      costCenterId: z.string().uuid().nullable().optional(),
      projectId: z.string().uuid().nullable().optional(),
      limit: z.number().int().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const rows = await expenseReportGrouped(sessionFromContext(context), {
      groupBy: data.groupBy,
      dateFrom: data.dateFrom ?? null,
      dateTo: data.dateTo ?? null,
      warehouseId: data.warehouseId ?? null,
      costCenterId: data.costCenterId ?? null,
      projectId: data.projectId ?? null,
      limit: data.limit ?? 200,
    });
    return rows as Array<Record<string, JsonValue>>;
  });

export const expenseLookupsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ includeArchived: z.boolean().optional() }).parse)
  .handler(async ({ data, context }) => {
    const lookups = await expenseLookupsReport(
      sessionFromContext(context),
      data.includeArchived === true,
    );
    return (lookups ?? null) as { [key: string]: JsonValue } | null;
  });

export const millingServiceCostFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      dateFrom: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      dateTo: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .optional(),
      costCenterId: z.string().uuid().nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const row = await millingServiceCost(sessionFromContext(context), {
      dateFrom: data.dateFrom ?? null,
      dateTo: data.dateTo ?? null,
      costCenterId: data.costCenterId ?? null,
    });
    return (row ?? null) as { [key: string]: JsonValue } | null;
  });
