import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipRecord,
  createTransfer,
} from '../fixture.ts'

const organizationId = 'org_1'
const ownerUserId = 'user_1'
const adminUserId = 'user_admin'
const targetUserId = 'user_2'

const pendingTransfer = createTransfer()
const previousOwner = createAuthorityMember({
  id: 'member_1',
  userId: ownerUserId,
  role: 'admin',
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
})
const target = createMembershipRecord({
  userId: targetUserId,
  role: 'owner',
  createdAt: new Date('2026-08-31T00:00:01.000Z'),
  updatedAt: new Date('2026-08-31T00:00:02.000Z'),
})
const targetAuthorityMember = createAuthorityMember({
  id: 'member_2',
  userId: targetUserId,
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
  it('rejects an Administrator from transferring ownership', async () => {
    const fixture = createMembershipFixture(
      [
        createMembershipRecord({ userId: 'user_owner', role: 'owner' }),
        createMembershipRecord({ userId: adminUserId, role: 'admin' }),
        createMembershipRecord({ userId: targetUserId, role: 'member' }),
      ],
      [
        createAuthorityMember({ userId: 'user_owner', role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'admin' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
    )

    await expect(
      fixture.service.transferOwnership(
        { organizationId, userId: targetUserId },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(fixture.repository.createTransfer).not.toHaveBeenCalled()
  })

  it('rejects an absent transfer target without creating an operation', async () => {
    const fixture = createMembershipFixture([
      createMembershipRecord({ userId: 'user_owner', role: 'owner' }),
      createMembershipRecord({ userId: targetUserId, role: 'member' }),
    ])

    await expect(
      fixture.service.transferOwnership(
        { organizationId, userId: 'missing-user' },
        { id: 'user_owner' },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(fixture.repository.createTransfer).not.toHaveBeenCalled()
    expect(fixture.authority.reconcileOwnership).not.toHaveBeenCalled()
  })

  it('rejects an already-owner transfer target without creating an operation', async () => {
    const fixture = createMembershipFixture([
      createMembershipRecord({ userId: 'user_owner', role: 'owner' }),
      createMembershipRecord({ userId: targetUserId, role: 'member' }),
    ])

    await expect(
      fixture.service.transferOwnership(
        { organizationId, userId: 'user_owner' },
        { id: 'user_owner' },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(fixture.repository.createTransfer).not.toHaveBeenCalled()
  })

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
    ).resolves.toMatchObject({ organizationId, userId: targetUserId })

    expect(repository.failTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'gop_1',
        failureCode: 'CONFLICT',
        failureMessage: 'Cimi transaction unavailable',
      }),
    )
    expect(repository.markTransferAttempt).toHaveBeenCalledTimes(2)
    expect(repository.completeTransfer).toHaveBeenCalledTimes(2)
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

    expect(authority.reconcileOwnership).not.toHaveBeenCalled()
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
    expect(results[0]).toMatchObject({ organizationId, userId: targetUserId })
    expect(results[1]).toEqual(results[0])
    expect(repository.findCompletedTransfer).toHaveBeenCalledTimes(1)
    expect(repository.failTransfer).not.toHaveBeenCalled()
  })

  it('rejects a pending transfer addressed to another target', async () => {
    const { repository, authority, service } = createMembershipFixture([
      createMembershipRecord({ userId: 'user_owner', role: 'owner' }),
    ])
    repository.findPendingTransfer.mockResolvedValue(pendingTransfer)

    await expect(
      service.transferOwnership(
        { organizationId, userId: 'user_other' },
        { id: pendingTransfer.previousOwnerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(repository.markTransferAttempt).not.toHaveBeenCalled()
    expect(authority.reconcileOwnership).not.toHaveBeenCalled()
  })

  it('returns a completed transfer without creating an operation', async () => {
    const { repository, authority, service } = createMembershipFixture([
      createMembershipRecord({ userId: 'user_owner', role: 'owner' }),
      createMembershipRecord({ userId: targetUserId, role: 'member' }),
    ])
    repository.findPendingTransfer.mockResolvedValue(undefined)
    repository.findCompletedTransfer.mockResolvedValue(target)

    await expect(
      service.transferOwnership(
        { organizationId, userId: targetUserId },
        { id: 'user_owner' },
        new Headers(),
      ),
    ).resolves.toMatchObject({ organizationId, userId: targetUserId, role: 'owner' })
    expect(repository.createTransfer).not.toHaveBeenCalled()
    expect(authority.reconcileOwnership).not.toHaveBeenCalled()
  })

  it('rejects a transfer the repository rules invalid', async () => {
    const { repository, authority, service } = createMembershipFixture([
      createMembershipRecord({ userId: 'user_owner', role: 'owner' }),
      createMembershipRecord({ userId: targetUserId, role: 'member' }),
    ])
    repository.findPendingTransfer.mockResolvedValue(undefined)
    repository.findCompletedTransfer.mockResolvedValue(undefined)
    repository.createTransfer.mockResolvedValue({ kind: 'invalid' })

    await expect(
      service.transferOwnership(
        { organizationId, userId: targetUserId },
        { id: 'user_owner' },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authority.reconcileOwnership).not.toHaveBeenCalled()
  })

  it('rejects an already-pending transfer owned by another caller', async () => {
    const { repository, authority, service } = createMembershipFixture([
      createMembershipRecord({ userId: 'user_owner', role: 'owner' }),
      createMembershipRecord({ userId: targetUserId, role: 'member' }),
    ])
    repository.findPendingTransfer.mockResolvedValue(undefined)
    repository.findCompletedTransfer.mockResolvedValue(undefined)
    repository.createTransfer.mockResolvedValue({
      kind: 'already-pending',
      transfer: createTransfer({
        previousOwnerUserId: 'user_other',
        targetUserId: 'user_someone',
      }),
    })

    await expect(
      service.transferOwnership(
        { organizationId, userId: targetUserId },
        { id: 'user_owner' },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authority.reconcileOwnership).not.toHaveBeenCalled()
  })
})
