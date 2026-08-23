---
resource: event-ingestion
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Event Ingestion Resource

## 1. Overview & Lifecycle

**Audience:** Both

Event Ingestion accepts immutable typed Events for a Site selected by its non-secret Ingestion Identifier. It is the shared path for browser pageviews and server-side product events; it is not a REST resource CRUD API.

Singular collection succeeds only as `accepted` or `duplicate`. A valid Event refused by collection policy is a generic `403` policy refusal, not a successful result. Accepted means durably recorded for processing, not committed to the queryable analytics store.

## 2. Base Schema

**Audience:** Both

The shared Event envelope is a strict discriminated union defined by the Event, Event ID, Event Kind, Occurrence Time, Receipt Time, Attribution, Visitor, Identified User, and Analytics Session glossary terms. One singular request is no more than 64 KiB serialized, has at most 64 properties, uses property keys no longer than 64 characters and string values no longer than 512 characters, and rejects arrays, nested objects, non-finite numbers, reserved names, and unknown fields. Page paths and referrers remain limited to 2,048 characters.

### Kind Catalog

| Kind | Required fields | Optional fields | Excluded fields |
| --- | --- | --- | --- |
| `page_view` | Sanitized `pagePath` | `referrer` | Kind fields from other kinds |
| `custom_event` | Bounded `name` | Scalar `properties` | Nested or arbitrary properties |
| `outbound` | Sanitized `destination` | Bounded `name` | Raw request metadata |
| `performance` | Bounded metric `name`, finite numeric `value` | Bounded `unit` | Unbounded timing payloads |
| `error` | Bounded `name` | Bounded `code`, sanitized `message` | Stack traces and arbitrary diagnostic details |

### Server-Generated Fields

`receiptTime`, effective Site, Visitor/Anonymous Identity, Analytics Session, normalized acceptance metadata, and rejection reason are server-controlled. The acceptance journal also stores the payload fingerprint, effective policy version, and replay sequence.

### Client-Provided Fields

`eventId`, Event Kind, optional bounded occurrence time, page context, approved attribution inputs, an optional reference to an existing Site-scoped Identified User, and bounded scalar properties. Collection never creates or updates an Identified User or Alias.

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| C1 | `collectEvent` | POST | `/collectEvent` | public | command |
| C2 | `collectEvents` | POST | `/collectEvents` | public | command |

## 4. Queries

This resource has no queries.

## 5. Commands

### C1: `POST /collectEvent` — `collectEvent`

**Audience:** Both

**Purpose:** Accept one telemetry Event for processing.

**Behavior:** Resolve Site from the Ingestion Identifier and validate the strict envelope. Enforce the Site and transient source-IP protection buckets, then check the Site-scoped Event ID and payload fingerprint. An exact duplicate returns 200 with the original Receipt Time before current policy is re-evaluated; a changed payload for the same ID returns `CONFLICT` without mutation. For a new Event, apply hard exclusions, bot policy, consent/opt-out, URL sanitization, and property validation before assigning Visitor or Session. Missing Occurrence Time uses Receipt Time. Occurrence times more than five minutes in the future or older than raw retention fail; accepted arrivals more than fifteen minutes behind Receipt Time are marked late and never normalized. A normalized Event and immutable acceptance metadata are appended to the durable local acceptance journal before returning 200 `accepted`. The analytics-store commit may occur asynchronously.

Pageviews emit once for initial document load and once per actual SPA route transition. Repeated route notifications are deduplicated; reloads create new pageviews. The optional `identifiedUserId` is reference-only: unknown IDs fail validation, and consent may strip the reference while retaining the base Event anonymously.

**Events Emitted:** None in MVP; the accepted Event is the analytics record itself.

**Errors:** `BAD_REQUEST` (400), `FORBIDDEN` (403 for generic collection-policy refusal), `NOT_FOUND` (404 for invalid Ingestion Identifier), `CONFLICT` (409 for an Event ID payload collision), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429), `SERVICE_UNAVAILABLE` (503 when the acceptance boundary is unavailable).

### C2: `POST /collectEvents` — `collectEvents`

**Audience:** Both

**Purpose:** Accept a bounded non-atomic batch of Events for one Site.

**Behavior:** Accept at most 100 Events and 256 KiB serialized for one Ingestion Identifier. Count each input Event against Site and transient source-IP protection buckets. Append accepted items independently to the durable acceptance journal and return 200 with a per-item result containing `accepted`, `duplicate`, `rejected`, or `itemError`. An interrupted batch is recovered by per-item journal sequence; callers may safely retry the same Event IDs. A malformed batch envelope, invalid Site, oversized batch, or unavailable acceptance boundary returns a top-level error instead of a partial success body.

