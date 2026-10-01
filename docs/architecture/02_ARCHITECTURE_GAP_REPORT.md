# Architecture Gap Report

## Primary gap: no universal Material Ledger

The ERP has `stock_movements` and ownership dimensions, but no general append-only transaction/entry model that records product, owner, lot, physical location, and external endpoints together. The mill therefore introduced a parallel custody model. The target is one material truth with different ownership and valuation policies.

## Multiple sources of truth

- Company positions are maintained in `inventory` and backed by `stock_movements`.
- Milling custody is inferred from intake, job, output, and delivery tables.
- Delivery quantities are stored as mutable counters in `milling_job_outputs`.

This makes reconciliation, correction, returns, mixed lots, and silo inventory difficult. A posted document must not itself be the mutable balance holder.

## Missing domains

| Domain      | Gap                                                 | Consequence                                                  |
| ----------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Locations   | Warehouse only; silo is text                        | No capacity, mixing, or location-level authorisation.        |
| Lots        | No general lot lineage/quality relation             | Weak traceability and no controlled blending/splitting.      |
| Quality     | Moisture/impurity fields only                       | No acceptance, hold, rejection, release, or quality policy.  |
| Reversal    | Cancellation status without full reversal lifecycle | Postings can become hard to correct safely.                  |
| Events      | No transactional outbox                             | Reports and downstream modules are tightly coupled or stale. |
| Projections | Views/client aggregation                            | Scale and report correctness risks.                          |
| Production  | No WIP/BOM/cost allocation engine                   | Internal flour cost and COGS cannot be proven.               |

## Current milling-specific risks

- Loss is represented close to product outputs, although loss must be a separately classified movement.
- Bag/weight operations do not fully support bulk, fractional residuals, and controlled discrepancy handling.
- A mill-supplied packaging decision can be separated from physical/financial completion unless enforced by posting policy.
- Customer statement aggregation and multi-location reporting need a ledger-based read model.
- Directly editing output quantities before close weakens historical traceability.

## Security gaps

Module visibility in the client is not authorisation. Posting must verify active subscription, tenant/entity/branch/location scope, role, action, and approval limit on the server.

## Scale risks

Operational views and limited client loads are unsuitable for years of entries. Ledger-backed projections, partition/retention strategy later, idempotency, locks, and reconciliation are required before high-volume operation.

## Required architectural response

Build the core incrementally: additive tables, internal posting contract, balance projection, outbox, and policy layer first; shadow post next; then cut over custody and add internal production.
