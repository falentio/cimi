# Issue 164 design synthesis

Base: candidate C's engine. Grafts from A and B. The three candidates are at
/tmp/arena-164/candidate-{A,B,C}.md; the throughput measurements are at
.audit/issue-164/append-throughput-proof.json and my own appender transaction
probe confirmed the appender honors ROLLBACK
(createAppender -> rows -> ROLLBACK -> count = 0, then COMMIT -> 5).

## Scoring against the rubric

| Criterion | A | B | C |
| --- | --- | --- | --- |
| Interface depth | 4 | 3 | 4 |
| Idempotency unrepresentable | 4 | 4 | 5 |
| Behavioral equality with rebuild | 2 | 2 | 5 |
| Throughput, traceable to a measurement | 4 | 5 | 4 |
| Cost to the pinned suites | 4 | 4 | 4 |
| Testable without a live DuckDB | 1 | 1 | 5 |
| ADR 0008 for the api half | 5 | 5 | 4 |

## Why C is the base

The deciding axis is behavioral equality with rebuild, and it is not close.

Rebuild's session fold is an order-dependent left fold over events in
replay_sequence order (packages/db/src/duckdb/index.ts:434-459). For each field
it applies "the earliest event overwrites unconditionally; a later event fills
only a null". Construct the case A and B cannot express: replay order
[E1(occurrence 10, page_path "/a"), E2(occurrence 5, page_path NULL)]. Rebuild
sets entryPage to "/a" from E1, then E2 is earlier so it overwrites to NULL. The
SQL form both A and B propose,
arg_min(page_path, (occurrence_time, event_id)) FILTER (WHERE page_path IS NOT NULL),
returns "/a". The two paths disagree on a plain fabricated fabric with null
referrers, and every session-scoped breakdown and exit-page read joins this
table.

visitors.profile_id is not a column on events at all. A SQL derivation can only
write NULL there, silently dropping identity linkage the rebuild carries. C's
fold is seeded from the store and reuses the same code, so the append inherits
the rule instead of restating it.

C scores 5 on the last axis because its core loop is unit-testable against a
fake connection with two methods. A and B both reach the cursor and the
transaction only through the real store, which means the idempotency proof, the
one property the whole issue depends on, is only provable by an integration test.

## Grafts into the base

From A: the caller surface. One method, `appendProjectedEvents({ controlDb, siteId, chunkRows? })`,
returning a summary, with `controlDb` passed per call exactly as `rebuild({ controlDb })` does.
C's mutable `controlDbSlot` closure is hidden state and goes.

From A: the positive assertion that the appender's column count matches the
events table, so a later ALTER TABLE fails with a named error instead of an
opaque incomplete-row message. C's multi-row INSERT has no such hazard but is
19x slower on the events table, so A's appender plus A's guard ships.

From B: the fail-closed guard that refuses a chunk whose lower bound is not the
published cursor, and the refusal to run while `rebuilding` is set, matching
`deleteExpired` (index.ts:648).

From B: the named three ports for the api half — `DemoSitePort`,
`DemoSeedJournalPort`, `DemoSeedRetentionPort` — each satisfied by the owning
resource through composition.ts, satisfying ADR 0008 without a loophole.

## Rejected

Candidate B's caller-owned loop. It exposes the chunk size, the cursor read and
the range construction to the one caller that has no reason to know any of them,
and makes the crash-resume path the caller's problem for no gain: the loop
inside AnalyticsDb still runs one transaction per chunk and still lets readers
slip between them.

Candidate A's SQL set-based derived maintenance, for the reason above. The
throughput cost of keeping the JS fold is measured: set-based derivation of
visitors and sessions took 46 ms against the appender's 1,165 ms for 3,000
events, so the fold is not on the critical path. Paying it buys byte-identical
derived tables.

Candidate C's `apps/api/src/seeding/` placement. It works only because
`resourceRepositoryBoundary.test.ts` scans `apps/api/src/resources/` and stops, so
it puts the boundary where nothing checks it. `resources/demo-seed/` with its
own `ports.ts` declaring plain shapes passes the test for real and keeps the
per-resource test-layout guard, so it ships instead.

Candidate C's controlDb slot, replaced by A's per-call parameter.

Candidate A's v6 index migration. It measured 1,254 ms to 1,058 ms on a
27,000-row fabric, which is 156 ms of real benefit against a migration that
changes physical layout. It is a follow-up, not part of this issue, and it is
recorded in Appendix C rather than assumed.

## The shape, settled

packages/db/src/duckdb/

  projection-source.ts  NEW  readEvents/readProperties/readIdentities/readProjectionGaps
                              parameterized by { siteId?, afterReplaySequence?, limit? }.
                              Row types move here from index.ts.
  projection-fold.ts    NEW  FactFoldState, foldProjectedEvent, seeded from the store.
                              The one definition of the visitor and session folds.
  projection-append.ts  NEW  AnalyticsProjectionAppender with injected
                              ProjectionAppendConnection and ProjectionAppendSource
                              ports, the chunk loop, and the checkpoint upsert.
  fact-writer.ts       NEW  appender-backed set writers shared by rebuild and append,
                              plus EVENT_APPEND_COLUMNS and its count guard.
  index.ts             EDIT AnalyticsDb gains appendProjectedEvents; rebuild is
                              refactored onto the source, fold and writers.
  schema.ts            EDIT no migration. If one is needed it is additive only and
                              ANALYTICS_PROJECTION_VERSION stays 'v5'.

apps/api/src/resources/demo-seed/  NEW resource

  ports.ts, service.ts, fabric.ts, index.ts
  testing/service.ensureDemoData.test.ts

apps/api/src/resources/event-ingestion/seed-journal.ts  NEW adapter from the
port's plain event shape to AcceptanceCandidate.

apps/api/src/resources/organization/service.ts  EDIT ensurePersonal schedules
the seed on the insert-success path only, deferred, failures swallowed.

Longest call chain from the trigger: organization/service.ts ->
demo-seed/service.ts -> event-ingestion/seed-journal.ts. Three files.
