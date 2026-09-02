# Issue #36 completeness audit

## Overview

Audit date: 2026-09-03.

This follow-up audited the `feat/governance` implementation against GitHub Issue #36, `docs/issue-36-plan.md`, the Organization and Membership specifications, the acceptance scenarios, and the reachable HTTP API.

**Verdict. The 18 findings in this audit are remediated.**

The implementation serves all eleven required procedures and retains the intended major boundaries. Better Auth remains the external Organization and membership authority. Cimi stores Organization metadata, a reconciled membership projection, and durable governance operations. The end-to-end governance path succeeds through real HTTP requests, SQLite, Better Auth, and Site scope checks.

Each finding was addressed in a separate focused commit, in finding order, with regression or acceptance coverage where the behavior could be exercised. The remaining Better Auth route caveat below is a conditional maintenance requirement, not an open finding in the current configuration.

## Key concepts

### Better Auth authority

Better Auth owns external Organization and membership state. `packages/auth/src/organization-authority.ts` wraps authority operations and maps external roles into Cimi's `owner`, `admin`, and `member` roles.

### Cimi projection

`packages/db/src/schema/governance.ts` defines `TOrganization`, `TMembership`, and `TOrganizationGovernanceOperation`. Cimi uses these tables for metadata, persisted scope authorization, and durable cross-store coordination.

### Owner invariant

Cimi couples `TOrganization.ownerUserId` with exactly one local `owner` membership. `apps/api/src/resources/organization/owner-invariant.ts` validates this relationship. The database also has a partial unique index that prevents multiple local Owner rows.

### Durable governance operation

Role changes, removals, leaves, ownership transfers, and Organization deletes use pending operation rows. A pending operation should block ordinary reads and commands until both stores converge or an operator repairs the state.

### Site scope

`packages/guard/src/site.ts` checks active Site state, persisted membership, and pending governance operations. `apps/api/src/resources/site/scope.ts` supplies the database-backed implementation.

## How it works

### Request composition

`apps/api/src/index.ts` constructs the Organization, Membership, and Site modules. It composes their routers through the reusable implementer from `apps/api/src/orpc.ts`. The authenticated middleware passes both the Better Auth user and request headers to resource handlers.

The composition root also rejects currently registered native Better Auth Organization and membership mutation paths before Better Auth handles them. The current list includes creation, update, deletion, member addition, member removal, role changes, leave, and invitation mutations.

Evidence:

- `apps/api/src/index.ts`, `createApiApp`, `NATIVE_GOVERNANCE_MUTATION_PATHS`, and `isNativeGovernanceMutation`
- `apps/api/src/orpc.ts`, `ApiContext`, and `authenticatedMiddleware`
- `apps/api/src/resources/organization/router.ts`
- `apps/api/src/resources/membership/router.ts`

### Reconciliation and authorization

Organization reads call membership reconciliation before returning data. Membership reconciliation lists all Better Auth member pages, checks the authority Owner set, and replaces the local projection. Site requests recheck the persisted membership row on each request.

Ownership transfer admits a pending operation, reconciles Better Auth, updates the Cimi Owner rows and `ownerUserId` in one transaction, then marks the operation complete. Local completion checks that exactly one local Owner remains.

Personal Organization provisioning uses a deterministic authority slug and a partial unique local index. If two local inserts race, the loser rereads the persisted Personal Organization.

The design is sound at the level of the main state model. The remediation record below documents the replay, cross-store, error mapping, recovery, and acceptance-coverage work completed after the initial audit.

## Remediation record

### 1. Completed transfer replay bypasses current-owner authorization

**Remediated in `e584c0e`.** Completed transfer replay now passes through current membership and Owner authorization before returning the historical result. A former Owner with a still-valid session receives `FORBIDDEN` instead of learning or replaying transfer state.

Evidence:

- `apps/api/src/resources/membership/service.ts`, transfer replay authorization
- `apps/api/src/testing/governance.test.ts`, stale former-Owner replay regression
- `docs/specs/organization-site-governance/membership/SPECS.md`, stale-session edge case

### 2. Better Auth transfer reconciliation does not enforce exactly one authority Owner

