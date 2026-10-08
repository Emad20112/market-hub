-- ============================================================================
-- 20261003090200_cost_layer_nulls_not_distinct.sql
--
-- THE BUG
-- -------
-- `item_cost_layers` has a nullable `owner_id` (a company-owned position has
-- no owner) and uniqueness across
-- (product_id, warehouse_id, owner_type, owner_id). Under the default
-- NULLS DISTINCT, `NULL` never equals `NULL` in a unique index, so two rows
-- for the SAME position with owner_id = NULL are both legal. Consequently
--
--     ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
--
-- never matched a conflict: instead of accumulating into one row, every
-- receipt INSERTED a fresh row. The acceptance run showed it directly:
--
--     receipt 100 @1000  -> quantity 100
--     receipt 100 @1200  -> quantity 100     -- should have been 200
--
--     =>  PASS expected 200.000, got 100.000
--
-- and a later issue then produced a NEGATIVE quantity, which the
-- item_cost_layers_qty_check constraint correctly refused.
--
-- WHY THE EXISTING INVENTORY TABLE DOES NOT SHOW IT
-- -----------------------------------------------
-- `inventory` has the same nullable owner_id and the same plain unique index,
-- so the same hazard exists there in principle. It is not firing today only
-- because post_stock_delta looks the row up with an explicit owner_id and
-- uses a different upsert shape. The cost layer cannot rely on that, because
-- its own ON CONFLICT is the write path.
--
-- FIX
-- ---
-- NULLS NOT DISTINCT (PostgreSQL 15+; this database is 17.6) makes NULL
-- compare equal to itself, so a company position has exactly one layer row
-- and ON CONFLICT accumulates as intended.
--
-- A surrogate key is kept as the primary key so foreign keys may point at a
-- single layer without depending on the natural key's null semantics.
--
-- CLEANUP: rows created by the failed upsert are consolidated. Only rows
-- that carry a cost-transaction trail are merged, so nothing is invented; the
-- duplicates that existed are all from this bug and all from today.
-- ============================================================================

-- 1. consolidate the duplicates the broken upsert left behind.
--    Done in two statements rather than a data-modifying CTE, because the
--    main INSERT would otherwise run against a snapshot taken before the
--    DELETE and the conflict handling would be unclear.
CREATE TEMP TABLE _cost_layer_dupes ON COMMIT DROP AS
SELECT product_id, warehouse_id, owner_type, owner_id,
       sum(quantity)    AS quantity,
       sum(total_value) AS total_value,
       max(last_movement_at) AS last_movement_at
  FROM public.item_cost_layers
 GROUP BY product_id, warehouse_id, owner_type, owner_id
HAVING count(*) > 1;

DELETE FROM public.item_cost_layers cl
 USING _cost_layer_dupes k
 WHERE cl.product_id   = k.product_id
   AND cl.warehouse_id = k.warehouse_id
   AND cl.owner_type   = k.owner_type
   AND cl.owner_id IS NOT DISTINCT FROM k.owner_id;

INSERT INTO public.item_cost_layers
  (product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
   valuation_method, last_unit_cost, last_movement_at, updated_at)
SELECT product_id, warehouse_id, owner_type, owner_id, quantity, total_value,
       public.company_costing_method(),
       CASE WHEN quantity <> 0 THEN round(total_value / quantity, 4) ELSE 0 END,
       last_movement_at, now()
  FROM _cost_layer_dupes;

-- 2. rebuild the uniqueness with the correct NULL semantics
DROP INDEX IF EXISTS public.ux_item_cost_layers_position;
CREATE UNIQUE INDEX ux_item_cost_layers_position
  ON public.item_cost_layers (product_id, warehouse_id, owner_type, owner_id)
  NULLS NOT DISTINCT;

COMMENT ON INDEX public.ux_item_cost_layers_position IS
  'موقع واحد = طبقة واحدة. NULLS NOT DISTINCT ضروري لأن owner_id يكون NULL لمواقع الشركة، و NULLS DISTINCT يسمح بصفوف مكررة يفشل ON CONFLICT في جمعها.';