-- Central Company Profile fields used by the unified printing platform.
-- All fields are nullable for compatibility with existing tenants and seeds.
alter table public.company_settings
  add column if not exists name_ar text,
  add column if not exists name_en text,
  add column if not exists contact_numbers text,
  add column if not exists footer_contact text,
  add column if not exists footer_text text;

comment on column public.company_settings.footer_contact is
  'Editable contact value rendered by the universal document footer';
comment on column public.company_settings.footer_text is
  'Optional editable footer note for printed documents';
