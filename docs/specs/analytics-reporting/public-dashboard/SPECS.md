---
resource: public-dashboard
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Public Dashboard Resource

## 1. Overview & Lifecycle

**Audience:** Both

Public Dashboard is the one reporting resource that owns Site-wide public configuration and its dedicated aggregate Public Query. It is not an authenticated analytics query with authorization removed.

```text
disabled -> enabled
enabled -> disabled
enabled -> enabled (identifier rotation)
```

The open URL contains a random Public Dashboard Identifier, not a key. Disabling fails closed; re-enabling rotates the identifier.

## 2. Base Schema

**Audience:** Both

| Field                       | Schema                   | Description                                         |
| --------------------------- | ------------------------ | --------------------------------------------------- |
| `siteId`                    | `nanoid`                 | Site scope.                                         |
| `enabled`                   | `boolean`                | Whether the public URL currently resolves.          |
| `publicDashboardIdentifier` | `randomPublicIdentifier` | Public URL selector, never a management credential. |
| `updatedAt`                 | `coercedDate`            | Configuration timestamp.                            |

Public Query output contains only approved aggregate metric/dimension values and suppression-safe empty results.

Time buckets carry an offset-qualified local `key`, a required absolute UTC
`at` instant, and a nullable suppressed `value`. Non-time dimension rows use a
separate shape with `at: null`; they never represent a missing time instant.
Dimension keys preserve the source canonical bound of 2,048 characters.

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure                         | Method | Path                               | Auth   | CQRS    |
| --- | --------------------------------- | ------ | ---------------------------------- | ------ | ------- |
| Q1  | `getPublicDashboardConfig`        | GET    | `/getPublicDashboardConfig`        | admin  | query   |
| Q2  | `queryPublicDashboard`            | GET    | `/queryPublicDashboard`            | public | query   |
| C1  | `enablePublicDashboard`           | POST   | `/enablePublicDashboard`           | admin  | command |
| C2  | `disablePublicDashboard`          | POST   | `/disablePublicDashboard`          | admin  | command |
| C3  | `rotatePublicDashboardIdentifier` | POST   | `/rotatePublicDashboardIdentifier` | admin  | command |

## 4. Queries

### Q1: `GET /getPublicDashboardConfig` — `getPublicDashboardConfig`

**Audience:** Both

**Purpose:** Return current public status and identifier metadata to Site administrators.

**Behavior:** Never return management credentials or private query configuration. The public identifier may be shown to an authorized administrator because it is intentionally shareable.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

### Q2: `GET /queryPublicDashboard` — `queryPublicDashboard`

**Audience:** Both

**Purpose:** Return approved aggregate analytics for an open public dashboard URL.

**Behavior:** Resolve only the current Public Dashboard Identifier for an active Site. A `deleting`, `deleted`, `recovering`, or `purged` Site fails closed with `NOT_FOUND` before identifier handling, cache, or analytics execution; Site deletion suspends public requests without counting as a Public Dashboard disable, so recovery restores the prior configuration and identifier. Enforce one-hour granularity, a maximum 90-day inclusive Site-local date range further bounded by Effective Retention, and at most 2,161 actual hourly interval starts after resolving the half-open interval in the Site Reporting Timezone. Spring-forward nonexistent hours produce no bucket; fall-back repeated hours produce distinct buckets with offset-qualified local keys and absolute UTC `at` values. Derive and validate this bucket count in server preflight before cache or execution; return `BAD_REQUEST` when it exceeds the ceiling and never clamp the requested range. Also enforce approved metrics/dimensions/filters, the shared aggregate Fact-Work budget, and `k=5` suppression. The approved identity boundary permits only coarse Identity-Kind Segmentation: the `identityKind` filter accepts `equals` with `anonymous` or `identified`, and `identity_kind` is an aggregate returned dimension. It never selects an individual Visitor, Identified User, profile, or identity ID. Reject the full request when retention or preflight cost cannot cover the requested range; do not return partial history. Suppressed or empty results use the normal response shape with no explanation of the underlying cohort size; suppression applies independently to each identity segment and the total. Analytics-store readiness is checked before serving the five-minute cache; a non-ready store returns generic `SERVICE_UNAVAILABLE` (503). Cache entries use the complete query inputs, including identity filters and dimensions. Apply 360 requests per Site per minute and 600 requests per IP per minute; return `429` with `Retry-After` when exceeded.
Dimension results have a separate 100-row budget. This budget is checked
independently from the 2,161 hourly interval-start bound and returns
`QUERY_LIMIT_EXCEEDED` before cache or execution when the dimension result
cannot be admitted; it never truncates or repurposes hourly buckets.

