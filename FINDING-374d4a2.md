# FINDING-374d4a2

Full audit of issue #44 (`D-01: reporting — kernel admission + freshness pipeline`) against branch
`feat/reporting`.

- Branch: `feat/reporting`
- Last commit: `374d4a2` (`feat(kernel): add reporting admission pipeline`, `Refs #44`)
- Parent: `3c826a2` (local `main`, not on `origin/main`)
- Branch state: 2 ahead of `origin/main`, 0 behind
- Scope of the diff under audit: 16 files, +1834 / -140, all in commit `374d4a2`
- Audit method: read the diff and specs, typecheck four packages, run the two new test files, run
  the affected API suites, and probe DST/interval edges with a throwaway test.

Verdict: **Partial.** The commit delivers a correct, well-tested pure kernel for period resolution,
preflight ordering, retention coverage, gap relevance, and Fact-Work estimation. It does not deliver
the end-to-end reporting pipeline the issue asks for. The kernel service is unreferenced, its ports
have no production adapters, and the DST bucket limits the issue names are enforced elsewhere, not
by this code. Two durable-verification gaps and one divergence from the existing HTTP admission gate
are the concrete defects.

## What the issue asked for

The issue (`https://github.com/falentio/cimi/issues/44`) scopes a reporting kernel plus a shared
admission pipeline on `feat/reporting`, landing before any report query. The end-to-end clause names
Site-local date resolution, explicit per-granularity bucket limits, Effective Retention covering the
current and adjacent comparison windows, a Fact-Work estimator from the projection checkpoint,
preflight ordering (stale stats, then relevant/unbounded gap, then retention, then budget, all before
cache), `analyticsStore != ready` returning `SERVICE_UNAVAILABLE 503` before cache, and
`current|stale` freshness with projected acceptance sequence and occurrence coverage. A reusable
clause names allowlisted scoped filters, allowlisted sort with a stable ID tie-breaker, zero-based
offset pagination with `nextOffset/hasMore/totalCount`, and zero-filled buckets with
`complete:false` on a partial current bucket.

Four acceptance criteria gate the work.

1. Inclusive Site-local resolution verified with `reportingTimezone` (UTC default) and Monday week
   start, invalid or over-bounded ranges rejected before execution and never clamped.
2. Preflight order `stale stats -> gap -> retention -> budget`, all before cache, with
   `QUERY_LIMIT_EXCEEDED 422` uniform across `traffic/event/goal/funnel/cohort/public`.
3. `SERVICE_UNAVAILABLE 503` when `analyticsStore != ready`, with SQLite health/config and
   accept-only ingestion still available.
4. Freshness `current|stale` only, with sequence and occurrence coverage per period.

## What the commit implements

Ten new files under `packages/kernel/src/reporting/` and two new utils files.

| File | Responsibility |
| --- | --- |
| `types.ts` | Branded `SiteId` / `CalendarDate` / `InstantMs`, period/gap/retention/freshness/estimate shapes |
| `interval.ts` | `resolveReportPeriods`, adjacent+equal-length comparison check, `findRelevantProjectionGap` |
| `retention.ts` | `checkRetentionCoverage` per dependency across both periods |
| `fact-work.ts` | `FACT_WORK_WEIGHTS` and `estimateFactWork` |
| `admission.ts` | `ReportingAdmissionService.admit` orchestrating the gate order |
| `errors.ts` | `ReportingAdmissionError` with `code` + `reason` |
| `ports.ts` | Metadata / projection / statistics / retention / fact-work port interfaces |
| `index.ts` | Barrel |
| `testing/reporting.test.ts` | 548 lines, 19 cases |
| `packages/utils/src/retention-time/local-calendar.ts` (+test) | Extracted calendar arithmetic, exported via `@cimi/utils` |

The preflight order in `admission.ts:24-88` matches criterion 2 exactly. Readiness is checked first
(`admission.ts:25-28`), then periods resolve (`34-39`), then projection reads (`41`), then the
aligned-statistics assertion (`50`, `99-111`), then the gap check (`52-54`), then retention (`56-62`),
then Fact-Work (`64-77`). Each port read is wrapped so a thrown port error becomes
`SERVICE_UNAVAILABLE` (`90-96`), and the error message never carries the cause (`errors.ts:21-26`).
The tests assert this short-circuit order directly (`reporting.test.ts:410-496`).

