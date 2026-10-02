-- ============================================================================
-- 20261003050000_milling_post_deployment_fixes.sql
-- تصحيحات ما بعد التشغيل الأول (2026-10-03)
--
-- ROLLBACK
--   DROP VIEW IF EXISTS public.milling_intake_health;
--   CREATE VIEW public.milling_intake_health AS <restore previous definition>;
--
-- ============================================================================
-- هذا الملف وُجد أثناء التحقق الفعلي على قاعدة البيانات، لا بالتخمين.
--_squared كل نقطة فيه مأخوذة من `psql` لا من مراجعة الكود.
--
-- العطل 1 — سندان بلا فحص مرتبط
--   IR-202610-0001 و IR-202610-0002 carries grain_type = "قمح صلب".
--   مُطابِق النص في 20261003000000 قوائمته: "قمح صلب مستورد" — وهي أطول،
--   فلم يطابقهاEquality الصامت. النتيجة: استُقبل سندان بدرجة NULL،
--   وواجهة الاستلام الجديدة ترفض الحفظ بلا درجة ⇒ الشاشتان معطّلتان.
--
-- العطل 2 — بنود الفاتورة الزائدة باقية
--   شرط الحذف في 20261003020000 كان:
--       j.milling_fee_per_bag > 0 AND j.milling_fee_per_ton > 0
--   لكن التصفير فوقه ينفّذ أولاً فيُصفّر fee_per_ton قبل الحذف، فلا يبقى
--   شرط يُطابق. النتيجة: MJ-501 و MJ-202610-0001 احتفظا بسطرين
--   (20 طن × سعر الكيس 8.00) زائدَين عن الأجر الصحيح.
--
--   ملاحظة: MJ-202610-0001 يعرض سطرين متطابقين (20 × 8 = 160 و 1 × 160 = 160)،
--   أحدهما بالطن والآخر بالكيس — احتساز مزدوج بنفس القيمة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. استكمال قائمة المطابقة النصية
-- ---------------------------------------------------------------------------
-- القائمة تُ.Match بـ Equality تماماً (btrim(r2.grain_type) = m.name_ar)،
-- فلا تحتمل الاحتواء. لذا تُدرج الصيغ التي وصلتها السندات فعلياً.
-- التكرار هنا مقصود: هو ما يجعل الترحيل id 型موني (إعادة التشغيل لا تفعل شيئاً).
-- ---------------------------------------------------------------------------
UPDATE public.milling_intake_receipts r
   SET grain_grade_id = sub.gid
  FROM (
    SELECT DISTINCT ON (r2.id)
           r2.id AS rid, g.id AS gid
      FROM public.milling_intake_receipts r2
      JOIN (VALUES
              ('قمح صلب',            'HARD_IMPORT'),   -- ← كان ناقصاً
              ('قمح صلب مستورد',     'HARD_IMPORT'),
              ('قمح صلب مستورد (درجة أولى)', 'HARD_IMPORT'),
              ('قمح بلدي محلي',      'LOCAL'),
              ('قمح بلدي',           'LOCAL'),
              ('قمح بلدي محلي (حبوب)', 'LOCAL'),
              ('قمح طري',            'SOFT'),
              ('قمح طري (للمخبوزات)', 'SOFT'),
              ('ذرة صفراء',          'CORN'),
              ('ذرة صفراء خام',      'CORN'),
              ('شعير',               'BARLEY'),
              ('شعير حبوب خام',      'BARLEY')
            ) AS m(name_ar, grade_code)
        ON btrim(r2.grain_type) = m.name_ar
      JOIN public.milling_grain_grades g
        ON g.grade_code = m.grade_code
     WHERE r2.grain_grade_id IS NULL
    ORDER BY r2.id, length(m.name_ar) DESC
  ) sub
 WHERE r.id = sub.rid;

