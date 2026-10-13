/**
 * Vortex ERP — سجل تعريفات التقارير المركزي (Central Report Registry)
 * المرحلة 3: REP-015
 *
 * يحتوي على السجل المركزي لتعريفات التقارير التجارية،
 * ويبدأ بتسجيل التقريرين التجريبيين (Pilot):
 * 1. rep-sales-product (تقرير المبيعات حسب المنتج - نمط ترتيبي/تجميعي)
 * 2. rep-inventory-item-card (كشف حركة صنف مخزني - نمط كشف حركة مع رصيد لحظي)
 */

import type { ReportDefinition, ReportDomain } from '../types';
import { COMMON_REPORT_FILTERS } from './filter-registry';

export const REPORT_SALES_PRODUCT: ReportDefinition = {
  id: 'rep-sales-product',
  domain: 'sales',
  viewTemplate: 'grouped_ranking',
  titleAr: 'تقرير المبيعات حسب المنتج',
  titleEn: 'Sales by Product Report',
  descriptionAr: 'تحليل مبيعات الأصناف والكميات المباعة وهوامش الربحية ونسب المساهمة التجارية.',
  dataProviderId: 'dp-sales-register',
  dataSourceName: 'sales_register',
  rowGrainAr: 'مبيعات منتج مجمعة خلال الفترة',
  defaultSortField: 'net_sales',
  defaultSortOrder: 'desc',

  filters: [
    COMMON_REPORT_FILTERS.dateRange,
    COMMON_REPORT_FILTERS.customer,
    COMMON_REPORT_FILTERS.product,
    COMMON_REPORT_FILTERS.paymentMethod,
    COMMON_REPORT_FILTERS.search,
  ],

  columns: [
    {
      key: 'sku',
      labelAr: 'رمز الصنف (SKU)',
      labelEn: 'SKU',
      dataType: 'code',
      essential: true,
      defaultVisible: true,
      align: 'right',
    },
    {
      key: 'item_name_ar',
      labelAr: 'اسم الصنف',
      labelEn: 'Item Name',
      dataType: 'text',
      essential: true,
      defaultVisible: true,
      align: 'right',
    },
    {
      key: 'quantity',
      labelAr: 'الكمية المباعة',
      labelEn: 'Quantity Sold',
      dataType: 'quantity',
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
    },
    {
      key: 'gross_sales',
      labelAr: 'إجمالي المبيعات',
      labelEn: 'Gross Sales',
      dataType: 'money',
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
      unit: 'ر.س',
    },
    {
      key: 'discounts',
      labelAr: 'الخصومات',
      labelEn: 'Discounts',
      dataType: 'money',
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
      unit: 'ر.س',
    },
    {
      key: 'net_sales',
      labelAr: 'صافي المبيعات',
      labelEn: 'Net Sales',
      dataType: 'money',
      essential: true,
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
      unit: 'ر.س',
    },
    {
      key: 'total_cost',
      labelAr: 'تكلفة البضاعة المباعة',
      labelEn: 'COGS',
      dataType: 'money',
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
      unit: 'ر.س',
    },
    {
      key: 'gross_margin',
      labelAr: 'هامش الربح',
      labelEn: 'Gross Margin',
      dataType: 'money',
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
      unit: 'ر.س',
    },
    {
      key: 'margin_percentage',
      labelAr: 'نسبة الهامش',
      labelEn: 'Margin %',
      dataType: 'percentage',
      defaultVisible: true,
      align: 'left',
      unit: '%',
    },
  ],

  metrics: [
    {
      key: 'totalQuantity',
      labelAr: 'إجمالي الكميات المباعة',
      labelEn: 'Total Quantity',
      format: 'quantity',
      calculationRuleAr: 'مجموع كميات كافة الأصناف المباعة',
    },
    {
      key: 'grossSales',
      labelAr: 'إجمالي المبيعات الخام',
      labelEn: 'Gross Sales',
      format: 'money',
      calculationRuleAr: 'الكمية × سعر البيع قبل الخصم',
    },
    {
      key: 'itemDiscounts',
      labelAr: 'إجمالي الخصومات',
      labelEn: 'Total Discounts',
      format: 'money',
      calculationRuleAr: 'مجموع خصومات البنود',
    },
    {
      key: 'netSales',
      labelAr: 'صافي المبيعات',
      labelEn: 'Net Sales',
      format: 'money',
      calculationRuleAr: 'إجمالي المبيعات - الخصومات الممنوحة',
    },
    {
      key: 'totalCost',
      labelAr: 'إجمالي تكلفة المبيعات',
      labelEn: 'Total COGS',
      format: 'money',
      calculationRuleAr: 'مجموع تكلفة البنود من sales_register.line_cost',
    },
    {
      key: 'grossMargin',
      labelAr: 'هامش المساهمة الإجمالي',
      labelEn: 'Gross Margin',
      format: 'money',
      calculationRuleAr: 'صافي المبيعات - تكلفة المبيعات',
    },
    {
      key: 'marginPercentage',
      labelAr: 'متوسط نسبة الهامش',
      labelEn: 'Margin %',
      format: 'percentage',
      calculationRuleAr: '(هامش المساهمة / صافي المبيعات) × 100',
    },
  ],

  exportCapabilities: {
    pdfTemplate: 'summary',
    excelMultiSheet: true,
    csvSupported: true,
    directPrintSlip: false,
  },
};

