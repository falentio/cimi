import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipOperation,
  createMembershipRecord,
} from '../fixture.ts'

const organizationId = 'organization_1'
const authorityOrganizationId = 'authority_1'
const ownerUserId = 'user_owner'
const adminUserId = 'user_admin'
const memberUserId = 'user_member'
const targetUserId = 'user_target'

const owner = createMembershipRecord({ userId: ownerUserId, role: 'owner' })
const admin = createMembershipRecord({ userId: adminUserId, role: 'admin' })
const currentMember = createMembershipRecord({ userId: memberUserId, role: 'member' })
const targetMember = createMembershipRecord({ userId: targetUserId, role: 'member' })
const ownerAuthorityMember = createAuthorityMember({ id: 'member_owner', userId: ownerUserId })
const adminAuthorityMember = createAuthorityMember({
  id: 'member_admin',
  userId: adminUserId,
  role: 'admin',
})
const targetAuthorityMember = createAuthorityMember({
  id: 'member_target',
  userId: targetUserId,
  role: 'member',
})

const pendingRemoval = createMembershipOperation({
  id: 'operation_remove',
  organizationId,
  operationType: 'remove-member',
  targetUserId,
  targetRole: null,
  attemptCount: 1,
})

describe('MembershipService.remove', () => {
  it('rejects a member from removing another member', async () => {
    const fixture = createMembershipFixture(
      [owner, currentMember, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
    )

    await expect(
      fixture.service.remove(
        { organizationId, userId: targetUserId },
        { id: memberUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
  })

  it('revokes local access before removing a member from the authority', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, targetMember],
      [ownerAuthorityMember, adminAuthorityMember, targetAuthorityMember],
    )
    const operation = createMembershipOperation({
      id: 'operation_remove',
      organizationId,
      operationType: 'remove-member',
      targetUserId,
      targetRole: null,
      attemptCount: 0,
    })
    const events: string[] = []
    fixture.repository.createMembershipOperation.mockResolvedValue(operation)
    fixture.repository.incrementMembershipAttempt.mockResolvedValue()
    fixture.repository.delete.mockImplementation(async () => {
      events.push('delete')
      return true
    })
    fixture.repository.completeMembershipOperation.mockResolvedValue()
    fixture.authority.removeMember.mockImplementation(async () => {
      events.push('remove-member')
      return createAuthorityMember({ userId: targetUserId, role: 'member' })
    })

    await expect(
      fixture.service.remove(
        { organizationId, userId: targetUserId },
        { id: adminUserId },
        new Headers(),
      ),
    ).resolves.toBeUndefined()
    expect(events).toEqual(['delete', 'remove-member'])
  })

  it('keeps a removal operation pending when the authority removal fails', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, targetMember],
      [ownerAuthorityMember, adminAuthorityMember, targetAuthorityMember],
    )
    const operation = createMembershipOperation({
      id: 'operation_remove_failure',
      organizationId,
      operationType: 'remove-member',
      targetUserId,
      targetRole: null,
      attemptCount: 0,
    })
    fixture.repository.createMembershipOperation.mockResolvedValue(operation)
    fixture.repository.incrementMembershipAttempt.mockResolvedValue()
    fixture.repository.delete.mockResolvedValue(true)
    fixture.repository.failMembershipOperation.mockResolvedValue()
    fixture.authority.removeMember.mockRejectedValue(new Error('authority unavailable'))

    await expect(
      fixture.service.remove(
        { organizationId, userId: targetUserId },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(fixture.repository.failMembershipOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id, failureCode: 'CONFLICT' }),
    )
    expect(fixture.repository.completeMembershipOperation).not.toHaveBeenCalled()
  })

  it('lets an administrator recover a pending removal', async () => {
    const { repository, authority, service } = createMembershipFixture(
      [owner, admin],
      [ownerAuthorityMember, adminAuthorityMember, targetAuthorityMember],
    )
    repository.findPendingMembershipOperation.mockResolvedValue(pendingRemoval)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    authority.removeMember.mockResolvedValue(targetAuthorityMember)

    await expect(
      service.remove({ organizationId, userId: targetUserId }, { id: adminUserId }, new Headers()),
    ).resolves.toBeUndefined()

    expect(authority.removeMember).toHaveBeenCalledWith({
      organizationId: authorityOrganizationId,
      userId: targetUserId,
      headers: expect.any(Headers),
    })
    expect(repository.completeMembershipOperation).toHaveBeenCalledWith(pendingRemoval.id)
  })

  it('completes a pending removal when the authority member is already absent', async () => {
    const { repository, authority, service } = createMembershipFixture(
      [owner, admin],
      [ownerAuthorityMember, adminAuthorityMember, targetAuthorityMember],
    )
    repository.findPendingMembershipOperation.mockResolvedValue(pendingRemoval)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    authority.getMember.mockImplementation(async ({ userId }) =>
      userId === adminUserId ? adminAuthorityMember : undefined,
    )

    await expect(
      service.remove({ organizationId, userId: targetUserId }, { id: adminUserId }, new Headers()),
    ).resolves.toBeUndefined()

    expect(authority.removeMember).not.toHaveBeenCalled()
    expect(repository.completeMembershipOperation).toHaveBeenCalledWith(pendingRemoval.id)
  })

  it('protects the Owner from removal', async () => {
    const fixture = createMembershipFixture([owner, admin])

    await expect(
      fixture.service.remove(
        { organizationId, userId: ownerUserId },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })
    expect(fixture.repository.delete).not.toHaveBeenCalled()
    expect(fixture.authority.removeMember).not.toHaveBeenCalled()
  })

  it('rejects a removal for a missing target', async () => {
    const fixture = createMembershipFixture([owner, admin])

    await expect(
      fixture.service.remove(
        { organizationId, userId: 'user_missing' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
    expect(fixture.authority.removeMember).not.toHaveBeenCalled()
  })
})
