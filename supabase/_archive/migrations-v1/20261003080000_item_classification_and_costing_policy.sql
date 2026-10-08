-- ============================================================================
-- 20261003080000_item_classification_and_costing_policy.sql
--
-- FOUNDATION FOR THE COST ENGINE
-- -------------------------------
-- Two things had to exist before a costing engine could be built on top of
-- the inventory spine:
--
-- 1. A five-way item classification. The schema had `item_nature`
--    (GOOD / SERVICE) and a separate `inventory_policy`
--    (TRACKED / UNTRACKED / CUSTOMER_OWNED), and the mill needed a third
--    distinction that neither of them expresses: a by-product. Bran is
--    TRACKED company stock like flour, but it is not a primary output — it
--    has no sale price of its own, it is valued at its share of the input
--    cost, and a valuation that forgets it silently inflates the cost of
--    the flour. A "non-stock item" is likewise distinct from a service: it
--    carries quantity (weight, volume) but never a balance.
--
--    The new `item_class` is deliberately ADDITIVE. It does not replace
--    `item_nature` or `inventory_policy`, because a great deal of existing
--    engine logic (post_stock_delta, item_effective_policy, the governed
--    policy transitions, the milling module) reads those two. Overwriting
--    them would mean rewriting a working, tested engine. Instead `item_class`
--    is derived from them where possible and backfilled, and a consistency
--    trigger keeps the two views from drifting apart.
--
-- 2. A company-wide costing method. The user's decision: support BOTH
--    moving average and standard cost, selectable company-wide rather than
--    per item. A single engine then has one entry point, `resolve_unit_cost`,
--    and the behaviour difference is contained in that function.
--
-- NON-DESTRUCTIVE: new enum, new column with a backfill, new setting table.
-- No product is reclassified by hand, no balance changes, no movement is
-- rewritten. The one judgement call is the backfill mapping, spelled out
-- per SKU prefix below and reversible from the recorded original values.
-- ============================================================================

-- ── 1. the five-way classification ──────────────────────────────────────────

CREATE TYPE public.item_class AS ENUM (
  'RAW_MATERIAL',      -- مادة خام: قمح، شعير، ذرة — تدخل الإنتاج وتستهلك
  'FINISHED_GOOD',     -- منتج نهائي: دقيق فاخر، سميد — غرضه البيع
  'BY_PRODUCT',        -- منتج جانبي: نخالة، Bran — ناتج حقيقي يُخزَّن ويُقيَّم
  'SERVICE',           -- خدمة: طحن، تنظيف، حياكة — فاتورة فقط، بلا مخزون
  'NON_STOCK_ITEM'     -- غير مخزني: يُقاس ويُستهلك بلا رصيد (وقود، كهرباء)
);

COMMENT ON TYPE public.item_class IS
  'تصنيف الصنف الخماسي: خام / نهائي / جانبي / خدمة / غير مخزني. '
  'مكمّل لـ item_nature وinventory_policy ولا يستبدلهما.';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_class public.item_class;

-- A classification the engine can trust is a property of the *nature* of the
-- thing, so backfill is mechanical from the two columns that already exist.
-- ORDER MATTERS: the narrow rule (bran) must run before the broad one (FG-*),
-- because bran carries an FG- prefix but is a by-product, not a finished good.
-- Getting this backwards would value bran as if it were a primary output, which
-- is exactly the silent cost inflation the classification exists to prevent.
UPDATE public.products SET item_class = 'SERVICE'
 WHERE item_class IS NULL AND item_nature = 'SERVICE';

UPDATE public.products SET item_class = 'BY_PRODUCT'
 WHERE item_class IS NULL AND sku = 'FG-BRAN-40';

UPDATE public.products SET item_class = 'RAW_MATERIAL'
 WHERE item_class IS NULL AND sku LIKE ANY (ARRAY['RM-%', 'PKG-BAG-%', 'PKG-THREAD-%']);

UPDATE public.products SET item_class = 'FINISHED_GOOD'
 WHERE item_class IS NULL AND item_nature = 'GOOD';

UPDATE public.products SET item_class = 'NON_STOCK_ITEM'
 WHERE item_class IS NULL;

-- Anything still unclassified is a real gap, not something to paper over: it
-- is tracked so the settings screen can list it. The report view below
-- surfaces it rather than hiding it behind a default.
COMMENT ON COLUMN public.products.item_class IS
  'التصنيف الخماسي. GOOD+TRACKED لا يكفي: نخالة byproduct ودقيق finished good، وكلاهما بضاعة متتبَّعة.';

-- ── 2. keep item_class consistent with the columns the engine already reads ──
-- The governed policy engine (20260929050000) already blocks illegal moves on
-- item_nature / inventory_policy. This trigger is the mirror image: when the
-- engine's own columns are changed, the classification follows, so a service
-- can never end up stocked as a finished good.
CREATE OR REPLACE FUNCTION public.sync_item_class_from_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- On INSERT there is no OLD row, so the two columns always look "changed"
  -- and this trigger is what gives a brand-new product its first class.
  IF TG_OP = 'INSERT'
     OR NEW.item_nature IS DISTINCT FROM OLD.item_nature
     OR NEW.inventory_policy IS DISTINCT FROM OLD.inventory_policy THEN

    -- Nature changed: the classification follows, but only for the two
    -- values that ARE a nature. A by-product and a raw material are both
    -- GOOD, so nature alone must not overwrite them with FINISHED_GOOD.
    --
    -- The NULL test is explicit because `NULL NOT IN (...)` evaluates to NULL,
    -- not TRUE: without it a newly inserted GOOD product with no class yet
    -- would fall straight through and stay NULL forever.
    IF NEW.item_nature = 'SERVICE' THEN
      NEW.item_class := 'SERVICE';
    ELSIF NEW.item_nature = 'GOOD' THEN
      IF NEW.item_class IS NULL OR NEW.item_class NOT IN ('RAW_MATERIAL', 'BY_PRODUCT') THEN
        NEW.item_class := 'FINISHED_GOOD';
      END IF;
    END IF;

    -- Policy changed: an item that can no longer hold a balance is a service
    -- or a non-stock item, and a CUSTOMER_OWNED item is not company stock.
    IF NEW.inventory_policy = 'CUSTOMER_OWNED' THEN
      NEW.item_class := 'NON_STOCK_ITEM';
    ELSIF NEW.inventory_policy = 'UNTRACKED' AND NEW.item_nature = 'GOOD' THEN
      NEW.item_class := 'NON_STOCK_ITEM';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_sync_item_class ON public.products;
