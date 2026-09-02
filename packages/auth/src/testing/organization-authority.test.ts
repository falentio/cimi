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
})
