import Database from 'better-sqlite3'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDbAtPath, validateBaseSchema } from '../../migrate.ts'
import {
  ControlMigrationIncompatibilityError,
  loadCurrentMigrationPlan,
} from '../../migration-plan.ts'
import * as schema from '../../schema/index.ts'

const DRIFTED_TABLE = 'accepted_event'

const CURRENT_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../migrations', import.meta.url))

const SENTINEL_MIGRATION_TAG = '0015_regression_sentinel'

describe('validateBaseSchema', () => {
  let dir: string
  let controlPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cimi-validate-base-schema-'))
    controlPath = join(dir, 'control.sqlite')
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('passes a cleanly migrated control database', () => {
    migrateControlDbAtPath(controlPath)

    const db = createDb({ path: controlPath })

    try {
      expect(() => validateBaseSchema(db)).not.toThrow()
    } finally {
      closeDb(db)
    }
  })

  it('accepts a control database that carries a table the migrations do not build', () => {
    migrateControlDbAtPath(controlPath)

    const raw = new Database(controlPath)
    raw.exec('CREATE TABLE migration_probe (id TEXT PRIMARY KEY NOT NULL)')
    raw.close()

    const db = createDb({ path: controlPath })

    try {
      expect(() => validateBaseSchema(db)).not.toThrow()
    } finally {
      closeDb(db)
    }
  })

  it('rejects a control database half-pushed by a table rebuild', () => {
    migrateControlDbAtPath(controlPath)
    rebuildTableWithDeclaredColumnOrder(controlPath)

    const db = createDb({ path: controlPath })

    try {
      expect(() => validateBaseSchema(db)).toThrow(ControlMigrationIncompatibilityError)
    } finally {
      closeDb(db)
    }
  })

  it('validates a control database against the migrations folder it was built from', () => {
    const folder = createExtendedMigrationsFolder(dir)
    const customPath = join(dir, 'custom.sqlite')

    expect(() => migrateControlDbAtPath(customPath, { migrationsFolder: folder })).not.toThrow()
  })
})

function rebuildTableWithDeclaredColumnOrder(path: string): void {
  const declaredColumns = getTableConfig(schema.TAcceptedEvent).columns.map((column) => column.name)
  const client = new Database(path)

  try {
    // SAFETY: better-sqlite3 returns any; row shape fixed by the PRAGMA table_info columns.
    const liveColumns = client.prepare('PRAGMA table_info(' + DRIFTED_TABLE + ')').all() as Array<{
      name: string
      type: string
      notnull: number
      dflt_value: string | null
    }>

    // SAFETY: better-sqlite3 returns any; name and sql columns selected below.
    const indexes = client
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL",
      )
      .all(DRIFTED_TABLE) as Array<{ name: string; sql: string }>

    client.prepare(createRebuiltTableSql(declaredColumns, liveColumns)).run()
    client
      .prepare(
        'INSERT INTO __new_' +
          DRIFTED_TABLE +
          ' (' +
          declaredColumns.join(', ') +
          ') SELECT ' +
          declaredColumns.join(', ') +
          ' FROM ' +
          DRIFTED_TABLE,
      )
      .run()
    client.prepare('DROP TABLE ' + DRIFTED_TABLE).run()
    client.prepare('ALTER TABLE __new_' + DRIFTED_TABLE + ' RENAME TO ' + DRIFTED_TABLE).run()

    for (const index of indexes) client.prepare(index.sql).run()
  } finally {
    client.close()
  }
}

function createRebuiltTableSql(
  declaredColumns: string[],
  liveColumns: Array<{ name: string; type: string; notnull: number; dflt_value: string | null }>,
): string {
  const definitions = declaredColumns.map((name) => {
    const live = liveColumns.find((column) => column.name === name)

    if (live === undefined) throw new Error('Column ' + name + ' is absent from the live table')

    const definition = ['`' + live.name + '`', live.type === '' ? 'blob' : live.type]

    if (live.notnull === 1) definition.push('NOT NULL')

    if (live.dflt_value !== null) definition.push('DEFAULT ' + live.dflt_value)

    return definition.join(' ')
  })

  return 'CREATE TABLE __new_' + DRIFTED_TABLE + ' (' + definitions.join(', ') + ')'
}

function createExtendedMigrationsFolder(dir: string): string {
  const folder = join(dir, 'extended-migrations')
  mkdirSync(join(folder, 'meta'), { recursive: true })

  for (const name of readdirSync(CURRENT_MIGRATIONS_FOLDER)) {
    if (name.endsWith('.sql'))
      copyFileSync(join(CURRENT_MIGRATIONS_FOLDER, name), join(folder, name))
  }

  const plan = loadCurrentMigrationPlan(CURRENT_MIGRATIONS_FOLDER)
  const entries = plan.entries.map((entry) => ({ tag: entry.tag, when: entry.createdAt }))
  entries.push({ tag: SENTINEL_MIGRATION_TAG, when: 9_999_999_999_999 })

  writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ entries }), 'utf8')
  writeFileSync(
    join(folder, SENTINEL_MIGRATION_TAG + '.sql'),
    'ALTER TABLE installation ADD COLUMN regression_sentinel INTEGER NOT NULL DEFAULT 0',
  )

  return folder
}
