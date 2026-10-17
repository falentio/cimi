import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { SHostname } from '@cimi/utils'
import { createSite, createSiteFixture } from '../fixture.ts'

describe('SiteService.createDemoSite', () => {
  it('inserts a real site with service defaults and returns its id', async () => {
    const { repository, membership, lock, service } = createSiteFixture()
    repository.insert.mockResolvedValue(
      createSite({ name: 'Demo Site', hostname: 'demo-org-1.example.com' }),
    )

    await expect(service.createDemoSite({ organizationId: 'org_1' })).resolves.toEqual({
      siteId: 'ste_1',
    })
    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        name: 'Demo Site',
        hostname: 'demo-org-1.example.com',
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

    await service.createDemoSite({ organizationId: 'org_1' })

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: 'demo-org-1.example.com' }),
    )
  })

  it('gives every organization its own demo hostname', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockImplementation(async (input) => createSite({ hostname: input.hostname }))

    await service.createDemoSite({ organizationId: 'org_1' })
    await service.createDemoSite({ organizationId: 'org_2' })

    const hostnames = repository.insert.mock.calls.map(([input]) => input.hostname)

    expect(hostnames).toEqual(['demo-org-1.example.com', 'demo-org-2.example.com'])

    for (const hostname of hostnames) {
      expect(v.safeParse(SHostname, hostname).success, hostname).toBe(true)
    }
  })

  it('maps a tombstone hostname reservation to a conflict', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockRejectedValue(new Error('Site hostname is reserved by a tombstone'))

    await expect(service.createDemoSite({ organizationId: 'org_1' })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
  })

  it('rethrows a non-constraint repository error', async () => {
    const { repository, service } = createSiteFixture()
    repository.insert.mockRejectedValue(new Error('connection reset'))

    await expect(service.createDemoSite({ organizationId: 'org_1' })).rejects.toThrow(
      'connection reset',
    )
  })
})
