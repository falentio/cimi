I have all the facts I need. Here is the report.

---

# Traffic-report query gating in this repo

## Components Found

### Gate A — Installation projection-readiness gate
| Thing | Location |
|---|---|
| `createInstallation` (wires the gate) | `apps/api/src/resources/installation/index.ts:47` |
| `analyticsProjectionReady: () => isAnalyticsProjectionReady({ db, analytics })` | `apps/api/src/resources/installation/index.ts:78` |
| **`isAnalyticsProjectionReady`** (the per-site cardinality check) | `apps/api/src/resources/installation/index.ts:92-108` |
| Consumer of the gate | `apps/api/src/resources/installation/service.ts:679-685` |
| Gate dependency type | `InstallationServiceDependencies.analyticsProjectionReady?: (() => Promise<boolean>) \| undefined` — `apps/api/src/resources/installation/service.ts:66`, stored at `service.ts:139` |

### Gate B — Reporting admission
| Thing | Location |
|---|---|
| `ReportingAdmissionService` | `packages/kernel/src/reporting/admission.ts:27` |
| `admit` | `admission.ts:34-44` |
| `prepare` (readiness → metadata → period resolution) | `admission.ts:46-82` |
| `admitPrepared` (facts → retention → fact-work → ticket) | `admission.ts:84-143` |
| `#readFacts` (private; evidence branch vs three-port branch) | `admission.ts:145-198` |
| `readPort` (port-failure wrapper) | `admission.ts:200-206` |
| `resolveEvaluationPeriods` (module-local) | `admission.ts:209-267` |
| `rejectRelevantGap` | `admission.ts:269-273` |
| `requireAlignedStatistics` | `admission.ts:275-291` |
| `assertAdmittedFactWork` | `admission.ts:293-308` |
| `countBucketStarts` | `admission.ts:310-314` |
| `resolveFreshness` | `admission.ts:316-332` |
| `ReportingAdmissionDependencies` (narrow-ports ∪ evidence union) | `packages/kernel/src/reporting/ports.ts:94-102` |
| `ReportingEvidencePort` / `ReportingEvidenceRequest` / `ReportingEvidence` | `ports.ts:67-81` (doc comment 58-66) |
| DuckDB+SQLite adapter | `apps/api/src/resources/traffic-report/evidence.drizzle-duckdb.ts:19` |
| Metadata adapter | `apps/api/src/resources/traffic-report/metadata.drizzle.ts:9` |
| Readiness adapter | `apps/api/src/resources/traffic-report/readiness.ts:11` (`createReportingReadinessPort`) |
| Service entry | `apps/api/src/resources/traffic-report/service.ts:66` |
| Composition | `apps/api/src/resources/traffic-report/index.ts:41` (`createTrafficReport`) |
| Router | `apps/api/src/resources/traffic-report/router.ts:11` |
| Error mapping to oRPC | `apps/api/src/errors.ts:10` (`toOrpcReportingError`) |
| Read lease | `apps/api/src/lifecycle/analytics-read-lease.ts:9` (`withAnalyticsReadLease`) |

### Cardinality / statistics alignment
| Thing | Location |
|---|---|
| `readProjectionSnapshot` (interface decl) | `packages/db/src/duckdb/index.ts:118` |
| `readProjectionSnapshot` (impl) | `packages/db/src/duckdb/index.ts:216-277` |
| **live `SELECT count(*) AS fact_cardinality FROM events WHERE site_id = ?`** | `packages/db/src/duckdb/index.ts:243-246` |
| checkpoint SELECT | `packages/db/src/duckdb/index.ts:222-232` |
| open-gaps SELECT (`status = 'open'`) | `packages/db/src/duckdb/index.ts:234-241` |
| `AnalyticsProjectionSnapshot` + doc comment explaining the comparison | `packages/db/src/duckdb/index.ts:57-61` (comment 51-56) |
| `AnalyticsProjectionCheckpoint` | `packages/db/src/duckdb/index.ts:34-42` |
| `AnalyticsProjectionGap` | `packages/db/src/duckdb/index.ts:44-49` |
| `ready()` (table-set + projection-version probe) | `packages/db/src/duckdb/index.ts:188-215` |
| `ANALYTICS_PROJECTION_VERSION` = `'v5'` | `packages/db/src/duckdb/schema.ts:17` |
| `ANALYTICS_REQUIRED_TABLES` (7 tables) | `packages/db/src/duckdb/schema.ts:7-15` |
| `ProjectionEvidence` read → `{projection, retention, statistics}` | `evidence.drizzle-duckdb.ts:23-62` |
| **`resolveStatistics`** (`aligned`/`stale`/`unknown`) | `evidence.drizzle-duckdb.ts:100-125` |
| → `stale` when `checkpoint.projectedFactCardinality !== factCardinality` | `evidence.drizzle-duckdb.ts:112` |
| → `unknown` when checkpoint null or `readiness !== 'ready'` | `evidence.drizzle-duckdb.ts:108` |
| `AlignedStatistics` discriminated union | `packages/kernel/src/reporting/types.ts:142-157` |
| `ProjectionCheckpoint` / `ProjectionGap` / `ProjectionEvidence` | `types.ts:128-140` / `121-126` / `137-140` |
| Adapter test proving aligned/stale | `apps/api/src/resources/traffic-report/testing/evidence.drizzle-duckdb.read.test.ts:46-80` |

