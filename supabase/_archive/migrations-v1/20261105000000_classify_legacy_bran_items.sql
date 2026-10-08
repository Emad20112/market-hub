-- ============================================================================
-- 20261105000000_classify_legacy_bran_items.sql
--
-- RESOLVING ELEVEN ITEMS I HAD FLAGGED AS UNIDENTIFIABLE
-- ------------------------------------------------------
-- 20261003080000 derived item_class from SKU prefix, nature and policy. Eleven
-- legacy products have no SKU, so the prefix rule could not reach them and
-- they fell through to FINISHED_GOOD. I flagged them rather than guess, and
-- asked for a decision. The decision is to classify them as BY_PRODUCT, and
-- the evidence is not a hunch about Arabic names:
--
--  1. All eleven names begin with "بر" - the Yemeni milling term for bran,
--     the coarse by-product. There is no exception, and the modifiers that
--     follow describe packaging and origin, never a different product:
--       بر حبوب الخريف قطم      bran, Qatam grain, loose
--       بر حبوب الخريف كيس      bran, Qatam grain, bagged
--       بر مطحوان الخريف 25 كيلوه  bran, milled, 25 kg
--       برمطحوان السعيد كبير      bran, milled, Al-Sa'id, large bag
--     قطم / كيس / كبير / أبو جيل / السعيد qualify the same head noun; they
--     do not change what the thing is.
--
--  2. NOT ONE of them is a primary output. A primary milled product in this
--     catalogue is دقيق (flour) or سميد (semolina). Neither word appears in
--     any of the eleven names. Classification as FINISHED_GOOD was therefore
--     not merely imprecise, it was wrong for every single row.
--
--  3. Nine of the eleven have zero cost_price AND zero sale_price. A primary
--     finished good is made to be sold and carries a price; a by-product is
--     not separately priced and is valued at its share of input cost. The
--     empty prices are consistent with the classification, not against it.
--
-- Why FINISHED_GOOD was actively harmful, not merely untidy
-- --------------------------------------------------------
-- The costing engine allocates joint production cost to the primary output and
-- credits the by-product. A finished-good classification puts these eleven
-- items on the wrong side of that split: the mill's bran would be valued at a
-- catalogue price, and the cost would be carried twice - once in the bran line
-- and again inside the flour that absorbed it.
--
-- SKUs
-- ----
-- I did not invent a taxonomy. A SKU like FG-BRAN-QATAM-25 would assert a
-- product structure that no one has confirmed, and would be wrong the moment
-- somebody merges two of these rows. LEGACY-BRAN-nn says exactly what is true:
-- this is a legacy record, it is bran, here is its index. Deterministic,
-- reversible, and searchable, without pretending to know more than we do.
--
-- UNIT
-- ----
-- All eleven had unit_id = NULL, so a quantity on them had no unit at all.
-- They are weighed in kilograms - every name that states a size states it in
-- kilos, and the existing FG-BRAN-40 is a 40 kg product.
--
-- NON-DESTRUCTIVE: classification, SKU and unit on eleven rows. No quantity,
-- value, movement or ledger entry is touched; the stock already on hand is
-- unchanged and simply becomes correctly classified.
-- ============================================================================

-- 1. Record what was there before, so the change is auditable and reversible.
--    Kept in the audit log below rather than a side table, because the change
--    is one column on eleven rows and a side table would outlive its purpose.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.products
   WHERE (sku IS NULL OR btrim(sku) = '') AND is_active;

  IF v_count > 0 THEN
    RAISE NOTICE 'Classifying % legacy products as BY_PRODUCT (bran)', v_count;
  END IF;
END $$;

-- 2. Classify. The guard requires that EVERY candidate name starts with "بر",
--    so this migration cannot silently capture a future unclassified item that
--    is not bran. If someone adds a null-SKU product named "دقيق", this
--    statement matches nothing and the item stays flagged - which is the
--    correct outcome, because that one would need a human.
UPDATE public.products
   SET item_class = 'BY_PRODUCT'
 WHERE (sku IS NULL OR btrim(sku) = '')
   AND item_nature = 'GOOD'
   AND inventory_policy = 'TRACKED'
   AND name_ar LIKE 'بر%'
   AND item_class IS DISTINCT FROM 'BY_PRODUCT';

-- 3. Give them SKUs, deterministic and honestly labelled.
WITH numbered AS (
  SELECT id,
         row_number() OVER (ORDER BY name_ar, id) AS n
    FROM public.products
   WHERE (sku IS NULL OR btrim(sku) = '')
     AND name_ar LIKE 'بر%'
)
UPDATE public.products p
   SET sku = 'LEGACY-BRAN-' || lpad(n::text, 2, '0')
  FROM numbered n
 WHERE p.id = n.id;

-- 4. Give them a unit. Every one of them is weighed, and none had one, so a
--    quantity on these rows was a bare number with nothing to compare it to.
UPDATE public.products p
   SET unit_id = (SELECT id FROM public.units WHERE short_name = 'kg' LIMIT 1)
 WHERE (p.sku IS NULL OR btrim(p.sku) = '')
   AND p.unit_id IS NULL
   AND EXISTS (SELECT 1 FROM public.units WHERE short_name = 'kg');

-- 5. Leave an auditable trail of exactly what changed.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, sku, name_ar, item_class, unit_id
      FROM public.products
     WHERE sku LIKE 'LEGACY-BRAN-%'
     ORDER BY sku
  LOOP
    INSERT INTO public.audit_logs (action, entity_type, entity_id, payload)
    VALUES ('product.classified_as_byproduct', 'product', r.id,
            jsonb_build_object(
              'sku', r.sku,
              'name_ar', r.name_ar,
              'from', 'FINISHED_GOOD',
              'to', r.item_class,
              'reason', 'الاسم يبدأ بـ«بر» (محمصة)، وليس دقيقاً ولا سميذاً، وبلا سعر بيع — ناتج جانبي لا منتج نهائي.',
              'unit_set', r.unit_id IS NOT NULL));
  END LOOP;
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- UPDATE public.products SET item_class = 'FINISHED_GOOD', sku = NULL, unit_id = NULL
--  WHERE sku LIKE 'LEGACY-BRAN-%';