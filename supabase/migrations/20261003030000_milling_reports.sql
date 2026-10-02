-- ============================================================================
-- 20261003030000_milling_reports.sql
-- المرحلة 3: تقارير دخل المطحنة وكفاءة الاستخلاص
--
-- ROLLBACK
--   DROP VIEW IF EXISTS public.milling_efficiency_report;
--   DROP VIEW IF EXISTS public.milling_revenue_report;
--
-- ============================================================================
-- المشكلة التي يحلها (الوثيقة المرجوحة P2-1):
--   دخل المطحنة مختلط داخل المبيعات العامة. المحرك يسجّل line_type='SERVICE'
--   على بنود خدمة الطحن، لكن لا توجد شاشة تعرض:
--     (أ) كم دخلت من الطحن تحديداً، ومقابل كم طُحن فعلياً؟
--     (ب) كفاءة الاستخلاص الفعلية مقابل المتوقعة والمتعاقد عليها
--     (ج) الفاقد الزائد كم نسبة، وأين يتركّز
--
-- هذه تقارير قراءة فقط (security_invoker) — لا أثر على أي جدول،
-- ولا على باقي وحدات ERP. المبنية على sales_invoice_itemsyll التي
-- يسجلها محرك create_sale، فلا تكرر أي حساب.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. تقرير دخل المطحنة
-- ---------------------------------------------------------------------------
-- كل بند خدمة مرتبط بأمر مطحنة عبر sales_invoices.milling_job_id.
-- يُجمّع حسب نوع الخدمة والسنة/الشهر.
-- line_type='SERVICE' فقط: الأكياس (PKG-*) ليست دخل خدمات، بل بضاعة.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.milling_revenue_report AS
-- إصلاح 2026-10-03: الأعمدة الصحيحة في sales_invoices هي `warehouse_id`
  -- (لا store_id)، و`status` تعداد invoice_status ('draft','confirmed','paid',
  -- 'partial','cancelled','returned') — فلا مقارنة بنص 'returned' خاطئة.
  -- وagreement_number كان يشير إلى a.job_number وهو عمود غير موجود على
  -- جدول العقود؛ استُبدل بـ agreement_id.
  SELECT
  date_trunc('month', si.created_at)                       AS period_month,
  si.warehouse_id                                          AS store_id,
  w.name_ar                                               AS store_name_ar,
  si.customer_id,
  c.name_ar                                               AS customer_name_ar,
  j.job_number,
  a.id                                                    AS agreement_number,
  i.product_id,
  p.sku,
  p.name_ar                                               AS item_name_ar,
  i.line_type,
  i.stock_effect,
  sum(i.quantity)                                          AS quantity,
  sum(i.total)                                             AS net_total,
  sum(i.tax)                                               AS tax_total,
  count(*)                                                AS line_count
FROM public.sales_invoice_items i
JOIN public.sales_invoices si   ON si.id = i.invoice_id
LEFT JOIN public.milling_jobs j ON j.id = si.milling_job_id
LEFT JOIN public.milling_service_agreements a ON a.id = j.agreement_id
LEFT JOIN public.products p      ON p.id = i.product_id
LEFT JOIN public.customers c     ON c.id = si.customer_id
LEFT JOIN public.warehouses w    ON w.id = si.warehouse_id
  WHERE si.status NOT IN ('draft', 'cancelled', 'returned')
  AND i.line_type = 'SERVICE'
  AND (j.id IS NOT NULL OR a.id IS NOT NULL)   -- بنود الطحن فقط
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12;

COMMENT ON VIEW public.milling_revenue_report IS
  'دخل خدمات الطحن شهرياً — بنود SERVICE المرتبطة بأوامر مطحنة فقط، مفصولة عن مبيعات البضائع.';

