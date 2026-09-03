import { describe, expect, it } from 'vitest'
import type { AuthorityMember } from '@cimi/auth'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipOperation,
  createMembershipRecord,
} from '../fixture.ts'

const organizationId = 'org_1'
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
  id: 'gop_role_change',
  organizationId,
  operationType: 'change-member-role',
  targetUserId,
  targetRole: 'member',
  attemptCount: 1,
})

describe('MembershipService.changeRole', () => {
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
      id: 'gop_role_change',
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

  it('rejects a member from changing a role', async () => {
    const fixture = createMembershipFixture(
      [owner, currentMember, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
    )

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: targetUserId, role: 'admin' },
        { id: memberUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
    expect(fixture.authority.changeMemberRole).not.toHaveBeenCalled()
  })

  it('protects the Owner from role changes', async () => {
    const fixture = createMembershipFixture([owner, admin])

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: ownerUserId, role: 'member' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
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
      id: 'gop_promotion',
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

  it('rejects a role change for a missing target', async () => {
    const fixture = createMembershipFixture([owner, admin])

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: 'user_missing', role: 'member' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
  })

  it('returns the target unchanged when the role already matches', async () => {
    const fixture = createMembershipFixture([owner, admin, targetMember])

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: targetUserId, role: 'member' },
        { id: adminUserId },
        new Headers(),
      ),
    ).resolves.toMatchObject({ userId: targetUserId, role: 'member' })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
    expect(fixture.authority.changeMemberRole).not.toHaveBeenCalled()
  })

  it('rejects a promotion when the authority member is absent', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'admin' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
    )
    fixture.authority.getMember.mockImplementation(async ({ userId }) =>
      userId === targetUserId
        ? undefined
        : createAuthorityMember({ userId, role: userId === adminUserId ? 'admin' : 'owner' }),
    )

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: targetUserId, role: 'admin' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
  })

  it('protects an authority owner from a local promotion', async () => {
    const fixture = createMembershipFixture(
      [owner, admin, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: adminUserId, role: 'admin' }),
        createAuthorityMember({ userId: targetUserId, role: 'member' }),
      ],
    )
    fixture.authority.getMember.mockImplementation(async ({ userId }) =>
      createAuthorityMember({
        userId,
        role: userId === targetUserId ? 'owner' : userId === adminUserId ? 'admin' : 'owner',
      }),
    )

    await expect(
      fixture.service.changeRole(
        { organizationId, userId: targetUserId, role: 'admin' },
        { id: adminUserId },
        new Headers(),
      ),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
  })
})
