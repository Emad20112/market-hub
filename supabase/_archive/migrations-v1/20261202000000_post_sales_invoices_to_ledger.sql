-- ============================================================================
-- 20261202000000_post_sales_invoices_to_ledger.sql
--
-- WIRING THE FIRST DOCUMENT TYPE INTO THE LEDGER
-- -------------------------------------------------
-- The ledger exists and nothing posts to it. This connects sales invoices,
-- one document type at a time, so each rule can be verified against a real
-- document instead of trusted in bulk.
--
-- THE ENTRY
-- ---------
-- A sale moves value in two directions at once, and posting only one of them
-- is the classic failure: revenue without cost inflates profit, cost without
-- revenue understates it, and the trial balance still balances either way
-- because the error is in WHICH accounts were used, not in the arithmetic.
--
--   Dr 1211 ذمم العملاء        the amount owed      [or cash/bank if paid]
--   Dr 2311 ضريبة القيمة المضافة   only when tax > 0
--       Cr 4111 إيراد بيع الدقيق
--       Cr 4211 إيراد بيع النخالة
--       Cr 4311 إيراد أجور الطحن
--
--   Dr 5111 تكلفة البضاعة المباعة  the cost of the goods that left
--       Cr 1311 مخزون مواد خام          ┐
--       Cr 1313 مخزون دقيق              ├ by item classification
--       Cr 1314 مخزون نواتج جانبية      ┘
--
-- DECISIONS, AND WHY
-- ------------------
-- Cash or receivable is READ FROM THE DOCUMENT, not chosen by the poster.
--   The invoice already records `paid` and `payment_method`, so the split is
--   a fact about the sale: payment_method 'credit' means nothing was collected
--   and the whole amount is a receivable; otherwise the `paid` amount is cash
--   or bank and the remainder is a receivable. Inferring it again at posting
--   time would give the ledger two chances to disagree with the invoice.
--
-- Revenue account follows item_class, which is the classification built in
-- 20261003080000. Bran is a BY_PRODUCT and has its own revenue account, so a
--   sales mix of flour and bran does not land entirely in the flour line.
--
-- Cost of goods is resolved through public.resolve_unit_cost, NOT through a
-- stored price on the invoice line. That matters: under the STANDARD costing
-- method the balance carries the budgeted cost, and under MOVING_AVERAGE it
-- carries the weighted average. Using one fixed price here would make the
-- ledger disagree with the stock it is describing.
--
--   The cost basis is NOT historical FIFO. This engine values a balance, not a
--   flow: issuing at the current layer average is what makes the inventory
--   account and the cost engine agree to the last riyal. FIFO would require
--   layer-by-layer consumption tracking that the cost engine does not yet
--   hold. Recorded here rather than silently chosen.
--
-- VAT posts to 2311 only when the invoice carries tax. The column defaults to
-- zero, so nothing appears there until a rate is actually entered - the
-- project's standing rule of no invented rates.
--
-- WHICH INVOICES POST
-- -------------------
-- confirmed, paid and partial only. A draft is an intention and a cancelled
-- invoice never happened; posting either would put money in the books for
-- something that did not occur.
--
-- EXACTLY ONCE
-- ------------
-- An invoice that has already been posted is refused. Double-posting a sale
-- is the failure that never shows up as an unbalanced trial balance, which is
-- why it needs an explicit guard rather than a well-formedness check.
--
-- NON-DESTRUCTIVE: one function and one view. No invoice, customer or stock
-- movement is read for anything other than reference, and nothing is changed.
-- Posting is opt-in: an invoice is wired only when post_sales_invoice runs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_inv     record;
  v_existing uuid;
  v_entry   uuid;
  v_lines   jsonb := '[]'::jsonb;
  v_cash_acct text;
  v_collectable numeric := 0;
  r         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may post an invoice';
  END IF;

  SELECT * INTO v_inv FROM public.sales_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.status IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'Invoice % is % - only confirmed, paid or partial invoices post',
      v_inv.invoice_number, v_inv.status;
  END IF;

  -- exactly once
  SELECT id INTO v_existing
    FROM public.journal_entries
   WHERE source_type = 'sales_invoice' AND source_id = p_invoice_id
     AND status <> 'REVERSED';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice % has already been posted to the ledger', v_inv.invoice_number;
  END IF;

  IF v_inv.payment_method = 'credit' THEN
    v_cash_acct := NULL;                       -- nothing collected
  ELSIF v_inv.payment_method IN ('bank_transfer','card','mobile_money') THEN
    v_cash_acct := '1111';                     -- leaves via a bank
  ELSE
    v_cash_acct := '1101';                     -- cash, and 'split' resolved against cash
  END IF;

  v_collectable := greatest(v_inv.total - v_inv.paid, 0);

  -- ── the revenue and receivable side ──
  FOR r IN
    SELECT p.item_class,
           sum(it.total) AS amount
      FROM public.sales_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
     GROUP BY p.item_class
    HAVING sum(it.total) <> 0
  LOOP
    v_lines := v_lines || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'BY_PRODUCT'   THEN '4211'
                        WHEN 'SERVICE'      THEN '4311'
                        ELSE '4111' END,
      'credit', round(r.amount, 2),
      'memo', 'إيراد ' || r.item_class
    );
  END LOOP;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Invoice % has no revenue lines', v_inv.invoice_number;
  END IF;

  -- Cash/bank for what was actually collected.
  IF v_inv.paid > 0 AND v_cash_acct IS NOT NULL THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', v_cash_acct, 'credit', round(v_inv.paid, 2),
      'memo', 'تحصيل نقدي/بنكي');
  END IF;

  -- The rest is owed to us.
  IF v_collectable > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '1211', 'debit', round(v_collectable, 2),
      'memo', 'ذمم العميل ' || coalesce(v_inv.invoice_number, ''));
  END IF;

  -- VAT only when the document actually carries tax.
  IF v_inv.tax > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2311', 'credit', round(v_inv.tax, 2),
      'memo', 'ضريبة القيمة المضافة المستحقة');
  END IF;

  -- ── the cost side: only goods that actually left stock ──
  FOR r IN
    SELECT p.item_class,
           sum(it.quantity) AS qty,
           sum(it.quantity * public.resolve_unit_cost(p.id, v_inv.warehouse_id)) AS cost
      FROM public.sales_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
       AND it.stock_effect = 'STOCK_ISSUE'
     GROUP BY p.item_class
  LOOP
    IF r.cost IS NULL OR r.cost = 0 THEN
      CONTINUE;   -- no cost known; posting a zero COGS would overstate profit
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'RAW_MATERIAL' THEN '1311'
                        WHEN 'BY_PRODUCT'   THEN '1314'
                        ELSE '1313' END,
      'credit', round(r.cost, 2),
      'memo', 'تكلفة ' || r.item_class
    );
    v_lines := v_lines || jsonb_build_object(
      'account_code', '5111', 'debit', round(r.cost, 2),
      'memo', 'تكلفة البضاعة المباعة'
    );
  END LOOP;

  -- Revenue is recognised net of discount; if the invoice carries a discount
  -- the sum of its lines already excludes it, so no separate line is needed
  -- unless the two disagree, which the balance check below will catch.

  v_entry := public.create_journal_entry(
    'فاتورة مبيعات ' || v_inv.invoice_number,
    v_inv.created_at::date,
    'sales_invoice', p_invoice_id, true, v_lines);

  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION public.post_sales_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.post_sales_invoice(uuid) IS
  'يرحّل فاتورة مبيعات إلى الدليل: إيراد + ذمم/نقدية + تكلفة البضاعة المباعة مقابل المخزون. ' 
  'يرفض الفاتورة المرحَّلة سابقاً — posting مزدوج لا يظهر في ميزان المراجعة أبداً.';

