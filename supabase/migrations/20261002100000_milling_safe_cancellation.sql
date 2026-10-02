-- ============================================================================
-- إلغاء آمن لمستندات المطحنة قبل بدء الأثر التشغيلي
-- ============================================================================
-- لا يُحذف سند الاستلام أو أمر الطحن. الإلغاء يحفظ رقم المستند وسجل المراجعة.
-- لا يُسمح بإلغاء أمر له نواتج أو فاتورة أو إذن تسليم؛ تلك الحالات تحتاج عكساً
-- محاسبياً/عينياً صريحاً ولا يجوز إخفاؤها بتغيير الحالة فقط.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_milling_job(
  _job_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_job public.milling_jobs%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to cancel milling jobs';
  END IF;
  IF nullif(btrim(coalesce(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  SELECT * INTO v_job
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_job.status NOT IN ('RECEIVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'Only an uncompleted milling job can be cancelled (current status: %)', v_job.status;
  END IF;
  IF EXISTS (SELECT 1 FROM public.milling_job_outputs WHERE job_id = _job_id) THEN
    RAISE EXCEPTION 'Cannot cancel a job after outputs were recorded; post a documented correction instead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_invoices WHERE milling_job_id = _job_id)
     OR EXISTS (SELECT 1 FROM public.milling_delivery_notes WHERE job_id = _job_id) THEN
    RAISE EXCEPTION 'Cannot cancel a job with an invoice or delivery';
  END IF;

  UPDATE public.milling_jobs
  SET status = 'CANCELLED',
      notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'سبب الإلغاء: ' || btrim(_reason))
  WHERE id = _job_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.cancelled', 'milling_job', _job_id,
    jsonb_build_object(
      'job_number', v_job.job_number,
      'reason', btrim(_reason),
      'custody_effect', 'The input becomes available again on its intake receipt',
      'stock_impact', 'NONE'
    ));
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_milling_intake(
  _receipt_id uuid,
  _reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_receipt public.milling_intake_receipts%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to cancel intake receipts';
  END IF;
  IF nullif(btrim(coalesce(_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A cancellation reason is required';
  END IF;

  SELECT * INTO v_receipt
  FROM public.milling_intake_receipts
  WHERE id = _receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake receipt % does not exist', _receipt_id;
  END IF;
  IF v_receipt.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Intake receipt % is already cancelled', v_receipt.receipt_number;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.milling_jobs
    WHERE intake_receipt_id = _receipt_id AND status <> 'CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel an intake receipt after a milling job has started';
  END IF;

  UPDATE public.milling_intake_receipts
  SET status = 'CANCELLED',
      notes = concat_ws(E'\n', nullif(btrim(notes), ''), 'سبب الإلغاء: ' || btrim(_reason))
  WHERE id = _receipt_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.intake.cancelled', 'milling_intake_receipt', _receipt_id,
    jsonb_build_object(
      'receipt_number', v_receipt.receipt_number,
      'reason', btrim(_reason),
      'stock_impact', 'NONE — customer custody document cancelled before use'
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_milling_job(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_milling_intake(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_milling_job(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_milling_intake(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.cancel_milling_job(uuid, text) IS
  'إلغاء محفوظ لأمر قبل تسجيل أي ناتج أو فاتورة أو تسليم؛ يعيد كمية السند إلى المتاح من دون مساس بالمخزون.';
COMMENT ON FUNCTION public.cancel_milling_intake(uuid, text) IS
  'إلغاء محفوظ لسند استلام لم يبدأ منه أي أمر فعال؛ لا حذف ولا أثر مالي أو مخزني.';
