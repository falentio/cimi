import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'

export const ANALYTICS_DB_FILENAME = 'analytics.duckdb'

export interface AnalyticsDb {
  ready(): Promise<boolean>
  close(): Promise<void>
}

interface Migration {
  version: number
  name: string
  sql: string
}

const MIGRATIONS: Migration[] = []

export async function createAnalyticsDb(options: { path: string }): Promise<AnalyticsDb> {
  const instance = await DuckDBInstance.create(options.path)
  const connection: DuckDBConnection = await instance.connect()
  await applyMigrations(connection)

  return {
    async ready(): Promise<boolean> {
      try {
        const reader = await connection.runAndReadAll('SELECT 1')
        await reader.readAll()
        return true
      } catch {
        return false
      }
    },
    async close(): Promise<void> {
      try {
        connection.closeSync()
      } catch {}
      try {
        instance.closeSync()
      } catch {}
    },
  }
}

async function applyMigrations(connection: DuckDBConnection): Promise<void> {
  await connection.run(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT current_timestamp)',
  )

  const reader = await connection.runAndReadAll('SELECT version FROM schema_migrations')
  await reader.readAll()

  const appliedVersions = new Set<number>()
  for (const row of reader.getRowObjects()) {
    appliedVersions.add(Number(row['version']))
  }

  const pending = MIGRATIONS.filter((migration) => !appliedVersions.has(migration.version))
  if (pending.length === 0) {
    return
  }

  await connection.run('BEGIN TRANSACTION')
  try {
    for (const migration of pending) {
      await connection.run(migration.sql)
      await connection.run(
        'INSERT INTO schema_migrations (version, name) VALUES ($version, $name)',
        {
          version: migration.version,
          name: migration.name,
        },
      )
    }
    await connection.run('COMMIT')
  } catch (error) {
    await connection.run('ROLLBACK')
    throw error
  }
}