The approved first-release catalog is intentionally finite: metrics are `visitors`, `sessions`, `pageviews`, `events`, and `bounce_rate`; dimensions are `time`, `page`, `referrer`, `utm`, `device`, `browser`, `os`, `country`, `region`, `city`, `event_name`, and `identity_kind`. Public filters may select only approved aggregate Event and Session fields, including the bounded UTM, country, region, and city fields, plus `visitor.identityKind` with the fixed values `anonymous` and `identified`; profile filters and individual identity selection are never public. Filters combine using the existing AND-across-filters and OR-within-one-field rules.

The public filter allowlist excludes raw IP, raw or unbounded properties, sensitive URL and query-string values, error diagnostics and stack traces, identity IDs, profile fields, and Session selectors. The `identityKind` filter is the only Visitor-scope filter. Public Query has no comparison input; strict validation rejects comparison fields. A successful query exposes only `current` or `stale` freshness with projected acceptance sequence and occurrence-time coverage, and a relevant or unbounded Projection Gap is rejected with `QUERY_LIMIT_EXCEEDED` before cache or execution. Suppression is based on distinct Visitors and applies independently to every filtered result, time bucket, identity segment, and narrowed total; no cohort size or suppression reason is returned.

The two public rate limits return `429` with `Retry-After` and the following
adapter response metadata: `X-RateLimit-Scope` (`site` or `ip`),
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` epoch
seconds. The typed adapter contract requires all header values to be present
on both Site and IP limit paths. No separate concurrency limiter is part of
this contract; bounded query work and the five-minute cache are the execution
controls.

**Errors:** `NOT_FOUND` (404 for disabled/rotated/unknown identifier), `BAD_REQUEST` (400), `TOO_MANY_REQUESTS` (429), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503).

## 5. Commands

### C1: `POST /enablePublicDashboard` — `enablePublicDashboard`

**Audience:** Both

**Purpose:** Enable public aggregate access.

**Behavior:** Rotate the Public Dashboard Identifier on every enable, including re-enable. Return the new public identifier to the authorized administrator. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409).

### C2: `POST /disablePublicDashboard` — `disablePublicDashboard`

**Audience:** Both

**Purpose:** Disable public access and invalidate the current identifier.

**Behavior:** Fail closed after committed configuration change. Cached responses cannot authorize new queries after the cutoff. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

### C3: `POST /rotatePublicDashboardIdentifier` — `rotatePublicDashboardIdentifier`

**Audience:** Both

**Purpose:** Revoke an exposed public URL while keeping public access enabled.

**Behavior:** Atomically invalidate the old identifier and issue one new random identifier. Return it only to the authorized administrator. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409).

## 6. Business Rules

| Rule                                                                          | Enforcement Point             | Affected Procedures |
| ----------------------------------------------------------------------------- | ----------------------------- | ------------------- |
| Public identifier is a bearer capability, not a secret.                       | URL and disclosure model.     | Q2, C1-C3           |
| Public Query is a separate aggregate procedure.                               | Contract and query planner.   | Q2                  |
| Suppression applies to every returned cohort result.                          | Public query result boundary. | Q2                  |
| Public access never grants Site management or authenticated analytics scope.  | Auth routing.                 | Q2                  |
| Revocation is fail-closed; cached copies are not remotely erased.             | Config and cache policy.      | C2-C3               |
| Site deletion suspends Public Query without rotating its retained identifier. | Site lifecycle admission.     | Q2                  |

## 7. Authorization Matrix

| Auth Level | Meaning                                                            | Procedures |
| ---------- | ------------------------------------------------------------------ | ---------- |
| `admin`    | Site Owner or Administrator.                                       | Q1, C1-C3  |
| `public`   | No authentication; valid current Public Dashboard Identifier only. | Q2         |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Old link after disable or rotation** — Return `NOT_FOUND`; do not reveal whether the identifier existed.
- **Site deletion or recovery** — Return `NOT_FOUND` for every public request while the Site is `deleting`, `deleted`, `recovering`, or `purged`; recovery restores the prior public configuration and identifier because Site deletion is not equivalent to `disablePublicDashboard`.
- **Suppressed cohort** — Return the normal aggregate shape with empty/suppressed values; do not disclose the reason or count.
- **Public query attempts raw or profile filter** — Reject with `BAD_REQUEST`, not a private result. The only Visitor-scope filter is the fixed coarse `identityKind` equality filter.
- **DST spring-forward** — Omit the nonexistent local hour; do not synthesize a bucket for a wall-clock time that has no instant.
- **DST fall-back** — Keep both elapsed-hour buckets with distinct offset-qualified keys and absolute UTC `at` values.
- **Derived bucket count above 2,161** — Return `BAD_REQUEST` during server preflight before cache or execution; do not clamp the date range.
- **Dimension result rows** — Apply the separate 100-row budget to non-time dimension output; the 2,161 limit applies only to resolved hourly interval starts.
- **Identity segment below k=5** — Omit or null the affected segment using the normal suppression-safe response shape; do not return a suppression marker or cohort size.
- **Cache after revocation** — Cache may retain a previously delivered response, but no new request is authorized and no management read treats the cache as live access.
- **Public URL indexing** — Emit permanent `noindex,nofollow` and do not publish a sitemap entry; assume a shared URL can still leak.

## 10. Error Code Catalog

| Code                   | HTTP | Trigger                                                                                                     |
| ---------------------- | ---: | ----------------------------------------------------------------------------------------------------------- |
| `NOT_FOUND`            |  404 | Identifier is unknown, rotated, or disabled.                                                                |
| `BAD_REQUEST`          |  400 | Range, derived hourly bucket count, granularity, metric, dimension, or filter is not in the public catalog. |
| `TOO_MANY_REQUESTS`    |  429 | Site/IP rate limit exceeded; include `Retry-After`, `X-RateLimit-Scope`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. |
| `QUERY_LIMIT_EXCEEDED` |  422 | Effective Retention is incomplete, preflight statistics are stale or uncertain, a relevant/unbounded Projection Gap exists, or Public Query exceeds bounded execution. |
| `SERVICE_UNAVAILABLE`  |  503 | Analytics store is not ready to serve the public query.                                                     |

## 11. Related Resources & Dependencies

### Depends On

| Resource                          | Integration Point                                             |
| --------------------------------- | ------------------------------------------------------------- |
| `site`                            | Ownership, identifier, and lifecycle.                         |
| `traffic-report` / `event-report` | Approved aggregate source concepts, never direct route reuse. |
| `collection-policy`               | Sensitive data and field exclusions.                          |

### Used By

| Resource                  | Integration Point    |
| ------------------------- | -------------------- |
| Public dashboard frontend | Open aggregate view. |

## 12. Out of Scope

**Audience:** Both

- Private recipient sharing, viewer credentials, or per-recipient access lists.
- Authenticated analytics passthrough, raw rows, individual identity/profile filters other than coarse `visitor.identityKind`, or arbitrary SQL.
- CSV/JSON/PDF exports, GSC/integration data, and public Goal/Funnel/Cohort definitions.
