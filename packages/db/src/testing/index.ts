import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAnalyticsDb, type AnalyticsDb } from '../duckdb/index.ts'
import { closeDb, createDb, type Db } from '../client.ts'
import { migrateControlDb } from '../migrate.ts'

export function createMigratedTestDb(): Db {
  const db = createDb({ path: ':memory:' })
  try {
    migrateControlDb(db)
    return db
  } catch (error) {
    closeDb(db)
    throw error
  }
}

export async function createTestAnalyticsDb(): Promise<AnalyticsDb> {
  const tempDirectory = await mkdtemp(join(tmpdir(), 'cimi-analytics-test-'))

  try {
    const analytics = await createAnalyticsDb({
      path: ':memory:',
      tempDirectory: join(tempDirectory, 'spill'),
    })
    let closed = false

    return {
      ready: () => analytics.ready(),
      rebuild: (input) => analytics.rebuild(input),
      async close() {
        if (closed) return
        closed = true
        try {
          await analytics.close()
        } finally {
          await rm(tempDirectory, { recursive: true, force: true })
        }
      },
    }
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true })
    throw error
  }
}
