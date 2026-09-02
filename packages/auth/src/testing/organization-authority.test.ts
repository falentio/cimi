import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { BetterAuthOrganizationAuthority } from '../organization-authority.ts'
import { createAuth } from '../server.ts'

const headers = new Headers({ cookie: 'session=<REDACTED>' })
const memberOne = {
  id: 'member_1',
  organizationId: 'authority_1',
  userId: 'user_1',
  role: 'owner',
  createdAt: new Date('2026-08-31T00:00:00.000Z'),
  user: { id: 'user_1', email: 'ada@example.com', name: 'Ada', image: undefined },
} satisfies {
  id: string
  organizationId: string
  userId: string
  role: 'owner'
  createdAt: Date
  user: { id: string; email: string; name: string; image?: string | undefined }
}
const memberTwo = {
  id: 'member_2',
  organizationId: 'authority_1',
  userId: 'user_2',
  role: 'member',
  createdAt: new Date('2026-08-31T00:00:01.000Z'),
  user: { id: 'user_2', email: 'grace@example.com', name: 'Grace', image: undefined },
} satisfies {
  id: string
  organizationId: string
  userId: string
  role: 'member'
  createdAt: Date
  user: { id: string; email: string; name: string; image?: string | undefined }
}
const memberThree = {
  id: 'member_3',
  organizationId: 'authority_1',
  userId: 'user_3',
  role: 'owner',
  createdAt: new Date('2026-08-31T00:00:02.000Z'),
  user: { id: 'user_3', email: 'lin@example.com', name: 'Lin', image: undefined },
} satisfies {
  id: string
  organizationId: string
  userId: string
  role: 'owner'
  createdAt: Date
  user: { id: string; email: string; name: string; image?: string | undefined }
}

let db: Db

afterEach(() => {
  if (db !== undefined) closeDb(db)
  vi.restoreAllMocks()
})

