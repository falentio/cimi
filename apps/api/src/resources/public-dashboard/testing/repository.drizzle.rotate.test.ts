import { describe, expect, it } from 'vitest'
import { PublicDashboardRepositoryDrizzle } from '../repository.drizzle.ts'
import { createPublicDashboardFixture, insertPublicDashboard, updatedAt } from './fixture.ts'

describe('PublicDashboardRepositoryDrizzle.rotate', () => {
  it('atomically revokes the old identifier and returns the new one', async () => {
    using fixture = createPublicDashboardFixture()
    insertPublicDashboard(fixture.db)
    const repository = new PublicDashboardRepositoryDrizzle({ db: fixture.db })

    await expect(
      repository.rotate({
        siteId: 'ste_1',
        identifier: 'public-rotated',
        identifierHash: 'hash-rotated',
        now: updatedAt,
      }),
    ).resolves.toMatchObject({
      status: 'updated',
      config: { enabled: true, publicDashboardIdentifier: 'public-rotated' },
    })
    await expect(repository.findByIdentifierHash('hash-old')).resolves.toBeUndefined()
    await expect(repository.findByIdentifierHash('hash-rotated')).resolves.toMatchObject({
      siteId: 'ste_1',
    })
  })

  it('does not rotate a disabled configuration', async () => {
    using fixture = createPublicDashboardFixture()
    insertPublicDashboard(fixture.db, { enabled: false })
    const repository = new PublicDashboardRepositoryDrizzle({ db: fixture.db })

    await expect(
      repository.rotate({
        siteId: 'ste_1',
        identifier: 'public-rotated',
        identifierHash: 'hash-rotated',
        now: updatedAt,
      }),
    ).resolves.toEqual({ status: 'conflict' })
  })

  it('repairs a disabled legacy hash-only configuration by rotating and enabling it', async () => {
    using fixture = createPublicDashboardFixture()
    insertPublicDashboard(fixture.db, { enabled: false, publicIdentifier: null })
    const repository = new PublicDashboardRepositoryDrizzle({ db: fixture.db })

    await expect(
      repository.rotate({
        siteId: 'ste_1',
        identifier: 'public-repaired',
        identifierHash: 'hash-repaired',
        now: updatedAt,
      }),
    ).resolves.toMatchObject({
      status: 'updated',
      config: { enabled: true, publicDashboardIdentifier: 'public-repaired' },
    })
  })
})
