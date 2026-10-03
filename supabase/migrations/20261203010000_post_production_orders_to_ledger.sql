-- ============================================================================
-- 20261203010000_post_production_orders_to_ledger.sql
--
-- THE DOCUMENT THAT GIVES MEANING TO THE OTHER TWO
-- ------------------------------------------------
-- Sales without purchases show an asset appearing from nowhere. Purchases
-- without production show wheat that never became anything. Production is the
-- step where raw material turns into goods and a mill's costs are actually
-- incurred, so it is where a ledger either starts to be true or keeps being
-- decorative.
--
-- TWO ENTRIES, AND WHY NOT ONE
-- ---------------------------
-- Entry A, when material is issued:
--     Dr 1312   production in progress
--         Cr 1311 / 1313 / 1315   the inventory consumed
--
-- Entry B, when the order closes:
--     Dr 1313 / 1314   the outputs, at their allocated cost
--     Dr 5911          production loss
--         Cr 1312                  the work in progress cleared
--         Cr 5211                  direct labour
--         Cr 5311                  overhead
--
-- Production in progress is a real balance, not a formality. An order that
-- runs for two days has consumed grain on day one and produced nothing, and
-- until it closes that cost is an asset sitting in a silo being turned into
-- flour. Without a WIP account the cost vanishes for those two days and then
-- reappears.
--
-- THE LOSS IS A NAMED LINE, NOT A RESIDUAL
-- ----------------------------------------
-- Dr 5911 is computed as total production cost minus the allocated output
-- value, and it is placed on its own line of its own entry. This was the whole
-- argument for routing production through WIP, and it deserves to be stated
-- precisely: because the loss is derived and named rather than absorbed into
-- an output's unit cost, it cannot be quietly spread across the flour. If the
-- mill loses 40 kilos to moisture and dust, the ledger says so in riyals, on
-- the face of the entry, and the loss is expensed in the period it happened -
-- not buried in a moving average, and not deferred to some future write-off.
--
-- If an order consumed material and produced nothing, the whole material cost
-- falls to 5911. That is correct, not an edge case: a total write-off is the
-- honest description of what happened.
--
-- BRAN IS CREDITED, NOT ABSORBED
-- ------------------------------
-- The allocation basis was decided when the production engine was built and
-- is recorded on each order. Under the default REMAINDER_TO_PRIMARY, bran
-- carries no cost and the flour line absorbs the whole production cost - the
-- conservative choice, and a visible one. The ledger simply follows whatever
-- the order says, so changing the basis changes the books and nothing else.
--
-- NON-DESTRUCTIVE: one function and one view. No production order, movement or
-- cost layer is touched. Posting is opt-in.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_production_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_ord     record;
  v_existing uuid;
  v_entry_a uuid;
  v_entry_b uuid;
  v_lines_a jsonb := '[]'::jsonb;
  v_lines_b jsonb := '[]'::jsonb;
  v_material numeric := 0;
  v_output  numeric := 0;
  v_loss    numeric;
  r         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may post a production order';
  END IF;

  SELECT * INTO v_ord FROM public.production_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  IF v_ord.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Order % is % - only a completed order has a cost to post',
      v_ord.order_number, v_ord.status;
  END IF;

  SELECT id INTO v_existing
    FROM public.journal_entries
   WHERE source_type = 'production_order' AND source_id = p_order_id
     AND status <> 'REVERSED';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Order % has already been posted to the ledger', v_ord.order_number;
  END IF;

  v_material := coalesce((SELECT sum(total_cost) FROM public.production_order_materials
                           WHERE order_id = p_order_id), 0);
  v_output   := coalesce((SELECT sum(total_cost) FROM public.production_order_outputs
                           WHERE order_id = p_order_id), 0);

  -- The loss is what the order cost beyond what it produced. It is derived
  -- here and named on its own line below, never spread into an output.
  v_loss := round(v_ord.total_cost - v_output, 2);

  IF v_loss < -0.01 THEN
    RAISE EXCEPTION
      'Order % reports more output cost (%.2f) than total cost (%.2f). The costing is inconsistent.',
      v_ord.order_number, v_output, v_ord.total_cost;
  END IF;

  -- ── Entry A: material into work in progress ──
  FOR r IN
    SELECT p.item_class, sum(m.total_cost) AS amount
      FROM public.production_order_materials m
      JOIN public.products p ON p.id = m.product_id
     WHERE m.order_id = p_order_id
     GROUP BY p.item_class
    HAVING sum(m.total_cost) <> 0
  LOOP
    v_lines_a := v_lines_a || jsonb_build_object(
      'account_code', '1312', 'debit', round(r.amount, 2),
      'memo', 'إنتاج تحت التنفيذ — ' || r.item_class);
    v_lines_a := v_lines_a || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'RAW_MATERIAL' THEN '1311'
                        WHEN 'BY_PRODUCT'   THEN '1314'
                        WHEN 'FINISHED_GOOD' THEN '1313'
                        ELSE '1315' END,
      'credit', round(r.amount, 2),
      'memo', 'صرف مواد إنتاج');
  END LOOP;

  -- ── Entry B: outputs out, loss expensed, conversion costs recognised ──
  FOR r IN
    SELECT p.item_class, sum(o.total_cost) AS amount
      FROM public.production_order_outputs o
      JOIN public.products p ON p.id = o.product_id
     WHERE o.order_id = p_order_id
     GROUP BY p.item_class
    HAVING sum(o.total_cost) <> 0
  LOOP
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'BY_PRODUCT' THEN '1314'
                        ELSE '1313' END,
      'debit', round(r.amount, 2),
      'memo', 'ناتج إنتاج — ' || r.item_class);
  END LOOP;

  IF v_loss > 0.01 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5911', 'debit', v_loss,
      'memo', 'فاقد إنتاج ' || v_ord.order_number);
  END IF;

  IF v_material <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '1312', 'credit', round(v_material, 2),
      'memo', 'إقفال إنتاج تحت التنفيذ');
  END IF;

  IF v_ord.direct_labour <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5211', 'credit', round(v_ord.direct_labour, 2),
      'memo', 'أجور عمالة مباشرة');
  END IF;

  IF v_ord.overhead_cost <> 0 THEN
    v_lines_b := v_lines_b || jsonb_build_object(
      'account_code', '5311', 'credit', round(v_ord.overhead_cost, 2),
      'memo', 'مصروفات تشغيل غير مباشرة');
  END IF;

  IF jsonb_array_length(v_lines_b) = 0 THEN
    RAISE EXCEPTION 'Order % has nothing to post - no cost was allocated to any output',
      v_ord.order_number;
  END IF;

  IF jsonb_array_length(v_lines_a) > 0 THEN
    v_entry_a := public.create_journal_entry(
      'أمر إنتاج ' || v_ord.order_number || ' — صرف مواد',
      v_ord.production_date, 'production_order_materials', p_order_id, true, v_lines_a);
  END IF;

  v_entry_b := public.create_journal_entry(
    'أمر إنتاج ' || v_ord.order_number || ' — إقفال وتكلفة',
    v_ord.production_date, 'production_order', p_order_id, true, v_lines_b);

  RETURN v_entry_b;
