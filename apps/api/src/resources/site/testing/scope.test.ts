import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { assertSiteManagementScope, assertSiteScope } from '@cimi/guard'
import {
  createSiteDrizzleFixture,
  createSiteGovernanceOperationRow,
  createSiteRepairOperationRow,
  createSiteTombstoneRow,
  createSiteUserRow,
} from '../fixture.drizzle.ts'
import { createSiteScopeDependencies } from '../scope.ts'

describe.concurrent('createSiteScopeDependencies', () => {
  it('reads active Site scope from the control database', async () => {
    using fixture = createSiteDrizzleFixture()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(dependencies.siteScope.exists('site_1')).resolves.toBe(true)
    await expect(dependencies.siteScope.isActive('site_1')).resolves.toBe(true)
    await expect(dependencies.siteScope.getOrganizationId('site_1')).resolves.toBe('organization_1')
    await expect(dependencies.membership.getRole('organization_1', 'user_1')).resolves.toBe('owner')
  })

  it('revokes Site access after the persisted membership is removed', async () => {
    using fixture = createSiteDrizzleFixture()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).resolves.toBeUndefined()

    fixture.db.delete(schema.TMembership).run()

    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('fails closed while an Organization governance operation is pending', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(createSiteGovernanceOperationRow())
      .run()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      assertSiteManagementScope({ id: 'user_1' }, 'site_1', dependencies),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('returns empty scope for an unknown Site', async () => {
    using fixture = createSiteDrizzleFixture()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(dependencies.siteScope.exists('site_missing')).resolves.toBe(false)
    await expect(dependencies.siteScope.isActive('site_missing')).resolves.toBe(false)
    await expect(dependencies.siteScope.getOrganizationId('site_missing')).resolves.toBeUndefined()
  })

  it('marks a non-active Site as inactive while keeping its identity', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .update(schema.TSite)
      .set({ status: 'deleted' })
      .where(eq(schema.TSite.id, 'site_1'))
      .run()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(dependencies.siteScope.exists('site_1')).resolves.toBe(true)
    await expect(dependencies.siteScope.isActive('site_1')).resolves.toBe(false)
    await expect(dependencies.siteScope.getOrganizationId('site_1')).resolves.toBe('organization_1')
  })

  it('resolves tombstoned Site identity after purge', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db.delete(schema.TSite).run()
    fixture.db.insert(schema.TSiteTombstone).values(createSiteTombstoneRow()).run()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(dependencies.siteScope.exists('site_1')).resolves.toBe(true)
    await expect(dependencies.siteScope.isActive('site_1')).resolves.toBe(false)
    await expect(dependencies.siteScope.getOrganizationId('site_1')).resolves.toBe('organization_1')
  })

  it('fails closed while an Organization repair operation is pending', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TOrganizationRepairOperation)
      .values(createSiteRepairOperationRow())
      .run()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(
      dependencies.membership.hasPendingGovernanceOperation('organization_1'),
    ).resolves.toBe(true)
    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    await expect(
      assertSiteManagementScope({ id: 'user_1' }, 'site_1', dependencies),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('ignores completed governance operations when checking pending state', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TOrganizationGovernanceOperation)
      .values(createSiteGovernanceOperationRow({ id: 'operation_done', status: 'completed' }))
      .run()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(
      dependencies.membership.hasPendingGovernanceOperation('organization_1'),
    ).resolves.toBe(false)
    await expect(assertSiteScope({ id: 'user_1' }, 'site_1', dependencies)).resolves.toBeUndefined()
  })

  it('returns undefined role without membership or with a broken owner invariant', async () => {
    using fixture = createSiteDrizzleFixture()
    fixture.db
      .insert(schema.TUser)
      .values(createSiteUserRow({ email: 'bob@example.com', id: 'user_2', name: 'Bob' }))
      .run()
    const dependencies = createSiteScopeDependencies({ db: fixture.db })

    await expect(
      dependencies.membership.getRole('organization_1', 'user_2'),
    ).resolves.toBeUndefined()

    fixture.db
      .update(schema.TOrganization)
      .set({ ownerUserId: 'user_2' })
      .where(eq(schema.TOrganization.id, 'organization_1'))
      .run()

    await expect(
      dependencies.membership.getRole('organization_1', 'user_1'),
    ).resolves.toBeUndefined()
  })
})
