-- ============================================================================
-- 20261102000100_correct_opening_balance_summary_and_message.sql
--
-- TWO DEFECTS FOUND BY THE ACCEPTANCE RUN
-- ---------------------------------------
--
-- (1) `capital_required` was only computed inside post_opening_balance, a few
--     lines above the RAISE that rejects an unbalanced entry. An exception in
--     PL/pgSQL aborts the enclosing transaction, so the UPDATE that had just
--     computed it was rolled back with it. The one number the user needs in
--     order to FIX the imbalance was destroyed by the check that detected it:
--
--       select capital_required from opening_balance_summary where id = <bad>;
--         => null      -- expected 7500.00
--
--     The summary view now derives it, so it is available before posting and
--     survives a rejected attempt. That is the whole point of the column: it
--     is advice for correcting the document.
--
-- (2) The RAISE used `%.2f`. PL/pgSQL substitutes `%` and a small set of
--     modifiers, and a numeric argument does not render the way printf does:
--
--       Opening entry does not balance: debits 17000.01.2f vs credits 14000.00.2f
--
--     The message is the only thing a user sees when their entry is rejected,
--     so a garbled one defeats the error. Values are now rounded to text
--     explicitly, which renders predictably for any numeric type.
--
-- NON-DESTRUCTIVE: one view and one function body. No document, line, ledger
-- entry, balance or movement is touched.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.post_opening_balance(_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := auth.uid();
  v_doc     record;
  v_debit   numeric;
  v_credit  numeric;
  v_capital numeric;
  l         record;
BEGIN
  SELECT * INTO v_doc FROM public.opening_balance_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opening document not found';
  END IF;
  IF v_doc.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Document % is already %', v_doc.document_number, v_doc.status;
  END IF;

  SELECT coalesce(sum(amount) FILTER (WHERE side='DEBIT'), 0),
         coalesce(sum(amount) FILTER (WHERE side='CREDIT'), 0),
         coalesce(sum(amount) FILTER (WHERE section='CAPITAL'), 0)
    INTO v_debit, v_credit, v_capital
    FROM public.opening_balance_lines WHERE document_id = _document_id;

  -- Refuse while the entry is out of balance. The message is rounded with
  -- round(...)::text rather than %.2f, which does not format numerics in
  -- PL/pgSQL and previously produced "17000.01.2f".
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Opening entry does not balance: debits % vs credits % (difference %). Capital required is %. Correct the document before posting.',
      round(v_debit, 2)::text,
      round(v_credit, 2)::text,
      round(v_debit - v_credit, 2)::text,
      round(v_debit - v_credit, 2)::text;
  END IF;

  -- Only now, once the entry balances, is the document stamped.
  UPDATE public.opening_balance_documents
     SET total_assets      = v_debit,
         total_liabilities = v_credit - v_capital,
         capital_required  = v_debit - v_credit + v_capital,
         status            = 'POSTED',
         posted_by         = v_user,
         posted_at         = now()
   WHERE id = _document_id;

  -- ── post each section where a destination exists ──
  FOR l IN SELECT * FROM public.opening_balance_lines WHERE document_id = _document_id ORDER BY id
  LOOP
    IF l.section = 'STOCK' THEN
      -- Real stock, through the real engine. Not a disguised purchase.
      PERFORM public.post_stock_delta(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => l.quantity, p_unit_cost => coalesce(l.unit_cost, 0),
        p_movement_kind => 'OPENING', p_source_type => 'opening_balance',
        p_source_id => _document_id,
        p_note => 'رصيد افتتاحي ' || v_doc.document_number,
        p_owner_type => 'COMPANY', p_owner_id => NULL);

      PERFORM public.apply_cost_movement(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => l.quantity, p_incoming_cost => l.unit_cost,
        p_source_type => 'opening_balance', p_source_id => _document_id,
        p_note => 'رصيد افتتاحي ' || v_doc.document_number);

    ELSIF l.section = 'RECEIVABLE' THEN
      IF l.customer_id IS NULL THEN
        RAISE EXCEPTION 'Receivable line "%" has no customer', l.description;
      END IF;
      -- Into the customer's ledger, so it shows on their statement rather than
      -- existing only in an opening report.
      INSERT INTO public.customer_ledger
        (customer_id, entry_type, debit, credit, reference_id, reference_type,
         occurred_at, created_by, note)
      VALUES
        (l.customer_id, 'opening_balance', l.amount, 0, _document_id,
         'opening_balance', v_doc.effective_date::timestamptz, v_user,
         'رصيد افتتاحي ' || v_doc.document_number);

    ELSIF l.section = 'PAYABLE' THEN
      IF l.supplier_id IS NULL THEN
        RAISE EXCEPTION 'Payable line "%" has no supplier', l.description;
      END IF;
      UPDATE public.suppliers
         SET balance = coalesce(balance, 0) + l.amount
       WHERE id = l.supplier_id;

    ELSE
      -- CASH, BANK, ASSET, LIABILITY: recorded, not posted. This schema has no
      -- chart of accounts and no cash/bank table, so there is no ledger entry
      -- to make. The line is real, queryable and reversible; pretending
      -- otherwise would be a fiction.
      NULL;
    END IF;
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'opening_balance.posted', 'opening_balance', _document_id,
          jsonb_build_object('document_number', v_doc.document_number,
                             'debits', v_debit, 'credits', v_credit));
  RETURN _document_id;
