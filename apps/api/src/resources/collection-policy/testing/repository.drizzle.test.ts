import { and, eq } from 'drizzle-orm'
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

describe('CollectionPolicyRepositoryDrizzle', () => {
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

  it('commits target-local immutable revisions and returns the Site resolution', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )
    const override = {
      ...contractSchema.DEFAULT_COLLECTION_POLICY,
      captureQueryStrings: true,
    }

    const first = await fixture.repository.commitRevision({
      target: { scope: 'site', siteId: 'ste_1' },
      values: override,
      revisionId: 'cpr_site_1',
      changedBy: 'user_1',
      now,
    })
    const later = new Date(now.getTime() + 1)
    const second = await fixture.repository.commitRevision({
      target: { scope: 'site', siteId: 'ste_1' },
      values: { ...override, captureQueryStrings: false },
      revisionId: 'cpr_site_2',
      changedBy: 'user_1',
      now: later,
    })

    expect(first.resolution?.effective.values).toEqual(override)
    expect(second.layers.site).toMatchObject({ id: 'cpr_site_2', version: 2 })
    expect(second.resolution?.provenance.captureQueryStrings).toBe('site')
    const rows = fixture.db
      .select({
        id: schema.TCollectionPolicyRevision.id,
        version: schema.TCollectionPolicyRevision.version,
        effectiveTo: schema.TCollectionPolicyRevision.effectiveTo,
      })
      .from(schema.TCollectionPolicyRevision)
      .where(
        and(
          eq(schema.TCollectionPolicyRevision.siteId, 'ste_1'),
          eq(schema.TCollectionPolicyRevision.scope, 'site'),
        ),
      )
      .all()
    expect(rows).toEqual([
      { id: 'cpr_site_1', version: 1, effectiveTo: later },
      { id: 'cpr_site_2', version: 2, effectiveTo: null },
    ])
  })

  it('keeps same-time revisions in valid effective intervals', async () => {
    using fixture = createFixture()
    await fixture.installation.insert(
      createInstallationInsertInput({ createdAt, updatedAt: createdAt }),
    )

    await fixture.repository.commitRevision({
      target: { scope: 'site', siteId: 'ste_1' },
      values: contractSchema.DEFAULT_COLLECTION_POLICY,
      revisionId: 'cpr_site_1',
      changedBy: null,
      now,
    })
    await expect(
      fixture.repository.commitRevision({
        target: { scope: 'site', siteId: 'ste_1' },
        values: contractSchema.DEFAULT_COLLECTION_POLICY,
        revisionId: 'cpr_site_2',
        changedBy: null,
        now,
      }),
    ).resolves.toMatchObject({ layers: { site: { id: 'cpr_site_2', version: 2 } } })

    const rows = fixture.db
      .select({
        id: schema.TCollectionPolicyRevision.id,
        effectiveFrom: schema.TCollectionPolicyRevision.effectiveFrom,
        effectiveTo: schema.TCollectionPolicyRevision.effectiveTo,
      })
      .from(schema.TCollectionPolicyRevision)
      .where(
        and(
          eq(schema.TCollectionPolicyRevision.siteId, 'ste_1'),
          eq(schema.TCollectionPolicyRevision.scope, 'site'),
        ),
      )
      .all()

    const next = new Date(now.getTime() + 1)
    expect(rows).toEqual([
      { id: 'cpr_site_1', effectiveFrom: now, effectiveTo: next },
      { id: 'cpr_site_2', effectiveFrom: next, effectiveTo: null },
    ])
  })

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
