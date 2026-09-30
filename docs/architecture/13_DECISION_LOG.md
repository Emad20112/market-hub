# Architecture Decision Log

## ADR-001 — Modular Monolith

**Problem:** Industrial posting needs consistent document, material, audit, event, and sometimes finance writes.

**Options:** Microservices; modular monolith.

**Decision:** Modular monolith with explicit module boundaries.

**Reason:** PostgreSQL transaction atomicity is essential now; events preserve future extraction options without distributed transaction complexity.

## ADR-002 — Material Ledger is material truth

**Problem:** Current company inventory and milling custody use different balance models.

**Options:** Continue document counters; separate milling ledger; universal material ledger.

**Decision:** Universal immutable Material Ledger.

**Reason:** It supports ownership, location, lots, reconciliation, reversals, custody, production, and future industrial modules.

## ADR-003 — No microservices now

**Problem:** Eventing and domain boundaries can suggest service decomposition.

**Options:** Immediate service split; internal evented modules.

**Decision:** Internal evented modules and transactional outbox.

**Reason:** Lower operational risk while retaining clean boundaries.

## ADR-004 — Preserve current inventory contracts

**Problem:** Existing ERP modules depend on `inventory`, `stock_movements`, sales, and purchases.

**Options:** Replace them; migrate incrementally through adapters/projections.

**Decision:** Preserve and integrate incrementally.

**Reason:** No breakage of established ERP behaviour is permitted.

## ADR-005 — Transactional Outbox

**Problem:** Projections and downstream modules need reliable post-commit facts.

**Options:** Direct calls; best-effort asynchronous events; transactional outbox.

**Decision:** Transactional outbox.

**Reason:** Prevents lost events and keeps critical posting atomic.

## ADR-006 — Material Owners, not polymorphic entry owner ids

**Problem:** A direct polymorphic `owner_id` cannot have a real foreign key.

**Options:** Polymorphic id; multiple owner columns on entries; universal owner account.

**Decision:** `material_owners` universal account.

**Reason:** Referential integrity, stable ownership policy, and reusable reporting.

## ADR-007 — Posted entries are append-only

**Problem:** Mutable operational counters corrupt historical evidence.

**Options:** Edit posted values; delete/repost; reversal and adjustment.

**Decision:** Reversal and approved adjustment only.

**Reason:** Auditability, reconciliation, and financial integrity.
