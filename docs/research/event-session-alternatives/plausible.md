# Plausible Event Ingestion and Session Semantics

## Scope and Snapshot

This report is for Cimi issue #7 and uses only the local Plausible submodule at
`docs/research/vendor/plausible`. No GitHub API, web search, or web fetch was
used.

- Local source snapshot: submodule `HEAD` `9cc669b97ece3ecd37fcb3950791cb3873d7944d`.
- The source contains Community Edition and Enterprise-gated branches. Claims
  below label Enterprise-only behavior where the source uses `on_ee`.
- A **fact** is directly represented by local source, tests, schemas, or local
  documentation. An **inference** is a consequence of those facts and is
  labeled as such.
- Paths below are repository-relative and line ranges refer to this local
  snapshot. The compact validation table uses paths relative to the Plausible
  submodule root.

## Executive Findings

- **Fact:** The browser sends a small event envelope containing an event name,
  URL, configured domain, referrer, optional properties, interactivity, and
  optional revenue. The server adds request metadata, validates and normalizes
  the request, derives a server-side user key, assigns a session, and writes
  the event and session through asynchronous ClickHouse buffers.
  Sources: `docs/research/vendor/plausible/tracker/src/track.js:86-163`,
  `docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:42-70`,
  `docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:137-157`.
- **Fact:** Normal event timestamps are server-assigned at request building
  time. The ordinary client envelope has no documented event timestamp field.
  Enterprise replay requests are a separate exception and may supply a past
  timestamp through headers.
  Sources: `docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:79-86,138-167`,
  `docs/research/vendor/plausible/tracker/npm_package/plausible.d.ts:112-127`.
- **Fact:** A normal session lookup is keyed by `site_id` and the server-derived
  `user_id`; a cached session is reused when the incoming timestamp is no more
  than 30 minutes after the cached session timestamp. A new session receives a
  random UInt64 session ID.
  Sources: `docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:72-97,151-186`,
  `docs/research/vendor/plausible/lib/plausible/clickhouse_session_v2.ex:35-50,86-89`.
- **Fact:** There is no client event ID or idempotency key in the inspected
  envelope, Ecto event schema, or ClickHouse event schema. The event table is a
  regular `MergeTree`, not an event-id keyed table.
  Sources: `docs/research/vendor/plausible/tracker/npm_package/plausible.d.ts:112-127`,
  `docs/research/vendor/plausible/lib/plausible/clickhouse_event_v2.ex:10-58`,
  `docs/research/vendor/plausible/priv/ingest_repo/structure.sql:265-314`.
- **Inference:** Replaying the same client request can create another event and
  increment session counters. Plausible's reliability mechanisms improve
  delivery but do not establish exactly-once event semantics.
- **Fact:** The browser has no offline queue or automatic retry. Modern tracker
  requests use `fetch(..., keepalive: true)`; the compatibility path uses one
  XMLHttpRequest. The server-side remote persistor has a bounded retry for two
  HTTP/2 transport errors, but that is internal persistence, not browser
  offline support.
  Sources: `docs/research/vendor/plausible/tracker/src/networking.js:1-42`,
  `docs/research/vendor/plausible/lib/plausible/ingestion/persistor/remote.ex:61-95`.

## Event Envelope and Storage

### Browser request

**Fact:** The TypeScript contract documents these client payload fields:

| Field | Meaning in the local tracker contract |
| --- | --- |
| `n` | Event name |
| `u` | Event URL |
| `d` | Configured site domain |
| `r` | Referrer, nullable |
| `p` | String custom properties |
| `$` | Revenue amount and currency |
| `i` | Interactive flag |

The type also permits additional fields through `Record<string, unknown>`, but
the normal tracker does not define a client timestamp, client user ID, session
ID, event ID, or retry token. Source:
`docs/research/vendor/plausible/tracker/npm_package/plausible.d.ts:67-127`.

**Fact:** The tracker constructs the minified envelope with:

- `n`: supplied event name;
- `v`: compiled tracker script version;
- `u`: current URL or an explicitly overridden URL;
- `d`: configured domain;
- `r`: `document.referrer` or `null`;
- `p`: supplied, configured, or pageview properties;
- `i: false` only when a caller marks an event non-interactive;
- `$` for Enterprise revenue variants;
- `h: 1` for hash-based routing variants.

Source: `docs/research/vendor/plausible/tracker/src/track.js:86-145`.

**Fact:** The tracker sends the request as JSON text with `Content-Type: text/plain`.
The endpoint defaults to `/api/event` for the hosted script and
to `https://plausible.io/api/event` in the NPM configuration. Sources:
`docs/research/vendor/plausible/tracker/src/networking.js:23-31`,
`docs/research/vendor/plausible/tracker/src/config.js:10-18,38-62`.

### Server-normalized request

**Fact:** `Plausible.Ingestion.Request` is an embedded schema containing request
and derived fields, including raw `remote_ip` and `user_agent` during
processing, normalized URI and hostname, referrer, domains, pathname,
properties, engagement fields, tracker version, interactivity, query params,
and a server timestamp. Revenue and replay fields are Enterprise-gated.
Source: `docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:42-70`.

**Fact:** `POST /api/event` calls request construction, runs event processing,
and responds `202 "ok"` when events are buffered or filtered. Invalid request
changesets return `400`; an invalid event among otherwise processed domains
also returns `400` with `x-plausible-dropped`. Sources:
`docs/research/vendor/plausible/lib/plausible_web/controllers/api/external_controller.ex:13-45`,
`docs/research/vendor/plausible/lib/plausible_web/router.ex:405-414`.

**Fact:** One request may name multiple comma-separated domains. The event
pipeline processes each domain separately, while the request timestamp is
assigned once before the per-domain processing. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:238-263`,
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:55-87`,
`docs/research/vendor/plausible/test/plausible_web/controllers/api/external_controller_test.exs:71-94`.

### Persisted event and session rows

**Fact:** The ClickHouse event schema stores `name`, `site_id`, `user_id`,
`session_id`, event `timestamp`, hostname, pathname, paired metadata arrays,
engagement values, selected attribution values, location, device/browser
dimensions, and Enterprise revenue/replay fields. It does not store raw IP or
raw User-Agent columns. Sources:
`docs/research/vendor/plausible/lib/plausible/clickhouse_event_v2.ex:10-58`,
`docs/research/vendor/plausible/priv/ingest_repo/structure.sql:265-314`.

**Fact:** A session row stores the session ID, user ID, site, start and latest
timestamps, duration, bounce state, entry/exit pages, pageview/event counters,
entry properties, attribution, location, device/browser data, and a collapse
`sign`. Sources:
`docs/research/vendor/plausible/lib/plausible/clickhouse_session_v2.ex:35-83`,
`docs/research/vendor/plausible/priv/ingest_repo/structure.sql:1-56`.

**Fact:** After session registration, the event receives the session's
`session_id`, `user_id`, attribution, location, and device/browser fields via
`merge_session/2`. Source:
`docs/research/vendor/plausible/lib/plausible/clickhouse_event_v2.ex:86-110`.

## Pageviews, Custom Events, and Engagement

### Pageviews

**Fact:** Pageviews are ordinary events whose name is exactly `"pageview"`.
The tracker automatically sends one unless `autoCapturePageviews` is disabled;
manual pageviews use the same `track` path. Sources:
`docs/research/vendor/plausible/tracker/src/plausible.js:21-35`,
`docs/research/vendor/plausible/tracker/npm_package/plausible.d.ts:16-18`,
`docs/research/vendor/plausible/tracker/test/pageview.spec.ts:20-61,64-113`.

