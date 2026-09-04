import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeDb, createDb, type Db } from './client.ts'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))
const MIGRATIONS_JOURNAL_PATH = fileURLToPath(
  new URL('./migrations/meta/_journal.json', import.meta.url),
)
const WORKSPACE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))

export class ControlMigrationIncompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ControlMigrationIncompatibilityError'
  }
}

export const BASE_SKELETON_TABLES = [
  'installation',
  'retention_policy',
  'site_tombstone',
  'backup_restore_reference',
  'event_acceptance_journal',
] as const

export function migrateControlDb(db: Db): void {
  validateControlMigrationHistory(db)
  migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsTable: '__drizzle_migrations',
  })
}

export function validateControlMigrationHistory(db: Db): void {
  const table = db.$client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get() as { name: string } | undefined
  if (table === undefined) return

  const rows = db.$client
    .prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at, id')
    .all() as Array<{ hash: string; created_at: number }>
  if (rows.length > CONTROL_MIGRATION_MANIFEST.length) {
    throw new ControlMigrationIncompatibilityError(
      'Control migration history is newer than this release',
    )
  }

  for (const [index, row] of rows.entries()) {
    const expected = CONTROL_MIGRATION_MANIFEST[index]
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

interface MigrationManifestEntry {
  readonly createdAt: number
  readonly hash: string
}

const CONTROL_MIGRATION_MANIFEST = loadControlMigrationManifest()

function loadControlMigrationManifest(): readonly MigrationManifestEntry[] {
  const parsed: unknown = JSON.parse(readFileSync(MIGRATIONS_JOURNAL_PATH, 'utf8'))
  if (!isRecord(parsed) || !Array.isArray(parsed['entries'])) {
    throw new Error('Control migration journal is invalid')
  }

  return parsed['entries'].map((entry) => {
    if (!isRecord(entry) || typeof entry['tag'] !== 'string' || typeof entry['when'] !== 'number') {
      throw new Error('Control migration journal entry is invalid')
    }
    const sql = readFileSync(join(MIGRATIONS_FOLDER, `${entry['tag']}.sql`))
    return {
      createdAt: entry['when'],
      hash: createHash('sha256').update(sql).digest('hex'),
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  migrateControlDbAtPath(resolveControlDbPath())
}
