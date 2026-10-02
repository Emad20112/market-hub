-- ============================================================================
-- Market-Hub ERP — Expense Management Module, Phase 4: Legacy bridge
-- ============================================================================
-- Reference: docs/EXPENSES_ERP_IMPLEMENTATION_PLAN.md
--   §24  Migration Strategy (reversible, reconciled, nothing destroyed)
--   §10  Accounting       (a "credit" row is NOT assumed to be paid cash)
--
-- WHY A FUNCTION AND NOT A ONE-SHOT SCRIPT
--   A backfill that runs once during a deployment is unrepeatable: if a row
--   fails, the operator is left with a half-migrated register and no safe way
--   to try again. This is a callable, idempotent routine instead, so it can be
--   run on staging, inspected, re-run, and run again after a fix — and every
--   re-run is a no-op for rows already bridged.
--
-- THE ONE INTERPRETATION THAT MATTERS
--   `public.expenses` cannot distinguish "paid immediately" from "bought on
--   credit": it stores a `payment_method` and nothing else, and `credit` is one
--   of the enum values. Guessing would be worse than useless — marking a
--   payable as settled hides a real liability, and marking a receipt as unpaid
--   invents one.
--
--   So the migration refuses to guess. The behaviour is an explicit parameter:
--
--     'paid'   — post the document AND write a completed payment. Choose this
--                only when the operator has confirmed that every legacy row in
--                scope was settled when it was recorded.
--     'unpaid' — post the document and leave it outstanding. The safe default
--                for a register that was only ever used as a cash log.
--     'draft'  — bring the row across as a draft and let a human decide. The
--                most conservative option and the right one for a first run on
--                production data you have not reconciled.
--
--   Whatever is chosen is recorded per document in `expense_approvals`, so an
--   auditor can see exactly which convention was applied and when.
--
-- ROLLBACK
--   DELETE FROM public.expense_entries WHERE legacy_expense_id IS NOT NULL;
--   (the foreign keys cascade to lines, payments, approvals and attachments;
--    the legacy `public.expenses` rows were never touched.)
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.expense_entries') IS NULL THEN
    RAISE EXCEPTION 'run 20261001090000_expense_module_foundation.sql first';
  END IF;
  IF to_regclass('public.expenses') IS NULL THEN
    RAISE EXCEPTION 'the legacy public.expenses table is missing — nothing to migrate';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Reconciliation view — what a migration would touch, before it runs
-- ---------------------------------------------------------------------------
-- The operator should be able to see the size and shape of the job without
-- mutating anything: how many rows, over what date range, what amounts, and how
-- many have no category at all.
CREATE OR REPLACE VIEW public.expense_legacy_reconciliation AS
SELECT
  count(*)                                             AS legacy_rows,
  count(*) FILTER (WHERE l.id IS NULL)                 AS not_yet_migrated,
  count(*) FILTER (WHERE l.id IS NOT NULL)             AS already_migrated,
  COALESCE(sum(x.amount), 0)                           AS legacy_total,
  COALESCE(sum(b.gross_amount), 0)                     AS migrated_total,
  COALESCE(min(x.expense_date), CURRENT_DATE)          AS first_date,
  COALESCE(max(x.expense_date), CURRENT_DATE)          AS last_date,
  count(*) FILTER (WHERE x.category_id IS NULL)        AS uncategorised_rows,
  count(*) FILTER (WHERE x.payment_method = 'credit')  AS credit_method_rows
FROM public.expenses x
-- A LEFT JOIN is what makes this a reconciliation: legacy rows with no bridged
-- document show up as `not_yet_migrated` rather than disappearing.
LEFT JOIN public.expense_entries l ON l.legacy_expense_id = x.id
LEFT JOIN public.expense_lines   b ON b.entry_id = l.id
GROUP BY ();  -- one row, always

COMMENT ON VIEW public.expense_legacy_reconciliation IS
  'مطابقة جدول المصروفات القديم مع المستندات الجديدة: كم صفًا، كم رُحّل، وفرق الإجمالي.';

