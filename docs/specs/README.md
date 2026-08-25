# Cimi Resource Specifications

These specifications are the normative planning contracts for Cimi's first coherent release. They complement the contract-first oRPC declaration layer: typed schemas, errors, and route metadata belong in `packages/contract`; handlers, persistence, and runtime enforcement remain implementation work; business rules, lifecycle, authorization, query semantics, edge cases, and dependencies belong here.

Cross-resource Given/When/Then acceptance scenarios live in [`ACCEPTANCE.md`](./ACCEPTANCE.md). Resource-specific edge cases remain in each resource's `SPECS.md`.

The cross-resource dependency graph is maintained in [`DEPENDENCIES.md`](./DEPENDENCIES.md).

The canonical first-release capability disposition is [`CAPABILITIES.md`](../CAPABILITIES.md). The capability research synthesis is linked from that document as evidence and is not a competing product contract.

## Authority and Precedence

- Issue decisions and accepted ADRs establish cross-resource product decisions. A later accepted decision supersedes earlier wording; superseded text remains historical and must not be treated as an alternative implementation contract.
- `CONTEXT.md` owns canonical domain vocabulary and meanings.
- Resource `SPECS.md` files and `ACCEPTANCE.md` own normative behavior, lifecycle rules, authorization, and acceptance outcomes.
- The contract package is the executable declaration of the normative contract: its schemas, errors, and route metadata must match the decision and specification layers rather than silently broaden them. Runtime handlers must enforce the remaining business, lifecycle, authorization, persistence, and transport rules.
- Research documents are evidence only unless an accepted decision, ADR, or normative specification explicitly promotes a finding.

## Domains

| Domain                            | Resources                                                                                  | Responsibility                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Organization and Site Governance  | `organization`, `membership`, `invitation`, `site`                                         | Collaborative ownership, membership, Site lifecycle, and persisted Site authorization.                  |
| Collection and Analytics Identity | `collection-policy`, `event-ingestion`, `identity-profile`                                 | Privacy-aware collection, Event acceptance, Visitor/Session context, identified profiles, and deletion. |
| Analytics and Reporting           | `traffic-report`, `event-report`, `goal`, `funnel`, `cohort-retention`, `public-dashboard` | Bounded authenticated analytics and the separate aggregate-only public surface.                         |
| System and Data Lifecycle         | `health`, `installation`, `retention-policy`, `backup-restore`                             | Installation status, retention, storage safety, backup, and restore.                                    |

## Examples

The `examples/` subtree contains illustrative resource specifications such as
[`hello`](../../packages/contract/src/contract/hello/SPECS.md). These documents demonstrate contract and
behavior documentation conventions but are not first-release product
resources. They are excluded from `DEPENDENCIES.md`, `ACCEPTANCE.md`, and
`CAPABILITIES.md` unless a later product decision promotes one into a bounded
domain.

## Cross-Cutting Rules

