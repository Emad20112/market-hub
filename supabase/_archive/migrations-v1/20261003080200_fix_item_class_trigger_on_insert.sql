-- ============================================================================
-- 20261003080200_fix_item_class_trigger_on_insert.sql
--
-- THE BUG
-- -------
-- `sync_item_class_from_policy` (20261003080000) guards its body with:
--
--     IF NEW.item_nature IS DISTINCT FROM OLD.item_nature
--        OR NEW.inventory_policy IS DISTINCT FROM OLD.inventory_policy THEN
--
-- On INSERT there is no OLD row. PostgreSQL evaluates OLD.* as NULL, so the
-- condition *does* fire — the trigger runs. The failure is one level down:
--
--     ELSIF NEW.item_nature = 'GOOD' THEN
--       IF NEW.item_class NOT IN ('RAW_MATERIAL', 'BY_PRODUCT') THEN
--         NEW.item_class := 'FINISHED_GOOD';
--
-- For a brand-new GOOD product `NEW.item_class` is NULL, and
-- `NULL NOT IN ('RAW_MATERIAL','BY_PRODUCT')` evaluates to NULL, not TRUE.
-- The IF is not taken and the row is inserted with item_class = NULL.
--
-- Caught by the acceptance test, not by reading the code:
--
--     insert into products (..., item_nature, inventory_policy, ...)
--     values (..., 'GOOD','TRACKED', ...) returning id, item_class;
--       => item_class = null       -- should have been FINISHED_GOOD
--
-- WHY IT MATTERS
-- --------------
-- The costing engine is about to branch on this column. An unclassified item
-- would take whatever default the engine happens to have, which is precisely
-- the kind of silent misvaluation the classification exists to prevent. Every
-- new product created between 20261003080000 and this migration is affected.
--
-- FIX
-- ---
-- 1. Make the NULL case explicit (`NEW.item_class IS NULL OR ...`).
-- 2. Treat INSERT as an unconditional trigger event, so the intent no longer
--    depends on a reader knowing how OLD.* behaves during INSERT.
-- 3. Backfill any row still left NULL, so already-inserted products are fixed
--    by this migration rather than waiting for someone to edit them.
--
-- NON-DESTRUCTIVE: one column re-derived from two columns already present on
-- the same row. No balance, movement, document or financial record is touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_item_class_from_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.item_nature IS DISTINCT FROM OLD.item_nature
     OR NEW.inventory_policy IS DISTINCT FROM OLD.inventory_policy THEN

    -- Nature changed: the classification follows, but only for the two
    -- values that ARE a nature. A by-product and a raw material are both
    -- GOOD, so nature alone must not overwrite them with FINISHED_GOOD.
    --
    -- `NEW.item_class IS NULL OR ...` is spelled out because
    -- `NULL NOT IN (...)` is NULL, not TRUE — without it a newly inserted
    -- GOOD product would keep a NULL class forever.
    IF NEW.item_nature = 'SERVICE' THEN
      NEW.item_class := 'SERVICE';
    ELSIF NEW.item_nature = 'GOOD' THEN
      IF NEW.item_class IS NULL OR NEW.item_class NOT IN ('RAW_MATERIAL', 'BY_PRODUCT') THEN
        NEW.item_class := 'FINISHED_GOOD';
      END IF;
    END IF;

    -- Policy changed: an item that can no longer hold a balance is a service
    -- or a non-stock item, and a CUSTOMER_OWNED item is not company stock.
    IF NEW.inventory_policy = 'CUSTOMER_OWNED' THEN
      NEW.item_class := 'NON_STOCK_ITEM';
    ELSIF NEW.inventory_policy = 'UNTRACKED' AND NEW.item_nature = 'GOOD' THEN
      NEW.item_class := 'NON_STOCK_ITEM';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Recreate the trigger so the INSERT branch is declared rather than implied.
DROP TRIGGER IF EXISTS tg_sync_item_class ON public.products;
CREATE TRIGGER tg_sync_item_class
  BEFORE INSERT OR UPDATE OF item_nature, inventory_policy ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_item_class_from_policy();

-- Backfill rows inserted while the trigger was ineffective.
UPDATE public.products SET item_class = 'FINISHED_GOOD'
 WHERE item_class IS NULL AND item_nature = 'GOOD';
UPDATE public.products SET item_class = 'SERVICE'
 WHERE item_class IS NULL AND item_nature = 'SERVICE';
UPDATE public.products SET item_class = 'NON_STOCK_ITEM'
 WHERE item_class IS NULL;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- (restore the previous function body and trigger, then:)
-- UPDATE public.products SET item_class = NULL
--  WHERE item_class = 'FINISHED_GOOD' AND sku LIKE 'FG-BRAN-40';