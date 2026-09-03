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
const newAuthoritySlug = 'organization_new-user_1'

describe('OrganizationService.create', () => {
  it('rejects a pending create with a different requested name', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const pendingCreate = createRepairOperation({
      id: 'repair_create_mismatched_name',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authoritySlug: newAuthoritySlug,
      previousName: null,
      desiredName: 'Existing Request',
    })
    repository.findPendingCreateRepair.mockResolvedValue(pendingCreate)

    await expect(
      service.create({ name: 'New Organization' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.createRepairOperation).not.toHaveBeenCalled()
    expect(repository.incrementRepairAttempt).not.toHaveBeenCalled()
    expect(authority.createOrganization).not.toHaveBeenCalled()
  })

  it('deletes an authority Organization after local persistence fails', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const createRepair = createRepairOperation({
      ...repair,
      id: 'repair_create_1',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authoritySlug: newAuthoritySlug,
      previousName: null,
      desiredName: 'New Organization',
    })

    repository.findPendingCreateRepair.mockResolvedValue(undefined)
    repository.createRepairOperation.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(
      new Error('UNIQUE constraint failed'),
    )
    repository.completeRepairOperation.mockResolvedValue(true)
    authority.createOrganization.mockResolvedValue({
      organization: createAuthorityOrganization({
        id: 'authority_new',
        name: 'New Organization',
        slug: newAuthoritySlug,
      }),
      member: createAuthorityMember({
        id: 'member_new',
        organizationId: 'authority_new',
      }),
    })
    authority.deleteOrganization.mockResolvedValue()

    await expect(
      service.create({ name: 'New Organization' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authority.deleteOrganization).toHaveBeenCalledWith({
      organizationId: 'authority_new',
      headers: expect.any(Headers),
    })
    expect(repository.completeRepairOperation).toHaveBeenCalledWith(createRepair.id)
    expect(repository.setRepairAuthorityCleanupRequired).toHaveBeenCalledWith(createRepair.id)
  })

  it('compensates when Better Auth returns an invalid owner response', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const createRepair = createRepairOperation({
      ...repair,
      id: 'repair_create_invalid_owner',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authoritySlug: newAuthoritySlug,
      previousName: null,
      desiredName: 'New Organization',
    })

    repository.findPendingCreateRepair.mockResolvedValue(undefined)
    repository.createRepairOperation.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityCleanupRequired.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.completeRepairOperation.mockResolvedValue(true)
    authority.createOrganization.mockResolvedValue({
      organization: createAuthorityOrganization({
        id: 'authority_new',
        name: 'New Organization',
        slug: newAuthoritySlug,
      }),
      member: createAuthorityMember({
        id: 'member_new',
        organizationId: 'authority_new',
        role: 'member',
      }),
    })
    authority.deleteOrganization.mockResolvedValue()

    await expect(
      service.create({ name: 'New Organization' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authority.deleteOrganization).toHaveBeenCalledWith({
      organizationId: 'authority_new',
      headers: expect.any(Headers),
    })
    expect(repository.completeRepairOperation).toHaveBeenCalledWith(createRepair.id)
    expect(repository.insertWithOwnerAndCompleteRepair).not.toHaveBeenCalled()
  })

  it('does not delete a pre-existing authority Organization discovered during retry', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const createRepair = createRepairOperation({
      ...repair,
      id: 'repair_create_existing_authority',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authorityCleanupRequired: false,
      authoritySlug: newAuthoritySlug,
      previousName: null,
      desiredName: 'New Organization',
    })

    repository.findPendingCreateRepair.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.findById.mockResolvedValue(undefined)
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(
      new Error('UNIQUE constraint failed'),
    )
    repository.recordRepairFailure.mockResolvedValue()
    authority.getOrganizationBySlug.mockResolvedValue(
      createAuthorityOrganization({
        id: 'authority_existing',
        name: 'New Organization',
        slug: newAuthoritySlug,
      }),
    )
    authority.listAllMembers.mockResolvedValue([
      createAuthorityMember({
        id: 'member_existing',
        organizationId: 'authority_existing',
      }),
    ])

    await expect(
      service.create({ name: 'New Organization' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authority.deleteOrganization).not.toHaveBeenCalled()
    expect(repository.recordRepairFailure).toHaveBeenCalledWith(
      createRepair.id,
      'UNIQUE constraint failed',
    )
  })

  it('retries cleanup for an operation-owned authority Organization', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const createRepair = createRepairOperation({
      ...repair,
      id: 'repair_create_retry_cleanup',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: 'authority_new',
      authorityCleanupRequired: true,
      authoritySlug: newAuthoritySlug,
      previousName: null,
      desiredName: 'New Organization',
    })

    repository.findPendingCreateRepair.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.findById.mockResolvedValue(undefined)
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(
      new Error('UNIQUE constraint failed'),
    )
    repository.completeRepairOperation.mockResolvedValue(true)
    authority.listAllMembers.mockResolvedValue([
      createAuthorityMember({
        id: 'member_new',
        organizationId: 'authority_new',
      }),
    ])
    authority.deleteOrganization.mockResolvedValue()

    await expect(
      service.create({ name: 'New Organization' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authority.getOrganizationBySlug).not.toHaveBeenCalled()
    expect(authority.createOrganization).not.toHaveBeenCalled()
    expect(authority.deleteOrganization).toHaveBeenCalledWith({
      organizationId: 'authority_new',
      headers: expect.any(Headers),
    })
    expect(repository.completeRepairOperation).toHaveBeenCalledWith(createRepair.id)
  })

  it('keeps the repair pending when authority compensation fails', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const createRepair = createRepairOperation({
      ...repair,
      id: 'repair_create_2',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authoritySlug: newAuthoritySlug,
      previousName: null,
      desiredName: 'New Organization',
    })

    repository.findPendingCreateRepair.mockResolvedValue(undefined)
    repository.createRepairOperation.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(new Error('database unavailable'))
    repository.recordRepairFailure.mockResolvedValue()
    authority.createOrganization.mockResolvedValue({
      organization: createAuthorityOrganization({
        id: 'authority_new',
        name: 'New Organization',
        slug: newAuthoritySlug,
      }),
      member: createAuthorityMember({
        id: 'member_new',
        organizationId: 'authority_new',
      }),
    })
    authority.deleteOrganization.mockRejectedValue(new Error('authority unavailable'))

    await expect(
      service.create({ name: 'New Organization' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.recordRepairFailure).toHaveBeenCalledWith(
      createRepair.id,
      'authority unavailable',
    )
    expect(repository.completeRepairOperation).not.toHaveBeenCalled()
  })
})
