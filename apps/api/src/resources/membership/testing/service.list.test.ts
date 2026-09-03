import { describe, expect, it } from 'vitest'
import {
  createAuthorityMember,
  createMembershipFixture,
  createMembershipRecord,
} from '../fixture.ts'

const organizationId = 'org_1'
const ownerUserId = 'user_owner'
const memberUserId = 'user_member'
const currentMember = createMembershipRecord({ userId: memberUserId, role: 'member' })
const owner = createMembershipRecord({ userId: ownerUserId, role: 'owner' })
const targetMember = createMembershipRecord({ userId: 'user_target', role: 'member' })

describe('MembershipService.list', () => {
  it('allows a member to list members', async () => {
    const { repository, authority, service } = createMembershipFixture(
      [owner, currentMember, targetMember],
      [
        createAuthorityMember({ userId: ownerUserId, role: 'owner' }),
        createAuthorityMember({ userId: memberUserId, role: 'member' }),
        createAuthorityMember({ userId: 'user_target', role: 'member' }),
      ],
    )

    await expect(
      service.list({ organizationId }, { id: memberUserId }, new Headers()),
    ).resolves.toEqual(expect.objectContaining({ totalCount: 3, hasMore: false }))

    expect(repository.createMembershipOperation).not.toHaveBeenCalled()
    expect(authority.changeMemberRole).not.toHaveBeenCalled()
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

  it('passes list pagination to the repository', async () => {
    const fixture = createMembershipFixture([owner])
    fixture.repository.findMany.mockResolvedValue({
      items: [],
      nextOffset: 7,
      hasMore: true,
      totalCount: 10,
    })

    await expect(
      fixture.service.list(
        { organizationId, offset: 5, limit: 2 },
        { id: ownerUserId },
        new Headers(),
      ),
    ).resolves.toEqual({ items: [], nextOffset: 7, hasMore: true, totalCount: 10 })
    expect(fixture.repository.findMany).toHaveBeenCalledWith({
      organizationId,
      offset: 5,
      limit: 2,
    })
  })
})
