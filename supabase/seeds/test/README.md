# Test fixtures

Fixtures for automated tests. **Never auto-run**, never run against a customer
database.

A fixture belongs here when its only purpose is to make a test deterministic —
a fixed set of rows a test asserts against, that no real business would want.

```
supabase/seeds/test/
├── README.md          <- this file
└── (add fixtures here)
```

## Rules

1. **Deterministic.** Fixed identifiers, fixed amounts, fixed dates. A test that
   depends on `now()` or a random UUID is not reproducible.
2. **Idempotent.** Every `INSERT` ends with `ON CONFLICT`, so a re-run is safe.
3. **Self-contained.** A fixture creates what it needs and removes what it
   created, so tests can run in any order.
4. **Never touches `reference/` rows.** A fixture that deletes a reference row
   breaks every other test in the suite.

See `supabase/MIGRATIONS_RULES.md` and `supabase/seeds/README.md`.
