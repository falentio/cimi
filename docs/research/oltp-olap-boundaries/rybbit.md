# Rybbit: OLTP and OLAP Boundary Research

Research for Cimi wayfinding issue [#24](https://github.com/falentio/cimi/issues/24),
limited to Rybbit. Sources were checked on 2026-08-23. Web research used Exa
against Rybbit-owned documentation and the official repository. Source findings
use the official Rybbit checkout at commit
[`64f8c4fb7f394bdfe9379717de8e6c21758b1ac2`](https://github.com/rybbit-io/rybbit/tree/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2),
committed 2026-08-20.

This report does not modify Rybbit or Cimi product code.

## Evidence labels

- **[Fact]** Directly stated by official Rybbit documentation or represented by
  the pinned official source.
- **[Inference]** A conclusion from those facts, not a Rybbit guarantee.
- **[Mismatch]** Official documentation and the pinned source do not describe
  the same behavior.
- **[Unknown]** Not established by the reviewed first-party evidence.

## Executive assessment

- **[Fact]** Rybbit has a dual-database design. PostgreSQL owns relational
  application state and configuration; ClickHouse owns high-volume analytics
  storage. The official architecture page describes this split and the manual
  self-host guide lists Redis separately for session tracking and background
  queues ([architecture](https://rybbit.com/docs/architecture),
  [manual self-hosting](https://rybbit.com/docs/self-hosting-guides/self-hosting-manual)).
- **[Fact]** The normal `/api/track` request validates and resolves the event,
  updates Redis-backed session state, and appends the normalized event to a
  process-local queue. The HTTP handler returns success after queue admission;
  it does not await the ClickHouse insert
  ([track handler](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/trackEvent.ts#L17-L68),
  [ingestion pipeline](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/ingestEvent.ts#L27-L127),
  [pageview queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/pageviewQueue.ts#L15-L142)).
- **[Inference]** A successful ordinary tracking response is not a durable,
  replayable acceptance acknowledgment. A worker crash can lose queued events,
  and a failed ClickHouse batch is removed from the queue and only logged.
- **[Fact]** The main `events` table is a ClickHouse `MergeTree` with monthly
  partitions and `(site_id, timestamp)` ordering. The request schema and event
  table have no caller event ID, payload fingerprint, or general idempotency
  key
  ([tracking schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/trackingPayload.ts#L4-L26),
  [ClickHouse schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/core.ts#L83-L133)).
- **[Fact]** Rybbit has optional ClickHouse materialized views for a simplified
  high-traffic dashboard and a cloud usage counter. These are serving
  projections, not a durable acceptance ledger
  ([lite dashboard views](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/liteDashboard.ts#L55-L299),
  [cloud usage view](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/cloud.ts#L3-L32)).
- **[Cimi implication]** Rybbit is evidence for separating configuration,
  collection, analytical storage, and report serving, but Cimi should keep the
  stronger boundary already chosen: SQLite owns durable acceptance and DuckDB
  is an asynchronous, rebuildable analytical projection.

## Boundary matrix

| Concern                         | Rybbit evidence                                                                            | Cimi interpretation                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Ingestion acknowledgment        | HTTP 200 follows in-memory queue admission for ordinary events                             | Acknowledge only after SQLite journal commit                              |
| Accepted event authority        | No separate raw-event acceptance journal found; ClickHouse insert is later                 | SQLite owns the accepted normalized envelope                              |
| Site/configuration state        | PostgreSQL `sites` and related tables; one-minute process-local cache                      | SQLite owns Site, policy, identity configuration, and lifecycle state     |
| Identified profiles and aliases | PostgreSQL `user_profiles` and `user_aliases`                                              | SQLite owns identity/profile links and deletion state                     |
| Active session state            | Redis key with sliding 30-minute TTL; old PostgreSQL table is deprecated                   | Keep session derivation/checkpoints recoverable from SQLite events        |
| Raw analytics events            | ClickHouse `events` `MergeTree` rows                                                       | DuckDB stores a projection of accepted SQLite events                      |
| Session replay                  | ClickHouse event/metadata tables, with Cloud R2 payload batches                            | Model replay as a separate data class and lifecycle                       |
| Report serving                  | Raw ClickHouse queries plus optional materialized views                                    | DuckDB reports and projections are derived and versioned                  |
| Projection progress             | No general event projector cursor or replay ledger found                                   | SQLite owns projector cursor, retry state, and lag                        |
| Retention                       | Main events table has no TTL in the inspected DDL; replay and bot tables do                | Apply one explicit Cimi policy across journal and projection              |
| Backup/recovery                 | Separate PostgreSQL and ClickHouse backup procedures; no atomic cross-store snapshot shown | Back up SQLite authority; optionally copy DuckDB as a rebuild accelerator |

## Ingestion acknowledgment and durability

### Ordinary tracking

- **[Fact]** `POST /api/track` performs Zod validation, site configuration
  lookup, bot/exclusion decisions, identity creation, session resolution, and
  queue admission before returning `{ success: true }`. The official API page
  documents the endpoint and response shape but does not define the response as
  a durable receipt ([sending events](https://rybbit.com/docs/api/sending-events),
  [track handler](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/trackEvent.ts#L17-L68)).
- **[Fact]** `pageviewQueue.add()` only pushes the normalized payload into a
  JavaScript array. The queue flushes at most 5,000 rows every 1,000 ms, then
  performs geolocation enrichment and awaits one ClickHouse batch insert
  ([pageview queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/pageviewQueue.ts#L15-L50)).
- **[Fact]** The queue removes the batch before processing. If enrichment or the
  ClickHouse insert fails, the catch block logs the error and does not requeue
  the batch ([pageview queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/pageviewQueue.ts#L42-L48,L129-L141)).
- **[Fact]** The default Docker configuration enables ClickHouse asynchronous
  inserts and `wait_for_async_insert=1`. This makes the queue's later insert
  wait for ClickHouse's configured async-insert response, but the source does
  not define that as an end-to-end application acknowledgment
  ([Docker Compose](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml#L221-L240)).
- **[Inference]** There are at least three separate points after the HTTP
  response: process-local queue admission, ClickHouse insert completion, and
  report visibility. They should not be represented by one `success` value.
- **[Fact]** The backend defaults to four cluster workers in the official
  Compose file. The pageview and bot queues are module-local singletons, so
  each worker has its own queue and flush timer
  ([Compose](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml#L103-L147),
  [cluster](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/cluster.ts#L24-L63)).
- **[Inference]** In a clustered deployment, acknowledged events can be lost
  independently in any worker's memory. A worker restart does not provide a
  source-level replay path for the lost queue contents.

### Exclusions, limits, and bot events

- **[Fact]** Excluded traffic and over-limit traffic receive HTTP 200 responses
  even though no ordinary event row is written. Enforced bots also receive a
  successful response while being diverted to `bot_events`
  ([ingestion pipeline](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/ingestEvent.ts#L49-L67,L93-L101),
  [bot queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/botBlocking/botEventQueue.ts#L14-L99)).
- **[Fact]** Bot and bot-observation queues use the same 5,000-row/1-second
  in-memory batching pattern and also drop a failed batch after logging it. The
  repository's bot-blocking README explicitly says these rows are a sample, not
  a ledger ([bot-blocking README](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/botBlocking/README.md#L17-L21),
  [bot queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/botBlocking/botEventQueue.ts#L17-L99)).
- **[Inference]** Rybbit's HTTP success means "the request was accepted by the
  current ingestion path," not "the requested analytics fact is durable" and
  not necessarily "the event belongs in the ordinary analytics table."

### Session replay acknowledgment

- **[Fact]** The browser buffers replay events and sends batches when the buffer
  reaches its configured size or interval. A failed request requeues the batch
  in browser memory ([replay tracker](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/analytics-script/sessionReplay.ts#L207-L257)).
- **[Fact]** The server stores a Cloud replay batch in R2 first when configured,
  then inserts replay event metadata into ClickHouse. If R2 storage fails it
  falls back to storing event data in ClickHouse; the handler awaits the replay
  service before returning success
  ([replay handler](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/sessionReplay/recordSessionReplay.ts#L57-L139),
  [replay ingest](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/replay/sessionReplayIngestService.ts#L73-L167)).
- **[Unknown]** The reviewed replay path has sequence numbers within a batch,
  but it does not establish a cross-request idempotency key. A retry after an
  ambiguous response may therefore require downstream duplicate handling.

## Canonical OLTP-like state

### PostgreSQL control plane

- **[Fact]** PostgreSQL stores `sites` and collection configuration such as
  bot blocking, salting, exclusions, replay, URL-parameter tracking, raw-IP
  tracking, tags, and API/private-link keys
  ([PostgreSQL schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/postgres/schema.ts#L60-L105)).
- **[Fact]** PostgreSQL also stores user accounts, organizations, access
  control, goals, funnels, dashboards, feature flags, experiments, GSC
  connections, and import status. The `import_status` row tracks imported,
  skipped, invalid, started, and completed counts
  ([PostgreSQL schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/postgres/schema.ts#L120-L130,L451-L517,L524-L624)).
- **[Fact]** Site configuration is read from PostgreSQL and cached in each
  backend process for 60 seconds. A write invalidates the cache in the process
  that handled the write; sibling workers can retain the previous value for up
  to the cache TTL
  ([site configuration](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/lib/siteConfig.ts#L41-L50,L161-L205)).
- **[Inference]** PostgreSQL is the canonical owner of control-plane state;
  the in-process configuration cache is a read optimization, not an authority.
- **[Mismatch]** The architecture page's event flow says session state is
  updated in PostgreSQL. The current source uses Redis for active session
  resolution, while the PostgreSQL `active_sessions` table is explicitly
  deprecated and no longer read or written
  ([architecture](https://rybbit.com/docs/architecture),
  [sessions service](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/sessions/sessionsService.ts#L6-L10),
  [schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/postgres/schema.ts#L107-L118)).

### Identity and active sessions

- **[Fact]** Identified profiles and anonymous-to-identified aliases are
  PostgreSQL rows. Profiles hold JSON traits; aliases are unique by
  `(site_id, anonymous_id)` and point to the supplied identified user ID
  ([identity schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/postgres/schema.ts#L543-L577)).
- **[Fact]** Active sessions are Redis keys with a sliding 30-minute TTL. An
  identified session key hashes the anonymous fingerprint and custom user ID;
  anonymous sessions use the site and fingerprint directly
  ([sessions service](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/sessions/sessionsService.ts#L25-L75),
  [Redis session script](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/redis/redis.ts#L48-L81)).
- **[Fact]** Redis has AOF enabled with `appendfsync everysec` in the supplied
  Compose configuration, but there is no transaction coupling a Redis session
  update to the later ClickHouse event insert
  ([Compose](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml#L73-L101)).
- **[Inference]** Redis can preserve active-session continuity across ordinary
  process restarts when its AOF is available, but it is not the canonical raw
  event store and does not make event acceptance durable.

## Raw events, deduplication, identity, and configuration

### Raw event representation

- **[Fact]** The `events` row is normalized and enriched before insertion. It
  contains site/time/session identifiers, anonymous and identified IDs, URL and
  attribution fields, parsed device/location fields, event kind/name, JSON
  properties, optional performance values, optional raw IP, URL parameters,
  feature flags, and ASN fields
  ([pageview queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/pageviewQueue.ts#L81-L126),
  [ClickHouse schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/core.ts#L87-L133)).
- **[Fact]** The raw request schema is strict and bounds paths, query strings,
  titles, IDs, event names, and JSON properties, but it has no event ID or
  receipt ID field
  ([tracking payload schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/trackingPayload.ts#L4-L26,L52-L239)).

### Deduplication and replay

- **[Fact]** The main event table uses `MergeTree`, not an engine or schema key
  that expresses one logical row per client event. Its order key is only
  `(site_id, timestamp)`
  ([core schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/core.ts#L87-L133)).
- **[Fact]** The browser tracker has a 60-second in-memory dedupe cache for
  identical JavaScript errors. This is a narrow client behavior, not general
  event idempotency
  ([tracker error dedupe](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/analytics-script/tracking.ts#L355-L381)).
- **[Inference]** Replaying a normal pageview or custom-event request can create
  another ClickHouse event row. The source does not establish an at-most-once,
  exactly-once, or changed-payload conflict contract.
- **[Fact]** The lite-dashboard backfill script says materialized views see only
  new inserts, and re-running an `AggregatingMergeTree` backfill is not
  idempotent without truncating targets first
  ([lite-dashboard backfill](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/scripts/backfillLiteDashboardMVs.ts#L1-L19)).
- **[Cimi implication]** Event ID uniqueness and changed-payload detection must
  be SQLite invariants, not properties delegated to DuckDB merge behavior or
  query-time deduplication.

### Identity semantics

- **[Fact]** The default anonymous identity is a truncated SHA-256 hash of a
  bucketed IP and normalized user agent. A Site can add a deterministic daily
  salt; an explicit client `anonymous_id` is also hashed with the Site and salt
  ([user ID service](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/userId/userIdService.ts#L81-L136),
  [definitions](https://rybbit.com/docs/definitions#user-id),
  [site settings](https://rybbit.com/docs/site-settings#user-id-salting)).
- **[Fact]** Sticky identity re-attachment uses Redis state for recent
  datacenter-egress rotations. Candidate state lasts 15 minutes, seen state 30
  minutes, and an alias decision 24 hours; when Redis is unavailable the source
  returns the raw fingerprint
  ([sticky identity](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/userId/stickyUserId.ts#L9-L26,L60-L104)).
- **[Fact]** A supplied identified user ID is preserved as a separate
  `identified_user_id` value, limited to 255 characters, and traits are merged
  in PostgreSQL with a 2 KiB identify-call limit
  ([identify handler](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/identifyService.ts#L14-L40,L133-L165),
  [identify documentation](https://rybbit.com/docs/identify-users#limits)).
- **[Fact]** Browser identify backfills a newly created alias asynchronously
  over the most recent 30 days. The dashboard identify route queues an
  unbounded/full-history backfill. The queue flushes every five minutes, limits
  each mutation to 5,000 identities, retries up to three attempts, and is
  process-local
  ([identify service](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/identifyService.ts#L38-L56),
  [identity backfill queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/identityBackfillQueue.ts#L16-L28,L49-L125),
  [dashboard identify](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/users/identifyUser.ts#L71-L87)).
- **[Fact]** The server drains the identity backfill queue during graceful
  shutdown, but the normal event and bot queues have no corresponding shutdown
  flush in the server shutdown path
  ([server shutdown](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/index.ts#L603-L638)).
- **[Mismatch]** Rybbit's official privacy/security pages describe anonymous
  tracking as using no local storage and no stored IP, while the identify docs
  and source persist identified IDs in local storage and allow `trackIp` to store
  raw IP. The specific feature docs and source are the stronger evidence for
  those enabled paths
  ([privacy](https://rybbit.com/privacy#how-we-process-ips),
  [security](https://rybbit.com/security#visitor-privacy-protection),
  [identify docs](https://rybbit.com/docs/identify-users#windowrybbitidentifyuseridtraits),
  [site settings](https://rybbit.com/docs/site-settings#track-ip-address)).

### Configuration ownership

- **[Fact]** Site configuration is PostgreSQL-owned and is loaded into the
  tracking request once before identity and policy decisions
  ([tracking request](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/trackingRequest.ts#L74-L112),
  [site config](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/lib/siteConfig.ts#L86-L133)).
- **[Fact]** Collection decisions include exclusions, bot policy, URL-parameter
  tracking, IP storage, session replay, and feature-specific flags. Exclusions
  happen before identity and session assignment
  ([ingestion order](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/ingestEvent.ts#L27-L45)).
- **[Inference]** Cimi should snapshot the effective Site policy version into
  SQLite at acceptance time. A later DuckDB replay should not reinterpret an
  already accepted event using a newer policy.

## OLAP, reporting storage, and projections

### ClickHouse raw and derived tables

- **[Fact]** The main event table has monthly partitioning, no TTL clause, and
  stores the event-level analytical fact. Session replay event and metadata
  tables have 30-day TTLs. Bot events have a 3-month TTL; bot observations have
  a 30-day TTL
  ([core schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/core.ts#L130-L184,L193-L236,L241-L312,L337-L395)).
- **[Fact]** Cloud usage has an hourly `SummingMergeTree` target with a 60-day
  TTL, populated by a materialized view over `events`
  ([cloud schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/cloud.ts#L3-L32)).
- **[Fact]** When `LITE_DASHBOARD` is enabled, Rybbit creates streaming
  materialized views for session, overview, pathname, country, and device
  rollups. The full dashboard still has raw-event query paths for filters and
  metrics not represented by those views
  ([ClickHouse initialization](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/clickhouse.ts#L8-L17),
  [lite dashboard schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/liteDashboard.ts#L55-L159),
  [lite query notes](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/lite/utils.ts#L1-L75)).
- **[Fact]** The session rollup is fed by insert-time partial rows into an
  `AggregatingMergeTree`; reads re-aggregate by session so the result is not
  dependent on background merges having completed. A separate refreshable
  session-hour view runs every hour
  ([lite dashboard schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/liteDashboard.ts#L59-L75,L272-L299)).
- **[Inference]** Rybbit's analytical boundary is raw ClickHouse events plus
  selective serving projections. It is not a general OLTP acceptance store
  followed by an independently rebuildable report database.

### Report query behavior

- **[Fact]** Standard overview metrics query `events` directly, deriving
  sessions, pageviews, users, bounce rate, and duration at query time
  ([site metrics](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/siteMetrics/siteMetrics.ts#L74-L126)).
- **[Fact]** First-party analytics queries set a 60-second ClickHouse maximum
  execution time. This is a query cost bound, not a freshness guarantee
  ([analytics query executor](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/utils/analyticsQuery.ts#L26-L45)).
- **[Fact]** A manual backfill script exists for the lite-dashboard targets,
  iterates month by month to reduce memory pressure, and recommends `FINAL`
  optimization after backfill. This is an operator recovery/backfill tool, not
  an automatic journal replay mechanism
  ([backfill script](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/scripts/backfillLiteDashboardMVs.ts#L1-L19,L148-L159,L204-L234)).

## Queues, batches, replay, and query freshness

### Queue and batch behavior

- **[Fact]** Ordinary events use a per-process 5,000-row queue with a one-second
  flush interval. Bot audit queues use the same pattern
  ([pageview queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/pageviewQueue.ts#L15-L47),
  [bot queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/botBlocking/botEventQueue.ts#L14-L40)).
- **[Fact]** Identity backfills use a separate process-local map, flush every
  five minutes, split mutations at 5,000 identities, and retry a failed
  assignment at most three times. Exhausted assignments remain anonymous
  ([identity queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/identityBackfillQueue.ts#L16-L28,L115-L197)).
- **[Fact]** Imports use a PostgreSQL import-status row and direct ClickHouse
  inserts. The endpoint accepts a 50 MB request body and an `isLastBatch` flag;
  it has no event-level replay or idempotency key in the import path
  ([route registration](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/index.ts#L456-L464),
  [batch import](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/sites/batchImportEvents.ts#L15-L29,L84-L120)).
- **[Unknown]** No durable, general-purpose event queue, dead-letter store, or
  operator command to replay all accepted tracking events was found in the
  reviewed source.

### Freshness

- **[Fact]** The backend's ordinary queue adds approximately a one-second
  batching opportunity before ClickHouse insertion, but the source has no
  end-to-end maximum from request response to query visibility
  ([pageview queue](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker/pageviewQueue.ts#L26-L50)).
- **[Fact]** The client defaults ordinary analytics queries to a 60-second
  `staleTime`; the event feed polls every two seconds and live-user count every
  ten seconds
  ([analytics query hook](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/client/src/api/analytics/useAnalyticsQuery.ts#L117-L132),
  [event polling](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/client/src/api/analytics/hooks/events/useGetEvents.ts#L11-L27),
  [live count](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/client/src/api/analytics/hooks/useGetLiveUserCount.ts#L4-L15)).
- **[Fact]** The refreshable lite session-hour projection runs hourly. The
  widget response is publicly cacheable for 60 seconds
  ([lite view](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/liteDashboard.ts#L3-L30),
  [widget route](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/client/src/app/widget/[siteId]/route.ts#L327-L335)).
- **[Fact]** Rybbit documentation calls the product real-time, but it does not
  publish one freshness SLA covering raw events, all reports, materialized
  views, and client caches ([architecture](https://rybbit.com/docs/architecture)).
- **[Inference]** Cimi should expose `acceptedThrough`, `projectedThrough`, and
  report freshness separately rather than treating a successful collection
  response as read-after-write visibility.

## Retention, deletion, backup, and recovery

### Retention

- **[Fact]** The official privacy policy says self-hosted retention is
  administrator-configurable and Cloud retention is 3 years for Standard, 5
  years for Pro, and indefinite for Enterprise
  ([privacy policy](https://rybbit.com/privacy#data-retention)).
- **[Fact]** The inspected current DDL has no TTL on the main `events` table,
  while replay, bot, observation, and cloud usage tables have explicit TTLs as
  listed above. The reviewed source does not show the general mechanism that
  enforces the documented Cloud/main-event retention policy.
- **[Fact]** The managing-installation documentation gives operators a direct
  command to change replay TTLs, with 30 days as the default
  ([managing installation](https://rybbit.com/docs/managing-your-installation#edit-session-replay-retention-policy)).
- **[Inference]** Partitioning is not itself a retention policy. Cimi should
  keep policy ownership and deletion work state in SQLite, not infer lifecycle
  completion from DuckDB partitions or ClickHouse table layout.

### Deletion

- **[Fact]** The official site-settings page promises that deleting a Site
  permanently deletes all associated analytics, reports, funnels, and goals
  ([site settings](https://rybbit.com/docs/site-settings#delete-site)).
- **[Fact]** The current Site deletion source deletes only
  `session_replay_events` and `session_replay_metadata_v2` in ClickHouse, then
  deletes the PostgreSQL Site row. It does not issue a delete for the main
  `events`, `bot_events`, or `bot_observations` tables
  ([site deletion lifecycle](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/sites/siteConfigurationLifecycle.ts#L369-L385)).
- **[Fact]** Individual user deletion removes matching `events`, replay event,
  and replay metadata-v2 rows, deletes profile and aliases, and attempts to
  remove R2 replay batches. R2 deletion is best-effort and bot tables are not in
  the explicit ClickHouse deletion list
  ([user deletion](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/analytics/users/deleteUser.ts#L16-L87)).
- **[Fact]** Completed import deletion submits a ClickHouse delete for rows with
  the import ID and then deletes the PostgreSQL import-status row; the source
  does not establish when the ClickHouse mutation is physically complete
  ([import deletion](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/api/sites/deleteSiteImport.ts#L72-L92)).
- **[Inference]** Rybbit demonstrates why logical disappearance, analytical
  deletion, object-storage deletion, and backup deletion need separate states
  in Cimi. Cimi should not report erasure complete until SQLite, DuckDB, replay
  storage, exports, and applicable backups satisfy the policy.

### Backups and recovery

- **[Fact]** The official repository contains separate operational backup
  scripts. PostgreSQL backups use `pg_dump` plus cluster globals and checksums;
  ClickHouse backups use native `BACKUP` to S3 or a local backup disk. The
  repository says these scripts do not archive live Docker volumes
  ([backup README](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/ops/backups/README.md#database-backups),
  [PostgreSQL backup](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/ops/backups/bin/backup-postgres.sh#L63-L86),
  [ClickHouse backup](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/ops/backups/bin/backup-clickhouse.sh#L73-L124)).
- **[Fact]** The checked-in timers schedule PostgreSQL backups every six hours
  and ClickHouse backups daily with randomized delay. The README recommends
  monthly restore drills and B2 lifecycle retention
  ([PostgreSQL timer](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/ops/backups/systemd/rybbit-postgres-backup.timer#L1-L11),
  [ClickHouse timer](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/ops/backups/systemd/rybbit-clickhouse-backup.timer#L1-L11),
  [restore drills](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/ops/backups/README.md#test-manually-then-enable-timers)).
- **[Fact]** The application Compose file itself defines persistent PostgreSQL,
  ClickHouse, Redis, and optional Caddy volumes but no coordinated backup job
  ([Compose volumes](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml#L171-L176)).
- **[Unknown]** The reviewed backup material does not establish one atomic
  checkpoint across PostgreSQL, ClickHouse, Redis, R2, configuration files, and
  in-memory queues, nor an application-wide RPO/RTO guarantee.

## Deployment and resource assumptions

- **[Fact]** The official quick-start guide recommends a VPS with at least 2 GB
  RAM, a domain with HTTPS, Docker, and Ubuntu 24 LTS x86_64; ARM deployments
  require at least ARMv8.2-A for ClickHouse
  ([quick start](https://rybbit.com/docs/self-hosting#prerequisites)).
- **[Fact]** The manual Compose topology has client, backend, PostgreSQL,
  ClickHouse, Redis, and optional Caddy services. The backend is exposed on
  port 3001, the client on 3002, and database ports are localhost-only by
  default ([manual self-hosting](https://rybbit.com/docs/self-hosting-guides/self-hosting-manual#service-architecture),
  [Compose](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml#L23-L169)).
- **[Fact]** The current Compose configuration gives ClickHouse an 80% RAM
  server-memory ratio, limits merge/mutation memory to 25% of RAM, bounds
  individual queries at 32 GB, and sets a 16-thread maximum. These are
  operating defaults, not a capacity guarantee
  ([ClickHouse resource settings](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml#L208-L240)).
- **[Fact]** Redis is configured with AOF `everysec` and `noeviction`; sessions
  use 30-minute TTLs to bound active-session memory
  ([Compose Redis](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml#L73-L101)).
- **[Inference]** Rybbit's supported self-host shape assumes multiple stateful
  services and enough disk/RAM for ClickHouse merges, replay payloads, and
  PostgreSQL. Cimi's one-installation SQLite plus DuckDB design must document
  its own SQLite writer, DuckDB writer, temporary spill, disk-growth, and
  rebuild-time envelope instead of copying Rybbit's service topology.
- **[Unknown]** No official event-rate, site-count, concurrent-query, disk
  growth, ClickHouse-part, or report-latency capacity target was established.

## Explicit unknowns

1. Whether ClickHouse's configured async insert is durable across process crash,
   host crash, and power loss at the supported deployment settings.
2. The exact meaning of `/api/track` HTTP 200 after the event enters the
   process-local queue, including loss behavior during worker restart.
3. Whether any Cloud-only infrastructure outside the public repository adds a
   durable event transport, retry queue, dead-letter store, or deduplication.
4. Whether the deployed Cloud version exactly matches commit `64f8c4f`.
5. Whether ordinary event retries are deduplicated anywhere outside the
   inspected request schema and ClickHouse table definitions.
6. Whether all report surfaces use raw events or a projection for a given
   query, and the maximum lag of each projection.
7. Whether an active Redis session can be deterministically reconstructed after
   Redis loss, rather than only starting a new session.
8. Whether identity backfill assignments survive a process crash before the
   five-minute flush or after three failed attempts.
9. The complete retention enforcement path for main events, profiles, aliases,
   bot rows, imports, R2 objects, logs, and backups.
10. Whether Site deletion is intended to remove main events and bot tables even
    though the reviewed source does not issue those deletes.
11. Whether R2 object deletion, ClickHouse mutation completion, and backup purge
    are observable as one user-visible erasure state.
12. Whether the operational backup scripts and host map are the supported
    recovery contract for ordinary self-hosted installations.
13. A coordinated cross-store backup consistency point, RPO, RTO, and restore
    ordering for PostgreSQL, ClickHouse, Redis, and R2.
14. The supported capacity envelope for the default four-worker backend and
    ClickHouse resource settings.

## Concrete implications for Cimi's SQLite plus DuckDB boundary

1. **Keep SQLite as the durable acceptance boundary.** Append the normalized
   event, Site scope, Event ID, payload fingerprint, receipt/occurrence times,
   effective policy version, acceptance state, and replay sequence before
   acknowledging collection.
2. **Make acknowledgment semantics explicit.** `accepted` should mean
   recoverable in SQLite; `projected` should mean present in DuckDB; neither
   should imply that a report has the newest accepted event unless the response
   says so.
3. **Keep deduplication in SQLite.** Enforce Site-scoped Event ID uniqueness for
   the complete raw retention period and return a changed-payload conflict
   rather than silently replacing an accepted event.
4. **Treat DuckDB as derived analytical state.** Project immutable accepted rows
   in batches, make writes idempotent, and persist a projector cursor, retry
   state, projection version, and lag watermark in SQLite.
5. **Do not make materialized views the recovery source.** Rybbit's views see
   only inserts and require a manual, non-idempotent backfill procedure. Cimi
   should rebuild DuckDB projections from SQLite without depending on a view
   target's prior contents.
6. **Keep configuration and identity ownership in SQLite.** Store policy and
   identity snapshots with accepted events so replay does not change historical
   meaning when current Site settings change.
7. **Separate active session state from recoverable session history.** A Redis-
   like cache can accelerate session assignment, but Cimi must be able to
   reconstruct or checkpoint session state from the accepted journal.
8. **Define retention and deletion across every layer.** Raw journal rows,
   DuckDB facts, report projections, identity profiles, replay data, exports,
   logs, and backups need explicit policy and completion states.
9. **Back up the authority and rebuild the projection.** SQLite is the
   correctness anchor; DuckDB can be copied for faster repair but is not
   required for backup correctness and must remain rebuildable from SQLite.
10. **Document the single-installation envelope.** State SQLite concurrency,
    DuckDB single-writer ownership, temporary disk requirements, accepted
    backlog behavior, restore duration, and the failure response when the
    acceptance boundary is unavailable.

## Primary sources

### Official Rybbit documentation

- [Architecture](https://rybbit.com/docs/architecture)
- [Quick start self-hosting](https://rybbit.com/docs/self-hosting)
- [Manual Docker Compose setup](https://rybbit.com/docs/self-hosting-guides/self-hosting-manual)
- [Managing your installation](https://rybbit.com/docs/managing-your-installation)
- [Sending events API](https://rybbit.com/docs/api/sending-events)
- [Identify users](https://rybbit.com/docs/identify-users)
- [Definitions](https://rybbit.com/docs/definitions)
- [Site settings](https://rybbit.com/docs/site-settings)
- [Session replay](https://rybbit.com/docs/feature-guides/session-replay)
- [Privacy policy](https://rybbit.com/privacy)
- [Security](https://rybbit.com/security)
- [Data import](https://rybbit.com/docs/data-import)

### Official Rybbit source

- [Pinned repository commit](https://github.com/rybbit-io/rybbit/tree/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2)
- [Docker Compose](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/docker-compose.yml)
- [Tracker ingestion](https://github.com/rybbit-io/rybbit/tree/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/services/tracker)
- [PostgreSQL schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/postgres/schema.ts)
- [ClickHouse schema](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/core.ts)
- [Lite dashboard projections](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/server/src/db/clickhouse/schema/liteDashboard.ts)
- [Backup runbook](https://github.com/rybbit-io/rybbit/blob/64f8c4fb7f394bdfe9379717de8e6c21758b1ac2/ops/backups/README.md)