**Remediated in `d79a93c`.** Better Auth ownership reconciliation now lists all authority members, validates membership identity and Organization correlation, rejects an invalid Owner set, and verifies the final state has exactly one Owner. Personal Organization reuse applies the same authority-wide validation.

Evidence:

- `packages/auth/src/organization-authority.ts`, authority-wide transfer and Owner-state assertions
- `apps/api/src/resources/membership/service.ts`, transfer reconciliation
- `apps/api/src/resources/organization/service.ts`, Personal Organization authority validation
- `packages/auth/src/testing/organization-authority.test.ts`, surviving-Owner rejection and recovery coverage

### 3. Concurrent duplicate transfers can return a false conflict after success

**Remediated in `861961b`.** Concurrent duplicate transfer requests now reread the completed transfer after a competing completion and return the same successful result instead of reporting a false conflict.

Evidence:

- `apps/api/src/resources/membership/service.ts`, idempotent transfer replay
- `apps/api/src/resources/membership/testing/service.transfer.test.ts`, overlapping transfer coverage

### 4. The Personal Organization uniqueness winner skips validation

**Remediated in `83dd0f3`.** The uniqueness-race winner now follows the same reconciliation and readability checks as the ordinary existing-Organization path before it is returned.

Evidence:

- `apps/api/src/resources/organization/service.ts`, Personal Organization winner handling
- `apps/api/src/resources/organization/testing/service.ensure-personal.test.ts`, winner validation coverage
- `apps/api/src/testing/governance.test.ts`, concurrent Personal Organization provisioning

### 5. Authority-only membership removal does not reliably produce `NOT_FOUND`

**Remediated in `b335c84`.** The adapter now maps Better Auth's exact not-a-member response to an absent member, allowing the service to remove the stale local projection and return the specified `NOT_FOUND` behavior. Unknown authority failures continue to propagate rather than being misclassified as absence.

Evidence:

- `packages/auth/src/organization-authority.ts`, member lookup error classification
- `packages/auth/src/testing/organization-authority.test.ts`, removed requester and unknown provider failure coverage
- `apps/api/src/testing/governance.test.ts`, authority-only removal regression

### 6. Pending governance state can be enumerated through Organization endpoints

**Remediated in `f2ea9fd`.** Organization reads and deletes now establish persisted access authorization before checking pending governance state. Inaccessible callers receive `NOT_FOUND` without learning whether an Organization has a pending operation.

Evidence:

- `apps/api/src/resources/organization/service.ts`, authorization and pending-operation ordering
- `apps/api/src/testing/governance.test.ts`, pending-state enumeration regression
- `docs/specs/organization-site-governance/organization/SPECS.md`, `getOrganization` behavior

### 7. Several service paths emit undeclared `CONFLICT` errors

**Remediated in `c38f465`.** Governance procedures that can emit `CONFLICT` now declare it in their contract error maps, and the contract error declaration tests cover the alignment. The public normalizer continues to sanitize undeclared or malformed provider errors to `INTERNAL_SERVER_ERROR`.

Evidence:

- `packages/contract/src/contract/error-declarations.test.ts`
- `packages/contract/src/contract/membership/`
- `packages/contract/src/contract/organization/`
- `packages/contract/src/contract/site/`
- `apps/api/src/errors.ts`, `normalizeApiError`

## Acceptance evidence gaps and conditional risks

The following findings were originally identified as missing acceptance evidence or conditional risks. Each has now been addressed with focused implementation or test coverage.

### 8. Transfer recovery has no failure-after-authority-mutation evidence

**Remediated in `e1c0c86`.** Ownership reconciliation now accepts the valid partially applied authority state created during a failed transfer. If Cimi completion fails after Better Auth converges, the operation remains pending with failure metadata, and a later request retries local completion. Final checks require exactly one Owner in both stores.

Evidence:

- `packages/auth/src/organization-authority.ts`, `reconcileOwnership`
- `packages/auth/src/testing/organization-authority.test.ts`, partial-state and final Owner coverage
- `apps/api/src/resources/membership/service.ts`, transfer retry and failure recording
- `apps/api/src/resources/membership/testing/service.transfer.test.ts`, Cimi completion failure and retry

