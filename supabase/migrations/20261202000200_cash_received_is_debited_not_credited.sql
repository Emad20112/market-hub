-- ============================================================================
-- 20261202000200_cash_received_is_debited_not_credited.sql
--
-- THE DEFECT
-- ----------
-- post_sales_invoice credited cash for the amount collected:
--
--     IF v_inv.paid > 0 AND v_cash_acct IS NOT NULL THEN
--       v_lines := v_lines || jsonb_build_object(
--         'account_code', v_cash_acct, 'credit', round(v_inv.paid, 2), ...
--
-- That is backwards. Cash received is an asset increasing, so it belongs on
-- the DEBIT side, alongside the receivable - the two are alternatives for the
-- same thing, not one the other offsets:
--
--     sale on credit:   Dr 1211 Receivable   Cr 4111 Revenue
--     sale for cash:    Dr 1101 Cash         Cr 4111 Revenue
--
-- Crediting cash produced a double-sided error on every cash sale: revenue
-- credited AND cash credited, with the receivable debited only for the unpaid
-- remainder, so the debits came out short. The acceptance run showed it
-- immediately:
--
--     invoice 400, fully paid in cash
--     => debits 240 vs credits 1040
--
-- The imbalance was refused by create_journal_entry, so no wrong entry reached
-- the books - but a cash sale could not be posted at all, and the error
-- message pointed at the journal API rather than at the sign.
--
-- WHY THIS MATTERED MORE THAN A SIGN
-- ------------------------------
-- A cash sale is the most ordinary transaction in the business. The credit
-- sale path was correct, which means the bug would have appeared only once
-- real cash sales started posting, and only on the most common document type.
--
-- NON-DESTRUCTIVE: one function body. No invoice or entry is touched.
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

  IF v_inv.paid < 0 THEN
    RAISE EXCEPTION 'Invoice % carries a negative payment (%). A refund is a credit note, not a negative payment.',
      v_inv.invoice_number, v_inv.paid;
  END IF;
  IF v_inv.paid > v_inv.total THEN
    RAISE EXCEPTION 'Invoice % was paid % against a total of %. Fix the invoice before posting - a payment cannot exceed the invoice.',
      v_inv.invoice_number, v_inv.paid, v_inv.total;
  END IF;
  IF v_inv.tax < 0 THEN
    RAISE EXCEPTION 'Invoice % carries a negative tax amount', v_inv.invoice_number;
  END IF;

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
    v_cash_acct := '1101';                     -- cash; 'split' resolved against cash
  END IF;

  v_collectable := greatest(v_inv.total - v_inv.paid, 0);

  -- ── revenue, credited ──
  FOR r IN
    SELECT p.item_class, sum(it.total) AS amount
      FROM public.sales_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
     GROUP BY p.item_class
    HAVING sum(it.total) <> 0
  LOOP
    v_lines := v_lines || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'BY_PRODUCT' THEN '4211'
                        WHEN 'SERVICE'    THEN '4311'
                        ELSE '4111' END,
      'credit', round(r.amount, 2),
      'memo', 'إيراد ' || r.item_class);
  END LOOP;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Invoice % has no revenue lines', v_inv.invoice_number;
  END IF;

  -- ── what the mill received: cash and receivable are both DEBITS ──
  -- They are alternatives for the same increase, so a fully-paid sale has a
  -- cash debit and no receivable, and a credit sale the reverse.
  IF v_inv.paid > 0 AND v_cash_acct IS NOT NULL THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', v_cash_acct, 'debit', round(v_inv.paid, 2),
      'memo', 'تحصيل نقدي/بنكي');
  END IF;
  IF v_collectable > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '1211', 'debit', round(v_collectable, 2),
      'memo', 'ذمم العميل ' || coalesce(v_inv.invoice_number, ''));
  END IF;

  IF v_inv.tax > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2311', 'credit', round(v_inv.tax, 2),
      'memo', 'ضريبة القيمة المضافة المستحقة');
  END IF;

  -- ── the cost of the goods that left ──
  FOR r IN
    SELECT p.item_class,
           sum(it.quantity * public.resolve_unit_cost(p.id, v_inv.warehouse_id)) AS cost
      FROM public.sales_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
       AND it.stock_effect = 'STOCK_ISSUE'
     GROUP BY p.item_class
  LOOP
    IF r.cost IS NULL OR r.cost = 0 THEN
      CONTINUE;   -- no cost known; a zero COGS line would overstate profit
    END IF;
    v_lines := v_lines || jsonb_build_object(
      'account_code', CASE r.item_class
                        WHEN 'RAW_MATERIAL' THEN '1311'
                        WHEN 'BY_PRODUCT'   THEN '1314'
                        ELSE '1313' END,
      'credit', round(r.cost, 2),
      'memo', 'تكلفة ' || r.item_class);
    v_lines := v_lines || jsonb_build_object(
      'account_code', '5111', 'debit', round(r.cost, 2),
      'memo', 'تكلفة البضاعة المباعة');
  END LOOP;

  v_entry := public.create_journal_entry(
    'فاتورة مبيعات ' || v_inv.invoice_number,
    v_inv.created_at::date,
    'sales_invoice', p_invoice_id, true, v_lines);

  RETURN v_entry;
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.post_sales_invoice(uuid);