# Simple Analytics: Event Ingestion and Session Semantics

## Scope and evidence

This report uses only the vendored checkout at
`docs/research/vendor/simple-analytics`. It inspects the source templates,
compiled artifacts, tests, playgrounds, and package metadata. No hosted API or
external documentation is used.

The checkout is primarily a visitor-facing script project: its package is named
`scripts`, is described as "visitor facing scripts," and has no runtime server
dependency in the package metadata (`package.json:1-5,36-53`). The README says
contributors work on `src/default.js` and `src/auto-events.js`, which compile to
CDN, custom-domain, and Cloudflare scripts (`README.md:17-23`). The current
compiler identifies the generated version as `11` (`compile.js:11`) and the
latest compiled script is stamped `v11` (`dist/latest/latest.js:1-4`).

The labels below distinguish:

- **Fact:** directly emitted, tested, or implemented by the local checkout.
- **Inference:** a conclusion about behavior from the client implementation,
  not a claim about the hosted Simple Analytics ingestion service.
- **Unavailable:** not represented by the local checkout, so it cannot answer
  the question.

## Executive assessment

**Fact:** The browser script emits one request per pageview or custom event via
an image request to `/simple.gif`. It can emit page-lifecycle append data via
the same image endpoint or a JSON `sendBeacon` POST to `/append`
(`src/default.js:312-345,605-634`).

**Fact:** The default build creates random UUIDv4-like identifiers for an event,
page, and session. The session identifier is generated in memory when the
script runs; it is not read from a cookie or browser storage
(`src/default.js:174-193,509-519`; `README.md:11`).

**Inference:** In the browser, a "session" is best understood as the lifetime
of one tracker invocation, with one `session_id` reused across that invocation.
This checkout does not establish inactivity timeout, expiry, cross-tab
stitching, cross-device stitching, or server-side session rules.

**Unavailable:** The local repository does not contain the ingestion service,
database schema, server validation, limits, deduplication policy, retry policy,
server timestamp behavior, retention behavior, or server-side identity/session
formation. The test server only records incoming requests in an array
(`test/helpers/server.js:19-60,74-77`).

## Event envelope and transports

### Common fields

**Fact:** The common base payload starts with `version` and `hostname`
(`src/default.js:348-356`). The default payload then adds, when enabled,
`ua`, `https`, `timezone`, `page_id`, and `session_id`; it also adds `sri` and
may add User-Agent Client Hints (`mobile`, `brands`)
(`src/default.js:484-532`). A hostname override preserves the browser's
original hostname as `hostname_original` (`src/default.js:547-550`).

**Fact:** Normal requests merge the common payload, current page fields, and
event/pageview fields. Undefined values are omitted; `null` values are not
filtered out (`src/default.js:312-345`).

**Fact:** The locally visible `type` values are:

| Type | Meaning and evidence |
| --- | --- |
| `pageview` | Pageview envelope emitted by `sendPageView` (`src/default.js:735-756`). |
| `event` | Custom event envelope emitted by `sendEvent` (`src/default.js:1002-1027`). |
| `append` | Time-on-page/scroll append associated with `original_id` (`src/default.js:605-634`). |
| `error` | Optional client-script error report containing error text and path (`src/default.js:358-390`). |

**Fact:** Image requests are GET requests to `/simple.gif`; all defined fields
are URL-encoded and a `time=Date.now()` query parameter is appended
(`src/default.js:311-345`). Append requests use `/append` only when
`navigator.sendBeacon` is available and the navigation is not a push-state
transition; the body is the JSON serialization of the append object
(`src/default.js:629-634`).

**Fact:** The test fixture parses POST bodies as JSON and treats GIF query
parameters as the request body. It does not validate, transform, persist, or
deduplicate them (`test/helpers/request.js:13-20`; `test/helpers/server.js:43-60`).

### Pageviews

**Fact:** A pageview contains `id`, `type: "pageview"`, `referrer`, `query`,
and optional serialized `metadata`, merged with the current page and common
payload (`src/default.js:735-756`; `src/default.js:312-314`). Tests assert
pageview fields including `hostname`, `https`, `id`, `path`, viewport/screen
dimensions, `type`, `unique`, and `version`
(`test/test-pushstate.js:36-70`; `test/test-no-pushstate.js:27-60`). These are
client test expectations, not a server schema.

**Fact:** Automatic collection sends an initial pageview. If automatic
collection is disabled, the script exposes `window.sa_pageview(path, metadata)`
for manual pageviews (`src/default.js:883-964`).

