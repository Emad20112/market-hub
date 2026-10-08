-- ============================================================================
-- 20261003080100_correct_bran_classification.sql
--
-- WHY A CORRECTIVE MIGRATION
-- --------------------------
-- 20261003080000 backfilled `item_class` and the backfill was written in the
-- wrong order. The broad `FG-%` → FINISHED_GOOD rule ran before the narrow
-- `FG-BRAN-40` → BY_PRODUCT rule, so bran was classified as a finished good:
--
--     select sku, item_class from products where sku = 'FG-BRAN-40';
--       FG-BRAN-40 | FINISHED_GOOD     -- wrong
--
-- The file itself has been corrected for future environments; this migration
-- brings the already-migrated database in line. The project's rule is that an
-- applied migration is never edited in place, only superseded.
--
-- WHY IT MATTERS
-- --------------
-- Bran is 100% TRACKED company stock exactly like flour — it occupies silos
-- and it is sold. The difference is valuation: a by-product is not priced on
-- its own, it is carried at a share of the input cost that the costing engine
-- allocates. Classified as FINISHED_GOOD, the costing engine would value bran
-- at its catalogue cost_price and the cost of the flour would be overstated by
-- whatever bran is worth. The error is silent — every total still adds up, and
-- the number that is wrong is the one nobody checks.
--
-- NON-DESTRUCTIVE: one column on one row, no balance, no movement, no document.
-- ============================================================================

UPDATE public.products
   SET item_class = 'BY_PRODUCT'
 WHERE sku = 'FG-BRAN-40'
   AND item_class IS DISTINCT FROM 'BY_PRODUCT';

-- Any future by-product added to the catalogue under a different SKU should not
-- need a code change, so the rule is expressed as data, not as a special case.
COMMENT ON COLUMN public.products.item_class IS
  'التصنيف الخماسي: خام / نهائي / جانبي / خدمة / غير مخزني. '
  'نخالة القمح BY_PRODUCT: بضاعة متتبَّعة بلا سعر مستقل، تُقيَّم بحصتها من تكلفة المدخلات. '
  'لا يستبدل item_nature أو inventory_policy، وتتبعه قاعدة sync_item_class_from_policy.';

-- Guard: the classification must be complete for every active product, or the
-- costing engine would have to guess. Surfaced as a report, not enforced as a
-- constraint, so a half-entered draft product does not block the whole system.
CREATE OR REPLACE VIEW public.item_classification_gaps
  WITH (security_invoker = true) AS
SELECT p.id,
       p.sku,
       p.name_ar,
       p.item_nature,
       p.inventory_policy,
       CASE
         WHEN p.item_nature = 'SERVICE'                     THEN 'nature: service, class must be SERVICE'
         WHEN p.inventory_policy = 'CUSTOMER_OWNED'         THEN 'policy: customer owned, class must be NON_STOCK_ITEM'
         WHEN p.inventory_policy = 'UNTRACKED'              THEN 'policy: untracked, class must be SERVICE or NON_STOCK_ITEM'
         WHEN p.sku LIKE 'RM-%'                             THEN 'sku: raw material prefix, class should be RAW_MATERIAL'
         WHEN p.sku = 'FG-BRAN-40'                          THEN 'catalogue: bran is a by-product'
         ELSE 'unclassified GOOD+TRACKED item'
       END AS reason
  FROM public.products p
 WHERE p.is_active
   AND (
        p.item_class IS NULL
     OR (p.item_nature = 'SERVICE'                        AND p.item_class <> 'SERVICE')
     OR (p.inventory_policy = 'CUSTOMER_OWNED'            AND p.item_class <> 'NON_STOCK_ITEM')
     OR (p.inventory_policy = 'UNTRACKED' AND p.item_nature = 'GOOD' AND p.item_class <> 'NON_STOCK_ITEM')
     OR (p.sku LIKE 'RM-%'                                AND p.item_class <> 'RAW_MATERIAL')
     OR (p.sku = 'FG-BRAN-40'                             AND p.item_class <> 'BY_PRODUCT')
   );

COMMENT ON VIEW public.item_classification_gaps IS
  'أصناف لا يتطابق تصنيفها الخماسي مع طبيعتها وسياستها. يجب أن تكون النتيجة صفراً قبل تشغيل محرك التكلفة.';

REVOKE ALL ON public.item_classification_gaps FROM anon;
GRANT SELECT ON public.item_classification_gaps TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- UPDATE public.products SET item_class = 'FINISHED_GOOD' WHERE sku = 'FG-BRAN-40';
-- DROP VIEW IF EXISTS public.item_classification_gaps;