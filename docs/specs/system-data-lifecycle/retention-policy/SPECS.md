---
resource: retention-policy
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Retention Policy Resource

## 1. Overview & Lifecycle

**Audience:** Both

Retention Policy defines how long Cimi keeps collected and derived analytics data. The effective policy is an installation default plus an optional Site override. Effective Retention is the data-availability horizon for reports, not a range clamp: every requested dependency must cover the complete current and comparison windows.

The default first-release retention is twelve months and is configurable. The acceptance journal, deduplication state, and replay/rebuild source cover the full configured raw-event retention window; transient projector work may be cleaned after successful materialization. Retention never silently expands storage beyond the configured boundary.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `installationDefault` | `retentionPolicy` | Instance fallback. |
| `siteOverride` | `retentionPolicyOverride` | Optional Site-specific values. |
| `effectivePolicy` | `retentionPolicy` | Computed policy used by lifecycle jobs. |
| `updatedAt` | `coercedDate` | Policy timestamp. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getRetentionPolicy` | GET | `/getRetentionPolicy` | admin | query |
| C1 | `updateRetentionPolicy` | POST | `/updateRetentionPolicy` | admin | command |

## 4. Queries

### Q1: `GET /getRetentionPolicy` — `getRetentionPolicy`

**Audience:** Both

**Purpose:** Return installation, Site override, and effective retention values.

**Behavior:** Read-only policy inspection. Show whether a value is inherited or overridden. Do not expose storage paths or deletion-job internals.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

## 5. Commands

### C1: `POST /updateRetentionPolicy` — `updateRetentionPolicy`

**Audience:** Both

**Purpose:** Set or clear the installation default or Site override.

**Behavior:** Installation admin may update defaults; Site Owner or Administrator may update a Site override within installation limits. The command does not immediately erase rows in the request; lifecycle processing is asynchronous and status is observable through installation/backup status. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409 during restore/quiesce).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Effective Site policy is override or installation default. | Policy resolver. | Q1, C1 |
| Default retention is twelve months unless configured otherwise. | Installation policy. | Q1, C1 |
| Retention covers raw, derived, identity, and replay data according to their class. | Lifecycle workers. | C1 |
| Retention never silently deletes outside the effective policy. | Deletion job and audit state. | C1 |
| Occurrence Time governs analytical retention; Receipt Time governs acceptance-journal, deduplication, and replay retention. | Retention and ingestion policy. | All analytics resources, `event-ingestion` |
| Profile retention gates only profile-dependent reports and filters; replay retention gates replay only. | Dependency resolver. | All analytics resources |
| A report older than any required dependency is rejected in full rather than clamped or partially returned. | Query admission. | All analytics resources |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `admin` | Installation admin or Site-management admin as appropriate. | Q1, C1 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Site override cleared** — Effective policy falls back to the installation default.
- **Policy shortened** — Mark deletion work pending; do not block the command while scanning all storage.
- **Backup contains expired data** — Restoration may temporarily rehydrate expired rows from the historical backup generation; the backup/restore resource exposes cleanup status and applies the effective policy asynchronously after readiness.
- **Report crosses a retention cutoff** — Reject the complete current or comparison report with `QUERY_LIMIT_EXCEEDED`; never silently shorten the requested Site-local date range.
- **Retention is extended after purge** — Newly available history begins only with data that still exists; extending policy does not resurrect physically purged records.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated admin. |
| `FORBIDDEN` | 403 | Caller lacks installation/Site policy scope. |
| `NOT_FOUND` | 404 | Site is inaccessible. |
| `BAD_REQUEST` | 400 | Retention value violates policy bounds. |
| `CONFLICT` | 409 | Lifecycle state cannot accept policy mutation. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `installation` | Default and operating envelope. |
| `site` | Optional override. |
| `identity-profile` | Deletion and profile retention. |

### Used By

| Resource | Integration Point |
| --- | --- |
| All analytics resources | Data availability horizon. |
| `backup-restore` | Recovery policy. |

## 12. Out of Scope

**Audience:** Both

- Hosted billing-plan retention entitlements or commercial quota enforcement.
- External backup-provider lifecycle and multi-installation retention coordination.
- Silent deletion outside the effective Site or installation policy.
