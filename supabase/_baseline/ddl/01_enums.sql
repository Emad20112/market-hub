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