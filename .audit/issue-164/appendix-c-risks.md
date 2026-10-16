# Appendix C. Risks

## The retention boundary is written by an asynchronous worker the seed depends on

`DemoSeedService.seed` reads the horizon through `RetentionResolver.effective`,
which answers from `retention_effective_cutoff`. Nothing writes that row until the
retention cleanup worker ticks: production starts it at
`apps/api/src/composition.ts:401-402`, and `createApiTestFixture` leaves it off at
`apps/api/src/testing/fixture.ts:77`.

So a seed that runs before the worker's first tick throws, releases its site, and
the installation ends with no demo site and no way to retry, because
`ensurePersonal` only seeds on the insert path. Measured under production wiring
the worker writes the boundary within one tick and the seed succeeds, so the race
does not bite today, but it is a real ordering dependency rather than a guarantee.

The fix belongs to whoever owns the retention resource: either the seed resolves
the horizon from the policy revision directly rather than from a materialised
cutoff row, or the worker's tick is awaited before the seed is scheduled.

## Attributed breakdowns are structurally empty

The fabric writes page path, referrer, destination, value, unit, code, message and
correlated visitor and session ids. It leaves utm, device, browser, os and country
null, so the demo dashboard's device and country breakdowns will show nothing.
Adding them is a follow-up, and the generator already has the seam.

## `region` and `city` stay null

The rebuild hardcodes them null at `packages/db/src/duckdb/index.ts:559-560`, and
the append inherits that, so session-dimension breakdowns on those two dimensions
remain empty. Pre-existing, and the append does not make it worse.

## Nearly every seeded row is flagged late

Receipt time is `now` while occurrence spans 90 days, so `late` is true for
essentially the whole fabric. No report query filters on the flag today, verified
by grep across `packages/kernel/src/reporting` and `packages/db`. A future policy
or backfill that does read it would treat the demo site as pathological.

## Session economics were tuned by one assumption

With 20 to 100 events per kind per day, sessions average about five events only
when each session anchors on exactly one page view. The issue asks for sessions
with at least two events plus some single-pageview sessions for believable bounce
rates, and `planSessions` in `apps/api/src/resources/demo-seed/fabric.ts` encodes
that reading. Confirming it matches the intent is a product call, not a technical
one.

## Readiness probe blocks, it does not report false

While the seed runs, a `ready()` call from outside the chain waits its turn rather
than returning false. Sampled 935 times across one full seed it was never false,
with a median latency of 6 ms and a max of 13.3 s. `ready()` is therefore
trustworthy about the store being unusable, but it is not a latency-free probe
during a seed.

## A chunk checkpoint publishes `ready` with a partial cardinality

The append publishes a checkpoint per chunk, so between chunks a site reads
`readiness: ready` with a partial `projectedFactCardinality`. Measured at this head
on the acceptance run: 13.2 s into the seed the site's checkpoint read `ready` with
cardinality 2,500 while the control store already held 27,649 accepted events, and
the live DuckDB count read 2,500 in the same snapshot, so the checkpoint and the
facts it describes agree at every instant a read can observe them.

That is Unit 2's prescribed per-chunk publication, and it is the better of the two
available behaviours. A read admitted inside the window sees a site that is
internally consistent but not yet complete, and the next chunk publishes the rest;
holding `ready` back until the last chunk would instead refuse every read for the
whole length of the append, which is the state the incremental append exists to
remove. The window is bounded by one chunk, and the installation gate compares the
checkpoint's cardinality against the cardinality it reads in the same snapshot, so
the gate is never shown a mismatch.

## Readiness during the append, round 2

The section above was written from a single instrumented seed. A second, independent
pass at `9f7d2cbf` attributed the false `ready()` samples it still saw to the
readiness gate rather than to the append: a retention derived drain rebuilt the whole
installation even with no redaction prepared, holding the `rebuilding` latch for the
length of a full projection while every analytics read answered 503. The drain now
rebuilds only when a redaction is pending, and the sibling backup-restore drain got
the same guard in this round.

