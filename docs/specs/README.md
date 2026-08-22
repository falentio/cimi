# Cimi Resource Specifications

These specifications are the normative planning contracts for Cimi's first coherent release. They complement the contract-first oRPC code: schemas and route metadata belong in `packages/contract`; business rules, lifecycle, authorization, query semantics, edge cases, and dependencies belong here.

## Domains

| Domain | Resources | Responsibility |
| --- | --- | --- |
| Organization and Site Governance | `organization`, `membership`, `invitation`, `site` | Collaborative ownership, membership, Site lifecycle, and persisted Site authorization. |
| Collection and Analytics Identity | `collection-policy`, `event-ingestion`, `identity-profile` | Privacy-aware collection, Event acceptance, Visitor/Session context, identified profiles, and deletion. |
| Analytics and Reporting | `traffic-report`, `event-report`, `goal`, `funnel`, `cohort-retention`, `public-dashboard` | Bounded authenticated analytics and the separate aggregate-only public surface. |
| System and Data Lifecycle | `health`, `installation`, `retention-policy`, `backup-restore` | Installation status, retention, storage safety, backup, and restore. |

## Cross-Cutting Rules

- Better Auth owns authentication mechanics. Cimi contracts consume the authenticated principal and enforce persisted Organization/Site scope.
- RPC procedures use explicit OpenAPI route metadata. GET is for reads; POST is for ingestion, commands, and mutations.
- Procedure names are RPC operations, not REST resource/action paths. Initial procedures are unversioned; new `V2+` names are reserved for breaking changes only.
- Contract schemas are strict. Unknown input keys fail validation.
- Errors are declared in oRPC contracts, mapped centrally to HTTP statuses, and expose safe `code`, `status`, and `message` fields.
- Query intervals are UTC half-open ranges: `from` inclusive and `to` exclusive.
- Filters are typed allowlists: AND across fields and OR across repeated values within one field.
- Paginated queries use opaque cursors with explicit sort and a stable `createdAt` tie-breaker.
- Ordinary commands have no MVP idempotency guarantee. Event ingestion is the exception and deduplicates stable Event IDs.
- Required resources must operate under the one-container envelope, participate in retention, and be included in quiesced backup/restore.

## Status

All specifications are `draft` until the corresponding contract schemas and handlers exist. This is intentional: planning is complete enough to implement without reopening domain decisions, but no product implementation is part of this package.

## Boundary Decisions

- Better Auth owns authentication mechanics; Cimi specifies the authenticated-principal and membership assumptions it consumes.
- Identity uses one shared validation pipeline for Event ingestion plus a separate `identify` command when no Event is emitted.
- Goals, Funnels, and Cohort Retention are separate persisted resources because their definitions and report invariants differ.
- Retention is layered: installation default plus optional Site override.
- Installation, retention, backup, and restore are exposed as admin RPC procedures. Destructive operations still require explicit lifecycle guards and configured storage scope.
- Public Dashboard configuration and Public Query belong to one reporting resource so identifier rotation and disclosure revocation remain one invariant.
