---
resource: membership
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Membership Resource

## 1. Overview & Lifecycle

**Audience:** Both

Membership is a User's active relationship with an Organization and its role. Better Auth owns the underlying organization membership model; this resource defines the Cimi role defaults and mutation guards consumed by Site authorization.

Membership states are `active` and absent. An Owner cannot be removed or demoted without an explicit ownership-transfer capability, which is outside v1.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `organizationId` | `nanoid` | Organization scope. |
| `userId` | `userId` | Better Auth User. |
| `role` | `organizationRole` | `owner`, `admin`, or `member`. |
| `createdAt` / `updatedAt` | `coercedDate` | Membership timestamps. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `listMembers` | GET | `/listMembers` | authenticated | query |
| C1 | `changeMemberRole` | POST | `/changeMemberRole` | admin | command |
| C2 | `removeMember` | POST | `/removeMember` | admin | command |
| C3 | `leaveOrganization` | POST | `/leaveOrganization` | authenticated | command |

## 4. Queries

### Q1: `GET /listMembers` — `listMembers`

**Audience:** Both

**Purpose:** List active memberships for an Organization.

**Behavior:** Require persisted membership. Return opaque cursor pages ordered by `createdAt` plus `userId`; do not reveal whether a non-member queried a valid Organization.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

## 5. Commands

### C1: `POST /changeMemberRole` — `changeMemberRole`

**Audience:** Both

**Purpose:** Change an existing member's Organization role.

**Behavior:** Owner or Administrator may change roles, but the sole Owner cannot be changed. The target must already be a member. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `OWNER_PROTECTED` (409).

### C2: `POST /removeMember` — `removeMember`

**Audience:** Both

**Purpose:** Remove another member from an Organization.

**Behavior:** Owner or Administrator may remove a non-owner member. Removal immediately blocks persisted Organization and Site access. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `OWNER_PROTECTED` (409).

### C3: `POST /leaveOrganization` — `leaveOrganization`

**Audience:** Both

**Purpose:** Allow a member to leave an Organization.

**Behavior:** The Owner cannot leave while owning the Organization; transfer is outside v1. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `OWNER_PROTECTED` (409).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Roles are exactly Owner, Administrator, or Member. | Contract and persistence. | Q1, C1 |
| Exactly one Owner exists. | Transactional command guard. | C1-C3 |
| Membership removal revokes Site access immediately. | Persisted guard lookup. | C2-C3 and all Site resources |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `authenticated` | Current active member. | Q1, C3 |
| `admin` | Owner or Administrator. | C1-C2 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Removing the Owner** — Always reject; ownership transfer is a later capability.
- **Last Administrator leaves** — Allowed only if the Owner remains; otherwise the Owner-protection rule rejects it.
- **Removed User with stale session** — Every protected request rechecks persisted membership.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated User. |
| `FORBIDDEN` | 403 | Insufficient Organization role. |
| `NOT_FOUND` | 404 | Organization or target membership is inaccessible. |
| `OWNER_PROTECTED` | 409 | Operation would remove or demote the sole Owner. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| Better Auth organization membership | Membership persistence and principal identity. |
| `organization` | Organization lifecycle. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `site` | Organization and Site authorization. |
| All authenticated analytics resources | Persisted scope guard. |
