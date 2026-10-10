import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema, type AnalyticsDb, type Db } from '@cimi/db'
import { DEMO_SITE_NAME, InMemoryRetentionResolver } from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import type { DemoSitePort, DemoSeedJournalPort } from '../ports.ts'
import { DemoSeedService } from '../service.ts'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'

function createService(db: Db, analytics: AnalyticsDb) {
  return new DemoSeedService({
    sites: mock<DemoSitePort>(),
    journal: mock<DemoSeedJournalPort>(),
    retention: new InMemoryRetentionResolver(),
    controlDb: db,
    analytics,
    clock: () => new Date('2026-04-01T12:00:00.000Z'),
  })
}

function createAnalytics() {
  const analytics = mock<AnalyticsDb>()
  analytics.purgeSite.mockResolvedValue(undefined)

  return analytics
}

function seedAcceptedEvent(db: Db) {
  const revision = db
    .select({ id: schema.TCollectionPolicyRevision.id })
    .from(schema.TCollectionPolicyRevision)
    .limit(1)
    .all()[0]

  expect(revision).toBeDefined()
  db.insert(schema.TAcceptedEvent)
    .values({
      siteId: 'ste_1',
      eventId: 'ste_1-e0',
      eventKind: 'page_view',
      occurrenceTime: new Date('2026-03-30T09:15:00.000Z'),
      receiptTime: new Date('2026-04-01T12:00:00.000Z'),
      late: false,
      policyRevisionId: revision?.id ?? '',
      replaySequence: 1,
      payloadFingerprint: 'fp',
      createdAt: new Date('2026-04-01T12:00:00.000Z'),
    })
    .run()
  db.insert(schema.TEventPayload).values({ eventPk: 1, canonicalPayloadJson: '{}' }).run()
}

describe('DemoSeedService.removeSeed', () => {
  it('clears the rows the seed wrote and purges the analytics store', async () => {
    using siteFixture = createSiteDrizzleFixture()
    const db = siteFixture.db
    await new InstallationRepositoryDrizzle({ db }).insert(createInstallationInsertInput())
    const analytics = createAnalytics()
    const service = createService(db, analytics)
    db.update(schema.TSite).set({ name: DEMO_SITE_NAME }).where(eq(schema.TSite.id, 'ste_1')).run()
    seedAcceptedEvent(db)

    await service.removeSeed({ organizationId: 'org_1' })

    expect(db.select().from(schema.TAcceptedEvent).all()).toEqual([])
    expect(db.select().from(schema.TEventPayload).all()).toEqual([])
    expect(db.select().from(schema.TSite).all()).toEqual([])
    expect(analytics.purgeSite).toHaveBeenCalledWith({ siteId: 'ste_1' })
  })

  it('leaves a site the owner wrote alone', async () => {
    using siteFixture = createSiteDrizzleFixture()
    const db = siteFixture.db
    const analytics = createAnalytics()
    const service = createService(db, analytics)
    db.update(schema.TSite).set({ name: 'Production' }).where(eq(schema.TSite.id, 'ste_1')).run()

    await service.removeSeed({ organizationId: 'org_1' })

    expect(db.select({ id: schema.TSite.id }).from(schema.TSite).all()).toEqual([{ id: 'ste_1' }])
    expect(analytics.purgeSite).not.toHaveBeenCalled()
  })
})
