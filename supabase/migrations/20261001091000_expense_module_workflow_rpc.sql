-- ============================================================================
-- Market-Hub ERP — Expense Management Module, Phase 2: Atomic workflow RPCs
-- ============================================================================
-- Reference: docs/EXPENSES_ERP_IMPLEMENTATION_PLAN.md
--   §8   Expense Lifecycle      (who may move a document, and when)
--   §17  Approval Workflow      (one step, no self-approval)
--   §30  RPC Plan               (one function per decision, not per field)
--
-- WHY RPCs AND NOT RLS-ONLY WRITES
--   Phase 1 granted `authenticated` SELECT and nothing else on the document
--   tables. The reason is that a status machine cannot be expressed as a row
--   policy: `USING (is_staff(auth.uid()))` would let any active user move a
--   document from DRAFT straight to PAID, and "approved by someone other than
--   the author" is a statement about two rows (the document and the approver),
--   which a WITH CHECK cannot see.
--
--   So every mutation is a single SECURITY DEFINER function that, inside one
--   transaction:
--     1. resolves the actor from auth.uid() — never from a parameter,
--     2. checks the capability from the role matrix in Phase 1,
--     3. checks the expected status and version (optimistic concurrency),
--     4. performs the change,
--     5. appends the approval/audit trail,
--     6. returns the new document state.
--
--   If any step raises, the whole thing rolls back — including the audit row,
--   so the trail can never claim something that did not happen.
--
-- WHAT IS NOT HERE
--   * No journal entries. Plan §10 defers the ledger to its own phase, and
--     inventing account codes here would hard-code a chart of accounts that
--     does not exist.
--   * No attachments upload. Storage policies are their own phase.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.create_expense(...);   -- and the rest
--   (Phase 1 tables are untouched by this migration.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preflight
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.expense_entries') IS NULL THEN
    RAISE EXCEPTION 'run 20261001090000_expense_module_foundation.sql first';
  END IF;
  IF to_regprocedure('public.expense_can(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'public.expense_can is missing — run the foundation migration first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Shared helpers
-- ---------------------------------------------------------------------------

-- Resolves the calling user exactly once, with the same failure for every RPC,
-- so "not signed in" is never reported as something more interesting.
CREATE OR REPLACE FUNCTION public.expense_actor()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN v_user;
END $$;

-- Capability gate with a message an operator can act on. The plan's §18 rule is
-- explicit: the UI hides buttons, the database refuses.
CREATE OR REPLACE FUNCTION public.expense_assert_capability(p_user uuid, p_capability text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.expense_can(p_user, p_capability) THEN
    RAISE EXCEPTION 'Forbidden: % requires a higher role', p_capability
      USING ERRCODE = '42501';
  END IF;
END $$;

-- The reference is generated server-side so two clients typing at once cannot
-- produce the same human number. A sequence is the only thing that is actually
-- collision-free under concurrency.
CREATE SEQUENCE IF NOT EXISTS public.expense_reference_seq START 1;

CREATE OR REPLACE FUNCTION public.next_expense_reference()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_number bigint;
BEGIN
  SELECT coalesce(nullif(btrim(expense_prefix), ''), 'EXP')
    INTO v_prefix
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;

  IF v_prefix IS NULL THEN
    v_prefix := 'EXP';
  END IF;

  v_number := nextval('public.expense_reference_seq');
  RETURN v_prefix || '-' || to_char(now(), 'YYYYMM') || '-' || lpad(v_number::text, 5, '0');
END $$;

-- Sequence access must not be exposed as a raw nextval to the browser.
REVOKE ALL ON SEQUENCE public.expense_reference_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SEQUENCE public.expense_reference_seq TO service_role;

GRANT EXECUTE ON FUNCTION public.expense_actor()                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_assert_capability(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_expense_reference()                       TO authenticated;
-- ---------------------------------------------------------------------------
-- 2. Line ingestion
-- ---------------------------------------------------------------------------
-- Every function that accepts lines goes through this one, so validation and
-- rounding cannot differ between "create", "update" and "duplicate". It writes
-- the lines and returns the computed total; the header is updated by the
-- caller, which keeps the ordering explicit and testable.
CREATE OR REPLACE FUNCTION public.expense_write_lines(
  p_entry_id uuid,
  p_lines jsonb,
  p_tax_mode public.expense_tax_mode,
  OUT o_total numeric,
  OUT o_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line        jsonb;
  v_index       integer := 0;
  v_qty         numeric;
  v_price       numeric;
  v_rate        numeric;
  v_gross       numeric;
  v_net         numeric;
  v_tax         numeric;
BEGIN
  o_total := 0;
  o_count := 0;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one expense line is required' USING ERRCODE = '22023';
  END IF;

  -- Replacing the whole set is intentional: a partial update would need a line
  -- identity from the client, and clients do not own line identity here.
  DELETE FROM public.expense_lines WHERE entry_id = p_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_index := v_index + 1;

    v_qty   := COALESCE((v_line ->> 'quantity')::numeric, 1);
    v_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_rate  := COALESCE((v_line ->> 'tax_rate')::numeric, 0);

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Line %: quantity must be greater than zero', v_index USING ERRCODE = '22023';
    END IF;
    IF v_price IS NULL OR v_price < 0 THEN
      RAISE EXCEPTION 'Line %: unit price cannot be negative', v_index USING ERRCODE = '22023';
    END IF;
    IF v_rate < 0 OR v_rate > 100 THEN
      RAISE EXCEPTION 'Line %: tax rate must be between 0 and 100', v_index USING ERRCODE = '22023';
    END IF;

    -- The client sends what the operator typed — the gross figure on the paper
    -- bill. Net and tax are derived here so the two can never disagree, and so
    -- the arithmetic is identical for a JS client and a future import script.
    v_gross := public.expense_round(v_qty * v_price);
    v_net   := public.expense_line_net(v_gross, v_rate, p_tax_mode);
    v_tax   := public.expense_line_tax(v_gross, v_rate, p_tax_mode);

    INSERT INTO public.expense_lines (
      entry_id, line_no, description, category_id, quantity, unit_price,
      net_amount, tax_rate, tax_amount, gross_amount,
      cost_center_id, project_id, note
    )
    VALUES (
      p_entry_id,
      v_index,
      nullif(btrim(coalesce(v_line ->> 'description', '')), ''),
      nullif(btrim(coalesce(v_line ->> 'category_id', '')), '')::uuid,
      v_qty,
      v_price,
      v_net,
      v_rate,
      v_tax,
      v_gross,
      nullif(btrim(coalesce(v_line ->> 'cost_center_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_line ->> 'project_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_line ->> 'note', '')), '')
    );

    o_total := o_total + v_gross;
    o_count := o_count + 1;
  END LOOP;

  o_total := public.expense_round(o_total);

  IF o_total <= 0 THEN
    RAISE EXCEPTION 'Expense total must be greater than zero' USING ERRCODE = '22023';
  END IF;
END $$;

COMMENT ON FUNCTION public.expense_write_lines(uuid, jsonb, public.expense_tax_mode) IS
  'يكتب بنود المصروف ويحسب صافي/ضريبة/إجمالي كل بند والإجمالي العام. نقطة التحقق الوحيدة للبنود.';
-- ---------------------------------------------------------------------------
-- 3. Approval trail writer
-- ---------------------------------------------------------------------------
-- Append-only, and it allocates its own sequence number under a row lock on the
-- document. Two approvers racing each other therefore produce two distinct
-- entries rather than a duplicate-key error that would roll back the action.
CREATE OR REPLACE FUNCTION public.expense_log_action(
  p_entry_id uuid,
  p_action text,
  p_from public.expense_status,
  p_to public.expense_status,
  p_reason text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    uuid := COALESCE(p_actor, auth.uid());
  v_sequence integer;
BEGIN
  SELECT COALESCE(max(sequence), 0) + 1
    INTO v_sequence
  FROM public.expense_approvals
  WHERE entry_id = p_entry_id;

  INSERT INTO public.expense_approvals (
    entry_id, sequence, action, from_status, to_status, actor_id, reason
  )
  VALUES (p_entry_id, v_sequence, p_action, p_from, p_to, v_actor,
          nullif(btrim(coalesce(p_reason, '')), ''));

  -- The generic audit log keeps the expense trail discoverable from the same
  -- screen an owner already uses for every other module.
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, payload)
  VALUES (v_actor, 'expense.' || p_action, 'expense_entry', p_entry_id,
          jsonb_build_object('from', p_from, 'to', p_to, 'reason', p_reason));
END $$;

COMMENT ON FUNCTION public.expense_log_action(uuid, text, public.expense_status, public.expense_status, text, uuid) IS
  'يسجّل الانتقال في سجل الموافقات وفي سجل التدقيق العام داخل نفس المعاملة.';
-- ---------------------------------------------------------------------------
-- 4. create_expense — one call, one whole document
-- ---------------------------------------------------------------------------
-- Header and lines are written together on purpose: a client that could create
-- a header and then fail to write its lines would leave an empty document in
-- the register, and an empty document in a financial register is a bug that
-- someone has to clean up by hand.
CREATE OR REPLACE FUNCTION public.create_expense(
  p_lines        jsonb,
  p_expense_date date                        DEFAULT CURRENT_DATE,
  p_due_date     date                        DEFAULT NULL,
  p_entry_type   public.expense_entry_type   DEFAULT 'DIRECT',
  p_payee_type   public.expense_payee_type   DEFAULT 'NONE',
  p_payee_name   text                        DEFAULT NULL,
  p_supplier_id  uuid                        DEFAULT NULL,
  p_employee_id  uuid                        DEFAULT NULL,
  p_warehouse_id uuid                        DEFAULT NULL,
  p_cost_center_id uuid                      DEFAULT NULL,
  p_project_id   uuid                        DEFAULT NULL,
  p_description  text                        DEFAULT NULL,
  p_note         text                        DEFAULT NULL,
  p_tax_mode     public.expense_tax_mode     DEFAULT 'NONE',
  p_reference    text                        DEFAULT NULL,
  p_submit       boolean                     DEFAULT false
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.expense_actor();
  v_entry  public.expense_entries;
  v_total  numeric;
  v_count  integer;
  v_ref    text;
  v_status public.expense_status;
  v_currency text;
  v_symbol   text;
BEGIN
  PERFORM public.expense_assert_capability(v_user, 'expense.create');

  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Expense date is required' USING ERRCODE = '22023';
  END IF;
  -- Plan §10: the three dates are distinct concepts; a due date before the
  -- occurrence would make the ageing report negative from day one.
  IF p_due_date IS NOT NULL AND p_due_date < p_expense_date THEN
    RAISE EXCEPTION 'Due date cannot precede the expense date' USING ERRCODE = '22023';
  END IF;

  -- The payee triple is validated in SQL as well as by the table constraint, so
  -- the caller gets a readable message instead of a constraint name.
  IF p_payee_type = 'SUPPLIER' AND p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'A supplier payee requires a supplier' USING ERRCODE = '22023';
  END IF;
  IF p_payee_type = 'EMPLOYEE' AND p_employee_id IS NULL THEN
    RAISE EXCEPTION 'An employee payee requires a staff member' USING ERRCODE = '22023';
  END IF;

  -- Currency is snapshotted at creation (Phase 1 rationale): a later change to
  -- the company currency must not re-label a historical voucher.
  SELECT COALESCE(NULLIF(btrim(currency), ''), 'YER'),
         COALESCE(NULLIF(btrim(currency_symbol), ''), '﷼')
    INTO v_currency, v_symbol
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;
  v_currency := COALESCE(v_currency, 'YER');
  v_symbol   := COALESCE(v_symbol, '﷼');

  -- `submit` is offered as a flag because the common real-world action is
  -- "record it and send it for approval", and doing that in two round-trips is
  -- how a document ends up stranded in DRAFT.
  v_status := CASE WHEN p_submit THEN 'SUBMITTED'::public.expense_status
                   ELSE 'DRAFT'::public.expense_status END;

  v_ref := COALESCE(
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    public.next_expense_reference()
  );

  INSERT INTO public.expense_entries (
    reference, entry_type, status, source_kind,
    payee_type, payee_name, supplier_id, employee_id,
    warehouse_id, cost_center_id, project_id,
    expense_date, due_date,
    description, note,
    tax_mode, currency, currency_symbol,
    created_by, submitted_by, submitted_at
  )
  VALUES (
    v_ref, p_entry_type, v_status, 'MANUAL',
    p_payee_type,
    nullif(btrim(coalesce(p_payee_name, '')), ''),
    CASE WHEN p_payee_type = 'SUPPLIER' THEN p_supplier_id END,
    CASE WHEN p_payee_type = 'EMPLOYEE' THEN p_employee_id END,
    p_warehouse_id, p_cost_center_id, p_project_id,
    p_expense_date, p_due_date,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_tax_mode, v_currency, v_symbol,
    v_user,
    CASE WHEN p_submit THEN v_user END,
    CASE WHEN p_submit THEN now() END
  )
  RETURNING * INTO v_entry;

  SELECT o_total, o_count INTO v_total, v_count
  FROM public.expense_write_lines(v_entry.id, p_lines, p_tax_mode);

  -- The line trigger already synced these; the assignment is explicit so the
  -- RETURNING value below is correct without a second read.
  UPDATE public.expense_entries
     SET total_amount = v_total,
         line_count   = v_count
   WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(
    v_entry.id, 'created', NULL, v_status,
    CASE WHEN p_submit THEN 'Created and submitted' ELSE 'Created as draft' END, v_user);

  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION public.create_expense(
  jsonb, date, date, public.expense_entry_type, public.expense_payee_type, text,
  uuid, uuid, uuid, uuid, uuid, text, text, public.expense_tax_mode, text, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_expense(
  jsonb, date, date, public.expense_entry_type, public.expense_payee_type, text,
  uuid, uuid, uuid, uuid, uuid, text, text, public.expense_tax_mode, text, boolean
) TO authenticated;

COMMENT ON FUNCTION public.create_expense(
  jsonb, date, date, public.expense_entry_type, public.expense_payee_type, text,
  uuid, uuid, uuid, uuid, uuid, text, text, public.expense_tax_mode, text, boolean
) IS
  'ينشئ مستند مصروف كامل (رأس + بنود) في معاملة واحدة، مع حساب الإجمالي ورقم مرجعي فريد.';
-- ---------------------------------------------------------------------------
-- 5. update_expense — draft only, version-checked
-- ---------------------------------------------------------------------------
-- Only DRAFT and REJECTED documents can be edited. A submitted document is
-- waiting on someone else's decision, and editing it underneath them would
-- invalidate the approval they are about to give — so the transition is
-- "reject it back to draft", not "quietly change it".
CREATE OR REPLACE FUNCTION public.update_expense(
  p_entry_id     uuid,
  p_expected_version integer,
  p_lines        jsonb,
  p_expense_date date                      DEFAULT NULL,
  p_due_date     date                      DEFAULT NULL,
  p_entry_type   public.expense_entry_type DEFAULT NULL,
  p_payee_type   public.expense_payee_type DEFAULT NULL,
  p_payee_name   text                      DEFAULT NULL,
  p_supplier_id  uuid                      DEFAULT NULL,
  p_employee_id  uuid                      DEFAULT NULL,
  p_warehouse_id uuid                      DEFAULT NULL,
  p_cost_center_id uuid                    DEFAULT NULL,
  p_project_id   uuid                      DEFAULT NULL,
  p_description  text                      DEFAULT NULL,
  p_note         text                      DEFAULT NULL,
  p_tax_mode     public.expense_tax_mode   DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      uuid := public.expense_actor();
  v_entry     public.expense_entries;
  v_total     numeric;
  v_count     integer;
  v_tax_mode  public.expense_tax_mode;
  v_payee     public.expense_payee_type;
  v_from      public.expense_status;
BEGIN
  -- `FOR UPDATE` is what makes the version check meaningful: without the row
  -- lock, two concurrent updates could both read version 3, both pass the
  -- check, and the second would silently overwrite the first.
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  v_from := v_entry.status;

  IF v_from NOT IN ('DRAFT', 'REJECTED') THEN
    RAISE EXCEPTION 'Only a draft or a returned expense can be edited (current: %)', v_from
      USING ERRCODE = '55000';
  END IF;

  -- Ownership or an accounting-and-above role. A cashier must not be able to
  -- rewrite a colleague's draft.
  IF NOT (v_entry.created_by = v_user OR public.expense_role_rank(v_user) >= 30) THEN
    RAISE EXCEPTION 'Forbidden: you can only edit your own drafts' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expense_assert_capability(v_user, 'expense.edit');

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  v_tax_mode := COALESCE(p_tax_mode, v_entry.tax_mode);
  v_payee    := COALESCE(p_payee_type, v_entry.payee_type);

  IF v_payee = 'SUPPLIER' AND COALESCE(p_supplier_id, v_entry.supplier_id) IS NULL THEN
    RAISE EXCEPTION 'A supplier payee requires a supplier' USING ERRCODE = '22023';
  END IF;
  IF v_payee = 'EMPLOYEE' AND COALESCE(p_employee_id, v_entry.employee_id) IS NULL THEN
    RAISE EXCEPTION 'An employee payee requires a staff member' USING ERRCODE = '22023';
  END IF;

  UPDATE public.expense_entries
     SET expense_date   = COALESCE(p_expense_date, expense_date),
         due_date       = p_due_date,
         entry_type     = COALESCE(p_entry_type, entry_type),
         payee_type     = v_payee,
         payee_name     = nullif(btrim(coalesce(p_payee_name, '')), ''),
         supplier_id    = CASE WHEN v_payee = 'SUPPLIER' THEN p_supplier_id END,
         employee_id    = CASE WHEN v_payee = 'EMPLOYEE' THEN p_employee_id END,
         warehouse_id   = p_warehouse_id,
         cost_center_id = p_cost_center_id,
         project_id     = p_project_id,
         description    = nullif(btrim(coalesce(p_description, '')), ''),
         note           = nullif(btrim(coalesce(p_note, '')), ''),
         tax_mode       = v_tax_mode,
         -- A rejected document that is edited becomes a draft again: it must
         -- re-earn its approval rather than inheriting the old decision.
         status         = 'DRAFT'::public.expense_status,
         rejection_reason = NULL,
         version        = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  SELECT o_total, o_count INTO v_total, v_count
  FROM public.expense_write_lines(p_entry_id, p_lines, v_tax_mode);

  UPDATE public.expense_entries
     SET total_amount = v_total,
         line_count   = v_count
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(
    p_entry_id, 'updated', v_from, 'DRAFT', 'Draft edited', v_user);

  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION public.update_expense(
  uuid, integer, jsonb, date, date, public.expense_entry_type,
  public.expense_payee_type, text, uuid, uuid, uuid, uuid, uuid, text, text,
  public.expense_tax_mode
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_expense(
  uuid, integer, jsonb, date, date, public.expense_entry_type,
  public.expense_payee_type, text, uuid, uuid, uuid, uuid, uuid, text, text,
  public.expense_tax_mode
) TO authenticated;

COMMENT ON FUNCTION public.update_expense(
  uuid, integer, jsonb, date, date, public.expense_entry_type,
  public.expense_payee_type, text, uuid, uuid, uuid, uuid, uuid, text, text,
  public.expense_tax_mode
) IS
  'يعدّل مسودة أو مستندًا مُعادًا فقط، ويستبدل بنوده كاملة، مع فحص نسخة المستند لمنع التعارض.';
-- ---------------------------------------------------------------------------
-- 6. submit_expense
-- ---------------------------------------------------------------------------
-- The gate between "typed" and "asked for approval". Everything that an
-- approver would otherwise have to go back and ask for is checked here, so the
-- approval queue only ever contains documents that can actually be decided.
CREATE OR REPLACE FUNCTION public.submit_expense(
  p_entry_id uuid,
  p_expected_version integer DEFAULT NULL
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
  IF v_from NOT IN ('DRAFT', 'REJECTED') THEN
    RAISE EXCEPTION 'Only a draft or a returned expense can be submitted (current: %)', v_from
      USING ERRCODE = '55000';
  END IF;

  IF NOT (v_entry.created_by = v_user OR public.expense_role_rank(v_user) >= 30) THEN
    RAISE EXCEPTION 'Forbidden: you can only submit your own drafts' USING ERRCODE = '42501';
  END IF;
  PERFORM public.expense_assert_capability(v_user, 'expense.submit');

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  -- Completeness, in the order an operator would fix it.
  IF v_entry.total_amount <= 0 OR v_entry.line_count = 0 THEN
    RAISE EXCEPTION 'Add at least one line with an amount before submitting'
      USING ERRCODE = '22023';
  END IF;
  IF v_entry.payee_type = 'SUPPLIER' AND v_entry.supplier_id IS NULL THEN
    RAISE EXCEPTION 'Choose the supplier before submitting' USING ERRCODE = '22023';
  END IF;
  IF v_entry.payee_type = 'EMPLOYEE' AND v_entry.employee_id IS NULL THEN
    RAISE EXCEPTION 'Choose the staff member before submitting' USING ERRCODE = '22023';
  END IF;

  UPDATE public.expense_entries
     SET status             = 'SUBMITTED',
         submitted_by       = v_user,
         submitted_at       = now(),
         rejection_reason   = NULL,
         version            = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'submitted', v_from, 'SUBMITTED', NULL, v_user);

  RETURN v_entry;
END $$;

-- ---------------------------------------------------------------------------
-- 7. decide_expense — approve or reject
-- ---------------------------------------------------------------------------
-- One function instead of two, because the two outcomes share every guard and
-- differ only in the target status. Splitting them would mean maintaining the
-- self-approval rule in two places, which is exactly how a control rots.
CREATE OR REPLACE FUNCTION public.decide_expense(
  p_entry_id uuid,
  p_approve  boolean,
  p_reason   text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   uuid := public.expense_actor();
  v_entry  public.expense_entries;
  v_action text := CASE WHEN p_approve THEN 'approve' ELSE 'reject' END;
  v_target public.expense_status := CASE WHEN p_approve
                                          THEN 'APPROVED'::public.expense_status
                                          ELSE 'REJECTED'::public.expense_status END;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only a submitted document is awaiting a decision. This is what stops a
  -- double-click — or two approvers acting at the same moment — from producing
  -- two approvals: the second caller finds APPROVED, not SUBMITTED.
  IF v_entry.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'This expense is not awaiting approval (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.' || v_action);

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  -- Plan §17: separation of duties. The person who typed the expense is not the
  -- person who authorises it. An owner is the single documented exception, since
  -- in a one-person company refusing self-approval would make the module
  -- unusable — but the exception is explicit and auditable rather than silent.
  IF v_entry.created_by = v_user AND NOT public.has_role(v_user, 'owner') THEN
    RAISE EXCEPTION 'You cannot approve an expense you created yourself'
      USING ERRCODE = '42501';
  END IF;

  IF v_entry.created_by = v_user AND public.has_role(v_user, 'owner') THEN
    -- Recorded in the trail, not merely allowed: an owner reviewing their own
    -- work should be visible to an auditor.
    p_reason := COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''),
                         'Self-approved by owner (no other approver available)');
  END IF;

  IF NOT p_approve AND NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when rejecting an expense' USING ERRCODE = '22023';
  END IF;

  UPDATE public.expense_entries
     SET status      = v_target,
         version     = version + 1,
         approved_by = CASE WHEN p_approve THEN v_user END,
         approved_at = CASE WHEN p_approve THEN now() END,
         rejected_by = CASE WHEN NOT p_approve THEN v_user END,
         rejected_at = CASE WHEN NOT p_approve THEN now() END,
         rejection_reason = CASE WHEN NOT p_approve
                                 THEN nullif(btrim(coalesce(p_reason, '')), '') END
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, v_action, 'SUBMITTED', v_target, p_reason, v_user);

  RETURN v_entry;
END $$;

REVOKE ALL ON FUNCTION public.submit_expense(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_expense(uuid, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.decide_expense(uuid, boolean, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_expense(uuid, boolean, text, integer) TO authenticated;

COMMENT ON FUNCTION public.submit_expense(uuid, integer) IS
  'يرسل المسودة للاعتماد بعد التحقق من اكتمالها.';
COMMENT ON FUNCTION public.decide_expense(uuid, boolean, text, integer) IS
  'اعتماد أو رفض مستند مُرسَل، مع منع اعتماد المُنشئ لمستنده (عدا المالك) وتسجيل السبب.';
-- ---------------------------------------------------------------------------
-- 8. post_expense — recognized, paid-in-full-at-once, or accrued
-- ---------------------------------------------------------------------------
-- Posting is the moment a draft becomes accounting evidence. Two honest cases:
--
--   * `p_pay_now = true`  — the bill was settled at the counter. The document
--     is posted AND a matching payment row is written, in the same transaction.
--     Doing it in one call matters: it removes the window in which an expense is
--     posted, the cashier's tab is closed, and nobody ever records the payment,
--     leaving a phantom liability on the books.
--
--   * `p_pay_now = false` — an accrued payable. Nothing is paid; the document
--     is POSTED and waits in the "unpaid" queue until a payment is recorded.
--
-- Either way the transition is DRAFT/APPROVED → POSTED, the posting date is
-- stamped, and the row becomes immutable to the Phase-1 guard trigger.
CREATE OR REPLACE FUNCTION public.post_expense(
  p_entry_id      uuid,
  p_expected_version integer DEFAULT NULL,
  p_pay_now       boolean                   DEFAULT false,
  p_payment_method public.payment_method    DEFAULT 'cash',
  p_account_label text                      DEFAULT NULL,
  p_payment_date  date                      DEFAULT NULL,
  p_idempotency_key text                    DEFAULT NULL
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

  -- Idempotent by status: a retried post finds POSTED and is told so instead of
  -- creating a second recognition of the same expense.
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

  -- Posting a draft directly is allowed only for the person who may also
  -- approve, which keeps the fast path from silently bypassing the control.
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
    -- Delegates to the same function the standalone payment path uses, so the
    -- idempotency key, the over-payment rule and the settlement trigger behave
    -- identically however the payment arrived.
    SELECT * INTO v_entry FROM public.record_expense_payment(
      p_entry_id,
      v_entry.total_amount,
      COALESCE(p_payment_date, CURRENT_DATE),
      p_payment_method,
      p_account_label,
      NULL,
      'Settled at posting',
      COALESCE(p_idempotency_key, 'post:' || p_entry_id::text)
    );
  END IF;

  RETURN v_entry;
END $$;
-- ---------------------------------------------------------------------------
-- 9. record_expense_payment — partial payments, retries, reversals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_expense_payment(
  p_entry_id      uuid,
  p_amount        numeric,
  p_payment_date  date                   DEFAULT CURRENT_DATE,
  p_payment_method public.payment_method DEFAULT 'cash',
  p_account_label text                   DEFAULT NULL,
  p_reference_no  text                   DEFAULT NULL,
  p_note          text                   DEFAULT NULL,
  p_idempotency_key text                 DEFAULT NULL
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
BEGIN
  -- The row lock is taken before anything is read, so the remaining balance
  -- cannot move between the check and the insert. Without it, two cashiers
  -- paying 60 of a 100 bill at the same instant would both see 100 remaining
  -- and the customer would end up 20 overpaid.
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.pay');

  -- Retry safety. A dropped HTTP response that the client re-sends carries the
  -- same key, so the second attempt returns the document as it already is
  -- rather than writing a second payment.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.expense_payments
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN v_entry;
    END IF;
  END IF;

  IF v_entry.status NOT IN ('POSTED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Only a posted expense can be paid (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;

  v_amount := public.expense_round(p_amount);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '22023';
  END IF;

  -- Over-payment is refused rather than absorbed. Silently truncating it would
  -- hide a real data-entry error and unbalance the cash drawer.
  IF v_amount > v_entry.remaining_amount + 0.005 THEN
    RAISE EXCEPTION 'Payment of % exceeds the remaining % on this expense',
      v_amount, v_entry.remaining_amount
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.expense_payments (
    entry_id, amount, payment_date, payment_method,
    account_label, reference_no, note, idempotency_key, created_by
  )
  VALUES (
    p_entry_id, v_amount, COALESCE(p_payment_date, CURRENT_DATE), p_payment_method,
    nullif(btrim(coalesce(p_account_label, '')), ''),
    nullif(btrim(coalesce(p_reference_no, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''),
    p_idempotency_key,
    v_user
  );

  -- The Phase-1 trigger has already recomputed paid_amount and the derived
  -- status; re-reading returns the authoritative post-trigger state.
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id;

  PERFORM public.expense_log_action(
    p_entry_id, 'payment', v_entry.status, v_entry.status,
    'Payment ' || v_amount::text || ' via ' || p_payment_method::text, v_user);

  RETURN v_entry;
END $$;

-- ---------------------------------------------------------------------------
-- 10. cancel_expense
-- ---------------------------------------------------------------------------
-- A document that is only a draft is cancelled: nothing was recognized, so no
-- ledger correction is needed. A posted document cannot be cancelled at all —
-- it must be reversed — because "cancel" implies the event never happened and
-- in accounting it did.
CREATE OR REPLACE FUNCTION public.cancel_expense(
  p_entry_id uuid,
  p_reason   text,
  p_expected_version integer DEFAULT NULL
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

  IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A reason is required when cancelling an expense' USING ERRCODE = '22023';
  END IF;

  IF v_from IN ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CLOSED', 'REVERSED') THEN
    RAISE EXCEPTION 'A posted expense cannot be cancelled — reverse it instead'
      USING ERRCODE = '55000';
  END IF;

  IF v_from = 'CANCELLED' THEN
    RETURN v_entry;   -- idempotent
  END IF;

  IF v_from NOT IN ('DRAFT', 'REJECTED', 'SUBMITTED', 'APPROVED') THEN
    RAISE EXCEPTION 'This expense cannot be cancelled from status %', v_from
      USING ERRCODE = '55000';
  END IF;

  -- Cancelling someone else's submitted document is a management decision, not
  -- a data-entry correction.
  IF NOT (v_entry.created_by = v_user AND v_from IN ('DRAFT', 'REJECTED')) THEN
    PERFORM public.expense_assert_capability(v_user, 'expense.cancel');
  ELSE
    PERFORM public.expense_assert_capability(v_user, 'expense.edit');
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_entry.version THEN
    RAISE EXCEPTION 'This expense was changed by someone else. Reload it and try again.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.expense_entries
     SET status        = 'CANCELLED',
         cancelled_by  = v_user,
         cancelled_at  = now(),
         cancel_reason = nullif(btrim(p_reason), ''),
         version       = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'cancelled', v_from, 'CANCELLED', p_reason, v_user);

  RETURN v_entry;
END $$;
-- ---------------------------------------------------------------------------
-- 11. reverse_expense / reverse_expense_payment
-- ---------------------------------------------------------------------------
-- Reversal never edits history. It creates a compensating document that points
-- at the original, and the original is only ever marked as reversed — its
-- amount, date and counterparty stay exactly as they were posted. An auditor
-- can therefore read the whole story: what was recognised, and what undid it.
CREATE OR REPLACE FUNCTION public.reverse_expense(
  p_entry_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     uuid := public.expense_actor();
  v_entry    public.expense_entries;
  v_reversal public.expense_entries;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.reverse');

  IF v_entry.status = 'REVERSED' THEN
    RETURN v_entry;   -- idempotent: reversing twice is a no-op, not an error
  END IF;
  IF v_entry.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'Only a posted expense can be reversed (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;
  -- Money already sitting in the drawer has to be dealt with through the
  -- payment record, not by erasing the document that produced it.
  IF v_entry.paid_amount > 0 THEN
    RAISE EXCEPTION 'Reverse the recorded payments first (paid: %)', v_entry.paid_amount
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.expense_entries (
    reference, entry_type, status, source_kind,
    payee_type, payee_name, supplier_id, employee_id,
    warehouse_id, cost_center_id, project_id,
    expense_date, posting_date, description, note,
    tax_mode, currency, currency_symbol,
    reversal_of, created_by, posted_by, posted_at
  )
  VALUES (
    v_entry.reference || '-R',
    v_entry.entry_type,
    -- The reversal is itself posted: it is a recognised, immutable correction.
    'POSTED',
    v_entry.source_kind,
    v_entry.payee_type, v_entry.payee_name, v_entry.supplier_id, v_entry.employee_id,
    v_entry.warehouse_id, v_entry.cost_center_id, v_entry.project_id,
    CURRENT_DATE, CURRENT_DATE,
    'Reversal of ' || v_entry.reference,
    nullif(btrim(coalesce(p_reason, '')), ''),
    v_entry.tax_mode, v_entry.currency, v_entry.currency_symbol,
    v_entry.id, v_user, v_user, now()
  )
  RETURNING * INTO v_reversal;

  -- Mirror the lines so the reversal is a real, reportable document rather than
  -- an amount with no category — otherwise the reversal would vanish from the
  -- by-category report and leave that report showing an expense that no longer
  -- exists.
  INSERT INTO public.expense_lines (
    entry_id, line_no, description, category_id, quantity, unit_price,
    net_amount, tax_rate, tax_amount, gross_amount,
    cost_center_id, project_id, note
  )
  SELECT
    v_reversal.id, line_no, description, category_id, quantity, unit_price,
    net_amount, tax_rate, tax_amount, gross_amount,
    cost_center_id, project_id, note
  FROM public.expense_lines
  WHERE entry_id = p_entry_id
  ORDER BY line_no;

  UPDATE public.expense_entries
     SET total_amount = v_entry.total_amount,
         line_count   = v_entry.line_count
   WHERE id = v_reversal.id
  RETURNING * INTO v_reversal;

  UPDATE public.expense_entries
     SET status         = 'REVERSED',
         reversed_by_id = v_reversal.id,
         version        = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(
    p_entry_id, 'reversed', 'POSTED', 'REVERSED',
    COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Reversed'), v_user);

  RETURN v_entry;
END $$;

-- A payment row is never deleted either: the correction is its own row, linked
-- by `reversed_by` / `reversal_of`, so the sum of the phase-1 trigger excludes
-- both sides and the balance returns to what it should be.
CREATE OR REPLACE FUNCTION public.reverse_expense_payment(
  p_payment_id uuid,
  p_reason     text DEFAULT NULL
)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid := public.expense_actor();
  v_payment public.expense_payments;
  v_entry   public.expense_entries;
  v_reversal_id uuid;
BEGIN
  SELECT * INTO v_payment FROM public.expense_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.payment.reverse');

  IF v_payment.reversed_by IS NOT NULL THEN
    SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_payment.entry_id;
    RETURN v_entry;   -- idempotent
  END IF;
  IF v_payment.reversal_of IS NOT NULL THEN
    RAISE EXCEPTION 'A reversal row cannot itself be reversed' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_payment.entry_id FOR UPDATE;

  INSERT INTO public.expense_payments (
    entry_id, amount, payment_date, payment_method,
    account_label, reference_no, note, reversal_of, created_by
  )
  VALUES (
    v_payment.entry_id, v_payment.amount, CURRENT_DATE, v_payment.payment_method,
    v_payment.account_label, v_payment.reference_no,
    COALESCE(NULLIF(btrim(COALESCE(p_reason, '')), ''), 'Reversal of payment'),
    v_payment.id, v_user
  )
  RETURNING id INTO v_reversal_id;

  UPDATE public.expense_payments
     SET reversed_by = v_reversal_id
   WHERE id = p_payment_id;

  SELECT * INTO v_entry FROM public.expense_entries WHERE id = v_payment.entry_id;

  PERFORM public.expense_log_action(
    v_payment.entry_id, 'payment', v_entry.status, v_entry.status,
    'Payment reversed', v_user);

  RETURN v_entry;
END $$;
-- ---------------------------------------------------------------------------
-- 12. close_expense
-- ---------------------------------------------------------------------------
-- The terminal state. Only a fully settled document can be closed, so "closed"
-- genuinely means "nothing further is owed" and the open-payables report never
-- has to guess.
CREATE OR REPLACE FUNCTION public.close_expense(p_entry_id uuid)
RETURNS public.expense_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  uuid := public.expense_actor();
  v_entry public.expense_entries;
BEGIN
  SELECT * INTO v_entry FROM public.expense_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expense_assert_capability(v_user, 'expense.post');

  IF v_entry.status = 'CLOSED' THEN
    RETURN v_entry;
  END IF;
  IF v_entry.status NOT IN ('POSTED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'Only a posted expense can be closed (current: %)', v_entry.status
      USING ERRCODE = '55000';
  END IF;
  IF v_entry.remaining_amount > 0.005 THEN
    RAISE EXCEPTION 'This expense still has % outstanding', v_entry.remaining_amount
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.expense_entries
     SET status = 'CLOSED', version = version + 1
   WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  PERFORM public.expense_log_action(p_entry_id, 'closed', 'PAID', 'CLOSED', NULL, v_user);

  RETURN v_entry;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Grants and self-check
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.post_expense(
  uuid, integer, boolean, public.payment_method, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_expense(
  uuid, integer, boolean, public.payment_method, text, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.record_expense_payment(
  uuid, numeric, date, public.payment_method, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_expense_payment(
  uuid, numeric, date, public.payment_method, text, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_expense(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_expense(uuid, text, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_expense(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_expense(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reverse_expense_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_expense_payment(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.close_expense(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_expense(uuid) TO authenticated;

-- Internal helpers: callable by the definer chain, not by a browser session.
-- `expense_write_lines` and `expense_log_action` would let a client bypass the
-- status machine if they were reachable over PostgREST.
REVOKE ALL ON FUNCTION public.expense_write_lines(uuid, jsonb, public.expense_tax_mode)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expense_log_action(
  uuid, text, public.expense_status, public.expense_status, text, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.post_expense(
  uuid, integer, boolean, public.payment_method, text, date, text) IS
  'يرحّل المصروف (تسجيل محاسبي) ويثبّت حقوله المالية. الخيار p_pay_now يسدّده في نفس المعاملة.';
COMMENT ON FUNCTION public.record_expense_payment(
  uuid, numeric, date, public.payment_method, text, text, text, text) IS
  'يسجّل دفعة (كاملة أو جزئية) على مصروف مرحّل، مع منع تجاوز المتبقي ومنع التكرار بمفتاح idempotency.';
COMMENT ON FUNCTION public.reverse_expense(uuid, text) IS
  'يعكس مصروفًا مرحّلًا بمستند تعويضي معاكس بدل تعديل السجل الأصلي.';
COMMENT ON FUNCTION public.reverse_expense_payment(uuid, text) IS
  'يعكس دفعة مسجّلة بصف معاكس مرتبط، دون حذف الأصل.';
COMMENT ON FUNCTION public.close_expense(uuid) IS
  'يُقفل المصروف بعد سداده بالكامل، فلا يظهر في تقرير المستحقات المفتوحة.';

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'create_expense', 'update_expense', 'submit_expense', 'decide_expense',
    'post_expense', 'record_expense_payment', 'cancel_expense',
    'reverse_expense', 'reverse_expense_payment', 'close_expense'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    ) THEN
      v_missing := v_missing || v_name;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) > 0 THEN
    RAISE EXCEPTION 'workflow RPCs missing: %', array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE '20261001091000: 10 expense workflow RPCs installed.';
END $$;
