---
resource: collection-policy
status: draft
version: 1.0.0
updated: 2026-08-23
---

# Collection Policy Resource

## 1. Overview & Lifecycle

**Audience:** Both

Collection Policy is the Site-scoped privacy and collection boundary evaluated before Visitor, Identified User, or Analytics Session assignment. It is not a report filter and cannot be bypassed by a server-side caller.

The effective policy is installation defaults plus an optional Site override. Changes apply to newly received Events and do not retroactively reconstruct data already stored.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `siteId` | `nanoid` | Site scope. |
| `anonymousCollection` | `collectionMode` | Default anonymous collection posture. |
| `honorGpcDnt` | `boolean` | Whether GPC/DNT disables collection. |
| `consentMode` | `consentMode` | Required consent state for opt-in identity, traits, and replay. |
| `botPolicy` | `botPolicy` | Server-side bot handling. |
| `captureQueryStrings` | `boolean` | Whether approved query metadata may be captured. |
| `urlPolicy` | `urlPolicy` | Path, referrer, query, and sensitive-value rules. |
| `propertyPolicy` | `propertyPolicy` | Scalar shape, reserved names, and size limits. |
| `profileFilterKeys` | `boundedTraitKeyRegistry` | Explicit Site-approved Identified User trait keys usable by authenticated filters. |
| `exclusions` | `collectionExclusions` | Site, path, IP-derived, country, and caller-independent exclusions. |

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getCollectionPolicy` | GET | `/getCollectionPolicy` | admin | query |
| C1 | `updateCollectionPolicy` | POST | `/updateCollectionPolicy` | admin | command |

## 4. Queries

### Q1: `GET /getCollectionPolicy` — `getCollectionPolicy`

**Audience:** Both

**Purpose:** Return the effective and Site-overridden collection policy for administrators.

**Behavior:** Redact secrets and internal classifier details. Show whether each value comes from installation default or Site override. Public callers cannot use this procedure.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

## 5. Commands

### C1: `POST /updateCollectionPolicy` — `updateCollectionPolicy`

**Audience:** Both

**Purpose:** Update Site collection and privacy settings.

**Behavior:** Owner or Administrator only. Validate policy combinations before commit. The policy is evaluated before identity/session assignment on subsequent ingestion. `profileFilterKeys` is the bounded registry for authenticated profile filters and changing it does not rewrite historical traits. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409 for incompatible lifecycle state).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Hard exclusions execute before identity and Session assignment. | Ingestion pipeline. | C1 and `event-ingestion`. |
| Client skip flags cannot override a server exclusion. | Ingestion pipeline. | `event-ingestion`. |
| Identity, Traits, and replay are opt-in capabilities. | Policy evaluation. | `event-ingestion`, `identity-profile`. |
| URL and property sanitization occurs before persistence. | Ingestion validation. | `event-ingestion`. |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `admin` | Organization Owner or Administrator with Site-management scope. | Q1, C1 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **GPC/DNT received** — Reject or minimize the Event according to the effective policy before identity creation.
- **Server-side caller omits consent context** — Do not assume consent; apply the Site policy default.
- **Policy changes while an Event is in flight** — The receiver evaluates the committed policy observed at acceptance; no partial identity/session assignment occurs.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated User. |
| `FORBIDDEN` | 403 | Caller lacks Site-management scope. |
| `NOT_FOUND` | 404 | Site is inaccessible. |
| `BAD_REQUEST` | 400 | Policy fields or combinations are invalid. |

## 11. Related Resources & Dependencies

### Depends On

| Resource | Integration Point |
| --- | --- |
| `site` | Site scope and owner. |
| `retention-policy` | Effective retention and deletion behavior. |

### Used By

| Resource | Integration Point |
| --- | --- |
| `event-ingestion` | Pre-storage exclusion and sanitization. |
| `identity-profile` | Consent and identity policy. |

## 12. Out of Scope

**Audience:** Both

- Raw IP persistence or IP-based Visitor identity.
- Broad autocapture of form values, copied text, input changes, or arbitrary request metadata.
- Session Replay or other opt-in collection capabilities not selected for the first release.
