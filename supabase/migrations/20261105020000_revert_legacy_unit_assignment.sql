-- ============================================================================
-- 20261105020000_revert_legacy_unit_assignment.sql
--
-- A MISTAKE OF MINE, REVERTED
-- -----------------------------
-- 20261105000000 gave the eleven legacy bran items a unit, on the reasoning
-- that every name stating a size states it in kilos. That reasoning was about
-- the NAMES and I applied it to the QUANTITIES, which do not follow the names.
--
-- What the eleven actually are:
--
--   برمطحوان السعيد ابو25 كيلوة     "25 kg sack"   - the item is A sack
--   برمطحوان السعيد كبير            "large"       - the item is A large sack
--   بر حبوب الخريف كيس              "bagged"      - the item is A bag
--
-- Naming a sack after the weight it happens to hold is not the same as
-- measuring it in kilograms, and the recorded stock was entered before any of
-- this existed, against no unit at all. Stamping 'kg' on the product
-- retroactively reinterpreted every historical quantity on it. The damage is
-- immediately visible in the costing layer:
--
--   select * from standard_cost_readiness where sku = 'LEGACY-BRAN-05';
--     implied_standard = 6500     <- read as "6500 YER per kilogram"
--
-- A sack of bran does not cost 6,500 per kilo. The stock was counted in sacks
-- and 6,500 is the cost of a sack, so the figure was correct until I labelled
-- it. A unit-of-measure change is not cosmetic: it silently rescales every
-- valuation in the system, which is precisely the class of silent
-- re-interpretation these migrations exist to prevent.
--
-- THE FIX
-- -------
-- unit_id goes back to NULL. NULL is the truthful answer: nobody knows what
-- unit these legacy quantities were counted in, and a blank that says "I do
-- not know" is worth more than a confident wrong answer.
--
-- The classification to BY_PRODUCT and the LEGACY-BRAN-nn SKUs from the same
-- migration are KEPT. Both are supported by the names and by the absence of
-- any price, and neither reinterprets a number that was already recorded.
--
-- Making these measurable is real work, not a migration: someone has to count
-- one sack and one 25 kg sack and record the conversion. Until that is done,
-- standard_cost_readiness reports these items as NO_HISTORY rather than
-- proposing a per-kilo standard that is wrong by a factor of twenty-five.
--
-- NON-DESTRUCTIVE: eleven NULL columns returned to NULL. No quantity, value,
-- movement or ledger entry is touched.
-- ============================================================================

UPDATE public.products
   SET unit_id = NULL
 WHERE sku LIKE 'LEGACY-BRAN-%'
   AND unit_id IS NOT NULL;

DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.products WHERE sku LIKE 'LEGACY-BRAN-%' AND unit_id IS NULL;
  RAISE NOTICE '% legacy bran items restored to unit-less: their quantities were never counted in a known unit', v_n;
END $$;

COMMENT ON TABLE public.products IS NULL;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- UPDATE public.products SET unit_id = (SELECT id FROM public.units WHERE short_name='kg' LIMIT 1)
--  WHERE sku LIKE 'LEGACY-BRAN-%';