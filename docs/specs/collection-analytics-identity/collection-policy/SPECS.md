---
resource: collection-policy
status: draft
version: 1.0.0
updated: 2026-08-24
---

# Collection Policy Resource

## 1. Overview & Lifecycle

**Audience:** Both

Collection Policy is the privacy and collection boundary evaluated before Visitor, Identified User, or Analytics Session assignment. Installation defaults and an optional Site override are distinct scopes; the effective policy returned for a Site is always Site-scoped. It is not a report filter and cannot be bypassed by a server-side caller.

The effective policy is installation defaults plus an optional Site override. Anonymous cookieless collection is the default posture; explicit identity, Traits, and replay require caller opt-in. Changes apply to newly received Events and do not retroactively reconstruct data already stored.

## 2. Base Schema

**Audience:** Both

| Field | Schema | Description |
| --- | --- | --- |
| `scope` | `installation` or `site` | Discriminator for an installation default or Site override. |
| `siteId` | `nanoid` | Required only for a Site-scoped policy. |
| `anonymousCollection` | `collectionMode` | Default anonymous cookieless collection posture. |
| `honorGpcDnt` | `boolean` | Whether GPC/DNT suppresses collection unless explicitly overridden by the Site. |
| `consentMode` | `consentMode` | Whether consent is required for identity/Traits/replay or for all collection. |
| `botPolicy` | `botPolicy` | Server-side bot handling. |
| `captureQueryStrings` | `boolean` | Whether approved query metadata may be captured. |
| `urlPolicy` | `urlPolicy` | Path, referrer, query, and sensitive-value rules. |
| `propertyPolicy` | `propertyPolicy` | Scalar shape, reserved names, and size limits. |
| `profileFilterKeys` | `boundedTraitKeyRegistry` | Explicit Site-approved Identified User trait keys usable by authenticated filters. |
| `exclusions` | `collectionExclusions` | Site, path, IP-derived, country, and caller-independent exclusions. |

### Collection context transport

`collectionContext` is an optional strict request object with `consent` (`granted` or `denied`), `gpc` (boolean), and `dnt` (boolean). An omitted `consent` means that no opt-in was supplied; it is never treated as granted. An omitted `gpc` or `dnt` means that signal was not received. `true` means the corresponding privacy signal is active.

For `collectEvent`, `collectionContext` is part of the singular request. For `collectEvents`, it appears once on the request envelope and applies to every item; item-level context is invalid. `identify` uses the same request object. `consent: denied` is an explicit opt-out; omitted consent is allowed only where the effective policy does not require opt-in. `required_for_identity` permits an otherwise valid Event to remain anonymous when consent is omitted or denied, but refuses `identify`, Traits, and explicit identity references; `required_for_all` refuses collection unless consent is `granted`. The `none` mode permits omitted consent for anonymous collection, but an explicit denial still refuses collection.

When `honorGpcDnt` is true, either active signal suppresses collection before acceptance, identity, or Session creation and returns the generic policy refusal. When it is false, the Site has explicitly overridden those signals and they do not suppress collection. No client or server request field can override a committed Site policy.

## 3. Endpoint Quick Index

**Audience:** FE

| # | Procedure | Method | Path | Auth | CQRS |
| --- | --- | --- | --- | --- | --- |
| Q1 | `getCollectionPolicy` | GET | `/getCollectionPolicy` | admin | query |
| C1 | `updateCollectionPolicy` | POST | `/updateCollectionPolicy` | scope-dependent admin | command |

## 4. Queries

### Q1: `GET /getCollectionPolicy` — `getCollectionPolicy`

**Audience:** Both

**Purpose:** Return the effective and Site-overridden collection policy for administrators.

**Behavior:** Redact secrets and internal classifier details. Show whether each effective policy value comes from installation default or Site override. The `source` object has exactly one provenance entry for each effective policy field (`anonymousCollection`, `honorGpcDnt`, `consentMode`, `botPolicy`, `captureQueryStrings`, `urlPolicy`, `propertyPolicy`, `profileFilterKeys`, and `exclusions`); no third `default` origin and no missing or unknown provenance keys are valid. Public callers cannot use this procedure.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404).

## 5. Commands

### C1: `POST /updateCollectionPolicy` — `updateCollectionPolicy`

**Audience:** Both

**Purpose:** Update an installation default or a Site collection and privacy override.

**Behavior:** The input is discriminated by `scope`. The `installation` branch has no Site ID and requires installation-admin authority. The `site` branch requires a Site ID in the policy and Owner or Administrator Site-management authority. Validate policy combinations before commit. The policy is evaluated before identity/Session assignment on subsequent ingestion. `profileFilterKeys` is the bounded registry for authenticated profile filters and changing it does not rewrite historical traits. Return 200.

**Events Emitted:** None in MVP.

**Errors:** `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `BAD_REQUEST` (400), `CONFLICT` (409 for incompatible lifecycle state).

## 6. Business Rules

| Rule | Enforcement Point | Affected Procedures |
| --- | --- | --- |
| Hard exclusions execute before identity and Session assignment. | Ingestion pipeline. | C1 and `event-ingestion`. |
| Client skip flags cannot override a server exclusion. | Ingestion pipeline. | `event-ingestion`. |
| Identity, Traits, and replay are opt-in capabilities; opt-out clears client identity/session state. | Policy evaluation. | `event-ingestion`, `identity-profile`. |
| URL and property sanitization occurs before persistence. | Ingestion validation. | `event-ingestion`. |

## 7. Authorization Matrix

| Auth Level | Meaning | Procedures |
| --- | --- | --- |
| `installation-admin` | Installation administrator; may update only the installation-default branch. | C1 |
| `admin` | Organization Owner or Administrator with Site-management scope; may update only the Site-override branch. | Q1, C1 |

## 8. Event Catalog

**Audience:** BE

No domain event channel is required by the MVP contract.

## 9. Edge Cases

**Audience:** Both

- **GPC/DNT received** — `gpc: true` or `dnt: true` is honored only when `honorGpcDnt` is true; then suppress the Event with the generic policy refusal before acceptance, identity, or Session creation.
- **Server-side caller omits consent context** — Treat consent as not granted, treat GPC/DNT as absent, and apply the effective Site policy. The request cannot bypass a required opt-in.
- **Batch consent context** — One envelope-level `collectionContext` applies to every Event; a per-item context is invalid.
- **Policy changes while an Event is in flight** — The receiver evaluates the committed policy observed at acceptance; no partial identity/session assignment occurs.

## 10. Error Code Catalog

| Code | HTTP | Trigger |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | No authenticated User. |
| `FORBIDDEN` | 403 | Caller lacks Site-management scope. |
| `NOT_FOUND` | 404 | Site is inaccessible. |
| `BAD_REQUEST` | 400 | Policy fields or combinations are invalid. |
| `CONFLICT` | 409 | Policy mutation conflicts with the Site lifecycle or another committed policy change. |

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
