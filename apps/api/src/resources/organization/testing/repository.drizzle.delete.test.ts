import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { OrganizationRepositoryDrizzle } from '../repository.drizzle.ts'
import {
  createOrganizationDrizzleFixture,
  createOrganizationGovernanceOperationRow,
  createOrganizationUserRow,
  seedOrganizationDrizzle,
} from '../fixture.drizzle.ts'

function createSiteRow(organizationId: string) {
  const now = new Date('2026-08-31T00:00:00.000Z')
  return {
    id: `ste_${organizationId}`,
    organizationId,
    name: 'Production',
    hostname: `${organizationId}.example.com`,
    ingestionIdentifier: `ing_${organizationId}`,
    createdAt: now,
    updatedAt: now,
  }
}

describe.concurrent('OrganizationRepositoryDrizzle.delete', () => {
  it('classifies deletable, missing, and occupied organizations', async () => {
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
    await fixture.db.insert(schema.TSite).values(createSiteRow('org_2'))
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.checkDelete('org_1')).resolves.toEqual({
      kind: 'deletable',
      isPersonal: false,
    })
    await expect(repo.checkDelete('org_missing')).resolves.toEqual({ kind: 'missing' })
    await expect(repo.checkDelete('org_2')).resolves.toEqual({
      kind: 'not-empty',
      isPersonal: false,
    })
  })

  it('deletes an organization and reports a missing one', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.delete('org_1')).resolves.toBe(true)
    await expect(repo.delete('org_1')).resolves.toBe(false)
  })

  it('deletes an empty organization atomically and keeps the rest', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.deleteIfEmpty('org_1')).resolves.toEqual({ kind: 'deleted' })
    await expect(repo.deleteIfEmpty('org_missing')).resolves.toEqual({ kind: 'missing' })

    await seedOrganizationDrizzle(fixture.db, {
      organization: {
        id: 'org_2',
        name: 'Second',
        ownerUserId: 'user_1',
        authorityOrganizationId: null,
      },
    })
    await fixture.db.insert(schema.TSite).values(createSiteRow('org_2'))
    await expect(repo.deleteIfEmpty('org_2')).resolves.toEqual({
      kind: 'not-empty',
      isPersonal: false,
    })
    await expect(
      fixture.db
        .select({ id: schema.TOrganization.id })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, 'org_2')),
    ).resolves.toHaveLength(1)
  })

  it('admits a delete operation and finds it while pending', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.findPendingDeleteOperation('org_1')).resolves.toBeUndefined()
    const operation = await repo.createDeleteOperation(
      createOrganizationGovernanceOperationRow({
        requestedAt: new Date('2026-09-01T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    )
    expect(operation).toMatchObject({ organizationId: 'org_1' })
    await expect(repo.findPendingDeleteOperation('org_1')).resolves.toMatchObject({
      id: operation.id,
    })
  })

  it('rejects a delete operation for a missing organization', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.createDeleteOperation(
        createOrganizationGovernanceOperationRow({
          organizationId: 'org_missing',
          requestedAt: new Date('2026-09-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow('NOT_FOUND')
  })

  it('rejects a delete operation for an occupied organization', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    await fixture.db.insert(schema.TSite).values(createSiteRow('org_1'))
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.createDeleteOperation(createOrganizationRowDeleteInput())).rejects.toThrow(
      'ORGANIZATION_NOT_EMPTY',
    )
  })

  it('rejects a delete operation for a personal organization', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db, { organization: { isPersonal: true } })
    await fixture.db.insert(schema.TSite).values(createSiteRow('org_1'))
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(repo.createDeleteOperation(createOrganizationRowDeleteInput())).rejects.toThrow(
      'PERSONAL_PROTECTED',
    )
  })

  it('rejects a delete operation while another operation is pending', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })
    await repo.createDeleteOperation(createOrganizationRowDeleteInput())

    await expect(
      repo.createDeleteOperation(
        createOrganizationGovernanceOperationRow({
          id: 'gop_2',
          requestedAt: new Date('2026-09-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow('FENCED_PENDING')
  })

  it('rejects a delete operation from a non-owner and a broken invariant', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db, {
      members: [{ userId: 'user_2', role: 'admin' }],
    })
    await fixture.db
      .insert(schema.TUser)
      .values(
        createOrganizationUserRow({ id: 'user_3', name: 'user_3', email: 'user_3@example.com' }),
      )
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })

    await expect(
      repo.createDeleteOperation(
        createOrganizationGovernanceOperationRow({
          previousOwnerUserId: 'user_2',
          requestedAt: new Date('2026-09-01T00:00:00.000Z'),
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow('FORBIDDEN_OWNER')

    await fixture.db
      .update(schema.TOrganization)
      .set({ ownerUserId: 'user_3' })
      .where(eq(schema.TOrganization.id, 'org_1'))
    const now = new Date('2026-09-01T00:00:00.000Z')
    await expect(
      repo.createDeleteOperation(
        createOrganizationGovernanceOperationRow({
          previousOwnerUserId: 'user_3',
          targetUserId: 'user_3',
          requestedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    ).rejects.toThrow('CONFLICT_OWNER')
  })

  it('finalizes a delete and refuses a missing operation', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })
    const operation = await repo.createDeleteOperation(createOrganizationRowDeleteInput())

    await repo.incrementDeleteAttempt(operation.id)
    await repo.recordDeleteFailure(operation.id, 'authority unavailable')
    await expect(repo.finalizeDeleteOperation(operation.id)).resolves.toBe(true)
    await expect(
      fixture.db
        .select({ id: schema.TOrganization.id })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, 'org_1')),
    ).resolves.toHaveLength(0)
    await expect(repo.finalizeDeleteOperation('gop_missing')).rejects.toThrow('PENDING_NOT_FOUND')
  })

  it('refuses to finalize a delete for an occupied organization', async () => {
    using fixture = await createOrganizationDrizzleFixture()
    await seedOrganizationDrizzle(fixture.db)
    const repo = new OrganizationRepositoryDrizzle({ db: fixture.db })
    const operation = await repo.createDeleteOperation(createOrganizationRowDeleteInput())
    await fixture.db.insert(schema.TSite).values(createSiteRow('org_1'))

    await expect(repo.finalizeDeleteOperation(operation.id)).rejects.toThrow(
      'ORGANIZATION_NOT_EMPTY',
    )
  })
})

function createOrganizationRowDeleteInput() {
  const now = new Date('2026-09-01T00:00:00.000Z')
  return createOrganizationGovernanceOperationRow({
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
  })
}
