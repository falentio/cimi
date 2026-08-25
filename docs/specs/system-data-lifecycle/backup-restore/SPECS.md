---
resource: backup-restore
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Backup and Restore Resource

## 1. Overview & Lifecycle

**Audience:** Both

Backup and Restore exposes the open-source operator lifecycle through admin RPC procedures while preserving SQLite control and acceptance data as the authoritative recovery artifact. DuckDB analytics data is derived and rebuilt from the restored SQLite journal.

Top-level status and restore phase are separate:

```text
none -> creating -> available
creating -> failed
available -> restoring -> available
restoring -> failed
```

While `status` is `restoring`, `phase` advances through `restoring_sqlite`,
`rebuilding_duckdb`, `cleanup_pending`, and `ready` (or `failed`). The
`restoring/ready` pair is a structural-readiness checkpoint: it remains active
until one atomic transition promotes it to `available/ready`. A completed
restore is `status: available` with `phase: ready` or `cleanup_pending` and an
explicit `cleanupPending` flag. `completedAt` is null for `creating` and
`restoring`, non-null for `available` and `failed`, and never precedes
`createdAt`.

Backup creation uses write quiescence while preserving analytics reads; write quiescence stops new Event admission and drains the active 500-candidate flush plus the pending 1,500-candidate queue before the SQLite snapshot. Restore uses read/write quiescence until structural readiness and also requires the acceptance queues to drain before replacing SQLite. They never accept arbitrary filesystem paths from clients.

## 2. Base Schema

Restore operation references are persisted in the first-party `backup_restore_reference` row. A selected source ID must resolve to an existing backup operation, and the pre-restore safety artifact must resolve to an existing artifact owned by the active restore workflow; handlers validate the artifact type and operation ownership before replacement or rollback.

**Audience:** Both

| Field                       | Schema          | Description                             |
| --------------------------- | --------------- | --------------------------------------- |
| `id`                        | `nanoid`        | Backup operation/manifest identifier.   |
| `status`                    | `backupStatus`  | `creating`, `available`, `restoring`, or `failed`. |
| `createdAt` / `completedAt` | `coercedDate`   | Operation timestamps.                   |
| `scope`                     | `backupScope`   | `installation` data scope.              |
| `phase`                     | `backupPhase`   | SQLite capture/restore, DuckDB rebuild, cleanup, ready, or failed phase. |
| `progress`                  | `number`        | Monotonic operation progress from 0 through 1. |
| `checkpoint`                | `backupCheckpoint` | `none`, `sqlite_captured`, `sqlite_restored`, `duckdb_rebuilt`, or `structurally_ready`. |
| `lastSafeSequence`          | `integer` or `null` | SQLite acceptance sequence safe to resume or roll back from. |
| `readiness`                 | `backupReadiness` | Control-store, analytics-store, and structural readiness states. |
| `cleanupPending`            | `boolean`       | Historical retention/deletion cleanup remains after structural readiness. |
| `derivedCleanup` / `backupCleanup` | `cleanupStage` | Independent active-derived and historical-backup cleanup statuses, timestamps, and safe errors. |
| `restoreSourceBackupId`     | `nanoid` or `null` | Operator-selected backup manifest for a restore operation. |
| `preRestoreSafetyArtifact`  | `safetyArtifact` or `null` | Internal SQLite snapshot manifest used only to restore the pre-restore generation. |
| `errorCode`                 | `safeErrorCode` | Safe failure reason, if failed.         |

Each cleanup stage uses `not_applicable`, `not_started`, `pending`, `running`, `completed`, or `failed`, with timestamps and a safe error consistent with its status. `cleanupPending` is true while either applicable stage is unfinished.

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure         | Method | Path               | Auth  | CQRS    |
| --- | ----------------- | ------ | ------------------ | ----- | ------- |
| Q1  | `listBackups`     | GET    | `/listBackups`     | admin | query   |
| Q2  | `getBackupStatus` | GET    | `/getBackupStatus` | admin | query   |
| C1  | `createBackup`    | POST   | `/createBackup`    | admin | command |
| C2  | `restoreBackup`   | POST   | `/restoreBackup`   | admin | command |

## 4. Queries

### Q1: `GET /listBackups` — `listBackups`

**Audience:** Both

**Purpose:** List configured backup manifests and statuses.

**Behavior:** Use zero-based live offset pages ordered by `createdAt` plus Backup ID. Return `nextOffset`, `hasMore`, and `totalCount`; never return credentials, arbitrary paths, or raw storage errors.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

