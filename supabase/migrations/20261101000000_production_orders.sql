-- ============================================================================
-- 20261101000000_production_orders.sql
--
-- THE MILL'S OWN PRODUCTION CYCLE
-- -------------------------------
-- The milling module so far only covers milling OTHER PEOPLE'S grain: it is
-- correctly a zero-stock service. Nothing in the system could take the mill's
-- OWN wheat, grind it, record the bran, log the loss, and put flour and bran
-- into stock. The catalogue had FG-* and RM-* items classified GOOD+TRACKED,
-- but nothing ever moved them.
--
-- This adds that cycle as a separate track with its own documents, its own
-- ownership and its own reports - deliberately NOT reusing milling_jobs, whose
-- entire design is custody-with-zero-impact.
--
-- COSTING, and the one real accounting decision
-- ---------------------------------------------
-- A mill produces a primary output (flour) and a by-product (bran) from the
-- SAME input. Their joint cost cannot be split from the data alone: allocating
-- all of it to flour overstates flour and understates bran; allocating by
-- weight does the same. The two defensible methods are:
--
--   NET REALISABLE VALUE - each output is credited at what it can fetch, and
--                           the primary absorbs the remainder. Economically
--                           honest, and it needs a realisable price for bran.
--   RELATIVE SALES VALUE - split in proportion to selling price. Simple, but
--                           it needs a price for both outputs.
--
-- Neither can be assumed, so the allocation basis is an explicit input on each
-- order and is recorded on the order. The default is REMAINDER_TO_PRIMARY,
-- which is the conservative choice: bran carries no cost of its own and the
-- flour line absorbs the whole production cost. That is never silently
-- optimal - it is visible on the order and in the reports.
--
-- PLANNED vs ACTUAL
-- -----------------
-- A production order carries both. Planned quantities come from the BOM when
-- one exists, or from what the operator types. Actual quantities are what was
-- really issued, produced and lost. The two are reported side by side so an
-- extraction rate can be compared with the plan, and no fixed yield is ever
-- imposed - the BOM is a plan, not a rule.
--
-- NO GENERAL LEDGER IN THIS SCHEMA
-- -------------------------------
-- There is no chart of accounts and no journal-entry table; the only ledgers
-- are customer_ledger and the stock/cost movements. Production therefore
-- posts to those, which is where the inventory and cost facts actually live,
-- and writes an audit row. It does not invent accounting entries that have no
-- home. Adding a GL remains an open decision recorded in the gap matrix.
--
-- NON-DESTRUCTIVE: new tables and new functions only. No existing milling,
-- stock, invoice or ledger record is read for anything but reference, and
-- nothing is rewritten.
-- ============================================================================

-- ── 1. BOM: the recipe, as a plan rather than a rule ────────────────────────

CREATE TABLE IF NOT EXISTS public.production_boms (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name_ar        text NOT NULL,
  -- The batch this recipe describes, e.g. 1 ton of hard wheat into flour.
  output_qty     numeric(18,3) NOT NULL CHECK (output_qty > 0),
  output_unit    text NOT NULL DEFAULT 'KG',
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, name_ar)
);

COMMENT ON TABLE public.production_boms IS
  'وصفة الإنتاج: مدخلات ومخرجات متوقعة لأمر واحد. خطة لا قاعدة — النسب الفعلية تسجَّل في الأمر ولا تفرض.';

CREATE TABLE IF NOT EXISTS public.production_bom_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id         uuid NOT NULL REFERENCES public.production_boms(id) ON DELETE CASCADE,
  -- NULL product = a plan line that is a loss or yield adjustment rather than
  -- a physical input.
  product_id     uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  line_role      text NOT NULL DEFAULT 'INPUT'
    CHECK (line_role IN ('INPUT','OUTPUT','BY_PRODUCT','LOSS')),
  qty            numeric(18,3) NOT NULL CHECK (qty > 0),
  unit           text NOT NULL DEFAULT 'KG',
  loss_reason    text,
  notes          text,
  UNIQUE (bom_id, product_id, line_role)
);

COMMENT ON COLUMN public.production_bom_lines.line_role IS
  'INPUT مادة مستهلكة · OUTPUT ناتج أساسي · BY_PRODUCT ناتج جانبي · LOSS فاقد متوقع.';

