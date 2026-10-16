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
pass at this head measured the append window again and attributed every false
`ready()` sample to the readiness gate: a retention derived drain rebuilt the whole
installation because the site's checkpoint vocabulary names a profile data class,
even with no redaction prepared. The rebuild held the `rebuilding` latch for the
length of a full projection, and every analytics read answered 503 while it did.
The drain now rebuilds only when a redaction is pending, so a seed raised no rebuild
at all: 0 false samples out of 103, and the 90-day query returned 200. `ready()`
itself still answers outside the serial chain, and a false answer now names the
caught error.

## The `--exclude e2e` in the api test script does not exclude

Vitest 4 treats the bare `e2e` as a literal glob, so `vp test` in `apps/api` runs
the e2e suites too. Pre-existing, and it means the "unit suite" already carries the
heavy e2e tests. Several suites sit within a second of the default 5 s timeout and
flake under load, which is why the suite-wide failure count varies between runs on
this machine.

## The shared-worktree stash incident

A subagent ran `git stash` in this shared worktree and its `git stash pop` popped
another agent's entry, `stash@{0}: On master: pre-reset backup before returning to
e62d415`, 23 files and 3,144 insertions covering the membership resource,
organization authority, governance schema and guard. A conflicting pop does not
drop the stash, so the entry survived, and the tree was returned to the branch
commit. Recover with `git stash apply stash@{0}`. Details in
`.audit/issue-164/worktree-incident.md`.
