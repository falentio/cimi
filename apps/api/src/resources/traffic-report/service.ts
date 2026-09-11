import type { AuthUser } from '@cimi/auth'
import {
  STrafficBreakdownsOutput,
  STrafficOverviewOutput,
  type STrafficBreakdownsInput,
  type STrafficOverviewInput,
} from '@cimi/contract'
import { assertSiteScope, type SiteScopeGuardDependencies } from '@cimi/guard'
import {
  ReportingAdmissionService,
  createCalendarDate,
  createSiteId,
  type FreshnessEvidence,
  type ReportGranularity,
  type ResolvedPeriod,
} from '@cimi/kernel'
import type * as v from 'valibot'
import { toOrpcReportingError } from './errors.ts'

const BUCKET_LIMITS: Readonly<Record<ReportGranularity, number>> = {
  minute: 1_800,
  hour: 720,
  day: 366,
  week: 104,
  month: 36,
  year: 10,
}

/**
 * The Fact-Work budget for one overview request. The contract's bucket limits keep a legal
 * request well inside it; the value exists so the kernel rejects an estimate it cannot vouch for
 * rather than executing unbounded work.
 */
const REPORT_FACT_WORK_BUDGET = 50_000_000

export type TrafficOverviewInput = v.InferOutput<typeof STrafficOverviewInput>
export type TrafficOverviewOutput = v.InferOutput<typeof STrafficOverviewOutput>
export type TrafficBreakdownsInput = v.InferOutput<typeof STrafficBreakdownsInput>
export type TrafficBreakdownsOutput = v.InferOutput<typeof STrafficBreakdownsOutput>

export interface TrafficReportServiceDependencies {
  readonly admission: ReportingAdmissionService
  readonly scope: SiteScopeGuardDependencies
}

export class TrafficReportService {
  constructor(private readonly deps: TrafficReportServiceDependencies) {}

  async getOverview(
    input: TrafficOverviewInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<TrafficOverviewOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input)

    const current = this.overviewPeriod(ticket.periods.current, ticket.freshness.current)
    if (ticket.periods.comparison === null || ticket.freshness.comparison === null) {
      return current
    }
    return {
      ...current,
      comparison: this.overviewPeriod(ticket.periods.comparison, ticket.freshness.comparison),
    }
  }

  async getBreakdowns(
    input: TrafficBreakdownsInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<TrafficBreakdownsOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input)

    const current = this.breakdownPage(ticket.freshness.current)
    if (ticket.freshness.comparison === null) {
      return current
    }
    return {
      ...current,
      comparison: this.breakdownPage(ticket.freshness.comparison),
    }
  }

  private async admit(input: TrafficOverviewInput | TrafficBreakdownsInput) {
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
        bucket: { granularity: input.granularity, maxStarts: BUCKET_LIMITS[input.granularity] },
        coverage: ['event-occurrence'],
        work: {
          extraMetricCount: 'dimension' in input ? 1 : 0,
          dimensionCount: 'dimension' in input ? 1 : 0,
          filterCount: input.filters?.length ?? 0,
          distinctCountOperations: 0,
          budget: REPORT_FACT_WORK_BUDGET,
        },
      })
    } catch (error) {
      throw toOrpcReportingError(error)
    }
  }

  /**
   * Metric aggregation over the DuckDB projection is not built on this branch. Every bucket is
   * reported zero-filled with `complete: false`, the contract's representation for a bucket whose
   * values are not computed, so the response claims no measurement it does not have. Computing
   * real counts is the follow-up that owns the metric formulas.
   */
  private overviewPeriod(
    period: ResolvedPeriod,
    freshness: FreshnessEvidence,
  ): Omit<TrafficOverviewOutput, 'comparison'> {
    return {
      fromDate: period.dates.fromDate,
      toDate: period.dates.toDate,
      visitors: 0,
      sessions: 0,
      eligibleSessions: 0,
      sessionsWithValidDuration: 0,
      pageviews: 0,
      bounceRate: 0,
      pagesPerSession: 0,
      averageSessionDurationSeconds: 0,
      trend: (period.bucketStarts ?? []).map((bucket) => ({
        at: new Date(bucket.at).toISOString(),
        value: 0,
        complete: false,
        metric: 'visitors' as const,
        grain: 'visitor' as const,
        unit: 'count' as const,
        denominator: null,
      })),
      ...freshnessOutput(freshness),
    }
  }

  /**
   * Breakdown rows are not computed on this branch, so the page is empty and `totalCount` is
   * zero. Pagination metadata is still returned in the contract's shape rather than omitted.
   */
  private breakdownPage(freshness: FreshnessEvidence): Omit<TrafficBreakdownsOutput, 'comparison'> {
    return {
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
      ...freshnessOutput(freshness),
    }
  }
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