### Interval, gap, coverage, retention
| Thing | Location |
|---|---|
| `resolveReportPeriods` | `packages/kernel/src/reporting/interval.ts:33-76` |
| `resolvePeriodSequence` | `interval.ts:78-117` |
| **`findRelevantProjectionGap`** (gap semantics) | `interval.ts:119-134` |
| `resolvePeriod` (site-local → half-open interval) | `interval.ts:136-183` |
| `startOfPeriod` / `addPeriod` / `weekStartNumber` | `interval.ts:185-197` / `199-214` / `216-233` |
| `resolveBucketStarts` (maxStarts guard + over-limit reject) | `interval.ts:235-261` |
| `isBoundedGap` | `interval.ts:263-271` |
| `periodsOverlapGap` (half-open: `from < endExclusive && start < to`) | `interval.ts:273-277` |
| `checkRetentionCoverage` | `packages/kernel/src/reporting/retention.ts:9-28` |
| `boundaryForDependency` / `coversPeriod` | `retention.ts:30-42` / `44-46` |
| Retention read (`TRetentionEffectiveCutoff`) | `evidence.drizzle-duckdb.ts:63-90` |
| `availableFrom` | `evidence.drizzle-duckdb.ts:96-98` |
| `RetentionCoverage` / `RetentionBoundary` / `CoverageDependency` | `types.ts:159-168` / `159-162` / `26` |
| Freshness model | `types.ts:170-174` (`FreshnessEvidence`) |
| Bucket zero-fill and `complete` flag | `packages/kernel/src/reporting/query/bucket-fill.ts:25-47` |

### Fact-work budget
| Thing | Location |
|---|---|
| `FACT_WORK_WEIGHTS` | `packages/kernel/src/reporting/fact-work.ts:4-11` |
| `estimateFactWork` / `defaultFactWorkEstimator` | `fact-work.ts:13-42` |
| `REPORT_FACT_WORK_BUDGETS` (aggregate 25M, breakdown 10M, row-list 1M, stateful 10M) | `packages/contract/src/contract/traffic-report/schema.ts:93-98` |
| `AUTHENTICATED_REPORT_BUCKET_LIMITS` | `packages/contract/src/contract/traffic-report/schema.ts:78` |
| `DISTINCT_COUNT_OPERATIONS` ({aggregate: 2, breakdown: 2}) | `apps/api/src/resources/traffic-report/service.ts:53-56` |
| Error reasons (`statistics-uncertain`, `projection-gap`, `retention-incomplete`, `fact-work-over-budget`, `analytics-not-ready`, …) | `packages/kernel/src/reporting/errors.ts:7-22` |

### Query surface (DuckDB)
| Thing | Location |
|---|---|
| `DuckDbReportingQuery` | `packages/db/src/duckdb/reporting-query.ts:120` |
| `trafficAggregate` | `reporting-query.ts:123-142` |
| `trafficBreakdown` | `reporting-query.ts:144-161` |
| `readFilteredSessionCount` (breakdown denominator) | `reporting-query.ts:490-514` |
| **`readMetrics`** — every overview fact | `reporting-query.ts:578-644` |
| → `visitors = count(DISTINCT visitor_id)` over `events` | `reporting-query.ts:621` |
| → `sessions = count(DISTINCT analytics_session_id)` over `events` | `reporting-query.ts:622` (CTE `scoped_sessions` 593-595) |
| → `eligible_sessions` (page_view only) | `reporting-query.ts:596-599`, `623` |
| → **`bounced_sessions`** (1 page_view, 0 custom, 0 outbound, duration < 10000 ms, ∈ eligible_sessions) | `reporting-query.ts:627-630` |
| → `total_session_duration_ms` / `sessions_with_valid_duration` | `reporting-query.ts:624-626` |
| `readTrend` (per-bucket `count(DISTINCT visitor_id)`) | `reporting-query.ts:646-706` |
| `breakdownGroupCte` (page / exit_page / session-dimension joins) | `reporting-query.ts:793-834` |
| `renderSessionExitPagePredicate` | `reporting-query.ts:959-972` |
| `renderVisitorPredicate` (`visitor.identity_kind`) | `reporting-query.ts:974-991` |
| `renderFilterPlan` (profile filter throw) | `reporting-query.ts:867-906`, `898-903` |
| `renderEventPredicate` (profile.trait throw) | `reporting-query.ts:908-929`, `915-920` |
| `ReportingQueryUnsupportedError` | `packages/kernel/src/reporting/query/types.ts` |
| `session_events` re-scan (all events of scoped sessions, not just windowed) | `reporting-query.ts:600-607` |
| ISO-string timestamp binding note | `reporting-query.ts:862-865` |
| `readCount` (DuckDB BIGINT → Number) | `reporting-query.ts:709-713` |
| `TrafficMetricsFacts` / metric catalog | `packages/kernel/src/reporting/query/traffic-types.ts:14-22` / `query/metric-catalog.ts:32-81` |
| `bounce_rate` derivation `ratio(bouncedSessions, eligibleSessions)` | `metric-catalog.ts:57-64` |
| `readStoreHealth` (control + analytics + dataDirectory + lifecycle) | `apps/api/src/health.ts:159-232` |
| Projection tests proving derived-table counts | `packages/db/src/duckdb/testing/duckdb.test.ts:481-488` |
| Gap/retention/fact-work/admission tests | `packages/kernel/src/reporting/testing/reporting.test.ts:501-568`, `571-608`, `610-876`, `878-1000` |

