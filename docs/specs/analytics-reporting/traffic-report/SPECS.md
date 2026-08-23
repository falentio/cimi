---
resource: traffic-report
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Traffic Report Resource

## 1. Overview & Lifecycle

**Audience:** Both

Traffic Report is the authenticated aggregate view of website traffic and session behavior. It consumes accepted pageviews, Visitor/Session resolution, session-entry attribution, and approved coarse dimensions.

This resource is stateless. It never mutates Events, identity, or Session boundaries.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `siteId` | `nanoid` | Site scope. |
| `fromDate` / `toDate` | `siteDate` | Inclusive Site-local calendar range resolved through `reportingTimezone`. |
| `granularity` | `trafficGranularity` | Procedure-specific bucket valid for the range. |
| `filters` | `trafficFilterPredicate` | Bounded JSON predicates with explicit scope. |
| `sort` / `offset` / `limit` | `querySort` / `nonNegativeInteger` / `pageSize` | Used by live breakdown pages. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getTrafficOverview` | GET | `/getTrafficOverview` | authenticated | query |
| Q2 | `getTrafficBreakdowns` | GET | `/getTrafficBreakdowns` | authenticated | query |

## 4. Queries

### Q1: `GET /getTrafficOverview` — `getTrafficOverview`

**Audience:** Both

**Purpose:** Provide Visitors, Sessions, pageviews, bounce rate, pages per Session, duration, and trend buckets.

**Behavior:** Require persisted Site scope. Resolve the inclusive Site-local date range through the Site Reporting Timezone, use server-derived Session boundaries and Session-entry attribution, and fill every requested bucket with zero values. Minute trends use one inclusive Site-local calendar date and return at most 1,800 buckets. Current partial buckets carry `complete: false`; analytical reports may include an explicit previous-period comparison. Invalid or absent date ranges never become all-time queries.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422).

### Q2: `GET /getTrafficBreakdowns` — `getTrafficBreakdowns`

**Audience:** Both

**Purpose:** Return bounded breakdowns for pages, entry/exit pages, referrer/channels/UTM, device, browser, OS, and coarse geography.

**Behavior:** Use zero-based live offset pages with an allowlisted sort and a canonical dimension-value tie-breaker. Return `nextOffset`, `hasMore`, and `totalCount`; concurrent ingestion may shift later pages. Different filters combine with AND; repeated values combine with OR. Profile filters may use approved trait keys for authenticated reports, but trait values and identity fields are not returned as dimensions.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422).

## 5. Commands

This resource has no commands.

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Site scope is checked against persisted membership. | Authorization guard. | Q1-Q2 |
| Session metrics use server-authoritative Sessions. | Query procedure. | Q1-Q2 |
| Public disclosure is not inherited from this resource. | Separate Public Query. | Q1-Q2 |
| Query bounds and filters are explicit. | Contract and query planner. | Q1-Q2 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `authenticated` | Current member with persisted Site read scope. | Q1-Q2 |

## 8. Event Catalog

**Audience:** BE

No events are emitted by read-only reports.

## 9. Edge Cases

**Audience:** Both

- **No events in range** — Return zero metrics and empty breakdown rows, not an error.
- **Late Event** — Use its validated Occurrence Time for reporting and Receipt Time for ingest ordering according to the event-time contract.
- **Deleted identity data** — Exclude invalidated profile data and recompute affected aggregates as deletion completes.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `FORBIDDEN` | 403 | Caller lacks persisted Site scope. |
| `NOT_FOUND` | 404 | Site is inaccessible. |
| `BAD_REQUEST` | 400 | Invalid date, granularity, filter, sort, offset, or limit. |
| `QUERY_LIMIT_EXCEEDED` | 422 | Bounded execution budget would be exceeded. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `site` | Scope and ownership. |
| `event-ingestion` | Pageviews and accepted Event data. |
| `collection-policy` | Stored dimensions and exclusions. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `public-dashboard` | Separate aggregate disclosure contract. |
| Frontend dashboard | Authenticated traffic analysis. |

## 12. Out of Scope

**Audience:** Both

- Public access; aggregate public disclosure belongs to `public-dashboard`.
- Arbitrary SQL, custom dashboard expressions, or unrestricted warehouse access.
- Live visitor feeds and real-time operator telemetry.
