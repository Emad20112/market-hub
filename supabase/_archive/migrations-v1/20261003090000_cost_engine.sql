-- ============================================================================
-- 20261003090000_cost_engine.sql
--
-- THE COST ENGINE
-- ---------------
-- `inventory` stores a quantity and nothing else. `stock_movements` records
-- a unit_cost per movement, but no function ever reads those costs back, so
-- the system cannot answer "what does a kilo of flour on hand actually
-- cost?". `stock_positions.reference_unit_cost` falls back to
-- `products.cost_price`, which is a catalogue price entered once and never
-- maintained: every valuation in the system is therefore a stale reference,
-- and a stock report showing a margin is showing a guess.
--
-- Both requested methods are supported, one active company-wide
-- (20261003080000). This migration makes the switch real:
--
--   MOVING_AVERAGE - the balance is revalued on every receipt and every
--                    issue. What leaves the warehouse was valued at the
--                    average of what entered it.
--   STANDARD       - the balance keeps the item's standard cost. Variances
--                    are measured and reported rather than absorbed into
--                    the balance, which is what a standard-cost system is
--                    FOR: it makes the difference between expected and
--                    actual visible instead of hiding it in an average.
--
-- DESIGN
-- ------
-- The engine is a LAYER, not a patch. `item_cost_layers` holds one row per
-- (item, warehouse, owner) with the running quantity and value, and
-- `item_cost_transactions` is an immutable ledger of every revaluation.
-- Two reasons:
--
--   * The balance is derived and auditable. Anyone can ask why a kilo costs
--     what it costs and get an answer.
--   * Adding FIFO or LIFO later is a new method in resolve_unit_cost, not a
--     rewrite. The layer already holds what a FIFO queue would need.
--
-- `post_stock_delta` remains untouched. It is a well-tested posting engine
-- used by purchases, sales, transfers, adjustments and the milling module;
-- changing its signature would break every one of them. Instead the engine
-- exposes `apply_cost_movement`, which callers that care about valuation
-- wrap around the existing post. Existing data is seeded, not re-posted.
--
-- NON-DESTRUCTIVE: new tables and new functions. No existing movement is
-- rewritten, no balance changes, no invoice is touched. Existing stock is
-- seeded from the movements already on record.
-- ============================================================================

-- ── 1. the running valuation ────────────────────────────────────────────────
-- One row per stock position. The primary key mirrors exactly what
-- post_stock_delta locks on, so the cost engine can never drift from the
-- quantity it is valuing.
CREATE TABLE IF NOT EXISTS public.item_cost_layers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  owner_type   public.owner_type NOT NULL DEFAULT 'COMPANY',
  -- Nullable, exactly like inventory.owner_id: a company-owned position has no
  -- owner id. A PRIMARY KEY over this column is impossible in PostgreSQL, so
  -- the key mirrors inventory's shape — surrogate id, plus a unique index.
  owner_id     uuid,
  quantity      numeric(18,3) NOT NULL DEFAULT 0,
  total_value   numeric(18,2) NOT NULL DEFAULT 0,
  -- Which method produced the current average. Stored per position rather
  -- than read from the setting, so switching the company method does not
  -- retroactively rewrite the cost of stock already on the shelf.
  valuation_method public.costing_method NOT NULL DEFAULT 'MOVING_AVERAGE',
  last_unit_cost numeric(18,4) NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_cost_layers_qty_check CHECK (quantity >= 0),
  -- A zero-value balance is legitimate (goods given away, or a fully
  -- consumed batch); a negative one means the ledger lost a movement.
  CONSTRAINT item_cost_layers_value_check CHECK (total_value >= 0)
);

-- Same uniqueness the inventory table relies on. NULL owner ids are distinct
-- from one another under the default NULLS DISTINCT, so company positions
-- never collide.
CREATE UNIQUE INDEX IF NOT EXISTS ux_item_cost_layers_position
  ON public.item_cost_layers (product_id, warehouse_id, owner_type, owner_id);

