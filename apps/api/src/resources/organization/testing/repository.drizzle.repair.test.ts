import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { OrganizationRepositoryDrizzle } from '../repository.drizzle.ts'

const now = new Date('2026-08-31T00:00:00.000Z')

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
    createdAt: now,
    updatedAt: now,
  }
}

describe('OrganizationRepositoryDrizzle repair operations', () => {
  let db: Db

  afterEach(() => closeDb(db))

  it('commits a local Organization and its completed create repair atomically', async () => {
    db = createMigratedTestDb()
    await db.insert(schema.TUser).values(user('user_1'))
    const repository = new OrganizationRepositoryDrizzle({ db })
    const repair = await repository.createRepairOperation({
      id: 'repair_1',
      organizationId: null,
      localOrganizationId: 'organization_1',
      operationType: 'create-organization',
      ownerUserId: 'user_1',
      authorityOrganizationId: 'authority_1',
      authorityCleanupRequired: false,
      authoritySlug: 'organization_1-user_1',
      previousName: null,
      desiredName: 'Analytics',
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      repository.insertWithOwnerAndCompleteRepair(
        {
          id: 'organization_1',
          name: 'Analytics',
          authorityOrganizationId: 'authority_1',
          ownerUserId: 'user_1',
          isPersonal: false,
          createdAt: now,
          updatedAt: now,
        },
        { userId: 'user_1', now },
        repair.id,
      ),
    ).resolves.toMatchObject({ id: 'organization_1', name: 'Analytics' })

    await expect(
      db
        .select()
        .from(schema.TOrganizationRepairOperation)
        .where(eq(schema.TOrganizationRepairOperation.id, repair.id)),
    ).resolves.toMatchObject([
      expect.objectContaining({
        status: 'completed',
        organizationId: 'organization_1',
        failureCode: null,
        failureMessage: null,
      }),
    ])
  })

  it('keeps the repair pending when local Owner persistence rolls back', async () => {
    db = createMigratedTestDb()
    await db.insert(schema.TUser).values(user('user_1'))
    const repository = new OrganizationRepositoryDrizzle({ db })
    const repair = await repository.createRepairOperation({
      id: 'repair_1',
      organizationId: null,
      localOrganizationId: 'organization_1',
      operationType: 'create-organization',
      ownerUserId: 'user_1',
      authorityOrganizationId: 'authority_1',
      authorityCleanupRequired: false,
      authoritySlug: 'organization_1-user_1',
      previousName: null,
      desiredName: 'Analytics',
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      repository.insertWithOwnerAndCompleteRepair(
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
        repair.id,
      ),
    ).rejects.toThrow()

    await expect(
      db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, 'organization_1')),
    ).resolves.toHaveLength(0)
    await expect(
      db
        .select()
        .from(schema.TOrganizationRepairOperation)
        .where(eq(schema.TOrganizationRepairOperation.id, repair.id)),
    ).resolves.toMatchObject([
      expect.objectContaining({
        status: 'pending',
        organizationId: null,
        authorityOrganizationId: 'authority_1',
      }),
    ])
  })

  it('commits an Organization name and its completed update repair atomically', async () => {
    db = createMigratedTestDb()
    await db.insert(schema.TUser).values(user('user_1'))
    const repository = new OrganizationRepositoryDrizzle({ db })
    await repository.insertWithOwner(
      {
        id: 'organization_1',
        name: 'Analytics',
        authorityOrganizationId: 'authority_1',
        ownerUserId: 'user_1',
        isPersonal: false,
        createdAt: now,
        updatedAt: now,
      },
      { userId: 'user_1', now },
    )
    const repair = await repository.createRepairOperation({
      id: 'repair_1',
      organizationId: 'organization_1',
      localOrganizationId: 'organization_1',
      operationType: 'update-organization',
      ownerUserId: 'user_1',
      authorityOrganizationId: 'authority_1',
      authorityCleanupRequired: false,
      authoritySlug: null,
      previousName: 'Analytics',
      desiredName: 'Renamed Analytics',
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    })

    await expect(
      repository.updateNameAndCompleteRepair('organization_1', 'Renamed Analytics', repair.id),
    ).resolves.toMatchObject({ id: 'organization_1', name: 'Renamed Analytics' })
    await expect(
      db
        .select({ name: schema.TOrganization.name })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, 'organization_1')),
    ).resolves.toEqual([{ name: 'Renamed Analytics' }])
    await expect(
      db
        .select({ status: schema.TOrganizationRepairOperation.status })
        .from(schema.TOrganizationRepairOperation)
        .where(eq(schema.TOrganizationRepairOperation.id, repair.id)),
    ).resolves.toEqual([{ status: 'completed' }])
  })
})
