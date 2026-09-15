import { describe, expect, it } from 'vitest'
import { isNull } from 'drizzle-orm'
import { SProfileTraits } from '@cimi/contract'
import { schema } from '@cimi/db'
import { safeParse } from 'valibot'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')
const later = new Date('2026-09-10T06:05:00.000Z')

describe('IdentityProfileRepositoryDrizzle.identifyTraits', () => {
  it('updates traits by removing null markers and preserves the current Alias', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
        identityLinkId: () => 'ilk_1',
        identityRedactionId: () => 'ird_1',
      },
    })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: { plan: 'pro', team: 'core' },
      anonymousIdentityId: 'ano_1',
      now: firstSeenAt,
    })

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: null, team: 'platform' },
        anonymousIdentityId: 'ano_1',
        now: later,
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({
      traits: { team: 'platform' },
      aliases: ['ano_1'],
      profileEpoch: 1,
      lastSeenAt: later.toISOString(),
    })
    expect(
      fixture.db
        .select({ profileId: schema.TIdentityLink.profileId })
        .from(schema.TIdentityLink)
        .where(isNull(schema.TIdentityLink.unlinkedAt))
        .all(),
    ).toHaveLength(1)
  })

  it('rejects an update that would exceed the Trait key bound', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({ db: fixture.db })
    const traits = Object.fromEntries(
      Array.from({ length: 64 }, (_, index) => [`trait-${index}`, 'value']),
    )
    expect(safeParse(SProfileTraits, { ...traits, extra: 'value' }).success).toBe(false)

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits,
        anonymousIdentityId: undefined,
        now: firstSeenAt,
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({ traits })
    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { extra: 'value' },
        anonymousIdentityId: undefined,
        now: later,
      }),
    ).resolves.toEqual({ kind: 'invalid' })
  })
})
