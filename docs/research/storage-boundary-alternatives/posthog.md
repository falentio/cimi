# PostHog: Collection, Durability, and Storage Boundaries

Research for Cimi issue #24, the consolidated wayfinding issue.

- Investigated: 2026-08-23
- Source scope: official PostHog documentation and the pinned `PostHog/posthog`
  checkout at `docs/research/vendor/posthog`
  (`0142feede7fed4f0bfe6a2e0096e46895ab6113d`)
- Purpose: record PostHog behavior relevant to Cimi's SQLite acceptance journal
  and DuckDB analytics projection. Cimi implications are recommendations
  inferred from the evidence, not PostHog guarantees.

## Scope and evidence

The labels below distinguish the strength of each statement:

- **Fact:** directly documented, implemented, configured, or tested by the
  inspected PostHog sources.
- **Inference:** a design conclusion drawn from those sources; it is not a
  claim that PostHog promises the same behavior in every deployment.
- **Unavailable:** not established by the inspected sources.

This report complements the narrower PostHog reports in
`event-session-alternatives`, `query-semantics-alternatives`,
`visitor-identity-alternatives`, and `public-dashboard-alternatives`.

## Executive assessment

**Fact:** PostHog separates collection from analytical materialization. The
Rust capture service validates an analytics batch and publishes it to a sink;
Kafka then carries the event to Node.js ingestion consumers. Events are stored
in ClickHouse, while person records and person-to-`distinct_id` mappings have
PostgreSQL as their canonical store and are replicated to ClickHouse.
([ingestion pipeline](https://posthog.com/docs/how-posthog-works/ingestion-pipeline),
[data model](https://posthog.com/docs/how-posthog-works/data-model),
[ClickHouse](https://posthog.com/docs/how-posthog-works/clickhouse))

**Fact:** The v1 capture response reports a result per event. Results include
`ok`, `drop`, `warning`, and `retry`; retryable results are marked
`not_persisted`, and the response can include `Retry-After: 1`.
(`rust/capture/src/v1/analytics/handler.rs:15-111`,
`rust/capture/src/v1/analytics/process.rs:297-335`,
`rust/capture/src/v1/analytics/response.rs:38-74,106-147`)

**Fact:** The Kafka producer configuration inspected in the pinned checkout
uses `acks=all`, `message_timeout_ms=30000`, and `enable_idempotence=false`.
(`rust/capture/src/v1/sinks/kafka/config.rs`,
`rust/capture/src/v1/sinks/kafka/producer.rs`)

**Fact:** Node.js ingestion commits Kafka offsets after pipeline work. Its
shutdown path explicitly warns that writing dirty data after a partition
rebalance can create duplicates.
(`nodejs/src/common/kafka/consumer/consumer-v1.ts`,
`nodejs/src/ingestion/ingestion-consumer.ts:320-350,417-449`)

**Inference:** PostHog is evidence for separating durable collection from
analytics visibility, but not for copying a distributed Kafka and
PostgreSQL/ClickHouse topology into Cimi. Cimi's accepted boundary is smaller:
commit the normalized event to SQLite, acknowledge recoverable acceptance, and
project asynchronously into DuckDB.

## Ingestion path

### Request and validation

**Fact:** The v1 analytics endpoint is `POST /i/v1/analytics/events`. A batch
contains `created_at`, optional historical/capture metadata, and events with an
event name, UUID, `distinct_id`, RFC 3339 timestamp, optional session/window
IDs, options, and JSON properties.
(`rust/capture/src/v1/analytics/constants.rs:15-19`,
`rust/capture/src/v1/analytics/types.rs:63-71,189-206`)

**Fact:** The default v1 body limits are 10 MiB compressed and 50 MiB
decompressed. The handler enforces those limits before JSON parsing.
(`rust/capture/src/config.rs:393-399`,
`rust/capture/src/v1/analytics/handler.rs:65-100`)

**Fact:** V1 requires a non-empty `distinct_id`, limits event names and
distinct IDs to 200 bytes, parses timestamps as RFC 3339, and requires event
properties to begin as a JSON object.
(`rust/capture/src/v1/analytics/process.rs:611-636`)

**Fact:** A missing or malformed event UUID aborts the batch, and duplicate
UUIDs within one request abort the batch. This is validation within a request,
not a cross-request deduplication guarantee.
(`rust/capture/src/v1/analytics/process.rs:468-486`)

**Fact:** Capture can route historical events, overflow, dead-letter, and
restricted events to different destinations. Rules can match event UUID,
distinct ID, session ID, or event name and can disable person processing
without necessarily dropping the event.
(`rust/capture/src/v1/analytics/process.rs:658-687,748-826`,
`nodejs/src/common/utils/event-ingestion-restrictions/rules.ts:1-67`)

### Queue and processing

**Fact:** The capture process calls the sink router and merges the resulting
per-event statuses into the response. The normal analytics path publishes to a
Kafka destination; Node.js consumers then run ingestion steps and write the
downstream stores.
(`rust/capture/src/v1/analytics/process.rs:39-57,297-335`,
`nodejs/src/ingestion/ingestion-consumer.ts`)

**Fact:** The ingestion pipeline is intentionally able to process events in
bulk and retry work after consumer failures. The consumer source warns that
partition rebalances can produce duplicate writes if dirty batches are written
after disconnect.
(`nodejs/src/ingestion/ingestion-consumer.ts:320-350,417-449`)

**Inference:** A client-visible success should be described as a collection
acceptance result, not as a promise that every person update, ClickHouse
materialized view, or derived report is already current.

## Acknowledgment and durability

### What the source establishes

**Fact:** Kafka producer delivery is configured to require all in-sync replica
acknowledgments in the inspected configuration. The producer also has a finite
30-second message timeout.
(`rust/capture/src/v1/sinks/kafka/config.rs`,
`rust/capture/src/v1/sinks/kafka/producer.rs`)

**Fact:** A sink timeout or retriable sink error becomes a per-event `retry`
result with `not_persisted`; fatal sink errors become `drop`.
(`rust/capture/src/v1/analytics/process.rs:297-335`)

**Fact:** The source contains no general exactly-once guarantee for the full
capture-to-ClickHouse path. Consumer rebalance handling explicitly accounts for
possible duplicates.
(`nodejs/src/ingestion/ingestion-consumer.ts:320-350,417-449`)

### What remains unknown

**Unavailable:** The inspected sources do not define one simple end-to-end
statement of what an HTTP 200 or an individual `ok` result guarantees about
Kafka replication, downstream database persistence, or query visibility.

**Unavailable:** The sources do not establish an at-most-once or exactly-once
guarantee spanning capture, Kafka, Node.js processing, ClickHouse insertion,
materialized views, and query execution.

**Inference:** Cimi should not make DuckDB commit part of the synchronous
collection acknowledgment. The accepted Cimi ADR already chooses a durable
local acceptance journal: a successful acknowledgment promises recoverable
acceptance, not immediate DuckDB visibility.
(`docs/adr/0002-durable-event-acceptance-boundary.md:5-19`)

## Storage ownership

### PostHog's split

**Fact:** PostHog stores primary event analytics in ClickHouse. The event model
defines a ClickHouse `sharded_events` table, Kafka-backed materialization, and
distributed query access through the `events` abstraction.
(`posthog/models/event/sql.py`,
`posthog/models/event/column_config.py`)

**Fact:** Person state and person-to-distinct-ID mappings are modeled in
PostgreSQL and replicated into ClickHouse for analytics. Person merges can
therefore change unique-person query results after events have arrived.
(`posthog/models/person/person.py`,
`posthog/models/person/sql.py`,
`posthog/models/event/sql.py`)

**Fact:** The ClickHouse event path uses sharded and replicated
`ReplacingMergeTree` tables and materialized views. The official architecture
documentation warns that event deduplication is not guaranteed.
([ClickHouse architecture](https://posthog.com/docs/how-posthog-works/clickhouse),
`posthog/models/event/sql.py`)

**Inference:** PostHog's canonical ownership is multi-store and operationally
distributed. Cimi should instead give each concern one clear owner:

| Concern | Cimi owner | Contract |
| --- | --- | --- |
| Accepted normalized event | SQLite journal | Durable before acknowledgment |
| Event ID, fingerprint, policy version, replay state | SQLite journal | Unique ID plus collision detection |
| Analytical rows and report indexes | DuckDB | Rebuildable derived projection |
| Projection progress | SQLite journal or projection metadata | Explicit cursor, retry state, and lag |
| Query visibility | DuckDB | Separate from collection acknowledgment |

## Deduplication and retries

**Fact:** PostHog rejects duplicate UUIDs within one v1 request, but the
inspected source does not prove a general cross-request deduplication layer for
the primary event stream.
(`rust/capture/src/v1/analytics/process.rs:468-486`,
`event-session-alternatives/posthog.md:201-209`)

**Fact:** Consumer shutdown logic treats duplicate writes after a rebalance as
a real possibility. Some raw-session aggregates use UUID-aware functions so
session totals remain stable when duplicate rows are present.
(`nodejs/src/ingestion/ingestion-consumer.ts:320-350,417-449`,
`posthog/models/raw_sessions/sessions_v3.py:151-161,372-379`)

**Fact:** ClickHouse `ReplacingMergeTree` behavior is merge-time behavior, not
a promise that every ordinary query immediately sees one row per logical
event. The inspected architecture documentation explicitly says deduplication
is not guaranteed.
([ClickHouse architecture](https://posthog.com/docs/how-posthog-works/clickhouse))

**Inference:** Cimi should enforce its collection idempotency at the SQLite
journal boundary rather than relying on DuckDB or query-time deduplication:

- Unique accepted Event ID per Site.
- Stored payload fingerprint for same-ID, changed-payload collisions.
- Explicit acceptance state and replay sequence.
- Idempotent projector keyed by the accepted journal identity.
- No policy re-evaluation during recovery of an already accepted event.

## Identity and derived analytics

**Fact:** PostHog can disable person processing for invalid or restricted
distinct IDs while retaining the event. Person processing is therefore a
downstream concern that can diverge from event storage.
(`rust/capture/src/v1/analytics/process.rs:522-541,748-826`)

**Fact:** PostHog's ordinary unique-person metrics depend on the person identity
state available to the query engine. Person merges can change historical unique
counts.
([querying data](https://posthog.com/docs/how-posthog-works/queries),
`query-semantics-alternatives/posthog.md:92-101`)

**Inference:** Cimi should keep its resolved Visitor and Identified User
identity semantics in the domain contract and materialize those semantics into
DuckDB. A query result must not silently change because the projector applies a
different policy version during replay.

Session and identity details are covered in
`docs/research/event-session-alternatives/posthog.md` and
`docs/research/visitor-identity-alternatives/posthog.md`.

## Retention, deletion, and recovery

### Data lifecycle

**Fact:** PostHog has configurable event retention and asynchronous deletion
paths. ClickHouse deletion jobs handle event cleanup and use mutation/tombstone
patterns that interact with `ReplacingMergeTree` versions.
(`posthog/models/team/event_retention.py`,
`posthog/dags/data_deletion_requests.py`,
`posthog/clickhouse/adhoc_events_deletion.py`)

**Fact:** Session replay has a separate storage path with object storage for
payloads and ClickHouse metadata/aggregates.
([session replay storage](https://posthog.com/docs/self-host/configure/session-replay-storage),
[recordings ingestion](https://posthog.com/docs/how-posthog-works/recordings-ingestion))

**Inference:** Cimi's retention procedure must delete from the authoritative
SQLite journal first or define a clear retention ownership rule. DuckDB rows
should be deleted or rebuilt from the same cutoff, and derived report caches
must be invalidated rather than treated as authoritative history.

### Backups

**Fact:** The pinned checkout contains Dagster jobs that back up sharded event
tables, non-sharded ClickHouse tables, and logs to S3 using ClickHouse `BACKUP`
commands. Full backups are scheduled for the first Friday of the month by
default; incremental backups run on the other days. The backup bucket is
required configuration.
(`posthog/dags/backups.py:21-59,145-173,721-770`,
`posthog/settings/dagster.py:15-19`)

**Fact:** The backup code expects full sharded-event backups to take 8-12 hours
and allows approximately 14 hours of polling. This is an operational signal
from the source, not a universal PostHog service-level target.
(`posthog/dags/backups.py:26-27`)

**Unavailable:** The inspected backup implementation does not provide a
complete self-host restore runbook or an RPO/RTO promise for the whole PostHog
topology. It primarily establishes backup creation, status tracking, and S3
layout.

**Inference:** Cimi should make the SQLite journal the authoritative recovery
artifact. DuckDB should be checkpointed or copied as a derived optimization,
then rebuildable from SQLite after loss or corruption. This matches the
storage benchmark recommendation in
`docs/research/storage-benchmark/README.md:94-104`.

## Deployment and operational envelope

**Fact:** The official hobby Compose topology includes multiple stateful and
processing services, including PostgreSQL, Redis/Valkey, Kafka, Zookeeper,
ClickHouse, object storage, and ingestion/worker processes.
(`docker-compose.base.yml`, `docker-compose.hobby.yml`)

**Fact:** PostHog's self-host documentation warns that self-hosting requires
operational responsibility for the deployment and its dependencies.
([self-host disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer),
[environment variables](https://posthog.com/docs/self-host/configure/environment-variables))

**Inference:** PostHog's architecture is useful evidence for separating
collection, durable transport, derived storage, and query visibility. Its
service count and distributed failure modes are not a suitable default for
Cimi's one-container operating envelope.

**Unavailable:** The inspected sources do not establish a single production
capacity number applicable to Cimi, nor do they define resource requirements
for a PostHog-like topology under Cimi's workload.

## Implications for Cimi

### Recommended boundary

1. Normalize and apply collection policy before acceptance.
2. Append the normalized envelope, Event ID, fingerprint, policy version,
   timestamps, acceptance state, and replay sequence to SQLite in a durable
   transaction.
3. Acknowledge only the SQLite acceptance result.
4. Project accepted journal rows into DuckDB asynchronously and idempotently.
5. Expose projector lag, retry state, and recovery state separately from
   collection success.
6. Treat DuckDB as rebuildable analytics state, not the only recovery source.

### Contracts that should remain explicit

- `accepted` means durably recoverable in SQLite.
- `queryable` means present in the current DuckDB projection.
- `projector_lag` measures the difference between those states.
- Same Event ID with a different fingerprint is a collision, not a silently
  replaceable event.
- Retention and deletion apply to both journal and projection under one
  versioned policy.
- Recovery replays accepted events without re-evaluating changed policy.
- Public and report queries must use bounded Cimi procedures, not an arbitrary
  SQL escape hatch.

## Unknowns and verification gaps

- The exact PostHog meaning of a successful `ok` result after capture returns
  is not a complete end-to-end persistence contract in the inspected sources.
- Cross-request deduplication for the primary event stream is not established.
- Exactly-once behavior across Kafka, consumers, ClickHouse, and materialized
  views is not established.
- Ordering guarantees across topics, partitions, historical paths, and retries
  are not universal in the inspected sources.
- PostHog's complete restore sequence and production RPO/RTO are not defined by
  the inspected backup source.
- No general PostHog production sizing or capacity envelope should be inferred
  for Cimi from the Compose topology.
- Query freshness varies by pipeline and materialization; no single freshness
  SLA was established for every query surface.

## Primary sources

### Official documentation

- [Ingestion pipeline](https://posthog.com/docs/how-posthog-works/ingestion-pipeline)
- [Data model](https://posthog.com/docs/how-posthog-works/data-model)
- [ClickHouse architecture](https://posthog.com/docs/how-posthog-works/clickhouse)
- [Capture API](https://posthog.com/docs/api/capture)
- [Querying data](https://posthog.com/docs/how-posthog-works/queries)
- [Data storage and deletion](https://posthog.com/docs/privacy/data-storage)
- [Session replay storage](https://posthog.com/docs/self-host/configure/session-replay-storage)
- [Self-host disclaimer](https://posthog.com/docs/self-host/open-source/disclaimer)
- [Self-host environment variables](https://posthog.com/docs/self-host/configure/environment-variables)

### Pinned source checkout

- [`handler.rs`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/rust/capture/src/v1/analytics/handler.rs)
- [`process.rs`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/rust/capture/src/v1/analytics/process.rs)
- [`config.rs`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/rust/capture/src/v1/sinks/kafka/config.rs)
- [`ingestion-consumer.ts`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/nodejs/src/ingestion/ingestion-consumer.ts)
- [`event/sql.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/models/event/sql.py)
- [`person.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/models/person/person.py)
- [`backups.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/dags/backups.py)
- [`dagster.py`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/posthog/settings/dagster.py)
- [`docker-compose.hobby.yml`](https://github.com/PostHog/posthog/blob/0142feede7fed4f0bfe6a2e0096e46895ab6113d/docker-compose.hobby.yml)
