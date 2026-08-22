# Matomo: Event Ingestion and Session Semantics

## Scope and evidence

This report uses only the vendored checkout at
`docs/research/vendor/matomo`. It inspects the PHP tracker, JavaScript
tracker, schema definitions, configuration, tests, and the offline service
worker. No hosted API or external documentation is used.

The checkout is a complete Matomo source tree rather than only a browser
client. The conclusions below distinguish:

- **Fact:** directly implemented, configured, or asserted by the local source.
- **Inference:** a conclusion from the implementation, not an explicit product
  guarantee.
- **Unavailable:** not established by this checkout.

## Executive assessment

**Fact:** Matomo's browser tracker emits pageviews, custom events, ecommerce
actions, searches, downloads, outlinks, and other actions to `matomo.php` or
`piwik.php`. The request contains a common visitor/page envelope, then an
action-specific payload (`js/piwik.js:4081-4246,4270-4330,4350-4365,4733-4759`).

**Fact:** A request is reduced to one selected `Action` object. A custom action
marked with `ca=1` takes precedence over the normal pageview action; the
factory chooses the highest-priority action and rejects a request intended for a
disabled plugin (`core/Tracker/Action.php:85-116,120-130`).

**Fact:** The selected action is associated with a visit and inserted as a row
in `log_link_visit_action`. Action labels are normalized into IDs in
`log_action`; the event category and event action have separate typed IDs, and
the event value is stored in `custom_float`
(`core/Tracker/Action.php:379-425`; `plugins/Events/Columns/EventCategory.php:21-61`;
`plugins/Events/Columns/EventAction.php:21-61`; `plugins/Events/Columns/EventValue.php:21-32`).

**Fact:** The default browser identity is a first-party visitor cookie with a
13-month lifetime and a separate session cookie refreshed for 30 minutes
(`js/piwik.js:2387-2390,3652-3701,3730-3751,3851-3855`). The server can also
match a supplied visitor ID, user ID, or a device/configuration fingerprint.

**Fact:** The server's standard visit timeout is 1800 seconds. It looks for a
known visitor in a configurable time window, updates the visit on an existing
match, and creates a new visit when no match is found
(`config/global.ini.php:1018-1030`; `core/Tracker/VisitorRecognizer.php:86-138,220-240`;
`core/Tracker/Visit.php:195-235,263-288`).

**Fact:** Normal action insertion has an auto-increment primary key but no
request or event idempotency key. The visible write path is a plain `INSERT`
(`core/Tracker/Model.php:22-43`; `core/Db/Schema/Mysql.php:267-279`).

**Fact:** The checkout includes a durable browser offline queue, but it is
bounded to 50 requests by default, drops old entries after 24 hours, and has no
visible deduplication or exponential backoff
(`offline-service-worker.js:1-8,45-97,100-115,123-172`).

**Inference:** Matomo provides a comparatively rich, stateful analytics model
for Cimi: visitor, visit, action, attribution, custom dimensions, and privacy
controls are all represented. Reliable exactly-once event delivery is not
established by the visible tracker and database code.

## Event envelope and transports

### Common fields

**Fact:** The JavaScript tracker builds each request with `idsite`, `rec=1`, a
random cache-buster, browser local time (`h`, `m`, `s`), cleaned `url`, optional
`urlref`, optional `uid`, the visitor cookie value `_id`, `_idn`, optional
charset, and `send_image=0` (`js/piwik.js:4086-4132`).

**Fact:** The PHP request parser recognizes the common URL/referrer fields,
resolution, `idgoal`, `ping`, `bots`, `dp`, `rec`, `new_visit`, visitor
overrides, `action_name`, search fields, performance fields, and `pv_id`
(`core/Tracker/Request.php:388-454`).

**Fact:** The tracker can attach custom dimensions, JSON custom data, page and
event custom variables, ecommerce product-view fields, performance fields, and
the generated pageview ID to every request
(`js/piwik.js:4142-4225`).

**Fact:** The browser queue waits 2.5 seconds before sending accumulated
requests. One request is sent normally; multiple requests are sent through the
bulk endpoint, in chunks of at most 50
(`js/piwik.js:3282-3389,5204-5269`).

