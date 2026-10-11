-- ============================================================================
-- 20261101020000_inventory_nulls_not_distinct.sql
--
-- A PRE-EXISTING BUG IN THE CORE STOCK ENGINE
-- --------------------------------------------
-- `inventory` carries two unique constraints:
--
--   inventory_product_id_warehouse_id_key   UNIQUE (product_id, warehouse_id)
--   inventory_product_warehouse_owner_key   UNIQUE (product_id, warehouse_id,
--                                                     owner_type, owner_id)
--
-- and post_stock_delta upserts with:
--
--   ON CONFLICT (product_id, warehouse_id, owner_type, owner_id)
--
-- That inference targets the 4-column index. But owner_id is NULLABLE, and a
-- company-owned position stores NULL there. Under the default NULLS DISTINCT,
-- `NULL` does not equal `NULL` for index purposes, so the conflict NEVER
-- matches the existing row. PostgreSQL falls through to INSERT, which then
-- collides with the stricter 2-column constraint:
--
--   duplicate key value violates unique constraint
--     "inventory_product_id_warehouse_id_key"
--
-- Every stock posting against an existing company-owned position was hitting
-- this. It surfaced here only because production issuance is the first flow
-- to post against a position created by a different document (the seeded
-- opening receipt).
--
-- WHY IT HAS NOT BROKEN EVERYTHING
-- -------------------------------
-- Most existing movement flows either create the inventory row for the first
-- time, or post an owner_id that is non-NULL and therefore does compare. The
-- failure needs an existing row with a NULL owner_id - i.e. ordinary company
-- stock, the most common case in the system.
--
-- THE FIX
-- -------
-- NULLS NOT DISTINCT on the 4-column index, so the inference matches and
-- post_stock_delta takes its DO UPDATE branch instead of inserting. This adds
-- no new rows and relaxes nothing: the 2-column constraint stays exactly as
-- strict as it was, so the set of rows the table permits is unchanged. Only
-- which row the upsert UPDATES changes.
--
-- Deliberately NOT done: dropping the redundant 2-column constraint. It would
-- permit several owners per product+warehouse, which is a semantic change to
-- every ERP module at once, and it is not needed to fix this defect.
--
-- This is the identical defect fixed for item_cost_layers in 20261003090200.
-- The two tables are read by the same engine and share the same shape, so the
-- lesson generalises: any nullable column inside a unique key that an
-- ON CONFLICT clause names must be NULLS NOT DISTINCT, or the upsert silently
-- degrades from "update" to "insert".
--
-- NON-DESTRUCTIVE: one index replaced with stricter duplicate semantics.
-- No row is inserted, updated or deleted. Verified before and after by
-- posting a real movement through post_stock_delta.
-- ============================================================================

-- Consolidate any duplicate position rows the degraded upsert may have left,
-- defensively. NULLS NOT DISTINCT cannot be applied while such rows exist.
DO $$
DECLARE v_dupes integer;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT 1 FROM public.inventory
     GROUP BY product_id, warehouse_id, owner_type, owner_id
    HAVING count(*) > 1) d;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      'inventory has % duplicated positions; resolve them before applying NULLS NOT DISTINCT',
      v_dupes;
  END IF;
END $$;

-- The index is constraint-backed, so it must be dropped as a constraint.
-- DROP INDEX alone fails with "constraint ... requires it".
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_product_warehouse_owner_key;

CREATE UNIQUE INDEX inventory_product_warehouse_owner_key
  ON public.inventory (product_id, warehouse_id, owner_type, owner_id)
  NULLS NOT DISTINCT;

COMMENT ON INDEX public.inventory_product_warehouse_owner_key IS
  'NULLS NOT DISTINCT: بدونها لا يطابق ON CONFLICT صف الشركة (owner_id = NULL) فيدخل مسار INSERT ويصطدم بالقيد الأقوى على (product_id, warehouse_id)، فتفشل كل حركة صرف على رصيد شركة موجود.';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.inventory_product_warehouse_owner_key;
-- ALTER TABLE public.inventory
--   ADD CONSTRAINT inventory_product_warehouse_owner_key
--   UNIQUE (product_id, warehouse_id, owner_type, owner_id);