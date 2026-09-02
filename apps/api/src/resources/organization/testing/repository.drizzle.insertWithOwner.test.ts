import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { OrganizationRepositoryDrizzle } from '../repository.drizzle.ts'

describe('OrganizationRepositoryDrizzle.insertWithOwner', () => {
  let db: Db

  afterEach(() => closeDb(db))

  it('rolls back the Organization when the Owner membership cannot be inserted', async () => {
    db = createMigratedTestDb()
    const now = new Date('2026-08-31T00:00:00.000Z')
    await db.insert(schema.TUser).values({
      id: 'user_1',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
      image: null,
      role: null,
      banned: null,
      banReason: null,
      banExpires: null,
      createdAt: now,
      updatedAt: now,
    })

    const repository = new OrganizationRepositoryDrizzle({ db })

    await expect(
      repository.insertWithOwner(
        {
          id: 'organization_1',
          name: 'Analytics',
          authorityOrganizationId: 'authority_1',
          ownerUserId: 'user_1',
          isPersonal: false,
          createdAt: now,
          updatedAt: now,
        },
        { userId: 'missing_user', now },
      ),
    ).rejects.toThrow()

    await expect(
      db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, 'organization_1')),
    ).resolves.toHaveLength(0)
    await expect(
      db
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, 'organization_1')),
    ).resolves.toHaveLength(0)
  })

  it('deletes the Organization and its terminal governance operation atomically', async () => {
    db = createMigratedTestDb()
    const now = new Date('2026-08-31T00:00:00.000Z')
    await db.insert(schema.TUser).values({
      id: 'user_1',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
      image: null,
      role: null,
      banned: null,
      banReason: null,
      banExpires: null,
      createdAt: now,
      updatedAt: now,
    })

    const repository = new OrganizationRepositoryDrizzle({ db })
    await repository.insertWithOwner(
      {
        id: 'organization_1',
        name: 'Analytics',
        authorityOrganizationId: null,
        ownerUserId: 'user_1',
        isPersonal: false,
        createdAt: now,
        updatedAt: now,
      },
      { userId: 'user_1', now },
    )
    const operation = await repository.createDeleteOperation({
      id: 'operation_1',
      organizationId: 'organization_1',
      previousOwnerUserId: 'user_1',
      targetUserId: 'user_1',
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await expect(repository.finalizeDeleteOperation(operation.id)).resolves.toBe(true)
    await expect(
      db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, 'organization_1')),
    ).resolves.toHaveLength(0)
    await expect(
      db
        .select()
        .from(schema.TOrganizationGovernanceOperation)
        .where(eq(schema.TOrganizationGovernanceOperation.id, operation.id)),
    ).resolves.toHaveLength(0)
  })
})
