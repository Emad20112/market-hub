CREATE OR REPLACE FUNCTION public.add_milling_output(_job_id uuid, _output_type text, _bag_size_kg numeric, _produced_bag_count integer, _produced_weight_kg numeric, _bags_source text, _mill_bag_product_id uuid, _mill_bags_used integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_id     uuid;
  v_status public.milling_status;
  v_src    varchar(20);
  v_bags   integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to record milling outputs';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF _output_type IS NULL OR btrim(_output_type) = '' THEN
    RAISE EXCEPTION 'Output type is required';
  END IF;

  SELECT status INTO v_status
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status IN ('COMPLETED', 'DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Job % is % and can no longer be edited', _job_id, v_status;
  END IF;

  IF coalesce(_produced_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Produced bag count cannot be negative';
  END IF;
  IF coalesce(_produced_weight_kg, 0) < 0 THEN
    RAISE EXCEPTION 'Produced weight cannot be negative';
  END IF;
  IF coalesce(_produced_bag_count, 0) = 0 AND coalesce(_produced_weight_kg, 0) = 0 THEN
    RAISE EXCEPTION 'An output line needs at least one bag or a positive weight';
  END IF;
  IF coalesce(_bag_size_kg, 0) <= 0 THEN
    RAISE EXCEPTION 'Output bag size must be greater than zero';
  END IF;

  v_src := upper(btrim(COALESCE(_bags_source, 'CUSTOMER')));
  IF v_src NOT IN ('CUSTOMER', 'MILL') THEN
    RAISE EXCEPTION 'bags_source must be CUSTOMER or MILL';
  END IF;

  v_bags := coalesce(_mill_bags_used, 0);
  IF v_src = 'MILL' THEN
    -- If the operator did not say how many bags were consumed, the produced bag
    -- count is the only sensible answer.
    IF v_bags = 0 THEN
      v_bags := coalesce(_produced_bag_count, 0);
    END IF;
    IF _mill_bag_product_id IS NULL THEN
      RAISE EXCEPTION 'MILL-supplied packaging requires the packaging item (PKG-*)';
    END IF;
    IF v_bags <= 0 THEN
      RAISE EXCEPTION 'MILL-supplied packaging requires a positive bag count';
    END IF;
  ELSE
    v_bags := 0;
  END IF;

  -- Upsert on (job_id, output_type): correct in place.
  INSERT INTO public.milling_job_outputs (
    job_id, output_type, bag_size_kg,
    produced_bag_count, produced_weight_kg,
    bags_source, mill_bag_product_id, mill_bags_used
  )
  VALUES (
    _job_id, _output_type::public.milling_output_type, coalesce(_bag_size_kg, 0),
    coalesce(_produced_bag_count, 0), coalesce(_produced_weight_kg, 0),
    v_src, _mill_bag_product_id, v_bags
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_id
  FROM public.milling_job_outputs
  WHERE job_id = _job_id
    AND output_type = _output_type::public.milling_output_type
  FOR UPDATE;

  -- Never let a correction reduce the delivered quantity — that would hand back
  -- custody the customer already physically took away.
  IF coalesce(
       (SELECT delivered_bag_count FROM public.milling_job_outputs WHERE id = v_id), 0
     ) > coalesce(_produced_bag_count, 0) THEN
    RAISE EXCEPTION
      'Cannot reduce produced bags below the % already delivered for this output',
      (SELECT delivered_bag_count FROM public.milling_job_outputs WHERE id = v_id);
  END IF;

  UPDATE public.milling_job_outputs
  SET bag_size_kg        = coalesce(_bag_size_kg, 0),
      produced_bag_count = coalesce(_produced_bag_count, 0),
      produced_weight_kg = coalesce(_produced_weight_kg, 0),
      bags_source        = v_src,
      mill_bag_product_id = _mill_bag_product_id,
      mill_bags_used     = v_bags
  WHERE id = v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.output.recorded', 'milling_output', v_id,
    jsonb_build_object(
      'job_id', _job_id,
      'output_type', _output_type,
      'produced_bag_count', coalesce(_produced_bag_count, 0),
      'produced_weight_kg', coalesce(_produced_weight_kg, 0),
      'bags_source', v_src,
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.add_production_output(_order_id uuid, _product_id uuid, _qty numeric, _output_role text DEFAULT 'PRIMARY'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord    record;
  v_cls    public.item_class;
  v_policy public.inventory_policy;
  v_mid    uuid;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to receive production output';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is % and cannot receive output', v_ord.order_number, v_ord.status;
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Output quantity must be greater than zero';
  END IF;
  IF _output_role NOT IN ('PRIMARY','BY_PRODUCT') THEN
    RAISE EXCEPTION 'Output role must be PRIMARY or BY_PRODUCT';
  END IF;

  SELECT p.item_class, p.inventory_policy INTO v_cls, v_policy
    FROM public.products p WHERE p.id = _product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Output item not found';
  END IF;

  -- A produced output must be something the mill can actually hold. A service
  -- or an untracked item cannot be received into stock.
  IF v_cls IN ('SERVICE','NON_STOCK_ITEM') OR v_policy = 'UNTRACKED' THEN
    RAISE EXCEPTION 'Item % cannot be produced into stock (class %, policy %)',
      _product_id, v_cls, v_policy;
  END IF;

  -- Unit cost is deliberately zero here: the joint cost is only known at
  -- completion. Valuing the output now would mean inventing a cost per kilo.
  PERFORM public.post_stock_delta(
    p_product_id => _product_id, p_warehouse_id => v_ord.warehouse_id,
    p_signed_qty => _qty, p_unit_cost => 0,
    p_movement_kind => 'RECEIPT', p_source_type => 'production_receipt',
    p_source_id => _order_id, p_note => 'ناتج إنتاج ' || v_ord.order_number,
    p_owner_type => 'COMPANY', p_owner_id => NULL);

  v_mid := public.production_last_movement(_product_id, v_ord.warehouse_id, _order_id);

  INSERT INTO public.production_order_outputs
    (order_id, product_id, output_role, planned_qty, actual_qty, movement_id)
  VALUES (_order_id, _product_id, _output_role, 0, _qty, v_mid)
  ON CONFLICT (order_id, product_id, output_role) DO UPDATE
    SET actual_qty  = public.production_order_outputs.actual_qty + EXCLUDED.actual_qty,
        movement_id = EXCLUDED.movement_id;

  UPDATE public.production_orders o
     SET actual_output_qty = coalesce((SELECT sum(actual_qty) FROM public.production_order_outputs WHERE order_id = _order_id), 0),
         status            = CASE WHEN o.status = 'PLANNED' THEN 'ISSUED' ELSE o.status END
   WHERE o.id = _order_id;
  RETURN v_mid;
END $function$


CREATE OR REPLACE FUNCTION public.adjust_loyalty(_customer uuid, _points numeric, _kind text, _note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID; v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_staff(v_user) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _kind NOT IN ('earn','redeem','adjust') THEN RAISE EXCEPTION 'Invalid kind'; END IF;

  INSERT INTO public.loyalty_transactions(customer_id, points, kind, note, created_by)
  VALUES (_customer, _points, _kind, _note, v_user)
  RETURNING id INTO v_id;

  UPDATE public.customers
    SET loyalty_points = GREATEST(loyalty_points + (CASE WHEN _kind='redeem' THEN -ABS(_points) ELSE ABS(_points) END), 0),
        updated_at = now()
    WHERE id = _customer;

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.apply_cost_movement(p_product_id uuid, p_warehouse_id uuid, p_signed_qty numeric, p_incoming_cost numeric DEFAULT NULL::numeric, p_source_type text DEFAULT NULL::text, p_source_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_owner_type owner_type DEFAULT 'COMPANY'::owner_type, p_owner_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := auth.uid();
  v_method   public.costing_method := public.company_costing_method();
  v_qty0     numeric := 0;
  v_val0     numeric := 0;
  v_in_cost  numeric;
  v_out_cost numeric;
  v_qty1     numeric;
  v_val1     numeric;
  v_standard numeric;
  v_pending  integer;
BEGIN
  IF p_signed_qty IS NULL OR p_signed_qty = 0 THEN
    RETURN;  -- nothing to value; not an error
  END IF;
  IF p_product_id IS NULL OR p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Item and location are required to value a movement';
  END IF;

  SELECT cl.quantity, cl.total_value
    INTO v_qty0, v_val0
    FROM public.item_cost_layers cl
   WHERE cl.product_id   = p_product_id
     AND cl.warehouse_id = p_warehouse_id
     AND cl.owner_type   = p_owner_type
     AND cl.owner_id IS NOT DISTINCT FROM p_owner_id
   FOR UPDATE;

  v_qty0 := coalesce(v_qty0, 0);
  v_val0 := coalesce(v_val0, 0);
  v_qty1 := round(v_qty0 + p_signed_qty, 3);

  IF p_signed_qty > 0 THEN
    IF v_method = 'STANDARD' THEN
      SELECT p.standard_cost INTO v_standard
        FROM public.products p WHERE p.id = p_product_id;

      IF v_standard IS NULL OR v_standard = 0 THEN
        -- Name how many items are blocking, so the operator is not left with
        -- one error per receipt and no idea of the size of the job.
        SELECT count(*)::int INTO v_pending
          FROM public.standard_cost_readiness;
        RAISE EXCEPTION
          'Standard cost is not set for this item (%). % more tracked item(s) also lack one - see standard_cost_readiness.',
          p_product_id, v_pending;
      END IF;

      v_in_cost := v_standard;
    ELSE
      v_in_cost := coalesce(
        p_incoming_cost,
        CASE WHEN v_qty0 > 0 THEN round(v_val0 / v_qty0, 4) END,
        (SELECT p.cost_price FROM public.products p WHERE p.id = p_product_id),
        0
      );
    END IF;

    v_val1 := v_val0 + round(p_signed_qty * v_in_cost, 2);

  ELSE
    IF v_qty0 <= 0 THEN
      v_out_cost := coalesce(
        (SELECT p.standard_cost FROM public.products p
          WHERE p.id = p_product_id AND v_method = 'STANDARD'),
        (SELECT p.cost_price FROM public.products p WHERE p.id = p_product_id),
        0
      );
    ELSE
      v_out_cost := round(v_val0 / v_qty0, 4);
    END IF;

    v_val1 := v_val0 - round(abs(p_signed_qty) * v_out_cost, 2);
    IF v_qty1 <= 0 OR v_val1 < 0 THEN
      v_val1 := 0;
    END IF;
  END IF;

  INSERT INTO public.item_cost_layers
    (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
     valuation_method, last_unit_cost, last_movement_at, updated_at)
  VALUES
    (p_product_id, p_warehouse_id, p_owner_type, p_owner_id, v_qty1, v_val1,
     v_method,
     coalesce(p_incoming_cost, v_in_cost, v_out_cost, 0),
     now(), now())
  ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
  DO UPDATE SET quantity         = EXCLUDED.quantity,
                total_value      = EXCLUDED.total_value,
                valuation_method = EXCLUDED.valuation_method,
                last_unit_cost   = EXCLUDED.last_unit_cost,
                last_movement_at = now(),
                updated_at       = now();

  -- The ledger records what was ACTUALLY paid, never the valuation it was
  -- given. Under STANDARD the two differ, and that gap IS the variance the
  -- method exists to expose.
  INSERT INTO public.item_cost_transactions
    (product_id, warehouse_id, owner_type, owner_id, direction, quantity,
     unit_cost, value, method, quantity_before, value_before,
     quantity_after, value_after, source_type, source_id, note)
  VALUES
    (p_product_id, p_warehouse_id, p_owner_type, p_owner_id,
     CASE WHEN p_signed_qty > 0 THEN 'IN' ELSE 'OUT' END,
     abs(p_signed_qty),
     coalesce(p_incoming_cost, 0),
     round(abs(p_signed_qty) * coalesce(p_incoming_cost, 0), 2),
     v_method, v_qty0, v_val0, v_qty1, v_val1,
     p_source_type, p_source_id, p_note);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'cost.movement_applied', 'product', p_product_id,
    jsonb_build_object(
      'warehouse_id', p_warehouse_id, 'method', v_method,
      'direction', CASE WHEN p_signed_qty > 0 THEN 'IN' ELSE 'OUT' END,
      'quantity', abs(p_signed_qty),
      'actual_cost', coalesce(p_incoming_cost, 0),
      'valuation_cost', coalesce(v_in_cost, v_out_cost, 0),
      'quantity_after', v_qty1, 'value_after', v_val1,
      'source_type', p_source_type, 'source_id', p_source_id));
END $function$


CREATE OR REPLACE FUNCTION public.approve_item_policy_change(_item_id uuid, _new_nature item_nature, _new_policy inventory_policy, _new_costing costing_method, _new_tracking item_tracking, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_before  jsonb;
  v_after   jsonb;
  v_product public.products%ROWTYPE;
  v_balance numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'Only an owner or manager may approve an item policy change';
  END IF;

  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A written reason is required for every policy change';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item % does not exist', _item_id;
  END IF;

  -- ------------------------------------------------------------------ rules
  -- Rule 2: a SERVICE is not a way to switch stock off, and it can never hold
  -- a stock balance. Allowing SERVICE + TRACKED would resurrect the exact
  -- workaround this project is removing.
  IF _new_nature = 'SERVICE' AND _new_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'A SERVICE can only be UNTRACKED';
  END IF;

  IF _new_policy = 'UNTRACKED' AND _new_tracking <> 'NONE' THEN
    RAISE EXCEPTION 'An UNTRACKED item cannot require batch or serial tracking';
  END IF;

  IF _new_costing = 'NONE' AND _new_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'Costing method NONE is only valid for an UNTRACKED item';
  END IF;

  -- Moving a good OUT of tracking while it still holds stock would orphan that
  -- stock. The operator must clear the balance first (sell it, adjust it to
  -- zero, or move it to a customer-owned position) so the numbers stay honest.
  SELECT coalesce(sum(i.quantity), 0)
    INTO v_balance
  FROM public.inventory i
  WHERE i.product_id = _item_id
    AND i.owner_type = 'COMPANY'
    AND i.owner_id IS NULL;

  IF _new_policy <> 'TRACKED'
     AND v_product.inventory_policy = 'TRACKED'
     AND v_balance <> 0 THEN
    RAISE EXCEPTION
      'Item % still holds % units. Clear the balance with an adjustment before leaving TRACKED.',
      _item_id, v_balance;
  END IF;

  -- A tracked item needs a costing method that can actually value it.
  IF _new_policy = 'TRACKED' AND _new_costing = 'NONE' THEN
    RAISE EXCEPTION 'A TRACKED item requires a costing method other than NONE';
  END IF;

  v_before := jsonb_build_object(
    'item_nature', v_product.item_nature,
    'inventory_policy', v_product.inventory_policy,
    'costing_method', v_product.costing_method,
    'tracking', v_product.tracking
  );
  v_after := jsonb_build_object(
    'item_nature', _new_nature,
    'inventory_policy', _new_policy,
    'costing_method', _new_costing,
    'tracking', _new_tracking
  );

  -- Open the guard for this transaction only. set_config(..., true) is
  -- transaction-scoped, so the exemption cannot leak to another statement.
  PERFORM set_config('app.allow_policy_change', 'on', true);

  UPDATE public.products
  SET item_nature      = _new_nature,
      inventory_policy = _new_policy,
      costing_method   = _new_costing,
      tracking         = _new_tracking,
      updated_at       = now()
  WHERE id = _item_id;

  RETURN public.audit_item_policy_snapshot(
    _item_id,
    'item_policy.changed',
    v_before,
    v_after,
    btrim(_reason)
  );
END $function$


CREATE OR REPLACE FUNCTION public.audit_item_policy_snapshot(p_item_id uuid, p_action text, p_before jsonb, p_after jsonb, p_source text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    auth.uid(),
    p_action,
    'product_policy',
    p_item_id,
    jsonb_build_object(
      'before', p_before,
      'after', p_after,
      'source_document', p_source,
      'recorded_at', now()
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.bootstrap_first_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'owner')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.can_operate_milling()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_staff(auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role IN ('owner', 'manager', 'warehouse')
     );
$function$


CREATE OR REPLACE FUNCTION public.can_read_expense_entry(p_entry_id uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.can_read_finance(p_user)
      OR (public.is_staff(p_user) AND EXISTS (
            SELECT 1 FROM public.expense_entries e
            WHERE e.id = p_entry_id AND e.created_by = p_user))
$function$


CREATE OR REPLACE FUNCTION public.can_read_finance(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_staff(p_user) AND public.expense_role_rank(p_user) >= 30
$function$


CREATE OR REPLACE FUNCTION public.can_view_milling()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_staff(auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
         AND ur.role IN ('owner', 'manager', 'accountant', 'warehouse')
     );
$function$


CREATE OR REPLACE FUNCTION public.cancel_expense(p_entry_id uuid, p_reason text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.expense_actor();
  v_entry public.expense_entries;
  v_from  public.expense_status;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  v_from := v_entry.status;

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when cancelling an expense' USING ERRCODE = '22023';
  END IF;

  IF v_from IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED') THEN
    RAISE EXCEPTION 'A posted expense cannot be cancelled — reverse it instead'
      USING ERRCODE = '55000';
  END IF;

  IF v_from = 'CANCELLED' THEN
    RETURN v_entry;   -- idempotent
  END IF;

  IF v_from NOT IN ('DRAFT', 'REJECTED', 'SUBMITTED', 'APPROVED') THEN
    RAISE EXCEPTION 'This expense cannot be cancelled from status %', v_from
      USING ERRCODE = '55000';
  END IF;

  -- Cancelling someone else's submitted document is a management decision, not
  -- a data-entry correction.
  IF NOT (v_entry.created_by = v_user AND v_from IN ('DRAFT', 'REJECTED')) THEN
    PERFORM public.expense_assert_capability(v_user, 'expense.cancel');
  ELSE
    PERFORM public.expense_assert_capability(v_user, 'expense.edit');
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.expense_entries
     SET status        = 'CANCELLED',
         cancelled_by  = v_user,
         cancelled_at  = now(),
         cancel_reason = nullif(btrim(p_reason), ''),
         version       = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'cancelled', v_from, 'CANCELLED', p_reason, v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.cancel_milling_intake(_receipt_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.cancel_milling_job(_job_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.close_expense(p_entry_id uuid)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.expense_actor();
  v_entry public.expense_entries;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.post');

  IF v_entry.status = 'CLOSED' THEN
    RETURN v_entry;
  END IF;
  IF v_entry.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'Only a posted expense can be closed (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;
  IF v_entry.remaining_amount > 0.005 THEN
    RAISE EXCEPTION 'This expense still has % outstanding', v_entry.remaining_amount
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.expense_entries
     SET status = 'CLOSED', version = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'closed', 'PAID', 'CLOSED', NULL, v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.company_costing_method()
 RETURNS costing_method
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT costing_method FROM public.company_costing_settings WHERE id = 1),
    'MOVING_AVERAGE'::public.costing_method
  );
$function$


CREATE OR REPLACE FUNCTION public.complete_milling_job(_job_id uuid, _notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_status     public.milling_status;
  v_input      numeric;
  v_outputs    numeric;
  v_allowed_pct numeric;
  v_actual     numeric;
  v_allowed    numeric;
  v_excess     numeric;
  v_expected   numeric;
  v_rate       numeric;
  v_outputs_bags integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to complete milling jobs';
  END IF;
  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;

  SELECT status, input_weight_kg, allowed_loss_percentage, expected_extraction_rate
    INTO v_status, v_input, v_allowed_pct, v_expected
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;
  IF v_status = 'COMPLETED' OR v_status = 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % is already closed', _job_id;
  END IF;
  IF v_status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Job % is cancelled', _job_id;
  END IF;

  SELECT coalesce(sum(produced_weight_kg), 0), coalesce(sum(produced_bag_count), 0)
    INTO v_outputs, v_outputs_bags
  FROM public.milling_job_outputs
  WHERE job_id = _job_id;

  IF v_outputs <= 0 THEN
    RAISE EXCEPTION 'Record at least one output before closing job %', _job_id;
  END IF;

  -- More output than input is impossible: refuse rather than post a negative loss.
  IF v_outputs > v_input + 0.001 THEN
    RAISE EXCEPTION
      'Output weight % kg exceeds the input weight % kg — check the recorded quantities',
      v_outputs, v_input
      USING ERRCODE = 'check_violation';
  END IF;

  v_actual  := round(v_input - v_outputs, 3);
  v_allowed := round(v_input * v_allowed_pct / 100, 3);
  v_excess  := round(greatest(v_actual - v_allowed, 0), 3);
  v_rate    := CASE WHEN v_input > 0 THEN round(v_outputs * 100 / v_input, 2) ELSE 0 END;

  UPDATE public.milling_jobs
  SET status        = 'COMPLETED',
      actual_loss_kg = v_actual,
      loss_excess_kg = v_excess,
      finished_at   = timezone('utc'::text, now()),
      notes          = coalesce(nullif(btrim(COALESCE(_notes, '')), ''), notes)
  WHERE id = _job_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.completed', 'milling_job', _job_id,
    jsonb_build_object(
      'input_weight_kg', v_input,
      'total_output_weight_kg', v_outputs,
      'total_output_bags', v_outputs_bags,
      'actual_loss_kg', v_actual,
      'allowed_loss_kg', v_allowed,
      'allowed_loss_percentage', v_allowed_pct,
      'loss_excess_kg', v_excess,
      'actual_extraction_rate', v_rate,
      'expected_extraction_rate', v_expected,
      'loss_exceeds_allowance', v_excess > 0,
      'stock_impact', 'NONE — customer custody'
    ));

  -- Returned so the UI can show the operator the numbers that were just
  -- committed, instead of re-deriving them and risking a mismatch.
  RETURN jsonb_build_object(
    'job_id', _job_id,
    'input_weight_kg', v_input,
    'total_output_weight_kg', v_outputs,
    'total_output_bags', v_outputs_bags,
    'actual_loss_kg', v_actual,
    'allowed_loss_kg', v_allowed,
    'loss_excess_kg', v_excess,
    'actual_extraction_rate', v_rate,
    'expected_extraction_rate', v_expected,
    'loss_exceeds_allowance', v_excess > 0
  );
END $function$


CREATE OR REPLACE FUNCTION public.complete_production_order(_order_id uuid, _overhead_cost numeric DEFAULT 0, _direct_labour numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_ord  record;
  v_in   numeric; v_out numeric; v_loss numeric; v_gap numeric;
  v_mat  numeric; v_total numeric; v_basis text;
  v_byprod_value numeric := 0;
  v_primary_share numeric;
  v_primary_qty numeric;
  v_byprod_qty numeric := 0;
  v_allocated numeric := 0;
  r record;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to complete production orders';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is already %', v_ord.order_number, v_ord.status;
  END IF;

  v_in   := coalesce((SELECT sum(actual_qty) FROM public.production_order_materials WHERE order_id = _order_id), 0);
  v_out  := coalesce((SELECT sum(actual_qty) FROM public.production_order_outputs   WHERE order_id = _order_id), 0);
  v_loss := coalesce((SELECT sum(qty)           FROM public.production_order_losses   WHERE order_id = _order_id), 0);
  v_mat  := coalesce((SELECT sum(total_cost)   FROM public.production_order_materials WHERE order_id = _order_id), 0);

  IF v_in <= 0 THEN
    RAISE EXCEPTION 'Nothing was issued on this order, so there is nothing to complete';
  END IF;

  v_gap := v_in - v_out - v_loss;
  IF v_gap < -0.001 THEN
    RAISE EXCEPTION
      'Output and loss exceed input by %. Unbalanced: in %, out %, loss %',
      abs(v_gap), v_in, v_out, v_loss;
  END IF;

  v_total := round(v_mat + coalesce(_direct_labour,0) + coalesce(_overhead_cost,0), 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Production cost is zero, so no output can be valued';
  END IF;

  v_basis := v_ord.allocation_basis;

  -- ── how much the by-products may claim ──
  IF v_basis IN ('NET_REALISABLE_VALUE','RELATIVE_SALES_VALUE') THEN
    SELECT round(coalesce(sum(o.actual_qty * coalesce(p.sale_price, 0)), 0), 2) INTO v_byprod_value
      FROM public.production_order_outputs o
      JOIN public.products p ON p.id = o.product_id
     WHERE o.order_id = _order_id AND o.output_role = 'BY_PRODUCT';

    -- A by-product cannot be worth more than the production it came from. That
    -- means the sale prices are wrong, or the outputs overlap.
    IF v_byprod_value > v_total THEN
      IF v_basis = 'NET_REALISABLE_VALUE' THEN
        RAISE EXCEPTION
          'By-product realisable value (%.2f) exceeds total production cost (%.2f). '
          'Either the sale prices are wrong or the outputs overlap.', v_byprod_value, v_total;
      END IF;
      v_byprod_value := v_total;
    END IF;
  END IF;

  -- The by-product's realisable value IS its full sale value - 200 kg of bran
  -- at 10 is 2000, not 41.7% of it. The credit is therefore divided among the
  -- by-products themselves by weight, and the primary takes what is left.
  --
  -- Pro-rating against the TOTAL output quantity was wrong: it gave each
  -- by-product only its fraction of the total quantity and then handed the
  -- primary the entire remainder, so the two together came to less than the
  -- production cost by the by-products' share of the primary's weight.
  SELECT coalesce(sum(actual_qty), 0) INTO v_byprod_qty
    FROM public.production_order_outputs
   WHERE order_id = _order_id AND output_role = 'BY_PRODUCT';

  FOR r IN
    SELECT id, actual_qty FROM public.production_order_outputs
     WHERE order_id = _order_id AND output_role = 'BY_PRODUCT'
  LOOP
    UPDATE public.production_order_outputs
       SET total_cost = round(v_byprod_value * r.actual_qty / nullif(v_byprod_qty, 0), 2),
           unit_cost  = CASE WHEN r.actual_qty > 0
                             THEN round(v_byprod_value * r.actual_qty / nullif(v_byprod_qty, 0) / r.actual_qty, 4)
                             ELSE 0 END
     WHERE id = r.id;
  END LOOP;

  -- What is left for the primary - the REMAINDER, not the total. Giving the
  -- primary v_total while the by-products also carry a credit allocated the
  -- same cost twice, and the sum of the outputs then exceeded the production
  -- cost it was supposed to come from.
  v_primary_share := v_total - v_byprod_value;

  SELECT coalesce(sum(actual_qty), 0) INTO v_primary_qty
    FROM public.production_order_outputs WHERE order_id = _order_id AND output_role = 'PRIMARY';

  IF v_primary_qty <= 0 THEN
    RAISE EXCEPTION 'No primary output was received, so the production cost has nowhere to go';
  END IF;

  FOR r IN
    SELECT id, actual_qty FROM public.production_order_outputs
     WHERE order_id = _order_id AND output_role = 'PRIMARY'
  LOOP
    UPDATE public.production_order_outputs
       SET total_cost = round(v_primary_share * r.actual_qty / v_primary_qty, 2),
           unit_cost  = CASE WHEN r.actual_qty > 0
                             THEN round(v_primary_share / v_primary_qty, 4)
                             ELSE 0 END
     WHERE id = r.id;
  END LOOP;

  -- ── the arithmetic must close ──
  -- A rounding remainder of a riyal is normal; anything larger means the
  -- allocation itself is wrong, and failing here is far better than discovering
  -- it in a financial report months later.
  SELECT coalesce(sum(total_cost), 0) INTO v_allocated
    FROM public.production_order_outputs WHERE order_id = _order_id;
  IF abs(v_allocated - v_total) > 0.05 THEN
    RAISE EXCEPTION
      'Allocated output cost (%.2f) does not match total production cost (%.2f) under basis %. '
      'The allocation is inconsistent.', v_allocated, v_total, v_basis;
  END IF;

  -- Write the allocated cost into the cost layer for the stock already received
  FOR r IN
    SELECT o.product_id, o.actual_qty, o.total_cost
      FROM public.production_order_outputs o WHERE o.order_id = _order_id
  LOOP
    INSERT INTO public.item_cost_layers
      (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
       valuation_method, last_unit_cost, last_movement_at, updated_at)
    VALUES
      (r.product_id, v_ord.warehouse_id, 'COMPANY', NULL, r.actual_qty, r.total_cost,
       v_ord.costing_method,
       CASE WHEN r.actual_qty > 0 THEN round(r.total_cost / r.actual_qty, 4) ELSE 0 END,
       now(), now())
    ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
    DO UPDATE SET total_value      = round(public.item_cost_layers.total_value + EXCLUDED.total_value, 2),
                  last_unit_cost   = CASE WHEN public.item_cost_layers.quantity > 0
                                          THEN round((public.item_cost_layers.total_value + EXCLUDED.total_value)
                                                     / public.item_cost_layers.quantity, 4)
                                          ELSE EXCLUDED.last_unit_cost END,
                  valuation_method = EXCLUDED.valuation_method,
                  updated_at       = now();
  END LOOP;

  -- The unreconciled remainder is recorded, not absorbed.
  IF v_gap > 0.001 THEN
    INSERT INTO public.production_order_losses (order_id, reason, qty, value, notes, created_by)
    VALUES (_order_id, 'فرق غير مفسّر (لم يُسجَّل سببه)', v_gap,
            round(v_gap * CASE WHEN v_in > 0 THEN v_mat / v_in ELSE 0 END, 2),
            'الفرق بين الداخل والناتج المسجَّل: لم يُخصم له سبب، ويحتاج مراجعة.', v_user);
  END IF;

  UPDATE public.production_orders
     SET material_cost    = v_mat,
         direct_labour    = round(coalesce(_direct_labour,0), 2),
         overhead_cost    = round(coalesce(_overhead_cost,0), 2),
         total_cost       = v_total,
         costing_method   = public.company_costing_method(),
         status           = 'COMPLETED',
         completed_by     = v_user,
         completed_at     = now(),
         actual_yield_pct = CASE WHEN v_in > 0 THEN round(v_out * 100 / v_in, 3) END
   WHERE id = _order_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'production.order_completed', 'production_order', _order_id,
    jsonb_build_object(
      'order_number',     v_ord.order_number,
      'input_qty',        v_in, 'output_qty', v_out, 'loss_qty', v_loss,
      'unreconciled',     round(v_gap, 3),
      'material_cost',    v_mat, 'total_cost', v_total,
      'allocation_basis', v_basis,
      'by_product_credit', v_byprod_value,
      'primary_share',    v_primary_share));

  RETURN _order_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_expense(p_lines jsonb, p_expense_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT NULL::date, p_entry_type expense_entry_type DEFAULT 'DIRECT'::expense_entry_type, p_payee_type expense_payee_type DEFAULT 'NONE'::expense_payee_type, p_payee_name text DEFAULT NULL::text, p_supplier_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_tax_mode expense_tax_mode DEFAULT 'NONE'::expense_tax_mode, p_reference text DEFAULT NULL::text, p_submit boolean DEFAULT false)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.expense_actor();
  v_entry  public.expense_entries;
  v_total  numeric;
  v_count  integer;
  v_ref    text;
  v_status public.expense_status;
  v_currency text;
  v_symbol   text;
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.create');

  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Expense date is required' USING ERRCODE = '22023';
  END IF;
  -- Plan §10: the three dates are distinct concepts; a due date before the
  -- occurrence would make the ageing report negative from day one.
  IF p_due_date IS NOT NULL AND p_due_date < p_expense_date THEN
    RAISE EXCEPTION 'Due date cannot precede the expense date' USING ERRCODE = '22023';
  END IF;

  -- The payee triple is validated in SQL as well as by the table constraint, so
  -- the caller gets a readable message instead of a constraint name.
  IF p_payee_type = 'SUPPLIER' AND p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'A supplier payee requires a supplier' USING ERRCODE = '22023';
  END IF;
  IF p_payee_type = 'EMPLOYEE' AND p_employee_id IS NULL THEN
    RAISE EXCEPTION 'An employee payee requires a staff member' USING ERRCODE = '22023';
  END IF;

  -- Currency is snapshotted at creation (Phase 1 rationale): a later change to
  -- the company currency must not re-label a historical voucher.
  SELECT COALESCE(NULLIF(btrim(currency), ''), 'YER'),
         COALESCE(NULLIF(btrim(currency_symbol), ''), '﷼')
    INTO v_currency, v_symbol
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;
  v_currency := COALESCE(v_currency, 'YER');
  v_symbol   := COALESCE(v_symbol, '﷼');

  -- `submit` is offered as a flag because the common real-world action is
  -- "record it and send it for approval", and doing that in two round-trips is
  -- how a document ends up stranded in DRAFT.
  v_status := CASE WHEN p_submit THEN 'SUBMITTED'::public.expense_status
                   ELSE 'DRAFT'::public.expense_status END;

  v_ref := COALESCE(
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    public.next_expense_reference()
  );

  INSERT INTO public.expense_entries (
    reference, entry_type, status, source_kind,
    payee_type, payee_name, supplier_id, employee_id,
    warehouse_id, cost_center_id, project_id,
    expense_date, due_date,
    description, note,
    tax_mode, currency, currency_symbol,
    created_by, submitted_by, submitted_at
  )
  VALUES (
    v_ref, p_entry_type, v_status, 'MANUAL',
    p_payee_type,
    nullif(btrim(coalesce(p_payee_name, '')), ''),
    CASE WHEN p_payee_type = 'SUPPLIER' THEN p_supplier_id END,
    CASE WHEN p_payee_type = 'EMPLOYEE' THEN p_employee_id END,
    p_warehouse_id, p_cost_center_id, p_project_id,
    p_expense_date, p_due_date,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_tax_mode, v_currency, v_symbol,
    v_user,
    CASE WHEN p_submit THEN v_user END,
    CASE WHEN p_submit THEN now() END
  )
  RETURNING * INTO v_entry;

  SELECT o_total, o_count INTO v_total, v_count
  FROM public.expense_write_lines(v_entry.id, p_lines, p_tax_mode);

  -- The line trigger already synced these; the assignment is explicit so the
  -- RETURNING value below is correct without a second read.
  UPDATE public.expense_entries
     SET total_amount = v_total,
         line_count   = v_count
   WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(
    v_entry.id, 'created', NULL, v_status,
    CASE WHEN p_submit THEN 'Created and submitted' ELSE 'Created as draft' END, v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.create_journal_entry(p_memo text, p_entry_date date DEFAULT CURRENT_DATE, p_source_type text DEFAULT NULL::text, p_source_id uuid DEFAULT NULL::uuid, p_is_system boolean DEFAULT false, p_lines jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_num  text;
  v_d    numeric := 0;
  v_c    numeric := 0;
  src    jsonb;
  v_missing integer;
  v_blocked integer;
  v_sideless text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_memo IS NULL OR btrim(p_memo) = '' THEN
    RAISE EXCEPTION 'A journal entry needs a description';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A journal entry needs at least two lines - one to debit and one to credit';
  END IF;

  -- A line must carry exactly one side. Checked up front, before the entry
  -- header is written, so a rejected line never leaves a DRAFT entry behind
  -- in the table for someone to find later and wonder about.
  SELECT string_agg(coalesce(ln->>'account_code', '?'), '، ') INTO v_sideless
    FROM jsonb_array_elements(p_lines) AS ln
   WHERE coalesce((ln->>'debit')::numeric, 0) = 0
     AND coalesce((ln->>'credit')::numeric, 0) = 0;
  IF v_sideless IS NOT NULL THEN
    RAISE EXCEPTION
      'Line(s) % carry neither a debit nor a credit. Every line must have exactly one side.',
      v_sideless;
  END IF;

  v_num := public.next_journal_number(coalesce(p_entry_date, CURRENT_DATE));

  INSERT INTO public.journal_entries
    (entry_number, entry_date, memo, source_type, source_id, is_system, created_by)
  VALUES (v_num, coalesce(p_entry_date, CURRENT_DATE), btrim(p_memo),
          p_source_type, p_source_id, p_is_system, v_user)
  RETURNING id INTO v_id;

  FOR src IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_d := v_d + coalesce((src->>'debit')::numeric, 0);
    v_c := v_c + coalesce((src->>'credit')::numeric, 0);
  END LOOP;

  IF v_d <> v_c THEN
    RAISE EXCEPTION
      'Entry does not balance: debits % vs credits % (difference %). An entry that cannot balance is not an entry.',
      round(v_d, 2)::text, round(v_c, 2)::text, round(v_d - v_c, 2)::text;
  END IF;
  IF v_d <= 0 THEN
    RAISE EXCEPTION 'Entry total must be greater than zero';
  END IF;

  -- The two failure modes are reported separately: "code does not exist" sends
  -- the operator hunting for a typo when the code was real and simply not
  -- postable, and that misdirection costs more than the extra check.
  SELECT count(*) FILTER (WHERE a.id IS NULL),
         count(*) FILTER (WHERE a.id IS NOT NULL AND NOT a.is_postable)
    INTO v_missing, v_blocked
    FROM jsonb_array_elements(p_lines) AS ln
    LEFT JOIN public.accounts a ON a.code = ln->>'account_code';

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'One or more account codes do not exist. Check the code before posting.';
  END IF;
  IF v_blocked > 0 THEN
    RAISE EXCEPTION
      'One or more accounts is not postable directly (a contra or clearing account). Post through the account that moves it.';
  END IF;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, memo, partner_type, partner_id)
  SELECT v_id, a.id,
         coalesce((ln->>'debit')::numeric, 0),
         coalesce((ln->>'credit')::numeric, 0),
         nullif(btrim(coalesce(ln->>'memo','')), ''),
         nullif(btrim(coalesce(ln->>'partner_type','')), ''),
         (ln->>'partner_id')::uuid
    FROM jsonb_array_elements(p_lines) AS ln
    JOIN public.accounts a ON a.code = ln->>'account_code'
   WHERE (ln->>'debit')::numeric IS DISTINCT FROM 0
      OR (ln->>'credit')::numeric IS DISTINCT FROM 0;

  IF (SELECT count(*) FROM public.journal_lines WHERE entry_id = v_id)
     <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'One or more lines could not be written';
  END IF;

  UPDATE public.journal_entries
     SET total_debit = v_d, total_credit = v_c, status = 'POSTED',
         posted_by = v_user, posted_at = now()
   WHERE id = v_id;

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_milling_agreement(_intake_receipt_id uuid, _grain_grade_id uuid, _requested_output_type text, _requested_output_note text, _output_bag_size_kg numeric, _bags_source text, _delivery_mode text, _service_product_id uuid, _price_basis text, _agreed_price numeric, _expected_extraction_rate numeric, _allowed_loss_percentage numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$


CREATE OR REPLACE FUNCTION public.create_milling_intake(_store_id uuid, _customer_id uuid, _grain_type text, _grain_product_id uuid, _grain_grade_id uuid, _bag_size_kg numeric, _bag_count integer, _gross_weight_kg numeric, _tare_weight_kg numeric, _moisture numeric, _impurities numeric, _truck_plate text, _driver_name text, _silo text, _notes text, _bag_type text DEFAULT 'شوال خيش طبيعي 50 كجم'::text, _bag_source text DEFAULT 'CUSTOMER'::text, _bag_condition text DEFAULT 'سليم ومحكم'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_number  text;
  v_net     numeric;
  v_nominal numeric;
  v_grain   text;
  v_grade   record;
  v_check   jsonb;
  v_source  text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to receive customer custody grain';
  END IF;

  -- ── validation, before anything is written ──────────────────────────────
  IF _store_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;
  IF _customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required - this receipt is a custody document';
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

  -- ── the reference inspection ─────────────────────────────────────────────
  IF _grain_grade_id IS NULL THEN
    RAISE EXCEPTION
      'Grain grade is required - the grade determines the milling price later';
  END IF;

  SELECT g.id, g.grade_name_ar, g.max_moisture, g.max_impurities, g.default_bag_size_kg,
         g.default_bag_type
    INTO v_grade
    FROM public.milling_grain_grades g
   WHERE g.id = _grain_grade_id AND g.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected grain grade is unavailable';
  END IF;

  -- grain_type is DERIVED from the grade, never taken from the browser. That
  -- is what stopped the same physical grain being recorded two ways.
  v_grain := v_grade.grade_name_ar;

  IF _bag_count IS NULL OR _bag_count <= 0 THEN
    RAISE EXCEPTION 'Bag count must be greater than zero';
  END IF;
  IF _bag_size_kg IS NULL OR _bag_size_kg <= 0 THEN
    RAISE EXCEPTION 'Bag size must be greater than zero';
  END IF;
  IF _gross_weight_kg IS NULL OR _tare_weight_kg IS NULL THEN
    RAISE EXCEPTION 'Gross and tare weights are required from the scale';
  END IF;

  -- Net weight is derived on the server, never accepted from the browser.
  v_net := _gross_weight_kg - COALESCE(_tare_weight_kg, 0);
  IF v_net <= 0 THEN
    RAISE EXCEPTION 'Net weight must be greater than zero (gross %, tare %)',
      _gross_weight_kg, _tare_weight_kg;
  END IF;

  v_nominal := _bag_count * _bag_size_kg;

  -- ── the technical check, recorded either way ─────────────────────────────
  v_check := jsonb_build_object(
    'grade_id',        v_grade.id,
    'grade_name',      v_grade.grade_name_ar,
    'moisture',        _moisture,
    'max_moisture',    v_grade.max_moisture,
    'moisture_ok',     (_moisture IS NULL OR _moisture <= v_grade.max_moisture),
    'impurities',      _impurities,
    'max_impurities',  v_grade.max_impurities,
    'impurities_ok',   (_impurities IS NULL OR _impurities <= v_grade.max_impurities),
    'nominal_weight',  v_nominal,
    'net_weight',      v_net,
    'bag_weight_gap',  round(v_net - v_nominal, 3)
  );

  -- Moisture is a WARNING, not a refusal: the operator decides whether wet
  -- grain is accepted, and the check is recorded so the decision is visible.
  v_source := CASE WHEN (_moisture IS NOT NULL AND _moisture > v_grade.max_moisture)
                   THEN 'MILLING_INTAKE_MOISTURE_WARNING'
                   ELSE 'MILLING_INTAKE' END;

  v_number := public.next_milling_intake_number();

  INSERT INTO public.milling_intake_receipts (
    receipt_number, store_id, customer_id, grain_type, grain_product_id, grain_grade_id,
    bag_size_kg, intake_bag_count, gross_weight_kg, tare_weight_kg, net_weight_kg,
    moisture_percentage, impurities_percentage, truck_plate_number, driver_name,
    silo_or_location, notes, status, received_by,
    bag_type, bag_source, bag_condition
  ) VALUES (
    v_number, _store_id, _customer_id, v_grain, _grain_product_id, _grain_grade_id,
    _bag_size_kg, _bag_count, _gross_weight_kg, COALESCE(_tare_weight_kg,0), v_net,
    _moisture, _impurities, _truck_plate, _driver_name,
    _silo, _notes, 'RECEIVED', v_user,
    -- The bag fields now actually reach the table. Before this migration they
    -- were accepted by the form, sent over the wire, and dropped here.
    nullif(btrim(coalesce(_bag_type, '')), ''),
    coalesce(nullif(btrim(coalesce(_bag_source, '')), ''), 'CUSTOMER'),
    nullif(btrim(coalesce(_bag_condition, '')), '')
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, v_source, 'milling_intake_receipt', v_id,
    jsonb_build_object(
      'receipt_number', v_number,
      'customer_id',    _customer_id,
      'grain_type',     v_grain,
      'net_weight_kg',  v_net,
      'nominal_weight', v_nominal,
      'bag_type',       _bag_type,
      'bag_source',     _bag_source,
      'bag_condition',  _bag_condition,
      'technical_check', v_check,
      'stock_impact',   'NONE - customer custody'
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_milling_job(_intake_receipt_id uuid, _input_bag_count integer, _input_bag_size_kg numeric, _input_weight_kg numeric, _fee_per_bag numeric, _fee_per_ton numeric, _service_product_id uuid, _expected_extraction_rate numeric, _allowed_loss_percentage numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_id         uuid;
  v_number     text;
  v_store      uuid;
  v_customer   uuid;
  v_available  numeric;
  v_already    numeric;
  v_bag_size   numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to create milling jobs';
  END IF;

  IF _intake_receipt_id IS NULL THEN
    RAISE EXCEPTION 'An intake receipt is required';
  END IF;

  -- Lock the receipt so two operators cannot both draw from the same custody
  -- balance concurrently.
  SELECT store_id, customer_id
    INTO v_store, v_customer
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake receipt % does not exist', _intake_receipt_id;
  END IF;

  IF (SELECT status FROM public.milling_intake_receipts WHERE id = _intake_receipt_id) = 'CANCELLED' THEN
    RAISE EXCEPTION 'This intake receipt is cancelled';
  END IF;

  v_bag_size := coalesce(_input_bag_size_kg, 0);
  IF v_bag_size <= 0 THEN
    v_bag_size := 50.00;
  END IF;

  IF coalesce(_input_bag_count, 0) < 0 THEN
    RAISE EXCEPTION 'Input bag count cannot be negative';
  END IF;

  IF _input_weight_kg IS NULL OR _input_weight_kg <= 0 THEN
    RAISE EXCEPTION 'Input weight must be positive';
  END IF;

  IF coalesce(_fee_per_bag, 0) < 0 OR coalesce(_fee_per_ton, 0) < 0 THEN
    RAISE EXCEPTION 'Milling fees cannot be negative';
  END IF;
  IF coalesce(_fee_per_bag, 0) = 0 AND coalesce(_fee_per_ton, 0) = 0 THEN
    RAISE EXCEPTION 'Set at least one milling fee (per bag or per ton)';
  END IF;

  IF coalesce(_expected_extraction_rate, 80) <= 0 OR coalesce(_expected_extraction_rate, 80) > 100 THEN
    RAISE EXCEPTION 'Expected extraction rate must be between 0 and 100';
  END IF;
  IF coalesce(_allowed_loss_percentage, 2) < 0 OR coalesce(_allowed_loss_percentage, 2) > 100 THEN
    RAISE EXCEPTION 'Allowed loss percentage must be between 0 and 100';
  END IF;

  -- How much custody is still un-milled on this receipt?
  SELECT net_weight_kg INTO v_available
  FROM public.milling_intake_receipts
  WHERE id = _intake_receipt_id;

  SELECT coalesce(sum(input_weight_kg), 0) INTO v_already
  FROM public.milling_jobs
  WHERE intake_receipt_id = _intake_receipt_id
    AND status <> 'CANCELLED';

  IF _input_weight_kg > (v_available - v_already) + 0.001 THEN
    RAISE EXCEPTION
      'Cannot draw more than the custody balance: receipt has % kg, already drawn % kg, requested % kg',
      v_available, v_already, _input_weight_kg
      USING ERRCODE = 'check_violation';
  END IF;

  v_number := public.next_milling_job_number();

  INSERT INTO public.milling_jobs (
    store_id, job_number, intake_receipt_id, customer_id,
    input_bag_count, input_bag_size_kg, input_weight_kg,
    milling_fee_per_bag, milling_fee_per_ton, service_product_id,
    expected_extraction_rate, allowed_loss_percentage,
    status, started_at, notes, created_by
  )
  VALUES (
    v_store, v_number, _intake_receipt_id, v_customer,
    coalesce(_input_bag_count, 0), v_bag_size, _input_weight_kg,
    coalesce(_fee_per_bag, 0), coalesce(_fee_per_ton, 0), _service_product_id,
    coalesce(_expected_extraction_rate, 80), coalesce(_allowed_loss_percentage, 2),
    'PROCESSING', timezone('utc'::text, now()),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.job.started', 'milling_job', v_id,
    jsonb_build_object(
      'job_number', v_number,
      'intake_receipt_id', _intake_receipt_id,
      'customer_id', v_customer,
      'input_weight_kg', _input_weight_kg,
      'fee_per_bag', coalesce(_fee_per_bag, 0),
      'fee_per_ton', coalesce(_fee_per_ton, 0),
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_milling_job_v2(_agreement_id uuid, _intake_receipt_id uuid, _input_bag_count integer, _input_bag_size_kg numeric, _input_weight_kg numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$


CREATE OR REPLACE FUNCTION public.create_opening_balance(_effective_date date, _lines jsonb, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_num  text;
  l      jsonb;
  v_side text;
  v_section text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may open the books';
  END IF;
  IF _effective_date IS NULL THEN
    RAISE EXCEPTION 'Effective date is required';
  END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'An opening entry needs at least one line';
  END IF;

  v_num := 'OB-' || to_char(_effective_date,'YYYYMMDD') || '-' ||
           lpad(nextval('public.opening_balance_seq')::text,3,'0');

  INSERT INTO public.opening_balance_documents
    (document_number, effective_date, status, fiscal_year, notes, created_by)
  VALUES (v_num, _effective_date, 'DRAFT',
          EXTRACT(YEAR FROM _effective_date)::int,
          nullif(btrim(coalesce(_notes,'')),''), v_user)
  RETURNING id INTO v_id;

  FOR l IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    v_section := l->>'section';
    IF v_section NOT IN ('STOCK','RECEIVABLE','PAYABLE','CASH','BANK','ASSET','LIABILITY','CAPITAL') THEN
      RAISE EXCEPTION 'Unknown opening section: %', v_section;
    END IF;

    -- The side is DERIVED, never supplied. A line that claims to be an asset
    -- on the credit side is the exact error a balance check exists to catch,
    -- and accepting it would defeat the purpose.
    v_side := CASE WHEN v_section IN ('STOCK','RECEIVABLE','CASH','BANK','ASSET')
                   THEN 'DEBIT' ELSE 'CREDIT' END;

    IF coalesce((l->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Line amount must be greater than zero (section %)', v_section;
    END IF;

    INSERT INTO public.opening_balance_lines
      (document_id, section, side, ref_type, ref_id, product_id, warehouse_id,
       customer_id, supplier_id, description, quantity, unit_cost, amount)
    VALUES
      (v_id, v_section, v_side, l->>'ref_type', (l->>'ref_id')::uuid,
       (l->>'product_id')::uuid, (l->>'warehouse_id')::uuid,
       (l->>'customer_id')::uuid, (l->>'supplier_id')::uuid,
       coalesce(nullif(btrim(coalesce(l->>'description','')),''), v_section),
       (l->>'quantity')::numeric, (l->>'unit_cost')::numeric,
       (l->>'amount')::numeric);
  END LOOP;

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_production_order(_warehouse_id uuid, _bom_id uuid DEFAULT NULL::uuid, _production_date date DEFAULT CURRENT_DATE, _allocation_basis text DEFAULT 'REMAINDER_TO_PRIMARY'::text, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_id    uuid;
  v_num   text;
  v_basis text := coalesce(_allocation_basis, 'REMAINDER_TO_PRIMARY');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to run mill production';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = _warehouse_id AND w.is_active) THEN
    RAISE EXCEPTION 'Selected warehouse is unavailable';
  END IF;
  IF v_basis NOT IN ('REMAINDER_TO_PRIMARY','NET_REALISABLE_VALUE','RELATIVE_SALES_VALUE') THEN
    RAISE EXCEPTION 'Unknown allocation basis: %', v_basis;
  END IF;

  v_num := 'PO-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
           lpad(nextval('public.production_order_seq')::text, 4, '0');

  INSERT INTO public.production_orders
    (order_number, warehouse_id, bom_id, production_date, status,
     allocation_basis, costing_method, created_by, notes)
  VALUES
    (v_num, _warehouse_id, _bom_id, coalesce(_production_date, CURRENT_DATE), 'PLANNED',
     v_basis, public.company_costing_method(), v_user, nullif(btrim(coalesce(_notes,'')), ''))
  RETURNING id INTO v_id;

  -- A BOM copies into PLANNED lines only. The plan never becomes the actual.
  IF _bom_id IS NOT NULL THEN
    INSERT INTO public.production_order_materials (order_id, product_id, planned_qty)
    SELECT v_id, l.product_id, l.qty
      FROM public.production_bom_lines l
     WHERE l.bom_id = _bom_id AND l.line_role = 'INPUT' AND l.product_id IS NOT NULL;

    INSERT INTO public.production_order_outputs
      (order_id, product_id, output_role, planned_qty)
    SELECT v_id, l.product_id,
           CASE WHEN l.line_role = 'BY_PRODUCT' THEN 'BY_PRODUCT' ELSE 'PRIMARY' END, l.qty
      FROM public.production_bom_lines l
     WHERE l.bom_id = _bom_id AND l.line_role IN ('OUTPUT','BY_PRODUCT') AND l.product_id IS NOT NULL;

    INSERT INTO public.production_order_losses (order_id, reason, qty, value, notes)
    SELECT v_id, coalesce(l.loss_reason, 'فاقد متوقع حسب الوصفة'), l.qty, 0, l.notes
      FROM public.production_bom_lines l
     WHERE l.bom_id = _bom_id AND l.line_role = 'LOSS' AND l.product_id IS NULL;

    UPDATE public.production_orders o
       SET planned_input_qty = coalesce((SELECT sum(planned_qty) FROM public.production_order_materials WHERE order_id = v_id), 0),
           planned_output_qty = coalesce((SELECT sum(planned_qty) FROM public.production_order_outputs WHERE order_id = v_id), 0),
           planned_yield_pct = CASE
             WHEN coalesce((SELECT sum(planned_qty) FROM public.production_order_materials WHERE order_id = v_id), 0) > 0
             THEN round(coalesce((SELECT sum(planned_qty) FROM public.production_order_outputs WHERE order_id = v_id), 0) * 100
                        / (SELECT sum(planned_qty) FROM public.production_order_materials WHERE order_id = v_id), 3)
           END
     WHERE o.id = v_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'production.order_created', 'production_order', v_id,
          jsonb_build_object('order_number', v_num, 'bom_id', _bom_id, 'allocation_basis', v_basis));
  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_purchase(_warehouse_id uuid, _supplier_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id     uuid;
  v_invoice_no     text;
  v_user           uuid := auth.uid();
  v_item           jsonb;
  v_subtotal       numeric := 0;
  v_tax_total      numeric := 0;
  v_total          numeric := 0;
  v_qty            numeric;
  v_cost           numeric;
  v_tax_rate       numeric;
  v_line_total     numeric;
  v_line_tax       numeric;
  v_product        uuid;
  v_effect         text;
  v_type           text;
  v_purchasable    boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(v_user) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse required';
  END IF;
  IF _supplier_id IS NULL THEN
    RAISE EXCEPTION 'Supplier required';
  END IF;
  IF coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  ------------------------------------------------------------------ validate
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty      := (v_item ->> 'quantity')::numeric;
    v_cost     := (v_item ->> 'unit_cost')::numeric;
    v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;
    IF v_cost IS NULL OR v_cost < 0 THEN
      RAISE EXCEPTION 'Invalid unit cost';
    END IF;
    IF v_tax_rate < 0 OR v_tax_rate > 100 THEN
      RAISE EXCEPTION 'Invalid tax rate';
    END IF;
    IF (v_item ->> 'product_id') IS NOT NULL THEN
      SELECT p.is_purchasable INTO v_purchasable
      FROM public.products p WHERE p.id = (v_item ->> 'product_id')::uuid;

      IF v_purchasable IS NOT TRUE THEN
        RAISE EXCEPTION 'Item % is not marked as purchasable', v_item ->> 'product_id';
      END IF;
    END IF;

    v_line_total := v_qty * v_cost;
    v_line_tax   := v_line_total * v_tax_rate / 100;
    v_subtotal   := v_subtotal + v_line_total;
    v_tax_total  := v_tax_total + v_line_tax;
  END LOOP;

  v_total := v_subtotal + v_tax_total - coalesce(_discount, 0);
  v_invoice_no := public.next_purchase_number();

  INSERT INTO public.purchase_invoices (
    invoice_number, supplier_id, warehouse_id, status,
    subtotal, discount, tax, total, paid, payment_method, note, created_by
  )
  VALUES (
    v_invoice_no, _supplier_id, _warehouse_id,
    CASE WHEN coalesce(_paid, 0) >= v_total
         THEN 'paid'::public.invoice_status
         ELSE 'partial'::public.invoice_status END,
    v_subtotal, coalesce(_discount, 0), v_tax_total, v_total, coalesce(_paid, 0),
    _payment_method::public.payment_method, nullif(btrim(_note), ''), v_user
  )
  RETURNING id INTO v_invoice_id;

  --------------------------------------------------------------------- post
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_product  := (v_item ->> 'product_id')::uuid;
    v_qty      := (v_item ->> 'quantity')::numeric;
    v_cost     := (v_item ->> 'unit_cost')::numeric;
    v_tax_rate := coalesce((v_item ->> 'tax_rate')::numeric, 0);

    v_line_total := v_qty * v_cost;
    v_line_tax   := v_line_total * v_tax_rate / 100;

    SELECT r.o_line_type, r.o_stock_effect
      INTO v_type, v_effect
    FROM public.resolve_purchase_line(v_item) AS r;

    INSERT INTO public.purchase_invoice_items (
      invoice_id, product_id, quantity, unit_cost, discount, tax, total,
      line_type, stock_effect
    )
    VALUES (
      v_invoice_id, v_product, v_qty, v_cost, 0, v_line_tax, v_line_total + v_line_tax,
      v_type, v_effect
    );

    -- Rule 5: only a TRACKED good increases stock. A service or an untracked
    -- good is a pure expense: it changes no balance and no valuation.
    IF v_effect = 'STOCK_RECEIPT' AND v_product IS NOT NULL THEN
      PERFORM public.post_stock_delta(
        v_product,
        _warehouse_id,
        v_qty,
        v_cost,
        'RECEIPT'::public.stock_movement_kind,
        'purchase_invoice',
        v_invoice_id,
        'Purchase receipt',
        'COMPANY'::public.owner_type,
        NULL,
        'purchase'::public.movement_type
      );
    END IF;
  END LOOP;

  IF coalesce(_paid, 0) < v_total THEN
    UPDATE public.suppliers
    SET balance = balance + (v_total - coalesce(_paid, 0)), updated_at = now()
    WHERE id = _supplier_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'purchase.posted', 'purchase_invoice', v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_no,
      'supplier_id', _supplier_id,
      'warehouse_id', _warehouse_id,
      'total', v_total,
      'paid', coalesce(_paid, 0),
      'line_count', jsonb_array_length(_items)
    ));

  RETURN v_invoice_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_purchase_return(_invoice_id uuid, _warehouse_id uuid, _supplier_id uuid, _refund_method text, _note text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id     uuid;
  v_no     text;
  v_user   uuid := auth.uid();
  v_item   jsonb;
  v_sub    numeric := 0;
  v_tax    numeric := 0;
  v_tot    numeric := 0;
  v_qty    numeric;
  v_cost   numeric;
  v_tr     numeric;
  v_lt     numeric;
  v_ltax   numeric;
  v_p      uuid;
  v_effect text;
  v_type   text;
  v_avail  numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(v_user) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p    := (v_item ->> 'product_id')::uuid;
    v_qty  := (v_item ->> 'quantity')::numeric;
    v_cost := (v_item ->> 'unit_cost')::numeric;
    v_tr   := coalesce((v_item ->> 'tax_rate')::numeric, 0);

    v_effect := public.item_stock_effect(v_p, 'out');

    -- Only a tracked good has stock to send back.
    IF v_effect = 'STOCK_ISSUE' THEN
      SELECT i.quantity INTO v_avail
      FROM public.inventory i
      WHERE i.product_id = v_p
        AND i.warehouse_id = _warehouse_id
        AND i.owner_type = 'COMPANY'
        AND i.owner_id IS NULL;

      IF coalesce(v_avail, 0) < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for item %', v_p;
      END IF;
    END IF;

    v_lt   := v_qty * v_cost;
    v_ltax := v_lt * v_tr / 100;
    v_sub  := v_sub + v_lt;
    v_tax  := v_tax + v_ltax;
  END LOOP;
  v_tot := v_sub + v_tax;
  v_no  := public.next_purchase_return_number();

  INSERT INTO public.purchase_returns (
    return_number, invoice_id, supplier_id, warehouse_id,
    subtotal, tax, total, refund_method, note, created_by
  )
  VALUES (
    v_no, _invoice_id, _supplier_id, _warehouse_id,
    v_sub, v_tax, v_tot, _refund_method::public.payment_method,
    nullif(btrim(_note), ''), v_user
  )
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p    := (v_item ->> 'product_id')::uuid;
    v_qty  := (v_item ->> 'quantity')::numeric;
    v_cost := (v_item ->> 'unit_cost')::numeric;
    v_tr   := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_lt   := v_qty * v_cost;
    v_ltax := v_lt * v_tr / 100;

    v_type   := public.item_line_type(v_p, false);
    v_effect := public.item_stock_effect(v_p, 'out');

    INSERT INTO public.purchase_return_items (
      return_id, product_id, quantity, unit_cost, tax, total, line_type
    )
    VALUES (v_id, v_p, v_qty, v_cost, v_ltax, v_lt + v_ltax, v_type);

    IF v_effect = 'STOCK_ISSUE' THEN
      PERFORM public.post_stock_delta(
        v_p,
        _warehouse_id,
        -v_qty,
        v_cost,
        'ISSUE'::public.stock_movement_kind,
        'purchase_return',
        v_id,
        'Purchase return',
        'COMPANY'::public.owner_type,
        NULL,
        'return_out'::public.movement_type
      );
    END IF;
  END LOOP;

  IF _supplier_id IS NOT NULL THEN
    UPDATE public.suppliers
    SET balance = greatest(balance - v_tot, 0), updated_at = now()
    WHERE id = _supplier_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'purchase_return.posted', 'purchase_return', v_id,
    jsonb_build_object(
      'return_number', v_no,
      'invoice_id', _invoice_id,
      'supplier_id', _supplier_id,
      'total', v_tot
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_sale(_warehouse_id uuid, _customer_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _items jsonb, _sale_date date, _payment_splits jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id         uuid;
  v_total              numeric;
  v_paid               numeric;
  v_user               uuid := auth.uid();
  v_split              record;
  v_component_count    integer := 0;
  v_split_total        numeric := 0;
  v_distinct_methods   integer := 0;
  v_single_method      text;
  v_recorded_method    text := _payment_method;
BEGIN
  IF coalesce(jsonb_typeof(_payment_splits), 'jsonb') <> 'array'
     OR coalesce(jsonb_array_length(_payment_splits), 0) = 0 THEN
    -- No breakdown supplied: exact legacy behaviour.
    RETURN public.create_sale(
      _warehouse_id, _customer_id, _payment_method, _paid, _discount, _note, _items, _sale_date
    );
  END IF;

  FOR v_split IN
    SELECT (part ->> 'method') AS method,
           coalesce((part ->> 'amount')::numeric, 0) AS amount
    FROM jsonb_array_elements(_payment_splits) AS part
  LOOP
    IF v_split.method IS NULL
      OR v_split.method NOT IN ('cash', 'card', 'bank_transfer', 'mobile_money', 'split') THEN
      RAISE EXCEPTION 'Unsupported payment method: %', v_split.method;
    END IF;
    IF v_split.amount <= 0 THEN
      RAISE EXCEPTION 'Every payment tender component requires a positive amount';
    END IF;

    v_component_count := v_component_count + 1;
    v_split_total := v_split_total + v_split.amount;
  END LOOP;

  SELECT count(DISTINCT part ->> 'method'), min(part ->> 'method')
    INTO v_distinct_methods, v_single_method
  FROM jsonb_array_elements(_payment_splits) AS part;

  -- The tender breakdown and the paid amount must agree, otherwise the invoice
  -- and the recorded payments would drift apart.
  IF round(v_split_total, 2) <> round(coalesce(_paid, 0), 2) THEN
    RAISE EXCEPTION
      'Payment breakdown total % does not match the paid amount %',
      round(v_split_total, 2), round(coalesce(_paid, 0), 2);
  END IF;

  v_recorded_method := CASE
    WHEN v_distinct_methods > 1 THEN 'split'
    ELSE v_single_method
  END;

  v_invoice_id := public.create_sale(
    _warehouse_id, _customer_id, v_recorded_method, _paid, _discount, _note, _items, _sale_date
  );

  SELECT total, paid INTO v_total, v_paid FROM public.sales_invoices WHERE id = v_invoice_id;

  UPDATE public.sales_invoices
  SET payment_method = v_recorded_method::public.payment_method, updated_at = now()
  WHERE id = v_invoice_id
    AND payment_method IS DISTINCT FROM v_recorded_method::public.payment_method;

  FOR v_split IN
    SELECT (part ->> 'method') AS method,
           coalesce((part ->> 'amount')::numeric, 0) AS amount
    FROM jsonb_array_elements(_payment_splits) AS part
  LOOP
    INSERT INTO public.customer_payment_splits (
      customer_id, invoice_id, method, amount, occurred_at, created_by
    )
    VALUES (
      _customer_id, v_invoice_id, v_split.method::public.payment_method,
      round(v_split.amount, 2),
      coalesce(_sale_date, current_date)::timestamp + localtime,
      v_user
    );
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'sale.tender_breakdown.recorded', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'recorded_payment_method', v_recorded_method,
      'components', v_component_count,
      'tender_total', round(v_split_total, 2),
      'total', v_total,
      'paid', v_paid
    ));

  RETURN v_invoice_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_sale(_warehouse_id uuid, _customer_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id     uuid;
  v_invoice_number text;
  v_user           uuid := auth.uid();
  v_line           record;
  v_subtotal       numeric := 0;
  v_tax_total      numeric := 0;
  v_discount       numeric := coalesce(_discount, 0);
  v_total          numeric := 0;
  v_paid           numeric := 0;
  v_outstanding    numeric := 0;
  v_price          numeric;
  v_tax_rate       numeric;
  v_cost           numeric;
  v_customer_balance numeric;
  v_credit_limit   numeric;
  v_line_total     numeric;
  v_line_tax       numeric;
  v_effect         text;
  v_line_type      text;
  v_sellable       boolean;
  v_status         public.invoice_status;
  v_last_item_id   uuid;
  v_available      numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'cashier')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to post sales';
  END IF;

  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;

  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF _payment_method NOT IN ('cash', 'card', 'bank_transfer', 'credit', 'mobile_money', 'split') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF coalesce(_paid, 0) < 0 THEN
    RAISE EXCEPTION 'Paid amount cannot be negative';
  END IF;

  -- ============================================================== VALIDATION
  -- Only lines whose policy is STOCK_ISSUE are stock-checked. Aggregating by
  -- item and locking the inventory row protects against concurrent checkouts.
  FOR v_line IN
    SELECT r.o_product_id AS product_id, sum(r.o_quantity) AS quantity
    FROM jsonb_array_elements(_items) AS line
    CROSS JOIN LATERAL public.resolve_sale_line(line) AS r
    WHERE r.o_stock_effect = 'STOCK_ISSUE'
    GROUP BY r.o_product_id
    ORDER BY r.o_product_id
  LOOP
    SELECT i.quantity
      INTO v_available
    FROM public.inventory i
    WHERE i.product_id = v_line.product_id
      AND i.warehouse_id = _warehouse_id
      AND i.owner_type = 'COMPANY'
      AND i.owner_id IS NULL
    FOR UPDATE;

    v_available := coalesce(v_available, 0);

    IF v_available < v_line.quantity THEN
      RAISE EXCEPTION
        'Insufficient stock for item %: available %, requested %',
        v_line.product_id, v_available, v_line.quantity
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Totals. Catalogue price wins for a catalogue item; the operator's price is
  -- used only for ad-hoc service lines.
  FOR v_line IN
    SELECT r.o_product_id    AS product_id,
           r.o_quantity      AS quantity,
           r.o_service_name  AS service_name,
           coalesce((line ->> 'unit_price')::numeric, 0) AS input_price,
           coalesce((line ->> 'tax_rate')::numeric, 0)   AS input_tax
    FROM jsonb_array_elements(_items) AS line
    CROSS JOIN LATERAL public.resolve_sale_line(line) AS r
  LOOP
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Every sale line requires a positive quantity';
    END IF;

    IF v_line.product_id IS NULL THEN
      IF coalesce(v_line.service_name, '') = '' THEN
        RAISE EXCEPTION 'Every service line requires a description';
      END IF;
      IF v_line.input_price < 0 OR v_line.input_tax < 0 OR v_line.input_tax > 100 THEN
        RAISE EXCEPTION 'Service line "%" has an invalid price or tax rate', v_line.service_name;
      END IF;
      v_price    := v_line.input_price;
      v_tax_rate := v_line.input_tax;
    ELSE
      SELECT p.sale_price, p.tax_rate, p.is_sellable
        INTO v_price, v_tax_rate, v_sellable
      FROM public.products p
      WHERE p.id = v_line.product_id AND p.is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % is not available for sale', v_line.product_id;
      END IF;

      IF v_sellable IS NOT TRUE THEN
        RAISE EXCEPTION 'Item % is not marked as sellable', v_line.product_id;
      END IF;

      IF v_price < 0 OR v_tax_rate < 0 OR v_tax_rate > 100 THEN
        RAISE EXCEPTION 'Item % has invalid pricing or tax configuration', v_line.product_id;
      END IF;
    END IF;

    v_line_total := round(v_line.quantity * v_price, 2);
    v_subtotal   := v_subtotal + v_line_total;
    v_tax_total  := v_tax_total + round(v_line_total * v_tax_rate / 100, 2);
  END LOOP;

  v_total := round(v_subtotal + v_tax_total - v_discount, 2);
  IF v_discount > v_subtotal + v_tax_total OR v_total < 0 THEN
    RAISE EXCEPTION 'Discount cannot exceed the invoice amount';
  END IF;

  IF _customer_id IS NOT NULL THEN
    SELECT balance, credit_limit
      INTO v_customer_balance, v_credit_limit
    FROM public.customers
    WHERE id = _customer_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected customer is unavailable';
    END IF;
  END IF;

  -- Tender above the total is change, not revenue and not credit.
  v_paid := least(coalesce(_paid, 0), v_total);
  v_outstanding := round(v_total - v_paid, 2);

  IF v_outstanding > 0 AND _customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer is required when the sale has an unpaid amount';
  END IF;
  IF v_outstanding > 0 AND NOT public.customer_credit_limit_allows(_customer_id, v_outstanding) THEN
    RAISE EXCEPTION
      'Credit limit exceeded: current balance %, requested debt %, limit %',
      coalesce(v_customer_balance, 0), v_outstanding, coalesce(v_credit_limit, 0);
  END IF;

  v_status := CASE
    WHEN v_paid >= v_total THEN 'paid'::public.invoice_status
    WHEN v_paid = 0      THEN 'unpaid'::public.invoice_status
    ELSE 'partial'::public.invoice_status
  END;

  v_invoice_number := public.next_invoice_number();

  INSERT INTO public.sales_invoices (
    invoice_number, customer_id, warehouse_id, status,
    subtotal, discount, tax, total, paid, payment_method, note, created_by
  )
  VALUES (
    v_invoice_number, _customer_id, _warehouse_id, v_status,
    v_subtotal, v_discount, v_tax_total, v_total, v_paid,
    _payment_method::public.payment_method, nullif(btrim(_note), ''), v_user
  )
  RETURNING id INTO v_invoice_id;

  -- ================================================================== POSTING
  FOR v_line IN
    SELECT r.o_product_id   AS product_id,
           r.o_quantity     AS quantity,
           r.o_stock_effect AS stock_effect,
           r.o_service_name AS service_name,
           coalesce((line ->> 'unit_price')::numeric, 0) AS input_price,
           coalesce((line ->> 'tax_rate')::numeric, 0)   AS input_tax,
           nullif(btrim(coalesce(line ->> 'uom_id', '')), '')::uuid AS uom_id
    FROM jsonb_array_elements(_items) AS line
    CROSS JOIN LATERAL public.resolve_sale_line(line) AS r
  LOOP
    v_cost := NULL;

    IF v_line.product_id IS NULL THEN
      v_price     := v_line.input_price;
      v_tax_rate  := v_line.input_tax;
      v_line_type := 'AD_HOC_SERVICE';
      v_effect    := 'NONE';
    ELSE
      SELECT p.sale_price, p.tax_rate, p.cost_price
        INTO v_price, v_tax_rate, v_cost
      FROM public.products p WHERE p.id = v_line.product_id;

      v_line_type := public.item_line_type(v_line.product_id, false);
      -- Re-derive the effect at posting time so a policy change between
      -- validation and posting cannot slip a movement through unannounced.
      v_effect := public.item_stock_effect(v_line.product_id, 'out');

      IF v_effect = 'STOCK_ISSUE' THEN
        PERFORM public.post_stock_delta(
          v_line.product_id,
          _warehouse_id,
          -v_line.quantity,
          v_cost,
          'ISSUE'::public.stock_movement_kind,
          'sales_invoice',
          v_invoice_id,
          'POS sale',
          'COMPANY'::public.owner_type,
          NULL,
          'sale'::public.movement_type
        );
      END IF;
    END IF;

    v_line_total := round(v_line.quantity * v_price, 2);
    v_line_tax   := round(v_line_total * v_tax_rate / 100, 2);

    INSERT INTO public.sales_invoice_items (
      invoice_id, product_id, description, quantity, unit_price, discount, tax, total,
      line_type, stock_effect, uom_id
    )
    VALUES (
      v_invoice_id,
      v_line.product_id,
      CASE WHEN v_line.product_id IS NULL THEN v_line.service_name ELSE NULL END,
      v_line.quantity, v_price, 0, v_line_tax, v_line_total + v_line_tax,
      v_line_type, v_effect, v_line.uom_id
    )
    RETURNING id INTO v_last_item_id;

    IF v_line_type = 'AD_HOC_SERVICE' THEN
      INSERT INTO public.ad_hoc_service_lines (
        invoice_id, invoice_item_id, description, quantity, unit_price,
        discount, tax, total, created_by
      )
      VALUES (
        v_invoice_id, v_last_item_id, v_line.service_name, v_line.quantity,
        v_price, 0, v_line_tax, v_line_total + v_line_tax, v_user
      );
    END IF;
  END LOOP;

  IF v_outstanding > 0 THEN
    UPDATE public.customers
    SET balance = round(coalesce(balance, 0) + v_outstanding, 2), updated_at = now()
    WHERE id = _customer_id;

    INSERT INTO public.customer_ledger (
      customer_id, entry_type, debit, reference_id, reference_type,
      occurred_at, created_by, source_key, note
    )
    VALUES (
      _customer_id, 'sale', v_outstanding, v_invoice_id, 'sales_invoice',
      now(), v_user, 'sale:' || v_invoice_id, 'قيد بيع آجل'
    )
    ON CONFLICT (source_key) DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'sale.posted', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'warehouse_id', _warehouse_id,
      'customer_id', _customer_id,
      'payment_method', _payment_method,
      'total', v_total,
      'paid', v_paid,
      'outstanding', v_outstanding,
      'line_count', jsonb_array_length(_items)
    ));

  RETURN v_invoice_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_sale(_warehouse_id uuid, _customer_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _items jsonb, _sale_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_posted_at  timestamptz;
BEGIN
  IF _sale_date IS NULL THEN
    RAISE EXCEPTION 'Sale date is required';
  END IF;

  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- All validation, stock movement, ledger posting and auditing happen here.
  v_invoice_id := public.create_sale(
    _warehouse_id, _customer_id, _payment_method, _paid, _discount, _note, _items
  );

  v_posted_at := _sale_date::timestamp + localtime;

  UPDATE public.sales_invoices
  SET created_at = v_posted_at, updated_at = now()
  WHERE id = v_invoice_id;

  UPDATE public.stock_movements
  SET created_at = v_posted_at
  WHERE source_type = 'sales_invoice' AND source_id = v_invoice_id;

  RETURN v_invoice_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_sales_return(_invoice_id uuid, _warehouse_id uuid, _customer_id uuid, _refund_method text, _note text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id        uuid;
  v_no        text;
  v_user      uuid := auth.uid();
  v_item      jsonb;
  v_sub       numeric := 0;
  v_tax       numeric := 0;
  v_tot       numeric := 0;
  v_qty       numeric;
  v_price     numeric;
  v_tr        numeric;
  v_lt        numeric;
  v_ltax      numeric;
  v_p         uuid;
  v_effect    text;
  v_type      text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(v_user) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty   := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price')::numeric;
    v_tr    := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_lt    := v_qty * v_price;
    v_ltax  := v_lt * v_tr / 100;
    v_sub   := v_sub + v_lt;
    v_tax   := v_tax + v_ltax;
  END LOOP;
  v_tot := v_sub + v_tax;
  v_no  := public.next_sales_return_number();

  INSERT INTO public.sales_returns (
    return_number, invoice_id, customer_id, warehouse_id,
    subtotal, tax, total, refund_method, note, created_by
  )
  VALUES (
    v_no, _invoice_id, _customer_id, _warehouse_id,
    v_sub, v_tax, v_tot, _refund_method::public.payment_method,
    nullif(btrim(_note), ''), v_user
  )
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p     := (v_item ->> 'product_id')::uuid;
    v_qty   := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price')::numeric;
    v_tr    := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_lt    := v_qty * v_price;
    v_ltax  := v_lt * v_tr / 100;

    v_type   := public.item_line_type(v_p, false);
    v_effect := public.item_stock_effect(v_p, 'in');

    INSERT INTO public.sales_return_items (
      return_id, product_id, quantity, unit_price, tax, total, line_type
    )
    VALUES (v_id, v_p, v_qty, v_price, v_ltax, v_lt + v_ltax, v_type);

    -- Only a tracked good comes back into stock.
    IF v_effect = 'STOCK_RECEIPT' THEN
      PERFORM public.post_stock_delta(
        v_p,
        _warehouse_id,
        v_qty,
        v_price,
        'RECEIPT'::public.stock_movement_kind,
        'sales_return',
        v_id,
        'Sales return',
        'COMPANY'::public.owner_type,
        NULL,
        'return_in'::public.movement_type
      );
    END IF;
  END LOOP;

  IF _customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET balance = greatest(balance - v_tot, 0), updated_at = now()
    WHERE id = _customer_id;

    INSERT INTO public.customer_ledger (
      customer_id, entry_type, credit, reference_id, reference_type,
      occurred_at, created_by, source_key, note
    )
    VALUES (
      _customer_id, 'return', round(v_tot, 2), v_id, 'sales_return',
      now(), v_user, 'return:' || v_id, 'مرتجع مبيعات'
    )
    ON CONFLICT (source_key) DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'sales_return.posted', 'sales_return', v_id,
    jsonb_build_object(
      'return_number', v_no,
      'invoice_id', _invoice_id,
      'customer_id', _customer_id,
      'total', v_tot
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.create_stock_transfer(_from uuid, _to uuid, _note text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id     uuid;
  v_no     text;
  v_user   uuid := auth.uid();
  v_item   jsonb;
  v_p      uuid;
  v_qty    numeric;
  v_stock  numeric;
  v_nature public.item_nature;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(v_user) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _from = _to THEN
    RAISE EXCEPTION 'Source and destination must differ';
  END IF;
  IF coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p   := (v_item ->> 'product_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid transfer quantity';
    END IF;

    SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = v_p;
    IF v_nature = 'SERVICE' THEN
      RAISE EXCEPTION 'Item % is a SERVICE and cannot be transferred', v_p;
    END IF;
    IF public.item_effective_policy(v_p) <> 'TRACKED' THEN
      RAISE EXCEPTION 'Item % is not a tracked item and cannot be transferred between warehouses', v_p;
    END IF;

    SELECT i.quantity INTO v_stock
    FROM public.inventory i
    WHERE i.product_id = v_p
      AND i.warehouse_id = _from
      AND i.owner_type = 'COMPANY'
      AND i.owner_id IS NULL;

    IF coalesce(v_stock, 0) < v_qty THEN
      RAISE EXCEPTION 'Insufficient stock for item %', v_p;
    END IF;
  END LOOP;

  v_no := public.next_transfer_number();

  INSERT INTO public.stock_transfers (transfer_number, from_warehouse_id, to_warehouse_id, note, created_by)
  VALUES (v_no, _from, _to, nullif(btrim(_note), ''), v_user)
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p   := (v_item ->> 'product_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;

    INSERT INTO public.stock_transfer_items (transfer_id, product_id, quantity)
    VALUES (v_id, v_p, v_qty);

    PERFORM public.post_stock_delta(
      v_p, _from, -v_qty, NULL,
      'TRANSFER_OUT'::public.stock_movement_kind, 'stock_transfer', v_id,
      'Transfer out', 'COMPANY'::public.owner_type, NULL,
      'transfer_out'::public.movement_type
    );

    PERFORM public.post_stock_delta(
      v_p, _to, v_qty, NULL,
      'TRANSFER_IN'::public.stock_movement_kind, 'stock_transfer', v_id,
      'Transfer in', 'COMPANY'::public.owner_type, NULL,
      'transfer_in'::public.movement_type
    );
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'stock_transfer.posted', 'stock_transfer', v_id,
    jsonb_build_object(
      'transfer_number', v_no,
      'from_warehouse_id', _from,
      'to_warehouse_id', _to,
      'line_count', jsonb_array_length(_items)
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.customer_credit_limit_allows(p_customer_id uuid, p_new_due numeric)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.customers AS c
    CROSS JOIN public.company_settings AS s
    WHERE c.id = p_customer_id
      AND (
        NOT s.enforce_customer_credit_limit
        OR coalesce(c.credit_limit, 0) = 0
        OR coalesce(c.balance, 0) + greatest(coalesce(p_new_due, 0), 0) <= c.credit_limit
      )
  )
$function$


CREATE OR REPLACE FUNCTION public.customer_ledger_balance(p_customer_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT round(coalesce(sum(l.debit - l.credit), 0), 2)
  FROM public.customer_ledger AS l
  WHERE l.customer_id = p_customer_id
$function$


CREATE OR REPLACE FUNCTION public.decide_expense(p_entry_id uuid, p_approve boolean, p_reason text DEFAULT NULL::text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := public.expense_actor();
  v_entry  public.expense_entries;
  v_action text := CASE WHEN p_approve THEN 'approve' ELSE 'reject' END;
  v_target public.expense_status := CASE WHEN p_approve
                                          THEN 'APPROVED'::public.expense_status
                                          ELSE 'REJECTED'::public.expense_status END;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only a submitted document is awaiting a decision. This is what stops a
  -- double-click — or two approvers acting at the same moment — from producing
  -- two approvals: the second caller finds APPROVED, not SUBMITTED.
  IF v_entry.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'This expense is not awaiting approval (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.' || v_action);

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  -- Plan §17: separation of duties. The person who typed the expense is not the
  -- person who authorises it. An owner is the single documented exception, since
  -- in a one-person company refusing self-approval would make the module
  -- unusable — but the exception is explicit and auditable rather than silent.
  IF v_entry.created_by = v_user AND NOT public.has_role(v_user, 'owner') THEN
    RAISE EXCEPTION 'You cannot approve an expense you created yourself'
      USING ERRCODE = '42501';
  END IF;

  IF v_entry.created_by = v_user AND public.has_role(v_user, 'owner') THEN
    -- Recorded in the trail, not merely allowed: an owner reviewing their own
    -- work should be visible to an auditor.
    p_reason := COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''),
                         'Self-approved by owner (no other approver available)');
  END IF;

  IF NOT p_approve AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting an expense' USING ERRCODE = '22023';
  END IF;

  UPDATE public.expense_entries
     SET status      = v_target,
         version     = version + 1,
         approved_by = CASE WHEN p_approve THEN v_user END,
         approved_at = CASE WHEN p_approve THEN now() END,
         rejected_by = CASE WHEN NOT p_approve THEN v_user END,
         rejected_at = CASE WHEN NOT p_approve THEN now() END,
         rejection_reason = CASE WHEN NOT p_approve
                                 THEN nullif(btrim(coalesce(p_reason, '')), '') END
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, v_action, 'SUBMITTED', v_target, p_reason, v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.delete_expense_category(p_id uuid)
 RETURNS expense_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.expense_actor();
  v_used  bigint;
  v_row   public.expense_categories;
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.category.manage');

  SELECT count(*) INTO v_used FROM public.expense_lines WHERE category_id = p_id;

  IF v_used > 0 THEN
    UPDATE public.expense_categories SET is_active = false WHERE id = p_id
    RETURNING * INTO v_row;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.archived', 'expense_category', p_id,
            jsonb_build_object('reason', 'in_use', 'usage_count', v_used));
  ELSE
    DELETE FROM public.expense_categories WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.deleted', 'expense_category', p_id,
            jsonb_build_object('name', v_row.name));
  END IF;

  RETURN v_row;
END $function$


CREATE OR REPLACE FUNCTION public.expense_actor()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN v_user;
END $function$


CREATE OR REPLACE FUNCTION public.expense_assert_capability(p_user uuid, p_capability text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.expense_can(p_user, p_capability) THEN
    RAISE EXCEPTION 'Forbidden: % requires a higher role', p_capability
      USING ERRCODE = '42501';
  END IF;
END $function$


CREATE OR REPLACE FUNCTION public.expense_can(p_user uuid, p_capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Every capability requires an active staff account. `is_staff` fails
    -- closed on a missing profile row, which is the behaviour we want here.
    public.is_staff(p_user)
    AND CASE p_capability
      -- Reading the register is the baseline every operational role needs.
      WHEN 'expense.view'            THEN public.expense_role_rank(p_user)            >= 10
      -- Typing a draft is a cashier/warehouse action: it commits nothing.
      WHEN 'expense.create'          THEN public.expense_role_rank(p_user)            >= 10
      WHEN 'expense.edit'            THEN public.expense_role_rank(p_user)            >= 10
      WHEN 'expense.submit'          THEN public.expense_role_rank(p_user)            >= 10
      -- Approval is a control, not a data-entry step.
      WHEN 'expense.approve'         THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.reject'          THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.post'            THEN public.expense_role_rank(p_user)            >= 30
      -- Money leaving the drawer needs the same bar as posting.
      WHEN 'expense.pay'             THEN public.expense_role_rank(p_user)            >= 20
      WHEN 'expense.reverse'         THEN public.expense_role_rank(p_user)            >= 30
      WHEN 'expense.cancel'          THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.category.manage' THEN public.expense_role_rank(p_user)            >= 40
      WHEN 'expense.dimension.manage' THEN public.expense_role_rank(p_user)           >= 40
      WHEN 'expense.report'          THEN public.expense_role_rank(p_user)            >= 30
      WHEN 'expense.payment.reverse' THEN public.expense_role_rank(p_user)            >= 30
      ELSE false
    END
$function$


CREATE OR REPLACE FUNCTION public.expense_can_write_document(p_entry_id uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.expense_entries e
    WHERE e.id = p_entry_id
      AND (
        -- An approver or accountant can act on any document.
        public.expense_role_rank(p_user) >= 30
        -- Everyone else can act only on a document they own, and only while it
        -- is still theirs to change. Posted documents are frozen for all.
        OR (e.created_by = p_user AND e.status IN ('DRAFT', 'REJECTED'))
      )
  )
$function$


CREATE OR REPLACE FUNCTION public.expense_detail(p_entry_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'entry', to_jsonb(e) || jsonb_build_object(
      'supplier_name',    s.name,
      'employee_name',    pr.full_name,
      'warehouse_name',   w.name,
      'cost_center_name', cc.name,
      'project_name',     pj.name,
      'created_by_name',  cb.full_name,
      'approved_by_name', ab.full_name,
      'posted_by_name',   pb.full_name,
      -- The capability set is computed server-side so the UI does not have to
      -- re-derive the role matrix in JavaScript and drift from the database.
      'can_edit',    (e.status IN ('DRAFT', 'REJECTED'))
                     AND (e.created_by = auth.uid() OR public.expense_role_rank(auth.uid()) >= 30),
      'can_submit',  (e.status IN ('DRAFT', 'REJECTED'))
                     AND (e.created_by = auth.uid() OR public.expense_role_rank(auth.uid()) >= 30),
      'can_approve', (e.status = 'SUBMITTED') AND public.expense_can(auth.uid(), 'expense.approve'),
      'can_post',    (e.status IN ('APPROVED', 'DRAFT')) AND public.expense_can(auth.uid(), 'expense.post'),
      'can_pay',     (e.status IN ('POSTED', 'PARTIALLY_PAID')) AND public.expense_can(auth.uid(), 'expense.pay'),
      'can_cancel',  (e.status IN ('DRAFT', 'REJECTED', 'SUBMITTED', 'APPROVED'))
                     AND public.expense_can(auth.uid(), 'expense.cancel'),
      'can_reverse', (e.status IN ('POSTED', 'PARTIALLY_PAID', 'PAID'))
                     AND public.expense_can(auth.uid(), 'expense.reverse')
    ),
    'lines', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(l) || jsonb_build_object(
          'category_name',    c.name,
          'category_name_ar', c.name_ar,
          'cost_center_name', cc.name,
          'project_name',     pj.name
        ) ORDER BY l.line_no
      )
      FROM public.expense_lines l
      LEFT JOIN public.expense_categories c   ON c.id  = l.category_id
      LEFT JOIN public.expense_cost_centers cc ON cc.id = l.cost_center_id
      LEFT JOIN public.expense_projects pj    ON pj.id = l.project_id
      WHERE l.entry_id = e.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('created_by_name', pc.full_name)
                       ORDER BY p.payment_date, p.created_at)
      FROM public.expense_payments p
      LEFT JOIN public.profiles pc ON pc.id = p.created_by
      WHERE p.entry_id = e.id
    ), '[]'::jsonb),
    'approvals', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) || jsonb_build_object('actor_name', ac.full_name)
                       ORDER BY a.sequence)
      FROM public.expense_approvals a
      LEFT JOIN public.profiles ac ON ac.id = a.actor_id
      WHERE a.entry_id = e.id
    ), '[]'::jsonb),
    'attachments', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) || jsonb_build_object('uploaded_by_name', tc.full_name)
                       ORDER BY t.created_at)
      FROM public.expense_attachments t
      LEFT JOIN public.profiles tc ON tc.id = t.uploaded_by
      WHERE t.entry_id = e.id
    ), '[]'::jsonb)
  )
  FROM public.expense_entries e
  LEFT JOIN public.suppliers s  ON s.id  = e.supplier_id
  LEFT JOIN public.profiles  pr ON pr.id = e.employee_id
  LEFT JOIN public.profiles  cb ON cb.id = e.created_by
  LEFT JOIN public.profiles  ab ON ab.id = e.approved_by
  LEFT JOIN public.profiles  pb ON pb.id = e.posted_by
  LEFT JOIN public.warehouses w ON w.id  = e.warehouse_id
  LEFT JOIN public.expense_cost_centers cc ON cc.id = e.cost_center_id
  LEFT JOIN public.expense_projects pj      ON pj.id = e.project_id
  WHERE e.id = p_entry_id
$function$


CREATE OR REPLACE FUNCTION public.expense_line_net(p_gross numeric, p_tax_rate numeric, p_mode expense_tax_mode)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_gross IS NULL THEN NULL
    WHEN p_tax_rate IS NULL OR p_tax_rate <= 0 THEN public.expense_round(p_gross)
    WHEN p_mode = 'EXCLUSIVE' THEN public.expense_round(p_gross)
    ELSE public.expense_round(p_gross / (1 + (p_tax_rate / 100)))
  END
$function$


CREATE OR REPLACE FUNCTION public.expense_line_tax(p_gross numeric, p_tax_rate numeric, p_mode expense_tax_mode)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_gross IS NULL THEN NULL
    WHEN p_tax_rate IS NULL OR p_tax_rate <= 0 THEN 0::numeric
    ELSE public.expense_round(p_gross - public.expense_line_net(p_gross, p_tax_rate, p_mode))
  END
$function$


CREATE OR REPLACE FUNCTION public.expense_log_action(p_entry_id uuid, p_action text, p_from expense_status, p_to expense_status, p_reason text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor    uuid := COALESCE(p_actor, auth.uid());
  v_sequence integer;
BEGIN
  SELECT COALESCE(max(sequence), 0) + 1
    INTO v_sequence
  FROM public.expense_approvals
  WHERE entry_id = p_entry_id;

  INSERT INTO public.expense_approvals (
    entry_id, sequence, action, from_status, to_status, actor_id, reason
  )
  VALUES (p_entry_id, v_sequence, p_action, p_from, p_to, v_actor,
          nullif(btrim(coalesce(p_reason, '')), ''));

  -- The generic audit log keeps the expense trail discoverable from the same
  -- screen an owner already uses for every other module.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_actor, 'expense.' || p_action, 'expense_entry', p_entry_id,
          jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason));
END $function$


CREATE OR REPLACE FUNCTION public.expense_lookups(p_include_archived boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'name_ar', c.name_ar,
               'is_active', c.is_active, 'sort_order', c.sort_order,
               'usage_count', (SELECT count(*) FROM public.expense_lines l WHERE l.category_id = c.id)
             ) ORDER BY c.sort_order, c.name)
      FROM public.expense_categories c
      WHERE p_include_archived OR c.is_active
    ), '[]'::jsonb),
    'warehouses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', w.id, 'name', w.name, 'name_ar', w.name_ar, 'is_default', w.is_default
             ) ORDER BY w.name)
      FROM public.warehouses w
      WHERE w.is_active IS NOT FALSE
    ), '[]'::jsonb),
    'cost_centers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', cc.id, 'code', cc.code, 'name', cc.name, 'name_ar', cc.name_ar
             ) ORDER BY cc.name)
      FROM public.expense_cost_centers cc
      WHERE cc.is_active
    ), '[]'::jsonb),
    'projects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pj.id, 'code', pj.code, 'name', pj.name, 'name_ar', pj.name_ar
             ) ORDER BY pj.name)
      FROM public.expense_projects pj
      WHERE pj.is_active
    ), '[]'::jsonb),
    'suppliers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
      FROM public.suppliers s
      WHERE s.is_active IS NOT FALSE
    ), '[]'::jsonb),
    'employees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name)
      FROM public.profiles p
      WHERE p.is_active IS NOT FALSE
        AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id)
    ), '[]'::jsonb),
    'financial_accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'code', a.code, 'name_ar', a.name_ar,
               'account_type', a.account_type,
               'requires_reconciliation', a.requires_reconciliation
             ) ORDER BY a.code)
      FROM public.accounts a
      WHERE a.is_active IS NOT FALSE
        AND (a.requires_reconciliation IS TRUE OR a.code LIKE '11%')
    ), '[]'::jsonb)
  )