- Better Auth owns authentication mechanics and Organization/membership authority. Cimi contracts consume the authenticated principal, reconcile a unique persisted membership pair, and enforce persisted Organization/Site scope; Personal Organization creation is allowed from an authenticated principal before membership exists.
- Site deletion is recoverable and fail-closed: every non-`active` Site (`deleting`, `deleted`, `recovering`, or `purged`) is hidden and blocks new ingestion/query/Public Query admission except for the privileged deletion-status surface where specified; candidates admitted before the lifecycle boundary may finish their acceptance flush. Owners/Administrators may recover Sites for 30 days, after which live Site data is purged and backup copies follow normal retention without permitting resurrection.
- RPC procedures use explicit OpenAPI route metadata. Resource procedures use `/{resource}/{operation}` paths with kebab-case resource segments; `health` remains the `/system/health` operational-probe exception. GET is for reads; POST is for ingestion, commands, and mutations.
- Route auth metadata is a coarse admission posture. Resource-specific Organization, Site, and installation scope, including input-discriminated scope, remains a handler authorization rule; `admin` never implies installation-wide authority by itself.
- Procedure names are RPC operations, not REST resource/action paths; the resource path segment namespaces the operation without changing its RPC identity. Initial procedures are unversioned; new `V2+` names are reserved for breaking changes only.
- Contract schemas are strict. Unknown input keys fail validation.
- Cimi-generated entity IDs use the in-house prefixed generator from `@cimi/utils`. Contract boundaries validate IDs as opaque `SId` strings (1-128 characters); the generator's prefix and encoding are not API invariants.
- The normative error design declares errors in oRPC contracts, maps them centrally to HTTP statuses, and exposes safe `code`, `status`, and `message` fields. Runtime adapters must implement that mapping. A contract error code is the normative semantic outcome; HTTP status is its transport mapping and does not replace the code.
- Query inputs use inclusive Site-local `fromDate` and `toDate` calendar dates. The Reporting Timezone and explicit Week Start resolve them to internal half-open intervals; invalid ranges never become all-time queries.
- Authenticated coarse reports have no independent duration cap. Effective Retention is the data-availability horizon, every requested dependency must cover the complete current and comparison windows, and older or partial ranges are rejected rather than clamped. This rule does not apply to Public Query, which retains its independent 90-day Site-local window and 2,161 actual hourly-start bound.
- Filters are bounded JSON predicates with explicit `event`, `session`, `visitor`, or `profile` scope. They use allowlisted fields/operators, AND across filters, and OR across repeated values within one field.
- Paginated queries use zero-based live `offset` and `limit` values with allowlisted sorting followed by a stable ID tie-breaker, `nextOffset`, `hasMore`, and `totalCount`. Pages may shift while new data is ingested.
- Analytical metrics declare their Event, Session, Visitor, or Identified User grain, denominator, additivity, and supported filter scope. Visitor and Identified User values are not silently coalesced.
- Timeseries use procedure-specific buckets. Bounded ranges fill empty buckets with zero values and mark incomplete current buckets explicitly. Minute reports use one inclusive Site-local calendar date and return at most 1,800 buckets; authenticated hourly ranges cover at most 30 days, while Public Query covers at most 90 inclusive Site-local calendar days and 2,161 actual hourly interval starts after timezone resolution. A derived Public Query count above 2,161 returns `BAD_REQUEST` before cache or execution and is never clamped.
- Authenticated analytical reports may request an explicit previous-period comparison whose range is adjacent to and equal in Site-local calendar length to the current range. Current and previous ranges are returned separately; raw lists, configuration reads, and Public Query do not use comparison output.
- Query admission is preflight-only and fail-closed: projection-checkpoint-aligned cardinality statistics feed additive Fact-Work estimates, stale statistics, a Projection Gap overlapping either the resolved current or comparison half-open Site interval, an unbounded Site gap, or over-budget requests return `QUERY_LIMIT_EXCEEDED` before cache or execution. Successful reports expose only `current` or `stale` freshness, and no post-admission wall-clock timeout is part of the contract.
- Analytics reads require a ready analytics store. A `degraded`, `rebuilding`, or `unavailable` analytics store returns generic `SERVICE_UNAVAILABLE` (503) before cache, including Public Query; SQLite-backed health, configuration reads, and accept-only collection remain available.
- The canonical metric definitions, grains, denominators, additivity, and filter scopes are recorded in the [analytics metric catalog](analytics-reporting/METRICS.md). Public Query uses the narrower catalog stated in the `public-dashboard` specification.
- Ordinary commands have no MVP idempotency guarantee unless their contract explicitly says otherwise. Event ingestion deduplicates stable Event IDs; Site deletion and recovery are additional retry-safe lifecycle commands.
- Event ingestion accepts a strict single-event envelope up to 64 KiB, plus a separate non-atomic batch contract for one Site with at most 100 Events and 256 KiB measured as raw UTF-8 bytes before JSON parsing. Batch rate accounting counts Events, not requests.
- Batch boundary failures return one top-level error before results; after boundary validation, policy refusals and malformed/collision/size failures are independent per-item outcomes and never durable acceptance records. Policy refusals disclose only generic `reason: policy`.
- New normalized candidates from both ingestion procedures share a sequential installation-wide FIFO SQLite acceptance coalescer. The first candidate starts a fixed 1,000 ms window, a flush commits at 500 candidates or the deadline, and up to 1,500 additional unique candidates wait. Each flush is one all-or-none SQLite transaction; requests wait for their candidates to commit, queue saturation or flush failure returns top-level `SERVICE_UNAVAILABLE` (503), and retry by Event ID is safe.
- Every acceptance scenario that describes failure names the procedure's declared contract error code and separately states its HTTP status. Batch boundary failures are top-level errors with no results; `rejected` and `itemError` are per-item outcomes and are not top-level HTTP errors.
- Successful single-event ingestion returns 200 only for a newly accepted Event or an exact duplicate. A valid policy refusal is a generic 403 and creates no identity or Session state.
- Successful ingestion requires a durable local acceptance-journal append; analytics-store materialization may remain asynchronous and is not implied by the response.
- Required resources must operate under the one-container envelope, participate in retention, and honor the appropriate write/read maintenance boundaries during backup and restore.

## Status

All first-release product specifications are `draft` until the corresponding contract schemas and handlers exist. This is intentional: planning is complete enough to implement without reopening domain decisions, but no first-release product implementation is part of this package. Illustrative specifications under `examples/` may use their own implementation status.

A declared contract member is not a served API route. A procedure is available only after a runtime handler is registered and its authorization, persistence, lifecycle, transport, and error boundaries are implemented. At the current repository state, `apps/api` registers `health` at `GET /api/system/health` (contract path `GET /system/health`) and the illustrative `hello` procedures; first-release product procedures remain planned contract surface. Update this status paragraph whenever route registration changes.

## Boundary Decisions

- Better Auth owns authentication mechanics; Cimi specifies the authenticated-principal and membership assumptions it consumes.
- Identity uses one shared validation pipeline for Event ingestion plus a separate `identify` command when no Event is emitted.
- Goals, Funnels, and Cohort Retention are separate persisted resources because their definitions and report invariants differ.
- Retention is layered: installation default plus optional Site override.
- Installation, retention, backup, and restore are exposed as admin RPC procedures. Destructive operations still require explicit lifecycle guards and configured storage scope.
- Public Dashboard configuration and Public Query belong to one reporting resource so identifier rotation and disclosure revocation remain one invariant.
- `updateSiteV2` is the explicit first-release successor to the pre-release `updateSite` contract; no unversioned alias is exposed. Future incompatible changes use a new versioned procedure.
