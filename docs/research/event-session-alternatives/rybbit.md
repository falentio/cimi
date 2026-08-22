# Rybbit Event Ingestion and Session Semantics

Scope: Rybbit's event envelope, pageview and custom-event ingestion, validation,
timestamps, attribution, identity/session formation, retries, restart/offline
behavior, bot/exclusion/privacy filtering, and unavailable capabilities for Cimi
issue #7.

## Evidence Boundary

This report uses only the local `rybbit` git submodule: source, tests, schemas,
and checked-in documentation. No GitHub API, web search, or web fetch was used.
The inspected submodule commit is `64f8c4fb7f394bdfe9379717de8e6c21758b1ac2`.
Paths below are relative to the Cimi workspace root and line ranges refer to
that snapshot.

Labels:

- **Fact:** directly expressed by the checked-in source, test, schema, or docs.
- **Inference:** a behavior implied by the source, where the source does not state the behavior as a product promise.
- **Unavailable:** no implementation or accepted input was found in the inspected snapshot.

## Executive Summary

| Area | Rybbit behavior | Cimi relevance |
| --- | --- | --- |
| Ingestion | `POST /api/track` accepts one strict JSON event envelope. The handler validates, resolves the Site/request, applies exclusion and quota checks, runs bot detection, assigns identity/session, then queues the row for ClickHouse. [`rybbit/server/src/index.ts:540-560`](../../../../rybbit/server/src/index.ts), [`rybbit/server/src/services/tracker/trackEvent.ts:11-67`](../../../../rybbit/server/src/services/tracker/trackEvent.ts), [`rybbit/server/src/services/tracker/ingestEvent.ts:26-127`](../../../../rybbit/server/src/services/tracker/ingestEvent.ts) | A `200` response means the request passed the handler's outcome path, not necessarily that ClickHouse has durably accepted the row. |
| Event time | Normal events ignore client time and use a server `receivedAt` captured before Site lookup and other awaits. [`rybbit/server/src/services/tracker/trackingRequest.ts:80-111`](../../../../rybbit/server/src/services/tracker/trackingRequest.ts), [`rybbit/server/src/services/tracker/utils.ts:120-158`](../../../../rybbit/server/src/services/tracker/utils.ts) | Offline replay of a normal event changes its timestamp to retry/receipt time. |
| Sessions | A Redis key maps `(Site, identity)` to a generated 14-character Nano ID with a sliding 30-minute inactivity TTL. [`rybbit/server/src/services/sessions/sessionsService.ts:6-10,29-101`](../../../../rybbit/server/src/services/sessions/sessionsService.ts) | Sessions are processing state in Redis plus `session_id` on event rows, not a durable session record in the core ClickHouse schema. |
| Anonymous identity | The normal server path hashes a bucketed IP and normalized user agent; an optional `anonymous_id` is hashed with Site ID. Daily salting is optional. [`rybbit/server/src/services/userId/userIdService.ts:81-135`](../../../../rybbit/server/src/services/userId/userIdService.ts) | The browser's persisted visitor ID is not included in ordinary `/track` payloads. [`rybbit/server/src/analytics-script/config.ts:23-43`](../../../../rybbit/server/src/analytics-script/config.ts), [`rybbit/server/src/analytics-script/tracking.ts:167-194`](../../../../rybbit/server/src/analytics-script/tracking.ts) |
| Identification | A custom `user_id` is stored as `identified_user_id`, with Site-scoped aliases and asynchronous backfill. [`rybbit/server/src/services/tracker/identifyService.ts:92-157`](../../../../rybbit/server/src/services/tracker/identifyService.ts), [`rybbit/server/src/db/postgres/schema.ts:543-577`](../../../../rybbit/server/src/db/postgres/schema.ts) | Identified identity, anonymous device identity, alias, and session key are separate concepts. |
| Delivery guarantees | The standard browser sender does not retry, persist offline events, inspect non-2xx responses, or attach an event ID. Server memory queues drop a failed ClickHouse batch after logging. [`rybbit/server/src/analytics-script/tracking.ts:197-240`](../../../../rybbit/server/src/analytics-script/tracking.ts), [`rybbit/server/src/services/tracker/pageviewQueue.ts:38-141`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts) | Caller retries can create duplicates; failed or process-lost events can disappear. This is an inference from the absence of an idempotency key and the append-only insert path. |
| Replay exception | Session replay uses client event timestamps, corrects clock skew, and requeues a failed batch in the page's memory. [`rybbit/server/src/analytics-script/sessionReplay.ts:232-257`](../../../../rybbit/server/src/analytics-script/sessionReplay.ts), [`rybbit/server/src/services/replay/replayClockSkew.ts:46-84`](../../../../rybbit/server/src/services/replay/replayClockSkew.ts) | Replay has different time and retry semantics from normal events and is not a durable offline queue. |