**Fact:** The server derives the pathname from the URL, defaults an empty path
to `/`, removes trailing whitespace, and includes the URL fragment only when
hash mode is `1`. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:219-224,407-419`,
`docs/research/vendor/plausible/test/plausible_web/controllers/api/external_controller_test.exs:155-183,1173-1203`.

**Fact:** Pageviews increment `pageviews`, set the initial entry page, update
the exit page and exit hostname, and can turn a bounce into a non-bounce when
there are at least two pageviews. Custom events do not change pageview counts
or entry/exit page fields. Sources:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:121-149`,
`docs/research/vendor/plausible/test/plausible/session/cache_store_test.exs:535-596`.

### Custom events

**Fact:** Any accepted event name other than the special system events follows
the same ingestion path as a custom event. Event names accept strings and
integers, with integers converted to strings; the request validates a maximum
length of 120 characters. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:1-16,108-115`,
`docs/research/vendor/plausible/test/plausible/ingestion/request_test.exs:104-114,438-472`.

**Fact:** The local NPM tracker exposes custom event properties, an interactive
flag, revenue, a callback, and a URL override. Its local README shows `signup`
with a `tier` property and a non-interactive `autoplay` event. Sources:
`docs/research/vendor/plausible/tracker/npm_package/plausible.d.ts:67-100`,
`docs/research/vendor/plausible/tracker/npm_package/README.md:78-102`.

**Fact:** The source distinguishes system events such as `pageview`,
`engagement`, outbound-link clicks, file downloads, form submissions, and
`404`. Some system events require special properties; path-based system events
automatically receive a `path` property from the pathname unless the caller
provided one. Sources:
`docs/research/vendor/plausible/lib/plausible/event/system_events.ex:1-53,79-100`,
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:226-235`.

**Fact:** A custom event can create a session even when no pageview exists. In
that case the session starts with empty entry and exit page fields and zero
pageviews. Sources:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:60-69,151-165`,
`docs/research/vendor/plausible/test/plausible/session/cache_store_test.exs:410-426,535-553`.

### Engagement events

**Fact:** The tracker generates `engagement` events when leaving or hiding a
  page, or during SPA page transitions. It sends scroll depth as `sd` and
  engaged milliseconds as `e`, and preserves the current pageview's URL and
  properties. Sources:
  `docs/research/vendor/plausible/tracker/src/engagement.js:23-86`,
  `docs/research/vendor/plausible/tracker/test/engagement.spec.js:13-84`.

**Fact:** The server accepts an engagement event only when at least one of
`sd` or `e` parses as valid. Invalid/missing values use sentinel defaults
(`sd=255`, `e=0`) when the other metric is valid. Engagement does not increment
session counters or update the persisted session, but it refreshes the active
session in the cache. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:346-367,439-461`,
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:49-57,115-119`,
`docs/research/vendor/plausible/test/plausible/session/cache_store_test.exs:366-408`.

**Inference:** Although the tracker normally sends engagement after a
pageview, the server implementation only requires an active cached session,
not a pageview specifically. A preceding custom event can therefore provide
the cache entry.

## Validation and Limits

| Input | Local behavior | Evidence |
| --- | --- | --- |
| Body | If the body is not already parsed, read at most the assigned `read_body_limit` or `1,000,000` bytes, then JSON-decode it. | `lib/plausible/ingestion/request.ex:180-195`; `test/plausible/ingestion/request_test.exs:539-562` |
| URL | Required, at most 2,000 bytes, parsed as a URI, and `data:` is rejected. | `lib/plausible/ingestion/request.ex:265-275`; `test/plausible/ingestion/request_test.exs:414-436` |
| Referrer | Binary referrers are truncated to 2,000 bytes rather than rejected for length. | `lib/plausible/ingestion/request.ex:208-217`; `test/plausible/ingestion/request_test.exs:474-485` |
| Event name | Required, string or integer-castable, maximum 120 characters. | `lib/plausible/ingestion/request.ex:1-16,108-115`; `test/plausible/ingestion/request_test.exs:438-472` |
| Properties per request | Filtered properties are truncated to 30 entries. | `lib/plausible/ingestion/request.ex:288-301`; `test/plausible/ingestion/request_test.exs:517-531` |
| Property key/value | Keys are limited to 300 bytes and values to 2,000 bytes. Exceeding either limit invalidates the request. | `lib/plausible/ingestion/request.ex:324-343`; `test/plausible/ingestion/request_test.exs:487-515` |
| Property values | Nested maps/lists, blank keys/values, and nil-like values are discarded; scalar values are stringified. | `lib/plausible/ingestion/request.ex:288-321`; `test/plausible_web/controllers/api/external_controller_test.exs:631-768` |
| Scroll depth | Integer strings are accepted; negative/invalid values become `255`; values above 100 become `100`. | `lib/plausible/ingestion/request.ex:439-448`; `test/plausible/ingestion/request_test.exs:684-702` |
| Engagement time | Non-negative integer values below the 30-day compatibility ceiling are accepted; invalid or too-large values become `0`. | `lib/plausible/ingestion/request.ex:33-40,450-461`; `test/plausible/ingestion/request_test.exs:704-718` |

**Fact:** There is no local ingestion validation that recognizes email,
account ID, name, or other property content as PII. The property filter is
structural and length-based. The tracker offers an optional `transformRequest`
hook that can redact or suppress a payload before it is sent. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:316-343`,
`docs/research/vendor/plausible/tracker/npm_package/plausible.d.ts:50-58`,
`docs/research/vendor/plausible/tracker/test/transform-request.spec.ts:61-143`.

