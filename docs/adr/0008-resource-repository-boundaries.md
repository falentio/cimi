---
status: accepted
---

# Resource Repository Boundaries

A resource repository is a persistence boundary owned by one resource. Production code in `apps/api/src/resources/<resource>/` may import its own `repository.ts` and `repository.drizzle.ts` and no other resource's. Cross-resource reads go through a narrow port that the providing resource or a shared package owns. `apps/api/src/testing/resourceRepositoryBoundary.test.ts` enforces the rule.

## Context

Before this decision, twelve production imports reached into another resource's repository. `event-ingestion` and `identity-profile` each held a `SiteRepository`, constructed `SiteRepositoryDrizzle` from a `Db` they happened to hold when no repository was injected, and re-checked `site.status !== 'active'` after a query that already filtered active and live rows. `event-ingestion/retention-cleanup.ts` imported the retention repository only to name the parameter types of its own port implementation. `membership` imported `OrganizationRole` from `organization/repository.ts` in three files, type-only.

The repository is the wrong dependency shape for these reads. It exposes storage columns, lets a caller bypass the owning resource's lifecycle rules, and makes the boundary implicit in module imports. The codebase already had the right pattern: `OrganizationMembershipReconciler` in `organization/service.ts` lets `site`, `invitation`, and `identity-profile` consume membership behavior through one interface that the composition root satisfies with `membership.service`.

## Decision

- A resource may import its own `repository.ts` and `repository.drizzle.ts` from any file in its directory.
- A resource must not import another resource's `repository.ts` or `repository.drizzle.ts` from production code. Type-only imports count; the type still couples the caller to the provider's storage shape.
- A resource must not import a barrel that re-exports a repository module, directly or under an alias, because the barrel then hands out the same coupling under a different name.
- Cross-resource reads go through a port the provider or a shared package owns. The site resource exposes `SiteIngestionPort` in `packages/guard/src/site.ts` and adapts it in `site/ingestion-port.ts`; the composition root injects the adapter, so `@cimi/guard` keeps no database dependency.
- Cross-resource writes and lifecycle behavior go through a service interface, following `OrganizationMembershipReconciler`.
- Test fixtures may compose several resources' repositories when they test persistence behavior. The rule applies to production paths only, so the walker skips `testing/` and `*.test.ts`.

## Site scope access

`site/scope.ts` queries `TSite`, `TSiteTombstone`, `TMembership`, `TOrganizationGovernanceOperation`, and `TOrganizationRepairOperation` through `Db`, and nine resources consume it. It is cross-resource persistence access, but it is not a repository import and the walker does not flag it.

This decision formalizes `site/scope.ts` as a shared scope adapter rather than moving it behind a service. The reasons: the queries answer authorization questions ("may this user act on this site?"), the shape is already a port (`SiteScopeGuardDependencies` in `packages/guard`), consumers receive it as an optional dependency and fall back to the concrete factory in their own `index.ts`, and the shared package cannot hold the factory because `@cimi/guard` has no database dependency. Moving the queries behind the site service would make every authorization check drag the site service's lifecycle dependencies into resources that only need a scope answer.

## Repository joins

Three repositories read tables that another resource owns. These joins stay, because each answers a question the owning resource cannot answer alone, and each is documented here rather than inferred from imports:

- `organization/repository.drizzle.ts` reads `TMembership` and `TSite` while answering organization and ownership questions.
- `collection-policy/repository.drizzle.ts` reads `TInstallation` and `TSite` while resolving policy layers.
- `retention-policy/repository.drizzle.ts` reads `TIdentityProfile`, `TIdentityProfileEpoch`, `TIdentityRedaction`, `TInstallation`, and `TSite` while resolving retention cutoffs.

The rule constrains module imports, not SQL. A repository that joins a foreign table keeps one query and one owner, which is why the join is preferable to a cross-resource repository call.

## Consequences

- `SiteIngestionPort.findActiveByIngestionIdentifier` answers `undefined` for a site that is missing, not active, or tombstoned. Callers cannot distinguish the cases and cannot re-check status, so the active-and-live rule keeps one implementation in `SiteRepositoryDrizzle.findByIngestionIdentifier`.
- `createSite` returns `ingestionPort` and `createRetentionPolicy` returns `resolver`, so the composition root passes those to consumers instead of a repository. The root still composes same-resource repositories for cross-resource writes, such as the acceptance repository that backup-restore cleanup receives.
- `RetentionResolver` replaces the `RetentionPolicyRepository | RetentionResolver` union that `EventIngestionService` carried. Production always took the `findResolved` branch, so the single path preserves behavior.
- `MembershipRole` derives from `SMembershipRole` in `@cimi/contract`, and `OrganizationRole` derives from the same picklist, so the role vocabulary has one source of truth.
- `site/index.ts` and `retention-policy/index.ts` no longer re-export their repositories. A resource that needs to compose another's storage in a test imports the repository file directly, which the walker permits under `testing/`.
- Adding a cross-resource read means adding a port method to the provider, not an import to the consumer. The walker fails the suite on the import.
