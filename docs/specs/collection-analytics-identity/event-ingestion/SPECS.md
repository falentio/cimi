---
resource: event-ingestion
status: draft
version: 1.1.0
updated: 2026-08-24
---

# Event Ingestion Resource

## 1. Overview & Lifecycle

**Audience:** Both

Event Ingestion accepts immutable typed Events for a Site selected by its non-secret Ingestion Identifier. It is the shared path for browser pageviews and server-side product events; it is not a REST resource CRUD API.

Singular collection succeeds only as `accepted` or `duplicate`. A valid Event refused by collection policy is a generic `403` policy refusal, not a successful result. Accepted means durably recorded for processing, not committed to the queryable analytics store.

New normalized acceptance candidates use one installation-wide FIFO acceptance coalescer shared by `collectEvent` and `collectEvents`. The first candidate starts a fixed 1,000 ms coalescing window; the active SQLite flush starts earlier at 500 candidates. At most 1,500 additional unique candidates wait for the next sequential flush. Each flush is one SQLite transaction and is all-or-none. These internal flushes are not public Event Batches and do not change the public 100-Event or request-byte boundaries.

Queue admission is not acknowledgment. A request waits until every new candidate belonging to that request has committed durably to SQLite before returning success. Existing durable duplicates may return immediately; an identical pending retry waits for the owning flush and returns `duplicate` with the original Receipt Time. The 1,000 ms value bounds coalescing delay only, not total HTTP latency, SQLite lock waits, or commit duration. The behavior is an operating rule, not a throughput guarantee.

## 2. Base Schema

**Audience:** Both

The shared Event envelope is a strict discriminated union defined by the Event, Event ID, Event Kind, Occurrence Time, Receipt Time, Attribution, Visitor, Identified User, and Analytics Session glossary terms. The raw UTF-8 request body is measured by the transport adapter before JSON parsing: one singular request is no more than 64 KiB and one batch request is no more than 256 KiB. Parsed contract validation then enforces at most 64 properties, property keys no longer than 64 characters, string values no longer than 512 characters, and rejects arrays, nested objects, non-finite numbers, reserved names, and unknown fields. Re-serializing the parsed value is not the request-size measurement. Page paths and referrers remain limited to 2,048 characters. Source IP may be used transiently for protection buckets but is never persisted in the acceptance journal or analytics data.

### Kind Catalog

| Kind           | Required fields                               | Optional fields                     | Excluded fields                               |
| -------------- | --------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| `page_view`    | Sanitized `pagePath`                          | `referrer`                          | Kind fields from other kinds                  |
| `custom_event` | Bounded `name`                                | Scalar `properties`                 | Nested or arbitrary properties                |
| `outbound`     | Sanitized `destination`                       | Bounded `name`                      | Raw request metadata                          |
| `performance`  | Bounded metric `name`, finite numeric `value` | Bounded `unit`                      | Unbounded timing payloads                     |
| `error`        | Bounded `name`                                | Bounded `code`, sanitized `message` | Stack traces and arbitrary diagnostic details |

### Server-Generated Fields

`receiptTime`, effective Site, Visitor/Anonymous Identity, Analytics Session, normalized acceptance metadata, and acceptance state are server-controlled. The acceptance journal also stores the payload fingerprint, effective policy version, and replay sequence; policy refusals and item errors are response-only and are never journaled.

### Client-Provided Fields

`eventId`, Event Kind, optional bounded occurrence time, page context, approved attribution inputs, an optional reference to an existing Site-scoped Identified User, and bounded scalar properties. Collection never creates or updates an Identified User or Alias. Attribution is captured once at Session entry, same-Site referrals are normalized away, and approved referrer/campaign/device/coarse-location values remain stable for that Session.

### Acceptance coalescing

`Receipt Time` is captured when a normalized candidate crosses the shared lifecycle boundary and enters the coalescer. Replay sequence follows global candidate admission order, not SQLite statement timing. The coalescer keeps only in-memory Event ID reservations until the flush commits; a rollback or process crash releases them. The active flush closes at 500 candidates and the next queue starts; a bounded pending queue has capacity for 1,500 unique candidates. Only pending-queue saturation fails new admission with `SERVICE_UNAVAILABLE`, rather than silently dropping or partially admitting a request.

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure       | Method | Path             | Auth   | CQRS    |
| --- | --------------- | ------ | ---------------- | ------ | ------- |
| C1  | `collectEvent`  | POST   | `/collectEvent`  | public | command |
| C2  | `collectEvents` | POST   | `/collectEvents` | public | command |

