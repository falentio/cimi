# Umami Event Ingestion and Session Semantics

**For:** Cimi issue #7
**Source scope:** Only the local git submodule at `docs/research/vendor/umami`.
**Version:** The checkout is tagged `v3.3.1`; the package also declares version `3.3.1` (`docs/research/vendor/umami/package.json:1-4`).

No GitHub API, web search, or web fetch was used. The checkout has no local `docs/` subtree; its README is installation-oriented and points to external documentation (`docs/research/vendor/umami/README.md:20-77`). The findings below therefore prioritize the local tracker, ingestion routes, queries, schemas, migrations, and tests.

## Executive Findings

- **Fact:** The primary browser ingestion envelope is `{ type, payload }`. The accepted ingestion types are `event`, `identify`, and `performance`; the route is intentionally unauthenticated (`docs/research/vendor/umami/src/app/api/send/route.ts:32-76`).
- **Fact:** A website session ID is deterministic for a source, client IP, user-agent string, and a rotating salt. The default salt rotation is monthly (`docs/research/vendor/umami/src/app/api/send/route.ts:151-158`; `docs/research/vendor/umami/src/lib/crypto.ts:48-77`).
- **Fact:** Visits are separate from sessions. The server carries a signed cache token in memory on the browser; absent an explicit timestamp, that token's `iat` causes a new visit after 1,800 seconds (`docs/research/vendor/umami/src/app/api/send/route.ts:180-194`).
- **Fact:** Pageviews and custom events share the same `website_event` row. A named website event is type `2`; an unnamed website event is type `1` pageview (`docs/research/vendor/umami/src/app/api/send/route.ts:253-307`; `docs/research/vendor/umami/src/lib/constants.ts:118-124`).
- **Fact:** The browser tracker is best-effort. It uses `fetch(..., { keepalive: true })`, catches failures, and has no durable queue or retry path (`docs/research/vendor/umami/src/tracker/index.ts:383-418`).
- **Inference:** Replaying the same logical event can create duplicate analytics rows. There is no client event ID or idempotency key in the envelope, event IDs are newly generated on every save, and the main ClickHouse event tables use `MergeTree`, not a replacing/deduplicating engine (`docs/research/vendor/umami/src/queries/sql/events/saveEvent.ts:106-142,213-279`; `docs/research/vendor/umami/db/clickhouse/schema.sql:1-74`).
- **Fact:** Umami supplies useful attribution fields, including URL/referrer parts, UTM parameters, and several ad click IDs, but it stores URL query strings unless the tracker is configured to remove search parameters (`docs/research/vendor/umami/src/tracker/index.ts:265-292`; `docs/research/vendor/umami/src/app/api/send/route.ts:196-307`).
- **Unavailable in the inspected checkout:** There is no explicit event-ingestion contract for offline persistence, retry policy, duplicate handling, timestamp skew/range validation, consent state, or server-side PII redaction.

## Collection Envelope

### Transport

The tracker builds its endpoint from `host-url` and a compile-time endpoint default of `/api/send` (`docs/research/vendor/umami/src/tracker/index.ts:241-257`; `docs/research/vendor/umami/rollup.tracker.config.js:14-18`). It POSTs JSON with the following shape and headers:

```text
{
  "type": "event" | "identify" | "performance",
  "payload": { ... }
}
```

The browser sends `x-umami-website-id`, `x-umami-hostname`, and, when available, `x-umami-cache`; the route's schema requires the source ID in the payload itself (`docs/research/vendor/umami/src/tracker/index.ts:396-407`; `docs/research/vendor/umami/src/app/api/send/route.ts:32-71`). The route calls `parseRequest` with `skipAuth: true`, so the tracker endpoint has no user authentication requirement (`docs/research/vendor/umami/src/app/api/send/route.ts:74-80`; `docs/research/vendor/umami/src/app/api/send/route.test.ts:135-139`).

### Accepted payload fields

The route schema recognizes these categories (`docs/research/vendor/umami/src/app/api/send/route.ts:32-60`):

