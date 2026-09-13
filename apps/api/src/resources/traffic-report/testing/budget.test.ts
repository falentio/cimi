import { expect, it, vi } from 'vitest'
import { DuckDbReportingQuery } from '@cimi/db'
import { ReportingAdmissionService } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../../site/scope.ts'
import {
  ReportingEvidenceDrizzleDuckDb,
  ReportingMetadataDrizzle,
  createReportingReadinessPort,
} from '../index.ts'
import { TrafficReportService } from '../service.ts'
import { createApiTestFixture } from '../../../testing/fixture.ts'
import {
  createOwnerSite,
  readyLifecycle,
  seedAcceptedEvents,
} from '../../../testing/reporting-fixture.ts'

const DAY_ONE = '2026-09-05'
const DAY_TWO = '2026-09-06'

/**
 * Builds the real service over a real projection and the real repositories, then observes the real
 * admission call. No port is mocked; the only instrument is a spy on the collaborator.
 */
async function buildOwner() {
  const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { siteId } = await createOwnerSite(fixture.app, fixture.db, 'budget-owner@example.com')
  seedAcceptedEvents(fixture.db, siteId, [
    {
      sessionId: 's1',
      visitorId: 'v1',
      kind: 'page_view',
      at: Date.parse(`${DAY_ONE}T10:00:00.000Z`),
      pagePath: '/a',
    },
  ])
  await fixture.analytics.rebuild({ controlDb: fixture.db })

  const lifecycle = readyLifecycle()
  const admission = new ReportingAdmissionService({
    metadata: new ReportingMetadataDrizzle({ db: fixture.db }),
    evidence: new ReportingEvidenceDrizzleDuckDb({ db: fixture.db, analytics: fixture.analytics }),
    analyticsReadiness: createReportingReadinessPort({
      health: { db: fixture.db, analytics: fixture.analytics, dataDirectoryReady: true },
      lifecycle,
    }),
  })
  const admit = vi.spyOn(admission, 'admit')
  const service = new TrafficReportService({
    admission,
    query: new DuckDbReportingQuery({ analytics: fixture.analytics }),
    profileFilterKeys: {
      async getProfileFilterKeys() {
        return []
      },
    },
    scope: createSiteScopeDependencies({ db: fixture.db }),
  })
  const owner = fixture.db.$client
    .prepare('SELECT user_id AS userId FROM auth_member ORDER BY created_at LIMIT 1')
    .get() as { userId: string } | undefined
  if (owner === undefined) throw new Error('createOwnerSite did not seed an owner membership')
  return { fixture, service, admit, siteId, userId: owner.userId }
}

it('requests the aggregate Fact-Work budget for an overview', async () => {
  const owner = await buildOwner()
  await using _ = owner.fixture

  await owner.service.getOverview(
    { siteId: owner.siteId, fromDate: DAY_ONE, toDate: DAY_TWO, granularity: 'day' },
    { id: owner.userId },
  )

  expect(owner.admit).toHaveBeenCalledWith(
    expect.objectContaining({ work: expect.objectContaining({ budget: 25_000_000 }) }),
  )
})

it('requests the breakdown Fact-Work budget for a breakdown', async () => {
  const owner = await buildOwner()
  await using _ = owner.fixture

  await owner.service.getBreakdowns(
    {
      siteId: owner.siteId,
      fromDate: DAY_ONE,
      toDate: DAY_TWO,
      granularity: 'day',
      dimension: 'page',
    },
    { id: owner.userId },
  )

  expect(owner.admit).toHaveBeenCalledWith(
    expect.objectContaining({ work: expect.objectContaining({ budget: 10_000_000 }) }),
  )
})
