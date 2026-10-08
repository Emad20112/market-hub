-- ============================================================================
-- Market-Hub ERP — Phase 1: Item Model (nature + inventory policy + commerce)
-- ============================================================================
-- Reference: Market-Hub_Product_Inventory_Service_Design.docx (sections 2, 4, 12)
--
-- WHY
--   Today public.products carries ONE flag, `is_service`, that is overloaded to
--   mean "do not move stock". The design document explicitly forbids this
--   (design rule #1 and #2): a physical good the business does not want to
--   track is GOOD + UNTRACKED, NOT a SERVICE. A SERVICE is a different kind of
--   work, not a way to switch inventory off.
--
-- WHAT THIS MIGRATION DOES
--   Purely additive. It adds the separated policy axes as real columns on
--   public.products and creates public.company_items for per-company overrides.
--   No column is dropped, no row is deleted, no existing value is overwritten
--   except the ONE deliberate, data-driven backfill described in step 4.
--
-- WHAT IT DOES NOT DO
--   * It does NOT remove `is_service` or `cost_price`. Those stay until the
--     application has fully migrated (Phase 17 backward compatibility).
--   * It does NOT create stock tables. That is Phase 2.
--   * It does NOT change create_sale / create_purchase. That is Phase 4/5.
--
-- ROLLBACK (safe, nothing referenced yet)
--   DROP TABLE IF EXISTS public.company_items;
--   DROP FUNCTION IF EXISTS public.tg_guard_item_policy_change();
--   DROP FUNCTION IF EXISTS public.item_stock_effect(uuid);
--   DROP FUNCTION IF EXISTS public.item_has_stock_history(uuid);
--   DROP FUNCTION IF EXISTS public.item_line_type(uuid, boolean);
--   ALTER TABLE public.products
--     DROP COLUMN IF EXISTS item_nature,
--     DROP COLUMN IF EXISTS inventory_policy,
--     DROP COLUMN IF EXISTS tracking,
--     DROP COLUMN IF EXISTS costing_method,
--     DROP COLUMN IF EXISTS is_sellable,
--     DROP COLUMN IF EXISTS is_purchasable,
--     DROP COLUMN IF EXISTS base_uom_id,
--     DROP COLUMN IF EXISTS sales_uom_id,
--     DROP COLUMN IF EXISTS purchase_uom_id,
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS uom_conversions;
--   DROP TYPE IF EXISTS public.item_nature;
--   DROP TYPE IF EXISTS public.inventory_policy;
--   DROP TYPE IF EXISTS public.item_tracking;
--   DROP TYPE IF EXISTS public.costing_method;
--   DROP TYPE IF EXISTS public.item_status;
--   DROP TYPE IF EXISTS public.owner_type;
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enumerations — the separated policy axes (design section 2)
-- ---------------------------------------------------------------------------
-- Each axis is independent on purpose. `Product Type` must never be the only
-- switch that decides how an item behaves.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'item_nature') THEN
    CREATE TYPE public.item_nature AS ENUM ('GOOD', 'SERVICE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'inventory_policy') THEN
    CREATE TYPE public.inventory_policy AS ENUM ('TRACKED', 'UNTRACKED', 'CUSTOMER_OWNED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'item_tracking') THEN
    CREATE TYPE public.item_tracking AS ENUM ('NONE', 'BATCH', 'SERIAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'costing_method') THEN
    CREATE TYPE public.costing_method AS ENUM ('MOVING_AVERAGE', 'FIFO', 'STANDARD', 'NONE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'item_status') THEN
    CREATE TYPE public.item_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'owner_type') THEN
    CREATE TYPE public.owner_type AS ENUM ('COMPANY', 'CUSTOMER', 'SUPPLIER', 'OTHER');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Item policy columns on public.products
-- ---------------------------------------------------------------------------
-- Defaults are chosen so that adding the column is a NO-OP for existing rows:
-- everything lands on GOOD + TRACKED + sellable + purchasable + MOVING_AVERAGE,
-- which is exactly how the current schema already behaves for a non-service
-- product. The deliberate re-classification happens in step 4.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_nature      public.item_nature      NOT NULL DEFAULT 'GOOD',
  ADD COLUMN IF NOT EXISTS inventory_policy public.inventory_policy NOT NULL DEFAULT 'TRACKED',
  ADD COLUMN IF NOT EXISTS tracking         public.item_tracking    NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS costing_method   public.costing_method   NOT NULL DEFAULT 'MOVING_AVERAGE',
  ADD COLUMN IF NOT EXISTS is_sellable      boolean                 NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_purchasable   boolean                 NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS status           public.item_status      NOT NULL DEFAULT 'ACTIVE';

-- UOM axes. `unit_id` remains the base UOM for backward compatibility; the new
-- columns are the explicit Base / Sales / Purchase triple from design section 2.
-- They are nullable: an item without an explicit sales/purchase UOM falls back
-- to base at read time.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS base_uom_id     uuid REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sales_uom_id    uuid REFERENCES public.units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purchase_uom_id uuid REFERENCES public.units(id) ON DELETE SET NULL;

-- UOM conversion factors, expressed as "1 <uom> = factor <base uom>".
-- Stored as JSONB so a company can add conversions without a schema change:
--   [{"uom_id":"<uuid>","factor":50,"scope":"sales"}]
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS uom_conversions jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.products.item_nature IS
  'GOOD = شيء مادي، SERVICE = عمل غير مادي. لا تُستخدم SERVICE لتعطيل المخزون.';
COMMENT ON COLUMN public.products.inventory_policy IS
  'TRACKED = يخصم/يزيد المخزون، UNTRACKED = صنف مادي بلا رصيد، CUSTOMER_OWNED = مادة مملوكة للعميل داخل حيازتنا.';
COMMENT ON COLUMN public.products.tracking IS
  'NONE / BATCH / SERIAL — مستوى التتبع الدقيق داخل الصنف المتتبع.';
COMMENT ON COLUMN public.products.costing_method IS
  'MOVING_AVERAGE / FIFO / STANDARD / NONE — طريقة تقييم المخزون المفعّلة لهذا الصنف.';
COMMENT ON COLUMN public.products.base_uom_id IS
  'وحدة القياس الأساسية. عند غيابها يُستخدم unit_id القديم كوحدة أساسية.';
COMMENT ON COLUMN public.products.uom_conversions IS
  'معاملات تحويل الوحدات: [{"uom_id":uuid,"factor":number,"scope":"sales|purchase"}] حيث 1 وحدة = factor × الوحدة الأساسية.';

-- Keep base_uom_id aligned with the legacy unit_id for existing rows so that
-- readers can prefer base_uom_id without a fallback surprise.
UPDATE public.products
SET base_uom_id = unit_id
WHERE base_uom_id IS NULL AND unit_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Consistency constraints
-- ---------------------------------------------------------------------------
-- These encode the design rules directly in the database so no code path can
-- create an impossible item.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'products'
      AND c.conname = 'products_service_cannot_be_tracked')
  THEN
    -- Rule 2: a SERVICE is not a mechanism for hiding stock. A service can
    -- never be TRACKED and can never be CUSTOMER_OWNED.
    ALTER TABLE public.products
      ADD CONSTRAINT products_service_cannot_be_tracked
      CHECK (item_nature <> 'SERVICE' OR inventory_policy = 'UNTRACKED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'products'
      AND c.conname = 'products_none_costing_requires_untracked')
  THEN
    -- Rule 3: costing_method = NONE only makes sense for something that is
    -- never valued, i.e. UNTRACKED.
    ALTER TABLE public.products
      ADD CONSTRAINT products_none_costing_requires_untracked
      CHECK (costing_method <> 'NONE' OR inventory_policy = 'UNTRACKED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'products'
      AND c.conname = 'products_untracked_has_no_tracking')
  THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_untracked_has_no_tracking
      CHECK (inventory_policy <> 'UNTRACKED' OR tracking = 'NONE');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_item_nature      ON public.products(item_nature);
CREATE INDEX IF NOT EXISTS idx_products_inventory_policy ON public.products(inventory_policy);
CREATE INDEX IF NOT EXISTS idx_products_status           ON public.products(status);

-- ---------------------------------------------------------------------------
-- 4. Deliberate, data-driven backfill from the legacy `is_service` flag
-- ---------------------------------------------------------------------------
-- This is the ONLY place existing rows are re-classified, and it is driven by
-- the pre-existing data, not by product names (design section 16 / phase 16).
--
-- Every legacy product that was marked is_service = true becomes
-- SERVICE + UNTRACKED + not-purchasable, which is what the current invoice
-- engine already effectively treats it as.
UPDATE public.products
SET item_nature      = 'SERVICE',
    inventory_policy = 'UNTRACKED',
    costing_method   = 'NONE',
    tracking         = 'NONE',
    is_purchasable   = false
WHERE is_service IS TRUE
  AND item_nature = 'GOOD';  -- idempotent: never re-touch an already-classified row

-- Anything that is NOT a service but has never had any stock row and has no
-- inventory-relevant history stays GOOD + TRACKED. We deliberately do NOT guess
-- UNTRACKED from the absence of a stock row: a brand-new tracked product also
-- has no stock row, and guessing would silently break its stock control.
-- Instead we record the ambiguity for manual review (below).

-- ---------------------------------------------------------------------------
-- 5. Manual-review register
-- ---------------------------------------------------------------------------
-- Design phase 16: "سجّل الحالات التي تحتاج مراجعة يدوية". Items whose legacy
-- shape is ambiguous are listed here rather than silently converted.
CREATE TABLE IF NOT EXISTS public.item_policy_review_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_policy_review_queue_unique UNIQUE (product_id, reason)
);

ALTER TABLE public.item_policy_review_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_policy_review_staff_read ON public.item_policy_review_queue;
CREATE POLICY item_policy_review_staff_read ON public.item_policy_review_queue
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS item_policy_review_manage ON public.item_policy_review_queue;
CREATE POLICY item_policy_review_manage ON public.item_policy_review_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_policy_review_queue TO authenticated;
GRANT ALL ON public.item_policy_review_queue TO service_role;

COMMENT ON TABLE public.item_policy_review_queue IS
  'حالات سياسة الصنف التي تحتاج مراجعة يدوية بعد الهجرة. لا يتم تخمينها تلقائيًا.';

-- Candidate: a product named like a service but never flagged as one.
INSERT INTO public.item_policy_review_queue (product_id, reason, detail)
SELECT p.id,
       'name_suggests_service',
       jsonb_build_object('name', p.name, 'name_ar', p.name_ar, 'sku', p.sku)
FROM public.products p
WHERE p.is_service IS NOT TRUE
  AND p.item_nature = 'GOOD'
  AND (p.name ILIKE '%service%' OR p.name ILIKE '%fee%' OR p.name ILIKE '%labor%'
       OR coalesce(p.name_ar, '') LIKE '%خدمة%' OR coalesce(p.name_ar, '') LIKE '%أجرة%'
       OR coalesce(p.name_ar, '') LIKE '%اجرة%')
ON CONFLICT (product_id, reason) DO NOTHING;

-- Candidate: a product flagged as a service that already has stock movements.
-- These are the dangerous ones — they were being sold through the service hack
-- while stock rows existed. They need a human decision.
INSERT INTO public.item_policy_review_queue (product_id, reason, detail)
SELECT DISTINCT m.product_id,
       'service_with_stock_history',
       jsonb_build_object('movement_count', (
         SELECT count(*) FROM public.stock_movements sm WHERE sm.product_id = m.product_id
       ))
FROM public.stock_movements m
JOIN public.products p ON p.id = m.product_id
WHERE p.is_service IS TRUE
ON CONFLICT (product_id, reason) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. CompanyItem — per-company policy overlay (design section 12)
-- ---------------------------------------------------------------------------
-- The project is single-company today (company_settings is a one-row table
-- with CHECK (id = 1)). We therefore DO NOT rebuild multi-tenancy. Instead we
-- create the overlay table with a company scope that is ready to grow, and
-- seed it so that "no row" and "a row identical to the product" mean the same
-- thing. Resolution order is always: company_items → products → defaults.

CREATE TABLE IF NOT EXISTS public.company_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         integer NOT NULL DEFAULT 1 REFERENCES public.company_settings(id) ON DELETE CASCADE,
  item_id            uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,

  -- Overridable policy. NULL means "inherit from the item".
  inventory_policy   public.inventory_policy,
  costing_method     public.costing_method,

  default_cost       numeric(14,2),
  default_sale_price numeric(14,2),
  tax_rate           numeric(6,3),

  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_items_unique UNIQUE (company_id, item_id),
  CONSTRAINT company_items_cost_nonnegative      CHECK (default_cost IS NULL OR default_cost >= 0),
  CONSTRAINT company_items_price_nonnegative     CHECK (default_sale_price IS NULL OR default_sale_price >= 0),
  CONSTRAINT company_items_tax_valid             CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100))
);

