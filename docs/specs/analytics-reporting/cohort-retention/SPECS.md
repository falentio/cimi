---
resource: cohort-retention
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Cohort Retention Resource

## 1. Overview & Lifecycle

**Audience:** Both

A Cohort Retention definition groups Visitors/Identified Users by their first qualifying action and measures whether they perform a selected repeated action in later Site-local periods.

```text
active -> archived
```

Retention is bounded to twelve reporting periods per query. Anonymous and explicit Identified User behavior follows the resolved identity model; deleted profiles are invalidated from future results.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `id` | `nanoid` | Cohort definition identifier. |
| `siteId` | `nanoid` | Site scope. |
| `name` | `string256` | Display name. |
| `entryAction` | `cohortAction` | First qualifying action. |
| `retentionAction` | `cohortAction` | Repeated action. |
| `identityKind` | `identityKind` | Visitor or Identified User subject for the cohort. |
| `period` | `retentionPeriod` | Site-local day, week, or month. |
| `status` | `cohortStatus` | Active or archived. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `listCohorts` | GET | `/listCohorts` | authenticated | query |
| Q2 | `getCohort` | GET | `/getCohort` | authenticated | query |
| Q3 | `getRetentionReport` | GET | `/getRetentionReport` | authenticated | query |
| C1 | `createCohort` | POST | `/createCohort` | admin | command |
| C2 | `updateCohort` | POST | `/updateCohort` | admin | command |
| C3 | `archiveCohort` | POST | `/archiveCohort` | admin | command |

## 4. Queries

### Q1: `GET /listCohorts` — `listCohorts`

**Audience:** Both

**Purpose:** List saved cohort definitions.

**Behavior:** Use zero-based live offset pages ordered by `createdAt` plus Cohort ID. Return `nextOffset`, `hasMore`, and `totalCount`; definitions never include raw member lists.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400).

### Q2: `GET /getCohort` — `getCohort`

**Audience:** Both

**Purpose:** Return one cohort definition after Site authorization.

**Behavior:** Inaccessible IDs return `NOT_FOUND`.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

### Q3: `GET /getRetentionReport` — `getRetentionReport`

**Audience:** Both

**Purpose:** Return cohort size and retained counts/rates for each bounded Site-local period.

**Behavior:** The selected Visitor or Identified User enters once at the first qualifying action. Retention counts a later qualifying repeated action in each Site-local period. The same identity may count once per period. Limit output to twelve periods, apply explicitly scoped filters before computing membership, and allow an explicit previous-period comparison.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422).

## 5. Commands

### C1: `POST /createCohort` — `createCohort`

**Audience:** Both

**Purpose:** Persist a bounded entry/repeat-action retention definition.

**Behavior:** Require distinct valid actions and one supported period. Return 201. No MVP command idempotency guarantee.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C2: `POST /updateCohort` — `updateCohort`

**Audience:** Both

**Purpose:** Update a cohort definition.

**Behavior:** Owner or Administrator only. Preserve definition history needed for prior report interpretation. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C3: `POST /archiveCohort` — `archiveCohort`

**Audience:** Both

**Purpose:** Archive a cohort definition without deleting historical report meaning.

**Behavior:** Archiving is monotonic. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Entry is the first qualifying action. | Retention evaluator. | Q3 |
| Repeated action is counted once per identity per period. | Retention evaluator. | Q3 |
| Period output is bounded to twelve periods. | Contract and query planner. | Q3 |
| Deletion invalidates profile and derived cohort membership. | Deletion lifecycle. | Q3 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `authenticated` | Site member. | Q1-Q3 |
| `admin` | Site-management role. | C1-C3 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **No repeated action** — Return zero retention for that period, not missing data.
- **Late Event** — Use validated Occurrence Time consistently with traffic and Event reports.
- **Deleted profile** — Remove it from active cohort counts after deletion invalidation completes.
- **Anonymous identity reset** — A new Anonymous Identity is a new reporting projection, not an inferred continuation.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `BAD_REQUEST` | 400 | Action, period, filter, or range invalid. |
| `FORBIDDEN` | 403 | Caller lacks Site-management/report scope. |
| `NOT_FOUND` | 404 | Site or cohort is inaccessible. |
| `QUERY_LIMIT_EXCEEDED` | 422 | Report exceeds bounded execution. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `site` | Scope and ownership. |
| `event-report` | Action matching. |
| `identity-profile` | Identified-user context and deletion. |
| `retention-policy` | Data availability horizon. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `traffic-report` | Retention summary. |
| `public-dashboard` | Only if an approved aggregate retention metric is later included. |
