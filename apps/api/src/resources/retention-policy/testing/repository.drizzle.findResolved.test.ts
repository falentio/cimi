import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')

function createFixture() {
  const siteFixture = createSiteDrizzleFixture()
  return {
    db: siteFixture.db,
    installation: new InstallationRepositoryDrizzle({ db: siteFixture.db }),
    repository: new RetentionPolicyRepositoryDrizzle({ db: siteFixture.db }),
    [Symbol.dispose]() {
      siteFixture[Symbol.dispose]()
    },
  }
}

describe('RetentionPolicyRepositoryDrizzle', () => {
  it('rejects resolution when no installation exists', async () => {
    using fixture = createFixture()
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })

    await expect(repository.findResolved({ siteId: null })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('falls back to the built-in 12/12/null default without policy rows', async () => {
    using fixture = createFixture()
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TInstallation)
      .values({
        id: 'ins_1',
        singletonKey: 'default',
        status: 'uninitialized',
        eventRetentionMonths: 12,
        profileRetentionMonths: 12,
        replayRetentionMonths: null,
        dataDirectoryReady: false,
        createdAt,
        updatedAt: createdAt,
      })
      .run()

    await expect(repository.findResolved({ siteId: null })).resolves.toEqual({
      installationId: 'ins_1',
      installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      siteOverride: null,
      effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      updatedAt: createdAt.toISOString(),
    })
  })
})
