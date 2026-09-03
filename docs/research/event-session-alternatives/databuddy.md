# Databuddy Analytics: Event Ingestion and Session Semantics

## Scope and evidence

This report uses only the vendored Databuddy checkout at
`docs/research/vendor/databuddy`. The checkout is pinned to commit
`d15fcb5dac3605746dd08a35aac3de5f3ab4c2f3`, and was clean when inspected on
2026-08-23. The evidence is the local source, schemas, documentation, and
tracker tests. No hosted API, external documentation, GitHub API, or web
search is used.

The labels below distinguish:

- **Fact:** directly implemented, tested, or represented by a local schema.
- **Inference:** a conclusion from the implementation, not an explicit product promise.
- **Unavailable:** not established by the reviewed checkout.

## Executive findings

- **Fact:** Databuddy has separate ingestion paths for legacy analytics events,
  browser batches, lean custom events, errors, web vitals, outgoing links, and
  identity updates. The browser tracker sends automatic `screen_view` and
  `page_exit` events through the analytics batch path and sends `track()` calls
  through the custom-event `/track` path (`packages/tracker/src/index.ts:164-202,273-314,378-417`; `apps/basket/src/routes/basket.ts:401-478,479-689`; `apps/basket/src/routes/track.ts:219-397`).
- **Fact:** A pageview is a `screen_view` analytics event. The materialized
  pageview view emits one count for every matching event; there is no separate
  pageview payload or server-side pageview reconstruction in the inspected
  schema (`packages/db/src/clickhouse/schema/analytics/pageviews/daily_pageviews_mv.sql:1-16`).
- **Fact:** Sessions are client-assigned `sess_<UUID>` values. The browser
  reuses a session while the stored session timestamp is less than 30 minutes
  old, and refreshes that timestamp when the tracker initializes. The source
  does not show a timer that rotates a session while an open page remains idle
  (`packages/tracker/src/core/tracker.ts:263-297`).
- **Fact:** Server session queries group rows by the supplied `session_id` and
  calculate duration from `page_exit.time_on_page` or event-time boundaries.
  The reviewed query layer does not create sessions by server-side inactivity
  gap (`packages/ai/src/query/builders/sessions.ts:24-47,238-280`).
- **Fact:** The browser queues events only in memory. It batches after a
  threshold or timeout, retries retryable fetches, and attempts unload delivery
  with `sendBeacon`; `sendBeacon` acceptance is not a persistence
  acknowledgement (`packages/tracker/src/core/tracker.ts:634-731,820-849`; `packages/tracker/src/index.ts:225-313`; `packages/tracker/src/core/client.ts:142-211`).
- **Fact:** The server uses Redis delivery reservations before publishing to
  Kafka/direct fallback, with stable delivery identities and explicit handling
  for duplicate, concurrent, failed, and ambiguous acknowledgements
  (`apps/basket/src/lib/security.ts:9-21,345-436,481-599`; `apps/basket/src/lib/event-service.ts:289-315,414-493`).
- **Inference:** Databuddy's model is suitable for a Cimi implementation that
  assigns identity and sessions at the edge, but Cimi would need to define
  durable offline behavior, server-side sessionization, retention, and deletion
  separately. Those guarantees are not supplied by the reviewed source.

## Event model and transport

### Ingestion paths