**Fact:** Bulk tracking processes each request separately and returns indexes of
invalid requests. By default the server wraps bulk tracking in a database
transaction, but invalid request exceptions are collected rather than making
the response uniformly successful or uniformly invalid
(`plugins/BulkTracking/Tracker/Handler.php:33-75`; `config/global.ini.php:1101-1106`).

### Pageviews and other actions

**Fact:** `trackPageView` sends `action_name` and then the common request
envelope. The pageview action reads `url` and `action_name`, cleans the action
title, and handles the request when it is not a custom action
(`js/piwik.js:4350-4365`; `core/Tracker/ActionPageview.php:18-43,55-85`).

**Fact:** The selected action may instead be a site search, download, outlink,
content interaction, ecommerce action, or plugin-defined action. The action
factory discovers all active action types and selects by priority
(`core/Tracker/Action.php:47-116`).

**Fact:** Each action can carry the current pageview ID, truncated to six
characters in the `idpageview` action dimension
(`plugins/Actions/Columns/IdPageview.php:19-33`). The action also receives a
visit-local interaction position; non-pageview interactions can reuse the
current pageview's position (`plugins/Actions/Columns/PageViewPosition.php:17-42`).

### Custom events

**Fact:** The browser event envelope is `e_c` category, `e_a` action, optional
`e_n` name, optional numeric `e_v` value, and `ca=1`; it is then passed through
the common request builder (`js/piwik.js:4733-4759`). Browser-side event calls
reject empty or whitespace-only category and action values
(`js/piwik.js:4745-4751`).

**Fact:** The server recognizes an event when both `e_c` and `e_a` are
non-empty. The event action stores the request URL as the action URL and the
trimmed event value as its custom float
(`plugins/Events/Actions/ActionEvent.php:17-40,43-80`).

**Fact:** Server-side event dimensions trim category and action and throw an
`InvalidRequestParameterException` for empty or whitespace-only values. Event
name is optional; event value is numeric according to the request parameter
definition (`plugins/Events/Columns/EventCategory.php:48-62`;
`plugins/Events/Columns/EventAction.php:48-62`;
`plugins/Events/Columns/EventName.php:47-61`;
`core/Tracker/Request.php:422-426`).

**Fact:** Event category and action are stored as separate `log_action` rows
identified by type, while an optional name uses `idaction_name`. Event reports
join those IDs back to `log_action`; the numeric value is `custom_float`
(`plugins/Events/Columns/EventCategory.php:21-45`;
`plugins/Events/Columns/EventAction.php:21-45`;
`plugins/Events/Columns/EventName.php:20-45`;
`plugins/Events/Columns/EventValue.php:21-56`;
`plugins/Events/RecordBuilders/EventReports.php:84-125`).

**Fact:** The JavaScript tests assert event requests with category/action,
optional name, optional value, and event custom variables
(`tests/javascript/index.php:4462-4465`).

### Persistence model

**Fact:** The base schema defines `log_action.name` as `VARCHAR(4096)` and
`log_link_visit_action` with an auto-increment `idlink_va`, visitor/site/visit
references, action referrer IDs, `custom_float`, and `pageview_position`
(`core/Db/Schema/Mysql.php:197-205,267-279`). Plugin dimensions add columns such
as `idaction_event_category`, `idaction_event_action`, `idaction_name`, and
`idpageview` through the plugin dimension system
(`plugins/Events/Columns/EventCategory.php:21-25`;
`plugins/Events/Columns/EventAction.php:21-25`;
`plugins/Events/Columns/EventName.php:20-25`;
`plugins/Actions/Columns/IdPageview.php:19-23`).

**Fact:** Before inserting the visit-action row, Matomo looks up or creates
the corresponding action IDs in `log_action`; it then inserts one new
`log_link_visit_action` row with the visit, visitor, referrer, dimensions, and
custom value (`core/Tracker/Action.php:330-425`;
`core/Tracker/TableLogAction.php:22-50,91-106`).

## Validation and limits

**Fact:** Request parameters are type-coerced through a supported-parameter
allowlist. Relevant fields are strings for URLs/event labels, floats for event
value and ecommerce money, JSON for ecommerce items, integers for flags and
performance metrics, and strings for visitor/user IDs
(`core/Tracker/Request.php:388-454`).

