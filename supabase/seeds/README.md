# Seed files

Two very different kinds of data live in this folder. Mixing them is what broke
`supabase db reset` with:

```
Seeding data from supabase/seeds/seed.sql...
ERROR: duplicate key value violates unique constraint "company_settings_pkey" (SQLSTATE 23505)
```

That happened because the auto-run seed (`seed.sql`) contained reference rows,
demo business rows **and** `auth.users` rows at the same time, while
`reference.sql` inserted the same reference rows under a different conflict key.
The two files collided, and the whole seed transaction aborted.

## Layout

```
supabase/seeds/
├── README.md              <- this file
├── reference/             <- AUTO-RUN. The system cannot start without these.
│   ├── 01_platform_modules.sql
│   ├── 02_platform_plans.sql
│   ├── 03_chart_of_accounts.sql
│   ├── 04_units.sql
│   ├── 05_expense_categories.sql
│   └── 06_milling_reference.sql
├── demo/                  <- NEVER AUTO-RUN. One business's fabricated data.
│   ├── accounts.sql             <- demo staff accounts (run FIRST)
│   ├── wholesale-retail.sql     <- grocery / wholesale + retail dataset
│   ├── stationery.sql           <- office-supplies dataset
│   ├── stationery-legacy.sql    <- superseded variant, reference only
│   ├── mill-catalog.sql         <- mill product families (moved out of migrations)
│   ├── mill-products.sql        <- mill products (moved out of migrations)
│   ├── warehouses.sql           <- warehouse rows (moved out of migrations)
│   └── customers.sql            <- customer rows (moved out of migrations)
├── test/                  <- NEVER AUTO-RUN. Fixtures for automated tests.
└── customer/              <- NEVER COMMITTED. A real customer's own data.
```

## The boundary — one question decides it

> **Can any new customer run the system without this row?**

| Answer | Where it goes |
| --- | --- |
| No — the code resolves it by a fixed key | `reference/` |
| It is useful only for a product demo | `demo/` |
| It exists to make an automated test deterministic | `test/` |
| It belongs to one real business | `customer/` (never committed) |

### Why `accounts` is reference but `products` is not

The posting functions contain account codes as literals — `'1211'`, `'4111'`,
`'5111'`. A missing account makes every posting that touches it fail, so the
chart is structure. A product catalogue describes what one business happens to
sell, so it is not.

## What runs automatically

`supabase/config.toml` wires **only** the files under `./seeds/reference/`:

```toml
[db.seed]
enabled = true
sql_paths = ["./seeds/reference/*.sql"]
```

Files in `reference/` may contain only rows the application cannot function
without, and every statement must be idempotent:

| Allowed                               | Forbidden                                |
| ------------------------------------- | ---------------------------------------- |
| `platform_modules`, `platform_plans`  | Products, customers, suppliers, invoices |
| `accounts` (the chart of accounts)    | `warehouses` (a physical location)       |
| Default `units`, `expense_categories` | `auth.users`, `profiles`, `user_roles`   |
| Milling lookups resolved by code      | `company_settings` (customer identity)   |

Company identity is a setting each customer edits in the app. It must never
arrive from a migration or a seed.

## Running a demo dataset

Demo datasets are opt-in and are **never** executed by `supabase db reset`.
Run them in this order, on a local or throwaway project only:

```bash
# 1. accounts first — demo transactions carry created_by / actor_id FKs to these ids
psql "$DATABASE_URL" -f supabase/seeds/demo/accounts.sql

# 2. then exactly one dataset
psql "$DATABASE_URL" -f supabase/seeds/demo/wholesale-retail.sql   # grocery
psql "$DATABASE_URL" -f supabase/seeds/demo/stationery.sql         # office supplies
```

Or paste the file into Supabase Studio → SQL Editor and press Run.

> Never run a file from `demo/` against a customer database. It writes fabricated
> invoices into their books and, for the datasets that touch `company_settings`,
> their company identity.

## Rules for demo files

1. **Idempotent.** Every `INSERT` ends with `ON CONFLICT`, so re-running is safe.
2. **Never overwrite identity.** `company_settings` uses `ON CONFLICT (id) DO
NOTHING`, not `DO UPDATE`.
3. **Key shared rows on the business key.** `units` and `expense_categories` are
   also written by `reference.sql`, so they conflict on `(name)` — a UUID-keyed
   conflict would create duplicate rows instead of detecting the collision.
4. **Wrap in `BEGIN` / `COMMIT`.** A failure then leaves nothing behind.
5. **No working credentials.** Demo accounts carry a NULL password hash and no
   `auth.identities` row, so they cannot sign in.

## Which dataset do I want?

| Dataset                      | Contents                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| `demo/wholesale-retail.sql`  | Groceries, beverages, consumer goods; wholesale + retail pricing  |
| `demo/stationery.sql`        | 56 office-supply items, 20 customers, purchases, sales, transfers |
| `demo/stationery-legacy.sql` | The pre-fix stationery dataset. Not idempotent — reference only.  |

All datasets leave `created_by` / `actor_id` NULL unless you ran
`demo/accounts.sql` first.