CREATE INDEX IF NOT EXISTS idx_company_items_item    ON public.company_items(item_id);
CREATE INDEX IF NOT EXISTS idx_company_items_company ON public.company_items(company_id);

ALTER TABLE public.company_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_items_staff_read ON public.company_items;
CREATE POLICY company_items_staff_read ON public.company_items
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS company_items_manage ON public.company_items;
CREATE POLICY company_items_manage ON public.company_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_items TO authenticated;
GRANT ALL ON public.company_items TO service_role;

CREATE TRIGGER company_items_updated
  BEFORE UPDATE ON public.company_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMENT ON TABLE public.company_items IS
  'طبقة سياسة على مستوى الشركة. NULL = وراثة قيمة الصنف. تسمح لاحقًا بأن يكون نفس المنتج UNTRACKED في شركة وTRACKED في أخرى.';
COMMENT ON COLUMN public.company_items.default_cost IS
  'تكلفة مرجعية وليست سجل مشتريات. لا يجوز استخدامها كإجمالي مشتريات أو كتكلفة فعلية.';

-- No seed rows: absence of a row already means "inherit from the item", and
-- seeding thousands of rows would freeze today's policy into a second place.

-- ---------------------------------------------------------------------------
-- 7. Resolution helpers — one place that answers "what is the effective policy"
-- ---------------------------------------------------------------------------