### Frontend
| Thing | Location |
|---|---|
| Route page (renders the component only) | `apps/web/app/pages/sites/[siteId]/index.vue:1-7` |
| `SiteOverview.vue` | `apps/web/app/components/features/site-overview/SiteOverview.vue:1-198` |
| `useSiteTraffic` — the page's only data source | `.../useSiteTraffic.ts:70-286` |
| `orpc.trafficReport.getTrafficOverview.call` | `useSiteTraffic.ts:160` |
| `orpc.trafficReport.getTrafficBreakdowns.call` | `useSiteTraffic.ts:197` |
| `orpc.site.getSite.call` (reportingTimezone) | `useSiteTraffic.ts:105` |
| Pure mapper (no fixtures) | `.../site-overview.mapper.ts` |

### Organization personal-org protection
| Thing | Location |
|---|---|
| `createDeleteOperation` (service, maps repository throws) | `apps/api/src/resources/organization/service.ts:549-589` |
| → `PERSONAL_PROTECTED` → `PERSONAL_ORGANIZATION_PROTECTED` 409 | `service.ts:570-571` |
| → `ORGANIZATION_NOT_EMPTY` → conditional code | `service.ts:572-578` |
| `createDeleteOperation` (repo; sites check then throw) | `apps/api/src/resources/organization/repository.drizzle.ts:461-483` (site query 474-479, throw **481-483**) |
| Same guard in the second op path | `repository.drizzle.ts:632` |
| `checkDelete` / `deleteIfEmpty` (`kind: 'not-empty'`) | `repository.drizzle.ts:402-422` / `433-459` |
| **Test: personal org owning a site → `PERSONAL_PROTECTED`** | `apps/api/src/resources/organization/testing/repository.drizzle.delete.test.ts:138-147` |
| **Test: non-personal org owning a site → `ORGANIZATION_NOT_EMPTY`** | `.../repository.drizzle.delete.test.ts:127-136` (also `checkDelete` `not-empty` at `41-49`, `78-81`) |
| **Test: `PERSONAL_PROTECTED` → `PERSONAL_ORGANIZATION_PROTECTED` 409** | `apps/api/src/resources/organization/testing/service.delete.test.ts:120-123` |
| Contract declaration | `packages/contract/src/contract/organization/command/delete.ts:32`, `packages/contract/src/schema/errors.ts:39-41`, `packages/contract/src/contract/errorDeclarations.test.ts:17` (409) |

---

## Flow

### Flow 1 — Installation gate (`isAnalyticsProjectionReady`)
```
createInstallation()                              index.ts:47
  └─ InstallationService({ analyticsProjectionReady: isAnalyticsProjectionReady })   index.ts:78
       └─ installation.ts:679  input.checkpoint === 'duckdb_rebuilt'
            └─ !await analyticsProjectionReady()
                 └─ isAnalyticsProjectionReady({db, analytics})      index.ts:92
                      1. await analytics.ready()                      → false short-circuits   index.ts:96
                         • 7 tables present AND every projection_checkpoints.projection_version === 'v5'
                                                                       duckdb/index.ts:188-215
                      2. SELECT id FROM site  (NO status/tombstone filter)             index.ts:97
                      3. per site: analytics.readProjectionSnapshot({siteId})           index.ts:100
                         duckdb/index.ts:216-277
                           ├─ projection_checkpoints row (or undefined)                 :222-232
                           ├─ projection_gaps WHERE status='open' ORDER BY id           :234-241
                           └─ SELECT count(*) FROM events WHERE site_id = ?             :243-246
                      4. snapshot.checkpoint === null                → false            index.ts:102
                      5. checkpoint.projectedFactCardinality !== snapshot.factCardinality → false   index.ts:104
                      6. all sites pass                                → true           index.ts:107
                 └─ false ⇒ upgradeExecutor.rebuildAnalytics({operationId})   installation/service.ts:684
```
Note the gate never looks at `openGaps` or `readiness` — **cardinality equality only**. And it iterates **every** `TSite` row, including non-active/tombstoned ones.

