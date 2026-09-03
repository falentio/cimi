import { describe, expect, it } from 'vitest'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'
import { createSiteDrizzleFixture } from '../fixture.drizzle.ts'

const requestedAt = new Date('2026-09-01T00:00:00.000Z')
const completedAt = new Date('2026-09-02T00:00:00.000Z')

async function createDeletedSite(repo: SiteRepositoryDrizzle) {
  await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
  await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })
  const deleted = await repo.findById('ste_1')
  if (deleted?.purgeAt === null || deleted?.purgeAt === undefined) {
    throw new Error('expected a purge deadline')
  }
  return new Date(deleted.purgeAt)
}

describe.concurrent('SiteRepositoryDrizzle.purge', () => {
  it('purges a deleted site past its deadline and reserves the hostname', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    const purgeAt = await createDeletedSite(repo)

    await expect(
      repo.purge({ siteId: 'ste_1', operationId: 'sop_purge_1', requestedAt: purgeAt }),
    ).resolves.toEqual({ status: 'completed' })
    await expect(repo.findById('ste_1')).resolves.toBeUndefined()
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
    ).rejects.toThrow(/reserved/)
  })

  it('reports the deletion status of a purged site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    const purgeAt = await createDeletedSite(repo)
    await repo.purge({ siteId: 'ste_1', operationId: 'sop_purge_1', requestedAt: purgeAt })

    await expect(repo.getDeletionStatus('ste_1')).resolves.toMatchObject({
      siteId: 'ste_1',
      status: 'purged',
      operationId: 'sop_purge_1',
    })
  })

  it('replays a purge with the same operation idempotently', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    const purgeAt = await createDeletedSite(repo)
    await repo.purge({ siteId: 'ste_1', operationId: 'sop_purge_1', requestedAt: purgeAt })

    await expect(
      repo.purge({ siteId: 'ste_1', operationId: 'sop_purge_1', requestedAt: purgeAt }),
    ).resolves.toEqual({ status: 'completed' })
    await expect(
      repo.purge({ siteId: 'ste_1', operationId: 'sop_other', requestedAt: purgeAt }),
    ).resolves.toEqual({ status: 'conflict', currentStatus: 'purged' })
  })

  it('rejects an early purge before the deadline', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await createDeletedSite(repo)

    await expect(
      repo.purge({ siteId: 'ste_1', operationId: 'sop_purge_1', requestedAt }),
    ).resolves.toMatchObject({ status: 'conflict' })
  })

  it('rejects a purge for an active site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.purge({ siteId: 'ste_1', operationId: 'sop_purge_1', requestedAt }),
    ).resolves.toEqual({ status: 'conflict', currentStatus: 'active' })
  })

  it('reports not found when purging a missing site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.purge({ siteId: 'ste_missing', operationId: 'sop_purge_1', requestedAt }),
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('finds only due purges', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    const purgeAt = await createDeletedSite(repo)

    await expect(repo.findDuePurges(requestedAt)).resolves.toEqual([])
    await expect(repo.findDuePurges(purgeAt)).resolves.toEqual([{ siteId: 'ste_1' }])
  })

  it('finds pending lifecycle operations in creation order', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })

    await expect(repo.findPendingLifecycleOperations()).resolves.toEqual([
      { siteId: 'ste_1', operationId: 'sop_1', operationType: 'delete', status: 'pending' },
    ])
    await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })
    await expect(repo.findPendingLifecycleOperations()).resolves.toEqual([])
  })

  it('reports deletion status across the lifecycle', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(repo.getDeletionStatus('ste_missing')).resolves.toBeUndefined()
    await expect(repo.getDeletionStatus('ste_1')).resolves.toMatchObject({
      siteId: 'ste_1',
      status: 'active',
      operationId: null,
      requestedAt: null,
    })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await expect(repo.getDeletionStatus('ste_1')).resolves.toMatchObject({
      siteId: 'ste_1',
      status: 'deleting',
      operationId: 'sop_1',
    })
  })
})
