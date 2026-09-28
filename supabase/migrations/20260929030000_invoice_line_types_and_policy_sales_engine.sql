-- ============================================================================
-- Market-Hub ERP — Phase 4: Invoice line types + policy-driven sales engine
-- ============================================================================
-- Reference: Market-Hub_Product_Inventory_Service_Design.docx
--   section 7  (pre-defined service item vs ad-hoc service line)
--   section 13 (one invoice, three kinds of line)
--   section 14 (InvoiceLine: line_type, stock_effect)
--   section 18 (rules 2, 4: SERVICE is not a stock switch; a sale does not
--               always reduce stock)
--
-- THE PROBLEM THIS REPLACES
--   The old engine could not represent a service line honestly. It inserted a
--   hidden product with SKU = 'SERVICE-CUSTOM', gave that product an inventory
--   row of 999999 ("unlimited stock" — forbidden by design rule #3), posted a
--   fake sale line, then DELETED the line and the movement and refunded the
--   quantity. Every service invoice therefore carried a phantom product, a
--   phantom movement and a phantom stock adjustment.
--
-- THE NEW ENGINE
--   create_sale() resolves each line through public.resolve_sale_line(), which
--   asks the item policy one question:
--
--       STOCK_ISSUE -> reduce stock + write an ISSUE movement
--       NONE        -> touch nothing
--
--   and records `line_type` and `stock_effect` on the invoice line, so reporting
--   can distinguish a stocked good from an untracked good from a service from an
--   ad-hoc service without guessing.
--
-- BACKWARD COMPATIBILITY
--   * Every existing overload keeps its exact signature and still works.
--   * The 8/9-argument overloads still accept `is_service` in the payload, but
--     it is now only consulted when there is no usable product reference.
--     Item policy always wins for a real product row.
--   * Discount semantics, credit-limit checks, customer_ledger posting and audit
--     logging are unchanged.
--
-- ROLLBACK
--   ALTER TABLE public.sales_invoice_items DROP COLUMN IF EXISTS line_type,
--     DROP COLUMN IF EXISTS stock_effect, DROP COLUMN IF EXISTS uom_id;
--   ALTER TABLE public.purchase_invoice_items DROP COLUMN IF EXISTS line_type,
--     DROP COLUMN IF EXISTS stock_effect;
--   ALTER TABLE public.sales_return_items DROP COLUMN IF EXISTS line_type;
--   ALTER TABLE public.purchase_return_items DROP COLUMN IF EXISTS line_type;
--   DROP TABLE IF EXISTS public.ad_hoc_service_lines;
--   DROP FUNCTION IF EXISTS public.resolve_sale_line(jsonb);
--   (then restore create_sale from 20260916010000)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Invoice line typing
-- ---------------------------------------------------------------------------
-- Nullable on purpose: historical lines keep NULL and are read as "unknown,
-- fall back to the item's current policy" — exactly how old invoices behaved.
-- No historical row is rewritten.
ALTER TABLE public.sales_invoice_items
  ADD COLUMN IF NOT EXISTS line_type    text,
  ADD COLUMN IF NOT EXISTS stock_effect text,
  ADD COLUMN IF NOT EXISTS uom_id       uuid REFERENCES public.units(id) ON DELETE SET NULL;

ALTER TABLE public.purchase_invoice_items
  ADD COLUMN IF NOT EXISTS line_type    text,
  ADD COLUMN IF NOT EXISTS stock_effect text;

ALTER TABLE public.sales_return_items
  ADD COLUMN IF NOT EXISTS line_type text;

ALTER TABLE public.purchase_return_items
  ADD COLUMN IF NOT EXISTS line_type text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoice_items_line_type_valid') THEN
    ALTER TABLE public.sales_invoice_items
      ADD CONSTRAINT sales_invoice_items_line_type_valid
      CHECK (line_type IS NULL OR line_type IN
        ('STOCKED_GOOD','UNTRACKED_GOOD','SERVICE','CUSTOMER_OWNED_GOOD','AD_HOC_SERVICE'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_invoice_items_stock_effect_valid') THEN
    ALTER TABLE public.sales_invoice_items
      ADD CONSTRAINT sales_invoice_items_stock_effect_valid
      CHECK (stock_effect IS NULL OR stock_effect IN ('STOCK_ISSUE','STOCK_RECEIPT','NONE'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoice_items_line_type_valid') THEN
    ALTER TABLE public.purchase_invoice_items
      ADD CONSTRAINT purchase_invoice_items_line_type_valid
      CHECK (line_type IS NULL OR line_type IN
        ('STOCKED_GOOD','UNTRACKED_GOOD','SERVICE','CUSTOMER_OWNED_GOOD','AD_HOC_SERVICE'));
  END IF;
END $$;

COMMENT ON COLUMN public.sales_invoice_items.line_type IS
  'STOCKED_GOOD / UNTRACKED_GOOD / SERVICE / CUSTOMER_OWNED_GOOD / AD_HOC_SERVICE. يُسجَّل لحظة الترحيل.';
COMMENT ON COLUMN public.sales_invoice_items.stock_effect IS
  'الأثر المخزني الفعلي المنفَّذ لهذا السطر: STOCK_ISSUE أو NONE.';

-- ---------------------------------------------------------------------------
-- 2. Ad-hoc service lines — auditable, permissioned, never a product
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ad_hoc_service_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  invoice_item_id uuid REFERENCES public.sales_invoice_items(id) ON DELETE SET NULL,
  description     text NOT NULL,
  quantity        numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price      numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  discount        numeric(14,2) NOT NULL DEFAULT 0,
  tax             numeric(14,2) NOT NULL DEFAULT 0,
  total           numeric(14,2) NOT NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_hoc_service_lines_invoice ON public.ad_hoc_service_lines(invoice_id);

ALTER TABLE public.ad_hoc_service_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ad_hoc_service_lines_read ON public.ad_hoc_service_lines;
CREATE POLICY ad_hoc_service_lines_read ON public.ad_hoc_service_lines
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.ad_hoc_service_lines FROM authenticated, anon;
GRANT SELECT ON public.ad_hoc_service_lines TO authenticated;
GRANT ALL ON public.ad_hoc_service_lines TO service_role;

COMMENT ON TABLE public.ad_hoc_service_lines IS
  'سطور الخدمات المخصصة (Ad-hoc) داخل الفواتير. لا تُنشئ منتجًا دائمًا، ولا تؤثر على المخزون، وتبقى قابلة للتدقيق والتمييز في التقارير.';

-- ---------------------------------------------------------------------------
-- 3. Retire the SERVICE-CUSTOM phantom product
-- ---------------------------------------------------------------------------
-- Deactivated, not deleted: historical invoice lines still reference it and old
-- invoices must stay displayable and printable (design phase 17).
UPDATE public.products
SET is_service       = true,
    item_nature      = 'SERVICE',
    inventory_policy = 'UNTRACKED',
    costing_method   = 'NONE',
    tracking         = 'NONE',
    is_purchasable   = false,
    is_active        = false,
    status           = 'INACTIVE',
    name_ar          = 'خدمة مخصصة (قديم)',
    updated_at       = now()
WHERE sku = 'SERVICE-CUSTOM';

-- Remove the "unlimited" balance that design rule #3 forbids.
UPDATE public.inventory
SET quantity = 0, updated_at = now()
WHERE product_id IN (SELECT id FROM public.products WHERE sku = 'SERVICE-CUSTOM')
  AND quantity <> 0;

INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
SELECT NULL, 'legacy.unlimited_stock_removed', 'products', p.id,
       jsonb_build_object(
         'sku', 'SERVICE-CUSTOM',
         'reason', 'Unlimited stock placeholder removed; SERVICE lines are now first-class ad-hoc lines',
         'migration', '20260929030000'
       )
FROM public.products p
WHERE p.sku = 'SERVICE-CUSTOM';

-- ---------------------------------------------------------------------------
-- 4. Shared line resolver — validation and posting can never disagree
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_sale_line(
  p_line jsonb,
  OUT o_product_id   uuid,
  OUT o_quantity     numeric,
  OUT o_line_type    text,
  OUT o_stock_effect text,
  OUT o_service_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_service_flag boolean := coalesce((p_line ->> 'is_service')::boolean, false);
  v_exists boolean;
BEGIN
  o_product_id   := nullif(btrim(coalesce(p_line ->> 'product_id', '')), '')::uuid;
  o_quantity     := (p_line ->> 'quantity')::numeric;
  o_service_name := nullif(btrim(coalesce(p_line ->> 'name', '')), '');

  IF o_product_id IS NULL THEN
    -- No product reference at all: this is an ad-hoc service line.
    o_line_type    := 'AD_HOC_SERVICE';
    o_stock_effect := 'NONE';
    RETURN;
  END IF;

  SELECT true INTO v_exists FROM public.products p WHERE p.id = o_product_id;

  IF v_exists IS NOT TRUE THEN
    IF v_is_service_flag THEN
      -- Legacy POS sent synthetic ids such as "service-<uuid>".
      o_product_id   := NULL;
      o_line_type    := 'AD_HOC_SERVICE';
      o_stock_effect := 'NONE';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Item % does not exist', o_product_id;
  END IF;

  o_line_type    := public.item_line_type(o_product_id, false);
  o_stock_effect := public.item_stock_effect(o_product_id, 'out');
END $$;

COMMENT ON FUNCTION public.resolve_sale_line(jsonb) IS
  'يفسّر سطر بيع واحد: الصنف، الكمية، نوع السطر، والأثر المخزني. سياسة الصنف تتقدم على is_service.';

REVOKE ALL ON FUNCTION public.resolve_sale_line(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_sale_line(jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The worker: 7-argument create_sale (policy-driven)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  _warehouse_id uuid,
  _customer_id uuid,
  _payment_method text,
  _paid numeric,
  _discount numeric,
  _note text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id     uuid;
  v_invoice_number text;
  v_user           uuid := auth.uid();
  v_line           record;
  v_subtotal       numeric := 0;
  v_tax_total      numeric := 0;
  v_discount       numeric := coalesce(_discount, 0);
  v_total          numeric := 0;
  v_paid           numeric := 0;
  v_outstanding    numeric := 0;
  v_price          numeric;
  v_tax_rate       numeric;
  v_cost           numeric;
  v_customer_balance numeric;
  v_credit_limit   numeric;
  v_line_total     numeric;
  v_line_tax       numeric;
  v_effect         text;
  v_line_type      text;
  v_sellable       boolean;
  v_status         public.invoice_status;
  v_last_item_id   uuid;
  v_available      numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_role(v_user, 'owner')
    OR public.has_role(v_user, 'manager')
    OR public.has_role(v_user, 'cashier')
  ) THEN
    RAISE EXCEPTION 'You are not permitted to post sales';
  END IF;

  IF _warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required';
  END IF;

  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF _payment_method NOT IN ('cash', 'card', 'bank_transfer', 'credit', 'mobile_money', 'split') THEN
    RAISE EXCEPTION 'Unsupported payment method';
  END IF;

  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Discount cannot be negative';
  END IF;

  IF coalesce(_paid, 0) < 0 THEN
    RAISE EXCEPTION 'Paid amount cannot be negative';
  END IF;

  -- ============================================================== VALIDATION
  -- Only lines whose policy is STOCK_ISSUE are stock-checked. Aggregating by
  -- item and locking the inventory row protects against concurrent checkouts.
  FOR v_line IN
    SELECT r.o_product_id AS product_id, sum(r.o_quantity) AS quantity
    FROM jsonb_array_elements(_items) AS line
    CROSS JOIN LATERAL public.resolve_sale_line(line) AS r
    WHERE r.o_stock_effect = 'STOCK_ISSUE'
    GROUP BY r.o_product_id
    ORDER BY r.o_product_id
  LOOP
    SELECT i.quantity
      INTO v_available
    FROM public.inventory i
    WHERE i.product_id = v_line.product_id
      AND i.warehouse_id = _warehouse_id
      AND i.owner_type = 'COMPANY'
      AND i.owner_id IS NULL
    FOR UPDATE;

    v_available := coalesce(v_available, 0);

    IF v_available < v_line.quantity THEN
      RAISE EXCEPTION
        'Insufficient stock for item %: available %, requested %',
        v_line.product_id, v_available, v_line.quantity
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- Totals. Catalogue price wins for a catalogue item; the operator's price is
  -- used only for ad-hoc service lines.
  FOR v_line IN
    SELECT r.o_product_id    AS product_id,
           r.o_quantity      AS quantity,
           r.o_service_name  AS service_name,
           coalesce((line ->> 'unit_price')::numeric, 0) AS input_price,
           coalesce((line ->> 'tax_rate')::numeric, 0)   AS input_tax
    FROM jsonb_array_elements(_items) AS line
    CROSS JOIN LATERAL public.resolve_sale_line(line) AS r
  LOOP
    IF v_line.quantity IS NULL OR v_line.quantity <= 0 THEN
      RAISE EXCEPTION 'Every sale line requires a positive quantity';
    END IF;

    IF v_line.product_id IS NULL THEN
      IF coalesce(v_line.service_name, '') = '' THEN
        RAISE EXCEPTION 'Every service line requires a description';
      END IF;
      IF v_line.input_price < 0 OR v_line.input_tax < 0 OR v_line.input_tax > 100 THEN
        RAISE EXCEPTION 'Service line "%" has an invalid price or tax rate', v_line.service_name;
      END IF;
      v_price    := v_line.input_price;
      v_tax_rate := v_line.input_tax;
    ELSE
      SELECT p.sale_price, p.tax_rate, p.is_sellable
        INTO v_price, v_tax_rate, v_sellable
      FROM public.products p
      WHERE p.id = v_line.product_id AND p.is_active = true
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Item % is not available for sale', v_line.product_id;
      END IF;

      IF v_sellable IS NOT TRUE THEN
        RAISE EXCEPTION 'Item % is not marked as sellable', v_line.product_id;
      END IF;

      IF v_price < 0 OR v_tax_rate < 0 OR v_tax_rate > 100 THEN
        RAISE EXCEPTION 'Item % has invalid pricing or tax configuration', v_line.product_id;
      END IF;
    END IF;

    v_line_total := round(v_line.quantity * v_price, 2);
    v_subtotal   := v_subtotal + v_line_total;
    v_tax_total  := v_tax_total + round(v_line_total * v_tax_rate / 100, 2);
  END LOOP;

  v_total := round(v_subtotal + v_tax_total - v_discount, 2);
  IF v_discount > v_subtotal + v_tax_total OR v_total < 0 THEN
    RAISE EXCEPTION 'Discount cannot exceed the invoice amount';
  END IF;

  IF _customer_id IS NOT NULL THEN
    SELECT balance, credit_limit
      INTO v_customer_balance, v_credit_limit
    FROM public.customers
    WHERE id = _customer_id AND is_active = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected customer is unavailable';
    END IF;
  END IF;

  -- Tender above the total is change, not revenue and not credit.
  v_paid := least(coalesce(_paid, 0), v_total);
  v_outstanding := round(v_total - v_paid, 2);

  IF v_outstanding > 0 AND _customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer is required when the sale has an unpaid amount';
  END IF;
  IF v_outstanding > 0 AND NOT public.customer_credit_limit_allows(_customer_id, v_outstanding) THEN
    RAISE EXCEPTION
      'Credit limit exceeded: current balance %, requested debt %, limit %',
      coalesce(v_customer_balance, 0), v_outstanding, coalesce(v_credit_limit, 0);
  END IF;

  v_status := CASE
    WHEN v_paid >= v_total THEN 'paid'::public.invoice_status
    WHEN v_paid = 0      THEN 'unpaid'::public.invoice_status
    ELSE 'partial'::public.invoice_status
  END;

  v_invoice_number := public.next_invoice_number();

  INSERT INTO public.sales_invoices (
    invoice_number, customer_id, warehouse_id, status,
    subtotal, discount, tax, total, paid, payment_method, note, created_by
  )
  VALUES (
    v_invoice_number, _customer_id, _warehouse_id, v_status,
    v_subtotal, v_discount, v_tax_total, v_total, v_paid,
    _payment_method::public.payment_method, nullif(btrim(_note), ''), v_user
  )
  RETURNING id INTO v_invoice_id;

  -- ================================================================== POSTING
  FOR v_line IN
    SELECT r.o_product_id   AS product_id,
           r.o_quantity     AS quantity,
           r.o_stock_effect AS stock_effect,
           r.o_service_name AS service_name,
           coalesce((line ->> 'unit_price')::numeric, 0) AS input_price,
           coalesce((line ->> 'tax_rate')::numeric, 0)   AS input_tax,
           nullif(btrim(coalesce(line ->> 'uom_id', '')), '')::uuid AS uom_id
    FROM jsonb_array_elements(_items) AS line
    CROSS JOIN LATERAL public.resolve_sale_line(line) AS r
  LOOP
    v_cost := NULL;

    IF v_line.product_id IS NULL THEN
      v_price     := v_line.input_price;
      v_tax_rate  := v_line.input_tax;
      v_line_type := 'AD_HOC_SERVICE';
      v_effect    := 'NONE';
    ELSE
      SELECT p.sale_price, p.tax_rate, p.cost_price
        INTO v_price, v_tax_rate, v_cost
      FROM public.products p WHERE p.id = v_line.product_id;

      v_line_type := public.item_line_type(v_line.product_id, false);
      -- Re-derive the effect at posting time so a policy change between
      -- validation and posting cannot slip a movement through unannounced.
      v_effect := public.item_stock_effect(v_line.product_id, 'out');

      IF v_effect = 'STOCK_ISSUE' THEN
        PERFORM public.post_stock_delta(
          v_line.product_id,
          _warehouse_id,
          -v_line.quantity,
          v_cost,
          'ISSUE'::public.stock_movement_kind,
          'sales_invoice',
          v_invoice_id,
          'POS sale',
          'COMPANY'::public.owner_type,
          NULL,
          'sale'::public.movement_type
        );
      END IF;
    END IF;

    v_line_total := round(v_line.quantity * v_price, 2);
    v_line_tax   := round(v_line_total * v_tax_rate / 100, 2);

    INSERT INTO public.sales_invoice_items (
      invoice_id, product_id, description, quantity, unit_price, discount, tax, total,
      line_type, stock_effect, uom_id
    )
    VALUES (
      v_invoice_id,
      v_line.product_id,
      CASE WHEN v_line.product_id IS NULL THEN v_line.service_name ELSE NULL END,
      v_line.quantity, v_price, 0, v_line_tax, v_line_total + v_line_tax,
      v_line_type, v_effect, v_line.uom_id
    )
    RETURNING id INTO v_last_item_id;

    IF v_line_type = 'AD_HOC_SERVICE' THEN
      INSERT INTO public.ad_hoc_service_lines (
        invoice_id, invoice_item_id, description, quantity, unit_price,
        discount, tax, total, created_by
      )
      VALUES (
        v_invoice_id, v_last_item_id, v_line.service_name, v_line.quantity,
        v_price, 0, v_line_tax, v_line_total + v_line_tax, v_user
      );
    END IF;
  END LOOP;

  IF v_outstanding > 0 THEN
    UPDATE public.customers
    SET balance = round(coalesce(balance, 0) + v_outstanding, 2), updated_at = now()
    WHERE id = _customer_id;

    INSERT INTO public.customer_ledger (
      customer_id, entry_type, debit, reference_id, reference_type,
      occurred_at, created_by, source_key, note
    )
    VALUES (
      _customer_id, 'sale', v_outstanding, v_invoice_id, 'sales_invoice',
      now(), v_user, 'sale:' || v_invoice_id, 'قيد بيع آجل'
    )
    ON CONFLICT (source_key) DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'sale.posted', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'warehouse_id', _warehouse_id,
      'customer_id', _customer_id,
      'payment_method', _payment_method,
      'total', v_total,
      'paid', v_paid,
      'outstanding', v_outstanding,
      'line_count', jsonb_array_length(_items)
    ));

  RETURN v_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb) IS
  'محرك البيع الموحد. الأثر المخزني يُحدد من سياسة الصنف (STOCK_ISSUE/NONE) وليس من الواجهة.';-- ---------------------------------------------------------------------------
-- 6. The 8-argument overload (sale date) — thin wrapper, no stock logic
-- ---------------------------------------------------------------------------
-- The old version carried its own copy of the service hack and the ledger
-- posting. Now it does exactly two things: delegate the posting, then stamp the
-- business date onto the document and its movements.
CREATE OR REPLACE FUNCTION public.create_sale(
  _warehouse_id uuid,
  _customer_id uuid,
  _payment_method text,
  _paid numeric,
  _discount numeric,
  _note text,
  _items jsonb,
  _sale_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_posted_at  timestamptz;
BEGIN
  IF _sale_date IS NULL THEN
    RAISE EXCEPTION 'Sale date is required';
  END IF;

  IF coalesce(jsonb_typeof(_items), '') <> 'array'
     OR coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- All validation, stock movement, ledger posting and auditing happen here.
  v_invoice_id := public.create_sale(
    _warehouse_id, _customer_id, _payment_method, _paid, _discount, _note, _items
  );

  v_posted_at := _sale_date::timestamp + localtime;

  UPDATE public.sales_invoices
  SET created_at = v_posted_at, updated_at = now()
  WHERE id = v_invoice_id;

  UPDATE public.stock_movements
  SET created_at = v_posted_at
  WHERE source_type = 'sales_invoice' AND source_id = v_invoice_id;

  RETURN v_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date) TO authenticated;

COMMENT ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date) IS
  'يسجّل البيع عبر المحرك الموحد ثم يثبّت التاريخ التجاري على الفاتورة وحركاتها.';

-- ---------------------------------------------------------------------------
-- 7. The 9-argument overload (tender breakdown) — delegates, then splits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale(
  _warehouse_id uuid,
  _customer_id uuid,
  _payment_method text,
  _paid numeric,
  _discount numeric,
  _note text,
  _items jsonb,
  _sale_date date,
  _payment_splits jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id         uuid;
  v_total              numeric;
  v_paid               numeric;
  v_user               uuid := auth.uid();
  v_split              record;
  v_component_count    integer := 0;
  v_split_total        numeric := 0;
  v_distinct_methods   integer := 0;
  v_single_method      text;
  v_recorded_method    text := _payment_method;
BEGIN
  IF coalesce(jsonb_typeof(_payment_splits), 'jsonb') <> 'array'
     OR coalesce(jsonb_array_length(_payment_splits), 0) = 0 THEN
    -- No breakdown supplied: exact legacy behaviour.
    RETURN public.create_sale(
      _warehouse_id, _customer_id, _payment_method, _paid, _discount, _note, _items, _sale_date
    );
  END IF;

  FOR v_split IN
    SELECT (part ->> 'method') AS method,
           coalesce((part ->> 'amount')::numeric, 0) AS amount
    FROM jsonb_array_elements(_payment_splits) AS part
  LOOP
    IF v_split.method IS NULL
      OR v_split.method NOT IN ('cash', 'card', 'bank_transfer', 'mobile_money', 'split') THEN
      RAISE EXCEPTION 'Unsupported payment method: %', v_split.method;
    END IF;
    IF v_split.amount <= 0 THEN
      RAISE EXCEPTION 'Every payment tender component requires a positive amount';
    END IF;

    v_component_count := v_component_count + 1;
    v_split_total := v_split_total + v_split.amount;
  END LOOP;

  SELECT count(DISTINCT part ->> 'method'), min(part ->> 'method')
    INTO v_distinct_methods, v_single_method
  FROM jsonb_array_elements(_payment_splits) AS part;

  -- The tender breakdown and the paid amount must agree, otherwise the invoice
  -- and the recorded payments would drift apart.
  IF round(v_split_total, 2) <> round(coalesce(_paid, 0), 2) THEN
    RAISE EXCEPTION
      'Payment breakdown total % does not match the paid amount %',
      round(v_split_total, 2), round(coalesce(_paid, 0), 2);
  END IF;

  v_recorded_method := CASE
    WHEN v_distinct_methods > 1 THEN 'split'
    ELSE v_single_method
  END;

  v_invoice_id := public.create_sale(
    _warehouse_id, _customer_id, v_recorded_method, _paid, _discount, _note, _items, _sale_date
  );

  SELECT total, paid INTO v_total, v_paid FROM public.sales_invoices WHERE id = v_invoice_id;

  UPDATE public.sales_invoices
  SET payment_method = v_recorded_method::public.payment_method, updated_at = now()
  WHERE id = v_invoice_id
    AND payment_method IS DISTINCT FROM v_recorded_method::public.payment_method;

  FOR v_split IN
    SELECT (part ->> 'method') AS method,
           coalesce((part ->> 'amount')::numeric, 0) AS amount
    FROM jsonb_array_elements(_payment_splits) AS part
  LOOP
    INSERT INTO public.customer_payment_splits (
      customer_id, invoice_id, method, amount, occurred_at, created_by
    )
    VALUES (
      _customer_id, v_invoice_id, v_split.method::public.payment_method,
      round(v_split.amount, 2),
      coalesce(_sale_date, current_date)::timestamp + localtime,
      v_user
    );
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'sale.tender_breakdown.recorded', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'recorded_payment_method', v_recorded_method,
      'components', v_component_count,
      'tender_total', round(v_split_total, 2),
      'total', v_total,
      'paid', v_paid
    ));

  RETURN v_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date, jsonb) IS
  'يسجّل البيع عبر المحرك الموحد ثم يثبّت تفصيل وسائل الدفع في customer_payment_splits.';

-- ---------------------------------------------------------------------------
-- 8. Sales returns must respect the same policy
-- ---------------------------------------------------------------------------
-- A returned SERVICE or UNTRACKED good must not create stock, exactly like its
-- sale did not remove any. This closes the same hole on the return path.
CREATE OR REPLACE FUNCTION public.create_sales_return(
  _invoice_id uuid,
  _warehouse_id uuid,
  _customer_id uuid,
  _refund_method text,
  _note text,
  _items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id        uuid;
  v_no        text;
  v_user      uuid := auth.uid();
  v_item      jsonb;
  v_sub       numeric := 0;
  v_tax       numeric := 0;
  v_tot       numeric := 0;
  v_qty       numeric;
  v_price     numeric;
  v_tr        numeric;
  v_lt        numeric;
  v_ltax      numeric;
  v_p         uuid;
  v_effect    text;
  v_type      text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff(v_user) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF coalesce(jsonb_array_length(_items), 0) = 0 THEN
    RAISE EXCEPTION 'No items';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_qty   := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price')::numeric;
    v_tr    := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_lt    := v_qty * v_price;
    v_ltax  := v_lt * v_tr / 100;
    v_sub   := v_sub + v_lt;
    v_tax   := v_tax + v_ltax;
  END LOOP;
  v_tot := v_sub + v_tax;
  v_no  := public.next_sales_return_number();

  INSERT INTO public.sales_returns (
    return_number, invoice_id, customer_id, warehouse_id,
    subtotal, tax, total, refund_method, note, created_by
  )
  VALUES (
    v_no, _invoice_id, _customer_id, _warehouse_id,
    v_sub, v_tax, v_tot, _refund_method::public.payment_method,
    nullif(btrim(_note), ''), v_user
  )
  RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_p     := (v_item ->> 'product_id')::uuid;
    v_qty   := (v_item ->> 'quantity')::numeric;
    v_price := (v_item ->> 'unit_price')::numeric;
    v_tr    := coalesce((v_item ->> 'tax_rate')::numeric, 0);
    v_lt    := v_qty * v_price;
    v_ltax  := v_lt * v_tr / 100;

    v_type   := public.item_line_type(v_p, false);
    v_effect := public.item_stock_effect(v_p, 'in');

    INSERT INTO public.sales_return_items (
      return_id, product_id, quantity, unit_price, tax, total, line_type
    )
    VALUES (v_id, v_p, v_qty, v_price, v_ltax, v_lt + v_ltax, v_type);

    -- Only a tracked good comes back into stock.
    IF v_effect = 'STOCK_RECEIPT' THEN
      PERFORM public.post_stock_delta(
        v_p,
        _warehouse_id,
        v_qty,
        v_price,
        'RECEIPT'::public.stock_movement_kind,
        'sales_return',
        v_id,
        'Sales return',
        'COMPANY'::public.owner_type,
        NULL,
        'return_in'::public.movement_type
      );
    END IF;
  END LOOP;

  IF _customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET balance = greatest(balance - v_tot, 0), updated_at = now()
    WHERE id = _customer_id;

    INSERT INTO public.customer_ledger (
      customer_id, entry_type, credit, reference_id, reference_type,
      occurred_at, created_by, source_key, note
    )
    VALUES (
      _customer_id, 'return', round(v_tot, 2), v_id, 'sales_return',
      now(), v_user, 'return:' || v_id, 'مرتجع مبيعات'
    )
    ON CONFLICT (source_key) DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'sales_return.posted', 'sales_return', v_id,
    jsonb_build_object(
      'return_number', v_no,
      'invoice_id', _invoice_id,
      'customer_id', _customer_id,
      'total', v_tot
    ));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_sales_return(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sales_return(uuid, uuid, uuid, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_sales_return(uuid, uuid, uuid, text, text, jsonb) IS
  'مرتجع مبيعات: لا يعيد للمخزون إلا الأصناف المتتبعة فقط.';