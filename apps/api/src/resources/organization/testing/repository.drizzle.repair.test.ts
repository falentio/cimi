import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { OrganizationRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createOrganizationDrizzleFixture,
  createOrganizationRepairOperationRow,
  createOrganizationRow,
} from '../fixture.drizzle.ts'

describe.concurrent('OrganizationRepositoryDrizzle repair operations', () => {
  it('commits a local Organization and its completed create repair atomically', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    const { db } = fixture
    const organization = createOrganizationRow()
    const repository = new OrganizationRepositoryDrizzle({ db })
    const repair = await repository.createRepairOperation(
      createOrganizationRepairOperationRow({
        organizationId: null,
        localOrganizationId: organization.id,
        operationType: 'create-organization',
        authoritySlug: 'organization_1-user_1',
        previousName: null,
        desiredName: organization.name,
        requestedAt: organization.createdAt,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      }),
    )

    await expect(
      repository.insertWithOwnerAndCompleteRepair(
        organization,
        { userId: organization.ownerUserId, now: organization.createdAt },
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
    using fixture = await createOrganizationDrizzleFixture()
    const { db } = fixture
    const organization = createOrganizationRow()
    const repository = new OrganizationRepositoryDrizzle({ db })
    const repair = await repository.createRepairOperation(
      createOrganizationRepairOperationRow({
        organizationId: null,
        localOrganizationId: organization.id,
        operationType: 'create-organization',
        authoritySlug: 'organization_1-user_1',
        previousName: null,
        desiredName: organization.name,
        requestedAt: organization.createdAt,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      }),
    )

    await expect(
      repository.insertWithOwnerAndCompleteRepair(
        organization,
        { userId: 'missing_user', now: organization.createdAt },
        repair.id,
      ),
    ).rejects.toThrow()

    await expect(
      db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id)),
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
    using fixture = await createOrganizationDrizzleFixture()
    const { db } = fixture
    const organization = createOrganizationRow()
    const updatedName = 'Renamed Analytics'
    const repository = new OrganizationRepositoryDrizzle({ db })
    await repository.insertWithOwner(organization, {
      userId: organization.ownerUserId,
      now: organization.createdAt,
    })
    const repair = await repository.createRepairOperation(
      createOrganizationRepairOperationRow({
        organizationId: organization.id,
        localOrganizationId: organization.id,
        ownerUserId: organization.ownerUserId,
        authorityOrganizationId: organization.authorityOrganizationId,
        previousName: organization.name,
        desiredName: updatedName,
        requestedAt: organization.createdAt,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      }),
    )

    await expect(
      repository.updateNameAndCompleteRepair(organization.id, updatedName, repair.id),
    ).resolves.toMatchObject({ id: 'organization_1', name: 'Renamed Analytics' })
    await expect(
      db
        .select({ name: schema.TOrganization.name })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, organization.id)),
    ).resolves.toEqual([{ name: 'Renamed Analytics' }])
    await expect(
      db
        .select({ status: schema.TOrganizationRepairOperation.status })
        .from(schema.TOrganizationRepairOperation)
        .where(eq(schema.TOrganizationRepairOperation.id, repair.id)),
    ).resolves.toEqual([{ status: 'completed' }])
  })
})
