---
status: accepted
---

# Durable Event Acceptance Boundary

Cimi acknowledges a normalized Event only after a sequential SQLite acceptance flush commits it, its deduplication fingerprint, policy version, timestamps, and processing state to the SQLite-canonical durable local acceptance journal. Before that commit, candidates may wait in one installation-wide FIFO in-memory coalescer: the first candidate opens a fixed 1,000 ms window, a flush commits at 500 candidates or the deadline, and up to 1,500 additional unique candidates wait. Queue admission never produces an acknowledgment. This deliberately separates retry-safe collection from asynchronous analytics-store materialization: a successful acknowledgment promises recoverable acceptance, not an already-queryable DuckDB commit.

## Considered Options

- In-memory acknowledgment queue: rejected because a process restart could silently lose an acknowledged Event. A bounded in-memory pre-ack coalescer is permitted because uncommitted candidates never receive a successful response and are safe to retry.
- Analytics-store commit: rejected because collection availability and query-store materialization should not share one synchronous boundary.
- Durable per-item journal with sequential group commit: chosen because it supports restart recovery, full-retention deduplication, and higher SQLite write efficiency without claiming synchronous report visibility. The active flush is one all-or-none SQLite transaction; the public batch contract remains non-atomic when item outcomes differ or a request spans multiple flushes.
- Non-atomic batch outcomes: after batch-boundary validation passes, policy refusals and item validation/collision failures remain per-item HTTP 200 results and are not journaled; only accepted items receive durable journal sequence and retry recovery.

## Consequences

- The journal must preserve the normalized envelope, Site scope, Event ID, payload fingerprint, Receipt Time, Occurrence Time, effective policy version, acceptance state, and replay sequence for the full configured raw-event retention window.
- Receipt Time is captured at lifecycle-linearized candidate admission, and replay sequence follows global FIFO admission order rather than SQLite statement timing.
- The coalescer retains at most 500 candidates in the active flush and 1,500 unique candidates in the pending queue. Queue saturation, flush failure, quiesce failure, and ambiguous commit outcomes return `SERVICE_UNAVAILABLE` (503); callers retry by Event ID.
- A process crash before commit loses only unacknowledged candidates and their in-memory reservations. A commit followed by a lost response is recovered as `duplicate` with the original Receipt Time while the Site remains eligible for duplicate lookup; after a Site deletion boundary, the existing fail-closed `NOT_FOUND` rule still applies without creating a second record.
- Site deletion blocks new admissions at the shared lifecycle boundary but permits candidates admitted before the transition to drain through the global writer. Backup, maintenance, and shutdown stop new admissions and drain the queues before snapshot or close.
- Recovery replays journal items idempotently and never re-evaluates changed policy for an already accepted Event.
- SQLite is the authoritative backup and recovery artifact. DuckDB Analytical Facts and Projections are rebuildable from it.
- A quarantined projection records a durable gap before the projector advances. Query preflight checks the gap ledger before serving cached results; a gap overlapping either a resolved current or comparison half-open Site interval, or a gap without a bounded Occurrence Time interval, returns `QUERY_LIMIT_EXCEEDED` before execution. Reports without a relevant gap may expose `stale` freshness while projection catches up.
