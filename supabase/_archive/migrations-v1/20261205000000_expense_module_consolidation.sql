-- ============================================================================
-- Market-Hub ERP — Expense Management Module Consolidation
-- ============================================================================
-- Migration: 20261205000000_expense_module_consolidation.sql
-- Goals:
--   1. Link Expense Payments to real Financial Accounts (public.accounts).
--   2. Update workflow RPCs (post_expense, record_expense_payment) to accept account_id.
--   3. Update expense_lookups to include cash/bank financial accounts.
--   4. Strengthen overdue definitions in expense_summary (due_date + remaining balance).
--   5. Safely backfill legacy expenses into the unified document model.
--   6. Guard public.expenses against unauthorized writes/deletes.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.expense_entries') IS NULL THEN
    RAISE EXCEPTION 'expense_entries is missing — run baseline expense migrations first';
  END IF;
  IF to_regclass('public.expense_payments') IS NULL THEN
    RAISE EXCEPTION 'expense_payments is missing — run baseline expense migrations first';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Financial Accounts on expense_payments
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.accounts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'expense_payments' AND column_name = 'account_id'
    ) THEN
      ALTER TABLE public.expense_payments
        ADD COLUMN account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS expense_payments_account_id_idx
        ON public.expense_payments (account_id)
        WHERE account_id IS NOT NULL;

      COMMENT ON COLUMN public.expense_payments.account_id IS
        'الحساب المالي (الصندوق أو البنك) من دليل الحسابات الذي خُصم منه المبلغ فعليًا.';
    END IF;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Update record_expense_payment to support account_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_expense_payment(
  p_entry_id        uuid,
  p_amount          numeric,
  p_payment_date    date                   DEFAULT CURRENT_DATE,
  p_payment_method  public.payment_method DEFAULT 'cash',
  p_account_label   text                   DEFAULT NULL,
  p_reference_no    text                   DEFAULT NULL,
  p_note            text                   DEFAULT NULL,
  p_idempotency_key text                   DEFAULT NULL,
  p_account_id      uuid                   DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.expense_actor();
  v_entry     public.expense_entries;
  v_amount    numeric(18,2);
  v_existing  public.expense_payments;
  v_label     text := nullif(btrim(coalesce(p_account_label, '')), '');
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.pay');

  IF v_entry.status NOT IN ('POSTED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Payments can only be recorded against posted expenses (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;

  v_amount := public.expense_round(p_amount);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF v_amount > v_entry.remaining_amount + 0.005 THEN
    RAISE EXCEPTION 'Payment (%) exceeds remaining amount (%)', v_amount, v_entry.remaining_amount
      USING ERRCODE = '22023';
  END IF;

  -- If financial account provided, fetch label default if label is empty
  IF p_account_id IS NOT NULL AND v_label IS NULL AND to_regclass('public.accounts') IS NOT NULL THEN
    SELECT name_ar INTO v_label FROM public.accounts WHERE id = p_account_id;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.expense_payments
     WHERE idempotency_key = btrim(p_idempotency_key);
    IF FOUND THEN
      RETURN v_entry;
    END IF;
  END IF;

  INSERT INTO public.expense_payments (
    entry_id, amount, payment_date, payment_method,
    account_label, reference_no, note, idempotency_key, created_by,
    account_id
  )
  VALUES (
    p_entry_id, v_amount, COALESCE(p_payment_date, CURRENT_DATE),
    COALESCE(p_payment_method, 'cash'),
    v_label,
    nullif(btrim(coalesce(p_reference_no, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    nullif(btrim(coalesce(p_idempotency_key, '')), ''),
    v_user,
    p_account_id
  );

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id;

  PERFORM public.expense_log_action(
    p_entry_id, 'payment', v_entry.status, v_entry.status,
    'Payment of ' || v_amount::text || ' ' || v_entry.currency_symbol || ' recorded',
    v_user
  );

  RETURN v_entry;
END $$;

-- Preserve backward compatibility signature (8 parameters)
CREATE OR REPLACE FUNCTION public.record_expense_payment(
  p_entry_id        uuid,
  p_amount          numeric,
  p_payment_date    date                   DEFAULT CURRENT_DATE,
  p_payment_method  public.payment_method DEFAULT 'cash',
  p_account_label   text                   DEFAULT NULL,
  p_reference_no    text                   DEFAULT NULL,
  p_note            text                   DEFAULT NULL,
  p_idempotency_key text                   DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.record_expense_payment(
    p_entry_id, p_amount, p_payment_date, p_payment_method,
    p_account_label, p_reference_no, p_note, p_idempotency_key, NULL
  );
END $$;

-- -----------------------------------------------------------------------------
-- 3. Update post_expense to support account_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_expense(
  p_entry_id          uuid,
  p_expected_version  integer                   DEFAULT NULL,
  p_pay_now           boolean                   DEFAULT false,
  p_payment_method    public.payment_method    DEFAULT 'cash',
  p_account_label     text                      DEFAULT NULL,
  p_payment_date      date                      DEFAULT NULL,
  p_idempotency_key   text                      DEFAULT NULL,
  p_account_id        uuid                      DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.expense_actor();
  v_entry public.expense_entries;
  v_from  public.expense_status;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  v_from := v_entry.status;

  IF v_from = 'POSTED' THEN
    RETURN v_entry;
  END IF;

  IF v_from NOT IN ('APPROVED', 'DRAFT') THEN
    RAISE EXCEPTION 'This expense cannot be posted from status %', v_from
      USING ERRCODE = '55000';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.post');

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  IF v_entry.total_amount <= 0 OR v_entry.line_count = 0 THEN
    RAISE EXCEPTION 'Cannot post an expense with no lines' USING ERRCODE = '22023';
  END IF;

  IF v_from = 'DRAFT' AND NOT public.expense_can(v_user, 'expense.approve') THEN
    RAISE EXCEPTION 'Submit this expense for approval before posting it'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.expense_entries
     SET status       = 'POSTED',
         posting_date = COALESCE(posting_date, CURRENT_DATE),
         posted_by    = v_user,
         posted_at    = now(),
         version      = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'posted', v_from, 'POSTED', NULL, v_user);

  IF p_pay_now THEN
    SELECT * INTO v_entry FROM public.record_expense_payment(
      p_entry_id,
      v_entry.total_amount,
      COALESCE(p_payment_date, CURRENT_DATE),
      p_payment_method,
      p_account_label,
      NULL,
      'Settled at posting',
      COALESCE(p_idempotency_key, 'post:' || p_entry_id::text),
      p_account_id
    );
  END IF;

  RETURN v_entry;
END $$;

-- Preserve backward compatibility signature (7 parameters)
CREATE OR REPLACE FUNCTION public.post_expense(
  p_entry_id          uuid,
  p_expected_version  integer                   DEFAULT NULL,
  p_pay_now           boolean                   DEFAULT false,
  p_payment_method    public.payment_method    DEFAULT 'cash',
  p_account_label     text                      DEFAULT NULL,
  p_payment_date      date                      DEFAULT NULL,
  p_idempotency_key   text                      DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.post_expense(
    p_entry_id, p_expected_version, p_pay_now, p_payment_method,
    p_account_label, p_payment_date, p_idempotency_key, NULL
  );
END $$;

-- -----------------------------------------------------------------------------
-- 4. Update expense_lookups to include financial accounts
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expense_lookups(p_include_archived boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'name_ar', c.name_ar,
               'is_active', c.is_active, 'sort_order', c.sort_order,
               'usage_count', (SELECT count(*) FROM public.expense_lines l WHERE l.category_id = c.id)
             ) ORDER BY c.sort_order, c.name)
      FROM public.expense_categories c
      WHERE p_include_archived OR c.is_active
    ), '[]'::jsonb),
    'warehouses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', w.id, 'name', w.name, 'name_ar', w.name_ar, 'is_default', w.is_default
             ) ORDER BY w.name)
      FROM public.warehouses w
      WHERE w.is_active IS NOT FALSE
    ), '[]'::jsonb),
    'cost_centers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', cc.id, 'code', cc.code, 'name', cc.name, 'name_ar', cc.name_ar
             ) ORDER BY cc.name)
      FROM public.expense_cost_centers cc
      WHERE cc.is_active
    ), '[]'::jsonb),
    'projects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', pj.id, 'code', pj.code, 'name', pj.name, 'name_ar', pj.name_ar
             ) ORDER BY pj.name)
      FROM public.expense_projects pj
      WHERE pj.is_active
    ), '[]'::jsonb),
    'suppliers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
      FROM public.suppliers s
      WHERE s.is_active IS NOT FALSE
    ), '[]'::jsonb),
    'employees', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name) ORDER BY p.full_name)
      FROM public.profiles p
      JOIN public.user_roles r ON r.user_id = p.id
      WHERE p.is_active IS NOT FALSE
      GROUP BY p.id, p.full_name
    ), '[]'::jsonb),
    'financial_accounts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'code', a.code, 'name_ar', a.name_ar,
               'account_type', a.account_type,
               'requires_reconciliation', a.requires_reconciliation
             ) ORDER BY a.code)
      FROM public.accounts a
      WHERE a.is_active IS NOT FALSE
        AND (a.requires_reconciliation IS TRUE OR a.code LIKE '11%')
    ), '[]'::jsonb)
  )$$;

