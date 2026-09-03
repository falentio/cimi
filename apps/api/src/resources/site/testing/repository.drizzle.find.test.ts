import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'
import { createSiteDrizzleFixture, createSiteRow } from '../fixture.drizzle.ts'

describe.concurrent('SiteRepositoryDrizzle.find', () => {
  it('returns the site record for a known id', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findById('site_1')).resolves.toMatchObject({
      id: 'site_1',
      organizationId: 'organization_1',
      status: 'active',
    })
  })

  it('returns undefined for a missing id', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findById('site_missing')).resolves.toBeUndefined()
  })

  it('lists active sites with pagination metadata', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TSite)
      .values(
        createSiteRow({
          id: 'site_2',
          hostname: 'second.example.com',
          ingestionIdentifier: 'ingest_2',
        }),
      )
      .run()

    await expect(repo.findMany('organization_1', { offset: 0, limit: 1 })).resolves.toMatchObject({
      items: [{ id: 'site_1' }],
      nextOffset: 1,
      hasMore: true,
      totalCount: 2,
    })
    await expect(repo.findMany('organization_1', { offset: 1, limit: 1 })).resolves.toMatchObject({
      items: [{ id: 'site_2' }],
      nextOffset: null,
      hasMore: false,
      totalCount: 2,
    })
  })

  it('excludes non-active sites from listings', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TSite)
      .values(
        createSiteRow({
          id: 'site_2',
          hostname: 'second.example.com',
          ingestionIdentifier: 'ingest_2',
          status: 'deleted',
        }),
      )
      .run()

    await expect(repo.findMany('organization_1', { offset: 0, limit: 20 })).resolves.toMatchObject({
      items: [{ id: 'site_1' }],
      totalCount: 1,
      hasMore: false,
      nextOffset: null,
    })
  })

  it('returns an empty page for an unknown organization', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findMany('organization_missing', { offset: 0, limit: 20 })).resolves.toEqual({
      items: [],
      nextOffset: null,
      hasMore: false,
      totalCount: 0,
    })
  })
})