### 9. Membership reconciliation depends on untested transaction ordering

**Remediated in `ee06a14`.** `replaceMembers()` now removes or demotes the old local Owner before inserting or promoting the incoming Owner, so reconciliation respects the single-Owner index. It returns the synchronous SQLite transaction result correctly, and the transaction rolls back on later replacement failures.

Evidence:

- `apps/api/src/resources/membership/repository.drizzle.ts`, `replaceMembers`
- `apps/api/src/resources/membership/testing/repository.drizzle.replaceMembers.test.ts`, Owner ordering and rollback
- `packages/db/src/schema/governance.ts`, `membership_one_owner_unique`
- `packages/db/src/client.ts`, synchronous SQLite transaction setup

### 10. Removal and leave recovery are not tested

**Remediated in `3074bac`.** Removal and leave operations delete the local membership before calling Better Auth, then retain a pending operation when the authority mutation fails. Recovery authorizes the retrying actor before replay, accepts an already-absent authority member, and clears stale failure metadata after success.

Evidence:

- `apps/api/src/resources/membership/service.ts`, membership-operation recovery
- `apps/api/src/resources/membership/testing/service.recovery.test.ts`, removal and leave recovery
- `apps/api/src/testing/governance.test.ts`, access revocation and recovery acceptance coverage
- `apps/api/src/resources/membership/repository.drizzle.ts`, pending-operation persistence

### 11. Organization creation and update have non-durable compensation failures

**Remediated in `034c1dc`.** Organization create and update compensation failures now persist durable repair operations. Later requests can retry authority cleanup or rollback and complete the repair. Invalid authority responses are handled inside the same durable flow rather than leaving an untracked cross-store mutation.

Evidence:

- `apps/api/src/resources/organization/service.ts`, create and update repair handling
- `apps/api/src/resources/organization/repository.ts`, repair-operation contract
- `apps/api/src/resources/organization/repository.drizzle.ts`, repair persistence and completion
- `apps/api/src/resources/organization/testing/service.repair.test.ts`, compensation failure and retry coverage
- `apps/api/src/resources/organization/testing/repository.drizzle.repair.test.ts`, transactional repair writes
- `packages/db/src/schema/governance.ts` and migrations `0004_reflective_mother_askani.sql` and `0005_grey_doctor_doom.sql`

### 12. Native Better Auth fencing has incomplete test coverage

**Remediated in `26587f3`.** The API composition root blocks every currently registered native Organization and membership mutation path before Better Auth handles the request. The regression test submits valid payloads, checks the 404 responses, and compares the authority state before and after the requests.

Evidence:

- `apps/api/src/index.ts`, `NATIVE_GOVERNANCE_MUTATION_PATHS`
- `apps/api/src/testing/api.test.ts`, valid-payload route-fencing regression

The separate route caveat below records the conditional work required if Better Auth dynamic role management is enabled later.

### 13. Organization lifecycle scenarios are largely untested

**Remediated in `078fc14`.** The governance acceptance suite now covers concurrent Personal Organization provisioning, empty Personal Organization deletion, Personal deletion precedence, non-personal deletion with Sites, update authorization and persistence, and user-scoped list pagination.

Evidence:

- `apps/api/src/testing/governance.test.ts`, lifecycle and HTTP acceptance scenarios
- `apps/api/src/resources/organization/testing/`, Personal Organization race and deletion tests
- `docs/specs/organization-site-governance/organization/SPECS.md`
- `docs/specs/ACCEPTANCE.md`

### 14. Membership implementation has no focused service or repository suite

**Remediated in `0679993`.**

Focused Membership coverage now exercises:

- Member, Administrator, and Owner authorization boundaries.
- Invalid and already-owner transfer targets.
- Owner role-change, removal, and leave protection.
- Authority-to-Cimi membership reconciliation, stale-member removal, malformed authority payloads, and missing authority correlation IDs.
- Pending role-operation and transfer authorization fencing before replay.
- Removal and leave recovery, provider failures, and failure metadata.
- Authority role compensation when local role persistence fails.
- Repository replacement rollback and ownership-transfer transaction rollback.
- Service ordering that revokes local access before Better Auth removal or leave.

