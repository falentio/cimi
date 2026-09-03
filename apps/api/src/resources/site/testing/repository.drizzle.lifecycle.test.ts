import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'
import { createSiteDrizzleFixture, createSiteTombstoneRow } from '../fixture.drizzle.ts'

const requestedAt = new Date('2026-09-01T00:00:00.000Z')
const completedAt = new Date('2026-09-02T00:00:00.000Z')

describe.concurrent('SiteRepositoryDrizzle.lifecycle', () => {
  it('begins a delete for an active site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt }),
    ).resolves.toEqual({ status: 'accepted', operationId: 'sop_1' })
    await expect(repo.findById('ste_1')).resolves.toMatchObject({ status: 'deleting' })
  })

  it('returns the in-flight operation when a delete is repeated', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })

    await expect(
      repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_2', requestedAt }),
    ).resolves.toEqual({ status: 'accepted', operationId: 'sop_1' })
  })

  it('reports not found when beginning a delete for a missing site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.beginDelete({ siteId: 'ste_missing', operationId: 'sop_1', requestedAt }),
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('reports a purged conflict when beginning a delete for a tombstoned site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    fixture.db.delete(schema.TSite).run()
    fixture.db.insert(schema.TSiteTombstone).values(createSiteTombstoneRow()).run()

    await expect(
      repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt }),
    ).resolves.toEqual({ status: 'conflict', currentStatus: 'purged' })
  })

  it('reports a conflict when beginning a delete for a deleted site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })

    await expect(
      repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_2', requestedAt }),
    ).resolves.toEqual({ status: 'conflict', currentStatus: 'deleted' })
  })

  it('begins a recover for a deleting site and cancels the prior operation', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })

    await expect(
      repo.beginRecover({ siteId: 'ste_1', operationId: 'sop_2', requestedAt }),
    ).resolves.toEqual({ status: 'accepted', operationId: 'sop_2' })
    await expect(repo.findById('ste_1')).resolves.toMatchObject({ status: 'recovering' })
    await expect(repo.findPendingLifecycleOperations()).resolves.toEqual([
      expect.objectContaining({ operationId: 'sop_2', operationType: 'recover' }),
    ])
  })

  it('reports a conflict when beginning a recover for an active site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.beginRecover({ siteId: 'ste_1', operationId: 'sop_1', requestedAt }),
    ).resolves.toEqual({ status: 'conflict', currentStatus: 'active' })
  })

  it('reports a conflict when the recovery deadline has passed', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt })
    const deleted = await repo.findById('ste_1')
    expect(deleted?.recoveryDeadline).not.toBeNull()

    await expect(
      repo.beginRecover({
        siteId: 'ste_1',
        operationId: 'sop_2',
        requestedAt: new Date(deleted?.recoveryDeadline as string),
      }),
    ).resolves.toEqual({ status: 'conflict', currentStatus: 'deleted' })
  })

  it('completes a delete and replays idempotently', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })

    await expect(
      repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt }),
    ).resolves.toEqual({ status: 'completed' })
    await expect(repo.findById('ste_1')).resolves.toMatchObject({ status: 'deleted' })
    await expect(
      repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_1', completedAt }),
    ).resolves.toEqual({ status: 'completed' })
  })

  it('reports a conflict when completing a delete with a mismatched operation', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })

    await expect(
      repo.completeDelete({ siteId: 'ste_1', operationId: 'sop_other', completedAt }),
    ).resolves.toMatchObject({ status: 'conflict' })
  })

  it('reports not found when completing a delete for a missing site', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.completeDelete({ siteId: 'ste_missing', operationId: 'sop_1', completedAt }),
    ).resolves.toEqual({ status: 'not-found' })
  })

  it('completes a recover and replays idempotently', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await repo.beginRecover({ siteId: 'ste_1', operationId: 'sop_2', requestedAt })

    await expect(
      repo.completeRecover({ siteId: 'ste_1', operationId: 'sop_2', completedAt }),
    ).resolves.toEqual({ status: 'completed' })
    await expect(repo.findById('ste_1')).resolves.toMatchObject({ status: 'active' })
    await expect(
      repo.completeRecover({ siteId: 'ste_1', operationId: 'sop_2', completedAt }),
    ).resolves.toEqual({ status: 'completed' })
  })

  it('reports a conflict when completing a recover with a mismatched operation', async () => {
    using fixture = createSiteDrizzleFixture()
    const repo = new SiteRepositoryDrizzle({ db: fixture.db })
    await repo.beginDelete({ siteId: 'ste_1', operationId: 'sop_1', requestedAt })
    await repo.beginRecover({ siteId: 'ste_1', operationId: 'sop_2', requestedAt })

    await expect(
      repo.completeRecover({ siteId: 'ste_1', operationId: 'sop_other', completedAt }),
    ).resolves.toMatchObject({ status: 'conflict' })
  })
})
