import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture, createSiteTombstoneRow } from '../../site/fixture.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { CollectionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'
import { schema as contractSchema } from '@cimi/contract'

const createdAt = new Date('2026-09-01T00:00:00.000Z')
const now = new Date('2026-09-05T00:00:00.000Z')

function createFixture() {
  const siteFixture = createSiteDrizzleFixture()
  return {
    db: siteFixture.db,
    installation: new InstallationRepositoryDrizzle({ db: siteFixture.db }),
    repository: new CollectionPolicyRepositoryDrizzle({ db: siteFixture.db }),
    [Symbol.dispose]() {
      siteFixture[Symbol.dispose]()
    },
  }
}

describe('CollectionPolicyRepositoryDrizzle.commitRevision', () => {
  it('rejects committing a policy for a tombstoned Site', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )
    fixture.db.insert(schema.TSiteTombstone).values(createSiteTombstoneRow()).run()

    await expect(
      fixture.repository.commitRevision({
        target: { scope: 'site', siteId: 'ste_1' },
        values: contractSchema.DEFAULT_COLLECTION_POLICY,
        revisionId: 'cpr_site_1',
        changedBy: null,
        now,
      }),
    ).rejects.toThrow()
  })
})
