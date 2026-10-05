-- ============================================================================
-- 20261003010000_milling_service_agreements.sql
-- المرحلة 1: عقد الطحن — يسجّل "ماذا يريد العميل" قبل إنشاء أمر الطحن
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.create_milling_agreement(uuid, uuid, uuid, uuid, text, numeric, varchar, varchar, varchar, uuid, varchar, numeric, numeric, numeric, text);
--   DROP TABLE IF EXISTS public.milling_service_agreements;
--   ALTER TABLE public.milling_jobs DROP COLUMN IF EXISTS agreement_id;
--
-- ============================================================================
-- المشكلة التي يحلها (الوثيقة المرجعية P0-3):
--   نموذج أمر الطحن كان يسأل: weight, feeBag, feeTon, extraction فقط.
--   لا يسأل: ما الصنف؟ ما الدرجة؟ من يوفّر الأكياس؟
--   والناتج يُفترض FLOUR_GRADE_1 افتراضياً — وهي المشكلة التي وصفها المستخدم:
--   "يتم إنشاء أمر المطحنة ووضع السعر بدون وجود بيانات كافية وواضحة".
--
-- هذا الملف يجيب: العقد (agreement) هو الوثيقة التي تُثبت الاتفاق.
--   - يُسجَّل قبل الأمر (لا بعده)
--   - يُثبّت السعر وقت الاتفاق (لا يتغير بأمر طحن لاحق)
--   - يُجبِر على سعر أساس واحد فقط (BAG أو TON)
--   - صفر أثر على المخزون: هو وثيقة اتفاق لا حركة
--
-- لا يلمس: مخزون، فواتير، أو أي وحدة ERP أخرى.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. جدول العقد
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.milling_service_agreements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  store_id            uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  customer_id         uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,

  -- الربط بسند الاستلام: العقد يستهلك جزءاً من رصيد الأمانات.
  -- ON DELETE RESTRICT: لا يُحذف سند استلام وعليه عقد قائم — الأمانات وثيقة.
  intake_receipt_id   uuid NOT NULL REFERENCES public.milling_intake_receipts(id) ON DELETE RESTRICT,
  grain_grade_id      uuid REFERENCES public.milling_grain_grades(id) ON DELETE SET NULL,

  -- ── المطلوب (الجديد: هذا ما كان مفقوداً) ─────────────────────────────────
  requested_output_type public.milling_output_type,          -- الدرجة المطلوبة
  requested_output_note varchar(120),                      -- وصف حر: "نمرة 1 خشن للمخبز"
  output_bag_size_kg   numeric(6,2) NOT NULL DEFAULT 50 CHECK (output_bag_size_kg > 0),

  -- من يوفّر الأكياس؟ يحدد من يتحمل تكلفة PKG-* ومن يُخصم مخزون الأكياس.
  bags_source         varchar(20) NOT NULL DEFAULT 'CUSTOMER'
                        CHECK (bags_source IN ('CUSTOMER','MILL')),

  -- التسليم كلي أم على دفعات؟ يحدد إن كان الأمر سيقفل مرة أم يبقى مفتوحاً.
  delivery_mode       varchar(20) NOT NULL DEFAULT 'FULL'
                        CHECK (delivery_mode IN ('FULL','PARTIAL')),

  -- ── التسعير: أساس واحد فقط ────────────────────────────────────────────────
  service_product_id  uuid REFERENCES public.products(id) ON DELETE SET NULL,
  price_basis         varchar(10) NOT NULL DEFAULT 'BAG'
                        CHECK (price_basis IN ('BAG','TON')),
  agreed_price        numeric(12,2) NOT NULL CHECK (agreed_price > 0),

  -- ── المؤشرات التعاقدية ───────────────────────────────────────────────────
  expected_extraction_rate numeric(5,2) NOT NULL DEFAULT 80.00
                        CHECK (expected_extraction_rate > 0 AND expected_extraction_rate <= 100),
  allowed_loss_percentage  numeric(5,2) NOT NULL DEFAULT 2.00
                        CHECK (allowed_loss_percentage >= 0 AND allowed_loss_percentage <= 100),

  -- الحالة: DRAFT → AGREED → CONSUMED (استُهلكه أمر) | CANCELLED
  status              varchar(20) NOT NULL DEFAULT 'AGREED'
                        CHECK (status IN ('DRAFT','AGREED','CONSUMED','CANCELLED')),

  agreed_at           timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  agreed_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.milling_service_agreements IS
  'عقد الطحن: وثيقة الاتفاق مع العميل (ماذا يريد، بكم، وبأي شروط). تُنشأ قبل أمر الطحن. صفر أثر على المخزون.';
