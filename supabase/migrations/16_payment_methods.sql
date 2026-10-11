﻿-- ============================================================================
-- 16_payment_methods.sql — طرق الدفع الموحّدة
-- ============================================================================
--
-- ما هذا الملف؟
--   الملف **الوحيد** الذي يعرّف طرق الدفع: الكتالوج، وإعداد كل مستأجر، وحرّاس
--   الكتابة، والمكان الواحد الذي يقرّر كيف تُرحَّل كل طريقة إلى الدفتر.
--
-- لماذا هو مهم؟
--   قبل هذا الملف كانت طرق الدفع مبثوثة في ثمانية ملفات بلا مالك واحد:
--
--     · تعريف قيمة payment_method  — في 20260621011940
--     · توسيعها بـ mobile_money     — ثلاثة ملفات متتالية، **اثنان مكرران**
--     · قوائم القيم المسموحة        — منسوخة نصًا داخل create_sale
--                                      و record_customer_payment، فتتباعد
--
--   اليوم مصدر واحد: جدول payment_methods، ودوال تحلّ الاسم إلى قيمته الشرعية.
--   وإضافة طريقة جديدة صارت صفًا في الجدول لا تعديلًا في عشر دوال.
--
-- ── البنية ──────────────────────────────────────────────────────────────────
--   payment_methods           الكتالوج: 13 طريقة (بذرة 08_payment_methods.sql)
--   payment_method_settings   إعداد كل طريقة لكل مستأجر (تفعيل وتعطيل وترتيب)
--   resolve_writable_payment_method   يحوّل ما أرسله العميل إلى قيمة شرعية
--   payment_method_legacy_id  يعيد القيمة التاريخية — للتقارير القديمة
--   ledger_account_code_for_payment_method   الحساب الذي تُرحَّل عليه
--
-- ── الكتالوج في البذور لا هنا ───────────────────────────────────────────────
--   صفوف الطرق الـ 13 **بيانات مرجعية**، فمكانها
--   `supabase/seeds/01_system/08_payment_methods.sql`. المصدر كان يضعها داخل
--   الترحيل — نُقلت عند الدمج، راجع MIGRATIONS_RULES.md القاعدة R-1.
--
-- ⚠️ المصدر: origin/main — 20261208000000_payment_methods_catalog_unified.sql
--    و 20261208000001_payment_methods_tenant_authoring.sql (امتداد مباشر له،
--    لا يعمل منفصلًا عنه، فدُمجا في ملف واحد).
--    عُدِّل عند الدمج: نُقل الكتالوج إلى البذرة، وأُزيل إعادة تعريف الدوال التي
--    عندنا نسخة أحدث منها (create_sale، record_customer_payment، المرتجعات).
--    وأُصلحت ثلاثة أخطاء كشفها تقرير `MIGRATION_16_REVIEW.md`:
--      · §1.1 كان `coalesce(legacy_id, …)` يتوقف عند قيمة موجودة فيُبقي كل بنك
--        ومحفظة على 'cash' — صار CASE يشتقّ القيمة من المصدر الحقيقي.
--      · §1.2 حُذف `DEFAULT 'cash'` لأنه هو ما جعل `coalesce` يجد قيمة أبدًا.
--      · §8.1 كان شرط الإصلاح يطابق «القيمة غير الصالحة» و'cash' صالحة، فلم
--        يعمل الإصلاح قط؛ صار يطابق قيمة تخالف ما تشتقّه الدالة فعلًا.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE REPLACES
-- ════════════════════════════════════════════════════════════════════════════
-- Before this migration, the set of usable payment methods was scattered across
-- eight files with no single owner:
--
--   ENUM definition + widening
--     20260621011940  CREATE TYPE payment_method ('cash','card','bank_transfer','credit')
--     20260706120000  ALTER TYPE … ADD VALUE 'mobile_money'   (blackbox seed patch)
--     20260706121000  ALTER TYPE … ADD VALUE 'mobile_money'   (duplicate, reset seed)
--     20260707021000  ALTER TYPE … ADD VALUE 'mobile_money'   (duplicate, yemen seed)
--
--   Allowed-value literals duplicated inside write RPCs
--     20260801090000  create_sale       NOT IN ('cash','card','bank_transfer','credit','mobile_money')
--     20260801090000  record_customer_payment NOT IN ('cash','card','bank_transfer','mobile_money')
--     20260929030000  create_sale       NOT IN (… ,'split')
--     20260929030000  split components  NOT IN ('cash','card','bank_transfer','mobile_money','split')
--     20260928000000  the same split guard, in the superseded copy
--
--   "Which account does this method post to" hard-coded in the ledger engine
--     20261202000000 / 20261202000100 / 20261202000200 / 20261203000000
--       IF payment_method IN ('bank_transfer','card','mobile_money') THEN '1111' ELSE '1101'
--
-- The consequence was concrete, not theoretical: adding a Yemeni method such as
-- بنك الكريمي required editing five files, and if you only edited the ENUM the
-- new method posted to the CASH account — silently overstating the till and
-- understating the bank, with no error anywhere.
--
-- ════════════════════════════════════════════════════════════════════════════
-- THE SINGLE SOURCE OF TRUTH, AFTER THIS FILE
-- ════════════════════════════════════════════════════════════════════════════
--   public.payment_methods            which methods exist, their identity,
--                                     icon key, ledger kind, contexts, and
--                                     accounting hook.  ← developers only
--   public.payment_method_settings     enabled / order / contexts per business
--
--   public.payment_method_legacy_id()  text  -> the value a document stores
--   public.payment_method_is_allowed()        may this be used, here, now
--   public.payment_method_ledger_account()    which account it settles to
--
-- Every write RPC and the posting engine now call these. A new method is added
-- in ONE place — the catalogue seed at the bottom of this file — and it is
-- immediately valid everywhere, posted correctly, and configurable per section.
--
-- ════════════════════════════════════════════════════════════════════════════
-- TARGETING: POSTGRESQL >= 12 (NO `ALTER TYPE … ADD VALUE` NEEDED)
-- ════════════════════════════════════════════════════════════════════════════
-- PostgreSQL 12 allows a non-CONCURRENT ALTER TYPE … ADD VALUE inside a
-- transaction block. That matters here: production has `mobile_money` only
-- because three separate seed-patch migrations ran, and a fresh database
-- created from migrations would still be missing `split`, which the sales
-- engine has required since 20260929030000. So this file widens the ENUM
-- idempotently and transactionally, and drops everything onto the widest set:
--
--     cash | card | bank_transfer | credit | mobile_money | split | cheque
--
-- On PostgreSQL 11 or older, run ONE statement on its own first:
--     ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'cheque';
-- then apply this migration. It is written so the ENUM add is a no-op if the
-- values already exist.
--
-- ════════════════════════════════════════════════════════════════════════════
-- 🔒 NO EXISTING DATA IS DELETED, UPDATED OR MOVED BY THIS FILE
-- ════════════════════════════════════════════════════════════════════════════
--   • Every existing column keeps its type and its value.
--   • Every existing row in sales_invoices, purchase_invoices, expenses,
--     customer_payments, sales_returns, purchase_returns and
--     customer_payment_splits keeps its stored `payment_method` byte for byte.
--   • Every historical ENUM value maps to a catalogue row, so old documents
--     still render with the correct Arabic name and icon.
--   • Nothing here DELETEs, UPDATEs or TRUNCATEs business data.
--   • The only writes are: the developer catalogue (developer-owned definition,
--     not customer data) and settings rows that do not already exist
--     (ON CONFLICT DO NOTHING — a business's own choices are never overwritten).
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT IS DELIBERATELY NOT DONE
-- ════════════════════════════════════════════════════════════════════════════
--   • The ENUM is NOT replaced by a text column + lookup table. That would
--     require rewriting six columns on seven tables of live financial history
--     for a benefit no user can see. The catalogue provides identity, ordering
--     and scoping; the ENUM keeps being the storage contract.
--   • No account_id is forced onto any method. `default_account_code` and
--     `payment_method_settings.default_account_id` are seams for the accounting
--     phase; today they are populated as guidance and read as a fallback only.
--   • No general ledger, journal, or chart-of-accounts behaviour is added.
--
-- IDEMPOTENT: safe to re-apply. Re-runs refresh the catalogue definitions
-- (names, icons, order, contexts) without touching tenant settings.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Widen the ENUM to the full set the application actually uses.
--
-- PostgreSQL 12+: legal inside a transaction. `IF NOT EXISTS` makes each of the
-- seven a no-op when it is already present, so this covers both "the three seed
-- patches ran" and "they did not".
-- ---------------------------------------------------------------------------
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'cash';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'bank_transfer';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'credit';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'mobile_money';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'split';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'cheque';

COMMENT ON TYPE public.payment_method IS
  'القيمة المخزّنة على المستند. لا تُستخدم للعرض ولا للتفعيل؛ العرض والتفعيل والأقسام تأتي من public.payment_methods.';


-- ============================================================================
-- 2. DEVELOPER CATALOGUE — which payment methods exist
--
-- A tenant never writes here. Rows arrive from this migration only, so a method
-- cannot be invented from the browser and an icon can never be supplied by a
-- customer. `id` is a STABLE TEXT KEY, not a UUID: a migration can address a
-- method unambiguously and idempotently forever, and the icon reference stays
-- readable.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id                   text PRIMARY KEY,

  name_ar              text        NOT NULL,
  name_en              text,

  -- A KEY, never a URL and never base64. The bundled registry in
  -- src/lib/payments/payment-methods.ts resolves it to a component, so a
  -- payment icon costs zero network requests and cannot fail to load.
  icon_key             text        NOT NULL DEFAULT 'generic',

  -- Developer-level availability, for retiring a method everywhere at once
  -- without deleting the history that references it.
  is_active            boolean     NOT NULL DEFAULT true,

  -- Default presentation order. A tenant overrides it in settings.
  sort_order           integer     NOT NULL DEFAULT 100,

  -- Contexts the developers ALLOW. A tenant may only narrow this set.
  allowed_contexts     text[]      NOT NULL DEFAULT ARRAY[]::text[],

  -- Which family of account the money settles into. This is what the posting
  -- engine branches on, replacing the hard-coded ENUM list.
  ledger_kind          text        NOT NULL DEFAULT 'CASH',

  -- Accounting seam. Guidance today; the authoritative business-specific
  -- mapping is payment_method_settings.default_account_id.
  default_account_code text,

  -- Behaviour the UI must not hard-code.
  is_credit_term       boolean     NOT NULL DEFAULT false,
  requires_reference   boolean     NOT NULL DEFAULT false,

  -- The ENUM value(s) this row represents. Lets a historic invoice that stored
  -- 'bank_transfer' be labelled from the catalogue instead of a local map.
  legacy_ids           text[]      NOT NULL DEFAULT ARRAY[]::text[],

  notes                text,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payment_methods_id_normalised
    CHECK (id = lower(btrim(id)) AND id <> ''),
  CONSTRAINT payment_methods_ledger_kind_valid
    CHECK (ledger_kind IN ('CASH','BANK','WALLET','CARD','CREDIT','OTHER')),
  CONSTRAINT payment_methods_contexts_valid
    CHECK (allowed_contexts <@ ARRAY[
      'pos','sales','purchases','expenses','customer_collection',
      'sales_returns','purchase_returns'
    ]::text[])
);

