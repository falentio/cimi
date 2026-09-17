import { describe, expect, it } from 'vitest'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')

describe('IdentityProfileRepositoryDrizzle.identifyEpoch', () => {
  it('creates an active Profile Epoch and links the current Alias', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
        identityLinkId: () => 'ilk_1',
        identityRedactionId: () => 'ird_1',
      },
    })

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: 'pro' },
        anonymousIdentityId: 'ano_1',
        now: firstSeenAt,
      }),
    ).resolves.toEqual({
      kind: 'accepted',
      output: {
        identifiedUserId: 'app_user_1',
        status: 'active',
        updatedAt: firstSeenAt.toISOString(),
      },
    })

    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toEqual({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: { plan: 'pro' },
      aliases: ['ano_1'],
      profileEpoch: 1,
      identityHistory: [
        {
          epoch: 1,
          status: 'active',
          startedAt: firstSeenAt.toISOString(),
          endedAt: null,
        },
      ],
      status: 'active',
      createdAt: firstSeenAt.toISOString(),
      updatedAt: firstSeenAt.toISOString(),
      firstSeenAt: firstSeenAt.toISOString(),
      lastSeenAt: firstSeenAt.toISOString(),
    })
  })
})
