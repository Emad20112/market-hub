-- ============================================================================
-- 20261003040000_milling_grain_grade_wiring.sql
-- المرحلة 4: توصيل grain_grade_id فعلياً بالمحرك + RLS للعقود
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.create_milling_intake(uuid, uuid, text, uuid, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text);
--   DROP FUNCTION IF EXISTS public.create_milling_agreement(uuid, text, text, numeric, varchar, varchar, uuid, varchar, numeric, numeric, numeric, text);
--
-- ============================================================================
-- لماذا هذا الملف موجود:
--   migration 20261003000000 أضاف عمود grain_grade_id إلى جدول السندات،
--   وواجهة الاستلام ترسل _grain_grade_id إلى RPC `create_milling_intake`…
--   لكن دالة 20260930120100 لا تحتوي هذا المعامل أصلاً.
--
--   النتيجة: Supabase/PostgREST تتجاهل المعاملات غير المعروفة في استدعاء
--   دالة، فيُحفظ السند بلا فحص — بلا خطأ ظاهر، وصمت. هذا أخطر kinds
--   من الأخطاء: صامت، ويبدو ناجحاً.
--
-- هذا الملف لـ:
--   1. إعادة تعريف create_milling_intake بمعامل grain_grade_id — بنسخة
--      extended كاملة من نفس منطق v1 (لم يُمس محرك الاستلام).
--   2. تعريف create_milling_agreement بمعامل grain_grade_id (الحقل كان
--      يُشتق من السند؛ نجعله صريحاً مع التحقق من تطابقه).
--   3. سياسات RLS لجدول العقود — بدونها لا يستطيع المتصفح قراءتها أصلاً
--      (جداول milling_* الأخرى لها سياسات، والعقود جدول جديد).
--
-- قاعدة عدم التغيير: منطق الاستلام (الوزن الصافي المشتق، الوزن الاسمي،
-- قفل الرصيد، سجل التدقيق) مُنقول حرفياً من v1.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. create_milling_intake — مع الفحص المرجعي
-- ---------------------------------------------------------------------------
-- نسخة مطابقة لـ 20260930120100 §6 مع إضافة `_grain_grade_id`:
--   * صفر منطق جديد على حساب الوزن أو الأمانات.
--   * الفحصBecoming إلزامي: بدونه لا يُحفظ السند (الدرجة تحدد السعر لاحقاً).
--   * الرطوبة/الشوائب: تحذير في سجل التدقيق، لا منع (قرار المستخدم).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_milling_intake(
  _store_id          uuid,
  _customer_id       uuid,
  _grain_type        text,
  _grain_product_id  uuid,
  _grain_grade_id    uuid,
  _bag_size_kg       numeric,
  _bag_count         integer,
  _gross_weight_kg   numeric,
  _tare_weight_kg    numeric,
  _moisture          numeric,
  _impurities        numeric,
  _truck_plate       text,
  _driver_name       text,
  _silo              text,
  _notes             text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_number  text;
  v_net     numeric;
  v_nominal numeric;
  v_grain   text;
  v_grade   record;
  v_check   jsonb;
BEGIN
  -- ── authorisation ────────────────────────────────────────────────────────
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to receive customer custody grain';
  END IF;

  -- ── validation, before anything is written ───────────────────────────────
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required — this receipt is a custody document';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id AND c.is_active) THEN
    RAISE EXCEPTION 'Selected customer is unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _store_id AND w.is_active) THEN
    RAISE EXCEPTION 'Selected warehouse is unavailable';
  END IF;

  v_grain := btrim(COALESCE(_grain_type, ''));
  IF v_grain = '' THEN
    RAISE EXCEPTION 'Grain type is required';
  END IF;

  -- ── الفحص المرجعي ────────────────────────────────────────────────────────
  IF _grain_grade_id IS NULL THEN
    RAISE EXCEPTION
      'Grain grade is required — the grade determines the milling price later';
  END IF;

  SELECT * INTO v_grade
  FROM public.milling_grain_grades
  WHERE id = _grain_grade_id AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Grain grade % does not exist or is inactive', _grain_grade_id;
  END IF;

  -- الفحص يجب أن يخصّ الصنف نفسه. يمنع ربط سند بدرجة صنف آخر.
  IF _grain_product_id IS NOT NULL AND _grain_product_id <> v_grade.product_id THEN
    RAISE EXCEPTION
      'Grain grade % does not belong to the selected product', _grain_grade_id;
  END IF;

  -- ملصق السند يأتي من الفحص المرجعي، لا من إدخال المتصفح.
  v_grain := v_grade.grade_name_ar;

  IF coalesce(_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Bag size must be greater than zero';
  END IF;
  IF coalesce(_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Bag count cannot be negative';
  END IF;
  IF coalesce(_gross_weight_kg, 0) < 0 OR coalesce(_tare_weight_kg, 0) < 0 THEN
    RAISE EXCEPTION 'Weights cannot be negative';
  END IF;

  v_net := round(coalesce(_gross_weight_kg, 0) - coalesce(_tare_weight_kg, 0), 3);
  IF v_net <= 0 THEN
    RAISE EXCEPTION 'Net weight must be positive: gross % − tare % produced %',
      coalesce(_gross_weight_kg, 0), coalesce(_tare_weight_kg, 0), v_net;
  END IF;

  v_nominal := round(coalesce(_bag_count, 0) * coalesce(_bag_size_kg, 0), 3);
  IF v_nominal <= 0 AND v_net <= 0 THEN
    RAISE EXCEPTION 'A receipt needs either bags or a positive net weight';
  END IF;

  IF coalesce(_moisture, 0) < 0 OR coalesce(_moisture, 0) > 100 THEN
    RAISE EXCEPTION 'Moisture must be between 0 and 100';
  END IF;
  IF coalesce(_impurities, 0) < 0 OR coalesce(_impurities, 0) > 100 THEN
    RAISE EXCEPTION 'Impurities must be between 0 and 100';
  END IF;

  -- الفحص الفني: يُرجع تحذيراً، ولا يمنع (قرار 2026-10-03).
  v_check := public.milling_match_grain_grade(_grain_grade_id, _moisture, _impurities);

  -- ── document ─────────────────────────────────────────────────────────────
  v_number := public.next_milling_intake_number();

  INSERT INTO public.milling_intake_receipts (
    store_id, receipt_number, customer_id,
    truck_plate_number, driver_name,
    grain_type, grain_product_id, grain_grade_id,
    bag_size_kg, intake_bag_count, nominal_weight_kg,
    gross_weight_kg, tare_weight_kg, net_weight_kg,
    moisture_percentage, impurities_percentage,
    silo_or_location, status, notes, received_by
  )
  VALUES (
    _store_id, v_number, _customer_id,
    nullif(btrim(COALESCE(_truck_plate, '')), ''),
    nullif(btrim(COALESCE(_driver_name, '')), ''),
    v_grain, v_grade.product_id, _grain_grade_id,
    coalesce(_bag_size_kg, 0), coalesce(_bag_count, 0), v_nominal,
    coalesce(_gross_weight_kg, 0), coalesce(_tare_weight_kg, 0), v_net,
    coalesce(_moisture, 0), coalesce(_impurities, 0),
    nullif(btrim(COALESCE(_silo, '')), ''),
    'RECEIVED', nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.intake.received', 'milling_intake', v_id,
    jsonb_build_object(
      'receipt_number',  v_number,
      'store_id',        _store_id,
      'customer_id',     _customer_id,
      'grain_grade_id',  _grain_grade_id,
      'grain_grade',     v_grade.grade_code,
      'grain_type',      v_grain,
      'bag_count',       coalesce(_bag_count, 0),
      'bag_size_kg',     coalesce(_bag_size_kg, 0),
      'nominal_weight_kg', v_nominal,
      'net_weight_kg',   v_net,
      -- الفحص الفني يُسجَّل دائماً حتى لو كان مطابقاً: يثبت أن القيس تم.
      'technical_check',  v_check,
      'stock_impact',    'NONE — customer custody'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) IS
  'سند استلام أمانات عيني. الفحص المرجعي إلزامي (يحدد السعر لاحقاً)؛ صفر أثر على المخزون التجاري.';

-- ---------------------------------------------------------------------------
-- 2. create_milling_agreement — الفحص صريح لا مشتق
-- ---------------------------------------------------------------------------
-- في 20261003010000 كان grain_grade_id يُشتق من السند داخل الدالة.
-- هذا إعادة تعريف بتوقيع متوافق مع الواجهة: الفحص يُمرَّر صراحةً،
-- والتحقق من أنه يطابق درجة السند يمنع التناقض بين العقد والسند.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_milling_agreement(
  _intake_receipt_id        uuid,
  _grain_grade_id           uuid,
  _requested_output_type    text,
  _requested_output_note    text,
  _output_bag_size_kg       numeric,
  _bags_source              text,
  _delivery_mode            text,
  _service_product_id       uuid,
  _price_basis              text,
  _agreed_price             numeric,
  _expected_extraction_rate numeric,
  _allowed_loss_percentage  numeric,
  _notes                    text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := auth.uid();
  v_id        uuid;
  v_store     uuid;
  v_customer  uuid;
  v_basis     text;
  v_src       text;
  v_mode      text;
  v_receipt_status public.milling_status;
  v_grade     uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling agreements';
  END IF;

  IF _intake_receipt_id IS NULL THEN
    RAISE EXCEPTION 'An intake receipt is required — a job must come from a customer''s grain';
  END IF;

  -- قفل السند: يمنع عقدين متزامنين على نفس الرصيد.
  SELECT store_id, customer_id, grain_grade_id, status
    INTO v_store, v_customer, v_grade, v_receipt_status
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake receipt % does not exist', _intake_receipt_id;
  END IF;
  IF v_receipt_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'This intake receipt is cancelled';
  END IF;

  IF _grain_grade_id IS NULL THEN
    RAISE EXCEPTION 'Grain grade is required';
  END IF;

  -- العقد لا يقرر صنفاً غير الصنف المسجَّل في سند الاستلام.
  IF v_grade IS NOT NULL AND v_grade <> _grain_grade_id THEN
    RAISE EXCEPTION
      'The agreement grade does not match the grade recorded on the intake receipt';
  END IF;

  -- الدرجة مطلوبة: هذا الشرط يعالج المشكلة الأصلية (أمر بلا طلب محدد).
  IF _requested_output_type IS NULL OR btrim(_requested_output_type) = '' THEN
    RAISE EXCEPTION
      'The requested output grade is required — record what the customer asked for before quoting a price';
  END IF;

  IF coalesce(_output_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Output bag size must be greater than zero';
  END IF;

  v_src := upper(btrim(COALESCE(_bags_source, 'CUSTOMER')));
  IF v_src NOT IN ('CUSTOMER', 'MILL') THEN
    RAISE EXCEPTION 'bags_source must be CUSTOMER or MILL';
  END IF;

  v_mode := upper(btrim(COALESCE(_delivery_mode, 'FULL')));
  IF v_mode NOT IN ('FULL', 'PARTIAL') THEN
    RAISE EXCEPTION 'delivery_mode must be FULL or PARTIAL';
  END IF;

  -- التسعير: أساس واحد إلزامي بسعر موجب.
  IF _price_basis IS NULL OR upper(btrim(_price_basis)) NOT IN ('BAG', 'TON') THEN
    RAISE EXCEPTION 'price_basis must be BAG or TON — pick exactly one basis';
  END IF;
  v_basis := upper(btrim(_price_basis));

  IF coalesce(_agreed_price, 0) <= 0 THEN
    RAISE EXCEPTION 'An agreed price is required and must be greater than zero';
  END IF;

  IF _service_product_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = _service_product_id AND p.item_nature = 'SERVICE'
    ) THEN
      RAISE EXCEPTION
        'The milling service must be a SERVICE item (item_nature = SERVICE), not a stocked product';
    END IF;
  END IF;

  IF coalesce(_expected_extraction_rate, 80) <= 0
     OR coalesce(_expected_extraction_rate, 80) > 100 THEN
    RAISE EXCEPTION 'Expected extraction rate must be between 0 and 100';
  END IF;
  IF coalesce(_allowed_loss_percentage, 2) < 0
     OR coalesce(_allowed_loss_percentage, 2) > 100 THEN
    RAISE EXCEPTION 'Allowed loss percentage must be between 0 and 100';
  END IF;

  INSERT INTO public.milling_service_agreements (
    store_id, customer_id, intake_receipt_id, grain_grade_id,
    requested_output_type, requested_output_note, output_bag_size_kg,
    bags_source, delivery_mode,
    service_product_id, price_basis, agreed_price,
    expected_extraction_rate, allowed_loss_percentage,
    status, agreed_by, notes
  )
  VALUES (
    v_store, v_customer, _intake_receipt_id, _grain_grade_id,
    _requested_output_type::public.milling_output_type,
    nullif(btrim(COALESCE(_requested_output_note, '')), ''),
    coalesce(_output_bag_size_kg, 50),
    v_src, v_mode,
    _service_product_id, v_basis, coalesce(_agreed_price, 0),
    coalesce(_expected_extraction_rate, 80), coalesce(_allowed_loss_percentage, 2),
    'AGREED', v_user, nullif(btrim(COALESCE(_notes, '')), '')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.agreement.created', 'milling_agreement', v_id,
    jsonb_build_object(
      'intake_receipt_id', _intake_receipt_id,
      'customer_id',      v_customer,
      'grain_grade_id',   _grain_grade_id,
      'requested_output_type', _requested_output_type,
      'bags_source',      v_src,
      'delivery_mode',    v_mode,
      'price_basis',      v_basis,
      'agreed_price',     coalesce(_agreed_price, 0),
      'stock_impact',     'NONE — agreement is a commercial document, not a movement'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_milling_agreement(uuid, uuid, text, text, numeric, text, text, uuid, text, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milling_agreement(uuid, uuid, text, text, numeric, text, text, uuid, text, numeric, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.create_milling_agreement(uuid, uuid, text, text, numeric, text, text, uuid, text, numeric, numeric, numeric, text) IS
  'إنشاء عقد طحن قبل أمر الطحن. يُجبر على درجة الطلب وأساس تسعير واحد بسعر موجب. صفر أثر مخزون.';

-- ---------------------------------------------------------------------------
-- 3. RLS لجدول العقود
-- ---------------------------------------------------------------------------
-- بدون هذا، جدول agreements الجديد غير مقروء من المتصفح: RLS مفعّل
-- افتراضياً على الجداول الجديدة، وبلا سياسة SELECT لا يرى أحد شيئاً.
-- النمط مطابق لجداول milling_* الحالية: قراءة لموظفي المصنع فقط،
-- والكتابة عبر RPC حصراً ( SECURITY DEFINER ).
-- ---------------------------------------------------------------------------
ALTER TABLE public.milling_service_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS milling_agreements_read ON public.milling_service_agreements;
CREATE POLICY milling_agreements_read ON public.milling_service_agreements
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- لا سياسات INSERT/UPDATE/DELETE: الكتابة عبر SECURITY DEFINER RPC فقط.
REVOKE INSERT, UPDATE, DELETE ON public.milling_service_agreements FROM authenticated, anon;
GRANT SELECT ON public.milling_service_agreements TO authenticated;
GRANT ALL ON public.milling_service_agreements TO service_role;

-- ---------------------------------------------------------------------------
-- 4. النتيجة: لا سند بلا درجة
-- ---------------------------------------------------------------------------
-- كل ما سبق يجعل grain_grade_id إلزامياً عملياً عند الاستلام.
-- نُضيف القيد على مستوى الجدول ليُثبَّت في القاعدة لا في الكود.
-- التطبيق آمن: الترحيل أعلاه ربط السندات القائمة، وما تبقّى بلا درجة
-- هو سجل قديم ناقص — لذا نُبلغ ولا نمنع.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_null int;
BEGIN
  SELECT count(*) INTO v_null
  FROM public.milling_intake_receipts
  WHERE grain_grade_id IS NULL;

  IF v_null > 0 THEN
    RAISE NOTICE
      'ℹ % سند استلام بلا درجة مرتبطة — سند قديم. اربطه يدوياً في milling_intake_health.',
      v_null;
  END IF;
END $$;

COMMENT ON COLUMN public.milling_intake_receipts.grain_grade_id IS
  'مرجع الفحص — إلزامي عند الاستلام منذ 20261003040000. grain_type صار مشتقاً منه.';