| Category | Fields and behavior |
| --- | --- |
| Source | Exactly one of `website`, `link`, or `pixel`. |
| Page | `url`, `hostname`, `title`, `referrer`, `language`, `screen`, and `tag`. |
| Event | Optional `name` and arbitrary object `data`. |
| Client overrides | Optional `ip`, `userAgent`, `browser`, `os`, and `device`. |
| Identity | Optional `id`, used as the Distinct ID. |
| Time | Optional integer `timestamp`. |
| Performance | Optional `lcp`, `inp`, `cls`, `fcp`, and `ttfb`. |

The browser's public types expose the same page/event/identity concepts. `track()` supports a pageview, a name-only event, a named event with data, a fully supplied payload, or a callback that modifies the default payload; `identify()` accepts an ID and optional data (`docs/research/vendor/umami/src/tracker/index.ts:1-92,93-176`; `docs/research/vendor/umami/src/tracker/index.ts:431-459`).

There is also a separate `/api/batch` route. It accepts at most 500 arbitrary objects, then invokes the normal send handler once per object, sequentially (`docs/research/vendor/umami/src/app/api/batch/route.ts:1-54`). Session replay and heatmap ingestion are separate `/api/record` types, not values accepted by `/api/send`; record requests allow at most 200 events and are capped at 1,000,000 request bytes (`docs/research/vendor/umami/src/app/api/record/route.ts:23-69,104-118`).

## Pageviews and Custom Events

### Pageviews

By default, tracker initialization sends one pageview. It also wraps `history.pushState` and `history.replaceState` and schedules a pageview when the normalized URL changes (`docs/research/vendor/umami/src/tracker/index.ts:301-332,421-427`). The inspected handler does not register a `popstate` handler; back/forward navigation is therefore not shown as an explicit tracker path in this source.

URL normalization can remove the query string and/or hash using `data-exclude-search="true"` and `data-exclude-hash="true"` (`docs/research/vendor/umami/src/tracker/index.ts:265-275,241-252`). Same-origin referrers have their origin stripped before transmission (`docs/research/vendor/umami/src/tracker/index.ts:277-292`).

### Custom events

The tracker supports:

- `umami.track('signup-button')` for a named event.
- `umami.track('signup-button', { plan: 'pro' })` for a named event with properties.
- `umami.track({ ...payload, name, data })` or a callback for full control (`docs/research/vendor/umami/src/tracker/index.ts:431-439`; `docs/research/vendor/umami/src/tracker/index.d.ts:82-141`).
- Automatic click events from `data-umami-event` and `data-umami-event-*` attributes (`docs/research/vendor/umami/src/tracker/index.ts:334-371`).

The server selects the event type in priority order: link event, pixel event, named custom event, otherwise pageview (`docs/research/vendor/umami/src/app/api/send/route.ts:253-259`). The event type constants are pageview `1`, custom event `2`, link event `3`, pixel event `4`, and performance `5` (`docs/research/vendor/umami/src/lib/constants.ts:118-124`).

Event data is flattened into key/value rows. Nested objects become dotted keys; arrays are stored as serialized array values; strings are truncated to 500 characters, and oversized serialized arrays are dropped rather than truncated (`docs/research/vendor/umami/src/lib/data.ts:11-24,41-61,63-92`). Event data is saved for any event row when present, and a positive `revenue` plus `currency` pair also creates a revenue row (`docs/research/vendor/umami/src/queries/sql/events/saveEvent.ts:144-168`; `docs/research/vendor/umami/src/queries/sql/events/saveRevenue.ts:7-37`).

## Validation and Limits

### Request validation

The ingestion schema validates the type enum, requires exactly one source, validates URL-or-path syntax for `url` and `referrer`, rejects event names and tags beginning with spreadsheet formula triggers, and bounds web-vitals values (`docs/research/vendor/umami/src/app/api/send/route.ts:24-72,55-60`; `docs/research/vendor/umami/src/app/api/send/route.test.ts:142-227`).

The `data` field is `anyObjectParam`, which is only a string-keyed record of `any` values (`docs/research/vendor/umami/src/lib/schema.ts:105-119`). The send route has no request-byte limit, no event-data property-count limit, no nesting-depth limit, and no timestamp range or clock-skew validation in the inspected schema (`docs/research/vendor/umami/src/app/api/send/route.ts:32-60`).

