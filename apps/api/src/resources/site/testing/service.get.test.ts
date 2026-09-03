import { describe, expect, it } from 'vitest'
import { createSiteFixture, createSiteRecord } from '../fixture.ts'

describe('SiteService.get', () => {
  it('returns the public site for an active member site', async () => {
    const { repository, service } = createSiteFixture()
    const record = createSiteRecord()
    repository.findById.mockResolvedValue(record)

    await expect(
      service.get({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual({
      id: record.id,
      organizationId: record.organizationId,
      name: record.name,
      hostname: record.hostname,
      ingestionIdentifier: record.ingestionIdentifier,
      reportingTimezone: record.reportingTimezone,
      weekStartsOn: record.weekStartsOn,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    expect(repository.findById).toHaveBeenCalledWith('site_1')
  })

  it('rejects a site the user cannot access', async () => {
    const { repository, service } = createSiteFixture()
    repository.findById.mockResolvedValue(createSiteRecord())

    await expect(
      service.get({ siteId: 'site_1' }, { id: 'user_missing' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.findById).not.toHaveBeenCalled()
  })

  it('rejects an inactive site as not found', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'site_1', organizationId: 'organization_1', status: 'deleted' }],
    })
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'deleted' }))

    await expect(
      service.get({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('fails closed while a governance operation is pending', async () => {
    const { repository, scope, service } = createSiteFixture()
    scope.setPendingGovernanceOperation('organization_1')
    repository.findById.mockResolvedValue(createSiteRecord())

    await expect(
      service.get({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repository.findById).not.toHaveBeenCalled()
  })
})
