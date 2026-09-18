# Review findings

## P1. Public URL filters can query raw query strings

`apps/api/src/resources/public-dashboard/service.ts:247-253` rejects only filter values containing `?` or `#`. A `contains` filter such as `email=private` passes validation, while `packages/db/src/duckdb/public-dashboard-query.ts:124-131` and `packages/db/src/duckdb/reporting-query.ts:811-825` compare against raw `page_path` and `referrer` values.

An attacker can use aggregate counts as a query-string oracle. This violates the public-dashboard privacy requirements in `docs/specs/analytics-reporting/public-dashboard/SPECS.md:81,83` and `docs/specs/ACCEPTANCE.md:565-571`.

Sanitize URL columns before filtering, or use a public-specific filter renderer that compares only sanitized URL values.

## P2. Status documentation is stale

`docs/specs/README.md:68-70` still says `public-dashboard` is contract-only. `README.md:7` says first-release procedures remain planned, despite registration in `apps/api/src/index.ts:264-327`.

Update both status sections to describe the served reporting procedures.

## P2. Required test conventions are violated

`apps/api/src/resources/reporting/testing/evaluator.test.ts` groups three evaluators under one suite. `apps/api/src/resources/reporting/testing/lifecycle.test.ts` lacks the required suite structure and mocks `ReportingAdmissionService` instead of only repositories. This conflicts with `AGENTS.md:42-43`.

Split the evaluator tests by module and use a sociable admission fixture for the lifecycle coverage.

## P3. Entity prefixes do not match the documented prefix set

`apps/api/src/resources/goal/service.ts:61`, `apps/api/src/resources/funnel/service.ts:61`, and `apps/api/src/resources/cohort-retention/service.ts:64` generate `gol`, `fun`, and `coh`, while `docs/specs/README.md:45` documents a different set.

This has no observed runtime impact because prefixes are documented as non-API invariants, but the convention should be reconciled.

## Verification

- 80 focused API/database tests passed.
- 13 focused contract tests passed.
- Narrow `vp check` passed on 8 key files.
- `git diff --check` passed.
- The worktree was clean before this file was added.
