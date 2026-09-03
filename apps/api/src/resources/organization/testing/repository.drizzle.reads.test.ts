import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { OrganizationRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createOrganizationDrizzleFixture,
  createOrganizationGovernanceOperationRow,
  createOrganizationRepairOperationRow,
  createOrganizationRow,
  seedOrganizationDrizzle,
} from '../fixture.drizzle.ts'

describe.concurrent('OrganizationRepositoryDrizzle.reads', () => {
  it('lists organizations for a member with pagination metadata', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    await seedOrganizationDrizzle(fixture.db, {
      organization: {
        id: 'org_2',
        name: 'Second',
        ownerUserId: 'user_1',
        authorityOrganizationId: null,
      },
    })
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.findManyForUser({ userId: 'user_1', offset: 0, limit: 1 }),
    ).resolves.toMatchObject({ totalCount: 2, hasMore: true, nextOffset: 1 })
    await expect(
      repo.findManyForUser({ userId: 'user_1', offset: 2, limit: 1 }),
    ).resolves.toMatchObject({ items: [], totalCount: 2, hasMore: false, nextOffset: null })
    await expect(
      repo.findManyForUser({ userId: 'user_missing', offset: 0, limit: 20 }),
    ).resolves.toEqual({ items: [], nextOffset: null, hasMore: false, totalCount: 0 })
  })

  it('finds an organization by id, authority id, and membership', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findById('org_1')).resolves.toMatchObject({ name: 'Analytics' })
    await expect(repo.findById('org_missing')).resolves.toBeUndefined()
    await expect(repo.findByAuthorityId('authority_1')).resolves.toMatchObject({
      id: 'org_1',
    })
    await expect(repo.findByAuthorityId('authority_missing')).resolves.toBeUndefined()
    await expect(repo.findByIdForUser('org_1', 'user_1')).resolves.toMatchObject({
      id: 'org_1',
    })
    await expect(repo.findByIdForUser('org_1', 'user_missing')).resolves.toBeUndefined()
  })

  it('finds a personal organization and the role of a member', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db, {
      organization: { isPersonal: true },
      members: [
        { userId: 'user_1', role: 'owner' },
        { userId: 'user_2', role: 'admin' },
      ],
    })
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findPersonalByOwner('user_1')).resolves.toMatchObject({
      id: 'org_1',
    })
    await expect(repo.findPersonalByOwner('user_2')).resolves.toBeUndefined()
    await expect(repo.findRoleForUser('org_1', 'user_2')).resolves.toBe('admin')
    await expect(repo.findRoleForUser('org_1', 'user_missing')).resolves.toBeUndefined()
  })

  it('validates the owner invariant against the persisted rows', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.isOwnerInvariantValid('org_1')).resolves.toBe(true)
    await expect(repo.isOwnerInvariantValid('org_missing')).resolves.toBe(false)
  })

  it('inserts an organization and renames it', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.insert(createOrganizationRow())).resolves.toMatchObject({
      id: 'org_1',
      name: 'Analytics',
    })
    await expect(repo.updateName('org_1', 'Renamed')).resolves.toMatchObject({
      name: 'Renamed',
    })
    await expect(repo.updateName('org_missing', 'Renamed')).resolves.toBeUndefined()
  })

  it('finds pending create and update repairs', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findPendingCreateRepair('user_1')).resolves.toBeUndefined()
    await expect(repo.findPendingUpdateRepair('org_1')).resolves.toBeUndefined()

    await fixture.db
      .insert(schema.TOrganizationRepairOperation)
      .values(createOrganizationRepairOperationRow())

    await fixture.db.insert(schema.TOrganizationRepairOperation).values(
      createOrganizationRepairOperationRow({
        id: 'orp_create',
        organizationId: null,
        localOrganizationId: 'org_new',
        operationType: 'create-organization',
        authorityOrganizationId: null,
        authoritySlug: 'org_new-user_1',
        previousName: null,
        desiredName: 'New Organization',
      }),
    )

    await expect(repo.findPendingCreateRepair('user_1')).resolves.toMatchObject({
      id: 'orp_create',
    })
    await expect(repo.findPendingUpdateRepair('org_1')).resolves.toMatchObject({
      id: 'orp_1',
    })
  })

  it('detects pending governance and repair operations', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.hasPendingGovernanceOperation('org_1')).resolves.toBe(false)

    await fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(createOrganizationGovernanceOperationRow())
    await expect(repo.hasPendingGovernanceOperation('org_1')).resolves.toBe(true)
  })

  it('detects a pending repair operation without a governance row', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await fixture.db
      .insert(schema.TOrganizationRepairOperation)
      .values(createOrganizationRepairOperationRow())
    await expect(repo.hasPendingGovernanceOperation('org_1')).resolves.toBe(true)
  })

  it('reports a missing repair completion as false', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.completeRepairOperation('orp_missing')).resolves.toBe(false)
  })
})
