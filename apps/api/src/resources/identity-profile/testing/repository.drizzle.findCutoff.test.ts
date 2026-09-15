import { describe, expect, it } from 'vitest'
import { schema, type Db } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../repository.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'

const firstSeenAt = new Date('2026-09-10T06:00:00.000Z')

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

describe('IdentityProfileRepositoryDrizzle.findCutoff', () => {
  it('hides an active profile whose lastSeenAt is before the profile activity cutoff', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    const repository = new IdentityProfileRepositoryDrizzle({ db: fixture.db })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: undefined,
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })
    const cutoff = new Date('2026-09-10T06:01:00.000Z')
    seedProfileActivityCutoff(fixture.db, cutoff)

    await expect(
      repository.find({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        profileActivityCutoffAt: cutoff,
      }),
    ).resolves.toBeUndefined()
    await expect(
      repository.find({ siteId: 'ste_1', identifiedUserId: 'app_user_1' }),
    ).resolves.toMatchObject({ status: 'active' })
  })
})
