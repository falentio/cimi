import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationAuthority } from '@cimi/auth'
import type { OrganizationRecord, OrganizationRepository } from '../repository.ts'
import { OrganizationService } from '../service.ts'

const organization: OrganizationRecord = {
  id: 'organization_1',
  name: 'Analytics',
  authorityOrganizationId: 'authority_1',
  ownerUserId: 'user_1',
  isPersonal: false,
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
  updatedAt: new Date('2026-08-31T00:00:00.000Z'),
}

const updatedOrganization: OrganizationRecord = {
  ...organization,
  name: 'Renamed Analytics',
}

const repair: OrganizationRepository.RepairOperation = {
  id: 'repair_1',
  organizationId: organization.id,
  localOrganizationId: organization.id,
  operationType: 'update-organization',
  ownerUserId: organization.ownerUserId,
  authorityOrganizationId: organization.authorityOrganizationId,
  authorityCleanupRequired: false,
  authoritySlug: null,
  previousName: organization.name,
  desiredName: updatedOrganization.name,
  attemptCount: 0,
}

describe('OrganizationService.create compensation', () => {
  it('deletes an authority Organization after local persistence fails', async () => {
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })
    const createRepair: OrganizationRepository.RepairOperation = {
      ...repair,
      id: 'repair_create_1',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authoritySlug: 'organization_new-user_1',
      previousName: null,
      desiredName: 'New Organization',
    }

    repository.findPendingCreateRepair.mockResolvedValue(undefined)
    repository.createRepairOperation.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(
      new Error('UNIQUE constraint failed'),
    )
    repository.completeRepairOperation.mockResolvedValue(true)
    authority.createOrganization.mockResolvedValue({
      organization: {
        id: 'authority_new',
        name: 'New Organization',
        slug: createRepair.authoritySlug!,
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
      member: {
        id: 'member_new',
        organizationId: 'authority_new',
        userId: 'user_1',
        role: 'owner',
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
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
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })
    const createRepair: OrganizationRepository.RepairOperation = {
      ...repair,
      id: 'repair_create_invalid_owner',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authoritySlug: 'organization_new-user_1',
      previousName: null,
      desiredName: 'New Organization',
    }

    repository.findPendingCreateRepair.mockResolvedValue(undefined)
    repository.createRepairOperation.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityCleanupRequired.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.completeRepairOperation.mockResolvedValue(true)
    authority.createOrganization.mockResolvedValue({
      organization: {
        id: 'authority_new',
        name: 'New Organization',
        slug: createRepair.authoritySlug!,
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
      member: {
        id: 'member_new',
        organizationId: 'authority_new',
        userId: 'user_1',
        role: 'member',
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
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
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })
    const createRepair: OrganizationRepository.RepairOperation = {
      ...repair,
      id: 'repair_create_existing_authority',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authorityCleanupRequired: false,
      authoritySlug: 'organization_new-user_1',
      previousName: null,
      desiredName: 'New Organization',
    }

    repository.findPendingCreateRepair.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.findById.mockResolvedValue(undefined)
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(
      new Error('UNIQUE constraint failed'),
    )
    repository.recordRepairFailure.mockResolvedValue()
    authority.getOrganizationBySlug.mockResolvedValue({
      id: 'authority_existing',
      name: 'New Organization',
      slug: createRepair.authoritySlug!,
      createdAt: new Date('2026-08-31T00:00:00.000Z'),
    })
    authority.listAllMembers.mockResolvedValue([
      {
        id: 'member_existing',
        organizationId: 'authority_existing',
        userId: 'user_1',
        role: 'owner',
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
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
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })
    const createRepair: OrganizationRepository.RepairOperation = {
      ...repair,
      id: 'repair_create_retry_cleanup',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: 'authority_new',
      authorityCleanupRequired: true,
      authoritySlug: 'organization_new-user_1',
      previousName: null,
      desiredName: 'New Organization',
    }

    repository.findPendingCreateRepair.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.findById.mockResolvedValue(undefined)
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(
      new Error('UNIQUE constraint failed'),
    )
    repository.completeRepairOperation.mockResolvedValue(true)
    authority.listAllMembers.mockResolvedValue([
      {
        id: 'member_new',
        organizationId: 'authority_new',
        userId: 'user_1',
        role: 'owner',
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
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
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })
    const createRepair: OrganizationRepository.RepairOperation = {
      ...repair,
      id: 'repair_create_2',
      organizationId: null,
      localOrganizationId: 'organization_new',
      operationType: 'create-organization',
      authorityOrganizationId: null,
      authoritySlug: 'organization_new-user_1',
      previousName: null,
      desiredName: 'New Organization',
    }

    repository.findPendingCreateRepair.mockResolvedValue(undefined)
    repository.createRepairOperation.mockResolvedValue(createRepair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.setRepairAuthorityOrganization.mockResolvedValue()
    repository.insertWithOwnerAndCompleteRepair.mockRejectedValue(new Error('database unavailable'))
    repository.recordRepairFailure.mockResolvedValue()
    authority.createOrganization.mockResolvedValue({
      organization: {
        id: 'authority_new',
        name: 'New Organization',
        slug: createRepair.authoritySlug!,
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
      member: {
        id: 'member_new',
        organizationId: 'authority_new',
        userId: 'user_1',
        role: 'owner',
        createdAt: new Date('2026-08-31T00:00:00.000Z'),
      },
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

describe('OrganizationService.update compensation', () => {
  it('keeps the repair pending when rollback returns an invalid response', async () => {
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })

    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingUpdateRepair.mockResolvedValue(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.createRepairOperation.mockResolvedValue(repair)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.updateNameAndCompleteRepair.mockRejectedValue(new Error('database unavailable'))
    repository.recordRepairFailure.mockResolvedValue()
    authority.getOrganization.mockResolvedValue({
      id: 'authority_1',
      name: organization.name,
      slug: 'analytics',
      createdAt: organization.createdAt,
    })
    authority.updateOrganization
      .mockResolvedValueOnce({
        id: 'authority_1',
        name: 'Renamed Analytics',
        slug: 'analytics',
        createdAt: organization.createdAt,
      })
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
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })

    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingUpdateRepair.mockResolvedValue(repair)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.findById.mockResolvedValue(organization)
    repository.incrementRepairAttempt.mockResolvedValue()
    repository.updateNameAndCompleteRepair.mockResolvedValue(updatedOrganization)
    authority.getMember.mockResolvedValue({
      id: 'member_1',
      organizationId: 'authority_1',
      userId: 'user_1',
      role: 'owner',
      createdAt: organization.createdAt,
    })
    authority.getOrganization.mockResolvedValue({
      id: 'authority_1',
      name: 'Renamed Analytics',
      slug: 'analytics',
      createdAt: organization.createdAt,
    })

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
})
