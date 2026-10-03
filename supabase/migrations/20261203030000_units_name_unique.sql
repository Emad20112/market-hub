-- ============================================================================
-- 20261203030000_units_name_unique.sql
--
-- Adds the missing uniqueness guarantee on public.units(name), and makes the
-- seed files able to rely on it.
--
-- THE BUG THIS FIXES
-- ------------------
-- `units` was created in 20260621011940 with:
--
--     name text NOT NULL
--
-- and no unique constraint. `expense_categories` (20260622160803) has
-- `name TEXT NOT NULL UNIQUE`. Both are seeded by supabase/seeds/reference.sql
-- with:
--
--     INSERT INTO public.units (name, short_name, name_ar) VALUES ...
--     ON CONFLICT (name) DO NOTHING;
--
-- For `expense_categories` that ON CONFLICT is a real guard. For `units` it is
-- NOT: with no unique index on (name), there is no conflict target, so every
-- `supabase db reset` inserts a second copy of every starter unit. The seed
-- reports success while the table silently accumulates duplicates — the same
-- "the same row written twice" shape that produced
--
--     duplicate key value violates unique constraint "company_settings_pkey"
--
-- when two seed files wrote the same rows under different conflict keys.
--
-- 20260930120100_milling_master_data_and_engines.sql already worked around this
-- in SQL with a NOT EXISTS guard, and says so in a comment:
--
--     `units` في هذا المخطط لا يحمل قيداً فريداً على `name` ...
--     لذا لا يمكن الاعتماد على ON CONFLICT هنا
--
-- A workaround in one migration is not a fix. The constraint belongs on the
-- table, where every future writer benefits from it.
--
-- SAFETY / IDEMPOTENCE
-- --------------------
--   * The constraint is added only if it does not already exist.
--   * Duplicate rows are merged BEFORE the constraint is added, otherwise the
--     ALTER would fail on any database that already accumulated copies.
--   * The survivor of each duplicate group is the OLDEST row (smallest
--     created_at, then smallest id) — the one most likely to be referenced.
--     Nothing in this schema has a foreign key to units(id) yet except
--     milling_unit_conversions, which is remapped explicitly below.
--   * Matching is on trimmed, case-insensitive name so that 'Piece' and 'piece'
--     do not survive as separate rows.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Merge duplicate units, keeping one row per normalized name.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE unit_merge_map (old_id uuid PRIMARY KEY, keep_id uuid NOT NULL) ON COMMIT DROP;

INSERT INTO unit_merge_map (old_id, keep_id)
SELECT u.id, k.keep_id
FROM public.units u
JOIN (
  SELECT lower(btrim(name)) AS key, (array_agg(id ORDER BY created_at, id))[1] AS keep_id
  FROM public.units
  GROUP BY lower(btrim(name))
) k ON k.key = lower(btrim(u.name))
WHERE u.id <> k.keep_id;

-- Repoint dependants before deleting the duplicates. Guarded so the migration
-- still runs on a database where the milling tables do not exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'milling_unit_conversions'
  ) THEN
    -- A duplicate unit that carries a conversion row: move the row onto the
    -- survivor, dropping the duplicate's row if the survivor already has one.
    DELETE FROM public.milling_unit_conversions c
    USING unit_merge_map m
    WHERE c.unit_id = m.old_id
      AND EXISTS (SELECT 1 FROM public.milling_unit_conversions s WHERE s.unit_id = m.keep_id);

    UPDATE public.milling_unit_conversions c
    SET unit_id = m.keep_id
    FROM unit_merge_map m
    WHERE c.unit_id = m.old_id;
  END IF;
END $$;

DELETE FROM public.units u USING unit_merge_map m WHERE u.id = m.old_id;

-- ---------------------------------------------------------------------------
-- 2. Add the constraint, only if absent.
--
--    UNIQUE (name) — not a functional index on lower(btrim(name)) — because the
--    seed files and 20260930120100 both conflict on the raw `name` column. A
--    functional index would not be a valid ON CONFLICT target for them.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.units'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.units'::regclass AND attname = 'name')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.units ADD CONSTRAINT units_name_key UNIQUE (name);
    RAISE NOTICE 'units_name_unique: added UNIQUE (name) on public.units';
  ELSE
    RAISE NOTICE 'units_name_unique: UNIQUE (name) on public.units already present';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Re-assert the starter rows idempotently.
--
--    Safe now that the constraint exists. This also repairs a database where
--    the merge above removed a name that the seed expects to be present.
-- ---------------------------------------------------------------------------
INSERT INTO public.units (name, short_name, name_ar) VALUES
  ('Piece',   'pc', 'قطعة'),
  ('Pack',    'pk', 'حزمة'),
  ('Box',     'bx', 'علبة'),
  ('Ream',    'rm', 'رزمة'),
  ('Set',     'st', 'طقم'),
  ('Kilogram','kg', 'كيلوجرام'),
  ('Litre',   'L',  'لتر'),
  ('Metre',   'm',  'متر')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- 4. Document the rule so the next writer does not repeat the mistake.
-- ---------------------------------------------------------------------------
COMMENT ON CONSTRAINT units_name_key ON public.units IS
  'A unit name is a natural business key: it is the ON CONFLICT target used by '
  'supabase/seeds/reference.sql and by 20260930120100. Without this constraint '
  'those seeds inserted a duplicate row on every reset instead of skipping.';