### Flow 2 — Reporting admission (`ReportingAdmissionService.admit`)
```
TrafficReportService.getOverview / getBreakdowns            service.ts:69 / :78
  └─ withAnalyticsReadLease(lifecycleLock, …)               service.ts:73 / :82
       └─ assertSiteScope(user, input.siteId, scope)         service.ts:91 / :122
       └─ admit(input, family)                               service.ts:172-206
            ├─ admission.admit({...})                        admission.ts:34
            │    ├─ prepare()                                 admission.ts:46
            │    │    ├─ analyticsReadiness.getHealth()        :47
            │    │    │    └─ createReportingReadinessPort → readStoreHealth   readiness.ts:11
            │    │    │       controlStore = controlDb OK && dataDirectoryReady && lifecycle
            │    │    │       analyticsStore = analytics.ready() && lifecycle   health.ts:224-230
            │    │    │    └─ either !== 'ready' ⇒ serviceUnavailable('analytics-not-ready')   :49-51
            │    │    ├─ metadata.getActive(siteId)            :53  (ReportingMetadataDrizzle)
            │    │    │    └─ undefined ⇒ reportingNotFound('metadata-missing')  :55-57
            │    │    ├─ resolveReportPeriods(metadata, current[, comparison], bucket)   :59
            │    │    └─ resolveEvaluationPeriods(...)         :66
            │    └─ admitPrepared(preparation, demand)         admission.ts:84
            │         ├─ #readFacts(...)                       :88 / :145
            │         │    evidence branch (this repo uses it):
            │         │      ReportingEvidenceDrizzleDuckDb.read             evidence.drizzle-duckdb.ts:23
            │         │        ├─ analytics.readProjectionSnapshot           :23
            │         │        ├─ readRetention (TRetentionEffectiveCutoff)  :24 / :63
            │         │        └─ resolveStatistics(checkpoint, factCardinality)  :61 / :100
            │         │    ├─ requireAlignedStatistics(statistics, projection)  :169 / :190
            │         │    └─ rejectRelevantGap(projection, periods)            :170 / :191
            │         ├─ checkRetentionCoverage(coverage, required, coveragePeriods)  :93  retention.ts:9
            │         ├─ factWork.estimate(...)                :104  fact-work.ts:13
            │         ├─ assertAdmittedFactWork(estimate, budget)  :116  admission.ts:293
            │         └─ build ReportAdmissionTicket {periods, evaluation,
            │              projectionGeneration, freshness{current,comparison}, factWork}  :118-142
            └─ catch ⇒ toOrpcReportingError(error)             service.ts:203
```

### Flow 3 — the four fail-closed gates on the fact read (order matters, each short-circuits)
```
requireAlignedStatistics (admission.ts:275-291)
  rejects unless ALL of:
    • statistics.state === 'aligned'
    • statistics.asOfAcceptanceSequence === projection.checkpoint.projectedAcceptanceSequence
    • projection.checkpoint.projectedFactCardinality !== null
    • statistics.factCardinality === projection.checkpoint.projectedFactCardinality
    • Number.isFinite(factCardinality) && factCardinality >= 0
  ⇒ queryLimitExceeded('statistics-uncertain')

rejectRelevantGap (admission.ts:269-273) → findRelevantProjectionGap (interval.ts:119-134)
  any gap:  unbounded OR not isBoundedGap  ⇒ reject immediately      (interval.ts:124)
  else:      periodsOverlapGap(current.interval, gap)               (interval.ts:126)
             periodsOverlapGap(comparison.interval, gap)            (interval.ts:128)
  ⇒ queryLimitExceeded('projection-gap')

checkRetentionCoverage (retention.ts:9-28)
  for each required CoverageDependency:
    boundary.state === 'available' && boundary.from <= period.start   (retention.ts:44-46)
    for current and, when present, comparison                          (retention.ts:17-26)
  ⇒ queryLimitExceeded('retention-incomplete')

assertAdmittedFactWork (admission.ts:293-308)
  estimate defined, units/budget finite, estimate.budget === demand.work.budget,
  units >= 0 and units <= budget
  ⇒ 'fact-work-uncertain' / 'fact-work-over-budget'
```

