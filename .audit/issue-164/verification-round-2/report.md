# Independent functional verification — PR #168 / issue #164

- Repo: falentio/cimi · PR #168 · issue #164 · branch fix/issue-164
- Head verified: `8c332b64906c55bf91e227a8cd20d64386576752` (detached worktree `/home/kevin/Repositories/cimi/.worktrees/verify-issue-164`)
- Verified: 2026-10-16, by an agent that did not write the branch. CI green was not treated as evidence.
- Tracked tree untouched: `git status --porcelain` = `?? .audit/verify-164/` only.
- Method: every criterion measured through the real composition root (`createApiApp` with the same dependency object `apps/api/src/server.ts` builds: on-disk `control.sqlite` + `analytics.duckdb` in a temp dir, retention cleanup worker ON (default), demo seed ON (default)), from throwaway harnesses in the worktree's untracked `.audit/verify-164/` plus `/tmp/verify-164/`.
- Raw payloads: `/tmp/verify-164/out/*.json`. Logs: `/tmp/verify-164/logs/*.log`.
- Rerun shape: `cd /home/kevin/Repositories/cimi/.worktrees/verify-issue-164 && vp test run .audit/verify-164/<file>.test.ts`. The harness directory holds a scratch `node_modules -> ../../apps/api/node_modules` symlink so `@cimi/*` resolves inside the worktree.

## Verdicts

| # | Acceptance criterion (issue #164) | Verdict | Raw numbers | Exact command | Log |
| --- | --- | --- | --- | --- | --- |
| 1 | Three contract suites pass unchanged (16 tests) | **PASS** | 16/16 across the three files: duckdb.test.ts 8, projection-read.test.ts 5, evidence.drizzle-duckdb.read.test.ts 3. `git diff --stat origin/main...HEAD` over the three paths is empty — the branch does not touch them. | `vp test run --reporter=verbose packages/db/src/duckdb/testing/duckdb.test.ts packages/db/src/duckdb/testing/projection-read.test.ts apps/api/src/resources/traffic-report/testing/evidence.drizzle-duckdb.read.test.ts` | `/tmp/verify-164/logs/step1-contract-suites.verbose.log` |
| 2 | 27,000-event seeded site reaches DuckDB through the append with `ready()` true throughout | **FAIL** | All the projection facts hold: 27,627 accepted events (custom_event 5,508 / error 5,563 / outbound 5,546 / page_view 5,412 / performance 5,598), occurrence span 89.98 d, DuckDB events 27,627 = checkpoint `projectedAcceptanceSequence` 27,627 = `projectedFactCardinality` 27,627 = live `count(*)` 27,627, 0 duplicate `(site_id, event_id)` groups in both stores, 0 gaps, 3 chunks, generation 4. **The readiness half fails: 14 of 68 `analytics.ready()` samples returned false, and all 14 fall inside the single append window (13,124–14,980 ms after the ensure response); 0 false samples outside it.** A traffic query fired 13.9 s into the seed, while the append was open, returned **HTTP 503 SERVICE_UNAVAILABLE**. | `vp test run .audit/verify-164/criteria-2-3-v2.test.ts` | `/tmp/verify-164/logs/criteria-2-3-v2.log` |
| 3 | After seeding, a 90-day traffic query passes admission | **PASS**, with a state where it does not (F2) | `GET /traffic-report/getTrafficOverview?siteId=…&fromDate=<today-89>&toDate=<today>&granularity=day` → HTTP 200 in 2,706 ms, trend 90 buckets, 89 complete (the current day false), visitors 1,769, sessions 4,651, bounceRate 0.2217, pagesPerSession 1.15, averageSessionDurationSeconds 464.0, status current. Retention boundary written by the worker: `event_occurrence` 2025-10-16T00:00:00Z, `profile_activity` 2025-10-16T00:00:00Z, `replay_receipt` null (12-month default policy) → covers the window. In the two-site retention-loop state (F2) the same query returns 503. | same | `/tmp/verify-164/logs/criteria-2-3-v2.log` |
| 4 | A new signup with a demo site adds no measurable latency to the dashboard-open request | **PASS** | `POST /organization/ensurePersonalOrganization`, 5 interleaved pairs, a fresh installation per arm per run, arm order alternated: seed-on median **33 ms** (30, 36, 33, 33, 36; max 36) vs seed-off median **37 ms** (60, 41, 33, 37, 34; max 60); delta median **−4 ms** (noise; the seeded arm was not slower). The site row did not exist yet when the ensure response was read in all 5 seeded runs (work deferred off the request). Each seeded run produced 26,639–27,792 events, completed in 13.0–14.1 s. | `vp test run .audit/verify-164/criterion-4.test.ts` | `/tmp/verify-164/logs/criterion-4.log` |
| 5 | Interrupted seeding converges on rerun with no duplicate rows | **PASS** | Forced `appendProjectedEvents` rejection on the first call: the ensure still returned 200 in 45 ms, the site was released (site table empty, `accepted_event` 0, no site id left in the control store). Rerun on a second organization: 27,049 accepted events, replay range min 1 / max 27,049 / count 27,049 (dense — no gap, no duplicate-key replay), 0 duplicate `(site_id, event_id)` groups in the control store and in DuckDB, DuckDB events 27,049 = checkpoint sequence = cardinality, 0 gaps, **0 DuckDB rows left for the released site**, and its 90-day traffic query returned 200 with 90 buckets. No `Duplicate key replay_sequence` error anywhere. | `vp test run .audit/verify-164/criterion-5.test.ts` | `/tmp/verify-164/logs/criterion-5.log` |