END $$;

REVOKE ALL ON FUNCTION public.post_production_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_production_order(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.post_production_order(uuid) IS
  'يرحّل أمر إنتاج مكتمل بقيدين: المواد إلى 1312، ثم النواتج إلى المخزون والفاقد إلى 5911 '
  'مع إقفال 1312 والاعتراف بالأجور والمصاريف. الفاقد بند مُسمّى لا فرق مُستوعَب.';

-- ── the payoff: production, its loss in riyals, and its ledger state ────────
DROP VIEW IF EXISTS public.production_ledger_status;
CREATE VIEW public.production_ledger_status
  WITH (security_invoker = true) AS
SELECT o.id AS order_id,
       o.order_number,
       o.production_date,
       o.status,
       o.allocation_basis,
       o.material_cost,
       o.direct_labour,
       o.overhead_cost,
       o.total_cost,
       coalesce(outs.output_cost, 0)                       AS output_cost,
       -- The number the whole WIP routing exists to produce: what the
       -- production actually destroyed, in riyals rather than in kilos.
       round(o.total_cost - coalesce(outs.output_cost, 0), 2) AS loss_value,
       o.actual_input_qty,
       o.actual_output_qty,
       je.id                                             AS journal_entry_id,
       je.entry_number,
       CASE WHEN je.id IS NOT NULL THEN 'POSTED'
            WHEN o.status = 'COMPLETED' THEN 'NOT_POSTED'
            ELSE 'NOT_POSTABLE' END                      AS ledger_state
  FROM public.production_orders o
  LEFT JOIN LATERAL (
    SELECT sum(total_cost) AS output_cost
      FROM public.production_order_outputs po WHERE po.order_id = o.id
  ) outs ON true
  LEFT JOIN public.journal_entries je
         ON je.source_type = 'production_order' AND je.source_id = o.id
        AND je.status <> 'REVERSED';

COMMENT ON VIEW public.production_ledger_status IS
  'أوامر الإنتاج مع قيمة الفاقد بالريال وحالة الترحيل. loss_value هي ما كلّفته العملية ولم '
  'تنتجه — وهذا هو السبب في وجود حساب 1312.';

REVOKE ALL ON public.production_ledger_status FROM anon;
GRANT SELECT ON public.production_ledger_status TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.production_ledger_status;
-- DROP FUNCTION IF EXISTS public.post_production_order(uuid);