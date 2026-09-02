import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AuthorityMember, OrganizationAuthority } from '@cimi/auth'
import type { MembershipRepository, MembershipRecord } from '../repository.ts'
import { MembershipService } from '../service.ts'

const organizationId = 'organization_1'
const authorityOrganizationId = 'authority_1'
const ownerUserId = 'user_owner'
const adminUserId = 'user_admin'
const memberUserId = 'user_member'
const targetUserId = 'user_target'
const createdAt = new Date('2026-09-01T00:00:00.000Z')

type RepositoryMock = ReturnType<typeof mock<MembershipRepository>>
type AuthorityMock = ReturnType<typeof mock<OrganizationAuthority>>

function membership(userId: string, role: MembershipRecord['role']): MembershipRecord {
  return {
    organizationId,
    userId,
    role,
    createdAt,
    updatedAt: createdAt,
  }
}

function authorityMember(
  userId: string,
  role: AuthorityMember['role'],
  memberOrganizationId = authorityOrganizationId,
): AuthorityMember {
  return {
    id: `authority-member-${userId}`,
    organizationId: memberOrganizationId,
    userId,
    role,
    createdAt,
  }
}

function configureProjection(
  repository: RepositoryMock,
  authority: AuthorityMock,
  localMembers: MembershipRecord[],
  authorityMembers: AuthorityMember[],
): void {
  let projectedMembers = localMembers
  repository.findPendingMembershipOperation.mockResolvedValue(undefined)
  repository.findAuthorityOrganizationId.mockResolvedValue(authorityOrganizationId)
  repository.findById.mockImplementation(
    async ({ organizationId: requestedOrganizationId, userId }) =>
      projectedMembers.find(
        (member) => member.organizationId === requestedOrganizationId && member.userId === userId,
      ),
  )
  repository.findOwner.mockImplementation(async (requestedOrganizationId) =>
    projectedMembers.find(
      (member) => member.organizationId === requestedOrganizationId && member.role === 'owner',
    ),
  )
  repository.hasPendingGovernanceOperation.mockResolvedValue(false)
  repository.isOwnerInvariantValid.mockImplementation(async (requestedOrganizationId) => {
    const members = projectedMembers.filter(
      (member) => member.organizationId === requestedOrganizationId,
    )
    return members.filter((member) => member.role === 'owner').length === 1
  })
  repository.replaceMembers.mockImplementation(async (_requestedOrganizationId, members) => {
    projectedMembers = members
  })
  repository.findMany.mockImplementation(
    async ({ organizationId: requestedOrganizationId, offset, limit }) => {
      const members = projectedMembers.filter(
        (member) => member.organizationId === requestedOrganizationId,
      )
      const items = members.slice(offset, offset + limit)
      const hasMore = offset + items.length < members.length
      return {
        items,
        nextOffset: hasMore ? offset + items.length : null,
        hasMore,
        totalCount: members.length,
      }
    },
  )
  authority.getMember.mockImplementation(async ({ userId }) =>
    authorityMembers.find((member) => member.userId === userId),
  )
  authority.listAllMembers.mockResolvedValue(authorityMembers)
}

function createFixture(
  localMembers: MembershipRecord[],
  authorityMembers = localMembers.map((member) => authorityMember(member.userId, member.role)),
): { repository: RepositoryMock; authority: AuthorityMock; service: MembershipService } {
  const repository = mock<MembershipRepository>()
  const authority = mock<OrganizationAuthority>()
  configureProjection(repository, authority, localMembers, authorityMembers)
  return { repository, authority, service: new MembershipService({ repository, authority }) }
}

const owner = membership(ownerUserId, 'owner')
const admin = membership(adminUserId, 'admin')
const currentMember = membership(memberUserId, 'member')
const targetAdmin = membership(targetUserId, 'admin')
const targetMember = membership(targetUserId, 'member')

const pendingRoleChange: MembershipRepository.MembershipOperation = {
  id: 'operation_role_change',
  organizationId,
  operationType: 'change-member-role',
  targetUserId,
  targetRole: 'member',
  attemptCount: 1,
}

