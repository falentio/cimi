---
resource: event-report
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Event Report Resource

## 1. Overview & Lifecycle

**Audience:** Both

Event Report provides authenticated exploration and dedicated bounded reporting for the standard Event Kinds: `page_view`, `custom_event`, outbound, performance, and error. It never exposes an unrestricted raw warehouse query.

This resource is stateless and read-only.

## 2. Base Schema

**Audience:** Both

| Field                       | Schema                                          | Description                                                               |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `siteId`                    | `nanoid`                                        | Site scope.                                                               |
| `fromDate` / `toDate`       | `siteDate`                                      | Inclusive Site-local calendar range resolved through `reportingTimezone`. |
| `eventKind`                 | `eventKind`                                     | One of the standard kinds.                                                |
| `granularity`               | `granularity`                                   | Required for Q2 timeseries and bounded by the requested range.            |
| `filters`                   | `eventFilterAllowlist`                          | Typed event/name/property filters plus authenticated same-range action-presence filters. |
| `sort` / `offset` / `limit` | `querySort` / `nonNegativeInteger` / `pageSize` | Stable live event-list pages.                                             |

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure            | Method | Path                  | Auth          | CQRS  |
| --- | -------------------- | ------ | --------------------- | ------------- | ----- |
| Q1  | `getEventOverview`   | GET    | `/getEventOverview`   | authenticated | query |
| Q2  | `getEventTimeseries` | GET    | `/getEventTimeseries` | authenticated | query |
| Q3  | `listEvents`         | GET    | `/listEvents`         | authenticated | query |
| Q4  | `getEventBreakdowns` | GET    | `/getEventBreakdowns` | authenticated | query |

## 4. Queries

### Q1: `GET /getEventOverview` — `getEventOverview`

**Audience:** Both

**Purpose:** Report counts and unique Session/Visitor context by standard Event Kind.

**Behavior:** Enforce typed Event-scope filters over the allowlisted Event fields and bounded `property.*` fields. String fields accept strings (and explicit null equality where the Event field is nullable); `contains` accepts strings, numeric comparisons accept finite numbers, and boolean/null property values are not coerced to strings. Authenticated Session filters may use `has_done` or `has_not_done` with a discriminated action and `range: same_range`; Public Query does not inherit these operators. Place accepted Events by validated Occurrence Time; Receipt Time is used only for acceptance ordering. Return the current period and, when requested, an adjacent equal-length comparison period with separate `current`/`stale` freshness metadata, projected acceptance sequence, and occurrence-time coverage. Effective Retention must cover both periods; a relevant or unbounded Projection Gap, stale statistics, or over-budget work returns `QUERY_LIMIT_EXCEEDED` before cache or execution. A non-ready analytics store returns generic `SERVICE_UNAVAILABLE` (503) before cache or execution. Do not expose raw IP, hidden identity keys, sensitive query strings, or unapproved error/message/stack fields.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503). An absent or inaccessible Site is indistinguishable from an unknown Site and never returns `FORBIDDEN`.

### Q2: `GET /getEventTimeseries` — `getEventTimeseries`

**Audience:** Both

**Purpose:** Return bounded time buckets for Event counts and selected standard dimensions.

**Behavior:** Bucket size must be valid for the requested range. Minute, hour, day, week, month, and year reports are independently limited to 1,800, 720, 366, 104, 36, and 10 buckets. Empty buckets are returned with zero values. An over-bounded range or response is rejected during admission rather than clamped, widened, or coarsened. The current period and optional adjacent equal-length comparison are returned separately, each with freshness metadata. Effective Retention, Projection Gap, Fact-Work, and analytics-store readiness gates run before cache or execution. A missing or invalid time range fails rather than widening the query.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503). An absent or inaccessible Site is indistinguishable from an unknown Site and never returns `FORBIDDEN`.

### Q3: `GET /listEvents` — `listEvents`

**Audience:** Both

**Purpose:** Explore accepted Events for debugging and product behavior analysis.

