-- ============================================================================
-- 20261104000000_milling_commercial_reports.sql
--
-- THE REPORTS THAT DECIDE WHETHER A NUMBER CAN BE TRUSTED
-- ---------------------------------------------------------
-- Two gaps remained in the milling reporting set. Everything about CUSTOMER
-- grain was reported (intake, jobs, output balances, revenue, efficiency),
-- and nothing about the mill's OWN grain. A mill that mills other people's
-- flour looks identical to one that sells its own, and only one of those two
-- makes money.
--
-- 1. milling_margin_report
--    Sales, cost, margin per item over a period - with the one distinction
--    that must never be blurred: whether the cost is ACTUAL (backed by a
--    valued movement) or REFERENCE (borrowed from the catalogue).
--
--    A margin computed from a catalogue price is not a margin. It is a guess
--    that looks like an accounting figure, and it is the number a mill owner
--    is most likely to trust and be wrong by. So the report states its basis
--    on every row, and refuses to present a mixed total as a single margin:
--    revenue from real sales is real, but adding a reference-cost margin to it
--    would give a total that is partly one thing and partly another.
--
--    cost_basis_mix is the flag for that. If any line is REFERENCE, the
--    reported margin is an estimate and is labelled as one.
--
-- 2. milling_inventory_report
--    The mill's own stock by classification - raw, finished, by-product,
--    packaging - valued through the cost engine. Customer custody is
--    deliberately absent: it is not the mill's stock and must never appear in
--    a mill valuation.
--
-- PERFORMANCE
-- -----------
-- item_valuation is the single read path for cost, and it aggregates a
-- product's positions before the report reads it. The margin report joins
-- per invoice LINE and resolves cost through a lateral, so one item appearing
-- on 40 lines costs one resolution, not 40.
--
-- NON-DESTRUCTIVE: two views. No table, document, movement or balance is
-- touched.
-- ============================================================================

-- sales_invoices has no invoice_date column; created_at is the document date.
-- The window is therefore "the last 365 days of documents", which is stated
-- here rather than presented as an accounting period it is not.

DROP VIEW IF EXISTS public.milling_margin_report;
CREATE VIEW public.milling_margin_report
  WITH (security_invoker = true) AS
WITH sold AS (
  SELECT it.product_id,
         sum(it.quantity)                          AS qty_sold,
         sum(it.total)                             AS revenue,
         count(DISTINCT si.id)                     AS invoice_count
    FROM public.sales_invoice_items it
    JOIN public.sales_invoices si ON si.id = it.invoice_id
   WHERE si.created_at::date BETWEEN current_date - 365 AND current_date
     -- only invoices that are a sale: a draft is an intention and a cancelled
     -- one is not a sale, and counting either would inflate revenue.
     AND si.status NOT IN ('draft', 'cancelled')
     -- only goods that actually left stock. The engine's vocabulary here is
     -- STOCK_ISSUE / STOCK_RECEIPT / NONE, not DECREASE. A service line is
     -- NONE and would otherwise drag the margin of goods down with a
     -- fabricated zero cost.
     AND it.stock_effect = 'STOCK_ISSUE'
   GROUP BY it.product_id
)
SELECT p.id AS product_id,
       p.sku,
       p.name_ar,
       p.item_class,
       coalesce(s.qty_sold, 0)                AS qty_sold,
       coalesce(s.revenue, 0)                  AS revenue,
       coalesce(s.invoice_count, 0)            AS invoice_count,
       -- Resolve cost ONCE per product, not once per report row.
       c.unit_cost,
       c.basis,
       round(coalesce(s.qty_sold, 0) * coalesce(c.unit_cost, 0), 2) AS cost_of_goods,
       round(coalesce(s.revenue, 0) - coalesce(s.qty_sold, 0) * coalesce(c.unit_cost, 0), 2) AS margin,
       CASE WHEN coalesce(s.revenue, 0) > 0
            THEN round((coalesce(s.revenue, 0) - coalesce(s.qty_sold,0) * coalesce(c.unit_cost,0))
                       * 100 / s.revenue, 2)
            END AS margin_pct,
       -- THE column. 'ACTUAL' means the cost came from a valued cost layer.
       -- 'REFERENCE' means it was borrowed from the catalogue and the margin
       -- above is an estimate, not a realised profit.
       --
       -- Whether a REPORT is partly reference-costed is a property of the
       -- whole result set, not of any one row, so it is left to the caller to
       -- derive from these rows rather than being faked here as a constant
       -- column that would repeat on every line.
       CASE WHEN c.basis = 'ACTUAL' THEN 'ACTUAL' ELSE 'REFERENCE' END AS cost_basis
  FROM sold s
  JOIN public.products p ON p.id = s.product_id
  LEFT JOIN LATERAL (
    -- Cost precedence matches the rest of the system: a valued layer average
    -- first, the catalogue only as a labelled fallback.
    --
    -- The first draft of this report read item_valuation.actual_unit_cost,
    -- which is derived from the quantity STILL ON THE SHELF. That is wrong for
    -- a margin report: the normal case for a margin line is that the stock was
    -- sold and is gone, so the figure came back zero, cost of goods came back
    -- zero, and margin came back equal to revenue - the most flattering number
    -- available, produced by a silent divide-by-zero. A cost layer is now read
    -- directly, and a zero layer is never presented as a real cost.
    SELECT coalesce(
             CASE WHEN l.quantity > 0
                  THEN round(l.total_value / l.quantity, 4) END,
             p.cost_price, 0) AS unit_cost,
           CASE WHEN l.quantity > 0 AND l.total_value > 0
                THEN 'ACTUAL' ELSE 'REFERENCE' END AS basis
      FROM (SELECT 1) x
      LEFT JOIN LATERAL (
        SELECT sum(quantity) AS quantity, sum(total_value) AS total_value
          FROM public.item_cost_layers cl
         WHERE cl.product_id = p.id
           AND cl.owner_type = 'COMPANY'::public.owner_type
      ) l ON true
  ) c ON true;