**Fact:** Page titles and URLs pass through `PageUrl::cleanupString`, which
trims whitespace, removes newline/carriage-return/NUL characters, and truncates
to `Tracker.page_maximum_length`. The default is 1024 characters
(`core/Tracker/Action.php:204-219`; `core/Tracker/PageUrl.php:227-241`;
`config/global.ini.php:1094-1095`).

**Fact:** The local schema permits action lookup names up to 4096 characters,
but the event category/action dimension code shown here does not declare a
separate event-label maximum. The checkout therefore establishes the database
column capacity and page URL/title limit, but not a distinct public event-label
limit (`core/Db/Schema/Mysql.php:197-205`;
`plugins/Events/Columns/EventCategory.php:21-61`;
`plugins/Events/Columns/EventAction.php:21-61`).

**Fact:** Custom timestamps use `cdt` or a relative `cdo` offset. A custom date
must not be in the future or older than 20 years, and older requests require
authentication. Configured raw-data deletion age can reject still older custom
timestamps (`core/Tracker/Request.php:505-578`; `core/Tracker/RequestHandlerTrait.php:44-53`).
The default unauthenticated custom-timestamp window is one day
(`config/global.ini.php:1108-1118`).

**Fact:** Tracking requests that override sensitive visitor values such as
location fields are checked for authentication, and the default configuration
requires authentication for timestamp/IP overrides
(`core/Tracker/RequestHandlerTrait.php:21-53`; `config/global.ini.php:1108-1118`).

**Unavailable:** The checkout does not provide one concise server-side payload
schema or a single maximum HTTP request size. Limits can also be introduced by
database column types, plugins, web-server configuration, and deployments not
represented in this source tree.

## Time and delivery semantics

### Timestamps

**Fact:** The server's `Request::getCurrentTimestamp()` uses the validated
custom timestamp when present, otherwise the tracker request timestamp
(`core/Tracker/Request.php:505-516`).

**Fact:** Each action's `server_time` is populated from that current timestamp
(`plugins/CoreHome/Columns/ServerTime.php:21-28,51-56`). Visit first and last
action times also use it (`core/Tracker/Visit.php:234-235,283-288`).

**Fact:** The browser includes its local hour/minute/second in every request,
but the server's canonical action and visit timestamp is the parsed tracker
timestamp rather than those display fields
(`js/piwik.js:4086-4132`; `core/Tracker/Request.php:347-369,505-516`).

**Fact:** The offline service worker adds `cdo` equal to the time spent in its
queue before replay. The server interprets `cdo` as an offset from the current
time when no `cdt` is provided, so offline replay attempts to restore the
original capture time (`offline-service-worker.js:45-79`;
`core/Tracker/Request.php:523-546`).

**Inference:** Matomo supports delayed ingestion with a client-supplied event
time, but clock correctness depends on the browser/service-worker timing and on
the custom timestamp authentication and retention rules.

### Retries, replay, and deduplication

**Fact:** The normal JavaScript queue is in memory. It sends one request or a
bulk request after the queue interval and has no visible request ID or retry
backoff (`js/piwik.js:5204-5269`).

**Fact:** The offline worker persists request URL, method, headers, body, and
creation time in IndexedDB. It deletes an entry after an HTTP response below
400; a response at or above 400 or a network failure does not visibly delete
the entry (`offline-service-worker.js:45-97,143-170`).

**Fact:** The offline queue is capped at 50 entries by deleting the oldest
cursor entries when over capacity, and entries older than 24 hours are deleted
when synchronization sees them (`offline-service-worker.js:1-8,54-60,100-115`).

**Fact:** The action write path uses a plain insert into a table whose primary
key is the generated `idlink_va`; it has no unique constraint over visitor,
visit, timestamp, event labels, or a caller-provided event ID
(`core/Tracker/Model.php:22-43`; `core/Db/Schema/Mysql.php:267-279`).

**Inference:** A replayed accepted request is likely to create another action
row. The visible source does not prove that the server deduplicates based on
transport details, `pv_id`, the random cache-buster, or any other field.

**Unavailable:** Exactly-once versus at-least-once delivery, retry behavior at
the reverse proxy or server, and any deployment-specific deduplication are not
established. The local tracker code supports neither an explicit event
idempotency key nor a documented server replay policy.

## Attribution

**Fact:** The browser tracker detects campaign and referrer attribution when
there is no session cookie, stores campaign name/keyword, referrer timestamp,
and referrer URL in an attribution cookie, and sends `_rcn`, `_rck`, `_refts`,
and `_ref` on tracking requests (`js/piwik.js:3973-4078`).

