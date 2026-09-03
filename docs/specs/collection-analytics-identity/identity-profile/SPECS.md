---
resource: identity-profile
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Identity Profile Resource

## 1. Overview & Lifecycle

**Audience:** Both

An Identity Profile represents one explicit Site-scoped Identified User with bounded scalar Traits and Aliases. It is never inferred from Better Auth, email discovery, URL metadata, or event properties. A profile ID remains reserved from deletion request through completed cleanup; a later explicit re-identification starts a new Profile Epoch.

```text
active -> deletion-requested -> deleting -> deleted
```

Deletion is asynchronous and must invalidate or recompute affected derived results, including profile listings, cohorts, Goals, Funnels, and retention reports. `profileMonths` expiry applies the same Identity Redaction without a user request: profile, alias, trait, and identity linkage are removed through a SQLite overlay without rewriting accepted Event sequence history; retained non-personal Event activity may continue anonymously. Re-identification after expiry or completed deletion starts a new Profile Epoch and never restores the prior linkage.

## 2. Base Schema

Persistence permits at most one active epoch per Profile. Identity links and redaction rows must resolve to the Profile and epoch they claim; Site and Identified User scope are validated in the same identity transaction.

**Audience:** Both

| Field                        | Schema                                    | Description                                                                                                       |
| ---------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `siteId`                     | `SId`                                     | Site scope.                                                                                                       |
| `identifiedUserId`           | `opaqueUserId`                            | Application-supplied stable opaque identifier.                                                                    |
| `traits`                     | `scalarTraitMap`                          | Bounded string, number, boolean, or null values. The compact JSON serialization is at most 16 KiB of UTF-8 bytes. |
| `aliases`                    | `aliasList`                               | Site-scoped Anonymous Identity links.                                                                             |
| `status`                     | `profileDeletionStatus`                   | Active or deletion lifecycle state.                                                                               |
| `profileEpoch`               | positive integer (active only)            | Current Profile Epoch number; a later re-identification after redaction uses a higher number.                     |
| `identityHistory`            | bounded `profileEpoch` list (active only) | At most 32 typed epochs. Active epochs have `endedAt: null`; redacted epochs have an end timestamp.               |
| `firstSeenAt` / `lastSeenAt` | `SDateTime`                               | Derived activity timestamps.                                                                                      |
| `createdAt` / `updatedAt`    | `SDateTime`                               | Profile lifecycle timestamps.                                                                                     |

## 3. Endpoint Quick Index

**Audience:** FE

| #   | Procedure                | Method | Path                                       | Auth          | CQRS    |
| --- | ------------------------ | ------ | ------------------------------------------ | ------------- | ------- |
| Q1  | `listProfiles`           | GET    | `/identity-profile/listProfiles`           | authenticated | query   |
| Q2  | `getProfile`             | GET    | `/identity-profile/getProfile`             | authenticated | query   |
| Q3  | `getDeletionStatus`      | GET    | `/identity-profile/getDeletionStatus`      | authenticated | query   |
| C1  | `identify`               | POST   | `/identity-profile/identify`               | public        | command |
| C2  | `requestProfileDeletion` | POST   | `/identity-profile/requestProfileDeletion` | admin         | command |

## 4. Queries

### Q1: `GET /identity-profile/listProfiles` — `listProfiles`

**Audience:** Both

**Purpose:** Explore explicit Identified User profiles within a Site.

**Behavior:** Require persisted Site scope. Use zero-based live offset pages ordered by `createdAt` plus `identifiedUserId`, returning `nextOffset`, `hasMore`, and `totalCount`. Active profiles include bounded typed Profile Epoch history. Profiles in `deletion-requested`, `deleting`, or `deleted` state return exactly `{ status }`; do not expose Site ID, Identified User ID, traits, aliases, identity history, raw IP, hidden identity fingerprints, lifecycle timestamps, or unapproved trait values.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400).

### Q2: `GET /identity-profile/getProfile` — `getProfile`

**Audience:** Both

**Purpose:** Return one Site-scoped profile and its bounded identity history.

**Behavior:** A missing or inaccessible profile returns `NOT_FOUND`. An active profile includes its current Profile Epoch and bounded identity history. Profiles in any non-active deletion state are represented by exactly `{ status }`; traits, aliases, identity history, identifiers, and lifecycle timestamps are not returned.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

### Q3: `GET /identity-profile/getDeletionStatus` — `getDeletionStatus`

**Audience:** Both

**Purpose:** Report asynchronous deletion progress without returning deleted data.

**Behavior:** Status is monotonic. Return independent `derivedCleanup` and `backupCleanup` objects, each with `status` (`not-required`, `pending`, or `complete`) and `updatedAt`. Completion means active profile data and required derived results are invalidated, the Identity Redaction overlay is durable, and retained eligible Event activity is no longer linked to the profile. Historical backups follow the documented backup deletion boundary and may remain `pending` after derived cleanup is complete.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

## 5. Commands

### C1: `POST /identity-profile/identify` — `identify`

**Audience:** Both

**Purpose:** Explicitly identify an application user and attach bounded Traits, optionally without an Event.

**Behavior:** Require the Ingestion Identifier to resolve an `active` Site and reuse the same identity validation and privacy policy as Event ingestion. `collectionContext` carries consent and GPC/DNT metadata; omitted consent is not an opt-in. Link the current Anonymous Identity to the supplied Identified User for the current Analytics Session from its beginning plus future Events; do not relabel unrelated anonymous history. One Anonymous Identity may link to at most one Identified User at a time. Null Traits remove values. The compact JSON UTF-8 serialization of `traits` must be at most 16 KiB; exceeding it returns `PAYLOAD_TOO_LARGE`. Reject identification while the profile is `deletion-requested`, `deleting`, or `deleted`, and reserve the ID until cleanup completes; a later accepted identification starts a new Profile Epoch. The request is not Cimi authentication and is not idempotent beyond convergent upsert of the same active identity/traits.

