import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import { assertSiteManagementScope, assertSiteScope } from '@cimi/guard'
import { createSiteDrizzleFixture, createSiteGovernanceOperationRow } from '../fixture.drizzle.ts'
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
})
