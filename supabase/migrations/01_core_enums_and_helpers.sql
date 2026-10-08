-- ============================================================================
-- 01_core_enums_and_helpers.sql
--
-- الأساس: أنواع ENUM + الدوال المساعدة التي تعتمد عليها كل السياسات (is_staff, has_role, is_platform_admin, tg_set_updated_at).
-- لا جداول هنا — كل شيء لاحق يعتمد على هذا الملف.
--
-- مُستخرج من الحالة النهائية الحقيقية لقاعدة البيانات، لا من تاريخ الملفات.
-- لا يحتوي أي بيانات أعمال أو تجارية. راجع supabase/MIGRATIONS_RULES.md
-- ============================================================================

-- ── ENUMS ──────────────────────────────────────────────────────────────
CREATE TYPE public.account_type AS ENUM (
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE'
);

CREATE TYPE public.app_role AS ENUM (
  'owner',
  'manager',
  'accountant',
  'cashier',
  'warehouse'
);

CREATE TYPE public.costing_method AS ENUM (
  'MOVING_AVERAGE',
  'FIFO',
  'STANDARD',
  'NONE'
);

CREATE TYPE public.expense_entry_type AS ENUM (
  'DIRECT',
  'EMPLOYEE',
  'SUPPLIER',
  'RECURRING',
  'ADVANCE'
);

CREATE TYPE public.expense_payee_type AS ENUM (
  'NONE',
  'SUPPLIER',
  'EMPLOYEE',
  'OTHER'
);

CREATE TYPE public.expense_source_kind AS ENUM (
  'MANUAL',
  'LEGACY',
  'RECURRING',
  'IMPORT'
);

CREATE TYPE public.expense_status AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'POSTED',
  'PARTIALLY_PAID',
  'PAID',
  'CLOSED',
  'CANCELLED',
  'REVERSED'
);

CREATE TYPE public.expense_tax_mode AS ENUM (
  'NONE',
  'INCLUSIVE',
  'EXCLUSIVE'
);

CREATE TYPE public.inventory_policy AS ENUM (
  'TRACKED',
  'UNTRACKED',
  'CUSTOMER_OWNED'
);

CREATE TYPE public.invoice_status AS ENUM (
  'draft',
  'confirmed',
  'paid',
  'partial',
  'cancelled',
  'returned',
  'received',
  'completed',
  'unpaid'
);

CREATE TYPE public.item_class AS ENUM (
  'RAW_MATERIAL',
  'FINISHED_GOOD',
  'BY_PRODUCT',
  'SERVICE',
  'NON_STOCK_ITEM',
  'PACKAGING'
);

CREATE TYPE public.item_nature AS ENUM (
  'GOOD',
  'SERVICE'
);

CREATE TYPE public.item_status AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

CREATE TYPE public.item_tracking AS ENUM (
  'NONE',
  'BATCH',
  'SERIAL'
);

CREATE TYPE public.milling_output_type AS ENUM (
  'FLOUR_GRADE_1',
  'FLOUR_GRADE_2',
  'BRAN',
  'SEMOLINA',
  'WASTE'
);

CREATE TYPE public.milling_status AS ENUM (
  'DRAFT',
  'RECEIVED',
  'PROCESSING',
  'COMPLETED',
  'DELIVERED',
  'CANCELLED'
);

CREATE TYPE public.movement_type AS ENUM (
  'purchase',
  'sale',
  'adjustment',
  'transfer_in',
  'transfer_out',
  'return_in',
  'return_out',
  'opening',
  'purchase_return',
  'sale_return'
);

CREATE TYPE public.owner_type AS ENUM (
  'COMPANY',
  'CUSTOMER',
  'SUPPLIER',
  'OTHER'
);

CREATE TYPE public.payment_method AS ENUM (
  'cash',
  'card',
  'bank_transfer',
  'credit',
  'mobile_money',
  'split'
);

CREATE TYPE public.stock_movement_kind AS ENUM (
  'RECEIPT',
  'ISSUE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT',
  'OPENING',
  'PRODUCTION'
);

-- ── PURE HELPERS ───────────────────────────────────────────────────
-- No table and no other function dependency, so they are safe here and
-- available to every later file. Emission follows the dependency order.
CREATE OR REPLACE FUNCTION public.expense_round(p_value numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- Numeric, not float: 0.005 must round the way the accountant expects and
  -- SUM() over a million rows must not accumulate binary drift.
  SELECT round(coalesce(p_value, 0)::numeric, 2)
$function$;

CREATE OR REPLACE FUNCTION public.expense_line_net(p_gross numeric, p_tax_rate numeric, p_mode expense_tax_mode)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_gross IS NULL THEN NULL
    WHEN p_tax_rate IS NULL OR p_tax_rate <= 0 THEN public.expense_round(p_gross)
    WHEN p_mode = 'EXCLUSIVE' THEN public.expense_round(p_gross)
    ELSE public.expense_round(p_gross / (1 + (p_tax_rate / 100)))
  END
$function$;

CREATE OR REPLACE FUNCTION public.expense_line_tax(p_gross numeric, p_tax_rate numeric, p_mode expense_tax_mode)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_gross IS NULL THEN NULL
    WHEN p_tax_rate IS NULL OR p_tax_rate <= 0 THEN 0::numeric
    ELSE public.expense_round(p_gross - public.expense_line_net(p_gross, p_tax_rate, p_mode))
  END
$function$;