GRANT SELECT ON public.expense_legacy_reconciliation TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. The bridge itself
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_legacy_expenses(
  p_mode      text    DEFAULT 'draft',    -- 'draft' | 'unpaid' | 'paid'
  p_from      date    DEFAULT NULL,
  p_to        date    DEFAULT NULL,
  p_batch_size integer DEFAULT 500,
  p_dry_run   boolean DEFAULT true
)
RETURNS TABLE (
  processed integer,
  created   integer,
  skipped   integer,
  failed    integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       uuid := public.expense_actor();
  v_row        record;
  v_entry_id   uuid;
  v_processed  integer := 0;
  v_created    integer := 0;
  v_skipped    integer := 0;
  v_failed     integer := 0;
  v_status     public.expense_status;
  v_payment    public.payment_method;
  v_batch      integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
BEGIN
  -- A data migration is an owner/manager action. `expense.post` is the closest
  -- existing capability in weight: it decides whether a number reaches the books.
  PERFORM public.expense_assert_capability(v_user, 'expense.post');

  IF p_mode NOT IN ('draft', 'unpaid', 'paid') THEN
    RAISE EXCEPTION 'mode must be draft, unpaid or paid (got %)', p_mode
      USING ERRCODE = '22023';
  END IF;

  v_status := CASE p_mode
                WHEN 'draft'  THEN 'DRAFT'::public.expense_status
                ELSE 'POSTED'::public.expense_status
              END;

  FOR v_row IN
    SELECT x.*
    FROM public.expenses x
    -- The NOT EXISTS is the idempotency guard and it is the reason a re-run is
    -- free: an already-bridged row is never revisited, so its document is never
    -- duplicated and its approval history is never rewritten.
    WHERE NOT EXISTS (
      SELECT 1 FROM public.expense_entries e WHERE e.legacy_expense_id = x.id
    )
      AND (p_from IS NULL OR x.expense_date >= p_from)
      AND (p_to   IS NULL OR x.expense_date <= p_to)
    ORDER BY x.expense_date, x.created_at
    LIMIT v_batch
  LOOP
    v_processed := v_processed + 1;

    BEGIN
      -- A zero-amount legacy row cannot become a valid document (the foundation
      -- requires a positive total) and carries no information. Counted rather
      -- than silently dropped, so the operator sees the number and can decide.
      IF COALESCE(v_row.amount, 0) <= 0 THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO public.expense_entries (
        reference, entry_type, status, source_kind,
        payee_type, expense_date,
        description, note,
        total_amount, tax_mode, currency, currency_symbol,
        created_by, legacy_expense_id,
        posting_date, posted_by, posted_at
      )
      VALUES (
        -- The legacy row keeps its own id in the reference, so an operator can
        -- still find a document in the new register using the number they have
        -- always quoted: EXP-LEG-<first 8 of the legacy uuid>.
        'EXP-LEG-' || upper(left(replace(v_row.id::text, '-', ''), 8)),
        'DIRECT',
        v_status,
        'LEGACY',
        'NONE',
        v_row.expense_date,
        COALESCE(
          NULLIF(btrim(COALESCE(v_row.note, '')), ''),
          (SELECT COALESCE(c.name_ar, c.name) FROM public.expense_categories c
            WHERE c.id = v_row.category_id),
          'Migrated expense'
        ),
        v_row.note,
        public.expense_round(v_row.amount),
        'NONE',
        COALESCE((SELECT NULLIF(btrim(currency), '') FROM public.company_settings ORDER BY id LIMIT 1), 'YER'),
        COALESCE((SELECT NULLIF(btrim(currency_symbol), '') FROM public.company_settings ORDER BY id LIMIT 1), '﷼'),
        -- `created_by` is deliberately NOT taken from the legacy row: the
        -- original author may have been deleted, and a null creator is honest.
        -- The actor performing the migration is recorded in the audit trail
        -- instead, which is where attribution for a migration belongs.
        NULL,
        v_row.id,
        CASE WHEN v_status = 'POSTED' THEN v_row.expense_date END,
        CASE WHEN v_status = 'POSTED' THEN v_user END,
        CASE WHEN v_status = 'POSTED' THEN now() END
      )
      RETURNING id INTO v_entry_id;

      -- One line per legacy row: the old model could only express one amount,
      -- so inventing a split would be fabricating structure that was never
      -- there. What it DID record — the amount, the category and the note — is
      -- preserved exactly.
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

      -- `credit` is the one legacy value that unambiguously means "not settled",
      -- so it overrides the 'paid' mode rather than being overruled by it.
      IF p_mode = 'paid' AND v_row.payment_method IS DISTINCT FROM 'credit' THEN
        v_payment := COALESCE(v_row.payment_method, 'cash');

        INSERT INTO public.expense_payments (
          entry_id, amount, payment_date, payment_method, note,
          idempotency_key, created_by
        )
        VALUES (
          v_entry_id, public.expense_round(v_row.amount),
          -- The legacy table records when the row was typed, not when it was
          -- paid; used as the closest available evidence and labelled as such.
          v_row.expense_date,
          v_payment,
          'Migrated from legacy expense ' || v_row.id::text,
          'legacy:' || v_row.id::text,
          v_user
        )
        ON CONFLICT DO NOTHING;
      END IF;

      INSERT INTO public.expense_approvals (
        entry_id, sequence, action, from_status, to_status, actor_id, reason
      )
      VALUES (
        v_entry_id, 1,
        CASE WHEN v_status = 'POSTED' THEN 'posted' ELSE 'created' END,
        NULL, v_status, v_user,
        'Migrated from legacy expense ' || v_row.id::text || ' (mode: ' || p_mode || ')'
      );

      v_created := v_created + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One bad row must not abort the batch. The failure is counted and the
      -- message is raised as a notice so it reaches the operator's log without
      -- rolling back the rows that succeeded.
      v_failed := v_failed + 1;
      RAISE WARNING 'legacy expense % could not be migrated: %', v_row.id, SQLERRM;
    END;
  END LOOP;

  -- A dry run performs identical work and then throws it away. That is the
  -- point: the validation, the reference generation and the line arithmetic are
  -- exercised exactly as they would be for real, so a dry run actually proves
  -- something. The exception below is caught by the caller, not an error path.
  IF p_dry_run THEN
    RAISE EXCEPTION 'DRY RUN: % processed, % would be created, % skipped, % failed — nothing was written',
      v_processed, v_created, v_skipped, v_failed
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, payload)
  VALUES (v_user, 'expense.legacy.migrated', 'expense_entry',
          jsonb_build_object(
            'mode', p_mode, 'processed', v_processed, 'created', v_created,
            'skipped', v_skipped, 'failed', v_failed,
            'from', p_from, 'to', p_to));

  RETURN QUERY SELECT v_processed, v_created, v_skipped, v_failed;
END $$;

REVOKE ALL ON FUNCTION public.migrate_legacy_expenses(text, date, date, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.migrate_legacy_expenses(text, date, date, integer, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.migrate_legacy_expenses(text, date, date, integer, boolean) IS
  'ترحيل المصروفات القديمة إلى المستندات الجديدة بشكل قابل للتكرار: آمن لإعادة التشغيل، '
  'ويتوقف عند الصفوف المرحّلة سابقًا. الافتراضي مسودة ولا يفسّر سجل credit كمدفوع.';