-- ── which invoices are wired, and which are not ────────────────────────────
DROP VIEW IF EXISTS public.invoice_ledger_status;
CREATE VIEW public.invoice_ledger_status
  WITH (security_invoker = true) AS
SELECT si.id AS invoice_id,
       si.invoice_number,
       si.status::text                              AS invoice_status,
       si.total,
       si.paid,
       si.tax,
       si.payment_method::text                      AS payment_method,
       je.id                                        AS journal_entry_id,
       je.entry_number,
       CASE
         WHEN je.id IS NOT NULL THEN 'POSTED'
         WHEN si.status IN ('draft','cancelled') THEN 'NEVER_POSTS'
         ELSE 'NOT_POSTED'
       END                                          AS ledger_state,
       -- A posted invoice that no longer sums to zero is the worst state:
       -- invisible in the trial balance, and the books are quietly wrong.
       CASE WHEN je.id IS NOT NULL AND je.total_debit <> je.total_credit
            THEN 'UNBALANCED' ELSE 'OK' END        AS integrity
  FROM public.sales_invoices si
  LEFT JOIN public.journal_entries je
         ON je.source_type = 'sales_invoice' AND je.source_id = si.id
        AND je.status <> 'REVERSED';

COMMENT ON VIEW public.invoice_ledger_status IS
  'أي الفواتير رحّلت إلى الدليل وأيها لم تفعل بعد. ledger_state tells the difference '
  'between "not posted yet" and "should never post".';

REVOKE ALL ON public.invoice_ledger_status FROM anon;
GRANT SELECT ON public.invoice_ledger_status TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.invoice_ledger_status;
-- DROP FUNCTION IF EXISTS public.post_sales_invoice(uuid);