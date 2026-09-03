# PostHog: Event Ingestion and Session Semantics

Research for Cimi issue #7, "Define event ingestion and session semantics".

- Investigated: 2026-08-23
- Source scope: only the pinned checkout at `docs/research/vendor/posthog`
  (`0142feede7fed4f0bfe6a2e0096e46895ab6113d`)
- Purpose: document behavior visible in the local PostHog source; the Cimi
  implications below are recommendations inferred from that behavior, not
  PostHog guarantees

## Scope and evidence

The checkout contains the Rust capture service, Node.js ingestion pipeline,
ClickHouse session materialized views, tests, and configuration. It does not
contain the `posthog-js` client source. The labels below distinguish:

- **Fact:** directly implemented, configured, or tested by the local checkout.
- **Inference:** a conclusion from those local implementation details, not a
  claim about behavior outside the checkout.
- **Unavailable:** not represented by the local checkout.

## Executive assessment

**Fact:** PostHog has multiple ingestion contracts in this checkout. Legacy
capture accepts arrays, batches, single events, and person-property updates;
the v1 analytics endpoint accepts a batch envelope with event UUIDs, event
names, distinct IDs, timestamps, optional session IDs, options, and raw JSON
properties (`rust/capture/src/v0_request.rs:17-37`; `rust/capture/src/v1/analytics/types.rs:63-71,189-206`).

**Fact:** The v1 endpoint is `POST /i/v1/analytics/events` and supports a
trailing-slash variant. It reads compressed and decompressed body limits,
validates the batch, publishes to a sink, and returns a 200 response with one
result per event (`rust/capture/src/v1/analytics/constants.rs:15-19`;
`rust/capture/src/v1/analytics/handler.rs:15-111`).

**Fact:** A v1 event can be `ok`, `drop`, `warning`, or `retry`. `retry` means
the event was not persisted and is safe to resubmit; `warning` means the event
was accepted with person processing disabled (`rust/capture/src/v1/analytics/types.rs:50-61`).

**Fact:** The local raw-session implementation is not an inactivity-based
sessionizer. It aggregates events that already carry the same valid UUIDv7
`$session_id` into approximately one row per session ID
(`posthog/models/raw_sessions/sessions_v3.py:7-16,395-397`).

**Fact:** The stateful cookieless server-hash path does form a session at
ingestion time. It stores a UUIDv7 and last-activity timestamp in Redis and
starts a new session after the configured inactivity period, which defaults to
30 minutes (`nodejs/src/ingestion/common/cookieless/cookieless-manager.ts:62-71,593-609`;
`nodejs/src/ingestion/config.ts:398-404`).

**Inference:** For ordinary browser events, Cimi should own session formation
and send a stable session ID if it needs a guaranteed Cimi Analytics Session.
PostHog's local server evidence confirms the 30-minute boundary for stateful
cookieless mode, but does not establish the Cimi 24-hour maximum for all
PostHog event sources.

## Event envelope and transports

### Legacy capture

**Fact:** The legacy Rust request parser recognizes four shapes:

| Shape             | Local behavior                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| JSON array        | Interpreted as a list of `RawEvent` values, documented as the `posthog-js` form.                                                   |
| `/batch` envelope | Contains `token`, optional `historical_migration`, optional `sent_at`, and `batch`. `api_key` is accepted as an alias for `token`. |
| Single event      | A single `RawEvent`, wrapped into a one-element list.                                                                              |
| `/engage` update  | Converted into a `$identify` event when received on an engage route.                                                               |

(`rust/capture/src/v0_request.rs:17-37,70-115`.)

**Fact:** The legacy analytics routes share a 20 MiB wire-body ceiling:
`/e`, `/batch`, `/capture`, `/track`, and `/engage`. The route-level tests
assert that bodies above the cap return 413 and bodies below it are ingested
(`rust/capture/src/router.rs:35-49`; `rust/capture/tests/integration_wire_body_limits.rs:139-200`).

### V1 analytics