## Acceptance criteria, evidence per criterion

### Criterion 1: Site-local resolution, reject never clamp. PASS at the kernel layer.

`resolvePeriod` converts inclusive dates to a half-open interval via `resolveLocalDateStart`
(`interval.ts:97-109`) and rejects `fromDate > toDate` (`93-95`). Bucket overflow throws
`badReportingRequest('bucket-bound')` rather than truncating (`135-146`). Verified by
`reporting.test.ts:200-300`, including a spring-forward day that resolves to 23 hours
(`210-225`) and a fall-back day that keeps both repeated hourly instants (`227-243`). I re-ran
both new test files: 24 passed.

The per-granularity limits the issue names (`1800/720/366/104/36/10`) are **not** in this commit.
They already live in `packages/contract/src/contract/traffic-report/schema.ts:74-117`
(`AUTHENTICATED_REPORT_BUCKET_LIMITS`) and are enforced at input validation in
`get-overview.ts` / `get-breakdowns.ts`. The kernel accepts a caller-supplied
`BucketDemand.maxStarts` (`types.ts:34-37`) and trusts it. Reject-not-clamp holds, but the mapping
from procedure to limit is a contract concern the issue attributed to the kernel.

### Criterion 2: Preflight order, 422 before cache. PASS for the four gates, unproven for "before cache" and for the cross-resource surface.

The order is correct and tested. The `QUERY_LIMIT_EXCEEDED` mapping exists in the contract error
catalog (`packages/contract/src/schema/errors.ts:49-51`) and is declared on
`traffic/event/goal/funnel/cohort/public` procedures. The gap over `degraded` is that "before cache"
is vacuous here: no cache exists on this branch, and no report handler calls `admit`, so the
sequence is never exercised against a real request. The test asserts gate ordering with mocks
(`reporting.test.ts:439-496`), which proves the control flow, not the integration.

### Criterion 3: 503 when analytics store is not ready, SQLite + accept-only still available. PARTIAL, and diverges from the existing gate.

`admit` throws `serviceUnavailable('analytics-not-ready')` when
`controlStore !== 'ready' || analyticsStore !== 'ready'` (`admission.ts:26-28`). Accept-only
ingestion and SQLite health availability are delivered by a **different, pre-existing** mechanism:
the single admission interceptor in `apps/api/src/index.ts:284-306` with `resolveAdmissionGate` in
`apps/api/src/health.ts:84-100`. That gate already maps `degraded` to
`analyticsReads: 'unavailable'` and `ingestion: 'accept-only'` (`health.ts:98`).

The two gates overlap and can drift. The boundary gate reads health through `systemHealthHandler`
and the lifecycle snapshot; the kernel gate takes an injected `AnalyticsReadinessPort`. They agree
today on the ready/not-ready outcome. They are not the same code path, so the "uniform across
`traffic/event/goal/funnel/cohort/public`" requirement rests on the boundary gate, not on the new
kernel, and nothing couples the kernel result to it.

The control-store condition is slightly stricter than the read contract. The health spec
(`docs/specs/system-data-lifecycle/health/SPECS.md:60`) and ADR 0004 govern analytics reads by
`analyticsStore` alone; `controlStore` not ready is the ingestion-unavailable case. Requiring both
ready for an analytics read is defensible as fail-closed, but the read path never reaches the
kernel, so this stricter rule is not the one in force.

### Criterion 4: Freshness `current|stale` with sequence + occurrence coverage. PASS in shape, semantics worth a second look.

`FreshnessEvidence` carries `status`, `projectedAcceptanceSequence`, and
`occurrenceTimeCoverageThrough` (`types.ts:128-132`). `resolveFreshness` marks `current` when the
checkpoint covers through the interval end and `stale` otherwise (`admission.ts:135-147`). Comparison
freshness is resolved separately (`83-84`), and the test asserts a `stale` current with a `current`
comparison and no `unavailable` key (`reporting.test.ts:498-524`). The contract output schema
(`packages/contract/src/schema/index.ts:324-328`) matches the field set with `status` a two-value
picklist. No `unavailable` envelope exists anywhere. This criterion holds.

