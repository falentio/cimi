import { describe, expect, it } from 'vitest'
import { eq, isNull } from 'drizzle-orm'
import { SProfileTraits } from '@cimi/contract'
import { schema } from '@cimi/db'
import { safeParse } from 'valibot'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')
const later = new Date('2026-09-10T06:05:00.000Z')

describe('IdentityProfileRepositoryDrizzle', () => {
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
  })

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
  })

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

  it('requests deletion once and reports pending cleanup', async () => {
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

    await expect(
      repository.requestDeletion({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        now: later,
      }),
    ).resolves.toEqual({
      kind: 'accepted',
      output: { accepted: true, status: 'deletion-requested' },
    })
    await expect(
      repository.requestDeletion({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        now: later,
      }),
    ).resolves.toEqual({ kind: 'conflict' })
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toEqual({ status: 'deletion-requested' })
    await expect(
      repository.getDeletionStatus({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toEqual({
      status: 'deletion-requested',
      updatedAt: later.toISOString(),
      derivedCleanup: { status: 'pending', updatedAt: later.toISOString() },
      backupCleanup: { status: 'pending', updatedAt: later.toISOString() },
    })
  })

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
})
