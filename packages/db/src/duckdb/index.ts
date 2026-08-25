import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { ANALYTICS_MIGRATIONS } from './schema.ts'

export { ANALYTICS_MIGRATIONS, type AnalyticsMigration } from './schema.ts'

export const ANALYTICS_DB_FILENAME = 'analytics.duckdb'

export interface AnalyticsDb {
  ready(): Promise<boolean>
  close(): Promise<void>
}

export interface CreateAnalyticsDbOptions {
  path: string
  threads?: number
  memoryLimit?: string
  tempDirectory?: string
  maxTempDirectorySize?: string
}

export async function createAnalyticsDb(options: CreateAnalyticsDbOptions): Promise<AnalyticsDb> {
  const tempDirectory = options.tempDirectory ?? join(dirname(options.path), 'analytics.duckdb.tmp')
  mkdirSync(tempDirectory, { recursive: true })

  const instance = await DuckDBInstance.create(options.path, {
    threads: String(options.threads ?? 1),
    memory_limit: options.memoryLimit ?? '512MB',
    temp_directory: tempDirectory,
    max_temp_directory_size: options.maxTempDirectorySize ?? '1GB',
  })
  let connection: DuckDBConnection | undefined
  try {
    connection = await instance.connect()
    await applyMigrations(connection)
  } catch (error) {
    closeResources(connection, instance)
    throw error
  }

  if (!connection) {
    closeResources(undefined, instance)
    throw new Error('DuckDB connection was not created.')
  }

  let closed = false

  return {
    async ready(): Promise<boolean> {
      if (closed) return false

      try {
        const reader = await connection.runAndReadAll('SELECT 1')
        await reader.readAll()
        return true
      } catch {
        return false
      }
    },
    async close(): Promise<void> {
      if (closed) return
      closed = true

      try {
        await connection.run('CHECKPOINT')
      } finally {
        closeResources(connection, instance)
      }
    },
  }
}

function closeResources(
  connection: DuckDBConnection | undefined,
  instance: Awaited<ReturnType<typeof DuckDBInstance.create>>,
): void {
  try {
    connection?.closeSync()
  } catch {}
  try {
    instance.closeSync()
  } catch {}
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

  const pending = ANALYTICS_MIGRATIONS.filter(
    (migration) => !appliedVersions.has(migration.version),
  )
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
