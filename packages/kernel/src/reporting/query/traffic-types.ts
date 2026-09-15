import type { InstantMs, ResolvedPeriod, SiteId } from '../types.ts'
import type { ReportFilterPlan } from './types.ts'

export interface TrafficAggregateQuery {
  readonly siteId: SiteId
  readonly period: ResolvedPeriod
  readonly includeTrend: boolean
  readonly filterPlan: ReportFilterPlan
}

/**
 * Counts and sums, not rates: the mapper owns every division so a rate formula exists once.
 */
export interface TrafficMetricsFacts {
  readonly visitors: number
  readonly sessions: number
  readonly pageviews: number
  readonly eligibleSessions: number
  readonly sessionsWithValidDuration: number
  readonly bouncedSessions: number
  readonly totalSessionDurationMs: number
}

export interface TrafficTrendBucket {
  readonly at: InstantMs
  readonly visitors: number
}

export interface TrafficAggregateResult {
  readonly metrics: TrafficMetricsFacts
  readonly trend: readonly TrafficTrendBucket[]
}

export type TrafficBreakdownDimension =
  | 'page'
  | 'entry_page'
  | 'exit_page'
  | 'referrer'
  | 'utm'
  | 'device'
  | 'browser'
  | 'os'
  | 'country'
  | 'region'
  | 'city'

export type BreakdownSort = 'value' | 'count' | 'percentage'

export interface TrafficBreakdownQuery {
  readonly siteId: SiteId
  readonly period: ResolvedPeriod
  readonly dimension: TrafficBreakdownDimension
  readonly sort: BreakdownSort
  readonly direction: 'asc' | 'desc'
  readonly offset: number
  readonly limit: number
  readonly filterPlan: ReportFilterPlan
}

export interface TrafficBreakdownRowFacts {
  readonly value: string
  readonly count: number
}

/**
 * `denominator` is the count of distinct Sessions in the filtered window (the population each
 * dimension partitions), while `totalCount` is the number of distinct dimension values in the
 * pre-pagination grouped set. The two differ because a page breakdown counts a Session once per
 * distinct page it saw, so the sum of rows can exceed the denominator; `percentage` is per-row
 * count over the session denominator, not over `totalCount`.
 */
export interface TrafficBreakdownResult {
  readonly rows: readonly TrafficBreakdownRowFacts[]
  readonly totalCount: number
  readonly denominator: number
  readonly hasMore: boolean
  readonly nextOffset: number | null
}
