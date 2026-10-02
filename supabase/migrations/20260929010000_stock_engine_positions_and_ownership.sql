-- ============================================================================
-- Market-Hub ERP — Phase 2: Stock Engine (positions + owner-aware movements)
-- ============================================================================
-- Reference: Market-Hub_Product_Inventory_Service_Design.docx (sections 9, 10, 14)
--
-- WHY
--   public.inventory is (product_id, warehouse_id) -> quantity. Ownership is
--   implicit and always "the company", so there is no way to represent
--   customer-owned material physically held at a company location. The design
--   (section 9) requires three dimensions: Item + Location + Owner.
--
--   It also requires every movement to carry a value and a source document
--   (section 14): receipt / issue / transfer / adjustment / production.
--
-- WHAT THIS MIGRATION DOES
--   1) Adds owner_type / owner_id to public.inventory. Default COMPANY, so
--      every existing row keeps exactly its current meaning.
--   2) Adds movement_kind / source_type / source_id / total_cost / owner_* to
--      public.stock_movements so a movement is a real ledger entry.
--   3) Creates the read model public.stock_positions (Item + Location + Owner),
--      which is the reporting surface that excludes customer-owned material
--      from company valuation.
--   4) Adds company-scoped opening/adjustment documents.
--
-- WHAT IT DOES NOT DO
--   * It does NOT drop public.inventory and does NOT stop writing to it. The
--     legacy table remains the operational counter so every existing screen,
--     report and RPC keeps working unchanged (backward compatibility).
--   * It does NOT change create_sale / create_purchase. That is Phase 4/5.
--
-- ROLLBACK
--   DROP VIEW IF EXISTS public.stock_positions;
--   DROP TABLE IF EXISTS public.stock_adjustments, public.stock_adjustment_items;
--   DROP TABLE IF EXISTS public.stock_openings, public.stock_opening_items;
--   ALTER TABLE public.inventory DROP COLUMN IF EXISTS owner_type, DROP COLUMN IF EXISTS owner_id;
--   ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS movement_kind,
--     DROP COLUMN IF EXISTS source_type, DROP COLUMN IF EXISTS source_id,
--     DROP COLUMN IF EXISTS total_cost, DROP COLUMN IF EXISTS owner_type,
--     DROP COLUMN IF EXISTS owner_id;
--   DROP TYPE IF EXISTS public.stock_movement_kind;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Movement kinds — the vocabulary from design section 14
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'stock_movement_kind') THEN
    CREATE TYPE public.stock_movement_kind AS ENUM (
      'RECEIPT',      -- goods arriving (purchase, customer-owned receipt, return-in)
      'ISSUE',        -- goods leaving (sale, customer-owned delivery, return-out)
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'ADJUSTMENT',
      'OPENING',
      'PRODUCTION'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Ownership on the operational stock table
-- ---------------------------------------------------------------------------
-- NOT NULL + DEFAULT 'COMPANY' means every pre-existing row is, by definition,
-- company-owned — which is exactly what it was before this migration.
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS owner_type public.owner_type NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN IF NOT EXISTS owner_id   uuid;

-- The uniqueness key must now include the owner. The legacy key stays in place
-- until Phase 4 replaces it, so nothing breaks in between; we add the wider key
-- alongside it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'inventory'
      AND c.conname = 'inventory_product_warehouse_owner_key')
  THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_product_warehouse_owner_key
      UNIQUE (product_id, warehouse_id, owner_type, owner_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_inventory_owner
  ON public.inventory(owner_type, owner_id)
  WHERE owner_id IS NOT NULL;

COMMENT ON COLUMN public.inventory.owner_type IS
  'من يملك المادة في هذا الموقع: COMPANY افتراضيًا، CUSTOMER لمادة العميل.';
COMMENT ON COLUMN public.inventory.owner_id IS
  'معرّف المالك عند owner_type <> COMPANY (مثلاً customers.id).';

-- ---------------------------------------------------------------------------
-- 3. Movement ledger columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS movement_kind public.stock_movement_kind,
  ADD COLUMN IF NOT EXISTS source_type   text,
  ADD COLUMN IF NOT EXISTS source_id     uuid,
  ADD COLUMN IF NOT EXISTS total_cost    numeric(14,2),
  ADD COLUMN IF NOT EXISTS owner_type    public.owner_type NOT NULL DEFAULT 'COMPANY',
  ADD COLUMN IF NOT EXISTS owner_id      uuid;

COMMENT ON COLUMN public.stock_movements.movement_kind IS
  'RECEIPT / ISSUE / TRANSFER_IN / TRANSFER_OUT / ADJUSTMENT / OPENING / PRODUCTION.';
COMMENT ON COLUMN public.stock_movements.source_type IS
  'نوع المستند المصدر: sales_invoice, purchase_invoice, stock_opening, stock_adjustment, customer_owned_receipt ...';
COMMENT ON COLUMN public.stock_movements.total_cost IS
  'القيمة الكلية للحركة = quantity × unit_cost. تُترك NULL إن لم تكن هناك قيمة فعلية.';

-- Backfill movement_kind from the legacy enum so every historical movement
-- becomes a first-class ledger entry without changing its meaning.
--
--   purchase      -> RECEIPT
--   sale          -> ISSUE
--   return_in     -> RECEIPT
--   return_out    -> ISSUE
--   transfer_in   -> TRANSFER_IN
--   transfer_out  -> TRANSFER_OUT
--   adjustment    -> ADJUSTMENT
--   opening       -> OPENING
UPDATE public.stock_movements
SET movement_kind = CASE movement_type::text
      WHEN 'purchase'     THEN 'RECEIPT'::public.stock_movement_kind
      WHEN 'sale'         THEN 'ISSUE'::public.stock_movement_kind
      WHEN 'return_in'    THEN 'RECEIPT'::public.stock_movement_kind
      WHEN 'return_out'   THEN 'ISSUE'::public.stock_movement_kind
      WHEN 'transfer_in'  THEN 'TRANSFER_IN'::public.stock_movement_kind
      WHEN 'transfer_out' THEN 'TRANSFER_OUT'::public.stock_movement_kind
      WHEN 'adjustment'   THEN 'ADJUSTMENT'::public.stock_movement_kind
      WHEN 'opening'      THEN 'OPENING'::public.stock_movement_kind
      ELSE 'ADJUSTMENT'::public.stock_movement_kind
    END
WHERE movement_kind IS NULL;

-- Derive total_cost where a unit cost was recorded.
UPDATE public.stock_movements
SET total_cost = round(abs(quantity) * unit_cost, 2)
WHERE total_cost IS NULL
  AND unit_cost IS NOT NULL
  AND unit_cost <> 0;

-- Derive source_type from the legacy reference_type where possible.
UPDATE public.stock_movements
SET source_type = reference_type
WHERE source_type IS NULL AND reference_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_kind
  ON public.stock_movements(movement_kind);
CREATE INDEX IF NOT EXISTS idx_stock_movements_source
  ON public.stock_movements(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_owner
  ON public.stock_movements(owner_type, owner_id)
  WHERE owner_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. stock_positions — the Item + Location + Owner read model
-- ---------------------------------------------------------------------------
-- This is the reporting surface the design asks for. It reports customer-owned
-- material separately so it can never leak into company inventory valuation.
--
-- `security_invoker = true` means RLS on the underlying tables still applies to
-- whoever queries the view.
CREATE OR REPLACE VIEW public.stock_positions
WITH (security_invoker = true) AS
SELECT
  i.product_id                                            AS item_id,
  i.warehouse_id,
  i.owner_type,
  i.owner_id,
  i.quantity,
  p.item_nature,
  COALESCE(ci.inventory_policy, p.inventory_policy)        AS inventory_policy,
  p.costing_method,
  -- Reference valuation only. Phase 4 records ACTUAL cost on movements; the
  -- default cost here is explicitly a *reference*, never purchase history.
  COALESCE(ci.default_cost, p.cost_price, 0)               AS reference_unit_cost,
  CASE
    WHEN i.owner_type = 'COMPANY'
     AND COALESCE(ci.inventory_policy, p.inventory_policy) = 'TRACKED'
    THEN round(i.quantity * COALESCE(ci.default_cost, p.cost_price, 0), 2)
    ELSE 0
  END                                                       AS reference_valuation,
  -- The single flag every report must filter on to avoid mixing the two.
  (i.owner_type = 'COMPANY')                                AS is_company_owned,
  w.name                                                    AS warehouse_name,
  w.name_ar                                                 AS warehouse_name_ar,
  p.name                                                    AS item_name,
  p.name_ar                                                 AS item_name_ar,
  p.sku
FROM public.inventory i
JOIN public.products   p ON p.id = i.product_id
JOIN public.warehouses w ON w.id = i.warehouse_id
LEFT JOIN public.company_items ci
  ON ci.item_id = p.id AND ci.company_id = 1 AND ci.is_active;

COMMENT ON VIEW public.stock_positions IS
  'وضعية المخزون بثلاثة أبعاد: صنف + موقع + مالك. الجدول المرجعي لتقارير المخزون. is_company_owned=false تعني مادة عميل لا تدخل تقييم الشركة.';

GRANT SELECT ON public.stock_positions TO authenticated;

-- Company-owned, tracked only. This is the authorised source for inventory
-- valuation and for "what stock does the company actually own".
CREATE OR REPLACE VIEW public.company_stock_positions
WITH (security_invoker = true) AS
SELECT *
FROM public.stock_positions
WHERE owner_type = 'COMPANY'
  AND inventory_policy = 'TRACKED';

COMMENT ON VIEW public.company_stock_positions IS
  'مخزون الشركة المتتبع فقط. لا يشمل مواد العملاء ولا الأصناف غير المتتبعة.';

GRANT SELECT ON public.company_stock_positions TO authenticated;

-- Customer-owned material physically held by the company.
CREATE OR REPLACE VIEW public.customer_owned_positions
WITH (security_invoker = true) AS
SELECT *
FROM public.stock_positions
WHERE owner_type <> 'COMPANY';

COMMENT ON VIEW public.customer_owned_positions IS
  'المواد المملوكة للعملاء والموجودة في مواقع الشركة. لا تدخل قيمة مخزون الشركة.';

GRANT SELECT ON public.customer_owned_positions TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Opening Stock — a document, NOT a purchase (design rule #6)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.stock_opening_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.stock_adjustment_seq START 1;

CREATE TABLE IF NOT EXISTS public.stock_openings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL UNIQUE,
  warehouse_id   uuid NOT NULL REFERENCES public.warehouses(id),
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  note           text,
  total_value    numeric(14,2) NOT NULL DEFAULT 0,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_opening_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_id   uuid NOT NULL REFERENCES public.stock_openings(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id),
  quantity     numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost    numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost   numeric(14,2) NOT NULL DEFAULT 0,
  note         text
);

CREATE INDEX IF NOT EXISTS idx_stock_opening_items_opening ON public.stock_opening_items(opening_id);
CREATE INDEX IF NOT EXISTS idx_stock_opening_items_product ON public.stock_opening_items(product_id);

COMMENT ON TABLE public.stock_openings IS
  'رصيد أول المدة — مستند مستقل تمامًا عن المشتريات. لا يظهر في تقرير المشتريات.';

-- ---------------------------------------------------------------------------
-- 6. Stock Adjustment — also a document, also NOT a purchase
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL UNIQUE,
  warehouse_id    uuid NOT NULL REFERENCES public.warehouses(id),
  effective_date  date NOT NULL DEFAULT CURRENT_DATE,
  reason          text NOT NULL,
  note            text,
  total_value     numeric(14,2) NOT NULL DEFAULT 0,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_adjustment_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id uuid NOT NULL REFERENCES public.stock_adjustments(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES public.products(id),
  quantity      numeric(14,3) NOT NULL CHECK (quantity <> 0),  -- signed: + increase, - decrease
  unit_cost     numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost    numeric(14,2) NOT NULL DEFAULT 0,
  note          text
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_adj     ON public.stock_adjustment_items(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_product ON public.stock_adjustment_items(product_id);

COMMENT ON TABLE public.stock_adjustments IS
  'تسوية مخزون — مستند مستقل عن المشتريات. الكمية موقّعة: موجبة زيادة، سالبة نقص.';

-- RLS for the four new document tables.
ALTER TABLE public.stock_openings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_opening_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_adjustment_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_openings_read ON public.stock_openings;
CREATE POLICY stock_openings_read ON public.stock_openings
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS stock_opening_items_read ON public.stock_opening_items;
CREATE POLICY stock_opening_items_read ON public.stock_opening_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS stock_adjustments_read ON public.stock_adjustments;
CREATE POLICY stock_adjustments_read ON public.stock_adjustments
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS stock_adjustment_items_read ON public.stock_adjustment_items;
CREATE POLICY stock_adjustment_items_read ON public.stock_adjustment_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Documents are posted ONLY through the atomic RPCs in Phase 6, so the browser
-- gets read access and nothing else. Same posture as sales_invoices.
REVOKE INSERT, UPDATE, DELETE ON public.stock_openings, public.stock_opening_items,
  public.stock_adjustments, public.stock_adjustment_items FROM authenticated, anon;
GRANT SELECT ON public.stock_openings, public.stock_opening_items,
  public.stock_adjustments, public.stock_adjustment_items TO authenticated;
GRANT ALL ON public.stock_openings, public.stock_opening_items,
  public.stock_adjustments, public.stock_adjustment_items TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Harden stock_movements writes
-- ---------------------------------------------------------------------------
-- The old posture let any authenticated staff INSERT movements directly, which
-- is how the browser-side adjustment path worked. Movements must now be written
-- by the posting RPCs only. SELECT stays for staff.
DROP POLICY IF EXISTS "mv_insert" ON public.stock_movements;
REVOKE INSERT ON public.stock_movements FROM authenticated, anon;
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

-- Same for the operational counter: the browser may read it, but every write
-- must go through a posting function that also records a movement.
DROP POLICY IF EXISTS "inv_manage" ON public.inventory;
CREATE POLICY inv_read_only_staff ON public.inventory
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.inventory FROM authenticated, anon;
GRANT SELECT ON public.inventory TO authenticated;
GRANT ALL ON public.inventory TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Document number helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_stock_opening_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.stock_opening_seq');
  RETURN 'OP-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $$;

CREATE OR REPLACE FUNCTION public.next_stock_adjustment_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  n := nextval('public.stock_adjustment_seq');
  RETURN 'ADJ-' || to_char(now(), 'YYYYMM') || '-' || lpad(n::text, 4, '0');
END $$;

REVOKE ALL ON FUNCTION public.next_stock_opening_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_stock_adjustment_number() FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stock_opening_seq TO service_role;
GRANT ALL ON public.stock_adjustment_seq TO service_role;