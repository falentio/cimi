# Databuddy: OLTP/OLAP Boundary Research

Research for Cimi issue [#24](https://github.com/falentio/cimi/issues/24), limited to Databuddy. Sources were checked on **2026-08-23**. The official `databuddy-analytics/Databuddy` `main` branch resolves to commit [`d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3`](https://github.com/databuddy-analytics/Databuddy/commit/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3), committed 2026-08-21. The vendored checkout at `docs/research/vendor/databuddy` matches that commit and was used for line-addressable inspection. Web research used Exa against Databuddy's official documentation and repository.

## Evidence Labels

- **Documentation fact:** Databuddy states this in an official document.
- **Source fact:** The pinned official repository implements or represents this.
- **Inference:** A conclusion from the facts, not a Databuddy promise.
- **Unknown:** The reviewed official materials do not establish this.

## Executive Finding

Databuddy separates its control-plane relational state from analytics storage, but it does **not** expose a Cimi-like durable OLTP acceptance journal for raw events.

- **Source fact:** PostgreSQL owns organizations, websites, website configuration, API/auth state, and identified-profile state. The repository's own architecture map describes PostgreSQL as relational data and ClickHouse as analytics data ([official `CLAUDE.md`](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/CLAUDE.md)).
- **Source fact:** ClickHouse owns the canonical analytics event/span tables and serving tables. Basket sends directly to ClickHouse in self-host mode, or hands off to Kafka/Redpanda and Vector in the hosted path ([producer source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/producer.ts), [Vector source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/infra/ingest/vector.yaml)).
- **Source fact:** Redis provides bounded delivery reservations and deduplication state, not full-retention event ownership ([security source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/lib/security.ts)).
- **Inference:** Databuddy's successful ingestion response means that a delivery handoff or ClickHouse insert completed. It does not mean that a durable, replayable OLTP acceptance record exists, nor that a report query can see the event immediately.
- **Cimi implication:** Databuddy supports separating control state and analytics state, but Cimi should not copy its acknowledgment boundary. Cimi's SQLite acceptance journal can provide a stronger and simpler local recovery contract than the reviewed Databuddy event path.

## Ownership Map

| Concern                           | Databuddy owner                                                   | Evidence and meaning                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site and collection configuration | PostgreSQL `websites` row                                         | `id`, domain, status, public flag, organization, integrations, and `settings` including allowed origins/IPs are relational fields ([schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/drizzle/schema/websites.ts#L13-L69)).                                                                                                                                                             |
| Identified profile state          | PostgreSQL `profiles`, `profile_aliases`, `profile_trait_changes` | Profile state, anonymous-to-profile aliases, and trait history have relational keys and cascade relationships ([identity schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/drizzle/schema/identity.ts#L1-L106), [identify route](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/routes/identify.ts#L126-L200)).                |
| Raw standard analytics events     | ClickHouse `analytics.events`                                     | Stores page views, exits, context, IDs, properties, and timestamps in a replicated replacing table ([schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/clickhouse/schema/analytics/core/events.sql#L1-L56)).                                                                                                                                                                            |
| Raw custom events                 | ClickHouse `analytics.custom_events`                              | Separate table with owner/site scope, event payload, IDs, and delivery identity ([schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/clickhouse/schema/analytics/core/custom_events.sql#L1-L27)).                                                                                                                                                                                        |
| Errors and web vitals             | ClickHouse `error_spans` and `web_vitals_spans`                   | Separate span tables, each with stable delivery identity and replacing semantics ([errors](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/clickhouse/schema/analytics/errors/error_spans.sql#L1-L24), [vitals](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/clickhouse/schema/analytics/web-vitals/web_vitals_spans.sql#L1-L20)). |
| Delivery deduplication            | Redis first; ClickHouse replacement second                        | Redis suppresses concurrent/recent duplicates. Stable ClickHouse keys and `ReplacingMergeTree` reduce duplicate physical effects after delivery.                                                                                                                                                                                                                                                                                                      |
| Pageview projection               | ClickHouse materialized view and target table                     | `screen_view` events feed an identity-bearing daily pageview row ([view](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/pageviews/daily_pageviews_mv.sql#L1-L16), [target](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/clickhouse/schema/analytics/pageviews/daily_pageviews.sql#L1-L14)).    |
| Sessions and most reports         | Query-time ClickHouse builders                                    | No physical `analytics.sessions` table was found in the reviewed schema. Session builders group event rows by supplied `session_id` and calculate metrics at query time ([session builders](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/ai/src/query/builders/sessions.ts#L11-L54)).                                                                                                             |

## Ingestion Acknowledgment And Durability

### Client Boundary

- **Documentation fact:** The browser SDK batches by default, retries failed requests, and exposes `flush()` for an immediate send ([configuration docs](https://www.databuddy.cc/docs/sdk/configuration), [tracker docs](https://www.databuddy.cc/docs/sdk/tracker)).
- **Source fact:** The current browser defaults are batching enabled, batch size 10, five-second timeout, three retries, and 500 ms initial retry delay ([tracker source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/tracker/src/core/tracker.ts#L103-L135)).
- **Source fact:** `track()` returns a local `queued` outcome before the network request. The browser queues are ordinary in-memory arrays; retryable failure requeues the items and schedules another timer ([tracker source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/tracker/src/core/tracker.ts#L634-L741)).
- **Source fact:** `sendBeacon()` returning `true` only means that the user agent accepted the payload for transfer; the source explicitly says it does not acknowledge server persistence ([tracker source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/tracker/src/core/tracker.ts#L820-L845)).
- **Inference:** Browser reload, tab/process termination, or an exhausted retry path can lose events. No IndexedDB, service-worker queue, or other browser-durable event buffer was found in the tracker.

### Server Boundary

- **Documentation fact:** The Node SDK says `track()` usually confirms queueing when batching is enabled; callers should call `flush()` when they need the final delivery result, especially in serverless functions ([Node SDK docs](https://www.databuddy.cc/docs/sdk/node)).
- **Source fact:** `/track`, `/`, `/vitals`, `/errors`, and `/batch` await the event-service delivery operation before returning a success response. `/batch` allows at most 100 items and returns per-item validation outcomes, but a delivery failure rejects the request ([batch route](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/routes/basket.ts#L479-L688), [custom event route](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/routes/track.ts#L219-L397)).
- **Source fact:** Before delivery, Basket reserves a Redis deduplication key. A successful producer or ClickHouse fallback delivery then promotes it to `delivered`; an ambiguous Kafka acknowledgment is preserved as `ambiguous` and cannot switch to direct ClickHouse fallback ([event service](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/lib/event-service.ts#L289-L315), [security source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/lib/security.ts#L345-L436)).
- **Source fact:** Hosted Kafka producer settings use an idempotent producer, bounded send acknowledgments, and up to three producer retries. If Kafka is unavailable, Basket can directly insert into ClickHouse; if the Kafka result is ambiguous, that fallback is disabled ([producer source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/lib/producer.ts#L714-L785), [producer configuration](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/lib/producer.ts#L966-L1069)).
- **Source fact:** In self-host mode, `SELFHOST` disables the Kafka producer and the path uses direct ClickHouse insertion ([producer source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/producer.ts#L440-L449), [self-host compose](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/docker-compose.selfhost.yml#L123-L156)).
- **Inference:** Hosted HTTP success is strongest when read as "Kafka producer accepted the record" rather than "ClickHouse committed a queryable row." Self-host HTTP success is closer to a ClickHouse insert acknowledgment, but still does not establish a separate acceptance journal.
- **Unknown:** The reviewed DataBuddy source does not state the exact Kafka durability configuration, Vector disk-buffer policy, or whether the producer acknowledgment is coupled to replicated broker persistence.

### Documentation Conflicts

- **Documentation fact:** The Data Policy says events are queued for background processing before they reach the database ([Data Policy](https://www.databuddy.cc/data-policy)).
- **Source fact:** The current repository implements the background path with Kafka/Vector when hosted and direct ClickHouse fallback in self-host mode.
- **Documentation fact:** Older privacy/security pages say anonymous IDs are never sent to servers and that there are no profiles, while current SDK documentation documents `identify()`, persistent profile IDs, traits, and cross-domain propagation ([security docs](https://www.databuddy.cc/docs/security), [identify docs](https://www.databuddy.cc/docs/sdk/identify-users), [tracker docs](https://www.databuddy.cc/docs/sdk/tracker)).
- **Inference:** The pinned current source and current SDK docs should be treated as the technical behavior; older policy language is not a safe ingestion or identity contract without clarification.

## Event Identity, Deduplication, And Configuration

### Raw Events And Delivery Identity

- **Source fact:** Standard analytics rows have a stable UUID derived from client ID, event type, and source event ID. Arbitrary client IDs are normalized into a stable UUID before ClickHouse storage ([event service](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/event-service.ts#L83-L158)).
- **Source fact:** `analytics.events` replaces rows by `(client_id, id)`, with `ingested_at` as the replacing version. Custom events, errors, and vitals use tenant/client plus `delivery_id` through a materialized `delivery_key` ([events schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/core/events.sql#L1-L56), [custom events schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/db/src/clickhouse/schema/analytics/core/custom_events.sql#L1-L27)).
- **Source fact:** If custom span input lacks an event ID, the fallback identity hashes canonical payload plus batch position. Exact retries of an unchanged batch can converge, while reordered or changed payloads can produce a different identity ([event service](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/event-service.ts#L83-L127)).
- **Inference:** Deduplication is identity-based and at-least-once oriented, not a changed-payload conflict contract. The source does not reject a second payload that reuses an existing event identity; replacing behavior can select a later version.
- **Source fact:** Redis reservations are short-lived: pending ownership is 30 seconds, standard delivered keys 24 hours, and exit-event delivered keys 48 hours ([security source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/security.ts#L1-L21), [reservation source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/security.ts#L345-L452)).
- **Inference:** Full-retention duplicate suppression depends on the ClickHouse stable identity and replacement model, not on Redis. Legacy rows without IDs are intentionally not collapsed together.

### Identity Ownership

- **Documentation fact:** The browser creates an anonymous ID in local storage and a session ID in session storage. Sessions are documented as resetting after 30 minutes of inactivity ([tracker docs](https://www.databuddy.cc/docs/sdk/tracker), [security docs](https://www.databuddy.cc/docs/security)).
- **Source fact:** The tracker stores `anon_<UUID>` in `localStorage["did"]` and `sess_<UUID>` plus a timestamp in session storage. The 30-minute check runs when the tracker initializes or restores from BFCache, not through a visible continuously running idle timer ([tracker source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/tracker/src/core/tracker.ts#L237-L297), [tracker index](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/packages/tracker/src/index.ts#L316-L329)).
- **Documentation fact:** `identify()` links an application-owned opaque profile ID, can carry scalar traits, persists the profile ID, and is intended to connect activity across devices when the same ID is supplied ([identify docs](https://www.databuddy.cc/docs/sdk/identify-users)).
- **Source fact:** PostgreSQL stores profiles, encrypted display/email fields, traits, trait history, and website-scoped anonymous aliases. The schema comment explicitly says raw aliases are not ClickHouse join keys because past daily salts are unrecoverable ([identity schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/drizzle/schema/identity.ts#L12-L106)).
- **Source fact:** Query code does not use one identity rule everywhere: standard event queries commonly use `profile_id` when present, otherwise `anonymous_id`; custom-event queries use the equivalent nullable coalesce ([identity expressions](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/identity.ts#L1-L15)).
- **Inference:** Databuddy's profile/alias state is canonical in PostgreSQL, but it is not a simple mutable dimension that can always rewrite historical ClickHouse rows. Cross-query visitor comparability requires an explicit identity policy.

### Configuration Ownership

- **Source fact:** Website status, organization, public visibility, domain, allowed origins, allowed IPs, and other settings are PostgreSQL state. Basket resolves and validates website/API-key scope against that state before custom-event insertion ([website schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/drizzle/schema/websites.ts#L21-L69), [track route](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/apps/basket/src/routes/track.ts#L248-L354)).
- **Source fact:** Redis caches website reads and query results, but cache invalidation follows the PostgreSQL mutation path; Redis is not the configuration source of truth ([website service](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/services/src/websites.ts#L174-L207)).

## OLAP Storage And Projections

- **Source fact:** ClickHouse tables use replicated MergeTree-family engines. Delivery tables use `ReplicatedReplacingMergeTree`, tenant plus stable identity as the complete sorting key, and `ingested_at` as the version ([schema README](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/README.md#L27-L64)).
- **Source fact:** Standard events are monthly partitioned, custom events and span tables are date partitioned, and the repository's core event/custom definitions contain no TTL clause ([events schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/core/events.sql#L48-L56), [custom events schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/core/custom_events.sql#L20-L27)).
- **Source fact:** The pageview materialized view emits one row per `screen_view` event, and the target table preserves the event identity. The schema README explains that this avoids replayed insert blocks reintroducing duplicate pageview counts ([pageview view](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/pageviews/daily_pageviews_mv.sql#L1-L16), [schema README](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/README.md#L61-L64)).
- **Source fact:** Session reports are derived by grouping raw `analytics.events` rows by supplied `session_id`; they are not server-sessionized from inactivity gaps in the reviewed query builders ([session builder](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/ai/src/query/builders/sessions.ts#L24-L47)).
- **Source fact:** Most standard query batches enable ClickHouse query cache; builders marked `noCache` disable it, and a failed union query falls back to individual queries ([query settings](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/ai/src/query/simple-builder.ts#L28-L43), [batch executor](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/ai/src/query/batch-executor.ts#L523-L568)).
- **Inference:** ClickHouse is both the raw analytics store and the serving/query store. The primary derived projections are selective and mixed: pageviews are materialized, while sessions and many report metrics are computed at query time over raw or span tables.

## Queues, Batches, Replay, And Freshness

### Batches And Queueing

- **Documentation fact:** The public event API accepts single or batch custom events and recommends batching; the Node SDK documents a maximum batch size of 100, default batch size 10, default queue size 1000, and explicit flush ([event API](https://www.databuddy.cc/docs/api/events), [Node SDK](https://www.databuddy.cc/docs/sdk/node), [configuration](https://www.databuddy.cc/docs/sdk/configuration)).
- **Source fact:** The browser has separate queues for standard events, custom events, vitals, and errors, with endpoint maxima of 100, 100, 20, and 50 respectively ([tracker source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/tracker/src/core/tracker.ts#L137-L181)).
- **Source fact:** Vector consumes multiple Kafka topics with acknowledgements enabled, starts from the earliest offset when no offset exists, and batches most ClickHouse sinks up to 5,000 events or 5 MB with a five-second timeout ([Vector source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3/infra/ingest/vector.yaml#L1-L32), [Vector sinks](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/infra/ingest/vector.yaml#L52-L171)).
- **Source fact:** The delivery migration documents stable identities, ClickHouse `FINAL`, pause/drain/cutover, and operator-run shadow-table migration. It also warns that the incremental pageview view must migrate with events because replayed insert blocks can otherwise reintroduce counts ([delivery migration](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/migrations/20260801_delivery_deduplication.md)).

### Replay And Failure Handling

- **Source fact:** Kafka producer failures are classified as retryable or ambiguous. Ambiguous sends remain Kafka-only on retry rather than switching sinks; direct ClickHouse fallback is bounded by a four-second admission deadline ([producer source](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/producer.ts#L650-L785)).
- **Source fact:** Basket shutdown closes admission, drains in-flight work and late Kafka sends, and gives the producer five seconds within a 20-second process shutdown budget ([shutdown budget](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/shutdown-budget.ts#L1-L9), [producer shutdown](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/apps/basket/src/lib/producer.ts#L884-L931)).
- **Inference:** The hosted path has transport-level replay through Kafka offsets and client/server retries, with stable IDs and ClickHouse replacement limiting duplicate effects. It is not a replayable application journal: no raw-event outbox, acceptance sequence, replay cursor, or recovery command for re-materializing all reports was found.
- **Unknown:** The reviewed source does not establish Vector's on-disk buffering, exact offset commit timing, dead-letter recovery procedure, or whether a ClickHouse write failure can be replayed from a durable source after broker retention expires.

### Query Freshness

- **Documentation fact:** Databuddy says data typically appears within 1-2 minutes and some metrics can take up to five minutes; it tells users to refresh for the latest data ([dashboard guide](https://www.databuddy.cc/docs/dashboard)).
- **Source fact:** Query caching is enabled for most builders and disabled for selected realtime/error-style builders, but the reviewed code does not expose a single global freshness value ([query settings](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/ai/src/query/simple-builder.ts#L28-L43), [realtime builders](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/ai/src/query/builders/realtime.ts#L1-L48)).
- **Unknown:** Exact ClickHouse query-cache TTL, per-report freshness, projection lag metrics, and the behavior of late-arriving events against materialized pageviews are not specified by the reviewed materials.

## Retention, Deletion, Backup, And Recovery

### Retention

- **Documentation fact:** Databuddy's Data Policy says most analytics data is retained indefinitely while an account is active, while performance metrics are automatically deleted after one year ([Data Policy](https://www.databuddy.cc/data-policy)).
- **Source fact:** The reviewed core event, custom-event, error, vital, and pageview schemas are partitioned by analytics time but do not declare event TTLs ([event schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/core/events.sql#L48-L56), [custom schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/core/custom_events.sql#L20-L27), [vitals schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/schema/analytics/web-vitals/web_vitals_spans.sql#L16-L20)).
- **Inference:** The policy's indefinite/one-year behavior is likely enforced by operational jobs or external cluster policy, not by the reviewed table definitions. The source does not prove the product retention contract end to end.

### Deletion

- **Documentation fact:** The DPA says account or project deletion removes associated anonymous analytics and personal information, and that some data may remain temporarily in inaccessible backups ([DPA](https://www.databuddy.cc/dpa)).
- **Documentation fact:** The Privacy Policy says visitor-specific deletion is not possible because Databuddy says it cannot identify an individual end user ([Privacy Policy](https://www.databuddy.cc/privacy)).
- **Source fact:** Website deletion deletes the PostgreSQL website row in a transaction and invalidates caches. PostgreSQL profile/alias/trait-history foreign keys cascade from website deletion ([website delete route](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/rpc/src/routers/websites.ts#L809-L867), [identity schema](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/drizzle/schema/identity.ts#L12-L106)).
- **Source fact:** The reviewed website deletion path does not issue a ClickHouse delete for historical events or projections. The ClickHouse tables have no PostgreSQL foreign key to enforce that cascade.
- **Inference:** The official policy promises project/account-level deletion, but the inspected repository does not establish how historical ClickHouse rows, materialized pageviews, backups, or exports are removed. This is a material operational unknown.

### Backup And Recovery

- **Documentation fact:** The DPA acknowledges that deleted data can remain in backups temporarily and inaccessible for processing, but gives no backup cadence, retention period, RPO, RTO, or restore procedure ([DPA](https://www.databuddy.cc/dpa)).
- **Source fact:** Self-host compose provisions local named volumes for PostgreSQL, ClickHouse, and Redis. Redis enables AOF, while no backup service or scheduled database backup is defined ([self-host compose](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/docker-compose.selfhost.yml#L1-L75)).
- **Source fact:** The repository's ClickHouse delivery migration requires an operator to take and verify a ClickHouse backup before cutover, but it is a migration precondition rather than a product backup system ([delivery migration](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/migrations/20260801_delivery_deduplication.md#L28-L52)).
- **Unknown:** No official self-host backup/restore runbook, SQLite-like event journal recovery path, DuckDB-equivalent rebuild path, or tested end-to-end restore sequence was found.

## Deployment And Resource Assumptions

- **Documentation fact:** The repository lists Bun 1.3.14+ and Node.js 20+ prerequisites and supports Docker Compose self-hosting ([README](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/README.md#L59-L101)).
- **Source fact:** Self-hosting runs PostgreSQL 17, ClickHouse 25.5.1, Redis 7, API, Basket, Insights, and Links containers. The self-host file exposes ports, uses local named volumes, sets PostgreSQL pool max to 10 by default, configures Redis AOF with a 512 MB maxmemory/no-eviction policy, and sets ClickHouse `nofile` to 262,144 ([compose](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/docker-compose.selfhost.yml)).
- **Source fact:** The self-host compose does not include Redpanda/Kafka or Vector, while Basket runs with `SELFHOST=true`; this is consistent with direct ClickHouse delivery in the self-host path.
- **Documentation fact:** Databuddy's policy describes Hetzner hosting databases in Germany, Railway hosting application/backend services, Vercel hosting the dashboard, and Bunny.net delivering the tracking script ([Data Policy](https://www.databuddy.cc/data-policy)).
- **Unknown:** No official CPU, RAM, disk, event-rate, concurrent-query, ClickHouse-part sizing, Kafka-retention, or maximum-site operating envelope was found. The compose defaults are deployment defaults, not capacity guarantees.

## Concrete Implications For Cimi

These are lessons for the later Cimi boundary decision, not a decision to change issue #14.

1. **Make SQLite the durable acceptance owner.** Databuddy's Kafka/ClickHouse handoff is useful for throughput, but its source does not provide a durable per-event acceptance record. Cimi should retain the normalized envelope, Event ID, payload fingerprint, receipt time, policy version, state, and replay sequence in SQLite before acknowledging collection.
2. **Keep DuckDB derived and rebuildable.** Databuddy demonstrates that raw analytics and report serving can share an OLAP engine, but Cimi can improve recovery by treating DuckDB projections and reports as rebuildable from SQLite rather than as the only durable event copy.
3. **Do not use a short TTL cache as full-retention deduplication.** Databuddy's Redis keys expire in 24-48 hours. Cimi should keep Event ID deduplication and changed-payload conflict detection for the full raw-event retention period in SQLite.
4. **Separate transport acknowledgment from query freshness.** A successful SQLite acknowledgment should promise recoverable acceptance, not immediate DuckDB visibility. Expose projector backlog/lag and recovery state, and make report freshness explicit.
5. **Use explicit stable identities for every event and projection.** Databuddy's replacement keys and identity-bearing pageview projection show why replay-safe IDs must survive all projection layers. Cimi should reject an existing Event ID with a changed payload rather than silently replacing it.
6. **Keep configuration and identity in the control plane.** Databuddy's PostgreSQL ownership of Site settings and profile/alias state is a useful split. Cimi's SQLite should own Site configuration, collection policy versions, identity/profile links, and deletion/tombstone state; DuckDB should hold query-oriented snapshots or facts.
7. **Define deletion and backup across both stores.** Databuddy's policy promises deletion while the reviewed source leaves ClickHouse deletion and backup mechanics unclear. Cimi should define SQLite as the authoritative recovery artifact, DuckDB as a derived backup, and a deletion workflow that purges or tombstones both stores and future replays.
8. **Prefer the smallest topology compatible with the contract.** Databuddy's hosted path needs Kafka/Redpanda, Vector, Redis, PostgreSQL, and ClickHouse; its self-host path removes Kafka/Vector and writes directly to ClickHouse. Cimi can avoid that operational split with SQLite plus an asynchronous in-process/outbox projector unless measured load requires another queue.

## Explicit Unknowns

- Whether hosted Kafka acknowledgments guarantee replicated durable broker persistence before Basket returns success.
- Whether Vector has a durable disk buffer, its offset commit timing, and its dead-letter replay procedure in production.
- Whether every direct ClickHouse insert and materialized view mutation is repaired after a late, failed, or ambiguous delivery.
- Whether a changed payload reusing an existing event ID is rejected, logged as a conflict, or silently replaced by `ReplacingMergeTree`.
- Exact event/span/pageview retention jobs and whether the one-year performance policy is implemented outside the repository.
- Whether website/account deletion removes ClickHouse raw rows, projections, backups, exports, and cached query results.
- Backup cadence, backup scope, encryption, restore ordering, RPO/RTO, and tested disaster recovery for hosted and self-hosted deployments.
- Exact query-cache TTL and per-query freshness after ingestion, replacement merges, and projection lag.
- Whether server-side sessionization or session closure exists outside the reviewed client-assigned-ID query builders.
- CPU, memory, disk, throughput, concurrency, and Kafka-retention assumptions for a supported deployment.
- Whether profile aliases can reliably attribute historical salted ClickHouse rows across days; the schema comment indicates that past salts are unrecoverable.

## Primary Sources

- [Current official repository commit](https://github.com/databuddy-analytics/Databuddy/tree/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3)
- [Official repository README and self-hosting](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/README.md)
- [Official self-host compose](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/docker-compose.selfhost.yml)
- [Official event API docs](https://www.databuddy.cc/docs/api/events)
- [Official Node SDK docs](https://www.databuddy.cc/docs/sdk/node)
- [Official SDK configuration docs](https://www.databuddy.cc/docs/sdk/configuration)
- [Official tracker and identify docs](https://www.databuddy.cc/docs/sdk/tracker) and [identify users](https://www.databuddy.cc/docs/sdk/identify-users)
- [Official dashboard freshness docs](https://www.databuddy.cc/docs/dashboard)
- [Official Data Policy](https://www.databuddy.cc/data-policy)
- [Official Privacy Policy](https://www.databuddy.cc/privacy)
- [Official DPA](https://www.databuddy.cc/dpa)
- [Official Security and Privacy docs](https://www.databuddy.cc/docs/security)
- [Official delivery-deduplication migration](https://github.com/databuddy-analytics/Databuddy/blob/d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3/packages/db/src/clickhouse/migrations/20260801_delivery_deduplication.md)
