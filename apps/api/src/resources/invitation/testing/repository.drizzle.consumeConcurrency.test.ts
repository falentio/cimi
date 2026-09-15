import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InvitationRepositoryDrizzle } from '../repository.drizzle.ts'
import { hashInvitationToken } from '../token.ts'

const now = new Date('2026-09-03T00:00:00.000Z')
const createdAt = new Date('2026-09-01T00:00:00.000Z')
const future = new Date('2026-09-10T00:00:00.000Z')

function seed() {
  const db = createMigratedTestDb()
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

describe('InvitationRepositoryDrizzle.consumeConcurrency', () => {
  it('lets exactly one of two concurrent consumers win without duplicate memberships', async () => {
    const db = seed()
    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      const tokenHash = hashInvitationToken('race-token')
      await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash,
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })

      const [first, second] = await Promise.all([
        repo.consume({ tokenHash, userId: 'user_2', now }),
        repo.consume({ tokenHash, userId: 'user_3', now }),
      ])

      const statuses = [first.status, second.status].sort()
      expect(statuses).toEqual(['consumed', 'not-found'])
      const members = db
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, 'org_1'))
        .all()
      const invited = members.filter((member) => member.userId !== 'user_1')
      expect(invited).toHaveLength(1)
      await expect(repo.findById('inv_1')).resolves.toMatchObject({ status: 'accepted' })
    } finally {
      closeDb(db)
    }
  })
})
