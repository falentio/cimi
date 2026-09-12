# D-02 synthesized design (base: candidate 1)

Arena result: base candidate 1 (`ReportingQueryPort` in kernel + DuckDB adapter in `packages/db`),
score 29 vs 26 (candidate 2) vs 20 (candidate 3). Grafts from candidates 2 and 3 folded in.
Cross-judge corrections verified against source. Shared blind spots resolved below.

## Verified constraints (re-grepped, do not trust earlier summaries)

1. `profileFilterKeys` is real but lives ONLY in the collection policy
   (`packages/kernel/src/ports.ts:94` `CollectionPolicyResolver.effective(siteId): CollectionPolicy`,
   a loose `Record<string, unknown>` carrying `profileFilterKeys: string[]`).
   Reporting has no port for it today. The reporting profile-filter gate must resolve the site's
   effective collection policy and read `profileFilterKeys` from it. A `trait.*` filter whose key is
   not in that list is rejected `BAD_REQUEST` (spec: profile filters limited to approved trait keys).
2. Traffic and event use DIFFERENT filter unions:
   - traffic: `SScopedQueryFilter` (packages/contract/src/schema/index.ts:216) — scopes
     `event|session|visitor|profile`; event fields `kind,name,pagePath,referrer,destination,unit,
     code`; session fields `device,browser,os,country,region,city,entryPage,exitPage,utmSource,
     utmMedium,utmCampaign`; visitor `identityKind`; profile `trait.<k>`. Plus `has_done/has_not_done`
     visitor-scope action presence (schema/index.ts:209 `SHasDoneFilter`).
   - event: `SEventReportFilter` (packages/contract/src/contract/event-report/schema.ts:104) — scopes
     `event|session`; event fields `kind,name,pagePath,referrer,destination,unit,code` + `property.*`;
     session `has_done/has_not_done` with discriminated action + `range: same_range`.
   The compiler must accept BOTH. Two entry functions, one shared `Predicate` output.
3. `region`/`city` are written as literal `null` by rebuild (packages/db/src/duckdb/index.ts:377-378)
   although the traffic breakdown contract exposes them (traffic schema.ts:178-179). Decision:
   serve them; the group-by yields no non-null rows, so the breakdown returns empty for those
   dimensions rather than erroring. Document it; do not fake data.
4. `events.bot_policy_outcome` exists (packages/db/src/duckdb/schema.ts:136, default 'included').
   Bounce eligibility uses accepted events only; the projection already stores only accepted facts.
5. Times cross as `epoch_ms(col)` -> Date -> branded `InstantMs` (duckdb/index.ts:1075 readInstant).
   `SReportFreshness.occurrenceTimeCoverageThrough` is a `SDateTime` string, not `InstantMs`. The
   completeness check parses it at the mapper boundary (`Date.parse`), it does not compare raw numbers.

## Shared blind spot fixed: the bounce predicate

`bounce_rate = bouncedSessions / eligibleSessions` (METRICS.md:45).
- `bouncedSessions` = Sessions whose accepted events are: exactly one `page_view`, zero `custom_event`,
  zero `outbound`, and whose full occurrence span (`max(occurrence) - min(occurrence)` over ALL its
  accepted events) is `< 10` seconds. `identify` events do not count as engagement (they neither add
  a page_view nor break the single-page-view rule).
- `eligibleSessions` = Sessions intersecting the range with at least one accepted `page_view`
  (denominator for `bounce_rate`, `pages_per_session`).
- `sessionsWithValidDuration` = Sessions with a valid full occurrence span (>= 2 events).
- `average_session_duration_seconds` = sum(span) over sessionsWithValidDuration / sessionsWithValidDuration.

These are computed in SQL over `analytics_sessions` joined to `events` counts, not in the shell.

## Layer map (final)

