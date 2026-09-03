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

function seed() {
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
      {
        id: 'user_3',
        name: 'Cy',
        email: 'cy@example.com',
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
  return db
}

function buildService(repository: InvitationRepositoryDrizzle) {
  const authority = mock<OrganizationAuthority>()
  authority.getMember.mockResolvedValue(undefined)
  authority.admitMember.mockImplementation(async ({ organizationId, userId, role }) =>
    createAuthorityMember({ organizationId, userId, role }),
  )
  authority.removeMember.mockImplementation(async ({ organizationId, userId }) =>
    createAuthorityMember({ organizationId, userId, role: 'member' }),
  )
  const scope = new InMemorySiteScopePort(
    [],
    [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
  )
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

describe('InvitationService.accept real race', () => {
  it('lets exactly one of two concurrent accepts win with real persistence', async () => {
    const db = seed()
    try {
      const firstRepository = new InvitationRepositoryDrizzle({ db })
      const secondRepository = new InvitationRepositoryDrizzle({ db })
      const first = buildService(firstRepository)
      const second = buildService(secondRepository)
      const token = 'real-race-token-1'
      const now = new Date()
      await firstRepository.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })

      const [firstResult, secondResult] = await Promise.allSettled([
        first.service.accept({ token }, { id: 'user_2' }, new Headers()),
        second.service.accept({ token }, { id: 'user_3' }, new Headers()),
      ])

      const fulfilled = [firstResult, secondResult].filter(
        (result) => result.status === 'fulfilled',
      )
      const rejected = [firstResult, secondResult].filter((result) => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'NOT_FOUND' })
      const winner = (fulfilled[0] as PromiseFulfilledResult<{ userId: string }>).value
      expect(winner).toMatchObject({ organizationId: 'org_1', role: 'member' })
      expect(['user_2', 'user_3']).toContain(winner.userId)
      const loser = firstResult.status === 'fulfilled' ? second : first
      const champion = firstResult.status === 'fulfilled' ? first : second
      expect(champion.authority.admitMember).toHaveBeenCalledOnce()
      expect(champion.authority.removeMember).not.toHaveBeenCalled()
      expect(loser.authority.admitMember).toHaveBeenCalledOnce()
      expect(loser.authority.removeMember).toHaveBeenCalledOnce()
      const members = await db
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, 'org_1'))
      expect(members).toHaveLength(2)
      expect(members.filter((member) => member.userId !== 'user_1')).toHaveLength(1)
      expect(members.find((member) => member.userId === winner.userId)).toMatchObject({
        role: 'member',
      })
      await expect(firstRepository.findById('inv_1')).resolves.toMatchObject({
        status: 'accepted',
      })
    } finally {
      closeDb(db)
    }
  })
})
