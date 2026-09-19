import {
  MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS,
  MAX_PUBLIC_DASHBOARD_INTERVAL_STARTS,
  REPORT_FACT_WORK_BUDGETS,
} from '@cimi/contract'
import { ORPCError } from '@orpc/server'
import {
  ReportingAdmissionError,
  ReportingAdmissionService,
  createCalendarDate,
  createSiteId,
  type PublicDashboardAggregateQuery,
  type PublicDashboardAggregateRow,
  type PublicDashboardQueryPort,
  type ReportAdmissionTicket,
} from '@cimi/kernel'
import { toOrpcReportingError } from '../../errors.ts'

export interface PublicDashboardAggregateRequest {
  readonly siteId: string
  readonly fromDate: string
  readonly toDate: string
  readonly metric: PublicDashboardAggregateQuery['metric']
  readonly dimension: PublicDashboardAggregateQuery['dimension']
  readonly filterPlan: PublicDashboardAggregateQuery['filterPlan']
  readonly filterCount: number
}

export interface PublicDashboardAggregatePreparation {
  readonly request: PublicDashboardAggregateRequest
  readonly query: PublicDashboardAggregateQuery
  readonly ticket: ReportAdmissionTicket
  readonly totalDistinctVisitors: number
}

export type PublicDashboardAggregateBucket =
  | {
      readonly key: string
      readonly at: string
      readonly value: number | null
    }
  | {
      readonly key: string
      readonly at: null
      readonly value: number | null
    }

export interface PublicDashboardAggregateResult {
  readonly fromDate: string
  readonly toDate: string
  readonly buckets: readonly PublicDashboardAggregateBucket[]
  readonly projectedAcceptanceSequence: number
  readonly occurrenceTimeCoverageThrough: string | null
  readonly status: ReportAdmissionTicket['freshness']['current']['status']
}

export interface PublicDashboardAggregatePlannerDependencies {
  readonly admission: PublicDashboardAdmission
  readonly query: PublicDashboardQueryPort
}

export type PublicDashboardAdmission = Pick<ReportingAdmissionService, 'admit'>

const METRIC_DISTINCT_COUNT_OPERATIONS = {
  visitors: 1,
  sessions: 1,
  pageviews: 0,
  events: 0,
  bounce_rate: 2,
} as const satisfies Readonly<Record<PublicDashboardAggregateQuery['metric'], number>>

const SUPPRESSION_DISTINCT_COUNT_OPERATIONS = 2

export class PublicDashboardAggregatePlanner {
  constructor(private readonly deps: PublicDashboardAggregatePlannerDependencies) {}

  async preflight(
    request: PublicDashboardAggregateRequest,
  ): Promise<PublicDashboardAggregatePreparation> {
    const siteId = createSiteId(request.siteId)
    const current = {
      fromDate: createCalendarDate(request.fromDate),
      toDate: createCalendarDate(request.toDate),
    }

    let ticket: ReportAdmissionTicket
    try {
      ticket = await this.deps.admission.admit({
        siteId,
        current,
        bucket: { granularity: 'hour', maxStarts: MAX_PUBLIC_DASHBOARD_INTERVAL_STARTS },
        coverage: ['event-occurrence'],
        work: {
          extraMetricCount: request.dimension === 'time' ? 0 : 1,
          dimensionCount: request.dimension === 'time' ? 0 : 1,
          filterCount: request.filterCount,
          distinctCountOperations:
            METRIC_DISTINCT_COUNT_OPERATIONS[request.metric] +
            SUPPRESSION_DISTINCT_COUNT_OPERATIONS,
          budget: REPORT_FACT_WORK_BUDGETS.aggregate,
        },
      })
    } catch (error) {
      throw toPublicAdmissionError(error)
    }

    const query: PublicDashboardAggregateQuery = {
      siteId,
      period: ticket.periods.current,
      metric: request.metric,
      dimension: request.dimension,
      filterPlan: request.filterPlan,
    }

    if (request.dimension !== 'time') {
      try {
        const dimensionValueCount = await this.deps.query.countDimensionValues(query)
        if (dimensionValueCount > MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS) {
          throw new ORPCError('QUERY_LIMIT_EXCEEDED', { status: 422 })
        }
      } catch (error) {
        throw toOrpcReportingError(error)
      }
    }

    let totalDistinctVisitors: number
    try {
      totalDistinctVisitors = await this.deps.query.countDistinctVisitors(query)
    } catch (error) {
      throw toOrpcReportingError(error)
    }

    return { request, query, ticket, totalDistinctVisitors }
  }