The deciding re-measurement is `./verification-round-3/report.md`, item 2, over the
real composition at the 90-day volume: 252 `ready()` samples across six runs, 108 of
them started inside the append window, 0 false. The claim this section carried before
it ("0 false samples out of 103, and the 90-day query returned 200") has no payload
in the branch and is replaced by that report's numbers. `ready()` itself still answers
outside the serial chain, and a false answer now names the caught error.

## The mid-seed traffic query answers 503 from the installation gate

What remains of the round-2 503 is not analytics readiness. Round-2 report item 2
fires `getTrafficOverview` while the append is open: five runs, 503 in all five, each
inside a 0.5-1.1 s window where `GET /api/system/health` reads `degraded` with
`cleanupPending: true` and `analyticsStore: ready`, and the installation row reads
`derived_cleanup_status = 'running'`, `backup_cleanup_status = 'pending'`. Later
mid-append attempts (15.2 s, 17.7 s, 20.4 s) returned 200 in 1.9-2.3 s.

Cause: `markCleanupStageRunning` flips the installation row to
`derived_cleanup_status = 'running'`, `cleanup_pending = 1`
(`./apps/api/src/resources/retention-policy/repository.drizzle.ts:1046-1077`); the
health resolver maps that to `degraded` and then to `analyticsReads: 'unavailable'`
(`./apps/api/src/health.ts:53-62`, `:97-115`), and the analytics-read interceptor
throws `admissionUnavailable` (`./apps/api/src/http-app.ts:99-108`, `:412-418`). The
window is the claimed stage's own duration. The seed's append does not create it; it
widens it, because the cleanup pass's own DuckDB write waits behind the in-flight
projection.

The window belongs to the shared gate, not to the demo seed, and the branch does not
own it: `git diff 24ee376f..9f7d2cbf` over `apps/api/src/health.ts`,
`apps/api/src/http-app.ts`, `apps/api/src/resources/retention-policy` and
`apps/api/src/resources/installation` is empty, `cleanupPending` entered `health.ts`
in `d2f83c4f`, and the retention cleanup claim entered in `09ad9e28`, an ancestor of
the merge base.

A normal site with no demo seed reproduces it, measured at `ba1d0066` (whose gate
files are byte-identical to `9f7d2cbf`):
`./verification-round-3/out/normal-site-window.json`, produced by
`./.audit/verify-164-round3/normal-site-window.test.ts` over three runs with no demo
seed and no personal organization. The claim opens on the site's own first boundary
refresh, within 6 ms of the site-create response and before any ingestion request
completes, not on the policy call: 1,622 samples after that call read no pending
state. The canonical run sampled 2,084 times at 20 ms. 33 samples read `degraded`
with `cleanupPending: true` and `analyticsStore: ready` (+153 ms to +7,292 ms after
site creation, 7,139 ms long, 4 samples in the derived-claim state and 28 while the
backup stage held `cleanup_pending`), and two analytics-read probes fired inside
answer 503 `SERVICE_UNAVAILABLE` (22.9 ms, 29.2 ms) where the same read outside
answers 422 `QUERY_LIMIT_EXCEEDED`. The instrumentation also shows the ingestion half
of the gate: 13 of 30 `collectEvents` batches answer 503 through `withAdmissionLease`
(`./apps/api/src/resources/event-ingestion/service.ts:685`) in the window's first
384 ms, and 1,700 of 3,000 events land. Cross-run: 63 / 32 / 33 in-window samples,
derived lease 269 / 339 / 285 ms, 2 / 2 / 2 refusing probes, 13 / 13 / 13 refused
batches. The demo seed writes its own fabric and never enters the ingestion gate, so
it shows the read half only.

Two bounds on the measurement: the harness ticks the worker every 250 ms where
production uses 1000 ms, so 7.1 s is a lower bound, and the prescribed policy equals
the installation default
(`./packages/contract/src/contract/installation/schema.ts:82-86`), so it says nothing
about a policy change that moves the effective cutoff. The 4.3 s the backup stage
spent pending after the derived run finished is untraced, and a zero-event site was
not measured.

No gate change in this PR. Both drains now skip the no-op rebuild that widened the
window, and the installation gate stays the retention-policy resource's contract.

## The api test script's `--exclude e2e` does exclude, and the lanes stay separate

