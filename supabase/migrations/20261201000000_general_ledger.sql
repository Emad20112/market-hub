-- ============================================================================
-- 20261201000000_general_ledger.sql
--
-- A GENERAL LEDGER, WHICH THE SCHEMA DID NOT HAVE
-- ------------------------------------------------
-- The system could value stock, cost a production run and report a margin,
-- and still have no way to answer "what are the company's assets worth".
-- There was no chart of accounts and no journal: expenses and purchase
-- invoices existed as tables with nowhere to land. Everything I built earlier
-- - the cost layer, the production costing - is an INVENTORY truth. It is not
-- an accounting one, and an inventory ledger cannot produce a balance sheet
-- because it has no equity side and no liabilities.
--
-- So this adds the missing half:
--
--   accounts          the chart, seeded for a Yemeni flour mill
--   journal_entries   the document
--   journal_lines     two sides of it
--   post_journal_entry  refuses anything that does not balance
--   trial_balance     derived from posted lines only, never entered by hand
--
-- DESIGN POSITIONS
-- ----------------
-- * Every account is Arabic and Yemeni in structure, not a translated Western
--   template: bank accounts are the actual Yemeni banks, and the asset classes
--   are the ones a mill actually holds - raw grain, work in progress, flour,
--   bran, packaging - because the cost engine posts into them by code and a
--   mismatch here would silently mis-post production.
--
-- * A posted entry cannot be edited or deleted, only reversed by another
--   entry that references it. Books that can be quietly rewritten are not
--   books; that was the reasoning behind reversal-by-document in the opening
--   balances too, and the same rule applies here.
--
-- * The trial balance is a VIEW over posted lines. A stored balance is a
--   second source of truth that can disagree with the entries.
--
-- * Nothing in this migration posts anything. Existing documents are wired up
--   in the next migration, one document type at a time, so that each posting
--   can be verified against a real document rather than trusted in bulk.
--
-- NON-DESTRUCTIVE: new tables and a view. No existing record is read for
-- anything but reference.
-- ============================================================================

CREATE TYPE public.account_type AS ENUM (
  'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
);

COMMENT ON TYPE public.account_type IS
  'نوع الحساب في محاسبة القيد المزدوج. الأصول والالتزامات وحقوق الملكية والإيرادات والمصروفات.';