## 4. Queries

This resource has no queries.

## 5. Commands

### C1: `POST /collectEvent` — `collectEvent`

**Audience:** Both

**Purpose:** Accept one telemetry Event for processing.

**Behavior:** Resolve Site from the Ingestion Identifier and require the Site to be `active` before validating the strict envelope or creating any side effect. The active-state check and candidate admission linearize with Site deletion through the shared lifecycle boundary. A `deleting`, `deleted`, `recovering`, or `purged` Site rejects new admission with `NOT_FOUND` and creates no new Event, Visitor, Identity Profile, or Analytics Session; a candidate admitted before deletion is grandfathered through the acceptance flush. Enforce the Site and transient source-IP protection buckets without persisting the source IP, then check the Site-scoped durable or in-flight Event ID and payload fingerprint. An existing durable exact duplicate returns 200 with the original Receipt Time before current policy is re-evaluated. An identical pending reservation waits for its owning flush and returns `duplicate`; a changed payload for the same ID returns `CONFLICT` without mutation. For a new Event, apply hard exclusions, bot policy, the request `collectionContext`, consent/opt-out, URL sanitization, and property validation before assigning Visitor or Session, then snapshot the effective policy version and reserve the Event ID in memory. Missing Occurrence Time uses the admission Receipt Time. Occurrence times more than five minutes in the future or older than analytical Event retention fail; accepted arrivals more than fifteen minutes behind Receipt Time are marked late and never normalized. Session-entry attribution uses first-touch values, removes same-Site referrals, and remains stable for the Session. A new candidate is enqueued only when capacity is reserved. The request returns 200 `accepted` only after its candidate is committed in the sequential all-or-none SQLite flush; the analytics-store commit may occur asynchronously. Queue saturation or a failed flush returns `SERVICE_UNAVAILABLE` (503), and retrying the Event ID is safe even when the response or commit outcome is ambiguous.

Pageviews emit once for initial document load and once per actual SPA route transition. Repeated route notifications are deduplicated; reloads create new pageviews. The optional `identifiedUserId` is reference-only: unknown IDs fail validation, and consent may strip the reference while retaining the base Event anonymously.

**Events Emitted:** None in MVP; the accepted Event is the analytics record itself.

**Errors:** `BAD_REQUEST` (400), `FORBIDDEN` (403 for generic collection-policy refusal), `NOT_FOUND` (404 for invalid Ingestion Identifier), `CONFLICT` (409 for an Event ID payload collision), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429), `SERVICE_UNAVAILABLE` (503 when the acceptance boundary is unavailable).

### C2: `POST /collectEvents` — `collectEvents`

**Audience:** Both

**Purpose:** Accept a bounded non-atomic batch of Events for one Site.

**Behavior:** Accept at most 100 Events for one Ingestion Identifier. The transport adapter rejects a raw UTF-8 request body over 256 KiB before JSON parsing. One envelope-level `collectionContext` applies to every item. Count each input Event against Site and transient source-IP protection buckets without persisting the source IP. For a valid batch boundary, process items independently before queue admission. Policy refusals, malformed items, and changed-payload collisions remain response-only outcomes; only new normalized candidates and their in-flight reservations enter the coalescer. Reserve capacity for every eligible new candidate before enqueueing any candidate from the request. If capacity is unavailable, return top-level `SERVICE_UNAVAILABLE` with no result body and enqueue none of that request's eligible candidates. Candidates may split across sequential 500-candidate flushes while preserving input order; the response waits until all of its new candidates have committed. A successful boundary-validated batch returns HTTP 200 with exactly one result per input item, so a non-empty batch returns between 1 and 100 results: `accepted`, `duplicate` with the original Receipt Time, `rejected` with generic `reason: policy`, or `itemError` with `BAD_REQUEST`, `CONFLICT`, or `PAYLOAD_TOO_LARGE`. An identical pending reservation is reported as `duplicate` after its owning flush commits. A syntactically malformed item does not abort other items; echo its `eventId` only when it passes the shared ID schema, otherwise return `null`. Each internal flush is atomic, but the public batch remains non-atomic: an earlier split flush may commit before a later flush fails. In that case return top-level `SERVICE_UNAVAILABLE` with no result body; callers retry the whole request and receive duplicates for committed Event IDs and `accepted` for uncommitted ones. Invalid envelope, mixed Ingestion Identifiers, invalid Site, oversized batch, rate protection, queue saturation, or unavailable acceptance boundary returns a top-level error before any result body.

