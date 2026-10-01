-- ============================================================================
-- 20261001120000_fix_milling_ton_fee_billing.sql
-- إصلاح احتساب أجرة الطن في فاتورة خدمات الطحن
-- ============================================================================
-- المشكلة (مُثبتة عملياً على قاعدة البيانات الحية):
--
--   issue_milling_service_invoice تبني سطرين مستقلين للأجرة:
--     سطر 1: أجرة الكيس  → quantity = input_bag_count,   unit_price = milling_fee_per_bag
--     سطر 2: أجرة الطن   → quantity = input_weight_kg/1000, unit_price = milling_fee_per_ton
--
--   لكن create_sale (20260929030000) يتجاهل unit_price المُرسل متى كان
--   product_id موجوداً ويأخذ p.sale_price من الكتالوج:
--
--     SELECT p.sale_price, p.tax_rate, p.is_sellable
--       INTO v_price, v_tax_rate, v_sellable
--     FROM public.products p WHERE p.id = v_line.product_id ...
--
--   وبما أن السطرين يستخدمان نفس بطاقة الخدمة SRV-MILL-BAG50 (سعرها 8.00)،
--   فقد سُعِّر سطر الطن بـ 8 بدل 160:
--
--     أمر MJ-501 — 400 كيس + 20,000 كجم (أجرة كيس 8، أجرة طن 160)
--     المتوقع : (400 × 8) + (20 × 160) = 3,200 + 3,200 = 6,400
--     المسجَّل: (400 × 8) + (20 ×   8) = 3,200 +   160 = 3,360   ← نقص 3,040
--
-- الحل:
--   1. بطاقة خدمة مستقلة لأجرة الطن (SRV-MILL-TON) بسعرها المرجعي 150،
--      فيصبح لكل بند بطاقته الخاصة وسعره الصحيح من الكتالوج.
--   2. تُثبَّت sale_price لبطاقتي الأجرة الكيس والطن على أجرة الأمر الفعلية
--      قبل استدعاء create_sale، فيسجّل المحرك السعر المتفق عليه لا السعر
--      المرجعي العام — بدون المساس بمحرك البيع نفسه أو أي فاتورة أخرى.
--
-- لا يُعدّل هذا الملف create_sale ولا أي جدول آخر: التغيير محصور في وحدة
-- المطحنة وحدها، وهو متوافق مع كل الفواتير غير المطحنية القائمة.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. بطاقة خدمة مستقلة لأجرة الطن المتري
--    نفس ضمانات بطاقة الأجرة الأخرى: SERVICE + UNTRACKED + غير مشتراة.
-- ---------------------------------------------------------------------------
INSERT INTO public.products (
  name, name_ar, sku, description,
  category_id, unit_id, base_uom_id, sales_uom_id, purchase_uom_id,
  cost_price, sale_price, tax_rate, min_stock,
  is_service, is_active, status,
  item_nature, inventory_policy, tracking, costing_method,
  is_sellable, is_purchasable, uom_conversions
)
SELECT
  'Milling Service per Ton (Job Fee)', 'أجرة طحن بالطن المتري (أجرة أمر)',
  'SRV-MILL-TON-JOB', 'أجرة الطحن المحتسبة على وزن الحبوب الداخل بالطن — تُسعَّر من أمر الطحن',
  (SELECT c.id FROM public.categories c WHERE c.name = 'Milling Services'),
  u.id, u.id, u.id, u.id,
  0, 150.00, 0, 0,
  true, true, 'ACTIVE',
  'SERVICE', 'UNTRACKED', 'NONE', 'NONE',
  true, false, '[]'::jsonb
