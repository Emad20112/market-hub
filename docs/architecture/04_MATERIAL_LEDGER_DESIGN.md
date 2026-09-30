# Material Ledger Design

## Core transaction model

`material_ledger_transactions` is the immutable posting header. It identifies transaction number/type, source document type/id/number, operating entity and branch, posting date, status, reversal reference, idempotency key, correlation id, actor, approver, and policy version.

`material_ledger_entries` contains ordered legs: product, universal owner account, lot, location, signed kg, optional signed bag count and bag size, UOM, movement reason, role, and source line reference.

Posted headers and entries are append-only. Drafts belong to business documents, never to the ledger. The lifecycle is:

```text
POSTED -> PARTIALLY_REVERSED -> REVERSED
```

## Movement types

`RECEIPT`, `TRANSFER`, `OWNERSHIP_TRANSFER`, `CONSUME`, `OUTPUT`, `DELIVERY`, `RETURN`, `LOSS`, `ADJUSTMENT`, `RECLASSIFICATION`, `QUARANTINE_TRANSFER`, `OPENING_BALANCE`, and `REVERSAL` are controlled transaction type codes.

## Balance rules

- Every posting has explicit source and destination legs or a permitted external/variance counterpart.
- A simple internal transfer is quantity-balanced for the same product/owner/lot.
- A transformation is not expected to sum to zero across products; its mass-balance policy is validated by the operation domain.
- A loss is an explicit movement to a loss/variance leg, with type and approval.
- External entries use `entry_role = EXTERNAL` and no physical location. They are excluded from physical balance projections.
- Variance entries are allowed only for approved adjustments, opening balances, or loss policies.

## Reversal

A reversal creates a new Transaction with opposite legs and `reversal_of_transaction_id`. It never edits or deletes the original. Full and partial reversals are supported only where downstream consumption and approval policy allow them.

## Ownership

Entries refer to `material_owners`, not a polymorphic owner id. The owner type is derived from the account. Company ownership is eligible for valuation and COGS; customer ownership is custody only.

## Projection

`material_balance_projection` is maintained transactionally with ledger insertion and may be rebuilt from entries. Its balance key is:

```text
Operating Entity + Product + Owner + Location + Lot
```

## Concurrency and idempotency

Posting locks balance keys in deterministic order, revalidates availability after locking, and writes the header, entries, projection, audit, and outbox in one transaction. An idempotency key is unique per entity and source document; retries return the original posted result rather than duplicate material movement.