**Fact:** A v1 batch contains `created_at`, optional
`historical_migration`, optional `capture_internal`, and `batch`. Each event
contains `event`, UUID, `distinct_id`, RFC 3339 `timestamp`, optional
`session_id` and `window_id`, typed options, and raw JSON `properties`
(`rust/capture/src/v1/analytics/types.rs:63-71,189-206`).

**Fact:** The v1 request context carries the authorization token, SDK metadata,
attempt number, request ID, client request timestamp, client IP, user agent,
content type and encoding, server receipt time, and migration context
(`rust/capture/src/v1/context.rs:13-38`). The request headers are
`PostHog-Sdk-Info`, `PostHog-Attempt`, `PostHog-Request-Id`, and
`PostHog-Request-Timestamp` (`rust/capture/src/v1/constants.rs:7-22`).

**Fact:** The default v1 limits are 10 MiB compressed and 50 MiB decompressed.
The handler enforces the compressed limit before decompression and the
decompressed limit before JSON parsing (`rust/capture/src/config.rs:393-399`;
`rust/capture/src/v1/analytics/handler.rs:65-100`).

**Fact:** The capture service preserves batch order in the v1 response. The
response is shaped as `{"results": {uuid: {result, details?}}}` and adds
`Retry-After: 1` when any event is retryable
(`rust/capture/src/v1/analytics/response.rs:38-74,106-147`).

## Pageviews and custom events

**Fact:** `$pageview` is an ordinary event name in the v1 routing function and
is sent to the analytics destination. Special destinations exist for
`$exception`, `$$heatmap`, client-ingestion warnings, and AI event names
(`rust/capture/src/v1/analytics/process.rs:39-57`).

**Fact:** Raw sessions count `$pageview`, `$autocapture`, and `$screen` events
using UUID-based aggregate functions. In v3, `uniqExact` is used because
duplicate insertion can happen and the aggregate should remain idempotent for
session totals (`posthog/models/raw_sessions/sessions_v3.py:151-161,372-379`).

**Fact:** Session v3 stores unique event names and hostnames, plus initial
device, geo, URL, and attribution fields. It does not infer a session from
event timing; it filters for a valid UUIDv7 `$session_id` and groups by that
session ID (`posthog/models/raw_sessions/sessions_v3.py:95-178,385-397`).

**Fact:** Custom event names are accepted up to 200 bytes by the v1 capture
validator. Empty names are rejected, and `$performance_event` is dropped
(`rust/capture/src/v1/analytics/constants.rs:66-74`;
`rust/capture/src/v1/analytics/process.rs:611-636`).

## Validation, filtering, and limits

**Fact:** V1 rejects event names and distinct IDs longer than 200 bytes,
requires a non-empty distinct ID, parses the timestamp as RFC 3339, and
requires `properties` to begin as a JSON object
(`rust/capture/src/v1/analytics/process.rs:611-636`).

**Fact:** UUIDs are required on v1 events. A missing or malformed UUID aborts
the batch, and a duplicate UUID within one batch also aborts the batch
(`rust/capture/src/v1/analytics/process.rs:468-486`). This is distinct from a
cross-request deduplication guarantee.

**Fact:** Known invalid distinct IDs such as `anonymous`, `null`, `undefined`,
`user`, and the zero UUID do not necessarily cause event loss. They mark the
event for disabled person processing while the event remains publishable
(`rust/capture/src/v1/analytics/constants.rs:78-109`;
`rust/capture/src/v1/analytics/process.rs:522-541`).

**Fact:** The configured v1 event restriction service can drop an event,
redirect it to a custom topic or DLQ, force overflow, or disable person
processing. Matching can use distinct ID, session ID, event name, or event UUID
(`rust/capture/src/v1/analytics/process.rs:748-826`;
`nodejs/src/common/utils/event-ingestion-restrictions/rules.ts:1-17,19-67`).

**Fact:** Customer-configured event filters can match only event name and
distinct ID. Live matches are dropped before full message parsing; dry-run
matches are measured but continue through ingestion
(`nodejs/src/ingestion/common/event-filters/schema.ts:3-35`;
`nodejs/src/ingestion/common/steps/event-filters-steps.ts:38-85`).

