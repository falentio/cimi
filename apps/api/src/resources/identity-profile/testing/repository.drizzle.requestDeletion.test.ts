import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')
const later = new Date('2026-09-10T06:05:00.000Z')

describe('IdentityProfileRepositoryDrizzle.requestDeletion', () => {
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
    expect(
      fixture.db
        .select({ reason: schema.TIdentityRedaction.reason })
        .from(schema.TIdentityRedaction)
        .all(),
    ).toEqual([{ reason: 'explicit' }])
    await expect(
      repository.getDeletionStatus({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toEqual({
      status: 'deletion-requested',
      updatedAt: later.toISOString(),
      derivedCleanup: { status: 'pending', updatedAt: later.toISOString() },
      backupCleanup: { status: 'pending', updatedAt: later.toISOString() },
    })
  })
})
