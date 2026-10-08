-- ============================================================================
-- 20261102000000_opening_balances.sql
--
-- OPENING BALANCES, ALL SECTIONS, ONE DOCUMENT
-- -------------------------------------------
-- The schema had stock openings only (stock_openings / stock_opening_items).
-- Opening a company needs far more than a stock list: what customers owe,
-- what is owed to suppliers, cash in the till, bank balances, fixed assets,
-- owner's capital and outstanding liabilities.
--
-- Rather than eight unrelated tables, this is ONE document with typed lines.
-- The reason is accounting, not tidiness: an opening entry only means
-- something if its sections agree. Assets + expenses on one side, liabilities
-- + capital on the other. Split across eight independent tables nothing would
-- stop someone posting a stock opening without the capital that paid for it,
-- and the books would silently fail to balance.
--
-- So the document enforces a single invariant:
--
--     sum(ASSET | RECEIVABLE | CASH | BANK)  ==  sum(LIABILITY | PAYABLE | CAPITAL)
--
-- and refuses to post until it holds. An opening entry that does not balance
-- is not an opening entry.
--
-- WHAT "CORRECT ENTRY" MEANS HERE, PRECISELY
-- ------------------------------------------
--   * Stock is posted as real stock: through post_stock_delta, so the
--     quantity, the movement and the audit trail all exist. It is never a
--     fake purchase - the business rule that outlived this project is that no
--     opening balance is dressed up as a purchase.
--   * Receivables become customer_ledger entries, so they appear in the
--     customer's statement rather than existing only in an opening report.
--   * Payables become supplier balances.
--   * Cash, bank, fixed assets and liabilities have no posting table in this
--     schema yet (there is no chart of accounts), so they are RECORDED with
--     their section and amount. They are real, queryable and reversible; they
--     are not posted anywhere, because there is nowhere to post them to. That
--     limitation is stated rather than papered over.
--
-- REVERSAL
-- ---------
-- An opening entry can be reversed, and reversing is itself an opening
-- document. This matters because a wrong opening balance is one of the most
-- expensive errors in a system: it is baked into every later valuation.
--
-- NON-DESTRUCTIVE: new tables and functions. No existing opening, balance,
-- ledger row or movement is altered.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.opening_balance_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text NOT NULL UNIQUE,
  effective_date date NOT NULL,
  status         text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  fiscal_year    int  NOT NULL,
  -- Assets + receivables + cash + banks, against the other side.
  total_assets       numeric(18,2) NOT NULL DEFAULT 0,
  total_liabilities  numeric(18,2) NOT NULL DEFAULT 0,
  -- Owner capital is the balancing figure, not an input: capital is what makes
  -- the entry balance, so asking the user for it and then checking it would be
  -- circular.
  capital_required   numeric(18,2),
  reverses_document_id uuid REFERENCES public.opening_balance_documents(id),
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  posted_by        uuid REFERENCES auth.users(id),
  posted_at        timestamptz,
  CONSTRAINT opening_balance_posted_has_date
    CHECK (status = 'DRAFT' OR posted_at IS NOT NULL)
);

COMMENT ON TABLE public.opening_balance_documents IS
  'قيد افتتاحي شامل: مخزون، ذمم عملاء، موردون، نقدية، بنوك، أصول، التزامات، رأس مال. '
  'لا يُرحَّل إلا إذا كان مجموع الأصول = مجموع الالتزامات + رأس المال.';

