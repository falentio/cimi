---
resource: site
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Site Resource

## 1. Overview & Lifecycle

**Audience:** Both

A Site is a website or web application whose analytics belong to exactly one Organization. It supplies a non-secret Ingestion Identifier for collection and never moves between Organizations in v1.

```text
active -> deleted
```

Deletion is blocked or quiesced according to retention and recovery rules; it never silently transfers or deletes another Organization.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `id` | `nanoid` | Site identifier. |
| `organizationId` | `nanoid` | Owning Organization. |
| `name` | `string256` | Display name. |
| `hostname` | `hostname` | Canonical site hostname. |
| `ingestionIdentifier` | `publicIdentifier` | Non-secret collection selector. |
| `reportingTimezone` | `ianaTimezone` | Site timezone for report dates, buckets, and comparisons. Defaults to UTC. |
| `weekStartsOn` | `weekStart` | Explicit first weekday for Site-local weekly periods. Defaults to Monday. |
| `createdAt` / `updatedAt` | `coercedDate` | Lifecycle timestamps. |

The Ingestion Identifier is never a read or management credential.

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `listSites` | GET | `/listSites` | authenticated | query |
| Q2 | `getSite` | GET | `/getSite` | authenticated | query |
| C1 | `createSite` | POST | `/createSite` | admin | command |
| C2 | `updateSiteV2` | POST | `/updateSiteV2` | admin | command |
| C3 | `deleteSite` | POST | `/deleteSite` | admin | command |
| C4 | `rotateIngestionIdentifier` | POST | `/rotateIngestionIdentifier` | admin | command |

## 4. Queries

### Q1: `GET /listSites` — `listSites`

**Audience:** Both

**Purpose:** List Sites visible through persisted Organization membership.

**Behavior:** Use zero-based live offset pages ordered by `createdAt` plus Site ID. Return `nextOffset`, `hasMore`, and `totalCount`; never return Sites from the active Organization merely because it is selected in navigation.

**Errors:** `UNAUTHORIZED` (401), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

### Q2: `GET /getSite` — `getSite`

**Audience:** Both

**Purpose:** Return one Site after persisted membership and Site ownership checks.

**Behavior:** Inaccessible and unknown Site IDs return the same `NOT_FOUND` response.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400).

## 5. Commands

### C1: `POST /createSite` — `createSite`

**Audience:** Both

**Purpose:** Create a Site in an Organization where the caller may manage Sites.

**Behavior:** Generate a fresh Ingestion Identifier. Hostname normalization and uniqueness are Site-scoped according to the canonical hostname rule. Return 201.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C2: `POST /updateSiteV2` — `updateSiteV2`

**Audience:** Both

**Purpose:** Update mutable Site metadata and collection-facing settings.

**Behavior:** Owner or Administrator only. Site Organization and Ingestion Identifier are not changed by this procedure. `reportingTimezone` and `weekStartsOn` are explicit Site reporting settings. `updateSiteV2` intentionally supersedes the pre-release `updateSite` contract after incompatible input and behavior changes; no unversioned alias is exposed. Future incompatible changes use a new versioned procedure.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409).

### C3: `POST /deleteSite` — `deleteSite`

**Audience:** Both

**Purpose:** Quiesce and delete a Site and its Site-scoped configuration.

**Behavior:** Owner only. Collection stops before deletion; analytics and identity deletion follows the asynchronous lifecycle contract and backup policy. Return 202 with deletion status when work is asynchronous.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409 while quiescing or restoring).

### C4: `POST /rotateIngestionIdentifier` — `rotateIngestionIdentifier`

**Audience:** Both

**Purpose:** Revoke the current collection selector and issue a new one.

**Behavior:** Owner or Administrator only. The old identifier fails closed after the committed rotation. Return the new non-secret identifier once in the normal Site response.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| A Site belongs to exactly one Organization. | Persistence and authorization guard. | Q1-Q2, C1-C4 |
| Site transfer is outside v1. | Contract and handler. | C2 |
| Ingestion Identifier is non-secret and not a read credential. | Schema and auth separation. | Q2, C1, C4 |
| Rotation invalidates the old identifier. | Transactional configuration update. | C4 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `authenticated` | Current Organization member with Site visibility. | Q1-Q2 |
| `admin` | Organization Owner or Administrator with Site-management authority. | C1-C2, C4 |
| `admin` | Organization Owner-only guard. | C3 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Rotated identifier in an old tracker** — Collection returns a typed rejection; it never falls back to another Site.
- **Hostname case/trailing dot** — Normalize before uniqueness checks and persist one canonical value.
- **Deletion during backup** — Quiesce or reject the command; never produce a backup with a partially deleted Site.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated User. |
| `FORBIDDEN` | 403 | Caller lacks persisted Site-management scope. |
| `NOT_FOUND` | 404 | Site is absent or inaccessible. |
| `CONFLICT` | 409 | Hostname or lifecycle state conflicts. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `organization` / `membership` | Persisted ownership and authorization. |
| `collection-policy` | Site collection settings. |
| `public-dashboard` | Public identifier and disclosure configuration. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `event-ingestion` | Ingestion Identifier selects Site. |
| All analytics resources | Site scope. |

## 12. Out of Scope

**Audience:** Both

- Site transfer between Organizations in v1.
- DNS, hosted-domain verification, billing, or subscription management.
- Public analytics disclosure beyond the separate `public-dashboard` resource.
