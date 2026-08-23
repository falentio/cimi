---
resource: backup-restore
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Backup and Restore Resource

## 1. Overview & Lifecycle

**Audience:** Both

Backup and Restore exposes the open-source operator lifecycle through admin RPC procedures while preserving SQLite control and acceptance data as the authoritative recovery artifact. DuckDB analytics data is derived and rebuilt from the restored SQLite journal.

```text
none -> creating -> available
available -> restoring -> ready
creating -> failed
restoring -> failed
```

Backup creation uses write quiescence while preserving analytics reads; restore uses read/write quiescence until structural readiness. They never accept arbitrary filesystem paths from clients.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `id` | `nanoid` | Backup operation/manifest identifier. |
| `status` | `backupStatus` | Creating, available, restoring, failed. |
| `createdAt` / `completedAt` | `coercedDate` | Operation timestamps. |
| `scope` | `backupScope` | Configured installation data scope. |
| `errorCode` | `safeErrorCode` | Safe failure reason, if failed. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `listBackups` | GET | `/listBackups` | admin | query |
| Q2 | `getBackupStatus` | GET | `/getBackupStatus` | admin | query |
| C1 | `createBackup` | POST | `/createBackup` | admin | command |
| C2 | `restoreBackup` | POST | `/restoreBackup` | admin | command |

## 4. Queries

### Q1: `GET /listBackups` — `listBackups`

**Audience:** Both

**Purpose:** List configured backup manifests and statuses.

**Behavior:** Use zero-based live offset pages ordered by `createdAt` plus Backup ID. Return `nextOffset`, `hasMore`, and `totalCount`; never return credentials, arbitrary paths, or raw storage errors.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

### Q2: `GET /getBackupStatus` — `getBackupStatus`

**Audience:** Both

**Purpose:** Poll creation or restore progress.

**Behavior:** Status is monotonic except a failed operation remains failed. A completed restore reports the restored manifest and readiness state, not raw filesystem details.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

## 5. Commands

### C1: `POST /createBackup` — `createBackup`

**Audience:** Both

**Purpose:** Create a consistent backup of the configured SQLite control and acceptance data.

**Behavior:** Installation admin only. Enter read-only maintenance: continue analytics reads, reject collection and lifecycle mutations, capture the SQLite control and acceptance state plus its retention manifest, then resume. DuckDB need not be included because it is rebuildable from the authoritative journal. Return 202 with operation status. No client filesystem destination is accepted.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `CONFLICT` (409 if another lifecycle operation is active), `INSUFFICIENT_STORAGE` (507), `INTERNAL_SERVER_ERROR` (500).

### C2: `POST /restoreBackup` — `restoreBackup`

**Audience:** Both

**Purpose:** Restore an operator-selected configured SQLite backup manifest and rebuild analytical state.

**Behavior:** Installation admin only. Require explicit confirmation, quiesce writes and reads, validate manifest compatibility, restore SQLite, recreate DuckDB, replay accepted records, and keep the instance in recovery state until projection and structural health checks pass. Return 202. The instance may become ready before retention/deletion cleanup of historical backup payloads completes; that cleanup status is separate and must be visible. A failed restore must not report ready or silently continue with incomplete analytical state.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409), `INCOMPATIBLE_BACKUP` (422), `INTERNAL_SERVER_ERROR` (500).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| SQLite is the authoritative generation; DuckDB is rebuilt before readiness. | Quiesce, replay, and health checks. | C1-C2 |
| Clients cannot select arbitrary filesystem paths. | Input schema and operator config. | C1-C2 |
| Restore requires explicit confirmation and admin scope. | Command guard. | C2 |
| Health remains degraded until post-restore checks pass; cleanup may remain pending after readiness. | Lifecycle state. | Q2, C2 |
| Storage pressure causes explicit failure, not silent deletion. | Operation executor. | C1-C2 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `admin` | Installation administrator. | Q1-Q2, C1-C2 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract; operation status is polled through Q2.

## 9. Edge Cases

**Audience:** Both

- **Concurrent lifecycle operation** — Reject a backup, restore, upgrade, retention mutation, or destructive cleanup that overlaps the installation-wide lifecycle lock with `CONFLICT`.
- **Backup created under newer schema** — Reject as `INCOMPATIBLE_BACKUP` before mutating either store.
- **Restore interrupted** — Keep installation unavailable/recovering, persist the safe checkpoint, and resume automatically on startup; never advertise partial readiness. Require operator remediation only if automatic recovery fails.
- **Expired or deleted data in backup** — Restore follows the manifest's recorded retention boundary, rebuilds DuckDB from the restored SQLite generation, and starts retention/deletion cleanup after structural readiness. Historical payloads may be temporarily queryable under the documented restore-time privacy exception.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated admin. |
| `FORBIDDEN` | 403 | Caller is not installation admin. |
| `NOT_FOUND` | 404 | Backup manifest is unavailable. |
| `CONFLICT` | 409 | Another lifecycle operation is active. |
| `INCOMPATIBLE_BACKUP` | 422 | Manifest cannot restore to this installation. |
| `INSUFFICIENT_STORAGE` | 507 | Configured storage cannot complete the operation. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `installation` | Maintenance and readiness state. |
| `retention-policy` | Restore and post-restore lifecycle. |
| `event-ingestion` | Quiesce and flush boundary. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `health` | Readiness status. |
| Operators | Recovery and migration workflow. |

## 12. Out of Scope

**Audience:** Both

- Client-selected arbitrary filesystem paths or unmanaged cloud destinations.
- Multi-node distributed backup orchestration or hosted recovery services.
- Treating DuckDB copies as the authoritative recovery source.