**Inference:** Cimi should not treat the property limits as a privacy or PII
policy. They bound size and shape, but arbitrary path and property content can
still carry identifiers.

## Timestamp Semantics

**Fact:** `Request.build/2` defaults `now` to `NaiveDateTime.utc_now()` and
stores it truncated to whole seconds before parsing the body. There is no
normal payload field used to override this timestamp. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:69-115,197-205`,
`docs/research/vendor/plausible/test/plausible/ingestion/request_test.exs:46-63`.

**Fact:** When one request targets multiple domains, all per-domain events have
the same request timestamp. Source:
`docs/research/vendor/plausible/test/plausible_web/controllers/api/external_controller_test.exs:71-94`.

**Fact:** The Enterprise replay branch reads `x-replay-session-id` and
`x-replay-time`; it accepts the replay time only when it is not in the future,
then replaces the normal server timestamp. Ordinary tracker requests do not
send these headers. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:138-174`,
`docs/research/vendor/plausible/test/plausible/ingestion/request_test.exs:176-230`.

**Fact:** The browser's `e` field is a client-measured duration, not an event
timestamp. It is calculated from `Date.now()` while the page is visible and
sent on engagement transitions. Sources:
`docs/research/vendor/plausible/tracker/src/engagement.js:18-21,34-41,48-85`.

**Inference:** Network delay affects the server timestamp of an engagement
event, while its duration is based on the client clock. There is no ordinary
client event-time/backfill contract in the inspected API.

**Fact:** Session `start` is the timestamp of the first event that creates the
session, `timestamp` is advanced on non-engagement events, and duration is the
absolute difference between the current event timestamp and session start.
Source: `docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:121-149,151-186`.

## Deduplication, Retries, and Durability

### Deduplication

**Fact:** The inspected request and persisted event structures contain no
event ID, client sequence number, idempotency key, or deduplication window.
The event primary/order key ends in the event timestamp and has no event UUID;
`events_v2` uses `MergeTree`. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:42-70`,
`docs/research/vendor/plausible/lib/plausible/clickhouse_event_v2.ex:10-18`,
`docs/research/vendor/plausible/priv/ingest_repo/structure.sql:265-314`.

**Fact:** Session updates use ClickHouse's versioned collapsing pattern by
writing the old session with `sign=-1` and the updated session with `sign=1`.
That is state-update collapse, not event deduplication. Sources:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:60-69`,
`docs/research/vendor/plausible/priv/ingest_repo/structure.sql:1-56`.