The browser type comments describe intended event-data rules: numbers with four-decimal precision, strings and arrays at 500 characters, and objects with at most 50 properties (`docs/research/vendor/umami/src/tracker/index.ts:67-79`). The tracker forwards event data directly; the inspected runtime code does not enforce those exact rules before sending (`docs/research/vendor/umami/src/tracker/index.ts:431-439`). The actual enforcement is primarily storage normalization:

| Stored value | Limit in `FIELD_LENGTH` | Enforcement |
| --- | ---: | --- |
| URL, page title, referrer path/query/domain | 500 | Truncated before relational and ClickHouse writes. |
| UTM and click IDs | 255 | Truncated before writes. |
| Event name and tag | 50 | Truncated before writes. |
| Distinct ID | 50 | Truncated in session, session-link, session-data, and ClickHouse event paths. |
| Event-data key and scalar string value | 500 | Truncated by the flatten/store path. |
| Currency | 10 | Truncated in revenue storage. |

The constants define these limits (`docs/research/vendor/umami/src/lib/constants.ts:271-290`), and `saveEvent` applies them to page, attribution, event, session, and performance fields (`docs/research/vendor/umami/src/queries/sql/events/saveEvent.ts:108-140,217-260`).

### Other bounded ingestion

Batch ingestion caps the number of objects at 500 but does not add an idempotency key (`docs/research/vendor/umami/src/app/api/batch/route.ts:7-8,17-54`). Recorder ingestion separately caps a request at 1 MB and 200 events (`docs/research/vendor/umami/src/app/api/record/route.ts:23-69,104-118`). Those limits do not establish a corresponding `/api/send` event-body limit.

## Client and Server Timestamps

For `/api/send`, `timestamp` is interpreted as Unix seconds and converted to a JavaScript `Date`; when omitted, `createdAt` is the server's current time (`docs/research/vendor/umami/src/app/api/send/route.ts:151-152`). That same `createdAt` is written to the session, website event, event-data, session-data, identity-link, and revenue records (`docs/research/vendor/umami/src/app/api/send/route.ts:162-177,261-307,316-343`; `docs/research/vendor/umami/src/queries/sql/events/saveEvent.ts:140-153`; `docs/research/vendor/umami/src/queries/sql/sessions/saveSessionData.ts:65-114`).

The timestamp also affects identity and visit formation: the session salt is derived from the timestamp's rotation period and the visit salt from its UTC hour (`docs/research/vendor/umami/src/app/api/send/route.ts:154-158`). An explicit timestamp disables the 30-minute cached-visit expiry check (`docs/research/vendor/umami/src/app/api/send/route.ts:190-194`; `docs/research/vendor/umami/src/app/api/send/route.test.ts:731-754`).

**Inference:** A caller can backdate or future-date normal events subject only to integer/date/database behavior. The inspected route has no acceptable timestamp window, maximum age, future tolerance, or server/client clock reconciliation.

The separate replay/heatmap route has a different convention: its outer `timestamp` is multiplied by 1,000, while recorder event timestamps are used directly as millisecond values (`docs/research/vendor/umami/src/app/api/record/route.ts:190-200,220-238`; `docs/research/vendor/umami/src/recorder/index.js:78-102,267-274`).

## Session, Visit, and Identity Formation

### Anonymous session

The server computes:

```text
sessionId = uuid(sourceId, ip, userAgent, sessionSalt)
sessionSalt = hash(startOfDay|startOfWeek|startOfMonth(createdAt).toUTCString())
```

`SALT_ROTATION` selects day, week, or month; the default is month. `uuid()` is deterministic UUIDv5 when arguments are supplied and incorporates the application secret (`docs/research/vendor/umami/src/app/api/send/route.ts:154-158`; `docs/research/vendor/umami/src/lib/crypto.ts:48-77`). Local tests verify stability for the same device and different IDs for different client inputs (`docs/research/vendor/umami/src/lib/session.test.ts:1-24`).

