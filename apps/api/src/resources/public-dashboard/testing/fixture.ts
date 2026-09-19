import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'

export const createdAt = new Date('2026-09-01T00:00:00.000Z')
export const updatedAt = new Date('2026-09-02T00:00:00.000Z')

export function createPublicDashboardFixture() {
  const site = createSiteDrizzleFixture()
  return {
    ...site,
    [Symbol.dispose]() {
      site[Symbol.dispose]()
    },
  }
}

export function insertPublicDashboard(
  db: ReturnType<typeof createPublicDashboardFixture>['db'],
  overrides: Partial<typeof schema.TPublicDashboard.$inferInsert> = {},
): void {
  db.insert(schema.TPublicDashboard)
    .values({
      siteId: 'ste_1',
      enabled: true,
      publicIdentifier: 'public-old',
      publicIdentifierHash: 'hash-old',
      createdAt,
      updatedAt,
      rotatedAt: null,
      ...overrides,
    })
    .run()
}