**Fact:** The ingestion telemetry test calls `Event.build_and_buffer/1` three
times with the same built request and observes two buffered events followed by
one rate-limited drop; it does not identify an identical event as a duplicate.
Source: `docs/research/vendor/plausible/test/plausible/ingestion/event_telemetry_test.exs:27-43`.

**Inference:** Application retries without an application-supplied idempotency
key can overcount events. Session counters can also be affected because every
accepted pageview is processed as a new pageview action.

### Browser retries and offline behavior

**Fact:** The modern browser path makes one `fetch` request with `keepalive`.
It calls the callback with the HTTP status for any HTTP response and with an
error only when the request promise rejects. The compatibility path makes one
XHR and likewise has no retry loop. Sources:
`docs/research/vendor/plausible/tracker/src/networking.js:1-42`,
`docs/research/vendor/plausible/tracker/npm_package/plausible.d.ts:86-94`,
`docs/research/vendor/plausible/tracker/test/callbacks.spec.ts:17-49`.

**Fact:** `keepalive` is used to improve delivery during navigation, not to
persist an offline event. The tracker tests explicitly describe navigation
delivery as relying on `fetch` keepalive. Sources:
`docs/research/vendor/plausible/tracker/test/tagged-events.spec.ts:378-414`,
`docs/research/vendor/plausible/tracker/test/file-downloads.spec.ts:324-359`.

**Fact:** The only pre-initialization queue is the in-memory `window.plausible.q`
queue drained when the script initializes. It is not an offline queue. Source:
`docs/research/vendor/plausible/tracker/src/plausible.js:30-39`.

### Server buffering and internal retry

**Fact:** The public controller returns `202` after the event has been
processed and handed to the write buffer. Event and session writes use
`GenServer.cast`; they flush when the buffer reaches its size threshold, on a
timer, or during normal process termination. Sources:
`docs/research/vendor/plausible/lib/plausible_web/controllers/api/external_controller.ex:13-21`,
`docs/research/vendor/plausible/lib/plausible/ingestion/write_buffer.ex:12-18,43-87`.

**Inference:** `202 "ok"` is an accepted/buffered response, not proof that the
ClickHouse row is already durable. A graceful write-buffer shutdown flushes
pending data; an abrupt process failure can lose in-memory buffer contents.

**Fact:** The remote persistor retries at most three times, and only when its
retry callback sees HTTP/2 `:disconnected` or `:unprocessed`. It maps timeout,
decode, and other persistence failures to errors; it has no event ID with
which to make a retry idempotent. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/persistor/remote.ex:9-49,61-95,119-148`.

## Attribution Fields and Formation

**Fact:** The source resolver prioritizes `utm_source`, then `source`, then
`ref`; when no tag is present it falls back to a valid external referrer. It
canonicalizes known sources, strips `www.`, removes the referrer query and
fragment from the stored referrer, ignores invalid schemes, and ignores
internal or localhost referrers. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/source.ex:59-77,80-110,119-151`,
`docs/research/vendor/plausible/test/plausible/ingestion/source_test.exs:7-38,136-147`.

**Fact:** Ingestion carries these selected attribution fields into session
attributes: referrer source, cleaned referrer, click-ID parameter name, and
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`.
Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:305-334`,
`docs/research/vendor/plausible/lib/plausible/clickhouse_event_v2.ex:29-37`,
`docs/research/vendor/plausible/lib/plausible/clickhouse_session_v2.ex:55-62`.

