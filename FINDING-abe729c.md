# Audit: issue #44 implementation at abe729c

## Executive verdict

**Partial implementation. Do not mark #44 complete.**

The branch delivers a working reporting admission kernel and mounts it behind the traffic-report
procedures. The gate order, the reject-never-clamp rule, the half-open interval resolution, the
separate current/comparison freshness, and the DST-safe bucket enumeration are all present and
tested. Two high-severity admission defects remain, both on the production evidence path, so the
kernel's own fail-closed guarantees do not hold for real traffic-report requests.

- The traffic adapter passes one 50M budget for both aggregate and breakdown procedures. The spec
  fixes 25M for aggregate reports and 10M for breakdowns, so the gate admits requests it must reject.
- The production statistics adapter declares checkpoint alignment that the stored facts do not
  establish. Its alignment assertion compares a checkpoint value against itself, so the
  `statistics-uncertain` rejection can never fire when a checkpoint is present.

For report consumers, the mounted procedures return placeholder data. Overview metrics are zero and
breakdown pages are empty, declared `complete: false`. This is an explicit, documented deferral, so
it is a known scope boundary rather than a newly discovered omission.

For maintainers, the kernel is a sound foundation. Keep its pure period, retention, gap, and cost
functions. Fix the two evidence-path defects before building aggregation on top of these admission
tickets.

Findings are counted by review axis. Severity reflects impact on the #44 acceptance criteria, not a
security certification.

| Axis                  | High | Medium | Low | Total |
| --------------------- | ---- | ------ | --- | ----- |
| Spec and correctness  | 2    | 0      | 0   | 2     |
| Verification coverage | 0    | 2      | 1   | 3     |
| Documented standards  | 0    | 0      | 2   | 2     |

No critical security defect and no demonstrated cross-tenant disclosure was found. This is not a
security certification.

## Audited snapshot and scope

