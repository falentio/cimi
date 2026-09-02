import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AuthorityMember, OrganizationAuthority } from '@cimi/auth'
import type { MembershipRepository, MembershipRecord } from '../repository.ts'
import { MembershipService } from '../service.ts'

const pendingTransfer: MembershipRepository.Transfer = {
  id: 'operation_1',
  organizationId: 'organization_1',
  previousOwnerUserId: 'user_1',
  targetUserId: 'user_2',
  attemptCount: 0,
}

const previousOwner: AuthorityMember = {
  id: 'member_1',
  organizationId: 'authority_1',
  userId: 'user_1',
  role: 'admin',
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
}

const target: MembershipRecord = {
  organizationId: 'organization_1',
  userId: 'user_2',
  role: 'owner',
  createdAt: new Date('2026-08-31T00:00:01.000Z'),
  updatedAt: new Date('2026-08-31T00:00:02.000Z'),
}

const targetAuthorityMember: AuthorityMember = {
  id: 'member_2',
  organizationId: 'authority_1',
  userId: 'user_2',
  role: 'owner',
  createdAt: target.createdAt,
}

describe('MembershipService.transferOwnership', () => {
  it('returns the completed transfer to overlapping callers', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })
    let pendingReads = 0
    let resolvePendingReads: (() => void) | undefined
    const bothPendingReads = new Promise<void>((resolve) => {
      resolvePendingReads = resolve
    })
    let completionCalls = 0

    repository.findPendingTransfer.mockImplementation(async () => {
      pendingReads += 1
      if (pendingReads === 2) resolvePendingReads?.()
      await bothPendingReads
      return pendingTransfer
    })
    repository.markTransferAttempt.mockResolvedValue()
    repository.findAuthorityOrganizationId.mockResolvedValue('authority_1')
    repository.completeTransfer.mockImplementation(async () => {
      completionCalls += 1
      if (completionCalls === 1) return target
      throw new Error('Pending ownership transfer is no longer valid')
    })
    repository.findCompletedTransfer.mockResolvedValue(target)
    authority.reconcileOwnership.mockResolvedValue({
      previousOwner,
      target: targetAuthorityMember,
    })

    const results = await Promise.all([
      service.transferOwnership(
        { organizationId: pendingTransfer.organizationId, userId: pendingTransfer.targetUserId },
        { id: pendingTransfer.previousOwnerUserId },
        new Headers(),
      ),
      service.transferOwnership(
        { organizationId: pendingTransfer.organizationId, userId: pendingTransfer.targetUserId },
        { id: pendingTransfer.previousOwnerUserId },
        new Headers(),
      ),
    ])

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ organizationId: 'organization_1', userId: 'user_2' })
    expect(results[1]).toEqual(results[0])
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.findCompletedTransfer).toHaveBeenCalledTimes(1)
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.failTransfer).not.toHaveBeenCalled()
  })
})
