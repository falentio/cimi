---
status: accepted
---

# Durable Event Acceptance Boundary

Cimi acknowledges a normalized Event only after appending it, its deduplication fingerprint, policy version, timestamps, and processing state to the SQLite-canonical durable local acceptance journal. This deliberately separates retry-safe collection from asynchronous analytics-store materialization: a successful acknowledgment promises recoverable acceptance, not an already-queryable DuckDB commit.

## Considered Options

- In-memory queue: rejected because a process restart could silently lose an acknowledged Event.
- Analytics-store commit: rejected because collection availability and query-store materialization should not share one synchronous boundary.
- Durable per-item journal: chosen because it supports restart recovery, full-retention deduplication, and non-atomic batch replay without claiming synchronous report visibility.
- Non-atomic batch outcomes: after batch-boundary validation passes, policy refusals and item validation/collision failures remain per-item HTTP 200 results and are not journaled; only accepted items receive durable journal sequence and retry recovery.

## Consequences

- The journal must preserve the normalized envelope, Site scope, Event ID, payload fingerprint, Receipt Time, Occurrence Time, effective policy version, acceptance state, and replay sequence for the full configured raw-event retention window.
- Recovery replays journal items idempotently and never re-evaluates changed policy for an already accepted Event.
- SQLite is the authoritative backup and recovery artifact. DuckDB Analytical Facts and Projections are rebuildable from it.
- A quarantined projection records a durable gap before the projector advances. Query preflight checks the gap ledger before serving cached results; a gap overlapping either a resolved current or comparison half-open Site interval, or a gap without a bounded Occurrence Time interval, returns `QUERY_LIMIT_EXCEEDED` before execution. Reports without a relevant gap may expose `stale` freshness while projection catches up.
