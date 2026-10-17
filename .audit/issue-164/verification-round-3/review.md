# PR #168 review — round 2: disposition of the round-1 findings at `9f7d2cbf`

- PR: https://github.com/falentio/cimi/pull/168 (falentio/cimi) · branch `fix/issue-164` · issue #164
- Head under review: `9f7d2cbfe31de66c8137b5bf905a9c163b238a3d` (`gh pr view 168` → `headRefOid`, `mergeable: MERGEABLE`)
- Range reviewed: `8c332b64..9f7d2cbf` (29 commits, 50 files, +5527 / -235; the bulk is the committed round-2 evidence under `./.audit/issue-164/verification-round-2/out/`)
- Worktree: `/home/kevin/Repositories/cimi/.worktrees/verify-issue-164`. Paths below are relative to that worktree root.
- Round 1: `./.audit/issue-164/verification-round-2/code-review.md` (= `/tmp/review-168.md`) reviewed `8c332b64`; `./.audit/issue-164/verification-round-2/report.md` is the independent functional verification at the same head, and it is the document that named F1 and F2.
- CI at the head under review: run `38914800798`, head `9f7d2cbf`, conclusion **success** (`gh run view 38914800798 --log`). That log is load-bearing evidence below; it was read, not assumed.
- Method: my own read of every fix hunk at HEAD, plus one delegated Standards pass (S1–S5 and the test-file rules) and one delegated Spec pass (P1 and criterion coverage). Every load-bearing claim below was re-verified at HEAD by me, and two of the delegated severities are corrected here.
- Read-only limits honoured: no file in any worktree was created, edited, moved or deleted; no `git stash`, no suite run, no worktree created. `git diff/show`, `gh` and file reads only. One suite result (CI) is quoted from the public run log, not re-run locally.

## Disposition

| Round-1 finding | Verdict | Severity I assign |
| --- | --- | --- |
| F1 (`ready()` false across the append window, mid-seed 503) | **PARTIAL** — measured cause removed and pinned; the named mechanism is not closed; the post-fix re-measurement is prose | major |
| F2 (`readProperties` past 32,766 bound variables) | **FIXED** — root cause chunked, red-first test crosses the cap; loop-level symptom unpinned | fixed (minor residue) |
| S1 (resource test outside `testing/`) | **FIXED** | fixed |
| S2 (hand-rolled PRNG vs `packages/utils`) | **FIXED** | fixed |
| S3 (unrecorded ADR-0006 override) | **FIXED** | fixed |
| S4 (purge stamped 30 days in the future) | **FIXED** | fixed (minor residue) |
| S5 (silent release failure) | **PARTIAL** — logging done, recovery path not | major |
| P1 (acceptance evidence not reproducible) | **FIXED in substance** — committed e2e in CI; acceptance volume still manual | major (reduced) |
| new: R1 duplicated no-op rebuild left in the sibling drain | — | major |
| new: R2–R6 (see below) | — | minor |

---

## Functional findings

### F1 — `ready()` during the append window: major, cause removed, mechanism not closed, re-measurement uncommitted

**What is fixed.** The retention drain no longer rebuilds the projection when it has nothing to redact. Guard added at `./apps/api/src/resources/event-ingestion/retention-cleanup.ts:118-131` (the added conjunct is `hasPendingIdentityRedactions(this.db, input.siteId)` at `:126`), the query now takes an optional site scope (`:401-411`), and `markProfileDerivedCleanupComplete` is site-scoped again (`:434-437`). Red-first order holds: `a4f88286` added `./apps/api/src/resources/event-ingestion/testing/retention-cleanup.test.ts:302` (`skips the analytics rebuild when no profile redaction is pending`, asserting `rebuildCalls` is empty), and `9c39f9d3` is the fix that turns it green. This is a real fix to a real defect: `rebuild()` sets `rebuilding = true` for the length of a full projection (`./packages/db/src/duckdb/index.ts:413-419`), and `ready()` returns false while that flag is set (`:259`).

