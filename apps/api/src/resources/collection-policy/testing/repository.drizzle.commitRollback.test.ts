import { describe, expect, it } from 'vitest'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
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

describe('CollectionPolicyRepositoryDrizzle.commitRollback', () => {
  it('rolls back a close when the replacement revision cannot be inserted', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )
    const values = contractSchema.DEFAULT_COLLECTION_POLICY
    await fixture.repository.commitRevision({
      target: { scope: 'site', siteId: 'ste_1' },
      values,
      revisionId: 'cpr_site_1',
      changedBy: null,
      now,
    })

    await expect(
      fixture.repository.commitRevision({
        target: { scope: 'site', siteId: 'ste_1' },
        values,
        revisionId: 'cpr_site_1',
        changedBy: null,
        now: new Date(now.getTime() + 1),
      }),
    ).rejects.toThrow()
    await expect(fixture.repository.loadLayers('ste_1')).resolves.toMatchObject({
      site: { id: 'cpr_site_1', version: 1 },
    })
  })
})