The source ID is the website, link, or pixel ID (`docs/research/vendor/umami/src/app/api/send/route.ts:84-106`). The raw IP and user-agent participate in the hash, but the reviewed PostgreSQL and ClickHouse event/session schemas do not have a raw IP or raw user-agent column (`docs/research/vendor/umami/src/app/api/send/route.ts:135-158`; `docs/research/vendor/umami/prisma/schema.prisma:39-68,116-166`; `docs/research/vendor/umami/db/clickhouse/schema.sql:1-55`).

### Visit

The cache token carries `sessionId`, `visitId`, `iat`, and optional identity-link state (`docs/research/vendor/umami/src/app/api/send/route.ts:16-22,374-379`). The visit ID is initially derived from the session ID and the event timestamp's UTC hour. A cached visit is reused until either the session drifts or, for events without an explicit timestamp, the cached `iat` is more than 1,800 seconds old (`docs/research/vendor/umami/src/app/api/send/route.ts:180-194`).

**Inference:** The 30-minute rule is primarily a browser-cache continuity rule, not a database inactivity query. If the browser cache is lost, the server deterministically derives a visit from the current UTC hour; a reload within that hour can therefore reuse the same visit ID, while an hour boundary can change it even without 30 minutes of inactivity.

### Relational versus ClickHouse session persistence

With PostgreSQL/relational storage, the route creates a session when there is no valid cache or when the computed session differs from the cached one. `createSession` uses `on conflict (session_id) do nothing`, so repeated session initialization does not create duplicate session rows (`docs/research/vendor/umami/src/app/api/send/route.ts:159-177`; `docs/research/vendor/umami/src/queries/sql/sessions/createSession.ts:8-57`).

With ClickHouse enabled, the route does not create a session row; session reads are derived from event data. The ClickHouse event table contains the session and visit IDs, while the separate session-data and session-link tables use replacing engines (`docs/research/vendor/umami/src/app/api/send/route.ts:159-177`; `docs/research/vendor/umami/src/queries/sql/sessions/updateSession.ts:42-49`; `docs/research/vendor/umami/db/clickhouse/schema.sql:76-91,428-439`).

### Identified sessions

The tracker holds `identity` and `cache` in JavaScript variables. `identify()` sets the identity, clears the cache, and sends an `identify` envelope with optional data (`docs/research/vendor/umami/src/tracker/index.ts:441-458,641-645`).

For a website identify request with an ID, the server:

1. Computes a link key from the current session and ID.
2. Inserts a website-scoped `session_link` row and updates the relational session's `distinct_id`.
3. Stores flattened session data, updating the existing `(session_id, data_key)` row in relational storage.

Evidence: `docs/research/vendor/umami/src/app/api/send/route.ts:308-343`; `docs/research/vendor/umami/src/queries/sql/sessions/saveSessionLink.ts:24-55`; `docs/research/vendor/umami/src/queries/sql/sessions/updateSession.ts:22-40`; `docs/research/vendor/umami/src/queries/sql/sessions/saveSessionData.ts:35-49,65-114`; `docs/research/vendor/umami/prisma/schema.prisma:39-80,191-212`.

The ID is caller supplied and storage-truncated to 50 characters (`docs/research/vendor/umami/src/lib/constants.ts:271-290`; `docs/research/vendor/umami/src/queries/sql/sessions/saveSessionLink.ts:49-52`). Identity-link failures are deliberately best-effort and do not prevent session-data writes (`docs/research/vendor/umami/src/app/api/send/route.ts:313-343`).

**Inference:** Anonymous continuity is not a durable browser visitor identity. A full browser reload loses the in-memory cache and identity; the anonymous session may recur only because the server recomputes the same source/IP/user-agent/salt tuple. Cross-device or cross-input continuity requires the integrator to send the same Distinct ID.

## Deduplication, Retries, Restart, and Offline Behavior

### Duplicate handling

