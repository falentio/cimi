import { describe, expect, it } from 'vitest'
import {
  compileTrafficFilterPlan,
  createCalendarDate,
  createInstantMs,
  type PublicDashboardQueryPort,
  type ReportAdmissionTicket,
  type ResolvedPeriod,
} from '@cimi/kernel'
import { PublicDashboardAggregatePlanner, type PublicDashboardAdmission } from '../aggregate.ts'

const period: ResolvedPeriod = {
  key: 'current',
  dates: { fromDate: createCalendarDate('2026-09-01'), toDate: createCalendarDate('2026-09-01') },
  interval: { start: createInstantMs(0), endExclusive: createInstantMs(3_600_000) },
  calendarDays: 1,
  bucketStarts: [{ at: createInstantMs(0), localLabel: '2026-09-01T00:00:00', offsetMinutes: 0 }],
}

const ticket: ReportAdmissionTicket = {
  periods: {
    current: period,
    comparison: null,
  },
  evaluation: {
    current: { period, sequence: null },
    comparison: null,
    interval: period.interval,
  },
  freshness: {
    current: {
      status: 'current',
      projectedAcceptanceSequence: 1,
      occurrenceTimeCoverageThrough: period.interval.endExclusive,
    },
    comparison: null,
  },
  factWork: {
    units: 1,
    budget: 25_000_000,
    components: {
      baseFacts: 1,
      extraMetrics: 0,
      bucketWork: 1,
      dimensions: 1,
      filters: 0,
      distinctCounts: 1,
    },
  },
}

const filterPlan = compileTrafficFilterPlan({ filters: [], profileFilterKeys: [] })
if (!filterPlan.ok) throw new Error('Expected an empty public filter plan')

describe('PublicDashboardAggregatePlanner.preflight', () => {
  it('rejects a dimension result above the independent row budget', async () => {
    const admissionRequests: Parameters<PublicDashboardAdmission['admit']>[0][] = []
    const admission: PublicDashboardAdmission = {
      admit: async (input) => {
        admissionRequests.push(input)
        return ticket
      },
    }
    let aggregateCalls = 0
    const query: PublicDashboardQueryPort = {
      countDimensionValues: async () => 101,
      countDistinctVisitors: async () => 5,
      aggregate: async () => {
        aggregateCalls += 1
        return []
      },
    }
    const planner = new PublicDashboardAggregatePlanner({ admission, query })

    await expect(
      planner.preflight({
        siteId: 'ste_1',
        fromDate: '2026-09-01',
        toDate: '2026-09-01',
        metric: 'visitors',
        dimension: 'page',
        filterPlan: filterPlan.plan,
        filterCount: 0,
      }),
    ).rejects.toMatchObject({ code: 'QUERY_LIMIT_EXCEEDED' })
    expect(admissionRequests[0]?.work).toMatchObject({
      extraMetricCount: 1,
      dimensionCount: 1,
      distinctCountOperations: 3,
    })
    expect(aggregateCalls).toBe(0)
  })

  it('charges suppression and metric distinct work separately for time queries', async () => {
    const admissionRequests: Parameters<PublicDashboardAdmission['admit']>[0][] = []
    const admission: PublicDashboardAdmission = {
      admit: async (input) => {
        admissionRequests.push(input)
        return ticket
      },
    }
    const query: PublicDashboardQueryPort = {
      countDimensionValues: async () => 0,
      countDistinctVisitors: async () => 5,
      aggregate: async () => [],
    }
    const planner = new PublicDashboardAggregatePlanner({ admission, query })

    await planner.preflight({
      siteId: 'ste_1',
      fromDate: '2026-09-01',
      toDate: '2026-09-01',
      metric: 'visitors',
      dimension: 'time',
      filterPlan: filterPlan.plan,
      filterCount: 0,
    })

    expect(admissionRequests[0]?.work).toMatchObject({
      extraMetricCount: 0,
      dimensionCount: 0,
      distinctCountOperations: 3,
    })
  })
})