$function$


CREATE OR REPLACE FUNCTION public.expense_report(p_group_by text DEFAULT 'category'::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status expense_status[] DEFAULT NULL::expense_status[], p_warehouse_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(group_key text, label text, label_ar text, entry_count bigint, total_amount numeric, paid_amount numeric, outstanding numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  -- Status default: only documents that actually affect the books. A report
  -- that silently included drafts would disagree with the ledger.
  IF p_status IS NULL THEN
    p_status := ARRAY['POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED']::public.expense_status[];
  END IF;

  IF p_group_by = 'category' THEN
    RETURN QUERY
    SELECT
      COALESCE(l.category_id::text, 'none'),
      COALESCE(c.name, 'Uncategorised'),
      COALESCE(c.name_ar, c.name, 'غير مصنّف'),
      count(DISTINCT e.id),
      COALESCE(sum(l.gross_amount), 0),
      -- Paid is allocated pro-rata by line share, because a payment settles the
      -- document, not a line. Allocating it any other way (e.g. by category
      -- order) would make the report disagree with the header totals.
      COALESCE(sum(l.gross_amount * CASE
        WHEN e.total_amount > 0 THEN e.paid_amount / e.total_amount ELSE 0 END), 0),
      COALESCE(sum(l.gross_amount * CASE
        WHEN e.total_amount > 0 THEN e.remaining_amount / e.total_amount ELSE 0 END), 0)
    FROM public.expense_lines l
    JOIN public.expense_entries e ON e.id = l.entry_id
    LEFT JOIN public.expense_categories c ON c.id = l.category_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY l.category_id, c.name, c.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'month' THEN
    RETURN QUERY
    SELECT
      to_char(date_trunc('month', e.expense_date), 'YYYY-MM'),
      to_char(date_trunc('month', e.expense_date), 'YYYY-MM'),
      to_char(date_trunc('month', e.expense_date), 'YYYY-MM'),
      count(*),
      COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0),
      COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY date_trunc('month', e.expense_date)
    -- Oldest first: a trend chart reads left to right, unlike a ranking table.
    ORDER BY 1 ASC
    LIMIT v_limit;

  ELSIF p_group_by = 'warehouse' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.warehouse_id::text, 'none'),
      COALESCE(w.name, 'Unassigned'),
      COALESCE(w.name_ar, w.name, 'غير محدد'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.warehouses w ON w.id = e.warehouse_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.warehouse_id, w.name, w.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'cost_center' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.cost_center_id::text, 'none'),
      COALESCE(cc.name, 'Unassigned'),
      COALESCE(cc.name_ar, cc.name, 'غير محدد'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.expense_cost_centers cc ON cc.id = e.cost_center_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.cost_center_id, cc.name, cc.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'project' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.project_id::text, 'none'),
      COALESCE(pj.name, 'Unassigned'),
      COALESCE(pj.name_ar, pj.name, 'غير محدد'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.expense_projects pj ON pj.id = e.project_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.project_id, pj.name, pj.name_ar
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'payee' THEN
    RETURN QUERY
    SELECT
      COALESCE(e.supplier_id::text, e.employee_id::text, e.payee_name, 'none'),
      COALESCE(s.name, pr.full_name, e.payee_name, 'Unnamed payee'),
      COALESCE(s.name, pr.full_name, e.payee_name, 'بدون جهة'),
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    LEFT JOIN public.suppliers s ON s.id = e.supplier_id
    LEFT JOIN public.profiles  pr ON pr.id = e.employee_id
    WHERE e.status = ANY (p_status)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
    GROUP BY e.supplier_id, s.name, e.employee_id, pr.full_name, e.payee_name
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSIF p_group_by = 'status' THEN
    RETURN QUERY
    SELECT
      e.status::text, e.status::text, e.status::text,
      count(*), COALESCE(sum(e.total_amount), 0),
      COALESCE(sum(e.paid_amount), 0), COALESCE(sum(e.remaining_amount), 0)
    FROM public.expense_entries e
    WHERE (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
      AND (p_status IS NULL OR e.status = ANY (p_status))
    GROUP BY e.status
    ORDER BY 5 DESC
    LIMIT v_limit;

  ELSE
    RAISE EXCEPTION
      'Unsupported group_by: %. Allowed: category, month, warehouse, cost_center, project, payee, status',
      p_group_by
      USING ERRCODE = '22023';
  END IF;
END $function$


CREATE OR REPLACE FUNCTION public.expense_role_rank(p_user uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.has_role(p_user, 'owner')      THEN 50
    WHEN public.has_role(p_user, 'manager')    THEN 40
    WHEN public.has_role(p_user, 'accountant') THEN 30
    WHEN public.has_role(p_user, 'cashier')    THEN 20
    WHEN public.has_role(p_user, 'warehouse')  THEN 10
    ELSE 0
  END
$function$


CREATE OR REPLACE FUNCTION public.expense_round(p_value numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Numeric, not float: 0.005 must round the way the accountant expects and
  -- SUM() over a million rows must not accumulate binary drift.
  SELECT round(coalesce(p_value, 0)::numeric, 2)
$function$


CREATE OR REPLACE FUNCTION public.expense_settlement_status(p_current expense_status, p_paid numeric, p_total numeric)
 RETURNS expense_status
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_current NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN p_current
    WHEN coalesce(p_total, 0) <= 0 THEN p_current
    WHEN coalesce(p_paid, 0) <= 0 THEN 'POSTED'::public.expense_status
    -- Deliberately `>=` on the paid side and `>` on the zero side: a rounding
    -- remainder of less than half a unit must settle as fully paid rather than
    -- leaving a document permanently "partially paid".
    WHEN coalesce(p_paid, 0) >= coalesce(p_total, 0) - 0.005 THEN 'PAID'::public.expense_status
    ELSE 'PARTIALLY_PAID'::public.expense_status
  END
$function$


CREATE OR REPLACE FUNCTION public.expense_summary(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH scoped AS (
    SELECT e.*
    FROM public.expense_entries e
    WHERE (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id IS NULL OR e.warehouse_id = p_warehouse_id)
      AND e.status NOT IN ('CANCELLED', 'REVERSED')
  )
  SELECT jsonb_build_object(
    'period_total',      COALESCE(sum(total_amount), 0),
    'posted_total',      COALESCE(sum(total_amount) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED')), 0),
    'paid_total',        COALESCE(sum(paid_amount), 0),
    'outstanding_total', COALESCE(sum(remaining_amount) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID') AND remaining_amount > 0.005), 0),
    'pending_total',     COALESCE(sum(total_amount) FILTER (WHERE status = 'SUBMITTED'), 0),
    'draft_total',       COALESCE(sum(total_amount) FILTER (WHERE status IN ('DRAFT', 'REJECTED')), 0),
    'total_count',       count(*),
    'pending_count',     count(*) FILTER (WHERE status = 'SUBMITTED'),
    'unpaid_count',      count(*) FILTER (WHERE status = 'POSTED'),
    'partial_count',     count(*) FILTER (WHERE status = 'PARTIALLY_PAID'),
    'paid_count',        count(*) FILTER (WHERE status IN ('PAID', 'CLOSED')),
    'draft_count',       count(*) FILTER (WHERE status IN ('DRAFT', 'REJECTED')),
    'overdue_count',     count(*) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                             AND due_date IS NOT NULL
                             AND due_date < CURRENT_DATE
                             AND remaining_amount > 0.005),
    'overdue_total',     COALESCE(sum(remaining_amount) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                             AND due_date IS NOT NULL
                             AND due_date < CURRENT_DATE
                             AND remaining_amount > 0.005), 0)
  )
  FROM scoped$function$


CREATE OR REPLACE FUNCTION public.expense_write_lines(p_entry_id uuid, p_lines jsonb, p_tax_mode expense_tax_mode, OUT o_total numeric, OUT o_count integer)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line        jsonb;
  v_index       integer := 0;
  v_qty         numeric;
  v_price       numeric;
  v_rate        numeric;
  v_gross       numeric;
  v_net         numeric;
  v_tax         numeric;
BEGIN
  o_total := 0;
  o_count := 0;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one expense line is required' USING ERRCODE = '22023';
  END IF;

  -- Replacing the whole set is intentional: a partial update would need a line
  -- identity from the client, and clients do not own line identity here.
  DELETE FROM public.expense_lines WHERE entry_id = p_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_index := v_index + 1;

    v_qty   := COALESCE((v_line ->> 'quantity')::numeric, 1);
    v_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_rate  := COALESCE((v_line ->> 'tax_rate')::numeric, 0);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Line %: quantity must be greater than zero', v_index USING ERRCODE = '22023';
    END IF;
    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Line %: unit price cannot be negative', v_index USING ERRCODE = '22023';
    END IF;
    IF v_rate < 0 OR v_rate > 100 THEN
      RAISE EXCEPTION 'Line %: tax rate must be between 0 and 100', v_index USING ERRCODE = '22023';
    END IF;

    -- The client sends what the operator typed — the gross figure on the paper
    -- bill. Net and tax are derived here so the two can never disagree, and so
    -- the arithmetic is identical for a JS client and a future import script.
    v_gross := public.expense_round(v_qty * v_price);
    v_net   := public.expense_line_net(v_gross, v_rate, p_tax_mode);
    v_tax   := public.expense_line_tax(v_gross, v_rate, p_tax_mode);

    INSERT INTO public.expense_lines (
      entry_id, line_no, description, category_id, quantity, unit_price,
      net_amount, tax_rate, tax_amount, gross_amount,
      cost_center_id, project_id, note
    )
    VALUES (
      p_entry_id,
      v_index,
      nullif(btrim(coalesce(v_line ->> 'description', '')), ''),
      nullif(btrim(coalesce(v_line ->> 'category_id', '')), '')::uuid,
      v_qty,
      v_price,
      v_net,
      v_rate,
      v_tax,
      v_gross,
      nullif(btrim(coalesce(v_line ->> 'cost_center_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_line ->> 'project_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_line ->> 'note', '')), '')
    );

    o_total := o_total + v_gross;
    o_count := o_count + 1;
  END LOOP;

  o_total := public.expense_round(o_total);

  IF o_total <= 0 THEN
    RAISE EXCEPTION 'Expense total must be greater than zero' USING ERRCODE = '22023';
  END IF;
END $function$


CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, language, theme)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'ar',
    'dark'
  )
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);

  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$


CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = p_user_id
      AND is_active = true
  );
$function$


CREATE OR REPLACE FUNCTION public.is_platform_superadmin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = p_user_id
      AND role IN ('superadmin', 'admin')
      AND is_active = true
  );