export const REPORT_INVENTORY_ITEM_CARD: ReportDefinition = {
  id: 'rep-inventory-item-card',
  domain: 'inventory',
  viewTemplate: 'movement_statement',
  titleAr: 'كشف حركة صنف مخزني (بطاقة الصنف)',
  titleEn: 'Item Movement Card',
  descriptionAr: 'كشف حركة تفصيلي يوضح الحركات الواردة والمنصرفة مع الرصيد اللحظي المتسلسل.',
  dataProviderId: 'dp-inventory-movements',
  dataSourceName: 'stock_movements',
  rowGrainAr: 'حركة مخزنية واردة أو منصرفة مع رصيد متسلسل',
  defaultSortField: 'created_at',
  defaultSortOrder: 'asc',

  filters: [
    COMMON_REPORT_FILTERS.dateRange,
    {
      ...COMMON_REPORT_FILTERS.product,
      required: true, // بطاقة الصنف تتطلب اختيار الصنف
    },
    COMMON_REPORT_FILTERS.warehouse,
  ],

  columns: [
    {
      key: 'created_at',
      labelAr: 'التاريخ والوقت',
      labelEn: 'Date & Time',
      dataType: 'datetime',
      essential: true,
      defaultVisible: true,
      align: 'right',
    },
    {
      key: 'movement_type',
      labelAr: 'نوع الحركة',
      labelEn: 'Movement Type',
      dataType: 'status_badge',
      essential: true,
      defaultVisible: true,
      align: 'center',
    },
    {
      key: 'reference',
      labelAr: 'المرجع / السند',
      labelEn: 'Reference',
      dataType: 'code',
      defaultVisible: true,
      align: 'right',
    },
    {
      key: 'warehouse_name',
      labelAr: 'المستودع',
      labelEn: 'Warehouse',
      dataType: 'text',
      defaultVisible: true,
      align: 'right',
    },
    {
      key: 'inbound_quantity',
      labelAr: 'وارد (+)',
      labelEn: 'Inbound (+)',
      dataType: 'quantity',
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
    },
    {
      key: 'outbound_quantity',
      labelAr: 'صادر (-)',
      labelEn: 'Outbound (-)',
      dataType: 'quantity',
      defaultVisible: true,
      align: 'left',
      aggregate: 'sum',
    },
    {
      key: 'running_balance',
      labelAr: 'الرصيد اللحظي',
      labelEn: 'Running Balance',
      dataType: 'quantity',
      essential: true,
      defaultVisible: true,
      align: 'left',
    },
    {
      key: 'note',
      labelAr: 'ملاحظات',
      labelEn: 'Notes',
      dataType: 'text',
      defaultVisible: false,
      align: 'right',
    },
  ],

  metrics: [
    {
      key: 'openingBalance',
      labelAr: 'الرصيد الافتتاحي',
      labelEn: 'Opening Balance',
      format: 'quantity',
      calculationRuleAr: 'رصيد الحركات السابقة لتاريخ البداية',
    },
    {
      key: 'totalInbound',
      labelAr: 'إجمالي الوارد',
      labelEn: 'Total Inbound',
      format: 'quantity',
      calculationRuleAr: 'مجموع الحركات التي تزيد المخزون خلال الفترة',
    },
    {
      key: 'totalOutbound',
      labelAr: 'إجمالي الصادر',
      labelEn: 'Total Outbound',
      format: 'quantity',
      calculationRuleAr: 'مجموع الحركات التي تنقص المخزون خلال الفترة',
    },
    {
      key: 'closingBalance',
      labelAr: 'الرصيد الختامي',
      labelEn: 'Closing Balance',
      format: 'quantity',
      calculationRuleAr: 'الافتتاحي + إجمالي الوارد - إجمالي الصادر',
    },
  ],

  exportCapabilities: {
    pdfTemplate: 'movement',
    excelMultiSheet: false,
    csvSupported: true,
    directPrintSlip: true,
  },
};

// السجل المركزي لجميع التقارير
const REPORT_DEFINITIONS: ReportDefinition[] = [
  REPORT_SALES_PRODUCT,
  REPORT_INVENTORY_ITEM_CARD,
];

export class ReportRegistry {
  private static reports: Map<string, ReportDefinition> = new Map(
    REPORT_DEFINITIONS.map((r) => [r.id, r])
  );

  static register(definition: ReportDefinition): void {
    this.reports.set(definition.id, definition);
  }

  static get(id: string): ReportDefinition | undefined {
    return this.reports.get(id);
  }

  static getByDomain(domain: ReportDomain): ReportDefinition[] {
    return Array.from(this.reports.values()).filter((r) => r.domain === domain);
  }

  static getAll(): ReportDefinition[] {
    return Array.from(this.reports.values());
  }
}

export * from './filter-registry';
export * from './column-bridge';
