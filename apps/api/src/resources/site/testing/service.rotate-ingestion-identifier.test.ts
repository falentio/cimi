import { describe, expect, it } from 'vitest'
import { createSite, createSiteFixture, createSiteRecord } from '../fixture.ts'

describe('SiteService.rotateIngestionIdentifier', () => {
  it('rotates the ingestion identifier for an admin', async () => {
    const { repository, service } = createSiteFixture()
    const site = createSite({ ingestionIdentifier: 'ingest_2' })
    repository.rotateIngestionIdentifier.mockResolvedValue(site)

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).resolves.toEqual(site)
    expect(repository.rotateIngestionIdentifier).toHaveBeenCalledWith(
      'site_1',
      expect.stringMatching(/^ingest/),
    )
  })

  it('rejects a rotation while a governance operation is pending', async () => {
    const { repository, scope, service } = createSiteFixture()
    scope.setPendingGovernanceOperation('organization_1')

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repository.rotateIngestionIdentifier).not.toHaveBeenCalled()
  })

  it('rejects a rotation for a missing site as not found', async () => {
    const { repository, service } = createSiteFixture()
    repository.rotateIngestionIdentifier.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(undefined)
    repository.getDeletionStatus.mockResolvedValue(undefined)

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a rotation for an inactive site as a conflict', async () => {
    const { repository, service } = createSiteFixture({
      sites: [{ siteId: 'site_1', organizationId: 'organization_1', status: 'deleted' }],
    })
    repository.rotateIngestionIdentifier.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(createSiteRecord({ status: 'deleted' }))
    repository.getDeletionStatus.mockResolvedValue({
      siteId: 'site_1',
      status: 'deleted',
      operationId: 'operation_1',
      requestedAt: '2026-08-31T00:00:00.000Z',
      deletedAt: '2026-08-31T00:00:00.000Z',
      recoveryDeadline: null,
      purgeAt: null,
      cleanup: { status: 'pending', updatedAt: '2026-08-31T00:00:00.000Z', error: null },
    })

    await expect(
      service.rotateIngestionIdentifier({ siteId: 'site_1' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
