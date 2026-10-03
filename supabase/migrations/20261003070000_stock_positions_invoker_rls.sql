-- ============================================================================
-- 20261003070000_stock_positions_invoker_rls.sql
--
-- THE DEFECT
-- ----------
-- `inventory` (the real balances table) has RLS enabled with an
-- `is_staff(auth.uid())` read policy, so an anonymous caller sees nothing.
-- `stock_positions` is a view over that same table — but it was created
-- WITHOUT `security_invoker`, which means PostgreSQL runs its query as the
-- view owner (`postgres`, a superuser). The RLS on `inventory` is therefore
-- never evaluated for anyone reading the view.
--
-- Verified on the linked database before this migration:
--
--     set local role anon;
--     select count(*) from stock_positions;   -- live rows come back
--
-- while the sibling views that were created with `security_invoker=true`
-- (milling_customer_custody, milling_revenue_report, ...) correctly return
-- zero rows to the same anonymous caller. The inventory view was the one
-- hole in an otherwise consistent hardening pass.
--
-- FIX
-- ---
-- 1. Recreate `stock_positions` with `security_invoker=true` so reads run
--    under the caller's identity and inherit `inventory`'s RLS. The view
--    definition is byte-for-byte the one already deployed, so no report or
--    screen changes shape.
-- 2. Drop the default Supabase grants to `anon` on the inventory spine. RLS
--    is the real gate, but an unauthenticated role holding INSERT/UPDATE/
--    DELETE on `stock_movements` and `inventory` is one policy mistake away
--    from a public write. Only `authenticated` and `service_role` need these.
--
-- NON-DESTRUCTIVE: view recreated with an identical body, privileges only.
-- No balance, movement, invoice or document is read, written or deleted.
-- ============================================================================

-- ── 1. recreate the view as invoker-secured ─────────────────────────────────
-- SECURITY INVOKER is the explicit default we want stated in the source, not
-- left to the default of whichever session created it.
CREATE OR REPLACE VIEW public.stock_positions
  WITH (security_invoker = true) AS
  SELECT i.product_id                                   AS item_id,
         i.warehouse_id,
         i.owner_type,
         i.owner_id,
         i.quantity,
         p.item_nature,
         COALESCE(ci.inventory_policy, p.inventory_policy) AS inventory_policy,
         p.costing_method,
         COALESCE(ci.default_cost, p.cost_price, 0::numeric) AS reference_unit_cost,
         CASE
           WHEN i.owner_type = 'COMPANY'::public.owner_type
                AND COALESCE(ci.inventory_policy, p.inventory_policy) = 'TRACKED'::public.inventory_policy
           THEN round(i.quantity * COALESCE(ci.default_cost, p.cost_price, 0::numeric), 2)
           ELSE 0::numeric
         END                                            AS reference_valuation,
         i.owner_type = 'COMPANY'::public.owner_type  AS is_company_owned,
         w.name                                        AS warehouse_name,
         w.name_ar                                     AS warehouse_name_ar,
         p.name                                        AS item_name,
         p.name_ar                                     AS item_name_ar,
         p.sku
  FROM public.inventory i
  JOIN public.products   p ON p.id = i.product_id
  JOIN public.warehouses w ON w.id = i.warehouse_id
  LEFT JOIN public.company_items ci
         ON ci.item_id = p.id AND ci.company_id = 1 AND ci.is_active;

COMMENT ON VIEW public.stock_positions IS
  'أرصدة المخزون حسب الصنف والمستودع والمالك. security_invoker: يخضع لسياسات RLS على inventory، فلا يقرأ زائر غير مسجل أي رصيد.';

-- ── 2. drop the default anon grants on the inventory spine ──────────────────
-- SELECT is revoked too: with RLS in place the view now inherits the staff
-- policy, so anon has no legitimate read path here.
REVOKE ALL ON TABLE public.inventory         FROM anon;
REVOKE ALL ON TABLE public.stock_movements   FROM anon;
REVOKE ALL ON TABLE public.stock_openings    FROM anon;
REVOKE ALL ON TABLE public.stock_opening_items  FROM anon;
REVOKE ALL ON TABLE public.stock_adjustments FROM anon;
REVOKE ALL ON TABLE public.stock_adjustment_items FROM anon;
REVOKE ALL ON TABLE public.stock_transfers   FROM anon;
REVOKE ALL ON TABLE public.stock_transfer_items FROM anon;
REVOKE ALL ON TABLE public.stock_positions   FROM anon;

-- staff reads continue through the existing policies; service_role bypasses RLS.
GRANT SELECT ON TABLE public.stock_positions TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- CREATE OR REPLACE VIEW public.stock_positions AS
--   SELECT ... ;                      -- same body, WITHOUT security_invoker
-- GRANT SELECT ON TABLE public.stock_positions TO anon, authenticated, service_role;
-- GRANT ALL ON TABLE public.inventory, public.stock_movements, public.stock_openings,
--   public.stock_opening_items, public.stock_adjustments,
--   public.stock_adjustment_items, public.stock_transfers,
--   public.stock_transfer_items TO anon;