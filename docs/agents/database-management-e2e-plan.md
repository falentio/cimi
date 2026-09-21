# Database management E2E plan

Add direct oRPC procedure tests under `apps/api/e2e` for installation, backup and restore, retention policy, and collection policy state. Use the real implemented router, file-backed isolated databases, and bounded polling. Keep HTTP tests for transport behavior. Deliver one PR named PR-1. The operator merges it after the stack verdict.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `skills/poteto-mode/playbooks/autopilot-stack.md`. The operator reviews and lands PR-1. PR-1 stops at merge-ready until the operator approves it.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to the operator, then stop. Start execution only on her explicit go.
- [ ] On her go, write the goal file with this exact text. "`docs/agents/database-management-e2e-plan.md` names PR-1, uses the verification rule, leaves merge authority with the operator, and is done when the direct-call E2E tests, HTTP regression tests, typecheck, live lanes, and performance gate pass at one verified head SHA."
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:skills/poteto-mode/playbooks/autopilot-stack.md`
  - [ ] `git show origin/main:skills/swarm/SKILL.md`
  - [ ] `git show origin/main:skills/control-cli/SKILL.md` is skipped because this API test has no CLI surface.
  - [ ] `git show origin/main:skills/poteto-mode/playbooks/opening-a-pr.md`
  - [ ] `git show origin/main:skills/architect/SKILL.md`, `git show origin/main:skills/interrogate/SKILL.md`, and `git show origin/main:skills/principle-prove-it-works/SKILL.md`
- [ ] Run the 30-minute audit tick as a background Task with sleep plus poll. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk and the goal file. Audit the operation against both and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then send the operator a status message, whether or not anything changed, with the queue table of PR, owner, state, and head SHA, the verdicts since the last tick, what merged, open operator gates, and blockers."
- [ ] On the operator's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner for PR-1 with the full lifecycle the execution playbook names.
- [ ] Follow this dependency graph. PR-1 is the only PR and branches from `main`.
  - [ ] PR-1 has no parent.
- [ ] Hold the file boundaries. PR-1 touches only `apps/api/src/composition.ts`, `apps/api/src/index.ts`, `apps/api/src/testing/fixture.ts` if a shared fixture seam is required, `apps/api/e2e/**`, `apps/api/tsconfig.json`, and focused verification artifacts.
- [ ] Hold the review gate. PR-1 changes no visual or interactive surface. It is not review-gated.

### PR mechanics

- [ ] Open PR-1 ready, never draft, with `gh pr create` and `draft: false`.
- [ ] Run the repo's narrow lint and typecheck once before the PR-facing push. Push with hooks on.
- [ ] Load the no-comments skill before review.
- [ ] Triage every review-bot comment.
- [ ] Rebase onto current trunk before babysit and again before the merge-ready report.

### Verdict and merge

- [ ] At the merge-ready head SHA, run the swarm per `skills/swarm/SKILL.md`. Use the ten live lanes from PR-1's **Verify, live** block, the perf lane from its **Verify, perf** block, and one audit lane that reads the diff and receipts and distrusts the PR body.
- [ ] Clean only when every lane is `PASS`. Findings go back to the owner. A new head gets a fresh swarm and a fresh verdict.
- [ ] Append PR-1 to the reviewed stack only after the clean verdict. The operator lands it after the patch-id check.

### Boot recipe

Each live lane runs at the PR-1 head via the Task tool. This API surface has no matching control skill. Each lane drives the in-process Hono adapter for session setup and calls the implemented procedures through `@orpc/server` `call`.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Run the focused E2E file with a unique temporary directory and one worker. The fixture starts the API in process. Do not start Nuxt or bind a port.
- [ ] Deliver procedure input through `call(procedure, input, { context })`. Use `app.fetch` only to create Better Auth sessions and to run the narrow HTTP regression checks.
- [ ] Save every lane receipt to `/tmp/swarm-PR-1/worker-<n>/<slug>.json` and return the paths with the report.

## Add database management procedure E2E (PR-1)

**Depends on.** None.

**Files.**

- [ ] Create `apps/api/src/composition.ts`.
- [ ] Edit `apps/api/src/index.ts`.
- [ ] Edit `apps/api/src/testing/fixture.ts` only if a small shared session or disposal helper is needed. Keep the existing in-memory fixture behavior unchanged.
- [ ] Create `apps/api/e2e/fixture.ts`.
- [ ] Create `apps/api/e2e/database-management.e2e.test.ts`.
- [ ] Edit `apps/api/tsconfig.json` to include `e2e`.

**Build.**

- [ ] Move resource construction, the single `api.router({...})` assembly, worker startup, startup recovery, and worker shutdown from `createApiApp` into `createApiComposition`.
- [ ] Return an `ApiComposition` with `router`, `ready`, and an idempotent `close()` method. Derive `ApiRouter` from the composed router return type.
- [ ] Preserve the source startup order. Start the site lifecycle worker, start installation recovery, combine acceptance quiescence, optionally start retention cleanup, create backup and restore, start backup recovery, then start backup cleanup.
- [ ] Make `ready` await installation recovery, backup recovery, and the initial `runOnce()` call for every worker that starts. Keep the existing startup error handling policy and document that `ready` is a settled-work barrier, not a success claim.
- [ ] Make `createApiApp` build one composition and pass it to the Hono and OpenAPI adapter. Keep `ApiApp` transport-shaped and keep `server.ts` responsible for closing analytics and the control database.
- [ ] Add an internal `createApiHttpApp` entry point that accepts an existing composition. Use it in `createApiApp` and in the E2E fixture so session setup and direct calls share one composition.
- [ ] Build `apps/api/e2e/fixture.ts` with a unique file-backed control database, a unique analytics path, a unique data directory, real Better Auth, and the same Hono adapter used by production.
- [ ] Close the composition before analytics and the control database. Remove temporary paths in a final cleanup block. Repeat the cleanup path when fixture construction fails after a resource opens.
- [ ] Create the first user through the same Hono adapter, resolve the session with `auth.api.getSession({ headers })`, and apply the production `installationGrant` fallback. Expose a typed context builder for real admin and non-admin users.
- [ ] Expose a narrow `Pick` of the composed router for installation, backup and restore, retention policy, collection policy, organization setup, and site setup. Do not add a generic `callProcedure` wrapper.
- [ ] Use direct `call` for every procedure assertion. Use the contract-derived procedure input and output types through the implemented router.
- [ ] Poll installation upgrades, backup creation, and restore through their implemented status procedures. Fail on a terminal failure state and assert the terminal checkpoint, readiness, cleanup, and source-backup fields.
- [ ] Prove restore changed database state. Save an installation retention policy through `call`, create and finish a backup, change the policy, restore the backup, and assert the policy returns to the backed-up value.
- [ ] Cover installation initialization and convergent reuse, installation status, backup listing, backup creation, backup status, restore, installation retention defaults, site retention overrides, collection policy overrides, and clearing a site override.
- [ ] Cover one unauthenticated context, one real authenticated non-admin context, and one strict-input failure. Keep transport status and OpenAPI interceptor checks in the existing HTTP tests.

**You see.**

- [ ] `createApiComposition` returns one router instance that both the Hono adapter and `apps/api/e2e` use.
- [ ] `await fixture.ready` settles initial startup work before the first direct call.
- [ ] A direct `call` returns contract-shaped data from the real database-backed resource handler.
- [ ] A completed restore returns `status: 'available'`, `checkpoint: 'structurally_ready'`, ready stores, no pending cleanup, and a non-null `restoreSourceBackupId`.
- [ ] The policy read after restore matches the value captured in the backup rather than the value written after the backup.
- [ ] Fixture disposal closes workers and database handles, then removes the control and data directories.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/api/e2e/database-management.e2e.test.ts` covers initialization reuse, direct-call authorization, strict input validation, policy persistence, backup completion, and restore rollback. Run `vp run --filter ./apps/api test -- e2e/database-management.e2e.test.ts --pool forks --no-file-parallelism --maxWorkers=1`.
- [ ] Existing HTTP tests cover the adapter after composition extraction. Run `vp run --filter ./apps/api test -- src/testing/api.test.ts src/testing/installation.test.ts src/resources/backup-restore/testing/router.test.ts --pool forks --no-file-parallelism --maxWorkers=1`.
- [ ] `apps/api/tsconfig.json` includes `e2e` and the new composition and fixture types pass `vp run --filter ./apps/api typecheck`.
- [ ] Run `vp check apps/api/src/composition.ts apps/api/src/index.ts apps/api/src/testing/fixture.ts apps/api/e2e/fixture.ts apps/api/e2e/database-management.e2e.test.ts apps/api/tsconfig.json`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on the inherited parent model at the PR head, per the boot recipe.

- [ ] Lane 1. Create a file-backed fixture, initialize the installation, and read its status through `call`. Save `installation-status.json`. Pass when the installation is `ready` with no active operation.
- [ ] Lane 2. Initialize the same installation twice. Save `installation-reuse.json`. Pass when the first result reports `201`, the second reports `200`, and both bodies describe the same persisted installation.
- [ ] Lane 3. Call an admin procedure with no user and with a real non-admin session. Save `authorization.json`. Pass when the calls fail with `UNAUTHORIZED` and `FORBIDDEN` without changing the database.
- [ ] Lane 4. Set an installation retention policy and read it through `call`. Save `retention-installation.json`. Pass when the effective policy and persisted default contain the requested values.
- [ ] Lane 5. Create an organization and site, set a site retention override, then clear it. Save `retention-site-override.json`. Pass when the effective policy changes to the override and returns to the installation default after clear.
- [ ] Lane 6. Set an installation collection policy, set a site override, and read the effective policy. Save `collection-policy-override.json`. Pass when the response identifies the site as the source for overridden fields.
- [ ] Lane 7. Create a backup and poll its status through `call`. Save `backup-terminal-state.json`. Pass when the operation reaches `available` with a structural checkpoint and no pending cleanup.
- [ ] Lane 8. Change the retention policy after the backup, restore the backup, and poll the restore through `call`. Save `restore-terminal-state.json`. Pass when the restore reaches `available`, reports the source backup, and exposes a ready safety artifact.
- [ ] Lane 9. Read the retention policy after restore and list backups. Save `restore-persisted-state.json`. Pass when the policy matches the pre-change backup state and the source backup remains listed.
- [ ] Lane 10. Close the fixture after a completed lifecycle run and inspect its temporary paths. Save `fixture-disposal.json`. Pass when workers stop, database handles close, and both temporary directories are absent.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median wall-clock duration of the focused database-management E2E file across three serial runs.
- [ ] Probe. Run the focused E2E command three times at trunk and three times at the PR head with `--pool forks --no-file-parallelism --maxWorkers=1`, recording `/usr/bin/time` output for each run.
- [ ] Baseline. Record the trunk median before implementation in `/tmp/swarm-PR-1/trunk-e2e-timing.txt`.
- [ ] Rule. Fail when the PR-head median is more than 25 percent above the trunk median or exceeds 30 seconds.

**Review gate.** None. PR-1 is not review-gated.

**Merge.**

- [ ] Root's clean verdict exists at the exact PR-1 head SHA.
- [ ] Review triage is done.
- [ ] Rebase onto current trunk after the verdict. Confirm the patch-id is unchanged.
- [ ] Keep PR-1 at merge-ready for the operator to land under `playbooks/autopilot-stack.md`.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Reply to the operator with the report the execution playbook names.

## Appendix A. Prototype evidence

The prototype ran on branch `test/db-e2e-ops` at SHA `48797594fcca3ba5553cbc6d98ec1242f5948f67`.

The command `node --input-type=module -e "import { call, os } from '@orpc/server'; const ping = os.handler(async () => ({ ok: true })); const result = await call(ping, undefined); process.stdout.write(JSON.stringify(result));"` returned `{"ok":true}`. This proves the installed `@orpc/server` package supports the requested in-process `call` shape.

The prototype did not prove the assembled API router, file-backed restore, worker readiness, or Vitest discovery under `apps/api/e2e`. The PR lanes prove those points.

## Appendix B. Alternatives rejected

- Attaching the oRPC router as `app.router` was rejected because Hono owns that name for HTTP dispatch.
- Attaching `orpcRouter` to `ApiApp` was rejected because it expands the transport app with a lifecycle-free internal API.
- Rebuilding resource routers in `apps/api/e2e` was rejected because the registration list and cross-resource dependencies would drift from production.
- Calling services or repositories directly was rejected because it skips contract validation and oRPC middleware.
- Using `app.fetch` for the procedure assertions was rejected because it does not use the requested `call` helpers. Existing HTTP tests retain transport coverage.
- Using an in-memory control database was rejected because restore replaces a file-backed SQLite path.
- Adding a new Vitest project or package was rejected because the existing `vitest run` script and the `e2e` TypeScript include are enough.
- Using `createRouterClient` was rejected because the requested test shape is direct `call` at each procedure site.

## Appendix C. Risks

- Direct `call` does not run the OpenAPI handler interceptors. It does not prove cookie lookup, coarse authorization metadata, admission gates, error normalization, or request-size limits. Existing HTTP tests must remain green.
- Startup errors remain swallowed to preserve production behavior. The E2E fixture must assert the expected initial state after `ready` and fail on terminal lifecycle errors.
- Backup and restore are asynchronous. Every command needs a bounded poll with a clear deadline and a terminal-state predicate.
- The file-backed control database and artifact directory must be unique per fixture. Shared paths can leak state between tests.
- Partial fixture setup can leave worker timers or open handles. The fixture must close every opened resource in reverse ownership order even when setup fails.
- Retention cleanup is disabled for this suite unless a test explicitly covers cleanup. The backup and site workers required by the covered procedures still start and settle their initial run.
- The API has no control skill that can produce screenshots. Live lanes save JSON receipts from real procedure calls instead. This is a verification risk for the operator to watch.
- The first PR excludes analytics reports, event ingestion, identity projection, and profile deletion. Those workflows need separate fixtures and should not be hidden inside this database-management suite.

## Appendix D. Links and reading list

- `apps/api/src/index.ts` owns the current resource graph, OpenAPI adapter, admission interceptors, and shutdown order.
- `apps/api/src/server.ts` owns file-backed database construction and outer database cleanup.
- `apps/api/src/orpc.ts` owns `ApiContext`, contract implementation, and procedure middleware.
- `apps/api/src/testing/fixture.ts` owns the existing sociable API fixture and real session signup helper.
- `packages/contract/src/contract/installation/` defines installation procedures and lifecycle output shapes.
- `packages/contract/src/contract/backup-restore/` defines backup and restore procedures and lifecycle output shapes.
- `packages/contract/src/contract/retention-policy/` and `packages/contract/src/contract/collection-policy/` define policy inputs and outputs.
- `packages/db/src/client.ts` defines file-backed control database creation and restore replacement behavior.
- `https://orpc.dev/docs/client/server-side` documents `call(procedure, input, { context })`.
- Read `skills/how/SKILL.md` before changing the composition boundary.
- Read `skills/interrogate/SKILL.md` before accepting the design or its verification evidence.
- Keep the local decision trail in `decisions.tsv` under `skills/show-me-your-work/SKILL.md` during execution.