The one semantic question: `current` means the projection reached the interval's `endExclusive`. For
a range that ends in the future, no checkpoint can cover it, so a normal "today" request is always
`stale`. That may be intended, but the issue pairs `stale` with "no-gap lag" and the health spec
(`health/SPECS.md:60`) says lag may produce `stale` only with no relevant gap. A live day is not lag.
The kernel has no notion of "now" to distinguish the two, so it cannot express that distinction.

## Findings

### F1. The kernel service is not wired to anything. BLOCKER for the issue's intent.

`ReportingAdmissionService` is referenced only by its own package: `admission.ts`, `index.ts`,
`testing/reporting.test.ts`, and the `packages/kernel/src/index.ts` barrel. No file under
`apps/` imports it. Grepping the repo for `ReportingAdmissionService` outside
`packages/kernel/src/reporting/**` returns only the barrel re-export. There is no served
`traffic-report` handler (`rg getTrafficOverview apps/api/src` is empty). The commit is a library
with no caller.

The issue says the pipeline "must land before any report query" and describes end-to-end behavior.
The preflight ordering criterion is satisfied by construction, but criteria 2 and 3 speak about what
a request observes before cache. No request flows through this code, so those criteria are met at
the library level only.

### F2. The five report ports have no production implementations, and no data exists to implement them. HIGH.

`ReportingMetadataPort`, `ReportingProjectionPort`, `ReportingStatisticsPort`,
`ReportingRetentionPort`, and `FactWorkPort` (`ports.ts:13-47`) have no adapters under `apps/api`.
Only `InMemoryAnalyticsReadinessPort` exists (`packages/kernel/src/ports.ts:339-353`), and that
predates this commit.

Two of the shapes also do not match the persistence that exists.

- `ProjectionCheckpoint.projectedAcceptanceSequence` (`types.ts:90`) versus the column
  `projection_checkpoint.projected_replay_sequence` (`packages/db/src/schema/projection.ts:9`). No
  mapper bridges them.
- ~~`RetentionCoverage` needs three per-dependency boundaries (`types.ts:122-126`), but
  `projection_checkpoint` stores a single `effective_retention_from` (line 12). There is no
  per-dependency retention horizon in the schema.~~ **Corrected during the fix pass.** This was
  wrong. `retention_effective_cutoff`
  (`packages/db/src/schema/lifecycle.ts:214-246`) has exactly the three per-dependency cutoffs the
  type needs: `event_occurrence_cutoff_at`, `profile_activity_cutoff_at`, and the nullable
  `replay_receipt_cutoff_at`. The audit looked in `projection_checkpoint` instead of the retention
  table. The mapping exists; see how it was implemented under Resolution below.

There is also no fact-cardinality statistics table. `projection_checkpoint` has only
`statistics_refreshed_at` (line 13). `AlignedStatistics.factCardinality` (`types.ts:104`) has no
source, and `assertAlignedStatistics` requires it finite and non-negative (`admission.ts:99-111`),
so any real adapter would have to synthesize the one input the budget depends on.

Finally, nothing advances the checkpoint or writes an open gap. `TProjectionCheckpoint` is inserted
once at site creation with `projectedReplaySequence: 0` and `occurrenceCoveredThrough: null`
(`apps/api/src/resources/site/repository.drizzle.ts:122-127`) and deleted on purge (`660-663`).
Grepping for a projector or a writer of `TProjectionGap` returns nothing. The report would always
see `null` coverage, hence always `stale`.

### F3. "Before cache" is not verifiable on this branch. MEDIUM.

The issue repeats "before cache" for the stats/gap/retention/budget gates and for the 503. No report
cache exists in the tree, so there is no cache to check ordering against. The mock-based tests prove
the internal sequence only. When a cache and a handler land, the ordering guarantee needs a test at
that seam; the kernel tests cannot cover it.

### F4. The admission gate is duplicated between the kernel and the HTTP boundary. MEDIUM.

`resolveAdmissionGate` (`apps/api/src/health.ts:84-100`) and `ReportingAdmissionService.admit`
(`admission.ts:24-28`) both decide whether an analytics read may proceed. The boundary one is live
and covers all resources uniformly; the kernel one is inert. Two sources of truth for the same
decision invites drift, and the issue's "uniform across six procedures" requirement is satisfied by
the older gate, not this commit. This is a design fork the issue did not ask for.