COMMENT ON TABLE public.item_cost_layers IS
  'طبقة التكلفة: الكمية والقيمة الجاري تقييمهما لكل موقع مخزون. '
  'مصدر تفرّد للتكلفة الفعلية — لا يُقرأ products.cost_price إلا كمرجع عند غياب حركة.';

CREATE TABLE IF NOT EXISTS public.item_cost_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id   uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  owner_type     public.owner_type NOT NULL DEFAULT 'COMPANY',
  owner_id       uuid,
  direction      text NOT NULL CHECK (direction IN ('IN','OUT','REVALUE')),
  quantity       numeric(18,3) NOT NULL,
  unit_cost      numeric(18,4) NOT NULL,
  value          numeric(18,2) NOT NULL,
  method         public.costing_method NOT NULL,
  quantity_before numeric(18,3) NOT NULL,
  value_before   numeric(18,2) NOT NULL,
  quantity_after  numeric(18,3) NOT NULL,
  value_after    numeric(18,2) NOT NULL,
  source_type    text,
  source_id      uuid,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_item_cost_tx_product
  ON public.item_cost_transactions (product_id, created_at DESC);

COMMENT ON TABLE public.item_cost_transactions IS
  'سجل غير قابل للتعديل لكل إعادة تقييم تكلفة. يشرح لماذا تكلفة الصنف هي ما هي.';

-- ── 2. RLS ──────────────────────────────────────────────────────────────────
-- Customer-owned positions hold a customer's grain. Even a staff member
-- should not be able to browse another tenant's custody balance through the
-- costing layer, so company-owned rows and non-company rows are separated.
ALTER TABLE public.item_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_cost_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cost_layers_read ON public.item_cost_layers;
CREATE POLICY cost_layers_read ON public.item_cost_layers
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (owner_type = 'COMPANY'::public.owner_type OR owner_id = auth.uid())
  );

