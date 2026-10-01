ALTER TABLE public.company_settings
  ALTER COLUMN currency SET DEFAULT 'YER',
  ALTER COLUMN currency_symbol SET DEFAULT 'ر.ي',
  ADD COLUMN IF NOT EXISTS purchase_invoice_prefix text NOT NULL DEFAULT 'PO-',
  ADD COLUMN IF NOT EXISTS invoice_number_period text NOT NULL DEFAULT 'year_month',
  ADD COLUMN IF NOT EXISTS invoice_number_digits smallint NOT NULL DEFAULT 4;

UPDATE public.company_settings
SET currency = 'YER',
    currency_symbol = 'ر.ي'
WHERE name = 'My Company'
  AND currency = 'USD'
  AND currency_symbol = '$'
  AND NOT EXISTS (SELECT 1 FROM public.sales_invoices)
  AND NOT EXISTS (SELECT 1 FROM public.purchase_invoices)
  AND NOT EXISTS (SELECT 1 FROM public.sales_returns)
  AND NOT EXISTS (SELECT 1 FROM public.purchase_returns)
  AND NOT EXISTS (SELECT 1 FROM public.expenses)
  AND NOT EXISTS (SELECT 1 FROM public.expense_entries)
  AND NOT EXISTS (SELECT 1 FROM public.customer_payments);

UPDATE public.company_settings
SET currency = 'YER'
WHERE currency IS NULL OR btrim(currency) = '';

UPDATE public.company_settings
SET currency_symbol = CASE currency
  WHEN 'YER' THEN 'ر.ي'
  WHEN 'SAR' THEN 'ر.س'
  WHEN 'USD' THEN '$'
  WHEN 'EUR' THEN '€'
  WHEN 'GBP' THEN '£'
  ELSE currency
END
WHERE currency_symbol IS NULL OR btrim(currency_symbol) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_settings_invoice_number_period_check'
      AND conrelid = 'public.company_settings'::regclass
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_invoice_number_period_check
      CHECK (invoice_number_period IN ('none', 'year', 'year_month'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_settings_invoice_number_digits_check'
      AND conrelid = 'public.company_settings'::regclass
  ) THEN
    ALTER TABLE public.company_settings
      ADD CONSTRAINT company_settings_invoice_number_digits_check
      CHECK (invoice_number_digits BETWEEN 1 AND 8);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_period_format TEXT;
  v_period TEXT;
  v_digits INTEGER;
  v_number BIGINT;
  v_number_text TEXT;
BEGIN
  SELECT
    NULLIF(trim(both '-' FROM btrim(invoice_prefix)), ''),
    COALESCE(invoice_number_period, 'year_month'),
    GREATEST(1, LEAST(COALESCE(invoice_number_digits, 4), 8))
  INTO v_prefix, v_period_format, v_digits
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, 'INV');
  v_period := CASE v_period_format
    WHEN 'year' THEN to_char(now(), 'YYYY')
    WHEN 'year_month' THEN to_char(now(), 'YYYYMM')
    ELSE NULL
  END;
  v_number := nextval('public.sales_invoice_seq');
  v_number_text := CASE
    WHEN length(v_number::TEXT) < v_digits THEN lpad(v_number::TEXT, v_digits, '0')
    ELSE v_number::TEXT
  END;

  RETURN concat_ws('-', v_prefix, v_period, v_number_text);
END $$;

CREATE OR REPLACE FUNCTION public.next_purchase_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_period_format TEXT;
  v_period TEXT;
  v_digits INTEGER;
  v_number BIGINT;
  v_number_text TEXT;
BEGIN
  SELECT
    NULLIF(trim(both '-' FROM btrim(purchase_invoice_prefix)), ''),
    COALESCE(invoice_number_period, 'year_month'),
    GREATEST(1, LEAST(COALESCE(invoice_number_digits, 4), 8))
  INTO v_prefix, v_period_format, v_digits
  FROM public.company_settings
  ORDER BY id
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, 'PO');
  v_period := CASE v_period_format
    WHEN 'year' THEN to_char(now(), 'YYYY')
    WHEN 'year_month' THEN to_char(now(), 'YYYYMM')
    ELSE NULL
  END;
  v_number := nextval('public.purchase_invoice_seq');
  v_number_text := CASE
    WHEN length(v_number::TEXT) < v_digits THEN lpad(v_number::TEXT, v_digits, '0')
    ELSE v_number::TEXT
  END;

  RETURN concat_ws('-', v_prefix, v_period, v_number_text);
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  3145728,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Company logos are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

CREATE POLICY "Owners and managers can upload company logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'manager')
    )
  );