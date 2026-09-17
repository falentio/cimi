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

describe('InvitationRepositoryDrizzle.consume', () => {
  it('consumes a pending invitation with a membership insert', async () => {
    const db = seed()
    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      const tokenHash = hashInvitationToken('consume-1')
      await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash,
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })

      const result = await repo.consume({ tokenHash, userId: 'user_2', now })
      expect(result.status).toBe('consumed')
      if (result.status !== 'consumed') throw new Error('Expected consumed')
      expect(result.membership).toMatchObject({
        organizationId: 'org_1',
        userId: 'user_2',
        role: 'member',
      })
      await expect(repo.findById('inv_1')).resolves.toMatchObject({ status: 'accepted' })
    } finally {
      closeDb(db)
    }
  })

  it('reuses a same-role membership while consuming', async () => {
    const db = seed()
    try {
      db.insert(schema.TMembership)
        .values({
          organizationId: 'org_1',
          userId: 'user_2',
          role: 'member',
          createdAt,
          updatedAt: createdAt,
        })
        .run()
      const repo = new InvitationRepositoryDrizzle({ db })
      const tokenHash = hashInvitationToken('consume-2')
      await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash,
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })

      const result = await repo.consume({ tokenHash, userId: 'user_2', now })
      expect(result.status).toBe('consumed')
      await expect(repo.findById('inv_1')).resolves.toMatchObject({ status: 'accepted' })
    } finally {
      closeDb(db)
    }
  })

  it('leaves a pending invitation untouched on a conflicting role', async () => {
    const db = seed()
    try {
      db.insert(schema.TMembership)
        .values({
          organizationId: 'org_1',
          userId: 'user_2',
          role: 'admin',
          createdAt,
          updatedAt: createdAt,
        })
        .run()
      const repo = new InvitationRepositoryDrizzle({ db })
      const tokenHash = hashInvitationToken('consume-3')
      await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash,
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })

      const result = await repo.consume({ tokenHash, userId: 'user_2', now })
      expect(result).toMatchObject({ status: 'conflict', currentRole: 'admin' })
      await expect(repo.findById('inv_1')).resolves.toMatchObject({ status: 'pending' })
    } finally {
      closeDb(db)
    }
  })
})