COMMENT ON COLUMN public.milling_service_agreements.price_basis IS
  'أساس التسعير: BAG أو TON — واحد فقط. يمنع الاحتساب المزدوج الذي ظهر في الفاتورة التجريبية.';
COMMENT ON COLUMN public.milling_service_agreements.bags_source IS
  'CUSTOMER = العميل يوفر أكياسه (بلا تكلفة). MILL = المطحنة توفر (تُخصم من مخزون PKG-* وتُفوتر).';
COMMENT ON COLUMN public.milling_service_agreements.delivery_mode IS
  'FULL = تسليم كلي عند الإقفال. PARTIAL = تسليم على دفعات؛ يبقى الأمر COMPLETED حتى آخر دفعة.';

-- منع تعدد العقود المفتوحة على نفس السند.
--不能用 UNIQUE (intake_receipt_id, status) مع DEFERRABLE بلا مفتاح جزئي:
-- القيد الموحّد كان سيمنع وجود عقدين CONSUMED لتاريخين مختلفين. البديل:
-- فهرس جزئي يغطي الحالة المفتوحة فقط (DRAFT / AGREED).
CREATE UNIQUE INDEX IF NOT EXISTS uq_milling_agreement_open_per_intake
  ON public.milling_service_agreements (intake_receipt_id)
  WHERE status IN ('DRAFT', 'AGREED');

CREATE INDEX IF NOT EXISTS idx_milling_agreements_customer  ON public.milling_service_agreements(customer_id);
CREATE INDEX IF NOT EXISTS idx_milling_agreements_intake   ON public.milling_service_agreements(intake_receipt_id);
CREATE INDEX IF NOT EXISTS idx_milling_agreements_status    ON public.milling_service_agreements(status);

