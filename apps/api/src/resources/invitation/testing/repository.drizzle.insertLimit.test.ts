import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { MAX_PENDING_INVITATIONS_PER_ORGANIZATION } from '@cimi/contract'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InvitationRepositoryDrizzle } from '../repository.drizzle.ts'
import type { InvitationRepository } from '../repository.ts'
import { hashInvitationToken } from '../token.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')

const future = new Date('2026-09-10T00:00:00.000Z')

const past = new Date('2026-08-15T00:00:00.000Z')

const now = new Date('2026-09-03T00:00:00.000Z')

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
    ])
    .run()
  db.insert(schema.TOrganization)
    .values([
      {
        id: 'org_1',
        name: 'Analytics',
        authorityOrganizationId: 'authority_1',
        ownerUserId: 'user_1',
        isPersonal: false,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: 'org_2',
        name: 'Billing',
        authorityOrganizationId: 'authority_2',
        ownerUserId: 'user_1',
        isPersonal: false,
        createdAt,
        updatedAt: createdAt,
      },
    ])
    .run()
  db.insert(schema.TMembership)
    .values([
      {
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'owner',
        createdAt,
        updatedAt: createdAt,
      },
      {
        organizationId: 'org_2',
        userId: 'user_1',
        role: 'owner',
        createdAt,
        updatedAt: createdAt,
      },
    ])
    .run()

  return db
}

function insertOne(
  repo: InvitationRepository,
  organizationId: string,
  index: number,
  expiresAt: Date = future,
): Promise<InvitationRepository.InsertResult> {
  return repo.insert({
    id: `inv_${organizationId}_${index}`,
    organizationId,
    role: 'member',
    tokenHash: hashInvitationToken(`${organizationId}-${index}`),
    expiresAt,
    createdAt,
    updatedAt: createdAt,
  })
}

async function fillToLimit(repo: InvitationRepository, organizationId: string): Promise<void> {
  for (let index = 0; index < MAX_PENDING_INVITATIONS_PER_ORGANIZATION; index += 1) {
    const result = await insertOne(repo, organizationId, index)

    if (result.status !== 'inserted') throw new Error(`Expected inserted at ${index}`)
  }
}

describe('InvitationRepositoryDrizzle.insertLimit', () => {
  it('rejects the sixth pending invitation for one organization', async () => {
    const db = seed()

    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      await fillToLimit(repo, 'org_1')

      await expect(insertOne(repo, 'org_1', 99)).resolves.toEqual({ status: 'limit-reached' })

      const rows = db
        .select()
        .from(schema.TInvitation)
        .where(eq(schema.TInvitation.organizationId, 'org_1'))
        .all()

      expect(rows).toHaveLength(MAX_PENDING_INVITATIONS_PER_ORGANIZATION)
    } finally {
      closeDb(db)
    }
  })

  it('allows a sixth invitation after one is revoked', async () => {
    const db = seed()

    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      await fillToLimit(repo, 'org_1')
      await repo.revoke({ invitationId: 'inv_org_1_0', now })

      await expect(insertOne(repo, 'org_1', 99)).resolves.toMatchObject({ status: 'inserted' })
    } finally {
      closeDb(db)
    }
  })

  it('allows a sixth invitation after one is accepted', async () => {
    const db = seed()

    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      await fillToLimit(repo, 'org_1')
      await repo.consume({
        tokenHash: hashInvitationToken('org_1-0'),
        userId: 'user_2',
        now,
      })

      await expect(insertOne(repo, 'org_1', 99)).resolves.toMatchObject({ status: 'inserted' })
    } finally {
      closeDb(db)
    }
  })

  it('allows a sixth invitation after one expires', async () => {
    const db = seed()

    try {
      const repo = new InvitationRepositoryDrizzle({ db })

      for (let index = 0; index < MAX_PENDING_INVITATIONS_PER_ORGANIZATION - 1; index += 1) {
        const result = await insertOne(repo, 'org_1', index)

        if (result.status !== 'inserted') throw new Error(`Expected inserted at ${index}`)
      }

      const expired = await insertOne(repo, 'org_1', 4, past)
      expect(expired.status).toBe('inserted')

      await expect(insertOne(repo, 'org_1', 99)).resolves.toMatchObject({ status: 'inserted' })
      await expect(insertOne(repo, 'org_1', 100)).resolves.toEqual({ status: 'limit-reached' })
    } finally {
      closeDb(db)
    }
  })

  it('counts pending invitations independently per organization', async () => {
    const db = seed()

    try {
      const repo = new InvitationRepositoryDrizzle({ db })
      await fillToLimit(repo, 'org_1')

      await expect(insertOne(repo, 'org_2', 0)).resolves.toMatchObject({ status: 'inserted' })
    } finally {
      closeDb(db)
    }
  })

  it('converges to five pending invitations under concurrent creates', async () => {
    const db = seed()

    try {
      const repo = new InvitationRepositoryDrizzle({ db })

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, index) => insertOne(repo, 'org_1', index)),
      )

      expect(results.filter((result) => result.status === 'inserted')).toHaveLength(
        MAX_PENDING_INVITATIONS_PER_ORGANIZATION,
      )
      expect(results.filter((result) => result.status === 'limit-reached')).toHaveLength(
        10 - MAX_PENDING_INVITATIONS_PER_ORGANIZATION,
      )

      const pending = db
        .select()
        .from(schema.TInvitation)
        .where(
          and(
            eq(schema.TInvitation.organizationId, 'org_1'),
            eq(schema.TInvitation.status, 'pending'),
          ),
        )
        .all()

      expect(pending).toHaveLength(MAX_PENDING_INVITATIONS_PER_ORGANIZATION)
    } finally {
      closeDb(db)
    }
  })
})
