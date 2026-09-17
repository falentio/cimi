import type { ResolvedPeriod, SiteId } from '../types.ts'
import type { ReportFilterPlan } from './types.ts'

export type PublicDashboardMetric = 'visitors' | 'sessions' | 'pageviews' | 'events' | 'bounce_rate'

export type PublicDashboardDimension =
  | 'time'
  | 'page'
  | 'referrer'
  | 'utm'
  | 'device'
  | 'browser'
  | 'os'
  | 'country'
  | 'region'
  | 'city'
  | 'event_name'
  | 'identity_kind'

export interface PublicDashboardAggregateQuery {
  readonly siteId: SiteId
  readonly period: ResolvedPeriod
  readonly metric: PublicDashboardMetric
  readonly dimension: PublicDashboardDimension
  readonly filterPlan: ReportFilterPlan
}

export interface PublicDashboardAggregateRow {
  readonly groupKey: string | number
  readonly value: number
  readonly distinctVisitors: number
}

export interface PublicDashboardQueryPort {
  countDimensionValues(input: PublicDashboardAggregateQuery): Promise<number>
  countDistinctVisitors(input: PublicDashboardAggregateQuery): Promise<number>
  aggregate(input: PublicDashboardAggregateQuery): Promise<readonly PublicDashboardAggregateRow[]>
}
