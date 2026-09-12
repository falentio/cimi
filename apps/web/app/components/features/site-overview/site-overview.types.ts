import { Home01Icon } from '@hugeicons/core-free-icons'

export type OverviewIcon = typeof Home01Icon

export type OverviewRange = '7d' | '30d' | '90d' | '12m'

export interface OverviewRangeOption {
  readonly value: OverviewRange
  readonly label: string
}

export type ChangeKind = 'positive' | 'negative' | 'neutral'

export type OverviewMetricUnit = 'count' | 'percent' | 'duration'

/** Whether a larger value is an improvement (bounce/exit rates are inverted). */
export type OverviewMetricPolarity = 'higher-is-better' | 'lower-is-better'

export interface OverviewMetric {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly change: string
  readonly changeKind: ChangeKind
  readonly comparison: string
  readonly icon: OverviewIcon
  readonly sparkline: readonly number[]
  readonly unit: OverviewMetricUnit
  readonly polarity: OverviewMetricPolarity
  readonly trends: Readonly<Record<OverviewRange, OverviewTrendSeries>>
}

export type OverviewMetricId = OverviewMetric['id']

export interface RankingRow {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly share: number
}

export type BreakdownTabId =
  | 'pages'
  | 'titles'
  | 'referrers'
  | 'channels'
  | 'countries'
  | 'regions'
  | 'devices'
  | 'browsers'

export interface BreakdownTab {
  readonly id: BreakdownTabId
  readonly label: string
}

export type BreakdownId = 'pages' | 'referrers' | 'countries' | 'devices'

export interface BreakdownSection {
  readonly id: BreakdownId
  readonly title: string
  readonly subtitle: string
  readonly icon: OverviewIcon
  readonly tabs: readonly BreakdownTab[]
  readonly activeTab: BreakdownTabId
  readonly rows: Readonly<Partial<Record<BreakdownTabId, readonly RankingRow[]>>>
}

export type VisibleBreakdownSection = Omit<BreakdownSection, 'rows'> & {
  readonly rows: readonly RankingRow[]
}

export interface OverviewTrendSeries {
  readonly current: readonly number[]
  readonly previous: readonly number[]
  readonly currentTailIndex: number
}

export interface OverviewTrend extends OverviewTrendSeries {
  readonly labels: readonly string[]
  readonly dates: readonly string[]
}

export interface OverviewFixture {
  readonly metrics: readonly OverviewMetric[]
  readonly rangeLabels: Readonly<Record<OverviewRange, readonly string[]>>
  readonly rangeDates: Readonly<Record<OverviewRange, readonly string[]>>
  readonly defaultMetricId: OverviewMetricId
  readonly breakdowns: readonly BreakdownSection[]
}