**Fact:** SPA pageviews are triggered by wrapped `history.pushState`, `popstate`,
and, in hash mode, `hashchange` (`src/default.js:883-947`). The last path is
held in the in-memory `lastSendPath`; an identical path is not sent again in
the same script run (`src/default.js:766-773`).

**Fact:** The default path is the decoded pathname. Query strings and hashes
are dropped by default; hash mode can append the hash, and a configured path
overwriter can replace the result (`src/default.js:695-730`; comments at
`src/default.js:766-768`).

**Fact:** `unique` is calculated in the browser, not by a visible identity
store. It is false for push-state and reload/back-forward navigations; for
other navigations it is the inverse of whether the referrer is same-site
(`src/default.js:803-841`). The tests expect the first visit to be unique and
the second push-state or non-push-state visit not unique
(`test/test-pushstate.js:12-34`; `test/test-no-pushstate.js:12-25`).

**Inference:** The field named `unique` must not be treated as a durable unique
visitor or event-deduplication key. The local code derives it from navigation
state and referrer comparison.

### Custom events

**Fact:** `sa_event` accepts a string or number, or a function returning a
string or number. Other values, thrown functions, and functions returning
other types are rejected client-side and invoke the callback without sending
an event (`src/default.js:971-1000`).

**Fact:** Event names are converted to strings, every run of non-alphanumeric
characters becomes `_`, and leading/trailing underscores are removed. An empty
result is not sent (`src/default.js:1002-1027`). The test confirms
`"-- event 123 &&"` becomes `event_123` and a function result becomes
`functionoutput` (`test/test-events.js:5-18`; `test/index.js:386-409`).

**Fact:** A custom event includes `type: "event"`, the normalized `event`
name, a new UUID `id`, attribution fields, and optional serialized metadata;
the common payload supplies `page_id`, `session_id`, hostname, and version
when those metrics are enabled (`src/default.js:1002-1027,509-519`). Tests
assert these event fields and UUIDv4 format
(`test/test-events.js:29-61`).

**Fact:** Events can be queued before the script loads using the function's
`.q` property. The queue is read and sent when the script initializes
(`src/default.js:1034-1052`; `playground/events.html:9-39`). The queue is an
in-memory JavaScript array, not a durable offline queue.

**Fact:** Metadata is caller-controlled. A global metadata object and a
metadata collector can be merged into pageview and event metadata
(`src/default.js:207-221,843-847,1007-1009`). The final value is serialized
with `JSON.stringify`; the tests exercise dates, booleans, numbers, and strings
(`test/test-events.js:20-27`; `test/helpers/server.js:108-113`).

**Fact:** The automated-events helper maps outbound links, email links, and
configured downloads into normal custom event calls. It derives event names
from titles or URLs and may add `url` or `email` metadata
(`src/auto-events.js:36-68,76-149,153-197`).

### Validation and limits

**Fact:** The visible client validation covers event input type, function
execution, event-name normalization, and omission of empty normalized names
(`src/default.js:971-1027`). Path decoding errors are caught, and an empty
path prevents a pageview from being sent (`src/default.js:695-730,766-772`).

**Fact:** The checkout contains no explicit client-side maximum event-name
length, metadata byte limit, request batch size, request rate limit, or server
payload allowlist. The event queue sends each queued entry individually
(`src/default.js:1038-1052`).

**Unavailable:** There is no local ingestion implementation from which to
derive server-side validation, HTTP error semantics, payload-size limits,
rate limits, event quotas, or accepted fields beyond what the client emits and
the browser tests inspect.

## Time and delivery semantics

### Client and server timestamps

**Fact:** `Date.now()` is used for the URL's transport `time` parameter at the
moment the image request is created (`src/default.js:329-345`). This is a
browser clock value, not a server-generated timestamp.

**Fact:** The page-lifecycle append's `duration` is calculated in the browser
from the in-memory start time, subtracting time hidden from the document, and
is rounded to seconds (`src/default.js:398-404,602-619`). Scroll percentage is
also calculated client-side (`src/default.js:623-627`).

**Fact:** The event and pageview envelopes have no dedicated client event-time
or pageview-time field in the source. A caller can put a time-like value into
metadata; the test's `date` field is such metadata, not an envelope timestamp
(`src/default.js:747-755,1011-1023`; `test/test-events.js:20-27`).

**Fact:** JSON `/append` beacon bodies do not receive the image URL's `time`
parameter (`src/default.js:629-634`).

