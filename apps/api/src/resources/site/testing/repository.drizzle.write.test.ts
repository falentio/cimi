import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { ANALYTICS_PROJECTION_VERSION, schema } from '@cimi/db'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createSiteDrizzleFixture,
  createSiteRow,
  createSiteTombstoneRow,
} from '../fixture.drizzle.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')

describe.concurrent('SiteRepositoryDrizzle.write', () => {
  it('inserts and returns a site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.insert({
        id: 'ste_2',
        organizationId: 'org_1',
        name: 'Staging',
        hostname: 'staging.example.com',
        ingestionIdentifier: 'ing_2',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
        createdAt,
        updatedAt: createdAt,
      }),
    ).resolves.toMatchObject({ id: 'ste_2', hostname: 'staging.example.com' })
    await expect(
      fixture.db
        .select()
        .from(schema.TProjectionCheckpoint)
        .where(eq(schema.TProjectionCheckpoint.siteId, 'ste_2')),
    ).resolves.toMatchObject([
      expect.objectContaining({
        siteId: 'ste_2',
        projectedReplaySequence: 0,
        readiness: 'ready',
        projectionVersion: ANALYTICS_PROJECTION_VERSION,
      }),
    ])
    await expect(repo.findById('ste_2')).resolves.toMatchObject({ status: 'active' })
  })

  it('rejects an insert reserved by a tombstone', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TSiteTombstone)
      .values(createSiteTombstoneRow({ hostname: 'staging.example.com' }))
      .run()

    await expect(
      repo.insert({
        id: 'ste_2',
        organizationId: 'org_1',
        name: 'Staging',
        hostname: 'staging.example.com',
        ingestionIdentifier: 'ing_2',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
        createdAt,
        updatedAt: createdAt,
      }),
    ).rejects.toThrow(/reserved/)
  })

  it('allows the same hostname in another organization', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TOrganization)
      .values({ ...createOrgRow() })
      .run()
    fixture.db
      .insert(schema.TSiteTombstone)
      .values(createSiteTombstoneRow({ hostname: 'staging.example.com' }))
      .run()

    await expect(
      repo.insert({
        id: 'ste_2',
        organizationId: 'org_2',
        name: 'Staging',
        hostname: 'staging.example.com',
        ingestionIdentifier: 'ing_2',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
        createdAt,
        updatedAt: createdAt,
      }),
    ).resolves.toMatchObject({ id: 'ste_2' })
  })

  it('updates an active site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.updateActive({
        siteId: 'ste_1',
        name: 'Renamed',
        hostname: 'renamed.example.com',
        reportingTimezone: 'UTC',
        weekStartsOn: 'tuesday',
      }),
    ).resolves.toMatchObject({ id: 'ste_1', name: 'Renamed', hostname: 'renamed.example.com' })
  })

  it('returns undefined when updating a missing site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.updateActive({
        siteId: 'ste_missing',
        name: 'Renamed',
        hostname: 'renamed.example.com',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects an update reserved by a tombstone', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TSiteTombstone)
      .values(createSiteTombstoneRow({ hostname: 'renamed.example.com' }))
      .run()

    await expect(
      repo.updateActive({
        siteId: 'ste_1',
        name: 'Renamed',
        hostname: 'renamed.example.com',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
      }),
    ).rejects.toThrow(/reserved/)
  })

  it('returns undefined when updating a non-active site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TSite)
      .values(
        createSiteRow({
          id: 'ste_2',
          hostname: 'second.example.com',
          ingestionIdentifier: 'ing_2',
          status: 'deleted',
        }),
      )
      .run()

    await expect(
      repo.updateActive({
        siteId: 'ste_2',
        name: 'Renamed',
        hostname: 'renamed.example.com',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
      }),
    ).resolves.toBeUndefined()
  })

  it('rotates the ingestion identifier of an active site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(repo.rotateIngestionIdentifier('ste_1', 'ing_2')).resolves.toMatchObject({
      id: 'ste_1',
      ingestionIdentifier: 'ing_2',
    })
  })

  it('returns undefined when rotating a missing site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(repo.rotateIngestionIdentifier('ste_missing', 'ing_2')).resolves.toBeUndefined()
  })
})

function createOrgRow() {
  return {
    id: 'org_2',
    name: 'Second',
    authorityOrganizationId: 'authority_2',
    ownerUserId: 'user_1',
    isPersonal: false,
    createdAt: new Date('2026-08-31T00:00:00.000Z'),
    updatedAt: new Date('2026-08-31T00:00:00.000Z'),
  }
}