## Ingestion Contract

### Endpoint and request shape

**Fact:** The public route is `POST /api/track`; the browser sender posts to
`/track` relative to its configured analytics host, which resolves to the same
API surface. [`rybbit/server/src/index.ts:552-560`](../../../../rybbit/server/src/index.ts),
[`rybbit/server/src/analytics-script/tracking.ts:197-207`](../../../../rybbit/server/src/analytics-script/tracking.ts),
[`rybbit/docs/content/docs/api/sending-events.mdx:14-22`](../../../../rybbit/docs/content/docs/api/sending-events.mdx)

**Fact:** The server schema is a discriminated union on `type` and every member
is `.strict()`. Unknown envelope fields are rejected rather than ignored.
[`rybbit/server/src/services/tracker/trackingPayload.ts:52-239`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)

The accepted `type` values in source are:

- `pageview`
- `custom_event`
- `performance`
- `outbound`
- `error`
- `button_click`
- `copy`
- `form_submit`
- `input_change`

The browser SDK exposes the same list in its TypeScript type. The public
server-event documentation lists only `pageview`, `custom_event`,
`performance`, `outbound`, and `error`, so the documentation is narrower than
the current source contract. [`rybbit/server/src/analytics-script/types.ts:69-89`](../../../../rybbit/server/src/analytics-script/types.ts),
[`rybbit/docs/content/docs/api/sending-events.mdx:24-35`](../../../../rybbit/docs/content/docs/api/sending-events.mdx)

### Shared envelope fields

The common fields are:

| Field | Validation and meaning |
| --- | --- |
| `site_id` | Required non-empty string. Site lookup accepts the public identifier and produces the numeric Site ID internally. [`trackingPayload.ts:4-7`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts), [`utils.ts:139-143`](../../../../rybbit/server/src/services/tracker/utils.ts) |
| `hostname` | Optional, max 253 characters. |
| `pathname` | Optional, max 2048 characters. |
| `querystring` | Optional, max 2048 characters. Stored both raw and as a parsed map. [`pageviewQueue.ts:77-109`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts) |
| `screenWidth`, `screenHeight` | Optional non-negative integers. |
| `language` | Optional, max 35 characters. |
| `page_title` | Optional, max 512 characters. |
| `referrer` | Optional, max 2048 characters. |
| `anonymous_id` | Optional non-empty string, max 255 characters. It is an accepted client identity input but is not sent by the checked-in browser tracker in normal event payloads. [`trackingPayload.ts:14-16`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts), [`tracking.ts:167-194`](../../../../rybbit/server/src/analytics-script/tracking.ts) |
| `user_id` | Optional, max 255 characters. In an event payload this is the application/custom identified ID, later stored as `identified_user_id`, not the internal anonymous device fingerprint. [`utils.ts:135-156`](../../../../rybbit/server/src/services/tracker/utils.ts) |
| `tag` | Optional, max 256 characters. Stored as a low-cardinality event column. [`trackingPayload.ts:17-18`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts), [`core.ts:121-128`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts) |
| `feature_flags` | Optional map; keys max 100 and values max 2048 characters. Browser event payloads carry evaluated values as strings. [`trackingPayload.ts:18-18`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts), [`tracking.ts:46-53,189-192`](../../../../rybbit/server/src/analytics-script/tracking.ts) |
| `_bs`, `_bsm` | Optional client bot score and signal mask with bounds imported from the shared bot-signal contract. They are inputs to server-side detection, not proof. [`trackingPayload.ts:21-25`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts), [`botBlocking/README.md:48-50,137-141`](../../../../rybbit/server/src/services/tracker/botBlocking/README.md) |
| `ip_address`, `user_agent` | Optional valid IP / max-512-character user agent, but public callers cannot choose the values. They are honored only for a Bearer credential valid for the Site with `ingest:write`; otherwise request headers/IP win. [`trackingPayload.ts:19-20`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts), [`trackingRequest.ts:57-71,97-100`](../../../../rybbit/server/src/services/tracker/trackingRequest.ts) |

**Unavailable:** The ordinary envelope has no accepted `timestamp`,
`event_id`, `idempotency_key`, `session_id`, or client sequence number. Because
the union is strict, adding those fields to a normal `/api/track` request is a
validation failure, not an ignored extension. [`trackingPayload.ts:52-239`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)

## Pageviews and Custom Events

### Pageviews

**Fact:** A pageview is `type: "pageview"`; `event_name` and `properties` are
optional for this member of the union. The browser SDK builds page context from
the current URL and document, and can automatically send an initial pageview or
SPA navigation pageviews. [`trackingPayload.ts:53-60`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts),
[`tracking.ts:147-194,243-245`](../../../../rybbit/server/src/analytics-script/tracking.ts),
[`index.ts:141-205,235-249`](../../../../rybbit/server/src/analytics-script/index.ts)