CREATE TRIGGER tg_sync_item_class
  BEFORE INSERT OR UPDATE OF item_nature, inventory_policy ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_item_class_from_policy();

-- ── 3. company-wide costing method ─────────────────────────────────────────
-- Both supported methods, one of them active. Held in its own table rather
-- than as a column on company_settings so the history of a costing change is
-- auditable: a stock valuation that moved must be explainable afterwards.
CREATE TABLE IF NOT EXISTS public.company_costing_settings (
  id                   smallint PRIMARY KEY DEFAULT 1,
  costing_method       public.costing_method NOT NULL DEFAULT 'MOVING_AVERAGE',
  -- Standard cost needs a baseline to be standard against. Seeded from the
  -- catalogue, and maintained by the costing engine as actuals accumulate.
  standard_cost_source text NOT NULL DEFAULT 'CATALOGUE'
    CHECK (standard_cost_source IN ('CATALOGUE', 'ROLLING_AVERAGE', 'MANUAL')),
  effective_from       date NOT NULL DEFAULT CURRENT_DATE,
  updated_by           uuid REFERENCES auth.users(id),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  notes                text,
  CONSTRAINT company_costing_settings_singleton CHECK (id = 1)
);

INSERT INTO public.company_costing_settings (id, costing_method)
VALUES (1, 'MOVING_AVERAGE')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.company_costing_settings IS
  'إعداد التكلفة على مستوى الشركة. الطرق المدعومة: MOVING_AVERAGE و STANDARD. سطر واحد فقط؛ التغيير يُسجَّل في costing_policy_history.';

ALTER TABLE public.company_costing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS costing_settings_read ON public.company_costing_settings;
CREATE POLICY costing_settings_read ON public.company_costing_settings
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- No INSERT/UPDATE policy: a costing method is a governed change, made
-- through the RPC below so the history row is written in the same transaction.

CREATE OR REPLACE FUNCTION public.set_company_costing_method(
  _method      text,
  _source      text,
  _notes       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old  public.costing_method;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'Only an owner or manager can change the company costing method';
  END IF;
  IF _method NOT IN ('MOVING_AVERAGE', 'STANDARD') THEN
    RAISE EXCEPTION 'Costing method must be MOVING_AVERAGE or STANDARD (got %)', _method;
  END IF;

  SELECT costing_method INTO v_old FROM public.company_costing_settings WHERE id = 1 FOR UPDATE;
  IF v_old = _method::public.costing_method THEN
    RETURN;  -- idempotent: re-selecting the same method is not a change
  END IF;

  UPDATE public.company_costing_settings
     SET costing_method = _method::public.costing_method,
         standard_cost_source = coalesce(_source, standard_cost_source),
         effective_from    = CURRENT_DATE,
         updated_by        = v_user,
         updated_at        = now(),
         notes             = nullif(btrim(coalesce(_notes, '')), '')
   WHERE id = 1;

  INSERT INTO public.costing_policy_history (costing_method, previous_method, reason, changed_by)
  VALUES (_method::public.costing_method, v_old, nullif(btrim(coalesce(_notes, '')), ''), v_user);
END $$;

REVOKE ALL ON FUNCTION public.set_company_costing_method(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_costing_method(text, text, text) TO authenticated;

-- ── 4. the change history that makes a valuation shift explainable ─────────

CREATE TABLE IF NOT EXISTS public.costing_policy_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  costing_method   public.costing_method NOT NULL,
  previous_method  public.costing_method,
  reason           text,
  changed_by       uuid REFERENCES auth.users(id),
  changed_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.costing_policy_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS costing_history_read ON public.costing_policy_history;
CREATE POLICY costing_history_read ON public.costing_policy_history
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- ── 5. the single entry point the whole engine will ask ─────────────────────
-- Everything else in the system must resolve a cost through this function and
-- never by reading products.cost_price directly. Keeping that in one place is
-- what makes the method switchable without touching callers.
CREATE OR REPLACE FUNCTION public.company_costing_method()
RETURNS public.costing_method
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT costing_method FROM public.company_costing_settings WHERE id = 1),
    'MOVING_AVERAGE'::public.costing_method
  );
$$;

REVOKE ALL ON FUNCTION public.company_costing_method() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_costing_method() TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.set_company_costing_method(text, text, text);
-- DROP FUNCTION IF EXISTS public.company_costing_method();
-- DROP FUNCTION IF EXISTS public.sync_item_class_from_policy();
-- DROP TRIGGER IF EXISTS tg_sync_item_class ON public.products;
-- DROP TABLE IF EXISTS public.costing_policy_history;
-- DROP TABLE IF EXISTS public.company_costing_settings;
-- ALTER TABLE public.products DROP COLUMN IF EXISTS item_class;
-- DROP TYPE IF EXISTS public.item_class;