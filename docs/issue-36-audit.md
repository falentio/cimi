# Issue #36 completeness audit

## Overview

Audit date: 2026-09-02.

Audited the `feat/governance` implementation against GitHub Issue #36, `docs/issue-36-plan.md`, the Organization and Membership specifications, the acceptance scenarios, and the reachable HTTP API.

**Verdict. Issue #36 is not complete.**

The implementation serves all eleven required procedures and has the intended major boundaries. Better Auth remains the external Organization and membership authority. Cimi stores Organization metadata, a reconciled membership projection, and durable governance operations. The tested end-to-end path succeeds through real HTTP requests, SQLite, Better Auth, and Site scope checks.

The implementation still has confirmed authorization, convergence, error-contract, and information-disclosure gaps. Several acceptance cases also lack runtime evidence.

No source files were changed during this audit. No Issue #36 changes were made after the implementation commit.

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

The design is sound at the level of the main state model. The gaps below occur at the replay, cross-store, error mapping, and recovery edges.

## Confirmed defects

### 1. Completed transfer replay bypasses current-owner authorization

A completed transfer lookup runs before current membership reconciliation and current-owner authorization in `MembershipService.transferOwnership()`.

Evidence:

- `apps/api/src/resources/membership/service.ts`, `transferOwnership`
- `apps/api/src/resources/membership/repository.drizzle.ts`, `findCompletedTransfer`
- `apps/api/src/resources/membership/router.ts`, transfer handler
- `docs/specs/organization-site-governance/membership/SPECS.md`, stale-session edge case

A former Owner can follow this sequence:

1. Transfer ownership from User A to User B.
2. Remove User A.
3. Reuse User A's still-valid session.
4. Repeat the same transfer request.

The completed-operation lookup checks the historical previous Owner ID, target ID, completed status, target's local Owner role, and the local Owner invariant. It does not check that the historical previous Owner remains an active member or the current Owner. The request returns the target Owner membership before the normal authorization path runs.

This violates the requirement that every protected request rechecks current persisted membership. It also exposes membership state to a former member.

### 2. Better Auth transfer reconciliation does not enforce exactly one authority Owner

`BetterAuthOrganizationAuthority.reconcileOwnership()` retrieves and updates only the previous Owner and the requested target. It verifies those two final roles but does not list all Better Auth members and count all authority Owners.

Evidence:

- `packages/auth/src/organization-authority.ts`, `reconcileOwnership`
- `apps/api/src/resources/membership/service.ts`, `reconcileTransfer`
- `apps/api/src/resources/membership/repository.drizzle.ts`, `completeTransfer`

If a third Better Auth member already has the `owner` role, that third Owner can survive. Cimi can then complete with exactly one local Owner while Better Auth still has multiple Owners. Ordinary membership reconciliation checks all authority Owners, but transfer reconciliation does not use that check. The same authority-wide check is absent when reusing an existing Personal Organization in `OrganizationService.ensurePersonal()`.

### 3. Concurrent duplicate transfers can return a false conflict after success

Two overlapping requests for the same transfer can both observe the same pending operation and call `reconcileTransfer()`.

Evidence:

- `apps/api/src/resources/membership/service.ts`, `transferOwnership` and `reconcileTransfer`
- `apps/api/src/resources/membership/repository.drizzle.ts`, `findPendingTransfer` and `completeTransfer`

The first request can complete the pending operation. The second request then finds that the operation is no longer pending and receives `CONFLICT`. It does not reread the completed operation after that race.

The final state may be correct, but one caller receives a failure for a transfer that succeeded. That conflicts with the plan's idempotent, retry-safe transfer protocol.

This finding is confirmed from the control flow but has not been reproduced by a concurrency test.

### 4. The Personal Organization uniqueness winner skips validation

The normal existing-Personal-Organization branch reconciles and validates the Organization. The uniqueness-race branch returns the winner directly after `insertWithOwner()` fails.

Evidence:

- `apps/api/src/resources/organization/service.ts`, `ensurePersonal`
- `apps/api/src/resources/organization/service.ts`, winner handling after the insert catch

The winner path skips `reconcileOrganization()`, `assertReadable()`, and a fresh authority Owner check. If the winner is pending, malformed, or no longer reconciled, it can return a successful Organization response that the normal reuse path would reject.

