# Current System Analysis

## Important current components

| Area | Current assets | Assessment |
|---|---|---|
| Products | `products`, item nature, inventory policy, costing method, tracking | Strong reusable master-data base. |
| Inventory | `inventory`, `stock_movements`, `post_stock_delta` | Useful centralised stock mutation path, but balances are warehouse-level and not location/lot ledger balances. |
| Ownership | `owner_type`, `owner_id`, company/customer position views | Valuable foundation: non-company material is excluded from company valuation. |
| Sales | `sales_invoices`, lines, `create_sale`, customer ledger posting | Must remain behaviourally unchanged. |
| Purchases | purchase invoices and `create_purchase` | Must remain behaviourally unchanged. |
| Finance | customer ledger, payments, expenses, daily closings | Financial ledger remains independent from physical custody. |
| Batch tracking | `product_batches` | Reusable compatibility reference, insufficient as a general industrial lot domain. |
| Milling | `milling_intake_receipts`, jobs, outputs, delivery notes, service invoice RPC | Proof-of-concept custody flow; not a durable material ledger. |
| Security | `user_roles`, RLS, module/subscription UI guards | Server-side scope and approval policies are incomplete. |
| Audit | `audit_logs` | Useful audit substrate; lacks unified correlation across posting, reversal, cost, and events. |

## Current business logic placement

Business rules are currently concentrated in PostgreSQL RPCs such as stock posting, sales, purchases, and milling-specific functions. React screens perform additional client-side validation and then call Supabase RPCs. This is safer than direct browser writes, but validation, posting, invoice construction, and audit are still coupled inside specialised functions.

## What works well

- Product policy distinguishes tracked goods from untracked goods and services.
- `post_stock_delta` locks and updates inventory through a central function.
- Ownership dimensions already exist and company valuation excludes non-company positions.
- Sales service lines can use the existing financial/customer-ledger route.
- Milling records intentionally avoid putting customer grain into company inventory valuation.
- Module registration and feature visibility exist.

## What should be reused

- `products`, `units`, `warehouses`, `customers`, `suppliers`, `inventory`, `stock_movements`, `product_batches`.
- Existing authentication, roles, audit log, sales, purchase, payment, and customer ledger contracts.
- Existing inventory posting function as a future compatibility adapter, not as the final universal ledger.

## What needs refactoring by addition

- A general immutable Material Ledger with location and lot dimensions.
- Posting, validation, reversal, event/outbox, and projection layers.
- Milling balances derived from ledger entries rather than output delivery counters.
- A separate internal production and WIP cost domain.

## Current architectural concerns

- Customer custody and commercial inventory have separate balance models.
- Milling output rows combine production declaration and mutable delivery balance.
- Silo/location is free text rather than a controlled domain entity.
- Quality, lot lineage, WIP, and production cost allocation are absent.
- Dashboard calculations can depend on limited client-side result sets instead of durable projections.
- The current test set has no end-to-end milling or ledger acceptance suite.
- Uncommitted/new milling files and migrations must be reviewed as a coherent release before deployment.
