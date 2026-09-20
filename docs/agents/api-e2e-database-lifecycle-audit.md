# API E2E database lifecycle audit

Audit date: 2026-09-19.

Scope: `apps/api/e2e`, the API composition shutdown path, and the SQLite and DuckDB lifecycle code used by the E2E fixture.

## Verdict

The normal lifecycle is sound. Each fixture gets a unique file-backed SQLite control store and DuckDB analytics store. Stop and restart reuse the same paths. CI runs the E2E suite with one worker and checks for leaked roots.

The two confirmed failure-lifecycle defects are fixed. Outer shutdown now attempts every owned resource and retries only failed phases. SQLite and DuckDB now retain retryable close progress instead of treating a failed native operation as complete. The E2E suite now covers physical analytics recovery from both checkpoints, backup artifact validation, interrupted retention cleanup, and HTTP admission during an active upgrade. Closing finding 3 exposed a third production defect: the retention cleanup worker wedged permanently when a failed run was superseded by a queued run. That defect is fixed too.

## Findings

### 1. Resolved. Teardown now attempts every owned resource after composition failure

**Type.** Production defect, fixed at both ownership boundaries.

**Original evidence.** `apps/api/e2e/fixture.ts` and `apps/api/src/server.ts` awaited composition shutdown before entering their failure collectors. A rejected composition close skipped DuckDB and SQLite closure. Fixture root removal also followed generation shutdown.

**Fix.** `createShutdownCoordinator()` now owns composition, DuckDB, and SQLite at `apps/api/src/server.ts:65-85`. E2E generation ownership uses the same pending-phase model at `apps/api/e2e/fixture.ts:1153-1188`. Fixture fault-gate cancellation, generation closure, and root removal are independent phases at `apps/api/e2e/fixture.ts:367-385`.

Successful phases leave the pending list. A failed phase remains available for the next `close()` call. The fixture marks itself closed only after all pending phases succeed.

**Verification.** `apps/api/src/lifecycle/shutdown-coordinator.test.ts` proves later phases still run, failed phases retry, and concurrent callers share one attempt. The API E2E suite passed 5 files and 22 tests after this change.

### 2. Resolved. Native database close failures are retryable

**Type.** Production database lifecycle risk, fixed in both database wrappers.

**Original evidence.** SQLite set its wrapper state to closed before native close in `packages/db/src/client.ts`. DuckDB set its close flags before checkpointing and used a best-effort native cleanup helper in `packages/db/src/duckdb/index.ts`.

**Fix.** SQLite marks the wrapper closed only after native close succeeds at `packages/db/src/client.ts:27-32`. DuckDB uses `packages/db/src/duckdb/close-progress.ts` to track checkpoint, connection close, and instance close independently. Failed checkpoints and native closes on a returned handle remain retryable. The live rollback-failure path now leaves the database unavailable for normal work and lets the owner close it through the same controller. Best-effort cleanup during failed construction still has no returned owner to retry it.

**Verification.** `packages/db/src/client/testing/client.test.ts` proves SQLite retries a native close. `packages/db/src/duckdb/testing/close-progress.test.ts` proves checkpoint retry, per-resource retry, and concurrent close sharing. `apps/api/src/lifecycle/api-server-shutdown.test.ts` proves server phase wiring continues after composition failure. The focused database run passed 3 files and 18 tests.

The existing successful idempotence tests remain in `packages/db/src/duckdb/testing/duckdb.test.ts:22-104`.

### 3. Resolved. Recovery coverage now proves physical store state from every checkpoint

**Type.** E2E coverage gap, closed. Closing it exposed a third production defect (see finding 7).

**Original evidence.** `seedInterrupted()` writes operation, checkpoint, artifact, and installation rows at `apps/api/e2e/fixture.ts:491-619`. It does not remove or replace DuckDB or corrupt an artifact.

The checkpointed upgrade test still asserts only installation readiness at `apps/api/e2e/lifecycle.e2e.test.ts:7-28`. The production service skips migration and analytics rebuild when the checkpoint is already `duckdb_rebuilt` at `apps/api/src/resources/installation/service.ts:458-505`.

