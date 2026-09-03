# Plausible Analytics: OLTP and OLAP Boundary Research

## Scope and Evidence Boundary

Research track for Cimi issue [#24](https://github.com/falentio/cimi/issues/24), Plausible only. The report covers ingestion acknowledgment, canonical state, raw events, identity, configuration, reporting storage, queues, freshness, lifecycle, and deployment assumptions.

Research date: 2026-08-23.

The web research used Plausible-owned documentation and Exa to locate and fetch current first-party pages. Source-code observations use the official `plausible/analytics` repository snapshot checked out at commit [`9cc669b97ece3ecd37fcb3950791cb3873d7944d`](https://github.com/plausible/analytics/commit/9cc669b97ece3ecd37fcb3950791cb3873d7944d), dated 2026-08-19. The repository includes Community Edition and Enterprise-gated branches. A source observation is not automatically a managed Cloud or Enterprise guarantee.

Evidence labels:

- **[Fact]** Directly stated by official documentation or represented by the pinned official source, schema, or test.
- **[Inference]** A consequence of one or more facts. It is not a Plausible guarantee.
- **[Unknown]** Not established by the reviewed first-party sources.

## Executive Findings

- **[Fact]** Plausible has a clear physical split: PostgreSQL stores general/control data and ClickHouse stores analytics data. The official repository describes this as `PostgreSQL (general data), ClickHouse (analytics)` ([official README](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/README.md)).
- **[Fact]** The normal Events API returns `202 Accepted`; it can return that status even when bot filtering drops the event, with `x-plausible-dropped` used for diagnosis ([Events API](https://plausible.io/docs/events-api)).
- **[Fact]** In the pinned source, the ordinary acceptance path validates and processes the event, updates an in-memory session cache, and sends event/session rows to asynchronous in-process ClickHouse write buffers. The buffer uses `GenServer.cast`, then flushes on a timer or byte threshold ([external controller](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible_web/controllers/api/external_controller.ex), [embedded persistor](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/persistor/embedded.ex), [write buffer](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/write_buffer.ex)).
- **[Inference]** In that source path, `202` means accepted into the application processing and buffering path, not proof that a ClickHouse row is durable or queryable. The source has a graceful-shutdown flush but no durable acceptance journal or event replay ledger in the ordinary path.
- **[Fact]** Native reporting queries read `events_v2` and/or `sessions_v2` directly, selecting event metrics, session metrics, or joins based on the query shape. The source does not show a general native daily-report table or a separate report materializer ([table decider](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/table_decider.ex), [query builder](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/query_builder.ex)).
- **[Inference for Cimi]** Plausible is useful evidence for separating control-plane ownership from analytical storage, but its ordinary ingestion boundary is weaker than Cimi's accepted durable-journal contract. Cimi should not copy Plausible's acknowledgment semantics into the SQLite OLTP boundary.

## Boundary Matrix

| Concern                | Plausible evidence                                                                                                                           | Boundary interpretation                                                               | Cimi implication                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Site and account state | PostgreSQL `sites`, users, teams, memberships, goals, segments, tracker configuration, auth sessions, and jobs                               | PostgreSQL is the canonical control-plane store                                       | SQLite should own Site, Organization, policy, configuration, and lifecycle state            |
| Accepted event state   | No ordinary durable acceptance journal found; event and session writes are buffered to ClickHouse                                            | Accepted processing is not a separately recoverable OLTP record                       | SQLite should append the normalized acceptance record before acknowledgment                 |
| Raw analytics events   | ClickHouse `events_v2` is an event-level `MergeTree` table with normalized fields                                                            | ClickHouse is the native analytical event store, not the control-plane ledger         | DuckDB should receive replayable immutable event rows from SQLite                           |
| Session state          | Active session state is ETS/in-memory; persisted updates use `sign=-1` and `sign=1` in `sessions_v2`                                         | Session state is a mutable analytical projection with transient working state         | Materialize sessions in DuckDB, but checkpoint/replay from SQLite                           |
| Reports                | Stats queries read event/session tables and join them as required                                                                            | Reports are query-time projections rather than generally precomputed report snapshots | Keep metric grain, projection version, and query freshness explicit                         |
| Operational jobs       | Oban jobs are stored in PostgreSQL and pruned/rescued by configured lifecycle plugins                                                        | Background work is durable at the job level, but not the ordinary event payload path  | A materializer queue/cursor can be SQLite-owned and replayable                              |
| Delete and retention   | Site deletion records pending ClickHouse deletion and runs asynchronous cleanup; plan retention is configuration, not an observed native TTL | Logical visibility and physical erasure are separate                                  | Define both SQLite logical deletion and DuckDB physical cleanup/compaction                  |
| Backup                 | Cloud documents daily encrypted backups and quarterly restore tests; CE operators own backups                                                | Managed and self-hosted recovery contracts differ                                     | Back up SQLite authority; optionally copy DuckDB to accelerate restore, then verify rebuild |

## Ingestion Acknowledgment and Durability

### Request and acknowledgment

- **[Fact]** `POST /api/event` records pageviews or custom events. The documented request includes `domain`, `name`, `url`, optional `referrer`, `props`, `revenue`, and `interactive`; the User-Agent and client IP forwarding affect unique visitor calculation ([Events API](https://plausible.io/docs/events-api)).
- **[Fact]** Plausible documents `202 Accepted` for a successful Events API request and says the API returns `202` even when an event is dropped by bot filtering. The response header `x-plausible-dropped: 1` is the diagnostic signal ([Events API](https://plausible.io/docs/events-api), [integration troubleshooting](https://plausible.io/docs/troubleshoot-integration)).
- **[Fact]** The pinned controller returns `202` after `Ingestion.Event.build_and_buffer/1` reports buffered events. Structural request errors return `400`; a processing drop without an invalid changeset still returns `202` ([external controller](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible_web/controllers/api/external_controller.ex)).
- **[Fact]** Normal event time is assigned by the server while building the request. The ordinary request envelope has no client event ID or normal client timestamp ([request builder](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/request.ex)).

### Buffer and persistence path

- **[Fact]** The default embedded persistor first updates the session cache and passes session rows to `Plausible.Session.WriteBuffer`; it then merges session attributes into the event and passes the event to `Plausible.Event.WriteBuffer` ([embedded persistor](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/persistor/embedded.ex)).
- **[Fact]** `Plausible.Ingestion.WriteBuffer.insert/2` uses `GenServer.cast`. Each buffer flushes when it reaches the configured byte threshold, on a timer, on explicit flush, or during normal process termination ([write buffer](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/write_buffer.ex)).
- **[Fact]** The pinned runtime defaults are a 5,000 ms ClickHouse flush interval, a 100,000-byte maximum buffer, and an ingest pool size of 5 ([runtime configuration](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/config/runtime.exs)).
- **[Inference]** Under the embedded source path, the acknowledgment can precede the ClickHouse insert by the remaining buffer interval and database write time. A process failure can lose in-memory buffer contents or active session-cache state unless shutdown is graceful or session transfer is configured.
- **[Fact]** The source also contains a remote persistor with up to three retries for selected HTTP/2 disconnect/unprocessed errors ([remote persistor](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/persistor/remote.ex)).
- **[Inference]** The remote persistor improves transport resilience but is not evidence of exactly-once delivery: its payload has no event ID or idempotency key, and the retry is not backed by a durable application journal.

## Canonical OLTP-Like State

### PostgreSQL control plane

- **[Fact]** The `sites` schema stores domain, timezone, public visibility, native stats start time, allowed event properties, feature flags, ingest rate-limit settings, and related lifecycle fields ([site schema](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/site.ex), [PostgreSQL structure](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/repo/structure.sql)).
- **[Fact]** Tracker script configuration is a PostgreSQL schema related to a Site and owns options such as hash routing, outbound links, file downloads, form submissions, tagged events, and pageview properties ([tracker configuration](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/site/tracker_script_configuration.ex)).
- **[Fact]** Goals and saved segments are PostgreSQL resources associated with a Site; goals define event/page/scroll configuration and segments store saved filter combinations ([goal schema](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/goal.ex), [segment schema](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/segments/segment.ex)).
- **[Fact]** PostgreSQL also contains user sessions, salts, pending stats deletions, and the Oban job table ([PostgreSQL structure](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/repo/structure.sql)).
- **[Inference]** PostgreSQL is the canonical owner for configuration, authorization, report definitions, retention-plan metadata, and operational job state. In-memory Site caches are read-optimized projections, not the durable owner.

### Analytics state and the session exception

- **[Fact]** `events_v2` and `sessions_v2` are ClickHouse tables. The event schema stores normalized event fields, `user_id`, `session_id`, timestamps, attribution, derived device/location fields, and custom properties as key/value arrays; it does not store raw IP or raw User-Agent ([event schema](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/clickhouse_event_v2.ex), [ClickHouse structure](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/ingest_repo/structure.sql)).
- **[Fact]** The current session working set is keyed by Site and derived user ID in an in-memory cache with a 30-minute cache TTL. The source looks up the current and previous salt-derived ID and writes session changes as a negative old row plus a positive new row ([session cache](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/session/cache_store.ex), [ClickHouse session schema](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/clickhouse_session_v2.ex), [ClickHouse structure](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/ingest_repo/structure.sql)).
- **[Inference]** A current session has two states: transient working state in the application cache and analytical persisted state in ClickHouse. The persisted session table is a projection maintained by collapsing updates, not an OLTP source of acceptance truth.

## Raw Events, Deduplication, Identity, and Configuration

### Raw event meaning

- **[Fact]** Plausible's public data policy says it stores page hostname/path, referrer, derived browser/OS/device, derived location, campaign values, and aggregate analytics while discarding raw IP and full User-Agent ([data policy](https://plausible.io/data-policy)).
- **[Fact]** `events_v2` is event-level analytics storage, but it is already normalized and enriched. It is not a byte-for-byte copy of the incoming HTTP payload ([event schema](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/clickhouse_event_v2.ex)).
- **[Inference]** For Cimi, "raw event" should distinguish the durable normalized acceptance envelope from the original request body. Plausible demonstrates that analytics rawness can mean event-level rows without preserving all request metadata.

### Deduplication

- **[Fact]** The inspected normal request and event schemas contain no event ID, sequence number, idempotency key, payload fingerprint, or deduplication window ([request builder](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/request.ex), [event schema](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d/lib/plausible/clickhouse_event_v2.ex)).
- **[Fact]** Native `events_v2` uses ClickHouse `MergeTree`; the key/order includes Site, date, event name, user ID, and timestamp, but no event UUID ([ClickHouse structure](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/ingest_repo/structure.sql)).
- **[Fact]** Session collapsing with `sign=-1` and `sign=1` is used for session state replacement. It is not event deduplication ([session cache](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/session/cache_store.ex)).
- **[Inference]** Replaying a normal client request can create another event and inflate event/session counts. The source does not establish exactly-once semantics for ordinary events.
- **[Fact]** A source comment describes ClickHouse insert-block deduplication for imported tables and explicitly disables it there because deletion does not clear the stored insert hashes ([purge module](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/purge.ex)).
- **[Inference]** That import-specific ClickHouse behavior must not be generalized into a native event idempotency contract.

### Identity

- **[Fact]** Plausible documents a daily, site, and device-isolated identifier based on a rotating salt, website domain, IP address, and User-Agent. It says the raw IP and User-Agent are not stored ([data policy](https://plausible.io/data-policy)).
- **[Fact]** The pinned source computes a SipHash over the current salt, User-Agent, remote IP, configured domain, registrable event hostname, and an Enterprise replay-session value when applicable ([identity generation](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/event.ex)).
- **[Fact]** The source retains current and previous salts, rotates them daily through an Oban worker, and deletes database salts older than 48 hours ([salt manager](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/session/salts.ex), [rotate worker](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/workers/rotate_salts.ex)).
- **[Inference]** Plausible's `user_id` is a short-lived aggregation key, not an identified-user or caller-owned identity record. It should not be used as a model for Cimi's optional Identified User linkage.

## OLAP, Reporting Storage, and Projections

- **[Fact]** Plausible's Stats API is an aggregate query surface. The documentation says it accepts one query endpoint and returns requested metrics; legacy documentation states that individual records cannot be queried from the stats database ([Stats API](https://plausible.io/docs/stats-api), [official README](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/README.md)).
- **[Fact]** The source query runner builds and executes ClickHouse SQL, while the table decider partitions metrics between event and session tables. Session dimensions can cause joins from events to sessions, and event filters can cause joins from sessions to events ([query runner](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/query_runner.ex), [table decider](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/table_decider.ex), [SQL query builder](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/stats/sql/query_builder.ex)).
- **[Fact]** Native `events_v2` is a monthly-partitioned `MergeTree`; `sessions_v2` is a monthly-partitioned `VersionedCollapsingMergeTree`. Imported historical data is stored in separate aggregate tables ([ClickHouse structure](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/ingest_repo/structure.sql), [CSV import docs](https://plausible.io/docs/csv-import)).
- **[Fact]** The inspected native schema has an `ingest_counters` `SummingMergeTree` and an explicit projection for daily buffered counts. This is an operational traffic counter, not the general dashboard report model ([ingest counter projection](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/ingest_repo/migrations/20241120064325_create_ingest_counters_site_traffic_projection.exs)).
- **[Inference]** Plausible's principal native OLAP design is append event rows plus a session projection, with query-time aggregation and joins. It is not a durable OLTP event ledger followed by a broad set of precomputed report tables.
- **[Fact]** The public documentation says managed Cloud dashboard data is aggregate-only, while self-hosting lets the operator access raw ClickHouse data directly ([official README](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/README.md), [self-hosting docs](https://plausible.io/docs/self-hosting)).
- **[Inference]** Cimi can use DuckDB for a similar analytical role, but should make its projection set and report freshness explicit rather than relying on query-time visibility after an in-memory buffer.

## Queues, Batches, Replay, and Query Freshness

### Ingestion buffers and background jobs

- **[Fact]** Native event and session writes use separate application write buffers. The buffers batch by bytes and timer, but their contents are held in the Plausible process until ClickHouse insert ([event write buffer](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/event/write_buffer.ex), [session write buffer](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/session/write_buffer.ex), [runtime defaults](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/config/runtime.exs)).
- **Fact** Oban is configured on PostgreSQL for scheduled/background work. The source config includes analytics imports/exports, deletion, salt rotation, cleanup, and reporting queues; production configuration prunes Oban history after 30 days and rescues orphaned jobs after two hours ([runtime Oban configuration](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/config/runtime.exs), [export worker](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/workers/export_analytics.ex)).
- **[Inference]** Oban provides a durable operational job queue, but ordinary collection does not enqueue one durable job per event. This is a material difference from Cimi's acceptance journal.

### Deployment continuity and replay

- **[Fact]** The source has an optional Unix-domain-socket session transfer process that copies the in-memory active-session cache across OS processes during deployment and waits up to 15 seconds for takeover ([session transfer](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/session/transfer.ex)).
- **[Inference]** With no configured session transfer, a process restart can lose active session continuity even though prior session rows exist in ClickHouse. This is separate from flushing pending event/session buffers.
- **[Fact]** Enterprise replay support accepts a replay session ID and past replay time through headers; the repository includes a purge script for replayed events and sessions scoped to a maximum three-day inclusive date range ([replay request handling](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/request.ex), [replay purge](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/data_migration/purge_ingest_replay.ex)).
- **[Unknown]** The reviewed Community Edition path does not expose a general operator event-replay workflow from a durable ingest log. Enterprise replay is a separate gated feature and should not be treated as CE recovery.

### Freshness

- **[Fact]** Plausible describes dashboard data as real-time and the Stats API supports real-time date-time ranges ([dashboard FAQ](https://plausible.io/docs/dashboard-faq), [Stats API](https://plausible.io/docs/stats-api)).
- **[Fact]** The pinned CE runtime defaults to a 5-second write-buffer interval, and dashboard queries use a ClickHouse query timeout of 15 seconds with a 20-second maximum execution setting ([runtime configuration](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/config/runtime.exs)).
- **[Inference]** A healthy self-hosted instance will commonly expose an accepted event after the buffer flush and ClickHouse makes the insert visible, but the reviewed sources do not establish a read-after-ack guarantee, a p95 freshness target, or a maximum query visibility delay.

## Retention, Deletion, Backup, and Recovery

### Retention

- **[Fact]** Managed plan documentation treats data retention as a plan limit that can be increased on Enterprise ([subscription plans](https://plausible.io/docs/subscription-plans)).
- **[Fact]** The pinned plan data stores `data_retention_in_years` values for plan configuration, including 3-year Starter/Growth and 5-year Business values in the checked-in data ([plan data](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/plans_v5.json)).
- **[Fact]** Native event/session tables are monthly partitioned, but the inspected schema does not contain a table TTL clause ([ClickHouse structure](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/priv/ingest_repo/structure.sql)).
- **[Inference]** Partitioning is a storage layout, not proof of automatic retention enforcement. The source evidence does not establish a self-hosted native-data retention worker that applies plan metadata to ClickHouse.

### Deletion

- **[Fact]** Plausible documentation says site deletion removes the site and all collected stats; account deletion removes sites and stats ([delete site docs](https://plausible.io/docs/delete-site-data), [delete account docs](https://plausible.io/docs/delete-account)).
- **[Fact]** The source deletes the PostgreSQL Site inside a transaction while storing a pending ClickHouse deletion record. A separate Oban ClickHouse cleanup worker batches partition-scoped event/session deletes, clears imported tables, handles the projection-bearing ingest counter through a mutation, and then clears the pending record ([site removal](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/site/removal.ex), [pending deletion context](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/pending_stats_deletions.ex), [cleanup worker](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/workers/clickhouse_clean_sites.ex)).
- **[Fact]** Native stats reset advances `native_stats_start_at` in PostgreSQL so older native stats are no longer available to queries; the source comments describe this as moving stats pointers, not immediate physical deletion ([purge module](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/purge.ex)).
- **[Inference]** Plausible distinguishes logical report visibility from physical ClickHouse erasure. Cimi should model those as separate lifecycle states and not claim backup deletion from a query cutoff.
- **[Unknown]** The reviewed CE source/config does not establish a self-hosted schedule or completion SLO for every pending ClickHouse deletion. The cleanup worker is present and queued, while the reviewed cron configuration schedules it in the Cloud-specific cron set.

### Backup and recovery

- **[Fact]** Plausible Cloud's security page states that service data is backed up daily, encrypted with AES-256, retained for 30 days, and restore-tested at least quarterly ([security practices](https://plausible.io/security)).
- **[Fact]** Plausible's self-hosting documentation says the CE operator owns backups, uptime, capacity, stability, consistency, and maintenance ([self-hosting docs](https://plausible.io/docs/self-hosting)).
- **[Fact]** The official CE Compose setup persists separate PostgreSQL, ClickHouse data/log, and application volumes; it does not itself describe a coordinated backup/restore protocol ([Community Edition Compose](https://github.com/plausible/community-edition/blob/master/compose.yml)).
- **[Unknown]** No official CE restore procedure, cross-store snapshot protocol, ClickHouse replication guarantee, power-loss durability setting, or recovery point/recovery time objective was established in the reviewed sources.

## Deployment and Resource Assumptions

- **[Fact]** The official Community Edition setup requires Docker and Docker Compose, a CPU with SSE 4.2 or NEON support for ClickHouse, and recommends at least 2 GB RAM ([Community Edition README](https://github.com/plausible/community-edition/blob/master/README.md)).
- **[Fact]** The official Compose file runs separate PostgreSQL 16, ClickHouse 24.12, and Plausible services with persistent volumes and low-resource ClickHouse configuration files ([Community Edition Compose](https://github.com/plausible/community-edition/blob/master/compose.yml)).
- **[Fact]** The source runtime separates a read-only ClickHouse query repo, a ClickHouse ingest repo, an optional async-insert repo, and a deletion repo. The default query path has a 15-second timeout and 20-second maximum execution time; the ingest path has configurable pool, buffer, and flush settings ([runtime configuration](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/config/runtime.exs), [ClickHouse repo](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/clickhouse_repo.ex)).
- **[Fact]** The optional async-insert repo is configured with `async_insert=1` and `wait_for_async_insert=0`, but the inspected source uses it for ingestion counters rather than proving that ordinary event acceptance uses this path ([async insert repo](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/async_insert_repo.ex), [ingestion counters](https://github.com/plausible/analytics/blob/9cc669b97ece3ecd37fcb3950791cb3873d7944d/lib/plausible/ingestion/counters.ex)).
- **[Inference]** Plausible assumes a multi-service deployment with independent operational and analytical resource pools. A Cimi single-installation SQLite plus DuckDB design should state the equivalent CPU, RAM, disk, temporary spill, and single-writer envelope instead of assuming a server database cluster.

## Explicit Unknowns and Evidence Limits

- **[Unknown]** Whether the current managed Cloud ingestion path uses the pinned embedded persistor, remote persistor, a different internal service, or additional durable infrastructure.
- **[Unknown]** Whether managed Cloud or Enterprise deployments add event deduplication, replication, write-ahead durability, or replay facilities outside the public repository path.
- **[Unknown]** The exact point at which Plausible considers a ClickHouse insert durable across process crash, host crash, or power loss.
- **[Unknown]** A contractual maximum from `202 Accepted` to dashboard query visibility, including behavior during ClickHouse backlog or merge pressure.
- **[Unknown]** A complete self-hosted retention enforcement procedure for native events, sessions, imports, logs, exports, and backups.
- **[Unknown]** A coordinated self-hosted backup/restore protocol that keeps PostgreSQL control state and ClickHouse analytics state at one consistent generation.
- **[Unknown]** Whether all production deletion triggers are scheduled identically in CE, Cloud, and Enterprise. The source has separate self-host and Cloud cron sets.
- **[Unknown]** Whether future releases change the source-level buffer, session transfer, table engine, or persistence defaults. This report is pinned to the stated commit.

## Concrete Implications for Cimi's SQLite plus DuckDB Boundary

1. **Keep SQLite as the durable acceptance and control-plane boundary.** Store normalized Event content, Site scope, Event ID, payload fingerprint, receipt/occurrence times, policy version, acceptance state, and replay sequence before acknowledgment. This matches Cimi's accepted ADR and avoids Plausible's in-memory `202` gap ([Cimi durable acceptance ADR](../../adr/0002-durable-event-acceptance-boundary.md)).
2. **Make deduplication an OLTP invariant, not an OLAP side effect.** A Site-scoped Event ID and fingerprint should distinguish exact retry from changed-payload conflict for the full raw retention period. DuckDB should never be the first place that decides whether an event was already accepted.
3. **Treat DuckDB as an asynchronous analytical projection.** Materialize immutable accepted events, session state, and report projections in batches from SQLite. Record a durable materializer cursor, replay outcome, and projection version so interrupted batches can be retried without losing accepted events.
4. **Expose freshness separately from acknowledgment.** A successful collection response should promise SQLite durability only. Reports should expose or internally track the accepted sequence and materialized sequence, rather than implying that a successful collection response is immediately queryable.
5. **Separate transient session working state from recoverable session projection.** Plausible's ETS session cache improves active-session processing but can lose continuity on restart. Cimi should define whether session derivation is rebuilt from accepted events, checkpointed in SQLite, or treated as a DuckDB projection that can be recomputed.
6. **Keep configuration ownership in SQLite.** Site timezone, week start, policy, goals, identity configuration, report definitions, retention settings, and lifecycle status should be SQLite-owned; DuckDB should consume versioned configuration snapshots for deterministic materialization.
7. **Define deletion at both stores.** A logical cutoff in SQLite can immediately hide data, while DuckDB cleanup, compaction, journal expiration, exports, and backups require separate completion states. Plausible's asynchronous site deletion is evidence that "not queryable" and "physically erased" are different contracts.
8. **Back up the SQLite authority and rebuild DuckDB.** Cimi backs up SQLite control/journal state as the correctness artifact; a DuckDB copy may accelerate repair but is not required. Restore replays the full-retention journal and reports readiness only after DuckDB rebuild and health checks complete.
9. **State the single-host operating envelope.** Plausible's CE minimum is already a separate Postgres plus ClickHouse deployment with at least 2 GB RAM. Cimi should document local-disk requirements, SQLite writer contention, DuckDB single-writer ownership, temporary spill limits, and recovery behavior as explicit operating assumptions.
10. **Do not copy Plausible identity semantics by accident.** Plausible's rotating daily aggregation key is intentionally not a durable identified user. Cimi's anonymous identity and optional identified-user linkage require their own retention, consent, deletion, and cross-device rules.

## Primary Sources

- [Plausible Events API](https://plausible.io/docs/events-api)
- [Plausible Stats API](https://plausible.io/docs/stats-api)
- [Plausible data access](https://plausible.io/docs/data-access)
- [Plausible self-hosting](https://plausible.io/docs/self-hosting)
- [Plausible data policy](https://plausible.io/data-policy)
- [Plausible security practices](https://plausible.io/security)
- [Plausible subscription plans](https://plausible.io/docs/subscription-plans)
- [Plausible export stats](https://plausible.io/docs/export-stats)
- [Plausible site deletion](https://plausible.io/docs/delete-site-data)
- [Plausible Community Edition README](https://github.com/plausible/community-edition/blob/master/README.md)
- [Plausible Community Edition Compose](https://github.com/plausible/community-edition/blob/master/compose.yml)
- [Official Plausible Analytics repository at pinned source snapshot](https://github.com/plausible/analytics/tree/9cc669b97ece3ecd37fcb3950791cb3873d7944d)