### F5. The reusable query surface is absent. MEDIUM.

The issue's reusable clause names allowlisted scoped filters, allowlisted sort with a stable ID
tie-breaker, and zero-based offset pagination with `nextOffset/hasMore/totalCount`. None appear in
`packages/kernel/src/reporting`. The kernel models filters as a single `filterCount: number`
(`types.ts:61`, `ports.ts:43`) and has no sort or pagination type. The contract declares
`filters`, `sort`, `direction`, and `SOffsetPaginationInput` for the breakdown procedure
(`packages/contract/src/contract/traffic-report/query/get-breakdowns.ts:10-15`), but no code
intersects a profile filter with `profileFilterKeys`. The `nextOffset/hasMore/totalCount` matches
elsewhere in the repo belong to other resources' list procedures, not to reporting.

Zero-filled buckets and `complete:false` are likewise absent. The kernel emits `bucketStarts` with
no metric values and no completeness flag; `complete` lives only in the contract output
(`SMetricPoint`). This part of the issue is unimplemented.

### F6. The utils extraction is sound but carries a behavioral change. LOW.

`local-calendar.ts:149` samples offsets every hour (`hours += 1`) where the deleted
`resolveLocalStartOfDay` sampled every six. The new resolution path also tries the exact local
midnight through `resolveLocalDateTimeInstants` before falling back to a binary search for the first
instant on the date (`101-120`). I probed the edges the refactor touches. `resolveSiteLocalCutoff`
still clamps month-end (`2026-03-31` minus one month gives `2026-02-28`) and leap-day
(`2024-02-29` minus twelve months gives `2023-02-28`). `resolveLocalDateStart` for a
midnight-skipping zone returns the first real instant
(`America/Santiago 2026-09-06` gives `2026-09-06T04:00:00Z`, which is 01:00 local), and the hour
enumeration for that date yields 23 starts, correctly omitting 02:00-after-the-jump. The signature
of `resolveSiteLocalCutoff` is unchanged and its API callers still typecheck. The extraction is a
net readability win: it removes a four-way-duplicated wall-clock formatter and gives the calendar
primitives one home.

### F7. Two non-blocking coverage gaps in the new tests. LOW.

The tests cover the happy path and each gate's short-circuit. They do not cover period resolution
for a timezone whose offset is not a whole hour (`Australia/Lord_Howe` gives a 30-minute fall-back;
its day-start resolved correctly in my probe to `2026-04-04T13:00:00Z`), nor a zone that skips a
whole calendar day. They also never exercise the mandatory `metadata` not-found branch
(`admission.ts:31-33`) or the `fact-work-uncertain` branch (`113-124`) through the service. The
bucket-limit test uses `maxStarts: 47` against an hourly two-day range (`reporting.test.ts:292-300`),
which measures the caller-supplied bound, not the `720` the issue names. That is consistent with the
port design, but it means the issue's explicit limit table has no test in this commit.

## Verification I ran

Exactly the commands below, on the audit commit, no edits to tracked files.

- `npx vitest run packages/kernel/src/reporting/testing/reporting.test.ts packages/utils/src/retention-time/testing/local-calendar.test.ts` -> 2 files, 24 tests passed.
- `npx vitest run packages/utils` -> 13 files, 82 tests passed.
- `npx vitest run apps/api/src/resources/retention-policy apps/api/src/resources/event-ingestion` -> 22 files, 141 tests passed.
- `npx tsc -p packages/kernel/tsconfig.json` -> exit 0.
- `npx tsc -p packages/utils/tsconfig.json` -> exit 0.
- `npx tsc -p packages/contract/tsconfig.json` -> exit 0.
- `npx tsc -p apps/api/tsconfig.json` -> exit 0.
- Throwaway probe test for DST and month-end edges (created, run, deleted).

The suite is green and the tree typechecks in every touched package. Green here means "the library
is internally consistent", not "the feature works end to end", because nothing calls it.

## Conclusion and recommended path

