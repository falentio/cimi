import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationAuthority } from '@cimi/auth'
import type { OrganizationRepository, OrganizationRecord } from '../repository.ts'
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

const operation: OrganizationRepository.DeleteOperation = {
  id: 'operation_1',
  organizationId: organization.id,
  previousOwnerUserId: organization.ownerUserId,
  targetUserId: organization.ownerUserId,
  attemptCount: 0,
}

describe('OrganizationService.delete', () => {
  it('keeps a failed authority deletion pending and retries it', async () => {
    const repository = mock<OrganizationRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new OrganizationService({ repository, authority })

    repository.findById.mockResolvedValue(organization)
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

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.createDeleteOperation).toHaveBeenCalledTimes(1)
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.incrementDeleteAttempt).toHaveBeenCalledTimes(2)
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.recordDeleteFailure).toHaveBeenCalledWith(
      'operation_1',
      'authority unavailable',
    )
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.deleteOrganization).toHaveBeenCalledTimes(2)
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.finalizeDeleteOperation).toHaveBeenCalledWith('operation_1')
  })
})