COMMENT ON VIEW public.milling_margin_report IS
  'مبيعات وتكلفة وهامش لكل صنف. cost_basis = ACTUAL يعني تكلفة فعلية من حركات مُقيَّمة، '
  'وREFERENCE يعني هامشاً تقديرياً مبنياً على سعر الكتالوج وليس ربحاً محققاً.';

DROP VIEW IF EXISTS public.milling_inventory_report;
CREATE VIEW public.milling_inventory_report
  WITH (security_invoker = true) AS
-- Mill stock only. owner_type = 'COMPANY' excludes customer custody, which is
-- held at the mill but is not the mill's, and must never be valued as if it
-- were. It is reported separately by milling_customer_custody.
SELECT p.item_class,
       p.id AS product_id,
       p.sku,
       p.name_ar,
       coalesce(i.warehouse_name_ar, '—') AS warehouse,
       coalesce(i.qty, 0)                   AS on_hand_qty,
       -- The unit is read from the units table via products.base_uom_id.
       -- There is no products.base_unit text column; the earlier draft assumed
       -- one and PostgreSQL correctly refused.
       coalesce(u.name_ar, '—')             AS unit,
       coalesce(v.actual_unit_cost, 0)      AS unit_cost,
       coalesce(i.qty, 0) * coalesce(v.actual_unit_cost, 0) AS valuation,
       coalesce(v.valuation_basis, 'REFERENCE_ONLY')       AS cost_basis
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT sp.warehouse_name_ar, sp.quantity AS qty
      FROM public.stock_positions sp
     WHERE sp.item_id = p.id AND sp.is_company_owned AND sp.quantity <> 0
     ORDER BY sp.warehouse_name_ar
  ) i ON true
  LEFT JOIN public.units u ON u.id = p.base_uom_id
  LEFT JOIN public.item_valuation v ON v.product_id = p.id
 WHERE p.item_class IN ('RAW_MATERIAL','FINISHED_GOOD','BY_PRODUCT','NON_STOCK_ITEM')
   AND p.is_active
   AND (coalesce(i.qty, 0) <> 0 OR coalesce(v.on_hand_qty, 0) <> 0);

COMMENT ON VIEW public.milling_inventory_report IS
  'مخزون المطحنة ملكها فقط، مصنّفاً (خام/نهائي/جانبي/غير مخزني) ومقيَّماً بطبقة التكلفة. '
  'أمانات العملاء ليست مخزون المطحنة ولا تظهر هنا أبداً.';

REVOKE ALL ON public.milling_margin_report, public.milling_inventory_report FROM anon;
GRANT SELECT ON public.milling_margin_report, public.milling_inventory_report
  TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.milling_inventory_report;
-- DROP VIEW IF EXISTS public.milling_margin_report;