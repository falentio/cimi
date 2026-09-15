import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
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

describe('CollectionPolicyRepositoryDrizzle.revisionIntervals', () => {
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
})
