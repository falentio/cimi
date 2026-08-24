---
resource: goal
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Goal Resource

## 1. Overview & Lifecycle

**Audience:** Both

A Goal is a persisted single-action conversion definition for one Site. It matches one pageview or standard Event Kind/name with optional bounded scalar property filters.

```text
active -> archived
```

Archived Goals stop appearing in new configuration lists but remain interpretable for historical reports.

## 2. Base Schema

**Audience:** Both

| Field                     | Schema            | Description                                       |
| ------------------------- | ----------------- | ------------------------------------------------- |
| `id`                      | `nanoid`          | Goal identifier.                                  |
| `siteId`                  | `nanoid`          | Site scope.                                       |
| `name`                    | `string256`       | Display name.                                     |
| `action`                  | `goalAction`      | Discriminated pageview or standard Event Kind/name matcher; pageviews have no name. |
| `propertyFilters`         | `scalarFilterMap` | Optional bounded scalar filters.                  |
| `identityKind`            | `identityKind`    | Explicit Visitor or Identified User population; never both. |
| `status`                  | `goalStatus`      | Active or archived.                               |
| `createdAt` / `updatedAt` | `coercedDate`     | Lifecycle timestamps.                             |

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure       | Method | Path             | Auth          | CQRS    |
| --- | --------------- | ------ | ---------------- | ------------- | ------- |
| Q1  | `listGoals`     | GET    | `/listGoals`     | authenticated | query   |
| Q2  | `getGoal`       | GET    | `/getGoal`       | authenticated | query   |
| Q3  | `getGoalReport` | GET    | `/getGoalReport` | authenticated | query   |
| C1  | `createGoal`    | POST   | `/createGoal`    | admin         | command |
| C2  | `updateGoal`    | POST   | `/updateGoal`    | admin         | command |
| C3  | `archiveGoal`   | POST   | `/archiveGoal`   | admin         | command |

## 4. Queries

### Q1: `GET /listGoals` — `listGoals`

**Audience:** Both

**Purpose:** List active and archived Goal definitions in Site scope.

**Behavior:** Use zero-based live offset pages sorted by `createdAt` plus Goal ID. Return `nextOffset`, `hasMore`, and `totalCount`; never return raw query plans.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400).

### Q2: `GET /getGoal` — `getGoal`

**Audience:** Both

**Purpose:** Return one Goal definition after Site authorization.

**Behavior:** Inaccessible IDs return indistinguishable `NOT_FOUND`; the procedure does not reveal whether the Site or Goal exists.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404).

### Q3: `GET /getGoalReport` — `getGoalReport`

**Audience:** Both

**Purpose:** Count Goal conversions and Session conversion rate over an inclusive Site-local calendar range.

**Behavior:** One matching action counts at most once per Session. The persisted `identityKind` selects exactly one Visitor or Identified User population; the populations are never coalesced. Eligibility is the set of Sessions intersecting the resolved Site-local report interval, after the selected identity population and all authenticated report filters are applied, with Sessions lacking the required Session boundary excluded. The Goal action itself is not an additional eligibility filter; it is evaluated only for the conversion numerator. `conversionRate` is converted Sessions divided by this eligible Session set and is `0` when the denominator is zero. Report filters use explicit scope and apply to the same Site/Session model as traffic reports. Archived definitions remain reportable. An optional comparison must be adjacent and equal in Site-local calendar length and is returned separately with its own `current` or `stale` freshness, projected acceptance sequence, and occurrence-time coverage. Effective Retention must cover every dependency across both periods. Preflight rejects stale statistics, a relevant or unbounded Projection Gap, or over-budget work with `QUERY_LIMIT_EXCEEDED` before cache or execution; a non-ready analytics store returns generic `SERVICE_UNAVAILABLE` (503) before cache or execution.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503).

## 5. Commands

### C1: `POST /createGoal` — `createGoal`

**Audience:** Both

**Purpose:** Persist a validated single-action Goal.

**Behavior:** Require one pageview or standard Event Kind/name action, one explicit `identityKind`, and optional scalar filters. Return 201. No MVP command idempotency guarantee.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C2: `POST /updateGoal` — `updateGoal`

**Audience:** Both

**Purpose:** Update mutable Goal definition fields.

**Behavior:** Owner or Administrator only. Validate and persist one explicit `identityKind`. Historical reports retain the definition version needed to interpret prior results; changes apply to future report evaluation according to the definition timestamp boundary. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C3: `POST /archiveGoal` — `archiveGoal`

**Audience:** Both

**Purpose:** Stop a Goal from being active without deleting its historical meaning.

**Behavior:** Archiving is monotonic and reportable. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409 if already archived with incompatible state).

## 6. Business Rules

| Rule                                                                                                                        | Enforcement Point           | Affected Procedures |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------- |
| One Goal matches one action plus scalar filters.                                                                            | Contract validation.        | C1-C2               |
| A Session contributes at most one conversion per Goal.                                                                      | Report query.               | Q3                  |
| Goal reports inherit the global Effective Retention and Fact-Work admission rules; no separate coarse duration cap applies. | Query admission.            | Q3                  |
| No arbitrary predicates or SQL.                                                                                             | Contract and query planner. | All                 |

## 7. Authorization Matrix

| Auth Level      | Meaning               | Procedures |
| --------------- | --------------------- | ---------- |
| `authenticated` | Site member.          | Q1-Q3      |
| `admin`         | Site-management role. | C1-C3      |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Goal action is deleted or renamed** — Preserve the definition and return zero/newly unmatched results; never reinterpret it as another action.
- **Repeated matching Event in one Session** — Count once.
- **Archived Goal report** — Historical queries remain available to authorized members.

## 10. Error Code Catalog

| Code                   | HTTP | Trigger                                                      |
| ---------------------- | ---: | ------------------------------------------------------------ |
| `BAD_REQUEST`          |  400 | Action, property filter, range, or report filter is invalid. |
| `FORBIDDEN`            |  403 | Caller lacks the documented Site-management capability for a command. |
| `NOT_FOUND`            |  404 | Site or Goal is missing or inaccessible; read cases are indistinguishable. |
| `QUERY_LIMIT_EXCEEDED` |  422 | Effective Retention is incomplete, preflight statistics are stale or uncertain, a relevant/unbounded Projection Gap exists, or the report exceeds bounded execution. |
| `SERVICE_UNAVAILABLE`  |  503 | Analytics store is not ready to serve the report.            |

## 11. Related Resources & Dependencies

### Depends On

| Resource          | Integration Point                                         |
| ----------------- | --------------------------------------------------------- |
| `site`            | Scope and ownership.                                      |
| `event-report`    | Standard action semantics.                                |
| `event-ingestion` | Shared server-authoritative Analytics Session boundaries. |

### Used By

| Resource           | Integration Point                             |
| ------------------ | --------------------------------------------- |
| `traffic-report`   | Conversion summary.                           |
| `public-dashboard` | Only if a Goal metric is explicitly approved. |

## 12. Out of Scope

**Audience:** Both

- Multi-step journeys, arbitrary conversion expressions, or cross-Session conversion inference.
- Public Goal definitions or raw member-level conversion lists.
- Arbitrary SQL and unbounded report execution.
