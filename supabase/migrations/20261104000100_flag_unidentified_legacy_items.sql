-- ============================================================================
-- 20261104000100_flag_unidentified_legacy_items.sql
--
-- A MISTAKE OF MINE, SURFACED RATHER THAN LEFT SILENT
-- ---------------------------------------------------
-- The item_class backfill (20261003080000) derived the classification from
-- SKU prefix, nature and policy. Eleven legacy products have NO sku at all, so
-- the prefix rule could not apply and they fell through to:
--
--     UPDATE products SET item_class = 'FINISHED_GOOD'
--      WHERE item_class IS NULL AND item_nature = 'GOOD';
--
-- That is a guess, and several of them are wrong. Their names read, for
-- example, "بر حبوب الخريف قطم" and "بر مطحوان" - that is bran, a BY_PRODUCT,
-- not a primary output. A finished-good classification makes the costing
-- engine value them at a catalogue price instead of at a share of the input
-- cost, which is precisely the error item_class exists to prevent.
--
-- They cannot be reclassified safely from here: matching on Arabic name text
-- would be a second guess, and a wrong by-product/finished-good split moves
-- real cost between the flour line and the bran line.
--
-- So they are FLAGGED, not fixed. item_classification_gaps - the view built
-- for exactly this purpose - now reports them, so the misclassification is
-- visible on the settings screen until someone confirms each one.
--
-- The decision required is a commercial one: confirm the classification of
-- each unidentified legacy item, and give them SKUs.
--
-- NON-DESTRUCTIVE: one view replaced. No product row is reclassified here.
-- ============================================================================

DROP VIEW IF EXISTS public.item_classification_gaps;
CREATE VIEW public.item_classification_gaps
  WITH (security_invoker = true) AS
SELECT p.id,
       p.sku,
       p.name_ar,
       p.item_nature,
       p.item_class,
       p.inventory_policy,
       CASE
         -- Highest priority: an item the backfill could not identify at all.
         WHEN p.sku IS NULL OR btrim(p.sku) = ''
              THEN 'بلا رمز صنف — التصنيف الخماسي غير مُتحقَّق منه (نخالة أم دقيق؟) يحتاج تأكيداً يدوياً'
         WHEN p.item_nature = 'SERVICE'
              THEN 'nature: service, class must be SERVICE'
         WHEN p.inventory_policy = 'CUSTOMER_OWNED'
              THEN 'policy: customer owned, class must be NON_STOCK_ITEM'
         WHEN p.inventory_policy = 'UNTRACKED'
              THEN 'policy: untracked, class must be SERVICE or NON_STOCK_ITEM'
         WHEN p.sku LIKE 'RM-%'
              THEN 'sku: raw material prefix, class should be RAW_MATERIAL'
         WHEN p.sku = 'FG-BRAN-40'
              THEN 'catalogue: bran is a by-product'
         ELSE 'unclassified GOOD+TRACKED item'
       END AS reason
  FROM public.products p
 WHERE p.is_active
   AND (
        p.item_class IS NULL
     OR (p.sku IS NULL OR btrim(p.sku) = '')
     OR (p.item_nature = 'SERVICE'                        AND p.item_class <> 'SERVICE')
     OR (p.inventory_policy = 'CUSTOMER_OWNED'            AND p.item_class <> 'NON_STOCK_ITEM')
     OR (p.inventory_policy = 'UNTRACKED' AND p.item_nature = 'GOOD' AND p.item_class <> 'NON_STOCK_ITEM')
     OR (p.sku LIKE 'RM-%'                                AND p.item_class <> 'RAW_MATERIAL')
     OR (p.sku = 'FG-BRAN-40'                             AND p.item_class <> 'BY_PRODUCT')
   );

COMMENT ON VIEW public.item_classification_gaps IS
  'أصناف لا يتطابق تصنيفها الخماسي مع طبيعتها وسياستها، بما فيها الأصناف القديمة التي بلا رمز '
  'والتي استُنتج تصنيفها دون دليل. يجب أن تكون النتيجة صفراً قبل الاعتماد على محرك التكلفة.';

REVOKE ALL ON public.item_classification_gaps FROM anon;
GRANT SELECT ON public.item_classification_gaps TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.item_classification_gaps;