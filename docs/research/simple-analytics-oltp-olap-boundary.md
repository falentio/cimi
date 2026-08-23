# Simple Analytics: OLTP/OLAP Boundary Research

Research for Cimi wayfinding issue [#24](https://github.com/falentio/cimi/issues/24).
Sources were reviewed on 2026-08-23. This track covers Simple Analytics only.
Research used current official documentation and first-party repositories, with
current web discovery through Exa. No product code was changed.

## Status vocabulary

- **Fact:** stated by Simple Analytics documentation, emitted by the official
  scripts, or implemented in a first-party repository.
- **Inference:** an architectural conclusion from those facts. It is useful for
  Cimi, but is not a Simple Analytics commitment.
- **Unknown:** not specified by the reviewed first-party evidence.

## Executive Finding

Simple Analytics exposes a clear **logical** separation between raw datapoints
and reporting queries:

- The ingestion surface accepts pageviews, events, and append data.
- The Export API returns raw, unsampled datapoints from the database.
- The Stats API returns dashboard-style aggregates such as pageviews, unique
  pageviews, histograms, dimensions, event totals, and median seconds on page.

The public architecture evidence is incomplete. A 2021 official engineering
post describes an evolution from PostgreSQL plus aggregate cache tables to a
new Elasticsearch-based data structure used by the APIs. The current official
repositories expose the browser scripts, documentation, and an export adapter,
not the hosted ingestion/dashboard implementation. Therefore the current
database engine, durable commit point, queue implementation, projection jobs,
and recovery topology remain unknown.

The strongest Cimi lesson is boundary-oriented rather than engine-oriented:
acknowledgment, configuration, ownership, and replay state must not depend on a
reporting projection being fresh. SQLite should own the durable operational
journal and control state; DuckDB should own rebuildable analytical facts and
projections, subject to Cimi's later issue #14 decision.

## Source Register

All sources below are first-party Simple Analytics sources or repositories.

| ID | Source | Evidence used |
| --- | --- | --- |
| S1 | [Server-side tracking](https://docs.simpleanalytics.com/events/server-side) | JSON ingestion endpoint, payloads, "within minutes" visibility statement |
| S2 | [Proxy setup](https://docs.simpleanalytics.com/proxy) | `simple.gif` validation and documented HTTP 202 response |
| S3 | [Official scripts source](https://github.com/simpleanalytics/scripts/blob/main/src/default.js) | Per-request image/beacon transport, generated IDs, in-memory queue, no client retry |
| S4 | [Events documentation](https://docs.simpleanalytics.com/events) | Event normalization, 200-character limit, page-load grouping, callback behavior |
| S5 | [Data collection](https://docs.simpleanalytics.com/data-collection) | Collected IDs, no visitor/browser/device ID, no cookies/storage/IP |
| S6 | [Export API](https://docs.simpleanalytics.com/api/export-data-points) | Raw unsampled export, fields, metadata, direct database streaming, hourly constraints |
| S7 | [Stats API](https://docs.simpleanalytics.com/api/stats) | Aggregate reporting contract, metrics, dimensions, filters, event totals |
| S8 | [Official architecture post](https://github.com/simpleanalytics/blog/blob/master/_posts/2021-03-08-ready-for-the-future.md) | Historical PostgreSQL/cache-table design and Elasticsearch-based replacement |
| S9 | [Official CloudQuery source repository](https://github.com/simpleanalytics/cq-source-simpleanalytics) | Export schema, incremental cursor, overlap, duplicate and identity caveats |
| S10 | [CloudQuery pageview resolver](https://github.com/simpleanalytics/cq-source-simpleanalytics/blob/main/resources/services/page_views.go) | Pageview export fields, `Hostname` + `UUID` adapter key, 24-hour overlap |
| S11 | [CloudQuery event resolver](https://github.com/simpleanalytics/cq-source-simpleanalytics/blob/main/resources/services/events.go) | Event export fields, no guaranteed event key, synthetic downstream ID, overlap |
| S12 | [Data security and ownership](https://docs.simpleanalytics.com/data-security-and-ownership) | Hosting, encryption, retention, backup and deletion timing |
| S13 | [Account deletion](https://docs.simpleanalytics.com/delete-account) | Team/site deletion, logs/backups retained 90 days, domain hash retention |
| S14 | [Simple Analytics APIs](https://docs.simpleanalytics.com/api) | Stats, raw export, and Admin API separation |
| S15 | [Official scripts README](https://github.com/simpleanalytics/scripts) | Public-source scope and script deployment targets |

The vendored source snapshot in this repository is the official scripts
repository at commit `c14b694` (2026-08-17):
`docs/research/vendor/simple-analytics/src/default.js`.

## Ingestion Boundary

### Acknowledgment

**Facts**

- Server-side and mobile submissions use `POST` JSON to
  `https://queue.simpleanalyticscdn.com/events` (S1).
- The browser script sends pageviews and ordinary events as individual image
  requests to `/simple.gif`; lifecycle append data uses either another image
  request or `navigator.sendBeacon` to `/append` (S3; local snapshot lines
  `312-345` and `605-634`).
- The proxy documentation says a working `simple.gif` request returns a GIF
  with HTTP status `202` (S2).
- Server-side documentation says submitted data should appear on the dashboard
  "within minutes," and can then be found in the Events Explorer or raw export
  (S1).

**Inference**

`202 Accepted` is evidence of transport/service acceptance for the pixel path,
not evidence that the datapoint is durably committed to the canonical store or
that all report projections have materialized it. The reviewed sources do not
define the `/events` response body or status as a durable-write receipt.

**Unknown**

- Whether `202` means persisted to a durable queue, accepted by an edge, or
  committed to the primary data store.
- Whether `/events` and `/append` return the same status and semantics as
  `/simple.gif`.
- Whether an accepted request can later be discarded during validation,
  enrichment, queue failure, or projection failure.
- Whether the service provides an ingestion ID, commit timestamp, or receipt
  that callers can use for reconciliation.

### Client delivery and durability

**Facts**

- The official script creates one `Image`, assigns its URL once, and only wires
  the optional event callback to image `load`/`error`; it does not schedule a
  retry (S3; local snapshot lines `312-345`).
- `sendBeacon` is called once for append data and its boolean result is ignored
  (S3; local snapshot lines `629-634`).
- The pre-load event helper stores calls in `window.sa_event.q`, an in-memory
  JavaScript queue drained when the script initializes (S3, S4; local snapshot
  lines `1038-1052`).
- The script has no visible offline storage, reconnect loop, persistent queue,
  exponential backoff, or replay marker (S3).

**Inference**

The browser-side delivery model is best-effort transport. A browser request
being issued or an image callback firing is not a vendor-documented durability
guarantee.

**Cimi implication**

Cimi should define the acceptance boundary independently of the client
transport: write a receipt/acceptance journal transaction in SQLite before
returning a success response. DuckDB visibility should be a separate,
observable projection stage.

## Canonical Ownership

### Sites, configuration, and account state

**Facts**

- The Admin API is the documented surface for users, websites, and settings;
  website visibility and timezone are examples of managed settings (S14 and
  [Admin API](https://docs.simpleanalytics.com/api/admin)).
- Collection controls such as ignored metrics, DNT handling, hostname override,
  page exclusions, and metadata are supplied through the script/configuration
  integration and affect what is sent (S3, S5, and
  [ignore metrics](https://docs.simpleanalytics.com/ignore-metrics)).
- Simple Analytics says the customer owns the analytics data and can export it
  (S6, S12).

**Inference**

There are two logical configuration owners: account/site/team settings belong
to the control plane, while collection policy is partly owned by the installed
client or server-side integration. The reviewed evidence does not establish
whether those control-plane records use PostgreSQL, SQLite, or another store.

**Unknown**

- The current relational schema for accounts, teams, sites, roles, goals,
  custom views, settings, and API credentials.
- Whether configuration changes are versioned, audited, or applied to events by
  ingestion-time snapshot versus query-time lookup.
- Whether a deleted or transferred site retains historical configuration
  versions.

### Raw pageviews and events

**Facts**

- The Export API describes raw, unsampled data points and says pageviews and
  events are exportable with selected fields (S6).
- Current export fields include ingestion-like timestamps (`added_unix`,
  `added_iso`), page/event attributes, linkage IDs, robot/unique flags, and
  typed metadata (S6).
- Metadata is attached to pageviews or events, is available to Goals, Events
  Explorer, and exports, and is constrained to scalar values with a documented
  prohibition on personal data (S4 and
  [metadata](https://docs.simpleanalytics.com/metadata)).
- The official CloudQuery adapter materializes two downstream tables,
  `simple_analytics_page_views` and `simple_analytics_events`, by streaming the
  raw export (S9-S11). This is adapter schema evidence, not proof of the
  vendor's internal tables.

**Inference**

The raw datapoint is the most plausible canonical analytical fact because both
raw export and aggregate reporting are exposed from the service, and the
official architecture post says the newer database system also powers the
APIs. This remains an inference about the current design, not a published
schema guarantee.

### Identity and deduplication

**Facts**

- Simple Analytics explicitly says it does not create an ID for a user,
  browser, or device, and does not use cookies, local storage, fingerprinting,
  or IP-address hashing (S5).
- The page-load ID is random and in memory; it links pageviews/events during
  one actual page load and resets on reload/full navigation. The legacy export
  name `session_id` remains for compatibility (S4-S6).
- The "visitors" metric is unique pageviews derived from referrer behavior, not
  distinct people tracked across sessions (S5, S7, and
  [unique visits](https://docs.simpleanalytics.com/explained/unique-visits)).
- The Export API documents a UUID field that "is not always unique" (S6).
- The official CloudQuery pageview resolver uses `Hostname` + `UUID` as its
  adapter primary key, while its event resolver explicitly says events do not
  always have UUIDs and uses a synthetic `_cq_id` instead (S10, S11).
- The same adapter deliberately re-reads a 24-hour overlap to tolerate delayed
  datapoints. Its comment says this causes duplicates and is intended to
  guarantee at-least-once delivery; downstream deduplication is required
  (S10, S11).

**Inference**

Simple Analytics' visitor model does not require a durable visitor entity. Its
canonical identity problem is datapoint/linkage identity, not person identity.
UUID alone is not sufficient evidence for a universal idempotency key.

**Unknown**

- Whether the hosted ingestion service deduplicates repeated requests.
- Whether UUID, page ID, page-load ID, or a server-generated key participates in
  any server-side uniqueness rule.
- Whether retries of the same client request are counted twice.
- Whether an event with the same name and metadata is intentionally a new event
  every time.

**Cimi implication**

Preserve a Cimi-owned receipt ID and payload hash in the SQLite acceptance
journal even when a source/client ID is present. Make deduplication an explicit
policy, not an accidental unique constraint on an analytics UUID.

## Reporting and Analytical Storage

### Documented logical surfaces

**Facts**

- The Stats API is the aggregate API for dashboard statistics (S7). It returns
  pageviews, unique pageviews, histograms, dimensions, event totals, and median
  seconds on page.
- The Export API is the raw-level API and supports selected-field, unsampled
  exports, including events and pageviews (S6, S14).
- Simple Analytics says large exports stream directly from its database to the
  caller without a heavy load on the service (S6).
- Events Explorer and Goals consume events and metadata, while Stats API event
  queries return counts by event name (S1, S4, S7).

**Inference**

The logical read model has at least two classes:

1. Raw analytical facts for export and event exploration.
2. Aggregate/reporting reads for dashboard metrics and charts.

The aggregate API may query indexed raw facts, precomputed projections, or
both. The public contract does not identify the implementation.

### Historical engine evidence

**Fact, dated**

The official March 2021 engineering post says the first implementation used
PostgreSQL to store all pageviews and later added caching tables with aggregate
data. It then describes a replacement data structure built on Elastic and
shows an Elasticsearch query against a `pageviews-*` index. The post says this
new database system was used for the APIs (S8).

**Inference**

At least in 2021, Simple Analytics had an evolution from relational raw state
plus aggregate caches toward a search/index-oriented analytical store. This is
consistent with the current split between raw export and aggregate Stats API,
but it does not prove the 2026 deployment still uses Elasticsearch or the same
index names.

**Unknown**

- Current raw-event engine and index/table layout.
- Whether raw data is the source of truth for reports or is itself copied from
  another canonical store.
- Materializer job, projection table, cache invalidation, and backfill design.
- Whether Stats, dashboard, Events Explorer, and Export read the same snapshot.

## Queues, Batches, Replay, and Freshness

**Facts**

- The public ingestion hostname is explicitly named `queue.simpleanalyticscdn.com`
  (S1, S3), but no queue implementation is published.
- The browser source emits one pageview/event request at a time; the visible
  pre-load queue is a local JavaScript queue, not a server batch queue (S3, S4).
- Server-side documentation promises dashboard visibility within minutes, not a
  fixed freshness SLA or ordering guarantee (S1).
- The official export adapter reads date windows as streamed NDJSON, keeps an
  incremental cursor when configured, subtracts one day from the cursor, and
  accepts downstream duplicates to provide at-least-once extraction (S9-S11).

**Inference**

The adapter's one-day overlap is strong evidence that consumers must account for
late-arriving datapoints. It is not evidence that Simple Analytics itself uses
the same overlap, queue, or retry algorithm.

**Unknown**

- Queue durability, partitioning, batch size, worker retry/backoff, dead-letter
  handling, and ordering.
- Any vendor-provided replay or reprocessing endpoint.
- Whether raw export includes late-arriving records after the original query
  window and for how long.
- Freshness separately for raw export, Stats API, dashboard, Goals, and Events
  Explorer.

**Cimi implication**

Model two clocks: `accepted_at` for durable SQLite acceptance and
`materialized_at` for DuckDB/report visibility. Projection workers should use
overlap or a replay window and be idempotent. Expose the last materialized point
or freshness state rather than implying that an HTTP acceptance response means
the report is current.

## Retention, Deletion, Backup, and Recovery

### Documented lifecycle

**Facts**

- Simple Analytics retains customer data while the account is active and in
  line with the subscription plan (S12).
- Deleting a team deletes its websites and analytics data. Account deletion can
  leave teams that the user does not delete in place (S13).
- The service says data is deleted immediately on account deletion but becomes
  permanently deleted after 90 days (S12).
- Error logs and database backups are retained for 90 days; deleted website
  domain hashes are retained to prevent domain relinking (S13).
- The service says data is encrypted at rest and in transit, regularly backed
  up, hosted in the Netherlands, and served partly through Bunny CDN; named
  infrastructure providers are Worldstream and Leaseweb (S12).
- Customers can export raw data before deletion and former customers can retain
  the export (S6, S12).

**Inference**

"Deleted immediately" should be interpreted as removal from the active service,
while the 90-day statement describes backup/log or permanent-erasure timing.
The docs do not establish whether all analytical indexes, caches, exports, and
backups follow exactly the same deletion schedule.

**Unknown**

- Exact retention periods by plan and whether they apply equally to raw facts,
  aggregates, logs, and metadata.
- Backup frequency, backup consistency point, encryption/key recovery process,
  restore testing, RPO, RTO, and regional failure behavior.
- Whether deletion is implemented by tombstone, purge job, index deletion,
  cryptographic erasure, or another mechanism.
- Whether deletion propagates synchronously to every report projection and
  backup copy.
- Per-datapoint or per-visitor deletion. A per-visitor workflow is especially
  unclear because the product does not create visitor identity.

**Cimi implication**

Keep retention policy, deletion jobs, backup state, and projection cursors in
SQLite. Treat DuckDB as rebuildable and make deletion a cross-store workflow,
not only a row delete in the analytical file. Define Cimi's active deletion,
backup purge, RPO, and RTO explicitly instead of importing Simple Analytics'
informal 90-day wording.

## Deployment and Resource Assumptions

**Facts**

- Simple Analytics is a hosted SaaS with analytics data in the Netherlands/EU;
  the docs name Worldstream and Leaseweb for servers and Bunny CDN for content
  delivery (S12).
- Collection has distinct script, queue, and API hosts and can be routed through
  customer-controlled NGINX, Caddy, Netlify, or Vercel proxies (S1-S3 and
  [proxy](https://docs.simpleanalytics.com/proxy)).
- The public `scripts` repository is specifically visitor-facing scripts. Its
  README documents CDN deployment and custom-domain SSH deployment, not the
  hosted ingestion or dashboard service (S15).
- The official CloudQuery guide demonstrates exporting to SQLite and BigQuery;
  the guide describes those as customer-owned destinations, not Simple
  Analytics' internal stores (S9 and
  [CloudQuery guide](https://docs.simpleanalytics.com/export-to-data-warehouse-with-cloudquery)).

**Inference**

The historical Elastic evidence and current stream-export behavior suggest a
server-side indexed analytical workload, not a single local SQLite file. The
vendor's scale, shard, memory, CPU, disk, and tenancy assumptions cannot be
derived from the public script repository.

**Unknown**

- Current deployment topology, number of services, tenancy model, scaling
  triggers, and capacity limits.
- Whether the queue and database are colocated, replicated, or operated by
  separate teams/providers.
- Current Elasticsearch version or replacement engine, node counts, shard
  strategy, disk growth, compaction, and index rollover.
- Minimum resources and supported self-hosted deployment. The evidence reviewed
  describes a hosted service, not a self-hosting package.

## Consolidated Boundary Matrix

| Concern | Simple Analytics evidence | Confidence | Cimi boundary implication |
| --- | --- | --- | --- |
| Ingest acknowledgment | Pixel path documents HTTP 202; server-side docs only give eventual dashboard visibility | Partial | Ack only after SQLite acceptance transaction; do not equate 202 with report freshness |
| Durable canonical event | Raw unsampled export exists; backend commit semantics undisclosed | Partial | Keep an acceptance journal and immutable raw payload/receipt before projection |
| Control state | Admin API owns users, websites, and settings | Logical fact | SQLite owns sites, configuration, roles, policy, cursors, and lifecycle state |
| Raw facts | Pageviews/events are exportable with typed fields and metadata | Strong logical fact | DuckDB may hold analytical raw facts, but retain source and receipt identity |
| Visitor identity | No person/browser/device ID; page-load ID only | Strong | Do not introduce a visitor table unless Cimi explicitly chooses different semantics |
| Deduplication | UUID not always unique; event key not guaranteed; downstream adapter overlaps and dedups | Strong caution | Explicit idempotency/dedup policy and receipt hash; avoid UUID-only uniqueness |
| Reports | Stats API aggregates dashboard metrics; exact materialization unknown | Strong logical fact | Reports are projections/read models; track freshness and rebuild them |
| Replay | Export date windows and adapter overlap support consumer replay; vendor replay queue unknown | Partial | Use replay windows, persisted cursors, and idempotent projection writes |
| Retention/deletion | Active-account/plan retention, immediate active deletion, 90-day permanent/backup wording | Partial | Coordinate deletion across SQLite, DuckDB, and backup policy |
| Recovery | Regular encrypted backups claimed; restore/RPO/RTO undisclosed | Partial | Define and test Cimi backup/recovery guarantees explicitly |
| Deployment | Hosted EU service; historical Elastic evidence | Partial and dated | Treat DuckDB resource limits and SQLite concurrency as Cimi-owned decisions |

## Explicit Unknowns To Carry Forward

1. What exact event does Simple Analytics' ingestion response acknowledge?
2. Is the accepted datapoint durable before the response, or merely queued?
3. What is the current canonical database engine and schema in 2026?
4. Are Stats aggregates materialized, query-time, cached, or hybrid?
5. What retries, dead-letter handling, ordering, and replay exist inside the
   vendor service?
6. What server-side uniqueness or duplicate policy applies to UUIDs, page IDs,
   page-load IDs, and repeated requests?
7. What is the freshness bound for raw export versus each reporting surface?
8. What are plan-specific retention rules and deletion propagation guarantees?
9. What backup cadence, restore test, RPO, RTO, and key-recovery guarantees are
   provided?
10. What capacity, scaling, and self-hosting assumptions apply to the current
    service?

## Implications For Cimi Issue #14

These are boundary lessons, not a resolution of issue #14:

- Keep SQLite as the owner of operational truth: site/configuration state,
  acceptance receipts, idempotency/dedup decisions, retention/deletion state,
  and projection cursors.
- Treat DuckDB as an analytical projection: raw analytical facts, aggregates,
  histograms, dimensions, and report read models can be rebuilt from the
  accepted journal.
- Store both source event time and Cimi receipt/acceptance time. Simple
  Analytics' public model demonstrates that browser/server event time, delayed
  datapoints, and report visibility are distinct concerns.
- Preserve payloads and source IDs even when IDs look UUID-like. The official
  adapter's caveat that UUIDs are not always unique is a concrete warning
  against making them the only deduplication key.
- Make "accepted," "projected," and "query-fresh-through" separate states in
  health and API contracts.
- Use at-least-once projection with overlap/replay and idempotent writes. A
  rebuildable DuckDB file should not be the only place where accepted data or
  deletion intent exists.
- If Cimi adopts Simple Analytics' privacy model, model unique pageviews and
  page-load linkage rather than durable visitors. If Cimi needs identity, that
  is a deliberate product decision rather than something implied by this
  competitor.

## Evidence Limits

The public `simpleanalytics/scripts` repository is explicitly the visitor-facing
script project. The official organization also publishes docs, integrations,
and export tooling, but the reviewed public material does not include the
hosted ingestion, dashboard, or database implementation. The 2021 architecture
post is valuable first-party evidence but is historical. No claim above should
be read as a current source-code description of private backend behavior.
