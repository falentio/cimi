# Issue 164 throughput checkpoint

Four items, as the poteto-mode Feature playbook requires.

## Blocking first steps

Gates that must clear before any fan-out.

1. The `appendSite` public signature must be settled before implementation starts.
   It is the only contract between the `packages/db` unit and the `apps/api` unit,
   and both sides of it are inferred types in different packages.
2. The insert strategy must be measured before the seeder is written. The rebuild
   runs at 230 rows/s (packages/db/src/duckdb/index.ts:463-628 awaits one
   `connection.run` per row). 27,000 events at that rate is 117 s, which is the
   stall the issue exists to remove. An append that reuses the per-row loop would
   be no better than a rebuild.
3. The three contract suites must be green at the branch SHA before the first
   edit, so a later red is attributable. They are: 13 tests in
   packages/db/src/duckdb/testing/duckdb.test.ts and projection-read.test.ts,
   3 tests in apps/api/src/resources/traffic-report/testing/evidence.drizzle-duckdb.read.test.ts.
   Measured green at 24ee376f.

Order: design candidates, then the throughput measurement, then implementation.

## Independent workstreams

- Units 1 and 2 live entirely in packages/db/src/duckdb/. Units 3 and 4 live
  entirely under apps/api/src/resources/. Disjoint files, so they parallelize once
  the append signature is fixed.
- The test files are disjoint too. packages/db/src/duckdb/testing/append.test.ts
  against apps/api/src/resources/<seeding resource>/testing/.
- The three contract suites pin packages/db/src/duckdb/index.ts and
  testing/duckdb.test.ts. The db owner edits those alone, so the api owner never
  touches a file the contract suites assert on.

## Shared mutable state

- One DuckDB connection, created once in `createAnalyticsDb`
  (packages/db/src/duckdb/index.ts:150) and closed only by `close()`. Every
  operation serializes through the `enqueue` promise chain (index.ts:166-174).
  A single writer is already an invariant here, so the append joins that chain and
  does not open a second connection.
- `rebuilding` is the latch that makes `ready()` false (index.ts:189) and fails
  every analytics read with `analytics-not-ready`
  (packages/kernel/src/reporting/admission.ts:47). The append must never set it.
- The seeding service runs once per personal organization, and the
  `organization_personal_owner_unique` index
  (packages/db/src/schema/governance.ts:28-30) makes a second run on the same
  organization a no-op. Two concurrent seeders on one site are therefore already
  excluded by a database constraint, not by a lock.

Decision: serialize on the shared connection. Do not split the store.

## Smallest safe decomposition

Two owners, not four.

- Owner 1 takes Units 1 and 2 together. The shared projection body
  (Unit 1) exists only to serve the append (Unit 2); splitting them means
  reviewing an intermediate refactor of packages/db/src/duckdb/index.ts that
  nothing consumes yet.
- Owner 2 takes Units 3 and 4 together. The trigger (Unit 4) is one deferred call
  into the seeder, and the seeder's placement is what Unit 4 depends on.

A third split would cost a second review pass on a single signature, which the
issue does not need. The db work goes first because the api work calls it.
