import type { AuthUser } from '@cimi/auth'
import {
  AUTHENTICATED_EVENT_BUCKET_LIMITS,
  REPORT_FACT_WORK_BUDGETS,
  type SEventBreakdownsInput,
  type SEventBreakdownsOutput,
  type SEventOverviewInput,
  type SEventOverviewOutput,
  type SEventListInput,
  type SEventListOutput,
  type SEventTimeseriesInput,
  type SEventTimeseriesOutput,
} from '@cimi/contract'
import { assertSiteScope, type SiteScopeGuardDependencies } from '@cimi/guard'
import { ORPCError } from '@orpc/server'
import {
  ReportingAdmissionService,
  compileEventFilterPlan,
  createCalendarDate,
  createSiteId,
  fillBuckets,
  type BucketCount,
  type EventBreakdownField,
  type EventFilterInput,
  type EventKind,
  type EventRowFacts,
  type FreshnessEvidence,
  type ReportFilterPlan,
  type ReportingProfileFilterPort,
  type ReportingQueryPort,
  type ResolvedPeriod,
  type SiteId,
} from '@cimi/kernel'
import type * as v from 'valibot'
import { toOrpcReportingError } from './errors.ts'

export type EventOverviewInput = v.InferOutput<typeof SEventOverviewInput>
export type EventOverviewOutput = v.InferOutput<typeof SEventOverviewOutput>
export type EventTimeseriesInput = v.InferOutput<typeof SEventTimeseriesInput>
export type EventTimeseriesOutput = v.InferOutput<typeof SEventTimeseriesOutput>
export type EventListInput = v.InferOutput<typeof SEventListInput>
export type EventListOutput = v.InferOutput<typeof SEventListOutput>
export type EventBreakdownsInput = v.InferOutput<typeof SEventBreakdownsInput>
export type EventBreakdownsOutput = v.InferOutput<typeof SEventBreakdownsOutput>

export type EventReportFamily = 'aggregate' | 'row-list' | 'breakdown'

const DEFAULT_ROW_LIMIT = 50
const DEFAULT_BREAKDOWN_LIMIT = 50
const OVERVIEW_DISTINCT_OPERATIONS = 2

export interface EventReportServiceDependencies {
  readonly admission: ReportingAdmissionService
  readonly query: ReportingQueryPort
  readonly profileFilterKeys: ReportingProfileFilterPort
  readonly scope: SiteScopeGuardDependencies
}

export class EventReportService {
  constructor(private readonly deps: EventReportServiceDependencies) {}

  async getOverview(
    input: EventOverviewInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<EventOverviewOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input, 'aggregate', OVERVIEW_DISTINCT_OPERATIONS)
    const siteId = createSiteId(input.siteId)
    const filterPlan = await this.compileFilters(input, siteId)
    const eventKind = input.eventKind

