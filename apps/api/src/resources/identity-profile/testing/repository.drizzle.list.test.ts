import { describe, expect, it } from 'vitest'
import { schema, type Db } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')
const later = new Date('2026-09-10T06:05:00.000Z')

function seedProfileActivityCutoff(db: Db, cutoffAt: Date): void {
  db.insert(schema.TRetentionEffectiveCutoff)
    .values({
      siteId: 'ste_1',
      installationId: 'ins_1',
      policyId: 'rtn_1',
      reportingTimezone: 'UTC',
      localDay: '2026-09-10',
      eventOccurrenceCutoffAt: cutoffAt,
      rawReceiptCutoffAt: cutoffAt,
      profileActivityCutoffAt: cutoffAt,
      replayReceiptCutoffAt: null,
      effectiveAt: cutoffAt,
      updatedAt: cutoffAt,
    })
    .run()
}

describe('IdentityProfileRepositoryDrizzle.list', () => {
  it('lists active and inactive profiles by stable creation order', async () => {
    using fixture = createSiteDrizzleFixture()
    let nextId = 0
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => `ipr_${++nextId}`,
        identityLinkId: () => `ilk_${++nextId}`,
        identityRedactionId: () => `ird_${++nextId}`,
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_2',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: later,
    })
    await repository.requestDeletion({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      now: later,
    })

    await expect(repository.list({ siteId: 'ste_1', offset: 0, limit: 1 })).resolves.toMatchObject({
      items: [{ status: 'deletion-requested' }],
      nextOffset: 1,
      hasMore: true,
      totalCount: 2,
    })
    await expect(repository.list({ siteId: 'ste_1', offset: 1, limit: 1 })).resolves.toMatchObject({
      items: [{ identifiedUserId: 'app_user_2', status: 'active' }],
      nextOffset: null,
      hasMore: false,
      totalCount: 2,
    })
    await expect(repository.list({ siteId: 'ste_1', offset: 2, limit: 1 })).resolves.toEqual({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 2,
    })
  })

  it('excludes a cut-off active profile from the profile list', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    let nextId = 0
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => `ipr_${++nextId}`,
        identityLinkId: () => `ilk_${++nextId}`,
        identityRedactionId: () => `ird_${++nextId}`,
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_2',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: new Date('2026-09-10T06:10:00.000Z'),
    })
    const cutoff = new Date('2026-09-10T06:01:00.000Z')
    seedProfileActivityCutoff(fixture.db, cutoff)

    await expect(
      repository.list({ siteId: 'ste_1', offset: 0, limit: 20, profileActivityCutoffAt: cutoff }),
    ).resolves.toMatchObject({
      items: [{ identifiedUserId: 'app_user_2', status: 'active' }],
      totalCount: 1,
    })
  })
})
