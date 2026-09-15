import { describe, expect, it } from 'vitest'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InvitationRepositoryDrizzle } from '../repository.drizzle.ts'
import { hashInvitationToken } from '../token.ts'

const now = new Date('2026-09-03T00:00:00.000Z')
const createdAt = new Date('2026-09-01T00:00:00.000Z')
const future = new Date('2026-09-10T00:00:00.000Z')
const past = new Date('2026-08-01T00:00:00.000Z')

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

describe('InvitationRepositoryDrizzle.findMany', () => {
  it('lists in created order with pagination metadata and maps expired on read without leaking hashes', async () => {
    const db = seed()
    try {
      const repo = new InvitationRepositoryDrizzle({ db, clock: () => now })
      await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: hashInvitationToken('t1'),
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })
      await repo.insert({
        id: 'inv_2',
        organizationId: 'org_1',
        role: 'admin',
        tokenHash: hashInvitationToken('t2'),
        expiresAt: past,
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
        updatedAt: createdAt,
      })

      const page = await repo.findMany('org_1', { offset: 0, limit: 1 })
      expect(page).toMatchObject({ totalCount: 2, hasMore: true, nextOffset: 1 })
      expect(page.items[0]).toMatchObject({ id: 'inv_1', status: 'pending' })
      expect(JSON.stringify(page)).not.toContain('tokenHash')

      const full = await repo.findMany('org_1', { offset: 0, limit: 20 })
      expect(full.items.find((item) => item.id === 'inv_2')).toMatchObject({ status: 'expired' })
    } finally {
      closeDb(db)
    }
  })
})
