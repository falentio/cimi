---
resource: traffic-report
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Traffic Report Resource

## 1. Overview & Lifecycle

**Audience:** Both

Traffic Report is the authenticated aggregate view of website traffic and session behavior. It consumes accepted pageviews, Visitor/Session resolution, session-entry attribution, and approved coarse dimensions.

This resource is stateless. It never mutates Events, identity, or Session boundaries.

## 2. Base Schema

**Audience:** Both

| Field                       | Schema                                          | Description                                                               |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `siteId`                    | `SId`                                           | Site scope.                                                               |
| `fromDate` / `toDate`       | `SDate`                                         | Inclusive Site-local calendar range resolved through `reportingTimezone`. |
| `granularity`               | `trafficGranularity`                            | Procedure-specific bucket valid for the range.                            |
| `filters`                   | `SScopedQueryFilter[]`                          | Bounded predicates with explicit scope.                                   |
| `dimension`                 | `trafficDimension`                              | Required breakdown dimension for Q2.                                      |
| `sort` / `offset` / `limit` | `querySort` / `nonNegativeInteger` / `pageSize` | Used by live breakdown pages.                                             |

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure              | Method | Path                    | Auth          | CQRS  |
| --- | ---------------------- | ------ | ----------------------- | ------------- | ----- |
| Q1  | `getTrafficOverview`   | GET    | `/traffic-report/getTrafficOverview`   | authenticated | query |
| Q2  | `getTrafficBreakdowns` | GET    | `/traffic-report/getTrafficBreakdowns` | authenticated | query |

## 4. Queries

### Q1: `GET /traffic-report/getTrafficOverview` — `getTrafficOverview`

**Audience:** Both

**Purpose:** Provide Visitors, Sessions, pageviews, bounce rate, pages per Session, duration, and trend buckets.

**Behavior:** Require persisted Site scope. Resolve the inclusive Site-local date range through the Site Reporting Timezone and explicit Week Start, use server-derived Session boundaries and Session-entry attribution, and fill every requested bucket with zero values. The report exposes `visitors`, `sessions`, `pageviews`, `bounce_rate`, `pages_per_session`, and `average_session_duration_seconds` using the canonical metric grains and formulas; bounce requires exactly one accepted `page_view`, no `custom_event` or `outbound` engagement, and a full Session occurrence span under 10 seconds, with `identify` excluded as engagement. Each trend point is named and carries its metric grain, unit, and denominator; rate and duration metrics use `eligibleSessions` and `sessionsWithValidDuration` respectively. Minute, hour, day, week, month, and year requests use independent bucket limits of 1,800, 720, 366, 104, 36, and 10. Invalid or over-bounded ranges are rejected during admission rather than clamped or coarsened. Effective Retention must cover every requested dependency across the current and optional adjacent equal-length comparison windows; unavailable history returns `QUERY_LIMIT_EXCEEDED`. Preflight rejects stale statistics, a relevant or unbounded Projection Gap, or over-budget work with `QUERY_LIMIT_EXCEEDED` before cache or execution. A non-ready analytics store returns generic `SERVICE_UNAVAILABLE` (503) before cache or execution. Each returned period, including an optional comparison period, exposes `freshness` with only `current` or `stale`, projected acceptance sequence, and occurrence-time coverage; current partial buckets may still carry `complete: false`.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503). An absent or inaccessible Site is indistinguishable from an unknown Site and never returns `FORBIDDEN`.

### Q2: `GET /traffic-report/getTrafficBreakdowns` — `getTrafficBreakdowns`

**Audience:** Both

**Purpose:** Return bounded breakdowns for pages, entry/exit pages, referrer/channels/UTM, device, browser, OS, and coarse geography.

**Behavior:** Require the declared allowlisted `dimension`. Rows use the fixed `sessions` metric at Analytics Session grain; `percentage` is computed against the filtered pre-pagination total, which is also returned as `denominator`. Use zero-based live offset pages with an allowlisted sort and a canonical dimension-value tie-breaker. Return `nextOffset`, `hasMore`, and `totalCount`; concurrent ingestion may shift later pages. Different filters combine with AND; repeated values combine with OR. Profile filters may use approved trait keys for authenticated reports, but trait values and identity fields are not returned as dimensions. An optional comparison uses an adjacent equal-length Site-local range and is returned separately with its own freshness metadata. Effective Retention, Projection Gap, Fact-Work, and analytics-store readiness gates run before cache or execution with the same `QUERY_LIMIT_EXCEEDED` or generic `SERVICE_UNAVAILABLE` behavior as Q1.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503). An absent or inaccessible Site is indistinguishable from an unknown Site and never returns `FORBIDDEN`.

## 5. Commands

This resource has no commands.

## 6. Business Rules

| Rule                                                   | Enforcement Point           | Affected Procedures |
| ------------------------------------------------------ | --------------------------- | ------------------- |
| Site scope is checked against persisted membership.    | Authorization guard.        | Q1-Q2               |
| Session metrics use server-authoritative Sessions.     | Query procedure.            | Q1-Q2               |
| Public disclosure is not inherited from this resource. | Separate Public Query.      | Q1-Q2               |
| Query bounds and filters are explicit.                 | Contract and query planner. | Q1-Q2               |

## 7. Authorization Matrix

| Auth Level      | Meaning                                        | Procedures |
| --------------- | ---------------------------------------------- | ---------- |
| `authenticated` | Current member with persisted Site read scope. | Q1-Q2      |

## 8. Event Catalog

**Audience:** BE

No events are emitted by read-only reports.

## 9. Edge Cases

**Audience:** Both

- **No events in range** — Return zero metrics and empty breakdown rows, not an error.
- **Late Event** — Use its validated Occurrence Time for reporting and Receipt Time for ingest ordering according to the event-time contract.
- **Deleted identity data** — Exclude invalidated profile data and recompute affected aggregates as deletion completes.

## 10. Error Code Catalog

| Code                   | HTTP | Trigger                                                    |
| ---------------------- | ---: | ---------------------------------------------------------- |
| `NOT_FOUND`            |  404 | Site is missing or inaccessible; the two cases are indistinguishable. |
| `BAD_REQUEST`          |  400 | Invalid date, granularity, filter, sort, offset, or limit. |
| `QUERY_LIMIT_EXCEEDED` |  422 | Effective Retention is incomplete, preflight statistics are stale or uncertain, a relevant/unbounded Projection Gap exists, or bounded execution budget would be exceeded. |
| `SERVICE_UNAVAILABLE`  |  503 | Analytics store is not ready to serve the report.          |

## 11. Related Resources & Dependencies

### Depends On

| Resource            | Integration Point                  |
| ------------------- | ---------------------------------- |
| `site`              | Scope and ownership.               |
| `event-ingestion`   | Pageviews and accepted Event data. |
| `collection-policy` | Stored dimensions and exclusions.  |

### Used By

| Resource           | Integration Point                       |
| ------------------ | --------------------------------------- |
| `public-dashboard` | Separate aggregate disclosure contract. |
| Frontend dashboard | Authenticated traffic analysis.         |

## 12. Out of Scope

**Audience:** Both

- Public access; aggregate public disclosure belongs to `public-dashboard`.
- Arbitrary SQL, custom dashboard expressions, or unrestricted warehouse access.
- Live visitor feeds and real-time operator telemetry.
