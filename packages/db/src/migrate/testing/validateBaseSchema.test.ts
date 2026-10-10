import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, createDb } from '../../client.ts'
import { migrateControlDbAtPath, validateBaseSchema } from '../../migrate.ts'
import { ControlMigrationIncompatibilityError } from '../../migration-plan.ts'
import * as schema from '../../schema/index.ts'

const DRIFTED_TABLE = 'accepted_event'

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
