import { resolveOverviewChange } from './site-overview-chart-change'
import {
  overviewBreakdownSections,
  overviewBreakdownTabViews,
  type OverviewBreakdownSectionDescriptor,
} from './site-overview-breakdowns'
import {
  findOverviewMetric,
  overviewMetricFormatters,
  overviewMetrics,
} from './site-overview.metrics'
import type {
  OverviewBreakdownRowView,
  OverviewBreakdownSectionView,
  OverviewFreshnessView,
  OverviewMetricId,
  OverviewMetricView,
  OverviewRange,
  OverviewTrendPointDate,
  OverviewTrendView,
  SiteTrafficView,
  TrafficBreakdownPage,
  TrafficOverviewPeriod,
} from './site-overview.types'

const dayMonthFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

const COMPARISON_LABEL = 'vs previous period'

/** Formats a bucket instant as a Site-local calendar label, e.g. `12 May`. */
export function formatOverviewBucketLabel(at: string): string {
  const date = new Date(at)

  return Number.isNaN(date.getTime()) ? '' : dayMonthFormatter.format(date)
}

/** Index of the last complete bucket, or -1 when the contract marks every bucket incomplete. */
function latestCompleteIndex(complete: readonly boolean[]): number {
  let index = -1

  for (const [position, isComplete] of complete.entries()) {
    if (isComplete) index = position
  }

  return index
}

function toTrendDates(
  current: readonly { at: string }[],
  previous: readonly { at: string }[],
): readonly OverviewTrendPointDate[] {
  return current.map((point, index) => ({
    current: formatOverviewBucketLabel(point.at),
    previous: formatOverviewBucketLabel(previous[index]?.at ?? point.at),
  }))
}

/**
 * Visitors is the only metric the contract trends, so the chart plots that one series while the
 * cards read the period totals. Nothing here adds a non-additive value across buckets.
 */
export function toOverviewTrend(
  current: TrafficOverviewPeriod,
  comparison: TrafficOverviewPeriod | null,
): OverviewTrendView {
  const currentTrend = current.trend
  const previousTrend = comparison?.trend ?? []

  return {
    labels: currentTrend.map((point) => formatOverviewBucketLabel(point.at)),
    dates: toTrendDates(currentTrend, previousTrend),
    current: currentTrend.map((point) => point.value),
    previous: previousTrend.map((point) => point.value),
    currentTailIndex: latestCompleteIndex(currentTrend.map((point) => point.complete)),
  }
}

function toMetricView(
  metricId: OverviewMetricId,
  current: TrafficOverviewPeriod,
  comparison: TrafficOverviewPeriod | null,
): OverviewMetricView {
  const descriptor = findOverviewMetric(metricId)

  if (descriptor === undefined) {
    throw new Error('Traffic metric ' + metricId + ' is missing from the metric registry')
  }

  const value = descriptor.value(current)
  const format = overviewMetricFormatters[descriptor.unit]
  const denominator = descriptor.denominator(current)

  const change =
    comparison === null
      ? null
      : resolveOverviewChange(value, descriptor.value(comparison), descriptor.polarity)

  return {
    id: descriptor.id,
    label: descriptor.label,
    value: format(value),
    comparison: comparison === null ? '' : COMPARISON_LABEL,
    changeKind: change?.kind ?? 'neutral',
    change: change?.label ?? null,
    denominatorLabel:
      denominator === null || descriptor.denominatorLabel === null
        ? null
        : denominator.toLocaleString() + ' ' + descriptor.denominatorLabel,
    icon: descriptor.icon,
  }
}

export function toOverviewMetrics(
  current: TrafficOverviewPeriod,
  comparison: TrafficOverviewPeriod | null,
): readonly OverviewMetricView[] {
  return overviewMetrics.map((metric) => toMetricView(metric.id, current, comparison))
}

function toBreakdownRows(
  tabId: string,
  page: TrafficBreakdownPage,
): readonly OverviewBreakdownRowView[] {
  const tab = overviewBreakdownSections
    .flatMap((section) => section.tabs)
    .find((candidate) => candidate.id === tabId)

  if (tab === undefined) return []

  return page.items.map((item) => ({
    id: tab.dimension + ':' + item.value,
    label: item.value,
    value: item.count.toLocaleString(),
    share: Math.round(item.percentage * 1000) / 10,
    filter: tab.rowFilter(item.value),
  }))
}

function toBreakdownSection(
  section: OverviewBreakdownSectionDescriptor,
  tabId: string,
  page: TrafficBreakdownPage | undefined,
): OverviewBreakdownSectionView {
  return {
    id: section.id,
    title: section.title,
    subtitle: section.subtitle,
    icon: section.icon,
    tabs: overviewBreakdownTabViews(section),
    activeTab: tabId,
    rows: page === undefined ? [] : toBreakdownRows(tabId, page),
    hasMore: page?.hasMore ?? false,
    totalCount: page?.totalCount ?? 0,
  }
}

function toFreshness(period: TrafficOverviewPeriod): OverviewFreshnessView {
  return {
    status: period.status,
    coverageThrough: period.occurrenceTimeCoverageThrough,
  }
}

export interface OverviewMappingInput {
  readonly range: OverviewRange
  readonly granularity: SiteTrafficView['granularity']
  readonly overview: TrafficOverviewPeriod
  readonly comparison: TrafficOverviewPeriod | null
  /** Keyed by `<sectionId>:<tabId>`, one page per visible breakdown card. */
  readonly breakdowns: ReadonlyMap<string, TrafficBreakdownPage>
  readonly activeTabs: Readonly<Record<string, string>>
}

/** Assembles one render-ready view. Pure, so the acceptance rules are testable without a DOM. */
export function toSiteTrafficView(input: OverviewMappingInput): SiteTrafficView {
  return {
    range: input.range,
    granularity: input.granularity,
    metrics: toOverviewMetrics(input.overview, input.comparison),
    trend: toOverviewTrend(input.overview, input.comparison),
    breakdowns: overviewBreakdownSections.map((section) =>
      toBreakdownSection(
        section,
        input.activeTabs[section.id] ?? section.tabs[0]?.id ?? '',
        input.breakdowns.get(
          section.id + ':' + (input.activeTabs[section.id] ?? section.tabs[0]?.id),
        ),
      ),
    ),
    freshness: toFreshness(input.overview),
  }
}