-- ---------------------------------------------------------------------------
-- 2. تقرير كفاءة الاستخلاص والفاقد
-- ---------------------------------------------------------------------------
-- لكل أمر: هل الخام؟ كم أنتج؟ كم فقد؟ هل تجاوز الفاقد المتعاقد؟
-- excess_km هو المؤشر الإداري الأهم — مورد النزاع مع العميل.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.milling_efficiency_report AS
SELECT
  j.id                                                   AS job_id,
  j.job_number,
  j.store_id,
  w.name_ar                                               AS store_name_ar,
  j.customer_id,
  c.name_ar                                               AS customer_name_ar,
  j.status,
  r.receipt_number,
  g.grade_name_ar                                         AS grain_grade,
  a.id                                                       AS agreement_id,
  a.requested_output_type,
  a.bags_source,
  a.delivery_mode,
  a.price_basis,
  a.agreed_price,

  j.input_weight_kg,
  j.input_bag_count,
  j.expected_extraction_rate,
  j.allowed_loss_percentage,

  (SELECT coalesce(sum(o.produced_weight_kg), 0)
     FROM public.milling_job_outputs o WHERE o.job_id = j.id) AS total_output_kg,
  (SELECT coalesce(sum(o.produced_bag_count), 0)
     FROM public.milling_job_outputs o WHERE o.job_id = j.id) AS total_output_bags,
  (SELECT coalesce(sum(o.delivered_bag_count), 0)
     FROM public.milling_job_outputs o WHERE o.job_id = j.id) AS delivered_bags,

  j.actual_loss_kg,
  j.loss_excess_kg,

  -- الكفاءة الفعلية مقابل المتوقعة
  CASE WHEN j.input_weight_kg > 0
       THEN round(((j.input_weight_kg - coalesce(j.actual_loss_kg, 0))
                   * 100.0 / j.input_weight_kg), 2)
       ELSE 0 END                                          AS actual_extraction_rate,

  -- الفاقد كسسبة من الداخل — مؤشر المقارنة بين المخططات
  CASE WHEN j.input_weight_kg > 0
       THEN round(coalesce(j.actual_loss_kg, 0) * 100.0 / j.input_weight_kg, 2)
       ELSE 0 END                                          AS actual_loss_pct,

  CASE WHEN coalesce(j.loss_excess_kg, 0) > 0 THEN 'EXCEEDS' ELSE 'WITHIN' END
                                                          AS loss_status,

  si.invoice_number,
  si.total                                                AS invoiced_total,
  si.status                                                AS invoice_status
FROM public.milling_jobs j
LEFT JOIN public.warehouses w    ON w.id = j.store_id
LEFT JOIN public.customers c     ON c.id = j.customer_id
LEFT JOIN public.milling_intake_receipts r ON r.id = j.intake_receipt_id
LEFT JOIN public.milling_grain_grades g    ON g.id = r.grain_grade_id
LEFT JOIN public.milling_service_agreements a ON a.id = j.agreement_id
LEFT JOIN public.sales_invoices si ON si.milling_job_id = j.id;

COMMENT ON VIEW public.milling_efficiency_report IS
  'كفاءة الاستخلاص والفاقد لكل أمر طحن — يقارن الفعلي بالمتوقع ويُظهر الفاقد الزائد (مورد النزاع).';

-- ---------------------------------------------------------------------------
-- 3. تقرير رصيد الأمانات (صالح على التصميم الجديد)
-- ---------------------------------------------------------------------------
-- يعرض حالة كل سند: كم استُلم، كم طُحن، كم تبقى، وهل الفحص مرتبط؟
--Checks اكتمال الترحيل: grain_grade_id IS NULL تعني سنداً يحتاج ربطاً.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.milling_intake_health AS
SELECT
  r.id,
  r.receipt_number,
  r.customer_id,
  c.name_ar                                               AS customer_name_ar,
  r.store_id,
  r.status,
  r.grain_type,
  r.grain_product_id,
  r.grain_grade_id,
  g.grade_name_ar                                         AS grade_name_ar,
  (r.grain_grade_id IS NULL)                             AS needs_grade_link,
  r.bag_size_kg,
  r.intake_bag_count,
  r.net_weight_kg,
  r.nominal_weight_kg,
  (r.net_weight_kg - r.nominal_weight_kg)                AS bag_weight_gap_kg,
  r.moisture_percentage,
  g.max_moisture,
  CASE WHEN g.max_moisture IS NOT NULL AND r.moisture_percentage > g.max_moisture
       THEN 'ABOVE_LIMIT' ELSE 'OK' END                   AS moisture_status,
  r.created_at
FROM public.milling_intake_receipts r
LEFT JOIN public.customers c ON c.id = r.customer_id
LEFT JOIN public.milling_grain_grades g ON g.id = r.grain_grade_id;

COMMENT ON VIEW public.milling_intake_health IS
  'صحة سندات الاستلام: اكتمال ربط الفحص، فجوة أوزان الأكياس، وحالة الرطوبة مقابل الحد الفني.';