The race itself is also not covered by a concurrent HTTP test.

### 5. Authority-only membership removal does not reliably produce `NOT_FOUND`

`BetterAuthOrganizationAuthority.getMember()` searches Better Auth's authenticated `list-members` operation. Better Auth requires the caller to remain a member before listing members.

Evidence:

- `packages/auth/src/organization-authority.ts`, `getMember` and `listMembers`
- Better Auth 1.7.1 installed route for `/organization/list-members`
- `apps/api/src/resources/membership/service.ts`, `reconcileCurrentUserAccess` and `findAuthorityMemberInAuthority`

If authority membership is removed independently while the Cimi membership row remains, the lookup can raise an authorization/provider error instead of returning `undefined`. The service converts that failure to `CONFLICT`. It deletes the stale Cimi row only when the authority lookup returns `undefined`.

The request fails closed, but the specified indistinguishable stale-session result is `NOT_FOUND`. A known Better Auth not-a-member error should be classified as absence while unknown provider failures remain failures.

### 6. Pending governance state can be enumerated through Organization endpoints

Organization pending-operation checks run before persisted access authorization.

Evidence:

- `apps/api/src/resources/organization/service.ts`, `reconcileOrganization`
- `apps/api/src/resources/organization/service.ts`, `delete`
- `docs/specs/organization-site-governance/organization/SPECS.md`, `getOrganization` behavior

An inaccessible caller can distinguish an inaccessible Organization with no pending operation, which returns `NOT_FOUND`, from an existing Organization with pending state, which can return `CONFLICT`. Organization deletion also checks a pending delete operation before confirming current ownership.

This leaks Organization existence and pending-operation state. The service must authorize first while preserving indistinguishable absent and inaccessible responses, or normalize the inaccessible and pending combination to `NOT_FOUND`.

### 7. Several service paths emit undeclared `CONFLICT` errors

The following procedures can reach service paths that throw `CONFLICT` even though their contracts omit that error:

- `membership.listMembers`
- `membership.changeMemberRole`
- `membership.removeMember`
- `membership.leaveOrganization`
- `organization.listOrganizations`
- `organization.getOrganization`
- `organization.updateOrganization`
- `organization.deleteOrganization`
- `site.listSites`
- Site read procedures that reconcile membership

Evidence:

- `apps/api/src/resources/membership/service.ts`, pending reconciliation and command fences
- `apps/api/src/resources/organization/service.ts`, `reconcileOrganization` and deletion failure paths
- `packages/contract/src/contract/membership/query/list.ts`
- `packages/contract/src/contract/membership/command/change-member-role.ts`
- `packages/contract/src/contract/membership/command/remove-member.ts`
- `packages/contract/src/contract/membership/command/leave-organization.ts`
- `packages/contract/src/contract/organization/query/list.ts`
- `packages/contract/src/contract/organization/query/get.ts`
- `packages/contract/src/contract/organization/command/update.ts`
- `packages/contract/src/contract/organization/command/delete.ts`
- `packages/contract/src/contract/site/query/list.ts`
- `packages/contract/src/contract/error-declarations.test.ts`
- `apps/api/src/errors.ts`, `normalizeApiError`

The error normalizer validates the error against the procedure's declared error map. An undeclared error can become an undefined 409 or a generic 500, depending on the oRPC validation path. Provider failures and pending-operation failures therefore do not have a consistent public retry signal.

## Acceptance evidence gaps and conditional risks

These items are not all proof of a separate production defect. They are missing evidence for the Issue #36 acceptance gate or risks in paths that the current tests do not exercise.

### 8. Transfer recovery has no failure-after-authority-mutation evidence

The intended fail-closed sequence exists. Better Auth mutates the target and previous Owner, Cimi finalizes in a transaction, and failures leave the operation pending with failure metadata.

Evidence:

- `packages/auth/src/organization-authority.ts`, `reconcileOwnership`
- `apps/api/src/resources/membership/service.ts`, `reconcileTransfer` and `recordTransferFailure`
- `apps/api/src/resources/membership/repository.drizzle.ts`, `completeTransfer`

No test proves the following cases:

- Target promotion succeeds and previous-Owner demotion fails.
- Better Auth reaches the desired state and Cimi completion fails.
- A later request retries the pending operation and converges both stores.
- A process restart leaves the operation pending and recoverable.
- Both Better Auth and Cimi finish with exactly one Owner.

The current test only asserts a successful HTTP transfer response.

### 9. Membership reconciliation depends on untested transaction ordering

`MembershipRepositoryDrizzle.replaceMembers()` inserts or updates incoming members before deleting stale local members. If an incoming authority page presents a new Owner while an old local Owner still exists, the insert can hit the local partial unique Owner index.

Evidence:

- `apps/api/src/resources/membership/repository.drizzle.ts`, `replaceMembers`
- `packages/db/src/schema/governance.ts`, `membership_one_owner_unique`
- `packages/db/src/client.ts`, synchronous SQLite transaction setup

The transaction should roll back safely, but the rollback and target-owner-first ordering are not tested. The implementation currently maps this scenario to an internal error. This is mainly a provider-drift and recovery risk because ordinary transfer operations are fenced by a pending operation.

`replaceMembers()` invokes the synchronous SQLite transaction without awaiting it. The current `better-sqlite3` transaction implementation makes this compatible with the current database client, but the assumption is not protected by a focused test.

### 10. Removal and leave recovery are not tested

The service deletes the local membership before calling Better Auth. This intentionally revokes Cimi and Site access immediately while the pending operation preserves retry state.

Evidence:

- `apps/api/src/resources/membership/service.ts`, `reconcileMembershipOperation`
- `apps/api/src/resources/membership/service.ts`, leave and removal dispatch

Missing scenarios include:

- Local deletion succeeds and Better Auth removal fails.
- The authority member is already absent on retry.
- The target retries a pending self-removal with a non-admin session.
- Another administrator recovers a pending removal.
- Another caller recovers a pending leave.

### 11. Organization creation and update have non-durable compensation failures

Organization creation mutates Better Auth first and Cimi second. If Cimi persistence fails and Better Auth compensation also fails, the authority Organization becomes an orphan without a durable cleanup operation. An invalid authority response before the persistence try block can also leave an orphan.

Organization update mutates Better Auth first and compensates if Cimi persistence fails. If compensation fails, authority and Cimi names can diverge without a pending repair operation.

Evidence:

- `apps/api/src/resources/organization/service.ts`, `create`
- `apps/api/src/resources/organization/service.ts`, `update`

The current tests do not cover either compensation failure. This is a cross-store durability gap outside the transfer protocol.

### 12. Native Better Auth fencing has incomplete test coverage

The composition root blocks these currently registered native mutation paths:

- `/organization/create`
- `/organization/update`
- `/organization/delete`
- `/organization/invite-member`
- `/organization/add-member`
- `/organization/remove-member`
- `/organization/update-member-role`
- `/organization/leave`
- `/organization/accept-invitation`
- `/organization/reject-invitation`
- `/organization/cancel-invitation`

Evidence:

- `apps/api/src/index.ts`, `NATIVE_GOVERNANCE_MUTATION_PATHS`
- `apps/api/src/testing/api.test.ts`, native mutation test

The test covers only a subset of these paths. It submits an empty body and checks for 404. It does not submit valid mutation payloads and verify that Better Auth state remains unchanged. The governance integration test uses server-side `auth.api.addMember()` directly, so it does not prove public-route fencing.

### 13. Organization lifecycle scenarios are largely untested

The specifications and acceptance scenarios require coverage for:

- Concurrent Personal Organization provisioning.
- Empty Personal Organization deletion.
- Personal deletion precedence over the general non-empty error.
- Non-personal Organization deletion with Sites.
- Organization update authorization and persistence.
- Organization list isolation and pagination.

Evidence:

- `docs/specs/organization-site-governance/organization/SPECS.md`
- `docs/specs/ACCEPTANCE.md`, Personal Organization and deletion scenarios
- `apps/api/src/testing/governance.test.ts`
- `apps/api/src/resources/organization/testing/`

The current tests do not cover most of these cases.

### 14. Membership implementation has no focused service or repository suite

**Remediated in `078fc14` and the finding-14 follow-up commit.**

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

**Remediated in `feat/governance`.**

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

Contract coverage now exercises Organization and Membership command/query inputs and outputs, including invalid IDs, names, roles, pagination, strict objects, malformed timestamps, and owner-sensitive output shapes.