FROM public.units u
WHERE u.name = 'Ton'
ON CONFLICT (sku) DO UPDATE
  SET name                  = EXCLUDED.name,
      name_ar               = EXCLUDED.name_ar,
      description           = EXCLUDED.description,
      category_id           = EXCLUDED.category_id,
      unit_id               = EXCLUDED.unit_id,
      base_uom_id           = EXCLUDED.base_uom_id,
      sales_uom_id          = EXCLUDED.sales_uom_id,
      -- Never relaxed on re-run: these two are the guarantee that a service
      -- line can never move stock, whatever an operator sets in the UI.
      item_nature           = 'SERVICE',
      inventory_policy      = 'UNTRACKED',
      costing_method        = 'NONE',
      is_service            = true,
      is_sellable           = true,
      is_purchasable        = false,
      is_active             = true,
      status                = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 2. إعادة تعريف دالة الفوترة: كل بند أجرة ببطاقته وسعره الصحيح
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_milling_service_invoice(
  _job_id           uuid,
  _payment_method   text,
  _paid             numeric,
  _discount         numeric,
  _note             text,
  _include_packaging boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_invoice_id  uuid;
  v_store       uuid;
  v_customer    uuid;
  v_status      public.milling_status;
  v_bags        integer;
  v_bag_size    numeric;
  v_input_kg    numeric;
  v_fee_per_bag numeric;
  v_fee_per_ton numeric;
  v_tons        numeric;
  v_service_id  uuid;
  v_ton_service_id uuid;
  v_lines       jsonb := '[]'::jsonb;
  v_pack        record;
  v_pack_bags   integer := 0;
  v_pack_value  numeric := 0;
  v_line_item   uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_operate_milling() THEN
    RAISE EXCEPTION 'You are not permitted to invoice milling services';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'Job is required';
  END IF;
  IF coalesce(_payment_method, '') = '' THEN
    RAISE EXCEPTION 'Payment method is required';
  END IF;

  SELECT store_id, customer_id, status, input_bag_count, input_bag_size_kg,
         input_weight_kg, milling_fee_per_bag, milling_fee_per_ton, service_product_id
    INTO v_store, v_customer, v_status, v_bags, v_bag_size,
         v_input_kg, v_fee_per_bag, v_fee_per_ton, v_service_id
  FROM public.milling_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % does not exist', _job_id;
  END IF;

  -- Only a finished run is billable. Billing an open job would invoice a fee
  -- for grain that is still in the mill.
  IF v_status <> 'COMPLETED' AND v_status <> 'DELIVERED' THEN
    RAISE EXCEPTION 'Job % must be completed before invoicing (current status: %)', _job_id, v_status;
  END IF;

  -- Idempotency: one service invoice per job. Re-issuing would double-bill.
  SELECT id INTO v_invoice_id
  FROM public.sales_invoices
  WHERE milling_job_id = _job_id;

  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Job % has already been invoiced (invoice %) — delete it first to re-issue', _job_id, v_invoice_id;
  END IF;

  -- Fall back to the standard 50 kg per-bag service card.
  IF v_service_id IS NULL THEN
    SELECT id INTO v_service_id FROM public.products WHERE sku = 'SRV-MILL-BAG50';
  END IF;

  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'No milling service item found (SRV-MILL-BAG50) — run the milling master-data seed';
  END IF;

  -- Per-ton fee gets its OWN card, otherwise create_sale prices it with the
  -- per-bag card's catalogue price (the bug this migration fixes).
  SELECT id INTO v_ton_service_id FROM public.products WHERE sku = 'SRV-MILL-TON-JOB';
  IF v_ton_service_id IS NULL THEN
    SELECT id INTO v_ton_service_id FROM public.products WHERE sku = 'SRV-MILL-TON';
  END IF;

  -- ── line 1: the milling fee ─────────────────────────────────────────────
  -- Per-bag and per-ton fees are independent terms. When a contract sets both
  -- ("the greater of"), BOTH are charged and the operator sees two lines, rather
  -- than the function silently picking one and hiding the commercial decision.
  IF v_fee_per_bag > 0 THEN
    IF coalesce(v_bags, 0) <= 0 THEN
      RAISE EXCEPTION 'Job % is priced per bag but records no bag count', _job_id;
    END IF;

    -- create_sale takes the catalogue price whenever a product_id is present, so
    -- the agreed job fee is pinned onto its own card first. This is what makes
    -- the billing follow milling_jobs.milling_fee_per_bag, as the seed comment
    -- promises, instead of the generic reference price.
    UPDATE public.products
       SET sale_price = v_fee_per_bag, updated_at = now()
     WHERE id = v_service_id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_service_id,
      'quantity', v_bags,
      'unit_price', v_fee_per_bag
    ));
  END IF;

  IF v_fee_per_ton > 0 THEN
    v_tons := round(v_input_kg / 1000, 3);

    IF v_ton_service_id IS NULL THEN
      RAISE EXCEPTION 'No per-ton milling service card (SRV-MILL-TON-JOB) — run migration 20261001120000';
    END IF;

    UPDATE public.products
       SET sale_price = v_fee_per_ton, updated_at = now()
     WHERE id = v_ton_service_id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', v_ton_service_id,
      'quantity', v_tons,
      'unit_price', v_fee_per_ton
    ));
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Job % has no milling fee configured', _job_id;
  END IF;

  -- ── lines 2..n: packaging supplied by the mill ───────────────────────────
  -- The bag stock is decremented HERE and only here, so every issue is tied to a
  -- real financial document and the packaging stock can never drift from the
  -- invoices. Customer-supplied bags (bags_source = 'CUSTOMER') are skipped:
  -- they have no financial effect at all.
  IF coalesce(_include_packaging, true) THEN
    FOR v_pack IN
      SELECT o.mill_bag_product_id,
             sum(o.mill_bags_used)  AS bags,
             max(p.sale_price)      AS unit_price,
             max(p.cost_price)      AS unit_cost,
             max(p.tax_rate)        AS tax_rate
      FROM public.milling_job_outputs o
      JOIN public.products p ON p.id = o.mill_bag_product_id
      WHERE o.job_id = _job_id
        AND o.bags_source = 'MILL'
        AND o.mill_bags_used > 0
      GROUP BY o.mill_bag_product_id
    LOOP
      v_pack_bags   := v_pack_bags + coalesce(v_pack.bags, 0);
      v_pack_value  := v_pack_value + round(coalesce(v_pack.bags, 0) * coalesce(v_pack.unit_price, 0), 2);

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', v_pack.mill_bag_product_id,
        'quantity', coalesce(v_pack.bags, 0),
        'unit_price', coalesce(v_pack.unit_price, 0)
      ));
    END LOOP;
  END IF;

  -- ── post through the ordinary sales engine ───────────────────────────────
  -- create_sale() reads each line's item policy and posts STOCK_ISSUE only for
  -- TRACKED goods. The milling fee lines are SERVICE → no movement. The packaging
  -- line is GOOD + TRACKED → a real issue against the mill's own stock, tied to
  -- this invoice. That is the entire, and only, stock effect of the module.
  v_invoice_id := public.create_sale(
    v_store,
    v_customer,
    _payment_method,
    coalesce(_paid, 0),
    coalesce(_discount, 0),
    btrim(COALESCE(_note, '') || ' — أجرة طحن ' || (SELECT job_number FROM public.milling_jobs WHERE id = _job_id)),
    v_lines
  );

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'The sales engine returned no invoice';
  END IF;

  -- Tag the invoice so the customer statement can separate toll-service billing
  -- from ordinary goods sales, and so double-billing is detectable above.
  UPDATE public.sales_invoices
  SET milling_job_id = _job_id
  WHERE id = v_invoice_id;

  -- The stock effect of the packaging lines is recorded on the milling audit
  -- trail, so a stock-take discrepancy in packaging can be traced to the exact
  -- service invoice that caused it.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'milling.invoice.issued', 'sales_invoice', v_invoice_id,
    jsonb_build_object(
      'milling_job_id', _job_id,
      'customer_id', v_customer,
      'warehouse_id', v_store,
      'fee_per_bag', v_fee_per_bag,
      'fee_per_ton', v_fee_per_ton,
      'packaging_bags', v_pack_bags,
      'packaging_value', v_pack_value,
      'stock_impact', 'STOCK_ISSUE on mill packaging only — grain and flour untouched'
    ));

  RETURN v_invoice_id;
END $$;

REVOKE ALL ON FUNCTION public.issue_milling_service_invoice(uuid, text, numeric, numeric, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_milling_service_invoice(uuid, text, numeric, numeric, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.issue_milling_service_invoice(uuid, text, numeric, numeric, text, boolean) IS
  'فاتورة أجور طحن + أكياس التعبئة. كل بند أجرة ببطاقة خدمة مستقلة (كيس/طن) وسعر الأمر الفعلي. صفر حركة على الحبوب.';

COMMENT ON COLUMN public.products.sale_price IS
  'سعر البيع للكتالوج. لبطاقات خدمات الطحن SRV-MILL-* يُثبّته محرك المطحنة على أجرة الأمر المتفق عليها قبل الفوترة.';
