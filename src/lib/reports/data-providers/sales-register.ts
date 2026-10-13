/**
 * Vortex ERP — مزود بيانات سجل المبيعات (Sales Register Data Provider)
 * المرحلة 2: REP-008
 *
 * يستعلم من View 'sales_register' مباشرة في خادم PostgreSQL،
 * مع حساب تكلفة المبيعات عبر العمود المضمن 'line_cost'،
 * للقضاء التام على مشكلة استدعاء RPC في حلقات تكرارية (N+1 RPC).
 */

import { supabase } from '@/integrations/supabase/client';
import {
  calculateGrossMargin,
  calculateMarginPercentage,
  classifyCostBasis,
  resolveDateRangeBoundaries,
  round2,
} from '../rules';
import { SalesRegisterFilterSchema, type SalesRegisterFilters } from './filter-schemas';
import type { IDataProvider, ReportExecutionRequest, ReportExecutionResult } from './types';

export interface SalesRegisterRow {
  invoice_item_id: string;
  invoice_id: string;
  invoice_number: string;
  created_at: string;
  customer_id: string | null;
  status: string;
  payment_method: string | null;
  product_id: string | null;
  description: string | null;
  item_name: string | null;
  item_name_ar: string | null;
  sku: string | null;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  total: number;
  line_type: string;
  stock_effect: string;
  uom_id: string | null;
  line_cost: number | null;
}

export class SalesRegisterDataProvider implements IDataProvider<SalesRegisterFilters, SalesRegisterRow> {
  id = 'dp-sales-register';
  dataSourceName = 'sales_register';

  async execute(
    request: ReportExecutionRequest<SalesRegisterFilters>
  ): Promise<ReportExecutionResult<SalesRegisterRow>> {
    const filters = SalesRegisterFilterSchema.parse(request.filters || {});
    const page = request.pagination?.page ?? 1;
    const pageSize = request.pagination?.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('sales_register')
      .select('*', { count: 'exact' });

    // تصفية التاريخ مع نهاية اليوم الزمني
    if (filters.startDate || filters.endDate) {
      const boundaries = resolveDateRangeBoundaries(filters.startDate, filters.endDate);
      if (filters.startDate) {
        query = query.gte('created_at', boundaries.startIso);
      }
      if (filters.endDate) {
        query = query.lte('created_at', boundaries.endIso);
      }
    }

    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }

    if (filters.productId) {
      query = query.eq('product_id', filters.productId);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    } else {
      // افتراضياً استبعاد الفواتير الملغاة
      query = query.neq('status', 'cancelled');
    }

    if (filters.paymentMethod) {
      query = query.eq('payment_method', filters.paymentMethod);
    }

    if (filters.search?.trim()) {
      const s = filters.search.trim();
      query = query.or(`invoice_number.ilike.%${s}%,item_name.ilike.%${s}%,sku.ilike.%${s}%`);
    }

    // الترتيب
    const sortField = request.sort?.field || 'created_at';
    const ascending = request.sort?.order === 'asc';
    query = query.order(sortField, { ascending });

    // الترقيم الآمن في الخادم
    const { data, count, error } = await query.range(from, to);

    if (error) {
      throw new Error(`[SalesRegisterDataProvider] Failed to fetch sales data: ${error.message}`);
    }

    const rows = (data || []) as SalesRegisterRow[];
    const totalCount = count ?? rows.length;

    // حساب المؤشرات التلخيصية
    let grossSales = 0;
    let itemDiscounts = 0;
    let netSales = 0;
    let totalTax = 0;
    let totalCost = 0;
    let totalQuantity = 0;
    let hasActualCost = false;
    let hasZeroCost = false;

    for (const row of rows) {
      const rowQty = Number(row.quantity) || 0;
      const rowPrice = Number(row.unit_price) || 0;
      const rowDiscount = Number(row.discount) || 0;
      const rowTax = Number(row.tax) || 0;
      const rowTotal = Number(row.total) || 0;
      const rowCost = Number(row.line_cost) || 0;

      grossSales += rowQty * rowPrice;
      itemDiscounts += rowDiscount;
      netSales += rowTotal;
      totalTax += rowTax;
      totalCost += rowCost;
      totalQuantity += rowQty;

      if (rowCost > 0) {
        hasActualCost = true;
      } else {
        hasZeroCost = true;
      }
    }

    grossSales = round2(grossSales);
    itemDiscounts = round2(itemDiscounts);
    netSales = round2(netSales);
    totalTax = round2(totalTax);
    totalCost = round2(totalCost);
    totalQuantity = round2(totalQuantity);

    const grossMargin = calculateGrossMargin(netSales, totalCost);
    const marginPercentage = calculateMarginPercentage(grossMargin, netSales);

    const costBasisNotice = classifyCostBasis(
      hasActualCost ? 1 : 0,
      !hasActualCost && hasZeroCost ? 100 : 0
    );

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      reportId: request.reportId,
      executedAt: new Date().toISOString(),
      totalRowCount: totalCount,
      rows,
      metrics: {
        totalRowCount: totalCount,
        totalQuantity,
        grossSales,
        itemDiscounts,
        netSales,
        totalTax,
        totalCost,
        grossMargin,
        marginPercentage,
      },
      meta: {
        appliedFilters: filters,
        costBasisNotice,
        currencySymbol: 'ر.س',
        page,
        pageSize,
        totalPages,
      },
    };
  }
}
