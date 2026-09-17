import { describe, expect, it } from 'vitest'
import { PublicDashboardRepositoryDrizzle } from '../repository.drizzle.ts'
import { createPublicDashboardFixture, updatedAt } from './fixture.ts'

describe('PublicDashboardRepositoryDrizzle.enable', () => {
  it('creates an enabled configuration and rotates an existing one', async () => {
    using fixture = createPublicDashboardFixture()
    const repository = new PublicDashboardRepositoryDrizzle({ db: fixture.db })

    await expect(
      repository.enable({
        siteId: 'ste_1',
        identifier: 'public-new',
        identifierHash: 'hash-new',
        now: updatedAt,
      }),
    ).resolves.toMatchObject({
      status: 'updated',
      config: {
        siteId: 'ste_1',
        enabled: true,
        publicDashboardIdentifier: 'public-new',
        updatedAt: updatedAt.toISOString(),
      },
    })

    await expect(repository.findByIdentifierHash('hash-new')).resolves.toMatchObject({
      publicDashboardIdentifier: 'public-new',
    })
  })
})
