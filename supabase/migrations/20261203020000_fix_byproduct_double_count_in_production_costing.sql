-- ============================================================================
-- 20261203020000_fix_byproduct_double_count_in_production_costing.sql
--
-- A BUG THAT HAD BEEN LIVE SINCE THE PRODUCTION ENGINE WAS BUILT
-- -----------------------------------------------------------
-- complete_production_order credits the by-products and then gives the primary
-- the whole of total_cost:
--
--     -- by-products share their credit pro rata by weight
--     FOR r IN ... output_role = 'BY_PRODUCT'
--        SET total_cost = v_byprod_value * actual_qty / v_out
--
--     -- the primary takes the whole remainder, pro rata by weight
--     FOR r IN ... output_role = 'PRIMARY'
--        SET total_cost = v_total * actual_qty / v_primary_qty   -- <-- v_total
--
-- The comment says "remainder" and the code does not compute one. Under
-- NET_REALISABLE_VALUE or RELATIVE_SALES_VALUE the by-product credit is
-- therefore added on top of the total instead of taken out of it:
--
--     1000 kg wheat, total cost 17,000
--     flour 760 kg -> 17,000.00
--     bran  200 kg ->    416.67   (200 kg x sale price 10)
--     sum of outputs -> 17,416.67, against a production cost of 17,000.00
--
-- 416.67 riyals of cost that the mill never incurred.
--
-- WHY IT SATED UNSEEN
-- -------------------
-- The production acceptance suite only ever ran REMAINDER_TO_PRIMARY, where
-- v_byprod_value is zero and the two branches are indistinguishable. Any
-- single test of the default configuration cannot catch a bug that only
-- exists in a non-default one. It took wiring the ledger - which independently
-- refuses to post an order whose outputs exceed its cost - to surface it.
--
-- THE FIX
-- -------
-- The primary receives v_total minus the by-product credit, which is what the
-- comment always claimed:
--
--     SET total_cost = (v_total - v_byprod_value) * qty / primary_qty
--
-- and the guard below refuses to complete an order whose allocated outputs do
-- not sum to the production cost, so a future arithmetic slip in any allocation
-- basis fails at the point it happens rather than surfacing in a financial
-- report months later.
--
-- NON-DESTRUCTIVE: one function body. No order, output, cost layer or stock
-- movement is altered. No production order exists in the database yet, so
-- there is nothing to recompute.
-- ============================================================================

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
END $$;

COMMENT ON FUNCTION public.complete_production_order(uuid, numeric, numeric) IS
  'يقفل أمر الإنتاج: الأساسي يأخذ الباقي بعد حصة النواتج الجانبية (لا التكلفة كاملة)، '
  'ويُرفَض الإكمال إن لم يتطابق مجموع النواتج مع تكلفة الإنتاج.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.complete_production_order(uuid, numeric, numeric);