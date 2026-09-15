import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')
const later = new Date('2026-09-10T06:05:00.000Z')

describe('IdentityProfileRepositoryDrizzle.epochRollover', () => {
  it('starts a new epoch only after the old redaction is complete', async () => {
    using fixture = createSiteDrizzleFixture()
    const repository = new IdentityProfileRepositoryDrizzle({
      db: fixture.db,
      ids: {
        identityProfileId: () => 'ipr_1',
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
      traits: { plan: 'pro' },
      anonymousIdentityId: 'ano_old',
      now: firstSeenAt,
    })
    await repository.requestDeletion({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      now: later,
    })
    fixture.db
      .update(schema.TIdentityProfileEpoch)
      .set({ status: 'redacted', endedAt: later, redactedAt: later })
      .where(eq(schema.TIdentityProfileEpoch.epoch, 1))
      .run()
    fixture.db
      .update(schema.TIdentityRedaction)
      .set({
        status: 'applied',
        appliedAt: later,
        derivedCleanupStatus: 'complete',
        backupCleanupStatus: 'complete',
        derivedCleanupUpdatedAt: later,
        backupCleanupUpdatedAt: later,
        updatedAt: later,
      })
      .run()
    fixture.db
      .update(schema.TIdentityProfile)
      .set({ status: 'deleted', updatedAt: later })
      .where(eq(schema.TIdentityProfile.profileId, 'ipr_1'))
      .run()

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: 'enterprise' },
        anonymousIdentityId: 'ano_new',
        now: new Date(later.getTime() + 1),
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({
      status: 'active',
      profileEpoch: 2,
      traits: { plan: 'enterprise' },
      aliases: ['ano_new'],
      identityHistory: [
        { epoch: 1, status: 'redacted' },
        { epoch: 2, status: 'active' },
      ],
    })
  })

  it('starts epoch 33 while exposing only the latest 32 history entries', async () => {
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
      traits: undefined,
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })
    const endedAt = later
    fixture.db
      .update(schema.TIdentityProfileEpoch)
      .set({ status: 'redacted', endedAt, redactedAt: endedAt })
      .where(eq(schema.TIdentityProfileEpoch.epoch, 1))
      .run()
    for (let epoch = 2; epoch <= 32; epoch += 1) {
      fixture.db
        .insert(schema.TIdentityProfileEpoch)
        .values({
          profileId: 'ipr_1',
          siteId: 'ste_1',
          identifiedUserId: 'app_user_1',
          epoch,
          status: 'redacted',
          startedAt: firstSeenAt,
          endedAt,
          redactedAt: endedAt,
        })
        .run()
    }
    fixture.db
      .update(schema.TIdentityProfile)
      .set({ status: 'deleted', profileEpoch: 32, updatedAt: endedAt })
      .where(eq(schema.TIdentityProfile.profileId, 'ipr_1'))
      .run()
    fixture.db
      .insert(schema.TIdentityRedaction)
      .values({
        id: 'ird_32',
        siteId: 'ste_1',
        profileId: 'ipr_1',
        identifiedUserId: 'app_user_1',
        profileEpoch: 32,
        reason: 'explicit',
        status: 'applied',
        requestedAt: endedAt,
        appliedAt: endedAt,
        derivedCleanupStatus: 'complete',
        backupCleanupStatus: 'complete',
        derivedCleanupUpdatedAt: endedAt,
        backupCleanupUpdatedAt: endedAt,
        createdAt: endedAt,
        updatedAt: endedAt,
      })
      .run()

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: 'enterprise' },
        anonymousIdentityId: undefined,
        now: new Date('2026-09-10T06:10:00.000Z'),
      }),
    ).resolves.toMatchObject({ kind: 'accepted' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({
      profileEpoch: 33,
    })
    const profile = await repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' })
    if (profile?.status !== 'active') throw new Error('Expected an active profile')
    expect(profile.identityHistory).toHaveLength(32)
    expect(profile.identityHistory[0]?.epoch).toBe(2)
    expect(profile.identityHistory.at(-1)?.epoch).toBe(33)
  })
})
