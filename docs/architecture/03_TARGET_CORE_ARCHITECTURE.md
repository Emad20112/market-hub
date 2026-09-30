# Target Core Architecture

## Layer model

```text
Presentation
  -> Application / Business Document Layer
  -> Security & Authorization
  -> Validation Engine
  -> Posting Engine
  -> Material Ledger + Cost/Finance adapters
  -> Transactional Outbox
  -> Read Models and Audit
```

## Layer responsibilities

| Layer | Owns | Must not own |
|---|---|---|
| Document Layer | drafts, workflow, approvals, document fields | material balances |
| Validation Engine | reusable business policy checks | UI rendering or balance mutation |
| Posting Engine | atomic posting orchestration | report queries or presentation rules |
| Material Ledger Engine | immutable physical transaction entries | tax, selling price, customer receivable |
| Cost Engine | WIP, costs, allocation, output cost | custody quantity ownership decisions |
| Read Models | query-optimised projections | business truth or direct writes |
| Event Bus | publish completed domain facts | critical posting outside the transaction |
| Audit Layer | actor, reason, correlation, approvals | replace ledger evidence |

## Dependency direction

Documents depend on Posting/Validation contracts. Posting depends on Ledger, Audit, Projection, and Outbox contracts. Projections and event consumers depend on posted events. No report, UI, or milling document writes a balance directly.

## Modular Monolith boundaries

```text
core-material      locations, owners, lots, ledger, validation, posting
core-security      scopes, permissions, approvals
core-events        outbox and consumer contracts
core-audit         correlation and immutable operational audit
core-finance       existing sales/purchases/customer-ledger plus adapters
milling            intake, quality, toll operations, custody delivery
manufacturing      recipe, production, WIP, cost allocation
reporting          projections, reconciliation, dashboards
```

Modules communicate through internal contracts and domain events, not by directly changing each other's tables.

## Why not microservices

Milling posting commonly requires a document state, material entries, balance update, audit row, financial reference, and outbox record to succeed atomically. Splitting this prematurely into networked services would add distributed-transaction failure modes without a current scaling benefit. The modular boundaries and event contracts permit future extraction if it becomes justified.
