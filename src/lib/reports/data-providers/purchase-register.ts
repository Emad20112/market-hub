/**
 * Vortex ERP — مزود بيانات سجل المشتريات (Purchase Register Data Provider)
 * المرحلة 2: REP-010
 *
 * يستعلم من View 'purchase_register' مباشرة في خادم PostgreSQL،
 * مع دعم الترقيم والفلترة وحساب الإجماليات للموردين والأصناف.
 */

import { supabase } from '@/integrations/supabase/client';
import { resolveDateRangeBoundaries, round2 } from '../rules';
import {
  PurchaseRegisterFilterSchema,
  type PurchaseRegisterFilters,
} from './filter-schemas';
import type { IDataProvider, ReportExecutionRequest, ReportExecutionResult } from './types';

export interface PurchaseRegisterRow {
  invoice_item_id: string;
  invoice_id: string;
  invoice_number: string;
  created_at: string;
  supplier_id: string | null;
  status: string;
  product_id: string | null;
  item_name: string | null;
  item_name_ar: string | null;
  sku: string | null;
  quantity: number;
  unit_cost: number;
  discount: number;
  tax: number;
  total: number;
  line_type: string;
  stock_effect: string;
  increases_inventory: boolean;
}

export class PurchaseRegisterDataProvider
  implements IDataProvider<PurchaseRegisterFilters, PurchaseRegisterRow>
{
  id = 'dp-purchase-register';
  dataSourceName = 'purchase_register';

  async execute(
    request: ReportExecutionRequest<PurchaseRegisterFilters>
  ): Promise<ReportExecutionResult<PurchaseRegisterRow>> {
    const filters = PurchaseRegisterFilterSchema.parse(request.filters || {});
    const page = request.pagination?.page ?? 1;
    const pageSize = request.pagination?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('purchase_register')
      .select('*', { count: 'exact' });

    if (filters.startDate || filters.endDate) {
      const boundaries = resolveDateRangeBoundaries(filters.startDate, filters.endDate);
      if (filters.startDate) {
        query = query.gte('created_at', boundaries.startIso);
      }
      if (filters.endDate) {
        query = query.lte('created_at', boundaries.endIso);
      }
    }

    if (filters.supplierId) {
      query = query.eq('supplier_id', filters.supplierId);
    }

    if (filters.productId) {
      query = query.eq('product_id', filters.productId);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    } else {
      query = query.neq('status', 'cancelled');
    }

    if (filters.search?.trim()) {
      const s = filters.search.trim();
      query = query.or(`invoice_number.ilike.%${s}%,item_name.ilike.%${s}%,sku.ilike.%${s}%`);
    }

    const sortField = request.sort?.field || 'created_at';
    const ascending = request.sort?.order === 'asc';
    query = query.order(sortField, { ascending });

    const { data, count, error } = await query.range(from, to);

    if (error) {
      throw new Error(`[PurchaseRegisterDataProvider] Failed to fetch purchases: ${error.message}`);
    }

    const rows = (data || []) as PurchaseRegisterRow[];
    const totalCount = count ?? rows.length;

    let grossPurchases = 0;
    let itemDiscounts = 0;
    let netPurchases = 0;
    let totalTax = 0;
    let totalQuantity = 0;

    for (const row of rows) {
      const rowQty = Number(row.quantity) || 0;
      const rowCost = Number(row.unit_cost) || 0;
      const rowDiscount = Number(row.discount) || 0;
      const rowTax = Number(row.tax) || 0;
      const rowTotal = Number(row.total) || 0;

      grossPurchases += rowQty * rowCost;
      itemDiscounts += rowDiscount;
      netPurchases += rowTotal;
      totalTax += rowTax;
      totalQuantity += rowQty;
    }

    grossPurchases = round2(grossPurchases);
    itemDiscounts = round2(itemDiscounts);
    netPurchases = round2(netPurchases);
    totalTax = round2(totalTax);
    totalQuantity = round2(totalQuantity);

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      reportId: request.reportId,
      executedAt: new Date().toISOString(),
      totalRowCount: totalCount,
      rows,
      metrics: {
        totalRowCount: totalCount,
        totalQuantity,
        grossPurchases,
        itemDiscounts,
        netPurchases,
        totalTax,
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
