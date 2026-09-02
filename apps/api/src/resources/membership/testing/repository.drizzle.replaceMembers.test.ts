import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import type { MembershipRecord } from '../repository.ts'
import { MembershipRepositoryDrizzle } from '../repository.drizzle.ts'

const createdAt = new Date('2026-08-31T00:00:00.000Z')

function user(id: string) {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    image: null,
    role: null,
    banned: null,
    banReason: null,
    banExpires: null,
    createdAt,
    updatedAt: createdAt,
  }
}

function membership(
  userId: string,
  role: MembershipRecord['role'],
  updatedAt = createdAt,
): MembershipRecord {
  return {
    organizationId: 'organization_1',
    userId,
    role,
    createdAt,
    updatedAt,
  }
}

describe('MembershipRepositoryDrizzle.replaceMembers', () => {
  let db: Db

  afterEach(() => closeDb(db))

  it('replaces an old local Owner before promoting the incoming Owner', async () => {
    db = createMigratedTestDb()
    await db.insert(schema.TUser).values([user('user_1'), user('user_2'), user('user_3')])
    await db.insert(schema.TOrganization).values({
      id: 'organization_1',
      name: 'Analytics',
      authorityOrganizationId: 'authority_1',
      ownerUserId: 'user_2',
      isPersonal: false,
      createdAt,
      updatedAt: createdAt,
    })
    await db
      .insert(schema.TMembership)
      .values([
        membership('user_1', 'owner'),
        membership('user_2', 'member'),
        membership('user_3', 'admin'),
      ])

    const repository = new MembershipRepositoryDrizzle({ db })

    await expect(
      repository.replaceMembers('organization_1', [
        membership('user_2', 'owner', new Date('2026-08-31T00:00:01.000Z')),
        membership('user_1', 'admin', new Date('2026-08-31T00:00:01.000Z')),
      ]),
    ).resolves.toBeUndefined()

    await expect(repository.findAll('organization_1')).resolves.toEqual([
      membership('user_1', 'admin', new Date('2026-08-31T00:00:01.000Z')),
      membership('user_2', 'owner', new Date('2026-08-31T00:00:01.000Z')),
    ])
  })

  it('rolls back earlier membership writes when a later replacement fails', async () => {
    db = createMigratedTestDb()
    await db
      .insert(schema.TUser)
      .values([user('user_1'), user('user_2'), user('user_3'), user('user_4')])
    await db.insert(schema.TOrganization).values({
      id: 'organization_1',
      name: 'Analytics',
      authorityOrganizationId: 'authority_1',
      ownerUserId: 'user_1',
      isPersonal: false,
      createdAt,
      updatedAt: createdAt,
    })
    await db
      .insert(schema.TMembership)
      .values([
        membership('user_1', 'owner'),
        membership('user_2', 'admin'),
        membership('user_3', 'member'),
      ])

    const repository = new MembershipRepositoryDrizzle({ db })
    const replacementTimestamp = new Date('2026-08-31T00:00:01.000Z')

    await expect(
      repository.replaceMembers('organization_1', [
        membership('user_1', 'owner', replacementTimestamp),
        membership('user_2', 'member', replacementTimestamp),
        membership('user_4', 'member', replacementTimestamp),
        membership('missing_user', 'member', replacementTimestamp),
      ]),
    ).rejects.toThrow()

    const rows = await db
      .select()
      .from(schema.TMembership)
      .where(eq(schema.TMembership.organizationId, 'organization_1'))
    expect(rows).toEqual([
      expect.objectContaining({
        organizationId: 'organization_1',
        userId: 'user_1',
        role: 'owner',
        updatedAt: createdAt,
      }),
      expect.objectContaining({
        organizationId: 'organization_1',
        userId: 'user_2',
        role: 'admin',
        updatedAt: createdAt,
      }),
      expect.objectContaining({
        organizationId: 'organization_1',
        userId: 'user_3',
        role: 'member',
        updatedAt: createdAt,
      }),
    ])
    expect(rows).toHaveLength(3)
  })
})
