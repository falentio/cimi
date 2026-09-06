import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'
import { createSiteDrizzleFixture, createSiteTombstoneRow } from '../fixture.drizzle.ts'

const requestedAt = new Date('2026-09-01T00:00:00.000Z')
const completedAt = new Date('2026-09-02T00:00:00.000Z')
const recoverRequestedAt = new Date('2026-09-03T00:00:00.000Z')
const recoverCompletedAt = new Date('2026-09-04T00:00:00.000Z')

const identity = {
  ingestionIdentifier: 'ing_1',
  name: 'Production',
  hostname: 'example.com',
}

describe.concurrent('SiteRepositoryDrizzle.retention', () => {
  it('preserves ingestionIdentifier name and hostname across delete and recover', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.findById('ste_1'),
      'seeded site carries expected identity',
    ).resolves.toMatchObject(identity)

    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await expect(
      repo.findById('ste_1'),
      'identity unchanged after beginDelete',
    ).resolves.toMatchObject({ ...identity, status: 'deleting' })

    await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })
    await expect(
      repo.findById('ste_1'),
      'identity unchanged after completeDelete',
    ).resolves.toMatchObject({ ...identity, status: 'deleted' })

    await repo.beginRecover({
      siteId: 'ste_1',
      operationId: 'sop_2',
      requestedAt: recoverRequestedAt,
    })
    await expect(
      repo.findById('ste_1'),
      'identity unchanged after beginRecover',
    ).resolves.toMatchObject({ ...identity, status: 'recovering' })

    await repo.completeRecover({
      siteId: 'ste_1',
      operationId: 'sop_2',
      completedAt: recoverCompletedAt,
    })
    await expect(
      repo.findById('ste_1'),
      'identity unchanged after completeRecover',
    ).resolves.toMatchObject({ ...identity, status: 'active' })
  })

  it('preserves reportingTimezone and weekStartsOn across delete and recover', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .update(schema.TSite)
      .set({ reportingTimezone: 'America/New_York', weekStartsOn: 'sunday' })
      .where(eq(schema.TSite.id, 'ste_1'))
      .run()
    const config = { reportingTimezone: 'America/New_York', weekStartsOn: 'sunday' }

    await expect(
      repo.findById('ste_1'),
      'seeded site carries expected config',
    ).resolves.toMatchObject(config)

    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await expect(
      repo.findById('ste_1'),
      'config unchanged after beginDelete',
    ).resolves.toMatchObject({ ...config, status: 'deleting' })

    await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })
    await expect(
      repo.findById('ste_1'),
      'config unchanged after completeDelete',
    ).resolves.toMatchObject({ ...config, status: 'deleted' })

    await repo.beginRecover({
      siteId: 'ste_1',
      operationId: 'sop_2',
      requestedAt: recoverRequestedAt,
    })
    await expect(
      repo.findById('ste_1'),
      'config unchanged after beginRecover',
    ).resolves.toMatchObject({ ...config, status: 'recovering' })

    await repo.completeRecover({
      siteId: 'ste_1',
      operationId: 'sop_2',
      completedAt: recoverCompletedAt,
    })
    await expect(
      repo.findById('ste_1'),
      'config unchanged after completeRecover',
    ).resolves.toMatchObject({ ...config, status: 'active' })
  })

  it('removes the live row on purge and reserves the hostname via tombstone', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })
    const deleted = await repo.findById('ste_1')
    expect(deleted?.purgeAt, 'deleted site carries a purge deadline').not.toBeNull()
    const purgeAt = new Date(deleted?.purgeAt as string)

    await expect(
      repo.purge({ siteId: 'ste_1', operationId: 'sop_purge_1', requestedAt: purgeAt }),
      'purge completes past the deadline',
    ).resolves.toEqual({ status: 'completed' })
    await expect(repo.findById('ste_1'), 'live row removed after purge').resolves.toBeUndefined()

    const tombstones = fixture.db
      .select()
      .from(schema.TSiteTombstone)
      .where(eq(schema.TSiteTombstone.siteId, 'ste_1'))
      .all()
    expect(tombstones.length, 'purge writes one tombstone').toBe(1)
    expect(tombstones[0], 'tombstone preserves hostname reservation').toMatchObject({
      siteId: 'ste_1',
      organizationId: 'org_1',
      hostname: 'example.com',
    })

    await expect(
      repo.insert({
        id: 'ste_2',
        organizationId: 'org_1',
        name: 'Production',
        hostname: 'example.com',
        ingestionIdentifier: 'ing_2',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
        createdAt: purgeAt,
        updatedAt: purgeAt,
      }),
      'hostname stays reserved after purge',
    ).rejects.toThrow(/reserved/)
  })

  it('hides a restored active row that is reserved by a tombstone', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db.insert(schema.TSiteTombstone).values(createSiteTombstoneRow()).run()

    await expect(
      repo.findMany('org_1', { offset: 0, limit: 20 }),
      'tombstoned Sites are absent from normal lists',
    ).resolves.toMatchObject({ items: [], totalCount: 0, hasMore: false, nextOffset: null })
  })
})
