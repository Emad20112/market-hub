-- ============================================================================
-- Market-Hub ERP — Phase 3 + 6: Core stock posting + atomic document RPCs
-- ============================================================================
-- Reference: Market-Hub_Product_Inventory_Service_Design.docx
--   section 9  (Item + Location + Owner)
--   section 10 (Purchases vs Opening Stock vs Adjustment are three concepts)
--   section 14 (movements carry value + source document)
--   section 18 (rules 6, 8: opening/adjustment are NOT purchases;
--               customer ownership is NOT a storage location)
--
-- WHY ONE PRIMITIVE
--   Every stock change in this system — sale, purchase, opening, adjustment,
--   transfer, customer-owned receipt — must move the counter and write the
--   ledger entry in the SAME statement pair, with the SAME locking discipline.
--   If each RPC implements that itself we get the current situation: five
--   near-identical blocks that drift apart.
--
--   So this migration introduces ONE internal function, post_stock_delta(),
--   which is the only place that ever writes public.inventory and
--   public.stock_movements. Everything else calls it inside its own transaction.
--
-- SAFETY
--   post_stock_delta() is SECURITY DEFINER and is REVOKEd from authenticated.
--   It is an internal primitive, not a client entry point. The client-facing
--   operations are the document RPCs below, which do their own role checks.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.release_customer_owned_stock(uuid,uuid,uuid,numeric,text);
--   DROP FUNCTION IF EXISTS public.receive_customer_owned_stock(uuid,uuid,uuid,numeric,numeric,text);
--   DROP FUNCTION IF EXISTS public.post_stock_adjustment(uuid,text,text,date,jsonb);
--   DROP FUNCTION IF EXISTS public.post_opening_stock(uuid,date,text,jsonb);
--   DROP FUNCTION IF EXISTS public.post_stock_delta(uuid,uuid,numeric,numeric,public.stock_movement_kind,text,uuid,text,public.owner_type,uuid,public.movement_type);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The one and only stock writer
-- ---------------------------------------------------------------------------
-- p_signed_qty : positive = increase, negative = decrease
-- p_owner_type / p_owner_id : who owns the material at this location
--
-- Returns the resulting on-hand quantity for that (item, location, owner).
--
-- Locking: the inventory row is locked FOR UPDATE before the check-and-write,
-- so two concurrent sales of the last unit cannot both succeed.
CREATE OR REPLACE FUNCTION public.post_stock_delta(
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_signed_qty   numeric,
  p_unit_cost    numeric DEFAULT NULL,
  p_movement_kind public.stock_movement_kind DEFAULT 'ADJUSTMENT',
  p_source_type  text DEFAULT NULL,
  p_source_id    uuid DEFAULT NULL,
  p_note         text DEFAULT NULL,
  p_owner_type   public.owner_type DEFAULT 'COMPANY',
  p_owner_id     uuid DEFAULT NULL,
  p_movement_type_legacy public.movement_type DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

COMMENT ON FUNCTION public.post_stock_delta(uuid, uuid, numeric, numeric, public.stock_movement_kind, text, uuid, text, public.owner_type, uuid, public.movement_type) IS
  'المحرك الوحيد لتغيير المخزون: يقفل الوضعية، يتحقق من عدم السلبية، يحدّث inventory ويكتب stock_movements في نفس المعاملة.';

-- Internal primitive: never callable from the browser.
REVOKE ALL ON FUNCTION public.post_stock_delta(uuid, uuid, numeric, numeric, public.stock_movement_kind, text, uuid, text, public.owner_type, uuid, public.movement_type)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Opening Stock (design rule #6: NOT a purchase)
-- ---------------------------------------------------------------------------
-- Accepts: [{ product_id, quantity, unit_cost, note }]
--
-- Only TRACKED items may carry an opening balance. An UNTRACKED good or a
-- SERVICE has no on-hand quantity by definition, so posting opening stock for
-- one is a configuration error and is rejected loudly.
CREATE OR REPLACE FUNCTION public.post_opening_stock(
  _warehouse_id uuid,
  _effective_date date,
  _note text,
  _items jsonb
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
END $$;

REVOKE ALL ON FUNCTION public.post_opening_stock(uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_opening_stock(uuid, date, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.post_opening_stock(uuid, date, text, jsonb) IS
  'رصيد أول المدة. ليس شراءً ولا يظهر في تقرير المشتريات. لا يقبل خدمة أو صنفًا غير متتبع.';

-- ---------------------------------------------------------------------------
-- 3. Stock Adjustment (design rule #6: NOT a purchase)
-- ---------------------------------------------------------------------------
-- Accepts: [{ product_id, quantity (signed), unit_cost, note }]
-- `_reason` is mandatory and is copied onto each movement's adjustment_reason,
-- which the DB already enforces via stock_movements_adjustment_reason_required.
CREATE OR REPLACE FUNCTION public.post_stock_adjustment(
  _warehouse_id uuid,
  _reason text,
  _note text,
  _effective_date date,
  _items jsonb
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
END $$;

REVOKE ALL ON FUNCTION public.post_stock_adjustment(uuid, text, text, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_stock_adjustment(uuid, text, text, date, jsonb) TO authenticated;

COMMENT ON FUNCTION public.post_stock_adjustment(uuid, text, text, date, jsonb) IS
  'تسوية مخزون بسبب موثّق. ليست شراءً ولا تظهر في تقرير المشتريات.';

-- ---------------------------------------------------------------------------
-- 4. Customer-owned stock (design section 9, rule #8)
-- ---------------------------------------------------------------------------
-- Material physically inside the company's premises but owned by a customer.
-- It is recorded in the SAME inventory table but under owner_type = CUSTOMER,
-- which is exactly why ownership must be separate from location.
--
-- Because owner_type <> 'COMPANY', it is excluded from company_stock_positions
-- and therefore from company valuation.
CREATE OR REPLACE FUNCTION public.receive_customer_owned_stock(
  _customer_id uuid,
  _product_id uuid,
  _warehouse_id uuid,
  _quantity numeric,
  _unit_cost numeric,
  _note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.receive_customer_owned_stock(uuid, uuid, uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_customer_owned_stock(uuid, uuid, uuid, numeric, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.receive_customer_owned_stock(uuid, uuid, uuid, numeric, numeric, text) IS
  'استلام مادة مملوكة لعميل داخل موقع الشركة. لا تدخل في تقييم مخزون الشركة.';

-- Delivery / consumption of customer-owned material. This is a physical
-- movement, NOT a sale, so it changes no revenue and no receivable.
CREATE OR REPLACE FUNCTION public.release_customer_owned_stock(
  _customer_id uuid,
  _product_id uuid,
  _warehouse_id uuid,
  _quantity numeric,
  _note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.release_customer_owned_stock(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_customer_owned_stock(uuid, uuid, uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.release_customer_owned_stock(uuid, uuid, uuid, numeric, text) IS
  'تسليم/صرف مادة مملوكة لعميل. حركة فيزيائية وليست بيعًا: لا إيراد ولا ذمة.';