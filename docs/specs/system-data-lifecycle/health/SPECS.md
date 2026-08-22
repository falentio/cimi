---
resource: health
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Health Resource

## 1. Overview & Lifecycle

**Audience:** Both

Health reports whether the application and its embedded control/analytics stores are ready for the operating envelope. It is a read-only liveness/readiness contract, not a detailed operator console.

The current contract is `system.health`; its explicit OpenAPI route is `GET /system/health`.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `status` | `healthStatus` | Overall readiness. |
| `controlStore` | `storeHealth` | SQLite/control readiness. |
| `analyticsStore` | `storeHealth` | DuckDB/analytics readiness. |
| `version` | `string256` | Application version. |
| `checkedAt` | `coercedDate` | Server check time. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `health` | GET | `/system/health` | public | query |

## 4. Queries

### Q1: `GET /system/health` — `health`

**Audience:** Both

**Purpose:** Determine whether the application can serve its basic contract.

**Behavior:** Do not include secrets, paths, raw SQL errors, or analytics data. Distinguish healthy, degraded, and unavailable backing stores. A degraded result is not silently reported healthy.

**Errors:** `INTERNAL_SERVER_ERROR` (500 when the health check itself cannot produce a response).

## 5. Commands

This resource has no commands.

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Health never exposes credentials or physical storage paths. | Output mapper. | Q1 |
| Readiness covers both control and analytics stores. | Health handler. | Q1 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `public` | Safe liveness/readiness summary. | Q1 |

## 8. Event Catalog

**Audience:** BE

No events are emitted.

## 9. Edge Cases

**Audience:** Both

- **Analytics store unavailable** — Return degraded/unavailable status without exposing provider internals.
- **During restore** — Report quiesced/recovering state, not healthy.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `INTERNAL_SERVER_ERROR` | 500 | Health response cannot be produced. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `installation` | Installation state. |
| `backup-restore` | Quiesce/recovery state. |

### Used By

| Resource | Integration Point |
| --- | --- |
| Operator and deployment checks | Readiness. |
