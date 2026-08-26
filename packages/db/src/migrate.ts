import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeDb, createDb, type Db } from './client.ts'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export const BASE_SKELETON_TABLES = [
  'installation',
  'retention_policy',
  'site_tombstone',
  'backup_restore_reference',
  'event_acceptance_journal',
] as const

export function migrateControlDb(db: Db): void {
  migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsTable: '__drizzle_migrations',
  })
}

export function validateBaseSchema(db: Db): void {
  const rows = db.$client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>
  const tables = new Set(rows.map((row) => row.name))
  const missing = BASE_SKELETON_TABLES.filter((table) => !tables.has(table))
  if (missing.length > 0) {
    throw new Error(`Base control schema is missing tables: ${missing.join(', ')}`)
  }
}

export function migrateControlDbAtPath(path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const db = createDb({ path })
  try {
    migrateControlDb(db)
    validateBaseSchema(db)
  } finally {
    closeDb(db)
  }
}

export function resolveControlDbPath(
  env: Record<string, string | undefined> = process.env,
  workingDirectory: string = WORKSPACE_ROOT,
): string {
  const configuredPath = env['CIMI_CONTROL_DB_PATH']
  if (configuredPath !== undefined) return resolve(workingDirectory, configuredPath)

  const dataDirectory = env['CIMI_DATA_DIR'] ?? '.cimi'
  return resolve(workingDirectory, dataDirectory, 'control.sqlite')
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  migrateControlDbAtPath(resolveControlDbPath())
}