$function$


CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
    AND COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), false)
$function$


CREATE OR REPLACE FUNCTION public.issue_milling_service_invoice(_job_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _include_packaging boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        uuid := auth.uid();
  v_invoice_id  uuid;
  v_store       uuid;
  v_customer    uuid;
  v_status      public.milling_status;
  v_bags        integer;
  v_bag_size    numeric;
  v_input_kg    numeric;
  v_fee_per_bag numeric;
  v_fee_per_ton numeric;
  v_tons        numeric;
  v_service_id  uuid;
  v_ton_service_id uuid;
  v_lines       jsonb := '[]'::jsonb;
  v_pack        record;
  v_pack_bags   integer := 0;
  v_pack_value  numeric := 0;
  v_line_item   uuid;
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

  SELECT store_id, customer_id, status, input_bag_count, input_bag_size_kg,
         input_weight_kg, milling_fee_per_bag, milling_fee_per_ton, service_product_id
    INTO v_store, v_customer, v_status, v_bags, v_bag_size,
         v_input_kg, v_fee_per_bag, v_fee_per_ton, v_service_id
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;

  -- Only a finished run is billable. Billing an open job would invoice a fee
  -- for grain that is still in the mill.
  IF v_status <> 'COMPLETED' AND v_status <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % must be completed before invoicing (current status: %)', _job_id, v_status;
  END IF;

  -- Idempotency: one service invoice per job. Re-issuing would double-bill.
  SELECT id INTO v_invoice_id
  FROM public.sales_invoices
  WHERE milling_job_id = _job_id;

  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job % has already been invoiced (invoice %) — delete it first to re-issue', _job_id, v_invoice_id;
  END IF;

  -- Fall back to the standard 50 kg per-bag service card.
  IF v_service_id IS NULL THEN
    SELECT id INTO v_service_id FROM public.products WHERE sku = 'SRV-MILL-BAG50';
  END IF;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'No milling service item found (SRV-MILL-BAG50) — run the milling master-data seed';
  END IF;

  -- Per-ton fee gets its OWN card, otherwise create_sale prices it with the
  -- per-bag card's catalogue price (the bug this migration fixes).
  SELECT id INTO v_ton_service_id FROM public.products WHERE sku = 'SRV-MILL-TON-JOB';
  IF v_ton_service_id IS NULL THEN
    SELECT id INTO v_ton_service_id FROM public.products WHERE sku = 'SRV-MILL-TON';
  END IF;

  -- ── line 1: the milling fee ─────────────────────────────────────────────
  -- Per-bag and per-ton fees are independent terms. When a contract sets both
  -- ("the greater of"), BOTH are charged and the operator sees two lines, rather
  -- than the function silently picking one and hiding the commercial decision.
  IF v_fee_per_bag > 0 THEN
    IF coalesce(v_bags, 0) <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per bag but records no bag count', _job_id;
    END IF;

    -- create_sale takes the catalogue price whenever a product_id is present, so
    -- the agreed job fee is pinned onto its own card first. This is what makes
    -- the billing follow milling_jobs.milling_fee_per_bag, as the seed comment
    -- promises, instead of the generic reference price.
    UPDATE public.products
       SET sale_price = v_fee_per_bag, updated_at = now()
     WHERE id = v_service_id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_service_id,
      'quantity', v_bags,
      'unit_price', v_fee_per_bag
    ));
  END IF;

  IF v_fee_per_ton > 0 THEN
    v_tons := round(v_input_kg / 1000, 3);

    IF v_ton_service_id IS NULL THEN
      RAISE EXCEPTION 'No per-ton milling service card (SRV-MILL-TON-JOB) — run migration 20261001120000';
    END IF;

    UPDATE public.products
       SET sale_price = v_fee_per_ton, updated_at = now()
     WHERE id = v_ton_service_id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_ton_service_id,
      'quantity', v_tons,
      'unit_price', v_fee_per_ton
    ));
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Job % has no milling fee configured', _job_id;
  END IF;

  -- ── lines 2..n: packaging supplied by the mill ───────────────────────────
  -- The bag stock is decremented HERE and only here, so every issue is tied to a
  -- real financial document and the packaging stock can never drift from the
  -- invoices. Customer-supplied bags (bags_source = 'CUSTOMER') are skipped:
  -- they have no financial effect at all.
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
      v_pack_bags   := v_pack_bags + coalesce(v_pack.bags, 0);
      v_pack_value  := v_pack_value + round(coalesce(v_pack.bags, 0) * coalesce(v_pack.unit_price, 0), 2);

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pack.mill_bag_product_id,
        'quantity', coalesce(v_pack.bags, 0),
        'unit_price', coalesce(v_pack.unit_price, 0)
      ));
    END LOOP;
  END IF;

  -- ── post through the ordinary sales engine ───────────────────────────────
  -- create_sale() reads each line's item policy and posts STOCK_ISSUE only for
  -- TRACKED goods. The milling fee lines are SERVICE → no movement. The packaging
  -- line is GOOD + TRACKED → a real issue against the mill's own stock, tied to
  -- this invoice. That is the entire, and only, stock effect of the module.
  v_invoice_id := public.create_sale(
    v_store,
    v_customer,
    _payment_method,
    coalesce(_paid, 0),
    coalesce(_discount, 0),
    btrim(COALESCE(_note, '') || ' — أجرة طحن ' || (SELECT job_number FROM public.milling_jobs WHERE id = _job_id)),
    v_lines
  );

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'The sales engine returned no invoice';
  END IF;

  -- Tag the invoice so the customer statement can separate toll-service billing
  -- from ordinary goods sales, and so double-billing is detectable above.
  UPDATE public.sales_invoices
  SET milling_job_id = _job_id
  WHERE id = v_invoice_id;

  -- The stock effect of the packaging lines is recorded on the milling audit
  -- trail, so a stock-take discrepancy in packaging can be traced to the exact
  -- service invoice that caused it.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.invoice.issued', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'milling_job_id', _job_id,
      'customer_id', v_customer,
      'warehouse_id', v_store,
      'fee_per_bag', v_fee_per_bag,
      'fee_per_ton', v_fee_per_ton,
      'packaging_bags', v_pack_bags,
      'packaging_value', v_pack_value,
      'stock_impact', 'STOCK_ISSUE on mill packaging only — grain and flour untouched'
    ));

  RETURN v_invoice_id;