### Flow 4 — a served report
```
overviewPeriod (service.ts:208-262)
  ├─ query.trafficAggregate({siteId, period, includeTrend:true, filterPlan})   :214
  │    └─ readMetrics: visitors/sessions/pageviews/eligibleSessions/
  │       sessionsWithValidDuration/bouncedSessions/totalSessionDurationMs    reporting-query.ts:578-644
  │    └─ readTrend: per-bucket count(DISTINCT visitor_id)                   reporting-query.ts:646-706
  ├─ fillBuckets({bucketStarts, interval, completeThrough: freshness.occurrenceTimeCoverageThrough})
  │                                                                          service.ts:232-238
  │    bucket present/order from bucketStarts only; missing row ⇒ 0;
  │    complete = completeThrough !== null && bucketEnd <= completeThrough   bucket-fill.ts:44
  └─ bounceRate = trafficMetricValue('bounce_rate', facts)
       = ratio(bouncedSessions, eligibleSessions), 0 when denominator is 0   metric-catalog.ts:57-64
  freshnessOutput: {projectedAcceptanceSequence, occurrenceTimeCoverageThrough, status}  service.ts:326-335
```

### Flow 5 — organization delete protection for an org that owns a site
```
OrganizationService.delete → createDeleteOperation       service.ts:549
  └─ repository.createDeleteOperation(...)               repository.drizzle.ts:461
       ├─ organization missing                            ⇒ throw 'NOT_FOUND'         :472
       ├─ SELECT id FROM site WHERE organization_id = ?   :474-479
       ├─ sites.length > 0  ⇒ throw organization.isPersonal
       │                                 ? 'PERSONAL_PROTECTED'                     :481-482
       │                                 : 'ORGANIZATION_NOT_EMPTY'
       ├─ pending governance operation ⇒ 'FENCED_PENDING'                            :497
       └─ owner mismatch ⇒ 'FORBIDDEN_OWNER'                                         :499
  service catch maps:
       'PERSONAL_PROTECTED'    ⇒ ORPCError('PERSONAL_ORGANIZATION_PROTECTED', 409)   service.ts:570-571
       'ORGANIZATION_NOT_EMPTY'⇒ isPersonal ? 'PERSONAL_ORGANIZATION_PROTECTED'
                                                      : 'ORGANIZATION_NOT_EMPTY'      service.ts:572-578
```

---

## Files Read

**apps/api**
- `src/resources/installation/index.ts` (full, 109 lines)
- `src/resources/installation/service.ts` (constructor 148-175; upgrade checkpoint 660-710; dependency `service.ts:66`)
- `src/resources/traffic-report/index.ts`, `service.ts`, `evidence.drizzle-duckdb.ts`, `metadata.drizzle.ts`, `readiness.ts`, `router.ts` (full directory)
- `src/resources/traffic-report/testing/evidence.drizzle-duckdb.read.test.ts` (full, 81 lines)
- `src/resources/site/scope.ts` (1-60)
- `src/resources/organization/service.ts` (540-610), `repository.drizzle.ts` (390-500, 620-640)
- `src/resources/organization/testing/service.delete.test.ts` (full), `testing/repository.drizzle.delete.test.ts` (1-165)
- `src/health.ts` (`readStoreHealth` 159-232), `src/errors.ts` (1-22), `src/lifecycle/analytics-read-lease.ts` (full)

**packages/kernel/src/reporting**
- `admission.ts` (full, 332 lines), `interval.ts` (full, 277), `retention.ts` (full, 46), `errors.ts` (full, 68), `fact-work.ts` (full, 44), `index.ts` (full, 75), `ports.ts` (full, 102), `types.ts` (full, 233)
- `query/metric-catalog.ts` (full, 94), `query/bucket-fill.ts` (full, 48), `query/traffic-types.ts` (full, 78), `query/index.ts` (full, 73), `query/compile-filter.ts` (1-140)
- `testing/reporting.test.ts` (490-570, 571-608, 610-1000)

**packages/db/src/duckdb**
- `index.ts` (1-130, 160-300, 330-660, 740-900, 954-1310, 1400-1500)
- `reporting-query.ts` (full, 1180 lines)
- `schema.ts` (full, 174 lines)
- `testing/duckdb.test.ts` (300-600)

**packages/contract**
- `src/contract/traffic-report/schema.ts` (78-130)

**apps/web**
- `app/pages/sites/[siteId]/index.vue` (full)
- `app/components/features/site-overview/`: `SiteOverview.vue` (full), `useSiteTraffic.ts` (full), `site-overview.mapper.ts` (1-120)

**docs**
- `docs/adr/0001-canonical-analytics-query-semantics.md`, `docs/adr/0003-sqlite-duckdb-logical-ownership.md`

---

## Boundaries

1. **Two gates, two different definitions of "ready."** The installation gate (`installation/index.ts:92`) is *cardinality-only*. Reporting admission (`admission.ts:275-291`) is *cardinality + sequence + gaps + retention + fact-work*. A projection can satisfy the installation gate while every traffic query still returns `QUERY_LIMIT_EXCEEDED 'statistics-uncertain'` (sequence mismatch) or `'projection-gap'` (open gap).

