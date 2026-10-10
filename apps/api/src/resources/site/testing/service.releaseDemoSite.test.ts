import { describe, expect, it } from 'vitest'
import { createSiteFixture } from '../fixture.ts'

const purgeAt = new Date('2026-10-31T00:00:00.000Z')

describe('SiteService.releaseDemoSite', () => {
  it('drives a released demo site to its purge through the site lifecycle', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginDelete.mockResolvedValue({ status: 'accepted', operationId: 'sop_1' })
    repository.completeDelete.mockResolvedValue({ status: 'completed' })
    repository.getDeletionStatus.mockResolvedValue({
      siteId: 'ste_1',
      status: 'deleted',
      operationId: 'sop_1',
      requestedAt: '2026-10-01T00:00:00.000Z',
      deletedAt: '2026-10-01T00:00:00.000Z',
      recoveryDeadline: purgeAt.toISOString(),
      purgeAt: purgeAt.toISOString(),
      cleanup: { status: 'pending', updatedAt: '2026-10-01T00:00:00.000Z', errorCode: null },
    })

    await expect(service.releaseDemoSite({ siteId: 'ste_1' })).resolves.toBeUndefined()

    expect(repository.beginDelete).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'ste_1' }),
    )
    expect(repository.completeDelete).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'ste_1', operationId: 'sop_1' }),
    )
    expect(repository.purge).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'ste_1', requestedAt: purgeAt }),
    )
    expect(repository.purge.mock.calls[0]?.[0].operationId).toMatch(/^sop_/)
  })

  it('stops when the site never reaches the deletion stage', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginDelete.mockResolvedValue({ status: 'conflict', currentStatus: 'deleted' })

    await expect(service.releaseDemoSite({ siteId: 'ste_1' })).resolves.toBeUndefined()

    expect(repository.completeDelete).not.toHaveBeenCalled()
    expect(repository.purge).not.toHaveBeenCalled()
  })

  it('stops when the deletion completion conflicts', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginDelete.mockResolvedValue({ status: 'accepted', operationId: 'sop_1' })
    repository.completeDelete.mockResolvedValue({ status: 'conflict', currentStatus: 'deleting' })

    await expect(service.releaseDemoSite({ siteId: 'ste_1' })).resolves.toBeUndefined()

    expect(repository.purge).not.toHaveBeenCalled()
  })

  it('does not purge a deletion the resource reports no deadline for', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginDelete.mockResolvedValue({ status: 'accepted', operationId: 'sop_1' })
    repository.completeDelete.mockResolvedValue({ status: 'completed' })

    await expect(service.releaseDemoSite({ siteId: 'ste_1' })).resolves.toBeUndefined()

    expect(repository.purge).not.toHaveBeenCalled()
  })
})
