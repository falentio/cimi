import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { PublicDashboardRepositoryDrizzle } from '../repository.drizzle.ts'
import { createPublicDashboardFixture, insertPublicDashboard } from './fixture.ts'

describe('PublicDashboardRepositoryDrizzle.findByIdentifierHash', () => {
  it.each(['deleting', 'deleted', 'recovering', 'purged'] as const)(
    'fails closed for a %s Site',
    async (status) => {
      using fixture = createPublicDashboardFixture()
      insertPublicDashboard(fixture.db)
      fixture.db.update(schema.TSite).set({ status }).where(eq(schema.TSite.id, 'ste_1')).run()
      const repository = new PublicDashboardRepositoryDrizzle({ db: fixture.db })

      await expect(repository.findByIdentifierHash('hash-old')).resolves.toBeUndefined()
    },
  )
})