**Unavailable:** The local checkout does not show whether the hosted service
uses `time`, request arrival time, a database timestamp, or any other value as
the canonical ingestion/event time. It also does not show clock-skew handling.

### Retries and deduplication

**Fact:** Normal sends create one `Image` and assign its `src` once
(`src/default.js:322-345`). Event callbacks are attached to image load/error,
but an error callback only reports completion to the caller; the code does not
schedule a retry (`src/default.js:973-1027`).

**Fact:** `sendBeacon` is called once and its return value is ignored
(`src/default.js:629-634`). There is no application-level retry queue,
backoff, idempotency token, or replay marker in the local source.

**Fact:** The client has two narrow in-memory duplicate suppressors: loading
the same namespace twice returns early (`src/default.js:297-305`), and sending
the same page path twice in one run returns early
(`src/default.js:766-773`). Custom events are not compared against prior event
IDs before sending; each call creates a new UUID (`src/default.js:1011-1027`).

**Inference:** A network replay or caller retry could produce another request;
the UUID may identify the request, but the local code does not establish that
the server treats it as an idempotency key.

**Unavailable:** Server-side duplicate handling, idempotency, at-least-once or
at-most-once delivery, and whether the service retries failed ingestion cannot
be determined from this checkout.

## Attribution

**Fact:** The script collects a cleaned document referrer. It replaces an
overridden hostname and removes the URL scheme plus query/hash-sensitive tail
according to the local regex (`src/default.js:586-596`). Pageviews send the
referrer unless source information is intentionally deleted; same-site
navigation can retain it (`src/default.js:735-756`).

**Fact:** Query attribution is limited to UTM-style keys (`source`, `medium`,
`content`, `term`, `campaign`, and optionally `ref`) unless strict UTM mode is
enabled. Strict mode requires the `utm_` prefix. Configured `allowParams` can
preserve explicitly named parameters (`src/default.js:228-269,445-449`).

**Fact:** Source/query attribution is preserved or deleted according to the
`deleteSourceInfo` flag. Push-state and reload/back-forward navigations set
that flag, and an allowed parameter can still be retained. The test fixture
uses `project` as an allowed parameter and expects UTM/referrer data on the
first page but only `project` on the second push-state page
(`src/default.js:750-755,815-857`; `test/helpers/index.js:56-68`;
`test/test-pushstate.js:25-34`).

**Fact:** Events use the initial page attribution while `pages < 2`, and may
use the previous page as referrer for same-site events; otherwise the event
referrer is `null` (`src/default.js:1004-1019`).

**Fact:** The client also emits browser/device context such as HTTPS state,
timezone, user agent, viewport/screen dimensions, language, and User-Agent
Client Hints when those metrics are enabled
(`src/default.js:509-532,776-800,860-879`).

## Identity and session formation

**Fact:** `uuid()` uses `crypto.getRandomValues` when available and falls back
to `Math.random`; the tests validate emitted event, page, and session IDs as
UUIDv4 (`src/default.js:174-193`; `test/test-events.js:48-61`).

**Fact:** `session_id` is generated once when the payload is initialized and is
then merged into normal pageview/event requests
(`src/default.js:509-519,735-756,1011-1023`). It is omitted when the session
metric is disabled through the metric configuration
(`src/default.js:152-169,517-519`).

**Fact:** A page ID is created when time-on-page or scroll collection is
enabled. It is replaced for a new SPA page after the previous page is
appended; the same in-memory session payload remains in use
(`src/default.js:503-519,605-635,735-744`).

**Fact:** The README states that Simple Analytics does not use cookies and
does not collect personal data (`README.md:11`). The local source has no
cookie, `localStorage`, or `sessionStorage` implementation, and has no
dedicated login/user identifier API. Metadata remains an explicit caller
escape hatch (`src/default.js:207-221,1007-1023`).

**Inference:** Separate full page loads, tabs, browser restarts, or separate
tracker instances generate separate random sessions. Same-page SPA
navigation keeps the generated session ID. These are client-lifetime
conclusions; the hosted service could apply additional grouping not visible
here.

**Unavailable:** Session timeout, inactivity thresholds, cross-page stitching
after a reload, cross-tab/device identity, authenticated identity, and server
rules for accepting or merging `session_id` are not present locally.

## Restart and offline behavior

**Fact:** The only pre-load event queue is the JavaScript function queue; queued
entries are drained during script initialization and are not persisted
(`src/default.js:1038-1052`; `playground/events.html:9-39`).