COMMENT ON TABLE public.payment_methods IS
  'كتالوج طرق الدفع الذي يجهّزه المطورون. العميل لا ينشئ صفوفاً هنا؛ يختار ويفعّل فقط.';
COMMENT ON COLUMN public.payment_methods.icon_key IS
  'مفتاح أيقونة مركزي يُحلّ إلى مكوّن داخل الحزمة. ليس رابطاً خارجياً ولا Base64.';
COMMENT ON COLUMN public.payment_methods.ledger_kind IS
  'عائلة الحساب (صندوق/بنك/محفظة/بطاقة/آجل). يستخدمها محرك الترحيل بدل تعداد قيم الـEnum.';
COMMENT ON COLUMN public.payment_methods.default_account_code IS
  'ربط محاسبي مستقبلي: payment_method → account. إرشادي في هذه المرحلة.';
COMMENT ON COLUMN public.payment_methods.legacy_ids IS
  'قيم public.payment_method التي تمثّلها هذه الطريقة، لعرض الفواتير التاريخية من الكتالوج.';

CREATE INDEX IF NOT EXISTS ix_payment_methods_order
  ON public.payment_methods (is_active, sort_order, id);

CREATE INDEX IF NOT EXISTS ix_payment_methods_legacy_ids
  ON public.payment_methods USING gin (legacy_ids);


-- ============================================================================
-- 3. TENANT CONFIGURATION — what THIS business chose
--
-- A method with no row here has never been touched by the business and inherits
-- the catalogue defaults, so adding a method in a migration makes it available
-- without a data backfill.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.payment_method_settings (
  payment_method_id  text PRIMARY KEY
    REFERENCES public.payment_methods(id) ON DELETE CASCADE,

  enabled            boolean NOT NULL DEFAULT true,
  sort_order         integer NOT NULL DEFAULT 100,
  enabled_contexts   text[]  NOT NULL DEFAULT ARRAY[]::text[],

  -- Accounting seam per business: the phase where بنك الكريمي maps to one
  -- specific bank account rather than a generic one.
  default_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,

  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT payment_method_settings_contexts_valid
    CHECK (enabled_contexts <@ ARRAY[
      'pos','sales','purchases','expenses','customer_collection',
      'sales_returns','purchase_returns'
    ]::text[])
);

COMMENT ON TABLE public.payment_method_settings IS
  'تخصيص العميل: تفعيل كل طريقة، ترتيب عرضها، والأقسام التي تظهر فيها.';
COMMENT ON COLUMN public.payment_method_settings.enabled_contexts IS
  'الأقسام المسموح بها لهذه المنشأة. لا يمكن أن تتجاوز allowed_contexts في الكتالوج.';

CREATE INDEX IF NOT EXISTS ix_payment_method_settings_order
  ON public.payment_method_settings (enabled, sort_order);


-- ---------------------------------------------------------------------------
-- 3.1 A tenant may NARROW the developers' context list, never WIDEN it.
--     A CHECK constraint cannot see the parent row, so this is a trigger.
--     Without it, a bug in the settings screen could offer آجل while collecting
--     cash, or a wallet inside a purchase return where a refund method is
--     supposed to be honoured.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
BEGIN
  SELECT allowed_contexts INTO v_allowed
  FROM public.payment_methods
  WHERE id = NEW.payment_method_id;

  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'طريقة الدفع غير موجودة في الكتالوج: %', NEW.payment_method_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT (NEW.enabled_contexts <@ v_allowed) THEN
    RAISE EXCEPTION
      'الأقسام المختارة (%) تتجاوز ما يسمح به الكتالوج لطريقة % (%)',
      array_to_string(NEW.enabled_contexts, ', '),
      NEW.payment_method_id,
      array_to_string(v_allowed, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.payment_method_settings_guard() IS
  'يمنع توسيع أقسام طريقة الدفع خارج ما يسمح به كتالوج المطورين.';

DROP TRIGGER IF EXISTS payment_method_settings_context_guard
  ON public.payment_method_settings;
CREATE TRIGGER payment_method_settings_context_guard
  BEFORE INSERT OR UPDATE ON public.payment_method_settings
  FOR EACH ROW EXECUTE FUNCTION public.payment_method_settings_guard();

DROP TRIGGER IF EXISTS payment_methods_updated ON public.payment_methods;
CREATE TRIGGER payment_methods_updated
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS payment_method_settings_updated
  ON public.payment_method_settings;
CREATE TRIGGER payment_method_settings_updated
  BEFORE UPDATE ON public.payment_method_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- ---------------------------------------------------------------------------
-- 3.2 RLS.
--     The catalogue is readable by any staff member — every screen needs the
--     names and icons — and writable by nobody over PostgREST: it ships in
--     migrations, which run as the owner and bypass RLS.
--     The tenant configuration is readable by staff and writable by
--     owner/manager, matching every other settings surface in the project.
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_methods          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_method_settings  ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.payment_methods TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_method_settings TO authenticated;
GRANT ALL ON public.payment_methods, public.payment_method_settings TO service_role;

DROP POLICY IF EXISTS "payment_methods read" ON public.payment_methods;
CREATE POLICY "payment_methods read"
  ON public.payment_methods
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "payment_method_settings read" ON public.payment_method_settings;
CREATE POLICY "payment_method_settings read"
  ON public.payment_method_settings
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "payment_method_settings write" ON public.payment_method_settings;
CREATE POLICY "payment_method_settings write"
  ON public.payment_method_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager'));


-- ============================================================================
-- 4. THE SEED — the Yemeni catalogue
--
-- These are the methods we, the developers, prepare. ON CONFLICT DO UPDATE so
-- re-applying refreshes names, icons, order and contexts. It deliberately does
-- NOT touch payment_method_settings: a tenant's toggles are theirs, and a
-- migration must never reset them.
--
-- `legacy_ids` is load-bearing, not decoration. It is what lets cash/card/
-- bank_transfer/credit/mobile_money keep their exact meaning while five named
-- Yemeni institutions are first-class, selectable methods alongside them.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 4.1 The tenant configuration is NOT backfilled here.
--
-- Why not: payment_method_settings rows must exist for the six legacy ENUM
-- methods so the upgrade does not silently remove a payment option from the
-- till. But this migration runs BEFORE the catalogue seed, so a
-- `SELECT … FROM public.payment_methods` at this point finds an EMPTY table,
-- inserts zero rows, and reports no error. The backfill was therefore written,
-- ran, and did nothing — while a database that happened to seed first behaved
-- differently. That is a data-insertion job, not a schema job.
--
-- Where it lives now: supabase/seeds/01_system/08_payment_methods.sql, right
-- after the catalogue insert. It is a row of reference data, and
-- MIGRATIONS_RULES.md §1 puts reference data in the seed, beside the rows it
-- depends on — which removes the ordering fragility entirely.
--
-- The named Yemeni methods still get no settings row on purpose: absence means
-- "inherit the catalogue default", which is enabled and scoped to the
-- catalogue's contexts, so they appear as an ordinary addition.
-- ---------------------------------------------------------------------------


-- ============================================================================
-- 5. THE THREE HELPERS EVERYTHING ELSE CALLS
--
-- These replace, in one place, what used to be duplicated as ENUM literals in
-- five RPCs and four ledger-posting migrations.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 5.1 A catalogue id -> the value a document stores.
--
-- The ONLY sanctioned conversion. A screen must never guess, and `create_sale`
-- must never receive a value the ENUM cannot hold.
--
-- An unknown id returns 'cash' rather than NULL, because a NULL payment_method
-- on an invoice is worse than a wrong-but-valid one: the ledger engine would
-- fall through its CASE and post to the till regardless. The guard in 6.1 is
-- what refuses unknown ids up front; this is the last-resort floor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_legacy_id(p_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT lower(btrim(coalesce(p_id, ''))) AS v
  ),
  direct AS (
    -- The id already IS an ENUM value (cash, card, bank_transfer, credit,
    -- mobile_money, split, cheque): accept it as-is. This is what keeps every
    -- existing caller working unchanged.
    SELECT n.v
    FROM norm n
    WHERE n.v <> ''
      AND EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace ns ON ns.oid = t.typnamespace
        WHERE ns.nspname = 'public' AND t.typname = 'payment_method'
          AND e.enumlabel = n.v
      )
  ),
  via_catalog AS (
    SELECT coalesce(
             nullif(m.legacy_ids[1], ''),
             CASE m.ledger_kind
               WHEN 'BANK'   THEN 'bank_transfer'
               WHEN 'WALLET' THEN 'mobile_money'
               WHEN 'CARD'   THEN 'card'
               WHEN 'CREDIT' THEN 'credit'
               WHEN 'CASH'   THEN 'cash'
               ELSE 'cash'
             END
           ) AS v
    FROM public.payment_methods m, norm n
    WHERE m.id = n.v
  )
  SELECT coalesce(
    (SELECT v FROM direct),
    (SELECT v FROM via_catalog),
    'cash'
  );
