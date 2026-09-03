import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { OrganizationRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createOrganizationDrizzleFixture,
  createOrganizationGovernanceOperationRow,
  createOrganizationRow,
  destroyOrganizationDrizzleFixture,
} from '../fixture.drizzle.ts'

describe('OrganizationRepositoryDrizzle.insertWithOwner', () => {
  let fixture: Awaited<ReturnType<typeof createOrganizationDrizzleFixture>>

  beforeEach(async () => {
    fixture = await createOrganizationDrizzleFixture()
  })

  afterEach(() => destroyOrganizationDrizzleFixture(fixture))

  it('rolls back the Organization when the Owner membership cannot be inserted', async () => {
    const { db } = fixture
    const organization = createOrganizationRow()
    const repository = new OrganizationRepositoryDrizzle({ db })

    await expect(
      repository.insertWithOwner(organization, {
        userId: 'missing_user',
        now: organization.createdAt,
      }),
    ).rejects.toThrow()

    await expect(
      db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id)),
    ).resolves.toHaveLength(0)
    await expect(
      db
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, organization.id)),
    ).resolves.toHaveLength(0)
  })

  it('deletes the Organization and its terminal governance operation atomically', async () => {
    const { db } = fixture
    const organization = createOrganizationRow({ authorityOrganizationId: null })
    const repository = new OrganizationRepositoryDrizzle({ db })
    await repository.insertWithOwner(organization, {
      userId: organization.ownerUserId,
      now: organization.createdAt,
    })
    const operation = await repository.createDeleteOperation(
      createOrganizationGovernanceOperationRow({
        organizationId: organization.id,
        previousOwnerUserId: organization.ownerUserId,
        targetUserId: organization.ownerUserId,
        requestedAt: organization.createdAt,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
      }),
    )

    await expect(repository.finalizeDeleteOperation(operation.id)).resolves.toBe(true)
    await expect(
      db.select().from(schema.TOrganization).where(eq(schema.TOrganization.id, organization.id)),
    ).resolves.toHaveLength(0)
    await expect(
      db
        .select()
        .from(schema.TOrganizationGovernanceOperation)
        .where(eq(schema.TOrganizationGovernanceOperation.id, operation.id)),
    ).resolves.toHaveLength(0)
  })
})
