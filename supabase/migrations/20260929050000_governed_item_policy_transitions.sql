-- ============================================================================
-- Market-Hub ERP — Phase 7: Governed item policy transitions + audit trail
-- ============================================================================
-- Reference: Market-Hub_Product_Inventory_Service_Design.docx
--   section 12 (same item tracked in one company, untracked in another)
--   section 18 (rule 10: a policy change after movements must be a controlled,
--               logged operation)
--   phase 19   (Who / When / What / Before / After / Source Document)
--
-- WHY
--   Phase 1 installed a trigger that REFUSES a direct policy change once an item
--   has stock history. That protects the data but leaves no sanctioned way to do
--   a legitimate migration — for example when the mill decides to start tracking
--   flour it previously sold untracked. This migration supplies that sanctioned
--   path and records it.
--
-- WHAT THIS MIGRATION ADDS
--   1. approve_item_policy_change()  — the ONLY audited way to switch policy.
--   2. set_company_item_policy()     — per-company override management.
--   3. audit_item_policy_snapshot()  — the before/after record writer.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.set_company_item_policy(uuid, public.inventory_policy, public.costing_method, numeric, numeric, numeric, boolean);
--   DROP FUNCTION IF EXISTS public.approve_item_policy_change(uuid, public.item_nature, public.inventory_policy, public.costing_method, public.item_tracking, text);
--   DROP FUNCTION IF EXISTS public.audit_item_policy_snapshot(uuid, text, jsonb, jsonb, text);
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The audit writer
-- ---------------------------------------------------------------------------
-- One shape for every policy audit entry, so the audit screen can render them
-- uniformly: who, when, what, before, after, source.
CREATE OR REPLACE FUNCTION public.audit_item_policy_snapshot(
  p_item_id     uuid,
  p_action      text,
  p_before      jsonb,
  p_after       jsonb,
  p_source      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    auth.uid(),
    p_action,
    'product_policy',
    p_item_id,
    jsonb_build_object(
      'before', p_before,
      'after', p_after,
      'source_document', p_source,
      'recorded_at', now()
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.audit_item_policy_snapshot(uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_item_policy_snapshot(uuid, text, jsonb, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.audit_item_policy_snapshot(uuid, text, jsonb, jsonb, text) IS
  'يكتب قيد تدقيق لسياسة الصنف: من، متى، ماذا، قبل، بعد، والمستند المصدر.';

-- ---------------------------------------------------------------------------
-- 2. approve_item_policy_change — the controlled transition
-- ---------------------------------------------------------------------------
-- This is the only function permitted to move an item between natures/policies
-- once it has history. It:
--   * requires owner/manager,
--   * requires a written reason and a source document reference,
--   * refuses transitions the design forbids (a service can never become
--     tracked; a service can never become tracked stock by a policy flip),
--   * refuses to switch to UNTRACKED while a non-zero balance exists, because
--     that would strand real stock with no ledger to explain it,
--   * writes the before/after snapshot,
--   * flips the trigger's session flag inside its own transaction so the guard
--     allows exactly this one write and nothing else.
CREATE OR REPLACE FUNCTION public.approve_item_policy_change(
  _item_id uuid,
  _new_nature public.item_nature,
  _new_policy public.inventory_policy,
  _new_costing public.costing_method,
  _new_tracking public.item_tracking,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_before  jsonb;
  v_after   jsonb;
  v_product public.products%ROWTYPE;
  v_balance numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'Only an owner or manager may approve an item policy change';
  END IF;

  IF coalesce(btrim(_reason), '') = '' THEN
    RAISE EXCEPTION 'A written reason is required for every policy change';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item % does not exist', _item_id;
  END IF;

  -- ------------------------------------------------------------------ rules
  -- Rule 2: a SERVICE is not a way to switch stock off, and it can never hold
  -- a stock balance. Allowing SERVICE + TRACKED would resurrect the exact
  -- workaround this project is removing.
  IF _new_nature = 'SERVICE' AND _new_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'A SERVICE can only be UNTRACKED';
  END IF;

  IF _new_policy = 'UNTRACKED' AND _new_tracking <> 'NONE' THEN
    RAISE EXCEPTION 'An UNTRACKED item cannot require batch or serial tracking';
  END IF;

  IF _new_costing = 'NONE' AND _new_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'Costing method NONE is only valid for an UNTRACKED item';
  END IF;

  -- Moving a good OUT of tracking while it still holds stock would orphan that
  -- stock. The operator must clear the balance first (sell it, adjust it to
  -- zero, or move it to a customer-owned position) so the numbers stay honest.
  SELECT coalesce(sum(i.quantity), 0)
    INTO v_balance
  FROM public.inventory i
  WHERE i.product_id = _item_id
    AND i.owner_type = 'COMPANY'
    AND i.owner_id IS NULL;

  IF _new_policy <> 'TRACKED'
     AND v_product.inventory_policy = 'TRACKED'
     AND v_balance <> 0 THEN
    RAISE EXCEPTION
      'Item % still holds % units. Clear the balance with an adjustment before leaving TRACKED.',
      _item_id, v_balance;
  END IF;

  -- A tracked item needs a costing method that can actually value it.
  IF _new_policy = 'TRACKED' AND _new_costing = 'NONE' THEN
    RAISE EXCEPTION 'A TRACKED item requires a costing method other than NONE';
  END IF;

  v_before := jsonb_build_object(
    'item_nature', v_product.item_nature,
    'inventory_policy', v_product.inventory_policy,
    'costing_method', v_product.costing_method,
    'tracking', v_product.tracking
  );
  v_after := jsonb_build_object(
    'item_nature', _new_nature,
    'inventory_policy', _new_policy,
    'costing_method', _new_costing,
    'tracking', _new_tracking
  );

  -- Open the guard for this transaction only. set_config(..., true) is
  -- transaction-scoped, so the exemption cannot leak to another statement.
  PERFORM set_config('app.allow_policy_change', 'on', true);

  UPDATE public.products
  SET item_nature      = _new_nature,
      inventory_policy = _new_policy,
      costing_method   = _new_costing,
      tracking         = _new_tracking,
      updated_at       = now()
  WHERE id = _item_id;

  RETURN public.audit_item_policy_snapshot(
    _item_id,
    'item_policy.changed',
    v_before,
    v_after,
    btrim(_reason)
  );
END $$;

REVOKE ALL ON FUNCTION public.approve_item_policy_change(uuid, public.item_nature, public.inventory_policy, public.costing_method, public.item_tracking, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_item_policy_change(uuid, public.item_nature, public.inventory_policy, public.costing_method, public.item_tracking, text) TO authenticated;

COMMENT ON FUNCTION public.approve_item_policy_change(uuid, public.item_nature, public.inventory_policy, public.costing_method, public.item_tracking, text) IS
  'العملية المعتمدة والمسجلة الوحيدة لتغيير طبيعة/سياسة الصنف بعد وجود حركات. تتطلب سببًا مكتوبًا وصلاحية owner/manager.';

-- ---------------------------------------------------------------------------
-- 3. set_company_item_policy — the per-company overlay
-- ---------------------------------------------------------------------------
-- Design section 12: the same catalogue item can be tracked for one company and
-- untracked for another. The project is single-company today, so this manages
-- the overlay for company 1 while the schema is already multi-company ready.
--
-- The same "no stranded stock" rule applies at this level: you cannot flip a
-- company override to UNTRACKED while that company holds the stock.
CREATE OR REPLACE FUNCTION public.set_company_item_policy(
  _item_id uuid,
  _inventory_policy public.inventory_policy DEFAULT NULL,
  _costing_method public.costing_method DEFAULT NULL,
  _default_cost numeric DEFAULT NULL,
  _default_sale_price numeric DEFAULT NULL,
  _tax_rate numeric DEFAULT NULL,
  _is_active boolean DEFAULT true,
  _company_id integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_before  jsonb;
  v_after   jsonb;
  v_nature  public.item_nature;
  v_balance numeric;
  v_existing public.company_items%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'Only an owner or manager may change a company item policy';
  END IF;

  SELECT p.item_nature INTO v_nature FROM public.products p WHERE p.id = _item_id;
  IF v_nature IS NULL THEN
    RAISE EXCEPTION 'Item % does not exist', _item_id;
  END IF;

  IF v_nature = 'SERVICE' AND _inventory_policy IS NOT NULL AND _inventory_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'A SERVICE can only be UNTRACKED in any company';
  END IF;

  IF _default_cost IS NOT NULL AND _default_cost < 0 THEN
    RAISE EXCEPTION 'Default cost cannot be negative';
  END IF;
  IF _default_sale_price IS NOT NULL AND _default_sale_price < 0 THEN
    RAISE EXCEPTION 'Default sale price cannot be negative';
  END IF;
  IF _tax_rate IS NOT NULL AND (_tax_rate < 0 OR _tax_rate > 100) THEN
    RAISE EXCEPTION 'Tax rate must be between 0 and 100';
  END IF;

  SELECT * INTO v_existing
  FROM public.company_items
  WHERE company_id = _company_id AND item_id = _item_id
  FOR UPDATE;

  -- Refuse to strand stock by turning tracking off for a company that holds it.
  IF _inventory_policy IS NOT NULL AND _inventory_policy <> 'TRACKED' THEN
    SELECT coalesce(sum(i.quantity), 0) INTO v_balance
    FROM public.inventory i
    WHERE i.product_id = _item_id
      AND i.owner_type = 'COMPANY'
      AND i.owner_id IS NULL;

    IF v_balance <> 0
       AND coalesce(v_existing.inventory_policy, (SELECT p.inventory_policy FROM public.products p WHERE p.id = _item_id)) = 'TRACKED' THEN
      RAISE EXCEPTION
        'Company % still holds % units of item %. Clear the balance before leaving TRACKED.',
        _company_id, v_balance, _item_id;
    END IF;
  END IF;

  v_before := CASE WHEN v_existing.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'inventory_policy', v_existing.inventory_policy,
      'costing_method', v_existing.costing_method,
      'default_cost', v_existing.default_cost,
      'default_sale_price', v_existing.default_sale_price,
      'tax_rate', v_existing.tax_rate,
      'is_active', v_existing.is_active
    ) END;

  INSERT INTO public.company_items (
    company_id, item_id, inventory_policy, costing_method,
    default_cost, default_sale_price, tax_rate, is_active
  )
  VALUES (
    _company_id, _item_id, _inventory_policy, _costing_method,
    _default_cost, _default_sale_price, _tax_rate, coalesce(_is_active, true)
  )
  ON CONFLICT (company_id, item_id) DO UPDATE
  SET inventory_policy   = COALESCE(EXCLUDED.inventory_policy,   public.company_items.inventory_policy),
      costing_method     = COALESCE(EXCLUDED.costing_method,     public.company_items.costing_method),
      default_cost       = COALESCE(EXCLUDED.default_cost,       public.company_items.default_cost),
      default_sale_price = COALESCE(EXCLUDED.default_sale_price, public.company_items.default_sale_price),
      tax_rate           = COALESCE(EXCLUDED.tax_rate,           public.company_items.tax_rate),
      is_active          = EXCLUDED.is_active,
      updated_at         = now()
  RETURNING id INTO v_id;

  SELECT jsonb_build_object(
           'inventory_policy', ci.inventory_policy,
           'costing_method', ci.costing_method,
           'default_cost', ci.default_cost,
           'default_sale_price', ci.default_sale_price,
           'tax_rate', ci.tax_rate,
           'is_active', ci.is_active
         )
    INTO v_after
  FROM public.company_items ci WHERE ci.id = v_id;

  PERFORM public.audit_item_policy_snapshot(
    _item_id,
    'company_item_policy.changed',
    coalesce(v_before, '{}'::jsonb),
    v_after,
    'company:' || _company_id
  );

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.set_company_item_policy(uuid, public.inventory_policy, public.costing_method, numeric, numeric, numeric, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_company_item_policy(uuid, public.inventory_policy, public.costing_method, numeric, numeric, numeric, boolean, integer) TO authenticated;

COMMENT ON FUNCTION public.set_company_item_policy(uuid, public.inventory_policy, public.costing_method, numeric, numeric, numeric, boolean, integer) IS
  'إدارة سياسة الصنف على مستوى الشركة. NULL = وراثة قيمة الصنف. تمنع ترك رصيد معلّق عند إيقاف التتبع.';

-- ---------------------------------------------------------------------------
-- 4. Item create/update through one governed RPC
-- ---------------------------------------------------------------------------
-- The product form must not be able to write a policy that skips the guard, nor
-- to silently change policy while editing prices. This RPC handles both cases:
-- non-policy fields are a plain update, policy fields go through the audited
-- transition rules.
CREATE OR REPLACE FUNCTION public.save_item_policy(
  _item_id uuid,
  _item_nature public.item_nature,
  _inventory_policy public.inventory_policy,
  _costing_method public.costing_method,
  _tracking public.item_tracking,
  _is_sellable boolean,
  _is_purchasable boolean,
  _base_uom_id uuid DEFAULT NULL,
  _sales_uom_id uuid DEFAULT NULL,
  _purchase_uom_id uuid DEFAULT NULL,
  _uom_conversions jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_product public.products%ROWTYPE;
  v_before  jsonb;
  v_after   jsonb;
  v_policy_changed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'warehouse')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to edit item policy';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = _item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item % does not exist', _item_id;
  END IF;

  IF _item_nature = 'SERVICE' AND _inventory_policy <> 'UNTRACKED' THEN
    RAISE EXCEPTION 'A SERVICE can only be UNTRACKED';
  END IF;
  IF _inventory_policy = 'TRACKED' AND _costing_method = 'NONE' THEN
    RAISE EXCEPTION 'A TRACKED item requires a costing method other than NONE';
  END IF;
  IF _inventory_policy = 'UNTRACKED' AND _tracking <> 'NONE' THEN
    RAISE EXCEPTION 'An UNTRACKED item cannot require batch or serial tracking';
  END IF;
  IF NOT _is_sellable AND NOT _is_purchasable THEN
    RAISE EXCEPTION 'An item must be usable for selling, purchasing, or both';
  END IF;

  IF _uom_conversions IS NOT NULL AND jsonb_typeof(_uom_conversions) <> 'array' THEN
    RAISE EXCEPTION 'UOM conversions must be a JSON array';
  END IF;

  v_policy_changed :=
    _item_nature      IS DISTINCT FROM v_product.item_nature
    OR _inventory_policy IS DISTINCT FROM v_product.inventory_policy
    OR _costing_method   IS DISTINCT FROM v_product.costing_method
    OR _tracking         IS DISTINCT FROM v_product.tracking;

  -- When only the commercial flags or units change, no policy transition is
  -- happening and the plain path is enough.
  IF NOT v_policy_changed THEN
    UPDATE public.products
    SET is_sellable      = _is_sellable,
        is_purchasable   = _is_purchasable,
        base_uom_id      = _base_uom_id,
        sales_uom_id     = _sales_uom_id,
        purchase_uom_id  = _purchase_uom_id,
        uom_conversions  = coalesce(_uom_conversions, uom_conversions),
        updated_at       = now()
    WHERE id = _item_id;

    RETURN _item_id;
  END IF;

  -- A policy change is a governed transition. If the item has no history yet,
  -- the trigger allows the direct write; if it has history, the owner/manager
  -- rule applies and the change is audited.
  IF public.item_has_stock_history(_item_id) THEN
    IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
      RAISE EXCEPTION
        'Item % has inventory history; only an owner or manager may change its policy',
        _item_id;
    END IF;

    v_before := jsonb_build_object(
      'item_nature', v_product.item_nature,
      'inventory_policy', v_product.inventory_policy,
      'costing_method', v_product.costing_method,
      'tracking', v_product.tracking
    );

    PERFORM set_config('app.allow_policy_change', 'on', true);
  END IF;

  UPDATE public.products
  SET item_nature      = _item_nature,
      inventory_policy = _inventory_policy,
      costing_method   = _costing_method,
      tracking         = _tracking,
      is_sellable      = _is_sellable,
      is_purchasable   = _is_purchasable,
      base_uom_id      = _base_uom_id,
      sales_uom_id     = _sales_uom_id,
      purchase_uom_id  = _purchase_uom_id,
      uom_conversions  = coalesce(_uom_conversions, uom_conversions),
      updated_at       = now()
  WHERE id = _item_id;

  IF v_before IS NOT NULL THEN
    v_after := jsonb_build_object(
      'item_nature', _item_nature,
      'inventory_policy', _inventory_policy,
      'costing_method', _costing_method,
      'tracking', _tracking
    );

    PERFORM public.audit_item_policy_snapshot(
      _item_id,
      'item_policy.changed',
      v_before,
      v_after,
      'item_editor'
    );
  END IF;

  RETURN _item_id;
END $$;

REVOKE ALL ON FUNCTION public.save_item_policy(uuid, public.item_nature, public.inventory_policy, public.costing_method, public.item_tracking, boolean, boolean, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_item_policy(uuid, public.item_nature, public.inventory_policy, public.costing_method, public.item_tracking, boolean, boolean, uuid, uuid, uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_item_policy(uuid, public.item_nature, public.inventory_policy, public.costing_method, public.item_tracking, boolean, boolean, uuid, uuid, uuid, jsonb) IS
  'حفظ سياسة الصنف من الواجهة: يمر بتغييرات السياسة عبر نفس القواعد والقيد التدقيقي بدل الكتابة المباشرة على الجدول.';