2. **Cardinality equality is checked twice, in different type systems.** DuckDB `BIGINT` → `Number()` at `duckdb/index.ts:248-250`; installation compares with `!==`; admission compares again in `requireAlignedStatistics`. `evidence.drizzle-duckdb.ts:112` produces `stale`, which admission then converts to `statistics-uncertain`. The evidence adapter is the *only* place that distinguishes "stale" from "unknown" — admission never sees the distinction.

3. **The evidence port hides the store split.** `packages/kernel/src/reporting/ports.ts:58-66` documents why: separate projection/statistics ports could be read at different instants. `ReportingAdmissionDependencies` (`ports.ts:94-102`) is a union so a half-wired dependency object is unrepresentable; the runtime discriminator is `'evidence' in dependencies` (`admission.ts:158`).

4. **Profile filters are admitted but not queryable.** `ReportingProfileFilterPort` (`ports.ts:42-44`) gates which `trait.<k>` keys the *contract* approves (`compileTrafficFilterPlan`, `service.ts:156-170`), but the DuckDB renderer throws `ReportingQueryUnsupportedError` at `reporting-query.ts:898-903` and `915-920` because the projection carries no profile join. Report fails closed with `BAD_REQUEST`, not `QUERY_LIMIT_EXCEEDED`.

5. **Traffic reports request only `coverage: ['event-occurrence']`** (`service.ts:194`). `profileActivity` and `replayReceipt` retention boundaries are still read into `RetentionCoverage` (`evidence.drizzle-duckdb.ts:75-89`) but are unenforced on this path.

6. **The traffic report is a *reader* of `analytics_sessions` and `visitors`.** `readMetrics` derives `visitors`/`sessions` purely from `events.visitor_id`/`events.analytics_session_id` (`reporting-query.ts:621-622`), but any session-scoped breakdown or filter joins the derived `analytics_sessions` table (`reporting-query.ts:823-833`, `935-954`) and the exit-page path re-reads `events` (`959-972`). A single incremental path must keep all four tables consistent.

7. **Read isolation is enforced, not assumed.** `withAnalyticsReadLease` (`analytics-read-lease.ts:9`) holds an `analytics-read` lease across the whole read and returns `serviceUnavailable('lifecycle-locked')` when a lifecycle mutation holds exclusive access.

8. **`readCompleteThrough` is freshness, not statistics.** `service.ts:322-324` feeds `freshness.occurrenceTimeCoverageThrough` into `fillBuckets`, so a bucket whose end is beyond coverage through is `complete: false` even when statistics are aligned. When coverage-through is `null`, **every** bucket is incomplete (`bucket-fill.ts:44`).

9. **Frontend is fully live.** No fixtures exist outside `*.test.ts`. `apps/web/app/pages/sites/[siteId]/index.vue` is 7 lines rendering `SiteOverview.vue`, whose sole data source is `useSiteTraffic.ts:70` calling `orpc.trafficReport.getTrafficOverview` / `getTrafficBreakdowns` and `orpc.site.getSite`.

10. **`PERSONAL_ORGANIZATION_PROTECTED` is a site-ownership collision, not a flag.** It is raised when an org with `isPersonal = true` owns at least one `TSite` row (`repository.drizzle.ts:481-483`), then mapped at `service.ts:570-571` / `572-578`. The contract declares it 409 (`packages/contract/src/contract/organization/command/delete.ts:32`).

---

## Non-Obvious Things

1. **The live `count(*)` is per-site and unbounded-scope.** `packages/db/src/duckdb/index.ts:244` is `SELECT count(*) FROM events WHERE site_id = ?` — no `retention`, no `status` filter, no `LIMIT`. It counts the physical DuckDB rows. `readReportData` and `readProjectionSnapshot` run through the same serialized `enqueue` (`duckdb/index.ts:221`), so the count and the checkpoint are one reader-consistent snapshot.

2. **The installation gate iterates every `TSite`, not just active ones.** `installation/index.ts:97` is `db.select({ id: schema.TSite.id }).from(schema.TSite).all()` — no `status = 'active'`, no tombstone exclusion. The rebuild only writes checkpoints for active, non-tombstoned sites (`readActiveSiteIds`, `duckdb/index.ts:1126-1139`; and `readEvents` joins `site s ON s.status = 'active'` at `:1030`). So a single paused or tombstoned site makes `isAnalyticsProjectionReady` permanently `false`. **Flag as a likely mismatch, not a proven bug** — the gate is only exercised at `installation/service.ts:679-685` behind `input.checkpoint === 'duckdb_rebuilt'`.

