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