-- Effective inventory policy for an item in the current company.
CREATE OR REPLACE FUNCTION public.item_effective_policy(p_item_id uuid)
RETURNS public.inventory_policy
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(ci.inventory_policy, p.inventory_policy)
  FROM public.products p
  LEFT JOIN public.company_items ci
    ON ci.item_id = p.id AND ci.company_id = 1 AND ci.is_active
  WHERE p.id = p_item_id
$$;

COMMENT ON FUNCTION public.item_effective_policy(uuid) IS
  'السياسة المخزنية الفعلية للصنف: company_items تتقدم على products.';

-- The single decision point used by the invoice and purchase engines.
-- Returns exactly one of: STOCK_ISSUE | STOCK_RECEIPT | NONE
CREATE OR REPLACE FUNCTION public.item_stock_effect(p_item_id uuid, p_direction text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nature public.item_nature;
  v_policy public.inventory_policy;
BEGIN
  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = p_item_id;
  IF v_nature IS NULL THEN
    RETURN 'NONE';
  END IF;

  -- A SERVICE never moves company stock, in either direction.
  IF v_nature = 'SERVICE' THEN
    RETURN 'NONE';
  END IF;

  v_policy := public.item_effective_policy(p_item_id);

  -- Rule 4 / Rule 5: only TRACKED goods move stock. UNTRACKED goods are sold
  -- and purchased without any inventory effect; CUSTOMER_OWNED material is
  -- never company stock, so a normal sale/purchase never touches it.
  IF v_policy <> 'TRACKED' THEN
    RETURN 'NONE';
  END IF;

  RETURN CASE WHEN p_direction = 'out' THEN 'STOCK_ISSUE' ELSE 'STOCK_RECEIPT' END;
END $$;

COMMENT ON FUNCTION public.item_stock_effect(uuid, text) IS
  'التأثير المخزني الوحيد المعتمد: STOCK_ISSUE أو STOCK_RECEIPT أو NONE. يبنى على item_nature + inventory_policy.';

-- The invoice line type the engine records on each posted line.
CREATE OR REPLACE FUNCTION public.item_line_type(p_item_id uuid, p_is_ad_hoc boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nature public.item_nature;
  v_policy public.inventory_policy;
BEGIN
  IF p_is_ad_hoc THEN
    RETURN 'AD_HOC_SERVICE';
  END IF;
  IF p_item_id IS NULL THEN
    RETURN 'AD_HOC_SERVICE';
  END IF;

  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = p_item_id;
  IF v_nature IS NULL THEN
    RETURN 'AD_HOC_SERVICE';
  END IF;
  IF v_nature = 'SERVICE' THEN
    RETURN 'SERVICE';
  END IF;

  v_policy := public.item_effective_policy(p_item_id);
  RETURN CASE v_policy
    WHEN 'TRACKED'        THEN 'STOCKED_GOOD'
    WHEN 'CUSTOMER_OWNED' THEN 'CUSTOMER_OWNED_GOOD'
    ELSE 'UNTRACKED_GOOD'
  END;
END $$;

COMMENT ON FUNCTION public.item_line_type(uuid, boolean) IS
  'نوع سطر الفاتورة: STOCKED_GOOD / UNTRACKED_GOOD / SERVICE / CUSTOMER_OWNED_GOOD / AD_HOC_SERVICE.';

-- Does this item already have inventory history? Used by the policy guard.
CREATE OR REPLACE FUNCTION public.item_has_stock_history(p_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m.product_id = p_item_id)
      OR EXISTS (SELECT 1 FROM public.inventory i WHERE i.product_id = p_item_id AND i.quantity <> 0)
$$;

COMMENT ON FUNCTION public.item_has_stock_history(uuid) IS
  'هل للصنف حركات أو رصيد مخزني قائم؟ يمنع تغيير السياسة عشوائيًا بعده.';

-- ---------------------------------------------------------------------------
-- 8. Policy-change guard (design rule #10, phase 19)
-- ---------------------------------------------------------------------------
-- "لا تسمح بتغيير عشوائي إلى UNTRACKED بعد وجود حركات دون عملية انتقال
--  مضبوطة ومسجلة."
--
-- The guard is a trigger so it protects every write path — RPC, direct SQL, or
-- a future admin screen. A deliberate transition is still possible by setting
-- the session flag `app.allow_policy_change = 'on'` inside a logged operation,
-- which records an audit entry (see the RPC in Phase 7).

CREATE OR REPLACE FUNCTION public.tg_guard_item_policy_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow text := current_setting('app.allow_policy_change', true);
BEGIN
  IF v_allow = 'on' THEN
    RETURN NEW;
  END IF;

  -- Nature and policy changes are both restricted once history exists.
  IF NEW.inventory_policy IS DISTINCT FROM OLD.inventory_policy
     OR NEW.item_nature IS DISTINCT FROM OLD.item_nature
     OR NEW.costing_method IS DISTINCT FROM OLD.costing_method
  THEN
    IF public.item_has_stock_history(OLD.id) THEN
      RAISE EXCEPTION
        'Item % has inventory history; policy changes must go through approve_item_policy_change()',
        OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Rule 2 enforced again at the transition point: an item with history can
  -- never become a SERVICE, because that would retroactively re-label real
  -- stock movements as a non-stock service.
  IF NEW.item_nature = 'SERVICE' AND OLD.item_nature <> 'SERVICE' THEN
    IF public.item_has_stock_history(OLD.id) THEN
      RAISE EXCEPTION
        'Item % has inventory history and cannot be converted to SERVICE', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS products_guard_policy_change ON public.products;
CREATE TRIGGER products_guard_policy_change
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_item_policy_change();

COMMENT ON FUNCTION public.tg_guard_item_policy_change() IS
  'يمنع تغيير item_nature/inventory_policy/costing_method بعد وجود حركات مخزنية إلا عبر عملية معتمدة ومسجلة.';

-- ---------------------------------------------------------------------------
-- 9. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.item_effective_policy(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.item_stock_effect(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.item_line_type(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.item_has_stock_history(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.item_effective_policy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_stock_effect(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_line_type(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.item_has_stock_history(uuid) TO authenticated;