| Path        | Payload                                                                    | Storage or effect                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`         | `analyticsEventSchema` or `outgoingLinkSchema` with a `type` discriminator | Analytics events or outgoing links (`apps/basket/src/routes/basket.ts:401-478`)                                                                                           |
| `/batch`    | Array of analytics or outgoing-link events, maximum 100                    | Valid items are delivered in grouped batches; individual schema failures are returned in `results` (`apps/basket/src/routes/basket.ts:479-689`)                           |
| `/track`    | One or up to 100 lean custom-event spans                                   | `analytics.custom_events`; accepts website-ID or API-key authentication (`apps/basket/src/routes/track.ts:219-397`)                                                       |
| `/events`   | Up to 100 v2 custom-event spans                                            | `analytics.custom_events`; requires an organization-backed website (`apps/basket/src/routes/basket.ts:326-400`; `packages/validation/src/schemas/custom-events.ts:36-59`) |
| `/vitals`   | Up to 20 individual vital metrics                                          | `analytics.web_vitals_spans` (`packages/validation/src/schemas/web-vitals.ts:61-91`; `apps/basket/src/lib/event-service.ts:597-635`)                                      |
| `/errors`   | Up to 50 error spans                                                       | `analytics.error_spans` (`packages/validation/src/schemas/errors.ts:75-121`; `apps/basket/src/lib/event-service.ts:542-595`)                                              |
| `/identify` | Profile ID, optional anonymous ID, scalar traits                           | PostgreSQL profiles, aliases, and trait history (`apps/basket/src/routes/identify.ts:126-200`; `packages/services/src/identity.ts:146-253`)                               |
| `/px.jpg`   | Query-string pixel variants                                                | Pixel response after the same bot/schema processing; delivery is not directly acknowledged to the caller (`apps/basket/src/routes/basket.ts:151-231`)                     |

The browser tracker sets the client ID in a request header and also sends it as
the query parameter expected by each endpoint. Its default base URL is
`https://basket.databuddy.cc` (`packages/tracker/src/core/tracker.ts:103-135`).

### Common analytics event envelope

The full analytics schema requires `eventId` and `name`, and accepts the
following groups of fields:

- Identity: `anonymousId`, `profileId`, `sessionId`, and optional
  `sessionStartTime` (`packages/validation/src/schemas/analytics.ts:68-76`).
- Navigation: `referrer`, `path`, `title`, `page_count`, and page engagement
  fields (`packages/validation/src/schemas/analytics.ts:77-131`).
- Client context: viewport, language, timezone, connection type, RTT, and
  downlink (`packages/validation/src/schemas/analytics.ts:94-108`).
- Acquisition: five UTM values and `gclid`
  (`packages/validation/src/schemas/analytics.ts:132-157`).
- Performance: load, DOM, TTFB, render, redirect, and lookup timings
  (`packages/validation/src/schemas/analytics.ts:158-189`).
- Custom data: `properties`, bounded by key count and serialized size
  (`packages/validation/src/schemas/analytics.ts:196-212`).

The ClickHouse `analytics.events` table stores the event name, anonymous and
session IDs, timestamps, URL/path, referrer, device and geo fields, campaign
fields, engagement data, properties, and `profile_id`. It uses a stable UUID
`id` and a `ReplacingMergeTree` ordered by `(client_id, id)`
(`packages/db/src/clickhouse/schema/analytics/core/events.sql:1-56`).

## Pageviews and page lifecycle

**Fact:** The browser tracker emits an initial `screen_view` asynchronously,
then emits another `screen_view` after a detected URL/navigation change. It
debounces route changes by 50 ms, increments `page_count`, resets engagement
state, and avoids duplicate URLs (`packages/tracker/src/index.ts:93-161,164-202`).

**Fact:** A page exit is emitted when moving between tracked URLs and during
page lifecycle teardown. It includes the prior path, seconds on page, maximum
scroll depth, interaction count, and page count
(`packages/tracker/src/index.ts:189-202,273-343`).

**Fact:** The pageview materialized view selects only
`analytics.events.event_name = 'screen_view'`, uses the event's `client_id`,
`time`, and `id`, and adds `pageviews = 1`
(`packages/db/src/clickhouse/schema/analytics/pageviews/daily_pageviews_mv.sql:1-16`).

**Inference:** Duplicate `screen_view` rows are counted as separate pageviews
unless their stable event IDs converge and the replacing engine removes the
older version. The view itself does not deduplicate by URL, path, session, or
time window.

**Unavailable:** The reviewed checkout does not establish whether materialized
view mutations are reconciled after late or failed source delivery, or whether
an operational job repairs aggregates.

## Custom events

### Browser and `/track`

The tracker creates a custom event with a generated UUID event ID, name,
timestamp, current path, properties, anonymous/profile/session IDs, website ID,
and `source: "browser"`. It queues these events separately from automatic
analytics events and flushes them to `/track` (`packages/tracker/src/core/tracker.ts:767-795`).

