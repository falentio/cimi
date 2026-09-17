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

describe('InvitationRepositoryDrizzle.revoke', () => {
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
})
