import { describe, expect, it } from 'vitest'
import { createSiteFixture, createSiteRecord } from '../fixture.ts'

function createDeletionStatus(status: 'deleting' | 'deleted' | 'recovering' | 'purged') {
  return {
    siteId: 'ste_1',
    status,
    operationId: 'sop_1',
    requestedAt: '2026-08-31T00:00:00.000Z',
    deletedAt: null,
    recoveryDeadline: null,
    purgeAt: null,
    cleanup: { status: 'pending' as const, updatedAt: '2026-08-31T00:00:00.000Z', error: null },
  }
}

describe('SiteService.rotateIngestionIdentifier states', () => {
  it('rejects a rotation while deleting as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleting' }],
    })
    repository.rotateIngestionIdentifier.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'deleting' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('deleting'))

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'ste_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })

  it('rejects a rotation while deleted as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleted' }],
    })
    repository.rotateIngestionIdentifier.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'deleted' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('deleted'))

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'ste_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })

  it('rejects a rotation while recovering as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'recovering' }],
    })
    repository.rotateIngestionIdentifier.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'recovering' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('recovering'))

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'ste_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })

  it('rejects a rotation while purged as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'purged' }],
    })
    repository.rotateIngestionIdentifier.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'purged' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus('purged'))

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'ste_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.findById).toHaveBeenCalledWith('ste_1')
  })
})