The `/track` route accepts either one object or an array of up to 100 objects.
Its route-local schema allows an optional event ID, a name up to 256 characters,
an optional namespace/path, numeric/string/Date timestamps, profile/session IDs,
and bounded JSON properties (`apps/basket/src/routes/track-event-schema.ts:9-71`).
It maps each item to the custom-event table with `owner_id`, optional
`website_id`, timestamp, event name, path, properties, IDs, and source
(`apps/basket/src/routes/track.ts:370-388`).

### `/events` and v2 spans

The v2 custom span schema uses `eventName` rather than `name`, requires an
integer timestamp and path, accepts optional profile/session/anonymous IDs, and
allows at most 100 items per request (`packages/validation/src/schemas/custom-events.ts:36-61`).
Unlike the shared analytics timestamp schema, this v2 custom-event schema does
not itself enforce the minimum timestamp or one-hour future window
(`packages/validation/src/schemas/custom-events.ts:36-55`; compare
`packages/validation/src/schemas/analytics.ts:54-66`).

### Storage

`analytics.custom_events` stores owner and website IDs, timestamp, event name,
namespace, path, properties, anonymous/session/profile IDs, source, and a
delivery ID. Its materialized `delivery_key` is `delivery:<id>` when an ID is
present, but otherwise contains a generated UUID under a `legacy:` prefix. The
table is a `ReplacingMergeTree` ordered by `(owner_id, delivery_key)`
(`packages/db/src/clickhouse/schema/analytics/core/custom_events.sql:1-27`).

## Validation and timestamps

Shared limits include the following (`packages/validation/src/constants.ts:1-59`):

| Limit                    |                           Value |
| ------------------------ | ------------------------------: |
| Minimum timestamp        | `946684800000` (2000-01-01 UTC) |
| Maximum future timestamp |                          1 hour |
| Event ID                 |                  512 characters |
| Standard event name      |                  128 characters |
| Anonymous/session ID     |                  128 characters |
| Path/string              |                2,048 characters |
| Payload                  |                 1,000,000 bytes |
| Batch                    |                       100 items |
| Property keys            |                              50 |
| Property key length      |                  128 characters |
| Serialized properties    |                    32,768 bytes |
| Traits                   |                     2,048 bytes |

The standard analytics, errors, and v1 web-vitals schemas apply the shared
minimum and future timestamp window. The `/track` custom route applies the same
window but also accepts ISO strings and `Date` values before normalizing them
(`packages/validation/src/schemas/analytics.ts:54-66`; `packages/validation/src/schemas/errors.ts:10-22`; `packages/validation/src/schemas/web-vitals.ts:10-22`; `apps/basket/src/routes/track-event-schema.ts:20-42`).

The server still sanitizes values while constructing rows. For example,
analytics event IDs are converted into stable UUIDs derived from client ID,
event type, and source event ID; paths, names, URLs, profile IDs, and session
IDs are sanitized or validated before publication
(`apps/basket/src/lib/event-service.ts:130-158,160-224`).

## Delivery, retries, and deduplication

### Browser delivery

The default browser options are batching enabled, batch size 10, five-second
batch timeout, retries enabled, three HTTP retries, and a 500 ms initial retry
delay (`packages/tracker/src/core/tracker.ts:103-135`). Separate queues use
endpoint maxima of 100 analytics events, 100 custom events, 20 vitals, and 50
errors (`packages/tracker/src/core/tracker.ts:137-181`).

The HTTP client retries status 408, 425, 429, and all 5xx responses, plus
network errors, with jittered exponential delays and a ten-second request
timeout by default (`packages/tracker/src/core/client.ts:52-83,142-211,245-269`).
After a retryable batch failure, the tracker puts the batch back in the queue
and schedules another queue flush. The queue-level source has no visible
durable storage or independent maximum attempt count; the delay is capped at
30 seconds (`packages/tracker/src/core/tracker.ts:652-731`).