There is no event ID in the browser envelope. Relational `saveEvent` creates a fresh UUID for every call, and the ClickHouse path does the same (`docs/research/vendor/umami/src/queries/sql/events/saveEvent.ts:106-108,213-221`). PostgreSQL gives each event row a unique primary key, but that key is newly generated rather than supplied by the client (`docs/research/vendor/umami/prisma/schema.prisma:116-166`). The main ClickHouse `website_event` and `event_data` tables are `MergeTree`; only session data and session links use replacing engines (`docs/research/vendor/umami/db/clickhouse/schema.sql:1-74,76-91,428-439`).

**Inference:** Repeating a request after an uncertain response is not idempotent. The repeated request receives a new event ID and can create another pageview/custom-event/event-data/revenue record. Session creation and repeated session-data/link writes have conflict/update behavior, but that does not deduplicate the event itself.

### Browser delivery and retry behavior

The tracker does not use `sendBeacon`, a persistent queue, local event storage, an online/offline listener, or a retry loop. It sends with `keepalive`, parses whatever JSON response is available, updates the in-memory cache, and silently catches failures (`docs/research/vendor/umami/src/tracker/index.ts:383-418`).

The batch route processes entries sequentially and reports non-OK responses, but it does not retry failed entries (`docs/research/vendor/umami/src/app/api/batch/route.ts:17-54`).

Kafka does have a 3-second send timeout and one acknowledgment, but its error handler logs the failure and returns an empty result instead of propagating an error (`docs/research/vendor/umami/src/lib/kafka.ts:7-11,90-143`). **Inference:** In Kafka mode, an ingestion request can receive the normal successful route response even when Kafka delivery failed, so a client retry cannot be driven by that failure.

### Restart behavior

The browser's cache token and current identity are not persisted by the tracker. The only local-storage read in the tracker is the `umami.disabled` opt-out flag (`docs/research/vendor/umami/src/tracker/index.ts:228-233,376-381,641-645`).

The cache token itself is a signed JWT returned by the server and parsed statelessly on the next request (`docs/research/vendor/umami/src/app/api/send/route.ts:108-129,374-379`; `docs/research/vendor/umami/src/lib/jwt.ts:4-13`). **Inference:** A server process restart need not invalidate an otherwise valid token, but a browser/page restart loses the token and identity. With relational storage, recomputation is safe for the session row because session creation uses `on conflict do nothing`; it is not safe for event delivery because events have fresh IDs.

## Attribution Fields

For website/link/pixel event collection, the route parses and stores:

- URL path, URL query, hostname, and decoded page title.
- Referrer path, referrer query, and referrer domain.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`.
- `gclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, and `twclid`.
- Browser, OS, device, screen, language, country, region, city, Distinct ID, and tag.

Evidence: `docs/research/vendor/umami/src/app/api/send/route.ts:196-307`; `docs/research/vendor/umami/db/clickhouse/schema.sql:8-48`; `docs/research/vendor/umami/prisma/schema.prisma:116-166`.

The route resolves path-only referrers, canonicalizes the event domain, and suppresses the referrer domain for self-referrals (`docs/research/vendor/umami/src/app/api/send/route.ts:229-250`). The client can remove search and hash data before transmission, but absent those flags the server stores the full URL query string and includes the hash in `urlPath` (`docs/research/vendor/umami/src/tracker/index.ts:265-275`; `docs/research/vendor/umami/src/app/api/send/route.ts:200-203`).

**Privacy implication:** Query strings and fragments can contain application identifiers or other sensitive values. The inspected ingestion path has length limits and formula-trigger protection for `name`/`tag`, but no general query-parameter allowlist or PII redaction (`docs/research/vendor/umami/src/app/api/send/route.ts:24-30,200-307`; `docs/research/vendor/umami/src/queries/sql/events/saveEvent.ts:114-134`).

## Bot, Exclusion, and Privacy Filtering

### Server-side gates