Better Auth adapter coverage now exercises Organization creation, reads by ID and slug, update and delete mapping, known not-found normalization, provider-error propagation, member pagination and mapping, role changes, leave, malformed provider roles, ownership transfer success and recovery, missing transfer targets, and final Owner-state validation. The direct `listOrganizations()` user-ID boundary remains deferred to finding 17 because its behavior is the separate finding there.

Evidence:

- `packages/contract/src/contract/organization/validation.test.ts`
- `packages/contract/src/contract/membership/validation.test.ts`
- `packages/contract/src/contract/error-declarations.test.ts`
- `packages/auth/src/testing/organization-authority.test.ts`

Verification: focused contract tests passed 116 tests; focused Auth tests passed 14 tests; narrow lint/format and type-aware checks passed for all changed TypeScript files.

### 17. `listOrganizations()` ignores its user ID argument

`BetterAuthOrganizationAuthority.listOrganizations()` now makes its session-scoped behavior explicit by accepting only `headers`; the misleading unused `userId` argument was removed. Better Auth derives the subject from the authenticated session and does not expose an explicit user-ID parameter on its public organization-list endpoint.

The current Organization service remains repository-backed and scopes persisted Cimi memberships by the authenticated user. It does not call this authority method, so the public Cimi listing behavior and its existing cross-user isolation remain unchanged.

Evidence:

- `packages/auth/src/organization-authority.ts`, `OrganizationAuthority.listOrganizations`
- `packages/auth/src/testing/organization-authority.test.ts`, session-scoped list coverage
- `apps/api/src/resources/organization/service.ts`, repository-backed user-scoped list
- `apps/api/src/testing/governance.test.ts`, cross-user list isolation

Verification: focused Auth tests passed 15 tests; narrow lint/format and type-aware checks passed for the changed Auth files.

### 18. Session-provider failures are treated as missing authentication

Session lookup failures are now handled at the API boundary as a safe `INTERNAL_SERVER_ERROR` response with HTTP 500. Only a successful lookup with no session continues to produce an absent user and the normal 401 response for authenticated procedures. Provider details are excluded from the public response.

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

The following focused checks passed after the implementation was assembled:

- `pnpm --filter @cimi/contract test`. 23 files and 109 tests passed.
- `pnpm --filter @cimi/db test`. 2 files and 5 tests passed.
- `pnpm --filter @cimi/auth test`. 2 files and 2 tests passed.
- Focused API tests for API, governance, Organization, Membership, and Site. 5 files and 13 tests passed in the latest run.
- `pnpm --filter @cimi/guard test`. 2 files and 21 tests passed.
- Contract, database, Auth, API, and Guard typechecks passed.
- `pnpm --filter @cimi/db db:check` passed.
- `git diff --check` passed before the implementation commit.

The Auth tests emitted Better Auth warnings about a missing `baseURL` in one fixture. They still passed.

A real HTTP flow also passed. It signed up two users, ensured a Personal Organization, created a collaborative Organization, added a member through the Better Auth server API, listed members through Cimi, changed the member role, transferred ownership, created a Site, removed the former Owner, and confirmed that stale Organization and Site reads returned 404.

The HTTP flow did not cover transfer replay, concurrent operations, authority-only removal, pending-state enumeration, deletion precedence, leave behavior, or provider-failure recovery.

## Consumer and maintainer impact

### Consumers

Users can complete the tested Organization, Membership, transfer, Site creation, and persisted-removal flows. A removed former Owner can still replay one completed transfer request with a stale session. Pending operations can produce generic server errors. Authority-only removal can produce a conflict instead of the specified inaccessible result.

### Maintainers

The architecture has the right package boundaries and a useful durable-operation model. Before Issue #36 can be marked complete, maintainers need to close the replay authorization bypass, enforce authority-wide Owner uniqueness, normalize known stale-member errors, fix pending-state authorization ordering, align contracts with emitted conflicts, and add the missing concurrency, recovery, lifecycle, and constraint tests.

## Completeness decision

Issue #36 should remain open. The first implementation commit is valuable and substantially complete in breadth, but the acceptance gate is not met until protected replay paths, two-store Owner convergence, stale-session behavior, pending-state disclosure, and public error mapping are corrected and verified.