**Fact:** Click IDs are recognized from a fixed list (`gclid`, `gbraid`,
`wbraid`, `msclkid`, `fbclid`, `twclid`), but the stored `click_id_param` is
the parameter name, not its value. Google and Bing click IDs can infer a
medium when no explicit medium exists. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:325-335,448-455`,
`docs/research/vendor/plausible/lib/plausible/ingestion/acquisition.ex:61-108`.

**Fact:** Acquisition channel is derived from the normalized source, medium,
campaign, source tag, and click-ID parameter. The local implementation
supports Direct, Referral, Organic Search/Social/Video/Shopping, Email,
Affiliates, Audio, SMS, Mobile Push Notifications, Display, Paid Search/
Social/Video/Shopping/Other, Cross-network, and AI Assistants. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/acquisition.ex:71-92,95-117,134-181`,
`docs/research/vendor/plausible/test/plausible/ingestion/acquisition_test.exs:8-122`.

**Fact:** Session attributes are supplied when a new session is created. The
normal session update path changes timestamps, counters, bounce, and page
fields, but does not replace attribution with each later event. Sources:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:60-69,121-149,151-186`.

**Inference:** Attribution is first-event/session-entry attribution in this
pipeline. A later campaign-tagged event in the same active session does not,
by this code path, overwrite the session's original source fields.

## Identity and Session Formation

### Server-derived identity

**Fact:** Before session registration, the pipeline fetches the current and
previous salts, generates a user ID, validates the ClickHouse event, and then
registers the session. Source:
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:137-157,396-445`.

**Fact:** The user ID is a SipHash over the current salt and the concatenation
of User-Agent, remote IP, configured domain, the registrable root domain of
the event hostname, and, in Enterprise replay mode, the replay session ID.
The raw User-Agent and remote IP are used during processing but are not event
or session columns in the ClickHouse schema. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:566-601`,
`docs/research/vendor/plausible/lib/plausible/clickhouse_event_v2.ex:10-18`,
`docs/research/vendor/plausible/lib/plausible/clickhouse_session_v2.ex:35-43`.

**Fact:** Salts are kept as current and previous values. Rotation creates a new
salt while retaining the old one, and old database salts older than 48 hours
are deleted. Sources:
`docs/research/vendor/plausible/lib/plausible/session/salts.ex:28-46,50-91`,
`docs/research/vendor/plausible/test/plausible/session/salts_test.exs:13-47`.

**Fact:** Session registration tries the current user ID and then the previous
salt's user ID. A local integration test verifies that one salt rotation keeps
the same user and session IDs. Sources:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:29-32,72-97`,
`docs/research/vendor/plausible/test/plausible_web/controllers/api/external_controller_test.exs:1281-1295`.

**Inference:** This provides short-lived continuity across one salt rotation,
not a durable visitor identity. The configured domain is part of the hash, so
the same request signals sent for different configured domains do not share
the same derived user ID.

### Session key and boundary

**Fact:** In Community Edition the active cache key is `{site_id, user_id}`;
Enterprise replay sessions add `replay_session_id` to the key. A cached session
is reused when `NaiveDateTime.diff(event.timestamp, session.timestamp, :minute)
<= 30`; otherwise the caller gets a new session. Source:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:72-111`.

**Fact:** New sessions receive a random UInt64 ID. A first pageview initializes
hostname, entry page, exit page, and pageview count. A first custom event leaves
page fields empty. Source:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:151-193`.

**Fact:** Events are serialized per user-ID partition by the session balancer;
the lock timeout is one second. This prevents concurrent updates from both
reading the same old session and corrupting collapsed session state. Sources:
`docs/research/vendor/plausible/lib/plausible/session/balancer.ex:1-38`,
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:16-47`,
`docs/research/vendor/plausible/test/plausible/session/cache_store_test.exs:39-109`.

**Fact:** The comparison is not a strict symmetric time-window check: it uses
the signed difference and accepts any difference `<= 30` minutes, including a
negative difference. The update then computes duration with `abs`. The test
suite explicitly covers out-of-order timestamps. Sources:
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:88-97,121-149`,
`docs/research/vendor/plausible/test/plausible/session/cache_store_test.exs:598-611`.

**Inference:** Backdated ordinary events are not part of the public client
contract, but if an internal caller supplies them, the signed comparison can
have surprising session-reuse behavior.

