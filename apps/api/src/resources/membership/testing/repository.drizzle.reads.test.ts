import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { MembershipRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createMembershipDrizzleFixture,
  createMembershipGovernanceOperationRow,
  createMembershipRepairOperationRow,
  seedMembershipOrganization,
} from '../fixture.drizzle.ts'

describe.concurrent('MembershipRepositoryDrizzle.reads', () => {
  it('paginates memberships with metadata', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db, {
      members: [
        { userId: 'user_2', role: 'member' },
        { userId: 'user_3', role: 'admin' },
      ],
    })
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.findMany({ organizationId: 'organization_1', offset: 0, limit: 1 }),
    ).resolves.toMatchObject({ totalCount: 3, hasMore: true, nextOffset: 1 })
    await expect(
      repo.findMany({ organizationId: 'organization_1', offset: 3, limit: 1 }),
    ).resolves.toMatchObject({ items: [], totalCount: 3, hasMore: false, nextOffset: null })
  })

  it('lists all memberships and reports an empty organization', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findAll('organization_1')).resolves.toHaveLength(2)
    await expect(repo.findAll('organization_missing')).resolves.toEqual([])
  })

  it('finds a membership by id and omits missing records', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.findById({ organizationId: 'organization_1', userId: 'user_2' }),
    ).resolves.toMatchObject({ userId: 'user_2', role: 'member' })
    await expect(
      repo.findByUser({ organizationId: 'organization_1', userId: 'user_2' }),
    ).resolves.toMatchObject({ userId: 'user_2', role: 'member' })
    await expect(
      repo.findById({ organizationId: 'organization_1', userId: 'user_missing' }),
    ).resolves.toBeUndefined()
  })

  it('finds the owner and omits an ownerless organization', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findOwner('organization_1')).resolves.toMatchObject({ userId: 'user_1' })
    await expect(repo.findOwner('organization_missing')).resolves.toBeUndefined()
  })

  it('resolves the authority organization and omits missing records', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findAuthorityOrganizationId('organization_1')).resolves.toBe('authority_1')
    await expect(repo.findAuthorityOrganizationId('organization_missing')).resolves.toBeUndefined()
  })

  it('validates the owner invariant against the persisted rows', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.isOwnerInvariantValid('organization_1')).resolves.toBe(true)
    await expect(repo.isOwnerInvariantValid('organization_missing')).resolves.toBe(false)

    fixture.db
      .update(schema.TOrganization)
      .set({ ownerUserId: 'user_2' })
      .where(eq(schema.TOrganization.id, 'organization_1'))
      .run()
    await expect(repo.isOwnerInvariantValid('organization_1')).resolves.toBe(false)
  })

  it('detects pending governance and repair operations', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.hasPendingGovernanceOperation('organization_1')).resolves.toBe(false)

    fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(createMembershipGovernanceOperationRow())
      .run()
    await expect(repo.hasPendingGovernanceOperation('organization_1')).resolves.toBe(true)
  })

  it('detects a pending repair operation without a governance row', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    fixture.db
      .insert(schema.TOrganizationRepairOperation)
      .values(createMembershipRepairOperationRow())
      .run()
    await expect(repo.hasPendingGovernanceOperation('organization_1')).resolves.toBe(true)
  })

  it('finds a pending membership operation and omits a quiet organization', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findPendingMembershipOperation('organization_1')).resolves.toBeUndefined()

    fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(
        createMembershipGovernanceOperationRow({
          operationType: 'change-member-role',
          targetRole: 'member',
        }),
      )
      .run()
    await expect(repo.findPendingMembershipOperation('organization_1')).resolves.toMatchObject({
      id: 'operation_1',
      operationType: 'change-member-role',
    })
  })

  it('finds a pending transfer and omits a quiet organization', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findPendingTransfer('organization_1')).resolves.toBeUndefined()

    fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(
        createMembershipGovernanceOperationRow({
          operationType: 'transfer-ownership',
          targetRole: null,
        }),
      )
      .run()
    await expect(repo.findPendingTransfer('organization_1')).resolves.toMatchObject({
      id: 'operation_1',
      previousOwnerUserId: 'user_1',
      targetUserId: 'user_2',
    })
  })

  it('returns a completed transfer only for the converged owner', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db, {
      ownerId: 'user_2',
      members: [{ userId: 'user_1', role: 'admin' }],
    })
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })
    fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(
        createMembershipGovernanceOperationRow({
          operationType: 'transfer-ownership',
          targetRole: null,
          status: 'completed',
        }),
      )
      .run()

    await expect(
      repo.findCompletedTransfer({
        organizationId: 'organization_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
      }),
    ).resolves.toMatchObject({ userId: 'user_2', role: 'owner' })
    await expect(
      repo.findCompletedTransfer({
        organizationId: 'organization_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_missing',
      }),
    ).resolves.toBeUndefined()
  })
})
