import { describe, expect, it } from 'vitest'
import {
  createDeleteOperation,
  createOrganizationFixture,
  createOrganizationRecord,
} from '../fixture.ts'

const organization = createOrganizationRecord()
const operation = createDeleteOperation({
  organizationId: organization.id,
  previousOwnerUserId: organization.ownerUserId,
  targetUserId: organization.ownerUserId,
})

describe('OrganizationService.delete', () => {
  it('keeps a failed authority deletion pending and retries it', async () => {
    const { repository, authority, service } = createOrganizationFixture()

    repository.findById.mockResolvedValue(organization)
    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingDeleteOperation
      .mockResolvedValueOnce(undefined)
      .mockResolvedValue(operation)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.createDeleteOperation.mockResolvedValue(operation)
    repository.incrementDeleteAttempt.mockResolvedValue()
    repository.recordDeleteFailure.mockResolvedValue()
    repository.finalizeDeleteOperation.mockResolvedValue(true)
    authority.deleteOrganization
      .mockRejectedValueOnce(new Error('authority unavailable'))
      .mockResolvedValueOnce()

    const input = { organizationId: organization.id }
    const user = { id: organization.ownerUserId }
    const headers = new Headers({ cookie: 'session=<REDACTED>' })

    await expect(service.delete(input, user, headers)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    })
    await expect(service.delete(input, user, headers)).resolves.toBeUndefined()

    expect(repository.createDeleteOperation).toHaveBeenCalledTimes(1)
    expect(repository.incrementDeleteAttempt).toHaveBeenCalledTimes(2)
    expect(repository.recordDeleteFailure).toHaveBeenCalledWith(
      'operation_1',
      'authority unavailable',
    )
    expect(authority.deleteOrganization).toHaveBeenCalledTimes(2)
    expect(repository.finalizeDeleteOperation).toHaveBeenCalledWith('operation_1')
  })

  it('deletes a local-only organization without touching the authority', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    const localOrganization = createOrganizationRecord({ authorityOrganizationId: null })

    repository.findByIdForUser.mockResolvedValue(localOrganization)
    repository.findPendingDeleteOperation.mockResolvedValue(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')
    repository.createDeleteOperation.mockResolvedValue(operation)
    repository.finalizeDeleteOperation.mockResolvedValue(true)

    await expect(
      service.delete({ organizationId: localOrganization.id }, { id: 'user_1' }, new Headers()),
    ).resolves.toBeUndefined()
    expect(authority.deleteOrganization).not.toHaveBeenCalled()
    expect(repository.finalizeDeleteOperation).toHaveBeenCalledWith(operation.id)
  })

  it('rejects a delete for a missing organization', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    repository.findByIdForUser.mockResolvedValue(undefined)

    await expect(
      service.delete({ organizationId: 'organization_missing' }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(repository.createDeleteOperation).not.toHaveBeenCalled()
    expect(authority.deleteOrganization).not.toHaveBeenCalled()
  })

  it('rejects a member without the owner role', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    repository.findByIdForUser.mockResolvedValue(organization)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('member')

    await expect(
      service.delete({ organizationId: organization.id }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(repository.createDeleteOperation).not.toHaveBeenCalled()
    expect(authority.deleteOrganization).not.toHaveBeenCalled()
  })

  it('rejects a delete that races another owner operation', async () => {
    const { repository, authority, service } = createOrganizationFixture()
    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingDeleteOperation.mockResolvedValue(
      createDeleteOperation({ previousOwnerUserId: 'user_other' }),
    )
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')

    await expect(
      service.delete({ organizationId: organization.id }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authority.deleteOrganization).not.toHaveBeenCalled()
    expect(repository.finalizeDeleteOperation).not.toHaveBeenCalled()
  })

  it('maps repository guards to delete errors', async () => {
    const { repository, service } = createOrganizationFixture()
    repository.findByIdForUser.mockResolvedValue(organization)
    repository.findPendingDeleteOperation.mockResolvedValue(undefined)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.findRoleForUser.mockResolvedValue('owner')

    repository.createDeleteOperation.mockRejectedValueOnce(new Error('PERSONAL_PROTECTED'))
    await expect(
      service.delete({ organizationId: organization.id }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'PERSONAL_ORGANIZATION_PROTECTED', status: 409 })

    repository.createDeleteOperation.mockRejectedValueOnce(new Error('ORGANIZATION_NOT_EMPTY'))
    await expect(
      service.delete({ organizationId: organization.id }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_EMPTY', status: 409 })

    repository.createDeleteOperation.mockRejectedValueOnce(new Error('FORBIDDEN_OWNER'))
    await expect(
      service.delete({ organizationId: organization.id }, { id: 'user_1' }, new Headers()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
