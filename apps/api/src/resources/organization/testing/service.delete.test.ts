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
})