At the audited commit, the change was a clean, tested pure core and a reasonable first slice of
`D-01`. It should not have been read as completing the issue: three things stood between it and the
acceptance criteria, namely a caller (F1), real ports over real data plus a projector that advances
the checkpoint and records gaps (F2), and an integration test that proves the preflight order and
the 503 at the request boundary (F3, F4). All four are now closed as recorded under Resolution. The
reusable query surface (F5) remains, tracked in #65.

If the intent is to keep the kernel as a standalone pure module, the issue's acceptance criteria
should be re-scoped to say so, and follow-up issues should own the adapters, the projector, and the
handler wiring. If the intent is to satisfy the issue as written, F1 through F4 are blocking and
need their own commits before this branch can claim `D-01`.

## Resolution

Fixed in the commits below, in dependency order. F1 through F4 are closed; F5 was deferred to
[#65](https://github.com/falentio/cimi/issues/65) with the user's agreement, because it is the whole
aggregation layer rather than the admission pipeline this issue names.

| Finding | Status | Commit | What closed it |
| --- | --- | --- | --- |
| F2 (read surface) | Fixed | `0bcd97b` | `AnalyticsDb.readProjectionSnapshot` reads checkpoint, open gaps, and cardinality in one queued transaction, returning DB-local structs. Timestamps are selected as `epoch_ms`, which fixed a latent round-trip bug: a naive DuckDB `TIMESTAMP` converts to a JS `Date` through the host timezone, so every projection instant was shifted by the process offset. |
| F2 (kernel shape) | Fixed | `3e17d87` | Added `ReportingEvidencePort`, one read of projection + retention + statistics per window. Projection and statistics read through separate ports are two instants, and the alignment assertion compares them, so a rebuild landing between the reads made a healthy request fail. `ReportingAdmissionDependencies` is now a union of the deep port or the three narrow ports, so a half-wired dependency object does not typecheck. |
| F1, F2 (adapters), F4 | Fixed | `d2f83c4` | Served `traffic-report` (both procedures) through the kernel. The evidence adapter reads projection from DuckDB and retention from `retention_effective_cutoff`, whose three cutoffs map onto `RetentionCoverage` 1:1. Readiness is observed through the same `readStoreHealth` probe the HTTP gate uses, so the kernel and the interceptor cannot disagree. |
| F3 | Fixed | `d2f83c4` | 7 boundary tests over the real fixture assert 200 with `stale` freshness and zero-filled `complete:false` buckets, 503 on an unready analytics store, 404 for an unknown Site, 400 for an invalid range, 422 past Effective Retention, 422 for an unprojected Site, and the breakdown page shape. |
| F6 | Fixed | `ebee7eb` | Two real defects behind the "behavioral change" note. Hourly enumeration walked whole wall-clock minutes, so a 30-minute offset zone emitted 24 starts for a 24.5-hour day and dropped the repeated half-hour; enumeration now walks elapsed time from the real day start. A skipped local day (Samoa, 2011-12-30) threw and failed the whole range; it now contributes no bucket. |
| F7 | Fixed | `168cc0b` | Covered the `metadata-missing` and `fact-work-uncertain` branches in both read shapes, including the short-circuit assertion. |
| F5 | Deferred | [\#65](https://github.com/falentio/cimi/issues/65) | The aggregation and bounded-query surface. `getTrafficOverview` admits and returns a zero-filled envelope; `getTrafficBreakdowns` returns an empty page. Neither claims a measurement the code does not have. |

The audit's own F2 claim about retention was wrong and is corrected above. `retention_effective_cutoff`
held the per-dependency cutoffs all along; the audit looked in `projection_checkpoint`.

## Principles applied

- **Prove It Works.** Criterion claims are backed by running the artifacts (tests, typecheck, DST
  probes), not by reading the diff. F2 is confirmed by grepping for writers and reads that return
  nothing, and by the schema/type mismatch, not by inference.
- **Fix Root Causes.** F4 traces the "gate duplicated" symptom to the pre-existing interceptor and
  names the single owner the issue implies.
- **Minimize Reader Load.** F6 frames the utils change by the layers it removes (four copies of one
  formatter) rather than by line count.
- **Boundary Discipline.** F2 and F3 sit exactly on the port and request boundaries, which is where
  the code lets framework concerns leak or go unenforced.
- **Never Block on the Human.** The audit answered "are we sure this implements #44" from evidence
  instead of asking for a judgement call.