Evidence:

- `apps/api/src/resources/membership/testing/service.authorization.test.ts` — 17 focused service tests.
- `apps/api/src/resources/membership/testing/service.recovery.test.ts` — pending removal and leave recovery.
- `apps/api/src/resources/membership/testing/service.transfer.test.ts` — transfer retry and concurrent replay coverage.
- `apps/api/src/resources/membership/testing/repository.drizzle.replaceMembers.test.ts` — Owner ordering and replacement rollback.
- `apps/api/src/resources/membership/testing/repository.drizzle.transfer.test.ts` — transfer transaction rollback.
- `apps/api/src/testing/governance.test.ts` — 11 end-to-end governance tests, including Site access revocation.

Verification: the focused Membership suite passed 27 tests; the governance acceptance suite passed 11 tests; API typecheck, narrow lint/format, and `git diff --check` passed.

### 15. Database tests do not exercise governance constraints

**Remediated in `51cd3b3`.**

The migrated SQLite database now has direct runtime coverage for:

- The partial unique Personal Organization owner index, including the distinction between Personal and non-Personal Organizations.
- The Membership composite identity key, single-Owner index, role check, and Organization/User foreign keys.
- Governance operation pending uniqueness, target-role shape, nonnegative attempt counts, and Organization/User foreign keys.
- Organization repair operation shape, pending uniqueness, nonnegative attempt counts, and owner foreign keys.
- Foreign-key enforcement after migration and Organization delete cascades for Membership and governance operations.

The new runtime test also exposed that SQLite treats a `CHECK` expression evaluating to `NULL` as satisfied. A `change-member-role` operation with a `NULL` target role could therefore bypass the intended target-role constraint. The schema now explicitly requires `target_role IS NOT NULL` for role-change operations, with migration `0006_previous_the_leader.sql` applying the corrected constraint to existing databases.

Transfer transaction rollback and final Owner state are covered by the focused Membership repository tests recorded under finding 14.

Evidence:

- `packages/db/src/schema/governance.ts`
- `packages/db/src/migrations/0001_dry_lester.sql`
- `packages/db/src/migrations/0002_cooing_scalphunter.sql`
- `packages/db/src/migrations/0003_even_winter_soldier.sql`
- `packages/db/src/migrations/0006_previous_the_leader.sql`
- `packages/db/src/client/testing/client.test.ts` — one runtime constraint test covering the governance tables.
- `apps/api/src/resources/membership/testing/repository.drizzle.transfer.test.ts` — transfer transaction rollback and final Owner state.

Verification: the focused database client suite passed 6 tests; narrow lint/format, database schema checks, database typecheck, and `git diff --check` passed.

### 16. Contract and Better Auth adapter coverage is narrow

**Remediated in `f156516`.** Contract coverage now exercises Organization and Membership command/query inputs and outputs, including invalid IDs, names, roles, pagination, strict objects, malformed timestamps, and owner-sensitive output shapes.

Better Auth adapter coverage now exercises Organization creation, reads by ID and slug, update and delete mapping, known not-found normalization, provider-error propagation, member pagination and mapping, role changes, leave, malformed provider roles, ownership transfer success and recovery, missing transfer targets, and final Owner-state validation. The direct `listOrganizations()` user-ID boundary remains deferred to finding 17 because its behavior is the separate finding there.

Evidence:

- `packages/contract/src/contract/organization/validation.test.ts`
- `packages/contract/src/contract/membership/validation.test.ts`
- `packages/contract/src/contract/error-declarations.test.ts`
- `packages/auth/src/testing/organization-authority.test.ts`

Verification: focused contract tests passed 116 tests; focused Auth tests passed 14 tests; narrow lint/format and type-aware checks passed for all changed TypeScript files.

### 17. `listOrganizations()` ignores its user ID argument

**Remediated in `f86ea1c`.** `BetterAuthOrganizationAuthority.listOrganizations()` now makes its session-scoped behavior explicit by accepting only `headers`; the misleading unused `userId` argument was removed. Better Auth derives the subject from the authenticated session and does not expose an explicit user-ID parameter on its public organization-list endpoint.

