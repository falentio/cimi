import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { MembershipRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createMembershipDrizzleFixture,
  createMembershipOrganizationRow,
  createMembershipRow,
  createMembershipUserRow,
} from '../fixture.drizzle.ts'

const createdAt = new Date('2026-08-31T00:00:00.000Z')

describe('MembershipRepositoryDrizzle.replaceMembers', () => {
  it('replaces an old local Owner before promoting the incoming Owner', async () => {
    using fixture = createMembershipDrizzleFixture()
    const { db } = fixture
    await db
      .insert(schema.TUser)
      .values([
        createMembershipUserRow('user_1'),
        createMembershipUserRow('user_2'),
        createMembershipUserRow('user_3'),
      ])
    await db
      .insert(schema.TOrganization)
      .values(createMembershipOrganizationRow({ ownerUserId: 'user_2' }))
    await db
      .insert(schema.TMembership)
      .values([
        createMembershipRow({ userId: 'user_1', role: 'owner' }),
        createMembershipRow({ userId: 'user_2', role: 'member' }),
        createMembershipRow({ userId: 'user_3', role: 'admin' }),
      ])

    const repository = new MembershipRepositoryDrizzle({ db })

    await expect(
      repository.replaceMembers('organization_1', [
        createMembershipRow({
          userId: 'user_2',
          role: 'owner',
          updatedAt: new Date('2026-08-31T00:00:01.000Z'),
        }),
        createMembershipRow({
          userId: 'user_1',
          role: 'admin',
          updatedAt: new Date('2026-08-31T00:00:01.000Z'),
        }),
      ]),
    ).resolves.toBeUndefined()

    await expect(repository.findAll('organization_1')).resolves.toEqual([
      createMembershipRow({
        userId: 'user_1',
        role: 'admin',
        updatedAt: new Date('2026-08-31T00:00:01.000Z'),
      }),
      createMembershipRow({
        userId: 'user_2',
        role: 'owner',
        updatedAt: new Date('2026-08-31T00:00:01.000Z'),
      }),
    ])
  })

  it('rolls back earlier membership writes when a later replacement fails', async () => {
    using fixture = createMembershipDrizzleFixture()
    const { db } = fixture
    await db
      .insert(schema.TUser)
      .values([
        createMembershipUserRow('user_1'),
        createMembershipUserRow('user_2'),
        createMembershipUserRow('user_3'),
        createMembershipUserRow('user_4'),
      ])
    await db.insert(schema.TOrganization).values(createMembershipOrganizationRow())
    await db
      .insert(schema.TMembership)
      .values([
        createMembershipRow({ userId: 'user_1', role: 'owner' }),
        createMembershipRow({ userId: 'user_2', role: 'admin' }),
        createMembershipRow({ userId: 'user_3', role: 'member' }),
      ])

    const repository = new MembershipRepositoryDrizzle({ db })
    const replacementTimestamp = new Date('2026-08-31T00:00:01.000Z')

    await expect(
      repository.replaceMembers('organization_1', [
        createMembershipRow({ userId: 'user_1', role: 'owner', updatedAt: replacementTimestamp }),
        createMembershipRow({ userId: 'user_2', role: 'member', updatedAt: replacementTimestamp }),
        createMembershipRow({ userId: 'user_4', role: 'member', updatedAt: replacementTimestamp }),
        createMembershipRow({
          userId: 'missing_user',
          role: 'member',
          updatedAt: replacementTimestamp,
        }),
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