**Fact:** Campaign parameters include Matomo and UTM-style names by default;
the server configuration can treat campaign changes as a new visit
(`config/global.ini.php:1063-1082`).

**Fact:** Server referrer processing can identify search engines, campaigns,
direct traffic, and other referrer types from the request URL/referrer and
campaign parameters (`plugins/Referrers/Columns/Base.php:482-530`). Campaign
information that differs from the ongoing visit is configured by default to
start a new visit (`config/global.ini.php:1074-1077`).

**Fact:** Tracked URLs can exclude common volatile or sensitive query
parameters, including session IDs, tokens, and advertising identifiers. The
default exclusion list is configured in `global.ini.php`
(`config/global.ini.php:1035-1041`).

**Inference:** Attribution is visit-oriented rather than an immutable event
attribute: a campaign or referrer change can affect visit boundaries and the
metadata carried by later actions.

## Identity and session formation

**Fact:** The JavaScript tracker creates or reads a visitor ID cookie, sends it
as `_id`, and refreshes the visitor cookie on requests. The cookie's default
timeout is 13 months; the session cookie is refreshed for 30 minutes
(`js/piwik.js:3652-3751,3851-3855`; `js/piwik.js:6350-6367`).

**Fact:** The server visitor ID precedence is: configured user ID overwrite,
forced `cid`, optional third-party cookie, and first-party `_id`. If no visitor
ID is available, it returns false and can use `config_id` heuristics instead
(`core/Tracker/Request.php:764-824`).

**Fact:** A known visitor lookup can use the supplied visitor ID, the forced
user ID, or a configuration/device ID. With no visitor ID it searches by
`config_id` within the look-back/look-ahead window; the source explicitly notes
that this heuristic can assign a pageview to the wrong visitor
(`core/Tracker/Model.php:490-558`).

**Fact:** When a visitor is known, Matomo loads the prior visit if it falls in
the configured time window. It starts a new visit after the maximum action
count, on a lookup miss, or when other visit settings force a boundary
(`core/Tracker/VisitorRecognizer.php:101-138,220-240`;
`config/global.ini.php:1074-1092`). Midnight boundaries and campaign changes
are enabled by default; the maximum action count is 10,000
(`config/global.ini.php:1074-1092`).

**Fact:** Existing visits update their last action time; new visits initialize
first and last action time from the current request timestamp
(`core/Tracker/Visit.php:195-235,263-288`).

**Fact:** User ID can overwrite the visitor ID when
`enable_userid_overwrites_visitorid` is enabled. The update path hashes the
user ID and writes the resulting binary visitor ID
(`core/Tracker/Visit.php:545-567`; `core/Tracker/Request.php:777-784`).

**Inference:** With normal first-party cookies, a session is an inactivity-based
visit whose actions share `idvisit`; a browser restart or deleted cookies loses
the cookie link, after which Matomo may create a new visitor or use a
configuration-ID heuristic. The server may still recognize a visitor by
`cid`, `uid`, or configured fingerprint behavior.

**Unavailable:** The checkout does not define one universal cross-device,
cross-browser, or authenticated-user stitching policy independent of site
configuration. The exact `config_id` fingerprint inputs are generated elsewhere
in the tracker and are not treated as a stable identity guarantee by the
lookup code.

## Restart and offline behavior

**Fact:** Visitor and session state is stored in browser cookies by the
JavaScript tracker. The session cookie is renewed on each generated request,
while the visitor cookie retains its original creation timestamp and expiry
(`js/piwik.js:2521-2567,3652-3751,3851-3855`).

**Inference:** Clearing cookies, using a new browser profile, or rejecting
cookies removes the ordinary browser-side identity link. A browser restart
does not by itself reset the visitor cookie if the browser retains it, but it
can end an in-memory request queue and any unsent normal requests.

**Fact:** The service worker intercepts tracker requests while offline and
stores them in IndexedDB. It replays them on a sync event or when online, adds
the queue delay as `cdo`, and keeps at most 50 queued entries by default
(`offline-service-worker.js:45-115,123-172`).

**Fact:** The service worker caches the tracker script and attempts queue sync
when the tracker script or a tracking request is fetched
(`offline-service-worker.js:123-145`).

