# Cimi Resource Specifications

These specifications are the normative planning contracts for Cimi's first coherent release. They complement the contract-first oRPC code: schemas and route metadata belong in `packages/contract`; business rules, lifecycle, authorization, query semantics, edge cases, and dependencies belong here.

Cross-resource Given/When/Then acceptance scenarios live in [`ACCEPTANCE.md`](./ACCEPTANCE.md). Resource-specific edge cases remain in each resource's `SPECS.md`.

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
- Query inputs use inclusive Site-local `fromDate` and `toDate` calendar dates. The Reporting Timezone and explicit Week Start resolve them to internal half-open intervals; invalid ranges never become all-time queries.
- Authenticated coarse reports have no independent duration cap. Effective Retention is the data-availability horizon, every requested dependency must cover the complete current and comparison windows, and older or partial ranges are rejected rather than clamped.
- Filters are bounded JSON predicates with explicit `event`, `session`, `visitor`, or `profile` scope. They use allowlisted fields/operators, AND across filters, and OR across repeated values within one field.
- Paginated queries use zero-based live `offset` and `limit` values with allowlisted sorting, `nextOffset`, `hasMore`, and `totalCount`. Pages may shift while new data is ingested.
- Analytical metrics declare their Event, Session, Visitor, or Identified User grain, denominator, additivity, and supported filter scope. Visitor and Identified User values are not silently coalesced.
- Timeseries use procedure-specific buckets. Bounded ranges fill empty buckets with zero values and mark incomplete current buckets explicitly. Minute reports use one inclusive Site-local calendar date and return at most 1,800 buckets; hourly ranges cover at most 30 days.
- Analytical reports may request an explicit previous-period comparison. Current and previous ranges are returned separately; raw lists, configuration reads, and Public Query do not use comparison output.
- Query admission is preflight-only and fail-closed: projection-checkpoint-aligned cardinality statistics feed additive Fact-Work estimates, stale/gapped ranges or over-budget requests return `QUERY_LIMIT_EXCEEDED`, and no post-admission wall-clock timeout is part of the contract.
- The canonical metric definitions, grains, denominators, additivity, and filter scopes are recorded in the [analytics metric catalog](analytics-reporting/METRICS.md). Public Query uses the narrower catalog stated in the `public-dashboard` specification.
- Ordinary commands have no MVP idempotency guarantee. Event ingestion is the exception and deduplicates stable Event IDs.
- Event ingestion accepts a strict single-event envelope up to 64 KiB, plus a separate non-atomic batch contract for one Site with at most 100 Events and 256 KiB serialized. Batch rate accounting counts Events, not requests.
- Successful single-event ingestion returns 200 only for a newly accepted Event or an exact duplicate. A valid policy refusal is a generic 403 and creates no identity or Session state.
- Successful ingestion requires a durable local acceptance-journal append; analytics-store materialization may remain asynchronous and is not implied by the response.
- Required resources must operate under the one-container envelope, participate in retention, and honor the appropriate write/read maintenance boundaries during backup and restore.

## Status

All specifications are `draft` until the corresponding contract schemas and handlers exist. This is intentional: planning is complete enough to implement without reopening domain decisions, but no product implementation is part of this package.

## Boundary Decisions

- Better Auth owns authentication mechanics; Cimi specifies the authenticated-principal and membership assumptions it consumes.
- Identity uses one shared validation pipeline for Event ingestion plus a separate `identify` command when no Event is emitted.
- Goals, Funnels, and Cohort Retention are separate persisted resources because their definitions and report invariants differ.
- Retention is layered: installation default plus optional Site override.
- Installation, retention, backup, and restore are exposed as admin RPC procedures. Destructive operations still require explicit lifecycle guards and configured storage scope.
- Public Dashboard configuration and Public Query belong to one reporting resource so identifier rotation and disclosure revocation remain one invariant.
- `updateSiteV2` is the explicit first-release successor to the pre-release `updateSite` contract; no unversioned alias is exposed. Future incompatible changes use a new versioned procedure.
