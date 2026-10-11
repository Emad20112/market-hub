-- Customer collections must never silently turn into advances.
--
-- Ordinary receipt vouchers are capped by the selected invoice or the customer's
-- total outstanding invoices. An advance remains possible, but only through the
-- separate, explicitly selected RPC below.

CREATE OR REPLACE FUNCTION public.record_customer_payment(
  _customer_id uuid,
  _invoice_id uuid,
  _amount numeric,
  _method text,
  _payment_date date,
  _note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_invoice record;
  v_remaining numeric := round(coalesce(_amount, 0), 2);
  v_allocation numeric;
  v_outstanding numeric := 0;
  v_customer_balance numeric := 0;
  v_stored_method text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'accountant')
    OR public.has_role(v_user, 'cashier')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to record customer payments';
  END IF;

  IF _customer_id IS NULL OR v_remaining <= 0 THEN
    RAISE EXCEPTION 'A customer and a positive amount are required';
  END IF;

  v_stored_method := public.resolve_writable_payment_method(
    _method, 'customer_collection', true
  );

  -- The customer row is the serialisation lock for all receipts for that
  -- customer. It prevents two concurrent collections from both consuming the
  -- same outstanding balance.
  SELECT balance
    INTO v_customer_balance
  FROM public.customers
  WHERE id = _customer_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer is unavailable';
  END IF;

  IF _invoice_id IS NOT NULL THEN
    SELECT id, total, paid, customer_id
      INTO v_invoice
    FROM public.sales_invoices
    WHERE id = _invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice not found';
    END IF;
    IF v_invoice.customer_id IS DISTINCT FROM _customer_id THEN
      RAISE EXCEPTION 'Invoice does not belong to this customer';
    END IF;
    IF v_invoice.total - v_invoice.paid <= 0 THEN
      RAISE EXCEPTION 'Invoice has no outstanding balance';
    END IF;
    IF v_remaining > v_invoice.total - v_invoice.paid THEN
      RAISE EXCEPTION 'Payment exceeds the invoice outstanding balance';
    END IF;

    INSERT INTO public.customer_payments (
      customer_id, invoice_id, amount, payment_method, payment_date, note, created_by
    ) VALUES (
      _customer_id, _invoice_id, v_remaining, v_stored_method::public.payment_method,
      coalesce(_payment_date, current_date), nullif(trim(_note), ''), v_user
    ) RETURNING id INTO v_id;

    INSERT INTO public.customer_ledger(
      customer_id, entry_type, credit, reference_id, reference_type,
      occurred_at, created_by, source_key, note
    ) VALUES (
      _customer_id, 'payment', v_remaining, v_id, 'customer_payment',
      coalesce(_payment_date, current_date)::timestamptz, v_user,
      'payment:' || v_id, coalesce(nullif(trim(_note), ''), 'دفعة عميل')
    );

    UPDATE public.sales_invoices
    SET paid = paid + v_remaining,
        status = CASE
          WHEN paid + v_remaining >= total THEN 'paid'::public.invoice_status
          ELSE 'partial'::public.invoice_status
        END,
        updated_at = now()
    WHERE id = _invoice_id;
  ELSE
    -- No selected invoice: consume the oldest receivables first. Check the
    -- aggregate BEFORE allocating so no residual can accidentally become an
    -- advance payment.
    SELECT coalesce(sum(total - paid), 0)
      INTO v_outstanding
    FROM public.sales_invoices
    WHERE customer_id = _customer_id
      AND total > paid
      AND status NOT IN ('cancelled'::public.invoice_status, 'returned'::public.invoice_status);

    -- A legacy customer can have a genuine opening balance with no individual
    -- invoice rows. It remains collectible up to that balance, but never gets
    -- silently classified as an advance.
    IF v_outstanding <= 0 AND v_customer_balance <= 0 THEN
      RAISE EXCEPTION 'Customer has no outstanding balance. Record an explicit advance payment instead.';
    END IF;
    IF v_outstanding > 0 AND v_remaining > v_outstanding THEN
      RAISE EXCEPTION 'Payment exceeds the customer outstanding balance';
    END IF;

    IF v_outstanding <= 0 THEN
      IF v_remaining > v_customer_balance THEN
        RAISE EXCEPTION 'Payment exceeds the customer outstanding balance';
      END IF;
      INSERT INTO public.customer_payments (
        customer_id, invoice_id, amount, payment_method, payment_date, note, created_by
      ) VALUES (
        _customer_id, NULL, v_remaining, v_stored_method::public.payment_method,
        coalesce(_payment_date, current_date),
        coalesce(nullif(trim(_note), ''), 'سداد رصيد غير مرتبط بفاتورة'), v_user
      ) RETURNING id INTO v_id;

      INSERT INTO public.customer_ledger(
        customer_id, entry_type, credit, reference_id, reference_type,
        occurred_at, created_by, source_key, note
      ) VALUES (
        _customer_id, 'payment', v_remaining, v_id, 'customer_payment',
        coalesce(_payment_date, current_date)::timestamptz, v_user,
        'payment:' || v_id, coalesce(nullif(trim(_note), ''), 'سداد رصيد غير مرتبط بفاتورة')
      );
      v_remaining := 0;
    END IF;

    FOR v_invoice IN
      SELECT id, total, paid
      FROM public.sales_invoices
      WHERE customer_id = _customer_id
        AND total > paid
        AND status NOT IN ('cancelled'::public.invoice_status, 'returned'::public.invoice_status)
      ORDER BY created_at, id
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_allocation := least(v_remaining, v_invoice.total - v_invoice.paid);

      INSERT INTO public.customer_payments (
        customer_id, invoice_id, amount, payment_method, payment_date, note, created_by
      ) VALUES (
        _customer_id, v_invoice.id, v_allocation, v_stored_method::public.payment_method,
        coalesce(_payment_date, current_date), nullif(trim(_note), ''), v_user
      ) RETURNING id INTO v_id;

      INSERT INTO public.customer_ledger(
        customer_id, entry_type, credit, reference_id, reference_type,
        occurred_at, created_by, source_key, note
      ) VALUES (
        _customer_id, 'payment', v_allocation, v_id, 'customer_payment',
        coalesce(_payment_date, current_date)::timestamptz, v_user,
        'payment:' || v_id, coalesce(nullif(trim(_note), ''), 'دفعة عميل')
      );

      UPDATE public.sales_invoices
      SET paid = paid + v_allocation,
          status = CASE
            WHEN paid + v_allocation >= total THEN 'paid'::public.invoice_status
            ELSE 'partial'::public.invoice_status
          END,
          updated_at = now()
      WHERE id = v_invoice.id;

      v_remaining := v_remaining - v_allocation;
    END LOOP;
  END IF;

  UPDATE public.customers
  SET balance = round(coalesce(balance, 0) - _amount, 2), updated_at = now()
  WHERE id = _customer_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    v_user, 'customer_payment.recorded', 'customer', _customer_id,
    jsonb_build_object(
      'invoice_id', _invoice_id,
      'amount', _amount,
      'method', v_stored_method,
      'payment_date', coalesce(_payment_date, current_date),
      'allocation', CASE WHEN _invoice_id IS NULL THEN 'oldest_first' ELSE 'selected_invoice' END
    )
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_customer_advance_payment(
  _customer_id uuid,
  _amount numeric,
  _method text,
  _payment_date date,
  _note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_stored_method text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'accountant')
    OR public.has_role(v_user, 'cashier')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to record customer payments';
  END IF;
  IF _customer_id IS NULL OR coalesce(_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'A customer and a positive advance amount are required';
  END IF;

  v_stored_method := public.resolve_writable_payment_method(
    _method, 'customer_collection', true
  );

  PERFORM 1 FROM public.customers
  WHERE id = _customer_id AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer is unavailable';
  END IF;

  INSERT INTO public.customer_payments (
    customer_id, invoice_id, amount, payment_method, payment_date, note, created_by
  ) VALUES (
    _customer_id, NULL, round(_amount, 2), v_stored_method::public.payment_method,
    coalesce(_payment_date, current_date),
    coalesce(nullif(trim(_note), ''), 'دفعة مقدمة'), v_user
  ) RETURNING id INTO v_id;

  UPDATE public.customers
  SET balance = round(coalesce(balance, 0) - _amount, 2), updated_at = now()
  WHERE id = _customer_id;

  INSERT INTO public.customer_ledger(
    customer_id, entry_type, credit, reference_id, reference_type,
    occurred_at, created_by, source_key, note
  ) VALUES (
    _customer_id, 'credit', round(_amount, 2), v_id, 'customer_payment',
    coalesce(_payment_date, current_date)::timestamptz, v_user,
    'advance-payment:' || v_id, coalesce(nullif(trim(_note), ''), 'دفعة مقدمة')
  );

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    v_user, 'customer_advance_payment.recorded', 'customer', _customer_id,
    jsonb_build_object('amount', _amount, 'method', v_stored_method, 'payment_date', coalesce(_payment_date, current_date))
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_payment(uuid, uuid, numeric, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid, uuid, numeric, text, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_customer_advance_payment(uuid, numeric, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_advance_payment(uuid, numeric, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.record_customer_payment(uuid, uuid, numeric, text, date, text) IS
  'تحصيل مستحقات فقط: يمنع التجاوز ويوزع تلقائياً من أقدم الفواتير إلى الأحدث.';
COMMENT ON FUNCTION public.record_customer_advance_payment(uuid, numeric, text, date, text) IS
  'دفعة مقدمة صريحة للعميل؛ لا تسدد فواتير قائمة تلقائياً.';
