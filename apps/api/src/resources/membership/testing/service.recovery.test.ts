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
const targetUserId = 'user_target'

const ownerMembership = createMembershipRecord({ userId: ownerUserId, role: 'owner' })
const adminMembership = createMembershipRecord({ userId: adminUserId, role: 'admin' })
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
const ownerAuthorityMember = createAuthorityMember({ id: 'member_owner', userId: ownerUserId })

const pendingRemoval = createMembershipOperation({
  id: 'operation_remove',
  organizationId,
  operationType: 'remove-member',
  targetUserId,
  targetRole: null,
  attemptCount: 1,
})

const pendingLeave = createMembershipOperation({
  id: 'operation_leave',
  organizationId,
  operationType: 'leave-organization',
  targetUserId,
  targetRole: null,
  attemptCount: 1,
})

describe('MembershipService membership operation recovery', () => {
  it('lets an administrator recover a pending removal', async () => {
    const { repository, authority, service } = createMembershipFixture(
      [ownerMembership, adminMembership],
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
      [ownerMembership, adminMembership],
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

  it('lets the leaving member retry after local deletion', async () => {
    const { repository, authority, service } = createMembershipFixture([], [targetAuthorityMember])
    repository.findPendingMembershipOperation.mockResolvedValue(pendingLeave)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    authority.getMember
      .mockResolvedValueOnce(targetAuthorityMember)
      .mockResolvedValueOnce(undefined)
    authority.leaveOrganization.mockResolvedValue()

    await expect(
      service.leave({ organizationId }, { id: targetUserId }, new Headers()),
    ).resolves.toBeUndefined()

    expect(authority.leaveOrganization).toHaveBeenCalledWith({
      organizationId: authorityOrganizationId,
      headers: expect.any(Headers),
    })
    expect(authority.removeMember).not.toHaveBeenCalled()
    expect(repository.completeMembershipOperation).toHaveBeenCalledWith(pendingLeave.id)
  })

  it('lets an administrator recover a pending leave', async () => {
    const { repository, authority, service } = createMembershipFixture(
      [ownerMembership, adminMembership],
      [ownerAuthorityMember, adminAuthorityMember, targetAuthorityMember],
    )
    repository.findPendingMembershipOperation.mockResolvedValue(pendingLeave)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    authority.removeMember.mockResolvedValue(targetAuthorityMember)

    await expect(
      service.reconcile(organizationId, new Headers(), adminUserId),
    ).resolves.toBeUndefined()

    expect(authority.removeMember).toHaveBeenCalledWith({
      organizationId: authorityOrganizationId,
      userId: targetUserId,
      headers: expect.any(Headers),
    })
    expect(authority.leaveOrganization).not.toHaveBeenCalled()
  })
})
