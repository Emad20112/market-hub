-- Negative custody is separate from negative company sales.
-- Only outgoing customer custody deliveries may exceed the customer's balance;
-- intake remains positive and milling input must still be on hand.

ALTER TABLE public.company_settings
  ADD COLUMN allow_negative_custody_delivery boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.company_settings.allow_negative_custody_delivery IS
  'Allows custody delivery documents to create a negative customer-owned balance. Does not affect company inventory, intake, or milling input checks.';

CREATE OR REPLACE FUNCTION public.custody_delivery(
  _customer_id uuid,
  _warehouse_id uuid,
  _lines jsonb,
  _notes text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_doc text;
  v_balance_bags numeric;
  v_balance_kg numeric;
  v_allow_negative boolean := false;
  r record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to record custody deliveries';
  END IF;
  IF _customer_id IS NULL OR _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Customer and warehouse are required';
  END IF;
  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'At least one delivery line is required';
  END IF;

  SELECT coalesce(allow_negative_custody_delivery, false)
    INTO v_allow_negative FROM public.company_settings WHERE id = 1 FOR SHARE;
  v_allow_negative := coalesce(v_allow_negative, false);

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(_lines) AS l(item_id uuid, bags numeric, kg numeric)
     WHERE item_id IS NULL OR (coalesce(bags, 0) <= 0 AND coalesce(kg, 0) <= 0)
        OR coalesce(bags, 0) < 0 OR coalesce(kg, 0) < 0
  ) THEN
    RAISE EXCEPTION 'Every delivery line needs an item and positive non-negative quantities';
  END IF;

  FOR r IN
    SELECT item_id, sum(coalesce(bags, 0)) AS bags, sum(coalesce(kg, 0)) AS kg
    FROM jsonb_to_recordset(_lines) AS l(item_id uuid, bags numeric, kg numeric)
    GROUP BY item_id ORDER BY item_id
  LOOP
    IF r.item_id IS NULL THEN
      RAISE EXCEPTION 'Every delivery line needs an item';
    END IF;
    IF r.bags <= 0 AND r.kg <= 0 THEN
      RAISE EXCEPTION 'Every delivery line needs bags or a positive weight';
    END IF;
    IF r.bags < 0 OR r.kg < 0 THEN
      RAISE EXCEPTION 'Delivery quantities cannot be negative';
    END IF;

    -- Serialize movements for this customer's item balance, including concurrent documents.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      _customer_id::text || ':' || _warehouse_id::text || ':' || r.item_id::text, 0
    ));
    SELECT * FROM public.custody_balance(_customer_id, _warehouse_id, r.item_id)
      INTO v_balance_bags, v_balance_kg;
    IF NOT v_allow_negative AND (r.bags > coalesce(v_balance_bags, 0)
                               OR r.kg > coalesce(v_balance_kg, 0)) THEN
      RAISE EXCEPTION 'Custody balance for item % is less than the requested delivery', r.item_id
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  v_doc := 'CD-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('public.milling_delivery_seq')::text, 4, '0');
  FOR r IN SELECT * FROM jsonb_to_recordset(_lines) AS l(item_id uuid, bags numeric, kg numeric)
  LOOP
    INSERT INTO public.custody_ledger
      (customer_id, warehouse_id, entry_type, item_id, doc_number,
       bags_out, kg_out, notes, created_by)
    VALUES
      (_customer_id, _warehouse_id, 'DELIVERY', r.item_id, v_doc,
       coalesce(r.bags, 0), coalesce(r.kg, 0), _notes, v_user);
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'custody.delivery', 'custody_ledger', _customer_id,
    jsonb_build_object(
      'doc_number', v_doc,
      'lines', _lines,
      'negative_custody_allowed', v_allow_negative,
      'stock_impact', 'NONE — customer custody'
    ));
  RETURN v_doc;
END;
$$;

CREATE OR REPLACE FUNCTION public.milling_document_delivery(
  _document_id uuid,
  _lines jsonb,
  _notes text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_customer_id uuid;
  v_warehouse_id uuid;
  v_status text;
  v_doc text;
  v_has_remaining boolean;
  v_allow_negative boolean := false;
  r record;
  v_bags_balance numeric;
  v_kg_balance numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to deliver milling documents';
  END IF;
  SELECT customer_id, warehouse_id, status
    INTO v_customer_id, v_warehouse_id, v_status
    FROM public.milling_service_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Milling service document does not exist'; END IF;
  IF v_status <> 'PROCESSED' THEN RAISE EXCEPTION 'Record milling outputs before delivery'; END IF;
  SELECT coalesce(allow_negative_custody_delivery, false)
    INTO v_allow_negative FROM public.company_settings WHERE id = 1 FOR SHARE;
  v_allow_negative := coalesce(v_allow_negative, false);

  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'At least one delivery line is required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(_lines) AS l(item_id uuid, bags numeric, kg numeric)
     WHERE item_id IS NULL OR (coalesce(bags, 0) <= 0 AND coalesce(kg, 0) <= 0)
        OR coalesce(bags, 0) < 0 OR coalesce(kg, 0) < 0
  ) THEN
    RAISE EXCEPTION 'Every delivery line needs an item and positive non-negative quantities';
  END IF;
  FOR r IN
    SELECT item_id, sum(coalesce(bags, 0)) AS bags, sum(coalesce(kg, 0)) AS kg
    FROM jsonb_to_recordset(_lines) AS l(item_id uuid, bags numeric, kg numeric)
    GROUP BY item_id ORDER BY item_id
  LOOP
    IF r.item_id IS NULL OR (r.bags <= 0 AND r.kg <= 0) OR r.bags < 0 OR r.kg < 0 THEN
      RAISE EXCEPTION 'Every delivery line needs an item and positive non-negative quantities';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.custody_ledger
       WHERE milling_document_id = _document_id AND item_id = r.item_id
         AND entry_type = 'MILLING' AND (bags_in > 0 OR kg_in > 0)
    ) THEN
      RAISE EXCEPTION 'Delivery item % is not an output of this milling document', r.item_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT v_allow_negative THEN
      SELECT coalesce(sum(bags_in - bags_out), 0), coalesce(sum(kg_in - kg_out), 0)
        INTO v_bags_balance, v_kg_balance
        FROM public.custody_ledger
       WHERE milling_document_id = _document_id AND item_id = r.item_id;
      IF r.bags > v_bags_balance OR r.kg > v_kg_balance THEN
        RAISE EXCEPTION 'Delivery quantity is not available on this milling document'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  v_doc := public.custody_delivery(v_customer_id, v_warehouse_id, _lines, _notes);
  UPDATE public.custody_ledger SET milling_document_id = _document_id
   WHERE doc_number = v_doc AND entry_type = 'DELIVERY';

  SELECT EXISTS (
    SELECT 1 FROM public.custody_ledger
     WHERE milling_document_id = _document_id
     GROUP BY item_id
    HAVING sum(bags_in - bags_out) > 0 OR sum(kg_in - kg_out) > 0
  ) INTO v_has_remaining;
  IF NOT v_has_remaining THEN
    UPDATE public.milling_service_documents
       SET status = 'DELIVERED', delivered_at = now()
     WHERE id = _document_id;
  END IF;
  RETURN v_doc;
END;
$$;