**Fix.** The physical-loss test at `apps/api/e2e/lifecycle.e2e.test.ts:30-137` removes the DuckDB file and its temporary directory, seeds a `sqlite_captured` checkpoint, restarts, and verifies report data. It then repeats the same loss against a `duckdb_rebuilt` checkpoint. That second scenario failed with `QUERY_LIMIT_EXCEEDED`: a fresh DuckDB has no projection checkpoint, so reporting admission refused queries while the installation reported `ready`.

**Fix (production).** `InstallationService` now takes an optional `analyticsProjectionReady` port at `apps/api/src/resources/installation/service.ts:60`. The composition wires it to per-site projection checkpoints and fact cardinality at `apps/api/src/resources/installation/index.ts`. When a resumed upgrade reaches the `duckdb_rebuilt` checkpoint and the port reports missing or stale projections, the service reruns `rebuildAnalytics` before completing.

**Verification.** `vp test apps/api/e2e/lifecycle.e2e.test.ts` passed 3 tests, including both physical-loss scenarios.

### 4. Covered at restore. Backup restart status remains metadata-only by design

**Type.** E2E coverage gap.

**Evidence.** `apps/api/e2e/database-management.e2e.test.ts:458-470` checks that the control database exists, restarts, and calls `getBackupStatus()`.

`getBackupStatus()` reads the operation and artifact rows at `apps/api/src/resources/backup-restore/service.ts:212-216` and `apps/api/src/resources/backup-restore/repository.drizzle.ts:720-752`. It does not stat or checksum the referenced file.

**Impact.** A deleted or corrupted backup file can still produce an `available` status after restart. The restore path validates the file size, checksum, and SQLite integrity at `apps/api/src/resources/backup-restore/executor.ts:129-146`.

**Verification.** `apps/api/e2e/database-management.e2e.test.ts:612-647` corrupts `data/backups/<operationId>.sqlite` between `stop()` and `restart()`. The status endpoint remains metadata-only, while restore rejects the artifact with `INCOMPATIBLE_BACKUP`.

### 5. Resolved. Retention cleanup coverage now includes an interrupted run

**Type.** E2E coverage gap, closed. Closing it exposed a third production defect (see finding 7).

**Original evidence.** The fixture hard-coded `startRetentionCleanupWorker: false`. Composition skipped the worker startup and initial run at `apps/api/src/composition.ts:307-310`.

**Fix.** The fixture defaults to `startRetentionCleanupWorker: false` at `apps/api/e2e/fixture.ts:180-187` and opts in per test, with a configurable `retentionCleanupIntervalMs`. The E2E test at `apps/api/e2e/database-management.e2e.test.ts:251-385` ages an accepted event through `backdateAcceptedEvent()`, takes a real backup, tightens retention, holds the derived cleanup stage through a fault gate so the run is genuinely `running`, stops and restarts the fixture, and waits for both cleanup stages. It then reads the SQLite control database, the backup artifact file, and the DuckDB file directly and asserts the expired event is gone from all three.

**Verification.** `vp test apps/api/e2e/database-management.e2e.test.ts` passed 19 tests, including this scenario repeated three times for stability.

### 7. Resolved. Retention cleanup worker wedged when a failed run was superseded

**Type.** Production defect, found by the new interrupted-cleanup E2E test.

**Evidence.** The partial unique index `retention_cleanup_run_active_unique` allows one non-terminal run per `(installation, site, cleanupKind)`. `claimNext()` selected the oldest `queued`/`failed` candidate and promoted it unconditionally at `apps/api/src/resources/retention-policy/repository.drizzle.ts:249-296`. When a `failed` run and a newer `queued` run coexisted, promoting the failed run violated the index. The worker logged the error on every tick and never made progress.

**Fix.** `claimNext()` now cancels superseded `failed` runs inside the claim transaction before selection. For each `(installation, site, cleanupKind)` slot that owns a `queued` run, sibling `failed` rows are marked `cancelled`. The queued run then claims the slot cleanly.

**Verification.** `apps/api/src/resources/retention-policy/testing/repository.drizzle.claimNext.test.ts` reproduces the wedge and proves reclaim of a lone failed run still works. The retention-policy test package passed 11 files and 71 tests.

### 6. Covered for an active upgrade. Lifecycle helpers still use direct calls for most assertions

**Type.** E2E transport coverage gap.

**Evidence.** Lifecycle helpers call `call(fixture.router...)` directly at `apps/api/e2e/database-management.lifecycle.ts:49-85`. HTTP admission runs in the OpenAPI handler interceptor at `apps/api/src/http-app.ts:60-82`.

