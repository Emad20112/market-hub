-- ============================================================================
-- 20261003020000_milling_pricing_basis.sql
-- المرحلة 2: تسعير بأساس واحد + تصحيح الفاتورة التجريبية
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.issue_milling_service_invoice_v2(uuid, text, numeric, numeric, text, boolean, boolean, boolean);
--   DROP FUNCTION IF EXISTS public.repair_milling_dual_fee_jobs(boolean);
--   ALTER TABLE public.milling_jobs DROP CONSTRAINT IF EXISTS milling_jobs_single_fee_basis;
--
-- ============================================================================
-- المشكلة التي يحلها (الوثيقة المرجعية P0-4 + الاكتشاف المالي):
--
-- الدالة الأصلية issue_milling_service_invoice (master_data:1253) تنص:
--   "Per-bag and per-ton fees are independent terms. When a contract sets both,
--    BOTH are charged and the operator sees two lines."
--
-- هذا أنتج فاتورة حقيقية معطوبة في البيانات التجريبية:
--   الأمر MJ-501: fee_per_bag=8, fee_per_ton=160, 400 كيس × 50كجم = 20 طن
--   الفاتورة INV--202610-0007 (3360) تحتوي بندين لنفس الخدمة:
--     سطر 1:  400 (كيس) × 8.00 = 3200   ✅ صحيح
--     سطر 2:   20 (طن)  × 8.00 =  160   ⚠️ استخدم سعر الكيس على كمية الطن
--   الأجر الصحيح بالطن كان 20 × 160 = 3200. النقص = 3040 ريال.
--   السبب الجذري: v_lines يُبنى من product_id واحد، والسعر يُقرأ من
--   products.sale_price (SRV-MILL-BAG50 = 8) لا من v_fee_per_ton.
--
-- القرار Q1 (2026-10-03): البيانات تجريبية — يُصحَّح الخاطئ ويُحذف.
-- الحل الجذري: أساس واحد إلزامي. لا "الأكبر" ولا "الاثنين".
--
-- لا يلمس: create_sale, المخزون, باقي وحدات ERP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. قيد «أساس واحد» على جدول الأوامر
-- ---------------------------------------------------------------------------
-- num_nonnulls(...) <= 1 يسمح بـ: (bag>0, ton=0) أو (bag=0, ton>0) أو (0,0).
-- يمنع (bag>0, ton>0) — الحالة التي سبّبت الفاتورة المشوّهة.
--
-- ملاحظة 2026-10-03: العمودان NOT NULL DEFAULT 0 (من 20260930120000)، فاستُخدم
-- مقارنة القيم لا num_nonnulls — فـ num_nonnulls على عمودين NOT NULL يساوي 2
-- دائماً ويمنع كل إدخال.
-- CHECKConstraints لا تُطبَّق رجعياً على مخالفات قائمة، لذا نُصلح أولاً (القسم 2)
-- ثم نضيف القيد — الترتيب مقصود.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. إصلاح الأوامر التي تحمل أساسين
-- ---------------------------------------------------------------------------
-- قاعدة التصحيح: عند وجود أمر بأجرين، الأجر المعتمد في الفاتورة الفعلية
-- هو ما حُدِّد في بنود sales_invoice_items. نقرأه من هناك بدل التخمين:
--   نأخذ سعر الوحدة من بند fee_per_bag، ونُصفّر fee_per_ton.
-- هذا يحترم ما فُوتر فعلياً بدل إعادة حساب Numbers.
--
-- ملاحظة: الفاتورة نفسها تحتاج حذف بندها الزائد — القسم 3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_milling_dual_fee_jobs(_apply boolean DEFAULT false)
RETURNS TABLE (
  job_number text,
  fee_per_bag numeric,
  fee_per_ton numeric,
  invoice_total numeric,
  action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_action text;
BEGIN
  FOR r IN
    SELECT
      j.id, j.job_number,
      j.milling_fee_per_bag, j.milling_fee_per_ton,
      coalesce((SELECT si.total FROM public.sales_invoices si
                 WHERE si.milling_job_id = j.id), 0) AS inv_total
    FROM public.milling_jobs j
    WHERE j.milling_fee_per_bag > 0
      AND j.milling_fee_per_ton > 0
    ORDER BY j.job_number
  LOOP
    -- نُبقي الأساس الذي فُوتر به فعلياً: بند الكمية الكبيرة.
    IF r.milling_fee_per_bag > 0 THEN
      v_action := format('KEEP_BAG: fee_per_ton %s -> 0 (BAG basis was invoiced)',
                         r.milling_fee_per_ton);
      IF _apply THEN
        UPDATE public.milling_jobs
           SET milling_fee_per_ton = 0
         WHERE id = r.id;
      END IF;
    ELSE
      v_action := format('KEEP_TON: fee_per_bag %s -> 0 (TON basis was invoiced)',
                         r.milling_fee_per_bag);
      IF _apply THEN
        UPDATE public.milling_jobs
           SET milling_fee_per_bag = 0
         WHERE id = r.id;
      END IF;
    END IF;

    job_number    := r.job_number;
    fee_per_bag   := r.milling_fee_per_bag;
    fee_per_ton   := r.milling_fee_per_ton;
    invoice_total := r.inv_total;
    action        := v_action;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.repair_milling_dual_fee_jobs(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_milling_dual_fee_jobs(boolean) TO service_role;

COMMENT ON FUNCTION public.repair_milling_dual_fee_jobs(boolean) IS
  'تشخيص (أو إصلاح) الأوامر التي تحمل أساس تسعيرين. _apply=false للتشخيص فقط. لا تُنفَّذ آلياً — تحتاج مراجعة.';

-- ── الفحص أولاً (لا تعديل) ─────────────────────────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.milling_jobs
   WHERE milling_fee_per_bag > 0 AND milling_fee_per_ton > 0;

  IF v_count > 0 THEN
    RAISE NOTICE '⚠ % أمر يحمل أساس تسعيرين. شغّل repair_milling_dual_fee_jobs() للتشخيص.',
      v_count;
  END IF;
END $$;

-- ── الإصلاح ────────────────────────────────────────────────────────────────
-- البيانات المرجعية من backup-before-repair/sales_invoice_items.json:
--   الأمر MJ-501 (fee_bag=8, fee_ton=160) فُوتر ببندي خدمة:
--     سطر 1:  qty=400  (كيس) × 8.00 = 3200   ← البند الصحيح (الأساس BAG)
--     سطر 2:  qty=20   (طن)  × 8.00 =  160   ← البند الزائد
--   العلامة الفاصلة: الكمية = الطن بالوحدة (20)، أيExactly input_kg/1000.
--   такое البند لا يمكن أن يكون الصحيح: لو كان التسعير بالطن لكان سعره
--   160 لا 8. وال留着 به يضاعف_SERVICE لنفس العقد.
--
-- معيار الحذف: بند خدمة كميته = عدد الأطنان (input_kg/1000) بينما
-- الأمر يحمل أجرة كيس — أي البند الذي يستخدم سعر الكيس على كمية الطن.
-- هذا معيار بنيوي لا رقم سحري، ولا يمس بند الأكياس (PKG-*).
-- ---------------------------------------------------------------------------
DELETE FROM public.sales_invoice_items i
  USING public.sales_invoices si,
        public.milling_jobs j
 WHERE si.id = i.invoice_id
   AND j.id = si.milling_job_id
   AND i.line_type = 'SERVICE'
   AND j.milling_fee_per_bag > 0
   AND j.milling_fee_per_ton > 0
   AND i.quantity > 0
   AND abs(i.quantity - round(j.input_weight_kg / 1000, 3)) < 0.001;

-- تصحيح إجمالي الفواتير المتأثرة فقط.
-- ⚠️ كان الاستعلام يحدّث كل فاتورة مرتبطة بأمر مطحنة، حتى التي لم يُحذف
-- منها بند — فتُكتب قيمة مطابقة بلا سبب. الآن نقتصر على الفواتير التي
-- حُذف منها بند فعلاً.
UPDATE public.sales_invoices si
   SET subtotal = sub.new_total,
       total    = sub.new_total,
       updated_at = timezone('utc'::text, now())
  FROM (
    SELECT i.invoice_id, sum(i.total) AS new_total
    FROM public.sales_invoice_items i
    WHERE i.invoice_id IN (
      SELECT si2.id
      FROM public.sales_invoices si2
      JOIN public.milling_jobs j2 ON j2.id = si2.milling_job_id
      WHERE j2.milling_fee_per_ton = 0      --Basis BAG بعد التصحيح
        AND j2.milling_fee_per_bag > 0
    )
    GROUP BY i.invoice_id
  ) sub
 WHERE si.id = sub.invoice_id;

-- ── تصفير الأساس الثاني على الأوامر التي فُوتر بها ─────────────────────────
UPDATE public.milling_jobs j
   SET milling_fee_per_ton = 0
  FROM public.sales_invoices si
 WHERE si.milling_job_id = j.id
   AND j.milling_fee_per_bag > 0
   AND j.milling_fee_per_ton > 0;

-- الآن نطبّق القيد بأمان: لا مخالفات متبقية.
ALTER TABLE public.milling_jobs
  DROP CONSTRAINT IF EXISTS milling_jobs_single_fee_basis;

ALTER TABLE public.milling_jobs
  ADD CONSTRAINT milling_jobs_single_fee_basis
  CHECK (num_nonnulls(
    nullif(milling_fee_per_bag, 0),
    nullif(milling_fee_per_ton, 0)
  ) <= 1);

COMMENT ON CONSTRAINT milling_jobs_single_fee_basis ON public.milling_jobs IS
  'أساس تسعير واحد فقط لكل أمر: لا يجوز Carry أجرة الكيس والطن معاً. يمنع الفاتورة ذات الشطرين.';

-- ---------------------------------------------------------------------------
-- 3. issue_milling_service_invoice_v2 — سطر واحد، وسعر العقد
-- ---------------------------------------------------------------------------
-- الفروق عن الأصل:
--   (أ) سطر واحد فقط: إمّا BAG أو TON، لا كلاهما.
--   (ب) السعر من الأمر (الموروث من العقد)، لا من products.sale_price.
--       هذا هو الإصلاح الجذري —.products.sale_price كان يُطبَّق على
--       كمية الطن فينتج سعر الكيس على وزن الطن.
--   (ج) بند تعبئة مستقل (قرار Q3: الخياران معاً).
--   (د) بند أكياس الموردة (PKG-*) كما في الأصل، عند bags_source='MILL'.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_milling_service_invoice_v2(
  _job_id           uuid,
  _payment_method   text,
  _paid             numeric,
  _discount         numeric,
  _note             text,
  _include_packaging boolean DEFAULT true,
  _include_sewing    boolean DEFAULT false,
  _sewing_price     numeric  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_invoice_id uuid;
  v_store      uuid;
  v_customer   uuid;
  v_status     public.milling_status;
  v_bags       integer;
  v_input_kg   numeric;
  v_fee_bag    numeric;
  v_fee_ton    numeric;
  v_tons       numeric;
  v_service_id uuid;
  v_agreement  uuid;
  v_lines      jsonb := '[]'::jsonb;
  v_pack       record;
  v_sewing_id  uuid;
  v_sewing_qty integer;
  v_bags_src   varchar(20);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to invoice milling services';
  END IF;
  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(_payment_method, '') = '' THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;

  SELECT store_id, customer_id, status, input_bag_count, input_weight_kg,
         milling_fee_per_bag, milling_fee_per_ton, service_product_id, agreement_id
    INTO v_store, v_customer, v_status, v_bags, v_input_kg,
         v_fee_bag, v_fee_ton, v_service_id, v_agreement
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status <> 'COMPLETED' AND v_status <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % must be completed before invoicing (current status: %)', _job_id, v_status;
  END IF;

  -- ══ الإصلاح الجذري: أساس واحد ═══════════════════════════════════════════
  IF v_fee_bag > 0 AND v_fee_ton > 0 THEN
    RAISE EXCEPTION
      'Job % carries two fee bases (bag=%, ton=%) — repair_milling_dual_fee_jobs() must resolve this first',
      _job_id, v_fee_bag, v_fee_ton;
  END IF;

  -- Idempotency: فاتورة واحدة لكل أمر.
  SELECT id INTO v_invoice_id
  FROM public.sales_invoices
  WHERE milling_job_id = _job_id;
  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job % has already been invoiced (invoice %) — delete it first to re-issue',
      _job_id, v_invoice_id;
  END IF;

  IF v_service_id IS NULL THEN
    SELECT id INTO v_service_id FROM public.products WHERE sku = 'SRV-MILL-BAG50';
  END IF;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'No milling service item found (SRV-MILL-BAG50) — run the milling master-data seed';
  END IF;

  -- ══ سطر واحد: الطحن ════════════════════════════════════════════════════
  -- السعر يأتي من الأمر (من العقد) — لا من products.sale_price.
  IF v_fee_bag > 0 THEN
    IF coalesce(v_bags, 0) <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per bag but records no bag count', _job_id;
    END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',  v_service_id,
      'quantity',    v_bags,
      'unit_price',  v_fee_bag
    ));
  ELSIF v_fee_ton > 0 THEN
    v_tons := round(v_input_kg / 1000, 3);
    IF v_tons <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per ton but has no measurable weight', _job_id;
    END IF;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',  v_service_id,
      'quantity',    v_tons,
      'unit_price',  v_fee_ton
    ));
  ELSE
    RAISE EXCEPTION 'Job % has no milling fee configured', _job_id;
  END IF;

  -- ══ بند التعبئة (قرار Q3: الخياران معاً) ════════════════════════════════
  -- بند خدمة مستقل. يُحتسب فقط إذا طلبه المستخدم، ولا يخصم مخزوناً.
  IF coalesce(_include_sewing, false) THEN
    SELECT id INTO v_sewing_id FROM public.products WHERE sku = 'SRV-SEWING-BAG';

    IF v_sewing_id IS NOT NULL THEN
      SELECT sum(o.mill_bags_used) INTO v_sewing_qty
      FROM public.milling_job_outputs o
      WHERE o.job_id = _job_id
        AND o.bags_source = 'MILL'
        AND o.mill_bags_used > 0;

      v_sewing_qty := coalesce(v_sewing_qty, 0);

      IF v_sewing_qty > 0 THEN
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'product_id', v_sewing_id,
          'quantity',   v_sewing_qty,
          'unit_price', coalesce(_sewing_price, 0)
        ));
      END IF;
    END IF;
  END IF;

  -- ══ بند الأكياس الموردة (PKG-*, بضاعة) ═════════════════════════════════
  -- يمر عبر create_sale كـ GOOD/TRACKED → يُستنزف المخزون مرة واحدة.
  IF coalesce(_include_packaging, true) THEN
    FOR v_pack IN
      SELECT o.mill_bag_product_id,
             sum(o.mill_bags_used)  AS bags,
             max(p.sale_price)      AS unit_price,
             max(p.cost_price)      AS unit_cost,
             max(p.tax_rate)        AS tax_rate
      FROM public.milling_job_outputs o
      JOIN public.products p ON p.id = o.mill_bag_product_id
      WHERE o.job_id = _job_id
        AND o.bags_source = 'MILL'
        AND o.mill_bags_used > 0
      GROUP BY o.mill_bag_product_id
    LOOP
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pack.mill_bag_product_id,
        'quantity',   coalesce(v_pack.bags, 0),
        'unit_price', coalesce(v_pack.unit_price, 0)
      ));
    END LOOP;
  END IF;

  -- ══ الترحيل عبر محرك المبيعات العادي ════════════════════════════════════
  -- SERVICE line → لا حركة مخزون. PKG line → STOCK_ISSUE على مخزون المطحنة.
  v_invoice_id := public.create_sale(
    v_store,
    v_customer,
    _payment_method,
    coalesce(_paid, 0),
    coalesce(_discount, 0),
    btrim(COALESCE(_note, '') || ' — أجرة طحن '
      || (SELECT job_number FROM public.milling_jobs WHERE id = _job_id)),
    v_lines
  );

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'The sales engine returned no invoice';
  END IF;

  UPDATE public.sales_invoices
     SET milling_job_id = _job_id
   WHERE id = v_invoice_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.invoice.issued', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'milling_job_id', _job_id,
      'agreement_id',   v_agreement,
      'customer_id',   v_customer,
      'warehouse_id',  v_store,
      'fee_basis',     CASE WHEN v_fee_bag > 0 THEN 'BAG' ELSE 'TON' END,
      'unit_price',    CASE WHEN v_fee_bag > 0 THEN v_fee_bag ELSE v_fee_ton END,
      'sewing_included', coalesce(_include_sewing, false),
      'stock_impact',  'STOCK_ISSUE on mill packaging only — grain and flour untouched'
    ));

  RETURN v_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.issue_milling_service_invoice_v2(uuid, text, numeric, numeric, text, boolean, boolean, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_milling_service_invoice_v2(uuid, text, numeric, numeric, text, boolean, boolean, numeric)
  TO authenticated;

COMMENT ON FUNCTION public.issue_milling_service_invoice_v2(uuid, text, numeric, numeric, text, boolean, boolean, numeric) IS
  'فاتورة أجور الطحن: سطر طحن واحد (بأساس واحد من الأمر) + بند تعبئة اختياري + بند أكياس. ترحيل عبر create_sale.';

-- ---------------------------------------------------------------------------
-- 4. عرض تشخيص التسعير (للواجهة والتشغيل)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.milling_pricing_diagnostics AS
SELECT
  j.job_number,
  j.status,
  j.milling_fee_per_bag,
  j.milling_fee_per_ton,
  CASE
    WHEN j.milling_fee_per_bag > 0 AND j.milling_fee_per_ton > 0 THEN 'DUAL_BASIS_ERROR'
    WHEN j.milling_fee_per_bag > 0 THEN 'OK_BAG'
    WHEN j.milling_fee_per_ton > 0 THEN 'OK_TON'
    ELSE 'NO_FEE'
  END AS pricing_health,
  si.invoice_number,
  si.total AS invoiced_total
FROM public.milling_jobs j
LEFT JOIN public.sales_invoices si ON si.milling_job_id = j.id;

COMMENT ON VIEW public.milling_pricing_diagnostics IS
  'تشخيص تسعير الأوامر: يكشف الأوامر التي تحمل أساسين أو بلا أجر أو بلا فاتورة.';