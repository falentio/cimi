---
resource: membership
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Membership Resource

## 1. Overview & Lifecycle

**Audience:** Both

Membership is a User's active relationship with an Organization and its role. Better Auth owns the underlying Organization membership authority; Cimi reconciles one persisted `(organizationId, userId)` membership pair and defines the role defaults and mutation guards consumed by Site authorization.

Membership states are `active` and absent. Ownership transfer is an explicit Owner-controlled lifecycle operation, not an ordinary role change. An Owner cannot be removed, demoted, or leave until ownership is transferred to another active member.

## 2. Base Schema

**Audience:** Both

| Field                     | Schema             | Description                                                          |
| ------------------------- | ------------------ | -------------------------------------------------------------------- |
| `organizationId`          | `SId`              | Organization scope.                                                  |
| `userId`                  | `SId`              | Better Auth User identifier represented as an opaque bounded string. |
| `role`                    | `organizationRole` | `owner`, `admin`, or `member`.                                       |
| `createdAt` / `updatedAt` | `SDateTime`        | Membership timestamps.                                               |

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure                       | Method | Path                                        | Auth          | CQRS    |
| --- | ------------------------------- | ------ | ------------------------------------------- | ------------- | ------- |
| Q1  | `listMembers`                   | GET    | `/membership/listMembers`                   | authenticated | query   |
| C1  | `changeMemberRole`              | POST   | `/membership/changeMemberRole`              | admin         | command |
| C2  | `removeMember`                  | POST   | `/membership/removeMember`                  | admin         | command |
| C3  | `leaveOrganization`             | POST   | `/membership/leaveOrganization`             | authenticated | command |
| C4  | `transferOrganizationOwnership` | POST   | `/membership/transferOrganizationOwnership` | owner         | command |

## 4. Queries

### Q1: `GET /membership/listMembers` — `listMembers`

**Audience:** Both

**Purpose:** List active memberships for an Organization.

**Behavior:** Require persisted membership. Return zero-based live offset pages ordered by `createdAt` plus `userId`, with `nextOffset`, `hasMore`, and `totalCount`; do not reveal whether a non-member queried a valid Organization.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `BAD_REQUEST` (400), `INTERNAL_SERVER_ERROR` (500).

## 5. Commands

### C1: `POST /membership/changeMemberRole` — `changeMemberRole`

**Audience:** Both

**Purpose:** Change an existing member's Organization role.

**Behavior:** Owner or Administrator may change an existing member only to `admin` or `member`; ownership changes require C4. The sole Owner cannot be changed by this procedure. The target must already be a member. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `OWNER_PROTECTED` (409).

### C2: `POST /membership/removeMember` — `removeMember`

**Audience:** Both

**Purpose:** Remove another member from an Organization.

**Behavior:** Owner or Administrator may remove a non-owner member. Removal immediately blocks persisted Organization and Site access. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `OWNER_PROTECTED` (409).

### C3: `POST /membership/leaveOrganization` — `leaveOrganization`

**Audience:** Both

**Purpose:** Allow a member to leave an Organization.

**Behavior:** The Owner cannot leave while owning the Organization; the Owner must first transfer ownership with C4. Other active members may leave. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404), `OWNER_PROTECTED` (409).

### C4: `POST /membership/transferOrganizationOwnership` — `transferOrganizationOwnership`

**Audience:** Both

**Purpose:** Transfer Organization ownership to an existing active member.

**Behavior:** Only the current Owner may transfer ownership. The target must be an active non-owner member of the same Organization. Promote the target to `owner` and demote the previous Owner to `admin` atomically, preserving exactly one Owner. Return the complete promoted Owner Membership with 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404 for an inaccessible or absent target membership), `CONFLICT` (409 when the target is not an active non-owner member or the transfer cannot complete atomically).

## 6. Business Rules

| Rule                                                                                                       | Enforcement Point                       | Affected Procedures          |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------- |
| Roles are exactly Owner, Administrator, or Member; role-change input accepts only Administrator or Member. | Contract and persistence.               | Q1, C1                       |
| Exactly one Owner exists.                                                                                  | Transactional command guard.            | C1-C4                        |
| Ownership changes only through an explicit Owner-controlled transfer.                                      | Transaction and role guard.             | C1-C4                        |
| Better Auth remains membership authority and Cimi reconciles a unique `(organizationId, userId)` pair.     | Auth integration and persistence guard. | Q1-C4                        |
| Membership removal revokes Site access immediately.                                                        | Persisted guard lookup.                 | C2-C3 and all Site resources |

## 7. Authorization Matrix

| Auth Level      | Meaning                     | Procedures |
| --------------- | --------------------------- | ---------- |
| `authenticated` | Current active member.      | Q1, C3     |
| `admin`         | Owner or Administrator.     | C1-C2      |
| `owner`         | Current Organization Owner. | C4         |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Removing or demoting the Owner** — Always reject until a successful ownership transfer makes another active member the Owner.
- **Ownership transfer target** — Reject an absent, inactive, or already-owner target without changing either membership; a successful transfer leaves exactly one Owner.
- **Last Administrator leaves** — Allowed only if the Owner remains; otherwise the Owner-protection rule rejects it.
- **Removed User with stale session** — Every protected request rechecks persisted membership.

## 10. Error Code Catalog

| Code                    | HTTP | Trigger                                                                                              |
| ----------------------- | ---: | ---------------------------------------------------------------------------------------------------- |
| `UNAUTHORIZED`          |  401 | No authenticated User.                                                                               |
| `FORBIDDEN`             |  403 | Insufficient Organization role.                                                                      |
| `NOT_FOUND`             |  404 | Organization or target membership is inaccessible.                                                   |
| `OWNER_PROTECTED`       |  409 | Ordinary role-change, removal, or leave operation would remove or demote the sole Owner.             |
| `CONFLICT`              |  409 | Ownership transfer target is not an active non-owner member, or the atomic transfer cannot complete. |
| `BAD_REQUEST`           |  400 | Role, pagination, or other membership input is invalid.                                              |
| `INTERNAL_SERVER_ERROR` |  500 | A provider or persistence failure cannot be exposed safely.                                          |

## 11. Related Resources & Dependencies

### Depends On

| Resource                            | Integration Point                              |
| ----------------------------------- | ---------------------------------------------- |
| Better Auth organization membership | Membership persistence and principal identity. |
| `organization`                      | Organization lifecycle.                        |

### Used By

| Resource                              | Integration Point                    |
| ------------------------------------- | ------------------------------------ |
| `site`                                | Organization and Site authorization. |
| All authenticated analytics resources | Persisted scope guard.               |

## 12. Out of Scope

**Audience:** Both

- Authentication/session protocol mechanics owned by Better Auth.
- Billing membership or cross-Organization invitations.
- Site-specific authorization rules beyond the persisted membership guard.
