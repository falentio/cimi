---
resource: retention-policy
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Retention Policy Resource

## 1. Overview & Lifecycle

**Audience:** Both

Retention Policy defines how long Cimi keeps collected, identity, replay, and derived analytics data. The effective policy is an installation default plus an optional Site override. `eventMonths` governs Event-derived analytics, `profileMonths` governs profile-dependent data, and `replayMonths` governs replay material when configured. `profileMonths` cannot exceed `eventMonths`, and `replayMonths` must be shorter than both. Retention cutoffs resolve at the Site-local start of day. Effective Retention is the data-availability horizon for reports, not a range clamp: every requested dependency must cover the complete current and adjacent equal-length comparison windows. There is no independent authenticated three-year cap; Public Query uses the stricter of its 90-day bound and Effective Retention, while Goal, Funnel, and Cohort reports inherit the global horizon.

The retention-policy specification owns the first-release default: initialization resolves an omitted policy to `eventMonths: 12`, `profileMonths: 12`, and `replayMonths: null`. The default is configurable only through the installation-default update scope. The acceptance journal, deduplication state, and internal replay/rebuild source use Receipt Time across the full configured raw-event retention window; user-visible replay material and eligibility use `replayMonths`; analytical Event availability uses Occurrence Time. Profile, Alias, and Trait expiry uses each record's last explicit profile activity. Retention never silently expands storage beyond the configured boundary.

## 2. Base Schema

**Audience:** Both

| Field                 | Schema                    | Description                             |
| --------------------- | ------------------------- | --------------------------------------- |
| `installationDefault` | `retentionPolicy`         | Instance fallback; each month is an integer from 1 through 120. |
| `siteOverride`        | `retentionPolicy` or `null` | Optional Site-specific values.          |
| `effectivePolicy`     | `retentionPolicy`         | Computed policy used by lifecycle jobs. |
| `updatedAt`           | `coercedDate`             | Policy timestamp.                       |

Update and read inputs are discriminated by `scope`: `installation` carries a non-null `policy` and cannot be cleared; `site` carries a required `siteId` and accepts a nullable `policy`, where `null` clears the override and inherits the installation default. Results carry the same scope discriminator; Site results include `siteId`.

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure               | Method | Path                     | Auth  | CQRS    |
| --- | ----------------------- | ------ | ------------------------ | ----- | ------- |
| Q1  | `getRetentionPolicy`    | GET    | `/getRetentionPolicy`    | admin | query   |
| C1  | `updateRetentionPolicy` | POST   | `/updateRetentionPolicy` | admin | command |

## 4. Queries

### Q1: `GET /getRetentionPolicy` — `getRetentionPolicy`

**Audience:** Both

**Purpose:** Return installation, Site override, and effective retention values.

**Behavior:** Read-only policy inspection. Show whether a value is inherited or overridden. Do not expose storage paths or deletion-job internals.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

## 5. Commands

### C1: `POST /updateRetentionPolicy` — `updateRetentionPolicy`

**Audience:** Both

**Purpose:** Set or clear the installation default or Site override.

**Behavior:** Installation admin may update defaults; Site Owner or Administrator may update a Site override within installation limits. A single installation-wide lifecycle lock covers this mutation with backup, restore, upgrade, Site deletion/recovery/purge, and destructive cleanup; overlapping work returns `CONFLICT`. The new cutoff applies at commit: affected Event, Session, Visitor, Goal, Funnel, Cohort, profile, alias, trait, and replay material becomes hidden according to its dependency. Identity Redaction removes profile, alias, trait, and identity linkage while accepted Event sequence history remains immutable; eligible retained non-personal Events may continue anonymously. SQLite-canonical overlays and tombstones apply first, derived DuckDB cleanup/compaction follows asynchronously, and historical backup cleanup has its own status. Profile cleanup is reported through `identity-profile.getDeletionStatus` with independent `derivedCleanup` and `backupCleanup` statuses; installation/backup status reports the same two broader stages in order. Extending a policy does not restore physically purged data. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409 during restore/quiesce), `INTERNAL_SERVER_ERROR` (500).

## 6. Business Rules