At unload, the tracker chunks queued data to a 60 KiB beacon payload, using
`sendBeacon` first and fetch fallback when beacon submission is unavailable.
The source explicitly states that a `true` beacon result only means the browser
accepted the payload for transfer, not that the server persisted it
(`packages/tracker/src/index.ts:19-25,225-313`; `packages/tracker/src/core/tracker.ts:820-849`).

### Server delivery identity

For direct analytics and outgoing-link events, the server derives a stable UUID
from `(clientId, eventType, sourceEventId)`. If the client omits an event ID, the
server generates one for that request, so two independent requests without an
event ID do not share the same direct-event identity
(`apps/basket/src/lib/event-service.ts:130-158,226-315`).

For batch span tables without an exposed ID column, the server hashes a scope,
event type, and either the supplied event ID or the canonical source payload
plus batch index. Exact retries of the same batch therefore remain identifiable;
changing order or payload changes the fallback identity
(`apps/basket/src/lib/event-service.ts:83-127,495-524`).

### Redis reservation flow

Deduplication keys are `dedup:<eventType>:<deliveryId>`. A request first obtains
a 30-second pending reservation, publishes the event, and promotes the key to
`delivered` only after confirmed producer acknowledgement. Delivered keys last
24 hours, or 48 hours for source IDs beginning with `exit_`
(`apps/basket/src/lib/security.ts:9-21,345-394,635-665`).

Redis reservation operations have a 750 ms deadline and a five-second circuit
cooldown. Unknown Redis outcomes return a retryable response rather than
publishing without ownership. An uncertain Kafka acknowledgement is marked
`ambiguous`; later retries remain Kafka-only instead of switching sinks
(`apps/basket/src/lib/security.ts:103-123,395-436,601-631`; `apps/basket/src/lib/event-service.ts:61-80,289-315`).

**Inference:** Delivery is designed for at-least-once transport with bounded
duplicate suppression, not exactly-once end-to-end execution. Stable IDs and
ClickHouse replacement reduce duplicates, but beacon acceptance, producer
ambiguity, Redis expiration, and legacy records without delivery IDs remain
important failure boundaries.

## Identity and session formation

### Browser state

The browser generates an `anon_<UUID>` value and persists it under
`localStorage["did"]`. It generates a `sess_<UUID>` value and persists it under
`sessionStorage["did_session"]`, with a timestamp under
`did_session_timestamp`. The tracker tests verify that both IDs survive reloads
(`packages/tracker/src/core/tracker.ts:237-297`; `packages/tracker/tests/persistence.spec.ts:3-66`).

The session ID is reused when its age is below 30 minutes; otherwise the stored
session state is removed and a new ID is generated. The check occurs at tracker
construction and BFCache restoration, not through a visible idle timer
(`packages/tracker/src/core/tracker.ts:276-293`; `packages/tracker/src/index.ts:316-332`).

**Inference:** A tab left open without another initialization, BFCache restore,
or application-level tracker reset can continue sending the same session ID
after 30 minutes. The documented 30-minute concept is therefore implemented as
an activity check at selected lifecycle points, not as continuous server or
client sessionization.

### Server queries

The main session metric groups `analytics.events` by `session_id`, counts
`screen_view` and engagement events, and sums positive `page_exit.time_on_page`.
It excludes empty session IDs and counts only sessions with at least one page
view (`packages/ai/src/query/builders/sessions.ts:24-47`). Other session queries
use `uniq(session_id)` for device, browser, time-series, and page reports
(`packages/ai/src/query/builders/sessions.ts:83-142`).

Session attribution takes the first value by event time for referrer, UTM
campaign fields, country, device type, browser, and OS
(`packages/ai/src/query/expressions.ts:106-130`).

**Unavailable:** No reviewed source establishes a server-side fallback that
splits a supplied session by inactivity, merges sessions after identifier
changes, or closes a session when no `page_exit` arrives.

## Attribution and identity stitching

The tracker captures `gclid`, `fbclid`, `ttclid`, `twclid`, `li_fat_id`, and
`msclkid` from the current URL. The advertising click IDs are kept in the
current in-memory URL parameter set; the UTM values are not persisted, while
persistable click IDs are saved under `localStorage["did_params"]`
(`packages/tracker/src/core/tracker.ts:24-37,498-536`). Base context also adds
the sanitized page URL, title, referrer, viewport, timezone, language, and
current attribution values (`packages/tracker/src/core/tracker.ts:561-593`).

