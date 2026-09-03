import { describe, expect, it } from 'vitest'
import { createSiteFixture } from '../fixture.ts'

describe('SiteService.delete', () => {
  it('accepts a delete for an owner', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginDelete.mockResolvedValue({ status: 'accepted', operationId: 'operation_1' })

    await expect(
      service.delete({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual({ accepted: true, status: 'deleting', operationId: 'operation_1' })
    expect(repository.beginDelete).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'site_1' }),
    )
  })

  it('rejects a delete for a non-owner as forbidden', async () => {
    const { repository, service } = createSiteFixture({
      memberships: [{ organizationId: 'organization_1', userId: 'user_1', role: 'admin' }],
    })

    await expect(
      service.delete({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.beginDelete).not.toHaveBeenCalled()
  })

  it('rejects a delete for a missing site as not found', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginDelete.mockResolvedValue({ status: 'not-found' })

    await expect(
      service.delete({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a repeated delete as a conflict', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginDelete.mockResolvedValue({ status: 'conflict', currentStatus: 'deleting' })

    await expect(
      service.delete({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
