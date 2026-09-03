import { describe, expect, it } from 'vitest'
import type { AuthorityMember } from '@cimi/auth'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipOperation,
  createMembershipRecord,
} from '../fixture.ts'

const organizationId = 'organization_1'
const ownerUserId = 'user_owner'
const adminUserId = 'user_admin'
const memberUserId = 'user_member'
const targetUserId = 'user_target'

const owner = createMembershipRecord({ userId: ownerUserId, role: 'owner' })
const admin = createMembershipRecord({ userId: adminUserId, role: 'admin' })
const currentMember = createMembershipRecord({ userId: memberUserId, role: 'member' })
const targetAdmin = createMembershipRecord({ userId: targetUserId, role: 'admin' })
const targetMember = createMembershipRecord({ userId: targetUserId, role: 'member' })

const pendingRoleChange = createMembershipOperation({
  id: 'operation_role_change',
  organizationId,
  operationType: 'change-member-role',
  targetUserId,
  targetRole: 'member',
  attemptCount: 1,
})

describe('MembershipService authorization', () => {
  it('allows a member to list members but not change a role', async () => {
    const { repository, authority, service } = createMembershipFixture(
      [owner, currentMember, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
    )

    await expect(
      service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).resolves.toEqual(expect.objectContaining({ totalCount: 3, hasMore: false }))
    await expect(
      service.changeRole(
        { organizationId, userId: targetUserId, role: 'admin' },
        { id: memberUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })

    expect(repository.createMembershipOperation).not.toHaveBeenCalled()
    expect(authority.changeMemberRole).not.toHaveBeenCalled()
  })

  it('allows an Administrator to change a non-owner role', async () => {
    const { repository, authority, service } = createMembershipFixture(
      [owner, admin, targetAdmin],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'admin' }),
        createAuthorityMember({ userId: targetUserId, role: 'admin' }),
      ],
    )
    const operation = createMembershipOperation({
      id: 'operation_role_change',
      organizationId,
      targetUserId,
      targetRole: 'member',
      attemptCount: 0,
    })
    repository.createMembershipOperation.mockResolvedValue(operation)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.updateRole.mockResolvedValue(targetMember)
    repository.completeMembershipOperation.mockResolvedValue()
    authority.changeMemberRole.mockResolvedValue(
      createAuthorityMember({ userId: targetUserId, role: 'member' }),
    )

    await expect(
      service.changeRole(
        { organizationId, userId: targetUserId, role: 'member' },
        { id: adminUserId },
        new Headers(),
      ),
    ).resolves.toMatchObject({ userId: targetUserId, role: 'member' })
    expect(authority.changeMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: `authority-member-${targetUserId}`, role: 'member' }),
    )
  })

  it('fails closed for a member while a role operation is pending', async () => {
    const { repository, authority, service } = createMembershipFixture([
      owner,
      currentMember,
      targetAdmin,
    ])

    repository.findPendingMembershipOperation.mockResolvedValue(pendingRoleChange)
    authority.getMember.mockResolvedValue(
      createAuthorityMember({ userId: memberUserId, role: 'member' }),
    )

    await expect(
      service.changeRole(
        { organizationId, userId: targetUserId, role: 'admin' },
        { id: memberUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })

    expect(repository.incrementMembershipAttempt).not.toHaveBeenCalled()
    expect(repository.updateRole).not.toHaveBeenCalled()
    expect(repository.completeMembershipOperation).not.toHaveBeenCalled()
    expect(authority.changeMemberRole).not.toHaveBeenCalled()
  })

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

  it('rejects an Administrator from transferring ownership', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
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

  it('revokes local access before removing a member from the authority', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'admin' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
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

  it('revokes local access before a member leaves the authority', async () => {
    const fixture = createMembershipFixture(
      [owner, currentMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
      ],
    )
    const operation = createMembershipOperation({
      id: 'operation_leave',
      organizationId,
      operationType: 'leave-organization',
      targetUserId: memberUserId,
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
    fixture.authority.leaveOrganization.mockImplementation(async () => {
      events.push('leave-organization')
    })

    await expect(
      fixture.service.leave({ organizationId }, { id: memberUserId }, new Headers()),
    ).resolves.toBeUndefined()
    expect(events).toEqual(['delete', 'leave-organization'])
  })

  it('keeps a removal operation pending when the authority removal fails', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'admin' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
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

  it('protects the Owner from role changes, removal, and leaving', async () => {
    const roleChange = createMembershipFixture([owner, admin])
    await expect(
      roleChange.service.changeRole(
        { organizationId, userId: ownerUserId, role: 'member' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })

    const removal = createMembershipFixture([owner, admin])
    await expect(
      removal.service.remove(
        { organizationId, userId: ownerUserId },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })

    const leave = createMembershipFixture([owner, admin])
    await expect(
      leave.service.leave({ organizationId }, { id: ownerUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })

    expect(roleChange.repository.createMembershipOperation).not.toHaveBeenCalled()
    expect(removal.repository.delete).not.toHaveBeenCalled()
    expect(leave.repository.delete).not.toHaveBeenCalled()
    expect(removal.authority.removeMember).not.toHaveBeenCalled()
    expect(leave.authority.leaveOrganization).not.toHaveBeenCalled()
  })

  it('rejects absent and already-owner transfer targets without creating an operation', async () => {
    const absent = createMembershipFixture([owner, targetMember])
    await expect(
      absent.service.transferOwnership(
        { organizationId, userId: 'missing-user' },
        { id: ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })

    const alreadyOwner = createMembershipFixture([owner, targetMember])
    await expect(
      alreadyOwner.service.transferOwnership(
        { organizationId, userId: ownerUserId },
        { id: ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })

    expect(absent.repository.createTransfer).not.toHaveBeenCalled()
    expect(alreadyOwner.repository.createTransfer).not.toHaveBeenCalled()
    expect(absent.authority.reconcileOwnership).not.toHaveBeenCalled()
  })

  it('imports authority members and removes stale local members during listing', async () => {
    const fixture = createMembershipFixture(
      [owner, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: 'user_new', role: 'member' }),
      ],
    )

    await expect(
      fixture.service.list({ organizationId }, { id: ownerUserId }, new Headers()),
    ).resolves.toEqual(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ userId: ownerUserId, role: 'owner' }),
          expect.objectContaining({ userId: 'user_new', role: 'member' }),
        ]),
        totalCount: 2,
      }),
    )
    expect(fixture.repository.replaceMembers).toHaveBeenCalledWith(organizationId, [
      expect.objectContaining({ userId: ownerUserId, role: 'owner' }),
      expect.objectContaining({ userId: 'user_new', role: 'member' }),
    ])
  })

  it('fails closed when authority listing fails before replacing local members', async () => {
    const fixture = createMembershipFixture([owner, currentMember])
    fixture.authority.listAllMembers.mockRejectedValue(new Error('authority unavailable'))

    await expect(
      fixture.service.list({ organizationId }, { id: ownerUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', status: 500 })
    expect(fixture.repository.replaceMembers).not.toHaveBeenCalled()
  })

  it('restores a member role in the authority when local promotion fails', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, currentMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'admin' }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
      ],
    )
    const operation = createMembershipOperation({
      id: 'operation_promotion',
      organizationId,
      operationType: 'change-member-role',
      targetUserId: memberUserId,
      targetRole: 'admin',
      attemptCount: 0,
    })
    let authorityTargetRole: AuthorityMember['role'] = 'member'
    fixture.authority.getMember.mockImplementation(async ({ userId }) => {
      if (userId === memberUserId)
        return createAuthorityMember({ userId: memberUserId, role: authorityTargetRole })
      return userId === adminUserId
        ? createAuthorityMember({ userId: adminUserId, role: 'admin' })
        : createAuthorityMember({ userId: ownerUserId, role: 'owner' })
    })
    fixture.authority.changeMemberRole.mockImplementation(async ({ memberId, role }) => {
      if (memberId === `authority-member-${memberUserId}`) authorityTargetRole = role
      return createAuthorityMember({ userId: memberUserId, role })
    })
    fixture.repository.createMembershipOperation.mockResolvedValue(operation)
    fixture.repository.incrementMembershipAttempt.mockResolvedValue()
    fixture.repository.updateRole.mockRejectedValue(new Error('local database unavailable'))
    fixture.repository.failMembershipOperation.mockResolvedValue()

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: memberUserId, role: 'admin' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(authorityTargetRole).toBe('member')
    expect(fixture.repository.failMembershipOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id }),
    )
    expect(fixture.repository.completeMembershipOperation).not.toHaveBeenCalled()
    expect(fixture.authority.changeMemberRole).toHaveBeenCalledTimes(2)
  })

  it('removes a stale local membership when authority access is gone', async () => {
    const fixture = createMembershipFixture([currentMember])
    fixture.repository.findById
      .mockResolvedValueOnce(currentMember)
      .mockResolvedValueOnce(undefined)
    fixture.repository.delete.mockResolvedValue(true)
    fixture.authority.getMember.mockResolvedValue(undefined)

    await expect(
      fixture.service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
    expect(fixture.repository.delete).toHaveBeenCalledWith({ organizationId, userId: memberUserId })
    expect(fixture.authority.listAllMembers).not.toHaveBeenCalled()
  })

  it('does not authorize against a stronger local role after authority reconciliation', async () => {
    const localActor = createMembershipRecord({ userId: adminUserId, role: 'admin' })
    const fixture = createMembershipFixture(
      [owner, localActor, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'member' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
    )
    fixture.repository.updateRole.mockResolvedValue(targetAdmin)

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: targetUserId, role: 'admin' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
  })

  it('fails closed on invalid authority membership organization IDs', async () => {
    const fixture = createMembershipFixture(
      [owner, currentMember],
      [
        createAuthorityMember({
          userId: ownerUserId,
          role: 'owner',
          organizationId: 'unexpected-authority',
        }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
      ],
    )

    await expect(
      fixture.service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', status: 500 })
    expect(fixture.repository.replaceMembers).not.toHaveBeenCalled()
  })

  it('fails closed when the authority Organization ID is missing', async () => {
    const fixture = createMembershipFixture([currentMember])
    fixture.repository.findAuthorityOrganizationId.mockResolvedValue(undefined)

    await expect(
      fixture.service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', status: 500 })
    expect(fixture.authority.listAllMembers).not.toHaveBeenCalled()
  })
})