The server stores referrer, URL/path, UTM fields, and `gclid` on analytics rows
(`apps/basket/src/lib/event-service.ts:160-224`; `packages/db/src/clickhouse/schema/analytics/core/events.sql:7-44`).

The visitor key used by query code is profile ID when non-empty and otherwise
anonymous ID. Custom events use the equivalent nullable fallback
(`packages/db/src/clickhouse/identity.ts:1-15`). The `/identify` route stores a
website-scoped profile and an optional website-scoped anonymous-to-profile alias;
profile traits and trait changes are persisted in PostgreSQL
(`apps/basket/src/routes/identify.ts:167-190`; `packages/services/src/identity.ts:146-253`; `packages/db/src/drizzle/schema/identity.ts:12-103`).

**Inference:** An identified profile can provide cross-event attribution only
for events that carry the profile ID or for query paths that explicitly consult
the identity graph. The reviewed source does not prove a historical ClickHouse
rewrite of earlier anonymous rows after `identify()`.

## Filtering, bot handling, and privacy

### Client controls

The tracker skips collection when disabled, running on localhost outside debug
mode, likely a bot, opted out, or matched by `skipPatterns`. It also supports an
event filter callback, sampling rate, and path masking patterns
(`packages/tracker/src/core/tracker.ts:404-434`; `packages/tracker/src/core/types.ts:10-37`).
Global Privacy Control, Do Not Track, local opt-out flags, and explicit opt-out
clear stored tracking state and cancel pending requests. The privacy tests
assert zero network requests and cleared identity storage for these cases
(`packages/tracker/src/core/utils.ts:167-214`; `packages/tracker/tests/privacy.spec.ts:35-133`).

Browser bot detection checks WebDriver markers, Headless Chrome, PhantomJS,
Selenium globals, and related DOM flags. It can be disabled with
`ignoreBotDetection` (`packages/tracker/src/core/tracker.ts:217-235`).

### Server controls

The server validates payload size, client/website status, origin, optional IP
allowlists, and usage before event processing. Missing or unauthorized origins
and IPs are rejected (`apps/basket/src/lib/request-validation.ts:57-243`; `apps/basket/src/routes/track.ts:76-132`).

Bot classification can allow a request, record it as an AI-traffic span while
returning 204, or block it while returning 204. The ingestion route runs this
check before publishing analytics data (`apps/basket/src/lib/request-validation.ts:246-324`; `apps/basket/src/routes/basket.ts:183-227`).

Visitor IDs are sanitized and, by default, daily-salted with SHA-256 before
storage. `anonymizeVisitorIds: false` preserves the supplied ID; `"auto"`
preserves raw IDs only for the current country allowlist, which contains the
United States (`apps/basket/src/lib/security.ts:87-97,163-225`). IP addresses
are geolocated and stored as a short salted hash, not as the raw address
(`apps/basket/src/utils/ip-geo.ts:171-232`; `apps/basket/src/lib/event-service.ts:184-201`).

There is a local documentation conflict: `apps/docs/content/docs/security.mdx`
says the anonymous ID is stored in local storage and never sent to servers
(`apps/docs/content/docs/security.mdx:43-48`), while the current tracker sends
`anonymousId` in event payloads and the server writes the processed value to
analytics tables (`packages/tracker/src/core/tracker.ts:775-787`; `apps/basket/src/lib/event-service.ts:167-183`). The source behavior should be treated as authoritative for this snapshot.

## Unavailable behavior and operational gaps

- **Durable offline queue:** No IndexedDB, service-worker queue, or other
  browser-durable event buffer was found in the reviewed tracker. Failed data
  remains in memory only and can be lost on process/tab termination
  (`packages/tracker/src/core/tracker.ts:78-81,652-731`; `packages/tracker/src/index.ts:273-313`).
- **Exact session closure:** No server-side inactivity splitter, idle timer,
  or guaranteed unload delivery was established. `sendBeacon` is best effort.
