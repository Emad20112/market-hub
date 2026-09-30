# Market Hub ERP — Architecture Overview

## Purpose

Market Hub is a React/TanStack Start and Supabase/PostgreSQL ERP. It already contains product, inventory, sales, purchase, customer, payment, expense, reporting, subscription, and role concepts. The flour-mill work must extend this ERP without changing the behaviour of those existing domains.

## Adopted architecture

The target architecture is a **Modular Monolith with explicit domain layers**. A modular monolith is intentionally chosen over microservices: the system needs atomic posting across document, inventory, customer ledger, cost, audit, and outbox records. A single PostgreSQL transaction is safer and simpler today; module boundaries and domain events preserve a future extraction path.

```text
Business Documents
  -> Validation Engine
  -> Posting Engine
  -> Material Ledger
  -> Read Models / Projections
  -> Transactional Outbox / Domain Events
  -> Audit
```

## Ten-year design objectives

- One traceable material history across company stock, customer custody, production, and returns.
- Immutable posted material movements; correction occurs through reversal or approved adjustment.
- Ownership, location, lot, quality, and quantity are independent dimensions.
- Existing ERP modules retain their current public behaviour during incremental migration.
- Reports are fast projections rebuildable from the ledger, not mutable operational counters.
- The same core supports milling, later factories, third-party custody, and consignment.

## Non-breaking rules

1. Do not delete, rename, or rewrite production migrations.
2. Do not delete `inventory`, `stock_movements`, sales, purchases, customer ledger, or accounting data.
3. Do not change an existing sales or purchase posting contract in Phase 1.
4. New migrations are additive only until an explicit cutover is approved.
5. No browser screen, feature module, or specialised RPC may update a material balance directly.
6. Existing tables remain compatibility surfaces while the new core is introduced through adapters and shadow posting.

## Scope boundary

The Material Ledger is a platform core. The milling module is its first industrial consumer; it is not the owner of the ledger design. Milling documents express business intent, then use the shared Validation and Posting Engines.

## Status

This documentation records approved architecture decisions and Phase 1 design. It is a design baseline, not implementation evidence.