END $function$


CREATE OR REPLACE FUNCTION public.issue_milling_service_invoice_v2(_job_id uuid, _payment_method text, _paid numeric, _discount numeric, _note text, _include_packaging boolean DEFAULT true, _include_sewing boolean DEFAULT false, _sewing_price numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$


CREATE OR REPLACE FUNCTION public.issue_production_materials(_order_id uuid, _product_id uuid, _qty numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord   record;
  v_avail numeric;
  v_cost  numeric;
  v_mid   uuid;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to issue production materials';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is % and cannot be issued to', v_ord.order_number, v_ord.status;
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity to issue must be greater than zero';
  END IF;

  SELECT coalesce(i.quantity, 0) INTO v_avail
    FROM public.products p
    LEFT JOIN public.inventory i
           ON i.product_id = p.id AND i.warehouse_id = v_ord.warehouse_id
          AND i.owner_type = 'COMPANY'::public.owner_type AND i.owner_id IS NULL
   WHERE p.id = _product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item is not a known stock item';
  END IF;
  IF v_avail < _qty THEN
    RAISE EXCEPTION 'Only % available of this item, tried to issue %', v_avail, _qty;
  END IF;

  v_cost := public.resolve_unit_cost(_product_id, v_ord.warehouse_id);

  PERFORM public.post_stock_delta(
    p_product_id => _product_id, p_warehouse_id => v_ord.warehouse_id,
    p_signed_qty => -_qty, p_unit_cost => v_cost,
    p_movement_kind => 'ISSUE', p_source_type => 'production_issue',
    p_source_id => _order_id, p_note => 'صرف مواد إنتاج ' || v_ord.order_number,
    p_owner_type => 'COMPANY', p_owner_id => NULL);

  PERFORM public.apply_cost_movement(
    p_product_id => _product_id, p_warehouse_id => v_ord.warehouse_id,
    p_signed_qty => -_qty, p_incoming_cost => NULL,
    p_source_type => 'production_issue', p_source_id => _order_id,
    p_note => 'صرف مواد إنتاج ' || v_ord.order_number);

  v_mid := public.production_last_movement(_product_id, v_ord.warehouse_id, _order_id);

  INSERT INTO public.production_order_materials
    (order_id, product_id, planned_qty, actual_qty, unit_cost, total_cost, movement_id)
  VALUES (_order_id, _product_id, 0, _qty, v_cost, round(_qty * v_cost, 2), v_mid)
  ON CONFLICT (order_id, product_id) DO UPDATE
    SET actual_qty = public.production_order_materials.actual_qty + EXCLUDED.actual_qty,
        total_cost = round(public.production_order_materials.total_cost + EXCLUDED.total_cost, 2),
        unit_cost  = EXCLUDED.unit_cost,
        movement_id = EXCLUDED.movement_id;

  UPDATE public.production_orders o
     SET actual_input_qty = coalesce((SELECT sum(actual_qty) FROM public.production_order_materials WHERE order_id = _order_id), 0),
         material_cost     = coalesce((SELECT sum(total_cost) FROM public.production_order_materials WHERE order_id = _order_id), 0),
         status            = 'ISSUED'
   WHERE o.id = _order_id;
  RETURN v_mid;
END $function$


CREATE OR REPLACE FUNCTION public.item_effective_policy(p_item_id uuid)
 RETURNS inventory_policy
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(ci.inventory_policy, p.inventory_policy)
  FROM public.products p
  LEFT JOIN public.company_items ci
    ON ci.item_id = p.id AND ci.company_id = 1 AND ci.is_active
  WHERE p.id = p_item_id
$function$


CREATE OR REPLACE FUNCTION public.item_has_stock_history(p_item_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.product_id = p_item_id)
      OR EXISTS (SELECT 1 FROM public.inventory i WHERE i.product_id = p_item_id AND i.quantity <> 0)
$function$


CREATE OR REPLACE FUNCTION public.item_line_type(p_item_id uuid, p_is_ad_hoc boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nature public.item_nature;
  v_policy public.inventory_policy;
BEGIN
  IF p_is_ad_hoc THEN
    RETURN 'AD_HOC_SERVICE';
  END IF;
  IF p_item_id IS NULL THEN
    RETURN 'AD_HOC_SERVICE';
  END IF;

  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = p_item_id;
  IF v_nature IS NULL THEN
    RETURN 'AD_HOC_SERVICE';
  END IF;
  IF v_nature = 'SERVICE' THEN
    RETURN 'SERVICE';
  END IF;

  v_policy := public.item_effective_policy(p_item_id);
  RETURN CASE v_policy
    WHEN 'TRACKED'        THEN 'STOCKED_GOOD'
    WHEN 'CUSTOMER_OWNED' THEN 'CUSTOMER_OWNED_GOOD'
    ELSE 'UNTRACKED_GOOD'
  END;
END $function$


CREATE OR REPLACE FUNCTION public.item_stock_effect(p_item_id uuid, p_direction text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nature public.item_nature;
  v_policy public.inventory_policy;
BEGIN
  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = p_item_id;
  IF v_nature IS NULL THEN
    RETURN 'NONE';
  END IF;

  -- A SERVICE never moves company stock, in either direction.
  IF v_nature = 'SERVICE' THEN
    RETURN 'NONE';
  END IF;

  v_policy := public.item_effective_policy(p_item_id);

  -- Rule 4 / Rule 5: only TRACKED goods move stock. UNTRACKED goods are sold
  -- and purchased without any inventory effect; CUSTOMER_OWNED material is
  -- never company stock, so a normal sale/purchase never touches it.
  IF v_policy <> 'TRACKED' THEN
    RETURN 'NONE';
  END IF;

  RETURN CASE WHEN p_direction = 'out' THEN 'STOCK_ISSUE' ELSE 'STOCK_RECEIPT' END;
END $function$


CREATE OR REPLACE FUNCTION public.list_expenses(p_search text DEFAULT NULL::text, p_status expense_status[] DEFAULT NULL::expense_status[], p_category_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_payment_state text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_amount_min numeric DEFAULT NULL::numeric, p_amount_max numeric DEFAULT NULL::numeric, p_category_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 50, p_cursor_date date DEFAULT NULL::date, p_cursor_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, reference text, status expense_status, entry_type expense_entry_type, payee_type expense_payee_type, payee_name text, supplier_id uuid, supplier_name text, employee_id uuid, employee_name text, warehouse_id uuid, warehouse_name text, cost_center_id uuid, cost_center_name text, project_id uuid, project_name text, expense_date date, due_date date, posting_date date, description text, note text, total_amount numeric, paid_amount numeric, remaining_amount numeric, line_count integer, primary_category text, primary_category_ar text, version integer, created_by uuid, created_by_name text, created_at timestamp with time zone, approved_at timestamp with time zone, posted_at timestamp with time zone, total_count bigint, next_cursor_date date, next_cursor_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT
      e.id, e.reference, e.status, e.entry_type, e.payee_type, e.payee_name,
      e.supplier_id, e.employee_id, e.warehouse_id, e.cost_center_id, e.project_id,
      e.expense_date, e.due_date, e.posting_date, e.description, e.note,
      e.total_amount, e.paid_amount, e.remaining_amount, e.line_count,
      e.version, e.created_by, e.created_at, e.approved_at, e.posted_at
    FROM public.expense_entries e
    WHERE
      -- Reference first: it is the identifier an operator actually types.
      (p_search IS NULL OR btrim(p_search) = '' OR
        e.reference ILIKE '%' || btrim(p_search) || '%' OR
        COALESCE(e.description, '') ILIKE '%' || btrim(p_search) || '%' OR
        COALESCE(e.note, '')        ILIKE '%' || btrim(p_search) || '%' OR
        COALESCE(e.payee_name, '')  ILIKE '%' || btrim(p_search) || '%')
      AND (p_status IS NULL OR e.status = ANY (p_status))
      AND (p_warehouse_id   IS NULL OR e.warehouse_id   = p_warehouse_id)
      AND (p_cost_center_id IS NULL OR e.cost_center_id = p_cost_center_id)
      AND (p_project_id     IS NULL OR e.project_id     = p_project_id)
      AND (p_supplier_id    IS NULL OR e.supplier_id    = p_supplier_id)
      AND (p_employee_id    IS NULL OR e.employee_id    = p_employee_id)
      AND (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_amount_min IS NULL OR e.total_amount >= p_amount_min)
      AND (p_amount_max IS NULL OR e.total_amount <= p_amount_max)
      -- Settlement is derived, never stored as a filter column, so the three
      -- buckets are expressed against the real amounts.
      AND (
        p_payment_state IS NULL
        OR (p_payment_state = 'unpaid'  AND e.paid_amount <= 0)
        OR (p_payment_state = 'partial' AND e.paid_amount > 0
                                        AND e.paid_amount < e.total_amount - 0.005)
        OR (p_payment_state = 'paid'    AND e.paid_amount >= e.total_amount - 0.005)
      )
      -- Category lives on the lines, so this is an EXISTS rather than a join:
      -- a join would duplicate the document once per matching line and break
      -- the keyset page size.
      AND (
        p_category_id IS NULL
        OR EXISTS (SELECT 1 FROM public.expense_lines l
                   WHERE l.entry_id = e.id AND l.category_id = p_category_id)
      )
      AND (
        p_category_ids IS NULL OR cardinality(p_category_ids) = 0
        OR EXISTS (SELECT 1 FROM public.expense_lines l
                   WHERE l.entry_id = e.id AND l.category_id = ANY (p_category_ids))
      )
      -- Keyset predicate. Matches the (expense_date DESC, id DESC) index exactly.
      AND (
        p_cursor_date IS NULL
        OR (e.expense_date, e.id) < (p_cursor_date, COALESCE(p_cursor_id, e.id))
      )
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  ),
  -- The count is computed over the same predicate but without the page limit,
  -- with a window aggregate so it costs one scan rather than two round-trips.
  counted AS (
    SELECT
      f.*,
      count(*) OVER () AS page_count,
      (SELECT count(*) FROM public.expense_entries e2
       WHERE (p_date_from IS NULL OR e2.expense_date >= p_date_from)
         AND (p_date_to   IS NULL OR e2.expense_date <= p_date_to)
         AND (p_status IS NULL OR e2.status = ANY (p_status))) AS total_count
    FROM filtered f
  )
  SELECT
    c.id, c.reference, c.status, c.entry_type, c.payee_type, c.payee_name,
    c.supplier_id, s.name,
    c.employee_id, pr.full_name,
    c.warehouse_id, w.name,
    c.cost_center_id, cc.name,
    c.project_id, pj.name,
    c.expense_date, c.due_date, c.posting_date, c.description, c.note,
    c.total_amount, c.paid_amount, c.remaining_amount, c.line_count,
    cat.name, cat.name_ar,
    c.version, c.created_by, pr2.full_name, c.created_at, c.approved_at, c.posted_at,
    c.total_count,
    -- The cursor for the next page is the last row of this one. When the page
    -- is the final one these are still populated but the caller is told to stop
    -- by `page_count < p_limit`; returning them keeps the contract uniform.
    c.expense_date,
    c.id
  FROM counted c
  -- LEFT JOINs, deliberately: an expense with no supplier, no cost centre and
  -- no creator must still appear. An INNER JOIN here would make documents
  -- disappear from the register depending on unrelated reference data.
  LEFT JOIN public.suppliers s        ON s.id = c.supplier_id
  LEFT JOIN public.profiles  pr       ON pr.id = c.employee_id
  LEFT JOIN public.profiles  pr2      ON pr2.id = c.created_by
  LEFT JOIN public.warehouses w       ON w.id = c.warehouse_id
  LEFT JOIN public.expense_cost_centers cc ON cc.id = c.cost_center_id
  LEFT JOIN public.expense_projects pj ON pj.id = c.project_id
  -- The "primary" category is the largest line by gross amount — the one an
  -- operator would name if asked "what was this expense for?". Deterministic
  -- tie-break on line_no so the same document always shows the same label.
  LEFT JOIN LATERAL (
    SELECT l.category_id
    FROM public.expense_lines l
    WHERE l.entry_id = c.id
    ORDER BY l.gross_amount DESC, l.line_no ASC
    LIMIT 1
  ) prim ON true
  LEFT JOIN public.expense_categories cat ON cat.id = prim.category_id
  ORDER BY c.expense_date DESC, c.id DESC
$function$


CREATE OR REPLACE FUNCTION public.migrate_legacy_expenses(p_mode text DEFAULT 'draft'::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_batch_size integer DEFAULT 500, p_dry_run boolean DEFAULT true)
 RETURNS TABLE(processed integer, created integer, skipped integer, failed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := public.expense_actor();
  v_row        record;
  v_entry_id   uuid;
  v_processed  integer := 0;
  v_created    integer := 0;
  v_skipped    integer := 0;
  v_failed     integer := 0;
  v_status     public.expense_status;
  v_payment    public.payment_method;
  v_batch      integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
BEGIN
  -- A data migration is an owner/manager action. `expense.post` is the closest
  -- existing capability in weight: it decides whether a number reaches the books.
  PERFORM public.expense_assert_capability(v_user, 'expense.post');

  IF p_mode NOT IN ('draft', 'unpaid', 'paid') THEN
    RAISE EXCEPTION 'mode must be draft, unpaid or paid (got %)', p_mode
      USING ERRCODE = '22023';
  END IF;

  v_status := CASE p_mode
                WHEN 'draft'  THEN 'DRAFT'::public.expense_status
                ELSE 'POSTED'::public.expense_status
              END;

  FOR v_row IN
    SELECT x.*
    FROM public.expenses x
    -- The NOT EXISTS is the idempotency guard and it is the reason a re-run is
    -- free: an already-bridged row is never revisited, so its document is never
    -- duplicated and its approval history is never rewritten.
    WHERE NOT EXISTS (
      SELECT 1 FROM public.expense_entries e WHERE e.legacy_expense_id = x.id
    )
      AND (p_from IS NULL OR x.expense_date >= p_from)
      AND (p_to   IS NULL OR x.expense_date <= p_to)
    ORDER BY x.expense_date, x.created_at
    LIMIT v_batch
  LOOP
    v_processed := v_processed + 1;

    BEGIN
      -- A zero-amount legacy row cannot become a valid document (the foundation
      -- requires a positive total) and carries no information. Counted rather
      -- than silently dropped, so the operator sees the number and can decide.
      IF COALESCE(v_row.amount, 0) <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.expense_entries (
        reference, entry_type, status, source_kind,
        payee_type, expense_date,
        description, note,
        total_amount, tax_mode, currency, currency_symbol,
        created_by, legacy_expense_id,
        posting_date, posted_by, posted_at
      )
      VALUES (
        -- The legacy row keeps its own id in the reference, so an operator can
        -- still find a document in the new register using the number they have
        -- always quoted: EXP-LEG-<first 8 of the legacy uuid>.
        'EXP-LEG-' || upper(left(replace(v_row.id::text, '-', ''), 8)),
        'DIRECT',
        v_status,
        'LEGACY',
        'NONE',
        v_row.expense_date,
        COALESCE(
          NULLIF(btrim(COALESCE(v_row.note, '')), ''),
          (SELECT COALESCE(c.name_ar, c.name) FROM public.expense_categories c
            WHERE c.id = v_row.category_id),
          'Migrated expense'
        ),
        v_row.note,
        public.expense_round(v_row.amount),
        'NONE',
        COALESCE((SELECT NULLIF(btrim(currency), '') FROM public.company_settings ORDER BY id LIMIT 1), 'YER'),
        COALESCE((SELECT NULLIF(btrim(currency_symbol), '') FROM public.company_settings ORDER BY id LIMIT 1), '﷼'),
        -- `created_by` is deliberately NOT taken from the legacy row: the
        -- original author may have been deleted, and a null creator is honest.
        -- The actor performing the migration is recorded in the audit trail
        -- instead, which is where attribution for a migration belongs.
        NULL,
        v_row.id,
        CASE WHEN v_status = 'POSTED' THEN v_row.expense_date END,
        CASE WHEN v_status = 'POSTED' THEN v_user END,
        CASE WHEN v_status = 'POSTED' THEN now() END
      )
      RETURNING id INTO v_entry_id;

      -- One line per legacy row: the old model could only express one amount,
      -- so inventing a split would be fabricating structure that was never
      -- there. What it DID record — the amount, the category and the note — is
      -- preserved exactly.
      INSERT INTO public.expense_lines (
        entry_id, line_no, description, category_id, quantity, unit_price,
        net_amount, tax_rate, tax_amount, gross_amount
      )
      VALUES (
        v_entry_id, 1,
        NULLIF(btrim(COALESCE(v_row.note, '')), ''),
        v_row.category_id, 1, public.expense_round(v_row.amount),
        public.expense_round(v_row.amount), 0, 0,
        public.expense_round(v_row.amount)
      );

      -- `credit` is the one legacy value that unambiguously means "not settled",
      -- so it overrides the 'paid' mode rather than being overruled by it.
      IF p_mode = 'paid' AND v_row.payment_method IS DISTINCT FROM 'credit' THEN
        v_payment := COALESCE(v_row.payment_method, 'cash');

        INSERT INTO public.expense_payments (
          entry_id, amount, payment_date, payment_method, note,
          idempotency_key, created_by
        )
        VALUES (
          v_entry_id, public.expense_round(v_row.amount),
          -- The legacy table records when the row was typed, not when it was
          -- paid; used as the closest available evidence and labelled as such.
          v_row.expense_date,
          v_payment,
          'Migrated from legacy expense ' || v_row.id::text,
          'legacy:' || v_row.id::text,
          v_user
        )
        ON CONFLICT DO NOTHING;
      END IF;

      INSERT INTO public.expense_approvals (
        entry_id, sequence, action, from_status, to_status, actor_id, reason
      )
      VALUES (
        v_entry_id, 1,
        CASE WHEN v_status = 'POSTED' THEN 'posted' ELSE 'created' END,
        NULL, v_status, v_user,
        'Migrated from legacy expense ' || v_row.id::text || ' (mode: ' || p_mode || ')'
      );

      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One bad row must not abort the batch. The failure is counted and the
      -- message is raised as a notice so it reaches the operator's log without
      -- rolling back the rows that succeeded.
      v_failed := v_failed + 1;
      RAISE WARNING 'legacy expense % could not be migrated: %', v_row.id, SQLERRM;
    END;
  END LOOP;

  -- A dry run performs identical work and then throws it away. That is the
  -- point: the validation, the reference generation and the line arithmetic are
  -- exercised exactly as they would be for real, so a dry run actually proves
  -- something. The exception below is caught by the caller, not an error path.
  IF p_dry_run THEN
    RAISE EXCEPTION 'DRY RUN: % processed, % would be created, % skipped, % failed — nothing was written',
      v_processed, v_created, v_skipped, v_failed
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, payload)
  VALUES (v_user, 'expense.legacy.migrated', 'expense_entry',
          jsonb_build_object(
            'mode', p_mode, 'processed', v_processed, 'created', v_created,
            'skipped', v_skipped, 'failed', v_failed,
            'from', p_from, 'to', p_to));

  RETURN QUERY SELECT v_processed, v_created, v_skipped, v_failed;
END $function$


CREATE OR REPLACE FUNCTION public.milling_kg_per_unit(_unit_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(c.kg_per_unit, 1.0000)
  FROM public.milling_unit_conversions c
  WHERE c.unit_id = _unit_id;
$function$


CREATE OR REPLACE FUNCTION public.milling_match_grain_grade(_grade_id uuid, _moisture numeric DEFAULT NULL::numeric, _impurities numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_grade record;
  v_moisture_ok boolean;
  v_impurities_ok boolean;
BEGIN
  IF _grade_id IS NULL THEN
    RETURN jsonb_build_object(
      'grade_id',      NULL,
      'grade_name_ar', NULL,
      'status',        'MISSING',
      'message_ar',    'لم يُحدَّد نوع الحبوب — سجّل فحصاً لربط السند بالصنف الصحيح.',
      'severity',      'danger'
    );
  END IF;

  SELECT id, product_id, grade_code, grade_name_ar, origin,
         max_moisture, max_impurities, default_bag_size_kg, default_service_sku
    INTO v_grade
  FROM public.milling_grain_grades
  WHERE id = _grade_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'grade_id', NULL, 'status', 'MISSING',
      'message_ar', 'نوع الحبوب المحدد غير موجود.',
      'severity',   'danger'
    );
  END IF;

  v_moisture_ok   := _moisture   IS NULL OR _moisture   <= v_grade.max_moisture;
  v_impurities_ok := _impurities IS NULL OR _impurities <= v_grade.max_impurities;

  RETURN jsonb_build_object(
    'grade_id',         v_grade.id,
    'product_id',       v_grade.product_id,
    'grade_code',       v_grade.grade_code,
    'grade_name_ar',    v_grade.grade_name_ar,
    'origin',           v_grade.origin,
    'max_moisture',     v_grade.max_moisture,
    'max_impurities',   v_grade.max_impurities,
    'default_bag_size_kg', v_grade.default_bag_size_kg,
    'default_service_sku', v_grade.default_service_sku,

    -- 'OK'سليم · 'WARN'تجاوز فني (يُسجَّل) · 'MISSING'لا يوجد فحص
    'status', CASE
      WHEN v_moisture_ok AND v_impurities_ok THEN 'OK'
      ELSE 'WARN'
    END,
    'severity', CASE
      WHEN v_moisture_ok AND v_impurities_ok THEN 'success'
      ELSE 'warning'
    END,

    'moisture_ok',   v_moisture_ok,
    'impurities_ok', v_impurities_ok,
    'message_ar',
      CASE
        WHEN NOT v_moisture_ok AND NOT v_impurities_ok THEN
          'تجاوز الفحص الفني: الرطوبة والشوائب أعلى من الحد المسموح لـ' || v_grade.grade_name_ar
        WHEN NOT v_moisture_ok THEN
          'تجاوز حد الرطوبة (' || v_grade.max_moisture || '%) — قدؤثّر على الاستخلاص. سيُسجَّل التحذير.'
        WHEN NOT v_impurities_ok THEN
          'تجاوز حد الشوائب (' || v_grade.max_impurities || '%) — سيُسجَّل التحذير.'
        ELSE
          'الفحص الفني مطابق لحدود ' || v_grade.grade_name_ar
      END
  );
END $function$


CREATE OR REPLACE FUNCTION public.next_expense_reference()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text;
  v_number bigint;
BEGIN
  SELECT coalesce(nullif(btrim(expense_prefix), ''), 'EXP')
    INTO v_prefix
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;

  IF v_prefix IS NULL THEN
    v_prefix := 'EXP';
  END IF;

  v_number := nextval('public.expense_reference_seq');
  RETURN v_prefix || '-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_number::text, 5, '0');
END $function$


CREATE OR REPLACE FUNCTION public.next_invoice_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_period_format TEXT;
  v_period TEXT;
  v_digits INTEGER;
  v_number BIGINT;
  v_number_text TEXT;
BEGIN
  SELECT
    NULLIF(trim(both '-' FROM btrim(invoice_prefix)), ''),
    COALESCE(invoice_number_period, 'year_month'),
    GREATEST(1, LEAST(COALESCE(invoice_number_digits, 4), 8))
  INTO v_prefix, v_period_format, v_digits
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, 'INV');
  v_period := CASE v_period_format
    WHEN 'year' THEN to_char(now(), 'YYYY')
    WHEN 'year_month' THEN to_char(now(), 'YYYYMM')
    ELSE NULL
  END;
  v_number := nextval('public.sales_invoice_seq');
  v_number_text := CASE
    WHEN length(v_number::TEXT) < v_digits THEN lpad(v_number::TEXT, v_digits, '0')
    ELSE v_number::TEXT
  END;

  RETURN concat_ws('-', v_prefix, v_period, v_number_text);
END $function$


CREATE OR REPLACE FUNCTION public.next_journal_number(p_date date)
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT 'JE-' || to_char(p_date, 'YYYYMMDD') || '-' ||
         lpad((count(*) + 1)::text, 4, '0')
    FROM public.journal_entries
   WHERE entry_date = p_date;
$function$


CREATE OR REPLACE FUNCTION public.next_milling_delivery_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_delivery_seq');
  RETURN 'MDN-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$


CREATE OR REPLACE FUNCTION public.next_milling_intake_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_intake_seq');
  RETURN 'IR-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$


CREATE OR REPLACE FUNCTION public.next_milling_job_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.milling_job_seq');
  RETURN 'MJ-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$


CREATE OR REPLACE FUNCTION public.next_purchase_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_period_format TEXT;
  v_period TEXT;
  v_digits INTEGER;
  v_number BIGINT;
  v_number_text TEXT;
BEGIN
  SELECT
    NULLIF(trim(both '-' FROM btrim(purchase_invoice_prefix)), ''),
    COALESCE(invoice_number_period, 'year_month'),
    GREATEST(1, LEAST(COALESCE(invoice_number_digits, 4), 8))
  INTO v_prefix, v_period_format, v_digits
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, 'PO');
  v_period := CASE v_period_format
    WHEN 'year' THEN to_char(now(), 'YYYY')
    WHEN 'year_month' THEN to_char(now(), 'YYYYMM')
    ELSE NULL
  END;
  v_number := nextval('public.purchase_invoice_seq');
  v_number_text := CASE
    WHEN length(v_number::TEXT) < v_digits THEN lpad(v_number::TEXT, v_digits, '0')
    ELSE v_number::TEXT
  END;

  RETURN concat_ws('-', v_prefix, v_period, v_number_text);
END $function$


CREATE OR REPLACE FUNCTION public.next_purchase_return_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n BIGINT; BEGIN n := nextval('public.purchase_return_seq'); RETURN 'PR-'||to_char(now(),'YYYYMM')||'-'||lpad(n::TEXT,4,'0'); END $function$


CREATE OR REPLACE FUNCTION public.next_sales_return_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n BIGINT; BEGIN n := nextval('public.sales_return_seq'); RETURN 'SR-'||to_char(now(),'YYYYMM')||'-'||lpad(n::TEXT,4,'0'); END $function$


CREATE OR REPLACE FUNCTION public.next_stock_adjustment_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.stock_adjustment_seq');
  RETURN 'ADJ-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$


CREATE OR REPLACE FUNCTION public.next_stock_opening_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint;
BEGIN
  n := nextval('public.stock_opening_seq');
  RETURN 'OP-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $function$


CREATE OR REPLACE FUNCTION public.next_transfer_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n BIGINT; BEGIN n := nextval('public.stock_transfer_seq'); RETURN 'TR-'||to_char(now(),'YYYYMM')||'-'||lpad(n::TEXT,4,'0'); END $function$


CREATE OR REPLACE FUNCTION public.normalize_auth_user_token_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.confirmation_token IS NULL THEN
    NEW.confirmation_token := '';
  END IF;
  IF NEW.recovery_token IS NULL THEN
    NEW.recovery_token := '';
  END IF;
  IF NEW.email_change_token_new IS NULL THEN
    NEW.email_change_token_new := '';
  END IF;
  IF NEW.email_change_token_current IS NULL THEN
    NEW.email_change_token_current := '';
  END IF;
  IF NEW.email_change IS NULL THEN
    NEW.email_change := '';
  END IF;
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.post_expense(p_entry_id uuid, p_expected_version integer DEFAULT NULL::integer, p_pay_now boolean DEFAULT false, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_account_label text DEFAULT NULL::text, p_payment_date date DEFAULT NULL::date, p_idempotency_key text DEFAULT NULL::text)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.post_expense(
    p_entry_id, p_expected_version, p_pay_now, p_payment_method,
    p_account_label, p_payment_date, p_idempotency_key, NULL
  );
END $function$


CREATE OR REPLACE FUNCTION public.post_expense(p_entry_id uuid, p_expected_version integer DEFAULT NULL::integer, p_pay_now boolean DEFAULT false, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_account_label text DEFAULT NULL::text, p_payment_date date DEFAULT NULL::date, p_idempotency_key text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.expense_actor();
  v_entry public.expense_entries;
  v_from  public.expense_status;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  v_from := v_entry.status;

  IF v_from = 'POSTED' THEN
    RETURN v_entry;
  END IF;

  IF v_from NOT IN ('APPROVED', 'DRAFT') THEN
    RAISE EXCEPTION 'This expense cannot be posted from status %', v_from
      USING ERRCODE = '55000';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.post');

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  IF v_entry.total_amount <= 0 OR v_entry.line_count = 0 THEN
    RAISE EXCEPTION 'Cannot post an expense with no lines' USING ERRCODE = '22023';
  END IF;

  IF v_from = 'DRAFT' AND NOT public.expense_can(v_user, 'expense.approve') THEN
    RAISE EXCEPTION 'Submit this expense for approval before posting it'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.expense_entries
     SET status       = 'POSTED',
         posting_date = COALESCE(posting_date, CURRENT_DATE),
         posted_by    = v_user,
         posted_at    = now(),
         version      = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'posted', v_from, 'POSTED', NULL, v_user);

  IF p_pay_now THEN
    SELECT * INTO v_entry FROM public.record_expense_payment(
      p_entry_id,
      v_entry.total_amount,
      COALESCE(p_payment_date, CURRENT_DATE),
      p_payment_method,
      p_account_label,
      NULL,
      'Settled at posting',
      COALESCE(p_idempotency_key, 'post:' || p_entry_id::text),
      p_account_id
    );
  END IF;

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.post_opening_balance(_document_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_doc     record;
  v_debit   numeric;
  v_credit  numeric;
  v_capital numeric;
  l         record;
BEGIN
  SELECT * INTO v_doc FROM public.opening_balance_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opening document not found';
  END IF;
  IF v_doc.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Document % is already %', v_doc.document_number, v_doc.status;
  END IF;

  SELECT coalesce(sum(amount) FILTER (WHERE side='DEBIT'), 0),
         coalesce(sum(amount) FILTER (WHERE side='CREDIT'), 0),
         coalesce(sum(amount) FILTER (WHERE section='CAPITAL'), 0)
    INTO v_debit, v_credit, v_capital
    FROM public.opening_balance_lines WHERE document_id = _document_id;

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Opening entry does not balance: debits % vs credits % (difference %). Capital required is %. Correct the document before posting.',
      round(v_debit, 2)::text,
      round(v_credit, 2)::text,
      round(v_debit - v_credit, 2)::text,
      round(v_debit - v_credit, 2)::text;
  END IF;

  UPDATE public.opening_balance_documents
     SET total_assets      = v_debit,
         total_liabilities = v_credit - v_capital,
         capital_required  = v_debit - v_credit + v_capital,
         status            = 'POSTED',
         posted_by         = v_user,
         posted_at         = now()
   WHERE id = _document_id;

  FOR l IN SELECT * FROM public.opening_balance_lines WHERE document_id = _document_id ORDER BY id
  LOOP
    IF l.section = 'STOCK' THEN
      -- Real stock, through the real engine. Not a disguised purchase.
      -- movement_type_legacy is set explicitly: the default is 'adjustment',
      -- which the stock engine correctly refuses without an adjustment reason,
      -- and which would file an opening entry under adjustments anyway.
      PERFORM public.post_stock_delta(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => l.quantity, p_unit_cost => coalesce(l.unit_cost, 0),
        p_movement_kind => 'OPENING', p_movement_type_legacy => 'opening',
        p_source_type => 'opening_balance', p_source_id => _document_id,
        p_note => 'رصيد افتتاحي ' || v_doc.document_number,
        p_owner_type => 'COMPANY', p_owner_id => NULL);

      PERFORM public.apply_cost_movement(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => l.quantity, p_incoming_cost => l.unit_cost,
        p_source_type => 'opening_balance', p_source_id => _document_id,
        p_note => 'رصيد افتتاحي ' || v_doc.document_number);

    ELSIF l.section = 'RECEIVABLE' THEN
      IF l.customer_id IS NULL THEN
        RAISE EXCEPTION 'Receivable line "%" has no customer', l.description;
      END IF;
      -- 'adjustment' is the existing ledger value for a movement that is not a
      -- sale, a payment or a return; reference_type carries the real reason.
      INSERT INTO public.customer_ledger
        (customer_id, entry_type, debit, credit, reference_id, reference_type,
         occurred_at, created_by, note)
      VALUES
        (l.customer_id, 'adjustment', l.amount, 0, _document_id,
         'opening_balance', v_doc.effective_date::timestamptz, v_user,
         'رصيد افتتاحي ' || v_doc.document_number);

    ELSIF l.section = 'PAYABLE' THEN
      IF l.supplier_id IS NULL THEN
        RAISE EXCEPTION 'Payable line "%" has no supplier', l.description;
      END IF;
      UPDATE public.suppliers
         SET balance = coalesce(balance, 0) + l.amount
       WHERE id = l.supplier_id;

    ELSE
      -- CASH, BANK, ASSET, LIABILITY: recorded, not posted. This schema has no
      -- chart of accounts and no cash/bank table, so there is no ledger entry
      -- to make. The line is real, queryable and reversible; pretending
      -- otherwise would be a fiction.
      NULL;
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'opening_balance.posted', 'opening_balance', _document_id,
          jsonb_build_object('document_number', v_doc.document_number,
                             'debits', v_debit, 'credits', v_credit));
  RETURN _document_id;
END $function$


CREATE OR REPLACE FUNCTION public.post_opening_stock(_warehouse_id uuid, _effective_date date, _note text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_id         uuid;
  v_number     text;
  v_line       record;
  v_policy     public.inventory_policy;
  v_nature     public.item_nature;
  v_total      numeric := 0;
  v_line_total numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'warehouse')
    OR public.has_role(v_user, 'accountant')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to post opening stock';
  END IF;

  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;

  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Opening stock requires at least one item';
  END IF;

  -- Validate everything BEFORE writing the document header.
  FOR v_line IN
    SELECT (line ->> 'product_id')::uuid                 AS product_id,
           (line ->> 'quantity')::numeric                AS quantity,
           coalesce((line ->> 'unit_cost')::numeric, 0)  AS unit_cost,
           nullif(btrim(coalesce(line ->> 'note', '')), '') AS note
    FROM jsonb_array_elements(_items) AS line
  LOOP
    IF v_line.product_id IS NULL OR v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Every opening line requires an item and a positive quantity';
    END IF;
    IF v_line.unit_cost < 0 THEN
      RAISE EXCEPTION 'Unit cost cannot be negative';
    END IF;

    SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = v_line.product_id;
    IF v_nature IS NULL THEN
      RAISE EXCEPTION 'Item % does not exist', v_line.product_id;
    END IF;

    IF v_nature = 'SERVICE' THEN
      -- Rule 2: a service never holds a balance. Do not let a workaround
      -- re-enter through opening stock.
      RAISE EXCEPTION 'Item % is a SERVICE and cannot hold an inventory balance', v_line.product_id;
    END IF;

    v_policy := public.item_effective_policy(v_line.product_id);
    IF v_policy <> 'TRACKED' THEN
      RAISE EXCEPTION
        'Item % has inventory policy %, so it cannot receive an opening balance (only TRACKED items can)',
        v_line.product_id, v_policy;
    END IF;
  END LOOP;

  v_number := public.next_stock_opening_number();

  INSERT INTO public.stock_openings (document_number, warehouse_id, effective_date, note, created_by)
  VALUES (v_number, _warehouse_id, coalesce(_effective_date, current_date),
          nullif(btrim(coalesce(_note, '')), ''), v_user)
  RETURNING id INTO v_id;

  FOR v_line IN
    SELECT (line ->> 'product_id')::uuid                 AS product_id,
           (line ->> 'quantity')::numeric                AS quantity,
           coalesce((line ->> 'unit_cost')::numeric, 0)  AS unit_cost,
           nullif(btrim(coalesce(line ->> 'note', '')), '') AS note
    FROM jsonb_array_elements(_items) AS line
  LOOP
    v_line_total := round(v_line.quantity * v_line.unit_cost, 2);
    v_total := v_total + v_line_total;

    INSERT INTO public.stock_opening_items (opening_id, product_id, quantity, unit_cost, total_cost, note)
    VALUES (v_id, v_line.product_id, v_line.quantity, v_line.unit_cost, v_line_total, v_line.note);

    PERFORM public.post_stock_delta(
      v_line.product_id,
      _warehouse_id,
      v_line.quantity,                 -- positive: stock increases
      v_line.unit_cost,
      'OPENING'::public.stock_movement_kind,
      'stock_opening',
      v_id,
      coalesce(v_line.note, 'رصيد أول المدة'),
      'COMPANY'::public.owner_type,
      NULL,
      'opening'::public.movement_type
    );
  END LOOP;

  UPDATE public.stock_openings SET total_value = v_total WHERE id = v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'stock_opening.posted', 'stock_opening', v_id,
    jsonb_build_object(
      'document_number', v_number,
      'warehouse_id', _warehouse_id,
      'effective_date', coalesce(_effective_date, current_date),
      'lines', jsonb_array_length(_items),
      'total_value', v_total
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.post_production_order(p_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_ord     record;
  v_existing uuid;
  v_entry_a uuid;
  v_entry_b uuid;
  v_lines_a jsonb := '[]'::jsonb;
  v_lines_b jsonb := '[]'::jsonb;
  v_material numeric := 0;
  v_output  numeric := 0;
  v_loss    numeric;
  r         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may post a production order';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Order % is % - only a completed order has a cost to post',
      v_ord.order_number, v_ord.status;
  END IF;

  SELECT id INTO v_existing
    FROM public.journal_entries
   WHERE source_type = 'production_order' AND source_id = p_order_id
     AND status <> 'REVERSED';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Order % has already been posted to the ledger', v_ord.order_number;
  END IF;

  v_material := coalesce((SELECT sum(total_cost) FROM public.production_order_materials
                           WHERE order_id = p_order_id), 0);
  v_output   := coalesce((SELECT sum(total_cost) FROM public.production_order_outputs
                           WHERE order_id = p_order_id), 0);

  -- The loss is what the order cost beyond what it produced. It is derived
  -- here and named on its own line below, never spread into an output.
  v_loss := round(v_ord.total_cost - v_output, 2);

  IF v_loss < -0.01 THEN
    RAISE EXCEPTION
      'Order % reports more output cost (%.2f) than total cost (%.2f). The costing is inconsistent.',
      v_ord.order_number, v_output, v_ord.total_cost;
  END IF;

  -- ── Entry A: material into work in progress ──
  FOR r IN
    SELECT p.item_class, sum(m.total_cost) AS amount
      FROM public.production_order_materials m
      JOIN public.products p ON p.id = m.product_id
     WHERE m.order_id = p_order_id
     GROUP BY p.item_class
    HAVING sum(m.total_cost) <> 0
  LOOP
    v_lines_a := v_lines_a || jsonb_build_object(
      'account_code', '1312', 'debit', round(r.amount, 2),
      'memo', 'إنتاج تحت التنفيذ — ' || r.item_class);
    v_lines_a := v_lines_a || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'RAW_MATERIAL' THEN '1311'
                        WHEN 'BY_PRODUCT'   THEN '1314'
                        WHEN 'FINISHED_GOOD' THEN '1313'
                        ELSE '1315' END,
      'credit', round(r.amount, 2),
      'memo', 'صرف مواد إنتاج');
  END LOOP;

  -- ── Entry B: outputs out, loss expensed, conversion costs recognised ──
  FOR r IN
    SELECT p.item_class, sum(o.total_cost) AS amount
      FROM public.production_order_outputs o
      JOIN public.products p ON p.id = o.product_id
     WHERE o.order_id = p_order_id
     GROUP BY p.item_class
    HAVING sum(o.total_cost) <> 0
  LOOP
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'BY_PRODUCT' THEN '1314'
                        ELSE '1313' END,
      'debit', round(r.amount, 2),
      'memo', 'ناتج إنتاج — ' || r.item_class);
  END LOOP;

  IF v_loss > 0.01 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5911', 'debit', v_loss,
      'memo', 'فاقد إنتاج ' || v_ord.order_number);
  END IF;

  IF v_material <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '1312', 'credit', round(v_material, 2),
      'memo', 'إقفال إنتاج تحت التنفيذ');
  END IF;

  IF v_ord.direct_labour <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5211', 'credit', round(v_ord.direct_labour, 2),
      'memo', 'أجور عمالة مباشرة');
  END IF;

  IF v_ord.overhead_cost <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5311', 'credit', round(v_ord.overhead_cost, 2),
      'memo', 'مصروفات تشغيل غير مباشرة');
  END IF;

  IF jsonb_array_length(v_lines_b) = 0 THEN
    RAISE EXCEPTION 'Order % has nothing to post - no cost was allocated to any output',
      v_ord.order_number;
  END IF;

  IF jsonb_array_length(v_lines_a) > 0 THEN
    v_entry_a := public.create_journal_entry(
      'أمر إنتاج ' || v_ord.order_number || ' — صرف مواد',
      v_ord.production_date, 'production_order_materials', p_order_id, true, v_lines_a);
  END IF;

  v_entry_b := public.create_journal_entry(
    'أمر إنتاج ' || v_ord.order_number || ' — إقفال وتكلفة',
    v_ord.production_date, 'production_order', p_order_id, true, v_lines_b);

  RETURN v_entry_b;
