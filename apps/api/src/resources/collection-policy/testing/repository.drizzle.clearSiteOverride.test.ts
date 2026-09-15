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

describe('CollectionPolicyRepositoryDrizzle.clearSiteOverride', () => {
  it('clears a Site override and restores installation inheritance', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )
    await fixture.repository.commitRevision({
      target: { scope: 'site', siteId: 'ste_1' },
      values: { ...contractSchema.DEFAULT_COLLECTION_POLICY, captureQueryStrings: true },
      revisionId: 'cpr_site_1',
      changedBy: null,
      now,
    })

    const result = await fixture.repository.commitRevision({
      target: { scope: 'site', siteId: 'ste_1' },
      values: null,
      revisionId: 'cpr_site_clear',
      changedBy: null,
      now: new Date(now.getTime() + 1),
    })

    expect(result.layers.site).toBeNull()
    expect(result.resolution?.effective.values).toEqual(contractSchema.DEFAULT_COLLECTION_POLICY)
    await expect(fixture.repository.loadLayers('ste_1')).resolves.toMatchObject({ site: null })
  })
})
