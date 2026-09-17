import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture, createSiteTombstoneRow } from '../../site/fixture.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { CollectionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'
import { resolvePolicy } from '../model.ts'
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

describe('CollectionPolicyRepositoryDrizzle.loadLayers', () => {
  it('loads the bootstrapped installation layer with no Site override', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )

    const layers = await fixture.repository.loadLayers('ste_1')
    const resolution = resolvePolicy({ siteId: 'ste_1', layers })

    expect(layers).toMatchObject({
      installation: {
        id: expect.stringMatching(/^cpr_/),
        version: 1,
        target: { scope: 'installation' },
        values: contractSchema.DEFAULT_COLLECTION_POLICY,
      },
      site: null,
    })
    expect(resolution.effective.values).toEqual(contractSchema.DEFAULT_COLLECTION_POLICY)
  })

  it('does not load policy for a tombstoned Site', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )
    fixture.db.insert(schema.TSiteTombstone).values(createSiteTombstoneRow()).run()

    await expect(fixture.repository.loadLayers('ste_1')).rejects.toThrow()
  })

  it('parses stored JSON at the repository boundary', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )
    fixture.db
      .insert(schema.TCollectionPolicyRevision)
      .values({
        id: 'cpr_bad',
        installationId: 'ins_1',
        scope: 'site',
        siteId: 'ste_1',
        version: 1,
        policyJson: {},
        effectiveFrom: now,
        effectiveTo: null,
        committedAt: now,
        createdBy: null,
        createdAt: now,
      })
      .run()

    await expect(fixture.repository.loadLayers('ste_1')).rejects.toThrow()
  })
})