**Fact:** Page lifecycle delivery is attempted on `pagehide` and visibility
changes. It is one image request or one `sendBeacon` call, with no local retry
or reconnect handler (`src/default.js:637-651,605-634`).

**Inference:** Reloading or restarting the browser loses the in-memory session,
page state, queued events, and unsent requests. Offline events are not
recoverable through any queue implemented in this checkout.

**Unavailable:** The local code cannot establish what a hosted edge or
ingestion service might do after a transport failure, delayed request, or
replayed request.

## Bot, exclusion, and privacy filtering

**Fact:** In the full build, bot detection checks the user-agent for
`bot`, `spider`, or `crawl` (except `cubot`) and checks browser automation
markers such as `webdriver`, Nightmare, Phantom, Polypane, and `_bot`
(`src/default.js:64-65,488-501`). The result sets `bot: true` in the payload;
the client does not stop the request at that point (`src/default.js:503-519`).

**Fact:** The full build stops before collection when `navigator.doNotTrack` is
`"1"` (`src/default.js:552-562`). The source also exposes a `collectDnt`
setting (`src/default.js:413-419`), but both template branches shown in this
checkout return on DNT, so this source does not demonstrate an opt-in path.

**Fact:** `ignorePages` supports exact paths and `*` wildcards. Matching paths
are skipped by the pageview path function (`src/default.js:272-293,717-723`).
There is no matching path check in `sendEvent`, so this is not shown as a
general custom-event exclusion mechanism (`src/default.js:973-1027`).

**Fact:** `ignoreMetrics` is prefix-matched and can suppress referrers, UTM
parameters, timezone, session, time-on-page, scroll, user agent, screen,
viewport, language, and related fields (`src/default.js:152-169,234-269,503-519,
776-800`).

**Fact:** The client intentionally reduces URL exposure by using pathname-only
page paths by default and cleaning referrer URLs (`src/default.js:695-730,
586-596,766-768`). The playground demonstrates a configuration that ignores
many metrics, including referrer, UTM, country/timezone, session, duration,
scroll, user agent, screen, viewport, and language
(`playground/events.html:261-284`).

**Fact:** Metadata is not visibly scrubbed for PII or bounded by the client.
The caller and metadata collector can add arbitrary object fields before
serialization (`src/default.js:207-221,843-847,1007-1023`). Therefore the
README's privacy statement is a product claim, while the local code provides
configuration and URL filtering but does not prove universal metadata
redaction (`README.md:11`).

**Unavailable:** Whether the hosted service drops, flags, or retains requests
with `bot: true`, how server-side bot detection works, server-side exclusion
rules, retention/deletion controls, and privacy enforcement beyond the client
are not represented in the vendored repository.

## What this checkout does not answer

| Question needed for a complete ingestion comparison | Local conclusion |
| --- | --- |
| Server request schema and validation | **Unavailable.** Only client emission and test assertions are present. |
| Maximum event/metadata/request size | **Unavailable.** No local limit is declared. |
| Server timestamp and clock skew | **Unavailable.** The client emits a browser `time` query value for image requests, but server handling is absent. |
| Retries, replay, and idempotency | **Unavailable.** Client retries are absent; server behavior is absent. |
| Deduplication | **Unavailable.** Client only suppresses same-script duplicate paths and duplicate script initialization. |
| Session expiry and stitching | **Unavailable.** The client generates a per-invocation UUID; no server session algorithm is included. |
| Durable offline ingestion | **Unsupported by visible client code.** No persistent queue or reconnect path is present. |
| Authenticated/user identity | **Unavailable/unsupported by visible client API.** No dedicated identity API or field is present. |
| Server bot and privacy filtering | **Unavailable.** Client flags bots and honors DNT, but the ingestion service is absent. |

## Implication for Cimi issue #7

**Fact:** Simple Analytics' local client is a small, privacy-oriented emitter
for pageviews, normalized custom events, attribution, and lightweight page
lifecycle metrics. It has browser-generated IDs and no cookie-based identity
in the visible code.

**Inference:** It can serve as a low-identity browser collection alternative if
Cimi only needs best-effort online pageviews/events and client-derived
attribution. It should not be credited, from this evidence alone, with durable
offline capture, reliable retries, server-side idempotency, server timestamps,
or a documented session-expiry model.

**Decision boundary:** Those missing semantics require evidence from the
ingestion service or separate first-party documentation, neither of which is
inside the allowed local submodule. They should remain unknown rather than be
assumed for issue #7.
