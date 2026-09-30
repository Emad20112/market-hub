# Migration Roadmap

## Phase 0 — Analysis and approval

**Goal:** approve architecture, invariants, transition boundaries, and acceptance gates.

**Risk:** premature implementation against unapproved policies.

**Exit:** this architecture package and Phase 1 technical specification approved.

## Phase 1 — Foundation, add only

**Goal:** introduce core dictionaries, owners, locations, lots, ledger, projection, outbox, authorisation primitives, and internal posting contracts without changing ERP behaviour.

**Risk:** unused infrastructure or accidental coupling.

**Exit:** isolated acceptance suite passes; no existing module behaviour changes.

## Phase 2 — Shadow posting

**Goal:** current milling flow remains authoritative while equivalent ledger entries are produced and reconciled.

**Risk:** divergence between old and new balances.

**Exit:** approved reconciliation has no unexplained differences for an agreed observation period.

## Phase 3 — Milling custody cutover

**Goal:** new milling receipts, operations, losses, and deliveries post to ledger; custody read models become official.

**Risk:** operational adoption and historical cutover.

**Exit:** physical stock-take, customer custody balances, and ledger projections reconcile.

## Phase 4 — Production and cost

**Goal:** add recipes, production orders, company WIP, overheads, output cost allocation, and finished-goods lots.

**Risk:** incorrect WIP valuation or COGS.

**Exit:** pilot product cost reconciles to source materials and overhead policy.

## Phase 5 — Reporting and reconciliation

**Goal:** reporting projections, silo stock-take, aging, yield, WIP, cost, closing, and operations monitoring.

**Risk:** reporting drift or expensive queries.

**Exit:** projections are rebuildable and reconcile with ledger under scheduled controls.

## Global transition safeguards

- Feature flags by module/entity.
- No destructive migration.
- No old migration rewrite.
- Build and test after every phase.
- Formal data reconciliation gate before every cutover.