3. **`readiness` is a free-text column read with a default.** `duckdb/index.ts:263` is `readiness: String(checkpointRow['readiness'] ?? 'unavailable')`, and `evidence.drizzle-duckdb.ts:108` compares `!== 'ready'`. Rebuild always writes `'ready'` (`foldProjectedCheckpoints`, `:1182`), and migration v1 defaults the column to `'ready'` (`schema.ts:100`). `deleteExpired` never touches readiness — only `projection_generation`, coverage bounds, cardinality, `effective_retention_from`, `statistics_refreshed_at` (`:804-824`).

4. **An open gap blocks the *entire site* when unbounded.** `interval.ts:124` rejects `gap.unbounded || !isBoundedGap(gap)` before any overlap test. `isBoundedGap` (`:263-271`) also rejects a gap whose `occurrenceTo <= occurrenceFrom` or has null ends. Proven at `reporting.test.ts:531-545`.

5. **Half-open overlap means an exactly-adjacent gap passes.** `periodsOverlapGap` (`interval.ts:273-277`) is `gap.from < interval.endExclusive && interval.start < gap.to`. A gap ending exactly at the period start, or starting exactly at `endExclusive`, is not relevant. Proven at `reporting.test.ts:505-529`.

6. **Freshness is coverage-through, not sequence.** `resolveFreshness` (`admission.ts:316-332`) marks `'current'` only when `checkpoint.occurrenceCoveredThrough >= evaluationEndExclusive`, where `evaluationEndExclusive` is the last periodized sub-interval's end (`:324`). `projectedAcceptanceSequence` is reported but not used for the freshness decision.

7. **`session_events` scans the whole site, not the window.** `reporting-query.ts:600-607` re-reads `events f WHERE f.site_id = ? AND f.analytics_session_id IN (SELECT session_id FROM scoped_sessions)` with **no occurrence_time bounds**. Bounce/duration facts are computed over each scoped session's entire lifetime, so a session that began before the window contributes its pre-window events to `bounced_sessions` and duration.

8. **Bounce rate has a hard-coded 10-second rule inside SQL.** `reporting-query.ts:627-630`: `page_view_count = 1 AND custom_event_count = 0 AND outbound_count = 0 AND (max_ms - min_ms) < 10000 AND session_id IN (SELECT session_id FROM eligible_sessions)`. The kernel side only divides (`metric-catalog.ts:63`). Changing the bounce definition requires a SQL change, not a catalog change.

9. **The `events` table has a `replay_sequence UNIQUE` constraint.** `packages/db/src/duckdb/schema.ts:76`. Any incremental inserter must not collide, and the PK is `(site_id, event_id)` (`schema.ts:79`) — the same `event_id` may repeat across sites (proven at `duckdb.test.ts:551-595`).

10. **DuckDB rejects BIGINT→TIMESTAMP binds.** `reporting-query.ts:862-865` binds every instant as `new Date(ms).toISOString()`. A new path that tries to bind epoch ms as a parameter will fail at execution, not compile.

11. **DuckDB returns `BIGINT` as JS `bigint`.** Every reader coerces through `readCount` (`reporting-query.ts:709-713`) / `readInstantValue` (`:756-763`, which explicitly handles `bigint` and throws otherwise). `duckdb.test.ts:525-526` asserts `projected_replay_sequence: 5n` / `projected_fact_cardinality: 4n`.

12. **The `analytics_sessions` insert always writes `region`/`city` as `null`.** `duckdb/index.ts:559-560`. But `readSessionBreakdown` and `SESSION_COLUMNS` (`reporting-query.ts:72-73`, `114-115`) select `region`/`city` from the table, and `breakdownGroupCte` groups on them (`:826-832`). Region/city breakdowns are structurally always empty on the rebuild path.

13. **`event_properties` is inserted with a `SELECT … FROM events WHERE event_pk = ?` guard.** `duckdb/index.ts:614-616` — properties for a dropped/failed event silently vanish because the correlated SELECT returns no row. `event_properties` rows are keyed `(site_id, event_id, property_key)` (`schema.ts:90`).

14. **`failed` accepted events are excluded from the projection entirely.** `duckdb/index.ts:369` filters `event.projectionState !== 'failed'` before folding visitors, sessions, checkpoints, and events. That is why the rebuild test asserts `events: 4` from 5 seeded `accepted_event` rows (`duckdb.test.ts:481-488`), and why `projected_fact_cardinality: 4n` (`:526`).

15. **`projection_generation` is dual-written.** Every mutation bumps `projection_generations` *and* `projection_checkpoints.projection_generation` (`duckdb/index.ts:586-591`, `1224-1236`), and `nextProjectionGeneration` takes the max across both tables (`:1209-1222`). The ticket surfaces `projectionGeneration` (`admission.ts:125`).

16. **The whole rebuild is one transaction with an explicit ROLLBACK that sets `unavailable = true`.** `duckdb/index.ts:463-637`; the catch at `:629-637` marks the entire analytics DB unavailable on rollback failure, after which `ready()`, `readProjectionSnapshot`, `rebuild`, `deleteExpired`, and `purgeSite` all throw/short-circuit (`:189`, `:217-219`, `:344`, `:646`, `:843`).