**Fact:** Static token and token-plus-distinct-ID restrictions can drop events
or skip person processing. These are configured separately from the dynamic
event restriction service (`nodejs/src/ingestion/ingestion-consumer.ts:155-170`;
`nodejs/src/servers/ingestion-api-server.ts:383-391`).

**Fact:** No general maximum for arbitrary analytics properties was established
in the inspected capture and ingestion code. One explicit property validation
rule limits `$groupidentify` `$group_key` to 400 characters
(`nodejs/src/ingestion/common/steps/event-preprocessing/validate-event-properties.ts:5-34`).

## Timestamps and historical events

**Fact:** V1 adjusts event timestamps for request clock skew unless the event
option `disable_skew_correction` is enabled. If the adjusted timestamp is more
than 23 hours in the future, it is clamped to server receipt time
(`rust/capture/src/v1/analytics/process.rs:639-656`;
`rust/capture/src/v1/analytics/constants.rs:111-117`).

**Fact:** Events marked as historical are routed to an analytics-historical
destination. When enabled, old timestamps can also trigger timestamp-based
historical rerouting (`rust/capture/src/v1/analytics/process.rs:658-687`).

**Fact:** The Node.js ingestion timestamp step delegates timestamp normalization
to the Rust capture layer (`nodejs/src/ingestion/common/timestamps.ts:9-24`).

**Inference:** A delayed event can affect session grouping and entry attribution
according to its accepted event timestamp, not simply the time the downstream
consumer reads it. The local source does not establish every downstream query's
late-arrival policy.

## Retries, delivery, and deduplication

**Fact:** V1 maps sink retriable errors and timeouts to a per-event `retry`
result with `not_persisted`; fatal sink errors become `drop`. The client can
therefore retry only the failed UUIDs instead of resending the entire batch
(`rust/capture/src/v1/analytics/process.rs:297-335`).

**Fact:** The v1 response marks retryable batches with `Retry-After: 1`, while
the source expects SDKs to add jittered exponential backoff
(`rust/capture/src/v1/analytics/constants.rs:7-9`).

**Fact:** The Node.js ingestion consumer processes Kafka batches and relies on
offset commits after pipeline work. Its shutdown code explicitly warns that
writing dirty data after disconnect would produce duplicates on partition
rebalance (`nodejs/src/ingestion/ingestion-consumer.ts:320-350,417-449`).

**Fact:** The local source proves duplicate UUID rejection within a v1 request,
and raw-session aggregate counts are UUID-unique. It does not prove a general
cross-request event deduplication layer for the primary analytics event stream.

**Unavailable:** The checkout does not contain `posthog-js`, so it cannot answer
whether a browser SDK persists failed requests, how it retries a failed batch,
or what client-side idempotency behavior is used across reloads and restarts.
It also does not establish an at-most-once or exactly-once guarantee for the
full capture-to-ClickHouse path.

## Attribution and session aggregation

**Fact:** Raw session v3 extracts `$current_url`, `$referring_domain`, UTM
properties, Google and Facebook click IDs, and lower-tier ad IDs from event
properties (`posthog/models/raw_sessions/sessions_v3.py:246-305`).

**Fact:** Attribution is prioritized from `$pageview` and `$screen` events.
Properties on other event types are deliberately deprioritized by shifting
their ordering timestamp by one year. Entry attribution uses `argMin` over the
prioritized values (`posthog/models/raw_sessions/sessions_v3.py:308-369`).

**Fact:** Session v3 derives entry and end URLs only from pageview or screen
events, while last external click URL uses event timestamp. Custom events are
still retained in event names and session aggregates, but they do not become
the preferred entry page merely because they contain URL or UTM properties
(`posthog/models/raw_sessions/sessions_v3.py:327-331,385-392`).

**Inference:** PostHog's local server model treats attribution as event-property
aggregation within a client- or caller-supplied session. It is not evidence of
a separate server-side visitor identity or a universal first-touch identity
graph.

## Identity and session formation

### Ordinary event sessions

