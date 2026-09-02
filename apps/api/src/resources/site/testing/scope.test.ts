import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, schema, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { assertSiteManagementScope, assertSiteScope } from '@cimi/guard'
import { createSiteScopeDependencies } from '../scope.ts'

describe('createSiteScopeDependencies', () => {
  let db: Db
  const createdAt = new Date('2026-08-31T00:00:00.000Z')

  beforeEach(() => {
    db = createMigratedTestDb()
    db.insert(schema.TUser)
      .values({
        id: 'user_1',
        name: 'Ada',
        email: 'ada@example.com',
        emailVerified: true,
        image: null,
        role: null,
        banned: null,
        banReason: null,
        banExpires: null,
        createdAt,
        updatedAt: createdAt,
      })
      .run()
    db.insert(schema.TOrganization)
      .values({
        id: 'organization_1',
        name: 'Analytics',
        authorityOrganizationId: 'authority_1',
        ownerUserId: 'user_1',
        isPersonal: false,
        createdAt,
        updatedAt: createdAt,
      })
      .run()
    db.insert(schema.TMembership)
      .values({
        organizationId: 'organization_1',
        userId: 'user_1',
        role: 'owner',
        createdAt,
        updatedAt: createdAt,
      })
      .run()
    db.insert(schema.TSite)
      .values({
        id: 'site_1',
        organizationId: 'organization_1',
        name: 'Production',
        hostname: 'example.com',
        ingestionIdentifier: 'ingest_1',
        createdAt,
        updatedAt: createdAt,
      })
      .run()
  })

  afterEach(() => closeDb(db))

  it('reads active Site scope from the control database', async () => {
    const dependencies = createSiteScopeDependencies({ db })

    await expect(dependencies.siteScope.exists('site_1')).resolves.toBe(true)
    await expect(dependencies.siteScope.isActive('site_1')).resolves.toBe(true)
    await expect(dependencies.siteScope.getOrganizationId('site_1')).resolves.toBe('organization_1')
    await expect(dependencies.membership.getRole('organization_1', 'user_1')).resolves.toBe('owner')
  })

  it('revokes Site access after the persisted membership is removed', async () => {
    const dependencies = createSiteScopeDependencies({ db })

    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).resolves.toBeUndefined()

    db.delete(schema.TMembership).run()

    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('fails closed while an Organization governance operation is pending', async () => {
    db.insert(schema.TOrganizationGovernanceOperation)
      .values({
        id: 'operation_1',
        organizationId: 'organization_1',
        operationType: 'transfer-ownership',
        previousOwnerUserId: 'user_1',
        targetUserId: 'user_1',
        targetRole: null,
        status: 'pending',
        attemptCount: 0,
        requestedAt: createdAt,
        lastAttemptAt: null,
        completedAt: null,
        failureCode: null,
        failureMessage: null,
        createdAt,
        updatedAt: createdAt,
      })
      .run()
    const dependencies = createSiteScopeDependencies({ db })

    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      assertSiteManagementScope({ id: 'user_1' }, 'site_1', dependencies),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })
})
