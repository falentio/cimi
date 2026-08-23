---
resource: organization
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Organization Resource

## 1. Overview & Lifecycle

**Audience:** Both

An Organization is the collaborative ownership boundary for Sites. Better Auth owns authentication and membership primitives; this resource owns Cimi's persisted Organization meaning, Personal Organization rule, Site ownership relationship, and lifecycle guards.

Organizations are active after creation. A Personal Organization is provisioned lazily on the first authenticated dashboard open and cannot be deleted while it owns a Site.

## 2. Base Schema

**Audience:** Both

### Server-Generated Fields

`id`, `ownerUserId`, `isPersonal`, `createdAt`, and `updatedAt` are server-controlled.

### Field Reference

| Field | Schema | Description |
| --- | --- | --- |
| `id` | `nanoid` | Stable Organization identifier. |
| `name` | `string256` | Human-readable Organization name. |
| `ownerUserId` | `userId` | Better Auth User who owns the Organization. |
| `isPersonal` | `boolean` | Whether lazy Personal Organization rules apply. |
| `createdAt` / `updatedAt` | `coercedDate` | Lifecycle timestamps. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `listOrganizations` | GET | `/listOrganizations` | authenticated | query |
| Q2 | `getOrganization` | GET | `/getOrganization` | authenticated | query |
| C1 | `ensurePersonalOrganization` | POST | `/ensurePersonalOrganization` | authenticated | command |
| C2 | `createOrganization` | POST | `/createOrganization` | authenticated | command |
| C3 | `updateOrganization` | POST | `/updateOrganization` | admin | command |
| C4 | `deleteOrganization` | POST | `/deleteOrganization` | admin | command |

## 4. Queries

### Q1: `GET /listOrganizations` — `listOrganizations`

**Audience:** Both

**Purpose:** List Organizations in which the authenticated User has persisted membership.

**Behavior:** Return only current memberships. Use zero-based live offset pagination ordered by `createdAt` plus Organization ID, with `nextOffset`, `hasMore`, and `totalCount`. The active Organization is not used as an authorization source.

**Errors:** `UNAUTHORIZED` (401), `BAD_REQUEST` (400 for invalid offset, limit, or sort), `INTERNAL_SERVER_ERROR` (500).

### Q2: `GET /getOrganization` — `getOrganization`

**Audience:** Both

**Purpose:** Return one Organization after persisted membership authorization.

**Behavior:** A missing or inaccessible identifier returns the same `NOT_FOUND` response to avoid membership enumeration.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400).

## 5. Commands

### C1: `POST /ensurePersonalOrganization` — `ensurePersonalOrganization`

**Audience:** Both

**Purpose:** Idempotently obtain the authenticated User's Personal Organization.

**Behavior:** Concurrent calls converge on one Personal Organization. Existing Organizations are never relabeled Personal. Return 200 for both creation and reuse.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `CONFLICT` (409 if persisted ownership invariants cannot be reconciled), `INTERNAL_SERVER_ERROR` (500).

### C2: `POST /createOrganization` — `createOrganization`

**Audience:** Both

**Purpose:** Create a non-personal collaborative Organization and initial Owner membership.

**Behavior:** The authenticated User becomes the sole Owner. No Site is implicitly created. Return 201.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `BAD_REQUEST` (400), `CONFLICT` (409), `INTERNAL_SERVER_ERROR` (500).

### C3: `POST /updateOrganization` — `updateOrganization`

**Audience:** Both

**Purpose:** Update mutable Organization metadata.

**Behavior:** Only the Owner or Administrator may update it. Personal status and Owner identity cannot be changed by this procedure. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400).

### C4: `POST /deleteOrganization` — `deleteOrganization`

**Audience:** Both

**Purpose:** Delete an Organization that has no owned Sites.

**Behavior:** Only the Owner may delete. Personal Organizations and Organizations with Sites are rejected; deletion is not a cascade. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `ORGANIZATION_NOT_EMPTY` (409), `PERSONAL_ORGANIZATION_PROTECTED` (409).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Every Organization has exactly one Owner. | Persistence and command transaction. | C1-C4 |
| Personal Organization creation is lazy and convergent. | Transactional unique ownership constraint. | C1 |
| An Organization cannot be deleted while it owns a Site. | Command guard. | C4 |
| Active Organization is navigation only. | Authorization middleware. | Q1-Q2, C3-C4 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `authenticated` | Authenticated User with persisted membership. | Q1-Q2, C1-C2 |
| `admin` | Organization Owner or Administrator. | C3 |
| `admin` | Organization Owner-only guard. | C4 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract. State changes remain transactionally persisted.

## 9. Edge Cases

**Audience:** Both

- **Concurrent first dashboard opens** — Both calls ensure the same Personal Organization; neither creates a duplicate.
- **Delete with Sites** — Reject without deleting memberships, Sites, or analytics.
- **Stale active Organization** — Re-resolve persisted membership; never trust the session navigation value.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated User. |
| `FORBIDDEN` | 403 | User lacks the required Organization role. |
| `NOT_FOUND` | 404 | Organization is absent or inaccessible. |
| `ORGANIZATION_NOT_EMPTY` | 409 | Organization still owns a Site. |
| `PERSONAL_ORGANIZATION_PROTECTED` | 409 | Personal Organization deletion requested. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| Better Auth User | Authenticated principal and User identity. |
| `membership` | Persisted Organization access. |
| `site` | Deletion guard. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `site` | Organization ownership. |
| All protected resources | Scope authorization. |
