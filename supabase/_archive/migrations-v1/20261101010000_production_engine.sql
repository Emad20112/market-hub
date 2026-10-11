-- ============================================================================
-- 20261101010000_production_engine.sql
--
-- THE CYCLE, AS FUNCTIONS
-- ------------------------
-- 1. create_production_order      - plan it, optionally from a BOM
-- 2. issue_production_materials  - consume stock: reduces inventory, values it
-- 3. add_production_output       - receive flour/bran: increases inventory
-- 4. record_production_loss      - log shrinkage with a reason
-- 5. complete_production_order   - allocate joint cost, value the outputs
--
-- INTEGRITY RULES, all enforced server-side
-- ----------------------------------------
-- * Materials cannot be issued unless they are actually in stock, and only
--   from a COMPANY-owned position with a NULL owner_id: customer custody is
--   never available to the mill's own production, because that grain is not
--   the mill's to consume.
-- * Planned and actual live in separate columns and no plan is ever
--   overwritten by an actual, so a yield comparison survives completion.
-- * Completion refuses to balance: output plus loss exceeding input is
--   impossible, not merely unlikely, and letting it through would have the
--   system inventing matter.
-- * A shortfall (input > output + loss) is NOT silently absorbed. It is
--   recorded as unaccounted loss so that "the difference vanished" - the exact
--   failure this path exists to prevent - is always visible on the order.
-- * Outputs are valued only at completion, once the joint cost is known.
--   Valuing them on receipt would mean inventing a cost per kilo in advance.
--
-- NO GENERAL LEDGER
-- ----------------
-- This schema has no chart of accounts and no journal table. Production posts
-- to the stock and cost ledgers, which is where the inventory facts actually
-- live, and writes an audit row. It does not invent accounting entries with no
-- home; a GL remains an open decision recorded in the gap matrix.
--
-- SIGNATURE NOTE
-- --------------
-- post_stock_delta is
--   (p_product_id, p_warehouse_id, p_signed_qty, p_unit_cost,
--    p_movement_kind, p_source_type, p_source_id, p_note,
--    p_owner_type, p_owner_id, p_movement_type_legacy)
-- and RETURNS the new quantity, not a movement id. The movement row is
-- therefore read back by its source reference after posting.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.production_order_seq') IS NULL THEN
    CREATE SEQUENCE public.production_order_seq START 1;
  END IF;
END $$;

