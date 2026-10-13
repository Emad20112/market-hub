/**
 * Vortex ERP — عقود وأنواع سجل التقارير (Report Registry Contracts)
 * المرحلة 3: REP-012
 */

export type ReportDomain =
  | 'sales'
  | 'purchases'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'operations_audit';

export type ReportViewTemplateType =
  | 'summary'
  | 'detailed_table'
  | 'movement_statement'
  | 'grouped_ranking'
  | 'comparison'
  | 'status_exceptions';

export type ColumnDataType =
  | 'text'
  | 'code'
  | 'money'
  | 'quantity'
  | 'percentage'
  | 'date'
  | 'datetime'
  | 'status_badge'
  | 'action_link';

export type FilterControlType =
  | 'date_range'
  | 'warehouse_select'
  | 'customer_select'
  | 'supplier_select'
  | 'product_select'
  | 'category_select'
  | 'payment_method_select'
  | 'invoice_status_select'
  | 'text_search'
  | 'boolean_toggle';

export interface ReportColumnDefinition {
  key: string;
  labelAr: string;
  labelEn: string;
  dataType: ColumnDataType;
  essential?: boolean;
  defaultVisible: boolean;
  align?: 'right' | 'left' | 'center';
  aggregate?: 'sum' | 'avg' | 'count' | 'none';
  unit?: string;
  exportable?: boolean;
  groupAr?: string;
  groupEn?: string;
}

export interface ReportFilterDefinition {
  key: string;
  controlType: FilterControlType;
  labelAr: string;
  labelEn: string;
  required: boolean;
  defaultValue?: unknown;
  optionsSource?: string;
  placeholderAr?: string;
}

export interface ReportMetricDefinition {
  key: string;
  labelAr: string;
  labelEn: string;
  format: 'money' | 'quantity' | 'percentage' | 'integer';
  descriptionAr?: string;
  calculationRuleAr: string;
}

export interface ReportExportCapabilities {
  pdfTemplate: 'summary' | 'detailed' | 'movement';
  excelMultiSheet: boolean;
  csvSupported: boolean;
  directPrintSlip: boolean;
}

export interface ReportDefinition {
  id: string; // مثال: 'rep-sales-product'
  domain: ReportDomain;
  viewTemplate: ReportViewTemplateType;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;

  // مزود البيانات ومصدر الحقيقة
  dataProviderId: string;
  dataSourceName: string;
  rowGrainAr: string; // ما يمثله الصف (مثل: بند فاتورة بيع)
  defaultSortField: string;
  defaultSortOrder: 'asc' | 'desc';

  // العقود والعناصر
  filters: ReportFilterDefinition[];
  columns: ReportColumnDefinition[];
  metrics: ReportMetricDefinition[];

  // إمكانات التصدير
  exportCapabilities: ReportExportCapabilities;

  // الصلاحيات (اختياري)
  requiredPermission?: string;
}
