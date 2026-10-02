import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture, createSiteTombstoneRow } from '../fixture.drizzle.ts'
import { createSiteIngestionPort } from '../ingestion-port.ts'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'

describe.concurrent('createSiteIngestionPort', () => {
  it('projects an active Site onto the port record', async () => {
    using fixture = createSiteDrizzleFixture()
    const port = createSiteIngestionPort({
      repository: new SiteRepositoryDrizzle({ db: fixture.db }),
    })

    await expect(port.findActiveByIngestionIdentifier('ing_1')).resolves.toEqual({
      id: 'ste_1',
      hostname: 'example.com',
      reportingTimezone: 'UTC',
    })
  })

  it('answers undefined for an unknown ingestion identifier', async () => {
    using fixture = createSiteDrizzleFixture()
    const port = createSiteIngestionPort({
      repository: new SiteRepositoryDrizzle({ db: fixture.db }),
    })

    await expect(port.findActiveByIngestionIdentifier('ing_missing')).resolves.toBeUndefined()
  })

  it('answers undefined for a Site that is not active', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .update(schema.TSite)
      .set({ status: 'deleting' })
      .where(eq(schema.TSite.id, 'ste_1'))
      .run()
    const port = createSiteIngestionPort({
      repository: new SiteRepositoryDrizzle({ db: fixture.db }),
    })

    await expect(port.findActiveByIngestionIdentifier('ing_1')).resolves.toBeUndefined()
  })

  it('answers undefined for a tombstoned Site', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db.insert(schema.TSiteTombstone).values(createSiteTombstoneRow()).run()
    const port = createSiteIngestionPort({
      repository: new SiteRepositoryDrizzle({ db: fixture.db }),
    })

    await expect(port.findActiveByIngestionIdentifier('ing_1')).resolves.toBeUndefined()
  })
})