| Item | Value |
| ---- | ----- |
| Issue | [#44, D-01: reporting — kernel admission + freshness pipeline](https://github.com/falentio/cimi/issues/44) |
| Branch | `feat/reporting` |
| Audited commit | `abe729cbdeca6a33fa3c8975b3c8af54b7cd91c6` (`abe729c`) |
| Merge base vs `main` | `3c826a24fb27af082b2fa8d0a7c0d9319898cdaa` |
| Diff size | 35 files, +3552 / -153 |
| Kubernetes / runtime | Not applicable. Node + vitest + DuckDB/SQLite test fixtures |

Files read in full or in load-bearing part:

- Kernel: `packages/kernel/src/reporting/{admission,errors,fact-work,index,interval,ports,retention,types}.ts`,
  `packages/kernel/src/index.ts`
- Utils: `packages/utils/src/retention-time/{index,local-calendar}.ts`
- API: `apps/api/src/resources/traffic-report/{errors,evidence.drizzle-duckdb,index,metadata.drizzle,readiness,router,service}.ts`,
  `apps/api/src/{health,index,orpc}.ts`
- DB and contract: `packages/db/src/duckdb/index.ts`, `packages/db/src/index.ts`,
  `packages/contract/src/index.ts`,
  `packages/contract/src/contract/traffic-report/schema.ts`
- Tests: `packages/kernel/src/reporting/testing/reporting.test.ts`,
  `packages/db/src/duckdb/testing/projection-read.test.ts`,
  `packages/utils/src/retention-time/testing/local-calendar.test.ts`,
  `apps/api/src/resources/traffic-report/testing/overview.test.ts`,
  `apps/api/src/testing/fixture.ts`
- Specs: `docs/specs/README.md:47-55`, `docs/specs/analytics-reporting/traffic-report/SPECS.md`,
  `docs/specs/analytics-reporting/METRICS.md:32`,
  `docs/specs/system-data-lifecycle/retention-policy/SPECS.md`,
  `docs/specs/system-data-lifecycle/health/SPECS.md:60`, `CONTEXT.md` (reporting vocabulary)

## Findings

### F1. HIGH. One 50M Fact-Work budget is used for both report families

**Location.** `apps/api/src/resources/traffic-report/service.ts:34`, consumed at `service.ts:99-106`.

**Evidence.**

```ts
const REPORT_FACT_WORK_BUDGET = 50_000_000
```

```ts
bucket: { granularity: input.granularity, maxStarts: BUCKET_LIMITS[input.granularity] },
coverage: ['event-occurrence'],
work: {
  ...
  budget: REPORT_FACT_WORK_BUDGET,
},
```

`admit()` is shared by `getOverview` (`service.ts:54`) and `getBreakdowns` (`service.ts:71`), so the
single constant governs both.

The spec fixes per-family budgets at `docs/specs/analytics-reporting/METRICS.md:32`.

> The fixed family budgets are 25M units for aggregate reports, 10M for breakdowns, 1M for row
> lists, and 10M for stateful Goal/Funnel/Cohort reports.

**Impact.** `assertAdmittedFactWork` compares `estimate.units > budget` (`admission.ts:167`). For an
overview with `factCardinality = 30_000_000` the estimate is at least 30M units, which exceeds the
25M aggregate budget but stays under 50M, so the request is admitted where the spec requires
`QUERY_LIMIT_EXCEEDED`. Breakdowns with `factCardinality = 15_000_000` are admitted against a 10M
limit the same way. Aggregation is deferred, so no large query executes today, but the gate policy is
already wrong and silently under-enforces the moment aggregation lands.

**Recommendation.** Select the budget by family in one reporting definition. Aggregate reports take
25M, breakdowns take 10M, and Public Query shares the aggregate budget per `METRICS.md:32`. Do not
leave the number at the call site.

### F2. HIGH. Statistics alignment is a tautology, so `statistics-uncertain` cannot fire when a checkpoint exists

**Location.** `apps/api/src/resources/traffic-report/evidence.drizzle-duckdb.ts:98-122`, with the
checkpoint and cardinality read at `evidence.drizzle-duckdb.ts:30-59`; kernel assertion at
`packages/kernel/src/reporting/admission.ts:139-152`.

**Evidence.** The adapter builds `projection.checkpoint` and the statistics from the same
`checkpoint` object.

```ts
const checkpoint = snapshot.checkpoint
const projection: ProjectionEvidence = {
  checkpoint: {
    projectedAcceptanceSequence: checkpoint?.projectedAcceptanceSequence ?? 0,
    ...
```

```ts
return {
  projection,
  retention,
  statistics: resolveStatistics(checkpoint, snapshot.factCardinality),
}
```

```ts
return {
  state: 'aligned',
  asOfAcceptanceSequence: checkpoint.projectedAcceptanceSequence,
  factCardinality,
}
```

The kernel then asserts equality between those two values.

```ts
statistics.asOfAcceptanceSequence !== projection.checkpoint.projectedAcceptanceSequence ||
```

Both sides trace to `checkpoint.projectedAcceptanceSequence`, so the comparison always passes. The
comment at `evidence.drizzle-duckdb.ts:98-107` claims alignment holds "by construction", but the
check is a self-comparison, not a proof that the counted facts match the reported sequence.

The counted facts come from a separate query. `readProjectionSnapshot` counts all site events.

```ts
const cardinalityReader = await connection.runAndReadAll(
  'SELECT count(*) AS fact_cardinality FROM events WHERE site_id = ?',
  [input.siteId],
)
```

`packages/db/src/duckdb/index.ts:154-160`. The sequence comes from the checkpoint row,
`packages/db/src/duckdb/index.ts:170`. The only writers of that row are site creation
(`projectedReplaySequence: 0`) and the DuckDB rebuild, which copies the control-DB checkpoint row
verbatim.

```ts
for (const checkpoint of checkpoints) {
  await connection.run(
    `INSERT INTO projection_checkpoints (
   site_id, projected_replay_sequence, occurrence_covered_from, ...
```

`packages/db/src/duckdb/index.ts:374-393`. The rebuild projects events but never advances the cursor
to what it projected, and `statistics_refreshed_at` is copied rather than refreshed.

**Impact.** The `statistics-uncertain` fail-closed path is defeated on the production path. A
checkpoint that is `ready` but not aligned with the counted fact set is reported as aligned, and the
request proceeds with a `factCardinality` that need not correspond to the acceptance sequence. This
is exactly the class of evidence the kernel's `aligned` discriminant exists to protect. A freshly
created, never-rebuilt site is unaffected, because DuckDB has no checkpoint row and the adapter
returns `unknown`, which still rejects. The mismatch appears once a rebuild has run against pending
events or events accepted after the last rebuild.

**Recommendation.** Publish the projected cursor, occurrence coverage, and cardinality together at
projection time, and have the adapter return `aligned` only when the counted facts are the ones the
checkpoint describes. A serialized read of one checkpoint cannot repair the semantic mismatch.

### F3. MEDIUM. The retention HTTP test never reaches the retention gate

**Location.** `apps/api/src/resources/traffic-report/testing/overview.test.ts:191-207`.

**Evidence.** The test "rejects a range that reaches past Effective Retention instead of clamping it"
creates the site and immediately requests `fromDate=2020-01-01&toDate=2026-09-06&granularity=year`. It
never calls `fixture.analytics.rebuild()`, unlike the admitted tests at `overview.test.ts:112` and
`overview.test.ts:213`. Without a rebuild, DuckDB has no `projection_checkpoints` row, so
`readProjectionSnapshot` returns `checkpoint: null` (`packages/db/src/duckdb/index.ts:161-167`).
`resolveStatistics` then returns `state: 'unknown'` (`evidence.drizzle-duckdb.ts:115-116`), and
`requireAlignedStatistics` throws `queryLimitExceeded('statistics-uncertain')`
(`admission.ts:149`) before `checkRetentionCoverage` runs (`admission.ts:44`).

The seeded cutoff would have rejected the range. `seedRetentionCutoff` writes an event-occurrence
cutoff of `2026-01-01` (`overview.test.ts:96`), which is later than the range start, so retention
coverage fails. The test asserts only `{ code: 'QUERY_LIMIT_EXCEEDED', status: 422 }`
(`overview.test.ts:202-206`), and both reasons produce that code, so the test passes for the wrong
reason.

**Impact.** The retention-overbound HTTP path is unverified. The retention gate could be deleted and
this test would still pass in green.

**Recommendation.** Call `fixture.analytics.rebuild({ controlDb: fixture.db })` before the request so
the assertion is reached for the intended reason. Optionally assert the `reason`, not just the code.

### F4. MEDIUM. Kernel `analyticsStore !== 'ready'` is untested and the HTTP 503 test exercises a different layer

**Location.** `apps/api/src/resources/traffic-report/testing/overview.test.ts:149-163`;
`packages/kernel/src/reporting/testing/reporting.test.ts:412-439`.

**Evidence.** The HTTP test closes the analytics DB (`overview.test.ts:153`) and asserts a 503. The
503 is produced by the HTTP admission gate through `readStoreHealth`, before the kernel is entered.
The kernel's own readiness branch is `admission.ts:26-29`:

```ts
const health = await this.readPort(() => this.#dependencies.analyticsReadiness.getHealth())
if (health.controlStore !== 'ready' || health.analyticsStore !== 'ready') {
  throw serviceUnavailable('analytics-not-ready')
}
```

The kernel tests cover a rejected `getHealth` (`reporting.test.ts:412`) and `controlStore: 'degraded'`
(`reporting.test.ts:426`), but never the isolated `analyticsStore !== 'ready'` clause.

**Impact.** The kernel readiness condition is only covered indirectly. A regression that removed the
`analyticsStore` half of `admission.ts:27` would not be caught by the kernel suite.

**Recommendation.** Add a kernel test with `controlStore: 'ready'` and `analyticsStore: 'unavailable'`
asserting `SERVICE_UNAVAILABLE`. Keep the HTTP test as transport coverage.

### F5. LOW. `complete: false` is applied to every bucket, not only the current partial bucket

**Location.** `apps/api/src/resources/traffic-report/service.ts:135-143`; kernel type at
`packages/kernel/src/reporting/types.ts:39-51`.

**Evidence.**

```ts
trend: (period.bucketStarts ?? []).map((bucket) => ({
  at: new Date(bucket.at).toISOString(),
  value: 0,
  complete: false,
  ...
```

`BucketStart` carries no completeness signal (`types.ts:39-43`), and the service marks every bucket
incomplete. The requirement is "fill empty buckets with zero values and mark incomplete current
buckets explicitly" (`docs/specs/README.md:52`; `traffic-report/SPECS.md:48`).

**Impact.** Elapsed, fully-covered buckets are reported incomplete. The direction is safe, since the
response claims no measurement it lacks, and the behavior is an explicit documented deferral
(`service.ts:114-119`). It does not satisfy the current-partial-bucket distinction the requirement
names.

**Recommendation.** When aggregation lands, compute completeness per bucket from the period end and
the occurrence coverage. Leave this as a documented deferral for now.

### F6. LOW. The bucket-limit table is duplicated instead of imported

**Location.** `apps/api/src/resources/traffic-report/service.ts:20-27`.

**Evidence.** `BUCKET_LIMITS` duplicates `AUTHENTICATED_REPORT_BUCKET_LIMITS`, which is exported from
`packages/contract/src/contract/traffic-report/schema.ts` and re-exported via
`packages/contract/src/index.ts`. The values currently match (`minute 1800, hour 720, day 366,
week 104, month 36, year 10`).

**Impact.** Two sources of truth for one policy. They can diverge silently.

**Recommendation.** Import the contract constant into the service.

### F7. LOW. `readRetention` accepts a `dependencies` parameter it never reads

**Location.** `apps/api/src/resources/traffic-report/evidence.drizzle-duckdb.ts:62-65`.

**Evidence.** `readRetention(siteId, dependencies)` never references `dependencies`; it always
selects all three cutoff columns.

**Impact.** Harmless today, because the traffic service only requests `['event-occurrence']`
(`service.ts:100`). It is an unused-parameter lint issue and a small reader-load cost.

**Recommendation.** Drop the parameter or use it to filter the selected columns.

## Requirement coverage matrix

| # | Requirement (spec source) | Verdict | Evidence |
| - | ------------------------- | ------- | -------- |
| 1 | Inclusive Site-local dates resolve to a half-open interval; invalid or over-bounded ranges are rejected, never clamped (`README.md:47`, `traffic-report/SPECS.md:25,48`) | PASS | `interval.ts` resolves exclusive end via `addCalendarDays(toDate, 1)`; tests `reporting.test.ts:202,294` |
| 2 | Explicit granularity bucket limits `{1:1800, 60:720, 1440:366, 10080:104, 43200:36, 525600:10}` (`traffic-report/SPECS.md:48`) | PASS, values owned by contract not kernel | `service.ts:20-27,99`; `contract/.../traffic-report/schema.ts`; kernel rejects via `interval.ts` bucket bound |
| 3 | Effective Retention covers current plus adjacent equal-length comparison (`retention-policy/SPECS.md:14,78`) | PASS | `retention.ts` checks both period starts; `interval.ts` enforces adjacency and equal calendar length; test `reporting.test.ts:348` |
| 4 | Fact-Work estimator from the projection checkpoint (`README.md:54`, `METRICS.md:32`) | PASS on the kernel, defeated by F2 in production | `fact-work.ts`; `admission.ts:50` |
| 5 | Preflight order stats → gap → retention → budget, before cache; stale/gap/over-budget → `QUERY_LIMIT_EXCEEDED` 422 (`traffic-report/SPECS.md:48,101`) | PASS, order correct | `admission.ts:42-59,107-121`; tests `reporting.test.ts:457,475,498,544`; no cache exists on this branch |
| 6 | Non-ready analytics store → `SERVICE_UNAVAILABLE` 503 before cache (`health/SPECS.md:60`, `README.md:55`) | PASS | `admission.ts:26-29`; `readiness.ts`; HTTP test `overview.test.ts:149`; kernel gap F4 |
| 7 | Freshness `current\|stale` only, plus sequence and occurrence coverage per period (`traffic-report/SPECS.md:48`) | PASS in production shape | `FreshnessEvidence` (`types.ts:128-132`); `resolveFreshness` (`admission.ts:176-189`); tests `reporting.test.ts:516,538` |
| 8 | Zero-fill buckets, current partial bucket `complete:false`, adjacent equal-length comparison with separate freshness, DST-safe bucket starts (`README.md:52-53`) | PARTIAL | zero-fill/`complete:false` (`service.ts:120-146`, all buckets, F5); separate comparison freshness (`admission.ts:65-68`); DST enumeration (`local-calendar.ts`), tests `local-calendar.test.ts:18-174` |

## Verification commands and results

All commands were run in sequence from the worktree root.

```
cd packages/kernel && npx vitest run src/reporting/testing/reporting.test.ts
  Test Files 1 passed (1)   Tests 29 passed (29)

cd packages/db && npx vitest run src/duckdb/testing/projection-read.test.ts
  Test Files 1 passed (1)   Tests 3 passed (3)

cd packages/utils && npx vitest run src/retention-time/testing/local-calendar.test.ts
  Test Files 1 passed (1)   Tests 11 passed (11)

cd apps/api && npx vitest run src/resources/traffic-report/testing/overview.test.ts
  Test Files 1 passed (1)   Tests 7 passed (7)
```

Fifty tests pass. Green tests do not clear F1 and F2, which are policy and evidence-semantics defects
that the current assertions do not reach. F3 is a green test that passes for the wrong reason.

Read-only structural checks:

```
rg "clamp|Math.min|subarray|slice" on reporting paths -> no range clamping
rg "cache|Cache" under traffic-report -> no cache on this branch, so "before cache" is vacuous
```

## Limitations

- The audit is static plus unit and HTTP-fixture tests. No live DuckDB with real projected data was
  exercised, so F2 is established from code paths and the spec, not from an end-to-end reproduction
  of a misaligned checkpoint.
- Placeholder metric output (`service.ts:114-160`) is treated as a documented deferral per the issue
  and the code comments, not re-scored as a new defect.
- `complete: false` per-bucket semantics cannot be assessed beyond the placeholder, since no real
  aggregation exists on this branch.
- No security review of auth, tenancy, or injection was performed beyond reading the scope guard and
  the error mapping. No cross-tenant defect was found, but this is not a security certification.

## Recommendation summary

1. Fix F1. Select the Fact-Work budget by report family in one reporting definition.
2. Fix F2. Publish the projected cursor with its cardinality and coverage, and gate `aligned` on that
   relationship rather than a self-comparison.
3. Fix F3. Rebuild the site in the retention HTTP test so the assertion is reached for the intended
   reason.
4. Fix F4. Add a kernel test for the `analyticsStore !== 'ready'` branch.
5. Treat F5, F6, F7 as low-priority cleanup. F5 becomes real work when aggregation lands.

## Resolution

Every finding is addressed. F1 through F4 are fixed with the runtime evidence recorded below; F5, F6,
and F7 are closed as low-priority cleanup.

| Finding | Status | Commit | What closed it |
| --- | --- | --- | --- |
| F1 | Fixed | `9b5c9cd` | `REPORT_FACT_WORK_BUDGETS` in `@cimi/contract`, keyed by a `ReportFactWorkFamily` discriminant with a `satisfies` exhaustiveness guard. `TrafficReportService.admit(input, family)` selects `REPORT_FACT_WORK_BUDGETS[family]` as a single indexed lookup; `getOverview` names `'aggregate'` (25M) and `getBreakdowns` names `'breakdown'` (10M). The service test asserts each family's budget, and the contract test pins the four spec values, so a new family without a budget is a typecheck failure and a wrong number is a test failure. |
| F2 | Fixed | `16b59de` | The rebuild now derives `projection_checkpoints` from the event set it projected (cursor = max projected `replay_sequence`, coverage = min/max projected `occurrence_time`, `projected_fact_cardinality` = projected count, `readiness = 'ready'`), instead of copying the control-DB row verbatim. `resolveStatistics` reports `aligned` only when the live count equals the published cardinality, and `requireAlignedStatistics` rejects on disagreement or a null stamp. The verbatim-copy path and `readProjectionCheckpoints` are deleted; `readActiveSiteIds` and `foldProjectedCheckpoints` replace them. New migration 4 adds the column, and `ANALYTICS_PROJECTION_VERSION` moves to `v5` so a pre-change store is not ready until it rebuilds. `deleteExpired` republishes the cardinality in the transaction that deletes events. |
| F3 | Fixed | `1212344` | The retention HTTP test calls `fixture.analytics.rebuild({ controlDb: fixture.db })` before the request, so the request reaches the retention gate. Verified by disabling `checkRetentionCoverage` and confirming the test fails. |
| F4 | Fixed | `1212344` | A kernel test sets `controlStore: 'ready'` and `analyticsStore: 'unavailable'` and asserts `SERVICE_UNAVAILABLE` with reason `analytics-not-ready`. Verified by dropping the `analyticsStore` clause and confirming the test fails. |
| F5 | Deferred | [`#65`](https://github.com/falentio/cimi/issues/65) | Per-bucket `complete` semantics belong to aggregation. The `overviewPeriod` comment records that only the current partial bucket is `complete: false` once aggregation lands, and names #65 as the owner. |
| F6 | Fixed | `9b5c9cd` | The service imports `AUTHENTICATED_REPORT_BUCKET_LIMITS` from `@cimi/contract`; the local `BUCKET_LIMITS` duplicate is deleted. |
| F7 | Fixed | `16b59de` | `readRetention(siteId)` drops the unused `dependencies` parameter. |

### Runtime evidence for the two high findings

F1 reproduced by arithmetic against the gate: with the old 50M budget an overview at
`factCardinality = 30_000_000` estimated at least 30M units and passed `units > budget`, where the
spec's 25M aggregate budget rejects it. The contract test now pins 25M and 10M, and the service test
asserts each procedure supplies the right one.

F2 reproduced on the production adapter before the fix. A control DB whose
`projection_checkpoint.projected_replay_sequence` was 999 with only 3 events produced
`{"state":"aligned","asOfAcceptanceSequence":999,"factCardinality":3}`: the count did not describe
the reported sequence, yet the adapter reported aligned. After the fix the same scenario yields a
checkpoint published from the projected set (`projectedAcceptanceSequence: 3`,
`projectedFactCardinality: 3`) and the adapter reports `aligned` only when the count matches. The
`stale` branch is exercised by the adapter test with a cardinality mismatch and a null stamp, and by a
kernel test asserting rejection on `factCardinality !== projectedFactCardinality`.

### Verification

- `packages/contract`: 25 files, 130 tests passed.
- `packages/db`: 3 files, 16 tests passed.
- `packages/kernel`: 2 files, 41 tests passed.
- `apps/api`: 123 files, 775 tests passed.
- `tsc --noEmit` clean for `packages/db`, `packages/kernel`, `packages/contract`, and `apps/api`.

### Principles applied

- **Fix Root Causes.** F2 traced the tautology to the verbatim checkpoint copy, not the assertion.
  The fix publishes projection truth at projection time and deletes the copy, rather than adding a
  guard on top of a value that never carried the information.
- **Model the Domain.** F1 encodes the report-family budget policy as one contract-owned record
  rather than a number at the call site; the family discriminant makes a missing budget
  unrepresentable.
- **Laziness Protocol.** F6 deleted a duplicated policy table and imported the existing one. F7
  deleted an unused parameter. F5 stayed a comment because the code it would change does not exist
  yet.
- **Prove It Works.** F3 and F4 were verified by removing the guarded behavior and confirming the new
  tests fail. F2's before-and-after adapter output is recorded above rather than asserted.
- **Boundary Discipline.** The budget policy sits in the contract beside the bucket limits; the
  statistics classifier sits in the adapter; the kernel keeps the pure re-check.

