# Known Issues and Risks

## Current risks

- Milling custody currently has a separate balance model from general inventory.
- Milling output rows contain mutable delivered quantities and are not a durable immutable movement history.
- Silo/location values are not a controlled location domain.
- General lot quality, lineage, and WIP are absent.
- Internal mill production and cost allocation are not implemented.
- Reversal and adjustment lifecycle is incomplete for milling documents.
- Current reporting patterns can rely on direct operational aggregation or limited client result sets.
- Server-side permissions need entity/location/approval scope enforcement beyond client module visibility.
- Existing milling acceptance coverage is insufficient.
- A milling setup/cleanup migration contains destructive deletion of general ERP data and must not be treated as an approved architecture path.

## Explicitly prohibited actions

- Do not delete general ERP catalogue, vehicle, category, brand, unit, or operational data as part of milling setup.
- Do not mix customer-owned material into company valuation or COGS.
- Do not use a `WASTE` product output as the only representation of operational loss.
- Do not make posted material changes by `UPDATE` or `DELETE`.
- Do not make a dashboard/report an authoritative material balance source.
- Do not cut over to the new ledger without shadow reconciliation.

## Items requiring future review

- Exact legal entity/tenant/branch schema mapping before Phase 1 foreign keys.
- Existing `product_batches` field-level compatibility and legacy-batch mapping.
- Warehouse/location RLS and role assignment model.
- Financial accounting interface for WIP and cost allocation.
- Retention, partitioning, backup, and projection rebuild operating procedures for high-volume ledger data.
- Contract and approval policy for excess milling loss, quality deductions, and packaging ownership.