**Unavailable:** The checkout does not show browser support guarantees for the
service-worker path, a retry schedule/backoff, queue encryption, multi-tab
coordination, or server handling of repeated failed entries.

## Bot, exclusion, and privacy filtering

**Fact:** The server can exclude non-human bots, missing-`rec` requests,
configured requests, the Matomo ignore cookie, excluded IPs, excluded user
agents, referrer spam, unknown URLs, and prefetch requests
(`core/Tracker/VisitExcluded.php:54-169,180-197,269-345,348-369`).

**Fact:** The `bots` request parameter can allow bot traffic through the
non-human-bot exclusion check (`core/Tracker/VisitExcluded.php:189-197`). A
separate BotTracking processor can record detected bot requests, including
server time, URL action, status, response size, and response time, without
turning them into ordinary human visits
(`plugins/BotTracking/Tracker/BotRequestProcessor.php:38-103`).

**Fact:** The JavaScript tracker can honor browser Do Not Track by disabling
cookies and suppressing tracking requests. It also supports requiring cookie or
tracking consent and queues requests until consent is granted
(`js/piwik.js:3285-3324,3366-3369,6470-6518,6578-6591,7330-7443`).

**Fact:** The privacy request processor can anonymize user IDs and ecommerce
order IDs before tracking, and can anonymize referrer URL, name, and keyword on
new and existing visits (`plugins/PrivacyManager/Tracker/RequestProcessor.php:40-80,82-127`).

**Fact:** Privacy data purging can unset selected columns from raw action and
visit log tables; local tests exercise removal of event/action/pageview-related
columns (`plugins/PrivacyManager/Dao/LogDataAnonymizer.php:27-29,154-159`;
`plugins/PrivacyManager/tests/Integration/Dao/LogDataAnonymizerTest.php:141-180`).

**Unavailable:** The local source does not establish a single deployment's
retention schedule, consent configuration, IP anonymization settings, or
whether every custom data payload is scrubbed for application-specific PII.

## What this checkout does not answer

| Question needed for a complete ingestion comparison | Local conclusion |
| --- | --- |
| Request envelope and event fields | **Available.** PHP parameter definitions and browser request construction are present. |
| Event storage model | **Available.** Event dimensions map to `log_action` IDs and `log_link_visit_action` columns. |
| Page URL/title limits | **Available.** `page_maximum_length` defaults to 1024. |
| Distinct event-label maximum | **Partially available.** `log_action.name` is 4096 characters, but no separate event-label limit is shown. |
| Canonical timestamp | **Available.** Actions and visits use `Request::getCurrentTimestamp()`, including validated custom time. |
| Clock-skew policy | **Partially available.** Future/old custom timestamps are rejected or authenticated; browser clock accuracy is not solved. |
| Retries and offline capture | **Partially available.** An IndexedDB worker exists, but it is bounded and lacks visible backoff/idempotency. |
| Deduplication | **Not shown.** Normal action writes are plain inserts with generated IDs and no event idempotency key. |
| Session timeout | **Available.** Default visit/session boundary is 1800 seconds, with site/configuration overrides. |
| Cross-device identity | **Configuration-dependent.** `uid`/`cid` and server matching exist; no universal policy is shown. |
| Bot and privacy filtering | **Available in source.** Multiple server exclusion paths and privacy processors exist. |
| Deployment retention and PII policy | **Unavailable.** Configuration and operator choices are not fixed by the checkout. |

## Implication for Cimi issue #7

**Fact:** Matomo supplies the strongest local evidence of a full ingestion and
analytics model among the alternatives inspected so far: typed custom events,
visit/action persistence, browser and server identity paths, campaign
attribution, configurable session boundaries, bulk transactions, and privacy
processing.

**Inference:** Matomo is a good fit if Cimi needs durable analytics semantics
and is willing to operate a stateful, configuration-heavy tracker. Its default
30-minute session model is explicit and adjustable, and its event schema maps
naturally to category/action/name/value fields.

**Decision boundary:** Cimi should not assume exactly-once event delivery from
Matomo's visible tracker. If event retries or offline replay matter, Cimi must
add an application-level event ID/idempotency strategy or verify a deployment
specific ingestion layer outside this checkout. The local source supports
server timestamps and bounded offline replay, but it does not prove reliable
deduplicated delivery.
