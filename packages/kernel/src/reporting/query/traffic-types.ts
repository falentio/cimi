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
