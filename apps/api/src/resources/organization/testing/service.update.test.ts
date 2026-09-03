import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createAuthorityOrganization,
  createOrganizationFixture,
  createOrganizationRecord,
  createRepairOperation,
} from '../fixture.ts'

const organization = createOrganizationRecord()
const updatedOrganization = createOrganizationRecord({ name: 'Renamed Analytics' })
const repair = createRepairOperation({
  organizationId: organization.id,
  localOrganizationId: organization.id,
  ownerUserId: organization.ownerUserId,
  authorityOrganizationId: organization.authorityOrganizationId,
  previousName: organization.name,
  desiredName: updatedOrganization.name,
})
describe('OrganizationService.update', () => {
  it('keeps the repair pending when rollback returns an invalid response', async () => {
    const { repository, authority, service } = createOrganizationFixture()

    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingUpdateRepair.mockResolvedValue(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.createRepairOperation.mockResolvedValue(repair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.updateNameAndCompleteRepair.mockRejectedValue(new Error('database unavailable'))
    repository.recordRepairFailure.mockResolvedValue()
    authority.getOrganization.mockResolvedValue(createAuthorityOrganization())
    authority.updateOrganization
      .mockResolvedValueOnce(createAuthorityOrganization({ name: 'Renamed Analytics' }))
      .mockResolvedValueOnce(undefined)

    await expect(
      service.update(
        { organizationId: organization.id, name: updatedOrganization.name },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.recordRepairFailure).toHaveBeenCalledWith(
      repair.id,
      'Organization name rollback did not converge',
    )
  })

  it('completes a pending update after authority already reached the desired name', async () => {
    const { repository, authority, service } = createOrganizationFixture()

    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingUpdateRepair.mockResolvedValue(repair)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.findById.mockResolvedValue(organization)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.updateNameAndCompleteRepair.mockResolvedValue(updatedOrganization)
    authority.getMember.mockResolvedValue(createAuthorityMember())
    authority.getOrganization.mockResolvedValue(
      createAuthorityOrganization({ name: updatedOrganization.name }),
    )

    await expect(
      service.update(
        { organizationId: organization.id, name: updatedOrganization.name },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).resolves.toMatchObject({ name: updatedOrganization.name })
    expect(repository.updateNameAndCompleteRepair).toHaveBeenCalledWith(
      organization.id,
      updatedOrganization.name,
      repair.id,
    )
  })

  it('renames an organization through a fresh repair', async () => {
    const { repository, authority, service } = createOrganizationFixture()

    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingUpdateRepair.mockResolvedValue(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.createRepairOperation.mockResolvedValue(repair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.updateNameAndCompleteRepair.mockResolvedValue(updatedOrganization)
    authority.getOrganization.mockResolvedValue(createAuthorityOrganization())
    authority.updateOrganization.mockResolvedValue(
      createAuthorityOrganization({ name: updatedOrganization.name }),
    )

    await expect(
      service.update(
        { organizationId: organization.id, name: updatedOrganization.name },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).resolves.toMatchObject({ name: updatedOrganization.name })
    expect(repository.createRepairOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'update-organization',
        previousName: organization.name,
        desiredName: updatedOrganization.name,
      }),
    )
  })

  it('rejects a rename that diverges from the pending repair', async () => {
    const { repository, authority, service } = createOrganizationFixture()

    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingUpdateRepair.mockResolvedValue(repair)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    authority.getMember.mockResolvedValue(createAuthorityMember())

    await expect(
      service.update(
        { organizationId: organization.id, name: 'Another Name' },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.incrementRepairAttempt).not.toHaveBeenCalled()
  })

  it('rejects a member without the admin role', async () => {
    const { repository, service } = createOrganizationFixture()

    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingUpdateRepair.mockResolvedValue(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('member')

    await expect(
      service.update(
        { organizationId: organization.id, name: updatedOrganization.name },
        { id: organization.ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(repository.createRepairOperation).not.toHaveBeenCalled()
  })

  it('renames a local-only organization without an authority repair', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const localOrganization = createOrganizationRecord({ authorityOrganizationId: null })

    repository.findByIdForUser.mockResolvedValue(localOrganization)
    repository.findPendingUpdateRepair.mockResolvedValue(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.updateName.mockResolvedValue(updatedOrganization)

    await expect(
      service.update(
        { organizationId: localOrganization.id, name: updatedOrganization.name },
        { id: localOrganization.ownerUserId },
        new Headers(),
      ),
    ).resolves.toMatchObject({ name: updatedOrganization.name })
    expect(repository.updateName).toHaveBeenCalledWith(
      localOrganization.id,
      updatedOrganization.name,
    )
    expect(repository.createRepairOperation).not.toHaveBeenCalled()
    expect(authority.updateOrganization).not.toHaveBeenCalled()
  })
})
