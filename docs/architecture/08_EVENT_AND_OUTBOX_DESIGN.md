# Event and Outbox Design

## Transactional outbox

`outbox_events` is written inside the same transaction as ledger posting. It contains event type, aggregate type/id, correlation and causation ids, versioned JSON payload, status, retry count, availability time, lock metadata, publish timestamp, and last error.

## Initial event types

```text
MaterialTransactionPosted
MaterialTransactionReversed
MaterialBalanceChanged
MaterialLotCreated
MaterialLotQualityChanged
LocationCapacityChanged
```

## Publishing flow

```text
Posting transaction commits
-> event is PENDING
-> internal publisher locks eligible row(s)
-> consumer receives versioned event
-> publisher marks PUBLISHED
```

The publisher must use row locks/skip-locked semantics and lease timeout recovery so multiple workers cannot publish the same pending row concurrently.

## Retry and dead letter

- Retry count increments after a failed publish/consume attempt.
- Backoff is scheduled through `available_at`.
- After the approved threshold, status becomes `DEAD_LETTER` and an operational alert is raised.
- A dead-letter event does not reverse a valid material posting; it requires recovery and replay.

## Idempotent consumers

Every consumer stores processed event id/version or applies deterministic upserts. Projections must tolerate duplicate delivery and replay. Events are facts after commit, not commands that can alter the original posting.
