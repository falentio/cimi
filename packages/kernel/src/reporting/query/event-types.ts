import type { InstantMs, ResolvedPeriod, SiteId } from '../types.ts'
import type { EventKind, ReportFilterPlan } from './types.ts'

export interface EventOverviewQuery {
  readonly siteId: SiteId
  readonly period: ResolvedPeriod
  readonly eventKind: EventKind
  readonly filterPlan: ReportFilterPlan
}

export interface EventOverviewFacts {
  readonly total: number
  readonly uniqueVisitors: number
  readonly uniqueSessions: number
}

export interface EventBucketsQuery {
  readonly siteId: SiteId
  readonly period: ResolvedPeriod
  readonly eventKind: EventKind
  readonly filterPlan: ReportFilterPlan
}

export interface EventBucketFacts {
  readonly at: InstantMs
  readonly count: number
}

export interface EventRowsQuery {
  readonly siteId: SiteId
  readonly period: ResolvedPeriod
  readonly eventKind: EventKind
  readonly filterPlan: ReportFilterPlan
  readonly direction: 'asc' | 'desc'
  readonly offset: number
  readonly limit: number
}

export interface EventRowFacts {
  readonly eventId: string
  readonly kind: EventKind
  readonly occurredAt: InstantMs
  readonly createdAt: InstantMs
  readonly pagePath: string | null
  readonly referrer: string | null
  readonly name: string | null
  readonly destination: string | null
  readonly value: number | null
  readonly unit: string | null
  readonly code: string | null
  readonly message: string | null
  readonly properties: Readonly<Record<string, string | number | boolean | null>> | null
}

export interface EventRowsResult {
  readonly rows: readonly EventRowFacts[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly nextOffset: number | null
}

export type EventBreakdownField =
  | 'kind'
  | 'name'
  | 'pagePath'
  | 'referrer'
  | 'destination'
  | 'unit'
  | 'code'

export interface EventBreakdownQuery {
  readonly siteId: SiteId
  readonly period: ResolvedPeriod
  readonly eventKind: EventKind
  readonly field: EventBreakdownField
  readonly sort: 'value' | 'count'
  readonly direction: 'asc' | 'desc'
  readonly offset: number
  readonly limit: number
  readonly filterPlan: ReportFilterPlan
}

export interface EventBreakdownRowFacts {
  readonly value: string
  readonly count: number
}

export interface EventBreakdownResult {
  readonly rows: readonly EventBreakdownRowFacts[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly nextOffset: number | null
}