END $function$


CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_inv     record;
  v_existing uuid;
  v_entry   uuid;
  v_lines   jsonb := '[]'::jsonb;
  v_cash_acct text;
  v_owed     numeric := 0;
  r         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may post a purchase invoice';
  END IF;

  SELECT * INTO v_inv FROM public.purchase_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase invoice not found';
  END IF;

  IF v_inv.status IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'Purchase % is % - only confirmed, paid or partial invoices post',
      v_inv.invoice_number, v_inv.status;
  END IF;

  IF v_inv.paid < 0 THEN
    RAISE EXCEPTION 'Purchase % carries a negative payment (%). A supplier return is a return document, not a negative payment.',
      v_inv.invoice_number, v_inv.paid;
  END IF;
  IF v_inv.paid > v_inv.total THEN
    RAISE EXCEPTION 'Purchase % was paid % against a total of %. Fix the invoice before posting - a payment cannot exceed the invoice.',
      v_inv.invoice_number, v_inv.paid, v_inv.total;
  END IF;

  SELECT id INTO v_existing
    FROM public.journal_entries
   WHERE source_type = 'purchase_invoice' AND source_id = p_invoice_id
     AND status <> 'REVERSED';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase % has already been posted to the ledger', v_inv.invoice_number;
  END IF;

  IF v_inv.payment_method = 'credit' THEN
    v_cash_acct := NULL;
  ELSIF v_inv.payment_method IN ('bank_transfer','card','mobile_money') THEN
    v_cash_acct := '1111';
  ELSE
    v_cash_acct := '1101';
  END IF;

  v_owed := greatest(v_inv.total - v_inv.paid, 0);

  -- ── what was acquired ──
  FOR r IN
    SELECT p.item_class,
           coalesce(it.stock_effect, 'NONE') AS effect,
           sum(it.total)                     AS amount,
           sum(it.tax)                       AS line_tax
      FROM public.purchase_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
     GROUP BY p.item_class, coalesce(it.stock_effect, 'NONE')
    HAVING sum(it.total) <> 0 OR sum(it.tax) <> 0
  LOOP
    IF r.amount <> 0 THEN
      -- Goods that entered stock go to the inventory account for their class;
      -- anything else is an expense, not an increase in stock.
      v_lines := v_lines || jsonb_build_object(
        'account_code', CASE
          WHEN r.effect <> 'STOCK_RECEIPT' THEN '5911'
          ELSE CASE r.item_class
                 WHEN 'RAW_MATERIAL' THEN '1311'
                 WHEN 'BY_PRODUCT'   THEN '1314'
                 WHEN 'FINISHED_GOOD' THEN '1313'
                 ELSE '1315' END END,
        'debit', round(r.amount, 2),
        'memo', CASE WHEN r.effect <> 'STOCK_RECEIPT'
                     THEN 'مصروف مشتريات ' || r.item_class
                     ELSE 'شراء ' || r.item_class END);
    END IF;

    -- Input VAT is recoverable and therefore an asset in its own right.
    IF r.line_tax <> 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code', '1316', 'debit', round(r.line_tax, 2),
        'memo', 'ضريبة مدخلات قابلة للاسترداد');
    END IF;
  END LOOP;

  -- A purchase carrying tax on the header but not on its lines still has it.
  IF v_inv.tax <> 0 AND not exists (
       SELECT 1 FROM public.purchase_invoice_items it
        WHERE it.invoice_id = p_invoice_id AND it.tax <> 0) THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '1316', 'debit', round(v_inv.tax, 2),
      'memo', 'ضريبة مدخلات قابلة للاسترداد');
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Purchase % has nothing to post - its lines are empty or zero',
      v_inv.invoice_number;
  END IF;

  -- ── what was paid and what is owed ──
  IF v_owed > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2111', 'credit', round(v_owed, 2),
      'memo', 'مستحق للمورد',
      'partner_type', 'supplier',
      'partner_id', v_inv.supplier_id);
  END IF;

  IF v_inv.paid > 0 AND v_cash_acct IS NOT NULL THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', v_cash_acct, 'credit', round(v_inv.paid, 2),
      'memo', 'سداد للمورد');
  END IF;

  v_entry := public.create_journal_entry(
    'فاتورة مشتريات ' || v_inv.invoice_number,
    v_inv.created_at::date,
    'purchase_invoice', p_invoice_id, true, v_lines);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_inv     record;
  v_existing uuid;
  v_entry   uuid;
  v_lines   jsonb := '[]'::jsonb;
  v_cash_acct text;
  v_collectable numeric := 0;
  r         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may post an invoice';
  END IF;

  SELECT * INTO v_inv FROM public.sales_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.status IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'Invoice % is % - only confirmed, paid or partial invoices post',
      v_inv.invoice_number, v_inv.status;
  END IF;

  IF v_inv.paid < 0 THEN
    RAISE EXCEPTION 'Invoice % carries a negative payment (%). A refund is a credit note, not a negative payment.',
      v_inv.invoice_number, v_inv.paid;
  END IF;
  IF v_inv.paid > v_inv.total THEN
    RAISE EXCEPTION 'Invoice % was paid % against a total of %. Fix the invoice before posting - a payment cannot exceed the invoice.',
      v_inv.invoice_number, v_inv.paid, v_inv.total;
  END IF;
  IF v_inv.tax < 0 THEN
    RAISE EXCEPTION 'Invoice % carries a negative tax amount', v_inv.invoice_number;
  END IF;

  SELECT id INTO v_existing
    FROM public.journal_entries
   WHERE source_type = 'sales_invoice' AND source_id = p_invoice_id
     AND status <> 'REVERSED';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice % has already been posted to the ledger', v_inv.invoice_number;
  END IF;

  IF v_inv.payment_method = 'credit' THEN
    v_cash_acct := NULL;                       -- nothing collected
  ELSIF v_inv.payment_method IN ('bank_transfer','card','mobile_money') THEN
    v_cash_acct := '1111';                     -- leaves via a bank
  ELSE
    v_cash_acct := '1101';                     -- cash; 'split' resolved against cash
  END IF;

  v_collectable := greatest(v_inv.total - v_inv.paid, 0);

  -- ── revenue, credited ──
  FOR r IN
    SELECT p.item_class, sum(it.total) AS amount
      FROM public.sales_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
     GROUP BY p.item_class
    HAVING sum(it.total) <> 0
  LOOP
    v_lines := v_lines || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'BY_PRODUCT' THEN '4211'
                        WHEN 'SERVICE'    THEN '4311'
                        ELSE '4111' END,
      'credit', round(r.amount, 2),
      'memo', 'إيراد ' || r.item_class);
  END LOOP;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Invoice % has no revenue lines', v_inv.invoice_number;
  END IF;

  -- ── what the mill received: cash and receivable are both DEBITS ──
  -- They are alternatives for the same increase, so a fully-paid sale has a
  -- cash debit and no receivable, and a credit sale the reverse.
  IF v_inv.paid > 0 AND v_cash_acct IS NOT NULL THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', v_cash_acct, 'debit', round(v_inv.paid, 2),
      'memo', 'تحصيل نقدي/بنكي');
  END IF;
  IF v_collectable > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '1211', 'debit', round(v_collectable, 2),
      'memo', 'ذمم العميل ' || coalesce(v_inv.invoice_number, ''));
  END IF;

  IF v_inv.tax > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2311', 'credit', round(v_inv.tax, 2),
      'memo', 'ضريبة القيمة المضافة المستحقة');
  END IF;

  -- ── the cost of the goods that left ──
  FOR r IN
    SELECT p.item_class,
           sum(it.quantity * public.resolve_unit_cost(p.id, v_inv.warehouse_id)) AS cost
      FROM public.sales_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
       AND it.stock_effect = 'STOCK_ISSUE'
     GROUP BY p.item_class
  LOOP
    IF r.cost IS NULL OR r.cost = 0 THEN
      CONTINUE;   -- no cost known; a zero COGS line would overstate profit
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'RAW_MATERIAL' THEN '1311'
                        WHEN 'BY_PRODUCT'   THEN '1314'
                        ELSE '1313' END,
      'credit', round(r.cost, 2),
      'memo', 'تكلفة ' || r.item_class);
    v_lines := v_lines || jsonb_build_object(
      'account_code', '5111', 'debit', round(r.cost, 2),
      'memo', 'تكلفة البضاعة المباعة');
  END LOOP;

  v_entry := public.create_journal_entry(
    'فاتورة مبيعات ' || v_inv.invoice_number,
    v_inv.created_at::date,
    'sales_invoice', p_invoice_id, true, v_lines);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.post_stock_adjustment(_warehouse_id uuid, _reason text, _note text, _effective_date date, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user       uuid := auth.uid();
  v_id         uuid;
  v_number     text;
  v_line       record;
  v_policy     public.inventory_policy;
  v_nature     public.item_nature;
  v_total      numeric := 0;
  v_line_total numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'warehouse')
    OR public.has_role(v_user, 'accountant')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to post stock adjustments';
  END IF;

  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;

  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A documented reason is required for every stock adjustment';
  END IF;

  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'A stock adjustment requires at least one item';
  END IF;

  FOR v_line IN
    SELECT (line ->> 'product_id')::uuid                 AS product_id,
           (line ->> 'quantity')::numeric                AS quantity,
           coalesce((line ->> 'unit_cost')::numeric, 0)  AS unit_cost,
           nullif(btrim(coalesce(line ->> 'note', '')), '') AS note
    FROM jsonb_array_elements(_items) AS line
  LOOP
    IF v_line.product_id IS NULL OR v_line.quantity IS NULL OR v_line.quantity = 0 THEN
      RAISE EXCEPTION 'Every adjustment line requires an item and a non-zero quantity';
    END IF;

    SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = v_line.product_id;
    IF v_nature IS NULL THEN
      RAISE EXCEPTION 'Item % does not exist', v_line.product_id;
    END IF;
    IF v_nature = 'SERVICE' THEN
      RAISE EXCEPTION 'Item % is a SERVICE and has no inventory to adjust', v_line.product_id;
    END IF;

    v_policy := public.item_effective_policy(v_line.product_id);
    IF v_policy <> 'TRACKED' THEN
      RAISE EXCEPTION
        'Item % has inventory policy %, so it has no inventory balance to adjust',
        v_line.product_id, v_policy;
    END IF;
  END LOOP;

  v_number := public.next_stock_adjustment_number();

  INSERT INTO public.stock_adjustments (document_number, warehouse_id, effective_date, reason, note, created_by)
  VALUES (v_number, _warehouse_id, coalesce(_effective_date, current_date), btrim(_reason),
          nullif(btrim(coalesce(_note, '')), ''), v_user)
  RETURNING id INTO v_id;

  FOR v_line IN
    SELECT (line ->> 'product_id')::uuid                 AS product_id,
           (line ->> 'quantity')::numeric                AS quantity,
           coalesce((line ->> 'unit_cost')::numeric, 0)  AS unit_cost,
           nullif(btrim(coalesce(line ->> 'note', '')), '') AS note
    FROM jsonb_array_elements(_items) AS line
  LOOP
    v_line_total := round(abs(v_line.quantity) * v_line.unit_cost, 2);
    v_total := v_total + v_line_total;

    INSERT INTO public.stock_adjustment_items (adjustment_id, product_id, quantity, unit_cost, total_cost, note)
    VALUES (v_id, v_line.product_id, v_line.quantity, v_line.unit_cost, v_line_total, v_line.note);

    -- signed quantity goes straight through: positive adds, negative removes.
    PERFORM public.post_stock_delta(
      v_line.product_id,
      _warehouse_id,
      v_line.quantity,
      v_line.unit_cost,
      'ADJUSTMENT'::public.stock_movement_kind,
      'stock_adjustment',
      v_id,
      coalesce(v_line.note, btrim(_reason)),
      'COMPANY'::public.owner_type,
      NULL,
      'adjustment'::public.movement_type
    );
  END LOOP;

  -- The DB constraint requires a coded reason on every adjustment movement.
  UPDATE public.stock_movements
  SET adjustment_reason = btrim(_reason)
  WHERE source_type = 'stock_adjustment'
    AND source_id = v_id
    AND movement_kind = 'ADJUSTMENT'
    AND adjustment_reason IS NULL;

  UPDATE public.stock_adjustments SET total_value = v_total WHERE id = v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'stock_adjustment.posted', 'stock_adjustment', v_id,
    jsonb_build_object(
      'document_number', v_number,
      'warehouse_id', _warehouse_id,
      'reason', btrim(_reason),
      'effective_date', coalesce(_effective_date, current_date),
      'lines', jsonb_array_length(_items),
      'total_value', v_total
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.post_stock_delta(p_product_id uuid, p_warehouse_id uuid, p_signed_qty numeric, p_unit_cost numeric DEFAULT NULL::numeric, p_movement_kind stock_movement_kind DEFAULT 'ADJUSTMENT'::stock_movement_kind, p_source_type text DEFAULT NULL::text, p_source_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_owner_type owner_type DEFAULT 'COMPANY'::owner_type, p_owner_id uuid DEFAULT NULL::uuid, p_movement_type_legacy movement_type DEFAULT NULL::movement_type)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing    numeric;
  v_new_qty     numeric;
  v_total_cost  numeric;
  v_legacy_type public.movement_type;
  v_owner_type  public.owner_type := COALESCE(p_owner_type, 'COMPANY');
BEGIN
  IF p_signed_qty IS NULL OR p_signed_qty = 0 THEN
    RAISE EXCEPTION 'Stock delta must be a non-zero quantity';
  END IF;

  IF p_product_id IS NULL OR p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Item and location are required for a stock movement';
  END IF;

  -- Lock the exact position being changed.
  SELECT quantity
    INTO v_existing
  FROM public.inventory
  WHERE product_id = p_product_id
    AND warehouse_id = p_warehouse_id
    AND owner_type = v_owner_type
    AND owner_id IS NOT DISTINCT FROM p_owner_id
  FOR UPDATE;

  v_existing := COALESCE(v_existing, 0);
  v_new_qty  := round(v_existing + p_signed_qty, 3);

  -- Stock can never go negative, for company stock or for customer-owned stock.
  IF v_new_qty < 0 THEN
    RAISE EXCEPTION
      'Insufficient stock: item %, location %, available %, requested %',
      p_product_id, p_warehouse_id, v_existing, abs(p_signed_qty)
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.inventory (product_id, warehouse_id, quantity, owner_type, owner_id, updated_at)
  VALUES (p_product_id, p_warehouse_id, v_new_qty, v_owner_type, p_owner_id, now())
  ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
  DO UPDATE SET quantity = v_new_qty, updated_at = now();

  v_total_cost := CASE
    WHEN p_unit_cost IS NULL THEN NULL
    ELSE round(abs(p_signed_qty) * p_unit_cost, 2)
  END;

  -- Legacy enum value, so the old reporting paths keep working unchanged.
  v_legacy_type := COALESCE(
    p_movement_type_legacy,
    CASE p_movement_kind
      WHEN 'RECEIPT'      THEN 'purchase'::public.movement_type
      WHEN 'ISSUE'        THEN 'sale'::public.movement_type
      WHEN 'TRANSFER_IN'  THEN 'transfer_in'::public.movement_type
      WHEN 'TRANSFER_OUT' THEN 'transfer_out'::public.movement_type
      WHEN 'OPENING'      THEN 'opening'::public.movement_type
      ELSE 'adjustment'::public.movement_type
    END
  );

  INSERT INTO public.stock_movements (
    product_id, warehouse_id, movement_type, movement_kind,
    quantity, unit_cost, total_cost,
    reference_type, reference_id, source_type, source_id,
    owner_type, owner_id,
    note, created_by
  )
  VALUES (
    p_product_id, p_warehouse_id, v_legacy_type, p_movement_kind,
    abs(p_signed_qty), p_unit_cost, v_total_cost,
    p_source_type, p_source_id, p_source_type, p_source_id,
    v_owner_type, p_owner_id,
    nullif(btrim(COALESCE(p_note, '')), ''), auth.uid()
  );

  RETURN v_new_qty;
END $function$


CREATE OR REPLACE FUNCTION public.process_milling_delivery(_job_id uuid, _truck_plate text, _driver_name text, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid := auth.uid();
  v_id        uuid;
  v_number    text;
  v_store     uuid;
  v_customer  uuid;
  v_item      record;
  v_output_id uuid;
  v_produced  integer;
  v_delivered integer;
  v_bags      integer;
  v_weight    numeric;
  v_total_bags integer := 0;
  v_total_kg  numeric := 0;
  v_bag_size  numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to issue delivery notes';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one output to deliver';
  END IF;

  SELECT store_id, customer_id
    INTO v_store, v_customer
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;

  -- Nothing may leave before the run is closed: the produced quantity must be
  -- final, otherwise a later correction could retroactively invalidate a truck
  -- that already left the gate.
  IF (SELECT status FROM public.milling_jobs WHERE id = _job_id) <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Close the milling job before delivering its outputs';
  END IF;

  -- Validate every line BEFORE writing the header, so a bad line cannot leave an
  -- empty note behind.
  FOR v_item IN
    SELECT (item ->> 'job_output_id')::uuid      AS output_id,
           coalesce((item ->> 'delivered_bags')::integer, 0) AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    IF v_item.output_id IS NULL THEN
      RAISE EXCEPTION 'Every delivery line requires an output';
    END IF;
    IF v_item.bags <= 0 THEN
      RAISE EXCEPTION 'Every delivery line requires at least one bag';
    END IF;
    IF v_item.weight <= 0 THEN
      RAISE EXCEPTION 'Every delivery line requires a positive weight';
    END IF;

    -- Lock the output row: this is what serialises concurrent deliveries.
    SELECT produced_bag_count, delivered_bag_count, bag_size_kg
      INTO v_produced, v_delivered, v_bag_size
    FROM public.milling_job_outputs
    WHERE id = v_item.output_id
      AND job_id = _job_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Output % does not belong to job %', v_item.output_id, _job_id;
    END IF;

    -- >>> THE INVARIANT <<<
    IF v_delivered + v_item.bags > v_produced THEN
      RAISE EXCEPTION
        'Cannot deliver % bags of this output: only % produced and % already delivered (% remaining)',
        v_item.bags, v_produced, v_delivered, v_produced - v_delivered
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_delivered + v_item.weight > (SELECT produced_weight_kg FROM public.milling_job_outputs WHERE id = v_item.output_id) + 0.001 THEN
      RAISE EXCEPTION
        'Cannot deliver % kg of this output: it exceeds what remains to be delivered',
        v_item.weight
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- ── document header ──────────────────────────────────────────────────────
  FOR v_item IN
    SELECT coalesce((item ->> 'delivered_bags')::integer, 0)      AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    v_total_bags := v_total_bags + v_item.bags;
    v_total_kg   := v_total_kg + v_item.weight;
  END LOOP;

  v_number := public.next_milling_delivery_number();

  INSERT INTO public.milling_delivery_notes (
    store_id, delivery_number, customer_id, job_id,
    truck_plate_number, driver_name,
    total_bags, total_weight_kg, notes, delivered_by
  )
  VALUES (
    v_store, v_number, v_customer, _job_id,
    nullif(btrim(COALESCE(_truck_plate, '')), ''),
    nullif(btrim(COALESCE(_driver_name, '')), ''),
    v_total_bags, round(v_total_kg, 3),
    nullif(btrim(COALESCE(_notes, '')), ''), v_user
  )
  RETURNING id INTO v_id;

  -- ── lines + custody decrement, under the locks taken above ───────────────
  FOR v_item IN
    SELECT (item ->> 'job_output_id')::uuid      AS output_id,
           coalesce((item ->> 'delivered_bags')::integer, 0)      AS bags,
           coalesce((item ->> 'delivered_weight_kg')::numeric, 0) AS weight
    FROM jsonb_array_elements(_items) AS item
  LOOP
    v_output_id := v_item.output_id;

    INSERT INTO public.milling_delivery_items (
      delivery_id, job_output_id, delivered_bags, delivered_weight_kg
    )
    VALUES (v_id, v_output_id, v_item.bags, v_item.weight);

    UPDATE public.milling_job_outputs
    SET delivered_bag_count = delivered_bag_count + v_item.bags,
        delivered_weight_kg = delivered_weight_kg + v_item.weight
    WHERE id = v_output_id;
  END LOOP;

  -- Mark the job DELIVERED only when nothing at all remains in custody.
  IF NOT EXISTS (
    SELECT 1
    FROM public.milling_job_outputs o
    WHERE o.job_id = _job_id
      AND (o.produced_bag_count - o.delivered_bag_count) > 0
  ) THEN
    UPDATE public.milling_jobs
    SET status = 'DELIVERED'
    WHERE id = _job_id AND status = 'COMPLETED';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.delivery.issued', 'milling_delivery', v_id,
    jsonb_build_object(
      'delivery_number', v_number,
      'job_id', _job_id,
      'customer_id', v_customer,
      'total_bags', v_total_bags,
      'total_weight_kg', round(v_total_kg, 3),
      'stock_impact', 'NONE — customer custody'
    ));

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.product_delete_guard(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_counts jsonb;
  v_blocking bigint;
BEGIN
  -- Permission check: only owner/manager may hard-delete a product.
  IF NOT (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'manager')
    OR public.is_platform_admin(auth.uid())
  ) THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'forbidden');
  END IF;

  v_counts   := public.product_reference_counts(p_product_id);
  v_blocking := COALESCE((v_counts ->> 'blocking_total')::bigint, 0);

  IF v_blocking > 0 THEN
    -- Referenced by history -> never delete. The UI offers deactivation instead.
    RETURN jsonb_build_object(
      'deleted', false,
      'reason',  'referenced',
      'counts',  v_counts
    );
  END IF;

  -- Not referenced by any document or movement: safe to remove.
  -- Clean the pure-catalog satellites that carry no financial meaning.
  BEGIN
    DELETE FROM public.product_compatibilities WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  DELETE FROM public.inventory WHERE product_id = p_product_id;

  DELETE FROM public.products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('deleted', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'reason',  'deleted',
    'counts',  v_counts
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.product_reference_counts(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sales_items      bigint := 0;
  v_purchase_items   bigint := 0;
  v_sales_returns    bigint := 0;
  v_purchase_returns bigint := 0;
  v_transfers        bigint := 0;
  v_stock_movements  bigint := 0;
  v_inventory_rows   bigint := 0;
  v_compatibilities  bigint := 0;
  v_blocking         bigint := 0;
BEGIN
  -- Historical / financial documents: these MUST block deletion.
  SELECT count(*) INTO v_sales_items
    FROM public.sales_invoice_items WHERE product_id = p_product_id;

  SELECT count(*) INTO v_purchase_items
    FROM public.purchase_invoice_items WHERE product_id = p_product_id;

  -- Returns and transfers are guarded dynamically: some deployments have these
  -- tables, older ones do not. Missing tables count as zero.
  BEGIN
    SELECT count(*) INTO v_sales_returns
      FROM public.sales_return_items WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_sales_returns := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_purchase_returns
      FROM public.purchase_return_items WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_purchase_returns := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_transfers
      FROM public.stock_transfer_items WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_transfers := 0;
  END;

  -- Audit trail: destroying this loses the product's stock history.
  SELECT count(*) INTO v_stock_movements
    FROM public.stock_movements WHERE product_id = p_product_id;

  SELECT count(*) INTO v_inventory_rows
    FROM public.inventory WHERE product_id = p_product_id;

  BEGIN
    SELECT count(*) INTO v_compatibilities
      FROM public.product_compatibilities WHERE product_id = p_product_id;
  EXCEPTION WHEN undefined_table THEN v_compatibilities := 0;
  END;

  v_blocking := v_sales_items + v_purchase_items + v_sales_returns
              + v_purchase_returns + v_transfers + v_stock_movements;

  RETURN jsonb_build_object(
    'product_id',          p_product_id,
    'sales_items',         v_sales_items,
    'purchase_items',      v_purchase_items,
    'sales_returns',       v_sales_returns,
    'purchase_returns',    v_purchase_returns,
    'transfers',           v_transfers,
    'stock_movements',     v_stock_movements,
    'inventory_rows',      v_inventory_rows,
    'compatibilities',     v_compatibilities,
    'blocking_total',      v_blocking,
    'can_delete',          v_blocking = 0,
    'has_history',         v_stock_movements > 0 OR v_inventory_rows > 0
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.production_last_movement(p_product_id uuid, p_warehouse_id uuid, p_source_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT m.id FROM public.stock_movements m
   WHERE m.product_id = p_product_id AND m.warehouse_id = p_warehouse_id
     AND m.source_id = p_source_id
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
$function$


CREATE OR REPLACE FUNCTION public.receive_customer_owned_stock(_customer_id uuid, _product_id uuid, _warehouse_id uuid, _quantity numeric, _unit_cost numeric, _note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        uuid := auth.uid();
  v_nature      public.item_nature;
  v_movement_id uuid;
  v_new_qty     numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'warehouse')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to receive customer-owned material';
  END IF;

  IF _customer_id IS NULL OR _product_id IS NULL OR _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Customer, item and location are all required';
  END IF;

  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  -- A service can never be physically received.
  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = _product_id;
  IF v_nature IS NULL THEN
    RAISE EXCEPTION 'Item % does not exist', _product_id;
  END IF;
  IF v_nature = 'SERVICE' THEN
    RAISE EXCEPTION 'Item % is a SERVICE and cannot be held as physical material', _product_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id = _customer_id) THEN
    RAISE EXCEPTION 'Customer % does not exist', _customer_id;
  END IF;

  v_new_qty := public.post_stock_delta(
    _product_id,
    _warehouse_id,
    _quantity,
    coalesce(_unit_cost, 0),
    'RECEIPT'::public.stock_movement_kind,
    'customer_owned_receipt',
    NULL,
    coalesce(nullif(btrim(coalesce(_note, '')), ''), 'استلام مادة مملوكة للعميل'),
    'CUSTOMER'::public.owner_type,
    _customer_id,
    'purchase'::public.movement_type
  );

  SELECT id INTO v_movement_id
  FROM public.stock_movements
  WHERE product_id = _product_id
    AND warehouse_id = _warehouse_id
    AND owner_type = 'CUSTOMER'
    AND owner_id = _customer_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'customer_owned.received', 'customers', _customer_id,
    jsonb_build_object(
      'product_id', _product_id,
      'warehouse_id', _warehouse_id,
      'quantity', _quantity,
      'unit_cost', coalesce(_unit_cost, 0),
      'resulting_quantity', v_new_qty,
      'movement_id', v_movement_id
    ));

  RETURN v_movement_id;
END $function$


CREATE OR REPLACE FUNCTION public.record_customer_payment(_customer_id uuid, _invoice_id uuid, _amount numeric, _method text, _payment_date date, _note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_invoice record;
  v_customer_balance numeric;
  v_remaining numeric := coalesce(_amount, 0);
  v_allocation numeric;
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

  IF _method NOT IN ('cash', 'card', 'bank_transfer', 'mobile_money') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

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
    )
    VALUES (
      _customer_id, _invoice_id, v_remaining, _method::public.payment_method,
      coalesce(_payment_date, current_date), nullif(trim(_note), ''), v_user
    )
    RETURNING id INTO v_id;

    UPDATE public.sales_invoices
    SET paid = paid + v_remaining,
        status = CASE
          WHEN paid + v_remaining >= total THEN 'paid'::public.invoice_status
          WHEN paid + v_remaining = 0 THEN 'unpaid'::public.invoice_status
          ELSE 'partial'::public.invoice_status
        END,
        updated_at = now()
    WHERE id = _invoice_id;
  ELSE
    -- A general customer payment is applied to the oldest outstanding invoices.
    -- This keeps customer balance, invoice status, and payment history aligned.
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
      )
      VALUES (
        _customer_id, v_invoice.id, v_allocation, _method::public.payment_method,
        coalesce(_payment_date, current_date), nullif(trim(_note), ''), v_user
      )
      RETURNING id INTO v_id;

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

    IF v_remaining > 0 THEN
      INSERT INTO public.customer_payments (customer_id, invoice_id, amount, payment_method, payment_date, note, created_by)
      VALUES (_customer_id, NULL, v_remaining, _method::public.payment_method, coalesce(_payment_date, current_date), coalesce(nullif(trim(_note), ''), 'دفعة مقدمة'), v_user)
      RETURNING id INTO v_id;
    END IF;
  END IF;

  UPDATE public.customers
  SET balance = round(coalesce(balance, 0) - _amount, 2), updated_at = now()
  WHERE id = _customer_id;
  INSERT INTO public.customer_ledger(customer_id, entry_type, credit, reference_id, reference_type, occurred_at, created_by, source_key, note)
  VALUES (_customer_id, 'payment', round(_amount, 2), v_id, 'customer_payment', coalesce(_payment_date, current_date)::timestamptz, v_user, 'payment:' || v_id, coalesce(nullif(trim(_note), ''), 'دفعة عميل'));

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    v_user,
    'customer_payment.recorded',
    'customer',
    _customer_id,
    jsonb_build_object(
      'invoice_id', _invoice_id,
      'amount', _amount,
      'method', _method,
      'payment_date', coalesce(_payment_date, current_date)
    )
  );

  RETURN v_id;
