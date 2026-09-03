import { describe, expect, it } from 'vitest'
import { createSite, createSiteFixture } from '../fixture.ts'

const input = { organizationId: 'org_1', name: 'Production', hostname: 'Example.COM.' }

describe('SiteService.create', () => {
  it('inserts a site with a canonicalized hostname and service defaults', async () => {
    const { repository, service } = createSiteFixture()
    const site = createSite()
    repository.insert.mockResolvedValue(site)

    await expect(service.create(input, { id: 'user_1' }, new Headers())).resolves.toEqual(site)
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        name: 'Production',
        hostname: 'example.com',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
      }),
    )
  })

  it('rejects a member without the admin role', async () => {
    const { repository, service } = createSiteFixture({
      memberships: [{ organizationId: 'org_1', userId: 'user_1', role: 'member' }],
    })

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('rejects an outsider as not found', async () => {
    const { repository, service } = createSiteFixture()

    await expect(
      service.create(input, { id: 'user_missing' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('rejects creation while a governance operation is pending', async () => {
    const { repository, scope, service } = createSiteFixture()
    scope.setPendingGovernanceOperation('org_1')

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(repository.insert).not.toHaveBeenCalled()
  })

  it('maps a hostname conflict to a conflict error', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockRejectedValue(new Error('Site hostname is reserved by a tombstone'))

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('rethrows a non-constraint repository error', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockRejectedValue(new Error('connection reset'))

    await expect(service.create(input, { id: 'user_1' }, new Headers())).rejects.toThrow(
      'connection reset',
    )
  })
})