## Restart and Offline Behavior

### Server restart and deployment continuity

**Fact:** The active `sessions` cache is implemented through ConCache and is
started as an application child with a 30-minute global TTL. Session lookup is
performed against this cache; the inspected lookup path does not query
`sessions_v2` as a fallback. Sources:
`docs/research/vendor/plausible/lib/plausible/cache/adapter.ex:1-8,57-95`,
`docs/research/vendor/plausible/lib/plausible/application.ex:59-64`,
`docs/research/vendor/plausible/lib/plausible/session/cache_store.ex:72-111`.

**Fact:** Plausible includes an optional `Plausible.Session.Transfer` process
that can copy the in-memory sessions cache between OS processes over Unix
domain sockets during deployment. It is skipped when no transfer directory is
configured, and its shutdown wait is 15 seconds. Sources:
`docs/research/vendor/plausible/lib/plausible/session/transfer.ex:1-9,23-43,45-79`,
`docs/research/vendor/plausible/lib/plausible/application.ex:65-66`.

**Fact:** A local transfer test populates 250 sessions in an old process,
starts a new process, and verifies the new cache matches the old cache. Source:
`docs/research/vendor/plausible/test/plausible/session/transfer_test.exs:6-19`.

**Inference:** Without configured session transfer, a process restart can lose
active cache continuity even though prior session rows exist in ClickHouse;
the next event can start a new session. Graceful write-buffer shutdown and
session-cache transfer are separate concerns.

### Browser offline and page lifecycle

**Fact:** No local tracker source uses IndexedDB, a durable event queue,
`sendBeacon`, or an automatic retry loop. The only local-storage read is the
`plausible_ignore` opt-out flag. Sources:
`docs/research/vendor/plausible/tracker/src/networking.js:1-42`,
`docs/research/vendor/plausible/tracker/src/track.js:41-47`,
`docs/research/vendor/plausible/tracker/npm_package/README.md:126-130`.

**Fact:** The tracker can invoke a caller callback with an HTTP status or a
network error, but it does not retain the failed payload for later replay.
Source: `docs/research/vendor/plausible/tracker/src/networking.js:23-40`.

**Inference:** Offline browser events are lost unless Cimi adds its own queue,
retry policy, and event identity. `keepalive` may improve a navigation race,
but it does not provide offline durability or exactly-once delivery.

## Bot, Exclusion, and Privacy Filtering

### Client-side filtering

**Fact:** The tracker skips events on localhost or `file:` by default, skips
common automation contexts (`_phantom`, Nightmare, WebDriver, Cypress) unless
explicitly exposed through `window.__plausible`, and honors
`localStorage.plausible_ignore === "true"`. Sources:
`docs/research/vendor/plausible/tracker/src/track.js:22-47`.

**Fact:** Include/exclude path rules are evaluated only for pageviews. A
pageview excluded by these rules marks the current engagement as ignored, so
the tracker does not send engagement for that ignored pageview. Sources:
`docs/research/vendor/plausible/tracker/src/track.js:49-83`,
`docs/research/vendor/plausible/tracker/src/engagement.js:44-86`.

**Fact:** `transformRequest` can suppress any event by returning a falsy value
and can rewrite its URL or properties before the request is sent. Sources:
`docs/research/vendor/plausible/tracker/src/track.js:148-163`,
`docs/research/vendor/plausible/tracker/test/transform-request.spec.ts:61-143`.

### Server-side filtering

**Fact:** The ingestion pipeline can drop verification-agent traffic
(Enterprise), datacenter IP classifications, threat IP classifications, site
hostname/page/IP/country rules, parsed bots, Headless Chrome, and spam
referrers. The drop reason is retained in the processing result and filtered
traffic generally returns `202` rather than an ingestion error. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:24-40,64-87,137-157,203-283,348-373`,
`docs/research/vendor/plausible/lib/plausible_web/controllers/api/external_controller.ex:16-37`.

**Fact:** UA parsing drops recognized bots and specifically drops the parsed
Headless Chrome client. Unknown or unparseable user agents are not dropped by
that step, although their dimensions may be empty. Sources:
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:263-283`,
`docs/research/vendor/plausible/test/plausible_web/controllers/api/external_controller_test.exs:185-239,556-572`.