DROP POLICY IF EXISTS cost_tx_read ON public.item_cost_transactions;
CREATE POLICY cost_tx_read ON public.item_cost_transactions
  FOR SELECT TO authenticated
  USING (
    public.is_staff(auth.uid())
    AND (owner_type = 'COMPANY'::public.owner_type OR owner_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policy: the ledger is written only by the engine's
-- SECURITY DEFINER functions, which is what makes it trustworthy.

-- ── 3. the one function that resolves a cost ───────────────────────────────
-- Every caller must go through this. Reading products.cost_price directly is
-- how the reference cost leaked into the reports in the first place.
CREATE OR REPLACE FUNCTION public.resolve_unit_cost(
  p_product_id uuid,
  p_warehouse_id uuid DEFAULT NULL,
  p_as_of timestamptz DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.resolve_unit_cost(uuid, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_unit_cost(uuid, uuid, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_unit_cost(uuid, uuid, timestamptz) IS
  'نقطة الدخول الوحيدة لتكلفة الوحدة. تتبع إعداد الشركة: متوسط متحرك أو تكلفة معيارية.';

-- ── 4. posting a movement against the layer ────────────────────────────────
-- Wraps post_stock_delta rather than replacing it. Callers wrap the existing
-- call:
--     perform public.post_stock_delta(...);
--     perform public.apply_cost_movement(...);
--
-- `p_signed_qty` positive is a receipt, negative an issue — the same sign
-- convention post_stock_delta already uses, so the two can never disagree
-- about direction.
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
  v_onhand    numeric;
  v_class    public.item_class;
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

  SELECT coalesce(i.quantity, 0) INTO v_onhand
    FROM (SELECT 1) x
    LEFT JOIN public.inventory i
      ON i.product_id = p_product_id AND i.warehouse_id = p_warehouse_id
     AND i.owner_type = p_owner_type AND i.owner_id IS NOT DISTINCT FROM p_owner_id;

  -- ── receipt ──
  IF p_signed_qty > 0 THEN
    -- A caller that supplies a cost is stating a fact (a purchase price, an
    -- opening valuation). One that does not is asking the engine what the
    -- item currently costs.
    v_in_cost := coalesce(
      p_incoming_cost,
      CASE WHEN v_method = 'STANDARD'
           THEN (SELECT p.standard_cost FROM public.products p WHERE p.id = p_product_id)
           ELSE NULL END,
      CASE WHEN v_qty0 > 0 THEN round(v_val0 / v_qty0, 4) ELSE 0 END,
      (SELECT p.cost_price FROM public.products p WHERE p.id = p_product_id),
      0
    );

    IF v_method = 'STANDARD' THEN
      -- Standard: the balance is NOT revalued by what happens to be paid.
      -- The item keeps its standard, and the difference between the standard
      -- and the actual receipt is a variance to be measured elsewhere.
      --
      -- The standard must already exist. Falling back to the standard's own
      -- price would make the engine adopt the first purchase price it ever
      -- saw as "the standard", which is a moving average wearing a standard's
      -- name - precisely the thing a standard-cost system exists to avoid.
      SELECT p.standard_cost INTO v_standard
        FROM public.products p
       WHERE p.id = p_product_id;

      IF v_standard IS NULL OR v_standard = 0 THEN
        RAISE EXCEPTION
          'Standard cost is not set for this item. Set products.standard_cost before receiving stock under the STANDARD method.';
      END IF;

      v_in_cost := v_standard;
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
        round(v_val0 / nullif(v_qty0, 0), 4),
        (SELECT p.cost_price FROM public.products p WHERE p.id = p_product_id),
        0
      );
    ELSIF v_qty1 <= 0 THEN
      -- Issuing the whole balance: take the value out entirely. Any
      -- discrepancy is a real loss or gain and stays visible as such in the
      -- transaction row, rather than being spread over what remains.
      v_out_cost := round(v_val0 / v_qty0, 4);
    ELSE
      v_out_cost := round(v_val0 / v_qty0, 4);
    END IF;

    v_val1 := v_val0 - round(abs(p_signed_qty) * v_out_cost, 2);
    -- Guard against float drift leaving a 0.01 ghost on a fully issued item.
    IF v_qty1 <= 0 THEN
      v_val1 := 0;
    ELSIF v_val1 < 0 THEN
      v_val1 := 0;
    END IF;
  END IF;

  INSERT INTO public.item_cost_layers
    (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
     valuation_method, last_unit_cost, last_movement_at, updated_at)
  VALUES
    (p_product_id, p_warehouse_id, p_owner_type, p_owner_id, v_qty1, v_val1,
     v_method,
     CASE WHEN abs(p_signed_qty) > 0 THEN round(abs(v_val1 - v_val0) / abs(p_signed_qty), 4) ELSE 0 END,
     now(), now())
  ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
  DO UPDATE SET quantity         = EXCLUDED.quantity,
                total_value      = EXCLUDED.total_value,
                valuation_method = EXCLUDED.valuation_method,
                last_unit_cost   = EXCLUDED.last_unit_cost,
                last_movement_at = now(),
                updated_at       = now();

  -- The layer always records what was ACTUALLY paid on this movement, never
  -- the valuation it was given. Under STANDARD the two differ, and that gap
  -- IS the variance the method exists to surface - recording the standard
  -- here would destroy the evidence.
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
      'warehouse_id', p_warehouse_id,
      'method',       v_method,
      'direction',    CASE WHEN p_signed_qty > 0 THEN 'IN' ELSE 'OUT' END,
      'quantity',     abs(p_signed_qty),
      'unit_cost',    round(abs(v_val1 - v_val0) / abs(p_signed_qty), 4),
      'quantity_after', v_qty1,
      'value_after',  v_val1,
      'source_type',  p_source_type,
      'source_id',    p_source_id
    ));
END $$;

REVOKE ALL ON FUNCTION public.apply_cost_movement(uuid, uuid, numeric, numeric, text, uuid, text, public.owner_type, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_cost_movement(uuid, uuid, numeric, numeric, text, uuid, text, public.owner_type, uuid)
  TO authenticated, service_role;

-- ── 5. the standard column the engine reads ─────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS standard_cost numeric(18,4);

COMMENT ON COLUMN public.products.standard_cost IS
  'التكلفة المعيارية للوحدة. تُستخدم عند اختيار STANDARD على مستوى الشركة، ويُنشئها المحرك من أول حركة فعلية إن لم تُضبط يدوياً.';

-- ── 6. seed the layers from the movements already on record ─────────────────
-- The stock that exists today has movements behind it. Reconstructing the
-- layer from those movements makes the engine describe reality from its
-- first day, instead of reporting zero for every existing kilo until the next
-- purchase happens to land.
-- A layer is created ONLY where a real cost can be traced. Where the only
-- available figure is the catalogue price, no layer is written at all, so
-- item_valuation reports REFERENCE_ONLY rather than an ACTUAL zero. An
-- "actual cost" of zero would be a false claim of accuracy: it says the goods
-- are free, when the truth is that nobody ever valued them.
INSERT INTO public.item_cost_layers
  (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
   valuation_method, last_unit_cost, last_movement_at)
SELECT i.product_id,
       i.warehouse_id,
       i.owner_type,
       i.owner_id,
       i.quantity,
       round(i.quantity * v.unit_cost, 2),
       public.company_costing_method(),
       v.unit_cost,
       v.as_of
  FROM public.inventory i
  -- The cost must come from a recorded movement for THIS position, not from
  -- the catalogue, otherwise the row would assert an actual cost nobody paid.
  JOIN LATERAL (
    SELECT m.unit_cost, m.created_at AS as_of
      FROM public.stock_movements m
     WHERE m.product_id   = i.product_id
       AND m.warehouse_id = i.warehouse_id
       AND m.owner_type   = i.owner_type
       AND m.owner_id IS NOT DISTINCT FROM i.owner_id
       AND m.unit_cost IS NOT NULL
       AND m.unit_cost > 0
     ORDER BY m.created_at DESC
     LIMIT 1
  ) v ON TRUE
 WHERE i.quantity <> 0
ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
DO NOTHING;

-- ── 7. reporting ───────────────────────────────────────────────────────────
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
         -- A layer whose value is zero for a non-zero quantity means nobody
         -- ever supplied a cost. Reporting that as ACTUAL would claim the
         -- goods are free; the truth is that they were never valued.
         count(*) FILTER (WHERE cl.total_value > 0) AS valued_layers,
         count(*)                                  AS layer_count
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
       -- The distinction the reports must not blur: a valuation backed by a
       -- real cost layer, or one borrowed from the catalogue because no
       -- movement has ever been valued.
       CASE WHEN v.layer_count IS NULL OR v.valued_layers = 0 THEN 'REFERENCE_ONLY'
            ELSE 'ACTUAL' END                        AS valuation_basis,
       p.cost_price                                  AS catalogue_cost,
       p.standard_cost                               AS standard_cost
  FROM public.products p
  LEFT JOIN qty q ON q.product_id = p.id
  LEFT JOIN val v ON v.product_id = p.id;

COMMENT ON VIEW public.item_valuation IS
  'تقييم المخزون: التكلفة الفعلية من الطبقة، مع تمييز صريح بين ACTUAL و REFERENCE_ONLY. '
  'الهامش المبني على REFERENCE_ONLY تقدير وليس ربحاً.';

REVOKE ALL ON public.item_valuation FROM anon;
GRANT SELECT ON public.item_valuation TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.item_valuation;
-- DROP FUNCTION IF EXISTS public.apply_cost_movement(uuid, uuid, numeric, numeric, text, uuid, text, public.owner_type, uuid);
-- DROP FUNCTION IF EXISTS public.resolve_unit_cost(uuid, uuid, timestamptz);
-- DROP TABLE IF EXISTS public.item_cost_transactions;
-- DROP TABLE IF EXISTS public.item_cost_layers;
-- ALTER TABLE public.products DROP COLUMN IF EXISTS standard_cost;