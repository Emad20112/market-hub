# Posting Engine Specification

## Internal contract

Logical operation:

```text
postMaterialTransaction(command) -> result
```

It is an internal application contract. A browser never calls it with arbitrary entries.

## Input contract

The command includes transaction type, source document type/id/number, operating entity, branch, posting date, actor, approver when required, idempotency key, correlation id, policy version, and typed posting legs. Each leg contains product, owner account, lot, physical/external role, location, signed kg, optional bags/size/UOM, reason, and source line reference.

## Output contract

The result returns transaction id/number/status, immutable entries, affected balance keys and deltas, created outbox event ids, and correlation id. Repeated idempotent commands return the original result.

## Posting pipeline

```text
Authorize
-> Validate document state
-> Validate idempotency
-> Validate structural and business policies
-> Lock balance keys
-> Revalidate availability/capacity
-> Insert ledger header and entries
-> Update synchronous balance projection
-> Write audit record
-> Write outbox records
-> Commit
```

## Transaction boundary

All pipeline writes occur in one PostgreSQL transaction. If an audit, projection, or outbox write fails, material posting fails. A downstream asynchronous event consumer may fail later without undoing a successfully committed posting.

## Error handling

- Business validation errors are deterministic and safe to show as domain errors.
- Conflict errors identify concurrent balance changes and may be retried with the same idempotency key.
- Infrastructure errors do not create partial posting.
- No handler compensates by editing entries; only the Reversal Engine can correct a committed movement.