### Q2: `GET /getBackupStatus` — `getBackupStatus`

**Audience:** Both

**Purpose:** Poll creation or restore progress.

**Behavior:** Status is monotonic at the operation level; `progress`, restore phase, `checkpoint`, and `lastSafeSequence` advance monotonically, and a failed operation remains failed. Q2 returns all polling fields: progress, checkpoint, last safe SQLite sequence, control/analytics/structural readiness, independent `derivedCleanup` and `backupCleanup` statuses, the selected source manifest, and the separate pre-restore safety artifact. A completed restore reports `status: available` with `phase: ready` or `cleanup_pending`, not raw filesystem details. The `restoring/ready` checkpoint is visible before the atomic `available/ready` transition.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

## 5. Commands

### C1: `POST /createBackup` — `createBackup`

**Audience:** Both

**Purpose:** Create a consistent backup of the configured SQLite control and acceptance data.

**Behavior:** Installation admin only. Enter read-only maintenance: continue analytics reads, stop new Event admission, reject lifecycle mutations, and hold the global lifecycle lock. Drain the active and pending acceptance queues before capturing the snapshot. If SQLite cannot commit the drain, mark the backup operation failed with `INTERNAL_SERVER_ERROR` and fail its waiting ingestion requests with `SERVICE_UNAVAILABLE`; do not capture a partial generation. Capture the full SQLite-canonical installation generation: the full-retention acceptance journal, deduplication/replay state, Organization/Site and resource definitions, identity profiles/aliases/redaction overlays, retention and deletion intent/tombstones, projector cursors, quarantine gaps, lifecycle state, and retention manifest. DuckDB need not be included because it is rebuildable from the authoritative journal; an optional DuckDB copy is only a restore accelerator. Return 202 with operation status. No client filesystem destination is accepted.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409 if another lifecycle operation is active), `INSUFFICIENT_STORAGE` (507), `INTERNAL_SERVER_ERROR` (500).

### C2: `POST /restoreBackup` — `restoreBackup`

**Audience:** Both

**Purpose:** Restore an operator-selected configured SQLite backup manifest and rebuild analytical state.

**Behavior:** Installation admin only. Require explicit confirmation, acquire the global lifecycle lock, stop new Event admission, drain the active and pending acceptance queues, quiesce writes and reads, validate manifest compatibility, migrate supported older manifests, reject newer or incompatible manifests, and create and persist an internal SQLite `preRestoreSafetyArtifact` for the currently active generation before replacing it. The operator-selected `restoreSourceBackupId` and safety artifact are separate manifests. Restore SQLite, reapply identity redaction and Site deletion tombstones, recreate DuckDB from authoritative SQLite, replay accepted records, and keep the instance in `recovering` state until projection and structural health checks pass. Return 202. If the queue drain or safety-artifact creation fails, mark the operation failed with `INTERNAL_SERVER_ERROR` and fail uncommitted ingestion waiters with `SERVICE_UNAVAILABLE`; do not replace active state. If migration or DuckDB rebuild fails, roll back the whole pre-restore generation from the safety artifact. The instance may become ready before retention/deletion cleanup of historical backup payloads completes; `derivedCleanup` then `backupCleanup` are visible and ordered. An older backup may temporarily rehydrate expired or deleted payload into the restored generation under the restore-time privacy exception, but tombstones and redaction overlays block normal Site reads, collection, authenticated analytics, and Public Query, and prevent deleted or purged Site activation. A failed restore must not report ready or silently continue with incomplete analytical state.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409), `INCOMPATIBLE_BACKUP` (422), `INSUFFICIENT_STORAGE` (507), `INTERNAL_SERVER_ERROR` (500).

## 6. Business Rules