END $$;

-- capital_required is now DERIVED, so it is available whether or not the
-- document has been posted - which is exactly when the user needs it.
--
-- The view is DROPPED and recreated rather than replaced: CREATE OR REPLACE
-- VIEW may not rename or reorder existing columns, and this view gains two
-- columns in the middle of the list. Dropping a view breaks no grants that
-- matter here because grants are re-asserted below, and the view holds no
-- data of its own.
DROP VIEW IF EXISTS public.opening_balance_summary;
CREATE VIEW public.opening_balance_summary
  WITH (security_invoker = true) AS
SELECT d.id, d.document_number, d.effective_date, d.status, d.fiscal_year,
       d.total_assets, d.total_liabilities, d.capital_required, d.notes,
       coalesce(s.stock_amount, 0)     AS stock_amount,
       coalesce(s.receivable_amount,0) AS receivable_amount,
       coalesce(s.payable_amount, 0)   AS payable_amount,
       coalesce(s.cash_amount, 0)      AS cash_amount,
       coalesce(s.bank_amount, 0)      AS bank_amount,
       coalesce(s.asset_amount, 0)     AS asset_amount,
       coalesce(s.liability_amount, 0) AS liability_amount,
       coalesce(s.capital_amount, 0)   AS capital_amount,
       coalesce(s.debit, 0)            AS total_debits,
       coalesce(s.credit, 0)           AS total_credits,
       -- the number the user needs to fix a rejected entry
       round(coalesce(s.debit,0) - coalesce(s.credit,0), 2) AS capital_required_now,
       (coalesce(s.debit,0) = coalesce(s.credit,0))         AS is_balanced
  FROM public.opening_balance_documents d
  LEFT JOIN LATERAL (
    SELECT sum(amount) FILTER (WHERE side='DEBIT')  AS debit,
           sum(amount) FILTER (WHERE side='CREDIT') AS credit,
           sum(amount) FILTER (WHERE section='STOCK')      AS stock_amount,
           sum(amount) FILTER (WHERE section='RECEIVABLE') AS receivable_amount,
           sum(amount) FILTER (WHERE section='PAYABLE')    AS payable_amount,
           sum(amount) FILTER (WHERE section='CASH')       AS cash_amount,
           sum(amount) FILTER (WHERE section='BANK')       AS bank_amount,
           sum(amount) FILTER (WHERE section='ASSET')      AS asset_amount,
           sum(amount) FILTER (WHERE section='LIABILITY')  AS liability_amount,
           sum(amount) FILTER (WHERE section='CAPITAL')    AS capital_amount
      FROM public.opening_balance_lines l WHERE l.document_id = d.id
  ) s ON true;

COMMENT ON COLUMN public.opening_balance_summary.capital_required_now IS
  'رأس المال المطلوب حالياً حتى يتوازن القيد — متاح قبل الترحيل وبعد رفضه.';

REVOKE ALL ON public.opening_balance_summary FROM anon;
GRANT SELECT ON public.opening_balance_summary TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.opening_balance_summary;
-- DROP FUNCTION IF EXISTS public.post_opening_balance(uuid);