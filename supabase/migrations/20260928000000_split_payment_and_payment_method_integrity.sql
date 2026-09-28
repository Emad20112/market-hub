-- ============================================================================
-- Split payment integrity + payment-method truth on sales invoices.
--
-- Problems addressed (see docs/plans/system-integrity-and-logic-rectification-plan.md):
--   S-01: a mixed-tender sale (part cash + part card/bank) was collapsed to
--         'cash' and its card/bank amounts were written as free text in `note`.
--         The tender breakdown was therefore invisible to reporting and to bank
--         reconciliation.
--   2.1 : split tenders are now persisted as real, first-class rows.
--
-- What this migration does:
--   1) Adds 'split' to the public.payment_method enum (idempotent).
--   2) Creates public.customer_payment_splits — one row per tender component of
--      a single receipt.
--   3) Adds an 9-argument create_sale overload that also accepts
--      `_payment_splits` and writes those rows inside the same transaction.
--      The payload/behaviour of the previous 8-argument overload is unchanged
--      except for accepting 'split' as a method.
--   4) Guarantees invoice.payment_method always equals the single tender method
--      when only one tender component is present, and 'split' only when two or
--      more distinct methods are used.
--
-- Non-destructive: no existing rows are updated or deleted.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Allow the 'split' payment method.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'payment_method'
  ) THEN
    ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'split';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tender breakdown per receipt.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_payment_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.customer_payments(id) ON DELETE CASCADE,
  method public.payment_method NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by uuid,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_payment_splits_invoice_idx
  ON public.customer_payment_splits (invoice_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS customer_payment_splits_occurred_at_idx
  ON public.customer_payment_splits (occurred_at DESC);

ALTER TABLE public.customer_payment_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_payment_splits staff read" ON public.customer_payment_splits;
CREATE POLICY "customer_payment_splits staff read"
  ON public.customer_payment_splits
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "customer_payment_splits staff write" ON public.customer_payment_splits;
CREATE POLICY "customer_payment_splits staff write"
  ON public.customer_payment_splits
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

COMMENT ON TABLE public.customer_payment_splits IS
  'Per-tender breakdown of a receipt (cash/card/bank/...). Written by create_sale for mixed-tender sales so split payments stay reportable and reconcilable.';

-- ---------------------------------------------------------------------------
-- 5. Inventory adjustments must always carry a documented, auditable reason.
--
-- I-02: the direct stock adjustment dialog could change on-hand quantities
-- with a free-text note only, so shrinkage could be absorbed without a
-- traceable justification. Adjustment movements now record a coded reason in
-- a dedicated column; a CHECK constraint makes an adjustment without a reason
-- impossible at the database level.
-- ---------------------------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS adjustment_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'stock_movements'
      AND c.conname = 'stock_movements_adjustment_reason_required'
  ) THEN
    ALTER TABLE public.stock_movements
      ADD CONSTRAINT stock_movements_adjustment_reason_required
      CHECK (
        movement_type <> 'adjustment'::public.movement_type
        OR (adjustment_reason IS NOT NULL AND btrim(adjustment_reason) <> '')
      )
      NOT VALID;
  END IF;
END;
$$;

COMMENT ON COLUMN public.stock_movements.adjustment_reason IS
  'Coded reason for an inventory adjustment (damaged, expiry, shortfall, surplus, stocktake, other). Mandatory for movement_type = adjustment.';

-- ---------------------------------------------------------------------------
-- 6. Read helper for statements/reports: tender breakdown of one invoice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_invoice_tender_breakdown(_invoice_id uuid)
RETURNS TABLE (method text, amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.method::text, s.amount
  FROM public.customer_payment_splits AS s
  WHERE s.invoice_id = _invoice_id
  ORDER BY s.amount DESC;
$$;

REVOKE ALL ON FUNCTION public.sales_invoice_tender_breakdown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_invoice_tender_breakdown(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. create_sale overload that also persists the tender breakdown.
--
-- The invoice itself is still posted by the existing 8-argument overload, which
-- keeps stock, credit-limit, ledger, and audit behaviour identical. The only
-- addition here is the tender breakdown rows plus a guard that the recorded
-- payment_method is truthful:
--   * one tender component  -> recorded as that component's own method
--   * several components    -> recorded as 'split'
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
  v_invoice_id uuid;
  v_total numeric;
  v_paid numeric;
  v_user uuid := auth.uid();
  v_split record;
  v_component_count integer := 0;
  v_split_total numeric := 0;
  v_distinct_methods integer := 0;
  v_single_method text;
  v_recorded_method text := _payment_method;
BEGIN
  IF coalesce(jsonb_typeof(_payment_splits), 'jsonb') <> 'array'
    OR coalesce(jsonb_array_length(_payment_splits), 0) = 0 THEN
    -- No breakdown supplied: keep the exact existing behaviour.
    RETURN public.create_sale(
      _warehouse_id, _customer_id, _payment_method, _paid, _discount, _note, _items, _sale_date
    );
  END IF;

  FOR v_split IN
    SELECT
      (part ->> 'method') AS method,
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

  -- The tender breakdown and the paid amount must agree; otherwise the invoice
  -- and the recorded payments would drift apart.
  IF round(v_split_total, 2) <> round(coalesce(_paid, 0), 2) THEN
    RAISE EXCEPTION
      'Payment breakdown total % does not match the paid amount %',
      round(v_split_total, 2),
      round(coalesce(_paid, 0), 2);
  END IF;

  v_recorded_method := CASE
    WHEN v_distinct_methods > 1 THEN 'split'
    ELSE v_single_method
  END;

  v_invoice_id := public.create_sale(
    _warehouse_id, _customer_id, v_recorded_method, _paid, _discount, _note, _items, _sale_date
  );

  SELECT total, paid INTO v_total, v_paid FROM public.sales_invoices WHERE id = v_invoice_id;

  -- Keep the invoice method truthful even if the caller sent something else.
  UPDATE public.sales_invoices
  SET payment_method = v_recorded_method::public.payment_method,
      updated_at = now()
  WHERE id = v_invoice_id
    AND payment_method IS DISTINCT FROM v_recorded_method::public.payment_method;

  FOR v_split IN
    SELECT
      (part ->> 'method') AS method,
      coalesce((part ->> 'amount')::numeric, 0) AS amount
    FROM jsonb_array_elements(_payment_splits) AS part
  LOOP
    INSERT INTO public.customer_payment_splits (
      customer_id, invoice_id, method, amount, occurred_at, created_by
    )
    VALUES (
      _customer_id,
      v_invoice_id,
      v_split.method::public.payment_method,
      round(v_split.amount, 2),
      coalesce(_sale_date, current_date)::timestamp + localtime,
      v_user
    );
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (
    v_user,
    'sale.tender_breakdown.recorded',
    'sales_invoice',
    v_invoice_id,
    jsonb_build_object(
      'recorded_payment_method', v_recorded_method,
      'components', v_component_count,
      'tender_total', round(v_split_total, 2),
      'total', v_total,
      'paid', v_paid
    )
  );

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.create_sale(uuid, uuid, text, numeric, numeric, text, jsonb, date, jsonb) IS
  'Posts a sale through the existing secure 8-argument flow and additionally persists the per-tender breakdown in customer_payment_splits. Records payment_method as the single tender method, or split when two or more distinct methods are used.';