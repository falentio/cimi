---
resource: public-dashboard
status: draft
version: 1.0.0
updated: 2026-08-23
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

| Field | Schema | Description |
| --- | --- | --- |
| `siteId` | `nanoid` | Site scope. |
| `enabled` | `boolean` | Whether the public URL currently resolves. |
| `publicDashboardIdentifier` | `randomPublicIdentifier` | Public URL selector, never a management credential. |
| `updatedAt` | `coercedDate` | Configuration timestamp. |

Public Query output contains only approved aggregate metric/dimension values and suppression-safe empty results.

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getPublicDashboardConfig` | GET | `/getPublicDashboardConfig` | admin | query |
| Q2 | `queryPublicDashboard` | GET | `/queryPublicDashboard` | public | query |
| C1 | `enablePublicDashboard` | POST | `/enablePublicDashboard` | admin | command |
| C2 | `disablePublicDashboard` | POST | `/disablePublicDashboard` | admin | command |
| C3 | `rotatePublicDashboardIdentifier` | POST | `/rotatePublicDashboardIdentifier` | admin | command |

## 4. Queries

### Q1: `GET /getPublicDashboardConfig` — `getPublicDashboardConfig`

**Audience:** Both

**Purpose:** Return current public status and identifier metadata to Site administrators.

**Behavior:** Never return management credentials or private query configuration. The public identifier may be shown to an authorized administrator because it is intentionally shareable.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

### Q2: `GET /queryPublicDashboard` — `queryPublicDashboard`

**Audience:** Both

**Purpose:** Return approved aggregate analytics for an open public dashboard URL.

**Behavior:** Resolve only the current Public Dashboard Identifier. Enforce one-hour granularity, a maximum 90-day inclusive Site-local date range, approved metrics/dimensions/filters, and `k=5` suppression. Suppressed or empty results use the normal response shape with no explanation of the underlying cohort size. Exclude raw rows, Event IDs, Visitor/Session IDs, Identified Users, Traits, profile filters, raw IP, replay, GSC/integration data, sensitive URL/query values, comparisons, and exports. Cache for five minutes. Apply 360 requests per Site per minute and 600 requests per IP per minute; return `429` with `Retry-After` when exceeded.

The approved first-release catalog is intentionally finite: metrics are `visitors`, `sessions`, `pageviews`, `events`, and `bounce_rate`; dimensions are `time`, `page`, `referrer`, `utm`, `device`, `browser`, `os`, `country`, `region`, `city`, and `event_name`. Public filters may select only approved aggregate Event and Session fields, including the bounded UTM, country, region, and city fields; profile filters are never public.

**Errors:** `NOT_FOUND` (404 for disabled/rotated/unknown identifier), `BAD_REQUEST` (400), `TOO_MANY_REQUESTS` (429), `QUERY_LIMIT_EXCEEDED` (422).

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

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Public identifier is a bearer capability, not a secret. | URL and disclosure model. | Q2, C1-C3 |
| Public Query is a separate aggregate procedure. | Contract and query planner. | Q2 |
| Suppression applies to every returned cohort result. | Public query result boundary. | Q2 |
| Public access never grants Site management or authenticated analytics scope. | Auth routing. | Q2 |
| Revocation is fail-closed; cached copies are not remotely erased. | Config and cache policy. | C2-C3 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `admin` | Site Owner or Administrator. | Q1, C1-C3 |
| `public` | No authentication; valid current Public Dashboard Identifier only. | Q2 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Old link after disable or rotation** — Return `NOT_FOUND`; do not reveal whether the identifier existed.
- **Suppressed cohort** — Return the normal aggregate shape with empty/suppressed values; do not disclose the reason or count.
- **Public query attempts raw filter** — Reject with `BAD_REQUEST`, not a private result.
- **Cache after revocation** — Cache may retain a previously delivered response, but no new request is authorized and no management read treats the cache as live access.
- **Public URL indexing** — Emit permanent `noindex,nofollow` and do not publish a sitemap entry; assume a shared URL can still leak.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `NOT_FOUND` | 404 | Identifier is unknown, rotated, or disabled. |
| `BAD_REQUEST` | 400 | Range, granularity, metric, dimension, or filter is not in the public catalog. |
| `TOO_MANY_REQUESTS` | 429 | Site/IP rate limit exceeded; include `Retry-After`. |
| `QUERY_LIMIT_EXCEEDED` | 422 | Public query exceeds bounded execution. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `site` | Ownership, identifier, and lifecycle. |
| `traffic-report` / `event-report` | Approved aggregate source concepts, never direct route reuse. |
| `collection-policy` | Sensitive data and field exclusions. |

### Used By

| Resource | Integration Point |
| --- | --- |
| Public dashboard frontend | Open aggregate view. |

## 12. Out of Scope

**Audience:** Both

- Private recipient sharing, viewer credentials, or per-recipient access lists.
- Authenticated analytics passthrough, raw rows, identity/profile filters, or arbitrary SQL.
- CSV/JSON/PDF exports, GSC/integration data, and public Goal/Funnel/Cohort definitions.