describe('BetterAuthOrganizationAuthority', () => {
  it('creates an Organization and maps its initial Owner member', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const createOrganization = vi.spyOn(auth.api, 'createOrganization').mockResolvedValue({
      id: 'authority_1',
      name: 'Analytics',
      slug: 'analytics',
      createdAt: memberOne.createdAt,
      metadata: {},
      members: [memberOne],
    })

    await expect(
      authority.createOrganization({ name: 'Analytics', slug: 'analytics', ownerUserId: 'user_1' }),
    ).resolves.toEqual({
      organization: {
        id: 'authority_1',
        name: 'Analytics',
        slug: 'analytics',
        createdAt: memberOne.createdAt,
      },
      member: {
        id: 'member_1',
        organizationId: 'authority_1',
        userId: 'user_1',
        role: 'owner',
        createdAt: memberOne.createdAt,
      },
    })
    expect(createOrganization).toHaveBeenCalledWith({
      body: { name: 'Analytics', slug: 'analytics', userId: 'user_1' },
    })
  })

  it('lists Organizations for the authenticated session and forwards headers', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listOrganizations = vi.spyOn(auth.api, 'listOrganizations').mockResolvedValue([
      {
        id: 'authority_1',
        name: 'Analytics',
        slug: 'analytics',
        createdAt: memberOne.createdAt,
        metadata: {},
      },
    ])

    await expect(authority.listOrganizations({ headers })).resolves.toEqual([
      {
        id: 'authority_1',
        name: 'Analytics',
        slug: 'analytics',
        createdAt: memberOne.createdAt,
      },
    ])
    expect(listOrganizations).toHaveBeenCalledWith({ headers })
  })

  it('maps Organization reads and updates while forwarding headers', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const organization = {
      id: 'authority_1',
      name: 'Analytics',
      slug: 'analytics',
      createdAt: memberOne.createdAt,
    }
    const getOrganization = vi.spyOn(auth.api, 'getOrganization')
    getOrganization.mockResolvedValueOnce(organization).mockResolvedValueOnce(organization)
    const updateOrganization = vi
      .spyOn(auth.api, 'updateOrganization')
      .mockResolvedValue(organization)

    await expect(
      authority.getOrganization({ organizationId: 'authority_1', headers }),
    ).resolves.toEqual(organization)
    await expect(authority.getOrganizationBySlug({ slug: 'analytics', headers })).resolves.toEqual(
      organization,
    )
    await expect(
      authority.updateOrganization({ organizationId: 'authority_1', name: 'Reports', headers }),
    ).resolves.toEqual(organization)

    expect(getOrganization).toHaveBeenNthCalledWith(1, {
      headers,
      query: { organizationId: 'authority_1' },
    })
    expect(getOrganization).toHaveBeenNthCalledWith(2, {
      headers,
      query: { organizationSlug: 'analytics' },
    })
    expect(updateOrganization).toHaveBeenCalledWith({
      headers,
      body: { organizationId: 'authority_1', data: { name: 'Reports' } },
    })
  })

  it('normalizes missing Organization reads and deletes without hiding provider failures', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const notFound = Object.assign(new Error('missing'), {
      body: { code: 'ORGANIZATION_NOT_FOUND' },
    })
    const getOrganization = vi.spyOn(auth.api, 'getOrganization')
    getOrganization.mockRejectedValueOnce(notFound).mockResolvedValueOnce(null)
    const deleteOrganization = vi.spyOn(auth.api, 'deleteOrganization')
    deleteOrganization.mockRejectedValueOnce(notFound).mockResolvedValueOnce({
      id: 'authority_1',
      name: 'Analytics',
      slug: 'analytics',
      createdAt: memberOne.createdAt,
    })

    await expect(
      authority.getOrganization({ organizationId: 'missing', headers }),
    ).resolves.toBeUndefined()
    await expect(
      authority.getOrganizationBySlug({ slug: 'missing', headers }),
    ).resolves.toBeUndefined()
    await expect(
      authority.deleteOrganization({ organizationId: 'missing', headers }),
    ).resolves.toBeUndefined()
    await expect(
      authority.deleteOrganization({ organizationId: 'authority_1', headers }),
    ).resolves.toBeUndefined()

    const providerError = new Error('authority unavailable')
    getOrganization.mockRejectedValueOnce(providerError)
    deleteOrganization.mockRejectedValueOnce(providerError)
    await expect(
      authority.getOrganization({ organizationId: 'authority_1', headers }),
    ).rejects.toBe(providerError)
    await expect(
      authority.deleteOrganization({ organizationId: 'authority_1', headers }),
    ).rejects.toBe(providerError)
  })

  it('lists members, changes a role, and leaves through the authority API', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listMembers = vi.spyOn(auth.api, 'listMembers').mockResolvedValue({
      members: [memberOne, memberTwo],
      total: 2,
    })
    const updateMemberRole = vi.spyOn(auth.api, 'updateMemberRole').mockResolvedValue({
      ...memberTwo,
      role: 'admin',
    })
    const leaveOrganization = vi.spyOn(auth.api, 'leaveOrganization').mockResolvedValue({
      id: memberTwo.id,
      organizationId: memberTwo.organizationId,
      userId: memberTwo.userId,
      role: memberTwo.role,
      createdAt: memberTwo.createdAt,
      user: memberTwo.user,
    })

    await expect(
      authority.listMembers({ organizationId: 'authority_1', offset: 10, limit: 20, headers }),
    ).resolves.toEqual({
      members: [
        {
          id: 'member_1',
          organizationId: 'authority_1',
          userId: 'user_1',
          role: 'owner',
          createdAt: memberOne.createdAt,
        },
        {
          id: 'member_2',
          organizationId: 'authority_1',
          userId: 'user_2',
          role: 'member',
          createdAt: memberTwo.createdAt,
        },
      ],
      totalCount: 2,
    })
    await expect(
      authority.changeMemberRole({
        organizationId: 'authority_1',
        memberId: 'member_2',
        role: 'admin',
        headers,
      }),
    ).resolves.toMatchObject({ userId: 'user_2', role: 'admin' })
    await expect(
      authority.leaveOrganization({ organizationId: 'authority_1', headers }),
    ).resolves.toBeUndefined()

    expect(listMembers).toHaveBeenCalledWith({
      headers,
      query: { organizationId: 'authority_1', offset: 10, limit: 20 },
    })
    expect(updateMemberRole).toHaveBeenCalledWith({
      headers,
      body: { organizationId: 'authority_1', memberId: 'member_2', role: 'admin' },
    })
    expect(leaveOrganization).toHaveBeenCalledWith({
      headers,
      body: { organizationId: 'authority_1' },
    })
  })

  it('rejects malformed authority roles from member mutations', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    vi.spyOn(auth.api, 'updateMemberRole').mockResolvedValue({
      ...memberTwo,
      role: 'moderator' as 'admin' | 'member' | 'owner',
    })

    await expect(
      authority.changeMemberRole({
        organizationId: 'authority_1',
        memberId: 'member_2',
        role: 'admin',
        headers,
      }),
    ).rejects.toThrow('Unsupported Better Auth organization role: moderator')
  })

  it('finds a member on a later page and removes it by authority member ID', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listMembers = vi.spyOn(auth.api, 'listMembers')
    const removeMember = vi.spyOn(auth.api, 'removeMember')

    listMembers
      .mockResolvedValueOnce({ members: [memberOne], total: 2 })
      .mockResolvedValueOnce({ members: [memberTwo], total: 2 })
      .mockResolvedValueOnce({ members: [memberOne], total: 2 })
      .mockResolvedValueOnce({ members: [memberTwo], total: 2 })
    removeMember.mockResolvedValue({ member: memberTwo })

    await expect(
      authority.getMember({ organizationId: 'authority_1', userId: 'user_2', headers }),
    ).resolves.toMatchObject({ id: 'member_2', userId: 'user_2', role: 'member' })
    await expect(
      authority.removeMember({ organizationId: 'authority_1', userId: 'user_2', headers }),
    ).resolves.toMatchObject({ id: 'member_2', userId: 'user_2', role: 'member' })

    expect(listMembers).toHaveBeenCalledTimes(4)
    expect(listMembers).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ query: { organizationId: 'authority_1', offset: 1, limit: 100 } }),
    )
    expect(listMembers).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ query: { organizationId: 'authority_1', offset: 1, limit: 100 } }),
    )
    expect(removeMember).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { organizationId: 'authority_1', memberIdOrEmail: 'member_2' },
      }),
    )
  })

  it('aggregates all member pages with stable offsets and mapped members', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listMembers = vi.spyOn(auth.api, 'listMembers')
    listMembers
      .mockResolvedValueOnce({ members: [memberOne], total: 3 })
      .mockResolvedValueOnce({ members: [memberTwo], total: 3 })
      .mockResolvedValueOnce({ members: [memberThree], total: 3 })

    await expect(
      authority.listAllMembers({ organizationId: 'authority_1', headers }),
    ).resolves.toEqual([
      {
        id: 'member_1',
        organizationId: 'authority_1',
        userId: 'user_1',
        role: 'owner',
        createdAt: memberOne.createdAt,
      },
      {
        id: 'member_2',
        organizationId: 'authority_1',
        userId: 'user_2',
        role: 'member',
        createdAt: memberTwo.createdAt,
      },
      {
        id: 'member_3',
        organizationId: 'authority_1',
        userId: 'user_3',
        role: 'owner',
        createdAt: memberThree.createdAt,
      },
    ])
    expect(listMembers).toHaveBeenNthCalledWith(1, {
      headers,
      query: { organizationId: 'authority_1', offset: 0, limit: 100 },
    })
    expect(listMembers).toHaveBeenNthCalledWith(2, {
      headers,
      query: { organizationId: 'authority_1', offset: 1, limit: 100 },
    })
    expect(listMembers).toHaveBeenNthCalledWith(3, {
      headers,
      query: { organizationId: 'authority_1', offset: 2, limit: 100 },
    })
  })

  it('completes a successful ownership transfer and returns the final members', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listMembers = vi.spyOn(auth.api, 'listMembers')
    const updateMemberRole = vi.spyOn(auth.api, 'updateMemberRole')
    const targetOwner = { ...memberTwo, role: 'owner' as const }
    const previousOwnerAdmin = { ...memberOne, role: 'admin' as const }
    listMembers
      .mockResolvedValueOnce({ members: [memberOne, memberTwo], total: 2 })
      .mockResolvedValueOnce({ members: [previousOwnerAdmin, targetOwner], total: 2 })
    updateMemberRole.mockResolvedValueOnce(targetOwner).mockResolvedValueOnce(previousOwnerAdmin)

    await expect(
      authority.reconcileOwnership({
        organizationId: 'authority_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
        headers,
      }),
    ).resolves.toEqual({
      previousOwner: {
        id: 'member_1',
        organizationId: 'authority_1',
        userId: 'user_1',
        role: 'admin',
        createdAt: memberOne.createdAt,
      },
      target: {
        id: 'member_2',
        organizationId: 'authority_1',
        userId: 'user_2',
        role: 'owner',
        createdAt: memberTwo.createdAt,
      },
    })
    expect(updateMemberRole).toHaveBeenNthCalledWith(1, {
      headers,
      body: { organizationId: 'authority_1', memberId: 'member_2', role: 'owner' },
    })
    expect(updateMemberRole).toHaveBeenNthCalledWith(2, {
      headers,
      body: { organizationId: 'authority_1', memberId: 'member_1', role: 'admin' },
    })
  })

  it('rejects an ownership transfer when the target member is missing', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listMembers = vi.spyOn(auth.api, 'listMembers')
    const updateMemberRole = vi.spyOn(auth.api, 'updateMemberRole')
    listMembers
      .mockResolvedValueOnce({ members: [memberOne], total: 2 })
      .mockResolvedValueOnce({ members: [{ ...memberThree, role: 'admin' as const }], total: 2 })

    await expect(
      authority.reconcileOwnership({
        organizationId: 'authority_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'missing-user',
        headers,
      }),
    ).rejects.toThrow('Better Auth ownership transfer members are unavailable')
    expect(updateMemberRole).not.toHaveBeenCalled()
    expect(listMembers).toHaveBeenCalledTimes(2)
  })

  it('rejects an ownership transfer when another authority owner survives', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listMembers = vi.spyOn(auth.api, 'listMembers')
    const updateMemberRole = vi.spyOn(auth.api, 'updateMemberRole')
    const memberThreeAdmin = { ...memberThree, role: 'admin' as const }
    const memberOneAdmin = { ...memberOne, role: 'admin' as const }
    const memberTwoOwner = { ...memberTwo, role: 'owner' as const }
    listMembers
      .mockResolvedValueOnce({ members: [memberOne, memberTwo], total: 3 })
      .mockResolvedValueOnce({ members: [memberThreeAdmin], total: 3 })
      .mockResolvedValueOnce({ members: [memberOneAdmin, memberTwoOwner], total: 3 })
      .mockResolvedValueOnce({ members: [memberThree], total: 3 })
    updateMemberRole.mockResolvedValueOnce(memberTwoOwner).mockResolvedValueOnce(memberOneAdmin)

    await expect(
      authority.reconcileOwnership({
        organizationId: 'authority_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
        headers,
      }),
    ).rejects.toThrow('Better Auth ownership transfer did not converge')

    expect(updateMemberRole).toHaveBeenCalledTimes(2)
    expect(listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ query: { organizationId: 'authority_1', offset: 2, limit: 100 } }),
    )
  })

  it('recovers a transfer after target promotion succeeds but owner demotion fails', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const listMembers = vi.spyOn(auth.api, 'listMembers')
    const updateMemberRole = vi.spyOn(auth.api, 'updateMemberRole')
    const targetOwner = { ...memberTwo, role: 'owner' as const }
    const previousOwnerAdmin = { ...memberOne, role: 'admin' as const }
    const demotionError = new Error('authority demotion unavailable')

    listMembers
      .mockResolvedValueOnce({ members: [memberOne, memberTwo], total: 2 })
      .mockResolvedValueOnce({ members: [memberOne, targetOwner], total: 2 })
      .mockResolvedValueOnce({ members: [previousOwnerAdmin, targetOwner], total: 2 })
    updateMemberRole
      .mockResolvedValueOnce(targetOwner)
      .mockRejectedValueOnce(demotionError)
      .mockResolvedValueOnce(previousOwnerAdmin)

    await expect(
      authority.reconcileOwnership({
        organizationId: 'authority_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
        headers,
      }),
    ).rejects.toBe(demotionError)

    await expect(
      authority.reconcileOwnership({
        organizationId: 'authority_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
        headers,
      }),
    ).resolves.toMatchObject({
      previousOwner: { userId: 'user_1', role: 'admin' },
      target: { userId: 'user_2', role: 'owner' },
    })
  })

  it('treats a removed requester as an absent member', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    vi.spyOn(auth.api, 'listMembers').mockRejectedValue(
      Object.assign(new Error('You are not a member of this organization'), {
        body: { code: 'YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION' },
      }),
    )

    await expect(
      authority.getMember({ organizationId: 'authority_1', userId: 'user_1', headers }),
    ).resolves.toBeUndefined()
  })

  it('propagates unknown member lookup failures', async () => {
    db = createMigratedTestDb()
    const auth = createAuth({
      db,
      schema: schema.betterAuthSchema,
      secret: 'test-secret-1234567890',
    })
    const authority = new BetterAuthOrganizationAuthority({ auth })
    const providerError = new Error('authority unavailable')
    vi.spyOn(auth.api, 'listMembers').mockRejectedValue(providerError)

    await expect(
      authority.getMember({ organizationId: 'authority_1', userId: 'user_1', headers }),
    ).rejects.toBe(providerError)
  })
})
