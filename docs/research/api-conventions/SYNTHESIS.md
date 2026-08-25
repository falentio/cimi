# Cimi RPC and OpenAPI Conventions

Decision record for Cimi issue [#10](https://github.com/falentio/cimi/issues/10). This records cross-cutting conventions only; resource-specific procedure names, schemas, and behavior belong in the selected resource specifications.

## Contract Source

- `packages/contract` is the single source of truth for oRPC contracts.
- Procedures declare Valibot input/output schemas, typed errors, auth metadata, and explicit OpenAPI route metadata in the same contract.
- `implement(contract)` binds server handlers; `OpenAPIHandler` publishes the HTTP transport and generated OpenAPI reference.
- Better Auth `/api/auth/*` remains a separate protocol surface and is not folded into the Cimi RPC contract.
- OpenAPI paths are explicit per procedure. They represent RPC operations and are not inferred REST resource routes. Non-system procedures are namespaced under their resource's kebab-case path segment, while the operational health probe remains `/system/health`.

The current repository establishes this shape in `packages/contract/src/orpc/index.ts`, `packages/contract/src/orpc/meta.ts`, `packages/contract/src/contract/health/query/health.ts`, and `apps/api/src/index.ts`.

## Procedure Naming and Versioning

- Cimi uses RPC operation names as stable HTTP operations and does not impose REST-style resource/action naming. Resource procedures use `/{resource}/{operation}` paths, such as `/site/updateSiteV2`; the operation name remains the stable RPC identity. Initial procedures are unversioned; `updateSiteV2` is the explicit first-release successor to the pre-release `updateSite` contract after incompatible changes, and future breaking successors may be named `updateSiteV3`.
- A procedure version is introduced only for an incompatible input, output, or behavior change. Additive compatible changes remain on the existing procedure.
- Old versions remain callable while supported and are explicitly deprecated before removal.
- Each versioned procedure has its own contract, handler, OpenAPI route metadata, error declarations, and acceptance scenarios.

## Authentication and Scope

- Contract metadata declares a coarse posture such as `public`, `authenticated`, `owner`, or `admin`; specialized scope labels are vocabulary for future input-aware authorization and do not enforce access by themselves.
- Metadata is not sufficient authorization. Reusable server middleware/guards enforce persisted User membership, Organization scope, and Site ownership on every protected operation.
- Active Organization navigation state never grants access.
- The dedicated Public Query is the only unauthenticated analytics read contract; it has its own aggregate disclosure, filter, time, suppression, cache, and rate-limit rules.

## Methods and Results

- GET is used for side-effect-free read procedures.
- POST is used for ingestion, mutations, and commands, including RPC operations that update or delete a resource. This is transport behavior, not REST resource semantics.
- Procedures return their declared output directly. Cimi does not add a universal `{data}` or `{ok,data}` success envelope.
- Ordinary commands have no idempotency contract in the MVP. Event ingestion is the explicit exception: issue #7 requires stable Event IDs and duplicate suppression.

## Validation and Errors

- Contract schemas reject unknown object keys and malformed values at the boundary. Cimi does not silently strip undeclared analytics data.
- Every procedure declares its possible errors in the oRPC contract.
- Standard oRPC error codes and domain-specific codes are mapped centrally to HTTP statuses.
- The stable error response exposes `code`, `status`, and a safe human-readable `message`; typed error data is included only when declared by the contract and safe for the caller.
- Validation, authentication, authorization, not-found, conflict, rate-limit, and bounded-query failures are distinct errors. Internal storage/provider details are not exposed.
- The error vocabulary remains oRPC-native rather than wrapping responses in a second Problem Details envelope.

## Time, Filters, and Pagination

- Analytical query intervals use inclusive Site-local calendar dates resolved through the Site Reporting Timezone and converted internally to half-open instants. There is no independent coarse duration cap: Effective Retention must cover every requested dependency across the complete current and comparison windows, and unavailable, over-budget, stale-statistics, or gapped ranges fail with `QUERY_LIMIT_EXCEEDED` rather than becoming all-time or partial queries.
- Filters are typed per procedure and drawn from an explicit allowlist. Different fields combine with AND; repeated values within one field combine with OR. Unknown fields and operators fail validation.
- Public Query filters are a narrower server-enforced allowlist and never inherit authenticated filters automatically.
- Paginated procedures use zero-based live offsets, bounded limits, allowlisted sorting, and a stable ID tie-breaker. Pages expose `nextOffset`, `hasMore`, and `totalCount`; live-page drift is documented rather than hidden behind an opaque cursor.

## Research Basis

- Current oRPC contract and error guidance: Context7 library `/dinwwwh/orpc`, including contract `.errors(...)`, `.input(...)`, `.output(...)`, metadata, OpenAPI route metadata, and centralized error status mapping.
- Local Cimi implementation: `packages/contract/src/contract.ts`, `packages/contract/src/orpc/index.ts`, `packages/contract/src/orpc/meta.ts`, `packages/contract/src/contract/health/query/health.ts`, `apps/api/src/index.ts`, and `packages/testing/src/orpc-error.ts`.
