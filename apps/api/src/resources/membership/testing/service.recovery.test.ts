import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AuthorityMember, OrganizationAuthority } from '@cimi/auth'
import type { MembershipRepository, MembershipRecord } from '../repository.ts'
import { MembershipService } from '../service.ts'

const organizationId = 'organization_1'
const authorityOrganizationId = 'authority_1'
const ownerUserId = 'user_owner'
const adminUserId = 'user_admin'
const targetUserId = 'user_target'

const ownerMembership: MembershipRecord = {
  organizationId,
  userId: ownerUserId,
  role: 'owner',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
}

const adminMembership: MembershipRecord = {
  organizationId,
  userId: adminUserId,
  role: 'admin',
  createdAt: new Date('2026-09-01T00:00:01.000Z'),
  updatedAt: new Date('2026-09-01T00:00:01.000Z'),
}

const adminAuthorityMember: AuthorityMember = {
  id: 'member_admin',
  organizationId: authorityOrganizationId,
  userId: adminUserId,
  role: 'admin',
  createdAt: adminMembership.createdAt,
}

const targetAuthorityMember: AuthorityMember = {
  id: 'member_target',
  organizationId: authorityOrganizationId,
  userId: targetUserId,
  role: 'member',
  createdAt: new Date('2026-09-01T00:00:02.000Z'),
}

const pendingRemoval: MembershipRepository.MembershipOperation = {
  id: 'operation_remove',
  organizationId,
  operationType: 'remove-member',
  targetUserId,
  targetRole: null,
  attemptCount: 1,
}

const pendingLeave: MembershipRepository.MembershipOperation = {
  id: 'operation_leave',
  organizationId,
  operationType: 'leave-organization',
  targetUserId,
  targetRole: null,
  attemptCount: 1,
}

function configureAdminRecovery(
  repository: ReturnType<typeof mock<MembershipRepository>>,
  authority: ReturnType<typeof mock<OrganizationAuthority>>,
): void {
  repository.findAuthorityOrganizationId.mockResolvedValue(authorityOrganizationId)
  repository.findById.mockImplementation(async ({ userId }) =>
    userId === adminUserId ? adminMembership : undefined,
  )
  repository.findOwner.mockResolvedValue(ownerMembership)
  repository.hasPendingGovernanceOperation.mockResolvedValue(false)
  repository.replaceMembers.mockResolvedValue()
  authority.getMember.mockImplementation(async ({ userId }) =>
    userId === adminUserId ? adminAuthorityMember : targetAuthorityMember,
  )
  authority.listAllMembers.mockResolvedValue([ownerMembershipToAuthority()])
}

function ownerMembershipToAuthority(): AuthorityMember {
  return {
    id: 'member_owner',
    organizationId: authorityOrganizationId,
    userId: ownerUserId,
    role: 'owner',
    createdAt: ownerMembership.createdAt,
  }
}

describe('MembershipService membership operation recovery', () => {
  it('lets an administrator recover a pending removal', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })
    repository.findPendingMembershipOperation.mockResolvedValue(pendingRemoval)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    authority.removeMember.mockResolvedValue(targetAuthorityMember)
    configureAdminRecovery(repository, authority)

    await expect(
      service.remove({ organizationId, userId: targetUserId }, { id: adminUserId }, new Headers()),
    ).resolves.toBeUndefined()

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.removeMember).toHaveBeenCalledWith({
      organizationId: authorityOrganizationId,
      userId: targetUserId,
      headers: expect.any(Headers),
    })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.completeMembershipOperation).toHaveBeenCalledWith(pendingRemoval.id)
  })

  it('completes a pending removal when the authority member is already absent', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })
    repository.findPendingMembershipOperation.mockResolvedValue(pendingRemoval)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    configureAdminRecovery(repository, authority)
    authority.getMember.mockImplementation(async ({ userId }) =>
      userId === adminUserId ? adminAuthorityMember : undefined,
    )
    authority.listAllMembers.mockResolvedValue([ownerMembershipToAuthority()])

    await expect(
      service.remove({ organizationId, userId: targetUserId }, { id: adminUserId }, new Headers()),
    ).resolves.toBeUndefined()

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.removeMember).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.completeMembershipOperation).toHaveBeenCalledWith(pendingRemoval.id)
  })

  it('lets the leaving member retry after local deletion', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })
    repository.findPendingMembershipOperation.mockResolvedValue(pendingLeave)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    repository.findAuthorityOrganizationId.mockResolvedValue(authorityOrganizationId)
    repository.findById.mockResolvedValue(undefined)
    authority.getMember
      .mockResolvedValueOnce(targetAuthorityMember)
      .mockResolvedValueOnce(undefined)
    authority.leaveOrganization.mockResolvedValue()

    await expect(
      service.leave({ organizationId }, { id: targetUserId }, new Headers()),
    ).resolves.toBeUndefined()

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.leaveOrganization).toHaveBeenCalledWith({
      organizationId: authorityOrganizationId,
      headers: expect.any(Headers),
    })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.removeMember).not.toHaveBeenCalled()
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(repository.completeMembershipOperation).toHaveBeenCalledWith(pendingLeave.id)
  })

  it('lets an administrator recover a pending leave', async () => {
    const repository = mock<MembershipRepository>()
    const authority = mock<OrganizationAuthority>()
    const service = new MembershipService({ repository, authority })
    repository.findPendingMembershipOperation.mockResolvedValue(pendingLeave)
    repository.incrementMembershipAttempt.mockResolvedValue()
    repository.completeMembershipOperation.mockResolvedValue()
    authority.removeMember.mockResolvedValue(targetAuthorityMember)
    configureAdminRecovery(repository, authority)

    await expect(
      service.reconcile(organizationId, new Headers(), adminUserId),
    ).resolves.toBeUndefined()

    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.removeMember).toHaveBeenCalledWith({
      organizationId: authorityOrganizationId,
      userId: targetUserId,
      headers: expect.any(Headers),
    })
    // Vitest consumes the mock method reference as a matcher target.
    // oxlint-disable-next-line typescript/unbound-method
    expect(authority.leaveOrganization).not.toHaveBeenCalled()
  })
})
