import { describe, expect, it } from 'vitest'
import { createSiteFixture } from '../fixture.ts'

const deletionStatus = {
  siteId: 'ste_1',
  status: 'deleting' as const,
  operationId: 'sop_1',
  requestedAt: '2026-08-31T00:00:00.000Z',
  deletedAt: null,
  recoveryDeadline: '2026-09-30T00:00:00.000Z',
  purgeAt: null,
  cleanup: { status: 'pending' as const, updatedAt: '2026-08-31T00:00:00.000Z', error: null },
}

describe('SiteService.getDeletionStatus', () => {
  it('returns the deletion status for an admin', async () => {
    const { repository, service } = createSiteFixture()
    repository.getDeletionStatus.mockResolvedValue(deletionStatus)

    await expect(
      service.getDeletionStatus({ siteId: 'ste_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual(deletionStatus)
    expect(repository.getDeletionStatus).toHaveBeenCalledWith('ste_1')
  })

  it('rejects a member without the admin role', async () => {
    const { repository, service } = createSiteFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'member' }],
    })

    await expect(
      service.getDeletionStatus({ siteId: 'ste_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(repository.getDeletionStatus).not.toHaveBeenCalled()
  })

  it('rejects a missing deletion status as not found', async () => {
    const { repository, service } = createSiteFixture()
    repository.getDeletionStatus.mockResolvedValue(undefined)

    await expect(
      service.getDeletionStatus({ siteId: 'ste_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