### Branch's own new suites (narrow runs, one `vp test run <file>` each)

| Suite | Result |
| --- | --- |
| packages/db/src/duckdb/testing/projection-append.test.ts | 11 passed / 11 |
| packages/db/src/duckdb/testing/projection-fold.test.ts | 6 passed / 6 |
| packages/db/src/duckdb/testing/projection-source.test.ts | 4 passed / 4 |
| packages/db/src/duckdb/testing/fact-writer.test.ts | 8 passed / 8 |
| apps/api/src/resources/demo-seed/testing/fabric.test.ts | 17 passed / 17 |
| apps/api/src/resources/demo-seed/testing/service.seed.test.ts | 10 passed / 10 |
| apps/api/src/resources/demo-seed/testing/seed.integration.test.ts | 1 passed / 1 |
| apps/api/src/resources/event-ingestion/testing/seed-journal.appendGenerated.test.ts | 7 passed / 7 |
| apps/api/src/resources/event-ingestion/testing/seed-journal.persistence.test.ts | 2 passed / 2 |

Logs: `/tmp/verify-164/logs/step2-*.log`. Every suite passes; passing suites are not a verdict (see F1).

## Failures the prior evidence did not mention

### F1 — `ready()` is false for the whole append window; a read issued mid-seed gets 503 (criterion 2's readiness half)

Measured three times, single site, no other work in flight:

| Run | `ready()` samples | false | false inside the append window | false outside |
| --- | --- | --- | --- | --- |
| criteria-2-3 (first) | 68 | 19 | not instrumented | — |
| criteria-2-3-v2 | 68 | 14 | 14 (13,293–14,896 ms) | 0 |
| criteria-2-3-instrumented | 5 (app's own probes) | 1 | 1 | 0 |

The instrumented run also fired the dashboard query itself 13,899 ms into the seed with the append open: **HTTP 503 SERVICE_UNAVAILABLE in 24.8 ms** (`/tmp/verify-164/out/criteria-2-3-instrumented.json`, key `midSeedQuery`). After the append resolves, the checkpoint is ready and the same query returns 200 — so this is a window, not a permanent state.

Mechanism, from the code: `ready()` (`./packages/db/src/duckdb/index.ts:249-280`) reads the shared connection directly instead of going through the `enqueue` serial chain that every write and read uses (`./packages/db/src/duckdb/index.ts:199-207`, and the append's transaction at `./packages/db/src/duckdb/index.ts:225-264`). Commit 63bc331b ("run each append chunk through the shared serial chain") closed this hole for every other path; `ready()` still bypasses it. Its three false-producing branches are `!isOpen()`, `unavailable`, `rebuilding`, `table_count !== 7` and `stale_count !== 0`; the error case is swallowed by `catch { return false }` at `./packages/db/src/duckdb/index.ts:278`, which is why the exact DuckDB error cannot be read from outside.

The branch's own guard for this property, "keeps the store ready before, during and after the append" (`./packages/db/src/duckdb/testing/projection-append.test.ts:227`), passes only because its single `readyDuring` call is issued immediately after the append promise is created, before the first chunk's `BEGIN TRANSACTION`; a call that lands inside a chunk is false. This is the criterion-2 gap: the issue set out to stop "every analytics read on every site fails with analytics-not-ready", and mid-seed reads still do.

Prior evidence claimed "ready() sampled 853 times across the whole seed, 0 false samples" — not reproduced at this head; the direction of the discrepancy is reproducible (3 independent runs).

### F2 — a second demo site breaks retention cleanup permanently and makes every analytics read 503 (regression introduced by this branch)

Reproduced with two demo sites on one installation (54,999 accepted events total):

- The retention cleanup worker's derived-cleanup calls `analytics.rebuild()`, which fails **every attempt** with `SqliteError: too many SQL variables` — 6 rejected attempts in a 9-second observation window, each ~1.5 s and retried immediately (`/tmp/verify-164/out/defect-retention-rebuild-loop.json`, key `loop`), plus 239 occurrences of the same error in one 8-minute sibling run (`/tmp/verify-164/logs/criterion-5b.log`).
- Stack: `readProperties` → `./packages/db/src/duckdb/projection-source.ts:201` (via `./packages/db/src/duckdb/index.ts:421-424`). `readProperties` builds `WHERE event_pk IN (?, ?, …)` with **one bound variable per event pk in the whole installation** (`./packages/db/src/duckdb/projection-source.ts:194-208`); once the installation exceeds SQLite's 32,766-variable cap (two demo sites ≈ 55 k events) the statement cannot be prepared.
- **Regression, not latent:** at the merge base `24ee376f` the same read had no WHERE clause and no bound variables — `FROM event_property ORDER BY event_pk, property_key` (`git show 24ee376f:packages/db/src/duckdb/index.ts:1072-1082`). Unit 1's extraction into `projection-source.ts` introduced the parameter list.
- Consequence measured while the loop runs: `analytics.ready()` false in **26 of 32 samples inside the loop window (81%)**; 4 of 4 dashboard queries returned **HTTP 503** — including for a site whose checkpoint was ready with `projectedAcceptanceSequence` 27,509 = `projectedFactCardinality` 27,509 = DuckDB rows 27,509 and `ready()` true outside the loop. `rebuild()` sets `rebuilding = true` for the duration of each ~1.5 s attempt (`./packages/db/src/duckdb/index.ts:411-417`) and the worker retries every second (`./packages/db/src/retention-policy/cleanup.ts:8,88`), so `rebuilding` is effectively latched on.
- This is the mechanism behind the prior evidence's dismissed observation ("The second site's own traffic query returned 503 SERVICE_UNAVAILABLE at 11.9 s … load on a saturated machine"). It is not load: it is the retention rebuild failing forever on the two-site state, and it reproduces within seconds of the second site's seeding on an otherwise idle machine.

Cheapest verification for a maintainer: seed two demo sites in one app and watch the `cimi.api.worker.retention-cleanup` error stream (retained stream `/tmp/verify-164/logs/criterion-5b.log`, 239 hits in an 8-minute run; the reproducibility run's own log file captured no app lines — its JSON payload `loop` did), or call `analytics.rebuild({ controlDb })` on a control store with more than 32,766 accepted events.

### F3 — a chunk checkpoint publishes `readiness = 'ready'` with a partial cardinality

At 13,183 ms after the ensure response, mid-seed, the site's checkpoint read `readiness: ready`, `projectedFactCardinality: 2,500`, and the live DuckDB count was also 2,500, while the control store already held 27,649 accepted events (`/tmp/verify-164/out/criterion-4-diagnostics.json`). Per-chunk publication is the design, but a read admitted between chunks sees a "ready" site that is 9% projected; only the next chunk's checkpoint corrects it. Not one of the five criteria; recorded because the issue's risk list ("The installation gate checks per-site cardinality equality … The append must maintain it exactly") is about exactly this window.

### Criterion-5 variant worth knowing

Forcing the projection purge to fail (the shape the fix at 9c4e7603 addresses) leaves the control store and DuckDB holding the interrupted site's rows: `purgeCalls: 0`, control store 1 site + 27,603 accepted events, DuckDB 27,603 events, and the second site still projects cleanly with 0 duplicate `(site_id, event_id)` groups and 0 gaps (`/tmp/verify-164/out/criterion-5b.json`). `releaseDemoSite` returned before `onPurgedSite` ran (`./apps/api/src/resources/site/service.ts:161-200` returns early on `begun.status !== 'accepted'`, `completed.status !== 'completed'`, or a null `purgeAt`), and `DemoSeedService` swallows the release failure (`./apps/api/src/resources/demo-seed/service.ts:87-96`), so a half-released site is possible. Reads for the other site in that state returned 503, which is F2, not this variant.

## Gaps and what I did not prove

- **The exact DuckDB error behind `ready()` returning false (F1) is not captured** — `catch { return false }` at `./packages/db/src/duckdb/index.ts:278` swallows it. Cheapest path: log the caught error there (one line), or route `ready()` through `enqueue`. A standalone DuckDB probe with an open appender and a concurrent read on the same connection (20 k rows, reads every 2 k) did not fail, so the error is specific to the real chunk transaction, not to appender-plus-read in general (`/tmp/verify-164/duck-probe2.mjs`).
- **Interruption point for criterion 5 differs from the prior evidence.** Mine aborts the append call before any chunk commits (journal fully written, projection empty, site released); theirs interrupted after the first chunk committed. Both end in a released site, and the invariant under test (per-site cursor + `(site_id, event_id)` key) is the same, but I did not reproduce their exact interruption point — the chunk loop has no external seam.
- **Prior-evidence numbers did not reproduce.** Their seed was 27,456 events in 52.7 s with 853 readiness samples; mine were 26,639–28,149 events in 13.0–23.2 s with 68 samples (the JS thread is starved during the append, so dense sampling is not possible from the same process). Shape agrees; values do not.
- **Criterion 3's "the 90-day window" is reproduced with the 12-month default retention policy** (boundary 2025-10-16). A shorter installation policy would move the fabric's start date (`resolveSiteLocalCutoff`) and the same query could legitimately fail admission; not tested.
- **Log capture differs per run.** The reproducibility run for F2 (`/tmp/verify-164/logs/defect-retention-rebuild-loop.log`) contains no app log lines; its JSON payload records the loop attempts, and the retained stream evidence for the same error is `/tmp/verify-164/logs/criterion-5b.log` (239 hits).
- The health endpoint (`GET /api/health/health`) returned 404 in my harness, so I did not separately attribute the F2 503 between the readiness port (`analytics.ready()`) and the installation gate (`./apps/api/src/resources/installation/index.ts:92-108`). The measured facts (81% false `ready()` samples, `rebuildOpen: true` at every 503) point at the readiness port.