  async execute(
    prepared: PublicDashboardAggregatePreparation,
  ): Promise<PublicDashboardAggregateResult> {
    if (prepared.totalDistinctVisitors < 5) {
      return {
        fromDate: prepared.request.fromDate,
        toDate: prepared.request.toDate,
        buckets: suppressedBuckets(prepared.query.dimension, prepared.ticket),
        ...freshness(prepared.ticket),
      }
    }

    let rows: readonly PublicDashboardAggregateRow[]
    try {
      rows = await this.deps.query.aggregate(prepared.query)
    } catch (error) {
      throw toOrpcReportingError(error)
    }

    if (prepared.query.dimension !== 'time' && rows.length > MAX_PUBLIC_DASHBOARD_DIMENSION_ROWS) {
      throw new ORPCError('QUERY_LIMIT_EXCEEDED', { status: 422 })
    }

    const buckets =
      prepared.query.dimension === 'time'
        ? timeBuckets(prepared.ticket, rows)
        : dimensionBuckets(rows)

    return {
      fromDate: prepared.request.fromDate,
      toDate: prepared.request.toDate,
      buckets,
      ...freshness(prepared.ticket),
    }
  }
}

function toPublicAdmissionError(error: unknown) {
  if (error instanceof ReportingAdmissionError && error.reason === 'bucket-bound') {
    return new ORPCError('BAD_REQUEST', { status: 400, cause: error })
  }
  return toOrpcReportingError(error)
}

function timeBuckets(
  ticket: ReportAdmissionTicket,
  rows: readonly PublicDashboardAggregateRow[],
): readonly PublicDashboardAggregateBucket[] {
  const byIndex = new Map(rows.map((row) => [Number(row.groupKey), row]))
  return (ticket.periods.current.bucketStarts ?? []).map((start, index) => {
    const row = byIndex.get(index)
    return {
      key: `${start.localLabel}${formatOffset(start.offsetMinutes)}`,
      at: new Date(start.at).toISOString(),
      value: row === undefined || row.distinctVisitors < 5 ? null : row.value,
    }
  })
}

function dimensionBuckets(
  rows: readonly PublicDashboardAggregateRow[],
): readonly PublicDashboardAggregateBucket[] {
  return rows.map((row) => ({
    key: String(row.groupKey),
    at: null,
    value: row.distinctVisitors < 5 ? null : row.value,
  }))
}

function suppressedBuckets(
  dimension: PublicDashboardAggregateQuery['dimension'],
  ticket: ReportAdmissionTicket,
): readonly PublicDashboardAggregateBucket[] {
  if (dimension !== 'time') return []
  return (ticket.periods.current.bucketStarts ?? []).map((start) => ({
    key: `${start.localLabel}${formatOffset(start.offsetMinutes)}`,
    at: new Date(start.at).toISOString(),
    value: null,
  }))
}

function freshness(ticket: ReportAdmissionTicket) {
  const evidence = ticket.freshness.current
  return {
    projectedAcceptanceSequence: evidence.projectedAcceptanceSequence,
    occurrenceTimeCoverageThrough:
      evidence.occurrenceTimeCoverageThrough === null
        ? null
        : new Date(evidence.occurrenceTimeCoverageThrough).toISOString(),
    status: evidence.status,
  } as const
}

function formatOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'Z'
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  const hours = Math.floor(absolute / 60)
  const minutes = absolute % 60
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
