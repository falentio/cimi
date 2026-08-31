# Issue #36 Implementation Plan

## Baseline

- Issue: [#36 A-01: governance - organization + membership](https://github.com/falentio/cimi/issues/36)
- Starting revision: `main` at `e62d415`
- Starting worktree: clean
- Source of truth: the current `main` tree, the Organization and Membership contracts, and their normative specifications
- Branch target: create a fresh `feat/governance` branch from the starting revision when implementation begins

The implementation starts from the existing contracts, Better Auth setup, control database schema, and authorization seams. The implementation is new work rather than a recovery or continuation of another branch.

## Goal

Deliver the Organization and Membership governance core end to end:

- Organization procedures: `listOrganizations`, `getOrganization`, `ensurePersonalOrganization`, `createOrganization`, `updateOrganization`, and `deleteOrganization`.
- Membership procedures: `listMembers`, `changeMemberRole`, `removeMember`, `leaveOrganization`, and `transferOrganizationOwnership`.
- Better Auth remains the Organization and membership authority.
- Cimi persists Organization metadata and one reconciled `(organizationId, userId)` membership pair.
- Site authorization rechecks persisted membership and observes removal immediately.
- Every supported write leaves exactly one Owner, or rolls back and reports failure.

## Selected Design

Ownership transfer uses a durable, fail-closed protocol. Better Auth and Cimi are not treated as one physical transaction. Instead, no request can authorize against an Organization while its transfer operation is unresolved.

### Durable operation record

Add an Organization governance operation table in `packages/db/src/schema/governance.ts` and a versioned migration. The record should contain:

- Operation ID and Organization ID.
- Operation type, initially ownership transfer.
- Previous Owner User ID and target User ID.
- Pending or completed status.
- Attempt count, timestamps, and safe failure metadata.
- A partial unique index allowing at most one active operation per Organization.

The operation record is internal coordination state, not a domain event. It remains pending across process restarts until reconciliation proves the final state.

### Transfer protocol

```text
transferOrganizationOwnership()
├── authenticate current User
├── reconcilePendingGovernanceOperations()
├── begin Cimi transaction
│   ├── verify persisted current Owner
│   ├── verify target is active and non-owner
│   └── insert pending transfer operation
├── reconcile Better Auth to the desired final state
│   ├── promote target to Owner when needed
│   └── demote previous Owner to Administrator when needed
├── begin Cimi transaction
│   ├── revalidate the pending operation
│   ├── verify Better Auth final state
│   ├── update both Cimi membership roles
│   ├── update organization.ownerUserId
│   └── mark operation completed
└── return the promoted Owner Membership
```

During a pending operation:

- Organization and Membership reads fail closed.
- The Site scope adapter returns no usable membership.
- Commands return a safe conflict rather than operating on partial state.
- Native Better Auth Organization and membership mutation routes cannot bypass Cimi.

The reconciler is idempotent. It reads both stores, applies only missing desired mutations, and retries transient failures. An unknown or unrecoverable state remains fail-closed and leaves the operation available for a later retry or operator repair.

### Owner invariant

Use `organization.ownerUserId` and the `owner` Membership row as a coupled Cimi invariant. Creation and transfer write them in one Cimi transaction. The existing partial unique Owner index prevents multiple Owner rows; repository command transactions must additionally verify that the designated owner has the Owner row and that the final Organization has exactly one Owner. Reads fail closed on zero, multiple, or mismatched Owners.

### Personal Organization convergence

Personal provisioning must be idempotent and safe under concurrent first calls:

- Check for an existing Cimi Personal Organization before creating one.
- Use the existing unique personal-owner boundary as the linearization point.
- Use a deterministic authority correlation key so a losing concurrent call can find and reuse the Better Auth Organization.
- Create and reconcile the authority Organization, authority Owner membership, Cimi Organization, and Cimi Owner membership without relabeling an existing non-personal Organization.
- Retry uniqueness races by rereading the persisted winner.

## Work Sequence

### 1. Normalize the contract boundary

Review the current contract declarations against:

- `docs/specs/organization-site-governance/organization/SPECS.md`
- `docs/specs/organization-site-governance/membership/SPECS.md`
- `docs/specs/DEPENDENCIES.md`

Resolve any ambiguity in deletion error precedence, pagination defaults, transfer errors, and the `changeMemberRole` output before adding handlers. Keep all transport schemas and error declarations in `packages/contract`.

Completion criterion: contract validation tests pass and every issue acceptance behavior has one unambiguous contract mapping.

### 2. Establish the Better Auth boundary

Add a narrow authority adapter in `packages/auth` for the server-side Organization and Membership operations. Keep Better Auth-specific calls inside that package and expose typed operations to the API resource services.

Update `apps/api/src/orpc.ts` and `apps/api/src/index.ts` so `ApiContext` retains the incoming `Headers` alongside the authenticated User. Use request headers for operations whose Better Auth endpoint requires request authentication and `userId` for trusted server-side creation calls where appropriate.

Gate native Better Auth Organization and membership mutation routes in the API composition root. Cimi procedures must be the only public governance mutation boundary.

Completion criterion: authority adapter tests cover successful calls, provider errors, missing headers, and role mapping; direct native mutation routes cannot change governance state.

### 3. Add governance persistence and repositories

Keep schema, migration, and transaction primitives in `packages/db`. Add the durable governance operation table and migration in the existing governance schema.

Add repository interfaces and Drizzle implementations under:

- `apps/api/src/resources/organization/`
- `apps/api/src/resources/membership/`

Follow the existing Hello resource pattern, named dependency objects, strict result mapping, live offset pagination, and `limit + 1` page reads. Repository methods that mutate ownership or membership must expose transaction-safe operations rather than separate unchecked row updates.

Completion criterion: a fresh control database migrates successfully, repository tests cover ordering and pagination, and invalid Owner states cannot be returned as valid domain results.

### 4. Implement Organization services and router

Implement the Organization resource with:

- Persisted-membership filtering for list and get.
- Indistinguishable `NOT_FOUND` for absent and inaccessible Organizations.
- Concurrent Personal Organization convergence.
- Caller-as-sole-Owner creation with no implicit Site.
- Owner-or-Administrator updates.
- Owner-only deletion with Personal protection checked before the general Site guard.

The service owns orchestration. The router maps contract procedures to the service and preserves the contract status and error catalog.

Completion criterion: Organization service and router tests pass for all acceptance bullets and no command trusts active-session navigation state as scope authorization.

### 5. Implement Membership services and router

Implement Membership with:

- Authority-reconciled active member listing.
- Owner-or-Administrator role changes limited to `admin` and `member`.
- Owner-protected removal and leave operations.
- Owner-only transfer to an existing active non-owner.
- Immediate persisted membership revocation for Organization and Site access.
- Pending-operation checks before every protected read and command.

Every role change must reconcile Better Auth and Cimi. Authority-side removal or demotion must not leave a stronger Cimi role usable.

Completion criterion: all membership procedures return the specified errors and statuses, preserve the Owner invariant, and use the durable transfer protocol for ownership changes.

### 6. Add persisted Site-scope integration

Implement the API-layer adapter for `SiteMembershipPort` and any required Site scope lookups using `@cimi/db`. Keep `packages/guard` independent of the database. The adapter must recheck the current Cimi Membership row and fail closed when an Organization transfer is pending.

Completion criterion: removing or leaving a Membership causes `assertSiteScope` to reject the User on the next request using the same control database.

### 7. Compose and verify the API

Add `createOrganization()` and `createMembership()` factories, return implemented routers from those factories, and assemble them through the reusable API implementer in `apps/api/src/orpc.ts`. Register the routers in `createApiApp` without duplicating contract definitions.

Completion criterion: authenticated HTTP requests reach all eleven procedures through the documented routes and unauthenticated requests remain rejected by the existing coarse authorization middleware.

## Test Matrix

- `packages/contract`: strict input/output validation and centralized error declarations.
- `packages/db`: migration, unique personal ownership, at-most-one Owner, transaction rollback, and malformed-state checks.
- `packages/auth`: Better Auth authority adapter and request-header behavior against the lockfile-pinned version.
- Organization service: list/get isolation, personal provisioning races, create/update/delete authorization, Site deletion precedence, and provider failure handling.
- Membership service: role validation, Owner protection, authority reconciliation, removal/leave behavior, and transfer target validation.
- Transfer recovery: failure after authority mutation, failure before Cimi commit, process-retry convergence, duplicate transfer admission, and final exactly-one-Owner state in both stores.
- API routers: real SQLite and Better Auth integration with sociable fixtures; mock only repository boundaries in service tests.
- Site guard integration: persisted membership removal and pending-transfer fail-closed behavior.

## Focused Verification

Run only affected commands, sequentially:

```text
pnpm --filter @cimi/contract test
pnpm --filter @cimi/db test
pnpm --filter @cimi/auth test
pnpm --filter @cimi/api test -- src/resources/organization src/resources/membership
pnpm --filter @cimi/guard test
pnpm --filter @cimi/contract typecheck
pnpm --filter @cimi/db typecheck
pnpm --filter @cimi/auth typecheck
pnpm --filter @cimi/api typecheck
pnpm --filter @cimi/guard typecheck
pnpm --filter @cimi/db db:check
```

Use the focused lint and format workflow from `docs/agents/lint-format.md` for the known changed files. Finish by checking `git status --short` and confirming that only the intended implementation and test files are present.

## Acceptance Gate

Issue #36 is complete only when:

- All eleven procedures are served through the Cimi API.
- Better Auth native governance mutations cannot bypass Cimi persistence.
- Personal Organization provisioning converges under concurrency.
- All protected reads reconcile authority state and fail closed on disagreement.
- Ownership transfer recovery converges both stores without exposing an unresolved operation.
- Exactly one Owner is preserved in every successful final state.
- Membership removal immediately revokes Site scope.
- Focused tests, typechecks, migration checks, lint, and formatting pass.

## References

- `packages/contract/src/contract.ts:13-18`
- `packages/db/src/schema/governance.ts:13-60`
- `packages/auth/src/server.ts:14-35`
- `packages/guard/src/site.ts:5-50`
- `apps/api/src/orpc.ts:6-18`
- `apps/api/src/index.ts:25-83`
- `docs/specs/organization-site-governance/organization/SPECS.md:40-164`
- `docs/specs/organization-site-governance/membership/SPECS.md:33-146`
- `docs/specs/DEPENDENCIES.md:131-140`