**Errors:** `BAD_REQUEST` (400), `NOT_FOUND` (404), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429), `SERVICE_UNAVAILABLE` (503).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Event IDs are stable and deduplicated. | Ingestion boundary and deduplication store. | C1 |
| Event IDs remain unique for full raw-event retention; changed payloads conflict. | Ingestion boundary and deduplication store. | C1, C2 |
| Unknown fields, nested custom properties, arrays, reserved names, and oversize payloads fail. | Strict contract validation. | C1, C2 |
| Exclusions precede identity and Session assignment. | Ordered pipeline. | C1 |
| Server owns Session boundaries. | Session resolver. | C1 |
| Accepted-for-processing requires durable journal acceptance but is not analytics-store commit. | Acceptance journal and recovery pipeline. | C1, C2 |
| Occurrence Time is bounded; Receipt Time is always retained. | Timestamp validator. | C1, C2 |
| Rate protection uses Site and transient source-IP buckets; numeric thresholds are installation settings, not API quotas. | Ingestion guard. | C1, C2 |
| Identity deletion applies a durable redaction overlay without rewriting accepted Event sequence history. | Identity lifecycle and replay. | C1, C2 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `public` | Valid non-secret Ingestion Identifier plus the ingestion guard; no dashboard read authority. | C1, C2 |

## 8. Event Catalog

**Audience:** BE

| Event | Published By | Payload | Delivery |
| --- | --- | --- | --- |
| `analytics.event.accepted` | C1, C2 | Validated Event envelope | Accepted-for-processing pipeline |

## 9. Edge Cases

**Audience:** Both

- **Duplicate Event ID with changed payload** — Return `CONFLICT` without mutating the original Event; never accept two meanings for one ID.
- **Client clock outside the accepted range** — Reject future Occurrence Time beyond five minutes or historical Occurrence Time older than raw retention; never silently normalize it.
- **Late arrival** — Accept an in-retention Event whose Occurrence Time is more than fifteen minutes behind Receipt Time, mark it late, and use its occurrence for reporting placement.
- **Rotated Ingestion Identifier** — Return `NOT_FOUND`; never infer a Site from hostname or payload.
- **Storage pressure** — Explicitly reject new Events according to the operating envelope; never silently delete retained Events.
- **Opt-out before identity** — Do not create a Visitor or Session as a side effect of a rejected Event.
- **Policy changes after acceptance** — An exact duplicate returns `duplicate` from the stored acceptance record and does not re-run current policy.
- **Partial batch interruption** — Recover each journaled item by sequence and leave unjournaled items for caller retry.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `BAD_REQUEST` | 400 | Envelope, Event Kind, timestamp, or property validation fails. |
| `FORBIDDEN` | 403 | A valid Event is refused by the effective collection policy. |
| `NOT_FOUND` | 404 | Ingestion Identifier is invalid or revoked. |
| `CONFLICT` | 409 | An existing Event ID is reused with a changed payload. |
| `PAYLOAD_TOO_LARGE` | 413 | Bounded envelope or property size is exceeded. |
| `TOO_MANY_REQUESTS` | 429 | Ingestion rate limit is exceeded. |
| `SERVICE_UNAVAILABLE` | 503 | The local durable acceptance boundary is unavailable. |

## 11. Acceptance Scenarios

### C1: Singular acceptance

**Given** a valid new Event within the size and timestamp boundaries
**When** Site and source-IP protection permit it and the normalized Event is appended to the acceptance journal
**Then** return 200 `accepted` with its Event ID and Receipt Time

### C1: Exact retry

**Given** an accepted Event with the same Site, Event ID, and payload fingerprint
**When** the caller retries it, including after a policy change
**Then** return 200 `duplicate` with the original Receipt Time and do not create new identity or Session state

### C1: Policy refusal

**Given** a syntactically valid Event refused by the effective collection policy
**When** it reaches policy evaluation
**Then** return generic 403, do not append an accepted journal item, and do not create Visitor, Identified User, or Session state

### C2: Mixed batch

**Given** a valid one-Site batch within 100 Events and 256 KiB
**When** items produce mixed accepted, duplicate, policy, and validation outcomes
**Then** return 200 with independent per-item results and recover each accepted journal sequence independently

## 12. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `site` | Ingestion Identifier and Site scope. |
| `collection-policy` | Ordered exclusions and sanitization. |
| `identity-profile` | Explicit identity context and deletion policy. |
| `retention-policy` | Event lifecycle. |
| `backup-restore` | Durable acceptance-journal capture and recovery. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `traffic-report` | Pageview, Visitor, Session, and attribution data. |
| `event-report` | Standard Event kinds and properties. |
| `goal`, `funnel`, `cohort-retention` | Product behavior and identity context. |

## 13. Out of Scope

**Audience:** Both

- Native mobile SDK lifecycle and mobile-specific collection semantics.
- Broad autocapture, Session Replay, or arbitrary nested Event payloads.
- Exactly-once analytics-store materialization; acceptance is durable and projection remains asynchronous.
