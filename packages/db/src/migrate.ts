import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeDb, createDb, type Db } from './client.ts'
import { bridgeLegacyControlDb, classifyControlLineage } from './legacy-bridge.ts'
import {
  BASE_SKELETON_TABLES,
  ControlMigrationIncompatibilityError,
  loadCurrentMigrationPlan,
  type MigrationManifestEntry,
} from './migration-plan.ts'

export { BASE_SKELETON_TABLES, ControlMigrationIncompatibilityError } from './migration-plan.ts'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export interface ControlMigrationOptions {
  migrationsFolder?: string | undefined
}

export function migrateControlDb(db: Db, options: ControlMigrationOptions = {}): void {
  const lineage = classifyControlLineage(db.$client)
  if (lineage.kind === 'legacy-471c10d') {
    bridgeLegacyControlDb({
      source: db,
      plan: loadCurrentMigrationPlan(options.migrationsFolder ?? MIGRATIONS_FOLDER),
    })
    return
  }
  validateControlMigrationHistory(db, options)
  migrate(db, {
    migrationsFolder: options.migrationsFolder ?? MIGRATIONS_FOLDER,
    migrationsTable: '__drizzle_migrations',
  })
}

export function validateControlMigrationHistory(
  db: Db,
  options: ControlMigrationOptions = {},
): void {
  const table = db.$client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get() as { name: string } | undefined
  if (table === undefined) return

  const rows = db.$client
    .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at, id')
    .all() as Array<{ hash: string; created_at: number }>
  const manifest =
    options.migrationsFolder === undefined
      ? getDefaultControlMigrationManifest()
      : loadControlMigrationManifest(options.migrationsFolder)
  if (rows.length > manifest.length) {
    throw new ControlMigrationIncompatibilityError(
      'Control migration history is newer than this release',
    )
  }

  for (const [index, row] of rows.entries()) {
    const expected = manifest[index]
    if (
      expected === undefined ||
      row.created_at !== expected.createdAt ||
      row.hash !== expected.hash
    ) {
      throw new ControlMigrationIncompatibilityError('Control migration history is incompatible')
    }
  }
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

export function migrateControlDbAtPath(path: string, options: ControlMigrationOptions = {}): void {
  mkdirSync(dirname(path), { recursive: true })
  const db = createDb({ path })
  try {
    migrateControlDb(db, options)
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

let defaultControlMigrationManifest: readonly MigrationManifestEntry[] | undefined

function getDefaultControlMigrationManifest(): readonly MigrationManifestEntry[] {
  return (defaultControlMigrationManifest ??= loadControlMigrationManifest(MIGRATIONS_FOLDER))
}

function loadControlMigrationManifest(migrationsFolder: string): readonly MigrationManifestEntry[] {
  return loadCurrentMigrationPlan(migrationsFolder).entries
}
