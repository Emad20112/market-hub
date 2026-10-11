-- ==========================================================
-- 20260926000000_update_superadmin_password.sql
-- Update the superadmin (mousa.mc13@gmail.com) password to
-- the current value after 20260916000000 already ran.
-- ==========================================================

-- pgcrypto lives in the "extensions" schema on this project, so qualify
-- crypt()/gen_salt() explicitly (they are no longer search_path-visible).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE auth.users
SET encrypted_password = extensions.crypt(
      'Mm0534035aborak'::text,
      extensions.gen_salt('bf'::text)
    ),
    updated_at = now()
WHERE LOWER(email) = 'mousa.mc13@gmail.com';
