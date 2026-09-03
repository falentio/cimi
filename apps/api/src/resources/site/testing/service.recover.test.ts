import { describe, expect, it } from 'vitest'
import { createSiteFixture } from '../fixture.ts'

describe('SiteService.recover', () => {
  it('accepts a recover for an admin', async () => {
    const { repository, service } = createSiteFixture({
      memberships: [{ organizationId: 'organization_1', userId: 'user_1', role: 'admin' }],
    })
    repository.beginRecover.mockResolvedValue({ status: 'accepted', operationId: 'operation_1' })

    await expect(
      service.recover({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual({ accepted: true, status: 'recovering', operationId: 'operation_1' })
    expect(repository.beginRecover).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'site_1' }),
    )
  })

  it('rejects a recover for a missing site as not found', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginRecover.mockResolvedValue({ status: 'not-found' })

    await expect(
      service.recover({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a recover for an active site as a conflict', async () => {
    const { repository, service } = createSiteFixture()
    repository.beginRecover.mockResolvedValue({ status: 'conflict', currentStatus: 'active' })

    await expect(
      service.recover({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
