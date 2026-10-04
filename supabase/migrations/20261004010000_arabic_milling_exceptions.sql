-- ============================================================================
-- 20261004010000_arabic_milling_exceptions.sql
-- تعريب رسائل الأخطاء والاستثناءات في وظائف المطحنة وتأمين الربط التلقائي لدرجة الحبوب
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_milling_intake(
  _store_id            uuid,
  _customer_id         uuid,
  _grain_type          text,
  _grain_product_id    uuid    DEFAULT NULL,
  _grain_grade_id      uuid    DEFAULT NULL,
  _bag_size_kg         numeric DEFAULT 50,
  _bag_count           integer DEFAULT 0,
  _gross_weight_kg     numeric DEFAULT 0,
  _tare_weight_kg      numeric DEFAULT 0,
  _moisture            numeric DEFAULT 0,
  _impurities          numeric DEFAULT 0,
  _truck_plate         text    DEFAULT NULL,
  _driver_name         text    DEFAULT NULL,
  _silo                text    DEFAULT NULL,
  _notes               text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  v_grade_id uuid := _grain_grade_id;
BEGIN
  -- ── الصلاحيات ─────────────────────────────────────────────────────────────
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'المستخدم غير مسجل دخول';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'ليس لديك صلاحية تسجيل استلام أمانات حبوب العملاء';
  END IF;

  -- ── التحقق الأولي ─────────────────────────────────────────────────────────
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'يرجى تحديد المستودع / الصومعة';
  END IF;
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'يرجى تحديد العميل — سند الاستلام وثيقة أمانات عينية';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id AND c.is_active) THEN
    RAISE EXCEPTION 'العميل المحدد غير متاح أو موقوف';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _store_id AND w.is_active) THEN
    RAISE EXCEPTION 'المستودع المحدد غير متاح';
  END IF;

  v_grain := btrim(COALESCE(_grain_type, ''));

  -- ── حل درجة الحبوب تلقائياً إن لم تُرسل صراحة ─────────────────────────────
  IF v_grade_id IS NULL THEN
    -- محاولة العثور بالصنف
    IF _grain_product_id IS NOT NULL THEN
      SELECT id INTO v_grade_id FROM public.milling_grain_grades 
      WHERE product_id = _grain_product_id AND is_active LIMIT 1;
    END IF;

    -- محاولة العثور بالاسم
    IF v_grade_id IS NULL AND v_grain <> '' THEN
      SELECT id INTO v_grade_id FROM public.milling_grain_grades 
      WHERE is_active AND (grade_name_ar ILIKE '%' || v_grain || '%' OR grade_code ILIKE '%' || v_grain || '%')
      LIMIT 1;
    END IF;

    -- استخدام أول درجة نشطة كخيار افتراضي أخير
    IF v_grade_id IS NULL THEN
      SELECT id INTO v_grade_id FROM public.milling_grain_grades 
      WHERE is_active ORDER BY created_at ASC LIMIT 1;
    END IF;
  END IF;

  IF v_grade_id IS NULL THEN
    RAISE EXCEPTION 'نوع ودرجة الحبوب مطلوبة — تحديد درجة الحبوب مطلوب لحساب سعر وتكلفة الطحن لاحقاً';
  END IF;

  SELECT * INTO v_grade
  FROM public.milling_grain_grades
  WHERE id = v_grade_id AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'درجة الحبوب المحددة غير موجودة أو معطلة';
  END IF;

  -- استخدام الاسم العربي المعتمد من الفهرس المرجعي
  v_grain := v_grade.grade_name_ar;

  IF coalesce(_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'سعة الكيس يجب أن تكون أكبر من صفر';
  END IF;
  IF coalesce(_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'عدد الأكياس لا يمكن أن يكون سالباً';
  END IF;
  IF coalesce(_gross_weight_kg, 0) < 0 OR coalesce(_tare_weight_kg, 0) < 0 THEN
    RAISE EXCEPTION 'أوزان الميزان لا يمكن أن تكون سالبة';
  END IF;

  v_net := round(coalesce(_gross_weight_kg, 0) - coalesce(_tare_weight_kg, 0), 3);
  IF v_net <= 0 THEN
    RAISE EXCEPTION 'الوزن الصافي يجب أن يكون أكبر من صفر (القائم: % − الفارغ: % = %)',
      coalesce(_gross_weight_kg, 0), coalesce(_tare_weight_kg, 0), v_net;
  END IF;

  v_nominal := round(coalesce(_bag_count, 0) * coalesce(_bag_size_kg, 0), 3);
  IF v_nominal <= 0 AND v_net <= 0 THEN
    RAISE EXCEPTION 'سند الاستلام يتطلب تحديد عدد أكياس أو وزن صافٍ موجب';
  END IF;

  IF coalesce(_moisture, 0) < 0 OR coalesce(_moisture, 0) > 100 THEN
    RAISE EXCEPTION 'نسبة الرطوبة يجب أن تكون بين 0 و 100';
  END IF;
  IF coalesce(_impurities, 0) < 0 OR coalesce(_impurities, 0) > 100 THEN
    RAISE EXCEPTION 'نسبة الشوائب يجب أن تكون بين 0 و 100';
  END IF;

  -- فحص المطابقة الفنية
  v_check := public.milling_match_grain_grade(v_grade_id, _moisture, _impurities);

  -- ── إصدار المستند ──────────────────────────────────────────────────────────
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
    v_grain, v_grade.product_id, v_grade_id,
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
      'grain_grade_id',  v_grade_id,
      'grain_grade',     v_grade.grade_code,
      'grain_type',      v_grain,
      'bag_count',       coalesce(_bag_count, 0),
      'bag_size_kg',     coalesce(_bag_size_kg, 0),
      'nominal_weight_kg', v_nominal,
      'net_weight_kg',   v_net,
      'technical_check',  v_check,
      'stock_impact',    'NONE — customer custody'
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_milling_intake(uuid, uuid, text, uuid, uuid, numeric, integer, numeric, numeric, numeric, numeric, text, text, text, text) TO authenticated;
