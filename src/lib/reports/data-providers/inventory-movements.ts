/**
 * Vortex ERP — مزود بيانات حركات المخزون (Inventory Movements Data Provider)
 * المرحلة 2: REP-009
 *
 * يستعلم من جدول 'stock_movements' مع حساب الرصيد الافتتاحي
 * والفرز الحتمي (created_at ASC, id ASC) للرصيد التراكمي اللحظي.
 */

import { supabase } from '@/integrations/supabase/client';
import {
  calculateRunningInventoryMovements,
  isInboundMovement,
  mapDbMovementTypeToKind,
  resolveDateRangeBoundaries,
  round3,
  type RawStockMovement,
} from '../rules';
import {
  InventoryMovementsFilterSchema,
  type InventoryMovementsFilters,
} from './filter-schemas';
import type { IDataProvider, ReportExecutionRequest, ReportExecutionResult } from './types';

export interface InventoryMovementRow {
  id: string;
  product_id: string;
  warehouse_id: string;
  movement_type: string;
  quantity: number;
  inbound_quantity: number;
  outbound_quantity: number;
  running_balance: number;
  unit_cost: number | null;
  total_cost: number | null;
  reference: string | null;
  note: string | null;
  created_at: string;
  product_name?: string;
  product_name_ar?: string;
  sku?: string;
  warehouse_name?: string;
}

export class InventoryMovementsDataProvider
  implements IDataProvider<InventoryMovementsFilters, InventoryMovementRow>
{
  id = 'dp-inventory-movements';
  dataSourceName = 'stock_movements';

  async execute(
    request: ReportExecutionRequest<InventoryMovementsFilters>
  ): Promise<ReportExecutionResult<InventoryMovementRow>> {
    const filters = InventoryMovementsFilterSchema.parse(request.filters || {});
    const boundaries = resolveDateRangeBoundaries(filters.startDate, filters.endDate);

    // 1. حساب الرصيد الافتتاحي (Opening Balance) إذا وجد تاريخ بداية
    let openingBalance = 0;
    if (filters.startDate && filters.productId) {
      let openQuery = supabase
        .from('stock_movements')
        .select('movement_type, quantity')
        .eq('product_id', filters.productId)
        .lt('created_at', boundaries.startIso);

      if (filters.warehouseId) {
        openQuery = openQuery.eq('warehouse_id', filters.warehouseId);
      }

      const { data: priorMovements, error: openError } = await openQuery;
      if (!openError && priorMovements) {
        for (const m of priorMovements) {
          const qty = Math.abs(Number(m.quantity) || 0);
          if (isInboundMovement(m.movement_type, qty)) {
            openingBalance += qty;
          } else {
            openingBalance -= qty;
          }
        }
      }
    }

    openingBalance = round3(openingBalance);

    // 2. استعلام الحركات خلال الفترة المحددة
    let query = supabase
      .from('stock_movements')
      .select(`
        id,
        product_id,
        warehouse_id,
        movement_type,
        quantity,
        unit_cost,
        total_cost,
        reference,
        note,
        created_at,
        products (
          name,
          name_ar,
          sku
        ),
        warehouses (
          name
        )
      `)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (filters.productId) {
      query = query.eq('product_id', filters.productId);
    }

    if (filters.warehouseId) {
      query = query.eq('warehouse_id', filters.warehouseId);
    }

    if (filters.movementType) {
      query = query.eq('movement_type', filters.movementType as any);
    }

    if (filters.startDate) {
      query = query.gte('created_at', boundaries.startIso);
    }

    if (filters.endDate) {
      query = query.lte('created_at', boundaries.endIso);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`[InventoryMovementsDataProvider] Error querying movements: ${error.message}`);
    }

    const rawRows = (data || []) as any[];

    // تحويل البيانات لحساب الرصيد التراكمي
    const movementsForCalc: RawStockMovement[] = rawRows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      kind: mapDbMovementTypeToKind(r.movement_type, Number(r.quantity) || 0),
      quantity: Number(r.quantity) || 0,
    }));

    const calculatedMovements = calculateRunningInventoryMovements(movementsForCalc, openingBalance);

    let totalInbound = 0;
    let totalOutbound = 0;

    const rowsWithBalance: InventoryMovementRow[] = calculatedMovements.map((calc, idx) => {
      const orig = rawRows[idx];
      totalInbound += calc.inQty;
      totalOutbound += calc.outQty;

      return {
        id: calc.id,
        product_id: orig.product_id,
        warehouse_id: orig.warehouse_id,
        movement_type: orig.movement_type,
        quantity: Math.abs(calc.quantity),
        inbound_quantity: calc.inQty,
        outbound_quantity: calc.outQty,
        running_balance: calc.runningBalance,
        unit_cost: orig.unit_cost != null ? Number(orig.unit_cost) : null,
        total_cost: orig.total_cost != null ? Number(orig.total_cost) : null,
        reference: orig.reference ?? null,
        note: orig.note ?? null,
        created_at: calc.createdAt,
        product_name: orig.products?.name,
        product_name_ar: orig.products?.name_ar,
        sku: orig.products?.sku,
        warehouse_name: orig.warehouses?.name,
      };
    });

    totalInbound = round3(totalInbound);
    totalOutbound = round3(totalOutbound);
    const closingBalance =
      rowsWithBalance.length > 0
        ? rowsWithBalance[rowsWithBalance.length - 1].running_balance
        : openingBalance;

    const page = request.pagination?.page ?? 1;
    const pageSize = request.pagination?.pageSize ?? (rowsWithBalance.length || 50);
    const totalCount = rowsWithBalance.length;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const pagedRows = rowsWithBalance.slice((page - 1) * pageSize, page * pageSize);

    return {
      reportId: request.reportId,
      executedAt: new Date().toISOString(),
      totalRowCount: totalCount,
      rows: pagedRows,
      metrics: {
        openingBalance,
        totalInbound,
        totalOutbound,
        closingBalance,
        totalRowCount: totalCount,
      },
      meta: {
        appliedFilters: filters,
        currencySymbol: 'ر.س',
        page,
        pageSize,
        totalPages,
      },
    };
  }
}
