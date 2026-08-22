---
resource: invitation
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Invitation Resource

## 1. Overview & Lifecycle

**Audience:** Both

An Invitation is a single-use bearer link for joining one Organization with one fixed role. It is created by an Owner or Administrator and becomes consumed, expired, or revoked.

```text
pending -> accepted
pending -> expired
pending -> revoked
```

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `id` | `nanoid` | Invitation identifier. |
| `organizationId` | `nanoid` | Target Organization. |
| `role` | `organizationRoleWithoutOwner` | Fixed `admin` or `member` role. |
| `token` | `opaqueBearer` | Returned only at creation; stored hashed. |
| `expiresAt` | `coercedDate` | Seven days after creation. |
| `status` | `invitationStatus` | `pending`, `accepted`, `expired`, or `revoked`. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `listInvitations` | GET | `/listInvitations` | admin | query |
| C1 | `createInvitation` | POST | `/createInvitation` | admin | command |
| C2 | `revokeInvitation` | POST | `/revokeInvitation` | admin | command |
| C3 | `acceptInvitation` | POST | `/acceptInvitation` | authenticated | command |

## 4. Queries

### Q1: `GET /listInvitations` — `listInvitations`

**Audience:** Both

**Purpose:** List pending and historical invitations for an Organization.

**Behavior:** Return token-free records with opaque cursor pagination. Expired pending invitations are reported as expired on read and cannot be accepted.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400).

## 5. Commands

### C1: `POST /createInvitation` — `createInvitation`

**Audience:** Both

**Purpose:** Create a seven-day, single-use invitation with a fixed non-owner role.

**Behavior:** Return the bearer token exactly once. Store only its hash. Reissuing creates a new invitation and does not mutate an existing token. Return 201.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400).

### C2: `POST /revokeInvitation` — `revokeInvitation`

**Audience:** Both

**Purpose:** Revoke a pending invitation.

**Behavior:** Revocation is fail-closed and idempotent for an already revoked or expired invitation. Accepted invitations cannot be revoked. Return 204.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INVITATION_CONSUMED` (409).

### C3: `POST /acceptInvitation` — `acceptInvitation`

**Audience:** Both

**Purpose:** Consume a bearer link after the recipient authenticates and create the fixed-role membership.

**Behavior:** Require an authenticated User. Hash-compare the token, verify pending/non-expired state, create membership transactionally, and mark accepted. A token cannot be replayed. Return the resulting membership.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `NOT_FOUND` (404 for invalid/expired/revoked token), `CONFLICT` (409 for existing incompatible membership).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Expiry is seven days from creation. | Server timestamp and command guard. | Q1, C3 |
| Token is single-use and stored hashed. | Transaction and persistence. | C1, C3 |
| Invitation cannot grant Owner. | Contract validation. | C1 |
| Acceptance and membership creation are atomic. | Database transaction. | C3 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `admin` | Organization Owner or Administrator. | Q1, C1-C2 |
| `authenticated` | Authenticated recipient. | C3 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Forwarded token** — The token is a bearer capability; the authenticated acceptor becomes the member.
- **Repeated acceptance** — Return `NOT_FOUND` after consumption; do not disclose the prior acceptor.
- **Existing member** — Do not create duplicate membership; return a conflict if the requested role differs.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | Recipient is not authenticated. |
| `FORBIDDEN` | 403 | Caller lacks invitation management role. |
| `NOT_FOUND` | 404 | Token is invalid, expired, revoked, or unknown. |
| `INVITATION_CONSUMED` | 409 | Revoke attempted after acceptance. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `organization` | Target Organization lifecycle. |
| `membership` | Atomic membership creation. |
| Better Auth User | Authenticated recipient. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `membership` | Accept creates membership. |
