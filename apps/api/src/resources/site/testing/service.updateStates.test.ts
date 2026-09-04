import { describe, expect, it } from 'vitest'
import { createSite, createSiteFixture, createSiteRecord } from '../fixture.ts'

const input = {
  siteId: 'ste_1',
  name: 'Renamed',
  hostname: 'Renamed.COM.',
  reportingTimezone: 'UTC',
  weekStartsOn: 'monday' as const,
}

function createDeletionStatus(status: 'deleting' | 'deleted' | 'recovering' | 'purged') {
  return {
    siteId: 'ste_1',
    status,
    operationId: 'sop_1',
    requestedAt: '2026-08-31T00:00:00.000Z',
    deletedAt: null,
    recoveryDeadline: null,
    purgeAt: null,
    cleanup: { status: 'pending' as const, updatedAt: '2026-08-31T00:00:00.000Z', errorCode: null },
  }
}

describe('SiteService.update states', () => {
  it('rejects an update while deleting as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleting' }],
    })
    repository.updateActive.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'deleting' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('deleting'))

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })

  it('rejects an update while recovering as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'recovering' }],
    })
    repository.updateActive.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'recovering' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('recovering'))

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })

  it('rejects an update while deleted as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleted' }],
    })
    repository.updateActive.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'deleted' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('deleted'))

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })

  it('rejects an update while purged as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'purged' }],
    })
    repository.updateActive.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'purged' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('purged'))

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })

  it('maps a tombstone reservation to a conflict for a canonical hostname', async () => {
    const { repository, service } = createSiteFixture()
    repository.updateActive.mockRejectedValue(new Error('Site hostname is reserved by a tombstone'))

    await expect(
      service.update({ ...input, hostname: 'EXAMPLE.com.' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.updateActive).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'example.com' }),
    )
  })

  it('reconciles membership on the update path', async () => {
    const { repository, membership, service } = createSiteFixture()
    const site = createSite({ name: 'Renamed', hostname: 'renamed.com' })
    repository.updateActive.mockResolvedValue(site)

    await expect(service.update(input, { id: 'user_1' }, new Headers())).resolves.toEqual(site)
    expect(membership.reconcile).toHaveBeenCalled()
  })
})
