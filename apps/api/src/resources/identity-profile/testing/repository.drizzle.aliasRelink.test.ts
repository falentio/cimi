import { describe, expect, it } from 'vitest'
import { asc } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')
const later = new Date('2026-09-10T06:05:00.000Z')

describe('IdentityProfileRepositoryDrizzle.aliasRelink', () => {
  it('moves an Alias between profiles without leaving two current links', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: (() => {
          let next = 0
          return () => `ipr_${++next}`
        })(),
        identityLinkId: (() => {
          let next = 0
          return () => `ilk_${++next}`
        })(),
        identityRedactionId: () => 'ird_1',
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: 'ano_1',
      now: firstSeenAt,
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_2',
      traits: undefined,
      anonymousIdentityId: 'ano_1',
      now: later,
    })

    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({ aliases: [] })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_2' }),
    ).resolves.toMatchObject({ aliases: ['ano_1'] })
    expect(
      fixture.db
        .select({
          profileId: schema.TIdentityLink.profileId,
          effectiveFrom: schema.TIdentityLink.effectiveFrom,
          unlinkedAt: schema.TIdentityLink.unlinkedAt,
        })
        .from(schema.TIdentityLink)
        .orderBy(asc(schema.TIdentityLink.id))
        .all(),
    ).toEqual([
      { profileId: 'ipr_1', effectiveFrom: firstSeenAt, unlinkedAt: later },
      { profileId: 'ipr_2', effectiveFrom: later, unlinkedAt: null },
    ])
  })
})
