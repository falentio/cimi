---
resource: event-report
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Event Report Resource

## 1. Overview & Lifecycle

**Audience:** Both

Event Report provides authenticated exploration and dedicated bounded reporting for the standard Event Kinds: `page_view`, `custom_event`, outbound, performance, and error. It never exposes an unrestricted raw warehouse query.

This resource is stateless and read-only.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `siteId` | `nanoid` | Site scope. |
| `from` / `to` | `utcInstant` | Half-open query interval. |
| `eventKind` | `eventKind` | One of the standard kinds. |
| `filters` | `eventFilterAllowlist` | Typed event/name/property filters. |
| `sort` / `cursor` | `querySort` / `opaqueCursor` | Stable event list continuation. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getEventOverview` | GET | `/getEventOverview` | authenticated | query |
| Q2 | `getEventTimeseries` | GET | `/getEventTimeseries` | authenticated | query |
| Q3 | `listEvents` | GET | `/listEvents` | authenticated | query |
| Q4 | `getEventBreakdowns` | GET | `/getEventBreakdowns` | authenticated | query |

## 4. Queries

### Q1: `GET /getEventOverview` — `getEventOverview`

**Audience:** Both

**Purpose:** Report counts and unique Session/Visitor context by standard Event Kind.

**Behavior:** Enforce typed event-kind and property filters. Do not expose raw IP, hidden identity keys, sensitive query strings, or unapproved error/message/stack fields.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422).

### Q2: `GET /getEventTimeseries` — `getEventTimeseries`

**Audience:** Both

**Purpose:** Return bounded time buckets for Event counts and selected standard dimensions.

**Behavior:** Bucket size must be valid for the requested range. Empty buckets are returned with zero values. A missing or invalid time range fails rather than widening the query.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422).

### Q3: `GET /listEvents` — `listEvents`

**Audience:** Both

**Purpose:** Explore accepted Events for debugging and product behavior analysis.

**Behavior:** Use opaque cursor pagination sorted by `createdAt` descending with Event ID tie-breaker. The cursor is bound to Site, time, kind, filters, and sort. Return only bounded typed fields. Duplicate Event IDs appear once.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422).

### Q4: `GET /getEventBreakdowns` — `getEventBreakdowns`

**Audience:** Both

**Purpose:** Provide dedicated bounded reports for pageview, custom, outbound, performance, and error dimensions.

**Behavior:** Event-kind-specific fields are selected by the server allowlist. Error messages, stack traces, URLs, and properties are sanitized at collection and redacted again at query output where required.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422).

## 5. Commands

This resource has no commands.

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Standard Event Kinds share one envelope and privacy boundary. | Ingestion and query schemas. | Q1-Q4 |
| Nested properties and arbitrary fields are never queryable. | Strict field allowlist. | Q1-Q4 |
| Public Query does not reuse raw Event exploration. | Separate procedure contract. | Q1-Q4 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `authenticated` | Current member with persisted Site read scope. | Q1-Q4 |

## 8. Event Catalog

**Audience:** BE

No events are emitted by read-only reports.

## 9. Edge Cases

**Audience:** Both

- **Duplicate Event ID** — Report once according to the accepted Event record.
- **Same `createdAt` values** — Event ID tie-breaker makes cursor traversal complete and deterministic.
- **Deleted profile** — Remove profile fields from output and recompute affected aggregates.
- **Unsupported specialized field** — Return `BAD_REQUEST`; do not silently ignore the filter.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `FORBIDDEN` | 403 | Caller lacks persisted Site scope. |
| `NOT_FOUND` | 404 | Site is inaccessible. |
| `BAD_REQUEST` | 400 | Invalid Event Kind, range, filter, sort, or cursor. |
| `QUERY_LIMIT_EXCEEDED` | 422 | Bounded query budget would be exceeded. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `event-ingestion` | Accepted Event envelope. |
| `identity-profile` | Profile fields and deletion state. |
| `site` | Authorization scope. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `goal` / `funnel` / `cohort-retention` | Standard action matching. |
