import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { InMemorySiteScopePort } from '@cimi/guard'
import {
  createCalendarDate,
  createInstantMs,
  type ReportAdmissionTicket,
  type ReportingAdmissionService,
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

function createService() {
  const admission = mock<ReportingAdmissionService>()
  admission.admit.mockResolvedValue(ticket)
  const scope = new InMemorySiteScopePort(
    [{ siteId: 'ste-1', organizationId: 'org-1' }],
    [{ organizationId: 'org-1', userId: 'user-1', role: 'owner' }],
  )
  return {
    service: new TrafficReportService({
      admission,
      scope: { siteScope: scope, membership: scope },
    }),
    admission,
  }
}

describe('traffic report Fact-Work budget by family', () => {
  it('requests the aggregate budget for an overview', async () => {
    const { service, admission } = createService()

    await service.getOverview(
      { siteId: 'ste-1', fromDate: '2026-09-05', toDate: '2026-09-06', granularity: 'day' },
      { id: 'user-1' },
    )

    expect(admission.admit).toHaveBeenCalledWith(
      expect.objectContaining({ work: expect.objectContaining({ budget: 25_000_000 }) }),
    )
  })

  it('requests the breakdown budget for a breakdown', async () => {
    const { service, admission } = createService()

    await service.getBreakdowns(
      {
        siteId: 'ste-1',
        fromDate: '2026-09-05',
        toDate: '2026-09-06',
        granularity: 'day',
        dimension: 'page',
      },
      { id: 'user-1' },
    )

    expect(admission.admit).toHaveBeenCalledWith(
      expect.objectContaining({ work: expect.objectContaining({ budget: 10_000_000 }) }),
    )
  })
})
