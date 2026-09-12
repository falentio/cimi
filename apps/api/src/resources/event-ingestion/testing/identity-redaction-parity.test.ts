import { describe, expect, it } from 'vitest'
import { schema, type Db } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../../retention-policy/repository.drizzle.ts'
import { IdentityProfileRepositoryDrizzle } from '../../identity-profile/repository.drizzle.ts'

const now = new Date('2026-09-05T14:30:00.000Z')

function seedActiveProfile(db: Db, lastSeenAt: Date): void {
  db.insert(schema.TIdentityProfile)
    .values({
      profileId: 'profile_1',
      siteId: 'ste_1',
      identifiedUserId: 'user_1',
      status: 'active',
      profileEpoch: 1,
      traits: null,
      firstSeenAt: lastSeenAt,
      lastSeenAt,
      createdAt: lastSeenAt,
      updatedAt: lastSeenAt,
    })
    .run()
  db.insert(schema.TIdentityProfileEpoch)
    .values({
      profileId: 'profile_1',
      siteId: 'ste_1',
      identifiedUserId: 'user_1',
      epoch: 1,
      status: 'active',
      startedAt: lastSeenAt,
      endedAt: null,
      redactedAt: null,
    })
    .run()
}

function transitionShape(db: Db) {
  const redaction = db.select().from(schema.TIdentityRedaction).all()[0]
  const profile = db.select().from(schema.TIdentityProfile).all()[0]
  return {
    profileStatus: profile?.status,
    redactionStatus: redaction?.status,
    derivedCleanupStatus: redaction?.derivedCleanupStatus,
    backupCleanupStatus: redaction?.backupCleanupStatus,
    profileEpoch: redaction?.profileEpoch,
    appliedAt: redaction?.appliedAt ?? null,
  }
}

describe('identity redaction transition', () => {
  it('shapes a retention expiry redaction like an explicit decomposition request', async () => {
    using retentionFixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: retentionFixture.db }).insert(
      createInstallationInsertInput(),
    )
    seedActiveProfile(retentionFixture.db, new Date('2025-01-01T00:00:00.000Z'))
    const retention = new RetentionPolicyRepositoryDrizzle({ db: retentionFixture.db })
    await retention.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: null },
      policyId: 'rtn_2',
      changedBy: 'user_1',
      now,
    })

    using explicitFixture = createSiteDrizzleFixture()
    seedActiveProfile(explicitFixture.db, now)
    await new IdentityProfileRepositoryDrizzle({ db: explicitFixture.db }).requestDeletion({
      siteId: 'ste_1',
      identifiedUserId: 'user_1',
      now,
    })

    const retentionShape = transitionShape(retentionFixture.db)
    const explicitShape = transitionShape(explicitFixture.db)
    expect(retentionShape).toEqual(explicitShape)
    expect(retentionShape).toMatchObject({
      profileStatus: 'deletion-requested',
      redactionStatus: 'requested',
      derivedCleanupStatus: 'pending',
      backupCleanupStatus: 'pending',
      profileEpoch: 1,
      appliedAt: null,
    })
  })
})
