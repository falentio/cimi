import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { SiteRepositoryDrizzle } from '../repository.drizzle.ts'

const createdAt = new Date('2026-09-01T00:00:00.000Z')

describe('SiteRepositoryDrizzle.concurrentCreate', () => {
  it('allows exactly one insert for the same organization hostname', async () => {
    const db = createMigratedTestDb()
    try {
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
          id: 'org_1',
          name: 'Analytics',
          authorityOrganizationId: 'authority_1',
          ownerUserId: 'user_1',
          isPersonal: false,
          createdAt,
          updatedAt: createdAt,
        })
        .run()

      const repo = new SiteRepositoryDrizzle({ db })
      const results = await Promise.allSettled([
        repo.insert({
          id: 'ste_race_1',
          organizationId: 'org_1',
          name: 'Production',
          hostname: 'race.example.com',
          ingestionIdentifier: 'ing_race_1',
          reportingTimezone: 'UTC',
          weekStartsOn: 'monday',
          createdAt,
          updatedAt: createdAt,
        }),
        repo.insert({
          id: 'ste_race_2',
          organizationId: 'org_1',
          name: 'Production',
          hostname: 'race.example.com',
          ingestionIdentifier: 'ing_race_2',
          reportingTimezone: 'UTC',
          weekStartsOn: 'monday',
          createdAt,
          updatedAt: createdAt,
        }),
      ])

      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      const reason = (rejected[0] as PromiseRejectedResult).reason
      expect(String((reason as Error)?.message ?? reason)).toMatch(/constraint|unique|reserved/i)

      const rows = db
        .select()
        .from(schema.TSite)
        .where(eq(schema.TSite.hostname, 'race.example.com'))
        .all()
      expect(rows).toHaveLength(1)
    } finally {
      closeDb(db)
    }
  })
})