DO $$
DECLARE v_null int;
BEGIN
  SELECT count(*) INTO v_null
  FROM public.milling_intake_receipts
  WHERE grain_grade_id IS NULL;

  IF v_null = 0 THEN
    RAISE NOTICE 'جميع سندات الاستلام مرتبطة بفحص ✔';
  ELSE
    RAISE NOTICE 'لا يزال % سنداً بلا فحص — راجع القيم النصية أعلاه', v_null;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. حذف بنود الفاتورة الزائدة — بمعيار مستقل عن حالة الأجر
-- ---------------------------------------------------------------------------
-- المعيار الجديد لا يعتمد fee_per_ton إطلاقاً (تُصفَّر قبله)، بل على
-- ازدواج **المنتج** داخل الفاتورة الواحدة: نفس service_product_id مرتين،
-- وكمية إحداهما = عدد الأطنان (input_weight_kg/1000) ⇒ هي السطر الذي
-- استخدم سعر الكيس على كمية الطن.
--
-- نُبقي السطر الذي كميته = عدد الأكياس (input_bag_count) فهو الصحيح.
-- ---------------------------------------------------------------------------
DELETE FROM public.sales_invoice_items i
  USING public.sales_invoices si,
        public.milling_jobs j
 WHERE si.id = i.invoice_id
   AND j.id = si.milling_job_id
   AND i.line_type = 'SERVICE'
   AND i.product_id IS NOT DISTINCT FROM j.service_product_id
   AND i.quantity > 0
   AND abs(i.quantity - round(j.input_weight_kg / 1000, 3)) < 0.001
   AND i.quantity <> j.input_bag_count
   -- الفاتورة تحتوي بنداً آخر لنفس المنتج (السطر الصحيح موجود).
   AND EXISTS (
     SELECT 1 FROM public.sales_invoice_items i2
      WHERE i2.invoice_id = i.invoice_id
        AND i2.product_id IS NOT DISTINCT FROM i.product_id
        AND i2.id <> i.id
   );

-- تصحيح إجمالي الفواتير التي حُذف منها بند فعلاً.
UPDATE public.sales_invoices si
   SET subtotal = sub.new_total,
       total    = sub.new_total,
       updated_at = timezone('utc'::text, now())
  FROM (
    SELECT i.invoice_id, sum(i.total) AS new_total
    FROM public.sales_invoice_items i
    GROUP BY i.invoice_id
  ) sub
 WHERE si.id = sub.invoice_id
   AND si.milling_job_id IS NOT NULL
   AND si.total <> sub.new_total;

-- ---------------------------------------------------------------------------
-- 3. بِكر من الفواتير على نفس أمر الطحن
-- ---------------------------------------------------------------------------
--_defense في العمق: أكثر من فاتورة لنفس الأمر تعني احتساز مزدوج.
--工程的 مفتاح فريد على milling_job_id يمنع التكرار مستقبلاً.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT milling_job_id, count(*) AS n, array_agg(invoice_number) AS invoices
      FROM public.sales_invoices
     WHERE milling_job_id IS NOT NULL
     GROUP BY milling_job_id
    HAVING count(*) > 1
  LOOP
    RAISE NOTICE 'أمر % له % فواتير: %', r.milling_job_id, r.n, r.invoices;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sales_invoices_milling_job_unique'
       AND conrelid = 'public.sales_invoices'::regclass
  ) THEN
    -- بِكر جزئي: يسمح بعدة فواتير لأمر بلا عقد قديم، ويمنع التكرار.
    CREATE UNIQUE INDEX IF NOT EXISTS sales_invoices_milling_job_unique
      ON public.sales_invoices (milling_job_id)
      WHERE milling_job_id IS NOT NULL;
    RAISE NOTICE 'أُضيف قيد بِكر على الفاتورة لكل أمر طحن';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. إعادة تعريف VIEWات التقارير لتضمِّن أعمدة الفحص
