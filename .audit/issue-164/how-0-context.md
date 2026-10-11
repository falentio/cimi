# Issue 164 context

Task: demo site seeding for new personal organizations, with an incremental
DuckDB projection append. Issue text: GitHub issue #164 in falentio/cimi.

## What the issue asks for

1. A demo site with 90 days of generated analytics events, created when a
   personal organization is first ensured, so a new user's dashboard shows data.
2. An incremental DuckDB projection path so the generated events reach the
   analytics store without a full rebuild. Volume 20 to 100 events per event kind
   per day across 5 kinds, 90 days, so 9,000 to 45,000 events, mean 27,000.
3. Four units:
   - Unit 1. Extract the rebuild insert logic into one helper both rebuild and the
     append path call. Add a parameterized `readEvents` variant with
     `replay_sequence > ?` and an optional `site_id = ?`, reusing the same
     7-join skeleton.
   - Unit 2. Add a method alongside `deleteExpired` and `purgeSite` that shares
     the single connection and the `enqueue` serial chain, does not set
     `rebuilding`, and works in chunks of 2,000 to 5,000 rows, one DuckDB
     transaction each. Rewrite the site's `projection_checkpoints` row in the
     same transaction.
   - Unit 3. A seeding service that generates the fabric, writes it through the
     journal (`repository.append`), then runs the append for the site. Placement
     must respect ADR 0008.
   - Unit 4. Run the seeder after the personal organization ensure, deferred from
     the dashboard-open request. No backfill for existing organizations. A seeding
     failure must not break the ensure path.

## Contract that must not move

`packages/db/src/duckdb/testing/duckdb.test.ts`,
`packages/db/src/duckdb/testing/projection-read.test.ts`, and
`apps/api/src/resources/traffic-report/testing/evidence.drizzle-duckdb.read.test.ts`
stay green unchanged. 16 tests across the three, 13 in the two db suites and 3 in
the api suite, all passing at `fix/issue-164` (SHA 24ee376f).

## Measured cost from the issue

`.audit/proof/seed-cost-proof.json` on branch
`chore/investigate-dummy-site-blast-radius`: journal writes 94,239 rows/s,
`rebuild()` 230 rows/s (222.5 s for 51,172 rows), disk 35.4 MB per 51,172
events. At 27,000 events a rebuild is 117 s of total store stall, and the read set
is installation-wide with no site filter, so one new signup takes the whole
installation's analytics offline.

## Grounding documents in this directory

- `how-1-duckdb-projection.md` — AnalyticsDb, rebuild, checkpoints, generations,
  readiness, gaps.
- `how-2-journal-and-organizations.md` — accepted_event, the append path,
  personal organization ensure, site creation.
- `how-3-admission-and-installation-gate.md` — the installation gate, reporting
  admission, the four fail-closed gates, the derived-table readers.