This section previously claimed the opposite: that Vitest treats the bare `e2e` as a
literal glob, that `vp test` in `apps/api` runs the e2e suites anyway, and that the
unit suite therefore carries the heavy tests. The CI run at `9f7d2cbf` contradicts
it. In `gh run view 38914800798` (job `check`, conclusion success) the `Test` step
log carries the `vitest run --exclude e2e` command (`./apps/api/package.json:12`)
and zero `e2e/` lines, while the `API E2E` step log carries
`-- e2e/demo-seed-projection.e2e.test.ts (1 test) 2911ms` and closes with
`Test Files 8 passed (8)` / `Tests 29 passed (29)`. That step ran 14:24:14 to
14:25:04, 50 s inside the job's 15-minute budget.

## A stopped demo release leaves the site in the recovery window, not failed forever

`SiteService.releaseDemoSite` returns without throwing when a lifecycle stage
answers a status it did not expect, and the seed swallows the rest
(`./apps/api/src/resources/demo-seed/service.ts:98-105`), so a release that stops
leaves its site in `deleting` or `deleted`. `findDuePurges` scans only
`status = 'deleted'` (`./apps/api/src/resources/site/repository.drizzle.ts:791-796`),
so a site whose `completeDelete` failed is invisible to the worker's purge scan
(`./apps/api/src/resources/site/lifecycle.ts:101`). The bound is the pending delete
operation: it is inserted as `pending` (`./apps/api/src/resources/site/repository.drizzle.ts:296-310`)
and is eventually resumed (`./apps/api/src/resources/site/repository.drizzle.ts:752-766`),
which drives the site to `deleted`, into the purge scan and past the purge. The
personal organization that owns it therefore unlocks at the recovery deadline
instead of never. Bounded, not fixed: this branch records the gap and adds no retry.

## A tombstone reports one instant four times

`./apps/api/src/resources/site/repository.drizzle.ts:808-819` builds a tombstone
whose `deletedAt`, `recoveryDeadline`, `purgeAt` and `requestedAt` all come from
`tombstone.purgedAt`, so the deletion instant is unrecoverable from a tombstone and
an admin surface cannot tell when the site was deleted apart from when it was purged.
Pre-existing, and only visible now that an unseen release records its own real
instant (`1b2eaf33`, `329e1680`). Left unchanged in this round.

## Resource test filenames sit outside the AGENTS.md vocabulary

`./AGENTS.md:56` enumerates three permitted forms (`service.<method>.test.ts`,
`repository.drizzle.<method>.test.ts`, `<module>.test.ts`), with `router.test.ts`
the permitted single-file surface. Counted over every `*.test.ts` under
`apps/api/src/resources/**/testing/`: 212 files, of which **16** have a stem that
is neither a permitted form nor the name of a module in the resource directory —
`executor.unreadableArtifact.test.ts`, `query.lifecycle.test.ts`,
`claim-concurrency.test.ts`, `deferred.test.ts`, `links.test.ts`,
`seed-journal.appendGenerated.test.ts` and ten more of the same concern-file shape.
The enforcement test bans the two bundled filenames only
(`./apps/api/src/testing/resourceTestLayout.test.ts:8`), so the vocabulary is not
enforced, and enforcing it here would fail 16 pre-existing files. Not enforced.

## R6 stays a simplification opportunity

`./apps/api/src/resources/demo-seed/testing/service.seedTrigger.test.ts:35-58`
replaces `appendProjectedEvents` with a hand-rolled `Proxy` double that answers
fabricated zero counts. The seam is an analytics port, not a repository, so
`vitest-mock-extended` is not owed, and the real path now has a committed home in
`./apps/api/e2e/demo-seed-projection.e2e.test.ts`. Recorded as a simplification
opportunity; no change in this round.

## The shared-worktree stash incident

A subagent ran `git stash` in this shared worktree and its `git stash pop` popped
another agent's entry, `stash@{0}: On master: pre-reset backup before returning to
e62d415`, 23 files and 3,144 insertions covering the membership resource,
organization authority, governance schema and guard. A conflicting pop does not
drop the stash, so the entry survived, and the tree was returned to the branch
commit. Recover with `git stash apply stash@{0}`. Details in
`.audit/issue-164/worktree-incident.md`.
