-- ============================================================================
-- 20261003090300_correct_standard_cost_branch_and_valuation_basis.sql
--
-- TWO DEFECTS FOUND BY THE ACCEPTANCE RUN
-- ----------------------------------------
-- (1) The STANDARD branch seeded `products.standard_cost` from the first
--     receipt it ever saw, then valued the stock at that figure. A standard
--     cost that is derived from actual purchases is a moving average wearing
--     a standard's name, which defeats the entire purpose of the method: the
--     balance was supposed to stay at the budgeted cost while the difference
--     from what was really paid became a measurable variance.
--
--     The acceptance run showed it:
--         receipt 100 @1000   (standard 1000)
--         receipt 100 @1400   (standard 1000)
--         => balance 240000.00   -- expected 200000.00
--            the 1400 receipt was valued at 1400 instead of 1000
--
--     Now the standard must already exist; a receipt under STANDARD without
--     one is refused with a clear message rather than inventing a budget.
--
-- (2) `item_cost_transactions` recorded the VALUATION, not the cost actually
--     paid. Under STANDARD the two differ by design, so the ledger was
--     storing the standard in a column that is supposed to hold evidence of
--     the real transaction - and the variance it was meant to expose could
--     never be reconstructed from it. The ledger now always records
--     `p_incoming_cost`.
--
-- (3) `item_valuation` reported ACTUAL for a position whose layer existed
--     but carried zero value, which asserts "this stock is free" when the
--     truth is "nobody ever supplied a cost for it". A zero is only an actual
--     cost when the quantity is zero too.
--
-- (4) The earlier harvest of views granted SELECT on item_valuation to
--     anon-adjacent roles. Closed here so the costing layer is staff-only,
--     matching item_cost_layers itself.
--
-- NON-DESTRUCTIVE: function and view definitions, plus grants.
-- No layer, transaction, movement or balance is altered.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_cost_movement(
  p_product_id   uuid,
  p_warehouse_id uuid,
  p_signed_qty   numeric,
  p_incoming_cost numeric DEFAULT NULL,
  p_source_type  text DEFAULT NULL,
  p_source_id    uuid DEFAULT NULL,
  p_note         text DEFAULT NULL,
  p_owner_type   public.owner_type DEFAULT 'COMPANY',
  p_owner_id     uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- ── receipt ──
  IF p_signed_qty > 0 THEN

    IF v_method = 'STANDARD' THEN
      -- The standard must already exist. Adopting the first purchase price as
      -- "the standard" would make this a moving average in disguise.
      SELECT p.standard_cost INTO v_standard
        FROM public.products p
       WHERE p.id = p_product_id;

      IF v_standard IS NULL OR v_standard = 0 THEN
        RAISE EXCEPTION
          'Standard cost is not set for this item. Set products.standard_cost before receiving stock under the STANDARD method.';
      END IF;

      v_in_cost := v_standard;
    ELSE
      -- Moving average: a caller-supplied cost is a fact (a purchase price,
      -- an opening valuation); without one the engine uses what the item
      -- currently costs.
      v_in_cost := coalesce(
        p_incoming_cost,
        CASE WHEN v_qty0 > 0 THEN round(v_val0 / v_qty0, 4) END,
        (SELECT p.cost_price FROM public.products p WHERE p.id = p_product_id),
        0
      );
    END IF;

    v_val1 := v_val0 + round(p_signed_qty * v_in_cost, 2);

  -- ── issue ──
  ELSE
    IF v_qty0 <= 0 THEN
      -- No layer but stock is going out: something posted a movement without
      -- valuing it. Fall back to the catalogue rather than issuing at zero,
      -- which would make the remaining stock look free.
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
    -- Never leave a negative or fractional-ghost balance behind.
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
  -- method exists to expose - recording the standard here would destroy the
  -- only evidence of it.
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
      'warehouse_id',   p_warehouse_id,
      'method',         v_method,
      'direction',      CASE WHEN p_signed_qty > 0 THEN 'IN' ELSE 'OUT' END,
      'quantity',       abs(p_signed_qty),
      'actual_cost',    coalesce(p_incoming_cost, 0),
      'valuation_cost', coalesce(v_in_cost, v_out_cost, 0),
      'quantity_after', v_qty1,
      'value_after',    v_val1,
      'source_type',    p_source_type,
      'source_id',      p_source_id
    ));
END $$;

-- ── the view, with an honest valuation basis ────────────────────────────────
CREATE OR REPLACE VIEW public.item_valuation
  WITH (security_invoker = true) AS
-- Quantity and value are aggregated in separate CTEs on purpose. Joining
-- inventory and item_cost_layers row-by-row before aggregating multiplies the
-- two sets together, so a product in two warehouses would report its own
-- quantity twice.
WITH qty AS (
  SELECT product_id, sum(quantity) AS on_hand_qty
    FROM public.inventory
   WHERE owner_type = 'COMPANY'::public.owner_type
   GROUP BY product_id
),
val AS (
  SELECT cl.product_id,
         sum(cl.total_value) AS valuation,
         -- A layer with zero value against a non-zero quantity means nobody
         -- ever supplied a cost. Counting only valued layers keeps that from
         -- being reported as an actual cost of zero.
         count(*) FILTER (WHERE cl.total_value > 0) AS valued_layers
    FROM public.item_cost_layers cl
   WHERE cl.owner_type = 'COMPANY'::public.owner_type
   GROUP BY cl.product_id
)
SELECT p.id                                          AS product_id,
       p.sku,
       p.name_ar,
       p.item_class,
       COALESCE(q.on_hand_qty, 0)                    AS on_hand_qty,
       COALESCE(v.valuation, 0)                      AS valuation,
       CASE WHEN COALESCE(q.on_hand_qty, 0) <> 0
            THEN round(COALESCE(v.valuation, 0) / q.on_hand_qty, 4)
            ELSE 0 END                               AS actual_unit_cost,
       -- ACTUAL only when at least one layer carries a real value.
       CASE WHEN v.valued_layers IS NULL OR v.valued_layers = 0
            THEN 'REFERENCE_ONLY' ELSE 'ACTUAL' END AS valuation_basis,
       p.cost_price                                  AS catalogue_cost,
       p.standard_cost                               AS standard_cost
  FROM public.products p
  LEFT JOIN qty q ON q.product_id = p.id
  LEFT JOIN val v ON v.product_id = p.id;

REVOKE ALL ON public.item_valuation FROM anon;
GRANT SELECT ON public.item_valuation TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_cost_movement(uuid, uuid, numeric, numeric, text, uuid, text, public.owner_type, uuid) IS
  'يقيّم حركة مخزون على طبقة التكلفة حسب طريقة الشركة. السجل يحفظ التكلفة الفعلية المدفوعة لا قيمة التقييم، وبذلك تبقى الميزانية قابلة للقياس.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.item_valuation;
-- DROP FUNCTION IF EXISTS public.apply_cost_movement(uuid, uuid, numeric, numeric, text, uuid, text, public.owner_type, uuid);