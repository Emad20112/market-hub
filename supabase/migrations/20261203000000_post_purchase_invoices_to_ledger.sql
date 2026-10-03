-- ============================================================================
-- 20261203000000_post_purchase_invoices_to_ledger.sql
--
-- THE SECOND DOCUMENT TYPE, AND THE ONE STOCK DEPENDS ON
-- ---------------------------------------------------
-- Nothing in the books can be right about inventory until purchases reach the
-- ledger: flour sold without the wheat it was made from leaves the ledger
-- showing an asset appearing from nowhere.
--
-- THE ENTRY
-- ---------
--   Dr 1311 / 1313 / 1315      the goods, at what they cost to acquire
--   Dr 1316                    input VAT, only when the invoice carries it
--       Cr 2111 ذمم الموردين       what is owed
--       Cr 1101 / 1111          what was paid
--
-- THE INVERSION FROM SALES, AND WHY IT MATTERS
-- ----------------------------------------------
-- On a sale the cost came from resolve_unit_cost - the balance carries it.
-- On a purchase the cost is it.unit_cost - the document states what was
-- actually paid, and THAT is the event which establishes the cost of the
-- goods. Reading the layer average here would be circular: the layer average
-- is a consequence of this purchase, not an input to it.
--
-- The purchase price is also what feeds apply_cost_movement, so invoice and
-- ledger agree on what the goods cost by construction rather than by
-- coincidence.
--
-- DECISIONS
-- ---------
-- Cash or payable is read from the document, exactly as on sales. A purchase
-- on credit is money owed to the supplier, not money in the bank.
--
-- Input VAT is debited to 1316 as an asset rather than capitalised into
-- inventory. That is the treatment for a VAT-registered mill that recovers
-- its input tax. It is NOT capitalised because that would bake recoverable
-- tax into the cost of the flour permanently. The tax column defaults to zero,
-- so nothing reaches 1316 until a rate is actually entered - no invented rates.
--
-- Lines that do not add stock are debited to 5911 مصروفات أخرى rather than
-- to inventory. The purchase module records services and overheads on the same
-- table as grain, and putting a delivery charge into the wheat's cost would
-- quietly raise the flour's valuation for a reason nobody chose.
--
-- Only confirmed, paid and partial invoices post; exactly once.
--
-- NON-DESTRUCTIVE: one account, one function, one view. The three existing
-- purchase invoices are 0.00 with no lines, so nothing can be posted by
-- accident, and posting remains opt-in.
-- ============================================================================