17. **`deleteExpired` re-derives sessions/visitors from `events` via correlated subqueries, then deletes orphans.** `duckdb/index.ts:677-803` recomputes each surviving session's first-event-derived attributes (`ORDER BY event.occurrence_time, event.event_id LIMIT 1`) and each visitor's min/max/identity_kind, then `DELETE FROM analytics_sessions/visitors WHERE NOT EXISTS (…events…)`. It does **not** update `projected_replay_sequence`.

18. **`purgeSite` deletes derived rows but leaves the site's gap/checkpoint bookkeeping to the caller.** `duckdb/index.ts:847-866` deletes all six row sets for the site and bumps the generation.

19. **Admission reads evidence once per family, twice for a comparison.** `getOverviewAdmitted` calls `this.admit(input, 'aggregate')` once (`service.ts:92`) and then `overviewPeriod` twice (current + comparison, `:96-115`). The fact evidence is one read; the metric SQL runs per period.

20. **Bucket over-limit is rejected, never clamped.** Two independent guards: `resolveBucketStarts` throws `queryLimitExceeded('bucket-bound')` at `interval.ts:254`, and the contract validates the granularity/range combination via `isWithinAuthenticatedReportBucketLimit` (`packages/contract/src/contract/traffic-report/schema.ts:120-129`). Proven at `reporting.test.ts:347-359`.

21. **Retention is checked against only `period.interval.start`.** `retention.ts:17` and `:21-23` test `boundary.from <= periodStart`, not the whole interval. A cutoff landing after the period start but before its end does not block the query.

22. **The overview `trend` denominator is the whole period's `visitors` count.** `service.ts:224-225` computes `trendDenominator` from `facts` (the aggregate result) and stamps it on every bucket (`:258`) — it is not per-bucket.

---

## Open Questions

1. **Should the installation gate filter sites by status/tombstone?** `installation/index.ts:97` iterates all `TSite` rows; the rebuild only publishes checkpoints for active, non-tombstoned sites. Any non-active site therefore pins `isAnalyticsProjectionReady` to `false` and re-triggers `rebuildAnalytics` on every `duckdb_rebuilt` upgrade. Needs a product decision: is the gate meant to prove *all* sites or *all readable* sites are aligned? (No test currently covers a mixed active/inactive site set.)

2. **Where does `projection_gap` (control DB) get *written*?** The rebuild only *copies* rows (`readProjectionGaps`, `duckdb/index.ts:1238-1250`) and `deleteExpired` deletes resolved ones by `occurrence_to < cutoff` (`:826-830`). Nothing in the DuckDB layer closes a gap when data lands, yet `readProjectionSnapshot` only surfaces `status = 'open'` (`:239`). A new incremental projection path must therefore maintain the control-DB side's gap lifecycle, or it cannot ever clear a gap.

3. **What closes the `stale` window?** `resolveStatistics` compares a live count against the checkpoint published by the *last rebuild* (`duckdb/index.ts:51-56`). Between any accepted event and the next rebuild, `factCardinality > projectedFactCardinality` and every traffic query returns `QUERY_LIMIT_EXCEEDED`. Is "rebuild only" the accepted freshness model, or is there a planned incremental publish that bumps `projected_fact_cardinality` and `occurrence_covered_through` in the same transaction as the insert?

4. **`region`/`city` are always null.** `duckdb/index.ts:559-560` hardcodes `null` for both, yet `BREAKDOWN_SESSION_COLUMNS` exposes them (`reporting-query.ts:114-115`). Should an incremental path populate them, or should the dimensions be removed?

5. **Does the `replay_sequence UNIQUE` constraint survive incremental inserts?** Rebuild deletes everything first. An incremental path inserting concurrently with rebuild (both guarded by the `rebuilding` flag, `duckdb/index.ts:346`, `:648`, `:845`) needs a defined ordering for `replay_sequence` allocation — the control DB is the sequence authority (`foldProjectedCheckpoints` uses `Math.max` over `event.replaySequence`, `:1162`).

6. **Which component owns the `profile-activity` / `replay-receipt` retention boundaries today?** `evidence.drizzle-duckdb.ts:75-89` reads `TRetentionEffectiveCutoff` for all three axes, but `service.ts:194` only demands `event-occurrence`. Is that intentional scope reduction, or unfinished work?

7. **Is `evidence.projection.checkpoint.projectionGeneration` nullable in practice?** `ReportAdmissionTicket.projectionGeneration` is typed `number | null` (`types.ts:192`), but `resolveStatistics` only returns non-null cardinality when the checkpoint exists, and `#readFacts` guarantees a checkpoint by then (the `checkpoint === null` path never reaches the ticket because `requireAlignedStatistics` rejects first). The `| null` may be dead.