The current Organization service remains repository-backed and scopes persisted Cimi memberships by the authenticated user. It does not call this authority method, so the public Cimi listing behavior and its existing cross-user isolation remain unchanged.

Evidence:

- `packages/auth/src/organization-authority.ts`, `OrganizationAuthority.listOrganizations`
- `packages/auth/src/testing/organization-authority.test.ts`, session-scoped list coverage
- `apps/api/src/resources/organization/service.ts`, repository-backed user-scoped list
- `apps/api/src/testing/governance.test.ts`, cross-user list isolation

Verification: focused Auth tests passed 15 tests; narrow lint/format and type-aware checks passed for the changed Auth files.

### 18. Session-provider failures are treated as missing authentication

**Remediated in `92483e2`.** Session lookup failures are now handled at the API boundary as a safe `INTERNAL_SERVER_ERROR` response with HTTP 500. Only a successful lookup with no session continues to produce an absent user and the normal 401 response for authenticated procedures. Provider details are excluded from the public response.

Evidence:

- `apps/api/src/index.ts`, session lookup boundary and `getUser`
- `apps/api/src/testing/api.test.ts`, session-provider failure regression and unauthenticated access coverage
- `apps/api/src/errors.ts`, safe public error definition

Verification: the focused API suite passed 82 tests, including the session-provider failure regression; API typecheck, narrow lint/format, and `git diff --check` passed.

## Better Auth route caveat

Better Auth is pinned to 1.7.1. The current configuration does not enable dynamic access control and does not provide an `ac` instance.

Current Better Auth documentation states that dynamic role endpoints such as `/organization/create-role`, `/organization/delete-role`, `/organization/list-roles`, `/organization/get-role`, and `/organization/update-role` require `dynamicAccessControl: { enabled: true }` and an access-control instance. They are not active in the current configuration.

The current native route fence therefore covers the relevant enabled governance mutations. Future configuration that enables dynamic access control must also fence or explicitly route its role-management mutation endpoints through Cimi.

## Verification receipts

The following focused checks passed after the remediation commits were assembled:

- `pnpm --filter @cimi/contract test`: 24 files and 116 tests passed.
- `pnpm --filter @cimi/db test`: 2 files and 6 tests passed.
- `pnpm --filter @cimi/auth test`: 2 files and 15 tests passed.
- Focused API tests for API, governance, Organization, Membership, and Site: 27 files and 82 tests passed.
- `pnpm --filter @cimi/guard test`: 2 files and 21 tests passed.
- Contract, database, Auth, API, and Guard typechecks passed.
- `pnpm --filter @cimi/db db:check` passed with `Everything's fine`.
- `git diff --check` passed.

The Auth tests emitted expected Better Auth warnings about a missing `baseURL` in some fixtures. They still passed.

A real HTTP flow also passed. It signed up two users, ensured a Personal Organization, created a collaborative Organization, added a member through the Better Auth server API, listed members through Cimi, changed the member role, transferred ownership, created a Site, removed the former Owner, and confirmed that stale Organization and Site reads returned 404.

The focused service, repository, contract, database, adapter, route-fencing, and lifecycle tests add coverage for the cases that were missing from the initial audit, including replay authorization, concurrent operations, authority-only removal, pending-state authorization, deletion precedence, leave behavior, provider-failure recovery, cross-store repairs, native route fencing, and database constraints.

## Consumer and maintainer impact

### Consumers

The governance procedures now fail closed when stores disagree, keep cross-store repair work recoverable, and return declared public errors. Current-user authorization is checked before replay and pending-state responses, so stale sessions cannot read protected Organization or Membership state.

### Maintainers

The 18 findings are closed in separate commits ordered by finding number. The Better Auth route caveat remains a conditional maintenance requirement: if dynamic role management is enabled, those routes must be fenced or routed through Cimi too.

## Completeness decision

Issue #36 is complete for the current configuration. All 18 audit findings have remediation commits and focused verification evidence. The only remaining note is the conditional Better Auth dynamic-role route caveat documented above.
