---
resource: installation
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Installation Resource

## 1. Overview & Lifecycle

**Audience:** Both

Installation represents the self-hosted instance bootstrap and operating-envelope status. It is not a hosted billing or cluster-management resource.

```text
uninitialized -> ready
ready -> maintenance
maintenance -> ready
```

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `status` | `installationStatus` | `uninitialized`, `ready`, or `maintenance`. |
| `defaultRetention` | `retentionPolicy` | Installation default. |
| `dataDirectoryReady` | `boolean` | Configured mounted data directory readiness. |
| `updatedAt` | `coercedDate` | Status timestamp. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getInstallationStatus` | GET | `/getInstallationStatus` | admin | query |
| C1 | `initializeInstallation` | POST | `/initializeInstallation` | admin | command |

## 4. Queries

### Q1: `GET /getInstallationStatus` — `getInstallationStatus`

**Audience:** Both

**Purpose:** Return instance readiness, effective default policy summary, and maintenance state.

**Behavior:** Return bounded operator-safe diagnostics only. Do not return filesystem paths, credentials, raw SQL, or host secrets.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `INTERNAL_SERVER_ERROR` (500).

## 5. Commands

### C1: `POST /initializeInstallation` — `initializeInstallation`

**Audience:** Both

**Purpose:** Establish initial installation metadata and default retention policy through the admin RPC surface.

**Behavior:** Bootstrap authorization must be satisfied by the installation's configured admin flow. Initialization is convergent when repeated with the same valid current state; it never overwrites existing Sites or analytics. Return 200 for reuse and 201 for first initialization.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `BAD_REQUEST` (400), `CONFLICT` (409 if initialization is already in an incompatible state).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| No required hosted service or sidecar. | Installation validation. | Q1, C1 |
| Initialization cannot delete or rewrite product data. | Transactional command guard. | C1 |
| Default policy is available before Site overrides. | Initialization transaction. | C1 |

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
- **Missing mounted data directory** — Return a typed unavailable/conflict error; never create an unbounded alternate location.
- **Restore in progress** — Reject initialization as a lifecycle conflict.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated admin. |
| `FORBIDDEN` | 403 | Caller is not installation admin. |
| `BAD_REQUEST` | 400 | Bootstrap input invalid. |
| `CONFLICT` | 409 | Installation lifecycle cannot accept initialization. |

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