CREATE TABLE IF NOT EXISTS public.opening_balance_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES public.opening_balance_documents(id) ON DELETE CASCADE,
  section       text NOT NULL CHECK (section IN
                  ('STOCK','RECEIVABLE','PAYABLE','CASH','BANK','ASSET','LIABILITY','CAPITAL')),
  side          text NOT NULL CHECK (side IN ('DEBIT','CREDIT')),
  -- A polymorphic reference to whatever the line is about. Deliberately not a
  -- foreign key: the sections have no common target table, and a wrong
  -- reference is caught by the posting function rather than by a guess here.
  ref_type      text,
  ref_id        uuid,
  product_id    uuid REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id  uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
  supplier_id   uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  description   text NOT NULL,
  quantity      numeric(18,3),
  unit_cost     numeric(18,4),
  amount        numeric(18,2) NOT NULL CHECK (amount >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- STOCK is the only section with a mandatory item and a quantity. Everything
  -- else is money, and a quantity on a cash line is meaningless noise.
  CONSTRAINT opening_balance_lines_stock_shape CHECK (
    section <> 'STOCK' OR (product_id IS NOT NULL AND warehouse_id IS NOT NULL AND quantity IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS ix_opening_lines_doc ON public.opening_balance_lines (document_id);
CREATE INDEX IF NOT EXISTS ix_opening_lines_ref ON public.opening_balance_lines (ref_type, ref_id);

ALTER TABLE public.opening_balance_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opening_balance_lines     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS opening_bal_read ON public.opening_balance_documents;
CREATE POLICY opening_bal_read ON public.opening_balance_documents
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS opening_bal_lines_read ON public.opening_balance_lines;
CREATE POLICY opening_bal_lines_read ON public.opening_balance_lines
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

REVOKE ALL ON public.opening_balance_documents FROM anon;
REVOKE ALL ON public.opening_balance_lines     FROM anon;
GRANT SELECT ON public.opening_balance_documents, public.opening_balance_lines
  TO authenticated, service_role;

-- number sequence
DO $$
BEGIN
  IF to_regclass('public.opening_balance_seq') IS NULL THEN
    CREATE SEQUENCE public.opening_balance_seq START 1;
  END IF;
END $$;

-- ── create a draft with its lines ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_opening_balance(
  _effective_date date,
  _lines          jsonb,
  _notes          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
  v_num  text;
  l      jsonb;
  v_side text;
  v_section text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may open the books';
  END IF;
  IF _effective_date IS NULL THEN
    RAISE EXCEPTION 'Effective date is required';
  END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'An opening entry needs at least one line';
  END IF;

  v_num := 'OB-' || to_char(_effective_date,'YYYYMMDD') || '-' ||
           lpad(nextval('public.opening_balance_seq')::text,3,'0');

  INSERT INTO public.opening_balance_documents
    (document_number, effective_date, status, fiscal_year, notes, created_by)
  VALUES (v_num, _effective_date, 'DRAFT',
          EXTRACT(YEAR FROM _effective_date)::int,
          nullif(btrim(coalesce(_notes,'')),''), v_user)
  RETURNING id INTO v_id;

  FOR l IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    v_section := l->>'section';
    IF v_section NOT IN ('STOCK','RECEIVABLE','PAYABLE','CASH','BANK','ASSET','LIABILITY','CAPITAL') THEN
      RAISE EXCEPTION 'Unknown opening section: %', v_section;
    END IF;

    -- The side is DERIVED, never supplied. A line that claims to be an asset
    -- on the credit side is the exact error a balance check exists to catch,
    -- and accepting it would defeat the purpose.
    v_side := CASE WHEN v_section IN ('STOCK','RECEIVABLE','CASH','BANK','ASSET')
                   THEN 'DEBIT' ELSE 'CREDIT' END;

    IF coalesce((l->>'amount')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Line amount must be greater than zero (section %)', v_section;
    END IF;

    INSERT INTO public.opening_balance_lines
      (document_id, section, side, ref_type, ref_id, product_id, warehouse_id,
       customer_id, supplier_id, description, quantity, unit_cost, amount)
    VALUES
      (v_id, v_section, v_side, l->>'ref_type', (l->>'ref_id')::uuid,
       (l->>'product_id')::uuid, (l->>'warehouse_id')::uuid,
       (l->>'customer_id')::uuid, (l->>'supplier_id')::uuid,
       coalesce(nullif(btrim(coalesce(l->>'description','')),''), v_section),
       (l->>'quantity')::numeric, (l->>'unit_cost')::numeric,
       (l->>'amount')::numeric);
  END LOOP;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_opening_balance(date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_opening_balance(date, jsonb, text)
  TO authenticated, service_role;

-- ── post it, only if it balances ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.post_opening_balance(_document_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := auth.uid();
  v_doc    record;
  v_debit  numeric;
  v_credit numeric;
  v_capital numeric;
  l        record;
BEGIN
  SELECT * INTO v_doc FROM public.opening_balance_documents WHERE id = _document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Opening document not found';
  END IF;
  IF v_doc.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Document % is already %', v_doc.document_number, v_doc.status;
  END IF;

  SELECT coalesce(sum(amount) FILTER (WHERE side='DEBIT'), 0),
         coalesce(sum(amount) FILTER (WHERE side='CREDIT'), 0)
    INTO v_debit, v_credit
    FROM public.opening_balance_lines WHERE document_id = _document_id;

  -- Capital as entered is only an assertion; the balancing figure is what the
  -- assets actually require.
  SELECT coalesce(sum(amount) FILTER (WHERE section='CAPITAL'), 0) INTO v_capital
    FROM public.opening_balance_lines WHERE document_id = _document_id;

  -- Required capital to balance = assets - (liabilities + capital given).
  UPDATE public.opening_balance_documents
     SET total_assets      = v_debit,
         total_liabilities = v_credit - coalesce(
             (SELECT sum(amount) FROM public.opening_balance_lines
               WHERE document_id = _document_id AND section='CAPITAL'), 0),
         capital_required  = v_debit - v_credit + coalesce(
             (SELECT sum(amount) FROM public.opening_balance_lines
               WHERE document_id = _document_id AND section='CAPITAL'), 0)
   WHERE id = _document_id;

  -- Refuse while the entry is out of balance. Capital may be supplied by the
  -- user, and if they got it wrong the posting is what catches it.
  IF v_debit <> v_credit THEN
    RAISE EXCEPTION
      'Opening entry does not balance: debits %.2f vs credits %.2f (difference %.2f). '
      'Capital required is %.2f. Correct the document before posting.',
      v_debit, v_credit, v_debit - v_credit, v_debit - v_credit;
  END IF;

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

  UPDATE public.opening_balance_documents
     SET status = 'POSTED', posted_by = v_user, posted_at = now()
   WHERE id = _document_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_user, 'opening_balance.posted', 'opening_balance', _document_id,
          jsonb_build_object('document_number', v_doc.document_number,
                             'debits', v_debit, 'credits', v_credit));
  RETURN _document_id;
END $$;

REVOKE ALL ON FUNCTION public.post_opening_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_opening_balance(uuid) TO authenticated, service_role;

-- ── reverse it ──────────────────────────────────────────────────────────────

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
     notes, created_by)
  VALUES (v_num, v_doc.effective_date, 'POSTED', v_doc.fiscal_year, _document_id,
          'عكس القيد الافتتاحي ' || v_doc.document_number || ': ' || btrim(_reason), v_user)
  RETURNING id INTO v_new;

  -- Every line is mirrored at the same amount, so the reversal balances by
  -- construction rather than by arithmetic the caller has to get right.
  INSERT INTO public.opening_balance_lines
    (document_id, section, side, ref_type, ref_id, product_id, warehouse_id,
     customer_id, supplier_id, description, quantity, unit_cost, amount)
  SELECT v_new, section,
         CASE WHEN side='DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
         ref_type, ref_id, product_id, warehouse_id, customer_id, supplier_id,
         'عكس: ' || description, quantity, unit_cost, amount
    FROM public.opening_balance_lines WHERE document_id = _document_id;

  -- undo the posted effects
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
      VALUES (l.customer_id, 'opening_balance_reversal', 0, l.amount, v_new,
              'opening_balance_reversal', now(), v_user,
              'عكس رصيد افتتاحي ' || v_doc.document_number);
    ELSIF l.section = 'PAYABLE' THEN
      UPDATE public.suppliers SET balance = coalesce(balance,0) - l.amount
       WHERE id = l.supplier_id;
    END IF;
  END LOOP;

  UPDATE public.opening_balance_documents
     SET status = 'REVERSED', posted_by = v_user, posted_at = now()
   WHERE id = _document_id;

  RETURN v_new;
END $$;

REVOKE ALL ON FUNCTION public.reverse_opening_balance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_opening_balance(uuid, text)
  TO authenticated, service_role;

-- ── reporting ───────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.opening_balance_summary
  WITH (security_invoker = true) AS
SELECT d.id, d.document_number, d.effective_date, d.status, d.fiscal_year,
       d.total_assets, d.total_liabilities, d.capital_required, d.notes,
       coalesce(s.stock_amount, 0)   AS stock_amount,
       coalesce(s.receivable_amount,0) AS receivable_amount,
       coalesce(s.payable_amount, 0)   AS payable_amount,
       coalesce(s.cash_amount, 0)      AS cash_amount,
       coalesce(s.bank_amount, 0)      AS bank_amount,
       coalesce(s.asset_amount, 0)     AS asset_amount,
       coalesce(s.liability_amount, 0) AS liability_amount,
       coalesce(s.capital_amount, 0)   AS capital_amount,
       -- whether the document as entered would post
       (coalesce(s.debit,0) = coalesce(s.credit,0)) AS is_balanced
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

COMMENT ON VIEW public.opening_balance_summary IS
  'ملخص الأرصدة الافتتاحية بكل الأقسام، مع is_balanced الذي يوضح هل يقبل القيد الترحيل قبل الترحيل.';

REVOKE ALL ON public.opening_balance_summary FROM anon;
GRANT SELECT ON public.opening_balance_summary TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.opening_balance_summary;
-- DROP FUNCTION IF EXISTS public.reverse_opening_balance(uuid, text);
-- DROP FUNCTION IF EXISTS public.post_opening_balance(uuid);
-- DROP FUNCTION IF EXISTS public.create_opening_balance(date, jsonb, text);
-- DROP TABLE IF EXISTS public.opening_balance_lines;
-- DROP TABLE IF EXISTS public.opening_balance_documents;