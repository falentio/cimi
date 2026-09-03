import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipOperation,
  createMembershipRecord,
} from '../fixture.ts'

const organizationId = 'org_1'
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

const pendingLeave = createMembershipOperation({
  id: 'gop_leave',
  organizationId,
  operationType: 'leave-organization',
  targetUserId,
  targetRole: null,
  attemptCount: 1,
})

describe('MembershipService.reconcile', () => {
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

  it('rejects reconciliation when request headers are missing', async () => {
    const { repository, service } = createMembershipFixture()

    await expect(service.reconcile(organizationId)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
    })
    expect(repository.findPendingMembershipOperation).not.toHaveBeenCalled()
  })
})