**Fact:** The local repository README distinguishes managed-cloud advanced bot
filtering from Community Edition's basic User-Agent/referrer-spam filtering;
it also describes the broader privacy posture as cookie-free with no stored IP
addresses or persistent identifiers. Source:
`docs/research/vendor/plausible/README.md:16-21,33-44,98-105`.

**Fact:** The implementation still processes remote IP and User-Agent to derive
the user ID and geolocation, while the ClickHouse event/session schemas omit
raw IP and User-Agent columns. Source:
`docs/research/vendor/plausible/lib/plausible/ingestion/request.ex:176-178,398-405`,
`docs/research/vendor/plausible/lib/plausible/ingestion/event.ex:337-345,566-588`,
`docs/research/vendor/plausible/priv/ingest_repo/structure.sql:1-31,265-291`.

**Inference:** “No stored raw IP/User-Agent” does not mean “no request-derived
identity processing.” The server retains a pseudonymous `user_id` and may
retain URL pathname and caller-supplied property values, so Cimi would need a
separate content policy for paths, query-derived fields, and traits.

## Unavailable or Not Evidenced in This Snapshot

The following are not present in the inspected local event/tracker/session
contract. “Not evidenced” is deliberately narrower than claiming that no
unrelated Plausible dashboard feature exists elsewhere in the repository.

| Capability | Local finding |
| --- | --- |
| Ordinary client event time | No request field or tracker option; only server time. Enterprise replay headers are a separate path. |
| Event idempotency | No event ID, idempotency key, client sequence, or deduplication logic in the inspected ingestion and storage paths. |
| Offline collection | No durable browser queue, service-worker queue, or automatic retry. |
| First-class identified user | No `identify` operation, caller-supplied user ID, alias operation, or cross-device linkage field in the tracker envelope. |
| Client session token | No browser session ID or cookie is sent; the server creates the random session ID after deriving identity. |
| Session recovery from ClickHouse | Active lookup uses the in-memory cache; only the optional deployment-transfer mechanism copies cache state. |
| Per-event privacy classification | No consent, purpose, retention, or PII classification field is part of the event envelope. |
| Automatic PII scrubbing | Property filtering rejects shapes and sizes, not semantic identifiers; URL/property redaction is caller-controlled through `transformRequest`. |
| Exactly-once `202` guarantee | `202` means accepted into the ingestion/buffer path, not demonstrated ClickHouse durability or deduplicated persistence. |

## Cimi Design Pressure

These are **inferences for Cimi**, not Plausible requirements:

1. If Cimi needs reliable retries or offline support, define an event ID and
   idempotency scope before adding a client queue. A `keepalive` request alone
   cannot support replay-safe delivery.
2. Decide whether normal event timestamps are server receipt time, trusted
   client time, or both. Plausible's current ordinary path chooses receipt
   time and only backdates Enterprise replay traffic.
3. Treat `Visitor`, `Session`, and authenticated `User` as separate concepts
   if Cimi needs durable identity. Plausible's server `user_id` is an
   ephemeral, site/domain/request-signal-derived aggregation key, not a caller
   identity contract.
4. Specify behavior across process restart, cache loss, and salt rotation.
   Plausible has optional session transfer and a previous-salt bridge, but
   neither is a general durable visitor or event ledger.
5. Make attribution ownership explicit. In this pipeline, source and campaign
   fields are seeded when the session is created and are not generally
   overwritten by later events.
6. Separate structural limits from privacy controls. Cimi should decide which
   paths, properties, account identifiers, and deletion states are allowed,
   rather than relying on Plausible-like size limits to provide that policy.