    const current = await this.overviewPeriod(
      siteId,
      ticket.periods.current,
      ticket.freshness.current,
      eventKind,
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
        eventKind,
        filterPlan,
      ),
    }
  }

  async getTimeseries(
    input: EventTimeseriesInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<EventTimeseriesOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input, 'aggregate', 0)
    const siteId = createSiteId(input.siteId)
    const filterPlan = await this.compileFilters(input, siteId)
    const eventKind = input.eventKind

    const current = await this.timeseriesPeriod(
      siteId,
      ticket.periods.current,
      ticket.freshness.current,
      eventKind,
      filterPlan,
    )
    if (ticket.periods.comparison === null || ticket.freshness.comparison === null) {
      return current
    }
    return {
      ...current,
      comparison: await this.timeseriesPeriod(
        siteId,
        ticket.periods.comparison,
        ticket.freshness.comparison,
        eventKind,
        filterPlan,
      ),
    }
  }

  async listEvents(
    input: EventListInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<EventListOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input, 'row-list', 1)
    const siteId = createSiteId(input.siteId)
    const filterPlan = await this.compileFilters(input, siteId)
    const offset = input.offset ?? 0
    const limit = input.limit ?? DEFAULT_ROW_LIMIT

    const result = await this.deps.query.eventRows({
      siteId,
      period: ticket.periods.current,
      eventKind: input.eventKind,
      filterPlan,
      direction: input.direction ?? 'desc',
      offset,
      limit,
    })
    const items: EventListOutput['items'] = []
    for (const row of result.rows) {
      const item = toEventOutput(row)
      if (item !== null) items.push(item)
    }
    return {
      items,
      nextOffset: result.nextOffset,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
      ...freshnessOutput(ticket.freshness.current),
    }
  }

  async getBreakdowns(
    input: EventBreakdownsInput,
    user: Pick<AuthUser, 'id'> | undefined,
  ): Promise<EventBreakdownsOutput> {
    await assertSiteScope(user, input.siteId, this.deps.scope)
    const ticket = await this.admit(input, 'breakdown', 1)
    const siteId = createSiteId(input.siteId)
    const filterPlan = await this.compileFilters(input, siteId)
    const field = breakdownFieldForKind(input.eventKind)
    const sort = input.sort ?? 'value'
    const direction = input.direction ?? 'asc'
    const offset = input.offset ?? 0
    const limit = input.limit ?? DEFAULT_BREAKDOWN_LIMIT

    const current = await this.breakdownPage(
      siteId,
      ticket.periods.current,
      ticket.freshness.current,
      input.eventKind,
      filterPlan,
      { field, sort, direction, offset, limit },
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
        input.eventKind,
        filterPlan,
        { field, sort, direction, offset, limit },
      ),
    }
  }

  private async compileFilters(
    input: EventOverviewInput | EventTimeseriesInput | EventListInput | EventBreakdownsInput,
    siteId: SiteId,
  ): Promise<ReportFilterPlan> {
    const profileFilterKeys = await this.deps.profileFilterKeys.getProfileFilterKeys(siteId)
    const result = compileEventFilterPlan({
      filters: (input.filters ?? []).map(toEventFilterInput),
      profileFilterKeys,
    })
    if (!result.ok) throw new ORPCError('BAD_REQUEST', { message: result.reason })
    return result.plan
  }

  private async admit(
    input: EventOverviewInput | EventTimeseriesInput | EventListInput | EventBreakdownsInput,
    family: EventReportFamily,
    distinctCountOperations: number,
  ) {
    try {
      return await this.deps.admission.admit({
        siteId: createSiteId(input.siteId),
        current: {
          fromDate: createCalendarDate(input.fromDate),
          toDate: createCalendarDate(input.toDate),
        },
        ...('comparison' in input && input.comparison !== undefined && input.comparison !== null
          ? {
              comparison: {
                fromDate: createCalendarDate(input.comparison.fromDate),
                toDate: createCalendarDate(input.comparison.toDate),
              },
            }
          : {}),
        ...('granularity' in input
          ? {
              bucket: {
                granularity: input.granularity,
                maxStarts: AUTHENTICATED_EVENT_BUCKET_LIMITS[input.granularity],
              },
            }
          : {}),
        coverage: ['event-occurrence'],
        work: {
          extraMetricCount: 0,
          dimensionCount: family === 'breakdown' ? 1 : 0,
          filterCount: input.filters?.length ?? 0,
          distinctCountOperations,
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
    eventKind: EventKind,
    filterPlan: ReportFilterPlan,
  ): Promise<Omit<EventOverviewOutput, 'comparison'>> {
    const facts = await this.deps.query.eventOverview({
      siteId,
      period,
      eventKind,
      filterPlan,
    })
    return {
      fromDate: period.dates.fromDate,
      toDate: period.dates.toDate,
      eventKind,
      total: facts.total,
      uniqueVisitors: facts.uniqueVisitors,
      uniqueSessions: facts.uniqueSessions,
      ...freshnessOutput(freshness),
    }
  }

  private async timeseriesPeriod(
    siteId: SiteId,
    period: ResolvedPeriod,
    freshness: FreshnessEvidence,
    eventKind: EventKind,
    filterPlan: ReportFilterPlan,
  ): Promise<Omit<EventTimeseriesOutput, 'comparison'>> {
    const facts = await this.deps.query.eventBuckets({
      siteId,
      period,
      eventKind,
      filterPlan,
    })
    const rows: BucketCount[] = facts.map((bucket) => ({ at: bucket.at, count: bucket.count }))
    const filled = fillBuckets({
      bucketStarts: period.bucketStarts ?? [],
      interval: period.interval,
      completeThrough: freshness.occurrenceTimeCoverageThrough,
      rows,
      toValue: (row) => row.count,
    })
    return {
      fromDate: period.dates.fromDate,
      toDate: period.dates.toDate,
      buckets: filled.map((bucket) => ({
        at: new Date(bucket.at).toISOString(),
        count: bucket.value,
        complete: bucket.complete,
      })),
      ...freshnessOutput(freshness),
    }
  }

  private async breakdownPage(
    siteId: SiteId,
    period: ResolvedPeriod,
    freshness: FreshnessEvidence,
    eventKind: EventKind,
    filterPlan: ReportFilterPlan,
    page: BreakdownPageRequest,
  ): Promise<Omit<EventBreakdownsOutput, 'comparison'>> {
    const result = await this.deps.query.eventBreakdown({
      siteId,
      period,
      eventKind,
      field: page.field,
      sort: page.sort,
      direction: page.direction,
      offset: page.offset,
      limit: page.limit,
      filterPlan,
    })
    return {
      items: result.rows.map((row) => ({ field: page.field, value: row.value, count: row.count })),
      nextOffset: result.nextOffset,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
      ...freshnessOutput(freshness),
    }
  }
}

interface BreakdownPageRequest {
  readonly field: EventBreakdownField
  readonly sort: 'value' | 'count'
  readonly direction: 'asc' | 'desc'
  readonly offset: number
  readonly limit: number
}

type SEventVariant = EventListOutput['items'][number]

type ContractEventFilter = NonNullable<EventOverviewInput['filters']>[number]

/**
 * The contract's session action carries property filters keyed `field`; the kernel compiler keys
 * them `key`. This bridge is the only shape translation between the transport contract and the
 * kernel filter compiler.
 */
function toEventFilterInput(filter: ContractEventFilter): EventFilterInput {
  if (filter.scope === 'session') {
    return {
      scope: 'session',
      operator: filter.operator,
      action: {
        kind: filter.action.kind,
        ...('name' in filter.action ? { name: filter.action.name } : {}),
        propertyFilters: (filter.action.propertyFilters ?? []).map((property) => ({
          key: property.field,
          operator: property.operator,
          values: property.values,
        })),
      },
    }
  }
  return {
    scope: 'event',
    field: filter.field,
    operator: filter.operator,
    values: filter.values,
  }
}

/**
 * The server allowlist maps each Event Kind to its primary breakdown dimension. The contract's
 * breakdown input carries no dimension selector, so the kind decides which field is grouped.
 */
function breakdownFieldForKind(kind: EventKind): EventBreakdownField {
  switch (kind) {
    case 'page_view':
      return 'pagePath'
    case 'custom_event':
      return 'name'
    case 'outbound':
      return 'destination'
    case 'performance':
      return 'unit'
    case 'error':
      return 'code'
  }
}

/**
 * Maps one projected event row onto its kind-discriminated contract variant. A row whose
 * kind-required column is missing is a projection defect rather than a reportable event, so it is
 * dropped instead of being coerced into a plausible-looking item.
 */
function toEventOutput(row: EventRowFacts): SEventVariant | null {
  const common = {
    eventId: row.eventId,
    occurredAt: new Date(row.occurredAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    referrer: row.referrer,
    properties: row.properties === null ? null : { ...row.properties },
  }
  switch (row.kind) {
    case 'page_view': {
      if (row.pagePath === null) return null
      return { ...common, kind: 'page_view', pagePath: row.pagePath }
    }
    case 'custom_event': {
      if (row.name === null) return null
      return { ...common, kind: 'custom_event', name: row.name, pagePath: row.pagePath }
    }
    case 'outbound': {
      if (row.destination === null) return null
      return {
        ...common,
        kind: 'outbound',
        name: row.name,
        pagePath: row.pagePath,
        destination: row.destination,
      }
    }
    case 'performance': {
      if (row.name === null || row.value === null) return null
      return {
        ...common,
        kind: 'performance',
        name: row.name,
        pagePath: row.pagePath,
        value: row.value,
        unit: row.unit,
      }
    }
    case 'error': {
      if (row.name === null) return null
      return {
        ...common,
        kind: 'error',
        name: row.name,
        pagePath: row.pagePath,
        code: row.code,
        message: row.message,
      }
    }
  }
  return null
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
