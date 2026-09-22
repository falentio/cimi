import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
      deleteExpired: (input) => analytics.deleteExpired(input),
      purgeSite: (input) => analytics.purgeSite(input),
      readProjectionSnapshot: (input) => analytics.readProjectionSnapshot(input),
      readReportData: (input) => analytics.readReportData(input),
      readWindowed: (work) => analytics.readWindowed(work),
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

const PROBE_MIGRATION_TAG = '9999_migration_probe'
export const PROBE_MIGRATION_TABLE = 'migration_probe'

const SOURCE_MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url))

export async function createProbeMigrationsFolder(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'cimi-probe-migrations-'))
  try {
    await cp(SOURCE_MIGRATIONS_FOLDER, folder, { recursive: true })
    const journalPath = join(folder, 'meta', '_journal.json')
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: Array<{
        idx: number
        version: string
        when: number
        tag: string
        breakpoints: boolean
      }>
    }
    const last = journal.entries[journal.entries.length - 1]
    if (last === undefined) throw new Error('Control migration journal is invalid')
    journal.entries.push({
      idx: last.idx + 1,
      version: '6',
      when: last.when + 1,
      tag: PROBE_MIGRATION_TAG,
      breakpoints: true,
    })
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8')
    await writeFile(
      join(folder, `${PROBE_MIGRATION_TAG}.sql`),
      `CREATE TABLE ${PROBE_MIGRATION_TABLE} (id TEXT);\n`,
      'utf8',
    )
    return folder
  } catch (error) {
    await rm(folder, { recursive: true, force: true })
    throw error
  }
}
