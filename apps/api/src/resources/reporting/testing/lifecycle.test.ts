import { expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import {
  InMemoryLifecycleLock,
  ReportingAdmissionService,
  createCalendarDate,
  createInstantMs,
  createSiteId,
  type ReportAdmissionPreparation,
  type ReportAdmissionTicket,
} from '@cimi/kernel'
import { createReportQueryKernel } from '../query.ts'

it('holds the shared lifecycle boundary while a report reads data', async () => {
  const lifecycleLock = new InMemoryLifecycleLock()
  const admission = mock<ReportingAdmissionService>()
  admission.prepare.mockResolvedValue(admissionPreparation())
  admission.admitPrepared.mockResolvedValue(admissionTicket())
  let deletionLease
  let responseDeletionLease
  const query = createReportQueryKernel({
    admission,
    lifecycleLock,
    data: {
      read: async () => {
        deletionLease = lifecycleLock.acquire('site_deletion')
        return { events: [], sessions: [], activeProfiles: new Map() }
      },
    },
  })

  await expect(
    query.run({
      siteId: 'ste_1',
      window: { fromDate: '2026-09-01', toDate: '2026-09-01' },
      plan: async ({ prepare }) => ({
        preparation: await prepare(),
        coverage: ['event-occurrence'],
        work: { extraMetricCount: 0, distinctCountOperations: 0 },
        identityKindFor: () => 'visitor',
        evaluate: () => 1,
      }),
      render: (run) => {
        responseDeletionLease = lifecycleLock.acquire('site_deletion')
        return run
      },
    }),
  ).resolves.toMatchObject({ current: { value: 1 } })

  expect(deletionLease).toBeUndefined()
  expect(responseDeletionLease).toBeUndefined()
})

it('fails closed when the shared lifecycle boundary is unavailable', async () => {
  const lifecycleLock = new InMemoryLifecycleLock()
  const lifecycleLease = lifecycleLock.acquire('site_deletion')
  if (lifecycleLease === undefined) throw new Error('Expected a lifecycle lease')
  const admission = mock<ReportingAdmissionService>()
  const query = createReportQueryKernel({
    admission,
    lifecycleLock,
    data: { read: async () => ({ events: [], sessions: [], activeProfiles: new Map() }) },
  })

  await expect(
    query.run({
      siteId: 'ste_1',
      window: { fromDate: '2026-09-01', toDate: '2026-09-01' },
      plan: async () => {
        throw new Error('Planning must not run while lifecycle is locked')
      },
      render: (run) => run,
    }),
  ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

  expect(admission.prepare).not.toHaveBeenCalled()
  await lifecycleLease.release()
})

function admissionTicket(): ReportAdmissionTicket {
  const period = {
    key: 'current' as const,
    dates: {
      fromDate: createCalendarDate('2026-09-01'),
      toDate: createCalendarDate('2026-09-01'),
    },
    interval: {
      start: createInstantMs(Date.parse('2026-09-01T00:00:00.000Z')),
      endExclusive: createInstantMs(Date.parse('2026-09-02T00:00:00.000Z')),
    },
    calendarDays: 1,
    bucketStarts: null,
  }
  return {
    periods: { current: period, comparison: null },
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
      budget: 1,
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
}

function admissionPreparation(): ReportAdmissionPreparation {
  const ticket = admissionTicket()
  return {
    input: {
      siteId: createSiteId('ste_1'),
      current: ticket.periods.current.dates,
    },
    periods: ticket.periods,
    evaluation: ticket.evaluation,
    coveragePeriods: ticket.periods,
  }
}
