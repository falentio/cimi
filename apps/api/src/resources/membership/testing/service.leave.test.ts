import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipOperation,
  createMembershipRecord,
} from '../fixture.ts'

const organizationId = 'org_1'
const ownerUserId = 'user_owner'
const memberUserId = 'user_member'

const owner = createMembershipRecord({ userId: ownerUserId, role: 'owner' })
const currentMember = createMembershipRecord({ userId: memberUserId, role: 'member' })
const targetAuthorityMember = createAuthorityMember({
  id: 'member_target',
  userId: memberUserId,
  role: 'member',
})
const pendingLeave = createMembershipOperation({
  id: 'gop_leave',
  organizationId,
  operationType: 'leave-organization',
  targetUserId: memberUserId,
  targetRole: null,
  attemptCount: 1,
})

describe('MembershipService.leave', () => {
  it('revokes local access before a member leaves the authority', async () => {
    const fixture = createMembershipFixture(
      [owner, currentMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
      ],
    )
    const operation = createMembershipOperation({
      id: 'gop_leave',
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
      service.leave({ organizationId }, { id: memberUserId }, new Headers()),
    ).resolves.toBeUndefined()

    expect(authority.leaveOrganization).toHaveBeenCalledWith({
      organizationId: 'authority_1',
      headers: expect.any(Headers),
    })
    expect(authority.removeMember).not.toHaveBeenCalled()
    expect(repository.completeMembershipOperation).toHaveBeenCalledWith(pendingLeave.id)
  })

  it('protects the Owner from leaving', async () => {
    const fixture = createMembershipFixture([
      owner,
      createMembershipRecord({ userId: 'user_admin', role: 'admin' }),
    ])

    await expect(
      fixture.service.leave({ organizationId }, { id: ownerUserId }, new Headers()),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED', status: 409 })
    expect(fixture.repository.delete).not.toHaveBeenCalled()
    expect(fixture.authority.leaveOrganization).not.toHaveBeenCalled()
  })

  it('rejects a leave for a non-member', async () => {
    const fixture = createMembershipFixture([owner])

    await expect(
      fixture.service.leave({ organizationId }, { id: 'user_missing' }, new Headers()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 })
    expect(fixture.repository.createMembershipOperation).not.toHaveBeenCalled()
    expect(fixture.authority.leaveOrganization).not.toHaveBeenCalled()
  })
})
