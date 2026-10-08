# Customer data

A real customer's own data. **This folder is never committed.**

```
supabase/seeds/customer/
├── README.md
└── customer-template.sql.example   <- copy, rename, fill in, keep out of git
```

## Why this folder exists

A new customer needs three things that are **not** schema and **not** demo data:

| What | Where it comes from |
| --- | --- |
| Company identity (name, currency, tax number, logo) | The customer edits it in Settings |
| Opening balances (stock, receivables, payables, cash, capital) | `create_opening_balance()` + `post_opening_balance()` |
| Their product catalogue | Their own import or manual entry |

## The one legitimate use of a file here

Loading a customer's opening balances during onboarding, from data they supply.
Use the RPC, never a raw `INSERT` — the RPC enforces that the entry balances and
writes the stock movements and ledger rows that go with it.

```sql
select public.create_opening_balance(
  _effective_date => '2026-01-01',
  _lines => '[
    {"section":"STOCK",      "product_id":"...", "warehouse_id":"...", "quantity":1000, "unit_cost":250, "amount":250000, "description":"..."},
    {"section":"RECEIVABLE", "customer_id":"...", "amount":50000, "description":"..."},
    {"section":"CAPITAL",    "amount":300000, "description":"رأس المال"}
  ]'::jsonb
);
-- then post it
select public.post_opening_balance('<document-id>');
```

## Rules

1. **Never commit a filled-in file.** Add `seeds/customer/*.sql` to `.gitignore`;
   only the `.example` is tracked.
2. **No passwords or secrets.** Create users through the app or the
   `admin-create-user` edge function.
3. **Never run these against another customer.** They carry one business's
   identity and balances.
4. **Back up first.** Opening balances are baked into every later valuation; a
   wrong one is expensive to unwind.

See `supabase/MIGRATIONS_RULES.md` section R-02 and `supabase/seeds/README.md`.
