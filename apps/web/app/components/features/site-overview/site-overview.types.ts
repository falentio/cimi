import { Home01Icon } from '@hugeicons/core-free-icons'
import type { CimiOrpc } from '~/plugins/orpc'

export type OverviewIcon = typeof Home01Icon

export type OverviewRange = '7d' | '30d' | '90d' | '12m'

export interface OverviewRangeOption {
  readonly value: OverviewRange
  readonly label: string
}

export type OverviewRangeGranularity = Parameters<
  CimiOrpc['trafficReport']['getTrafficOverview']['call']
>[0]['granularity']

export type OverviewBreakdownDimension = Parameters<
  CimiOrpc['trafficReport']['getTrafficBreakdowns']['call']
>[0]['dimension']

export type TrafficOverviewPeriod = Omit<
  Awaited<ReturnType<CimiOrpc['trafficReport']['getTrafficOverview']['call']>>,
  'comparison'
>

export type TrafficBreakdownPage = Omit<
  Awaited<ReturnType<CimiOrpc['trafficReport']['getTrafficBreakdowns']['call']>>,
  'comparison'
>

/** Derived from the contract's trend variant. */
export type OverviewMetricId = TrafficOverviewPeriod['trend'][number]['metric']

export type ChangeKind = 'positive' | 'negative' | 'neutral'

export type OverviewMetricUnit = 'count' | 'percent' | 'ratio' | 'seconds'

/** Whether a larger value is an improvement. Bounce rate is inverted. */
export type OverviewMetricPolarity = 'higher-is-better' | 'lower-is-better'

export type OverviewFilterValues = readonly [string, ...string[]]

export type OverviewEventFilterField = 'pagePath' | 'referrer'

export type OverviewSessionFilterField = 'country' | 'region' | 'device' | 'browser'

type OverviewReportFilter = NonNullable<
  Parameters<CimiOrpc['trafficReport']['getTrafficOverview']['call']>[0]['filters']
>[number]

export type OverviewFilterOperator = Exclude<
  OverviewReportFilter['operator'],
  'has_done' | 'has_not_done'
>

export type OverviewFilter =
  | (Omit<
      Extract<OverviewReportFilter, { readonly scope: 'event' }>,
      'field' | 'operator' | 'values'
    > & {
      readonly field: OverviewEventFilterField
      readonly operator: OverviewFilterOperator
      readonly values: OverviewFilterValues
    })
  | (Omit<
      Extract<OverviewReportFilter, { readonly scope: 'session' }>,
      'field' | 'operator' | 'values'
    > & {
      readonly field: OverviewSessionFilterField
      readonly operator: OverviewFilterOperator
      readonly values: OverviewFilterValues
    })

export type OverviewTrendPoint = {
  readonly at: string
  readonly value: number
  readonly complete: boolean
}

export interface OverviewTrendView {
  readonly labels: readonly string[]
  readonly dates: readonly OverviewTrendPointDate[]
  readonly current: readonly number[]
  readonly previous: readonly number[]
  /** Index of the last complete bucket. Everything after it is a projection. */
  readonly currentTailIndex: number
}

export interface OverviewTrendPointDate {
  readonly current: string
  readonly previous: string
}

export interface OverviewMetricView {
  readonly id: OverviewMetricId
  readonly label: string
  readonly value: string
  readonly comparison: string
  readonly changeKind: ChangeKind
  readonly change: string | null
  readonly denominatorLabel: string | null
  readonly icon: OverviewIcon
}

export interface OverviewBreakdownTabView {
  readonly id: string
  readonly label: string
}

export interface OverviewBreakdownRowView {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly share: number
  readonly filter: OverviewFilter
}

export interface OverviewBreakdownSectionView {
  readonly id: string
  /** The breakdown page's own freshness, which can differ from the overview period's. */
  readonly status: 'current' | 'stale'
  readonly title: string
  readonly subtitle: string
  readonly icon: OverviewIcon
  readonly tabs: readonly OverviewBreakdownTabView[]
  readonly activeTab: string
  readonly rows: readonly OverviewBreakdownRowView[]
  readonly hasMore: boolean
  readonly totalCount: number
}

export interface OverviewFreshnessView {
  readonly status: 'current' | 'stale'
  readonly coverageThrough: string | null
}

export interface SiteTrafficView {
  /** True once any of visitors, sessions, or pageviews is non-zero in the range. */
  readonly hasTraffic: boolean
  readonly range: OverviewRange
  readonly granularity: OverviewRangeGranularity
  readonly metrics: readonly OverviewMetricView[]
  readonly trend: OverviewTrendView
  readonly breakdowns: readonly OverviewBreakdownSectionView[]
  readonly freshness: OverviewFreshnessView
}

export type SiteTrafficErrorKind =
  | 'not-found'
  | 'query-limit'
  | 'unavailable'
  | 'bad-request'
  | 'unauthenticated'
  | 'unknown'

export interface SiteTrafficError {
  readonly kind: SiteTrafficErrorKind
  readonly message: string
}

export type SiteTrafficLoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly view: SiteTrafficView }
  | { readonly status: 'error'; readonly error: SiteTrafficError }
