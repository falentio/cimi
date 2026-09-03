import { describe, expect, it } from 'vitest'
import { InMemorySiteScopePort } from '@cimi/guard'
import { mock } from 'vitest-mock-extended'
import type { SiteRepository } from '../repository.ts'
import { SiteService } from '../service.ts'
import { createSite, createSiteFixture } from '../fixture.ts'

const organizationId = 'organization_1'

describe('SiteService.list', () => {
  it('returns an empty page when the user has no role', async () => {
    const { repository, service } = createSiteFixture({ memberships: [] })

    await expect(
      service.list({ organizationId }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual({ items: [], nextOffset: null, hasMore: false, totalCount: 0 })
    expect(repository.findMany).not.toHaveBeenCalled()
  })

  it('returns an empty page while a governance operation is pending', async () => {
    const { repository, scope, service } = createSiteFixture()
    scope.setPendingGovernanceOperation(organizationId)

    await expect(
      service.list({ organizationId }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual({ items: [], nextOffset: null, hasMore: false, totalCount: 0 })
    expect(repository.findMany).not.toHaveBeenCalled()
  })

  it('passes list pagination defaults to the repository', async () => {
    const { repository, service } = createSiteFixture()
    const page = { items: [createSite()], nextOffset: null, hasMore: false, totalCount: 1 }
    repository.findMany.mockResolvedValue(page)

    await expect(
      service.list({ organizationId }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual(page)
    expect(repository.findMany).toHaveBeenCalledWith(organizationId, { offset: 0, limit: 20 })
  })

  it('passes explicit pagination to the repository', async () => {
    const { repository, service } = createSiteFixture()
    repository.findMany.mockResolvedValue({
      items: [],
      nextOffset: 7,
      hasMore: true,
      totalCount: 10,
    })

    await expect(
      service.list({ organizationId, offset: 5, limit: 2 }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual({ items: [], nextOffset: 7, hasMore: true, totalCount: 10 })
    expect(repository.findMany).toHaveBeenCalledWith(organizationId, { offset: 5, limit: 2 })
  })

  it('lists without a membership reconciler', async () => {
    const repository = mock<SiteRepository>()
    const scope = new InMemorySiteScopePort(
      [{ siteId: 'site_1', organizationId }],
      [{ organizationId, userId: 'user_1', role: 'owner' }],
    )
    const service = new SiteService({
      repository,
      scope: { siteScope: scope, membership: scope },
      membership: undefined,
    })
    const page = { items: [createSite()], nextOffset: null, hasMore: false, totalCount: 1 }
    repository.findMany.mockResolvedValue(page)

    await expect(service.list({ organizationId }, { id: 'user_1' })).resolves.toEqual(page)
    expect(repository.findMany).toHaveBeenCalledWith(organizationId, { offset: 0, limit: 20 })
  })
})