| Rule                                                                                                | Enforcement Point                   | Affected Procedures |
| --------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------- |
| SQLite is the authoritative generation; DuckDB is rebuilt before readiness.                         | Quiesce, replay, and health checks. | C1-C2               |
| Clients cannot select arbitrary filesystem paths.                                                   | Input schema and operator config.   | C1-C2               |
| Restore requires explicit confirmation and admin scope.                                             | Command guard.                      | C2                  |
| Health remains recovering/unavailable until post-restore checks pass; cleanup may remain pending after readiness. | Lifecycle state. | Q2, C2 |
| A pre-restore SQLite safety artifact is persisted before active generation replacement. | Restore coordinator. | C2 |
| DuckDB is rebuilt from SQLite and is never required as the recovery authority. | Restore coordinator. | C1-C2 |
| Active-derived cleanup completes before historical-backup cleanup. | Cleanup coordinator. | Q2, C2 |
| Storage pressure causes explicit failure, not silent deletion.                                      | Operation executor.                 | C1-C2               |
| One global lifecycle lock covers backup, restore, upgrade, retention, Site deletion/recovery/purge, and destructive cleanup. | Lifecycle coordinator. | C1-C2 |
| Write quiescence stops new admission and drains the 500-active/1,500-pending acceptance envelope before snapshot or replacement. | Lifecycle coordinator and acceptance coordinator. | C1-C2 |

## 7. Authorization Matrix

| Auth Level | Meaning                     | Procedures   |
| ---------- | --------------------------- | ------------ |
| `admin`    | Installation administrator. | Q1-Q2, C1-C2 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract; operation status is polled through Q2.

## 9. Edge Cases

**Audience:** Both

- **Concurrent lifecycle operation** — Reject a backup, restore, upgrade, retention mutation, or destructive cleanup that overlaps the installation-wide lifecycle lock with `CONFLICT`.
- **Backup created under newer schema** — Reject as `INCOMPATIBLE_BACKUP` before mutating either store.
- **Restore interrupted** — Keep installation `recovering` or `maintenance`, persist the safe checkpoint, and resume automatically on startup; never advertise partial readiness. Require operator remediation only if automatic recovery fails.
- **Restore safety artifact unavailable** — Return `INSUFFICIENT_STORAGE` (507), record a failed operation, and leave the active SQLite generation unchanged.
- **Expired or deleted data in backup** — Restore follows the manifest's recorded retention boundary, reapplies SQLite redaction/tombstones, rebuilds DuckDB from the restored SQLite generation, and starts active-derived then historical-backup cleanup after structural readiness. Historical payloads may be temporarily rehydrated for the restored generation under the privacy exception, but normal Site reads, collection, authenticated analytics, and Public Query remain hidden and deleted or purged Sites cannot be activated.
- **Upgrade migration or rebuild failure** — Restore the whole pre-operation generation from the authoritative SQLite safety artifact; never leave a partial generation ready.
- **Timestamp invariant** — Reject active operations with `completedAt`, terminal operations without it, or any completion timestamp before `createdAt`.
- **Cleanup ordering** — `backupCleanup` cannot be `running`, `completed`, or `failed` until `derivedCleanup` is `completed`; both stages expose safe timestamps and errors.
- **Acceptance drain failure** — Do not create or restore a backup generation when the acceptance queues cannot drain durably; record `INTERNAL_SERVER_ERROR` on the lifecycle operation and return `SERVICE_UNAVAILABLE` to uncommitted ingestion waiters rather than snapshotting a partial queue.

## 10. Error Code Catalog

| Code                   | HTTP | Trigger                                           |
| ---------------------- | ---: | ------------------------------------------------- |
| `UNAUTHORIZED`         |  401 | No authenticated admin.                           |
| `FORBIDDEN`            |  403 | Caller is not installation admin.                 |
| `NOT_FOUND`            |  404 | Backup manifest is unavailable.                   |
| `CONFLICT`             |  409 | Another lifecycle operation is active.            |
| `INCOMPATIBLE_BACKUP`  |  422 | Manifest cannot restore to this installation.     |
| `INSUFFICIENT_STORAGE` |  507 | Configured storage cannot complete the operation. |
| `BAD_REQUEST`          |  400 | Confirmation, pagination, or restore input is invalid. |
| `INTERNAL_SERVER_ERROR` |  500 | Backup or restore cannot complete safely. |

## 11. Related Resources & Dependencies

### Depends On

| Resource           | Integration Point                   |
| ------------------ | ----------------------------------- |
| `installation`     | Maintenance and readiness state.    |
| `retention-policy` | Restore and post-restore lifecycle. |
| `event-ingestion`  | Quiesce and flush boundary.         |

### Used By

| Resource  | Integration Point                |
| --------- | -------------------------------- |
| `health`  | Readiness status.                |
| Operators | Recovery and migration workflow. |

## 12. Out of Scope

**Audience:** Both

- Client-selected arbitrary filesystem paths or unmanaged cloud destinations.
- Multi-node distributed backup orchestration or hosted recovery services.
- Treating DuckDB copies as the authoritative recovery source.