**Impact.** Direct calls do not test HTTP admission, request parsing, session extraction, or HTTP error responses for most lifecycle assertions. This is not an authorization bypass. oRPC procedure middleware still runs, and lifecycle resources are intentionally exempt from some HTTP admission rules.

**Verification.** `apps/api/e2e/database-management.e2e.test.ts:416-450` holds an upgrade at migration, sends an authenticated HTTP retention-policy request through `fixture.app.fetch()`, and asserts the `503 SERVICE_UNAVAILABLE` response. Backup and restore routes remain exempt, so they are not suitable for this generic admission assertion.

## Lifecycle flow

```text
createApiE2eFixture() [1]
├── create unique SQLite and DuckDB paths [1a]
├── open a generation [1b]
│   ├── create and migrate SQLite [1b1]
│   ├── create and migrate DuckDB [1b2]
│   ├── create the composition and HTTP app [1b3]
│   └── await startup barriers [1b4]
├── run the test body [1c]
│   ├── call the router directly [1c1]
│   └── stop and restart the same files [1c2]
└── async disposal through shutdown coordinators [1d]
    ├── cancel fault gates [1d1]
    ├── close the current generation [1d2]
    │   ├── close composition workers [1d2a]
    │   ├── checkpoint and close DuckDB [1d2b]
    │   └── close SQLite [1d2c]
    └── remove the temporary root [1d3]
```

## Sound areas

- `mkdtemp()` gives each fixture a unique root at `apps/api/e2e/fixture.ts:261-269`.
- `stop()` closes the current generation while preserving files for restart tests.
- `restart()` opens a new generation against the same paths at `apps/api/e2e/fixture.ts:407-415`.
- `drainGeneration()` cancels held gates before generation shutdown at `apps/api/e2e/fixture.ts:437-440`.
- Failed shutdown phases remain pending for a later close at `apps/api/src/lifecycle/shutdown-coordinator.ts:26-40`.
- CI runs `test:e2e:ci` and checks for leaked roots at `.github/workflows/ci.yml:34-43`.
- Restore preflight validates artifact type, schema version, size, checksum, and SQLite integrity at `apps/api/src/resources/backup-restore/executor.ts:129-146`.

## Verification receipts

- `vp run --filter ./apps/api test:e2e:ci` passed 5 files and 25 tests, twice consecutively after the final fix.
- `vp run --filter ./apps/api typecheck` passed.
- `vp run --filter ./packages/db typecheck` passed.
- `vp check` on the sixteen changed TypeScript files passed formatting, lint, and type checks.
- `vp test packages/db/src/client/testing/client.test.ts packages/db/src/duckdb/testing/close-progress.test.ts packages/db/src/duckdb/testing/duckdb.test.ts` passed 3 files and 18 tests.
- `vp test apps/api/src/lifecycle/api-server-shutdown.test.ts apps/api/src/lifecycle/shutdown-coordinator.test.ts` passed 2 files and 4 tests.
- `vp test apps/api/src/resources/retention-policy/testing/` passed 11 files and 71 tests, including the new `repository.drizzle.claimNext.test.ts`.
- `vp test apps/api/e2e/database-management.e2e.test.ts` passed 1 file and 19 tests, including interrupted retention cleanup, HTTP admission, and fixture teardown after a composition close failure.
- `vp test apps/api/e2e/lifecycle.e2e.test.ts` passed 3 tests, including physical-loss recovery from the `sqlite_captured` and `duckdb_rebuilt` checkpoints.
- `vp test apps/api/e2e/reporting.e2e.test.ts` passed after removing its stale fixed report date.
- No new `cimi-api-e2e-*` roots remained after the serial E2E run. The pre-existing `/tmp/cimi-api-e2e-Sk5KHm` root remains outside this run.

An existing `/tmp/cimi-api-e2e-Sk5KHm` root remained after the audit. Its timestamp predates these runs, so this audit does not attribute it to the current test processes. It contains SQLite and DuckDB WAL files and should be cleaned separately.

This audit and its three confirmed lifecycle defects are reflected in the code and tests. Findings 1-7 are resolved. The remaining observational note is finding 4: backup restart status stays metadata-only by design, and the restore path is the component that validates the physical artifact.