**Events Emitted:** None in MVP.

**Errors:** `BAD_REQUEST` (400), `FORBIDDEN` (403 for generic collection-policy refusal), `NOT_FOUND` (404 for invalid Ingestion Identifier or non-active Site), `CONFLICT` (409 for a profile in deletion), `PAYLOAD_TOO_LARGE` (413), `TOO_MANY_REQUESTS` (429).

### C2: `POST /identity-profile/requestProfileDeletion` — `requestProfileDeletion`

**Audience:** Both

**Purpose:** Request asynchronous hard deletion of one Site-scoped Identified User.

**Behavior:** Owner or Administrator only in v1. A profile already in `deletion-requested`, `deleting`, or `deleted` state returns `CONFLICT`; the ID remains reserved through cleanup. Otherwise mark the profile `deletion-requested`, prevent new trait writes, append the Identity Redaction intent, enqueue deletion of profile/alias links and derived results, and return 202 with status. Processing then enters `deleting` and completes at `deleted`. Eligible retained Events are reclassified as anonymous after the overlay is applied. `clearIdentity` or opt-out does not count as deletion.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409 if already `deletion-requested`, `deleting`, or `deleted`, or while the ID remains reserved for cleanup).

## 6. Business Rules

| Rule                                                                                                                                                                        | Enforcement Point                 | Affected Procedures |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------- |
| Identified IDs are explicit opaque Site-scoped values.                                                                                                                      | Contract and ingestion policy.    | C1, Q1-Q2           |
| Traits are bounded scalar values only, have a bounded serialized size, and never contain secrets, credentials, payment data, or prohibited sensitive categories.            | Strict schema and policy.         | C1                  |
| Current Session from its beginning plus future Events are linked; unrelated history is not merged, and one Anonymous Identity has at most one current Identified User link. | Identity/session transaction.     | C1                  |
| `profileMonths` expiry and explicit deletion both redact profile-dependent meaning while retained non-personal Events may remain anonymous.                                 | Retention and identity lifecycle. | C1-C2, Q1-Q3        |
| Deletion is asynchronous, reserves the ID through cleanup, and is derived-result aware.                                                                                     | Deletion worker/status contract.  | C2-Q3               |

## 7. Authorization Matrix

| Auth Level      | Meaning                                                                       | Procedures |
| --------------- | ----------------------------------------------------------------------------- | ---------- |
| `public`        | Valid Site Ingestion Identifier plus the ingestion guard; no dashboard reads. | C1         |
| `authenticated` | Current member with Site read scope.                                          | Q1-Q3      |
| `admin`         | Organization Owner or Administrator with Site deletion authority.             | C2         |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **Same opaque ID from two devices** — Link each device's Site-scoped Alias to the same profile; do not merge Anonymous Identities into one browser key.
- **Identify after opt-out** — Apply the effective collection policy; do not create or mutate identity while collection is disabled.
- **Trait contains email/name** — Treat it as caller-supplied personal data; accept only when policy permits, within the serialized trait bound, and expose only to authenticated Site members. Secrets, credentials, payment data, and sensitive categories are prohibited.
- **Deletion during reporting** — Reports exclude `deletion-requested`, `deleting`, and `deleted` profile data and converge as derived invalidation completes; eligible non-personal Event fields may remain anonymous.
- **Redacted historical Event** — The Event remains eligible for anonymous Site analytics only when its remaining fields are not personal; Identified User-specific reports exclude it.

## 10. Error Code Catalog

| Code                | HTTP | Trigger                                                                                                                      |
| ------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------- |
| `BAD_REQUEST`       |  400 | Identity or Trait shape is invalid.                                                                                          |
| `FORBIDDEN`         |  403 | Caller lacks Site profile-management scope.                                                                                  |
| `NOT_FOUND`         |  404 | Site or profile is inaccessible.                                                                                             |
| `CONFLICT`          |  409 | Profile status is `deletion-requested`, `deleting`, or `deleted`, or the requested identity ID remains reserved for cleanup. |
| `PAYLOAD_TOO_LARGE` |  413 | Compact JSON UTF-8 Trait serialization exceeds 16 KiB.                                                                       |
| `TOO_MANY_REQUESTS` |  429 | Identity mutation protection is exceeded.                                                                                    |

## 11. Related Resources & Dependencies

### Depends On

| Resource            | Integration Point                             |
| ------------------- | --------------------------------------------- |
| `site`              | Site scope and Ingestion Identifier.          |
| `collection-policy` | Consent, opt-in, and property limits.         |
| `event-ingestion`   | Shared identity validation and Event context. |
| `retention-policy`  | Profile and derived-result lifecycle.         |

### Used By

| Resource                             | Integration Point                               |
| ------------------------------------ | ----------------------------------------------- |
| `traffic-report`, `event-report`     | Profile filtering and attribution.              |
| `goal`, `funnel`, `cohort-retention` | Identified behavior and deletion-aware results. |

## 12. Out of Scope

**Audience:** Both

- Linking an Identified User to a Better Auth User or inferred email identity.
- Cross-Site identity graphs, raw IP identity, or device fingerprinting.
- End-user self-service deletion workflows outside the Site administrator command.
