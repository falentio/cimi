---
resource: installation
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Installation Resource

## 1. Overview & Lifecycle

**Audience:** Both

Installation represents the self-hosted instance bootstrap and operating-envelope status. It runs in one application container with embedded SQLite/DuckDB under one mounted data directory on the minimum 1 vCPU, 2 GB RAM, 20 GB storage host, with a profile of up to 5 Members and 20 Sites. The minimum host guarantees Core Operability, not numeric throughput, latency, or concurrency; storage warns before exhaustion and rejects new writes explicitly, and core operation works without outbound network access after installation. It is not a hosted billing or cluster-management resource.

```text
uninitialized -> ready
ready -> maintenance
ready -> degraded
ready -> recovering
maintenance -> ready
maintenance -> recovering
recovering -> ready
recovering -> degraded
degraded -> ready
```

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `status` | `installationStatus` | `uninitialized`, `ready`, `degraded`, `maintenance`, or `recovering`. |
| `defaultRetention` | `retentionPolicy` | Installation default. |
| `dataDirectoryReady` | `boolean` | Configured mounted data directory readiness. |
| `activeOperation` | `lifecycleOperationStatus` | Safe phase, operation ID, and status for one global `backup`, `restore`, `upgrade`, `retention`, `cleanup`, `site_deletion`, `site_recovery`, or `site_purge` operation. Site operation IDs correlate with the privileged Site deletion-status surface without exposing paths or payloads. |
| `cleanupPending` | `boolean` | Historical retention/deletion work remains after structural readiness. |
| `derivedCleanup` | `cleanupStage` | Active-derived/live cleanup status, timestamp, and safe error. |
| `backupCleanup` | `cleanupStage` | Historical-backup cleanup status, timestamp, and safe error; it starts only after derived cleanup completes. |
| `updatedAt` | `coercedDate` | Status timestamp. |

`cleanupStage.status` is `not_applicable`, `not_started`, `pending`, `running`, `completed`, or `failed`. A stage exposes `startedAt`, `completedAt`, and a safe `errorCode` consistent with that status. `cleanupPending` is true while either applicable stage is not complete.

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getInstallationStatus` | GET | `/getInstallationStatus` | admin | query |
| C1 | `initializeInstallation` | POST | `/initializeInstallation` | admin | command |
| C2 | `upgradeInstallation` | POST | `/upgradeInstallation` | admin | command |

## 4. Queries

### Q1: `GET /getInstallationStatus` — `getInstallationStatus`

**Audience:** Both

**Purpose:** Return instance readiness, effective default policy summary, and maintenance state.

**Behavior:** Return bounded operator-safe diagnostics only: lifecycle phase, component state, safe progress, last safe sequence, cleanup status, and safe error code. Do not return filesystem paths, credentials, raw SQL, or host secrets.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

## 5. Commands

### C1: `POST /initializeInstallation` — `initializeInstallation`

**Audience:** Both

**Purpose:** Establish initial installation metadata and default retention policy through the admin RPC surface.

**Behavior:** Bootstrap authorization must be satisfied by the installation's configured admin flow. `defaultRetention` is optional; when omitted, initialization stores the retention-policy default of `eventMonths: 12`, `profileMonths: 12`, and `replayMonths: null`. Initialization is convergent when repeated with the same valid current state; it never overwrites existing Sites or analytics. Return 200 for reuse and 201 for first initialization. One installation-wide lifecycle lock serializes initialization with backup, restore, upgrade, retention, Site deletion/recovery/purge, and destructive cleanup.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409 if initialization is already in an incompatible state), `INTERNAL_SERVER_ERROR` (500).

### C2: `POST /upgradeInstallation` — `upgradeInstallation`

**Audience:** Both

**Purpose:** Explicitly start a supported installation migration.

**Input:** `{ confirmation: "UPGRADE" }`. No startup side effect or initialization call implicitly starts an upgrade.

**Behavior:** Installation admin only. Acquire the global lifecycle lock and return 202 with `activeOperation.kind: upgrade` and a safe operation ID. Create and persist an authoritative SQLite pre-upgrade safety artifact before migration, migrate supported older manifests, reject newer or incompatible manifests with `INCOMPATIBLE_BACKUP` (422), rebuild DuckDB from SQLite when required, and poll progress through Q1. If migration or rebuild fails, restore the whole pre-upgrade SQLite generation and remain non-ready until health checks pass. A retry is a new explicit command after the failed operation is durably recorded.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `CONFLICT` (409 while the lifecycle lock is held), `INCOMPATIBLE_BACKUP` (422), `INSUFFICIENT_STORAGE` (507), `INTERNAL_SERVER_ERROR` (500).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| No required hosted service or sidecar. | Installation validation. | Q1, C1 |
| Initialization cannot delete or rewrite product data. | Transactional command guard. | C1 |
| Default policy is available before Site overrides. | Initialization transaction. | C1 |
| A ready installation always has a ready mounted data directory. | Contract validation. | Q1, C1, C2 |
| Site lifecycle lock holders are named in `activeOperation` and expose only safe progress identifiers. | Lifecycle coordinator. | Q1, C2 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `admin` | Installation administrator. | Q1, C1 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Concurrent initialization** — One transaction wins; other calls return the resulting ready state.
- **Missing mounted data directory** — Return `CONFLICT` or `INTERNAL_SERVER_ERROR` without creating an unbounded alternate location.
- **Restore in progress** — Reject initialization as a lifecycle conflict.
- **Interrupted lifecycle operation** — Startup resumes from durable operation state and remains `recovering` until the operation and health checks complete. An interrupted upgrade is resumed or rolled back from its SQLite safety artifact; initialization does not trigger it.
- **Site lifecycle lock** — Site deletion, recovery, and purge report their typed operation kind and correlation ID in installation status while retaining detailed Site progress on the privileged Site status surface.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated admin. |
| `FORBIDDEN` | 403 | Caller is not installation admin. |
| `BAD_REQUEST` | 400 | Bootstrap input invalid. |
| `CONFLICT` | 409 | Installation lifecycle cannot accept initialization. |
| `INCOMPATIBLE_BACKUP` | 422 | An upgrade manifest is newer or incompatible. |
| `INSUFFICIENT_STORAGE` | 507 | The SQLite safety artifact or migration cannot be stored safely. |
| `NOT_FOUND` | 404 | Required installation resource is unavailable. |
| `INTERNAL_SERVER_ERROR` | 500 | Initialization or status cannot be completed safely. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| Better Auth | Admin principal. |
| `retention-policy` | Installation default. |
| `backup-restore` | Maintenance state. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `health` | Readiness summary. |

## 12. Out of Scope

**Audience:** Both

- Hosted billing, subscriptions, commercial plans, or entitlement management.
- Cluster orchestration, distributed workers, or required sidecars.
- Operator telemetry beyond the bounded local lifecycle and readiness contract.