$$;

COMMENT ON FUNCTION public.payment_method_legacy_id(text) IS
  'يحوّل معرّف الكتالوج إلى القيمة التي يفهمها عمود payment_method. المصدر الوحيد لهذا التحويل في النظام.';

-- ---------------------------------------------------------------------------
-- 5.2 A stored value -> the catalogue row that represents it.
--     Used to label historic documents from the catalogue instead of a local
--     label map, so a new method's name is defined once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_catalog_id(p_stored text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id
  FROM public.payment_methods m
  WHERE lower(btrim(coalesce(p_stored, ''))) = ANY (m.legacy_ids)
  ORDER BY m.sort_order, m.id
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.payment_method_catalog_id(text) IS
  'يعيد معرّف الكتالوج المقابل لقيمة مخزّنة، لعرض الفواتير التاريخية من الكتالوج.';

-- ---------------------------------------------------------------------------
-- 5.3 Normalise an arbitrary incoming value to a catalogue id.
--
-- Order of resolution matters. A raw ENUM value must resolve to the CANONICAL
-- catalogue row for that value, not to whichever named institution happens to
-- also carry it. 'bank_transfer' must become the generic تحويل بنكي, never
-- بنك الكريمي.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_resolve_id(p_value text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT lower(btrim(coalesce(p_value, ''))) AS v
  )
  SELECT coalesce(
    -- 1. An exact catalogue id wins outright.
    (SELECT m.id FROM public.payment_methods m, norm n WHERE m.id = n.v),
    -- 2. An exact ENUM value resolves to the canonical row for that value.
    (SELECT public.payment_method_catalog_id(n.v) FROM norm n WHERE n.v <> ''),
    -- 3. Unresolvable: return the input so the caller can report it honestly
    --    instead of silently substituting a method the operator did not choose.
    (SELECT nullif(n.v, '') FROM norm n)
  );
$$;

COMMENT ON FUNCTION public.payment_method_resolve_id(text) IS
  'يطبّع أي قيمة واردة من الواجهة إلى معرّف كتالوجي، دون تخمين صامت.';

