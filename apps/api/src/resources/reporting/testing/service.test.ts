import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AnalyticsDb, AnalyticsReportData } from '@cimi/db'
import {
  ReportingAdmissionService,
  createInstantMs,
  createSiteId,
  type ReportingEvidencePort,
  type ReportingMetadataPort,
  type AnalyticsReadinessPort,
} from '@cimi/kernel'
import { GoalRepositoryDrizzle } from '../../goal/repository.drizzle.ts'
import { GoalService } from '../../goal/service.ts'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'

const now = new Date('2026-09-05T00:00:00.000Z')

describe('GoalService reports', () => {
  it('uses the shared admission ticket and counts one conversion per Session', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new GoalRepositoryDrizzle({ db: fixture.db })
    const goal = await repository.insert({
      id: 'gol_1',
      siteId: 'ste_1',
      name: 'Signups',
      action: { kind: 'custom_event', name: 'signup' },
      identityKind: 'visitor',
      now,
    })
    const analytics = mock<AnalyticsDb>()
    const reportData: AnalyticsReportData = {
      sessions: [
        {
          sessionId: 'ses-1',
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
      ],
      events: [
        {
          eventId: 'evt-1',
          eventKind: 'custom_event',
          occurrenceTime: new Date('2026-09-01T10:01:00.000Z'),
          visitorId: 'vis-1',
          identifiedUserId: null,
          sessionId: 'ses-1',
          pagePath: '/',
          referrer: null,
          name: 'signup',
          destination: null,
          unit: null,
          code: null,
          properties: {},
        },
        {
          eventId: 'evt-2',
          eventKind: 'custom_event',
          occurrenceTime: new Date('2026-09-01T10:02:00.000Z'),
          visitorId: 'vis-1',
          identifiedUserId: null,
          sessionId: 'ses-1',
          pagePath: '/',
          referrer: null,
          name: 'signup',
          destination: null,
          unit: null,
          code: null,
          properties: {},
        },
      ],
    }
    analytics.readReportData.mockResolvedValue(reportData)
    const readiness = mock<AnalyticsReadinessPort>()
    readiness.getHealth.mockReturnValue({ controlStore: 'ready', analyticsStore: 'ready' })
    const metadata = mock<ReportingMetadataPort>()
    metadata.getActive.mockReturnValue({
      siteId: createSiteId('ste_1'),
      reportingTimezone: 'UTC',
      weekStartsOn: 'monday',
    })
    const evidence = mock<ReportingEvidencePort>()
    evidence.read.mockReturnValue({
      projection: {
        checkpoint: {
          projectedAcceptanceSequence: 2,
          projectedFactCardinality: 2,
          occurrenceCoveredFrom: createInstantMs(Date.parse('2026-01-01T00:00:00.000Z')),
          occurrenceCoveredThrough: createInstantMs(Date.parse('2026-09-02T00:00:00.000Z')),
        },
        openGaps: [],
      },
      statistics: { state: 'aligned', asOfAcceptanceSequence: 2, factCardinality: 2 },
      retention: {
        eventOccurrence: { state: 'available', from: createInstantMs(0) },
        profileActivity: { state: 'available', from: createInstantMs(0) },
        replayReceipt: { state: 'available', from: createInstantMs(0) },
      },
    })
    const admission = new ReportingAdmissionService({
      analyticsReadiness: readiness,
      metadata,
      evidence,
    })
    const service = new GoalService({
      repository,
      scope: {
        siteScope: {
          exists: async () => true,
          isActive: async () => true,
          getOrganizationId: async () => 'org_1',
        },
        membership: {
          getRole: () => 'owner',
          hasPendingGovernanceOperation: () => false,
        },
      },
      admission,
      analytics,
      db: fixture.db,
    })

    await expect(
      service.getReport(
        { goalId: goal.id, fromDate: '2026-09-01', toDate: '2026-09-01' },
        { id: 'user_1' },
      ),
    ).resolves.toMatchObject({
      fromDate: '2026-09-01',
      toDate: '2026-09-01',
      conversions: 1,
      eligibleSessions: 1,
      conversionRate: 1,
      status: 'current',
    })
  })
})
