-- ============================================================================
-- expense_categories — default expense classification
--
-- The expense form requires a category. These defaults let a new business record
-- its first expense without configuring anything first.
--
-- AUTO-RUN on `supabase db reset`. Idempotent: ON CONFLICT on a real business
-- key, never on a random UUID. See supabase/MIGRATIONS_RULES.md.
-- ============================================================================

BEGIN;

INSERT INTO public.expense_categories (name, name_ar) VALUES
  ('Rent',        'الإيجار'),
  ('Salaries',    'الرواتب'),
  ('Transport',   'المواصلات'),
  ('Utilities',   'الخدمات'),
  ('Maintenance', 'الصيانة'),
  ('Packaging',   'التغليف'),
  ('Internet',    'الإنترنت')
ON CONFLICT (name) DO NOTHING;

COMMIT;
