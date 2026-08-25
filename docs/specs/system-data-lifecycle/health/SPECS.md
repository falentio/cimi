---
resource: health
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Health Resource

## 1. Overview & Lifecycle

**Audience:** Both

Health reports whether the application and its embedded control/analytics stores are ready for the operating envelope. It is a read-only liveness/readiness contract, not a detailed operator console. Overall lifecycle state and store state are separate: when SQLite/control is `ready` and DuckDB/analytics is `degraded`, `rebuilding`, or `unavailable`, collection may continue in accept-only mode; if SQLite/control is not ready, durable acceptance is unavailable too. The canonical contract resource is `health` and its procedure is `health`; `/system/health` is only the transport route.

The canonical procedure is `health`; its explicit OpenAPI route is `GET /system/health`. `system.health` is not a contract or operation name.

## 2. Base Schema

**Audience:** Both

| Field            | Schema         | Description                                                               |
| ---------------- | -------------- | ------------------------------------------------------------------------- |
| `status`         | `healthStatus` | `healthy`, `degraded`, `recovering`, `maintenance`, or `unavailable`.      |
| `controlStore`   | `storeHealth`  | `ready`, `degraded`, `rebuilding`, or `unavailable` SQLite/control state.  |
| `analyticsStore` | `storeHealth`  | `ready`, `degraded`, `rebuilding`, or `unavailable` DuckDB state.           |
| `cleanupPending` | `boolean`      | Historical retention/deletion cleanup remains after structural readiness. |
| `version`        | bounded string (1-256 chars) | Application version.                                           |
| `checkedAt`      | `SDateTime`    | Server check time.                                                        |

### Health state matrix

The contract accepts only these combinations:

| `status` | `controlStore` | `analyticsStore` | `cleanupPending` | Meaning |
| --- | --- | --- | --- | --- |
| `healthy` | `ready` | `ready` | `false` | Both stores are ready and no lifecycle cleanup is outstanding. |
| `degraded` | `ready` | `degraded`, `rebuilding`, or `unavailable` | any | Durable collection is available in accept-only mode. |
| `degraded` | `ready` | `ready` | `true` | Structural readiness is complete but cleanup remains. |
| `recovering` | `ready` | any store state | any | Restore or recovery checks have not completed. |
| `maintenance` | `ready` | any store state | any | Writes are intentionally quiesced for maintenance. |
| `unavailable` | `degraded` or `unavailable` | any store state | any | The control store cannot provide durable acceptance. |

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure | Method | Path             | Auth   | CQRS  |
| --- | --------- | ------ | ---------------- | ------ | ----- |
| Q1  | `health`  | GET    | `/system/health` | public | query |

## 4. Queries

### Q1: `GET /system/health` — `health`

**Audience:** Both

**Purpose:** Determine whether the application can serve its basic contract.

**Behavior:** Do not include secrets, paths, raw SQL errors, or analytics data. Return only a row from the health state matrix. When control is `ready` and analytics is `degraded`, `rebuilding`, or `unavailable`, collection may accept Events durably, but every analytics read returns generic `SERVICE_UNAVAILABLE` (503) before cache or execution. During write-quiesced maintenance or restore, new collection admission is paused and the active/pending acceptance queues drain before the operation proceeds; collection is paused rather than accept-only. Projection lag may produce `stale` freshness only when the analytics store is `ready` and there is no relevant or unbounded Projection Gap; such a gap returns `QUERY_LIMIT_EXCEEDED` (422) before cache or execution for the current or comparison interval. A ready restore with pending historical cleanup reports `degraded` plus `cleanupPending`, never a clean `healthy` generation.

**Errors:** `INTERNAL_SERVER_ERROR` (500 when the health check itself cannot produce a response).

## 5. Commands

This resource has no commands.

## 6. Business Rules

| Rule                                                        | Enforcement Point | Affected Procedures |
| ----------------------------------------------------------- | ----------------- | ------------------- |
| Health never exposes credentials or physical storage paths. | Output mapper.    | Q1                  |
| Readiness covers both control and analytics stores.         | Health handler.   | Q1                  |
| Only the documented health/store matrix is valid.           | Contract validation. | Q1               |

## 7. Authorization Matrix

| Auth Level | Meaning                          | Procedures |
| ---------- | -------------------------------- | ---------- |
| `public`   | Safe liveness/readiness summary. | Q1         |

## 8. Event Catalog

**Audience:** BE

No events are emitted.

## 9. Edge Cases

**Audience:** Both

- **Analytics store not ready** — For `degraded`, `rebuilding`, or `unavailable`, return the corresponding safe health state without exposing provider internals; analytics reads return generic `SERVICE_UNAVAILABLE` (503).
- **During restore** — Report `recovering` or `maintenance` state, not healthy, stop new collection admission, and drain the acceptance queues while writes are quiesced.
- **Cleanup after restore** — Readiness may return while `cleanupPending` is true; lifecycle status and report freshness expose the remaining work.
- **Contradictory state** — Reject a `healthy` response with an unready store, a clean `degraded` response with both stores ready, or `unavailable` with a ready control store.

## 10. Error Code Catalog

| Code                    | HTTP | Trigger                             |
| ----------------------- | ---: | ----------------------------------- |
| `INTERNAL_SERVER_ERROR` |  500 | Health response cannot be produced. |

## 11. Related Resources & Dependencies

### Depends On

| Resource         | Integration Point       |
| ---------------- | ----------------------- |
| `installation`   | Installation state.     |
| `backup-restore` | Quiesce/recovery state. |

### Used By

| Resource                       | Integration Point |
| ------------------------------ | ----------------- |
| Operator and deployment checks | Readiness.        |

## 12. Out of Scope

**Audience:** Both

- A full operator console, host metrics, log aggregation, or analytics reporting.
- Credentials, filesystem paths, raw provider errors, or cluster administration.
- Hosted monitoring, billing, or mandatory external telemetry services.