The browser's initial and SPA navigation behavior is configurable. The default
debounce is 500 ms when no `data-debounce` attribute is supplied; the SPA
listener debounces `pushState`, `replaceState`, `popstate`, and hash changes.
[`rybbit/server/src/analytics-script/config.ts:136-146,179-201`](../../../../rybbit/server/src/analytics-script/config.ts)

The browser can skip a path entirely or replace the pathname with a configured
mask pattern before sending. This is collection-time URL minimization, not a
server-side redaction of arbitrary event properties. [`rybbit/server/src/analytics-script/tracking.ts:147-166`](../../../../rybbit/server/src/analytics-script/tracking.ts),
[`rybbit/server/src/analytics-script/utils.ts:1-53`](../../../../rybbit/server/src/analytics-script/utils.ts)

### Custom events

**Fact:** A custom event requires a non-empty `event_name` of at most 256
characters. `properties`, when present, must be a JSON string of at most 2048
characters. The server checks that it parses as JSON but does not impose a
property-key or property-value schema. [`trackingPayload.ts:61-68`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)

The browser API accepts an object, serializes it with `JSON.stringify`, and
sends the current page context with `type: "custom_event"`. The local guide
describes the object as max 2 KB and says only strings and numbers are
supported, but the current source serializes arbitrary JSON values and the
server's validation accepts any valid JSON string. [`tracking.ts:213-249`](../../../../rybbit/server/src/analytics-script/tracking.ts),
[`rybbit/docs/content/docs/(docs)/track-events.mdx:28-46`](../../../../rybbit/docs/content/docs/(docs)/track-events.mdx)

