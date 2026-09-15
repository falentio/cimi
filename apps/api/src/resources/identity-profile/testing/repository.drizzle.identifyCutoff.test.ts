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

describe('IdentityProfileRepositoryDrizzle.identifyCutoff', () => {
  it('rejects a trait update on an active profile past the activity cutoff', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    const repository = new IdentityProfileRepositoryDrizzle({ db: fixture.db })
    await repository.identify({
      siteId: 'ste_1',
      identifiedUserId: 'app_user_1',
      traits: { plan: 'pro' },
      anonymousIdentityId: undefined,
      now: firstSeenAt,
    })
    const cutoff = new Date('2026-09-10T06:01:00.000Z')
    seedProfileActivityCutoff(fixture.db, cutoff)

    await expect(
      repository.identify({
        siteId: 'ste_1',
        identifiedUserId: 'app_user_1',
        traits: { plan: 'team' },
        anonymousIdentityId: undefined,
        now: later,
        profileActivityCutoffAt: cutoff,
      }),
    ).resolves.toEqual({ kind: 'conflict' })
    const stored = fixture.db
      .select({ traits: schema.TIdentityProfile.traits })
      .from(schema.TIdentityProfile)
      .all()[0]
    expect(stored?.traits).toEqual({ plan: 'pro' })
  })
})