**What is not fixed.** `ready()` still reads the shared DuckDB connection directly, outside the serial chain every other path uses: `./packages/db/src/duckdb/index.ts:258-284` calls `connection.runAndReadAll` without `enqueue`, while the chain is defined at `:199-208` and the append's chunk transaction runs through it at `:220-252`. That is precisely the mechanism round 2 named ("a call that lands inside a chunk is false, and the swallowed `catch` is why the error cannot be read from outside"). The only change in this range to that method is a `console.error` in the catch block (`:279-281`). The failure is now diagnosable; it is not removed.

**The evidence disagrees, and the branch's own committed report is on the other side.** `./.audit/issue-164/appendix-c-risks.md:76-87` states that a second independent pass attributed every false `ready()` sample to the retention rebuild, that "the drain now rebuilds only when a redaction is pending, so a seed raised no rebuild at all: 0 false samples out of 103, and the 90-day query returned 200". The branch's committed verification at the same head says the opposite: 14 of 68 samples false, all inside the append window, and an HTTP 503 from a mid-seed query (`./.audit/issue-164/verification-round-2/report.md:16`, F1 section). The 103-sample run has no artifact in the branch: the committed payloads under `./.audit/issue-164/verification-round-2/out/` are all at `8c332b64` (that is what `./.audit/issue-164/verification-round-2/README.md:5-7` says), `grep -rn '0 false'` finds the claim only in the prose of `appendix-c-risks.md:85`, and the harness that produced it lives in an untracked scratch directory (`./.audit/verify-164/`, which also holds the previous pass's `criteria-2-3-v2.test.ts` and `ready-probe.test.ts`) and was not added to the tree.

**What supports the branch, and why I do not call this a blocker.** Two pieces of first-hand evidence point the same way as the appendix. First, an append-only window has no `rebuilding` latch and no path to `false` except a throw: `unavailable` is set only when a ROLLBACK itself fails (`./packages/db/src/duckdb/index.ts:541-546`). Second, that property is now pinned by a test that hammers `ready()` through a **multi-chunk** append — `./packages/db/src/duckdb/testing/projection-append.test.ts:289-318`, with `CHUNK_ROWS = 2_000` (`:11`) and `INTERLEAVED_EVENTS = 10_000` (`:15`) — and CI is green at this head, which means that test passes. Note what that test is: it is a characterization test, not a red-first pin, because `ready()` was byte-identical at `8c332b64` apart from the log line. It contradicts the round-2 measurement rather than fixing it, and it does so in memory while round 2 measured a file-backed store.

**The gap that remains after merge.** The only committed rerunnable check of the readiness window at this head is the e2e, and in CI it runs one chunk: `./apps/api/e2e/demo-seed-projection.e2e.test.ts:8` defaults the window to 3 days (~900 events against `DEFAULT_APPEND_CHUNK_ROWS = 2_500`, `./packages/db/src/duckdb/projection-append.ts:34`), and the zero-false assertion at `:123` is over that run. Criterion 2's failing shape (3 chunks, 27.6k events) has no committed lever. Recommend before merge: the in-flight verification at this head must reproduce criterion 2's readiness half; and the branch should commit either the round-2 harness at acceptance volume or a second e2e arm under the same env gate it already documents.

### F2 — `readProperties` bound-variable overflow: fixed

`./packages/db/src/duckdb/projection-source.ts:194-228` replaces one `IN (?, …)` per event pk with a deduplicated, ascending pk list read in 900-row chunks (`PROPERTY_PK_CHUNK` at `:199`, loop at `:213-214`). Order is preserved: each chunk carries the same `ORDER BY event_pk, property_key` and chunks ascend, so the concatenated result keeps the contract callers had. Red-first order holds: `3f9e090e` added `./packages/db/src/duckdb/testing/projection-source.test.ts:93` with `BOUND_VARIABLE_CAP = 32_766` (`:8`) and seeds one pk past it; `41a91d81` is the fix.

No installation-scaled bound list remains. The two other `placeholders()` sites are bounded by one chunk's rows: `./packages/db/src/duckdb/projection-fold.ts:203-232` (visitor/session ids of the chunk) and `./packages/db/src/duckdb/projection-append.ts:373-390` (ids of the chunk). The retention store's other `IN` lists are subqueries, not bound lists (`./apps/api/src/resources/event-ingestion/repository.drizzle.ts:186-190`, `./apps/api/src/resources/event-ingestion/retention-cleanup.ts:509-519`).

Residue (minor, R4 below): the test pins the read, not the loop it broke.

---

## Standards axis

### S1 — FIXED
The file moved to `./apps/api/src/resources/demo-seed/testing/attribution.test.ts:13` (`91fa7253`), and the rule is now enforced rather than documented: `./apps/api/src/testing/resourceTestLayout.test.ts:33-38` walks `resources/**` recursively (`resourceFiles`, `:10-18`) and fails on any `*.test.ts` whose parent directory is not `testing` (`56d2a627`). This closes the enforcement gap round 1 identified. Residual minor: the rule pins the directory, not the filename vocabulary — `bannedTestFiles` still holds only `service.test.ts` and `repository.drizzle.test.ts` (`:8`), so `testing/anythingElse.test.ts` passes where `./AGENTS.md:56` enumerates three permitted forms.

### S2 — FIXED
`./apps/api/src/resources/demo-seed/fabric.ts:364-368` now seeds the shared generator: `createXoroshiro128PlusPlus({ seed: seedFromString(seed) })`, with the string-to-bigint helper added to `packages/utils` at `./packages/utils/src/rng/index.ts:23-37` (`seedFromString`, FNV-1a over UTF-16 code units), exported through `./packages/utils/src/index.ts:137-143` and tested at `./packages/utils/src/rng/testing/seedFromString.test.ts`. The inline mulberry32 and `hashSeed` are gone. Commits `d98949a5`, `361e6bc8`. This is the outcome round 1 asked for: one seeded generator in the repo.

### S3 — FIXED
`./docs/adr/0006-recoverable-site-deletion.md:48-53` records the unseen-site release as an explicit repository operation with the demo seed as its only caller, and states that the release records the time it ran rather than the deadline it skipped. `56eeadb0`. The override is no longer silent, which was the finding.

### S4 — FIXED
`./apps/api/src/resources/site/service.ts:222-227` passes `requestedAt: new Date()` with `unseen: true`; the repository guard honours the flag explicitly (`./apps/api/src/resources/site/repository.drizzle.ts:664`: `(input.unseen !== true && input.requestedAt < site.purgeAt)`) and writes the tombstone and the lifecycle operation from the same real instant. Pinned at `./apps/api/src/resources/site/testing/repository.drizzle.purge.test.ts:194` (the `unseen: true` purge) and `:199` (`tombstone?.purgedAt` equals the requested time). Commits `1b2eaf33`, `329e1680`. The audit trail now reports a purge that happened.

Residual minor: a tombstone still reports one timestamp four times — `deletedAt`, `recoveryDeadline`, `purgeAt` and `requestedAt` all come from `tombstone.purgedAt` (`./apps/api/src/resources/site/repository.drizzle.ts:808-819`), so the deletion instant is unrecoverable from a tombstone. Pre-existing, and only now visible because release time and deadline differ.

### S5 — PARTIAL: major
The logging half is done and is better than the round-1 floor. Every early return in `releaseDemoSite` reports a structured failure with the lifecycle status it stopped at (`./apps/api/src/resources/site/service.ts:181`, `:197`, `:210`, `:229`, through `reportDemoReleaseStop` at `:413-424`), and the seed's discarded release failure is now logged too (`./apps/api/src/resources/demo-seed/service.ts:98-105`). Commits `645897c9`, `8432138c`; pinned by `./apps/api/src/resources/site/testing/service.releaseDemoSite.test.ts:8`, `:33`, `:89`, `:99`, `:109`, `:149`.

The recovery half is not done, and the consequence round 1 named is only softened. `findDuePurges` scans `status = 'deleted'` only (`./apps/api/src/resources/site/repository.drizzle.ts:791-796`), so a site whose `completeDelete` failed stays in `deleting` and invisible to the worker's purge scan (`./apps/api/src/resources/site/lifecycle.ts:101`). The pending delete operation is eventually resumed (`./apps/api/src/resources/site/repository.drizzle.ts:752-766`, operation inserted as `pending` at `:296-310`), which means the personal organization unlocks after the 30-day window instead of never. That is bounded, not fixed.

Two minor residues in the same fix: the seed's release failure is reported under `stage: 'site-delete'` (`./apps/api/src/resources/demo-seed/service.ts:98-105`) although the call that failed is the release, and the lifecycle status that makes these logs useful rides inside `error.message` (`./apps/api/src/resources/site/service.ts:423`) where every other log event in the repo carries structured properties.

### R1 — the same no-op rebuild is left in the sibling drain: major (pre-existing, left by this range)

`./apps/api/src/resources/event-ingestion/retention-cleanup.ts:221-226` (`AcceptanceBackupRestoreCleanup.runDerived`) still rebuilds the entire installation whenever any retention boundary exists — the pending-redaction check is absent there, and `boundaries.length === 0` is effectively never true in production. The rationale the fix wrote for its own guard applies verbatim: "Rebuilding with none pending takes the whole installation's analytics offline for the length of a full projection and changes nothing" (`:118-119`). This code is identical at the merge base (`git show 24ee376f:apps/api/src/resources/event-ingestion/retention-cleanup.ts`, `:214-215`), so it is not a regression and not a merge blocker; it is the half of the F1 fix that was not carried across, and it leaves the same outage shape on the backup-restore path.

### Standards minors introduced or left by this range

- **R3 (minor)** The readiness probe's new failure path writes an unstructured line from a library package: `console.error('Analytics readiness probe failed', error)` at `./packages/db/src/duckdb/index.ts:279-281`. Operational logging in this repo is `@cimi/logging`'s `reportLogEvent` (used by every service in this same diff, e.g. `./apps/api/src/resources/site/service.ts:418`), and `packages/db`'s only precedent is a CLI entry point (`./packages/db/src/push-cli.ts:16`, `:54`). Fine as an instrument while the cause was unknown; now that the accompanying fix landed, either route the probe through `enqueue` or report through the logging port.
- **R5 (minor)** The new test logging seam restores the default configuration, not the one it replaced: `stop()` calls `configureSync({ reset: true, ...createLoggingConfiguration() })` (`./packages/logging/src/testing/index.ts:36-38`). Every caller in this range stops the capture in a `finally`, so nothing is broken today; it becomes a hazard the first time a test file installs its own configuration and another file captures.
- **R6 (minor)** `./apps/api/src/resources/demo-seed/testing/service.seedTrigger.test.ts:35-58` replaces `appendProjectedEvents` with a hand-rolled `Proxy` double that answers fabricated zero counts, where `./AGENTS.md:55` names `vitest-mock-extended` for typed mocks. I do not read that rule as breached — it speaks of repository mocks, and this is an analytics port — but the file's justification ("running it here spends the CPU every other analytics test needs") is what let P1 stand for a whole round, and the real path now has a committed home in the e2e. This is a simplification opportunity, not a violation.

---

## Spec axis

### P1 — FIXED in substance; the acceptance volume is still manual (major, reduced)

The round-1 defect was that the only end-to-end evidence for criteria 2 and 3 was prose plus a throwaway harness. That is answered: `./apps/api/e2e/demo-seed-projection.e2e.test.ts` is a committed, 300 s-budget e2e that builds the real composition over an on-disk store (`./apps/api/e2e/fixture.ts:196`, `:354-355` pass the seed window through the composition seam added at `./apps/api/src/composition.ts:91`, `:208`), stubs nothing, samples `ready()` from before the ensure request (`:64`) through convergence, and asserts zero false samples (`:123`), DuckDB row count equal to the accepted count, matched checkpoint sequence, and zero duplicate `(site_id, event_id)` groups. `apps/api/e2e/` pre-exists at the merge base (9 files), so both the location and the `*.e2e.test.ts` name follow the established surface; `./docs/agents/database-management-e2e-plan.md` and `./docs/agents/api-e2e-database-lifecycle-audit.md` sanction the directory. `7e52a292`.

It runs in CI, at this head: `./.github/workflows/ci.yml:37-38` (`vp run --filter ./apps/api test:e2e:ci`), and run `38914800798` logs `✓ e2e/demo-seed-projection.e2e.test.ts (1 test) 2911ms`.

What remains: the volume that the failing criterion is written about is gated behind an env var nothing sets. `./apps/api/e2e/demo-seed-projection.e2e.test.ts:8` defaults to 3 days, `:140-142` is the only `accepted > 25_000` assertion, and `grep -rn CIMI_DEMO_SEED_HISTORY_DAYS` finds exactly those two lines in the whole repo. So the 27k-event, 90-day run that criteria 2 and 3 name still happens only when a reviewer reads a code comment and sets the variable. Cheapest closure: set the variable in one CI job, or commit the round-2 harness that already exists untracked at `./.audit/verify-164/criteria-2-3-v2.test.ts`.

### Remaining spec gaps (from the delegated Spec pass, corrected where needed)

- **AC3 (minor)** The committed assertion is `expect(overview.trend).toHaveLength(90)` (`./apps/api/e2e/demo-seed-projection.e2e.test.ts:138`); a refused read throws, so the criterion's admission is proven, but its named facets (statistics, coverage, no open gaps) are not asserted, and the retention boundary the query needs is produced by a worker whose first tick is awaited by nothing in the test.
- **AC4 (minor, corrected)** The delegated pass called this "no committed artifact". Half right: there is no committed harness, but the measurement and its raw payload are committed — median 33 ms seeded vs 37 ms unseeded, delta −4 ms over 5 interleaved pairs in `./.audit/issue-164/verification-round-2/out/criterion-4.json`, with the method in `./.audit/issue-164/verification-round-2/report.md`. The gap is rerunnability, the same one P1 named, at a smaller scale.
- **AC5 (minor)** Append-level convergence and duplicate-freedom are committed (`./apps/api/e2e/demo-seed-projection.e2e.test.ts:119-123`); the interrupted-seed-then-rerun shape remains prose, and round-1 P2's point stands: `ensurePersonal` seeds only on the insert path, so a product-level rerun of the same organization does not exist.

### Round-1 minors this range also closes

P6 (one hostname for every demo site) is fixed: `./apps/api/src/resources/site/service.ts:24-26` derives `demo-<organizationId>.example.com`, used at `:130` (`f5167463`). P8 (a short seed batch reported as success) is fixed: `./apps/api/src/resources/event-ingestion/seed-journal.ts:53-62` accumulates across attempts and reports `operation.failure` when a spent replan budget left events unlanded (`00d86f39`). P10 (an exact multiple of the chunk size buys a transaction) is fixed: a chunk that reads no events returns the published checkpoint untouched (`./packages/db/src/duckdb/projection-append.ts:190-200`), so the generation no longer depends on the event count modulo the chunk size, pinned by the generation assertion at `./packages/db/src/duckdb/testing/projection-append.test.ts:428-431` (`1b4793cb`, `c69258d8`).

---

## Test files against the repo's rules

The delegated Standards pass audited every new and changed test file against `./AGENTS.md`, `./docs/agents/`, `./docs/adr/0008-resource-repository-boundaries.md`, and the two enforcement tests. No blocker. Beyond S1's residual and R5/R6 above:

- **R2 (minor)** `./.audit/issue-164/appendix-c-risks.md:89-96` asserts that `--exclude e2e` does not exclude and that the unit suite already carries the heavy e2e tests. The branch's own CI at this head contradicts it: the unit step ran `vitest run --exclude e2e` and every e2e ✓ line, including the new file's, appears only under the `API E2E` step. Either the claim was measured on a different Vitest or it is wrong; as written it understates lane separation and will mislead the next reader.
- **R4 (minor)** The F2 regression test proves the statement survives the cap but not that every chunk is read: it inserts exactly one property row, on the last pk (`./packages/db/src/duckdb/testing/projection-source.test.ts:148`), and asserts only that row (`:93-108`). A dropped middle chunk would pass. One property at a chunk boundary, or a returned-row count, closes it.
- **Cleared** (checked, no finding): one top-level `describe` per file with the `<ClassName>.<method>` name in every audited file; no `vi.mock`/`vi.spyOn` added in this range; `./packages/logging/package.json` and `./packages/utils` gain their `testing/` surface in the same layout 28 other packages already use; `./apps/api/src/resources/demo-seed/testing/service.seedTrigger.test.ts:61` and the bare-class `describe` in `retention-cleanup.test.ts:55` both follow existing repo precedent, so round-1 m1's naming concern is closed by the rename to a concern file (`9d6788a2`). ADR-0008 holds across the range: every repository import the diff adds is a resource's own (`./repository.ts` in `event-ingestion`, `site`, `organization`), the single cross-resource one sits in a test fixture (`./apps/api/src/resources/event-ingestion/testing/retention-cleanup.test.ts:22` imports `InstallationRepositoryDrizzle` from the installation resource), which `./AGENTS.md:46-47` explicitly permits, and the enforcement test that fails the suite on a production violation (`./apps/api/src/testing/resourceRepositoryBoundary.test.ts:152`) is green in CI at this head.

## Limits and what I did not verify

- No suite was run (read-only, and an independent verification is running in this worktree), so the passing status of the new and strengthened tests is taken from the green CI run at `9f7d2cbf`, which covers both the unit lane and the e2e lane. The two tests central to this review — the multi-chunk readiness hammer (`projection-append.test.ts:289`) and the no-rebuild guard (`retention-cleanup.test.ts:302`) — pass in that run, which is what I rest F1's non-blocker reading on.
- Criterion 2 at acceptance volume is still unmeasured by an artifact in the branch. The deciding measurement is the in-flight verification at this head; this review's F1 verdict should be re-read against it.
- I did not verify the PR body's claims (round-1 P9) or re-derive the projection's own numbers; the round-2 report's acceptance figures are quoted, not reproduced.
- The in-memory versus file-backed difference under `ready()` is not settled by static reading. I found no code path by which an append chunk alone makes `ready()` false, which is why F1 is major and not blocker; a file-backed re-measurement is the only thing that settles it.

## Axis summary

- **Standards**: 4 fixed, 1 partial (S5, major), 1 new major (R1, the sibling drain's no-op rebuild), 4 minor. Worst: S5 — a failed release still has no recovery path, so the personal organization is locked for the recovery window rather than forever.
- **Spec**: P1 fixed in substance and running in CI, reduced to a volume-gating gap; 3 remaining minors. Worst: the acceptance volume that criteria 2 and 3 are written about still runs only by hand.
- **Functional**: F2 fixed at its root with a red-first test; F1's measured cause removed and pinned, its named mechanism still open, its post-fix evidence uncommitted. Worst: F1, because the criterion that failed round 2 has no committed artifact at this head proving it now passes.