**Fact:** The v1 event envelope accepts an optional `session_id`, and the raw
session materialized view groups only events with a valid UUIDv7 session ID
(`rust/capture/src/v1/analytics/types.rs:189-206`;
`posthog/models/raw_sessions/sessions_v3.py:308-317,395-397`).

**Fact:** The raw-session table stores min/max event timestamps, distinct IDs,
pageview/autocapture/screen counts, URLs, device fields, geo fields,
attribution, feature-flag values, event names, and replay presence
(`posthog/models/raw_sessions/sessions_v3.py:80-178`).

**Inference:** A caller that omits or changes `$session_id` changes the session
aggregation boundary. The local raw-session code does not fill in a missing ID
from inactivity intervals.

### Cookieless server hash mode

**Fact:** Cookieless stateful identity hashes a daily salt with team ID, IP,
root domain, user agent, and optional extra content. The salt is stored in
Redis and the design explicitly avoids retaining the source values as the
identity (`nodejs/src/ingestion/common/cookieless/cookieless-manager.ts:28-49`).

**Fact:** Stateless cookieless mode does not support session timeout and creates
one session per day per user. Stateful mode stores session state and applies a
30-minute inactivity period (`nodejs/src/ingestion/common/cookieless/cookieless-manager.ts:50-71`).

**Fact:** Stateful processing writes `$device_id` and `$session_id`, replaces
the cookieless sentinel distinct ID for pre-identification events, and strips
`$ip`, `$raw_user_agent`, and `$cookieless_extra` before persistence
(`nodejs/src/ingestion/common/cookieless/cookieless-manager.ts:613-630,882-897`).

**Fact:** The default Redis session TTL is 96 hours, while the inactivity
threshold is 30 minutes. The TTL is storage cleanup and is not itself a
24-hour maximum session duration (`nodejs/src/ingestion/config.ts:398-404`).

**Fact:** Stateful sessions are assigned UUIDv7 IDs whose timestamp is the
first event timestamp. If Redis state is absent or the inactivity threshold is
exceeded, a new UUIDv7 session is created (`nodejs/src/ingestion/common/cookieless/cookieless-manager.ts:593-609,899-918`).

## Restart, delay, and offline behavior

**Fact:** Cookieless stateful sessions and identify-event state are stored in
Redis. A missing session state creates a new session; Redis TTLs are used for
cleanup, while inactivity is evaluated from the stored last-activity timestamp
(`nodejs/src/ingestion/common/cookieless/cookieless-manager.ts:568-609,632-657`).

**Fact:** The capture service exposes retry outcomes for events that were not
persisted, and the Node.js consumer can reprocess Kafka messages when offsets
are not committed (`rust/capture/src/v1/analytics/response.rs:15-20,129-147`;
`nodejs/src/ingestion/ingestion-consumer.ts:347-350`).

**Unavailable:** No local `posthog-js` implementation was found, so durable
browser queues, service-worker delivery, offline capture, browser restart
recovery, and SDK retry limits cannot be determined. The server-side source
alone cannot establish whether a disconnected browser eventually resubmits an
event.

## Bot, exclusion, and privacy filtering

**Fact:** The local analytics ingestion paths provide configurable event filters,
token/distinct-ID drops, event restrictions, DLQ routing, and person-processing
suppression. These controls are explicit rules; the inspected ordinary event
capture path does not establish a universal user-agent bot classifier
(`nodejs/src/ingestion/common/event-filters-steps.ts:38-85`;
`rust/capture/src/v1/analytics/process.rs:748-826`).

**Fact:** Cookieless mode removes the source properties used to calculate the
privacy-preserving hash and nulls the event IP before persistence
(`nodejs/src/ingestion/common/cookieless/cookieless-manager.ts:882-897`).

**Fact:** Event filters can run before full message parsing and can match event
name or distinct ID only. They are therefore useful for configured exclusion,
but they do not constitute arbitrary property redaction
(`nodejs/src/ingestion/common/event-filters/schema.ts:3-35`;
`nodejs/src/ingestion/common/steps/event-filters-steps.ts:38-45`).

**Unavailable:** The local checkout does not establish a complete hosted-service
privacy policy, universal bot handling, browser consent behavior, or deletion
and retention guarantees for all event, person, session, and replay stores.

