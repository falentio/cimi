import { describe, expect, it } from 'vitest'
import { createSite, createSiteFixture, createSiteRecord } from '../fixture.ts'

const input = {
  siteId: 'ste_1',
  name: 'Renamed',
  hostname: 'Renamed.COM.',
  reportingTimezone: 'UTC',
  weekStartsOn: 'monday' as const,
}

function createDeletionStatus() {
  return {
    siteId: 'ste_1',
    status: 'deleting' as const,
    operationId: 'sop_1',
    requestedAt: '2026-08-31T00:00:00.000Z',
    deletedAt: null,
    recoveryDeadline: null,
    purgeAt: null,
    cleanup: { status: 'pending' as const, updatedAt: '2026-08-31T00:00:00.000Z', errorCode: null },
  }
}

describe('SiteService.update', () => {
  it('updates an active site with a canonicalized hostname', async () => {
    const { repository, service } = createSiteFixture()
    const site = createSite({ name: 'Renamed', hostname: 'renamed.com' })
    repository.updateActive.mockResolvedValue(site)

    await expect(service.update(input, { id: 'user_1' }, new Headers())).resolves.toEqual(site)
    expect(repository.updateActive).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'ste_1', name: 'Renamed', hostname: 'renamed.com' }),
    )
  })

  it('rejects an update while a governance operation is pending', async () => {
    const { repository, scope, service } = createSiteFixture()
    scope.setPendingGovernanceOperation('org_1')

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.updateActive).not.toHaveBeenCalled()
  })

  it('rejects a member without the admin role', async () => {
    const { repository, service } = createSiteFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'member' }],
    })

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(repository.updateActive).not.toHaveBeenCalled()
  })

  it('maps a hostname conflict to a conflict error', async () => {
    const { repository, service } = createSiteFixture()
    repository.updateActive.mockRejectedValue(new Error('UNIQUE constraint failed'))

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('rejects an update for a missing site as not found', async () => {
    const { repository, service } = createSiteFixture()
    repository.updateActive.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(undefined)
    repository.getDeletionStatus.mockResolvedValue(undefined)

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('rejects an update for an inactive site as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'ste_1', organizationId: 'org_1', status: 'deleted' }],
    })
    repository.updateActive.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'deleted' }))
    repository.getDeletionStatus.mockResolvedValue(createDeletionStatus())

    await expect(service.update(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })
})