**Errors:** `BAD_REQUEST` (400), `NOT_FOUND` (404), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429), `SERVICE_UNAVAILABLE` (503).

## 6. Business Rules

| Rule                                                                                                                        | Enforcement Point                           | Affected Procedures |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------- |
| Event IDs are stable and deduplicated, including while candidates are in flight.                                             | Ingestion boundary and deduplication store. | C1, C2              |
| Event IDs remain unique for full raw-event retention; changed payloads conflict.                                            | Ingestion boundary and deduplication store. | C1, C2              |
| Unknown fields, nested custom properties, arrays, reserved names, and oversize parsed values fail.                         | Strict contract validation.                 | C1, C2              |
| Raw request-byte limits are checked before JSON parsing; parsed schemas do not measure re-serialized values.                 | Transport adapter.                          | C1, C2              |
| Exclusions precede identity and Session assignment.                                                                         | Ordered pipeline.                           | C1                  |
| Server owns Session boundaries.                                                                                             | Session resolver.                           | C1                  |
| Accepted-for-processing requires durable journal acceptance but is not analytics-store commit.                              | Acceptance journal and recovery pipeline.   | C1, C2              |
| New candidates use a global FIFO coalescer with a fixed 1,000 ms window, a 500-candidate flush limit, and 1,500 pending unique-candidate capacity. | Acceptance coordinator. | C1, C2 |
| Each internal flush is one sequential all-or-none SQLite transaction; queue admission never produces a successful response. | Acceptance coordinator and SQLite journal. | C1, C2 |
| A request response waits for all of its new candidates to commit; a failed or ambiguous commit is retried by Event ID.      | Request waiter and deduplication store.    | C1, C2              |
| Occurrence Time is bounded; Receipt Time is captured at candidate admission and is always retained.                         | Timestamp validator and acceptance coordinator. | C1, C2          |
| Occurrence Time governs analytical retention; Receipt Time governs acceptance-journal, deduplication, and replay retention. | Retention resolver. | C1, C2 |
| Session-entry attribution uses first-touch values, normalizes same-Site referrals away, and remains stable for the Session. | Attribution resolver. | C1, C2 |
| Source IP is transient protection input and is never persisted. | Ingestion guard and journal boundary. | C1, C2 |
| Rate protection uses Site and transient source-IP buckets; numeric thresholds are installation settings, not API quotas.    | Ingestion guard.                            | C1, C2              |
| Identity deletion applies a durable redaction overlay without rewriting accepted Event sequence history.                    | Identity lifecycle and replay.              | C1, C2              |
| Only active Sites may admit new candidates; candidates admitted before deletion are grandfathered through the flush.        | Shared lifecycle boundary.                  | C1, C2              |
| Public batch processing is non-atomic after boundary validation, while each internal flush is atomic.                       | Per-item pipeline and acceptance coordinator. | C2                |
| Batch policy refusals disclose only a generic policy result and are not journaled.                                          | Collection-policy boundary.                 | C2                  |
| Batch item errors use a bounded code set and do not expose unvalidated IDs.                                                 | Item-result schema.                         | C2                  |
| Queue saturation, flush failure, quiesce failure, and commit ambiguity return top-level `SERVICE_UNAVAILABLE` with no success body. | Acceptance coordinator. | C1, C2 |
| Acceptance observability records queue depth, active/pending batch size, queue wait, commit latency, WAL growth, saturation, failures, and response latency. | Ingestion diagnostics. | C1, C2 |

## 7. Authorization Matrix

| Auth Level | Meaning                                                                                      | Procedures |
| ---------- | -------------------------------------------------------------------------------------------- | ---------- |
| `public`   | Valid non-secret Ingestion Identifier plus the ingestion guard; no dashboard read authority. | C1, C2     |

## 8. Event Catalog

**Audience:** BE

No domain event is emitted in MVP. The acceptance journal append and projector handoff are internal recovery mechanisms, not a public/domain event channel.

## 9. Edge Cases

**Audience:** Both