**Behavior:** Use zero-based live offset pagination sorted only by validated Occurrence Time with Event ID as the final tie-breaker. Receipt Time (`createdAt`) and Event `kind` are not reporting sort modes. Return `nextOffset`, `hasMore`, and `totalCount`; concurrent ingestion may shift later pages. Return only bounded typed fields. Duplicate Event IDs appear once. The list has no comparison input and rejects one if supplied. Place Events by validated Occurrence Time while retaining Receipt Time only for acceptance ordering. Effective Retention, relevant/unbounded Projection Gap, Fact-Work, and analytics-store readiness gates run before cache or execution; successful pages expose `current` or `stale` freshness metadata.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503). An absent or inaccessible Site is indistinguishable from an unknown Site and never returns `FORBIDDEN`.

### Q4: `GET /getEventBreakdowns` — `getEventBreakdowns`

**Audience:** Both

**Purpose:** Provide dedicated bounded reports for pageview, custom, outbound, performance, and error dimensions.

**Behavior:** Event-kind-specific fields are selected by the server allowlist. Breakdown values preserve the source Event dimension bound of 2,048 characters. Use zero-based live offset pagination with `nextOffset`, `hasMore`, `totalCount`, an allowlisted `sort`/`direction`, and a stable dimension-value tie-breaker after sorting; concurrent ingestion may shift later pages. Return the current and optional adjacent equal-length comparison periods separately with per-period freshness metadata. Error messages, stack traces, URLs, and properties are sanitized at collection and redacted again at query output where required. Projection Gap, retention, Fact-Work, and analytics-store readiness gates run before cache or execution.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503). An absent or inaccessible Site is indistinguishable from an unknown Site and never returns `FORBIDDEN`.

## 5. Commands

This resource has no commands.

## 6. Business Rules

| Rule                                                          | Enforcement Point            | Affected Procedures |
| ------------------------------------------------------------- | ---------------------------- | ------------------- |
| Standard Event Kinds share one envelope and privacy boundary. | Ingestion and query schemas. | Q1-Q4               |
| Nested properties and arbitrary fields are never queryable.   | Strict field allowlist.      | Q1-Q4               |
| Public Query does not reuse raw Event exploration.            | Separate procedure contract. | Q1-Q4               |

## 7. Authorization Matrix

| Auth Level      | Meaning                                        | Procedures |
| --------------- | ---------------------------------------------- | ---------- |
| `authenticated` | Current member with persisted Site read scope. | Q1-Q4      |

## 8. Event Catalog

**Audience:** BE

No events are emitted by read-only reports.

## 9. Edge Cases

**Audience:** Both

- **Duplicate Event ID** — Report once according to the accepted Event record.
- **Same `occurredAt` values** — Event ID tie-breaker makes offset ordering deterministic, while later pages may still shift under live ingestion.
- **Late Event** — Place and report the Event by validated Occurrence Time; Receipt Time remains acceptance ordering only.
- **Deleted profile** — Remove profile fields from output and recompute affected aggregates.
- **Unsupported specialized field** — Return `BAD_REQUEST`; do not silently ignore the filter.

## 10. Error Code Catalog

| Code                   | HTTP | Trigger                                                    |
| ---------------------- | ---: | ---------------------------------------------------------- |
| `NOT_FOUND`            |  404 | Site is missing or inaccessible; the two cases are indistinguishable. |
| `BAD_REQUEST`          |  400 | Invalid Event Kind, range, filter, sort, offset, or limit. |
| `QUERY_LIMIT_EXCEEDED` |  422 | Effective Retention is incomplete, preflight statistics are stale or uncertain, a relevant/unbounded Projection Gap exists, or bounded query budget would be exceeded. |
| `SERVICE_UNAVAILABLE`  |  503 | Analytics store is not ready to serve the query.           |

## 11. Related Resources & Dependencies

### Depends On

| Resource           | Integration Point                  |
| ------------------ | ---------------------------------- |
| `event-ingestion`  | Accepted Event envelope.           |
| `identity-profile` | Profile fields and deletion state. |
| `site`             | Authorization scope.               |

### Used By

| Resource                               | Integration Point         |
| -------------------------------------- | ------------------------- |
| `goal` / `funnel` / `cohort-retention` | Standard action matching. |

## 12. Out of Scope

**Audience:** Both

- Arbitrary Event fields, nested property queries, raw warehouse SQL, or unsanitized diagnostics.
- Public Event-row access; Public Query has a separate aggregate catalog.
- Session Replay, raw IP, and hidden identity-field exploration.
