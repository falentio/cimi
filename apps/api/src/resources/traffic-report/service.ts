import type { AuthUser } from '@cimi/auth'
import {
  AUTHENTICATED_REPORT_BUCKET_LIMITS,
  REPORT_FACT_WORK_BUDGETS,
  STrafficBreakdownsOutput,
  STrafficOverviewOutput,
  type STrafficBreakdownsInput,
  type STrafficOverviewInput,
  type TrafficReportFamily,
} from '@cimi/contract'
import { assertSiteScope, type SiteScopeGuardDependencies } from '@cimi/guard'
import { ORPCError } from '@orpc/server'
import {
  ReportingAdmissionService,
  compileTrafficFilterPlan,
  createCalendarDate,
  createSiteId,
  fillBuckets,
  type BreakdownSort,
  type BucketCount,
  type FreshnessEvidence,
  type ReportFilterPlan,
  type ReportingQueryPort,
  type ResolvedPeriod,
  type SiteId,
  type TrafficBreakdownDimension,
  type TrafficMetricsFacts,
} from '@cimi/kernel'
import type * as v from 'valibot'
import { toOrpcReportingError } from './errors.ts'

export type TrafficOverviewInput = v.InferOutput<typeof STrafficOverviewInput>
export type TrafficOverviewOutput = v.InferOutput<typeof STrafficOverviewOutput>
export type TrafficBreakdownsInput = v.InferOutput<typeof STrafficBreakdownsInput>
export type TrafficBreakdownsOutput = v.InferOutput<typeof STrafficBreakdownsOutput>

const DEFAULT_BREAKDOWN_LIMIT = 50

export interface TrafficReportServiceDependencies {
  readonly admission: ReportingAdmissionService
  readonly query: ReportingQueryPort
  readonly profileFilterKeys: readonly string[] | (() => readonly string[])
  readonly scope: SiteScopeGuardDependencies
}

export class TrafficReportService {
  constructor(private readonly deps: TrafficReportServiceDependencies) {}

  async getOverview(
    input: TrafficOverviewInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<TrafficOverviewOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input, 'aggregate')
    const siteId = createSiteId(input.siteId)
    const filterPlan = this.compileFilters(input)