-- read back the movement just posted by an order, for the order's own lines
CREATE OR REPLACE FUNCTION public.production_last_movement(
  p_product_id uuid, p_warehouse_id uuid, p_source_id uuid
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id FROM public.stock_movements m
   WHERE m.product_id = p_product_id AND m.warehouse_id = p_warehouse_id
     AND m.source_id = p_source_id
   ORDER BY m.created_at DESC, m.id DESC LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.production_last_movement(uuid, uuid, uuid) FROM PUBLIC, anon;

-- ── 1. plan ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_production_order(
  _warehouse_id     uuid,
  _bom_id           uuid DEFAULT NULL,
  _production_date  date DEFAULT CURRENT_DATE,
  _allocation_basis text DEFAULT 'REMAINDER_TO_PRIMARY',
  _notes            text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.create_production_order(uuid, uuid, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_production_order(uuid, uuid, date, text, text)
  TO authenticated, service_role;

-- ── 2. consume materials ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.issue_production_materials(
  _order_id uuid, _product_id uuid, _qty numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.issue_production_materials(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_production_materials(uuid, uuid, numeric)
  TO authenticated, service_role;

-- ── 3. receive an output ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_production_output(
  _order_id uuid, _product_id uuid, _qty numeric, _output_role text DEFAULT 'PRIMARY'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.add_production_output(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_production_output(uuid, uuid, numeric, text)
  TO authenticated, service_role;

-- ── 4. record a loss, with a reason ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_production_loss(
  _order_id uuid, _reason text, _qty numeric, _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.record_production_loss(uuid, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_production_loss(uuid, text, numeric, text)
  TO authenticated, service_role;

-- ── 5. complete: allocate the joint cost ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.complete_production_order(
  _order_id uuid, _overhead_cost numeric DEFAULT 0, _direct_labour numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ord  record;
  v_in   numeric; v_out numeric; v_loss numeric; v_gap numeric;
  v_mat  numeric; v_total numeric; v_basis text;
  v_byprod_value numeric := 0;
  v_primary_qty numeric;
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
  -- The joint cost cannot be split from the data alone: giving it all to the
  -- flour overstates the flour and understates the bran. The basis is an
  -- explicit, recorded choice, defaulting to the conservative one where the
  -- primary carries everything.
  IF v_basis = 'NET_REALISABLE_VALUE' THEN
    SELECT round(coalesce(sum(o.actual_qty * coalesce(p.sale_price, 0)), 0), 2) INTO v_byprod_value
      FROM public.production_order_outputs o
      JOIN public.products p ON p.id = o.product_id
     WHERE o.order_id = _order_id AND o.output_role = 'BY_PRODUCT';
    IF v_byprod_value > v_total THEN
      RAISE EXCEPTION
        'By-product realisable value (%.2f) exceeds total production cost (%.2f). '
        'Either the sale prices are wrong or the outputs overlap.', v_byprod_value, v_total;
    END IF;
  ELSIF v_basis = 'RELATIVE_SALES_VALUE' THEN
    SELECT round(coalesce(sum(o.actual_qty * coalesce(p.sale_price, 0)), 0), 2) INTO v_byprod_value
      FROM public.production_order_outputs o
      JOIN public.products p ON p.id = o.product_id
     WHERE o.order_id = _order_id AND o.output_role = 'BY_PRODUCT';
    IF v_byprod_value > v_total THEN
      v_byprod_value := v_total;
    END IF;
  END IF;

  -- by-products share their credit pro rata by weight
  FOR r IN
    SELECT id, actual_qty FROM public.production_order_outputs
     WHERE order_id = _order_id AND output_role = 'BY_PRODUCT'
  LOOP
    UPDATE public.production_order_outputs
       SET total_cost = round(v_byprod_value * r.actual_qty / nullif(v_out, 0), 2),
           unit_cost  = CASE WHEN r.actual_qty > 0
                             THEN round(v_byprod_value / nullif(v_out, 0), 4)
                             ELSE 0 END
     WHERE id = r.id;
  END LOOP;

  -- the primary takes the whole remainder, pro rata by weight
  SELECT coalesce(sum(actual_qty), 0) INTO v_primary_qty
    FROM public.production_order_outputs WHERE order_id = _order_id AND output_role = 'PRIMARY';

  IF v_primary_qty > 0 THEN
    FOR r IN
      SELECT id, actual_qty FROM public.production_order_outputs
       WHERE order_id = _order_id AND output_role = 'PRIMARY'
    LOOP
      UPDATE public.production_order_outputs
         SET total_cost = round(v_total * r.actual_qty / v_primary_qty, 2),
             unit_cost  = CASE WHEN r.actual_qty > 0
                               THEN round(v_total / v_primary_qty, 4)
                               ELSE 0 END
       WHERE id = r.id;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'No primary output was received, so the production cost has nowhere to go';
  END IF;

  -- Write the allocated cost into the cost layer for the stock already
  -- received. The quantity was posted on receipt; only the value is set now.
  FOR r IN
    SELECT o.product_id, o.actual_qty, o.total_cost
      FROM public.production_order_outputs o
     WHERE o.order_id = _order_id
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

  -- The unreconciled remainder is recorded, not absorbed. Shrinkage that has
  -- not been attributed to a reason is the thing that must never disappear.
  IF v_gap > 0.001 THEN
    INSERT INTO public.production_order_losses (order_id, reason, qty, value, notes, created_by)
    VALUES (_order_id, 'فرق غير مفسّر (لم يُسجَّل سببه)', v_gap,
            round(v_gap * CASE WHEN v_in > 0 THEN v_mat / v_in ELSE 0 END, 2),
            'الفرق بين الداخل والناتج المسجَّل: لم يُخصم له سبب، ويحتاج مراجعة.',
            v_user);
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
      'allocation_basis', v_basis, 'by_product_credit', v_byprod_value));
  RETURN _order_id;
END $$;

REVOKE ALL ON FUNCTION public.complete_production_order(uuid, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_production_order(uuid, numeric, numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_production_order(uuid, numeric, numeric) IS
  'يقفل أمر الإنتاج: يوزّع التكلفة المشتركة على الأساسي والجانبي، يقيّم النواتج في طبقة التكلفة، ويسجّل الفرق غير المفسّر كفاقد بدل ابتلاعه.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.complete_production_order(uuid, numeric, numeric);
-- DROP FUNCTION IF EXISTS public.record_production_loss(uuid, text, numeric, text);
-- DROP FUNCTION IF EXISTS public.add_production_output(uuid, uuid, numeric, text);
-- DROP FUNCTION IF EXISTS public.issue_production_materials(uuid, uuid, numeric);
-- DROP FUNCTION IF EXISTS public.create_production_order(uuid, uuid, date, text, text);
-- DROP FUNCTION IF EXISTS public.production_last_movement(uuid, uuid, uuid);