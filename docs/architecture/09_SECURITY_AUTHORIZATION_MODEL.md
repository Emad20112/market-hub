# Security and Authorization Model

## Scope chain

```text
Actor -> Tenant -> Operating Entity -> Branch -> Warehouse -> Location
     -> Module Subscription -> Role -> Permission -> Approval Limit
```

## Core concepts

- **Actor**: authenticated user or trusted service principal.
- **Tenant**: isolated platform customer.
- **Operating Entity**: legal/operational company whose material is being posted.
- **Branch/Warehouse/Location**: progressively narrower physical scope.
- **Role**: assigned operational role such as scale clerk, quality inspector, operator, warehouse keeper, accountant, manager, owner.
- **Permission**: action-specific grant, e.g. `material.transaction.post`.
- **Approval Limit**: quantity/value/loss/reversal threshold requiring maker-checker control.

## Example permissions

| Action              | Typical role                   | Required scope                        |
| ------------------- | ------------------------------ | ------------------------------------- |
| receive custody     | scale clerk / warehouse keeper | receiving location                    |
| release quality lot | quality inspector / manager    | quality and destination location      |
| consume into WIP    | milling operator               | WIP and source silo                   |
| post delivery       | warehouse keeper               | dispatch location                     |
| approve excess loss | manager/owner                  | branch plus limit                     |
| reverse posting     | manager/owner                  | source locations and reversal limit   |
| view custody        | authorised role                | customer and warehouse/location scope |

## Enforcement rule

Authorisation is called by the Posting Engine before validation/posting. UI visibility and `ModuleGuard` are convenience only. Existing roles remain in use through an adapter during incremental migration; they are not silently broadened.
