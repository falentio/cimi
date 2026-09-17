import { describe, expect, it } from 'vitest'
import { PublicDashboardRepositoryDrizzle } from '../repository.drizzle.ts'
import { createPublicDashboardFixture, insertPublicDashboard, updatedAt } from './fixture.ts'

describe('PublicDashboardRepositoryDrizzle.disable', () => {
  it('revokes identifier lookup without deleting the retained configuration', async () => {
    using fixture = createPublicDashboardFixture()
    insertPublicDashboard(fixture.db)
    const repository = new PublicDashboardRepositoryDrizzle({ db: fixture.db })

    await expect(repository.disable({ siteId: 'ste_1', now: updatedAt })).resolves.toMatchObject({
      status: 'updated',
      config: { enabled: false, publicDashboardIdentifier: 'public-old' },
    })
    await expect(repository.findByIdentifierHash('hash-old')).resolves.toBeUndefined()
    await expect(repository.findBySiteId('ste_1')).resolves.toMatchObject({
      enabled: false,
      publicDashboardIdentifier: 'public-old',
    })
  })
})