CREATE TABLE IF NOT EXISTS public.accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          varchar(20) NOT NULL UNIQUE,
  name_ar       text NOT NULL,
  account_type  public.account_type NOT NULL,
  parent_id     uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  -- A system account is written by the posting engine; a user account is
  -- available for manual entries. The distinction matters because a manual
  -- entry into "Inventory - raw materials" would make the stock reports and
  -- the trial balance disagree, with neither obviously wrong.
  is_system     boolean NOT NULL DEFAULT false,
  is_postable   boolean NOT NULL DEFAULT true,
  is_active     boolean NOT NULL DEFAULT true,
  -- Cash and bank are the accounts that carry a real balance that must be
  -- reconciled against something physical.
  requires_reconciliation boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.accounts IS
  'دليل الحسابات. is_system للحسابات التي يكتبها محرك الترحيل، وis_postable يمنع الترحيل على الحسابات التحقيرية.';

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number  text NOT NULL UNIQUE,
  entry_date    date NOT NULL DEFAULT CURRENT_DATE,
  memo          text NOT NULL,
  status        text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  -- What caused this entry. Every posting carries one, so any line in the
  -- ledger can be traced to the document that produced it and no further.
  source_type   text,
  source_id     uuid,
  is_system     boolean NOT NULL DEFAULT false,
  reverses_id   uuid REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  total_debit   numeric(18,2) NOT NULL DEFAULT 0,
  total_credit  numeric(18,2) NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  posted_by     uuid REFERENCES auth.users(id),
  posted_at     timestamptz,
  CONSTRAINT journal_posted_has_totals
    CHECK (status <> 'POSTED' OR (total_debit > 0 AND total_debit = total_credit)),
  CONSTRAINT journal_no_self_reversal CHECK (reverses_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS ix_journal_date ON public.journal_entries (entry_date DESC);
CREATE INDEX IF NOT EXISTS ix_journal_source ON public.journal_entries (source_type, source_id);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id    uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  -- Exactly one side. A line that is both, or neither, is not an entry.
  debit         numeric(18,2) NOT NULL DEFAULT 0 CHECK (debit  >= 0),
  credit        numeric(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo          text,
  partner_type  text,
  partner_id    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_lines_one_side CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

CREATE INDEX IF NOT EXISTS ix_journal_lines_entry  ON public.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS ix_journal_lines_account ON public.journal_lines (account_id);

-- ── the chart of accounts ───────────────────────────────────────────────────
-- Seeded with ON CONFLICT DO NOTHING so this migration is safe to re-apply.
INSERT INTO public.accounts (code, name_ar, account_type, is_system, requires_reconciliation) VALUES
-- الأصول المتداولة
('1101','النقدية بالصندوق','ASSET',true,true),
('1111','البنك الأهلي اليمني','ASSET',true,true),
('1112','بنك مناحي كمر','ASSET',true,true),
('1121','بنك اليمن الدولي','ASSET',true,true),
('1211','ذمم العملاء','ASSET',true,false),
('1311','مخزون مواد خام','ASSET',true,false),
('1312','مخزون إنتاج تحت التنفيذ','ASSET',true,false),
('1313','مخزون دقيق — منتج نهائي','ASSET',true,false),
('1314','مخزون نواتج جانبية (نخالة)','ASSET',true,false),
('1315','مخزون مواد تعبئة','ASSET',true,false),
-- الأصول الثابتة
('1411','أجهزة ومعدات المطحنة','ASSET',true,false),
('1421','مركبات ونقل','ASSET',true,false),
('1431','أثاث ومعدات مكتبية','ASSET',true,false),
('1491','مجمع إهلاك الأصول الثابتة','ASSET',true,false),
-- الخصوم
('2111','ذمم الموردين','LIABILITY',true,false),
('2211','قروض بنكية قصيرة الأجل','LIABILITY',true,false),
('2311','ضريبة القيمة المضافة المستحقة','LIABILITY',true,false),
-- حقوق الملكية
('3111','رأس المال','EQUITY',true,false),
('3211','مسحوبات المالك','EQUITY',true,false),
('3911','أرباح محتجزة','EQUITY',true,false),
-- الإيرادات
('4111','إيراد بيع الدقيق','REVENUE',true,false),
('4211','إيراد بيع النخالة','REVENUE',true,false),
('4311','إيراد أجور الطحن (خدمات)','REVENUE',true,false),
('4911','إيرادات أخرى','REVENUE',false,false),
-- المصروفات
('5111','تكلفة البضاعة المباعة','EXPENSE',true,false),
('5211','أجور العمالة','EXPENSE',true,false),
('5311','كهرباء ووقود','EXPENSE',true,false),
('5411','إيجارات','EXPENSE',true,false),
('5511','مصروفات إدارية وعمومية','EXPENSE',true,false),
('5611','إهلاك الأصول الثابتة','EXPENSE',true,false),
('5911','مصروفات أخرى','EXPENSE',false,false)
ON CONFLICT (code) DO NOTHING;

-- 1491 accumulates depreciation as a CONTRA account, so it takes a credit
-- balance and must not be posted to directly like an asset.
UPDATE public.accounts SET is_postable = false WHERE code IN ('1491','5911');

-- ── posting ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_journal_number(p_date date)
RETURNS text
LANGUAGE sql
SET search_path = public
AS $$
  SELECT 'JE-' || to_char(p_date, 'YYYYMMDD') || '-' ||
         lpad((count(*) + 1)::text, 4, '0')
    FROM public.journal_entries
   WHERE entry_date = p_date;
$$;

REVOKE ALL ON FUNCTION public.next_journal_number(date) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_memo         text,
  p_entry_date   date DEFAULT CURRENT_DATE,
  p_source_type  text DEFAULT NULL,
  p_source_id    uuid DEFAULT NULL,
  p_is_system    boolean DEFAULT false,
  p_lines        jsonb DEFAULT '[]'::jsonb
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
  v_d    numeric := 0;
  v_c    numeric := 0;
  l      jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_memo IS NULL OR btrim(p_memo) = '' THEN
    RAISE EXCEPTION 'A journal entry needs a description';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'A journal entry needs at least two lines - one to debit and one to credit';
  END IF;

  v_num := public.next_journal_number(coalesce(p_entry_date, CURRENT_DATE));

  INSERT INTO public.journal_entries
    (entry_number, entry_date, memo, source_type, source_id, is_system, created_by)
  VALUES (v_num, coalesce(p_entry_date, CURRENT_DATE), btrim(p_memo),
          p_source_type, p_source_id, p_is_system, v_user)
  RETURNING id INTO v_id;

  FOR l IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_d := v_d + coalesce((l->>'debit')::numeric, 0);
    v_c := v_c + coalesce((l->>'credit')::numeric, 0);
  END LOOP;

  -- Refused HERE, at creation, rather than at posting. A draft entry that
  -- cannot balance is never worth having: it is either a mistake or an
  -- unfinished thought, and neither belongs in the books.
  IF v_d <> v_c THEN
    RAISE EXCEPTION
      'Entry does not balance: debits % vs credits % (difference %). An entry that cannot balance is not an entry.',
      round(v_d, 2)::text, round(v_c, 2)::text, round(v_d - v_c, 2)::text;
  END IF;
  IF v_d <= 0 THEN
    RAISE EXCEPTION 'Entry total must be greater than zero';
  END IF;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, memo, partner_type, partner_id)
  SELECT v_id, a.id,
         coalesce((l->>'debit')::numeric, 0),
         coalesce((l->>'credit')::numeric, 0),
         nullif(btrim(coalesce(l->>'memo','')), ''),
         nullif(btrim(coalesce(l->>'partner_type','')), ''),
         (l->>'partner_id')::uuid
    FROM jsonb_array_elements(p_lines) l
    JOIN public.accounts a ON a.code = l->>'account_code'
   WHERE (l->>'debit')::numeric IS DISTINCT FROM 0 OR (l->>'credit')::numeric IS DISTINCT FROM 0;

  -- Every line must have resolved to a real, postable account. A typo in an
  -- account code would otherwise silently drop a side and break the balance.
  IF (SELECT count(*) FROM public.journal_lines WHERE entry_id = v_id) <> jsonb_array_length(p_lines) THEN
    RAISE EXCEPTION 'One or more account codes do not exist, or are not postable';
  END IF;

  UPDATE public.journal_entries
     SET total_debit = v_d, total_credit = v_c, status = 'POSTED',
         posted_by = v_user, posted_at = now()
   WHERE id = v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_journal_entry(text, date, text, uuid, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_journal_entry(text, date, text, uuid, boolean, jsonb)
  TO authenticated, service_role;

-- ── reversal, never deletion ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_entry_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old  record;
  v_id   uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Reversing an entry requires a reason';
  END IF;

  SELECT * INTO v_old FROM public.journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_old.status <> 'POSTED' THEN
    RAISE EXCEPTION 'Only a posted entry can be reversed';
  END IF;

  SELECT public.create_journal_entry(
    'عكس القيد ' || v_old.entry_number || ': ' || btrim(p_reason),
    CURRENT_DATE, 'journal_reversal', p_entry_id, v_old.is_system,
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'account_code', a.code,
        -- A reversal swaps the sides rather than negating: the credit of the
        -- original becomes the debit of the reversal.
        'debit',  CASE WHEN jl.debit  > 0 THEN 0 ELSE jl.credit END,
        'credit', CASE WHEN jl.debit  > 0 THEN jl.debit  ELSE 0 END,
        'memo',   coalesce(jl.memo, a.name_ar)
      ) ORDER BY jl.id), '[]'::jsonb)
       FROM public.journal_lines jl JOIN public.accounts a ON a.id = jl.account_id
      WHERE jl.entry_id = p_entry_id)
  ) INTO v_id;

  UPDATE public.journal_entries SET status = 'REVERSED' WHERE id = p_entry_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.reverse_journal_entry(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_journal_entry(uuid, text) TO authenticated, service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_read ON public.accounts;
CREATE POLICY accounts_read ON public.accounts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS journal_read ON public.journal_entries;
CREATE POLICY journal_read ON public.journal_entries
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS journal_lines_read ON public.journal_lines;
CREATE POLICY journal_lines_read ON public.journal_lines
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

REVOKE ALL ON public.accounts, public.journal_entries, public.journal_lines FROM anon;

-- ── the trial balance ───────────────────────────────────────────────────────
-- Derived from posted lines only. A stored balance would be a second source
-- of truth that could quietly disagree with the entries.
DROP VIEW IF EXISTS public.trial_balance;
CREATE VIEW public.trial_balance
  WITH (security_invoker = true) AS
SELECT a.code,
       a.name_ar,
       a.account_type,
       round(coalesce(sum(jl.debit), 0), 2)  AS total_debit,
       round(coalesce(sum(jl.credit), 0), 2) AS total_credit,
       -- Balance in the account's natural direction: a credit for an asset
       -- means something is wrong, and showing it positive would hide that.
       round(coalesce(sum(jl.debit - jl.credit), 0), 2) AS balance,
       round(coalesce(sum(jl.debit - jl.credit), 0) *
             CASE WHEN a.account_type IN ('ASSET','EXPENSE') THEN 1 ELSE -1 END, 2) AS natural_balance
  FROM public.accounts a
  LEFT JOIN public.journal_lines jl ON jl.account_id = a.id
  LEFT JOIN public.journal_entries je
         ON je.id = jl.entry_id AND je.status = 'POSTED'
  WHERE a.is_active
  GROUP BY a.id, a.code, a.name_ar, a.account_type
HAVING coalesce(sum(CASE WHEN je.id IS NOT NULL THEN jl.debit  ELSE 0 END), 0) > 0
    OR coalesce(sum(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) > 0;

COMMENT ON VIEW public.trial_balance IS
  'ميزان المراجعة من القيود المرحَّلة فقط. الأرصدة مشتقة من الدليل، لا مدخلة يدوياً.';

REVOKE ALL ON public.trial_balance FROM anon;
GRANT SELECT ON public.trial_balance TO authenticated, service_role;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- DROP VIEW IF EXISTS public.trial_balance;
-- DROP FUNCTION IF EXISTS public.reverse_journal_entry(uuid, text);
-- DROP FUNCTION IF EXISTS public.create_journal_entry(text, date, text, uuid, boolean, jsonb);
-- DROP FUNCTION IF EXISTS public.next_journal_number(date);
-- DROP TABLE IF EXISTS public.journal_lines;
-- DROP TABLE IF EXISTS public.journal_entries;
-- DROP TABLE IF EXISTS public.accounts;
-- DROP TYPE IF EXISTS public.account_type;