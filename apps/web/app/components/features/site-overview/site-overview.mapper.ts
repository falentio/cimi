import { resolveOverviewChange } from './site-overview-chart-change'
import {
  overviewBreakdownSections,
  overviewBreakdownTabViews,
  type OverviewBreakdownSectionDescriptor,
  type OverviewBreakdownTabDescriptor,
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
  tab: OverviewBreakdownTabDescriptor,
  page: TrafficBreakdownPage,
): readonly OverviewBreakdownRowView[] {
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
  tab: OverviewBreakdownTabDescriptor | undefined,
  page: TrafficBreakdownPage | undefined,
  pageLimit: number | undefined,
): OverviewBreakdownSectionView {
  return {
    id: section.id,
    title: section.title,
    subtitle: section.subtitle,
    icon: section.icon,
    tabs: overviewBreakdownTabViews(section),
    activeTab: tab?.id ?? '',
    rows: tab === undefined || page === undefined ? [] : toBreakdownRows(tab, page),
    hasMore: canLoadMore(page, pageLimit),
    totalCount: page?.totalCount ?? 0,
    status: page?.status ?? 'current',
  }
}

/**
 * A section offers more rows only when the server says so and the page can still grow. At the
 * contract's 100-row ceiling the button would be inert, so it is not offered.
 */
function canLoadMore(
  page: TrafficBreakdownPage | undefined,
  pageLimit: number | undefined,
): boolean {
  if (page === undefined || !page.hasMore) return false

  return pageLimit === undefined || pageLimit < MAX_BREAKDOWN_PAGE
}

function toFreshness(period: TrafficOverviewPeriod): OverviewFreshnessView {
  return {
    status: period.status,
    coverageThrough: period.occurrenceTimeCoverageThrough,
  }
}

/** The contract caps a breakdown page at 100 rows and a request at the same ceiling. */
const MAX_BREAKDOWN_PAGE = 100

export interface OverviewMappingInput {
  readonly range: OverviewRange
  readonly granularity: SiteTrafficView['granularity']
  readonly overview: TrafficOverviewPeriod
  readonly comparison: TrafficOverviewPeriod | null
  /** Keyed by `<sectionId>:<tabId>`, one page per visible breakdown card. */
  readonly breakdowns: ReadonlyMap<string, TrafficBreakdownPage>
  readonly activeTabs: Readonly<Record<string, string>>
  /** Per-section page size, keyed by section id. */
  readonly pageLimits: Readonly<Record<string, number>>
}

function hasTraffic(period: TrafficOverviewPeriod): boolean {
  return period.visitors > 0 || period.sessions > 0 || period.pageviews > 0
}

export function toSiteTrafficView(input: OverviewMappingInput): SiteTrafficView {
  return {
    hasTraffic: hasTraffic(input.overview),
    range: input.range,
    granularity: input.granularity,
    metrics: toOverviewMetrics(input.overview, input.comparison),
    trend: toOverviewTrend(input.overview, input.comparison),
    breakdowns: overviewBreakdownSections.map((section) => {
      const tabId = input.activeTabs[section.id] ?? section.tabs[0]?.id
      const tab = section.tabs.find((candidate) => candidate.id === tabId)

      return toBreakdownSection(
        section,
        tab,
        input.breakdowns.get(section.id + ':' + tabId),
        input.pageLimits[section.id],
      )
    }),
    freshness: toFreshness(input.overview),
  }
}