- **Duplicate Event ID with changed payload** — Return `CONFLICT` without mutating the original Event; never accept two meanings for one ID.
- **Batch duplicate Event ID** — Return `duplicate` with the original Receipt Time and do not re-evaluate current policy or create identity/Session state. A later identical request that races a pending reservation waits for the owning commit and returns `duplicate`; only the first reservation owner returns `accepted`.
- **Client clock outside the accepted range** — Reject future Occurrence Time beyond five minutes or historical Occurrence Time older than analytical Event retention; never silently normalize it.
- **Late arrival** — Accept an in-retention Event whose Occurrence Time is more than fifteen minutes behind Receipt Time, mark it late, and use its occurrence for reporting placement.
- **Rotated Ingestion Identifier** — Return `NOT_FOUND`; never infer a Site from hostname or payload.
- **Site deletion or recovery** — The shared lifecycle boundary blocks new admission once a Site enters `deleting`, `deleted`, `recovering`, or `purged`. Candidates admitted before the transition are grandfathered and drain through the global writer; later requests return `NOT_FOUND` before policy, identity, Session, or duplicate side effects.
- **Storage pressure** — Flush at 500 candidates, retain at most 1,500 additional unique candidates in the pending queue, and return top-level `SERVICE_UNAVAILABLE` when capacity cannot be reserved. Never silently delete retained Events or partially admit a request whose full eligible set cannot be reserved.
- **Opt-out before identity** — Do not create a Visitor or Session as a side effect of a rejected Event.
- **Policy changes after acceptance** — An exact duplicate returns `duplicate` from the stored acceptance record and does not re-run current policy.
- **Partial batch interruption** — A committed flush is recoverable by its per-item journal sequence. Uncommitted candidates are not acknowledged; their in-memory reservations are released and callers retry by Event ID.
- **Policy-refused batch item** — Return HTTP 200 with `status: rejected` and `reason: policy`; continue independent items and do not disclose the matched policy rule.
- **Consent context** — Apply the singular request context or the one batch-envelope context before identity and Session assignment; omitted consent is not an opt-in, and active honored GPC/DNT returns the generic policy refusal.
- **Malformed batch item** — Return HTTP 200 with `status: itemError` and `code: BAD_REQUEST`; continue independent items and echo only a validated Event ID.
- **Changed-payload batch collision** — Return HTTP 200 with `status: itemError` and `code: CONFLICT`; preserve the original acceptance record and let unrelated items proceed.
- **Invalid batch boundary** — Return a top-level error and no result body for invalid envelope, mixed identifiers, invalid Site, batch limit, rate, queue saturation, or acceptance-boundary failures.
- **Coalescing deadline** — Start one non-sliding 1,000 ms window from the first candidate in a queue. Flush immediately at 500 candidates or earlier for quiesce/shutdown; candidates arriving during an active flush form the next queue.
- **Split request** — Preserve input order while splitting a request across flushes. A response waits for every new candidate; if a later flush fails after an earlier one committed, return 503 without results and make whole-request retry safe through duplicates.
- **Flush failure** — Roll back the entire SQLite transaction, release its in-memory reservations, return 503 to every waiting request affected by the flush, and never return a successful acceptance body.
- **Commit/response ambiguity** — A process crash or lost response after commit is resolved by retrying the Event ID while the Site remains eligible for duplicate lookup; the retry returns `duplicate` with the original Receipt Time. A retry after the Site deletion boundary remains fail-closed with `NOT_FOUND` and never creates a second record.
- **Graceful shutdown or backup** — Stop new admissions, drain the active and pending queues before closing or snapshotting SQLite, and fail the operation and uncommitted waiters with 503 if the drain cannot commit.
- **Policy change during coalescing** — Keep the effective policy version and normalized policy outcome captured at admission; a queued candidate is not re-evaluated during the wait.

## 10. Error Code Catalog

| Code                  | HTTP | Trigger                                                        |
| --------------------- | ---: | -------------------------------------------------------------- |
| `BAD_REQUEST`         |  400 | Envelope, Event Kind, timestamp, or property validation fails. |
| `FORBIDDEN`           |  403 | A valid Event is refused by the effective collection policy.   |
| `NOT_FOUND`           |  404 | Ingestion Identifier is invalid/revoked or the Site is deleting, deleted, recovering, or purged. |
| `CONFLICT`            |  409 | An existing Event ID is reused with a changed payload.         |
| `PAYLOAD_TOO_LARGE`   |  413 | The raw request body exceeds 64 KiB for C1 or 256 KiB for C2, or a bounded parsed envelope/property size is exceeded. |
| `TOO_MANY_REQUESTS`   |  429 | Ingestion rate limit is exceeded.                              |
| `SERVICE_UNAVAILABLE` |  503 | The local durable acceptance boundary is unavailable.          |

