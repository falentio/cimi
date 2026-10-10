# Issue #86: Site traffic overview data wiring

Design record. Status: accepted.

## The decision

The stub page supplies layout and component style only. The contract in
`packages/contract` is the single source of truth. Views the contract cannot
supply are dropped, not faked.

## Dropped views

| View | Why |
| --- | --- |
| Exit-rate metric card | `STrafficMetric` has no exit-rate metric |
| Per-metric time series | `service.ts` sets `TREND_METRIC = 'visitors'`; the trend array carries visitors only |
| Metric selector on the chart | Same reason. Nothing to switch to |
| Per-metric sparklines | Same reason. Only visitors has bucket values |
| Page-title breakdown tab | `STrafficBreakdownFields.dimension` has no page-title dimension |
| Channel breakdown tab | No channel dimension. `utm` exists but is not a channel grouping |
| Custom date-range input | Range is a fixed allowlist of four options, each mapping to one granularity |
| Client-side previous-period date math | The contract resolves and returns the comparison period itself |
| `greater_than` / `less_than` filter operators | `isCompatibleSessionFilter` and `isCompatibleDirectEventFilter` reject them for every scope this page offers |

## Data shape

```ts
interface SiteTrafficView {
  readonly range: OverviewRange
  readonly granularity: TrafficGranularity
  readonly metrics: readonly OverviewMetricView[]
  readonly trend: OverviewTrendView
  readonly breakdowns: readonly BreakdownSectionView[]
  readonly freshness: FreshnessView
}

interface OverviewMetricView {
  readonly id: OverviewMetricId
  readonly label: string
  readonly value: string
  readonly unit: OverviewMetricUnit
  readonly polarity: OverviewMetricPolarity
  readonly change: OverviewChange | null
  readonly comparison: string
  readonly denominatorLabel: string | null
  readonly icon: OverviewIcon
}
```

## Organizing structure

Two const registries, one pure mapper, one composable.

```
site-traffic/
├── site-overview.types.ts        view types and the two id unions
├── site-overview.range.ts        range -> {fromDate, toDate, granularity, comparison}
├── site-overview.metrics.ts      metric descriptor registry
├── site-overview-breakdowns.ts   breakdown card/tab registry and row filter builders
├── site-overview.mapper.ts       contract output -> SiteTrafficView
└── useSiteTraffic.ts             fetch, gate on session and site, expose load state
```

### Why a registry over branches

Each metric differs only in five facts: its label, icon, polarity, unit, and which
contract field holds its value and denominator. Encoding those facts as an array of
descriptors puts every contract field name in one place. A future metric is one row.
The alternative, an `if (id === 'visitors')` ladder, repeats the same shape assumption
in the value picker, the denominator picker, and the formatter.

The same argument holds for breakdown cards: each card differs only in its title,
icon, and which contract dimension its tabs read. `rowFilter` on each tab is the only
place a dimension maps to a filter scope and field.

### Why the mapper is separate from the composable

The mapper is pure: contract output in, view model out. It is testable without
mounting a component, and it is where the acceptance rules live, such as
`bounceRate` being a 0..1 rate that renders as a percentage, and the incomplete
bucket marking. The composable owns only fetching, query keys, and error mapping.

## Files

New:

- `site-overview.range.ts`
- `site-overview.metrics.ts`
- `site-overview-breakdowns.ts`
- `site-overview.mapper.ts`
- `useSiteTraffic.ts`
- one test file per new module

Changed:

- `site-overview.types.ts`, reshaped
- `SiteOverview.vue`, fixtures and the metric query param removed
- `MetricGrid.vue`, selection and sparkline removed
- `OverviewChart.vue`, takes a label, unit, polarity, and trend instead of a metric
- `BreakdownGrid.vue`, accepts paginated rows and a load-more affordance
- `OverviewFilterBar.vue` and `OverviewFilterEditor.vue`, per-dimension operator lists
- `site-overview-filters.ts`, per-dimension operator options
- `site-overview-chart-dates.ts`, reduced to bucket label formatting
- `pages/sites/[siteId]/index.vue`, parses `siteId` and passes it down

Deleted:

- `site-overview-chart-dates.test.ts` assertions about previous-period offsets, since
  the contract now supplies the comparison period

## Comparison period

Requested in the same call as `comparison: { fromDate, toDate }`, derived once in
`site-overview.range.ts`. `isValidReportRange` requires it to be equal length and
immediately adjacent, so the derivation is a single function with those two invariants
asserted in its test.

## Verification plan

1. Unit tests for the range resolver, the mapper, and the composable.
2. `vp test` scoped to `apps/web/app/components/features/site-overview`.
3. `vp check --fix` on the changed files.
4. Dev server smoke test on `/sites/<siteId>` against real contract responses.

