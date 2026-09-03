import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { OrganizationAuthority } from '@cimi/auth'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InMemorySiteScopePort } from '@cimi/guard'
import type { OrganizationMembershipReconciler } from '../../organization/service.ts'
import { createAuthorityMember } from '../fixture.ts'
import { InvitationRepositoryDrizzle } from '../repository.drizzle.ts'
import { InvitationService } from '../service.ts'
import { hashInvitationToken } from '../token.ts'

function seed(
  extraMemberships: ReadonlyArray<{
    organizationId: string
    userId: string
    role: 'owner' | 'admin' | 'member'
  }> = [],
) {
  const db = createMigratedTestDb()
  const createdAt = new Date('2026-09-01T00:00:00.000Z')
  db.insert(schema.TUser)
    .values([
      {
        id: 'user_1',
        name: 'Ada',
        email: 'ada@example.com',
        emailVerified: true,
        image: null,
        role: null,
        banned: null,
        banReason: null,
        banExpires: null,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'user_2',
        name: 'Bob',
        email: 'bob@example.com',
        emailVerified: true,
        image: null,
        role: null,
        banned: null,
        banReason: null,
        banExpires: null,
        createdAt,
        updatedAt: createdAt,
      },
    ])
    .run()
  db.insert(schema.TOrganization)
    .values({
      id: 'org_1',
      name: 'Analytics',
      authorityOrganizationId: 'authority_1',
      ownerUserId: 'user_1',
      isPersonal: false,
      createdAt,
      updatedAt: createdAt,
    })
    .run()
  db.insert(schema.TMembership)
    .values({
      organizationId: 'org_1',
      userId: 'user_1',
      role: 'owner',
      createdAt,
      updatedAt: createdAt,
    })
    .run()
  for (const membership of extraMemberships) {
    db.insert(schema.TMembership)
      .values({ ...membership, createdAt, updatedAt: createdAt })
      .run()
  }
  return db
}

function buildService(
  repository: InvitationRepositoryDrizzle,
  memberships: ReadonlyArray<{
    organizationId: string
    userId: string
    role: 'owner' | 'admin' | 'member'
  }>,
) {
  const authority = mock<OrganizationAuthority>()
  authority.getMember.mockResolvedValue(undefined)
  authority.admitMember.mockImplementation(async ({ organizationId, userId, role }) =>
    createAuthorityMember({ organizationId, userId, role }),
  )
  authority.removeMember.mockImplementation(async ({ organizationId, userId }) =>
    createAuthorityMember({ organizationId, userId, role: 'member' }),
  )
  const scope = new InMemorySiteScopePort([], [...memberships])
  const membership = mock<OrganizationMembershipReconciler>()
  membership.reconcile.mockResolvedValue(undefined)
  const service = new InvitationService({
    repository,
    scope: { membership: scope },
    authority,
    membership,
  })
  return { authority, service }
}

describe('InvitationService.accept with a real repository', () => {
  it('accepts a pending invitation and links exactly one membership', async () => {
    const db = seed()
    try {
      const repository = new InvitationRepositoryDrizzle({ db })
      const { authority, service } = buildService(repository, [
        { organizationId: 'org_1', userId: 'user_1', role: 'owner' },
      ])
      const token = 'real-accept-token-1'
      const now = new Date()
      await repository.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })

      const result = await service.accept({ token }, { id: 'user_2' }, new Headers())

      expect(result).toMatchObject({ organizationId: 'org_1', userId: 'user_2', role: 'member' })
      expect(Object.keys(result).sort()).toEqual([
        'createdAt',
        'organizationId',
        'role',
        'updatedAt',
        'userId',
      ])
      expect(JSON.stringify(result)).not.toContain('tokenHash')
      await expect(repository.findById('inv_1')).resolves.toMatchObject({ status: 'accepted' })
      const members = await db
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, 'org_1'))
      expect(members).toHaveLength(2)
      expect(members.filter((member) => member.userId === 'user_2')).toMatchObject([
        expect.objectContaining({ organizationId: 'org_1', userId: 'user_2', role: 'member' }),
      ])
      expect(authority.admitMember).toHaveBeenCalledOnce()
    } finally {
      closeDb(db)
    }
  })

  it('keeps a conflicting-role invitation pending', async () => {
    const db = seed([{ organizationId: 'org_1', userId: 'user_2', role: 'admin' }])
    try {
      const repository = new InvitationRepositoryDrizzle({ db })
      const { authority, service } = buildService(repository, [
        { organizationId: 'org_1', userId: 'user_1', role: 'owner' },
        { organizationId: 'org_1', userId: 'user_2', role: 'admin' },
      ])
      const token = 'real-accept-token-2'
      const now = new Date()
      await repository.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })

      await expect(
        service.accept({ token }, { id: 'user_2' }, new Headers()),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
      })
      await expect(repository.findById('inv_1')).resolves.toMatchObject({ status: 'pending' })
      const members = await db
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, 'org_1'))
      expect(members).toHaveLength(2)
      expect(members.find((member) => member.userId === 'user_2')).toMatchObject({ role: 'admin' })
      expect(authority.admitMember).not.toHaveBeenCalled()
    } finally {
      closeDb(db)
    }
  })
})
