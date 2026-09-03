// Ingestion-side rejection of the old identifier belongs to wave C; storage proves rotation here.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'
import { createSiteDrizzleFixture } from '../fixture.drizzle.ts'

const requestedAt = new Date('2026-09-01T00:00:00.000Z')
const completedAt = new Date('2026-09-02T00:00:00.000Z')

function identifiersFor(db: ReturnType<typeof createSiteDrizzleFixture>['db'], value: string) {
  return db
    .select({ id: schema.TSite.id })
    .from(schema.TSite)
    .where(eq(schema.TSite.ingestionIdentifier, value))
    .all()
}

describe.concurrent('SiteRepositoryDrizzle.rotateFailClosed', () => {
  it('resolves the new identifier while the old resolves to nothing', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.rotateIngestionIdentifier('ste_1', 'ing_2'),
      'rotate returns the site with the new identifier',
    ).resolves.toMatchObject({ id: 'ste_1', ingestionIdentifier: 'ing_2' })
    await expect(
      repo.findById('ste_1'),
      'storage holds the new identifier via findById',
    ).resolves.toMatchObject({ id: 'ste_1', ingestionIdentifier: 'ing_2' })
    expect(
      identifiersFor(fixture.db, 'ing_1'),
      'old identifier resolves to nothing after rotate; ingestion-side rejection belongs to wave C',
    ).toEqual([])
    expect(identifiersFor(fixture.db, 'ing_2'), 'new identifier resolves to the site').toEqual([
      { id: 'ste_1' },
    ])
  })

  it('returns undefined when rotating a non-active site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await expect(
      repo.rotateIngestionIdentifier('ste_1', 'ing_2'),
      'rotate fails closed on a deleting site',
    ).resolves.toBeUndefined()

    await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })
    await expect(
      repo.rotateIngestionIdentifier('ste_1', 'ing_3'),
      'rotate fails closed on a deleted site',
    ).resolves.toBeUndefined()
    await expect(
      repo.findById('ste_1'),
      'failed rotate keeps the original identifier',
    ).resolves.toMatchObject({ ingestionIdentifier: 'ing_1' })
  })
})