    const current = await this.overviewPeriod(
      siteId,
      ticket.periods.current,
      ticket.freshness.current,
      filterPlan,
    )
    if (ticket.periods.comparison === null || ticket.freshness.comparison === null) {
      return current
    }
    return {
      ...current,
      comparison: await this.overviewPeriod(
        siteId,
        ticket.periods.comparison,
        ticket.freshness.comparison,
        filterPlan,
      ),
    }
  }

  async getBreakdowns(
    input: TrafficBreakdownsInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<TrafficBreakdownsOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input, 'breakdown')
    const siteId = createSiteId(input.siteId)
    const filterPlan = this.compileFilters(input)
    const dimension = input.dimension
    const sort = input.sort ?? 'value'
    const direction = input.direction ?? 'asc'
    const offset = input.offset ?? 0
    const limit = input.limit ?? DEFAULT_BREAKDOWN_LIMIT

    const current = await this.breakdownPage(
      siteId,
      ticket.periods.current,
      ticket.freshness.current,
      filterPlan,
      { dimension, sort, direction, offset, limit },
    )
    if (ticket.periods.comparison === null || ticket.freshness.comparison === null) {
      return current
    }
    return {
      ...current,
      comparison: await this.breakdownPage(
        siteId,
        ticket.periods.comparison,
        ticket.freshness.comparison,
        filterPlan,
        { dimension, sort, direction, offset, limit },
      ),
    }
  }

  private compileFilters(input: TrafficOverviewInput | TrafficBreakdownsInput): ReportFilterPlan {
    const profileFilterKeys =
      typeof this.deps.profileFilterKeys === 'function'
        ? this.deps.profileFilterKeys()
        : this.deps.profileFilterKeys
    const result = compileTrafficFilterPlan({
      filters: input.filters ?? [],
      profileFilterKeys,
    })
    if (!result.ok) throw new ORPCError('BAD_REQUEST', { message: result.reason })
    return result.plan
  }

  private async admit(
    input: TrafficOverviewInput | TrafficBreakdownsInput,
    family: TrafficReportFamily,
  ) {
    try {
      return await this.deps.admission.admit({
        siteId: createSiteId(input.siteId),
        current: {
          fromDate: createCalendarDate(input.fromDate),
          toDate: createCalendarDate(input.toDate),
        },
        ...(input.comparison === undefined || input.comparison === null
          ? {}
          : {
              comparison: {
                fromDate: createCalendarDate(input.comparison.fromDate),
                toDate: createCalendarDate(input.comparison.toDate),
              },
            }),
        bucket: {
          granularity: input.granularity,
          maxStarts: AUTHENTICATED_REPORT_BUCKET_LIMITS[input.granularity],
        },
        coverage: ['event-occurrence'],
        work: {
          extraMetricCount: 'dimension' in input ? 1 : 0,
          dimensionCount: 'dimension' in input ? 1 : 0,
          filterCount: input.filters?.length ?? 0,
          distinctCountOperations: 0,
          budget: REPORT_FACT_WORK_BUDGETS[family],
        },
      })
    } catch (error) {
      throw toOrpcReportingError(error)
    }
  }

  private async overviewPeriod(
    siteId: SiteId,
    period: ResolvedPeriod,
    freshness: FreshnessEvidence,
    filterPlan: ReportFilterPlan,
  ): Promise<Omit<TrafficOverviewOutput, 'comparison'>> {
    const result = await this.deps.query.trafficAggregate({
      siteId,
      period,
      includeTrend: true,
      filterPlan,
    })
    const facts = result.metrics
    const rows: BucketCount[] = result.trend.map((bucket) => ({
      at: bucket.at,
      count: bucket.visitors,
    }))
    const filled = fillBuckets({
      bucketStarts: period.bucketStarts ?? [],
      interval: period.interval,
      completeThrough: readCompleteThrough(freshness),
      rows,
      toValue: (row) => row.count,
    })
    return {
      fromDate: period.dates.fromDate,
      toDate: period.dates.toDate,
      visitors: facts.visitors,
      sessions: facts.sessions,
      eligibleSessions: facts.eligibleSessions,
      sessionsWithValidDuration: facts.sessionsWithValidDuration,
      pageviews: facts.pageviews,
      bounceRate: bounceRate(facts),
      pagesPerSession: facts.sessions === 0 ? 0 : facts.pageviews / facts.sessions,
      averageSessionDurationSeconds: averageSessionDurationSeconds(facts),
      trend: filled.map((bucket) => ({
        at: new Date(bucket.at).toISOString(),
        value: bucket.value,
        complete: bucket.complete,
        metric: 'visitors' as const,
        grain: 'visitor' as const,
        unit: 'count' as const,
        denominator: null,
      })),
      ...freshnessOutput(freshness),
    }
  }

  private async breakdownPage(
    siteId: SiteId,
    period: ResolvedPeriod,
    freshness: FreshnessEvidence,
    filterPlan: ReportFilterPlan,
    page: BreakdownPageRequest,
  ): Promise<Omit<TrafficBreakdownsOutput, 'comparison'>> {
    const result = await this.deps.query.trafficBreakdown({
      siteId,
      period,
      dimension: page.dimension,
      sort: page.sort,
      direction: page.direction,
      offset: page.offset,
      limit: page.limit,
      filterPlan,
    })
    return {
      items: result.rows.map((row) => ({
        value: row.value,
        metric: 'sessions' as const,
        grain: 'session' as const,
        count: row.count,
        denominator: result.denominator,
        percentage: breakdownPercentage(row.count, result.denominator),
      })),
      nextOffset: result.nextOffset,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
      ...freshnessOutput(freshness),
    }
  }
}

interface BreakdownPageRequest {
  readonly dimension: TrafficBreakdownDimension
  readonly sort: BreakdownSort
  readonly direction: 'asc' | 'desc'
  readonly offset: number
  readonly limit: number
}

/**
 * `SRate` is 0..1, so a per-row count above its session denominator is impossible by construction;
 * surfacing that as an error beats clamping a bug into a plausible-looking rate.
 */
function breakdownPercentage(count: number, denominator: number): number {
  if (denominator === 0) return 0
  const rate = count / denominator
  if (rate > 1) {
    throw new Error(`Traffic breakdown count ${count} exceeds denominator ${denominator}`)
  }
  return rate
}

function bounceRate(facts: TrafficMetricsFacts): number {
  return facts.eligibleSessions === 0 ? 0 : facts.bouncedSessions / facts.eligibleSessions
}

function averageSessionDurationSeconds(facts: TrafficMetricsFacts): number {
  return facts.sessionsWithValidDuration === 0
    ? 0
    : facts.totalSessionDurationMs / 1000 / facts.sessionsWithValidDuration
}

function readCompleteThrough(freshness: FreshnessEvidence) {
  return freshness.occurrenceTimeCoverageThrough
}

function freshnessOutput(freshness: FreshnessEvidence): {
  readonly projectedAcceptanceSequence: number | null
  readonly occurrenceTimeCoverageThrough: string | null
  readonly status: 'current' | 'stale'
} {
  return {
    projectedAcceptanceSequence: freshness.projectedAcceptanceSequence,
    occurrenceTimeCoverageThrough:
      freshness.occurrenceTimeCoverageThrough === null
        ? null
        : new Date(freshness.occurrenceTimeCoverageThrough).toISOString(),
    status: freshness.status,
  }
}