```
packages/kernel/src/reporting/query/
  types.ts               pure domain request/result types (no db/contract/valibot)
  ports.ts               ReportingQueryPort (4 methods)
  compile-filter.ts      pure: report filters -> ReportFilterPlan (Predicate[]); profile gating
  bucket-fill.ts         pure: bucketStarts + sparse rows -> zero-filled, sets `complete`
  index.ts               barrel
packages/kernel/src/reporting/ports.ts   add ReportingProfileFilterPort { getProfileFilterKeys(siteId) }

packages/db/src/duckdb/
  index.ts               + AnalyticsDb.readWindowed(work) / AnalyticsWindowReader
  reporting-query.ts     DuckDbReportingQuery implements ReportingQueryPort; owns ALL SQL
packages/db/src/index.ts export { DuckDbReportingQuery }

apps/api/src/resources/traffic-report/
  service.ts             consume port; map facts -> contract; real metrics now
  reporting-profile-filter.ts   ReportingProfileFilterPort from collection policy resolver
apps/api/src/resources/event-report/   NEW, mirrors traffic-report
  service.ts router.ts index.ts errors.ts
apps/api/src/orpc.ts     add eventReport: contract.eventReport
apps/api/src/index.ts    register eventReport router (analytics-read gate already covers it)
```

## The seam

```ts
export interface ReportingQueryPort {
  trafficAggregate(q: TrafficAggregateQuery): PortResult<TrafficAggregateResult>
  eventOverview(q: EventOverviewQuery): PortResult<EventOverviewResult>
  eventBuckets(q: EventBucketsQuery): PortResult<EventBucketsResult>
  eventRows(q: EventRowsQuery): PortResult<EventRowsResult>
}
```

Each query carries the whole `ResolvedPeriod` (instants + bucketStarts), a `ReportFilterPlan`, and
the granularity/dimension/order/page. Results are pure domain structs (branded ids, `InstantMs`,
already-clamped strings). No Date, no DuckDB row, no ORPCError crosses back.

`ReportFilterPlan` shape (graft of C1 + C3 non-optional tiebreak discipline):

```ts
export interface ReportFilterPlan {
  readonly event: readonly Predicate[]
  readonly session: readonly Predicate[]
  readonly visitor: readonly Predicate[]
  readonly sessionPresence: readonly PresencePredicate[]
  readonly requiresProfileJoin: boolean
  readonly distinctOperations: number
}
export interface Predicate {
  readonly target: ColumnRef                 // allowlisted column or json property key
  readonly operator: 'eq'|'neq'|'contains'|'gt'|'lt'
  readonly bind: readonly (string|number|boolean|null)[]
}
```

Graft from C2: the port returns **facts, not derived rates**, for traffic overview
(`bouncedSessions`, `totalSessionDurationMs`, `eligibleSessions`, `sessionsWithValidDuration`,
counts); the pure mapper divides. Keeps the rate formula in one place.

Graft from C3: every paginated query carries a **non-optional tie-break** so deterministic paging
cannot be omitted; and each trend `MetricPointRow` carries `{ value, denominator }` matching the
contract `SMetricPoint` variant denominator requirement.

## Implementation phases (each a verifiable unit)

1. `compile-filter.ts` + `ReportingProfileFilterPort` + tests. Pure, DB-free. RED first.
2. `bucket-fill.ts` + tests. Pure, DB-free.
3. `AnalyticsDb.readWindowed` + adapter plumbing + a test against in-memory DuckDB.
4. `DuckDbReportingQuery.trafficAggregate` (overview metrics + trend) end to end; wire
   `traffic-report` service to the port; sociable HTTP test with seeded DuckDB.
5. `trafficAggregate` breakdown leg (dimension, sort, tie-break, offset, percentage/denominator).
6. `eventOverview` + `eventBuckets`; create `event-report` resource; register router.
7. `eventRows` (listEvents) with distinct-eventId totalCount + occurrence ordering; `getEventBreakdowns`.
8. Wire collection-policy-based profile gate; deleted-profile exclusion check.
9. Full verify: narrow unit + sociable HTTP per resource; `vp check`; no regressions in
   traffic-report existing tests.