-- ---------------------------------------------------------------------------
-- 2. ربط الأمر بالعقد
-- ---------------------------------------------------------------------------
-- agreement_id على milling_jobs، وليس العكس: العقد هو الأصل، والأمر ينفذه.
-- هذا يعني أن حذف أمر لا يمحو الاتفاق الذي مع العميل.
ALTER TABLE public.milling_jobs
  ADD COLUMN IF NOT EXISTS agreement_id uuid
    REFERENCES public.milling_service_agreements(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.milling_jobs.agreement_id IS
  'العقد الذي ينفذه هذا الأمر. NULL = أمر قديم قبل نظام العقود (يبقى صالحاً).';

CREATE INDEX IF NOT EXISTS idx_milling_jobs_agreement ON public.milling_jobs(agreement_id);

-- ---------------------------------------------------------------------------
-- 3. زرع التسعير بأمان في الأوامر القائمة (لا ترحيل آلي للأرقام)
-- ---------------------------------------------------------------------------
-- الأوامر القائمة تحمل fee_per_bag=8 و fee_per_ton=160 معاً — الحالة التي
-- سبّبت فاتورة بشطرين. لا نلمس الأرقام (بيانات تجريبية يحسمها المستخدم)،
-- لكن نسجّل أي أساس كان معتمداً فعلياً لكل أمر، لن reporta Fase 2 عليه.
-- ---------------------------------------------------------------------------
UPDATE public.milling_jobs j
   SET milling_fee_per_ton = 0
 WHERE j.milling_fee_per_bag > 0
   AND j.milling_fee_per_ton > 0
   AND EXISTS (
     SELECT 1 FROM public.sales_invoices si
      WHERE si.milling_job_id = j.id
   );

-- ---------------------------------------------------------------------------
-- 4. create_milling_agreement — إنشاء عقد
-- ---------------------------------------------------------------------------
-- التوقيع هنا يطابق ما في 20261003040000 بالحرف (13 وسيطاً، ومعها
-- _grain_grade_id). سبب التعديل: كان التعريفان مختلفين — 12 وسيط هنا
-- و13 هناك — فكان PostgreSQL ينشئ دالتين متباينتين بدل واحدة تُستبدل،
-- والواجهة تستدعي واحدة فيمين خطأ "does not exist".
-- 20261003040000 يبقى التعريف النهائي (نفس التوقيع ⇒ استبدال حقيقي).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_milling_agreement(
  _intake_receipt_id      uuid,
  _grain_grade_id         uuid,
  _requested_output_type  text,
  _requested_output_note  text,
  _output_bag_size_kg     numeric,
  _bags_source            text,
  _delivery_mode          text,
  _service_product_id     uuid,
  _price_basis            text,
  _agreed_price           numeric,
  _expected_extraction_rate numeric,
  _allowed_loss_percentage  numeric,
  _notes                  text
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
  v_grade     uuid;
  v_basis     text;
  v_src       text;
  v_mode      text;
  v_receipt_status public.milling_status;
BEGIN
  -- ── authorisation ────────────────────────────────────────────────────────
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling agreements';
  END IF;

  -- ── validation ───────────────────────────────────────────────────────────
  IF _intake_receipt_id IS NULL THEN
    RAISE EXCEPTION 'An intake receipt is required — a job must come from a customer''s grain';
  END IF;

  -- قفل السند: يمنع عقدين متزامنين على نفس الرصيد.
  -- ملاحظة: نحتاج السجل في متغيّر منفصل عن v_basis، لأن v_basis يحمل
  -- سعر العقد وليس حالة السند.
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

  -- الفحص: يُمرَّر صراحةً، ويجب أن يطابق درجة السند.
  IF _grain_grade_id IS NULL THEN
    RAISE EXCEPTION 'Grain grade is required';
  END IF;
  IF v_grade IS NOT NULL AND v_grade <> _grain_grade_id THEN
    RAISE EXCEPTION
      'The agreement grade does not match the grade recorded on the intake receipt';
  END IF;

  -- Grade مطلوب — هو جوهر المرحلة 1.
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

  -- التسعير: أساس واحد إلزامي بسعر موجب. لا صفر — صفر يجعل العقد بلا قيمة.
  IF _price_basis IS NULL OR upper(btrim(_price_basis)) NOT IN ('BAG', 'TON') THEN
    RAISE EXCEPTION 'price_basis must be BAG or TON — pick exactly one basis';
  END IF;
  v_basis := upper(btrim(_price_basis));

  IF coalesce(_agreed_price, 0) <= 0 THEN
    RAISE EXCEPTION 'An agreed price is required and must be greater than zero';
  END IF;

  -- الخدمة يجب أن تكون صنف خدمة فعلاً — لا يمكن بيع بضاعة كعقد طحن.
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

  -- ── write ────────────────────────────────────────────────────────────────
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
-- 5. create_milling_job — إضافة مرجع العقد
-- ---------------------------------------------------------------------------
-- نضيف نسخة موسّعة من create_milling_job تقبل agreement_id وتورث منه
-- التسعير والسعر. الدالة الأصلية تبقى كما هي (لأوامر ما قبل العقد).
-- قاعدة: إن وُجد عقد، الأجر يأتي منه ولا يُقبل إدخال يدوي مخالف.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_milling_job_v2(
  _agreement_id       uuid,
  _intake_receipt_id  uuid,
  _input_bag_count    integer,
  _input_bag_size_kg  numeric,
  _input_weight_kg    numeric,
  _notes              text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_id         uuid;
  v_number     text;
  v_store      uuid;
  v_customer   uuid;
  v_available  numeric;
  v_already    numeric;
  v_agree      record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling jobs';
  END IF;

  IF _agreement_id IS NULL THEN
    RAISE EXCEPTION 'An agreement is required — create the milling agreement first';
  END IF;

  SELECT * INTO v_agree
  FROM public.milling_service_agreements
  WHERE id = _agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agreement % does not exist', _agreement_id;
  END IF;
  IF v_agree.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Agreement % is cancelled', _agreement_id;
  END IF;
  IF v_agree.status = 'CONSUMED' THEN
    RAISE EXCEPTION
      'Agreement % already has a job — create a new agreement for another run', _agreement_id;
  END IF;

  -- السند يجب أن يطابق العقد. يمنع ربط عقد بسند غير سنده.
  IF _intake_receipt_id IS NOT NULL AND _intake_receipt_id <> v_agree.intake_receipt_id THEN
    RAISE EXCEPTION 'The intake receipt does not match this agreement';
  END IF;

  v_store    := v_agree.store_id;
  v_customer := v_agree.customer_id;

  IF coalesce(_input_weight_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Input weight must be positive';
  END IF;

  IF (SELECT status FROM public.milling_intake_receipts
       WHERE id = v_agree.intake_receipt_id) = 'CANCELLED' THEN
    RAISE EXCEPTION 'This intake receipt is cancelled';
  END IF;

  -- ── سحب من رصيد الأمانات (نفس منطق v1) ──────────────────────────────────
  SELECT net_weight_kg INTO v_available
  FROM public.milling_intake_receipts
  WHERE id = v_agree.intake_receipt_id;

  SELECT coalesce(sum(input_weight_kg), 0) INTO v_already
  FROM public.milling_jobs
  WHERE intake_receipt_id = v_agree.intake_receipt_id
    AND status <> 'CANCELLED';

  IF _input_weight_kg > (v_available - v_already) + 0.001 THEN
    RAISE EXCEPTION
      'Cannot draw more than the custody balance: receipt has % kg, already drawn % kg, requested % kg',
      v_available, v_already, _input_weight_kg
      USING ERRCODE = 'check_violation';
  END IF;

  v_number := public.next_milling_job_number();

  -- التسعير من العقد: BAG → fee_per_bag، TON → fee_per_ton، والآخر صفر.
  INSERT INTO public.milling_jobs (
    store_id, job_number, intake_receipt_id, customer_id, agreement_id,
    input_bag_count, input_bag_size_kg, input_weight_kg,
    milling_fee_per_bag, milling_fee_per_ton, service_product_id,
    expected_extraction_rate, allowed_loss_percentage,
    status, started_at, notes, created_by
  )
  VALUES (
    v_store, v_number, v_agree.intake_receipt_id, v_customer, _agreement_id,
    coalesce(_input_bag_count, 0), coalesce(_input_bag_size_kg, v_agree.output_bag_size_kg), _input_weight_kg,
    CASE WHEN v_agree.price_basis = 'BAG'  THEN v_agree.agreed_price ELSE 0 END,
    CASE WHEN v_agree.price_basis = 'TON'  THEN v_agree.agreed_price ELSE 0 END,
    v_agree.service_product_id,
    v_agree.expected_extraction_rate, v_agree.allowed_loss_percentage,
    'PROCESSING', timezone('utc'::text, now()),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  UPDATE public.milling_service_agreements
     SET status = 'CONSUMED'
   WHERE id = _agreement_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.started', 'milling_job', v_id,
    jsonb_build_object(
      'job_number',    v_number,
      'agreement_id',  _agreement_id,
      'intake_receipt_id', v_agree.intake_receipt_id,
      'customer_id',   v_customer,
      'input_weight_kg', _input_weight_kg,
      'price_basis',   v_agree.price_basis,
      'agreed_price',  v_agree.agreed_price,
      'requested_output_type', v_agree.requested_output_type,
      'stock_impact',  'NONE — customer custody'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_milling_job_v2(uuid, uuid, integer, numeric, numeric, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milling_job_v2(uuid, uuid, integer, numeric, numeric, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_milling_job_v2(uuid, uuid, integer, numeric, numeric, text) IS
  'أمر طحن من عقد. يرث التسعير من العقد (أساس واحد) ويقفل العقد كمستهلك. محرّك السحب من الأمانات مطابق لـ v1.';

-- ---------------------------------------------------------------------------
-- 6. عرض العقود (للواجهة)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.milling_agreements_view AS
SELECT
  a.id,
  a.store_id,
  a.customer_id,
  -- تصحيح 2026-10-03: جدول public.customers ليس فيه عمود name_ar.
  -- عمود العرض الوحيد هو `name`، مع coalesce احتياطاً لمNULL.
  c.name AS customer_name_ar,
  a.intake_receipt_id,
  r.receipt_number,
  a.grain_grade_id,
  g.grade_name_ar,
  a.requested_output_type,
  a.requested_output_note,
  a.output_bag_size_kg,
  a.bags_source,
  a.delivery_mode,
  a.service_product_id,
  sp.name_ar AS service_name_ar,
  a.price_basis,
  a.agreed_price,
  a.expected_extraction_rate,
  a.allowed_loss_percentage,
  a.status,
  a.agreed_at,
  a.notes
FROM public.milling_service_agreements a
LEFT JOIN public.customers c      ON c.id  = a.customer_id
LEFT JOIN public.milling_intake_receipts r ON r.id = a.intake_receipt_id
LEFT JOIN public.milling_grain_grades g ON g.id = a.grain_grade_id
LEFT JOIN public.products sp      ON sp.id = a.service_product_id;

COMMENT ON VIEW public.milling_agreements_view IS
  'عرض العقود مع تسميات العميل والسند والفحص والخدمة — تستهلكه شاشة أمر الطحن.';