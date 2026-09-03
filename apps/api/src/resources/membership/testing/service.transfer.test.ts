import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipRecord,
  createTransfer,
} from '../fixture.ts'

const pendingTransfer = createTransfer()
const previousOwner = createAuthorityMember({
  id: 'member_1',
  userId: 'user_1',
  role: 'admin',
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
})
const target = createMembershipRecord({
  userId: 'user_2',
  role: 'owner',
  createdAt: new Date('2026-08-31T00:00:01.000Z'),
  updatedAt: new Date('2026-08-31T00:00:02.000Z'),
})
const targetAuthorityMember = createAuthorityMember({
  id: 'member_2',
  userId: 'user_2',
  role: 'owner',
  createdAt: target.createdAt,
})

const previousOwnerMembership = createMembershipRecord({
  userId: pendingTransfer.previousOwnerUserId,
  role: 'owner',
  createdAt: previousOwner.createdAt,
  updatedAt: previousOwner.createdAt,
})

describe('MembershipService.transferOwnership', () => {
  it('retries after Cimi completion fails following authority convergence', async () => {
    const { repository, authority, service } = createMembershipFixture([previousOwnerMembership])
    repository.findPendingTransfer.mockResolvedValue(pendingTransfer)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.markTransferAttempt.mockResolvedValue()
    repository.completeTransfer
      .mockRejectedValueOnce(new Error('Cimi transaction unavailable'))
      .mockResolvedValueOnce(target)
    repository.failTransfer.mockResolvedValue()
    authority.reconcileOwnership.mockResolvedValue({
      previousOwner,
      target: targetAuthorityMember,
    })

    await expect(
      service.transferOwnership(
        { organizationId: pendingTransfer.organizationId, userId: pendingTransfer.targetUserId },
        { id: pendingTransfer.previousOwnerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })

    await expect(
      service.transferOwnership(
        { organizationId: pendingTransfer.organizationId, userId: pendingTransfer.targetUserId },
        { id: pendingTransfer.previousOwnerUserId },
        new Headers(),
      ),
    ).resolves.toMatchObject({ organizationId: 'organization_1', userId: 'user_2' })

    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.failTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'operation_1',
        failureCode: 'CONFLICT',
        failureMessage: 'Cimi transaction unavailable',
      }),
    )
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.markTransferAttempt).toHaveBeenCalledTimes(2)
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.completeTransfer).toHaveBeenCalledTimes(2)
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.reconcileOwnership).toHaveBeenCalledTimes(2)
  })

  it('rejects a pending transfer for a caller who is no longer the persisted Owner', async () => {
    const { repository, authority, service } = createMembershipFixture()
    repository.findPendingTransfer.mockResolvedValue(pendingTransfer)
    repository.findById.mockResolvedValue(undefined)
    repository.findOwner.mockResolvedValue(undefined)
    repository.isOwnerInvariantValid.mockResolvedValue(true)

    await expect(
      service.transferOwnership(
        { organizationId: pendingTransfer.organizationId, userId: pendingTransfer.targetUserId },
        { id: pendingTransfer.previousOwnerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.reconcileOwnership).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.markTransferAttempt).not.toHaveBeenCalled()
  })

  it('returns the completed transfer to overlapping callers', async () => {
    const { repository, authority, service } = createMembershipFixture([previousOwnerMembership])
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
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    repository.markTransferAttempt.mockResolvedValue()
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
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.findCompletedTransfer).toHaveBeenCalledTimes(1)
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.failTransfer).not.toHaveBeenCalled()
  })
})
