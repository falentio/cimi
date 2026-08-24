---
resource: funnel
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Funnel Resource

## 1. Overview & Lifecycle

**Audience:** Both

A Funnel is a persisted ordered conversion definition with two to ten action steps. Each step matches one pageview or standard Event Kind/name with optional bounded scalar filters.

```text
active -> archived
```

## 2. Base Schema

**Audience:** Both

| Field                     | Schema           | Description                           |
| ------------------------- | ---------------- | ------------------------------------- |
| `id`                      | `nanoid`         | Funnel identifier.                    |
| `siteId`                  | `nanoid`         | Site scope.                           |
| `name`                    | `string256`      | Display name.                         |
| `steps`                   | `funnelStepList` | Ordered list of 2-10 discriminated action matchers; pageviews have no name. |
| `identityKind`            | `identityKind`   | Explicit Visitor or Identified User population; never both. |
| `status`                  | `funnelStatus`   | Active or archived.                   |
| `createdAt` / `updatedAt` | `coercedDate`    | Lifecycle timestamps.                 |

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure         | Method | Path               | Auth          | CQRS    |
| --- | ----------------- | ------ | ------------------ | ------------- | ------- |
| Q1  | `listFunnels`     | GET    | `/listFunnels`     | authenticated | query   |
| Q2  | `getFunnel`       | GET    | `/getFunnel`       | authenticated | query   |
| Q3  | `getFunnelReport` | GET    | `/getFunnelReport` | authenticated | query   |
| C1  | `createFunnel`    | POST   | `/createFunnel`    | admin         | command |
| C2  | `updateFunnel`    | POST   | `/updateFunnel`    | admin         | command |
| C3  | `archiveFunnel`   | POST   | `/archiveFunnel`   | admin         | command |

## 4. Queries

### Q1: `GET /listFunnels` — `listFunnels`

**Audience:** Both

**Purpose:** List persisted Funnel definitions.

**Behavior:** Zero-based live offset pagination is ordered by `createdAt` plus Funnel ID. Return `nextOffset`, `hasMore`, and `totalCount`; definitions are returned without query plans or raw Event data.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400).

### Q2: `GET /getFunnel` — `getFunnel`

**Audience:** Both

**Purpose:** Return one Funnel definition after Site authorization.

**Behavior:** Inaccessible IDs return indistinguishable `NOT_FOUND`; the procedure does not reveal whether the Site or Funnel exists.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404).

### Q3: `GET /getFunnelReport` — `getFunnelReport`

**Audience:** Both

**Purpose:** Report step conversion through ordered actions.

**Behavior:** Evaluate steps in order within one Analytics Session. A step is the first matching action after the prior step; repeated actions do not move a Session backward. The persisted `identityKind` selects exactly one Visitor or Identified User population; the populations are never coalesced. Return exactly the persisted definition's 2-10 steps, with unique contiguous indexes starting at zero and `rateFromEntry` and `rateFromPrevious` for each step. Site-local date and explicitly scoped filters apply before matching. An optional comparison must be adjacent and equal in Site-local calendar length and is returned separately with its own `current` or `stale` freshness, projected acceptance sequence, and occurrence-time coverage. Effective Retention must cover every dependency across both periods. Preflight rejects stale statistics, a relevant or unbounded Projection Gap, or over-budget work with `QUERY_LIMIT_EXCEEDED` before cache or execution; a non-ready analytics store returns generic `SERVICE_UNAVAILABLE` (503) before cache or execution.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `QUERY_LIMIT_EXCEEDED` (422), `SERVICE_UNAVAILABLE` (503).

## 5. Commands

### C1: `POST /createFunnel` — `createFunnel`

**Audience:** Both

**Purpose:** Persist a validated ordered Funnel.

**Behavior:** Require 2-10 distinct ordered action steps and one explicit `identityKind`. Return 201. No MVP command idempotency guarantee.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C2: `POST /updateFunnel` — `updateFunnel`

**Audience:** Both

**Purpose:** Update a Funnel definition.

**Behavior:** Owner or Administrator only. Validate and persist one explicit `identityKind`. Preserve enough definition history to keep prior reports interpretable. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C3: `POST /archiveFunnel` — `archiveFunnel`

**Audience:** Both

**Purpose:** Archive a Funnel without deleting historical reports.

**Behavior:** Archiving is monotonic. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409).

## 6. Business Rules

| Rule                                                                                                                          | Enforcement Point    | Affected Procedures |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------- |
| Steps are ordered and same-Session.                                                                                           | Report query.        | Q3                  |
| Each step is evaluated after the prior step.                                                                                  | Funnel evaluator.    | Q3                  |
| Definitions are bounded to 2-10 steps.                                                                                        | Contract validation. | C1-C2               |
| No cross-Session user journey is inferred.                                                                                    | Report query.        | Q3                  |
| Funnel reports inherit the global Effective Retention and Fact-Work admission rules; no separate coarse duration cap applies. | Query admission.     | Q3                  |

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

- **Same action matches multiple steps** — One Event can advance only the next matching step; it cannot satisfy multiple steps unless the definition explicitly has separate ordered occurrences.
- **Session boundary between steps** — The Funnel attempt stops; no cross-Session continuation.
- **Archived definition** — Historical report remains available; new configuration lists mark it archived.

## 10. Error Code Catalog

| Code                   | HTTP | Trigger                                           |
| ---------------------- | ---: | ------------------------------------------------- |
| `BAD_REQUEST`          |  400 | Step count, action, filter, or range invalid.     |
| `FORBIDDEN`            |  403 | Caller lacks the documented Site-management capability for a command. |
| `NOT_FOUND`            |  404 | Site or Funnel is inaccessible.                   |
| `QUERY_LIMIT_EXCEEDED` |  422 | Effective Retention is incomplete, preflight statistics are stale or uncertain, a relevant/unbounded Projection Gap exists, or the report exceeds bounded execution. |
| `SERVICE_UNAVAILABLE`  |  503 | Analytics store is not ready to serve the report. |

## 11. Related Resources & Dependencies

### Depends On

| Resource          | Integration Point                                         |
| ----------------- | --------------------------------------------------------- |
| `site`            | Scope and ownership.                                      |
| `event-report`    | Standard action matching.                                 |
| `event-ingestion` | Shared server-authoritative Analytics Session boundaries. |

### Used By

| Resource         | Integration Point   |
| ---------------- | ------------------- |
| `traffic-report` | Conversion summary. |

## 12. Out of Scope

**Audience:** Both

- Cross-Session journey continuation or inferred identity merging.
- More than ten steps, arbitrary SQL, or unbounded path exploration.
- Public Funnel definitions, raw member lists, or exports.
