import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { MembershipRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createMembershipDrizzleFixture,
  createMembershipGovernanceOperationRow,
  createMembershipRow,
  seedMembershipOrganization,
} from '../fixture.drizzle.ts'

const now = new Date('2026-09-01T00:00:00.000Z')

describe.concurrent('MembershipRepositoryDrizzle.governance', () => {
  it('refuses replacement while a governance operation is pending', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(createMembershipGovernanceOperationRow())
      .run()
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.replaceMembers('org_1', [createMembershipRow({ userId: 'user_1', role: 'owner' })]),
    ).rejects.toThrow(/fenced/)
  })

  it('refuses replacement with an invalid owner set', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db, {
      members: [
        { userId: 'user_2', role: 'member' },
        { userId: 'user_3', role: 'member' },
      ],
    })
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.replaceMembers('org_1', [
        createMembershipRow({ userId: 'user_1', role: 'owner' }),
        createMembershipRow({ userId: 'user_3', role: 'owner' }),
      ]),
    ).rejects.toThrow(/invalid/)
    await expect(
      repo.replaceMembers('org_1', [
        createMembershipRow({ userId: 'user_1', role: 'owner' }),
        createMembershipRow({ userId: 'user_1', role: 'member' }),
      ]),
    ).rejects.toThrow(/invalid/)
  })

  it('updates a non-owner role and skips owners and missing rows', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.updateRole({
        organizationId: 'org_1',
        userId: 'user_2',
        role: 'admin',
        updatedAt: now,
      }),
    ).resolves.toMatchObject({ userId: 'user_2', role: 'admin' })
    await expect(
      repo.updateRole({
        organizationId: 'org_1',
        userId: 'user_1',
        role: 'admin',
        updatedAt: now,
      }),
    ).resolves.toBeUndefined()
    await expect(
      repo.updateRole({
        organizationId: 'org_1',
        userId: 'user_missing',
        role: 'admin',
        updatedAt: now,
      }),
    ).resolves.toBeUndefined()
  })

  it('deletes a non-owner and keeps owners and missing rows', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(repo.delete({ organizationId: 'org_1', userId: 'user_2' })).resolves.toBe(true)
    await expect(repo.delete({ organizationId: 'org_1', userId: 'user_1' })).resolves.toBe(false)
    await expect(repo.delete({ organizationId: 'org_1', userId: 'user_missing' })).resolves.toBe(
      false,
    )
  })

  it('admits a transfer and reports an already-pending one', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    const admitted = await repo.createTransfer({
      id: 'gop_1',
      organizationId: 'org_1',
      previousOwnerUserId: 'user_1',
      targetUserId: 'user_2',
      now,
    })
    expect(admitted.kind).toBe('admitted')

    await expect(
      repo.createTransfer({
        id: 'gop_2',
        organizationId: 'org_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
        now,
      }),
    ).resolves.toMatchObject({ kind: 'already-pending' })
  })

  it('rejects a transfer with a mismatched previous owner or target', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.createTransfer({
        id: 'gop_1',
        organizationId: 'org_1',
        previousOwnerUserId: 'user_other',
        targetUserId: 'user_2',
        now,
      }),
    ).resolves.toEqual({ kind: 'invalid' })
    await expect(
      repo.createTransfer({
        id: 'gop_1',
        organizationId: 'org_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_1',
        now,
      }),
    ).resolves.toEqual({ kind: 'invalid' })
  })

  it('completes a transfer and swaps the owner', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })
    const admitted = await repo.createTransfer({
      id: 'gop_1',
      organizationId: 'org_1',
      previousOwnerUserId: 'user_1',
      targetUserId: 'user_2',
      now,
    })
    if (admitted.kind !== 'admitted') throw new Error('Transfer was not admitted')

    await expect(
      repo.completeTransfer({
        id: 'gop_1',
        organizationId: 'org_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_2',
        now,
      }),
    ).resolves.toMatchObject({ userId: 'user_2', role: 'owner' })
    await expect(
      repo.findById({ organizationId: 'org_1', userId: 'user_1' }),
    ).resolves.toMatchObject({ role: 'admin' })
    await expect(repo.isOwnerInvariantValid('org_1')).resolves.toBe(true)
  })

  it('rejects a transfer completion with mismatched parties', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })
    await repo.createTransfer({
      id: 'gop_1',
      organizationId: 'org_1',
      previousOwnerUserId: 'user_1',
      targetUserId: 'user_2',
      now,
    })

    await expect(
      repo.completeTransfer({
        id: 'gop_1',
        organizationId: 'org_1',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_other',
        now,
      }),
    ).rejects.toThrow(/no longer valid/)
  })

  it('admits a role operation and rejects an invalid one', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.createMembershipOperation({
        id: 'gop_1',
        organizationId: 'org_1',
        operationType: 'change-member-role',
        targetUserId: 'user_2',
        targetRole: 'admin',
        now,
      }),
    ).resolves.toMatchObject({ id: 'gop_1', operationType: 'change-member-role' })
    await expect(
      repo.createMembershipOperation({
        id: 'gop_2',
        organizationId: 'org_1',
        operationType: 'change-member-role',
        targetUserId: 'user_1',
        targetRole: 'admin',
        now,
      }),
    ).rejects.toThrow(/invalid/)
    await expect(
      repo.createMembershipOperation({
        id: 'gop_3',
        organizationId: 'org_1',
        operationType: 'change-member-role',
        targetUserId: 'user_2',
        targetRole: null,
        now,
      }),
    ).rejects.toThrow(/invalid/)
  })

  it('completes a pending operation and reports a missing one', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })
    await repo.createMembershipOperation({
      id: 'gop_1',
      organizationId: 'org_1',
      operationType: 'remove-member',
      targetUserId: 'user_2',
      targetRole: null,
      now,
    })

    await expect(repo.completeMembershipOperation('gop_1')).resolves.toBeUndefined()
    await expect(repo.findPendingMembershipOperation('org_1')).resolves.toBeUndefined()
    await expect(repo.completeMembershipOperation('gop_missing')).rejects.toThrow(/not found/)
  })

  it('records operation attempts and failures on the persisted rows', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })
    await repo.createMembershipOperation({
      id: 'gop_1',
      organizationId: 'org_1',
      operationType: 'remove-member',
      targetUserId: 'user_2',
      targetRole: null,
      now,
    })

    await repo.incrementMembershipAttempt('gop_1')
    await repo.failMembershipOperation({
      id: 'gop_1',
      failureCode: 'CONFLICT',
      failureMessage: 'authority unavailable',
    })
    await repo.markTransferAttempt({ id: 'gop_1', now })

    await expect(
      fixture.db
        .select({
          attemptCount: schema.TOrganizationGovernanceOperation.attemptCount,
          failureCode: schema.TOrganizationGovernanceOperation.failureCode,
          failureMessage: schema.TOrganizationGovernanceOperation.failureMessage,
        })
        .from(schema.TOrganizationGovernanceOperation)
        .where(eq(schema.TOrganizationGovernanceOperation.id, 'gop_1')),
    ).resolves.toEqual([
      { attemptCount: 2, failureCode: 'CONFLICT', failureMessage: 'authority unavailable' },
    ])
  })

  it('records transfer failures on the persisted row', async () => {
    using fixture = createMembershipDrizzleFixture()
    seedMembershipOrganization(fixture.db)
    const repo = new MembershipRepositoryDrizzle({ db: fixture.db })
    await repo.createTransfer({
      id: 'gop_1',
      organizationId: 'org_1',
      previousOwnerUserId: 'user_1',
      targetUserId: 'user_2',
      now,
    })

    await repo.failTransfer({
      id: 'gop_1',
      now,
      failureCode: 'CONFLICT',
      failureMessage: 'authority diverged',
    })

    await expect(
      fixture.db
        .select({
          failureCode: schema.TOrganizationGovernanceOperation.failureCode,
          failureMessage: schema.TOrganizationGovernanceOperation.failureMessage,
        })
        .from(schema.TOrganizationGovernanceOperation)
        .where(eq(schema.TOrganizationGovernanceOperation.id, 'gop_1')),
    ).resolves.toEqual([{ failureCode: 'CONFLICT', failureMessage: 'authority diverged' }])
  })
})
