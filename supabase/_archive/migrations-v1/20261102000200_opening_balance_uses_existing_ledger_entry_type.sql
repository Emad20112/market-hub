-- ============================================================================
-- 20261102000200_opening_balance_uses_existing_ledger_entry_type.sql
--
-- THE DEFECT
-- ----------
-- post_opening_balance inserted receivable lines into customer_ledger with
-- entry_type = 'opening_balance', but that column is constrained to a fixed
-- five-value list:
--
--   CHECK (entry_type = ANY (ARRAY['sale','payment','return','adjustment','credit']))
--
-- so posting any opening entry that carried a receivable failed outright:
--
--   new row for relation "customer_ledger" violates check constraint
--     "customer_ledger_entry_type_check"
--
-- -- The opening document itself did commit; the error surfaced only for the
-- -- document with a receivable on it, which is most real ones.
--
-- THE FIX
-- -------
-- Use 'adjustment', which is already in the list and already means exactly
-- this: a ledger movement that is not a sale, a payment or a return. The
-- reference_type stays 'opening_balance', so the line is still traceable to
-- the opening document - the discriminator for "why is this entry here" is
-- reference_type, not entry_type.
--
-- Widening the CHECK to add 'opening_balance' was considered and rejected:
-- every existing consumer of customer_ledger switches on entry_type, so a
-- new value becomes a value they do not handle, which turns a loud failure
-- here into a silent omission in the customer's statement somewhere else.
-- Reusing an existing value that means the right thing is the smaller change.
--
-- NON-DESTRUCTIVE: function body only. No ledger row, balance or document is
-- altered.
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

  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Opening entry does not balance: debits % vs credits % (difference %). Capital required is %. Correct the document before posting.',
      round(v_debit, 2)::text,
      round(v_credit, 2)::text,
      round(v_debit - v_credit, 2)::text,
      round(v_debit - v_credit, 2)::text;
  END IF;

  UPDATE public.opening_balance_documents
     SET total_assets      = v_debit,
         total_liabilities = v_credit - v_capital,
         capital_required  = v_debit - v_credit + v_capital,
         status            = 'POSTED',
         posted_by         = v_user,
         posted_at         = now()
   WHERE id = _document_id;

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
      -- 'adjustment' is the existing ledger value for a movement that is not a
      -- sale, a payment or a return; reference_type carries the real reason.
      INSERT INTO public.customer_ledger
        (customer_id, entry_type, debit, credit, reference_id, reference_type,
         occurred_at, created_by, note)
      VALUES
        (l.customer_id, 'adjustment', l.amount, 0, _document_id,
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

-- The reversal path writes the same column, so it needs the same correction.
CREATE OR REPLACE FUNCTION public.reverse_opening_balance(
  _document_id uuid, _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_doc  record;
  v_new  uuid;
  v_num  text;
  l      record;
BEGIN
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reversing an opening entry requires a reason';
  END IF;

  SELECT * INTO v_doc FROM public.opening_balance_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND OR v_doc.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only a posted opening document can be reversed';
  END IF;

  v_num := 'OBR-' || v_doc.document_number;
  INSERT INTO public.opening_balance_documents
    (document_number, effective_date, status, fiscal_year, reverses_document_id,
     notes, created_by, posted_at, posted_by)
  VALUES (v_num, v_doc.effective_date, 'POSTED', v_doc.fiscal_year, _document_id,
          'عكس القيد الافتتاحي ' || v_doc.document_number || ': ' || btrim(_reason),
          v_user, now(), v_user)
  RETURNING id INTO v_new;

  INSERT INTO public.opening_balance_lines
    (document_id, section, side, ref_type, ref_id, product_id, warehouse_id,
     customer_id, supplier_id, description, quantity, unit_cost, amount)
  SELECT v_new, section,
         CASE WHEN side='DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
         ref_type, ref_id, product_id, warehouse_id, customer_id, supplier_id,
         'عكس: ' || description, quantity, unit_cost, amount
    FROM public.opening_balance_lines WHERE document_id = _document_id;

  FOR l IN SELECT * FROM public.opening_balance_lines WHERE document_id = _document_id
  LOOP
    IF l.section = 'STOCK' THEN
      PERFORM public.post_stock_delta(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => -l.quantity, p_unit_cost => coalesce(l.unit_cost, 0),
        p_movement_kind => 'ADJUSTMENT', p_source_type => 'opening_balance_reversal',
        p_source_id => v_new, p_note => 'عكس رصيد افتتاحي ' || v_doc.document_number,
        p_owner_type => 'COMPANY', p_owner_id => NULL);
      PERFORM public.apply_cost_movement(
        p_product_id => l.product_id, p_warehouse_id => l.warehouse_id,
        p_signed_qty => -l.quantity, p_incoming_cost => NULL,
        p_source_type => 'opening_balance_reversal', p_source_id => v_new,
        p_note => 'عكس رصيد افتتاحي ' || v_doc.document_number);
    ELSIF l.section = 'RECEIVABLE' THEN
      INSERT INTO public.customer_ledger
        (customer_id, entry_type, debit, credit, reference_id, reference_type,
         occurred_at, created_by, note)
      VALUES (l.customer_id, 'adjustment', 0, l.amount, v_new,
              'opening_balance_reversal', now(), v_user,
              'عكس رصيد افتتاحي ' || v_doc.document_number);
    ELSIF l.section = 'PAYABLE' THEN
      UPDATE public.suppliers SET balance = coalesce(balance,0) - l.amount
       WHERE id = l.supplier_id;
    END IF;
  END LOOP;

  UPDATE public.opening_balance_documents
     SET status = 'REVERSED'
   WHERE id = _document_id;

  RETURN v_new;
END $$;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP FUNCTION IF EXISTS public.reverse_opening_balance(uuid, text);
-- DROP FUNCTION IF EXISTS public.post_opening_balance(uuid);