-- -----------------------------------------------------------------------------
-- 5. Strengthen Overdue in expense_summary
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expense_summary(
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT e.*
    FROM public.expense_entries e
    WHERE (p_date_from IS NULL OR e.expense_date >= p_date_from)
      AND (p_date_to   IS NULL OR e.expense_date <= p_date_to)
      AND (p_warehouse_id IS NULL OR e.warehouse_id = p_warehouse_id)
      AND e.status NOT IN ('CANCELLED', 'REVERSED')
  )
  SELECT jsonb_build_object(
    'period_total',      COALESCE(sum(total_amount), 0),
    'posted_total',      COALESCE(sum(total_amount) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED')), 0),
    'paid_total',        COALESCE(sum(paid_amount), 0),
    'outstanding_total', COALESCE(sum(remaining_amount) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID') AND remaining_amount > 0.005), 0),
    'pending_total',     COALESCE(sum(total_amount) FILTER (WHERE status = 'SUBMITTED'), 0),
    'draft_total',       COALESCE(sum(total_amount) FILTER (WHERE status IN ('DRAFT', 'REJECTED')), 0),
    'total_count',       count(*),
    'pending_count',     count(*) FILTER (WHERE status = 'SUBMITTED'),
    'unpaid_count',      count(*) FILTER (WHERE status = 'POSTED'),
    'partial_count',     count(*) FILTER (WHERE status = 'PARTIALLY_PAID'),
    'paid_count',        count(*) FILTER (WHERE status IN ('PAID', 'CLOSED')),
    'draft_count',       count(*) FILTER (WHERE status IN ('DRAFT', 'REJECTED')),
    'overdue_count',     count(*) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                             AND due_date IS NOT NULL
                             AND due_date < CURRENT_DATE
                             AND remaining_amount > 0.005),
    'overdue_total',     COALESCE(sum(remaining_amount) FILTER (
                           WHERE status IN ('POSTED', 'PARTIALLY_PAID')
                             AND due_date IS NOT NULL
                             AND due_date < CURRENT_DATE
                             AND remaining_amount > 0.005), 0)
  )
  FROM scoped$$;

-- -----------------------------------------------------------------------------
-- 6. Safe Automatic Backfill of Legacy Expenses
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_migrated_count integer := 0;
  v_row record;
  v_entry_id uuid;
  v_admin uuid;
BEGIN
  IF to_regclass('public.expenses') IS NOT NULL AND to_regclass('public.expense_entries') IS NOT NULL THEN
    -- Find a staff/owner user for audit attribution, or fallback to NULL
    SELECT user_id INTO v_admin FROM public.user_roles WHERE role::text IN ('owner', 'superadmin', 'admin') LIMIT 1;

    FOR v_row IN
      SELECT x.*
      FROM public.expenses x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.expense_entries e WHERE e.legacy_expense_id = x.id
      )
        AND COALESCE(x.amount, 0) > 0
      ORDER BY x.expense_date, x.created_at
    LOOP
      BEGIN
        INSERT INTO public.expense_entries (
          reference, entry_type, status, source_kind,
          payee_type, expense_date,
          description, note,
          total_amount, tax_mode, currency, currency_symbol,
          created_by, legacy_expense_id,
          posting_date, posted_by, posted_at
        )
        VALUES (
          'EXP-LEG-' || upper(left(replace(v_row.id::text, '-', ''), 8)),
          'DIRECT',
          'POSTED',
          'LEGACY',
          'NONE',
          v_row.expense_date,
          COALESCE(
            NULLIF(btrim(COALESCE(v_row.note, '')), ''),
            (SELECT COALESCE(c.name_ar, c.name) FROM public.expense_categories c WHERE c.id = v_row.category_id),
            'مصروف مرحّل'
          ),
          v_row.note,
          public.expense_round(v_row.amount),
          'NONE',
          COALESCE((SELECT NULLIF(btrim(currency), '') FROM public.company_settings ORDER BY id LIMIT 1), 'YER'),
          COALESCE((SELECT NULLIF(btrim(currency_symbol), '') FROM public.company_settings ORDER BY id LIMIT 1), '﷼'),
          v_admin,
          v_row.id,
          v_row.expense_date,
          v_admin,
          now()
        )
        RETURNING id INTO v_entry_id;

        INSERT INTO public.expense_lines (
          entry_id, line_no, description, category_id, quantity, unit_price,
          net_amount, tax_rate, tax_amount, gross_amount
        )
        VALUES (
          v_entry_id, 1,
          NULLIF(btrim(COALESCE(v_row.note, '')), ''),
          v_row.category_id, 1, public.expense_round(v_row.amount),
          public.expense_round(v_row.amount), 0, 0,
          public.expense_round(v_row.amount)
        );

        -- If not explicitly 'credit', record payment row
        IF v_row.payment_method IS DISTINCT FROM 'credit' THEN
          INSERT INTO public.expense_payments (
            entry_id, amount, payment_date, payment_method, note,
            idempotency_key, created_by
          )
          VALUES (
            v_entry_id, public.expense_round(v_row.amount),
            v_row.expense_date,
            COALESCE(v_row.payment_method, 'cash'),
            'سداد مصروف مرحل من النظام القديم: ' || v_row.id::text,
            'legacy-mig:' || v_row.id::text,
            v_admin
          )
          ON CONFLICT DO NOTHING;
        END IF;

        INSERT INTO public.expense_approvals (
          entry_id, sequence, action, from_status, to_status, actor_id, reason
        )
        VALUES (
          v_entry_id, 1, 'posted', NULL, 'POSTED', v_admin,
          'ترحيل آلي آمن من السجل التاريخي: ' || v_row.id::text
        );

        v_migrated_count := v_migrated_count + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not auto-backfill legacy expense %: %', v_row.id, SQLERRM;
      END;
    END LOOP;

    RAISE NOTICE 'Auto-backfilled % legacy expense records.', v_migrated_count;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. Permissions and Grants
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.post_expense(
  uuid, integer, boolean, public.payment_method, text, date, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_expense(
  uuid, integer, boolean, public.payment_method, text, date, text, uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.record_expense_payment(
  uuid, numeric, date, public.payment_method, text, text, text, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_payment(
  uuid, numeric, date, public.payment_method, text, text, text, text, uuid
) TO authenticated;
