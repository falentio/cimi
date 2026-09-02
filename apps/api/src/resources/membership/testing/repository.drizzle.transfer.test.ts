import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { MembershipRepositoryDrizzle } from '../repository.drizzle.ts'

const now = new Date('2026-09-01T00:00:00.000Z')

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

describe('MembershipRepositoryDrizzle.completeTransfer', () => {
  let db: Db

  afterEach(() => closeDb(db))

  it('rolls back membership and operation changes when the Organization update fails', async () => {
    db = createMigratedTestDb()
    await db.insert(schema.TUser).values([user('user_1'), user('user_2')])
    await db.insert(schema.TOrganization).values({
      id: 'organization_1',
      name: 'Analytics',
      authorityOrganizationId: 'authority_1',
      ownerUserId: 'user_1',
      isPersonal: false,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(schema.TMembership).values([
      {
        organizationId: 'organization_1',
        userId: 'user_1',
        role: 'owner',
        createdAt: now,
        updatedAt: now,
      },
      {
        organizationId: 'organization_1',
        userId: 'user_2',
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
    ])

    const repository = new MembershipRepositoryDrizzle({ db })
    const transfer = await repository.createTransfer({
      id: 'operation_1',
      organizationId: 'organization_1',
      previousOwnerUserId: 'user_1',
      targetUserId: 'user_2',
      now,
    })
    expect(transfer.kind).toBe('admitted')
    if (transfer.kind !== 'admitted') throw new Error('Transfer was not admitted')

    db.$client.exec(`
      CREATE TRIGGER fail_transfer_owner_update
      AFTER UPDATE OF owner_user_id ON organization
      BEGIN
        SELECT RAISE(ABORT, 'forced transfer failure');
      END;
    `)

    await expect(
      repository.completeTransfer({
        id: transfer.transfer.id,
        organizationId: 'organization_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
        now: new Date('2026-09-01T00:00:01.000Z'),
      }),
    ).rejects.toThrow('forced transfer failure')

    await expect(
      db
        .select({ userId: schema.TMembership.userId, role: schema.TMembership.role })
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, 'organization_1')),
    ).resolves.toEqual([
      { userId: 'user_1', role: 'owner' },
      { userId: 'user_2', role: 'member' },
    ])
    await expect(
      db
        .select({ ownerUserId: schema.TOrganization.ownerUserId })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, 'organization_1')),
    ).resolves.toEqual([{ ownerUserId: 'user_1' }])
    await expect(
      db
        .select({ status: schema.TOrganizationGovernanceOperation.status })
        .from(schema.TOrganizationGovernanceOperation)
        .where(eq(schema.TOrganizationGovernanceOperation.id, transfer.transfer.id)),
    ).resolves.toEqual([{ status: 'pending' }])
  })
})