## What this checkout does not answer

| Question needed for a complete event/session comparison | Local conclusion                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser SDK event generation                            | **Unavailable.** `posthog-js` source is absent from the pinned checkout.                                                                                   |
| Browser persistence and anonymous ID lifetime           | **Unavailable.** The server receives IDs but does not show how the browser stores them.                                                                    |
| Durable offline queue and browser restart recovery      | **Unavailable.** The client implementation is absent.                                                                                                      |
| General property-size and property-key limits           | **Partially unavailable.** Specific validation exists, but no complete analytics-property contract was established.                                        |
| Cross-request event deduplication                       | **Partially unavailable.** Batch-local UUID validation and UUID-unique session aggregates are visible; a full event-stream deduplication guarantee is not. |
| Session formation for ordinary browser events           | **Partially unavailable.** Raw sessions group supplied valid session IDs; only cookieless stateful mode visibly forms sessions from inactivity.            |
| Universal 24-hour maximum session duration              | **Unavailable from server source.** The visible cookieless stateful logic uses 30-minute inactivity and a 96-hour Redis TTL.                               |
| Hosted retention and deletion semantics                 | **Unavailable.** The inspected source does not provide a complete policy contract across stores.                                                           |
| Complete bot and consent behavior                       | **Unavailable.** Explicit filters and cookieless privacy processing exist, but no universal policy was established.                                        |

## Implication for Cimi issue #7

**Fact:** PostHog's local ingestion contract is suitable for explicit event
envelopes, caller-supplied UUIDs and session IDs, timestamp normalization,
Kafka-backed asynchronous processing, configurable event restrictions, and
session-level aggregation.

**Inference:** Cimi should keep its Logical Data Contract authoritative for
Visitor, Anonymous Identity, Analytics Session, attribution, consent, and
retention. PostHog can be an analytics projection: Cimi can generate stable
event and session identifiers, send only approved properties, and use PostHog
filters as an additional ingestion control rather than as the privacy boundary.

**Inference:** If Cimi requires the documented 30-minute inactivity and
24-hour maximum session semantics, it should compute those boundaries in the
Cimi collection layer and send the resulting session ID. Relying on the
PostHog raw-session view alone would only group IDs already present on events.

**Decision boundary:** The missing `posthog-js` source prevents a complete
assessment of browser persistence, automatic pageview generation, client retry,
offline capture, and anonymous identity lifecycle. Those behaviors should
remain unknown rather than be inferred from the server-side ingestion code.

## Sources inspected

- `rust/capture/src/v0_request.rs`
- `rust/capture/src/router.rs`
- `rust/capture/src/v1/analytics/constants.rs`
- `rust/capture/src/v1/analytics/handler.rs`
- `rust/capture/src/v1/analytics/process.rs`
- `rust/capture/src/v1/analytics/response.rs`
- `rust/capture/src/v1/analytics/types.rs`
- `rust/capture/src/v1/constants.rs`
- `rust/capture/src/v1/context.rs`
- `rust/capture/tests/integration_wire_body_limits.rs`
- `nodejs/src/ingestion/config.ts`
- `nodejs/src/ingestion/ingestion-consumer.ts`
- `nodejs/src/ingestion/common/cookieless/cookieless-manager.ts`
- `nodejs/src/ingestion/common/event-filters/schema.ts`
- `nodejs/src/ingestion/common/steps/event-filters-steps.ts`
- `nodejs/src/ingestion/common/steps/event-preprocessing/validate-event-properties.ts`
- `nodejs/src/common/utils/event-ingestion-restrictions/rules.ts`
- `nodejs/src/servers/ingestion-api-server.ts`
- `posthog/models/raw_sessions/sessions_v2.py`
- `posthog/models/raw_sessions/sessions_v3.py`
- `posthog/hogql/database/schema/event_sessions.py`
- `posthog/hogql/database/schema/sessions_v1.py`
- `posthog/hogql/database/schema/sessions_v2.py`
- `posthog/hogql/database/schema/sessions_v3.py`