`collectEvents` uses `rejected` only for policy refusal and `itemError` only for bounded item failures. A policy refusal is never encoded as an item `FORBIDDEN` error, and item errors never expose provider or policy details.

## 11. Acceptance Scenarios

### C1: Singular acceptance

**Given** a valid new Event within the size and timestamp boundaries
**When** Site and source-IP protection permit it, the candidate enters the coalescer, and its flush commits to the acceptance journal
**Then** return 200 `accepted` with its Event ID and Receipt Time

### C1: Synchronous coalescing

**Given** concurrent new Events pass validation, policy, identity, Session, and lifecycle admission

**When** they enter the shared FIFO coalescer within one 1,000 ms window

**Then** flush at 500 candidates or the deadline in one SQLite transaction, wait for durable commit before returning, preserve admission-time Receipt Time and FIFO sequence, and do not imply DuckDB query visibility

### C1: Pending duplicate

**Given** one Event ID is reserved by a new candidate and an identical request arrives before its flush commits

**When** the owning flush commits successfully

**Then** the first request returns `accepted`, the retry returns `duplicate` with the same Receipt Time, and only one acceptance record exists

### C1: Flush rollback

**Given** a candidate is waiting in a flush and SQLite cannot complete the outer transaction

**When** the flush rolls back

**Then** every affected request receives top-level `SERVICE_UNAVAILABLE` (503) with no success body, in-memory reservations are released, and retrying by Event ID is safe

### C1: Exact retry

**Given** an accepted Event with the same Site, Event ID, and payload fingerprint
**When** the caller retries it, including after a policy change
**Then** return 200 `duplicate` with the original Receipt Time and do not create new identity or Session state

### C1: Policy refusal

**Given** a syntactically valid Event refused by the effective collection policy
**When** it reaches policy evaluation
**Then** return generic 403, do not append an accepted journal item, and do not create Visitor, Identified User, or Session state

### C2: Mixed batch

**Given** a valid non-empty one-Site batch within 100 Events and 256 KiB of raw UTF-8 request bytes
**When** items produce mixed accepted, duplicate, policy, validation, and changed-payload outcomes
**Then** return HTTP 200 with exactly one independent per-item result for every input (`accepted`, `duplicate`, generic `rejected`, or bounded `itemError`) after all new candidates commit; the public batch remains non-atomic even though each internal flush is atomic

### C2: Policy refusal and retry

**Given** one batch item is refused by the effective collection policy and another item is valid
**When** `collectEvents` processes the batch and the caller later retries the refused Event after a policy change
**Then** return HTTP 200 with `reason: policy` for the first attempt, accept the valid item independently, create no journal record for the refusal, and re-evaluate the retry against current policy

### C2: Split flush failure

**Given** a valid batch has eligible candidates split across two internal flushes

**When** the first flush commits and the later flush rolls back

**Then** return top-level `SERVICE_UNAVAILABLE` with no result body; retrying the whole request returns `duplicate` for committed Event IDs and `accepted` for uncommitted Event IDs

## 12. Related Resources & Dependencies

### Depends On

| Resource            | Integration Point                                |
| ------------------- | ------------------------------------------------ |
| `site`              | Ingestion Identifier and Site scope.             |
| `collection-policy` | Ordered exclusions and sanitization.             |
| `identity-profile`  | Explicit identity context and deletion policy.   |
| `retention-policy`  | Event lifecycle.                                 |
| `backup-restore`    | Durable acceptance-journal capture and recovery. |

### Used By

| Resource                             | Integration Point                                 |
| ------------------------------------ | ------------------------------------------------- |
| `traffic-report`                     | Pageview, Visitor, Session, and attribution data. |
| `event-report`                       | Standard Event kinds and properties.              |
| `goal`, `funnel`, `cohort-retention` | Product behavior and identity context.            |

## 13. Out of Scope

**Audience:** Both

- Native mobile SDK lifecycle and mobile-specific collection semantics.
- Broad autocapture, Session Replay, or arbitrary nested Event payloads.
- Exactly-once analytics-store materialization; acceptance is durable and projection remains asynchronous.
- A hard one-second end-to-end HTTP response guarantee or a numeric SQLite throughput guarantee.
