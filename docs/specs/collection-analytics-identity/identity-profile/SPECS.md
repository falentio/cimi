---
resource: identity-profile
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Identity Profile Resource

## 1. Overview & Lifecycle

**Audience:** Both

An Identity Profile represents one explicit Site-scoped Identified User with bounded scalar Traits and Aliases. It is never inferred from Better Auth, email discovery, URL metadata, or event properties.

```text
active -> deletion-requested -> deleting -> deleted
```

Deletion is asynchronous and must invalidate or recompute affected derived results, including profile listings, cohorts, Goals, Funnels, and retention reports.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `siteId` | `nanoid` | Site scope. |
| `identifiedUserId` | `opaqueUserId` | Application-supplied stable opaque identifier. |
| `traits` | `scalarTraitMap` | Bounded string, number, boolean, or null values. |
| `aliases` | `aliasList` | Site-scoped Anonymous Identity links. |
| `status` | `profileDeletionStatus` | Active or deletion lifecycle state. |
| `firstSeenAt` / `lastSeenAt` | `coercedDate` | Derived activity timestamps. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `listProfiles` | GET | `/listProfiles` | authenticated | query |
| Q2 | `getProfile` | GET | `/getProfile` | authenticated | query |
| Q3 | `getDeletionStatus` | GET | `/getDeletionStatus` | authenticated | query |
| C1 | `identify` | POST | `/identify` | public | command |
| C2 | `requestProfileDeletion` | POST | `/requestProfileDeletion` | admin | command |

## 4. Queries

### Q1: `GET /listProfiles` — `listProfiles`

**Audience:** Both

**Purpose:** Explore explicit Identified User profiles within a Site.

**Behavior:** Require persisted Site scope. Use opaque cursors ordered by `createdAt` plus `identifiedUserId`. Do not expose raw IP, hidden identity fingerprints, or unapproved trait values.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400).

### Q2: `GET /getProfile` — `getProfile`

**Audience:** Both

**Purpose:** Return one Site-scoped profile and its bounded identity history.

**Behavior:** A missing or inaccessible profile returns `NOT_FOUND`. Deleting profiles are represented by deletion status, not raw data.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

### Q3: `GET /getDeletionStatus` — `getDeletionStatus`

**Audience:** Both

**Purpose:** Report asynchronous deletion progress without returning deleted data.

**Behavior:** Status is monotonic. Completion means active profile data and required derived results are invalidated; backups follow the documented backup deletion boundary.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

## 5. Commands

### C1: `POST /identify` — `identify`

**Audience:** Both

**Purpose:** Explicitly identify an application user and attach bounded Traits, optionally without an Event.

**Behavior:** Reuse the same identity validation and privacy policy as Event ingestion. Link the current Anonymous Identity to the supplied Identified User for the current Analytics Session plus future Events; do not relabel unrelated anonymous history. Null Traits remove values. The request is not Cimi authentication and is not idempotent beyond convergent upsert of the same identity/traits.

**Events Emitted:** None in MVP.

**Errors:** `BAD_REQUEST` (400), `NOT_FOUND` (404 for invalid Ingestion Identifier), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429).

### C2: `POST /requestProfileDeletion` — `requestProfileDeletion`

**Audience:** Both

**Purpose:** Request asynchronous hard deletion of one Site-scoped Identified User.

**Behavior:** Owner or Administrator only in v1. Mark the profile deleting, prevent new trait writes, enqueue deletion of profile/alias links and derived results, and return 202 with status. `clearIdentity` or opt-out does not count as deletion.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409 if already deleting/deleted).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Identified IDs are explicit opaque Site-scoped values. | Contract and ingestion policy. | C1, Q1-Q2 |
| Traits are bounded scalar values only. | Strict schema and policy. | C1 |
| Current Session plus future Events are linked; unrelated history is not merged. | Identity/session transaction. | C1 |
| Deletion is asynchronous and derived-result aware. | Deletion worker/status contract. | C2-Q3 |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `public` | Valid Site Ingestion Identifier plus the ingestion guard; no dashboard reads. | C1 |
| `authenticated` | Current member with Site read scope. | Q1-Q3 |
| `admin` | Organization Owner or Administrator with Site deletion authority. | C2 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Same opaque ID from two devices** — Link each device's Site-scoped Alias to the same profile; do not merge Anonymous Identities into one browser key.
- **Identify after opt-out** — Apply the effective collection policy; do not create or mutate identity while collection is disabled.
- **Trait contains email/name** — Treat it as caller-supplied personal data; accept only when policy permits and expose only to authenticated Site members.
- **Deletion during reporting** — Reports exclude deleting/deleted profile data and converge as derived invalidation completes.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `BAD_REQUEST` | 400 | Identity or Trait shape is invalid. |
| `FORBIDDEN` | 403 | Caller lacks Site profile-management scope. |
| `NOT_FOUND` | 404 | Site or profile is inaccessible. |
| `CONFLICT` | 409 | Profile is already in a terminal deletion lifecycle. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `site` | Site scope and Ingestion Identifier. |
| `collection-policy` | Consent, opt-in, and property limits. |
| `event-ingestion` | Shared identity validation and Event context. |
| `retention-policy` | Profile and derived-result lifecycle. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `traffic-report`, `event-report` | Profile filtering and attribution. |
| `goal`, `funnel`, `cohort-retention` | Identified behavior and deletion-aware results. |
