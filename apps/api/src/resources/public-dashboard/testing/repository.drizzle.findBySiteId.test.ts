import { describe, expect, it } from 'vitest'
import { PublicDashboardRepositoryDrizzle } from '../repository.drizzle.ts'
import { createPublicDashboardFixture, createdAt, updatedAt } from './fixture.ts'

describe('PublicDashboardRepositoryDrizzle.findBySiteId', () => {
  it('represents a legacy hash-only row as disabled with no raw identifier', async () => {
    using fixture = createPublicDashboardFixture()
    fixture.db.$client
      .prepare(
        'INSERT INTO public_dashboard (site_id, enabled, public_identifier, public_identifier_hash, created_at, updated_at, rotated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run('ste_1', 0, null, 'hash-legacy', createdAt.getTime(), updatedAt.getTime(), null)
    const repository = new PublicDashboardRepositoryDrizzle({ db: fixture.db })

    await expect(repository.findBySiteId('ste_1')).resolves.toEqual({
      siteId: 'ste_1',
      enabled: false,
      publicDashboardIdentifier: null,
      updatedAt: updatedAt.toISOString(),
    })
  })
})
