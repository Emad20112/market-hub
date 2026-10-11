-- ============================================================================
-- Market-Hub ERP — Phase 11: Reporting separation and honest costing
-- ============================================================================
-- Reference: Market-Hub_Product_Inventory_Service_Design.docx
--   section 11 (Reference cost vs Standard cost vs Actual cost)
--   section 17 (which report may include what)
--   section 18 (rule 7: product cost is not purchase history;
--               rule 9: reports must key off movement/line type, not names)
--
-- THE PROBLEM THIS REPLACES
--   Four financial reports computed margin as
--       sum(sales_invoice_items.quantity * products.cost_price)
--   That treats a *reference* estimate typed into the catalogue as the actual
--   cost of goods sold — the exact error design section 11 forbids. It also
--   silently included service lines, whose cost_price is meaningless, and it
--   gave every report the same number regardless of what actually happened.
--
-- WHAT THIS MIGRATION ADDS
--   1. A per-line cost resolver that prefers the REAL cost recorded on the
--      stock movement, and falls back to an explicit costing method.
--   2. A sales register that carries line_type, so reports can separate
--      stocked goods, untracked goods, services and ad-hoc services.
--   3. A service revenue view.
--   4. A purchase register that is built ONLY from purchase documents, so
--      opening stock and adjustments can never leak into it.
--
-- Everything here is read-only. No table is altered, no row is written.
--
-- ROLLBACK
--   DROP VIEW IF EXISTS public.purchase_register, public.service_revenue, public.sales_register;
--   DROP FUNCTION IF EXISTS public.sales_line_cost(uuid, uuid, numeric, text);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-line cost resolution (design section 11)
-- ---------------------------------------------------------------------------
-- Returns the cost basis for one sold line, in priority order:
--
--   a) The unit_cost actually recorded on the ISSUE movement for that line.
--      This is the real, transacted cost — the only number that is a fact.
--   b) For a STANDARD-cost item, the item's declared reference cost, because
--      the business has explicitly said "value it this way".
--   c) NULL. We do NOT silently substitute a guess. A null cost is reported as
--      "cost not available" so a margin is never invented.
--
-- A service has no inventory cost by definition, so it returns 0 — its margin
-- is its full price minus any directly attributable expense, and pretending it
-- has a goods cost would understate it.
CREATE OR REPLACE FUNCTION public.sales_line_cost(
  p_item_id uuid,
  p_invoice_id uuid,
  p_quantity numeric,
  p_line_type text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_cost numeric;
  v_costing       public.costing_method;
  v_reference     numeric;
BEGIN
  -- A service line carries no inventory cost. That is not a missing value.
  IF p_item_id IS NULL OR p_line_type IN ('SERVICE', 'AD_HOC_SERVICE') THEN
    RETURN 0;
  END IF;

  -- (a) The real cost of what actually left the warehouse for this invoice.
  SELECT m.unit_cost
    INTO v_movement_cost
  FROM public.stock_movements m
  WHERE m.product_id = p_item_id
    AND m.reference_id = p_invoice_id
    AND m.reference_type = 'sales_invoice'
    AND m.movement_kind = 'ISSUE'
    AND m.unit_cost IS NOT NULL
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF v_movement_cost IS NOT NULL THEN
    RETURN round(coalesce(p_quantity, 0) * v_movement_cost, 2);
  END IF;

  -- (b) No movement cost. Only a declared STANDARD cost is a legitimate
  -- fallback, because the business chose that policy explicitly.
  SELECT COALESCE(ci.costing_method, p.costing_method),
         COALESCE(ci.default_cost, p.cost_price)
    INTO v_costing, v_reference
  FROM public.products p
  LEFT JOIN public.company_items ci
    ON ci.item_id = p.id AND ci.company_id = 1 AND ci.is_active
  WHERE p.id = p_item_id;

  IF v_costing = 'STANDARD' AND v_reference IS NOT NULL THEN
    RETURN round(coalesce(p_quantity, 0) * v_reference, 2);
  END IF;

  -- (c) Unknown. Deliberately NULL, never a guess.
  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.sales_line_cost(uuid, uuid, numeric, text) IS
  'تكلفة السطر الفعلية: من حركة المخزون الحقيقية، ثم التكلفة القياسية إن كانت السياسة STANDARD، وإلا NULL بلا تخمين. الخدمات تكلفتها صفر.';

REVOKE ALL ON FUNCTION public.sales_line_cost(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_line_cost(uuid, uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sales register — one row per line, with its type and honest cost
-- ---------------------------------------------------------------------------
-- Historical lines written before the item model have line_type = NULL. They
-- are resolved from the item's *current* policy when possible, and reported as
-- NULL when the item is gone — never invented.
CREATE OR REPLACE VIEW public.sales_register
WITH (security_invoker = true) AS
SELECT
  i.id                          AS invoice_item_id,
  i.invoice_id,
  s.invoice_number,
  s.created_at,
  s.customer_id,
  s.status,
  s.payment_method,

  i.product_id,
  i.description,
  p.name                        AS item_name,
  p.name_ar                     AS item_name_ar,
  p.sku,

  i.quantity,
  i.unit_price,
  i.discount,
  i.tax,
  i.total,

  -- The recorded type wins. A legacy NULL is resolved from today's policy.
  COALESCE(
    i.line_type,
    CASE
      WHEN i.product_id IS NULL THEN 'AD_HOC_SERVICE'
      ELSE public.item_line_type(i.product_id, false)
    END
  )                               AS line_type,

  COALESCE(i.stock_effect, 'NONE') AS stock_effect,
  i.uom_id,

  public.sales_line_cost(i.product_id, i.invoice_id, i.quantity, i.line_type) AS line_cost
FROM public.sales_invoice_items i
JOIN public.sales_invoices s ON s.id = i.invoice_id
LEFT JOIN public.products p ON p.id = i.product_id;

COMMENT ON VIEW public.sales_register IS
  'سجل المبيعات الموحد: كل سطر بنوعه (سلعة مخزنية/غير متتبعة/خدمة/خدمة مخصصة) وتكلفته الفعلية أو NULL. جدول التقارير الصحيح بدل تجميع كل شيء كمخزون.';

GRANT SELECT ON public.sales_register TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Service revenue — separate from goods revenue, by definition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.service_revenue
WITH (security_invoker = true) AS
SELECT
  r.invoice_id,
  r.invoice_number,
  r.created_at,
  r.customer_id,
  r.line_type,
  r.description,
  r.quantity,
  r.unit_price,
  r.total,
  -- A service never touches company inventory. Stated explicitly so a report
  -- cannot accidentally include it in stock movement.
  false AS affects_inventory
FROM public.sales_register r
WHERE r.line_type IN ('SERVICE', 'AD_HOC_SERVICE')
  AND r.status NOT IN ('draft', 'cancelled', 'returned');

COMMENT ON VIEW public.service_revenue IS
  'إيرادات الخدمات (Service و Ad-hoc Service) منفصلة عن إيرادات السلع، وبلا أي أثر على مخزون الشركة.';

GRANT SELECT ON public.service_revenue TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Purchase register — purchases only, never opening or adjustment
-- ---------------------------------------------------------------------------
-- This view exists so no report author has to remember the exclusion. It is
-- built from purchase documents. Opening stock and adjustments live in their
-- own tables and are simply not reachable from here.
CREATE OR REPLACE VIEW public.purchase_register
WITH (security_invoker = true) AS
SELECT
  i.id                          AS purchase_item_id,
  i.invoice_id,
  s.invoice_number,
  s.created_at,
  s.supplier_id,
  s.status,

  i.product_id,
  p.name                        AS item_name,
  p.name_ar                     AS item_name_ar,
  p.sku,

  i.quantity,
  i.unit_cost,
  i.discount,
  i.tax,
  i.total,

  COALESCE(
    i.line_type,
    CASE
      WHEN i.product_id IS NULL THEN 'AD_HOC_SERVICE'
      ELSE public.item_line_type(i.product_id, false)
    END
  )                               AS line_type,

  COALESCE(i.stock_effect, 'NONE') AS stock_effect,
  -- Only a tracked receipt is a stock increase. A service or an untracked good
  -- bought from a supplier is an expense, not inventory.
  (COALESCE(i.stock_effect, 'NONE') = 'STOCK_RECEIPT') AS increases_inventory
FROM public.purchase_invoice_items i
JOIN public.purchase_invoices s ON s.id = i.invoice_id
LEFT JOIN public.products p ON p.id = i.product_id;

COMMENT ON VIEW public.purchase_register IS
  'سجل المشتريات الفعلية فقط. لا يشمل رصيد أول المدة ولا تسويات المخزون لأنهما مستندان مستقلان.';

GRANT SELECT ON public.purchase_register TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Inventory valuation report — the authorised number
-- ---------------------------------------------------------------------------
-- Company-owned, tracked, non-zero positions only. Customer-owned material is
-- excluded by construction. The valuation is labelled as reference-based unless
-- the item's costing method is STANDARD, so nobody reads an estimate as a fact.
CREATE OR REPLACE VIEW public.inventory_valuation
WITH (security_invoker = true) AS
SELECT
  p.item_id,
  p.item_name,
  p.item_name_ar,
  p.sku,
  p.warehouse_id,
  p.warehouse_name,
  p.warehouse_name_ar,
  p.quantity,
  p.costing_method,
  p.reference_unit_cost,
  p.reference_valuation,
  -- True when the figure is a policy figure rather than a transacted one.
  (p.costing_method <> 'STANDARD') AS valuation_is_reference_based
FROM public.company_stock_positions p
WHERE p.quantity <> 0;

COMMENT ON VIEW public.inventory_valuation IS
  'تقييم مخزون الشركة: الأصناف المتتبعة المملوكة للشركة فقط. valuation_is_reference_based يوضح أن الرقم مرجعي وليس تكلفة فعلية.';

GRANT SELECT ON public.inventory_valuation TO authenticated;