---
resource: event-ingestion
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Event Ingestion Resource

## 1. Overview & Lifecycle

**Audience:** Both

Event Ingestion accepts one immutable typed Event for a Site selected by its non-secret Ingestion Identifier. It is the shared path for browser pageviews and server-side product events; it is not a REST resource CRUD API.

An accepted Event is `accepted`, `duplicate`, or `rejected`. Accepted means accepted for processing, not a durable analytics-store commit.

## 2. Base Schema

**Audience:** Both

The shared Event envelope is defined by the Event, Event ID, Event Kind, Occurrence Time, Receipt Time, Attribution, Visitor, Identified User, and Analytics Session glossary terms. Kind-specific fields are bounded for `page_view`, `custom_event`, outbound, performance, and error.

### Server-Generated Fields

`receiptTime`, effective Site, Visitor/Anonymous Identity, Analytics Session, acceptance status, and rejection reason are server-controlled.

### Client-Provided Fields

`eventId`, Event Kind, optional bounded occurrence time, page context, approved attribution inputs, optional identity context, and bounded scalar properties.

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| C1 | `collectEvent` | POST | `/collectEvent` | public | command |

## 4. Queries

This resource has no queries.

## 5. Commands

### C1: `POST /collectEvent` — `collectEvent`

**Audience:** Both

**Purpose:** Accept one telemetry Event for processing.

**Behavior:** Resolve Site from the Ingestion Identifier. Apply hard exclusions, bot policy, consent/opt-out, URL sanitization, and property validation before assigning Visitor or Session. Validate the Event ID and deduplicate within the configured window. Store server Receipt Time and bounded client Occurrence Time; mark late events explicitly. Return 202 for a newly accepted Event and a successful duplicate result for a previously accepted Event. No ordinary command idempotency key is required because `eventId` is the Event deduplication key.

Pageviews emit once for initial document load and once per actual SPA route transition. Repeated route notifications are deduplicated; reloads create new pageviews.

**Events Emitted:** None in MVP; the accepted Event is the analytics record itself.

**Errors:** `BAD_REQUEST` (400), `NOT_FOUND` (404 for invalid Ingestion Identifier), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429), `INTERNAL_SERVER_ERROR` (500 only for an unavailable acceptance boundary).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Event IDs are stable and deduplicated. | Ingestion boundary and deduplication store. | C1 |
| Unknown fields, nested custom properties, arrays, reserved names, and oversize payloads fail. | Strict contract validation. | C1 |
| Exclusions precede identity and Session assignment. | Ordered pipeline. | C1 |
| Server owns Session boundaries. | Session resolver. | C1 |
| Accepted-for-processing is not durable commit. | Response contract and recovery pipeline. | C1 |
| Occurrence Time is bounded; Receipt Time is always retained. | Timestamp validator. | C1 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `public` | Valid non-secret Ingestion Identifier plus the ingestion guard; no dashboard read authority. | C1 |

## 8. Event Catalog

**Audience:** BE

| Event | Published By | Payload | Delivery |
| --- | --- | --- | --- |
| `analytics.event.accepted` | C1 | Validated Event envelope | Accepted-for-processing pipeline |

## 9. Edge Cases

**Audience:** Both

- **Duplicate Event ID with changed payload** — Return a conflict or duplicate result without mutating the original Event; never accept two meanings for one ID.
- **Client clock outside the skew window** — Retain Receipt Time, reject or normalize Occurrence Time according to the timestamp policy, and identify the Event as late/invalid.
- **Rotated Ingestion Identifier** — Return `NOT_FOUND`; never infer a Site from hostname or payload.
- **Storage pressure** — Explicitly reject new Events according to the operating envelope; never silently delete retained Events.
- **Opt-out before identity** — Do not create a Visitor or Session as a side effect of a rejected Event.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `BAD_REQUEST` | 400 | Envelope, Event Kind, timestamp, or property validation fails. |
| `NOT_FOUND` | 404 | Ingestion Identifier is invalid or revoked. |
| `PAYLOAD_TOO_LARGE` | 413 | Bounded envelope or property size is exceeded. |
| `TOO_MANY_REQUESTS` | 429 | Ingestion rate limit is exceeded. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `site` | Ingestion Identifier and Site scope. |
| `collection-policy` | Ordered exclusions and sanitization. |
| `identity-profile` | Explicit identity context and deletion policy. |
| `retention-policy` | Event lifecycle. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `traffic-report` | Pageview, Visitor, Session, and attribution data. |
| `event-report` | Standard Event kinds and properties. |
| `goal`, `funnel`, `cohort-retention` | Product behavior and identity context. |
