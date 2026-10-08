-- ============================================================================
-- Market-Hub ERP — Phase 5: Policy-driven purchase + transfer engines
-- ============================================================================
-- Reference: Market-Hub_Product_Inventory_Service_Design.docx
--   section 5  (what happens on sale and purchase, per item kind)
--   section 10 (purchase / receipt / cost are three separate concepts)
--   section 18 (rule 5: a purchase does not always increase stock)
--
-- THE PROBLEM THIS REPLACES
--   create_purchase() unconditionally ran
--       INSERT INTO inventory ... ON CONFLICT DO UPDATE quantity = quantity + qty
--   for every line. Buying a service — or buying a physical good the company has
--   deliberately chosen NOT to track — created an inventory balance out of
--   nothing. That is design rule #5 and the "GOOD + UNTRACKED" case.
--
-- THE NEW ENGINE
--   Each purchase line asks the item policy:
--       STOCK_RECEIPT -> increase stock + write a RECEIPT movement + record cost
--       NONE          -> expense/service purchase: no stock, no valuation
--
--   The line is stamped with line_type and stock_effect, so the purchase report
--   can tell goods from services without guessing from names.
--
-- BACKWARD COMPATIBILITY
--   * Signature unchanged (7 arguments). The existing purchases UI keeps working.
--   * Invoice header totals, supplier balance and payment handling unchanged.
--   * Existing purchase invoices are not touched; their lines keep line_type NULL.
--
-- ROLLBACK
--   (restore create_purchase / create_stock_transfer from 20260701141926)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Purchase resolution helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_purchase_line(
  p_line jsonb,
  OUT o_product_id   uuid,
  OUT o_quantity     numeric,
  OUT o_line_type    text,
  OUT o_stock_effect text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.resolve_purchase_line(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_purchase_line(jsonb) TO authenticated;

COMMENT ON FUNCTION public.resolve_purchase_line(jsonb) IS
  'يفسّر سطر شراء واحد: الصنف، الكمية، نوع السطر، والأثر المخزني (STOCK_RECEIPT أو NONE).';

-- ---------------------------------------------------------------------------
-- 2. Policy-driven create_purchase
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase(
  _warehouse_id uuid,
  _supplier_id uuid,
  _payment_method text,
  _paid numeric,
  _discount numeric,
  _note text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.create_purchase(uuid, uuid, text, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase(uuid, uuid, text, numeric, numeric, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_purchase(uuid, uuid, text, numeric, numeric, text, jsonb) IS
  'محرك الشراء الموحد. لا يزيد المخزون إلا للأصناف المتتبعة (STOCK_RECEIPT)؛ الخدمات والأصناف غير المتتبعة مصروف فقط.';

-- ---------------------------------------------------------------------------
-- 3. Purchase returns respect the same policy
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase_return(
  _invoice_id uuid,
  _warehouse_id uuid,
  _supplier_id uuid,
  _refund_method text,
  _note text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.create_purchase_return(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_return(uuid, uuid, uuid, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Stock transfer through the shared primitive
-- ---------------------------------------------------------------------------
-- Transfers now use post_stock_delta() for both legs, so they get the same
-- locking, the same ledger columns and the same non-negative guarantee. Only
-- TRACKED company stock can be transferred; customer-owned material uses the
-- dedicated customer-owned RPCs instead.
CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  _from uuid,
  _to uuid,
  _note text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.create_stock_transfer(uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_stock_transfer(uuid, uuid, text, jsonb) IS
  'تحويل مخزون بين مستودعين عبر المحرك الموحد. الأصناف المتتبعة فقط.';