- **Retention:** The reviewed ClickHouse schemas contain partitions but no
  event/custom-event TTL clause. A complete retention or purge schedule was
  not established (`packages/db/src/clickhouse/schema/analytics/core/events.sql:52-56`; `packages/db/src/clickhouse/schema/analytics/core/custom_events.sql:23-27`).
- **Visitor deletion:** The reviewed tracker clear/opt-out paths remove local
  state and pending delivery, but no visitor-level analytics deletion request
  is issued (`packages/tracker/src/index.ts:423-447`; `packages/tracker/src/core/tracker.ts:404-458`).
- **Historical identity rewrite:** The source stores aliases and writes profile
  IDs on future events, but the reviewed paths do not establish a rewrite of
  prior ClickHouse events.
- **Exactly-once guarantee:** Redis reservations, producer acknowledgements,
  and replacing tables reduce duplicate effects, but no end-to-end exactly-once
  contract is stated or provable from these files.

## Implications for Cimi

1. **Use explicit event IDs.** Require a client-generated stable event ID for
   every event. Generate one only as a fallback, because server-generated IDs
   cannot correlate two independent retries that omitted the ID.
2. **Separate event categories.** Keep automatic pageviews, page exits, custom
   events, vitals, and errors as distinct event types or tables. Derive
   pageviews from an explicit `screen_view` event only if duplicate semantics are
   defined at the storage layer.
3. **Choose session ownership explicitly.** A client-generated session ID is
   simple and supports browser continuity, but Cimi should decide whether the
   30-minute timeout is checked only on initialization or enforced continuously.
   If sessions matter after missing unload events, add a server-side inactivity
   fallback rather than relying on `page_exit`.
4. **Make delivery semantics visible.** Use a pending/delivered/ambiguous state
   model when publishing to a queue. Do not acknowledge a client request merely
   because a beacon was accepted by the browser.
5. **Define offline behavior as a product contract.** Decide whether Cimi needs
   an in-memory best-effort queue, IndexedDB/service-worker durability, or no
   offline collection. Databuddy's current tracker only establishes the first.
6. **Treat pseudonymous IDs as personal-data risk.** Local storage, profile IDs,
   URL propagation, aliases, and optional raw-ID modes require an explicit
   consent, unlink, retention, and deletion policy. "Cookieless" is not the
   same as identifier-free.

## Primary local sources

- `packages/tracker/src/core/tracker.ts`
- `packages/tracker/src/index.ts`
- `packages/tracker/src/core/client.ts`
- `packages/tracker/src/core/types.ts`
- `packages/tracker/src/core/utils.ts`
- `packages/tracker/tests/persistence.spec.ts`
- `packages/tracker/tests/network.spec.ts`
- `packages/tracker/tests/privacy.spec.ts`
- `apps/basket/src/routes/basket.ts`
- `apps/basket/src/routes/track.ts`
- `apps/basket/src/routes/track-event-schema.ts`
- `apps/basket/src/routes/identify.ts`
- `apps/basket/src/lib/event-service.ts`
- `apps/basket/src/lib/security.ts`
- `apps/basket/src/lib/request-validation.ts`
- `apps/basket/src/utils/ip-geo.ts`
- `packages/validation/src/constants.ts`
- `packages/validation/src/schemas/analytics.ts`
- `packages/validation/src/schemas/custom-events.ts`
- `packages/validation/src/schemas/errors.ts`
- `packages/validation/src/schemas/web-vitals.ts`
- `packages/db/src/clickhouse/schema/analytics/core/events.sql`
- `packages/db/src/clickhouse/schema/analytics/core/custom_events.sql`
- `packages/db/src/clickhouse/schema/analytics/pageviews/daily_pageviews_mv.sql`
- `packages/db/src/clickhouse/identity.ts`
- `packages/ai/src/query/builders/sessions.ts`
- `packages/ai/src/query/expressions.ts`
- `packages/services/src/identity.ts`
- `packages/db/src/drizzle/schema/identity.ts`
- `apps/docs/content/docs/security.mdx`
