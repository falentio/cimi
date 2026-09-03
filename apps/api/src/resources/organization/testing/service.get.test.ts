import { describe, expect, it } from 'vitest'
import { createOrganizationFixture, createOrganizationRecord } from '../fixture.ts'

const organization = createOrganizationRecord()

describe('OrganizationService.get', () => {
  it('reconciles and returns the refreshed organization for a member', async () => {
    const { repository, service } = createOrganizationFixture()
    const refreshedOrganization = createOrganizationRecord({ name: 'Refreshed Analytics' })
    repository.findByIdForUser
      .mockResolvedValueOnce(organization)
      .mockResolvedValueOnce(refreshedOrganization)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)

    await expect(
      service.get(
        { organizationId: organization.id },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).resolves.toEqual({
      id: refreshedOrganization.id,
      name: refreshedOrganization.name,
      ownerUserId: refreshedOrganization.ownerUserId,
      isPersonal: refreshedOrganization.isPersonal,
      createdAt: refreshedOrganization.createdAt.toISOString(),
      updatedAt: refreshedOrganization.updatedAt.toISOString(),
    })
    expect(repository.findByIdForUser).toHaveBeenNthCalledWith(
      1,
      organization.id,
      organization.ownerUserId,
    )
    expect(repository.findByIdForUser).toHaveBeenNthCalledWith(
      2,
      organization.id,
      organization.ownerUserId,
    )
  })

  it('rejects an organization the user cannot access', async () => {
    const { repository, service } = createOrganizationFixture()
    repository.findByIdForUser.mockResolvedValue(undefined)

    await expect(
      service.get({ organizationId: organization.id }, { id: 'user_missing' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(repository.hasPendingGovernanceOperation).not.toHaveBeenCalled()
    expect(repository.isOwnerInvariantValid).not.toHaveBeenCalled()
  })

  it('rejects an organization that disappears during reconciliation', async () => {
    const { repository, service } = createOrganizationFixture()
    repository.findByIdForUser.mockResolvedValueOnce(organization).mockResolvedValueOnce(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)

    await expect(
      service.get(
        { organizationId: organization.id },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
  })

  it('fails closed while a governance operation is pending', async () => {
    const { repository, service } = createOrganizationFixture()
    repository.findByIdForUser.mockResolvedValue(organization)
    repository.hasPendingGovernanceOperation.mockResolvedValue(true)

    await expect(
      service.get(
        { organizationId: organization.id },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
  })
})
