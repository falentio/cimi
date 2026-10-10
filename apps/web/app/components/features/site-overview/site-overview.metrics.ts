import {
  Activity01Icon,
  Analytics01Icon,
  Chart01Icon,
  File01Icon,
  UserGroupIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import type {
  OverviewIcon,
  OverviewMetricId,
  OverviewMetricUnit,
  OverviewMetricPolarity,
  TrafficOverviewPeriod,
} from './site-overview.types'

export interface OverviewMetricDescriptor {
  readonly id: OverviewMetricId
  readonly label: string
  readonly icon: OverviewIcon
  readonly unit: OverviewMetricUnit
  readonly polarity: OverviewMetricPolarity
  readonly value: (period: TrafficOverviewPeriod) => number
  readonly denominator: (period: TrafficOverviewPeriod) => number | null
  /** What the denominator counts, shown beside a rate so the user can read it. */
  readonly denominatorLabel: string | null
}

function formatCount(value: number): string {
  return value.toLocaleString()
}

function formatPercent(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function formatRatio(value: number): string {
  return value.toFixed(2)
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)

  return minutes === 0 ? rest + 's' : minutes + 'm ' + rest + 's'
}

export const overviewMetricFormatters: Readonly<
  Record<OverviewMetricUnit, (value: number) => string>
> = {
  count: formatCount,
  percent: formatPercent,
  ratio: formatRatio,
  seconds: formatDuration,
}

/** One row per metric the contract's overview period carries. */
export const overviewMetrics: readonly OverviewMetricDescriptor[] = [
  {
    id: 'visitors',
    label: 'Visitors',
    icon: UserGroupIcon,
    unit: 'count',
    polarity: 'higher-is-better',
    value: (period) => period.visitors,
    denominator: () => null,
    denominatorLabel: null,
  },
  {
    id: 'pageviews',
    label: 'Pageviews',
    icon: ViewIcon,
    unit: 'count',
    polarity: 'higher-is-better',
    value: (period) => period.pageviews,
    denominator: () => null,
    denominatorLabel: null,
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: Activity01Icon,
    unit: 'count',
    polarity: 'higher-is-better',
    value: (period) => period.sessions,
    denominator: () => null,
    denominatorLabel: null,
  },
  {
    id: 'bounce_rate',
    label: 'Bounce rate',
    icon: Analytics01Icon,
    unit: 'percent',
    polarity: 'lower-is-better',
    value: (period) => period.bounceRate,
    denominator: (period) => period.eligibleSessions,
    denominatorLabel: 'eligible sessions',
  },
  {
    id: 'pages_per_session',
    label: 'Pages per session',
    icon: File01Icon,
    unit: 'ratio',
    polarity: 'higher-is-better',
    value: (period) => period.pagesPerSession,
    denominator: (period) => period.sessions,
    denominatorLabel: 'sessions',
  },
  {
    id: 'average_session_duration_seconds',
    label: 'Avg. visit',
    icon: Chart01Icon,
    unit: 'seconds',
    polarity: 'higher-is-better',
    value: (period) => period.averageSessionDurationSeconds,
    denominator: (period) => period.sessionsWithValidDuration,
    denominatorLabel: 'sessions with a duration',
  },
]

export function findOverviewMetric(id: OverviewMetricId): OverviewMetricDescriptor | undefined {
  return overviewMetrics.find((metric) => metric.id === id)
}