-- ── 2. the order and its lines ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.production_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number      text NOT NULL UNIQUE,
  warehouse_id      uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  bom_id            uuid REFERENCES public.production_boms(id) ON DELETE SET NULL,
  production_date   date NOT NULL DEFAULT CURRENT_DATE,
  status            text NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED','ISSUED','COMPLETED','CANCELLED')),

  -- What the order set out to do.
  planned_input_qty   numeric(18,3) NOT NULL DEFAULT 0,
  planned_output_qty  numeric(18,3) NOT NULL DEFAULT 0,
  planned_yield_pct   numeric(7,3),

  -- What actually happened.
  actual_input_qty    numeric(18,3) NOT NULL DEFAULT 0,
  actual_output_qty   numeric(18,3) NOT NULL DEFAULT 0,
  actual_yield_pct    numeric(7,3),

  -- Cost, kept on the order so a completed production can be explained.
  material_cost     numeric(18,2) NOT NULL DEFAULT 0,
  direct_labour     numeric(18,2) NOT NULL DEFAULT 0,
  overhead_cost     numeric(18,2) NOT NULL DEFAULT 0,
  total_cost        numeric(18,2) NOT NULL DEFAULT 0,
  costing_method    public.costing_method NOT NULL DEFAULT 'MOVING_AVERAGE',
  allocation_basis  text NOT NULL DEFAULT 'REMAINDER_TO_PRIMARY'
    CHECK (allocation_basis IN ('REMAINDER_TO_PRIMARY','NET_REALISABLE_VALUE','RELATIVE_SALES_VALUE')),

  -- Material consumption
  created_by       uuid REFERENCES auth.users(id),
  completed_by     uuid REFERENCES auth.users(id),
  completed_at     timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- A completed order must have costed out before it can read as finished.
  CONSTRAINT production_orders_completed_has_cost
    CHECK (status <> 'COMPLETED' OR total_cost > 0)
);

COMMENT ON COLUMN public.production_orders.allocation_basis IS
  'أساس توزيع التكلفة المشتركة على الناتج الأساسي والجانبي. مسجَّل على كل أمر ولا يُفترض.';

CREATE TABLE IF NOT EXISTS public.production_order_materials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  planned_qty    numeric(18,3) NOT NULL DEFAULT 0,
  actual_qty     numeric(18,3) NOT NULL DEFAULT 0,
  unit_cost      numeric(18,4) NOT NULL DEFAULT 0,
  total_cost     numeric(18,2) NOT NULL DEFAULT 0,
  movement_id    uuid,
  UNIQUE (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.production_order_outputs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  -- A by-product is credited at its own value under NRV; under the default
  -- basis it carries no cost and the primary absorbs the total.
  output_role    text NOT NULL DEFAULT 'PRIMARY'
    CHECK (output_role IN ('PRIMARY','BY_PRODUCT')),
  planned_qty    numeric(18,3) NOT NULL DEFAULT 0,
  actual_qty     numeric(18,3) NOT NULL DEFAULT 0,
  unit_cost      numeric(18,4) NOT NULL DEFAULT 0,
  total_cost     numeric(18,2) NOT NULL DEFAULT 0,
  movement_id    uuid,
  UNIQUE (order_id, product_id, output_role)
);

CREATE TABLE IF NOT EXISTS public.production_order_losses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  -- Losses are attributed to a reason, because unexplained shrinkage cannot be
  -- argued with and cannot be improved.
  reason         text NOT NULL,
  qty            numeric(18,3) NOT NULL CHECK (qty > 0),
  unit           text NOT NULL DEFAULT 'KG',
  value          numeric(18,2) NOT NULL DEFAULT 0,
  notes          text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.production_order_losses IS
  'فاقد الإنتاج بسبب وتصديق. الفرق بين الداخل والخارج لا يختفي أبداً.';

-- ── 3. indexes and RLS ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ix_production_orders_date
  ON public.production_orders (warehouse_id, production_date DESC);
CREATE INDEX IF NOT EXISTS ix_production_orders_status
  ON public.production_orders (status);
CREATE INDEX IF NOT EXISTS ix_prod_outputs_product
  ON public.production_order_outputs (product_id);

ALTER TABLE public.production_boms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_bom_lines      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_outputs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_losses   ENABLE ROW LEVEL SECURITY;

-- Reads: mill staff. Writes: only the engine's SECURITY DEFINER functions,
-- which are the thing being audited, so no table-level write policy exists.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['production_boms','production_bom_lines','production_orders',
                           'production_order_materials','production_order_outputs',
                           'production_order_losses']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))',
      t || '_read', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, service_role', t);
  END LOOP;
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.production_order_losses;
-- DROP TABLE IF EXISTS public.production_order_outputs;
-- DROP TABLE IF EXISTS public.production_order_materials;
-- DROP TABLE IF EXISTS public.production_orders;
-- DROP TABLE IF EXISTS public.production_bom_lines;
-- DROP TABLE IF EXISTS public.production_boms;