---
status: accepted
---

# Resource Repository Boundaries

## Context

A resource repository is a persistence boundary owned by one resource. Twelve
production imports reached into a neighbour's. `event-ingestion` and
`identity-profile` each held a `SiteRepository`, built a `SiteRepositoryDrizzle`
from a `Db` they happened to hold when none was injected, and re-checked
`site.status !== 'active'` after a query that already filtered active and live
rows. `event-ingestion` imported `retention-policy/repository.ts` only to name
the parameter types of its own cleanup port. `membership` imported
`OrganizationRole` from `organization/repository.ts` in three files, type-only.

A repository is the wrong dependency shape for a cross-resource read. It exposes
storage columns, lets a caller bypass the owning resource's lifecycle rules, and
keeps the boundary visible only as a module import. The codebase already had the
right pattern: `OrganizationMembershipReconciler` in `organization/service.ts`
lets `site`, `invitation`, and `identity-profile` consume membership behavior
through one interface the composition root satisfies with `membership.service`.

## Decision

- A resource may import its own `repository.ts` and `repository.drizzle.ts` from
  any file in its directory.
- A resource must not import another resource's `repository.ts` or
  `repository.drizzle.ts` from production code. Type-only imports count, because
  the type still couples the caller to the provider's storage shape.
- A resource must not import a barrel that re-exports a repository module,
  directly or under an alias, because the barrel hands out the same coupling
  under a different name.
- Cross-resource reads go through a port the provider or a shared package owns.
- Cross-resource writes and lifecycle behavior go through a service interface,
  following `OrganizationMembershipReconciler`.
- Test fixtures may compose several resources' repositories when they test
  persistence behavior. The rule applies to production paths only.
- `apps/api/src/testing/resourceRepositoryBoundary.test.ts` fails the suite when a
  production file under `apps/api/src/resources/` breaks the rule.

## Site scope access

`site/scope.ts` queries `TSite`, `TSiteTombstone`, `TMembership`,
`TOrganizationGovernanceOperation`, and `TOrganizationRepairOperation` through
`Db`, and nine resources consume it. It is cross-resource persistence access, but
it is not a repository import and the boundary test does not flag it.

This decision formalizes `site/scope.ts` as a shared scope adapter rather than
moving it behind a service. The queries answer an authorization question, may
this user act on this site? The shape is already a port,
`SiteScopeGuardDependencies` in `@cimi/guard`, consumers receive it as an optional
dependency and fall back to the concrete factory in their own `index.ts`, and the
shared package cannot hold the factory because `@cimi/guard` has no database
dependency. Moving the queries behind the site service would make every
authorization check drag the site service's lifecycle dependencies into resources
that only need a scope answer.

The adapter stays owned by `site/`, so its ownership and its coupling are the
same. If a future consumer needs a scope answer the adapter cannot give, add a
port method to the adapter rather than reaching for the tables directly.

The consumer set is enforced, not merely described.
`resourceRepositoryBoundary.test.ts` asserts the exact list of production files
that import `../site/scope.ts`. Adding a tenth consumer fails that test, which is
the deliberate friction this issue asked for: the boundary rules live in code
rather than in a paragraph that drifts.

## Repository joins

Three repositories read tables another resource owns. These joins stay, because
each answers a question the owning resource cannot answer alone.

- `organization/repository.drizzle.ts` reads `TMembership` and `TSite` while
  answering organization and ownership questions.
- `collection-policy/repository.drizzle.ts` reads `TInstallation`, `TSite`, and
  `TSiteTombstone` while resolving policy layers.
- `retention-policy/repository.drizzle.ts` reads `TIdentityProfile`,
  `TIdentityProfileEpoch`, `TIdentityRedaction`, `TInstallation`, and `TSite`
  while resolving retention cutoffs.

The rule constrains module imports, not SQL. A repository that joins a foreign
table keeps one query and one owner, which is why the join is preferable to a
cross-resource repository call.

## Consequences

- `SiteIngestionPort.findActiveByIngestionIdentifier` answers `undefined` for a
  site that is missing, not active, or tombstoned. Callers cannot distinguish
  those cases and cannot re-check status, so the active-and-live rule keeps one
  implementation in `SiteRepositoryDrizzle.findByIngestionIdentifier`.
- `createSite` returns `ingestionPort` and `createRetentionPolicy` returns
  `resolver`, so the composition root passes those to consumers instead of a
  repository. The root still composes same-resource repositories for
  cross-resource writes, such as the acceptance repository that backup-restore
  cleanup receives.
- `RetentionResolver` replaces the `RetentionPolicyRepository | RetentionResolver`
  union `EventIngestionService` carried. The repository never had `effective`, so
  the union's other branch was dead in production.
- `MembershipRole` is derived from `SMembershipRole` in `@cimi/contract`, and
  `OrganizationRole` derives from the same picklist, so the role vocabulary has
  one authoritative source.
- `SiteRetentionBoundary`, `CleanupCheckpoint`, and `CleanupKind` live in
  `retention-policy/cleanup-payload.ts`, a module with no repository and no
  database in it. A `RetentionCleanupPort` implementer, and any test that names
  those parameters, imports that module directly instead of a repository. No
  call site re-spells the union, so the picklist has one source.
- `SiteIngestionPort` states its contract without promising to do the filtering
  itself. `undefined` is the single answer for a Site that cannot accept traffic,
  and the adapter inherits the active-and-live filter from
  `SiteRepositoryDrizzle.findByIngestionIdentifier` rather than repeating it. The
  adapter test pins that delegation: it asserts the repository is called once and
  that a site the repository declines never reaches the projection. The
  repository's own lifecycle test pins the filter underneath, so the chain holds
  at both ends and the service needs no status check of its own.
- Adding a cross-resource read means adding a port method to the provider, not an
  import to the consumer.

## Considered Options

Continue allowing direct repository dependencies. It minimizes code in the short
term, but the boundary stays implicit in module imports and a resource can reach
past another's invariants.

Require every cross-resource read to go through a full service. That protects
ownership for writes but creates overly broad services and unnecessary
orchestration for simple projections.

Use narrow service and query ports. Chosen. It preserves behavioral ownership
while allowing efficient read-only access, which is the preferred approach.
