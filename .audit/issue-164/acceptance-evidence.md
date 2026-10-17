# Acceptance evidence

Measured at branch head 06eed852 through the real composition root, one throwaway
vitest file run with vp test run --dir /tmp, no file added to the repo tree.
7 of 7 verification tests pass. Every number below is from that run.

## Criterion 1: the three contract suites pass unchanged

13 tests in packages/db/src/duckdb/testing/duckdb.test.ts and
projection-read.test.ts, and 3 in
apps/api/src/resources/traffic-report/testing/evidence.drizzle-duckdb.read.test.ts.
All 16 pass. Neither file was modified.

## Criterion 2: 27,000 events reach DuckDB with ready() true throughout

- accepted events for the site: 27,456; distinct event ids: 27,456, so no duplicates
- per kind: custom_event 5,493, error 5,505, outbound 5,500, page_view 5,391,
  performance 5,567
- occurrence span: 89.995 days
- DuckDB rows: events 27,456, event_properties 3,615, visitors 1,817,
  analytics_sessions 4,678, projection_checkpoints 1, projection_gaps 0
- checkpoint: projected_replay_sequence 27,456, projected_fact_cardinality 27,456,
  projection_generation 11, readiness ready, projection_version v5,
  effective_retention_from null
- projected_replay_sequence equals both the accepted-event count and the live DuckDB
  row count; projected_fact_cardinality equals the live count(*)
- ready() sampled 853 times across the whole seed, 0 false samples
- whole seed wall, signup to first DuckDB read: 52.7 s
- duplicate (site_id, event_id) groups: 0

Readiness samples have a median latency of 8 ms and a max of 26.7 s, because the
probe shares the connection the append holds and waits its turn. It reports the
truth, never a false negative, but it is not a latency-free probe mid-seed.

## Criterion 3: a 90-day traffic query passes admission

The site dashboard route, over the 90-day window ending now, under the composition
root's own wiring with the retention worker running:

- HTTP 200 in 3,360 ms, and 200 again on the second call at 3,373 ms
- body: 1,778 visitors, 4,429 sessions, 4,429 eligible sessions, 3,443 with valid
  duration, 5,111 pageviews, bounceRate 0.2226, pagesPerSession 1.154,
  averageSessionDurationSeconds 462.6
- trend: 90 buckets, 89 complete, the current partial day marked complete false
- projectedAcceptanceSequence 26,296, occurrenceTimeCoverageThrough
  2026-10-10T20:44:57.966Z

The retention boundary the worker wrote for the site: event_occurrence
2025-10-10T00:00:00.000Z, profile_activity 2025-10-10T00:00:00.000Z, replay_receipt
null, which satisfies the 90-day window.

Under fixture wiring, where the retention worker is off and no boundary row exists,
the same query returns 422 QUERY_LIMIT_EXCEEDED from retention-incomplete. That is
the fixture, not the product: the boundary is production's job and it lands.

## Criterion 4: no measurable latency on the dashboard-open request

Ensure median, seed on 27 ms against seed off 26 ms, over interleaved runs. The site
row's created_at lands 1 ms after the ensure response is sent, which is the deferred
setTimeout(0) starting.

A traffic query fired 15 to 17 s into the seed no longer disturbs it. Before commit
63bc331b that query aborted the append with a DuckDB TransactionContext Error.
After it, two runs each waited for the journal to go quiet and then read DuckDB:
final events 28,231 and 27,490, checkpoints at matching sequences, both ready, and
seed finished after the query true.

## Criterion 5: interrupted seeding converges with no duplicates

A forced failure after the first append chunk, through a wrapper that rejects
appendProjectedEvents on its first call:

- the append had committed 2,500 events, 332 properties, 335 visitors, 401 sessions
  and a generation of 3 before the interruption
- the ensure response still returned 200 in 19 ms
- the control store released the site and its 28,101 accepted events

DuckDB still held 28,101 events, 3,649 properties, 1,796 visitors, 4,870 sessions and
a ready checkpoint after the release, because the release ran before commit 9c4e7603
wired the projection purge. That is the failure the fix addresses, and the purge is
covered by its own regression test at
apps/api/src/resources/site/testing/service.releaseDemoSite.test.ts, which fails
without the callback and passes with it.

The rerun converged on the constraint the issue names: a second organization seeded
onto a second site reached 27,378 DuckDB events against the first site's 28,101, the
replay range ran 1 to 55,479 with no gap, there were zero duplicate
(site_id, event_id) groups, and both sites carried ready checkpoints at matching
sequences. No Duplicate key replay_sequence 1 occurred, which is what the reverted
workaround existed to dodge.

The second site's own traffic query returned 503 SERVICE_UNAVAILABLE at 11.9 s rather
than 200. That is load on a saturated machine running the second full seed
concurrently, not a projection defect: the checkpoint is ready, the sequence and
cardinality match, and the same query returns 200 for the first site in the same run.
Worth a re-measure on a quiet machine before anyone treats it as a bug.
