import { eq } from 'drizzle-orm'
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

describe('InvitationRepositoryDrizzle', () => {
  it('inserts with a hash and round-trips by token hash', async () => {
    const db = seed()
    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      const tokenHash = hashInvitationToken('token-1')
      const record = await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash,
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })

      expect(record.tokenHash).toBe(tokenHash)
      await expect(repo.findByTokenHash(tokenHash)).resolves.toMatchObject({
        id: 'inv_1',
        status: 'pending',
      })
      await expect(repo.findById('inv_1')).resolves.toMatchObject({ id: 'inv_1' })
    } finally {
      closeDb(db)
    }
  })

  it('lists in created order with pagination metadata and maps expired on read without leaking hashes', async () => {
    const db = seed()
    try {
      const repo = new InvitationRepositoryDrizzle({ db })
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

  it('expires a pending invitation on write and replays as not found', async () => {
    const db = seed()
    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      const tokenHash = hashInvitationToken('consume-4')
      await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash,
        expiresAt: past,
        createdAt,
        updatedAt: createdAt,
      })

      await expect(repo.consume({ tokenHash, userId: 'user_2', now })).resolves.toMatchObject({
        status: 'expired',
      })
      await expect(repo.findById('inv_1')).resolves.toMatchObject({ status: 'expired' })
      await expect(repo.consume({ tokenHash, userId: 'user_2', now })).resolves.toMatchObject({
        status: 'expired',
      })
    } finally {
      closeDb(db)
    }
  })

  it('revokes pending exactly once and reports consumed for accepted', async () => {
    const db = seed()
    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      await repo.insert({
        id: 'inv_1',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: hashInvitationToken('r1'),
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })
      await repo.insert({
        id: 'inv_2',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: hashInvitationToken('r2'),
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })
      const consumedHash = hashInvitationToken('r2c')
      await repo.insert({
        id: 'inv_3',
        organizationId: 'org_1',
        role: 'member',
        tokenHash: consumedHash,
        expiresAt: future,
        createdAt,
        updatedAt: createdAt,
      })
      await repo.consume({ tokenHash: consumedHash, userId: 'user_2', now })

      await expect(repo.revoke({ invitationId: 'inv_1', now })).resolves.toEqual({
        status: 'revoked',
      })
      await expect(repo.revoke({ invitationId: 'inv_1', now })).resolves.toEqual({
        status: 'idempotent',
      })
      await expect(repo.revoke({ invitationId: 'inv_3', now })).resolves.toEqual({
        status: 'consumed',
      })
      await expect(repo.revoke({ invitationId: 'inv_missing', now })).resolves.toEqual({
        status: 'not-found',
      })
    } finally {
      closeDb(db)
    }
  })

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