- **Bots:** `isbot(userAgent)` causes a 200 response `{ beep: 'boop' }` and skips persistence unless `DISABLE_BOT_CHECK` is set (`docs/research/vendor/umami/src/app/api/send/route.ts:141-144`; `docs/research/vendor/umami/src/app/api/send/route.test.ts:230-257`).
- **IP exclusion:** `IGNORE_IP` supports exact IPs and CIDR ranges; a match returns 403 before persistence (`docs/research/vendor/umami/src/lib/detect.ts:150-179`; `docs/research/vendor/umami/src/app/api/send/route.ts:146-149`; `docs/research/vendor/umami/src/app/api/send/route.test.ts:260-274`).
- **Location:** The server derives location from provider headers or GeoLite data and does not produce location for invalid/local IPs (`docs/research/vendor/umami/src/lib/detect.ts:87-134`).
- **Client domain allowlist:** `data-domains` disables tracking unless the current hostname is listed (`docs/research/vendor/umami/src/tracker/index.ts:245-255,376-381`).
- **Do Not Track:** `data-do-not-track="true"` makes the tracker honor browser DNT values of `1` or `yes` (`docs/research/vendor/umami/src/tracker/index.ts:294-297,376-381`).
- **Local opt-out:** A truthy `localStorage['umami.disabled']` disables tracker sends (`docs/research/vendor/umami/src/tracker/index.ts:376-381`).
- **Payload hook:** `data-before-send` names a callback that may inspect, modify, or cancel a payload, including asynchronously (`docs/research/vendor/umami/src/tracker/index.ts:383-394`; `docs/research/vendor/umami/src/tracker/index.d.ts:189-193`).

The server accepts `ip`, `userAgent`, browser, OS, and device values from the payload before bot detection and session hashing (`docs/research/vendor/umami/src/lib/detect.ts:136-147`). **Inference:** A server-side integration can spoof those values unless Cimi constrains the endpoint or strips the overrides; the built-in bot/IP gates are not an authenticated client identity boundary.

### What is not a built-in privacy filter

The reviewed local source does not expose consent state, consent history, category-based collection, a server-side PII detector, a query-parameter allowlist, or an identity deletion/suppression marker in the send path. The browser has opt-out and configuration hooks, but Cimi would have to decide when to load/send the tracker and how to handle withdrawal.

The analytics query layer has filters for path, referrer, device, location, Distinct ID, event, UTM values, and event/session properties (`docs/research/vendor/umami/src/lib/schema.ts:45-71`; `docs/research/vendor/umami/src/lib/constants.ts:40-100`). Those are report/query filters after collection, not ingestion-time redaction.

## Unavailable or Unspecified

Within the inspected local source, tests, migrations, and README, the following behavior is not specified as a supported contract:

- A client-generated event ID, idempotency key, deduplication window, or duplicate reconciliation rule.
- Browser offline buffering, durable event storage, retry/backoff, or a delivery guarantee.
- A timestamp freshness window, future-date policy, client/server clock correction, or an explicit server-time field alongside client time.
- A maximum `/api/send` request size or a general event-data property/depth limit.
- Consent records, consent-mode states, per-field redaction, query-string filtering on the server, or automatic PII detection.
- A durable anonymous browser ID or automatic cross-device identity stitching without an integrator-supplied `id`.
- A documented guarantee that SPA back/forward navigation emits a pageview; the local tracker path only wraps `pushState` and `replaceState`.
- A local end-user event API document: the checked-in README describes installation, while the product documentation it references is outside the permitted local-only evidence set (`docs/research/vendor/umami/README.md:20-77`).

## Cimi Implications

1. Treat browser collection as lossy telemetry, not an auditable event log. If Cimi needs retry, add an adapter-level idempotency key and deduplication policy rather than blindly replaying Umami requests.
2. Prefer server timestamps for authoritative ordering, or explicitly bound and monitor client timestamps before forwarding them.
3. Decide whether Umami's rotating, IP/user-agent-derived session bucket is acceptable for Cimi. It is not equivalent to a durable anonymous visitor identity.
4. Configure `exclude-search`/`exclude-hash` or sanitize URLs before collection if Cimi URLs can contain identifiers or secrets.
5. Treat `identify` data and custom event data as caller-controlled analytics data. Define an allowlist for Distinct IDs, session properties, and event properties before sending them.
6. Keep bot/IP/DNT/opt-out decisions explicit in Cimi's collection policy; Umami provides gates, but not a consent or privacy-governance model.
