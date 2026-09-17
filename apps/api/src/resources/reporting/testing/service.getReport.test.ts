import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { schema } from '@cimi/db'
import { createTestAnalyticsDb } from '@cimi/db/testing'
import { InMemoryLifecycleLock, InMemoryLifecycleOperationStatusReader } from '@cimi/kernel'
import { CollectionPolicyReportingProfileFilter } from '../../collection-policy/reporting-profile-filter.ts'
import { CollectionPolicyRepositoryDrizzle } from '../../collection-policy/repository.drizzle.ts'
import { CollectionPolicyService } from '../../collection-policy/service.ts'
import type { GoalRepository } from '../../goal/repository.ts'
import { GoalService } from '../../goal/service.ts'
import { createTrafficReport } from '../../traffic-report/index.ts'
import { AcceptanceRepositoryDrizzle } from '../../event-ingestion/repository.drizzle.ts'
import type { AcceptanceCandidate } from '../../event-ingestion/repository.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../../retention-policy/repository.drizzle.ts'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { createSiteScopeDependencies } from '../../site/scope.ts'
import type { HealthSnapshot } from '../../../health.ts'

const now = new Date('2026-09-05T00:00:00.000Z')

describe('GoalService.getReport', () => {
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

    await using fixture = await createReportFixture(repository)

    await expect(
      fixture.service.getReport(
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

async function createReportFixture(repository: GoalRepository) {
  const siteFixture = createSiteDrizzleFixture()
  const analytics = await createTestAnalyticsDb().catch((error) => {
    siteFixture[Symbol.dispose]()
    throw error
  })

  try {
    const db = siteFixture.db
    await new InstallationRepositoryDrizzle({ db }).insert(createInstallationInsertInput())
    await new RetentionPolicyRepositoryDrizzle({ db }).refreshDueBoundaries(now)

    const policyRevision = db
      .select({ id: schema.TCollectionPolicyRevision.id })
      .from(schema.TCollectionPolicyRevision)
      .limit(1)
      .all()[0]
    if (policyRevision === undefined) throw new Error('Expected a collection policy revision')

    await new AcceptanceRepositoryDrizzle({ db }).append([
      customEventCandidate({
        eventId: 'evt-visitor',
        occurrenceTime: '2026-09-01T10:01:00.000Z',
        visitorId: 'vis-1',
        identifiedUserId: null,
        analyticsSessionId: 'ses-visitor',
        policyRevisionId: policyRevision.id,
        replaySequence: 1,
      }),
      customEventCandidate({
        eventId: 'evt-identified',
        occurrenceTime: '2026-09-01T11:01:00.000Z',
        visitorId: 'vis-2',
        identifiedUserId: 'usr-1',
        analyticsSessionId: 'ses-identified',
        policyRevisionId: policyRevision.id,
        replaySequence: 2,
      }),
    ])
    await analytics.rebuild({ controlDb: db })

    const scope = createSiteScopeDependencies({ db })
    const collectionPolicy = new CollectionPolicyService({
      repository: new CollectionPolicyRepositoryDrizzle({ db }),
      lock: new InMemoryLifecycleLock(),
      scope,
      lifecycle: new InMemoryLifecycleOperationStatusReader(),
    })
    const trafficReport = createTrafficReport({
      db,
      analytics,
      lifecycle: {
        async getSnapshot(): Promise<HealthSnapshot> {
          return {
            installationStatus: 'ready',
            controlStore: 'ready',
            analyticsStore: 'ready',
            cleanupPending: false,
          }
        },
      },
      dataDirectoryReady: true,
      scope,
      profileFilterKeys: new CollectionPolicyReportingProfileFilter({ collectionPolicy }),
    })

    return {
      service: new GoalService({
        repository,
        scope,
        admission: trafficReport.admission,
        lifecycleLock: new InMemoryLifecycleLock(),
        analytics,
        db,
      }),
      async [Symbol.asyncDispose]() {
        try {
          await analytics.close()
        } finally {
          siteFixture[Symbol.dispose]()
        }
      },
    }
  } catch (error) {
    try {
      await analytics.close()
    } finally {
      siteFixture[Symbol.dispose]()
    }
    throw error
  }
}

function customEventCandidate(input: {
  readonly eventId: string
  readonly occurrenceTime: string
  readonly visitorId: string
  readonly identifiedUserId: string | null
  readonly analyticsSessionId: string
  readonly policyRevisionId: string
  readonly replaySequence: number
}): AcceptanceCandidate {
  return {
    siteId: 'ste_1',
    event: {
      eventId: input.eventId,
      occurrenceTime: input.occurrenceTime,
      identifiedUserId: input.identifiedUserId,
      anonymousIdentityId: null,
      properties: {},
      kind: 'custom_event',
      name: 'signup',
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      deviceType: null,
      browser: null,
      os: null,
      country: null,
      botPolicyOutcome: 'included',
    },
    receiptTime: input.occurrenceTime,
    late: false,
    policyRevisionId: input.policyRevisionId,
    payloadFingerprint: input.eventId,
    visitorId: input.visitorId,
    analyticsSessionId: input.analyticsSessionId,
    replaySequence: input.replaySequence,
  }
}