On queue flush, the server parses `properties` into the ClickHouse `props JSON`
column. The event row preserves `event_name`, `type`, page context, identity,
attribution, and performance fields in the same `events` table. [`pageviewQueue.ts:18-24,81-126`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts),
[`core.ts:87-128`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

Other source-supported event payloads have additional validation:

- `performance` accepts non-negative nullable Web Vitals values (`lcp`, `cls`, `inp`, `fcp`, `ttfb`). [`trackingPayload.ts:69-81`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)
- `outbound` requires valid JSON with a URL and optionally string `text` and `target`; the URL is parsed with `new URL`. [`trackingPayload.ts:82-112`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)
- `error` requires an event name and JSON with a string `message`; the outer properties limit is 4096 characters. The refine function locally truncates parsed values but does not serialize the truncated object back into the accepted string, so the effective source-level guarantee is the outer JSON limit plus type checks, not necessarily 500/2000-character stored subfields. [`trackingPayload.ts:113-148`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)
- `button_click`, `copy`, `form_submit`, and `input_change` validate their event-specific JSON shapes and use a 2048-character properties limit. [`trackingPayload.ts:149-239`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)

## Validation, Limits, and Outcomes

**Fact:** Invalid payloads return `400`; an unknown Site returns `404`; an
unexpected ingestion exception returns `500`. Exclusion and monthly over-limit
outcomes intentionally return `200`, and enforced bot traffic also returns the
same success shape as tracked traffic. [`rybbit/server/src/services/tracker/trackEvent.ts:17-67`](../../../../rybbit/server/src/services/tracker/trackEvent.ts),
[`rybbit/server/src/services/tracker/trackEvent.test.ts:44-119`](../../../../rybbit/server/src/services/tracker/trackEvent.test.ts)

Relevant limits and gates found locally:

| Limit/gate | Behavior |
| --- | --- |
| Fastify body | Global request body limit is 10 MiB. The comment identifies session replay as the reason for the limit; normal `/api/track` accepts one event envelope. [`rybbit/server/src/index.ts:274-280`](../../../../rybbit/server/src/index.ts) |
| Monthly Site limit | Checked before bot detection, identity, session lookup, and queueing. The handler still returns `200` with a not-tracked message. [`ingestEvent.ts:64-67`](../../../../rybbit/server/src/services/tracker/ingestEvent.ts), [`trackEvent.ts:41-43`](../../../../rybbit/server/src/services/tracker/trackEvent.ts) |
| API key rate limit | The local server-event guide documents 500 requests per 10 minutes for API keys. The tracker source separately resolves Bearer credentials to decide whether server-side overrides are trusted. The inspected `/api/track` handler does not itself return a rate-limit response based on `checkApiKey`'s `rateLimited` field, so the documented rate-limit behavior should be verified against the deployed route before being treated as a normal-event guarantee. [`rybbit/docs/content/docs/api/sending-events.mdx:221-235`](../../../../rybbit/docs/content/docs/api/sending-events.mdx), [`auth-utils.ts:373-420`](../../../../rybbit/server/src/lib/auth-utils.ts), [`trackEvent.ts:17-67`](../../../../rybbit/server/src/services/tracker/trackEvent.ts) |
| Standard event batch | **Unavailable:** `/api/track` accepts a single discriminated event object; no event-array envelope or batch endpoint is defined in the checked-in tracker contract. [`trackingPayload.ts:52-239`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts) |
| Replay batch | Replay has an unbounded `events` array in its Zod schema, subject to the global 10 MiB HTTP body limit. [`recordSessionReplay.ts:10-27`](../../../../rybbit/server/src/api/sessionReplay/recordSessionReplay.ts), [`index.ts:274-280`](../../../../rybbit/server/src/index.ts) |

**Fact:** The ingestion pipeline order is exclusion, monthly limit, bot
detection, base identity payload construction, session assignment, and queueing.
An exclusion therefore prevents bot counters, identity hashing, session
creation, and event queueing. [`ingestEvent.ts:26-45,46-127`](../../../../rybbit/server/src/services/tracker/ingestEvent.ts),
[`ingestEvent.test.ts:157-188`](../../../../rybbit/server/src/services/tracker/ingestEvent.test.ts)

## Timestamps and Ordering

### Normal events

**Fact:** `resolveTrackingRequest` captures `receivedAt = new Date()` before
the Site configuration lookup and API-key check. The same value is used to
stamp the event and to select the UTC day for salted identity hashing.
[`trackingRequest.ts:48-55,80-111`](../../../../rybbit/server/src/services/tracker/trackingRequest.ts),
[`userIdService.ts:20-26,109-116`](../../../../rybbit/server/src/services/userId/userIdService.ts)

**Fact:** `createBasePayload` writes `receivedAt.toISOString()` as the event
timestamp. The queue formats it to `yyyy-MM-dd HH:mm:ss` before inserting into
the ClickHouse `DateTime` column, so normal event storage is second-resolution.
[`utils.ts:139-156`](../../../../rybbit/server/src/services/tracker/utils.ts),
[`pageviewQueue.ts:81-84`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts),
[`core.ts:87-90`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

**Inference:** A client that holds an event and posts it later cannot preserve
the original occurrence time through the standard endpoint. A retry is a new
request and receives a new server timestamp; the schema has no client-time
field.

The event table is ordered by `(site_id, timestamp)` and has no event sequence
or ingestion-order column in the core DDL. [`core.ts:87-133`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

### Session replay

Replay is a separate contract. The browser sends each rrweb event's numeric
client timestamp, and the server accepts `type`, `data`, and `timestamp` in the
replay batch. [`sessionReplay.ts:147-153`](../../../../rybbit/server/src/analytics-script/sessionReplay.ts),
[`sessionReplay.ts:232-249`](../../../../rybbit/server/src/analytics-script/sessionReplay.ts),
[`sessionReplay.ts:48-62`](../../../../rybbit/server/src/types/sessionReplay.ts)

The server corrects an implausibly skewed batch using one offset, preserving
event-to-event gaps. It clamps timestamps to at most one day in the future and
30 days in the past relative to server time, and sanitizes non-finite values.
[`replayClockSkew.ts:1-31,46-84`](../../../../rybbit/server/src/services/replay/replayClockSkew.ts)

Replay rows use millisecond `DateTime64(3)` timestamps. The ingest service sets
`sequence_number` to the event's index within the received batch, not to a
client-supplied global sequence. [`sessionReplayIngestService.ts:90-129`](../../../../rybbit/server/src/services/replay/sessionReplayIngestService.ts),
[`core.ts:241-263`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

## Attribution and Stored Context

**Fact:** Normal events store the following context in `events`: raw querystring,
parsed URL parameters, page title/path/host, referrer, derived channel, browser
and OS details, language, screen dimensions/device type, geo, optional raw IP,
timezone, tag, feature flags, ASN, and datacenter classification.
[`pageviewQueue.ts:81-126`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts),
[`core.ts:87-128`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

Attribution details:

- The browser takes `document.referrer`, current hostname/path/querystring, language, and screen dimensions from the page. Querystring tracking can be disabled in Site configuration; otherwise it sends the full URL search string subject to the 2048-character validation limit. [`tracking.ts:56-69,167-179`](../../../../rybbit/server/src/analytics-script/tracking.ts), [`config.ts:233-247`](../../../../rybbit/server/src/analytics-script/config.ts)
- Same-host referrers are cleared before storage, and `getChannel` classifies UTM source/medium/campaign, `gclid`, `gad_source`, referring domains, and other source categories. [`pageviewQueue.ts:74-92`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts), [`utils.ts:52-71,96-110`](../../../../rybbit/server/src/services/tracker/utils.ts), [`getChannel.ts:149-179`](../../../../rybbit/server/src/services/tracker/getChannel.ts)
- All URL parameters are stored in `url_parameters`; UTM-like values used for channel classification are lowercased by `getUTMParams`. [`utils.ts:52-94`](../../../../rybbit/server/src/services/tracker/utils.ts), [`pageviewQueue.ts:77-109`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts)
- Session-level referrer attribution is the first non-empty referrer, not simply `argMin` over all rows. Session-level channel attribution chooses the first attributed channel and falls back to the first event's channel. [`sessionAttribution.ts:1-20`](../../../../rybbit/server/src/api/analytics/utils/sessionAttribution.ts)
- The source does not define a separate campaign object in the ingestion envelope. Session/API UTM fields are derived from query parameters rather than from a dedicated event field. [`sending-events.mdx:72-105`](../../../../rybbit/docs/content/docs/api/sending-events.mdx), [`sessions/list.mdx:145-166`](../../../../rybbit/docs/content/docs/api/sessions/list.mdx)

**Fact:** Geo and user-agent enrichment happen server-side. Exact IP is used
for geolocation and ASN; raw IP is written only when `trackIp` is enabled on the
Site. The default Site schema value for `trackIp` is false. [`pageviewQueue.ts:59-72,101-125`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts),
[`schema.ts:89-99`](../../../../rybbit/server/src/db/postgres/schema.ts)

## Identity Formation

### Anonymous identity

**Fact:** Without `anonymous_id`, Rybbit hashes an identity IP and a normalized
user agent into a 12-character SHA-256 prefix. For datacenter egress, IPv4 is
bucketed to `/24` and IPv6 to `/48`; user-agent version tokens are removed so
browser/app updates do not automatically split the fingerprint. [`userIdService.ts:81-128`](../../../../rybbit/server/src/services/userId/userIdService.ts),
[`identityIpBucket.ts:5-37`](../../../../rybbit/server/src/services/userId/identityIpBucket.ts),
[`normalizeUserAgent.ts:19-55,114-132`](../../../../rybbit/server/src/services/userId/normalizeUserAgent.ts)

**Fact:** `saltUserIds` adds a deterministic daily salt derived from the Site
secret and the event's UTC day. A supplied `anonymous_id` is also Site-scoped
and hashed, rather than stored directly as the internal `user_id`.
[`userIdService.ts:38-67,109-135`](../../../../rybbit/server/src/services/userId/userIdService.ts),
[`utils.ts:124-133,135-156`](../../../../rybbit/server/src/services/tracker/utils.ts)

**Fact:** Sticky identity re-attachment is an enhancement for unambiguous
datacenter-egress rotation. It considers candidates for 15 minutes, keeps known
state for 30 minutes, and refuses to merge when there are zero or multiple
candidates. If Redis is unavailable, it returns the raw fingerprint instead of
using a process-local identity fallback. [`stickyUserId.ts:9-26,48-70`](../../../../rybbit/server/src/services/userId/stickyUserId.ts)

**Fact:** The browser creates and persists a `${namespace}-visitor-id` in
`localStorage`, but `Tracker.createBasePayload()` does not put `config.visitorId`
or `anonymous_id` into normal tracking payloads. The persisted visitor ID is sent
to feature-flag evaluation instead. [`config.ts:23-43,65-83,119-127`](../../../../rybbit/server/src/analytics-script/config.ts),
[`tracking.ts:72-93,167-194`](../../rybbit/server/src/analytics-script/tracking.ts)

**Inference:** In this browser implementation, the local visitor ID is not the
anonymous identity used by ordinary event rows. Normal anonymous event identity
is derived from the server-observed request, unless a different client/server
integration explicitly sends `anonymous_id`.

### Identified identity and traits

**Fact:** `identify(userId, traits?)` validates a non-empty custom ID, stores it
in `${namespace}-user-id` local storage, and posts the ID/traits to `/identify`.
Subsequent normal event payloads include the custom ID as `user_id`; the server
stores it separately as `identified_user_id` while retaining the device
fingerprint in `user_id`. [`tracking.ts:435-495`](../../../../rybbit/server/src/analytics-script/tracking.ts),
[`utils.ts:135-156`](../../../../rybbit/server/src/services/tracker/utils.ts),
[`pageviewQueue.ts:81-87`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts)

The browser's `/identify` body contains `site_id`, `user_id`, `traits`, and
`is_new_identify`; it does not contain `anonymous_id`. The server therefore
resolves the current request IP/user agent for the browser alias. Explicit
`anonymous_id` is available in the server identify schema and the authenticated
dashboard identify route. [`tracking.ts:472-491`](../../../../rybbit/server/src/analytics-script/tracking.ts),
[`identifyService.ts:17-35,71-90`](../../../../rybbit/server/src/services/tracker/identifyService.ts),
[`identifyUser.ts:11-25,34-46`](../../../../rybbit/server/src/api/analytics/users/identifyUser.ts)

**Fact:** Traits are JSON profile data limited to 2048 UTF-8 bytes per identify
call. Non-null fields merge; explicit `null` fields are removed. A profile shell
is created on a new identify even with no traits. [`identifyService.ts:14-35,92-100,133-157`](../../../../rybbit/server/src/services/tracker/identifyService.ts),
[`schema.ts:543-558`](../../../../rybbit/server/src/db/postgres/schema.ts)

**Fact:** A new alias queues an asynchronous backfill for the last 30 days in
the browser identify path. The backfill updates `events`, replay events, and
replay metadata, only fills rows whose `identified_user_id` is empty, batches
every five minutes, and retries a failed assignment up to three attempts.
The dashboard identify operation passes `days: null` for full-history backfill.
[`identifyService.ts:38-56,92-129`](../../../../rybbit/server/src/services/tracker/identifyService.ts),
[`identityBackfillQueue.ts:16-39,49-93,129-195`](../../../../rybbit/server/src/services/tracker/identityBackfillQueue.ts),
[`identifyUser.ts:79-85`](../../../../rybbit/server/src/api/analytics/users/identifyUser.ts)

**Inference:** A normal event received immediately after `identify()` can be
stored with the custom ID before historical anonymous rows have been backfilled;
the identify HTTP response does not wait for the ClickHouse mutations.

## Session Formation

**Fact:** Anonymous sessions use the Redis key `session:<siteId>:<userId>`.
Identified sessions use `session:<siteId>:identified:<sha256(userId + NUL + identifiedUserId)>`.
The custom ID is not exposed in the Redis key, and both the anonymous fingerprint
and custom ID participate in the hash. [`sessionsService.ts:25-44`](../../../../rybbit/server/src/services/sessions/sessionsService.ts)

**Fact:** `sessionGetOrCreate` atomically returns the existing ID and refreshes
its TTL, or stores a newly generated `nanoid(14)` candidate with a 30-minute TTL.
Every accepted normal event calls `sessionsService.updateSession()` before it
is queued. [`redis.ts:48-81`](../../../../rybbit/server/src/db/redis/redis.ts),
[`sessionsService.ts:46-67`](../../../../rybbit/server/src/services/sessions/sessionsService.ts),
[`ingestEvent.ts:103-112`](../../../../rybbit/server/src/services/tracker/ingestEvent.ts)

**Fact:** Session duration and bounce-style metrics are reconstructed from event
rows by grouping on `session_id`, taking `MIN(timestamp)`/`MAX(timestamp)`, and
counting pageviews. The core schema creates `events` and replay tables but no
durable main `sessions` table. [`siteMetrics.ts:80-126`](../../../../rybbit/server/src/services/siteMetrics/siteMetrics.ts),
[`core.ts:83-133`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

**Inference:** The 30-minute boundary is an inactivity boundary, not a client
session-start/end protocol. There is no normal-event heartbeat or explicit
session-close request in the checked-in browser API. An open page that emits no
event for more than 30 minutes will not refresh Redis; its next event can start
a new session.

**Fact:** Two identified users sharing one anonymous fingerprint receive
different session keys. The tests also confirm that the same identified ID on
two different fingerprints receives different keys. [`sessionsService.test.ts:57-85`](../../../../rybbit/server/src/services/sessions/sessionsService.test.ts)

## Retries, Deduplication, Offline, and Restart Behavior

### Normal browser delivery

**Fact:** The browser calls `fetch` with `keepalive: true`, but does not use
`sendBeacon`, a service worker, IndexedDB, local event storage, or an online
retry listener. `sendTrackingData` catches rejected fetches and logs them; it
does not check `response.ok`, retry, or persist the payload. `track()` does not
await the send. [`tracking.ts:197-240`](../../../../rybbit/server/src/analytics-script/tracking.ts)

**Unavailable:** There is no durable offline queue for normal pageviews or
custom events. **Inference:** Events attempted while offline or lost during
page unload are not recovered by the checked-in tracker. A caller can retry an
event itself, but normal ingestion supplies no original occurrence timestamp.

### Server memory queues

**Fact:** Accepted events are appended to an in-process array and flushed every
1000 ms in batches of up to 5000. The queue removes the batch before geo
enrichment and ClickHouse insertion. On ClickHouse failure it logs the error and
does not put the batch back. [`pageviewQueue.ts:15-50,129-141`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts)

The same drop-on-insert-failure pattern is used for enforced bot rows and bot
observations. [`botEventQueue.ts:14-41,88-99`](../../../../rybbit/server/src/services/tracker/botBlocking/botEventQueue.ts),
[`rybbit/server/src/services/tracker/botBlocking/README.md:17-21`](../../../../rybbit/server/src/services/tracker/botBlocking/README.md)

**Inference:** A process crash after handler acceptance but before queue flush
can lose normal events. A ClickHouse outage can lose the already-spliced batch.
The `200` response is therefore an acceptance/handling response, not an
end-to-end durability acknowledgement.

### Deduplication

**Unavailable:** The normal envelope and `events` schema have no event ID,
idempotency key, unique constraint, or deduplication stage. The table is a
ClickHouse `MergeTree`, and the queue performs a direct `JSONEachRow` insert.
[`trackingPayload.ts:52-239`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts),
[`core.ts:87-133`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts),
[`pageviewQueue.ts:129-136`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts)

**Inference:** Reposting the same normal event is likely to create another event
row. The only event-level dedupe found is client-side error dedupe: identical
error keys are suppressed for 60 seconds in one in-memory `Tracker` instance.
It does not deduplicate pageviews, custom events, or server retries.
[`tracking.ts:316-381`](../../../../rybbit/server/src/analytics-script/tracking.ts)

### Redis and process restart

**Fact:** Sessions are primarily stored in Redis. The in-process fallback cache
is capped at 50,000 entries and retains the last known session ID for a sliding
30-minute window when Redis commands fail. Tests confirm that a later Redis blip
after a successful lookup reuses the real ID, while a first outage uses a
process-local fallback and rotates it after the window expires. [`sessionsService.ts:11-23,64-101`](../../../../rybbit/server/src/services/sessions/sessionsService.ts),
[`sessionsService.test.ts:104-138`](../../../../rybbit/server/src/services/sessions/sessionsService.test.ts)

**Inference:** A process restart loses the fallback cache and the in-process
event queues. If Redis retains the active key, the session ID can continue; if
the Redis key is absent or Redis is unavailable on a new worker, continuity is
not guaranteed. The submodule does not establish Redis persistence or failover
configuration, so no stronger restart guarantee is available.

### Replay delivery exception

**Fact:** Replay batches are buffered in memory, flushed by size or interval,
and failed sends are reinserted at the front of the in-memory event buffer.
Cleanup flushes remaining events when recording stops. [`sessionReplay.ts:57-91,185-200,207-257,283-286`](../../../../rybbit/server/src/analytics-script/sessionReplay.ts)

**Unavailable:** Replay has no browser-persistent offline queue or event-level
deduplication. **Inference:** A tab/process crash loses its replay buffer, and
retrying an entire batch can insert duplicate replay rows because the server
uses batch-local indexes and the ClickHouse replay table is append-only.
[`sessionReplayIngestService.ts:90-129`](../../../../rybbit/server/src/services/replay/sessionReplayIngestService.ts),
[`core.ts:241-263`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

## Bot, Exclusion, and Privacy Filtering

### Site exclusions

**Fact:** Exclusions are evaluated first and can match, in order, all candidate
IPs, candidate ASNs, country, pathname glob, query parameter, hostname glob, or
user-agent substring. IP and ASN exclusions intentionally check every plausible
request IP, not only the selected identity IP. [`siteExclusionDecision.ts:18-40,152-226`](../../../../rybbit/server/src/services/sites/siteExclusionDecision.ts)

An exclusion returns `200` with a success/message body and leaves no normal
event, bot detection, identity hash, or session. [`ingestEvent.ts:49-67`](../../../../rybbit/server/src/services/tracker/ingestEvent.ts),
[`trackEvent.ts:41-50`](../../../../rybbit/server/src/services/tracker/trackEvent.ts)

### Bot detection

**Fact:** Detection runs before session assignment for ordinary traffic and
uses user-agent patterns, browser-header heuristics, client signals, bot/provider
ASN classification, and request-rate/crawl-shape anomaly scoring. Trusted
server-side ingestion skips detection; mobile Sites skip browser-shaped UA and
header layers but still use the remaining applicable layers. [`botBlocking/index.ts:215-291,293-400`](../../../../rybbit/server/src/services/tracker/botBlocking/index.ts)

The Site's `blockBots` setting controls enforcement, not detection:

| Detection | `blockBots` | Destination |
| --- | --- | --- |
| None | either | Normal `events`, with a normal session |
| Yes | on | `bot_events`; no normal session; synthetic `bot:<fingerprint>` session ID |
| Yes | off | Normal `events` plus `bot_observations`; the normal session is retained |

[`rybbit/server/src/services/tracker/botBlocking/README.md:5-21`](../../../../rybbit/server/src/services/tracker/botBlocking/README.md),
[`ingestEvent.ts:91-125`](../../../../rybbit/server/src/services/tracker/ingestEvent.ts)

**Fact:** Enforced bot traffic still receives a `200` success response, so the
browser does not learn that it was excluded. Bot audit queues have shorter
retention than main events: `bot_events` has a three-month TTL and
`bot_observations` has a 30-day TTL. [`trackEvent.ts:52-53,101-109`](../../../../rybbit/server/src/services/tracker/trackEvent.ts),
[`core.ts:141-185,189-239`](../../../../rybbit/server/src/db/clickhouse/schema/core.ts)

### Privacy controls

**Fact:** Before initialization, the browser tracker installs a no-op API when
`window.__RYBBIT_OPTOUT__` is set or `disable-<namespace>` exists in local
storage. The source contains an opt-out check, not a consent state machine.
[`rybbit/server/src/analytics-script/index.ts:25-50`](../../../../rybbit/server/src/analytics-script/index.ts)

Other collection controls found locally:

- `trackIp` defaults to false; when enabled, the exact request IP is written to `events.ip`. [`schema.ts:89-99`](../../../../rybbit/server/src/db/postgres/schema.ts), [`pageviewQueue.ts:118-125`](../../../../rybbit/server/src/services/tracker/pageviewQueue.ts)
- `trackUrlParams` controls whether the browser sends the querystring, but server-side callers can send `querystring` directly within the envelope limit. [`config.ts:233-247`](../../../../rybbit/server/src/analytics-script/config.ts), [`trackingPayload.ts:8-10`](../../../../rybbit/server/src/services/tracker/trackingPayload.ts)
- Browser path skip and mask patterns can omit or replace tracked paths before transmission. [`tracking.ts:147-166`](../../../../rybbit/server/src/analytics-script/tracking.ts)
- Session replay defaults to masking all inputs, masks password/email inputs by default, and supports blocked/ignored/masked classes and selectors. [`sessionReplay.ts:159-168`](../../../../rybbit/server/src/analytics-script/sessionReplay.ts)
- `identify` accepts raw custom IDs and traits, including arbitrary JSON trait fields. The identify docs warn that identification and traits require an appropriate lawful basis; the source itself does not enforce consent. [`rybbit/docs/content/docs/(docs)/identify-users.mdx:6-10,37-49`](../../../../rybbit/docs/content/docs/(docs)/identify-users.mdx), [`identifyService.ts:17-35`](../../../../rybbit/server/src/services/tracker/identifyService.ts)

**Unavailable:** The normal event path has no source-level consent token,
consent mode, per-field consent decision, or server-side redaction of arbitrary
custom JSON properties. Rybbit's opt-out, path masking, URL setting, IP setting,
and replay masking are separate controls and should not be treated as one
universal privacy policy.

## What Is Unavailable or Unresolved for Cimi

The checked-in submodule does not provide the following normal-event semantics:

1. **Client occurrence time:** no accepted normal-event timestamp; time is server receipt time.
2. **Idempotent ingestion:** no event ID, idempotency key, unique event constraint, or deduplication contract.
3. **Durable offline delivery:** no browser-persistent queue, service-worker retry, or guaranteed unload delivery for normal events.
4. **Normal event batching:** one event envelope per `/api/track` call; replay batching is a separate path.
5. **Client-controlled sessions:** no accepted session ID or explicit session-start/end API; the server owns session assignment.
6. **End-to-end durability acknowledgment:** the normal HTTP success response precedes the asynchronous ClickHouse insert.
7. **A single universal visitor ID:** the browser local visitor ID, server fingerprint, optional `anonymous_id`, custom identified ID, alias, and session key have different semantics.
8. **Consent enforcement:** the source has opt-out and masking controls, but no consent state machine or consent proof on an event.

The submodule also does not establish Redis persistence/failover configuration,
deployed API-key rate-limit wiring for `/api/track`, or a product-level guarantee
for event retention beyond the table definitions inspected here. These are
deployment or contract questions, not facts that can be safely inferred from
the local tracker code.

## Cimi Design Takeaways

- Treat event occurrence time, ingestion time, and session time as separate fields if Cimi needs offline ingestion or reliable chronological replay.
- Require a caller-generated event ID and define duplicate behavior before adding retries.
- Make normal event delivery durable independently of session state; Rybbit's in-memory queue is intentionally lossy on process/ClickHouse failure.
- Keep anonymous device identity, identified person identity, alias links, and session records as separate domain concepts.
- Define whether a client-generated anonymous ID is durable and consent-gated; Rybbit's ordinary browser path uses server-derived identity despite persisting a different local visitor ID.
- Make exclusion, bot handling, URL/query capture, raw IP, custom properties, traits, and replay masking explicit independent privacy decisions.
- If Cimi adopts a sliding inactivity session, specify what refreshes it, whether offline-delayed events use occurrence or receipt time, and what happens across Redis/process restart.