-- input VAT is recoverable, so it is an asset, not an expense
INSERT INTO public.accounts (code, name_ar, account_type, is_system, notes)
VALUES ('1316', 'ضريبة القيمة المضافة على المشتريات', 'ASSET', true,
        'ضريبة مدخلات قابلة للاسترداد — أصل لا يُرسَّم في تكلفة البضاعة.')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
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
  v_owed     numeric := 0;
  r         record;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (public.has_role(v_user,'owner') OR public.has_role(v_user,'manager')
          OR public.has_role(v_user,'accountant')) THEN
    RAISE EXCEPTION 'Only an owner, manager or accountant may post a purchase invoice';
  END IF;

  SELECT * INTO v_inv FROM public.purchase_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase invoice not found';
  END IF;

  IF v_inv.status IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'Purchase % is % - only confirmed, paid or partial invoices post',
      v_inv.invoice_number, v_inv.status;
  END IF;

  IF v_inv.paid < 0 THEN
    RAISE EXCEPTION 'Purchase % carries a negative payment (%). A supplier return is a return document, not a negative payment.',
      v_inv.invoice_number, v_inv.paid;
  END IF;
  IF v_inv.paid > v_inv.total THEN
    RAISE EXCEPTION 'Purchase % was paid % against a total of %. Fix the invoice before posting - a payment cannot exceed the invoice.',
      v_inv.invoice_number, v_inv.paid, v_inv.total;
  END IF;

  SELECT id INTO v_existing
    FROM public.journal_entries
   WHERE source_type = 'purchase_invoice' AND source_id = p_invoice_id
     AND status <> 'REVERSED';
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase % has already been posted to the ledger', v_inv.invoice_number;
  END IF;

  IF v_inv.payment_method = 'credit' THEN
    v_cash_acct := NULL;
  ELSIF v_inv.payment_method IN ('bank_transfer','card','mobile_money') THEN
    v_cash_acct := '1111';
  ELSE
    v_cash_acct := '1101';
  END IF;

  v_owed := greatest(v_inv.total - v_inv.paid, 0);

  -- ── what was acquired ──
  FOR r IN
    SELECT p.item_class,
           coalesce(it.stock_effect, 'NONE') AS effect,
           sum(it.total)                     AS amount,
           sum(it.tax)                       AS line_tax
      FROM public.purchase_invoice_items it
      JOIN public.products p ON p.id = it.product_id
     WHERE it.invoice_id = p_invoice_id
     GROUP BY p.item_class, coalesce(it.stock_effect, 'NONE')
    HAVING sum(it.total) <> 0 OR sum(it.tax) <> 0
  LOOP
    IF r.amount <> 0 THEN
      -- Goods that entered stock go to the inventory account for their class;
      -- anything else is an expense, not an increase in stock.
      v_lines := v_lines || jsonb_build_object(
        'account_code', CASE
          WHEN r.effect <> 'STOCK_RECEIPT' THEN '5911'
          ELSE CASE r.item_class
                 WHEN 'RAW_MATERIAL' THEN '1311'
                 WHEN 'BY_PRODUCT'   THEN '1314'
                 WHEN 'FINISHED_GOOD' THEN '1313'
                 ELSE '1315' END END,
        'debit', round(r.amount, 2),
        'memo', CASE WHEN r.effect <> 'STOCK_RECEIPT'
                     THEN 'مصروف مشتريات ' || r.item_class
                     ELSE 'شراء ' || r.item_class END);
    END IF;

    -- Input VAT is recoverable and therefore an asset in its own right.
    IF r.line_tax <> 0 THEN
      v_lines := v_lines || jsonb_build_object(
        'account_code', '1316', 'debit', round(r.line_tax, 2),
        'memo', 'ضريبة مدخلات قابلة للاسترداد');
    END IF;
  END LOOP;

  -- A purchase carrying tax on the header but not on its lines still has it.
  IF v_inv.tax <> 0 AND not exists (
       SELECT 1 FROM public.purchase_invoice_items it
        WHERE it.invoice_id = p_invoice_id AND it.tax <> 0) THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '1316', 'debit', round(v_inv.tax, 2),
      'memo', 'ضريبة مدخلات قابلة للاسترداد');
  END IF;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Purchase % has nothing to post - its lines are empty or zero',
      v_inv.invoice_number;
  END IF;

  -- ── what was paid and what is owed ──
  IF v_owed > 0 THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', '2111', 'credit', round(v_owed, 2),
      'memo', 'مستحق للمورد',
      'partner_type', 'supplier',
      'partner_id', v_inv.supplier_id);
  END IF;

  IF v_inv.paid > 0 AND v_cash_acct IS NOT NULL THEN
    v_lines := v_lines || jsonb_build_object(
      'account_code', v_cash_acct, 'credit', round(v_inv.paid, 2),
      'memo', 'سداد للمورد');
  END IF;

  v_entry := public.create_journal_entry(
    'فاتورة مشتريات ' || v_inv.invoice_number,
    v_inv.created_at::date,
    'purchase_invoice', p_invoice_id, true, v_lines);

  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION public.post_purchase_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.post_purchase_invoice(uuid) IS
  'يرحّل فاتورة مشتريات: مخزون/مصروف + ضريبة مدخلات، مقابل النقدية أو ذمم الموردين. '
  'الكلفة من بند الفاتورة لا من متوسط الطبقة — الشراء هو ما يُنشئ التكلفة لا ما يقرأها.';

-- ── which purchases are wired ───────────────────────────────────────────────
DROP VIEW IF EXISTS public.purchase_ledger_status;
CREATE VIEW public.purchase_ledger_status
  WITH (security_invoker = true) AS
SELECT pi.id AS invoice_id,
       pi.invoice_number,
       pi.status::text          AS invoice_status,
       pi.total,
       pi.paid,
       pi.payment_method::text  AS payment_method,
       je.id                    AS journal_entry_id,
       je.entry_number,
       CASE
         WHEN je.id IS NOT NULL THEN 'POSTED'
         WHEN pi.status IN ('draft','cancelled') THEN 'NEVER_POSTS'
         ELSE 'NOT_POSTED'
       END                      AS ledger_state
  FROM public.purchase_invoices pi
  LEFT JOIN public.journal_entries je
         ON je.source_type = 'purchase_invoice' AND je.source_id = pi.id
        AND je.status <> 'REVERSED';

REVOKE ALL ON public.purchase_ledger_status FROM anon;
GRANT SELECT ON public.purchase_ledger_status TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.purchase_ledger_status;
-- DROP FUNCTION IF EXISTS public.post_purchase_invoice(uuid);
-- DELETE FROM public.accounts WHERE code = '1316';