-- ---------------------------------------------------------------------------
-- milling_intake_health عُرِّف في 030000 قبل أن يُنفَّذ 040000، فلم يكن
-- يعرف grain_grade_id. يُعاد تعريفه هنا على المخطط النهائي.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.milling_intake_health AS
SELECT
  r.id,
  r.receipt_number,
  r.customer_id,
  c.name                                               AS customer_name_ar,
  r.store_id,
  r.status,
  r.grain_type,
  r.grain_product_id,
  r.grain_grade_id,
  g.grade_name_ar,
  (r.grain_grade_id IS NULL)                          AS needs_grade_link,
  r.bag_size_kg,
  r.intake_bag_count,
  r.net_weight_kg,
  r.nominal_weight_kg,
  (r.net_weight_kg - r.nominal_weight_kg)             AS bag_weight_gap_kg,
  r.moisture_percentage,
  g.max_moisture,
  CASE WHEN g.max_moisture IS NOT NULL AND r.moisture_percentage > g.max_moisture
       THEN 'ABOVE_LIMIT' ELSE 'OK' END                AS moisture_status,
  r.created_at
FROM public.milling_intake_receipts r
LEFT JOIN public.customers c              ON c.id = r.customer_id
LEFT JOIN public.milling_grain_grades g   ON g.id = r.grain_grade_id;

COMMENT ON VIEW public.milling_intake_health IS
  'صحة سندات الاستلام: اكتمال ربط الفحص، فجوة أوزان الأكياس، وحالة الرطوبة مقابل الحد الفني.';

-- تقرير الإيرادات: c.name لا c.name_ar (جدول customers بلا عمود ترجمة).
CREATE OR REPLACE VIEW public.milling_revenue_report AS
SELECT
  date_trunc('month', si.created_at)          AS period_month,
  si.warehouse_id                             AS store_id,
  w.name_ar                                  AS store_name_ar,
  si.customer_id,
  c.name                                      AS customer_name_ar,
  j.job_number,
  a.id                                       AS agreement_number,
  i.product_id,
  p.sku,
  p.name_ar                                  AS item_name_ar,
  i.line_type,
  i.stock_effect,
  sum(i.quantity)                             AS quantity,
  sum(i.total)                                AS net_total,
  sum(i.tax)                                  AS tax_total,
  count(*)                                    AS line_count
FROM public.sales_invoice_items i
JOIN public.sales_invoices si   ON si.id = i.invoice_id
LEFT JOIN public.milling_jobs j ON j.id = si.milling_job_id
LEFT JOIN public.milling_service_agreements a ON a.id = j.agreement_id
LEFT JOIN public.products p      ON p.id = i.product_id
LEFT JOIN public.customers c     ON c.id = si.customer_id
LEFT JOIN public.warehouses w    ON w.id = si.warehouse_id
WHERE si.status NOT IN ('draft', 'cancelled', 'returned')
  AND i.line_type = 'SERVICE'
  AND (j.id IS NOT NULL OR a.id IS NOT NULL)
-- i.stock_effect منقول بلا تجميع ⇒ كان خارج GROUP BY. عدد الأعمدة الآن 12:
-- 1..11 كما هي + stock_effect في الموضع 12.
GROUP BY 1,2,3,4,5,6,7,8,9,10,11,12;

COMMENT ON VIEW public.milling_revenue_report IS
  'دخل خدمات الطحن شهرياً — بنود SERVICE المرتبطة بأوامر مطحنة فقط، مفصولة عن مبيعات البضائع.';

-- ---------------------------------------------------------------------------
-- 5. تشخيص نهائي
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_orphans int; v_dual int; v_dupe int;
BEGIN
  SELECT count(*) INTO v_orphans FROM public.milling_intake_receipts WHERE grain_grade_id IS NULL;
  SELECT count(*) INTO v_dual FROM public.milling_jobs
   WHERE milling_fee_per_bag > 0 AND milling_fee_per_ton > 0;
  SELECT count(*) INTO v_dupe FROM (
    SELECT milling_job_id FROM public.sales_invoices
     WHERE milling_job_id IS NOT NULL GROUP BY milling_job_id HAVING count(*) > 1
  ) x;

  RAISE NOTICE '── فحص نهائي';
  RAISE NOTICE '   سندات بلا فحص      : %', v_orphans;
  RAISE NOTICE '   أوامر بأساسين       : %', v_dual;
  RAISE NOTICE '   أوامر بفاتورتين     : %', v_dupe;
END $$;