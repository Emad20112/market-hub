# Phase 1 Implementation Plan

This is an execution order only. It authorises no implementation until reviewed.

## Ordered work packages

1. **Dictionaries** — transaction types, movement reasons, location types, lot/quality statuses, policy version registry.
2. **Ownership** — universal `material_owners` and compatibility mapping to company/customer/supplier.
3. **Locations** — hierarchical `material_locations`, warehouse references, capacity and mixing policies.
4. **Lots** — `material_lots`, quality inspection, lot lineage, optional legacy batch reference.
5. **Ledger Core** — immutable transaction headers and entries, numbering, posting/reversal state controls.
6. **Projection** — transactionally maintained `material_balance_projection`, rebuild and reconciliation capability.
7. **Outbox** — durable event schema, publisher lease/retry/dead-letter behaviour.
8. **Authorization** — scope and permission primitives plus legacy-role adapter.
9. **Internal Posting API** — validation pipeline, posting transaction boundary, idempotency, locking, audit/outbox integration. No existing UI calls it yet.
10. **Acceptance Tests** — isolated ledger tests, immutability, concurrent availability, reversal, projection rebuild, security, and regression build/tests.

## Delivery discipline

- Each work package is additive and independently reviewed.
- Tests accompany the package before a later package depends on it.
- No milling cutover, sales integration, purchase integration, or production engine is part of Phase 1.
- Rollback is feature disablement and inert added schema; posted test data is reversed, never deleted.

## Required verification after every package

```text
Migration safety check
Build
Relevant acceptance tests
Existing regression tests
Schema/RLS review
No unexpected change to current ERP data or contracts
```
