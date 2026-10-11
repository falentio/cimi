import { describe, expect, it } from 'vitest'
import { createSite, createSiteFixture } from '../fixture.ts'

describe('SiteService.createDemoSite', () => {
  it('inserts a real site with service defaults and returns its id', async () => {
    const { repository, membership, lock, service } = createSiteFixture()
    repository.insert.mockResolvedValue(
      createSite({ name: 'Demo Site', hostname: 'demo.example.com' }),
    )

    await expect(
      service.createDemoSite({ organizationId: 'org_1', ownerUserId: 'user_1' }),
    ).resolves.toEqual({ siteId: 'ste_1' })
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        name: 'Demo Site',
        hostname: 'demo.example.com',
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
      }),
    )
    expect(membership.reconcile).not.toHaveBeenCalled()
    expect(lock.isLocked()).toBe(false)
  })

  it('canonicalizes the demo hostname before the insert', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockResolvedValue(createSite({ name: 'Demo Site' }))

    await service.createDemoSite({ organizationId: 'org_1', ownerUserId: 'user_1' })

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'demo.example.com' }),
    )
  })

  it('maps a tombstone hostname reservation to a conflict', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockRejectedValue(new Error('Site hostname is reserved by a tombstone'))

    await expect(
      service.createDemoSite({ organizationId: 'org_1', ownerUserId: 'user_1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })

  it('rethrows a non-constraint repository error', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockRejectedValue(new Error('connection reset'))

    await expect(
      service.createDemoSite({ organizationId: 'org_1', ownerUserId: 'user_1' }),
    ).rejects.toThrow('connection reset')
  })
})
