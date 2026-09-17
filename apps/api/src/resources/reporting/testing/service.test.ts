import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AnalyticsDb, Db } from '@cimi/db'
import {
  InMemoryLifecycleLock,
  ReportingAdmissionService,
  createCalendarDate,
  createInstantMs,
  createSiteId,
  type ReportAdmissionTicket,
  type ReportAdmissionPreparation,
  type ReportEvaluationPeriod,
} from '@cimi/kernel'
import { createReportQueryKernel } from '../query.ts'
import type { ReportSnapshot } from '../model.ts'
import type { GoalRepository } from '../../goal/repository.ts'
import { GoalService } from '../../goal/service.ts'

const now = new Date('2026-09-05T00:00:00.000Z')

describe('GoalService reports', () => {
  it('uses the historical identity population for an earlier report period', async () => {
    const repository = mock<GoalRepository>()
    const currentGoal: GoalRepository.Goal = {
      id: 'gol_1',
      siteId: 'ste_1',
      name: 'Signups',
      action: { kind: 'custom_event', name: 'signup' },
      identityKind: 'identified_user',
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    const historicalGoal: GoalRepository.Goal = {
      ...currentGoal,
      identityKind: 'visitor',
    }
    repository.findById.mockResolvedValue(currentGoal)
    repository.findVersionAt.mockResolvedValue(historicalGoal)

    const admission = mock<ReportingAdmissionService>()
    admission.prepare.mockResolvedValue(admissionPreparation())
    admission.admitPrepared.mockResolvedValue(admissionTicket())
    const lifecycleLock = new InMemoryLifecycleLock()
    const query = createReportQueryKernel({
      admission,
      data: { read: async () => reportSnapshot() },
      lifecycleLock,
    })
    const service = new GoalService({
      repository,
      scope: siteScope(),
      admission,
      lifecycleLock,
      analytics: mock<AnalyticsDb>(),
      db: mock<Db>(),
      query,
    })

    await expect(
      service.getReport(
        { goalId: currentGoal.id, fromDate: '2026-09-01', toDate: '2026-09-01' },
        { id: 'user_1' },
      ),
    ).resolves.toMatchObject({
      conversions: 2,
      eligibleSessions: 2,
      conversionRate: 1,
    })
    expect(repository.findVersionAt).toHaveBeenCalledWith({
      siteId: 'ste_1',
      goalId: 'gol_1',
      at: expect.any(Date),
    })
  })
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
  const evaluation: ReportEvaluationPeriod = { period, sequence: null }
  return {
    periods: { current: period, comparison: null },
    evaluation: {
      current: evaluation,
      comparison: null,
      interval: period.interval,
    },
    freshness: {
      current: {
        status: 'current',
        projectedAcceptanceSequence: 1,
        occurrenceTimeCoverageThrough: createInstantMs(Date.parse('2026-09-02T00:00:00.000Z')),
      },
      comparison: null,
    },
    factWork: {
      units: 1,
      budget: 1_000_000,
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

function reportSnapshot(): ReportSnapshot {
  return {
    sessions: [
      {
        sessionId: 'ses-visitor',
        visitorId: 'vis-1',
        identifiedUserId: null,
        startedAt: new Date('2026-09-01T10:00:00.000Z'),
        endedAt: new Date('2026-09-01T10:05:00.000Z'),
        entryPage: '/',
        exitPage: '/done',
        referrer: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        device: null,
        browser: null,
        operatingSystem: null,
        country: null,
        region: null,
        city: null,
      },
      {
        sessionId: 'ses-identified',
        visitorId: 'vis-2',
        identifiedUserId: 'usr-1',
        startedAt: new Date('2026-09-01T11:00:00.000Z'),
        endedAt: new Date('2026-09-01T11:05:00.000Z'),
        entryPage: '/',
        exitPage: '/done',
        referrer: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        device: null,
        browser: null,
        operatingSystem: null,
        country: null,
        region: null,
        city: null,
      },
    ],
    events: [
      {
        eventId: 'evt-visitor',
        eventKind: 'custom_event',
        occurrenceTime: new Date('2026-09-01T10:01:00.000Z'),
        visitorId: 'vis-1',
        identifiedUserId: null,
        sessionId: 'ses-visitor',
        pagePath: '/',
        referrer: null,
        name: 'signup',
        destination: null,
        unit: null,
        code: null,
        properties: {},
      },
      {
        eventId: 'evt-identified',
        eventKind: 'custom_event',
        occurrenceTime: new Date('2026-09-01T11:01:00.000Z'),
        visitorId: 'vis-2',
        identifiedUserId: 'usr-1',
        sessionId: 'ses-identified',
        pagePath: '/',
        referrer: null,
        name: 'signup',
        destination: null,
        unit: null,
        code: null,
        properties: {},
      },
    ],
    activeProfiles: new Map([['usr-1', { identifiedUserId: 'usr-1', traits: {} }]]),
  }
}

function siteScope() {
  return {
    siteScope: {
      exists: async () => true,
      isActive: async () => true,
      getOrganizationId: async () => 'org_1',
    },
    membership: {
      getRole: () => 'owner' as const,
      hasPendingGovernanceOperation: () => false,
    },
  }
}
