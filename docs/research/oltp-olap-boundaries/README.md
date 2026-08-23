# Competitor OLTP and OLAP Boundary Research

Research for [wayfinding issue #24](https://github.com/falentio/cimi/issues/24),
reviewed 2026-08-23. Each competitor report uses first-party documentation and
official source evidence where available. Individual reports label facts,
inferences, mismatches, and unknowns separately.

## Competitors

- [Plausible](plausible.md)
- [Matomo](matomo.md)
- [PostHog](../storage-boundary-alternatives/posthog.md)
- [DataBuddy](databuddy.md)
- [Simple Analytics](../simple-analytics-oltp-olap-boundary.md)
- [Rybbit](rybbit.md)

## Cross-Competitor Findings

### Control State and Analytics Facts

- Plausible, PostHog, DataBuddy, and Rybbit use a relational control plane for
  Sites, configuration, accounts, identity, and lifecycle state, with a
  separate analytical store for event facts and reports.
- Matomo keeps the same logical split inside MySQL/MariaDB: raw tracking tables
  are optimized for writes and archive tables hold derived report data.
- Simple Analytics exposes the same logical distinction through raw export and
  aggregate Stats APIs, but its current private backend engine and schema are
  unknown.

### Acknowledgment and Durability

- Plausible returns `202` after application buffering, before the ordinary
  ClickHouse write is proven durable.
- Rybbit returns success after process-local queue admission; failed batches are
  logged and removed rather than replayed from a durable journal.
- DataBuddy uses direct ClickHouse delivery in self-host mode and Kafka/Vector
  in the hosted path; Redis deduplication is short-lived rather than a full
  retention journal.
- Matomo's normal tracker writes raw tables before responding, while its
  optional queue changes the boundary to temporary Redis/MySQL queue storage;
  Redis loss is explicitly documented as lossy.
- PostHog has a durable distributed transport path, but its inspected source
  still permits duplicate downstream writes and does not establish one
  end-to-end exactly-once contract.
- Simple Analytics documents transport acceptance and eventual visibility, but
  does not publish the current commit or queue semantics.

No reviewed competitor provides evidence that a simple HTTP success response
universally means a durable, replayable, query-visible event. This supports a
stronger Cimi boundary: commit a normalized acceptance record in SQLite before
acknowledgment, then project asynchronously into DuckDB.

### Deduplication and Identity

- Competitors commonly use short-lived caches, client IDs, ClickHouse replacing
  keys, or no durable visitor identity at all.
- Cross-request idempotency and changed-payload conflict behavior are generally
  absent or incomplete in the reviewed systems.
- Relational stores commonly own identified profiles, aliases, configuration,
  and lifecycle state, while active session state may live in Redis or process
  memory and be only a projection.

Cimi should make Site-scoped Event ID uniqueness, payload fingerprints, exact
retry handling, changed-payload conflicts, policy-version snapshots, and replay
sequence explicit SQLite invariants. DuckDB must not make the first dedup or
privacy decision.

### Reporting and Projection

- Analytical stores usually contain normalized event facts plus selective
  materialized serving views; many reports remain query-time aggregations.
- Matomo's archive tables and Rybbit/DataBuddy/Plausible materialized views
  demonstrate that derived report state has its own freshness and invalidation
  lifecycle.
- PostHog person state can change historical unique-person results after events
  arrive, showing why identity policy versions and projection semantics matter.

Cimi should expose separate `accepted`, `projected`, and query-fresh-through
states. DuckDB projections should be versioned, idempotent, and rebuildable from
SQLite rather than treated as the recovery source.

### Retention, Deletion, and Recovery

- Every reviewed multi-store system has separate raw and derived lifecycle
  concerns. Logical invisibility, physical deletion, compaction, and backup
  purge are not one instantaneous event.
- Competitor backup guidance generally backs up relational and analytical
  stores separately. No reviewed source establishes an atomic cross-store
  snapshot covering databases, queues, caches, object storage, and in-flight
  buffers.
- Competitor deletion implementations and public policies frequently leave
  uncertainty around analytical mutations, caches, exports, and backups.

Cimi should keep deletion intent, policy, work state, and projector cursors in
SQLite; coordinate DuckDB cleanup and backup-generation expiry; and expose
pending/completed/failed lifecycle states. SQLite is the correctness anchor,
while DuckDB can be copied for faster restore but must remain rebuildable.

### Operating Envelope

- Plausible, Rybbit, DataBuddy, and PostHog assume multiple stateful services or
  databases, queues, caches, and independent operational resources.
- Matomo demonstrates a simpler single-database topology but relies on archive
  workers and database tuning.
- Simple Analytics is hosted-only from the reviewed public evidence and exposes
  no self-hosting or current capacity envelope.

Cimi's one-container SQLite plus DuckDB topology is intentionally smaller. Its
  single-writer boundary, local disk growth, temporary spill, queue backlog,
  rebuild duration, backup generation, and minimum host envelope must be
  documented as Cimi-owned guarantees rather than inferred from competitors.

## Boundary To Grill

The research supported the following default recommendation. Issue #14 has
now resolved the remaining ownership and recovery decisions:

1. SQLite owns control state, normalized acceptance records, deduplication,
   identity/profile links, retention/deletion intent, projector cursor, and
   replay state.
2. DuckDB owns rebuildable analytical event facts, session/report projections,
   aggregates, and query indexes.
3. Collection acknowledgment means durable SQLite acceptance; DuckDB query
   visibility is asynchronous and observable.
4. Projection replay is at-least-once with idempotent writes and no policy
   re-evaluation for already accepted events.
5. Retention and deletion cover journal, projection, exports, logs, queues, and
   backups with explicit completion states.
6. SQLite is the authoritative backup and recovery artifact. DuckDB is rebuilt
   from the full-retention acceptance journal; a derived DuckDB copy is only an
   optional repair accelerator.
7. Quarantined projection gaps remain visible in freshness and report status;
   later independent facts may continue while affected stateful projections are
   repaired.