-- ---------------------------------------------------------------------------
-- 5.4 May this method be used, in this context, right now?
--
-- The single write guard. Reads the tenant configuration and falls back to the
-- catalogue, so a method nobody has configured is usable immediately.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_is_allowed(
  p_value   text,
  p_context text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH resolved AS (
    SELECT public.payment_method_resolve_id(p_value) AS id
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.payment_methods m
    LEFT JOIN public.payment_method_settings s ON s.payment_method_id = m.id
    CROSS JOIN resolved r
    WHERE m.id = r.id
      -- The developers can retire a method everywhere without deleting it.
      AND m.is_active
      AND coalesce(s.enabled, true)
      AND p_context = ANY (
        CASE
          WHEN coalesce(cardinality(s.enabled_contexts), 0) > 0
            THEN s.enabled_contexts
          ELSE m.allowed_contexts
        END
      )
  );
$$;

COMMENT ON FUNCTION public.payment_method_is_allowed(text, text) IS
  'هل طريقة الدفع مفعّلة ومسموح بها في هذا القسم لهذه المنشأة؟ الحارس الوحيد في النظام.';

-- ---------------------------------------------------------------------------
-- 5.5 Which account does this method settle to?
--
-- Replaces the four copies of
--   IF payment_method IN ('bank_transfer','card','mobile_money') THEN '1111' ELSE '1101'
-- that made every new Yemeni method post to the cash drawer.
--
-- `credit` intentionally returns NULL: nothing was collected, so there is no
-- cash or bank line to write. The caller must test for NULL rather than treat
-- the result as a code.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_ledger_account(p_stored text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Explicit guidance on the catalogue row wins.
    WHEN m.default_account_code IS NOT NULL THEN m.default_account_code
    -- Otherwise derive from the account family. NULL for CREDIT is deliberate.
    WHEN m.ledger_kind IN ('BANK','WALLET','CARD') THEN '1111'
    WHEN m.ledger_kind = 'CREDIT' THEN NULL
    WHEN m.ledger_kind = 'CASH'   THEN '1101'
    ELSE '1101'
  END
  FROM public.payment_methods m
  WHERE m.id = public.payment_method_resolve_id(p_stored);
$$;

COMMENT ON FUNCTION public.payment_method_ledger_account(text) IS
  'الحساب الذي تُسوّى إليه طريقة الدفع. يعيد NULL للآجل لأن شيئاً لم يُحصَّل.';

-- ---------------------------------------------------------------------------
-- 5.6 Grant the helpers. They are read-only, SECURITY DEFINER and deterministic
--     for a given catalogue, so authenticated callers may execute them.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.payment_method_legacy_id(text)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_method_catalog_id(text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_method_resolve_id(text)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_method_is_allowed(text, text)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.payment_method_ledger_account(text)     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.payment_method_legacy_id(text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_method_catalog_id(text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_method_resolve_id(text)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_method_is_allowed(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.payment_method_ledger_account(text)   TO authenticated, service_role;


-- ============================================================================
-- 6. THE WRITE GUARD — one function, replacing five hard-coded ENUM lists
--
-- Every write path calls this instead of repeating
--   NOT IN ('cash','card','bank_transfer','credit','mobile_money')
-- which is what made a new method impossible to add without editing five files,
-- and what let the returns screens send a `bank` value the ENUM cannot hold.
--
-- `p_strict_context` controls whether the context scoping applies:
--   • true  — normal operator input. The method must be enabled for THIS
--             section. Prevents a wallet appearing in a purchase return.
--   • false — replay / repair. The method must exist and be enabled for the
--             business, but is not scoped to a section. Used where a historic
--             document is being re-posted after the business changed its
--             settings, so we do not rewrite history.
--
-- Returns the value to STORE (already converted through the ENUM), or raises.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_writable_payment_method(
  p_value          text,
  p_context        text,
  p_strict_context boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id      text;
  v_stored  text;
  v_enabled boolean;
BEGIN
  v_id := public.payment_method_resolve_id(p_value);

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'طريقة دفع غير صالحة: %', coalesce(p_value, '(فارغ)')
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(s.enabled, true) AND m.is_active
    INTO v_enabled
  FROM public.payment_methods m
  LEFT JOIN public.payment_method_settings s ON s.payment_method_id = m.id
  WHERE m.id = v_id;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'طريقة الدفع غير مفعّلة: %', p_value
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_strict_context
     AND NOT public.payment_method_is_allowed(v_id, coalesce(p_context, 'pos')) THEN
    RAISE EXCEPTION
      'طريقة الدفع "%" غير مسموح بها في قسم "%"', p_value, coalesce(p_context, 'pos')
      USING ERRCODE = 'check_violation';
  END IF;

  v_stored := public.payment_method_legacy_id(v_id);

  IF v_stored IS NULL THEN
    RAISE EXCEPTION 'تعذّر تحويل طريقة الدفع إلى قيمة صالحة: %', p_value
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_stored;
END $$;

COMMENT ON FUNCTION public.resolve_writable_payment_method(text, text, boolean) IS
  'الحارس الموحّد لكتابة طريقة الدفع: يتحقق من الصلاحية ثم يعيد القيمة المخزّنة. بديل القوائم المضمّنة في دوال الكتابة.';

REVOKE ALL ON FUNCTION public.resolve_writable_payment_method(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_writable_payment_method(text, text, boolean) TO authenticated, service_role;


-- ============================================================================
-- 7. WRITE PATHS NOW USE THE CATALOGUE
--
-- Each of these is the CURRENT body of the function, unchanged except for the
-- payment-method handling. Nothing about stock, credit limits, ledger posting
-- for debts, audit or numbering is touched — a payment method is a label and an
-- account family, not a business rule.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 8. THE LEDGER POSTING ENGINE NOW ASKS THE CATALOGUE
--
-- Four migrations each carried their own copy of:
--
--   IF payment_method = 'credit' THEN NULL
--   ELSIF payment_method IN ('bank_transfer','card','mobile_money') THEN '1111'
--   ELSE '1101' END IF
--
-- That three-line branch was the reason a new Yemeni method could not be added
-- safely. بنك الكريمي recorded as 'bank_transfer' posted correctly BY ACCIDENT:
-- only because its `legacy_ids` happened to map onto a value already in the
-- list. A method whose ledger kind was BANK but whose legacy value resolved to
-- something else would have posted to the cash drawer with no error at all.
--
-- Each body below is the CURRENT function, with only that branch replaced by
-- public.payment_method_ledger_account(). The entry construction, the revenue
-- classification, the cost resolution, the VAT line, the exactly-once guard and
-- the view are untouched.
--
-- Note the ordering of the four definitions: each supersedes the previous one,
-- and they are replayed here in the same order so the final definition is
-- identical to what production already runs — plus the catalogue call.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 8.1 ledger_account_code_for_payment_method — the branch, named once.
--
-- Kept as a wrapper rather than inlining the call into each posting function,
-- so the four functions still read exactly as they did and a reviewer can diff
-- them line by line against their originals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ledger_account_code_for_payment_method(
  p_payment_method text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.payment_method_ledger_account(p_payment_method);
$$;

COMMENT ON FUNCTION public.ledger_account_code_for_payment_method(text) IS
  'الحساب الذي تُسوّى إليه طريقة الدفع في القيود. يعيد NULL للآجل، ويأتي من الكتالوج لا من قائمة مضمّنة.';

REVOKE ALL ON FUNCTION public.ledger_account_code_for_payment_method(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ledger_account_code_for_payment_method(text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 8.2 post_sales_invoice
--
-- Reproduced VERBATIM from
--   20261202000200_cash_received_is_debited_not_credited.sql
-- which is the newest of the three sales-ledger definitions. The single change
-- is the replacement of:
--
--   IF v_inv.payment_method = 'credit' THEN NULL
--   ELSIF v_inv.payment_method IN ('bank_transfer','card','mobile_money') THEN '1111'
--   ELSE '1101' END IF
--
-- with a call to the catalogue. Everything else — the exactly-once guard, the
-- overpaid refusal, the revenue classification by item_class, the VAT line, the
-- COGS lines, and create_journal_entry — is untouched.
-- ---------------------------------------------------------------------------
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

  -- ── الحساب من الكتالوج بدل القائمة المضمّنة ─────────────────────────────
  -- 'credit'          -> NULL      (لم يُحصَّل شيء)
  -- BANK/WALLET/CARD  -> '1111'    (يخرج عبر البنك)
  -- CASH / OTHER      -> '1101'    (الصندوق؛ وsplit تُسوّى نقداً)
  v_cash_acct := public.ledger_account_code_for_payment_method(v_inv.payment_method);

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

REVOKE ALL ON FUNCTION public.post_sales_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_sales_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.post_sales_invoice(uuid) IS
  'يرحّل فاتورة مبيعات إلى الدفتر. حساب التحصيل يأتي من كتالوج طرق الدفع، والإيراد من تصنيف الصنف.';


-- ---------------------------------------------------------------------------
-- 8.3 post_purchase_invoice
--
-- Reproduced VERBATIM from
--   20261203000000_post_purchase_invoices_to_ledger.sql
-- with the same single change to the payment-method branch. The classification
-- of goods-versus-expense by stock_effect, the recoverable input VAT on 1316,
-- and the supplier partner_id on the payable line are all untouched.
-- ---------------------------------------------------------------------------
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

  -- ── الحساب من الكتالوج بدل القائمة المضمّنة ─────────────────────────────
  v_cash_acct := public.ledger_account_code_for_payment_method(v_inv.payment_method);

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
  'حساب الدفع يأتي من كتالوج طرق الدفع لا من قائمة مضمّنة.';


-- ============================================================================
-- 9. REPORTING VIEW — method names come from the catalogue, not from a CASE
--
-- One read helper so statements, reports and exports do not each rebuild a
-- label map. Returns the catalogue id, the Arabic and English names, and the
-- account family, for any stored value including historic ones.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.payment_method_catalog_view()
RETURNS TABLE (
  id                  text,
  name_ar             text,
  name_en             text,
  icon_key            text,
  ledger_kind         text,
  default_account_code text,
  is_credit_term      boolean,
  is_active           boolean,
  sort_order          integer,
  allowed_contexts    text[],
  -- Tenant layer, coalesced so an unconfigured method reports its defaults
  -- rather than NULLs a report would have to special-case.
  enabled             boolean,
  effective_sort_order integer,
  effective_contexts  text[],
  is_configured       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name_ar,
    m.name_en,
    m.icon_key,
    m.ledger_kind,
    m.default_account_code,
    m.is_credit_term,
    m.is_active,
    m.sort_order,
    m.allowed_contexts,
    coalesce(s.enabled, true),
    coalesce(s.sort_order, m.sort_order),
    CASE
      WHEN coalesce(cardinality(s.enabled_contexts), 0) > 0
        THEN s.enabled_contexts
      ELSE m.allowed_contexts
    END,
    (s.payment_method_id IS NOT NULL)
  FROM public.payment_methods m
  LEFT JOIN public.payment_method_settings s ON s.payment_method_id = m.id
  ORDER BY coalesce(s.sort_order, m.sort_order), m.id;
$$;

COMMENT ON FUNCTION public.payment_method_catalog_view() IS
  'عرض موحّد لطرق الدفع مع تخصيص المنشأة، لاستخدامه في التقارير والتصدير دون خرائط تسميات محلية.';

REVOKE ALL ON FUNCTION public.payment_method_catalog_view() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_method_catalog_view() TO authenticated, service_role;


-- ============================================================================
-- 10. WHERE THE OLD DEFINITIONS WENT
--
-- The migrations below are now SUPERSEDED and left in place for history only —
-- they are never edited, because rewriting an applied migration would make the
-- schema depend on which order the files happened to run in:
--
--   20260706120000  ALTER TYPE payment_method ADD VALUE 'mobile_money'
--   20260706121000  duplicate of the above (reset-seed path)
--   20260707021000  duplicate of the above (Yemen-seed path)
--        -> section 1 widens the ENUM to the full set transactionally.
--
--   20260801090000  create_sale / record_customer_payment literal guards
--        -> section 7.1 and 7.4 replace both with
--           resolve_writable_payment_method.
--
--   20260928000000  superseded split-payment engine, literal component guard
--        -> superseded by 20260929030000, which section 7.3 now replaces.
--
--   20260929030000  create_sale (three overloads), create_sales_return
--        -> sections 7.1-7.3 and 7.5.
--
--   20260929040000  create_purchase_return
--        -> section 7.6.
--
--   20261202000000  post_sales_invoice, payment-method branch
--   20261202000100  the same branch, overpaid refusal
--   20261202000200  the same branch, cash debit correction
--   20261203000000  post_purchase_invoice, the same branch
--        -> sections 8.2 and 8.3.
--
-- WHY THEY ARE NOT DELETED: each one also creates indexes, views, constraints
-- and helper functions that this file does not recreate. Deleting them would
-- drop those objects on a fresh database while leaving production untouched —
-- exactly the kind of drift that makes a schema impossible to reason about.
-- Superseding the definitions here is both safer and sufficient: after this
-- migration, no live function contains a hard-coded payment-method list.
-- ============================================================================

-- ============================================================================
-- القسم الثاني — تفويض المستأجر
--
-- امتداد مباشر لما سبق لا يعمل منفصلاً عنه: يعدّل الجداول التي أُنشئت
-- أعلاه، ويعرّف الدوال التي تحتاجها. لذلك دُمج الملفان (16 و17 في خطة
-- الدمج) في ترحيل واحد باسم 16.
--
-- المصدر: origin/main — 20261208000001_payment_methods_tenant_authoring.sql
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Provenance and authoring columns on the catalogue.
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_system        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS legacy_id        text,
  ADD COLUMN IF NOT EXISTS default_ledger_kind text,
  -- The Arabic label exactly as the developers shipped it. Written ONLY by the
  -- seed (seeds/01_system/08_payment_methods.sql) and NEVER updated afterwards,
  -- so `payment_method_catalog_view().is_renamed` has a real baseline to
  -- compare against. Without it the flag could only compare a row to itself and
  -- was therefore always false.
  ADD COLUMN IF NOT EXISTS shipped_name_ar  text;

COMMENT ON COLUMN public.payment_methods.shipped_name_ar IS
  'الاسم العربي كما شحنه المطورون في البذرة. لا يُعدَّل بعد الزرع، ويُقارَن به name_ar لمعرفة إن كانت المنشأة قد أعادت التسمية.';

COMMENT ON COLUMN public.payment_methods.created_by IS
  'من أنشأ الطريقة. NULL = أنشأها المطورون في ترحيل، لا منشأة.';
COMMENT ON COLUMN public.payment_methods.is_system IS
  'true = صف يملكه المطورون. لا تحذفه منشأة، ولا يغيّر أحدٌ نوع حسابه.';
COMMENT ON COLUMN public.payment_methods.legacy_id IS
  'القيمة المخزّنة التي تُسوّى عليها الطريقة. للصفوف النظامية = legacy_ids[1]، وللصفوف التي أنشأتها منشأة يختارها المنشئ من ضمن الـEnum.';
COMMENT ON COLUMN public.payment_methods.default_ledger_kind IS
  'نوع الحساب الذي اقترحته المنشأة عند الإنشاء. للعرض والتشخيص فقط؛ المحرّك يقرأ ledger_kind.';

-- 1.1 Backfill: every existing row is a developer row.
--
--     The stored value is legacy_ids[1] when the row declares one. A NAMED
--     institution shipped by the unified catalogue deliberately carries an
--     EMPTY legacy list — بنك الكريمي and جيب share the generic
--     `bank_transfer` / `mobile_money` value rather than redefining it — so
--     falling back to 'cash' here would repoint a bank onto the till and make
--     `payment_method_legacy_id('kuraimi_bank')` return 'cash'.
--
--     The correct fallback is therefore the ACCOUNT FAMILY, which is what the
--     posting engine already treats as authoritative, and only then 'cash' for
--     a row that has neither. This mirrors the last-resort CASE inside
--     `payment_method_legacy_id` so the column and the helper cannot disagree.
--
--     ⚠️ This is written as an unconditional CASE, NOT as `coalesce(legacy_id, …)`.
--     The column starts NULL on a fresh database, but on any database where an
--     earlier run already set it — or where it carried the old DEFAULT 'cash' —
--     `coalesce` would find a non-NULL value and STOP, silently leaving every
--     bank and wallet row stored as 'cash'. That exact failure is what the
--     review `MIGRATION_16_REVIEW.md` §2 documents: the document said bank and
--     the ledger said till, which makes reconciliation impossible. The CASE
--     re-derives the value from the authoritative source every time, so a
--     repeated run converges to the same correct answer instead of preserving
--     the corruption it was meant to repair.
--
--     The WHERE is chosen so that the only rows touched are those whose stored
--     value already disagrees with that derivation. The trigger
--     `payment_methods_authoring_guard` (section 3) must never see a no-op
--     update here, and a tenant row's explicit choice is left alone because the
--     CASE reads `legacy_ids[1]` first.
UPDATE public.payment_methods
   SET is_system = true,
       legacy_id = CASE
         -- 1. The value the row explicitly declares. Developer rows that name
         --    an ENUM value carry it here; a tenant row carries its own pick.
         WHEN nullif(legacy_ids[1], '') IS NOT NULL THEN legacy_ids[1]
         -- 2. The account family, which is what the posting engine trusts.
         WHEN ledger_kind = 'BANK'   THEN 'bank_transfer'
         WHEN ledger_kind = 'WALLET' THEN 'mobile_money'
         WHEN ledger_kind = 'CARD'   THEN 'card'
         WHEN ledger_kind = 'CREDIT' THEN 'credit'
         WHEN ledger_kind = 'CASH'   THEN 'cash'
         -- 3. A row with neither. 'OTHER' (the split pseudo-method) lands here.
         ELSE coalesce(nullif(legacy_id, ''), 'cash')
       END
 WHERE is_system IS DISTINCT FROM true
    -- A row whose family can produce a value, but whose stored value differs
    -- from it: the corruption this section exists to repair.
    OR (
      ledger_kind IN ('BANK','WALLET','CARD','CREDIT','CASH')
      AND legacy_id IS DISTINCT FROM CASE ledger_kind
            WHEN 'BANK'   THEN 'bank_transfer'
            WHEN 'WALLET' THEN 'mobile_money'
            WHEN 'CARD'   THEN 'card'
            WHEN 'CREDIT' THEN 'credit'
            ELSE coalesce(nullif(legacy_ids[1], ''), 'cash')
          END
    );

-- 1.2 From now on the column is authoritative, so it must always be present.
--
--     ⚠️ No `DEFAULT 'cash'` here, and this matters. A column default is applied
--     to any INSERT that omits the column — including `create_tenant_payment_method`
--     if it ever forgets it, and any future seed that adds a row without setting
--     it. The tenant RPC always writes `legacy_id` explicitly, so the default was
--     never needed; but while it existed it also meant §1.1's `coalesce` found a
--     non-NULL 'cash' on a second run and stopped, freezing every bank row as
--     cash — the exact bug MIGRATION_16_REVIEW.md §2 describes. Leaving the
--     default off means "forgot to set it" fails loudly against the NOT NULL
--     below instead of silently recording a bank as cash.
ALTER TABLE public.payment_methods
  ALTER COLUMN legacy_id DROP DEFAULT;
UPDATE public.payment_methods SET legacy_id = 'cash' WHERE legacy_id IS NULL;
ALTER TABLE public.payment_methods
  ALTER COLUMN legacy_id SET NOT NULL;

-- 1.3 It may only ever hold a value the ENUM can store. This is the constraint
--     that makes it impossible for a tenant-created method to write a value the
--     financial tables would reject.
ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_legacy_id_valid;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_legacy_id_valid
  CHECK (legacy_id IN ('cash','card','bank_transfer','credit','mobile_money','split','cheque'));

-- 1.4 A tenant row must not use a developer id. `is_system` is what separates
--     the two, so a tenant method can never shadow بنك الكريمي.
CREATE INDEX IF NOT EXISTS ix_payment_methods_system
  ON public.payment_methods (is_system, is_active, sort_order);

-- 1.5 Names are what the operator reads at the till; empty is not acceptable.
ALTER TABLE public.payment_methods
  DROP CONSTRAINT IF EXISTS payment_methods_name_ar_present;
ALTER TABLE public.payment_methods
  ADD CONSTRAINT payment_methods_name_ar_present
  CHECK (btrim(coalesce(name_ar, '')) <> '');

-- 1.6 A tenant row has no history to preserve, so it may carry no legacy list
--     at all; the column stays for the developer rows that need it.
ALTER TABLE public.payment_methods
  ALTER COLUMN legacy_ids SET DEFAULT ARRAY[]::text[];

-- 1.7 One icond key per row, from the bundled registry. A developer row with a
--     key the client bundle does not know still renders through the ledger-kind
--     fallback, so this is guidance, not a wall.
COMMENT ON COLUMN public.payment_methods.icon_key IS
  'مفتاح أيقونة مركزي يُحلّ إلى مكوّن داخل الحزمة (ليس رابطاً). قائمة المفاتيح المتاحة للعميل في src/lib/payments/payment-methods.ts.';

-- ---------------------------------------------------------------------------
-- 2. Ownership columns on the tenant settings, so an edit shows who and where
--    it came from. `updated_at` / `updated_by` already exist.
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_method_settings
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_platform boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payment_method_settings.updated_by_platform IS
  'true = آخر تعديل جاء من مسؤول منصة (سوبر أدمن)، لا من المنشأة نفسها.';

-- ---------------------------------------------------------------------------
-- 3. THE GUARD — what a rename may and may not change.
--
--    A trigger, not a policy, because the rule is about WHICH COLUMNS changed,
--    and RLS cannot see the OLD row. It runs for every writer, including a
--    direct PostgREST update from an owner, which is exactly the case a UI-only
--    rule would leave open.
--
--    Read the two branches as one sentence:
--      "اسمٌ وأيقونة: نعم. حسابٌ وقيمةٌ مخزّنة: لا، إلا في صفٍّ أنشأته أنت."
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_methods_authoring_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  -- The migration runner and the platform's own service key are not bound by
  -- this rule: they are the developers, and this trigger exists for them to be
  -- able to change the seed at all.
  IF v_user IS NULL OR public.is_platform_superadmin(v_user) THEN
    RETURN NEW;
  END IF;

  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل طرق الدفع'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3.1 A developer row is not the tenant's to enrich. They may rename it and
  --     re-icon it; every column that decides how money moves is frozen.
  IF OLD.is_system THEN
    IF NEW.ledger_kind   IS DISTINCT FROM OLD.ledger_kind
       OR NEW.legacy_id  IS DISTINCT FROM OLD.legacy_id
       OR NEW.is_system  IS DISTINCT FROM OLD.is_system
       OR NEW.is_active  IS DISTINCT FROM OLD.is_active
       OR NEW.legacy_ids IS DISTINCT FROM OLD.legacy_ids
       OR NEW.id         IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION
        'لا يمكن تغيير طبيعة طريقة دفع نظامية (%) — يمكن تعديل الاسم والأيقونة والترتيب فقط',
        OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- 3.2 A tenant row is theirs, but its shape is still the platform's.
  IF NEW.is_system IS DISTINCT FROM OLD.is_system THEN
    RAISE EXCEPTION 'لا يمكن ترقية طريقة دفع إلى نظامية من الواجهة'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.ledger_kind NOT IN ('CASH','BANK','WALLET','CARD','OTHER') THEN
    RAISE EXCEPTION 'نوع الحساب "%" غير متاح لطريقة دفع تنشئها المنشأة', NEW.ledger_kind
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.payment_methods_authoring_guard() IS
  'يسمح للمنشأة بتعديل الاسم والأيقونة، ويمنعها من تغيير نوع الحساب أو القيمة المخزّنة لطريقة نظامية.';

DROP TRIGGER IF EXISTS payment_methods_authoring_guard ON public.payment_methods;
CREATE TRIGGER payment_methods_authoring_guard
  BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.payment_methods_authoring_guard();

-- 3.3 The same sentence for DELETE: a tenant method may be removed by its owner,
--     a developer method never. `ON DELETE CASCADE` on the settings row means
--     the configuration disappears with it — which is correct for a row the
--     business itself created.
CREATE OR REPLACE FUNCTION public.payment_methods_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR public.is_platform_superadmin(v_user) THEN
    RETURN OLD;
  END IF;

  IF OLD.is_system THEN
    RAISE EXCEPTION
      'لا يمكن حذف طريقة دفع نظامية (%) — عطّلها بدلاً من ذلك', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (public.has_role(v_user, 'owner') OR public.has_role(v_user, 'manager')) THEN
    RAISE EXCEPTION 'لا تملك صلاحية حذف طرق الدفع'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN OLD;
END $$;

COMMENT ON FUNCTION public.payment_methods_delete_guard() IS
  'يمنع حذف طريقة نظامية؛ ويقصر حذف طرق المنشأة على المالك أو المدير.';

DROP TRIGGER IF EXISTS payment_methods_delete_guard ON public.payment_methods;
CREATE TRIGGER payment_methods_delete_guard
  BEFORE DELETE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.payment_methods_delete_guard();

-- 3.4 Defence in depth: even if a policy is ever widened, a non-platform caller
--     can never INSERT straight into the catalogue. Inserts go through the RPC
--     in section 4, which stamps created_by and is_system = false.
DROP POLICY IF EXISTS "payment_methods tenant insert" ON public.payment_methods;
CREATE POLICY "payment_methods tenant insert"
  ON public.payment_methods
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_superadmin(auth.uid()));

-- 3.5 And DELETE over PostgREST is a platform action only. A tenant's own row
--     is removed through remove_tenant_payment_method(), which is auditable and
--     can refuse when the method is in use.
DROP POLICY IF EXISTS "payment_methods platform delete" ON public.payment_methods;
CREATE POLICY "payment_methods platform delete"
  ON public.payment_methods
  FOR DELETE TO authenticated
  USING (public.is_platform_superadmin(auth.uid()));

-- 3.6 UPDATE is already governed by the existing staff policy, and the trigger
--     in 3.1 narrows it to ownership above that. Explicitly re-created here so
--     the file is self-contained on a database where the policy was renamed.
DROP POLICY IF EXISTS "payment_methods tenant update" ON public.payment_methods;
CREATE POLICY "payment_methods tenant update"
  ON public.payment_methods
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
         OR public.is_platform_superadmin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'manager')
              OR public.is_platform_superadmin(auth.uid()));

GRANT INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. THE THREE RPCs the settings screen calls.
--
--    Each one is the only sanctioned way to do its job, so a rule that matters
--    has exactly one place to be enforced and one place to be read.
-- ---------------------------------------------------------------------------

-- 4.1 May the caller author the catalogue at all?
CREATE OR REPLACE FUNCTION public.can_author_payment_methods()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_superadmin(auth.uid())
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'manager');
$$;

COMMENT ON FUNCTION public.can_author_payment_methods() IS
  'هل يملك المستخدم الحالي حق تسمية/أيقنة/إنشاء طرق دفع؟ صاحب المنشأة والمدير وسوبر أدمن المنصة.';

REVOKE ALL ON FUNCTION public.can_author_payment_methods() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_author_payment_methods() TO authenticated, service_role;

-- 4.2 A label is a label: trim it, cap it, refuse an empty one. Keeping this in
--     one function means the RPC and any future surface cannot disagree.
CREATE OR REPLACE FUNCTION public.payment_method_clean_label(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(btrim(coalesce(p_label, '')), '');
$$;

COMMENT ON FUNCTION public.payment_method_clean_label(text) IS
  'تطبيع تسمية طريقة الدفع: قصّ الفراغات وإرجاع NULL للنص الفارغ.';

REVOKE ALL ON FUNCTION public.payment_method_clean_label(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_method_clean_label(text) TO authenticated, service_role;

-- 4.3 RENAME / RE-ICON.
--
--     Deliberately returns the new state so the caller can assert it, rather
--     than trusting that the update matched a row.
CREATE OR REPLACE FUNCTION public.update_payment_method_identity(
  p_id        text,
  p_name_ar   text DEFAULT NULL,
  p_name_en   text DEFAULT NULL,
  p_icon_key  text DEFAULT NULL
)
RETURNS TABLE (id text, name_ar text, name_en text, icon_key text, is_system boolean)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row       public.payment_methods;
  v_name_ar   text;
  v_name_en   text;
  v_icon_key  text;
BEGIN
  IF NOT public.can_author_payment_methods() THEN
    RAISE EXCEPTION 'لا تملك صلاحية تعديل طرق الدفع — هذه الصلاحية لصاحب المنشأة والمدير وسوبر أدمن المنصة'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- `payment_methods.id` is qualified on purpose: an unqualified `id` inside a
  -- plpgsql function with an `id` OUT parameter resolves to the PARAMETER, not
  -- the column, and the lookup would silently match nothing.
  SELECT * INTO v_row FROM public.payment_methods WHERE public.payment_methods.id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طريقة الدفع "%" غير موجودة في الكتالوج', p_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Resolve the three new values BEFORE the update, so the UPDATE's SET list
  -- refers only to plain variables. Inside a RETURNS TABLE function, an
  -- unqualified `name_ar` in an expression is the OUT parameter — writable in
  -- PostgreSQL >= 14, an error before it. Assigning to locals first makes the
  -- statement mean the same thing on every supported version.

  -- A rename must not be able to blank a method out of the till.
  IF p_name_ar IS NOT NULL AND public.payment_method_clean_label(p_name_ar) IS NULL THEN
    RAISE EXCEPTION 'اسم طريقة الدفع لا يمكن أن يكون فارغاً'
      USING ERRCODE = 'check_violation';
  END IF;

  v_name_ar  := coalesce(public.payment_method_clean_label(p_name_ar), v_row.name_ar);
  v_name_en  := CASE
                  WHEN p_name_en IS NULL THEN v_row.name_en
                  ELSE public.payment_method_clean_label(p_name_en)
                END;
  v_icon_key := coalesce(public.payment_method_clean_label(p_icon_key), v_row.icon_key);

  UPDATE public.payment_methods m
     SET name_ar    = v_name_ar,
         name_en    = v_name_en,
         icon_key   = v_icon_key,
         updated_at = now()
   WHERE m.id = p_id;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, payload)
  VALUES (
    auth.uid(),
    'payment_method.identity.updated',
    'payment_method',
    jsonb_build_object(
      'id', p_id,
      'before', jsonb_build_object(
        'name_ar', v_row.name_ar, 'name_en', v_row.name_en, 'icon_key', v_row.icon_key),
      'after',  jsonb_build_object(
        'name_ar', v_name_ar, 'name_en', v_name_en, 'icon_key', v_icon_key),
      'by_platform', public.is_platform_superadmin(auth.uid())
    ));

  RETURN QUERY
    SELECT m.id::text, m.name_ar::text, m.name_en::text, m.icon_key::text, m.is_system::boolean
    FROM public.payment_methods m
    WHERE m.id = p_id;
END $$;

COMMENT ON FUNCTION public.update_payment_method_identity(text, text, text, text) IS
  'تعديل اسم طريقة الدفع وأيقونتها. لا يمسّ نوع الحساب ولا القيمة المخزّنة، ولا يسمح بتسمية فارغة.';

REVOKE ALL ON FUNCTION public.update_payment_method_identity(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_payment_method_identity(text, text, text, text) TO authenticated, service_role;

-- 4.4 ADD a method the developers did not ship.
--
--     The id is DERIVED from the Arabic name and de-duplicated, never taken
--     from the browser: an id is a stable key that migrations and reports will
--     address forever, so it must not be something a client can choose or
--     predictably collide with بنك الكريمي.
CREATE OR REPLACE FUNCTION public.create_tenant_payment_method(
  p_name_ar       text,
  p_name_en       text,
  p_icon_key      text,
  p_legacy_id     text,
  p_ledger_kind   text,
  p_contexts      text[] DEFAULT NULL,
  p_requires_reference boolean DEFAULT true
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_name        text;
  v_name_en     text;
  v_legacy      text;
  v_kind        text;
  v_contexts    text[];
  v_base        text;
  v_next_order  integer;
  v_auto_id     text;
BEGIN
  IF NOT public.can_author_payment_methods() THEN
    RAISE EXCEPTION 'لا تملك صلاحية إضافة طرق دفع — هذه الصلاحية لصاحب المنشأة والمدير وسوبر أدمن المنصة'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_name := public.payment_method_clean_label(p_name_ar);
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'اسم طريقة الدفع مطلوب' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_name) > 60 THEN
    RAISE EXCEPTION 'اسم طريقة الدفع طويل جداً (الحد 60 حرفاً)'
      USING ERRCODE = 'check_violation';
  END IF;
  v_name_en := public.payment_method_clean_label(p_name_en);
  IF v_name_en IS NOT NULL AND length(v_name_en) > 60 THEN
    RAISE EXCEPTION 'الاسم الإنجليزي طويل جداً (الحد 60 حرفاً)'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The stored value. A tenant may not introduce one the ENUM cannot hold, and
  -- may not choose 'split' — that value means «سُدّدت بأكثر من وسيلة» and is
  -- written by the split engine, not chosen by an operator.
  v_legacy := lower(btrim(coalesce(p_legacy_id, '')));
  IF v_legacy NOT IN ('cash','card','bank_transfer','mobile_money','cheque') THEN
    RAISE EXCEPTION
      'القيمة المخزّنة "%" غير متاحة لطريقة تنشئها المنشأة (المتاح: cash, card, bank_transfer, mobile_money, cheque)',
      coalesce(p_legacy_id, '(فارغ)')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The account family follows from the stored value. Deriving it instead of
  -- accepting it means a tenant cannot make a wallet post to the till: the
  -- pairing is a fact about the ENUM, not a preference.
  --
  -- `p_ledger_kind` is deliberately IGNORED. It exists in the signature so the
  -- platform's own tooling can pass guidance, but a caller that sends 'CASH'
  -- for a wallet does not get it: the CASE below is the only answer.
  v_kind := CASE v_legacy
              WHEN 'cash'         THEN 'CASH'
              WHEN 'card'         THEN 'CARD'
              WHEN 'bank_transfer' THEN 'BANK'
              WHEN 'cheque'       THEN 'BANK'
              WHEN 'mobile_money' THEN 'WALLET'
            END;

  -- Contexts default to everything the family can legitimately appear in.
  -- `credit` is not in the list on purpose: a tenant method is a way of
  -- COLLECTING money, and آجل is not.
  v_contexts := coalesce(
    p_contexts,
    ARRAY['pos','sales','purchases','expenses','customer_collection']::text[]
  );
  IF NOT (v_contexts <@ ARRAY[
    'pos','sales','purchases','expenses','customer_collection',
    'sales_returns','purchase_returns']::text[]) THEN
    RAISE EXCEPTION 'أحد الأقسام المختارة غير معروف'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A stable, readable id derived from the name. Arabic is transliterated to a
  -- slug; anything that leaves no usable characters falls back to a prefix, so
  -- the id is always non-empty and always matches the table's CHECK.
  --
  -- If no English name was supplied, the slug is taken from the catalogue
  -- GENERATED from the Arabic id, not from the literal Arabic text: the table's
  -- CHECK requires `id = lower(btrim(id))`, and Arabic has no case, so a raw
  -- Arabic base would pass today and break the moment anyone added a Latin word.
  v_base := regexp_replace(lower(coalesce(v_name_en, '')), '[^a-z0-9]+', '_', 'g');
  v_base := btrim(coalesce(v_base, ''), '_');

  IF v_base = '' THEN
    SELECT regexp_replace(lower(m.id), '[^a-z0-9]+', '_', 'g')
      INTO v_base
    FROM public.payment_methods m
    WHERE m.id = public.payment_method_resolve_id(v_legacy);

    v_base := btrim(coalesce(v_base, ''), '_');
  END IF;

  IF v_base = '' THEN
    v_base := 'tenant_' || nullif(btrim(v_legacy, '_'), '');
  END IF;

  -- One id, assigned before the INSERT, so the statement below refers only to
  -- plain locals. Letting PostgreSQL pick the next free suffix inline is
  -- possible, but it makes the uniqueness of `id` depend on a subquery's
  -- snapshot instead of on a loop against the live table.
  v_auto_id := v_base;
  WHILE EXISTS (SELECT 1 FROM public.payment_methods m WHERE m.id = v_auto_id) LOOP
    v_auto_id := v_base || '_' || (2 + (SELECT count(*) FROM public.payment_methods m
                                       WHERE m.id LIKE v_base || '\_%'))::text;
  END LOOP;

  -- Sorted after the last existing row, so a newly added method appears at the
  -- end of the operator's own ordering rather than in the middle of it.
  SELECT coalesce(max(m.sort_order), 100) + 10
    INTO v_next_order
  FROM public.payment_methods m;

  INSERT INTO public.payment_methods (
    id, name_ar, name_en, icon_key, is_active, sort_order, allowed_contexts,
    ledger_kind, default_account_code, is_credit_term, requires_reference,
    legacy_ids, legacy_id, default_ledger_kind, is_system, created_by, notes
  ) VALUES (
    v_auto_id,
    v_name,
    v_name_en,
    coalesce(public.payment_method_clean_label(p_icon_key), 'wallet'),
    true,
    v_next_order,
    v_contexts,
    v_kind,
    public.payment_method_ledger_account(v_legacy),
    false,
    coalesce(p_requires_reference, true),
    ARRAY[]::text[],
    v_legacy,
    v_kind,
    false,
    v_user,
    'طريقة دفع أنشأتها المنشأة.'
  );

  -- A row in settings as well, so the new method is immediately editable and
  -- carries the same contexts the catalogue row just got.
  INSERT INTO public.payment_method_settings (
    payment_method_id, enabled, sort_order, enabled_contexts, created_by
  )
  SELECT m.id, true, m.sort_order, m.allowed_contexts, v_user
  FROM public.payment_methods m
  WHERE m.id = v_auto_id
  ON CONFLICT (payment_method_id) DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, payload)
  VALUES (
    v_user, 'payment_method.created', 'payment_method',
    jsonb_build_object(
      'id', v_auto_id, 'name_ar', v_name, 'legacy_id', v_legacy,
      'ledger_kind', v_kind, 'contexts', v_contexts,
      'by_platform', public.is_platform_superadmin(v_user)
    ));

  RETURN v_auto_id;
END $$;

COMMENT ON FUNCTION public.create_tenant_payment_method(text, text, text, text, text, text[], boolean) IS
  'إضافة طريقة دفع لم يشحنها المطورون: تُشتق قيمتها المخزّنة ونوع حسابها من اختيار المنشأة، والمعرّف يُولَّد ولا يأتي من المتصفح.';

REVOKE ALL ON FUNCTION public.create_tenant_payment_method(text, text, text, text, text, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_payment_method(text, text, text, text, text, text[], boolean) TO authenticated, service_role;

-- 4.5 REMOVE a tenant method.
--
--     Refuses while documents still reference it: a removal that silently
--     changed how a past invoice labels itself is the one outcome this feature
--     must never produce. The operator is told to disable it instead.
CREATE OR REPLACE FUNCTION public.remove_tenant_payment_method(p_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row   public.payment_methods;
  v_in_use boolean;
  v_legacy text;
BEGIN
  IF NOT public.can_author_payment_methods() THEN
    RAISE EXCEPTION 'لا تملك صلاحية حذف طرق الدفع'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- `payment_methods.id` is qualified so it is the COLUMN and not a variable.
  SELECT * INTO v_row FROM public.payment_methods WHERE public.payment_methods.id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'طريقة الدفع "%" غير موجودة', p_id USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.is_system THEN
    RAISE EXCEPTION
      'لا يمكن حذف طريقة دفع نظامية (%) — عطّلها أو غيّر تسميتها بدلاً من ذلك', p_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_legacy := v_row.legacy_id;

  -- Is the stored value still on a document? Only the tenant's OWN methods can
  -- reach here, and their stored value is shared with the generic method of the
  -- same family, so this is a real question only when a method is brand new.
  SELECT EXISTS (
    SELECT 1 FROM public.customer_payment_splits s WHERE s.method::text = v_legacy
    UNION ALL
    SELECT 1 FROM public.sales_returns  r WHERE r.refund_method::text = v_legacy
    UNION ALL
    SELECT 1 FROM public.purchase_returns r WHERE r.refund_method::text = v_legacy
    UNION ALL
    SELECT 1 FROM public.expenses e WHERE e.payment_method::text = v_legacy
  ) INTO v_in_use;

  IF v_in_use THEN
    RAISE EXCEPTION
      'طريقة الدفع "%" مستخدمة في مستندات قائمة — عطّلها (Disabled) بدلاً من حذفها', p_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, payload)
  VALUES (
    auth.uid(), 'payment_method.deleted', 'payment_method',
    jsonb_build_object(
      'id', p_id, 'name_ar', v_row.name_ar, 'legacy_id', v_legacy,
      'by_platform', public.is_platform_superadmin(auth.uid())
    ));

  DELETE FROM public.payment_methods WHERE public.payment_methods.id = p_id;
END $$;

COMMENT ON FUNCTION public.remove_tenant_payment_method(text) IS
  'حذف طريقة دفع أنشأتها المنشأة. يرفض الحذف إذا كانت الطريقة مستخدمة في مستندات قائمة، ويطلب تعطيلها بدلاً من ذلك.';

REVOKE ALL ON FUNCTION public.remove_tenant_payment_method(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_tenant_payment_method(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The write guard and the ledger must both understand a tenant method.
--
--    `resolve_writable_payment_method` in 20261208000000 already resolves any
--    catalogue id through `payment_method_resolve_id`, so an id created here
--    works with no change. What needs re-checking is the VALUE it returns:
--    `payment_method_legacy_id` reads `legacy_ids[1]` first, which is EMPTY for
--    a tenant row, and only then falls back to the ledger kind. That fallback
--    would map a tenant «cheque» (legacy_id 'cheque', kind BANK) onto
--    'bank_transfer' — silently discarding the value the tenant chose.
--
--    So the helper now reads the explicit `legacy_id` first. For every existing
--    row `legacy_id` was backfilled from `legacy_ids[1]`, so this is a no-op for
--    all historical methods and only changes behaviour for tenant rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_method_legacy_id(p_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT lower(btrim(coalesce(p_id, ''))) AS v
  ),
  direct AS (
    SELECT n.v
    FROM norm n
    WHERE n.v <> ''
      AND EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace ns ON ns.oid = t.typnamespace
        WHERE ns.nspname = 'public' AND t.typname = 'payment_method'
          AND e.enumlabel = n.v
      )
  ),
  via_catalog AS (
    SELECT coalesce(
             -- 1. The value the row explicitly declares. This is where a
             --    tenant-created method carries its identity.
             nullif(m.legacy_id, ''),
             -- 2. The historical list, for any row that predates the column.
             nullif(m.legacy_ids[1], ''),
             -- 3. The account family. A named institution shipped by the unified
             --    catalogue carries an EMPTY legacy list on purpose — it shares
             --    the generic bank_transfer / mobile_money value — so this is a
             --    real answer for it, not a placeholder. It is what keeps
             --    "bank" from ever landing on the till.
             CASE m.ledger_kind
               WHEN 'BANK'   THEN 'bank_transfer'
               WHEN 'WALLET' THEN 'mobile_money'
               WHEN 'CARD'   THEN 'card'
               WHEN 'CREDIT' THEN 'credit'
               WHEN 'CASH'   THEN 'cash'
               ELSE 'cash'
             END
           ) AS v
    FROM public.payment_methods m, norm n
    WHERE m.id = n.v
  )
  SELECT coalesce(
    (SELECT v FROM direct),
    (SELECT v FROM via_catalog),
    -- Only an id the catalogue does not know at all reaches here. A cashier
    -- cannot take money on a method we cannot identify, so this is deliberately
    -- the honest generic tender rather than NULL on an invoice column.
    'cash'
  );
$$;

COMMENT ON FUNCTION public.payment_method_legacy_id(text) IS
  'يحوّل معرّف الكتالوج إلى القيمة التي يفهمها عمود payment_method. يقرأ legacy_id أولاً لدعم الطرق التي أنشأتها المنشأة.';

-- 5.1 `payment_method_ledger_account` resolves through
--     `payment_method_resolve_id`, which is unchanged and already handles a
--     tenant id. Re-asserted here so a reader of THIS file can see the whole
--     path without opening the previous migration.
CREATE OR REPLACE FUNCTION public.payment_method_ledger_account(p_stored text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- آجل is checked FIRST, before any guidance code. A credit sale collects
    -- nothing, so there is no cash or bank line to write — and the catalogue
    -- seed gives the credit row a default_account_code ('1211') as guidance for
    -- the RECEIVABLE account. Letting that code win would post a bank/cash
    -- movement for money that was never received.
    WHEN m.ledger_kind = 'CREDIT' THEN NULL
    -- Explicit guidance on the catalogue row wins for every real tender.
    WHEN m.default_account_code IS NOT NULL THEN m.default_account_code
    WHEN m.ledger_kind IN ('BANK','WALLET','CARD') THEN '1111'
    WHEN m.ledger_kind = 'CASH'   THEN '1101'
    ELSE '1101'
  END
  FROM public.payment_methods m
  WHERE m.id = public.payment_method_resolve_id(p_stored);
$$;

-- ---------------------------------------------------------------------------
-- 6. The reporting view must expose the new columns, because the settings
--    screen edits names and icons and the reports label historic documents.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.payment_method_catalog_view();

CREATE OR REPLACE FUNCTION public.payment_method_catalog_view()
RETURNS TABLE (
  id                   text,
  name_ar              text,
  name_en              text,
  icon_key             text,
  ledger_kind          text,
  default_account_code text,
  is_credit_term       boolean,
  is_active            boolean,
  sort_order           integer,
  allowed_contexts     text[],
  legacy_id            text,
  is_system            boolean,
  requires_reference   boolean,
  enabled              boolean,
  effective_sort_order integer,
  effective_contexts   text[],
  is_configured        boolean,
  is_renamed           boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name_ar,
    m.name_en,
    m.icon_key,
    m.ledger_kind,
    m.default_account_code,
    m.is_credit_term,
    m.is_active,
    m.sort_order,
    m.allowed_contexts,
    m.legacy_id,
    m.is_system,
    m.requires_reference,
    coalesce(s.enabled, true),
    coalesce(s.sort_order, m.sort_order),
    CASE
      WHEN coalesce(cardinality(s.enabled_contexts), 0) > 0
        THEN s.enabled_contexts
      ELSE m.allowed_contexts
    END,
    (s.payment_method_id IS NOT NULL),
    -- A developer row whose label no longer matches the shipped Arabic name.
    -- Reported so the settings screen can show "معدّلة" and offer a reset,
    -- which is the honest alternative to silently losing the original.
    --
    -- Compared against the stored shipped label, not against the row itself —
    -- comparing a row to itself is always false, which is what made this flag
    -- dead on arrival (MIGRATION_16_REVIEW.md §3). COALESCE keeps a tenant row
    -- (NULL shipped name) reporting false.
    (m.is_system AND m.shipped_name_ar IS NOT NULL
     AND m.name_ar IS DISTINCT FROM m.shipped_name_ar)
  FROM public.payment_methods m
  LEFT JOIN public.payment_method_settings s ON s.payment_method_id = m.id
  ORDER BY coalesce(s.sort_order, m.sort_order), m.id;
$$;

COMMENT ON FUNCTION public.payment_method_catalog_view() IS
  'عرض موحّد لطرق الدفع مع تخصيص المنشأة والأسماء المعدّلة، لاستخدامه في التقارير والإعدادات دون خرائط محلية.';

REVOKE ALL ON FUNCTION public.payment_method_catalog_view() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_method_catalog_view() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. The seed refreshes developer rows only — HOW TO DO IT CORRECTLY
--
--    `ON CONFLICT DO UPDATE` in 20261208000000 reset name_ar / icon_key on
--    every re-apply, so a future migration that re-runs that seed would
--    overwrite every rename a business had made.
--
--    The seed there is a static `VALUES` list, and PostgreSQL gives an
--    `ON CONFLICT DO UPDATE` no way to reference the row's OLD value —
--    `EXCLUDED` is the incoming tuple, `payment_methods.*` is the existing one,
--    and there is no `OLD` in this context. So the fix is not a cleverer SET
--    expression: it is to write the refreshed seed into a TEMP table first and
--    merge from it, where the existing row is an ordinary join target.
--
--    The recipe the next migration should follow is below, commented rather
--    than executed, because changing the seed's CONTENT is not this file's job:
--
--      CREATE TEMP TABLE seed_pm ON COMMIT DROP AS
--        SELECT * FROM (VALUES
--          ('cash', 'نقداً', 'Cash', 'cash', 10, ...),
--          ('cheque', 'شيك', 'Cheque', 'cheque', 120, ...)
--        ) AS t(id, name_ar, name_en, icon_key, sort_order, ...);
--
--      -- 7.1 Rows the business renamed keep their authoring.
--      UPDATE public.payment_methods m
--         SET sort_order   = s.sort_order,
--             allowed_contexts = s.allowed_contexts,
--             ledger_kind  = s.ledger_kind,
--             default_account_code = s.default_account_code,
--             requires_reference   = s.requires_reference,
--             legacy_id    = s.legacy_id,
--             legacy_ids   = s.legacy_ids,
--             updated_at   = now()
--        FROM seed_pm s
--       WHERE m.id = s.id
--         AND m.is_system
--         AND EXISTS (SELECT 1 FROM public.payment_method_settings st
--                      WHERE st.payment_method_id = m.id
--                        AND st.updated_by_platform = false
--                        AND m.updated_at > m.created_at);
--
--      -- 7.2 Rows nobody personalised get the shipped label back.
--      UPDATE public.payment_methods m
--         SET name_ar = s.name_ar, name_en = s.name_en, icon_key = s.icon_key,
--             sort_order = s.sort_order, allowed_contexts = s.allowed_contexts,
--             ledger_kind = s.ledger_kind, legacy_id = s.legacy_id,
--             legacy_ids = s.legacy_ids, updated_at = now()
--        FROM seed_pm s
--       WHERE m.id = s.id AND m.is_system
--         AND NOT EXISTS (SELECT 1 FROM public.payment_method_settings st
--                          WHERE st.payment_method_id = m.id
--                            AND st.updated_by_platform = false
--                            AND m.updated_at > m.created_at);
--
--      -- 7.3 Anything new in the seed.
--      INSERT INTO public.payment_methods (id, name_ar, ...)
--      SELECT s.* FROM seed_pm s
--      WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods m WHERE m.id = s.id);
--
--    `is_system`, `id` and `ledger_kind` are never taken from a tenant, and
--    `updated_by_platform = true` marks an edit the platform made itself, so
--    the platform can correct its own row without freezing it forever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payment_methods_seed_is_identity_owned(p_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payment_methods m
    JOIN public.payment_method_settings s ON s.payment_method_id = m.id
    WHERE m.id = p_id
      AND s.updated_by_platform = false
      AND s.payment_method_id IS NOT NULL
      AND m.is_system
      -- Only a row the business actually touched counts as authored.
      AND m.updated_at > m.created_at
  );
$$;

COMMENT ON FUNCTION public.payment_methods_seed_is_identity_owned(text) IS
  'هل عدّلت المنشأة اسم/أيقونة هذه الطريقة؟ يستخدمه الـSeed لاحقاً ليحترم التعديل؛ الترحيلات التي تزرع لا تضرب صفوف المنشأة.';

REVOKE ALL ON FUNCTION public.payment_methods_seed_is_identity_owned(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_methods_seed_is_identity_owned(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Verify the invariants this file claims, and fail loudly if any is broken.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad integer;
  v_repaired integer;
BEGIN
  -- ── 8.1 Repair any row whose legacy_id disagrees with its account family ──
  --
  -- A named institution (بنك الكريمي، جيب) ships with an EMPTY legacy list
  -- because it shares the generic bank_transfer / mobile_money value. When the
  -- backfill in section 1 ran on a database where that list was empty, an older
  -- version of this file could leave legacy_id as the 'cash' floor — which
  -- repoints a bank onto the till. Re-derive it from the ledger kind here, which
  -- is the family the posting engine already trusts, so the invariant below is
  -- restored rather than merely asserted.
  --
  -- ⚠️ The WHERE is the whole point. It must match the CORRUPT value, not an
  --    "invalid" one. 'cash' is a perfectly valid ENUM value, so the old
  --    `coalesce(legacy_id,'') NOT IN (…)` predicate never matched a bank row
  --    that had been wrongly stored as 'cash' — the repair was written, ran,
  --    printed success, and changed nothing (MIGRATION_16_REVIEW.md §2.3 ب).
  --    Comparing against the derived value instead makes the row match by
  --    definition whenever it is wrong. Rows whose family cannot produce a
  --    value, and rows whose declared value already agrees, are left untouched.
  UPDATE public.payment_methods
     SET legacy_id = CASE ledger_kind
                       WHEN 'BANK'   THEN 'bank_transfer'
                       WHEN 'WALLET' THEN 'mobile_money'
                       WHEN 'CARD'   THEN 'card'
                       WHEN 'CREDIT' THEN 'credit'
                       WHEN 'CASH'   THEN 'cash'
                       ELSE legacy_id
                     END,
         updated_at = now()
   WHERE ledger_kind IN ('BANK','WALLET','CARD','CREDIT','CASH')
     -- legacy_ids[1] is the row's own explicit declaration and always wins; a
     -- named institution carries an empty list, so the family answers for it.
     AND coalesce(nullif(legacy_ids[1], ''), 'cash') <> CASE ledger_kind
                       WHEN 'BANK'   THEN 'bank_transfer'
                       WHEN 'WALLET' THEN 'mobile_money'
                       WHEN 'CARD'   THEN 'card'
                       WHEN 'CREDIT' THEN 'credit'
                       ELSE 'cash'
                     END
     AND legacy_id IS DISTINCT FROM CASE ledger_kind
                       WHEN 'BANK'   THEN 'bank_transfer'
                       WHEN 'WALLET' THEN 'mobile_money'
                       WHEN 'CARD'   THEN 'card'
                       WHEN 'CREDIT' THEN 'credit'
                       ELSE 'cash'
                     END;

  GET DIAGNOSTICS v_repaired = ROW_COUNT;
  IF v_repaired > 0 THEN
    RAISE NOTICE '↩️ أُعيد اشتقاق القيمة المخزّنة لـ % طريقة من عائلة حسابها', v_repaired;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.payment_methods
  WHERE legacy_id IS NULL
     OR legacy_id NOT IN ('cash','card','bank_transfer','credit','mobile_money','split','cheque');

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'FAIL: % صفاً في الكتالوج بقيمة مخزّنة غير صالحة', v_bad;
  END IF;

  -- 8.2 Every stored value on a live document must still resolve, exactly as
  --     before. Guarded by EXISTS so a database that has not yet run the
  --     unified catalogue seed does not fail on a row it never received.
  IF EXISTS (SELECT 1 FROM public.payment_methods WHERE id = 'kuraimi_bank')
     AND public.payment_method_legacy_id('kuraimi_bank') <> 'bank_transfer' THEN
    RAISE EXCEPTION 'FAIL: kuraimi_bank -> % (expected bank_transfer)',
      public.payment_method_legacy_id('kuraimi_bank');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_methods WHERE id = 'jaib')
     AND public.payment_method_legacy_id('jaib') <> 'mobile_money' THEN
    RAISE EXCEPTION 'FAIL: jaib -> % (expected mobile_money)',
      public.payment_method_legacy_id('jaib');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_methods WHERE id = 'kuraimi_bank')
     AND public.payment_method_ledger_account('kuraimi_bank') <> '1111' THEN
    RAISE EXCEPTION 'FAIL: kuraimi_bank settles to %',
      public.payment_method_ledger_account('kuraimi_bank');
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_methods WHERE id = 'credit')
     AND public.payment_method_ledger_account('credit') IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: credit must settle to NULL';
  END IF;

  RAISE NOTICE '✅ طبقة التأليف جاهزة: % طريقة، منها % نظامية',
    (SELECT count(*) FROM public.payment_methods),
    (SELECT count(*) FROM public.payment_methods WHERE is_system);
END $$;


COMMIT;