| Rule                                                                                                                            | Enforcement Point               | Affected Procedures                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------ |
| Effective Site policy is override or installation default.                                                                      | Policy resolver.                | Q1, C1                                     |
| Default retention is 12 months for Event and profile data, with no replay retention unless configured.                          | Installation policy.            | Q1, C1                                     |
| `eventMonths` covers Events, Sessions, Visitors, Goals, Funnels, and Cohorts.                                                   | Retention resolver.             | C1                                         |
| `profileMonths` covers profiles, Aliases, Traits, identity projections, Identified User metrics, and profile-dependent filters. | Retention resolver.             | C1                                         |
| `profileMonths` is no greater than `eventMonths`; configured `replayMonths` is shorter than both.                               | Contract validation.            | C1                                         |
| Retention never silently deletes outside the effective policy.                                                                  | Deletion job and audit state.   | C1                                         |
| Retention cutoffs resolve at the Site-local start of day and current/comparison windows are checked independently.              | Policy resolver and query admission. | C1, all analytics resources |
| Occurrence Time governs analytical retention; Receipt Time governs acceptance-journal, deduplication, and replay retention.     | Retention and ingestion policy. | All analytics resources, `event-ingestion` |
| Profile expiry redacts identity linkage while retaining non-personal Event meaning.                                             | Identity redaction overlay.     | All analytics resources                    |
| Profile-dependent reports reject unavailable profile history; ordinary aggregate reports continue under Event retention.        | Query admission.                | All analytics resources                    |
| A report older than any required dependency is rejected in full rather than clamped or partially returned.                      | Query admission.                | All analytics resources                    |
| Relevant or unbounded Projection Gaps reject affected current/comparison reports before cache or execution; only no-gap lag may be `stale`. | Query admission. | All analytics resources |
| One global lifecycle lock serializes backup, restore, upgrade, retention, Site deletion/recovery/purge, and destructive cleanup. | Lifecycle coordinator. | All lifecycle resources |
| Active-derived cleanup completes before historical-backup cleanup; both statuses remain visible.                                | Lifecycle coordinator. | C1, installation, backup-restore |

## 7. Authorization Matrix

| Auth Level | Meaning                                                     | Procedures |
| ---------- | ----------------------------------------------------------- | ---------- |
| `admin`    | Installation admin or Site-management admin as appropriate. | Q1, C1     |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Site override cleared** — Effective policy falls back to the installation default.
- **Installation default clearing** — Reject a null installation policy; there is no implicit empty fallback. The built-in 12-month default is used only when initialization omitted the policy.
- **Policy shortened** — Apply the new cutoff immediately for visibility and redaction; physical cleanup is asynchronous and does not block the command on storage volume.
- **Profile expiry** — Hide the profile, Alias, Trait, identity projection, and profile-dependent results immediately; retained non-personal Events remain available anonymously under `eventMonths`.
- **Profile re-identification** — A later explicit identification starts a new Profile Epoch; it does not restore the expired epoch's linkage or history.
- **Profile-dependent report beyond horizon** — Return `QUERY_LIMIT_EXCEEDED`; do not return anonymous results under a profile-dependent request. Ordinary Event, Session, Visitor, Goal, Funnel, and Cohort reports remain governed by `eventMonths`.
- **Replay ordering** — Reject a policy with `replayMonths` greater than or equal to either non-replay horizon.
- **Backup contains expired data** — Restoration may temporarily rehydrate expired or redacted payload into the restored generation under the documented privacy exception, but SQLite redaction/tombstones still block normal Site reads, collection, authenticated analytics, and Public Query. Cleanup begins after structural readiness and remains visible through active-derived and historical-backup cleanup statuses.
- **Report crosses a retention cutoff** — Reject the complete current or comparison report with `QUERY_LIMIT_EXCEEDED`; never silently shorten the requested Site-local date range.
- **Retention is extended after purge** — Newly available history begins only with data that still exists; extending policy does not resurrect physically purged records.

## 10. Error Code Catalog

| Code           | HTTP | Trigger                                        |
| -------------- | ---: | ---------------------------------------------- |
| `UNAUTHORIZED` |  401 | No authenticated admin.                        |
| `FORBIDDEN`    |  403 | Caller lacks installation/Site policy scope.   |
| `NOT_FOUND`    |  404 | Site is inaccessible.                          |
| `BAD_REQUEST`  |  400 | Retention value violates policy bounds.        |
| `CONFLICT`     |  409 | Lifecycle state cannot accept policy mutation. |
| `QUERY_LIMIT_EXCEEDED` | 422 | Requested analytics history is unavailable for a required dependency or blocked by a relevant/unbounded Projection Gap. |
| `INTERNAL_SERVER_ERROR` | 500 | Policy or cleanup status cannot be produced safely. |

## 11. Related Resources & Dependencies

### Depends On

| Resource           | Integration Point               |
| ------------------ | ------------------------------- |
| `installation`     | Default and operating envelope. |
| `site`             | Optional override.              |
| `identity-profile` | Deletion and profile retention. |

### Used By

| Resource                | Integration Point          |
| ----------------------- | -------------------------- |
| All analytics resources | Data availability horizon. |
| `backup-restore`        | Recovery policy.           |

## 12. Out of Scope

**Audience:** Both

- Hosted billing-plan retention entitlements or commercial quota enforcement.
- External backup-provider lifecycle and multi-installation retention coordination.
- Silent deletion outside the effective Site or installation policy.