describe('MembershipService authorization', () => {
  it('allows a member to list members but not change a role', async () => {
    const { repository, authority, service } = createFixture(
      [owner, currentMember, targetMember],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(memberUserId, 'member'),
        authorityMember(targetUserId, 'member'),
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

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.createMembershipOperation).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.changeMemberRole).not.toHaveBeenCalled()
  })

  it('allows an Administrator to change a non-owner role', async () => {
    const { repository, authority, service } = createFixture(
      [owner, admin, targetAdmin],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(adminUserId, 'admin'),
        authorityMember(targetUserId, 'admin'),
      ],
    )
    const operation: MembershipRepository.MembershipOperation = {
      id: 'operation_role_change',
      organizationId,
      operationType: 'change-member-role',
      targetUserId,
      targetRole: 'member',
      attemptCount: 0,
    }
    repository.createMembershipOperation.mockResolvedValue(operation)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.updateRole.mockResolvedValue(targetMember)
    repository.completeMembershipOperation.mockResolvedValue()
    authority.changeMemberRole.mockResolvedValue(authorityMember(targetUserId, 'member'))

    await expect(
      service.changeRole(
        { organizationId, userId: targetUserId, role: 'member' },
        { id: adminUserId },
        new Headers(),
      ),
    ).resolves.toMatchObject({ userId: targetUserId, role: 'member' })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.changeMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: `authority-member-${targetUserId}`, role: 'member' }),
    )
  })

  it('fails closed for a member while a role operation is pending', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })

    repository.findPendingMembershipOperation.mockResolvedValue(pendingRoleChange)
    repository.findAuthorityOrganizationId.mockResolvedValue(authorityOrganizationId)
    repository.findById.mockImplementation(async ({ userId }) => {
      if (userId === memberUserId) return currentMember
      if (userId === targetUserId) return targetAdmin
      return undefined
    })
    repository.findOwner.mockResolvedValue(owner)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.isOwnerInvariantValid.mockResolvedValue(true)
    authority.getMember.mockResolvedValue(authorityMember(memberUserId, 'member'))

    await expect(
      service.changeRole(
        { organizationId, userId: targetUserId, role: 'admin' },
        { id: memberUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.incrementMembershipAttempt).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.updateRole).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.completeMembershipOperation).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.changeMemberRole).not.toHaveBeenCalled()
  })

  it('rejects a member from removing another member', async () => {
    const fixture = createFixture(
      [owner, currentMember, targetMember],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(memberUserId, 'member'),
        authorityMember(targetUserId, 'member'),
      ],
    )

    await expect(
      fixture.service.remove(
        { organizationId, userId: targetUserId },
        { id: memberUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
  })

  it('rejects an Administrator from transferring ownership', async () => {
    const fixture = createFixture(
      [owner, admin, targetMember],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(adminUserId, 'admin'),
        authorityMember(targetUserId, 'member'),
      ],
    )

    await expect(
      fixture.service.transferOwnership(
        { organizationId, userId: targetUserId },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.createTransfer).not.toHaveBeenCalled()
  })

  it('revokes local access before removing a member from the authority', async () => {
    const fixture = createFixture(
      [owner, admin, targetMember],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(adminUserId, 'admin'),
        authorityMember(targetUserId, 'member'),
      ],
    )
    const operation: MembershipRepository.MembershipOperation = {
      id: 'operation_remove',
      organizationId,
      operationType: 'remove-member',
      targetUserId,
      targetRole: null,
      attemptCount: 0,
    }
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
      return authorityMember(targetUserId, 'member')
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
    const fixture = createFixture(
      [owner, currentMember],
      [authorityMember(ownerUserId, 'owner'), authorityMember(memberUserId, 'member')],
    )
    const operation: MembershipRepository.MembershipOperation = {
      id: 'operation_leave',
      organizationId,
      operationType: 'leave-organization',
      targetUserId: memberUserId,
      targetRole: null,
      attemptCount: 0,
    }
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
    const fixture = createFixture(
      [owner, admin, targetMember],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(adminUserId, 'admin'),
        authorityMember(targetUserId, 'member'),
      ],
    )
    const operation: MembershipRepository.MembershipOperation = {
      id: 'operation_remove_failure',
      organizationId,
      operationType: 'remove-member',
      targetUserId,
      targetRole: null,
      attemptCount: 0,
    }
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
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.failMembershipOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id, failureCode: 'CONFLICT' }),
    )
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.completeMembershipOperation).not.toHaveBeenCalled()
  })

  it('protects the Owner from role changes, removal, and leaving', async () => {
    const roleChange = createFixture([owner, admin])
    await expect(
      roleChange.service.changeRole(
        { organizationId, userId: ownerUserId, role: 'member' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })

    const removal = createFixture([owner, admin])
    await expect(
      removal.service.remove(
        { organizationId, userId: ownerUserId },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })

    const leave = createFixture([owner, admin])
    await expect(
      leave.service.leave({ organizationId }, { id: ownerUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(roleChange.repository.createMembershipOperation).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(removal.repository.delete).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(leave.repository.delete).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(removal.authority.removeMember).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(leave.authority.leaveOrganization).not.toHaveBeenCalled()
  })

  it('rejects absent and already-owner transfer targets without creating an operation', async () => {
    const absent = createFixture([owner, targetMember])
    await expect(
      absent.service.transferOwnership(
        { organizationId, userId: 'missing-user' },
        { id: ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })

    const alreadyOwner = createFixture([owner, targetMember])
    await expect(
      alreadyOwner.service.transferOwnership(
        { organizationId, userId: ownerUserId },
        { id: ownerUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(absent.repository.createTransfer).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(alreadyOwner.repository.createTransfer).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(absent.authority.reconcileOwnership).not.toHaveBeenCalled()
  })

  it('imports authority members and removes stale local members during listing', async () => {
    const fixture = createFixture(
      [owner, targetMember],
      [authorityMember(ownerUserId, 'owner'), authorityMember('user_new', 'member')],
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
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.replaceMembers).toHaveBeenCalledWith(organizationId, [
      expect.objectContaining({ userId: ownerUserId, role: 'owner' }),
      expect.objectContaining({ userId: 'user_new', role: 'member' }),
    ])
  })

  it('fails closed when authority listing fails before replacing local members', async () => {
    const fixture = createFixture([owner, currentMember])
    fixture.authority.listAllMembers.mockRejectedValue(new Error('authority unavailable'))

    await expect(
      fixture.service.list({ organizationId }, { id: ownerUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', status: 500 })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.replaceMembers).not.toHaveBeenCalled()
  })

  it('restores a member role in the authority when local promotion fails', async () => {
    const fixture = createFixture(
      [owner, admin, currentMember],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(adminUserId, 'admin'),
        authorityMember(memberUserId, 'member'),
      ],
    )
    const operation: MembershipRepository.MembershipOperation = {
      id: 'operation_promotion',
      organizationId,
      operationType: 'change-member-role',
      targetUserId: memberUserId,
      targetRole: 'admin',
      attemptCount: 0,
    }
    let authorityTargetRole: AuthorityMember['role'] = 'member'
    fixture.authority.getMember.mockImplementation(async ({ userId }) => {
      if (userId === memberUserId) return authorityMember(memberUserId, authorityTargetRole)
      return userId === adminUserId
        ? authorityMember(adminUserId, 'admin')
        : authorityMember(ownerUserId, 'owner')
    })
    fixture.authority.changeMemberRole.mockImplementation(async ({ memberId, role }) => {
      if (memberId === `authority-member-${memberUserId}`) authorityTargetRole = role
      return authorityMember(memberUserId, role)
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
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.failMembershipOperation).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id }),
    )
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.completeMembershipOperation).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.authority.changeMemberRole).toHaveBeenCalledTimes(2)
  })

  it('removes a stale local membership when authority access is gone', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })
    repository.findPendingMembershipOperation.mockResolvedValue(undefined)
    repository.findById.mockResolvedValueOnce(currentMember).mockResolvedValueOnce(undefined)
    repository.findAuthorityOrganizationId.mockResolvedValue(authorityOrganizationId)
    repository.hasPendingGovernanceOperation.mockResolvedValue(false)
    repository.delete.mockResolvedValue(true)
    authority.getMember.mockResolvedValue(undefined)

    await expect(
      service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.delete).toHaveBeenCalledWith({ organizationId, userId: memberUserId })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.listAllMembers).not.toHaveBeenCalled()
  })

  it('does not authorize against a stronger local role after authority reconciliation', async () => {
    const localActor = membership(adminUserId, 'admin')
    const fixture = createFixture(
      [owner, localActor, targetMember],
      [
        authorityMember(ownerUserId, 'owner'),
        authorityMember(adminUserId, 'member'),
        authorityMember(targetUserId, 'member'),
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
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
  })

  it('fails closed on invalid authority membership organization IDs', async () => {
    const fixture = createFixture(
      [owner, currentMember],
      [
        authorityMember(ownerUserId, 'owner', 'unexpected-authority'),
        authorityMember(memberUserId, 'member'),
      ],
    )

    await expect(
      fixture.service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', status: 500 })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(fixture.repository.replaceMembers).not.toHaveBeenCalled()
  })

  it('fails closed when the authority Organization ID is missing', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })
    repository.findPendingMembershipOperation.mockResolvedValue(undefined)
    repository.findById.mockResolvedValue(currentMember)
    repository.findAuthorityOrganizationId.mockResolvedValue(undefined)

    await expect(
      service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR', status: 500 })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.listAllMembers).not.toHaveBeenCalled()
  })
})
