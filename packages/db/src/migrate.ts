import { fileURLToPath } from 'node:url'
import type Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { closeDb, createDb, prepareControlDatabase, type Db } from './client.ts'
import { bridgeLegacyControlDb, classifyControlLineage } from './legacy-bridge.ts'
import {
  BASE_SKELETON_TABLES,
  ControlMigrationIncompatibilityError,
  loadCurrentMigrationPlan,
  type MigrationManifestEntry,
} from './migration-plan.ts'

export { BASE_SKELETON_TABLES, ControlMigrationIncompatibilityError } from './migration-plan.ts'

const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url))

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
  // SAFETY: better-sqlite3 returns any; single name column selected below.
  const table = db.$client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    .get() as { name: string } | undefined

  if (table === undefined) return

  // SAFETY: better-sqlite3 returns any; hash and created_at columns selected below.
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
  // SAFETY: better-sqlite3 returns any; single name column selected below.
  const rows = db.$client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>

  const tables = new Set(rows.map((row) => row.name))
  const missing = BASE_SKELETON_TABLES.filter((table) => !tables.has(table))

  if (missing.length > 0) {
    throw new Error(`Base control schema is missing tables: ${missing.join(', ')}`)
  }

  const drift = describeControlSchemaDrift(db.$client)

  if (drift.length > 0) {
    throw new ControlMigrationIncompatibilityError(
      `Control database schema is incompatible with this release: ${drift.join('; ')}. ` +
        'A database that a partial drizzle-kit push or an interrupted rebuild left behind ' +
        'diverges like this; recreate it from an empty file with ' +
        '`vp run --filter @cimi/db migrate`',
    )
  }
}

export function migrateControlDbAtPath(path: string, options: ControlMigrationOptions = {}): void {
  prepareControlDatabase({ controlDatabasePath: path })
  const db = createDb({ path })

  try {
    migrateControlDb(db, options)
    validateBaseSchema(db)
  } finally {
    closeDb(db)
  }
}

export { resolveControlDbPath } from './control-db-path.ts'

let referenceColumnOrder: Map<string, string[]> | undefined

/**
 * Compares the live column layout of every user table against the layout the control migrations
 * build, and names each divergence. The migrations are the reference rather than the schema
 * module because they add columns with ALTER TABLE, which appends them at the end, so a table the
 * migrations grew carries an order the module does not restate. A half-pushed database, whose
 * rebuilt tables follow the module order while the rest keep the migration order, matches neither.
 */
function describeControlSchemaDrift(client: Database.Database): string[] {
  const live = readLiveColumnOrder(client)
  const reference = readReferenceColumnOrder()
  const drift: string[] = []

  for (const [table, columns] of reference) {
    const liveColumns = live.get(table)

    if (liveColumns === undefined) {
      drift.push(`table ${table} is missing`)
    } else if (liveColumns.join(', ') !== columns.join(', ')) {
      drift.push(
        `table ${table} holds (${liveColumns.join(', ')}) instead of (${columns.join(', ')})`,
      )
    }
  }

  for (const table of live.keys()) {
    if (!reference.has(table)) {
      drift.push(`table ${table} is not built by the control migrations`)
    }
  }

  return drift
}

function readLiveColumnOrder(client: Database.Database): Map<string, string[]> {
  // SAFETY: better-sqlite3 returns any; single name column selected below.
  const tables = client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as Array<{ name: string }>

  const columns = new Map<string, string[]>()

  for (const { name } of tables) {
    // SAFETY: better-sqlite3 returns any; row shape fixed by the PRAGMA table_info columns.
    const rows = client.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>

    columns.set(
      name,
      rows.map((row) => row.name),
    )
  }

  return columns
}

function readReferenceColumnOrder(): Map<string, string[]> {
  if (referenceColumnOrder !== undefined) return referenceColumnOrder

  const reference = createDb({ path: ':memory:' })

  try {
    migrateControlDb(reference)
    referenceColumnOrder = readLiveColumnOrder(reference.$client)
  } finally {
    closeDb(reference)
  }

  return referenceColumnOrder
}

let defaultControlMigrationManifest: readonly MigrationManifestEntry[] | undefined

function getDefaultControlMigrationManifest(): readonly MigrationManifestEntry[] {
  return (defaultControlMigrationManifest ??= loadControlMigrationManifest(MIGRATIONS_FOLDER))
}

function loadControlMigrationManifest(migrationsFolder: string): readonly MigrationManifestEntry[] {
  return loadCurrentMigrationPlan(migrationsFolder).entries
}
