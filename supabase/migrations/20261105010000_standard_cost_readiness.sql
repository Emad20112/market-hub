-- ============================================================================
-- 20261105010000_standard_cost_readiness.sql
--
-- MAKING THE STANDARD-COST DECISION ACTIONABLE
-- -------------------------------------------
-- The decision was: a standard must be an approved budget, not a price the
-- engine quietly adopts from the first purchase it happens to see.
--
-- That half is already enforced. apply_cost_movement raises under the STANDARD
-- method when products.standard_cost is missing, because a standard derived
-- from the first receipt is a moving average wearing a standard's name, and
-- the balance it produces is exactly the balance the method exists to stop.
--
-- The half that was missing is the other one: an engine that refuses is only
-- fair if it says what is missing. Switching the company to STANDARD today
-- would produce one error per receipt and a list nobody had asked for, with
-- 26 tracked items unqualified. So:
--
--   1. standard_cost_readiness lists exactly what blocks the switch, with the
--      value each item's cost layer would imply, as a SUGGESTION only - it is
--      derived from what was actually paid, so approving it is a decision
--      being taken deliberately, not a value being discovered.
--   2. set_standard_costs writes them in one reviewed action rather than 26.
--   3. The refusal names the items, so the operator is not left guessing.
--
-- The suggestion column is deliberately separate from standard_cost and is
-- never written automatically. The gap between "what we paid" and "what we
-- budget" is the whole point of the method; collapsing them would erase it.
--
-- NON-DESTRUCTIVE: one view, one function, one function body. No standard is
-- set by this migration and no existing value is overwritten.
-- ============================================================================

CREATE OR REPLACE VIEW public.standard_cost_readiness
  WITH (security_invoker = true) AS
SELECT p.id AS product_id,
       p.sku,
       p.name_ar,
       p.item_class,
       p.unit_id,
       p.cost_price                                   AS catalogue_cost,
       p.standard_cost,
       -- What the stock currently costs, from the valued cost layer. This is
       -- a proposal for the budget, not the budget itself.
       CASE WHEN cl.quantity > 0
            THEN round(cl.total_value / cl.quantity, 4) END AS implied_standard,
       coalesce(cl.quantity, 0)                          AS on_hand_qty,
       CASE WHEN p.standard_cost IS NOT NULL THEN 'READY'
            WHEN cl.quantity > 0            THEN 'NEEDS_DECISION'
            ELSE 'NO_HISTORY' END          AS readiness,
       CASE WHEN p.standard_cost IS NOT NULL THEN 'معيار معتمد'
            WHEN cl.quantity > 0            THEN 'لا يوجد معيار — رشح القيمة القائمة، أو أدخل ميزانية'
            ELSE 'لا يوجد معيار ولا حركات — أدخل الميزانية يدوياً' END AS note
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT sum(quantity) AS quantity, sum(total_value) AS total_value
      FROM public.item_cost_layers c
     WHERE c.product_id = p.id
       AND c.owner_type = 'COMPANY'::public.owner_type
  ) cl ON true
 WHERE p.is_active
   AND p.item_nature = 'GOOD'
   AND p.inventory_policy = 'TRACKED'
   AND p.item_class <> 'SERVICE'
   AND p.standard_cost IS NULL;

COMMENT ON VIEW public.standard_cost_readiness IS
  'ما يمنع التحويل إلى التكلفة المعيارية: الأصناف المتتبَّعة بلا معيار معتمد. '
  'implied_standard اقتراح من التكلفة الفعلية القائمة، ولا يُكتب تلقائياً — إقراره قرار.';

REVOKE ALL ON public.standard_cost_readiness FROM anon;
GRANT SELECT ON public.standard_cost_readiness TO authenticated, service_role;

-- ── set them in one reviewed action ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_standard_costs(
  _costs jsonb  -- [{"product_id": "...", "standard_cost": 12.5, "note": "..."}]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.set_standard_costs(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_standard_costs(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_standard_costs(jsonb) IS
  'اعتماد معايير تكلفة واحدة دفعة واحدة، وكل قيمة تُدوَّن في سجل التدقيق مع قيمتها القائمة للمقارنة.';

-- ── make the refusal name what is missing ───────────────────────────────────
-- The engine already refuses a receipt under STANDARD with no standard; it
-- just did not say which items. An error that does not tell you what to fix
-- is only half an error.
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
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.set_standard_costs(jsonb);
-- DROP VIEW IF EXISTS public.standard_cost_readiness;