END;
$function$


CREATE OR REPLACE FUNCTION public.record_expense_payment(p_entry_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_account_label text DEFAULT NULL::text, p_reference_no text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.record_expense_payment(
    p_entry_id, p_amount, p_payment_date, p_payment_method,
    p_account_label, p_reference_no, p_note, p_idempotency_key, NULL
  );
END $function$


CREATE OR REPLACE FUNCTION public.record_expense_payment(p_entry_id uuid, p_amount numeric, p_payment_date date DEFAULT CURRENT_DATE, p_payment_method payment_method DEFAULT 'cash'::payment_method, p_account_label text DEFAULT NULL::text, p_reference_no text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid := public.expense_actor();
  v_entry     public.expense_entries;
  v_amount    numeric(18,2);
  v_existing  public.expense_payments;
  v_label     text := nullif(btrim(coalesce(p_account_label, '')), '');
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.pay');

  IF v_entry.status NOT IN ('POSTED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Payments can only be recorded against posted expenses (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;

  v_amount := public.expense_round(p_amount);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF v_amount > v_entry.remaining_amount + 0.005 THEN
    RAISE EXCEPTION 'Payment (%) exceeds remaining amount (%)', v_amount, v_entry.remaining_amount
      USING ERRCODE = '22023';
  END IF;

  -- If financial account provided, fetch label default if label is empty
  IF p_account_id IS NOT NULL AND v_label IS NULL AND to_regclass('public.accounts') IS NOT NULL THEN
    SELECT name_ar INTO v_label FROM public.accounts WHERE id = p_account_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.expense_payments
     WHERE idempotency_key = btrim(p_idempotency_key);
    IF FOUND THEN
      RETURN v_entry;
    END IF;
  END IF;

  INSERT INTO public.expense_payments (
    entry_id, amount, payment_date, payment_method,
    account_label, reference_no, note, idempotency_key, created_by,
    account_id
  )
  VALUES (
    p_entry_id, v_amount, COALESCE(p_payment_date, CURRENT_DATE),
    COALESCE(p_payment_method, 'cash'),
    v_label,
    nullif(btrim(coalesce(p_reference_no, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    nullif(btrim(coalesce(p_idempotency_key, '')), ''),
    v_user,
    p_account_id
  );

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id;

  PERFORM public.expense_log_action(
    p_entry_id, 'payment', v_entry.status, v_entry.status,
    'Payment of ' || v_amount::text || ' ' || v_entry.currency_symbol || ' recorded',
    v_user
  );

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.record_production_loss(_order_id uuid, _reason text, _qty numeric, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ord record;
  v_id  uuid;
  v_in  numeric;
  v_val numeric;
BEGIN
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to record production loss';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status IN ('COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'Order % is % and cannot be adjusted', v_ord.order_number, v_ord.status;
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A loss must have a reason';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Loss quantity must be greater than zero';
  END IF;

  -- Losing material is spending it, so it carries the input's own average cost.
  SELECT coalesce(sum(total_cost) / nullif(sum(actual_qty), 0), 0) INTO v_in
    FROM public.production_order_materials WHERE order_id = _order_id;
  v_val := round(_qty * coalesce(v_in, 0), 2);

  INSERT INTO public.production_order_losses (order_id, reason, qty, value, notes, created_by)
  VALUES (_order_id, btrim(_reason), _qty, v_val, nullif(btrim(coalesce(_notes,'')), ''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (auth.uid(), 'production.loss_recorded', 'production_order', _order_id,
          jsonb_build_object('loss_id', v_id, 'reason', _reason, 'qty', _qty, 'value', v_val));
  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.release_customer_owned_stock(_customer_id uuid, _product_id uuid, _warehouse_id uuid, _quantity numeric, _note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user        uuid := auth.uid();
  v_movement_id uuid;
  v_new_qty     numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'warehouse')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to release customer-owned material';
  END IF;

  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  v_new_qty := public.post_stock_delta(
    _product_id,
    _warehouse_id,
    -_quantity,                     -- leaving the premises
    0,
    'ISSUE'::public.stock_movement_kind,
    'customer_owned_delivery',
    NULL,
    coalesce(nullif(btrim(coalesce(_note, '')), ''), 'تسليم مادة مملوكة للعميل'),
    'CUSTOMER'::public.owner_type,
    _customer_id,
    'sale'::public.movement_type
  );

  SELECT id INTO v_movement_id
  FROM public.stock_movements
  WHERE product_id = _product_id
    AND warehouse_id = _warehouse_id
    AND owner_type = 'CUSTOMER'
    AND owner_id = _customer_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'customer_owned.released', 'customers', _customer_id,
    jsonb_build_object(
      'product_id', _product_id,
      'warehouse_id', _warehouse_id,
      'quantity', _quantity,
      'resulting_quantity', v_new_qty,
      'movement_id', v_movement_id
    ));

  RETURN v_movement_id;
END $function$


CREATE OR REPLACE FUNCTION public.repair_milling_dual_fee_jobs(_apply boolean DEFAULT false)
 RETURNS TABLE(job_number text, fee_per_bag numeric, fee_per_ton numeric, invoice_total numeric, action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$


CREATE OR REPLACE FUNCTION public.resolve_purchase_line(p_line jsonb, OUT o_product_id uuid, OUT o_quantity numeric, OUT o_line_type text, OUT o_stock_effect text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service_flag boolean := coalesce((p_line ->> 'is_service')::boolean, false);
  v_nature public.item_nature;
BEGIN
  o_product_id := nullif(btrim(coalesce(p_line ->> 'product_id', '')), '')::uuid;
  o_quantity   := (p_line ->> 'quantity')::numeric;

  IF o_product_id IS NULL THEN
    o_line_type    := 'AD_HOC_SERVICE';
    o_stock_effect := 'NONE';
    RETURN;
  END IF;

  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = o_product_id;

  IF v_nature IS NULL THEN
    IF v_is_service_flag THEN
      o_product_id   := NULL;
      o_line_type    := 'AD_HOC_SERVICE';
      o_stock_effect := 'NONE';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Item % does not exist', o_product_id;
  END IF;

  o_line_type    := public.item_line_type(o_product_id, false);
  o_stock_effect := public.item_stock_effect(o_product_id, 'in');
END $function$


CREATE OR REPLACE FUNCTION public.resolve_sale_line(p_line jsonb, OUT o_product_id uuid, OUT o_quantity numeric, OUT o_line_type text, OUT o_stock_effect text, OUT o_service_name text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_service_flag boolean := coalesce((p_line ->> 'is_service')::boolean, false);
  v_exists boolean;
BEGIN
  o_product_id   := nullif(btrim(coalesce(p_line ->> 'product_id', '')), '')::uuid;
  o_quantity     := (p_line ->> 'quantity')::numeric;
  o_service_name := nullif(btrim(coalesce(p_line ->> 'name', '')), '');

  IF o_product_id IS NULL THEN
    -- No product reference at all: this is an ad-hoc service line.
    o_line_type    := 'AD_HOC_SERVICE';
    o_stock_effect := 'NONE';
    RETURN;
  END IF;

  SELECT true INTO v_exists FROM public.products p WHERE p.id = o_product_id;

  IF v_exists IS NOT TRUE THEN
    IF v_is_service_flag THEN
      -- Legacy POS sent synthetic ids such as "service-<uuid>".
      o_product_id   := NULL;
      o_line_type    := 'AD_HOC_SERVICE';
      o_stock_effect := 'NONE';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Item % does not exist', o_product_id;
  END IF;

  o_line_type    := public.item_line_type(o_product_id, false);
  o_stock_effect := public.item_stock_effect(o_product_id, 'out');
END $function$


CREATE OR REPLACE FUNCTION public.resolve_unit_cost(p_product_id uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_as_of timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method public.costing_method := public.company_costing_method();
  v_layer  record;
  v_cat    numeric;
  v_standard numeric;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Standard cost is a property of the item, not of the warehouse: the same
  -- standard applies everywhere, and that is what makes it a standard.
  IF v_method = 'STANDARD' THEN
    SELECT p.standard_cost
      INTO v_standard
      FROM public.products p
     WHERE p.id = p_product_id;

    IF v_standard IS NOT NULL THEN
      RETURN v_standard;
    END IF;
    -- No standard set yet: fall through to the layer, then to the catalogue.
    -- A zero would be worse than a reference, because zero margin hides a
    -- missing configuration instead of reporting it.
  END IF;

  -- Company-owned layer, optionally at a specific warehouse. Aggregated
  -- across warehouses when none is named, because a valuation belongs to the
  -- company unless the caller is asking about one silo.
  SELECT sum(cl.quantity)                                   AS qty,
         sum(cl.total_value)                                AS val,
         CASE WHEN sum(cl.quantity) <> 0
              THEN round(sum(cl.total_value) / sum(cl.quantity), 4)
              ELSE 0 END                                    AS avg_cost,
         bool_or(cl.valuation_method = 'STANDARD')          AS any_standard
    INTO v_layer
    FROM public.item_cost_layers cl
   WHERE cl.product_id = p_product_id
     AND cl.owner_type = 'COMPANY'::public.owner_type
     AND (p_warehouse_id IS NULL OR cl.warehouse_id = p_warehouse_id)
     AND (p_as_of IS NULL OR cl.updated_at <= p_as_of);

  IF v_layer.qty IS NOT NULL AND v_layer.qty <> 0 AND NOT v_layer.any_standard THEN
    RETURN v_layer.avg_cost;
  END IF;

  -- Last resort: the catalogue reference, clearly a reference and not an
  -- actual. Callers that report a margin must say so when this is what they
  -- used, which resolve_unit_cost signals by returning a cost with no
  -- supporting movement.
  SELECT p.cost_price INTO v_cat FROM public.products p WHERE p.id = p_product_id;
  RETURN coalesce(v_cat, 0);
END $function$


CREATE OR REPLACE FUNCTION public.reverse_expense(p_entry_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := public.expense_actor();
  v_entry    public.expense_entries;
  v_reversal public.expense_entries;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.reverse');

  IF v_entry.status = 'REVERSED' THEN
    RETURN v_entry;   -- idempotent: reversing twice is a no-op, not an error
  END IF;
  IF v_entry.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'Only a posted expense can be reversed (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;
  -- Money already sitting in the drawer has to be dealt with through the
  -- payment record, not by erasing the document that produced it.
  IF v_entry.paid_amount > 0 THEN
    RAISE EXCEPTION 'Reverse the recorded payments first (paid: %)', v_entry.paid_amount
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.expense_entries (
    reference, entry_type, status, source_kind,
    payee_type, payee_name, supplier_id, employee_id,
    warehouse_id, cost_center_id, project_id,
    expense_date, posting_date, description, note,
    tax_mode, currency, currency_symbol,
    reversal_of, created_by, posted_by, posted_at
  )
  VALUES (
    v_entry.reference || '-R',
    v_entry.entry_type,
    -- The reversal is itself posted: it is a recognised, immutable correction.
    'POSTED',
    v_entry.source_kind,
    v_entry.payee_type, v_entry.payee_name, v_entry.supplier_id, v_entry.employee_id,
    v_entry.warehouse_id, v_entry.cost_center_id, v_entry.project_id,
    CURRENT_DATE, CURRENT_DATE,
    'Reversal of ' || v_entry.reference,
    nullif(btrim(coalesce(p_reason, '')), ''),
    v_entry.tax_mode, v_entry.currency, v_entry.currency_symbol,
    v_entry.id, v_user, v_user, now()
  )
  RETURNING * INTO v_reversal;

  -- Mirror the lines so the reversal is a real, reportable document rather than
  -- an amount with no category — otherwise the reversal would vanish from the
  -- by-category report and leave that report showing an expense that no longer
  -- exists.
  INSERT INTO public.expense_lines (
    entry_id, line_no, description, category_id, quantity, unit_price,
    net_amount, tax_rate, tax_amount, gross_amount,
    cost_center_id, project_id, note
  )
  SELECT
    v_reversal.id, line_no, description, category_id, quantity, unit_price,
    net_amount, tax_rate, tax_amount, gross_amount,
    cost_center_id, project_id, note
  FROM public.expense_lines
  WHERE entry_id = p_entry_id
  ORDER BY line_no;

  UPDATE public.expense_entries
     SET total_amount = v_entry.total_amount,
         line_count   = v_entry.line_count
   WHERE id = v_reversal.id
  RETURNING * INTO v_reversal;

  UPDATE public.expense_entries
     SET status         = 'REVERSED',
         reversed_by_id = v_reversal.id,
         version        = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(
    p_entry_id, 'reversed', 'POSTED', 'REVERSED',
    COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Reversed'), v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.reverse_expense_payment(p_payment_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := public.expense_actor();
  v_payment public.expense_payments;
  v_entry   public.expense_entries;
  v_reversal_id uuid;
BEGIN
  SELECT * INTO v_payment FROM public.expense_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.payment.reverse');

  IF v_payment.reversed_by IS NOT NULL THEN
    SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_payment.entry_id;
    RETURN v_entry;   -- idempotent
  END IF;
  IF v_payment.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'A reversal row cannot itself be reversed' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_payment.entry_id FOR UPDATE;

  INSERT INTO public.expense_payments (
    entry_id, amount, payment_date, payment_method,
    account_label, reference_no, note, reversal_of, created_by
  )
  VALUES (
    v_payment.entry_id, v_payment.amount, CURRENT_DATE, v_payment.payment_method,
    v_payment.account_label, v_payment.reference_no,
    COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Reversal of payment'),
    v_payment.id, v_user
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.expense_payments
     SET reversed_by = v_reversal_id
   WHERE id = p_payment_id;

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_payment.entry_id;

  PERFORM public.expense_log_action(
    v_payment.entry_id, 'payment', v_entry.status, v_entry.status,
    'Payment reversed', v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_entry_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_old  record;
  v_id   uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reversing an entry requires a reason';
  END IF;

  SELECT * INTO v_old FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_old.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only a posted entry can be reversed';
  END IF;

  SELECT public.create_journal_entry(
    'عكس القيد ' || v_old.entry_number || ': ' || btrim(p_reason),
    CURRENT_DATE, 'journal_reversal', p_entry_id, v_old.is_system,
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'account_code', a.code,
        -- A reversal swaps the sides rather than negating: the credit of the
        -- original becomes the debit of the reversal.
        'debit',  CASE WHEN jl.debit  > 0 THEN 0 ELSE jl.credit END,
        'credit', CASE WHEN jl.debit  > 0 THEN jl.debit  ELSE 0 END,
        'memo',   coalesce(jl.memo, a.name_ar)
      ) ORDER BY jl.id), '[]'::jsonb)
       FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
      WHERE jl.entry_id = p_entry_id)
  ) INTO v_id;

  UPDATE public.journal_entries SET status = 'REVERSED' WHERE id = p_entry_id;
  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.reverse_opening_balance(_document_id uuid, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_doc  record;
  v_new  uuid;
  v_num  text;
  l      record;
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reversing an opening entry requires a reason';
  END IF;

  SELECT * INTO v_doc FROM public.opening_balance_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only a posted opening document can be reversed';
  END IF;

  v_num := 'OBR-' || v_doc.document_number;
  INSERT INTO public.opening_balance_documents
    (document_number, effective_date, status, fiscal_year, reverses_document_id,
     notes, created_by, posted_at, posted_by)
  VALUES (v_num, v_doc.effective_date, 'POSTED', v_doc.fiscal_year, _document_id,
          'عكس القيد الافتتاحي ' || v_doc.document_number || ': ' || btrim(_reason),
          v_user, now(), v_user)
  RETURNING id INTO v_new;

  -- Mirrored at the same amount, so the reversal balances by construction
  -- rather than by arithmetic the caller has to get right.
  INSERT INTO public.opening_balance_lines
    (document_id, section, side, ref_type, ref_id, product_id, warehouse_id,
     customer_id, supplier_id, description, quantity, unit_cost, amount)
  SELECT v_new, section,
         CASE WHEN side='DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
         ref_type, ref_id, product_id, warehouse_id, customer_id, supplier_id,
         'عكس: ' || description, quantity, unit_cost, amount
    FROM public.opening_balance_lines WHERE document_id = _document_id;

  FOR l IN SELECT * FROM public.opening_balance_lines WHERE document_id = _document_id
  LOOP
    IF l.section = 'STOCK' THEN
      PERFORM public.post_stock_delta(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => -l.quantity, p_unit_cost => coalesce(l.unit_cost, 0),
        p_movement_kind => 'ADJUSTMENT', p_movement_type_legacy => 'opening',
        p_source_type => 'opening_balance_reversal', p_source_id => v_new,
        p_note => 'عكس رصيد افتتاحي ' || v_doc.document_number,
        p_owner_type => 'COMPANY', p_owner_id => NULL);
      PERFORM public.apply_cost_movement(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => -l.quantity, p_incoming_cost => NULL,
        p_source_type => 'opening_balance_reversal', p_source_id => v_new,
        p_note => 'عكس رصيد افتتاحي ' || v_doc.document_number);
    ELSIF l.section = 'RECEIVABLE' THEN
      INSERT INTO public.customer_ledger
        (customer_id, entry_type, debit, credit, reference_id, reference_type,
         occurred_at, created_by, note)
      VALUES (l.customer_id, 'adjustment', 0, l.amount, v_new,
              'opening_balance_reversal', now(), v_user,
              'عكس رصيد افتتاحي ' || v_doc.document_number);
    ELSIF l.section = 'PAYABLE' THEN
      UPDATE public.suppliers SET balance = coalesce(balance,0) - l.amount
       WHERE id = l.supplier_id;
    END IF;
  END LOOP;

  UPDATE public.opening_balance_documents
     SET status = 'REVERSED'
   WHERE id = _document_id;

  RETURN v_new;
END $function$


CREATE OR REPLACE FUNCTION public.sales_invoice_tender_breakdown(_invoice_id uuid)
 RETURNS TABLE(method text, amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.method::text, s.amount
  FROM public.customer_payment_splits AS s
  WHERE s.invoice_id = _invoice_id
  ORDER BY s.amount DESC;
$function$


CREATE OR REPLACE FUNCTION public.sales_line_cost(p_item_id uuid, p_invoice_id uuid, p_quantity numeric, p_line_type text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_movement_cost numeric;
  v_costing       public.costing_method;
  v_reference     numeric;
BEGIN
  -- A service line carries no inventory cost. That is not a missing value.
  IF p_item_id IS NULL OR p_line_type IN ('SERVICE', 'AD_HOC_SERVICE') THEN
    RETURN 0;
  END IF;

  -- (a) The real cost of what actually left the warehouse for this invoice.
  SELECT m.unit_cost
    INTO v_movement_cost
  FROM public.stock_movements m
  WHERE m.product_id = p_item_id
    AND m.reference_id = p_invoice_id
    AND m.reference_type = 'sales_invoice'
    AND m.movement_kind = 'ISSUE'
    AND m.unit_cost IS NOT NULL
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF v_movement_cost IS NOT NULL THEN
    RETURN round(coalesce(p_quantity, 0) * v_movement_cost, 2);
  END IF;

  -- (b) No movement cost. Only a declared STANDARD cost is a legitimate
  -- fallback, because the business chose that policy explicitly.
  SELECT COALESCE(ci.costing_method, p.costing_method),
         COALESCE(ci.default_cost, p.cost_price)
    INTO v_costing, v_reference
  FROM public.products p
  LEFT JOIN public.company_items ci
    ON ci.item_id = p.id AND ci.company_id = 1 AND ci.is_active
  WHERE p.id = p_item_id;

  IF v_costing = 'STANDARD' AND v_reference IS NOT NULL THEN
    RETURN round(coalesce(p_quantity, 0) * v_reference, 2);
  END IF;

  -- (c) Unknown. Deliberately NULL, never a guess.
  RETURN NULL;
END $function$


CREATE OR REPLACE FUNCTION public.save_expense_category(p_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_name_ar text DEFAULT NULL::text, p_sort_order integer DEFAULT NULL::integer, p_notes text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean)
 RETURNS expense_categories
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user     uuid := public.expense_actor();
  v_category public.expense_categories;
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.category.manage');

  IF p_id IS NULL THEN
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'A category needs a name' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.expense_categories (name, name_ar, sort_order, notes, created_by, is_active)
    VALUES (
      v_name,
      nullif(btrim(coalesce(p_name_ar, '')), ''),
      COALESCE(p_sort_order, 100),
      nullif(btrim(coalesce(p_notes, '')), ''),
      v_user,
      COALESCE(p_is_active, true)
    )
    RETURNING * INTO v_category;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.created', 'expense_category', v_category.id,
            jsonb_build_object('name', v_category.name));
  ELSE
    -- The UNIQUE(name) constraint from the original migration would raise a raw
    -- 23505 the operator cannot read; checked explicitly so the message is
    -- usable and names the clash.
    IF v_name IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.expense_categories c
      WHERE upper(btrim(c.name)) = upper(v_name) AND c.id <> p_id
    ) THEN
      RAISE EXCEPTION 'A category named "%" already exists', v_name USING ERRCODE = '23505';
    END IF;

    UPDATE public.expense_categories
       SET name       = COALESCE(v_name, name),
           name_ar    = CASE WHEN p_name_ar IS NULL THEN name_ar
                             ELSE nullif(btrim(p_name_ar), '') END,
           sort_order = COALESCE(p_sort_order, sort_order),
           notes      = CASE WHEN p_notes IS NULL THEN notes
                             ELSE nullif(btrim(p_notes), '') END,
           is_active  = COALESCE(p_is_active, is_active)
     WHERE id = p_id
    RETURNING * INTO v_category;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'expense.category.updated', 'expense_category', v_category.id,
            jsonb_build_object('name', v_category.name, 'is_active', v_category.is_active));
  END IF;

  RETURN v_category;
END $function$


CREATE OR REPLACE FUNCTION public.save_expense_dimension(p_kind text, p_id uuid DEFAULT NULL::uuid, p_code text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_name_ar text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := public.expense_actor();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_row  jsonb;
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.dimension.manage');

  IF p_kind NOT IN ('cost_center', 'project') THEN
    RAISE EXCEPTION 'Unknown dimension kind: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL AND v_name IS NULL THEN
    RAISE EXCEPTION 'A name is required' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'cost_center' THEN
    IF p_id IS NULL THEN
      INSERT INTO public.expense_cost_centers (code, name, name_ar, is_active, created_by)
      VALUES (v_code, v_name, nullif(btrim(coalesce(p_name_ar, '')), ''),
              COALESCE(p_is_active, true), v_user)
      RETURNING to_jsonb(expense_cost_centers.*) INTO v_row;
    ELSE
      UPDATE public.expense_cost_centers
         SET code      = CASE WHEN p_code IS NULL THEN code ELSE v_code END,
             name      = COALESCE(v_name, name),
             name_ar   = CASE WHEN p_name_ar IS NULL THEN name_ar
                              ELSE nullif(btrim(p_name_ar), '') END,
             is_active = COALESCE(p_is_active, is_active)
       WHERE id = p_id
      RETURNING to_jsonb(expense_cost_centers.*) INTO v_row;

      IF v_row IS NULL THEN
        RAISE EXCEPTION 'Cost centre not found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
  ELSE
    IF p_id IS NULL THEN
      INSERT INTO public.expense_projects (code, name, name_ar, is_active, created_by)
      VALUES (v_code, v_name, nullif(btrim(coalesce(p_name_ar, '')), ''),
              COALESCE(p_is_active, true), v_user)
      RETURNING to_jsonb(expense_projects.*) INTO v_row;
    ELSE
      UPDATE public.expense_projects
         SET code      = CASE WHEN p_code IS NULL THEN code ELSE v_code END,
             name      = COALESCE(v_name, name),
             name_ar   = CASE WHEN p_name_ar IS NULL THEN name_ar
                              ELSE nullif(btrim(p_name_ar), '') END,
             is_active = COALESCE(p_is_active, is_active)
       WHERE id = p_id
      RETURNING to_jsonb(expense_projects.*) INTO v_row;

      IF v_row IS NULL THEN
        RAISE EXCEPTION 'Project not found' USING ERRCODE = 'P0002';
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'expense.' || p_kind || '.' || CASE WHEN p_id IS NULL THEN 'created' ELSE 'updated' END,
          'expense_' || p_kind, (v_row ->> 'id')::uuid, v_row);

  RETURN v_row;
END $function$


CREATE OR REPLACE FUNCTION public.save_item_policy(_item_id uuid, _item_nature item_nature, _inventory_policy inventory_policy, _costing_method costing_method, _tracking item_tracking, _is_sellable boolean, _is_purchasable boolean, _base_uom_id uuid DEFAULT NULL::uuid, _sales_uom_id uuid DEFAULT NULL::uuid, _purchase_uom_id uuid DEFAULT NULL::uuid, _uom_conversions jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_before  jsonb;
  v_after   jsonb;
  v_policy_changed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'warehouse')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to edit item policy';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item % does not exist', _item_id;
  END IF;

  IF _item_nature = 'SERVICE' AND _inventory_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'A SERVICE can only be UNTRACKED';
  END IF;
  IF _inventory_policy = 'TRACKED' AND _costing_method = 'NONE' THEN
    RAISE EXCEPTION 'A TRACKED item requires a costing method other than NONE';
  END IF;
  IF _inventory_policy = 'UNTRACKED' AND _tracking <> 'NONE' THEN
    RAISE EXCEPTION 'An UNTRACKED item cannot require batch or serial tracking';
  END IF;
  IF NOT _is_sellable AND NOT _is_purchasable THEN
    RAISE EXCEPTION 'An item must be usable for selling, purchasing, or both';
  END IF;

  IF _uom_conversions IS NOT NULL AND jsonb_typeof(_uom_conversions) <> 'array' THEN
    RAISE EXCEPTION 'UOM conversions must be a JSON array';
  END IF;

  v_policy_changed :=
    _item_nature      IS DISTINCT FROM v_product.item_nature
    OR _inventory_policy IS DISTINCT FROM v_product.inventory_policy
    OR _costing_method   IS DISTINCT FROM v_product.costing_method
    OR _tracking         IS DISTINCT FROM v_product.tracking;

  -- When only the commercial flags or units change, no policy transition is
  -- happening and the plain path is enough.
  IF NOT v_policy_changed THEN
    UPDATE public.products
    SET is_sellable      = _is_sellable,
        is_purchasable   = _is_purchasable,
        base_uom_id      = _base_uom_id,
        sales_uom_id     = _sales_uom_id,
        purchase_uom_id  = _purchase_uom_id,
        uom_conversions  = coalesce(_uom_conversions, uom_conversions),
        updated_at       = now()
    WHERE id = _item_id;

    RETURN _item_id;
  END IF;

  -- A policy change is a governed transition. If the item has no history yet,
  -- the trigger allows the direct write; if it has history, the owner/manager
  -- rule applies and the change is audited.
  IF public.item_has_stock_history(_item_id) THEN
    IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
      RAISE EXCEPTION
        'Item % has inventory history; only an owner or manager may change its policy',
        _item_id;
    END IF;

    v_before := jsonb_build_object(
      'item_nature', v_product.item_nature,
      'inventory_policy', v_product.inventory_policy,
      'costing_method', v_product.costing_method,
      'tracking', v_product.tracking
    );

    PERFORM set_config('app.allow_policy_change', 'on', true);
  END IF;

  UPDATE public.products
  SET item_nature      = _item_nature,
      inventory_policy = _inventory_policy,
      costing_method   = _costing_method,
      tracking         = _tracking,
      is_sellable      = _is_sellable,
      is_purchasable   = _is_purchasable,
      base_uom_id      = _base_uom_id,
      sales_uom_id     = _sales_uom_id,
      purchase_uom_id  = _purchase_uom_id,
      uom_conversions  = coalesce(_uom_conversions, uom_conversions),
      updated_at       = now()
  WHERE id = _item_id;

  IF v_before IS NOT NULL THEN
    v_after := jsonb_build_object(
      'item_nature', _item_nature,
      'inventory_policy', _inventory_policy,
      'costing_method', _costing_method,
      'tracking', _tracking
    );

    PERFORM public.audit_item_policy_snapshot(
      _item_id,
      'item_policy.changed',
      v_before,
      v_after,
      'item_editor'
    );
  END IF;

  RETURN _item_id;
END $function$


CREATE OR REPLACE FUNCTION public.search_products(p_query text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_brand_id uuid DEFAULT NULL::uuid, p_unit_id uuid DEFAULT NULL::uuid, p_origin_id uuid DEFAULT NULL::uuid, p_active boolean DEFAULT NULL::boolean, p_low_stock boolean DEFAULT NULL::boolean, p_sort_key text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, name_ar text, sku text, barcode text, sale_price numeric, cost_price numeric, tax_rate numeric, min_stock numeric, shelf_location text, origin_id uuid, quality_grade_id uuid, is_active boolean, category_id uuid, brand_id uuid, unit_id uuid, created_at timestamp with time zone, category_name text, category_name_ar text, brand_name text, brand_name_ar text, unit_short_name text, unit_name_ar text, stock_qty numeric, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH filtered AS (
    SELECT
      p.id, p.name, p.name_ar, p.sku, p.barcode,
      p.sale_price, p.cost_price, p.tax_rate, p.min_stock, p.shelf_location,
      p.origin_id, p.quality_grade_id, p.is_active,
      p.category_id, p.brand_id, p.unit_id, p.created_at,
      c.name    AS category_name,
      c.name_ar AS category_name_ar,
      b.name    AS brand_name,
      b.name_ar AS brand_name_ar,
      u.short_name AS unit_short_name,
      u.name_ar    AS unit_name_ar,
      COALESCE((
        SELECT sum(i.quantity) FROM public.inventory i WHERE i.product_id = p.id
      ), 0) AS stock_qty
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    LEFT JOIN public.brands     b ON b.id = p.brand_id
    LEFT JOIN public.units      u ON u.id = p.unit_id
    WHERE
      -- Fuzzy-ish text search: case-insensitive substring across the identity
      -- fields. Uses simple LIKE so it works on any Postgres without extensions.
      (
        p_query IS NULL
        OR btrim(p_query) = ''
        OR p.name        ILIKE '%' || btrim(p_query) || '%'
        OR p.name_ar     ILIKE '%' || btrim(p_query) || '%'
        OR p.sku         ILIKE '%' || btrim(p_query) || '%'
        OR p.barcode     ILIKE '%' || btrim(p_query) || '%'
        OR p.shelf_location ILIKE '%' || btrim(p_query) || '%'
      )
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_brand_id    IS NULL OR p.brand_id    = p_brand_id)
      AND (p_unit_id     IS NULL OR p.unit_id     = p_unit_id)
      AND (p_origin_id   IS NULL OR p.origin_id   = p_origin_id)
      AND (p_active      IS NULL OR p.is_active   = p_active)
  ),
  counted AS (
    SELECT *, count(*) OVER () AS total_count FROM filtered
  )
  SELECT
    id, name, name_ar, sku, barcode,
    sale_price, cost_price, tax_rate, min_stock, shelf_location,
    origin_id, quality_grade_id, is_active,
    category_id, brand_id, unit_id, created_at,
    category_name, category_name_ar, brand_name, brand_name_ar,
    unit_short_name, unit_name_ar,
    stock_qty, total_count
  FROM counted
  WHERE
    p_low_stock IS NULL
    OR (p_low_stock = true  AND stock_qty <= min_stock)
    OR (p_low_stock = false AND stock_qty >  min_stock)
  ORDER BY
    CASE WHEN p_sort_key = 'name'       AND p_sort_dir = 'asc'  THEN COALESCE(name_ar, name) END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'name'       AND p_sort_dir = 'desc' THEN COALESCE(name_ar, name) END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'sku'        AND p_sort_dir = 'asc'  THEN sku END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'sku'        AND p_sort_dir = 'desc' THEN sku END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'sale_price' AND p_sort_dir = 'asc'  THEN sale_price END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'sale_price' AND p_sort_dir = 'desc' THEN sale_price END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'cost_price' AND p_sort_dir = 'asc'  THEN cost_price END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'cost_price' AND p_sort_dir = 'desc' THEN cost_price END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'stock'      AND p_sort_dir = 'asc'  THEN stock_qty END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'stock'      AND p_sort_dir = 'desc' THEN stock_qty END DESC NULLS LAST,
    CASE WHEN p_sort_key = 'created_at' AND p_sort_dir = 'asc'  THEN created_at END ASC NULLS LAST,
    CASE WHEN p_sort_key = 'created_at' AND p_sort_dir = 'desc' THEN created_at END DESC NULLS LAST,
    created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  OFFSET GREATEST(0, COALESCE(p_offset, 0));
$function$


CREATE OR REPLACE FUNCTION public.set_company_costing_method(_method text, _source text, _notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_old  public.costing_method;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'Only an owner or manager can change the company costing method';
  END IF;
  IF _method NOT IN ('MOVING_AVERAGE', 'STANDARD') THEN
    RAISE EXCEPTION 'Costing method must be MOVING_AVERAGE or STANDARD (got %)', _method;
  END IF;

  SELECT costing_method INTO v_old FROM public.company_costing_settings WHERE id = 1 FOR UPDATE;
  IF v_old = _method::public.costing_method THEN
    RETURN;  -- idempotent: re-selecting the same method is not a change
  END IF;

  UPDATE public.company_costing_settings
     SET costing_method = _method::public.costing_method,
         standard_cost_source = coalesce(_source, standard_cost_source),
         effective_from    = CURRENT_DATE,
         updated_by        = v_user,
         updated_at        = now(),
         notes             = nullif(btrim(coalesce(_notes, '')), '')
   WHERE id = 1;

  INSERT INTO public.costing_policy_history (costing_method, previous_method, reason, changed_by)
  VALUES (_method::public.costing_method, v_old, nullif(btrim(coalesce(_notes, '')), ''), v_user);
END $function$


CREATE OR REPLACE FUNCTION public.set_company_item_policy(_item_id uuid, _inventory_policy inventory_policy DEFAULT NULL::inventory_policy, _costing_method costing_method DEFAULT NULL::costing_method, _default_cost numeric DEFAULT NULL::numeric, _default_sale_price numeric DEFAULT NULL::numeric, _tax_rate numeric DEFAULT NULL::numeric, _is_active boolean DEFAULT true, _company_id integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_before  jsonb;
  v_after   jsonb;
  v_nature  public.item_nature;
  v_balance numeric;
  v_existing public.company_items%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'Only an owner or manager may change a company item policy';
  END IF;

  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = _item_id;
  IF v_nature IS NULL THEN
    RAISE EXCEPTION 'Item % does not exist', _item_id;
  END IF;

  IF v_nature = 'SERVICE' AND _inventory_policy IS NOT NULL AND _inventory_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'A SERVICE can only be UNTRACKED in any company';
  END IF;

  IF _default_cost IS NOT NULL AND _default_cost < 0 THEN
    RAISE EXCEPTION 'Default cost cannot be negative';
  END IF;
  IF _default_sale_price IS NOT NULL AND _default_sale_price < 0 THEN
    RAISE EXCEPTION 'Default sale price cannot be negative';
  END IF;
  IF _tax_rate IS NOT NULL AND (_tax_rate < 0 OR _tax_rate > 100) THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 100';
  END IF;

  SELECT * INTO v_existing
  FROM public.company_items
  WHERE company_id = _company_id AND item_id = _item_id
  FOR UPDATE;

  -- Refuse to strand stock by turning tracking off for a company that holds it.
  IF _inventory_policy IS NOT NULL AND _inventory_policy <> 'TRACKED' THEN
    SELECT coalesce(sum(i.quantity), 0) INTO v_balance
    FROM public.inventory i
    WHERE i.product_id = _item_id
      AND i.owner_type = 'COMPANY'
      AND i.owner_id IS NULL;

    IF v_balance <> 0
       AND coalesce(v_existing.inventory_policy, (SELECT p.inventory_policy FROM public.products p WHERE p.id = _item_id)) = 'TRACKED' THEN
      RAISE EXCEPTION
        'Company % still holds % units of item %. Clear the balance before leaving TRACKED.',
        _company_id, v_balance, _item_id;
    END IF;
  END IF;

  v_before := CASE WHEN v_existing.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'inventory_policy', v_existing.inventory_policy,
      'costing_method', v_existing.costing_method,
      'default_cost', v_existing.default_cost,
      'default_sale_price', v_existing.default_sale_price,
      'tax_rate', v_existing.tax_rate,
      'is_active', v_existing.is_active
    ) END;

  INSERT INTO public.company_items (
    company_id, item_id, inventory_policy, costing_method,
    default_cost, default_sale_price, tax_rate, is_active
  )
  VALUES (
    _company_id, _item_id, _inventory_policy, _costing_method,
    _default_cost, _default_sale_price, _tax_rate, coalesce(_is_active, true)
  )
  ON CONFLICT (company_id, item_id) DO UPDATE
  SET inventory_policy   = COALESCE(EXCLUDED.inventory_policy,   public.company_items.inventory_policy),
      costing_method     = COALESCE(EXCLUDED.costing_method,     public.company_items.costing_method),
      default_cost       = COALESCE(EXCLUDED.default_cost,       public.company_items.default_cost),
      default_sale_price = COALESCE(EXCLUDED.default_sale_price, public.company_items.default_sale_price),
      tax_rate           = COALESCE(EXCLUDED.tax_rate,           public.company_items.tax_rate),
      is_active          = EXCLUDED.is_active,
      updated_at         = now()
  RETURNING id INTO v_id;

  SELECT jsonb_build_object(
           'inventory_policy', ci.inventory_policy,
           'costing_method', ci.costing_method,
           'default_cost', ci.default_cost,
           'default_sale_price', ci.default_sale_price,
           'tax_rate', ci.tax_rate,
           'is_active', ci.is_active
         )
    INTO v_after
  FROM public.company_items ci WHERE ci.id = v_id;

  PERFORM public.audit_item_policy_snapshot(
    _item_id,
    'company_item_policy.changed',
    coalesce(v_before, '{}'::jsonb),
    v_after,
    'company:' || _company_id
  );

  RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.set_standard_costs(_costs jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_n    integer := 0;
  e      jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')) THEN
    RAISE EXCEPTION 'Only an owner or manager may set standard costs';
  END IF;
  IF _costs IS NULL OR jsonb_array_length(_costs) = 0 THEN
    RAISE EXCEPTION 'No standards supplied';
  END IF;

  FOR e IN SELECT * FROM jsonb_array_elements(_costs)
  LOOP
    IF coalesce((e->>'standard_cost')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Standard cost must be greater than zero for product %', e->>'product_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.products p
                    WHERE p.id = (e->>'product_id')::uuid
                      AND p.item_nature = 'GOOD' AND p.inventory_policy = 'TRACKED') THEN
      RAISE EXCEPTION 'Product % is not a tracked good', e->>'product_id';
    END IF;

    UPDATE public.products
       SET standard_cost = (e->>'standard_cost')::numeric
     WHERE id = (e->>'product_id')::uuid;

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
    VALUES (v_user, 'product.standard_cost_set', 'product', (e->>'product_id')::uuid,
            jsonb_build_object('standard_cost', (e->>'standard_cost')::numeric,
                               'implied', (e->>'implied_standard')::numeric,
                               'note', nullif(btrim(coalesce(e->>'note','')), '')));
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $function$


CREATE OR REPLACE FUNCTION public.submit_expense(p_entry_id uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := public.expense_actor();
  v_entry public.expense_entries;
  v_from  public.expense_status;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  v_from := v_entry.status;
  IF v_from NOT IN ('DRAFT', 'REJECTED') THEN
    RAISE EXCEPTION 'Only a draft or a returned expense can be submitted (current: %)', v_from
      USING ERRCODE = '55000';
  END IF;

  IF NOT (v_entry.created_by = v_user OR public.expense_role_rank(v_user) >= 30) THEN
    RAISE EXCEPTION 'Forbidden: you can only submit your own drafts' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expense_assert_capability(v_user, 'expense.submit');

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  -- Completeness, in the order an operator would fix it.
  IF v_entry.total_amount <= 0 OR v_entry.line_count = 0 THEN
    RAISE EXCEPTION 'Add at least one line with an amount before submitting'
      USING ERRCODE = '22023';
  END IF;
  IF v_entry.payee_type = 'SUPPLIER' AND v_entry.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Choose the supplier before submitting' USING ERRCODE = '22023';
  END IF;
  IF v_entry.payee_type = 'EMPLOYEE' AND v_entry.employee_id IS NULL THEN
    RAISE EXCEPTION 'Choose the staff member before submitting' USING ERRCODE = '22023';
  END IF;

  UPDATE public.expense_entries
     SET status             = 'SUBMITTED',
         submitted_by       = v_user,
         submitted_at       = now(),
         rejection_reason   = NULL,
         version            = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'submitted', v_from, 'SUBMITTED', NULL, v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.sync_apply_operation(p_idempotency_key text, p_entity_name text, p_operation_type text, p_origin_device_id text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
  v_result JSONB;
BEGIN
  -- 1. Check if idempotency key exists
  SELECT * INTO v_existing
  FROM public.sync_idempotency_keys
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'status', 'DUPLICATE_ACK',
        'idempotency_key', p_idempotency_key,
        'message', 'Operation already processed previously',
        'result', v_existing.response_payload
      );
    ELSIF v_existing.status = 'processing' THEN
      -- In-flight request concurrent lock
      RETURN jsonb_build_object(
        'status', 'IN_FLIGHT',
        'idempotency_key', p_idempotency_key,
        'message', 'Operation is currently being processed by server'
      );
    END IF;
  END IF;

  -- 2. Insert processing lock
  INSERT INTO public.sync_idempotency_keys (
    idempotency_key,
    entity_name,
    operation_type,
    origin_device_id,
    status
  ) VALUES (
    p_idempotency_key,
    p_entity_name,
    p_operation_type,
    p_origin_device_id,
    'processing'
  );

  -- 3. Return success acknowledgment payload template
  v_result := jsonb_build_object(
    'acknowledged', true,
    'entity_name', p_entity_name,
    'operation_type', p_operation_type,
    'processed_at', now()
  );

  -- Mark completed
  UPDATE public.sync_idempotency_keys
  SET status = 'completed',
      response_payload = v_result,
      updated_at = now()
  WHERE idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object(
    'status', 'PROCESSED',
    'idempotency_key', p_idempotency_key,
    'result', v_result
  );

EXCEPTION WHEN OTHERS THEN
  UPDATE public.sync_idempotency_keys
  SET status = 'failed',
      error_message = SQLERRM,
      updated_at = now()
  WHERE idempotency_key = p_idempotency_key;

  RAISE EXCEPTION 'Sync Apply Operation Failed: %', SQLERRM;
END;
$function$


CREATE OR REPLACE FUNCTION public.sync_item_class_from_policy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.item_nature IS DISTINCT FROM OLD.item_nature
     OR NEW.inventory_policy IS DISTINCT FROM OLD.inventory_policy THEN

    -- الطبيعة تحكم أولاً: الخدمة خدمة.
    IF NEW.item_nature = 'SERVICE' THEN
      NEW.item_class := 'SERVICE';

    ELSIF NEW.item_nature = 'GOOD' THEN
      -- الأصناف التي تصنيفها *خاصية جوهرية* لا تُدهَس بالمنتج النهائي:
      -- خام قابل للاستهلاك، ناتج جانبي، وتعبئة تُشترى وتُستهلك.
      IF NEW.item_class IS NULL
         OR NEW.item_class NOT IN ('RAW_MATERIAL', 'BY_PRODUCT', 'PACKAGING') THEN
        NEW.item_class := 'FINISHED_GOOD';
      END IF;
    END IF;

    -- السياسة تحدّ الحالة التي لا تُمسك رصيداً.
    IF NEW.inventory_policy = 'CUSTOMER_OWNED' THEN
      -- أمانات العميل ليست مخزوناً تجارياً؛ تبقى ماديّةً في تصنيفها الأصلي.
      IF NEW.item_class IS NULL THEN
        NEW.item_class := 'NON_STOCK_ITEM';
      END IF;
    ELSIF NEW.inventory_policy = 'UNTRACKED' AND NEW.item_nature = 'GOOD' THEN
      -- صنف مادي غير متتبَّع: لا رصيد له مهما كان نوعه.
      NEW.item_class := 'NON_STOCK_ITEM';
    END IF;
  END IF;
  RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.tg_expense_entries_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only guard documents that have actually been recognized. A draft is meant
  -- to be edited; a posted document is evidence.
  IF OLD.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED')
     AND NEW.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED') THEN
    RETURN NEW;
  END IF;

  -- The exception is the reversal flow, which legitimately links a posted row
  -- to its compensating document; everything else about it stays frozen.
  IF NEW.total_amount  IS DISTINCT FROM OLD.total_amount
     OR NEW.expense_date IS DISTINCT FROM OLD.expense_date
     OR NEW.entry_type   IS DISTINCT FROM OLD.entry_type
     OR NEW.supplier_id  IS DISTINCT FROM OLD.supplier_id
     OR NEW.employee_id  IS DISTINCT FROM OLD.employee_id
     OR NEW.payee_type   IS DISTINCT FROM OLD.payee_type
     OR NEW.currency     IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION
      'Expense % is posted: its financial fields are immutable. Reverse it instead.',
      OLD.reference
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.tg_expense_lines_sync_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_id uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  v_status   public.expense_status;
  v_total    numeric(18,2);
  v_lines    integer;
BEGIN
  SELECT status INTO v_status FROM public.expense_entries WHERE id = v_entry_id;

  -- A posted document's lines are frozen evidence; leave its header alone.
  IF v_status IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED') THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(gross_amount), 0)::numeric(18,2), count(*)
    INTO v_total, v_lines
  FROM public.expense_lines
  WHERE entry_id = v_entry_id;

  UPDATE public.expense_entries
     SET total_amount = v_total,
         line_count   = v_lines
   WHERE id = v_entry_id
     AND status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED');

  RETURN NULL;
END $function$


CREATE OR REPLACE FUNCTION public.tg_expense_payments_sync_entry()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_id uuid := COALESCE(NEW.entry_id, OLD.entry_id);
  v_paid     numeric(18,2);
  v_entry    public.expense_entries;
BEGIN
  SELECT COALESCE(sum(amount), 0)::numeric(18,2)
    INTO v_paid
  FROM public.expense_payments
  -- A reversed payment keeps its row but stops counting toward settlement; the
  -- reversal row itself is subtracted because it carries a positive amount and
  -- a `reversal_of` link, which is expressed on the matching row's `reversed_by`.
  WHERE entry_id = v_entry_id
    AND reversed_by IS NULL
    AND reversal_of IS NULL;

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_entry_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.expense_entries
     SET paid_amount = v_paid,
         status = public.expense_settlement_status(
           CASE WHEN v_entry.status IN ('CLOSED', 'REVERSED') THEN v_entry.status
                ELSE 'POSTED'::public.expense_status END,
           v_paid,
           v_entry.total_amount
         )
   WHERE id = v_entry_id;

  RETURN NULL;
END $function$


CREATE OR REPLACE FUNCTION public.tg_guard_item_policy_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_allow text := current_setting('app.allow_policy_change', true);
BEGIN
  IF v_allow = 'on' THEN
    RETURN NEW;
  END IF;

  -- Nature and policy changes are both restricted once history exists.
  IF NEW.inventory_policy IS DISTINCT FROM OLD.inventory_policy
     OR NEW.item_nature IS DISTINCT FROM OLD.item_nature
     OR NEW.costing_method IS DISTINCT FROM OLD.costing_method
  THEN
    IF public.item_has_stock_history(OLD.id) THEN
      RAISE EXCEPTION
        'Item % has inventory history; policy changes must go through approve_item_policy_change()',
        OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Rule 2 enforced again at the transition point: an item with history can
  -- never become a SERVICE, because that would retroactively re-label real
  -- stock movements as a non-stock service.
  IF NEW.item_nature = 'SERVICE' AND OLD.item_nature <> 'SERVICE' THEN
    IF public.item_has_stock_history(OLD.id) THEN
      RAISE EXCEPTION
        'Item % has inventory history and cannot be converted to SERVICE', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $function$


CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END $function$


CREATE OR REPLACE FUNCTION public.update_expense(p_entry_id uuid, p_expected_version integer, p_lines jsonb, p_expense_date date DEFAULT NULL::date, p_due_date date DEFAULT NULL::date, p_entry_type expense_entry_type DEFAULT NULL::expense_entry_type, p_payee_type expense_payee_type DEFAULT NULL::expense_payee_type, p_payee_name text DEFAULT NULL::text, p_supplier_id uuid DEFAULT NULL::uuid, p_employee_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_project_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_tax_mode expense_tax_mode DEFAULT NULL::expense_tax_mode)
 RETURNS expense_entries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user      uuid := public.expense_actor();
  v_entry     public.expense_entries;
  v_total     numeric;
  v_count     integer;
  v_tax_mode  public.expense_tax_mode;
  v_payee     public.expense_payee_type;
  v_from      public.expense_status;
BEGIN
  -- `FOR UPDATE` is what makes the version check meaningful: without the row
  -- lock, two concurrent updates could both read version 3, both pass the
  -- check, and the second would silently overwrite the first.
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  v_from := v_entry.status;

  IF v_from NOT IN ('DRAFT', 'REJECTED') THEN
    RAISE EXCEPTION 'Only a draft or a returned expense can be edited (current: %)', v_from
      USING ERRCODE = '55000';
  END IF;

  -- Ownership or an accounting-and-above role. A cashier must not be able to
  -- rewrite a colleague's draft.
  IF NOT (v_entry.created_by = v_user OR public.expense_role_rank(v_user) >= 30) THEN
    RAISE EXCEPTION 'Forbidden: you can only edit your own drafts' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expense_assert_capability(v_user, 'expense.edit');

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  v_tax_mode := COALESCE(p_tax_mode, v_entry.tax_mode);
  v_payee    := COALESCE(p_payee_type, v_entry.payee_type);

  IF v_payee = 'SUPPLIER' AND COALESCE(p_supplier_id, v_entry.supplier_id) IS NULL THEN
    RAISE EXCEPTION 'A supplier payee requires a supplier' USING ERRCODE = '22023';
  END IF;
  IF v_payee = 'EMPLOYEE' AND COALESCE(p_employee_id, v_entry.employee_id) IS NULL THEN
    RAISE EXCEPTION 'An employee payee requires a staff member' USING ERRCODE = '22023';
  END IF;

  UPDATE public.expense_entries
     SET expense_date   = COALESCE(p_expense_date, expense_date),
         due_date       = p_due_date,
         entry_type     = COALESCE(p_entry_type, entry_type),
         payee_type     = v_payee,
         payee_name     = nullif(btrim(coalesce(p_payee_name, '')), ''),
         supplier_id    = CASE WHEN v_payee = 'SUPPLIER' THEN p_supplier_id END,
         employee_id    = CASE WHEN v_payee = 'EMPLOYEE' THEN p_employee_id END,
         warehouse_id   = p_warehouse_id,
         cost_center_id = p_cost_center_id,
         project_id     = p_project_id,
         description    = nullif(btrim(coalesce(p_description, '')), ''),
         note           = nullif(btrim(coalesce(p_note, '')), ''),
         tax_mode       = v_tax_mode,
         -- A rejected document that is edited becomes a draft again: it must
         -- re-earn its approval rather than inheriting the old decision.
         status         = 'DRAFT'::public.expense_status,
         rejection_reason = NULL,
         version        = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  SELECT o_total, o_count INTO v_total, v_count
  FROM public.expense_write_lines(p_entry_id, p_lines, v_tax_mode);

  UPDATE public.expense_entries
     SET total_amount = v_total,
         line_count   = v_count
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(
    p_entry_id, 'updated', v_from, 'DRAFT', 'Draft edited', v_user);

  RETURN v_entry;
END $function$


CREATE OR REPLACE FUNCTION public.warehouse_reference_counts(p_warehouse_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inventory  bigint := 0;
  v_movements  bigint := 0;
  v_sales      bigint := 0;
  v_purchases  bigint := 0;
  v_transfers  bigint := 0;
  v_blocking   bigint := 0;
BEGIN
  SELECT count(*) INTO v_inventory FROM public.inventory WHERE warehouse_id = p_warehouse_id;
  SELECT count(*) INTO v_movements FROM public.stock_movements WHERE warehouse_id = p_warehouse_id;

  BEGIN
    SELECT count(*) INTO v_sales FROM public.sales_invoices WHERE warehouse_id = p_warehouse_id;
  EXCEPTION WHEN undefined_column THEN v_sales := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_purchases FROM public.purchase_invoices WHERE warehouse_id = p_warehouse_id;
  EXCEPTION WHEN undefined_column THEN v_purchases := 0;
  END;

  BEGIN
    SELECT count(*) INTO v_transfers FROM public.stock_transfers
      WHERE from_warehouse_id = p_warehouse_id OR to_warehouse_id = p_warehouse_id;
  EXCEPTION WHEN undefined_table THEN v_transfers := 0;
       WHEN undefined_column THEN v_transfers := 0;
  END;

  v_blocking := v_inventory + v_movements + v_sales + v_purchases + v_transfers;

  RETURN jsonb_build_object(
    'warehouse_id',   p_warehouse_id,
    'inventory_rows', v_inventory,
    'stock_movements',v_movements,
    'sales_invoices', v_sales,
    'purchase_invoices', v_purchases,
    'transfers',      v_transfers,
    'blocking_total', v_blocking,
    'can_delete',     v_blocking = 0
  );
END;
$function$
