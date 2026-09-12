import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { InMemorySiteScopePort } from '@cimi/guard'
import { ORPCError } from '@orpc/server'
import {
  createCalendarDate,
  createInstantMs,
  type ReportAdmissionTicket,
  type ReportingAdmissionService,
  type ReportingProfileFilterPort,
  type ReportingQueryPort,
} from '@cimi/kernel'
import { TrafficReportService } from '../service.ts'

const ticket: ReportAdmissionTicket = {
  periods: {
    current: {
      key: 'current',
      dates: {
        fromDate: createCalendarDate('2026-09-05'),
        toDate: createCalendarDate('2026-09-06'),
      },
      interval: { start: createInstantMs(0), endExclusive: createInstantMs(1) },
      calendarDays: 2,
      bucketStarts: null,
    },
    comparison: null,
  },
  freshness: {
    current: {
      status: 'stale',
      projectedAcceptanceSequence: 0,
      occurrenceTimeCoverageThrough: null,
    },
    comparison: null,
  },
  factWork: {
    units: 0,
    budget: 0,
    components: {
      baseFacts: 0,
      extraMetrics: 0,
      bucketWork: 0,
      dimensions: 0,
      filters: 0,
      distinctCounts: 0,
    },
  },
}

function createService(profileFilterKeys: readonly string[]) {
  const admission = mock<ReportingAdmissionService>()
  admission.admit.mockResolvedValue(ticket)
  const query = mock<ReportingQueryPort>()
  query.trafficAggregate.mockResolvedValue({
    metrics: {
      visitors: 0,
      sessions: 0,
      pageviews: 0,
      eligibleSessions: 0,
      sessionsWithValidDuration: 0,
      bouncedSessions: 0,
      totalSessionDurationMs: 0,
    },
    trend: [],
  })
  const port = mock<ReportingProfileFilterPort>()
  port.getProfileFilterKeys.mockResolvedValue(profileFilterKeys)
  const scope = new InMemorySiteScopePort(
    [{ siteId: 'ste-1', organizationId: 'org-1' }],
    [{ organizationId: 'org-1', userId: 'user-1', role: 'owner' }],
  )
  return {
    service: new TrafficReportService({
      admission,
      query,
      profileFilterKeys: port,
      scope: { siteScope: scope, membership: scope },
    }),
    query,
    port,
  }
}

const profileFilter = {
  scope: 'profile' as const,
  field: 'trait.plan',
  operator: 'equals' as const,
  values: ['pro'],
}

describe('traffic report profile trait gate', () => {
  it('resolves the Site policy then passes an approved trait filter to the query', async () => {
    const { service, query, port } = createService(['plan'])

    await service.getOverview(
      {
        siteId: 'ste-1',
        fromDate: '2026-09-05',
        toDate: '2026-09-06',
        granularity: 'day',
        filters: [profileFilter],
      },
      { id: 'user-1' },
    )

    expect(port.getProfileFilterKeys).toHaveBeenCalledWith('ste-1')
    const aggregate = query.trafficAggregate.mock.calls[0]?.[0]
    expect(aggregate?.filterPlan.profile).toEqual([
      { target: 'profile.trait', propertyKey: 'plan', operator: 'eq', bind: ['pro'] },
    ])
  })

  it('rejects an unapproved trait filter before reaching the query', async () => {
    const { service, query } = createService([])

    await expect(
      service.getOverview(
        {
          siteId: 'ste-1',
          fromDate: '2026-09-05',
          toDate: '2026-09-06',
          granularity: 'day',
          filters: [profileFilter],
        },
        { id: 'user-1' },
      ),
    ).rejects.toBeInstanceOf(ORPCError)
    expect(query.trafficAggregate).not.toHaveBeenCalled()
  })

  it('does not resolve the policy when the caller fails the site scope check', async () => {
    const { service, port } = createService(['plan'])

    await expect(
      service.getOverview(
        {
          siteId: 'ste-1',
          fromDate: '2026-09-05',
          toDate: '2026-09-06',
          granularity: 'day',
        },
        undefined,
      ),
    ).rejects.toBeInstanceOf(ORPCError)
    expect(port.getProfileFilterKeys).not.toHaveBeenCalled()
  })
})
