-- ============================================================================
-- 05_partners_customers_suppliers.sql
--
-- المخزون وحركاته: الأرصدة، الحركات، طبقات التكلفة، الدفعات، التحويلات، الأرصدة الافتتاحية، التسويات.
--
-- مُستخرج من الحالة النهائية الحقيقية لقاعدة البيانات، لا من تاريخ الملفات.
-- لا يحتوي أي بيانات أعمال أو تجارية. راجع supabase/MIGRATIONS_RULES.md
-- ============================================================================

-- ── TABLES ────────────────────────────────────────────────────────────────
CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  credit_limit numeric(14,2) DEFAULT 0 NOT NULL,
  balance numeric(14,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  loyalty_points numeric DEFAULT 0 NOT NULL
);

CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  balance numeric(14,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_ledger (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  entry_type text NOT NULL,
  debit numeric(14,2) DEFAULT 0 NOT NULL,
  credit numeric(14,2) DEFAULT 0 NOT NULL,
  reference_id uuid,
  reference_type text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  note text,
  source_key text
);

CREATE TABLE public.loyalty_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  points numeric NOT NULL,
  kind text NOT NULL,
  reference_type text,
  reference_id uuid,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ── CONSTRAINTS ───────────────────────────────────────────────────────────
ALTER TABLE public.customers ADD CONSTRAINT "customers_credit_limit_nonnegative" CHECK ((credit_limit >= (0)::numeric));
ALTER TABLE public.customers ADD CONSTRAINT "customers_pkey" PRIMARY KEY (id);
ALTER TABLE public.suppliers ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY (id);
ALTER TABLE public.customer_ledger ADD CONSTRAINT "customer_ledger_check" CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric))));
ALTER TABLE public.customer_ledger ADD CONSTRAINT "customer_ledger_check1" CHECK (((debit + credit) > (0)::numeric));
ALTER TABLE public.customer_ledger ADD CONSTRAINT "customer_ledger_credit_check" CHECK ((credit >= (0)::numeric));
ALTER TABLE public.customer_ledger ADD CONSTRAINT "customer_ledger_debit_check" CHECK ((debit >= (0)::numeric));
ALTER TABLE public.customer_ledger ADD CONSTRAINT "customer_ledger_entry_type_check" CHECK ((entry_type = ANY (ARRAY['sale'::text, 'payment'::text, 'return'::text, 'adjustment'::text, 'credit'::text])));
ALTER TABLE public.customer_ledger ADD CONSTRAINT "customer_ledger_pkey" PRIMARY KEY (id);
ALTER TABLE public.customer_ledger ADD CONSTRAINT "customer_ledger_source_key_key" UNIQUE (source_key);
ALTER TABLE public.loyalty_transactions ADD CONSTRAINT "loyalty_transactions_kind_check" CHECK ((kind = ANY (ARRAY['earn'::text, 'redeem'::text, 'adjust'::text])));
ALTER TABLE public.loyalty_transactions ADD CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY (id);

-- ── INDEXES ───────────────────────────────────────────────────────────────
CREATE INDEX customer_ledger_customer_date_idx ON public.customer_ledger USING btree (customer_id, occurred_at, id);
CREATE INDEX idx_loyalty_customer ON public.loyalty_transactions USING btree (customer_id, created_at DESC);

-- ── SEQUENCES ─────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.stock_adjustment_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.stock_opening_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.stock_transfer_seq START 1;

